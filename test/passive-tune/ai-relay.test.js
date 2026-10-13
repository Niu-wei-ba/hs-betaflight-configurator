// @vitest-environment node
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiRelay } from "../../scripts/passive-ai/relay.js";
let server, url, upstream;
const headers = { Authorization: "Bearer test-key", "X-AI-Base-URL": "https://8stoken.com/v1" };
beforeEach(async () => {
    upstream = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "model" }] })));
    const relay = createAiRelay({ fetchFn: upstream });
    server = createServer((req, res) =>
        relay(req, res, () => {
            res.writeHead(404);
            res.end();
        }),
    );
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(
    () =>
        new Promise((resolve) => {
            server.closeAllConnections();
            server.close(resolve);
        }),
);
describe("bounded same-origin relay", () => {
    it("forwards authorized model requests without cookies or redirects", async () => {
        const result = await fetch(`${url}/__passive-ai/models`, {
            headers: { ...headers, Origin: url, Cookie: "private=cookie" },
        });
        expect(result.status).toBe(200);
        expect(result.headers.get("cache-control")).toBe("no-store");
        expect(await result.json()).toEqual({ data: [{ id: "model" }] });
        expect(upstream.mock.calls[0][0]).toBe("https://8stoken.com/v1/models");
        expect(upstream.mock.calls[0][1]).toMatchObject({
            redirect: "manual",
            headers: { Authorization: "Bearer test-key" },
        });
        expect(upstream.mock.calls[0][1].headers.Cookie).toBeUndefined();
    });
    it("rejects cross-origin access, arbitrary hosts and endpoints before sending keys", async () => {
        for (const [path, extra, code] of [
            ["models", { Origin: "https://attacker.example" }, 403],
            ["models", { "X-AI-Base-URL": "http://127.0.0.1:22/v1" }, 400],
            ["models", { "X-AI-Base-URL": "https://8stoken.com/admin" }, 400],
            ["other", {}, 404],
        ]) {
            expect((await fetch(`${url}/__passive-ai/${path}`, { headers: { ...headers, ...extra } })).status).toBe(
                code,
            );
        }
        expect(upstream).not.toHaveBeenCalled();
    });
    it("rejects malformed or oversized chat input", async () => {
        expect(
            (await fetch(`${url}/__passive-ai/chat/completions`, { method: "POST", headers, body: "invalid" })).status,
        ).toBe(400);
        expect(
            (
                await fetch(`${url}/__passive-ai/chat/completions`, {
                    method: "POST",
                    headers,
                    body: "x".repeat(129 * 1024),
                })
            ).status,
        ).toBe(413);
        expect(upstream).not.toHaveBeenCalled();
    });
    it("reports bounded upstream status and distinguishes transport failures without echoing errors", async () => {
        upstream.mockResolvedValueOnce(new Response("private-key-in-error", { status: 503 }));
        const unavailable = await fetch(`${url}/__passive-ai/models`, { headers });
        expect(await unavailable.json()).toEqual({ error: "relay_upstream_failed", upstreamStatus: 503 });
        upstream.mockRejectedValueOnce(new Error("private-key-in-error"));
        const network = await fetch(`${url}/__passive-ai/models`, { headers });
        expect(await network.json()).toEqual({ error: "relay_network_failed" });
    });
    it("does not follow upstream redirects or echo potentially sensitive failures", async () => {
        upstream.mockResolvedValue(
            new Response("secret upstream error", { status: 302, headers: { Location: "https://attacker.example" } }),
        );
        const result = await fetch(`${url}/__passive-ai/models`, { headers });
        expect(result.status).toBe(502);
        expect(await result.text()).not.toContain("secret");
        expect(upstream).toHaveBeenCalledOnce();
    });
});
