import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_MANIFEST_PATH = "resources/firmware-mirror/phase-one-manifest.json";
const DEFAULT_OUTPUT_DIR = "artifacts/firmware-metadata";

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function normalizePathSegment(value) {
    return String(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function releaseLabelForChannel(channel) {
    const labels = {
        stable: "Stable",
        rc: "RC",
        dev: "Dev",
    };

    return labels[channel] || channel;
}

function validateManifest(manifest) {
    assert(manifest && typeof manifest === "object", "Manifest must be an object.");
    assert(manifest.schemaVersion === "1.0", "Manifest schemaVersion must be 1.0.");
    assert(typeof manifest.releaseBaseUrl === "string" && manifest.releaseBaseUrl.startsWith("http"), "Manifest releaseBaseUrl must be an absolute URL.");
    assert(Array.isArray(manifest.defaults?.configuration), "Manifest defaults.configuration must be an array.");
    assert(Array.isArray(manifest.versions) && manifest.versions.length > 0, "Manifest versions must be a non-empty array.");

    manifest.versions.forEach((versionEntry) => {
        assert(typeof versionEntry.version === "string" && versionEntry.version.length > 0, "Each version must define version.");
        assert(["stable", "rc", "dev"].includes(versionEntry.channel), `Unsupported channel: ${versionEntry.channel}`);
        assert(
            ["Stable", "ReleaseCandidate", "Unstable"].includes(versionEntry.releaseType),
            `Unsupported releaseType: ${versionEntry.releaseType}`,
        );
        assert(Array.isArray(versionEntry.targets) && versionEntry.targets.length > 0, `Version ${versionEntry.version} must declare targets.`);

        versionEntry.targets.forEach((targetEntry) => {
            assert(typeof targetEntry.target === "string" && targetEntry.target.length > 0, `Version ${versionEntry.version} has target without name.`);
            assert(["supported", "unsupported", "legacy"].includes(targetEntry.group), `Target ${targetEntry.target} has invalid group.`);
            assert(typeof targetEntry.mcu === "string" && targetEntry.mcu.length > 0, `Target ${targetEntry.target} must define mcu.`);
            assert(typeof targetEntry.cloudBuild === "boolean", `Target ${targetEntry.target} must define cloudBuild.`);
            assert(typeof targetEntry.hot === "boolean", `Target ${targetEntry.target} must define hot.`);
            assert(typeof targetEntry.artifact?.fileName === "string", `Target ${targetEntry.target} must define artifact.fileName.`);
            assert(typeof targetEntry.artifact?.objectKey === "string" && targetEntry.artifact.objectKey.startsWith("/"), `Target ${targetEntry.target} must define artifact.objectKey.`);
        });
    });

    return manifest;
}

export function buildFirmwareMetadata(manifest) {
    validateManifest(manifest);

    const generatedAt = new Date().toISOString();
    const versions = manifest.versions
        .map((entry) => ({
            version: entry.version,
            channel: entry.channel,
            releaseType: entry.releaseType,
            date: entry.date,
            hot: entry.hot,
            targetCount: entry.targets.length,
        }))
        .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

    const targetMap = new Map();

    manifest.versions.forEach((versionEntry) => {
        versionEntry.targets.forEach((targetEntry) => {
            if (!targetMap.has(targetEntry.target)) {
                targetMap.set(targetEntry.target, {
                    target: targetEntry.target,
                    group: targetEntry.group,
                    mcu: targetEntry.mcu,
                    releases: [],
                });
            }

            targetMap.get(targetEntry.target).releases.push({
                release: versionEntry.version,
                type: versionEntry.releaseType,
                label: releaseLabelForChannel(versionEntry.channel),
                channel: versionEntry.channel,
                hot: targetEntry.hot,
            });
        });
    });

    const targets = Array.from(targetMap.values())
        .map((entry) => ({
            target: entry.target,
            group: entry.group,
            mcu: entry.mcu,
            releaseCount: entry.releases.length,
            releases: entry.releases.sort((a, b) => b.release.localeCompare(a.release, undefined, { numeric: true })),
        }))
        .sort((a, b) => a.target.localeCompare(b.target));

    const hot = {
        generatedAt,
        versions: manifest.versions
            .filter((entry) => entry.hot)
            .map((entry) => ({
                version: entry.version,
                channel: entry.channel,
            })),
        targets: targets
            .filter((entry) => entry.releases.some((release) => release.hot))
            .map((entry) => entry.target),
    };

    const targetDetails = Object.fromEntries(
        targets.map((entry) => [
            entry.target,
            {
                target: entry.target,
                releases: entry.releases.map((release) => ({
                    release: release.release,
                    type: release.type,
                    label: release.label,
                })),
            },
        ]),
    );

    const buildDetails = {};

    manifest.versions.forEach((versionEntry) => {
        versionEntry.targets.forEach((targetEntry) => {
            const key = `${versionEntry.version}:${targetEntry.target}`;
            buildDetails[key] = {
                target: targetEntry.target,
                release: versionEntry.version,
                releaseType: versionEntry.releaseType,
                releaseUrl: `${manifest.releaseBaseUrl}/${versionEntry.version}`,
                date: versionEntry.date,
                mcu: targetEntry.mcu,
                manufacturer: manifest.defaults.manufacturer,
                cloudBuild: targetEntry.cloudBuild,
                configuration: targetEntry.configuration || manifest.defaults.configuration,
                artifact: targetEntry.artifact,
                hot: targetEntry.hot,
                channel: versionEntry.channel,
            };
        });
    });

    return {
        generatedAt,
        schemaVersion: manifest.schemaVersion,
        manifest,
        index: {
            versions,
            targets: targets.map(({ releases, ...rest }) => rest),
            hot,
        },
        targetDetails,
        buildDetails,
    };
}

async function ensureDir(directory) {
    await fs.mkdir(directory, { recursive: true });
}

async function writeJson(filePath, payload) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function writeFirmwareMetadata(metadata, outputDir) {
    const resolvedOutputDir = path.resolve(outputDir);
    await ensureDir(resolvedOutputDir);

    await writeJson(path.join(resolvedOutputDir, "manifest.json"), metadata.manifest);
    await writeJson(path.join(resolvedOutputDir, "index", "versions.json"), metadata.index.versions);
    await writeJson(path.join(resolvedOutputDir, "index", "targets.json"), metadata.index.targets);
    await writeJson(path.join(resolvedOutputDir, "index", "hot.json"), metadata.index.hot);

    await Promise.all(
        Object.entries(metadata.targetDetails).map(([target, payload]) =>
            writeJson(path.join(resolvedOutputDir, "targets", `${normalizePathSegment(target)}.json`), payload),
        ),
    );

    await Promise.all(
        Object.entries(metadata.buildDetails).map(([key, payload]) => {
            const [release, target] = key.split(":");
            return writeJson(
                path.join(resolvedOutputDir, "builds", normalizePathSegment(release), `${normalizePathSegment(target)}.json`),
                payload,
            );
        }),
    );
}

async function readManifest(manifestPath) {
    const payload = JSON.parse(await fs.readFile(path.resolve(manifestPath), "utf8"));
    return validateManifest(payload);
}

async function main() {
    const manifestPath = process.argv[2] || DEFAULT_MANIFEST_PATH;
    const outputDir = process.argv[3] || DEFAULT_OUTPUT_DIR;
    const manifest = await readManifest(manifestPath);
    const metadata = buildFirmwareMetadata(manifest);
    await writeFirmwareMetadata(metadata, outputDir);

    console.log(`Generated firmware metadata into ${path.resolve(outputDir)}`);
    console.log(`Versions: ${metadata.index.versions.length}`);
    console.log(`Targets: ${metadata.index.targets.length}`);
    console.log(`Builds: ${Object.keys(metadata.buildDetails).length}`);
}

const directRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (directRun) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
