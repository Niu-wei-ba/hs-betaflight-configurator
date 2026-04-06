import { createFirmwareApiAdapter } from "../scripts/firmware-api-adapter.mjs";

const adapter = createFirmwareApiAdapter({
    projectRoot: process.cwd(),
    assetUrlPrefix: "/mock-api/firmware",
    assetDirectory: "mock-api/assets/firmware",
});

function getSnapshot() {
    const snapshot = adapter.getSnapshot();

    return {
        ...snapshot,
        firmwareTargetsByVersion: Object.fromEntries(
            snapshot.firmwareVersions.map((entry) => [entry.version, adapter.getFirmwareTargets(entry.version)]),
        ),
    };
}

const defaultOptions = adapter.defaultOptions;
const commitHistoryByRelease = adapter.commitHistoryByRelease;
const supportCommands = adapter.supportCommands;
const buildKey = adapter.buildKey;
const getTargetReleases = adapter.getTargetReleases.bind(adapter);
const getTargetDetail = adapter.getBuildDetail.bind(adapter);
const getFirmwareArtifact = adapter.getFirmwareArtifact.bind(adapter);
const getBuildResponse = adapter.getBuildResponse.bind(adapter);
const getBuildStatus = adapter.getBuildStatus.bind(adapter);
const getBuildJson = adapter.getBuildJson.bind(adapter);
const getConfiguratorRelease = adapter.getConfiguratorRelease.bind(adapter);

export {
    buildKey,
    commitHistoryByRelease,
    defaultOptions,
    getBuildJson,
    getBuildResponse,
    getBuildStatus,
    getConfiguratorRelease,
    getFirmwareArtifact,
    getSnapshot,
    getTargetDetail,
    getTargetReleases,
    supportCommands,
};
