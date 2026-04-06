import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_MANIFEST_PATH = "resources/firmware-mirror/phase-one-manifest.json";
const DEFAULT_OUTPUT_DIR = "artifacts/firmware-files";
const DEFAULT_BUILD_API_BASE_URL = "https://build.betaflight.com";
const DEFAULT_OBJECT_PREFIX = "firmware";
const DEFAULT_BUILD_OPTIONS = ["CORE_BUILD"];
const DEFAULT_TIMEOUT_SECONDS = 10 * 60;
const DEFAULT_POLL_SECONDS = 5;

function normalizePathSegment(value) {
    return String(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function cleanBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
}

function resolveUrl(baseUrl, urlOrPath) {
    if (/^https?:\/\//.test(urlOrPath)) {
        return urlOrPath;
    }

    return `${cleanBaseUrl(baseUrl)}/${String(urlOrPath || "").replace(/^\/+/, "")}`;
}

function resolveOutputPath(outputDir, objectKey, objectPrefix = DEFAULT_OBJECT_PREFIX) {
    const cleanKey = String(objectKey || "").replace(/^\/+/, "");
    const cleanPrefix = String(objectPrefix || "").replace(/^\/+|\/+$/g, "");
    const relativeKey =
        cleanPrefix && cleanKey.startsWith(`${cleanPrefix}/`) ? cleanKey.slice(cleanPrefix.length + 1) : cleanKey;
    return path.join(outputDir, relativeKey);
}

function buildSourceUrl({ version, targetEntry }) {
    const source = targetEntry.source || { type: "betaflight-cloud-build" };

    if (source.type === "url") {
        return source.url;
    }

    if (source.type === "github-release-asset") {
        const repo = source.repo || "betaflight/betaflight";
        const tag = source.tag || version.version;
        const assetName = source.assetName || targetEntry.artifact.fileName;
        return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
    }

    return null;
}

function buildRequestPayload({ version, targetEntry }) {
    return {
        target: targetEntry.target,
        release: version.version,
        options: DEFAULT_BUILD_OPTIONS,
    };
}

async function ensureDir(directory) {
    await fs.mkdir(directory, { recursive: true });
}

async function readJson(filePath) {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeFile(filePath, payload) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, payload);
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "X-CFG-VER": "firmware-mirror",
            ...(options.headers || {}),
        },
    });

    if (!response.ok) {
        throw new Error(`Request failed: ${url} ${response.status} ${response.statusText} ${await response.text()}`);
    }

    return response.json();
}

async function downloadFile(url, outputPath, log) {
    const response = await fetch(url, {
        headers: {
            "X-CFG-VER": "firmware-mirror",
        },
    });

    if (!response.ok) {
        throw new Error(`Download failed: ${url} ${response.status} ${response.statusText}`);
    }

    const body = Buffer.from(await response.arrayBuffer());
    await writeFile(outputPath, body);
    log(`Downloaded ${url} -> ${outputPath} (${body.length} bytes)`);
}

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function buildWithBetaflightCloud({
    version,
    targetEntry,
    outputPath,
    buildApiBaseUrl,
    pollSeconds,
    timeoutSeconds,
    log,
}) {
    const requestPayload = buildRequestPayload({ version, targetEntry });
    const buildApi = cleanBaseUrl(buildApiBaseUrl);
    log(`Requesting Betaflight Cloud Build: ${JSON.stringify(requestPayload)}`);

    const build = await fetchJson(`${buildApi}/api/builds`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
    });

    if (!build?.key || !build?.url) {
        throw new Error(
            `Unexpected build response for ${requestPayload.release}/${requestPayload.target}: ${JSON.stringify(build)}`,
        );
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutSeconds * 1000) {
        const status = await fetchJson(`${buildApi}/api/builds/${build.key}/status`);
        log(`Build ${build.key} status: ${status.status}`);

        if (status.status === "success") {
            await downloadFile(resolveUrl(buildApi, build.url), outputPath, log);
            return {
                key: build.key,
                file: build.file,
                status,
            };
        }

        if (status.status === "failed") {
            throw new Error(
                `Betaflight Cloud Build failed for ${requestPayload.release}/${requestPayload.target}: ${JSON.stringify(status)}`,
            );
        }

        await sleep(pollSeconds * 1000);
    }

    throw new Error(`Timed out waiting for Betaflight Cloud Build ${build.key}`);
}

export function createFirmwareArtifactPlan(manifest, options = {}) {
    const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
    const objectPrefix = options.objectPrefix || DEFAULT_OBJECT_PREFIX;

    return manifest.versions.flatMap((version) =>
        version.targets.map((targetEntry) => ({
            version: version.version,
            target: targetEntry.target,
            sourceType: targetEntry.source?.type || "betaflight-cloud-build",
            sourceUrl: buildSourceUrl({ version, targetEntry }),
            buildRequest: buildRequestPayload({ version, targetEntry }),
            objectKey: targetEntry.artifact.objectKey,
            outputPath: resolveOutputPath(outputDir, targetEntry.artifact.objectKey, objectPrefix),
        })),
    );
}

export async function mirrorFirmwareArtifacts(options = {}) {
    const manifestPath = options.manifestPath || DEFAULT_MANIFEST_PATH;
    const outputDir = options.outputDir || DEFAULT_OUTPUT_DIR;
    const objectPrefix = options.objectPrefix || DEFAULT_OBJECT_PREFIX;
    const buildApiBaseUrl = options.buildApiBaseUrl || DEFAULT_BUILD_API_BASE_URL;
    const pollSeconds = Number(options.pollSeconds || DEFAULT_POLL_SECONDS);
    const timeoutSeconds = Number(options.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS);
    const dryRun = Boolean(options.dryRun);
    const log = options.log || console.log;
    const manifest = options.manifest || (await readJson(manifestPath));
    const plan = createFirmwareArtifactPlan(manifest, { outputDir, objectPrefix });

    if (dryRun) {
        log(JSON.stringify(plan, null, 2));
        return { plan, mirrored: [] };
    }

    const mirrored = [];

    for (const version of manifest.versions) {
        for (const targetEntry of version.targets) {
            const outputPath = resolveOutputPath(outputDir, targetEntry.artifact.objectKey, objectPrefix);
            const sourceType = targetEntry.source?.type || "betaflight-cloud-build";
            log(`Mirroring ${version.version}/${targetEntry.target} via ${sourceType}`);

            if (sourceType === "url" || sourceType === "github-release-asset") {
                await downloadFile(buildSourceUrl({ version, targetEntry }), outputPath, log);
                mirrored.push({ version: version.version, target: targetEntry.target, outputPath });
                continue;
            }

            if (sourceType === "betaflight-cloud-build") {
                const result = await buildWithBetaflightCloud({
                    version,
                    targetEntry,
                    outputPath,
                    buildApiBaseUrl,
                    pollSeconds,
                    timeoutSeconds,
                    log,
                });
                mirrored.push({
                    version: version.version,
                    target: targetEntry.target,
                    outputPath,
                    buildKey: result.key,
                });
                continue;
            }

            throw new Error(`Unsupported firmware source type: ${sourceType}`);
        }
    }

    log(`Mirrored ${mirrored.length} firmware artifacts into ${path.resolve(outputDir)}`);
    return { plan, mirrored };
}

async function main() {
    const manifestPath = process.argv[2] || DEFAULT_MANIFEST_PATH;
    const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;
    const dryRun = process.argv.includes("--dry-run") || process.env.FIRMWARE_MIRROR_DRY_RUN === "true";

    await mirrorFirmwareArtifacts({
        manifestPath,
        outputDir,
        dryRun,
        objectPrefix: process.env.FIRMWARE_ARTIFACT_COS_PREFIX || DEFAULT_OBJECT_PREFIX,
        buildApiBaseUrl: process.env.BETAFLIGHT_BUILD_API_BASE_URL || DEFAULT_BUILD_API_BASE_URL,
        pollSeconds: process.env.FIRMWARE_BUILD_POLL_SECONDS || DEFAULT_POLL_SECONDS,
        timeoutSeconds: process.env.FIRMWARE_BUILD_TIMEOUT_SECONDS || DEFAULT_TIMEOUT_SECONDS,
    });
}

const directRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (directRun) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

export { normalizePathSegment };
