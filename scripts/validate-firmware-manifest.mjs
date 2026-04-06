import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_MANIFEST_PATH = "resources/firmware-mirror/phase-one-manifest.json";
const DEFAULT_CONFIG_REPO_RAW_BASE_URL = "https://raw.githubusercontent.com/betaflight/config/master/configs";
const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_FETCH_RETRIES = 3;

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function readJson(filePath) {
    return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
}

function extractDefine(configText, defineName) {
    const match = configText.match(new RegExp(`^#define\\s+${defineName}\\s+(\\S+)`, "m"));
    return match?.[1] || null;
}

async function fetchWithRetry(url, options = {}) {
    const retries = Number(options.retries || DEFAULT_FETCH_RETRIES);
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            return await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(Number(options.timeoutMs || DEFAULT_FETCH_TIMEOUT_MS)),
            });
        } catch (error) {
            lastError = error;
            if (attempt === retries) {
                break;
            }
        }
    }

    throw lastError;
}

async function fetchTargetConfig(target, configRepoRawBaseUrl) {
    const url = `${String(configRepoRawBaseUrl).replace(/\/+$/, "")}/${encodeURIComponent(target)}/config.h`;
    const response = await fetchWithRetry(url, {
        headers: {
            "User-Agent": "hs-fpv-firmware-manifest-validator",
        },
    });

    if (!response.ok) {
        throw new Error(
            `Target ${target} not found in Betaflight config catalog: ${url} ${response.status} ${response.statusText}`,
        );
    }

    const configText = await response.text();
    return {
        target,
        mcu: extractDefine(configText, "FC_TARGET_MCU"),
        manufacturer: extractDefine(configText, "MANUFACTURER_ID"),
    };
}

function collectManifestTargets(manifest) {
    return manifest.versions.flatMap((versionEntry) =>
        versionEntry.targets.map((targetEntry) => ({
            version: versionEntry.version,
            channel: versionEntry.channel,
            ...targetEntry,
        })),
    );
}

function validateNoTargetAliases(targetEntry) {
    assert(!("buildTarget" in targetEntry), `${targetEntry.target} must not use buildTarget aliasing.`);
    assert(!("buildOptions" in targetEntry), `${targetEntry.target} must not use buildOptions aliasing.`);
    assert(
        !("buildTarget" in (targetEntry.source || {})),
        `${targetEntry.target} source must not use buildTarget aliasing.`,
    );
    assert(
        !("options" in (targetEntry.source || {})),
        `${targetEntry.target} source must not override Cloud Build options.`,
    );
    assert(!("release" in (targetEntry.source || {})), `${targetEntry.target} source must not override release.`);
    assert(!("commit" in (targetEntry.source || {})), `${targetEntry.target} source must not override commit.`);
}

function validateSourceShape(targetEntry) {
    const source = targetEntry.source || { type: "betaflight-cloud-build" };
    assert(
        ["betaflight-cloud-build", "github-release-asset", "url"].includes(source.type),
        `${targetEntry.target} has unsupported source.type: ${source.type}`,
    );

    if (source.type === "url") {
        assert(
            typeof source.url === "string" && source.url.startsWith("http"),
            `${targetEntry.target} source.url must be an absolute URL.`,
        );
    }
}

export async function validateFirmwareManifest(options = {}) {
    const manifest = options.manifest || (await readJson(options.manifestPath || DEFAULT_MANIFEST_PATH));
    const configRepoRawBaseUrl = options.configRepoRawBaseUrl || DEFAULT_CONFIG_REPO_RAW_BASE_URL;
    const log = options.log || console.log;
    const targets = collectManifestTargets(manifest);
    const targetCatalog = new Map();

    for (const targetEntry of targets) {
        validateNoTargetAliases(targetEntry);
        validateSourceShape(targetEntry);

        if (!targetCatalog.has(targetEntry.target)) {
            targetCatalog.set(targetEntry.target, await fetchTargetConfig(targetEntry.target, configRepoRawBaseUrl));
        }

        const officialTarget = targetCatalog.get(targetEntry.target);
        assert(officialTarget.mcu, `${targetEntry.target} config.h does not define FC_TARGET_MCU.`);
        assert(officialTarget.manufacturer, `${targetEntry.target} config.h does not define MANUFACTURER_ID.`);
        assert(
            targetEntry.mcu === officialTarget.mcu,
            `${targetEntry.target} mcu mismatch: manifest=${targetEntry.mcu} official=${officialTarget.mcu}`,
        );
        assert(
            targetEntry.manufacturer === officialTarget.manufacturer,
            `${targetEntry.target} manufacturer mismatch: manifest=${targetEntry.manufacturer} official=${officialTarget.manufacturer}`,
        );
        assert(
            targetEntry.artifact.objectKey.includes(`/${targetEntry.target}/`),
            `${targetEntry.target} artifact.objectKey must include the official target segment.`,
        );
    }

    log(`Validated ${targets.length} firmware manifest target entries against Betaflight config.`);
    return {
        targets: targets.length,
        uniqueTargets: targetCatalog.size,
    };
}

async function main() {
    await validateFirmwareManifest({
        manifestPath: process.argv[2] || DEFAULT_MANIFEST_PATH,
        configRepoRawBaseUrl: process.env.BETAFLIGHT_CONFIG_RAW_BASE_URL || DEFAULT_CONFIG_REPO_RAW_BASE_URL,
    });
}

const directRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (directRun) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
