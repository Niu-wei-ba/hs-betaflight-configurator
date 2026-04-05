function currentOrigin() {
    if (typeof window !== "undefined" && window.location?.origin) {
        return window.location.origin;
    }

    return "http://localhost:8080";
}

function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

export const appConfig = {
    appName: import.meta.env.VITE_APP_NAME || "HS-FPV | Betaflight镜像站",
    appTagline:
        import.meta.env.VITE_APP_TAGLINE ||
        "一个专注镜像部署的 Betaflight 兼容调参工具，支持固件刷写与预设托管。",
    sourceCodeUrl:
        import.meta.env.VITE_SOURCE_CODE_URL || "https://github.com/Niu-wei-ba/betaflight-configurator",
    docsBaseUrl: trimTrailingSlash(import.meta.env.VITE_DOCS_BASE_URL || `${currentOrigin()}/docs/wiki`),
    buildApiBaseUrl: trimTrailingSlash(import.meta.env.VITE_BUILD_API_BASE_URL || currentOrigin()),
    presetsOfficialUrl:
        import.meta.env.VITE_PRESETS_OFFICIAL_URL || `${currentOrigin()}/presets/firmware-presets/`,
    presetsBackupUrl:
        import.meta.env.VITE_PRESETS_BACKUP_URL || `${currentOrigin()}/presets/firmware-presets/`,
    documentationLabel: import.meta.env.VITE_DOCUMENTATION_LABEL || "Documentation",
};

export function buildApiUrl(path = "") {
    const normalizedPath = String(path).startsWith("/") ? path : `/${path}`;
    return `${appConfig.buildApiBaseUrl}/api${normalizedPath}`;
}

export function buildDocsUrl(path = "") {
    const normalizedPath = String(path).replace(/^\/+/, "");
    return `${appConfig.docsBaseUrl}/${normalizedPath}`;
}

export function buildRootUrl(buildKey) {
    return buildApiUrl(`/builds/${buildKey}`);
}

export function buildLogUrl(buildKey) {
    return buildApiUrl(`/builds/${buildKey}/log`);
}

export function buildJsonUrl(buildKey) {
    return buildApiUrl(`/builds/${buildKey}/json`);
}

export function resolveMirrorAssetUrl(path) {
    if (!path) {
        return path;
    }

    if (/^https?:\/\//.test(path)) {
        return path;
    }

    return `${appConfig.buildApiBaseUrl}${path}`;
}
