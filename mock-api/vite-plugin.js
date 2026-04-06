import { createFirmwareApiRuntime } from "../scripts/firmware-api-adapter.mjs";

function parseRequestUrl(req) {
    return new URL(req.url || "/", "http://localhost");
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

function writeRuntimeResponse(res, response) {
    res.statusCode = response.statusCode;
    Object.entries(response.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.end(response.body);
}

function createMockBuildApiMiddleware() {
    const runtime = createFirmwareApiRuntime({
        projectRoot: process.cwd(),
        assetUrlPrefix: "/mock-api/firmware",
        assetDirectory: "mock-api/assets/firmware",
        supportIdPrefix: "MOCK-SUPPORT",
    });

    return async (req, res, next) => {
        const { pathname, searchParams } = parseRequestUrl(req);
        const assetResponse = runtime.handleAssetRequest(pathname);
        if (assetResponse.matched) {
            writeRuntimeResponse(res, assetResponse);
            return;
        }

        const apiResponse = runtime.handleApiRequest({
            method: req.method,
            pathname,
            searchParams,
            body: req.method === "POST" ? await readBody(req) : "",
        });
        if (apiResponse.matched) {
            writeRuntimeResponse(res, apiResponse);
            return;
        }

        next();
    };
}

export function mockBuildApiPlugin() {
    return {
        name: "mock-build-api",
        configureServer(server) {
            server.middlewares.use(createMockBuildApiMiddleware());
        },
        configurePreviewServer(server) {
            server.middlewares.use(createMockBuildApiMiddleware());
        },
    };
}
