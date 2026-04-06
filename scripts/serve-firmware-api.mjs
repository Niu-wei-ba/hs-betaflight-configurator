import http from "node:http";
import { createFirmwareApiRuntime } from "./firmware-api-adapter.mjs";

const port = Number(process.env.PORT || 4180);
const host = process.env.HOST || "127.0.0.1";

const runtime = createFirmwareApiRuntime({
    projectRoot: process.cwd(),
    metadataDir: process.env.FIRMWARE_METADATA_DIR || "artifacts/firmware-metadata",
    manifestPath: process.env.FIRMWARE_MANIFEST_PATH || "resources/firmware-mirror/phase-one-manifest.json",
    assetDirectory: process.env.FIRMWARE_ASSET_DIR || "mock-api/assets/firmware",
    assetUrlPrefix: process.env.FIRMWARE_ASSET_PREFIX || "/firmware-files",
    supportIdPrefix: "LOCAL-SUPPORT",
});

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

function sendResponse(res, response) {
    res.statusCode = response.statusCode;
    Object.entries(response.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.end(response.body);
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${host}:${port}`);

    if (req.method === "GET" && url.pathname === "/healthz") {
        sendResponse(res, {
            statusCode: 200,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
                status: "ok",
                metadataSource: runtime.adapter.getSnapshot().hasGeneratedBundle ? "bundle" : "manifest",
            }),
        });
        return;
    }

    const assetResponse = runtime.handleAssetRequest(url.pathname);
    if (assetResponse.matched) {
        sendResponse(res, assetResponse);
        return;
    }

    const apiResponse = runtime.handleApiRequest({
        method: req.method,
        pathname: url.pathname,
        searchParams: url.searchParams,
        body: req.method === "POST" ? await readBody(req) : "",
    });
    if (apiResponse.matched) {
        sendResponse(res, apiResponse);
        return;
    }

    sendResponse(res, {
        statusCode: 404,
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "Not found" }),
    });
});

server.listen(port, host, () => {
    const metadataSource = runtime.adapter.getSnapshot().hasGeneratedBundle ? "generated metadata bundle" : "manifest fallback";
    console.log(`Firmware API listening on http://${host}:${port}`);
    console.log(`Using ${metadataSource}`);
    console.log(`Asset prefix: ${runtime.adapter.assetUrlPrefix}`);
});
