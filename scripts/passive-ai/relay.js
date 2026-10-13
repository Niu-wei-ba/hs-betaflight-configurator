// SPDX-License-Identifier: GPL-3.0-or-later
// Same-origin relay: never stores credentials, follows redirects, or accepts arbitrary upstream hosts.
export function createAiRelay({ allowedOrigin = null, localOnly = true, fetchFn = fetch } = {}) {
    return async (req, res, next = () => {}) => {
        const route = req.url?.split("?")[0];
        if (!route?.startsWith("/__passive-ai/")) return next();
        const finish = (status, value) => {
            res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify(value));
        };
        const origin = req.headers.origin;
        const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
        const expectedOrigin = allowedOrigin || `${req.socket.encrypted ? "https" : "http"}://${req.headers.host}`;
        if ((localOnly && !loopback) || (origin && origin !== expectedOrigin))
            return finish(403, { error: "relay_origin_denied" });
        const endpoint = route.slice("/__passive-ai/".length);
        if (
            !(endpoint === "models" && req.method === "GET") &&
            !(endpoint === "chat/completions" && req.method === "POST")
        )
            return finish(404, { error: "relay_route_denied" });
        let base;
        try {
            base = new URL(req.headers["x-ai-base-url"]);
        } catch {
            return finish(400, { error: "relay_invalid_base" });
        }
        if (
            base.origin !== "https://8stoken.com" ||
            base.username ||
            base.password ||
            base.search ||
            base.hash ||
            base.pathname.replace(/\/+$/, "") !== "/v1"
        )
            return finish(400, { error: "relay_base_denied" });
        const auth = req.headers.authorization;
        if (typeof auth !== "string" || !auth.startsWith("Bearer ") || auth.length > 2048)
            return finish(401, { error: "relay_key_required" });
        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), endpoint === "models" ? 19000 : 85000);
        const close = () => {
            if (!res.writableEnded) abort.abort();
        };
        res.on("close", close);
        try {
            let payload;
            if (req.method === "POST") {
                const parts = [];
                let bytes = 0;
                for await (const chunk of req) {
                    bytes += chunk.length;
                    if (bytes > 128 * 1024) return finish(413, { error: "relay_request_limit" });
                    parts.push(chunk);
                }
                try {
                    payload = JSON.parse(Buffer.concat(parts).toString("utf8"));
                } catch {
                    return finish(400, { error: "relay_invalid_json" });
                }
                if (
                    !payload ||
                    typeof payload.model !== "string" ||
                    !Array.isArray(payload.messages) ||
                    payload.stream !== false
                )
                    return finish(400, { error: "relay_invalid_request" });
            }
            const upstream = await fetchFn(`${base.origin}/v1/${endpoint}`, {
                method: req.method,
                redirect: "manual",
                signal: abort.signal,
                headers: { Authorization: auth, ...(payload ? { "Content-Type": "application/json" } : {}) },
                ...(payload ? { body: JSON.stringify(payload) } : {}),
            });
            if (!upstream.ok) {
                await upstream.body?.cancel();
                return finish([401, 403, 429].includes(upstream.status) ? upstream.status : 502, {
                    error: "relay_upstream_failed",
                    upstreamStatus: upstream.status,
                });
            }
            const reader = upstream.body.getReader();
            const chunks = [];
            let bytes = 0;
            while (true) {
                const part = await reader.read();
                if (part.done) break;
                bytes += part.value.length;
                if (bytes > 512 * 1024) {
                    await reader.cancel();
                    return finish(502, { error: "relay_response_limit" });
                }
                chunks.push(Buffer.from(part.value));
            }
            const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            finish(200, data);
        } catch {
            if (!res.destroyed && !res.writableEnded)
                finish(abort.signal.aborted ? 504 : 502, {
                    error: abort.signal.aborted ? "relay_timeout" : "relay_network_failed",
                });
        } finally {
            clearTimeout(timer);
            res.off("close", close);
        }
    };
}

export function passiveAiRelayPlugin() {
    return {
        name: "passive-ai-relay",
        configureServer(server) {
            server.middlewares.use(createAiRelay());
        },
        configurePreviewServer(server) {
            server.middlewares.use(createAiRelay());
        },
    };
}
