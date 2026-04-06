import http from "node:http";
import { createFirmwareApiRuntime } from "./firmware-api-adapter.mjs";
import { syncFirmwareMetadata } from "./sync-firmware-metadata.mjs";

const port = Number(process.env.PORT || 4180);
const host = process.env.HOST || "127.0.0.1";
const metadataDir = process.env.FIRMWARE_METADATA_DIR || "artifacts/firmware-metadata";

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

async function createRuntime() {
    if (process.env.FIRMWARE_METADATA_BASE_URL) {
        await syncFirmwareMetadata({
            metadataBaseUrl: process.env.FIRMWARE_METADATA_BASE_URL,
            outputDir: metadataDir,
        });
    }

    return createFirmwareApiRuntime({
        projectRoot: process.cwd(),
        metadataDir,
        manifestPath: process.env.FIRMWARE_MANIFEST_PATH || "resources/firmware-mirror/phase-one-manifest.json",
        assetDirectory: process.env.FIRMWARE_ASSET_DIR || "mock-api/assets/firmware",
        assetUrlPrefix: process.env.FIRMWARE_ASSET_PREFIX || "/firmware-files",
        artifactUrlPrefix: process.env.FIRMWARE_ARTIFACT_BASE_URL || "",
        supportIdPrefix: "LOCAL-SUPPORT",
    });
}

async function main() {
    const runtime = await createRuntime();

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url || "/", `http://${host}:${port}`);

        if (req.method === "GET" && url.pathname === "/healthz") {
            sendResponse(res, {
                statusCode: 200,
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify({
                    status: "ok",
                    metadataSource: runtime.adapter.getSnapshot().hasGeneratedBundle ? "bundle" : "manifest",
                    metadataBaseUrl: process.env.FIRMWARE_METADATA_BASE_URL || null,
                    artifactBaseUrl: runtime.adapter.artifactUrlPrefix || null,
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
        console.log(`Metadata base URL: ${process.env.FIRMWARE_METADATA_BASE_URL || "not configured"}`);
        console.log(`Asset prefix: ${runtime.adapter.assetUrlPrefix}`);
        console.log(`Artifact base URL: ${runtime.adapter.artifactUrlPrefix || "not configured"}`);
    });
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
