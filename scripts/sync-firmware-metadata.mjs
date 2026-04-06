import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "artifacts/firmware-metadata";

function normalizePathSegment(value) {
    return String(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function joinRemotePath(baseUrl, relativePath) {
    const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");
    const normalizedPath = String(relativePath || "").replace(/^\/+/, "");
    return `${normalizedBase}/${normalizedPath}`;
}

async function ensureDir(directory) {
    await fs.mkdir(directory, { recursive: true });
}

async function writeJson(filePath, payload) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function fetchJson(baseUrl, relativePath) {
    const url = joinRemotePath(baseUrl, relativePath);
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

export async function syncFirmwareMetadata({ metadataBaseUrl, outputDir = DEFAULT_OUTPUT_DIR, log = console.log }) {
    if (!metadataBaseUrl) {
        throw new Error("metadataBaseUrl is required.");
    }

    const resolvedOutputDir = path.resolve(outputDir);
    const [manifest, versions, targets, hot] = await Promise.all([
        fetchJson(metadataBaseUrl, "manifest.json"),
        fetchJson(metadataBaseUrl, "index/versions.json"),
        fetchJson(metadataBaseUrl, "index/targets.json"),
        fetchJson(metadataBaseUrl, "index/hot.json"),
    ]);

    await Promise.all([
        writeJson(path.join(resolvedOutputDir, "manifest.json"), manifest),
        writeJson(path.join(resolvedOutputDir, "index", "versions.json"), versions),
        writeJson(path.join(resolvedOutputDir, "index", "targets.json"), targets),
        writeJson(path.join(resolvedOutputDir, "index", "hot.json"), hot),
    ]);

    const targetDetails = await Promise.all(
        targets.map(async ({ target }) => {
            const detail = await fetchJson(metadataBaseUrl, `targets/${normalizePathSegment(target)}.json`);
            await writeJson(path.join(resolvedOutputDir, "targets", `${normalizePathSegment(target)}.json`), detail);
            return detail;
        }),
    );

    const buildRefs = targetDetails.flatMap((detail) =>
        detail.releases.map(({ release }) => ({
            release,
            target: detail.target,
        })),
    );

    await Promise.all(
        buildRefs.map(async ({ release, target }) => {
            const build = await fetchJson(
                metadataBaseUrl,
                `builds/${normalizePathSegment(release)}/${normalizePathSegment(target)}.json`,
            );
            await writeJson(
                path.join(resolvedOutputDir, "builds", normalizePathSegment(release), `${normalizePathSegment(target)}.json`),
                build,
            );
        }),
    );

    log(`Synced firmware metadata from ${metadataBaseUrl} into ${resolvedOutputDir}`);
    log(`Versions: ${versions.length}`);
    log(`Targets: ${targets.length}`);
    log(`Builds: ${buildRefs.length}`);

    return {
        outputDir: resolvedOutputDir,
        versions: versions.length,
        targets: targets.length,
        builds: buildRefs.length,
    };
}

async function main() {
    const metadataBaseUrl = process.argv[2] || process.env.FIRMWARE_METADATA_BASE_URL;
    const outputDir = process.argv[3] || process.env.FIRMWARE_METADATA_DIR || DEFAULT_OUTPUT_DIR;
    await syncFirmwareMetadata({ metadataBaseUrl, outputDir });
}

const directRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (directRun) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
