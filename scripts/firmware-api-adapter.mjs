import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFirmwareMetadata } from "./generate-firmware-metadata.mjs";

const defaultSupportCommands = ["version", "status", "diff all", "tasks"];

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileExists(filePath) {
    return fs.existsSync(filePath);
}

function listJsonFiles(directory) {
    if (!fileExists(directory)) {
        return [];
    }

    return fs.readdirSync(directory).filter((entry) => entry.endsWith(".json"));
}

function buildKey(release, target) {
    const seed = `${target}-${release}`.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    return `bf${seed}`.padEnd(32, "0").slice(0, 32);
}

function buildUrlFromPrefix(prefix, suffix) {
    const normalizedPrefix = String(prefix || "").replace(/\/+$/, "");
    const normalizedSuffix = String(suffix || "").replace(/^\/+/, "");
    return normalizedPrefix ? `${normalizedPrefix}/${normalizedSuffix}` : `/${normalizedSuffix}`;
}

function buildAssetUrl(assetUrlPrefix, objectKey) {
    const relativeObjectKey = String(objectKey || "").replace(/^\/?firmware\//, "");
    return buildUrlFromPrefix(assetUrlPrefix || "/firmware-files", relativeObjectKey);
}

function buildArtifactUrl(detail, { artifactUrlPrefix, assetUrlPrefix }) {
    return artifactUrlPrefix
        ? buildUrlFromPrefix(artifactUrlPrefix, detail.artifact.objectKey)
        : buildAssetUrl(assetUrlPrefix, detail.artifact.objectKey);
}

function createManifestBackedStore(manifestPath) {
    const manifest = readJson(manifestPath);
    const metadata = buildFirmwareMetadata(manifest);

    return {
        hasGeneratedBundle: false,
        manifest,
        getTargets() {
            return metadata.index.targets.map(({ target, group }) => ({ target, group }));
        },
        getFirmwareVersions() {
            return metadata.index.versions.map(({ version, channel }) => ({ version, channel }));
        },
        getTargetReleases(target) {
            return metadata.targetDetails[target] || null;
        },
        getBuildDetail(release, target) {
            return metadata.buildDetails[`${release}:${target}`] || null;
        },
        getFirmwareTargets(version) {
            return Object.values(metadata.buildDetails)
                .filter((entry) => entry.release === version)
                .map((entry) => ({
                    target: entry.target,
                    cached: entry.cloudBuild === false,
                    channel: entry.channel,
                }))
                .sort((a, b) => a.target.localeCompare(b.target));
        },
    };
}

function createBundleBackedStore(metadataDir) {
    const indexDir = path.join(metadataDir, "index");
    const targetsDir = path.join(metadataDir, "targets");
    const buildsDir = path.join(metadataDir, "builds");
    const manifestPath = path.join(metadataDir, "manifest.json");

    const versions = readJson(path.join(indexDir, "versions.json"));
    const targets = readJson(path.join(indexDir, "targets.json"));
    const manifest = readJson(manifestPath);

    return {
        hasGeneratedBundle: true,
        manifest,
        getTargets() {
            return targets.map(({ target, group }) => ({ target, group }));
        },
        getFirmwareVersions() {
            return versions.map(({ version, channel }) => ({ version, channel }));
        },
        getTargetReleases(target) {
            const filePath = path.join(targetsDir, `${target}.json`);
            return fileExists(filePath) ? readJson(filePath) : null;
        },
        getBuildDetail(release, target) {
            const filePath = path.join(buildsDir, release, `${target}.json`);
            return fileExists(filePath) ? readJson(filePath) : null;
        },
        getFirmwareTargets(version) {
            const versionDir = path.join(buildsDir, version);

            return listJsonFiles(versionDir)
                .map((entry) => readJson(path.join(versionDir, entry)))
                .map((detail) => ({
                    target: detail.target,
                    cached: detail.cloudBuild === false,
                    channel: detail.channel,
                }))
                .sort((a, b) => a.target.localeCompare(b.target));
        },
    };
}

export function createFirmwareApiAdapter(options = {}) {
    const projectRootInput = options.projectRoot || process.cwd();
    const projectRoot =
        projectRootInput instanceof URL ? fileURLToPath(projectRootInput) : path.resolve(String(projectRootInput));
    const metadataDir = path.resolve(projectRoot, options.metadataDir || "artifacts/firmware-metadata");
    const manifestPath = path.resolve(
        projectRoot,
        options.manifestPath || "resources/firmware-mirror/phase-one-manifest.json",
    );
    const assetDirectory = path.resolve(projectRoot, options.assetDirectory || "artifacts/firmware-files");
    const assetUrlPrefix = options.assetUrlPrefix || "/firmware-files";
    const artifactUrlPrefix = options.artifactUrlPrefix || "";
    const supportCommands = options.supportCommands || defaultSupportCommands;
    const commitHistoryByRelease = options.commitHistoryByRelease || {
        "2026.1.0-alpha.1": [
            { sha: "a1b2c3d4", message: "mirror: add firmware metadata" },
            { sha: "d4c3b2a1", message: "mirror: tighten target cache strategy" },
        ],
    };
    const defaultOptions = options.defaultOptions || {
        radioProtocols: [
            { name: "CRSF", value: "USE_SERIALRX_CRSF", default: true },
            { name: "SBUS", value: "USE_SERIALRX_SBUS", default: false },
        ],
        telemetryProtocols: [
            { name: "SmartPort", value: "USE_TELEMETRY_SMARTPORT", default: false },
            { name: "CRSF Telemetry", value: "USE_TELEMETRY_CRSF", default: true },
        ],
        generalOptions: [
            { name: "Blackbox", value: "USE_BLACKBOX", default: true },
            { name: "Airmode", value: "USE_AIRMODE", default: true },
            {
                name: "OSD MSP DisplayPort",
                group: "OSD",
                groupedName: "MSP DisplayPort",
                value: "USE_OSD_MSP_DISPLAYPORT",
                default: true,
            },
            {
                name: "OSD DJI",
                group: "OSD",
                groupedName: "DJI",
                value: "USE_OSD_DJI_HD",
                default: false,
            },
        ],
        motorProtocols: [
            { name: "DShot300", value: "USE_DSHOT300", default: true },
            { name: "DShot600", value: "USE_DSHOT600", default: false },
        ],
    };

    function createStore() {
        const hasBundle =
            fileExists(path.join(metadataDir, "manifest.json")) &&
            fileExists(path.join(metadataDir, "index", "versions.json")) &&
            fileExists(path.join(metadataDir, "index", "targets.json"));

        return hasBundle ? createBundleBackedStore(metadataDir) : createManifestBackedStore(manifestPath);
    }

    function withStore(callback) {
        const store = createStore();
        return callback(store);
    }

    function getBuildJson(release, target, requestOptions = []) {
        return {
            Request: {
                Options: requestOptions.length > 0 ? requestOptions : ["USE_SERIALRX_CRSF", "USE_OSD_MSP_DISPLAYPORT"],
            },
            Target: target,
            Release: release,
        };
    }

    function getBuildResponse(release, target) {
        const detail = withStore((store) => store.getBuildDetail(release, target));
        if (!detail) {
            return null;
        }

        return {
            key: buildKey(release, target),
            file: detail.artifact.fileName,
            url: buildArtifactUrl(detail, { artifactUrlPrefix, assetUrlPrefix }),
        };
    }

    return {
        assetDirectory,
        assetUrlPrefix,
        artifactUrlPrefix,
        buildKey,
        defaultOptions,
        supportCommands,
        commitHistoryByRelease,
        getSnapshot() {
            return withStore((store) => ({
                hasGeneratedBundle: store.hasGeneratedBundle,
                manifest: store.manifest,
                targetDescriptors: store.getTargets(),
                firmwareVersions: store.getFirmwareVersions(),
            }));
        },
        getTargetDescriptors() {
            return withStore((store) => store.getTargets());
        },
        getTargetReleases(target) {
            return withStore((store) => store.getTargetReleases(target));
        },
        getBuildDetail(release, target) {
            return withStore((store) => store.getBuildDetail(release, target));
        },
        getFirmwareVersions() {
            return withStore((store) => store.getFirmwareVersions());
        },
        getFirmwareTargets(version) {
            return withStore((store) => store.getFirmwareTargets(version));
        },
        getFirmwareArtifact(release, target) {
            const detail = this.getBuildDetail(release, target);
            if (!detail) {
                return null;
            }

            return {
                file: detail.artifact.fileName,
                url: buildArtifactUrl(detail, { artifactUrlPrefix, assetUrlPrefix }),
                objectKey: detail.artifact.objectKey,
            };
        },
        getBuildResponse,
        getBuildStatus(release, target) {
            const detail = this.getBuildDetail(release, target);
            const manifest = withStore((store) => store.manifest);

            return {
                status: "success",
                configuration: detail?.configuration || manifest.defaults.configuration,
            };
        },
        getBuildJson,
        getConfiguratorRelease(type) {
            const match =
                this.getFirmwareVersions().find((entry) => entry.channel === type) || this.getFirmwareVersions()[0];

            return {
                type,
                version: match?.version || "2025.12.2",
                url: `https://github.com/Niu-wei-ba/hs-betaflight-configurator/releases/tag/${match?.version || "2025.12.2"}`,
            };
        },
        resolveAssetFile(fileName) {
            const absolutePath = path.join(assetDirectory, String(fileName || "").replace(/^\/?firmware\//, ""));
            return fileExists(absolutePath) ? absolutePath : null;
        },
    };
}

export function createFirmwareApiRuntime(options = {}) {
    const adapter = options.adapter || createFirmwareApiAdapter(options);
    const buildRequests = new Map();
    let supportCounter = 1;
    const supportIdPrefix = options.supportIdPrefix || "LOCAL-SUPPORT";
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,User-Agent,X-CFG-VER",
    };

    function jsonResponse(statusCode, body) {
        return {
            matched: true,
            statusCode,
            headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify(body),
        };
    }

    function textResponse(statusCode, body) {
        return {
            matched: true,
            statusCode,
            headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
            body,
        };
    }

    function handleAssetRequest(pathname) {
        const normalizedPrefix = String(adapter.assetUrlPrefix).replace(/\/+$/, "");
        if (!pathname.startsWith(`${normalizedPrefix}/`)) {
            return { matched: false };
        }

        const fileName = pathname.slice(normalizedPrefix.length + 1);
        const filePath = adapter.resolveAssetFile(fileName);

        if (!filePath) {
            return { matched: false };
        }

        return {
            matched: true,
            statusCode: 200,
            headers: {
                ...corsHeaders,
                "Content-Type":
                    path.extname(filePath).toLowerCase() === ".hex"
                        ? "text/plain; charset=utf-8"
                        : "application/octet-stream",
            },
            body: fs.readFileSync(filePath),
        };
    }

    function handleApiRequest({ method, pathname, searchParams, body }) {
        if (!pathname.startsWith("/api/")) {
            return { matched: false };
        }

        if (method === "OPTIONS") {
            return {
                matched: true,
                statusCode: 204,
                headers: corsHeaders,
                body: "",
            };
        }

        if (method === "GET" && pathname === "/api/targets") {
            return jsonResponse(200, adapter.getTargetDescriptors());
        }

        if (method === "GET" && pathname.startsWith("/api/targets/")) {
            const target = decodeURIComponent(pathname.replace("/api/targets/", ""));
            const payload = adapter.getTargetReleases(target);
            return jsonResponse(payload ? 200 : 404, payload || { error: "Target not found" });
        }

        if (method === "GET" && pathname.startsWith("/api/builds/") && pathname.endsWith("/status")) {
            const key = pathname.split("/")[3];
            const build = buildRequests.get(key);
            return jsonResponse(build ? 200 : 404, build ? build.status : { error: "Build not found" });
        }

        if (method === "GET" && pathname.startsWith("/api/builds/") && pathname.endsWith("/log")) {
            const key = pathname.split("/")[3];
            const build = buildRequests.get(key);
            return textResponse(
                build ? 200 : 404,
                build
                    ? [
                          `buildKey=${key}`,
                          `release=${build.request.release}`,
                          `target=${build.request.target}`,
                          `status=${build.status.status}`,
                          `options=${(build.request.options || []).join(",")}`,
                      ].join("\n")
                    : "Build not found",
            );
        }

        if (method === "GET" && pathname.startsWith("/api/builds/") && pathname.endsWith("/json")) {
            const key = pathname.split("/")[3];
            const build = buildRequests.get(key);
            return jsonResponse(build ? 200 : 404, build ? build.json : { error: "Build not found" });
        }

        if (method === "GET" && /^\/api\/builds\/[^/]+$/.test(pathname)) {
            const key = pathname.split("/")[3];
            const build = buildRequests.get(key);

            return jsonResponse(
                build ? 200 : 404,
                build
                    ? {
                          key,
                          release: build.request.release,
                          target: build.request.target,
                          status: build.status.status,
                          jsonUrl: `/api/builds/${key}/json`,
                          logUrl: `/api/builds/${key}/log`,
                      }
                    : { error: "Build not found" },
            );
        }

        if (method === "GET" && /^\/api\/builds\/[^/]+\/[^/]+$/.test(pathname)) {
            const [, , , release, target] = pathname.split("/");
            const payload = adapter.getBuildDetail(decodeURIComponent(release), decodeURIComponent(target));
            return jsonResponse(payload ? 200 : 404, payload || { error: "Build target detail not found" });
        }

        if (method === "POST" && pathname === "/api/builds") {
            const payload = body ? JSON.parse(body) : {};
            const { release, target, options: requestOptions = [] } = payload;
            const response = adapter.getBuildResponse(release, target);

            if (!response) {
                return jsonResponse(404, { error: "Artifact not found" });
            }

            buildRequests.set(response.key, {
                status: adapter.getBuildStatus(release, target),
                json: adapter.getBuildJson(release, target, requestOptions),
                request: payload,
            });

            return jsonResponse(202, response);
        }

        if (method === "GET" && pathname.startsWith("/api/options/")) {
            const [, , , release, key] = pathname.split("/");
            if (!release) {
                return jsonResponse(404, { error: "Release not found" });
            }

            const build = key ? buildRequests.get(key) : null;
            const payload = build?.json?.Request?.Options?.length
                ? {
                      ...adapter.defaultOptions,
                      generalOptions: adapter.defaultOptions.generalOptions.map((option) => ({
                          ...option,
                          default: build.json.Request.Options.includes(option.value),
                      })),
                      radioProtocols: adapter.defaultOptions.radioProtocols.map((option) => ({
                          ...option,
                          default: build.json.Request.Options.includes(option.value),
                      })),
                      telemetryProtocols: adapter.defaultOptions.telemetryProtocols.map((option) => ({
                          ...option,
                          default: build.json.Request.Options.includes(option.value),
                      })),
                      motorProtocols: adapter.defaultOptions.motorProtocols.map((option) => ({
                          ...option,
                          default: build.json.Request.Options.includes(option.value),
                      })),
                  }
                : adapter.defaultOptions;

            return jsonResponse(200, payload);
        }

        if (method === "GET" && pathname.startsWith("/api/releases/") && pathname.endsWith("/commits")) {
            const release = decodeURIComponent(pathname.split("/")[3]);
            return jsonResponse(200, adapter.commitHistoryByRelease[release] || []);
        }

        if (method === "GET" && pathname === "/api/support/commands") {
            return jsonResponse(200, adapter.supportCommands);
        }

        if (method === "POST" && pathname === "/api/support") {
            const supportId = `${supportIdPrefix}-${String(supportCounter).padStart(4, "0")}`;
            supportCounter += 1;
            return textResponse(200, supportId);
        }

        if (method === "GET" && pathname.startsWith("/api/configurator/releases/")) {
            const type = decodeURIComponent(pathname.split("/")[4] || "stable");
            return jsonResponse(200, adapter.getConfiguratorRelease(type));
        }

        if (method === "GET" && pathname === "/api/firmware/versions") {
            return jsonResponse(200, adapter.getFirmwareVersions());
        }

        if (method === "GET" && pathname === "/api/firmware/targets") {
            const version = searchParams.get("version");
            return jsonResponse(200, {
                version,
                targets: adapter.getFirmwareTargets(version),
            });
        }

        if (method === "GET" && pathname === "/api/firmware/url") {
            const version = searchParams.get("version");
            const target = searchParams.get("target");
            const artifact = adapter.getFirmwareArtifact(version, target);

            if (!artifact) {
                return jsonResponse(202, {
                    hit: false,
                    source: "building",
                    taskId: `bf_${String(target || "unknown").toLowerCase()}_${String(version || "unknown").replace(/[^a-zA-Z0-9]/g, "")}`,
                    status: "pending",
                });
            }

            return jsonResponse(200, {
                hit: true,
                source: "cos",
                file: artifact.file,
                url: artifact.url,
            });
        }

        if (method === "GET" && pathname.startsWith("/api/firmware/task/")) {
            const taskId = decodeURIComponent(pathname.replace("/api/firmware/task/", ""));
            const build = buildRequests.get(taskId);

            return jsonResponse(200, {
                taskId,
                status: build ? "success" : "pending",
                url: build?.request ? adapter.getBuildResponse(build.request.release, build.request.target)?.url : null,
            });
        }

        return { matched: false };
    }

    return {
        adapter,
        buildRequests,
        handleAssetRequest,
        handleApiRequest,
    };
}
