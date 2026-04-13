function currentOrigin() {
    if (typeof window !== "undefined" && window.location?.origin) {
        return window.location.origin;
    }

    return "http://localhost:8080";
}

function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

function ensureLeadingSlash(value) {
    return String(value || "").startsWith("/") ? String(value || "") : `/${String(value || "")}`;
}

function buildMirrorUrl(path = "") {
    return `${appConfig.buildApiBaseUrl}${ensureLeadingSlash(path)}`;
}

function encodePathSegments(pathname) {
    const segments = String(pathname || "")
        .split("/")
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment));

    return segments.length ? `/${segments.join("/")}` : "";
}

export const appConfig = {
    appName: import.meta.env.VITE_APP_NAME || "HS-FPV | Betaflight镜像站",
    appTagline:
        import.meta.env.VITE_APP_TAGLINE || "一个专注镜像部署的 Betaflight 兼容调参工具，支持固件刷写与预设托管。",
    sourceCodeUrl: import.meta.env.VITE_SOURCE_CODE_URL || "https://github.com/Niu-wei-ba/betaflight-configurator",
    docsBaseUrl: trimTrailingSlash(import.meta.env.VITE_DOCS_BASE_URL || `${currentOrigin()}/docs/wiki`),
    buildApiBaseUrl: trimTrailingSlash(import.meta.env.VITE_BUILD_API_BASE_URL || currentOrigin()),
    presetsOfficialUrl: import.meta.env.VITE_PRESETS_OFFICIAL_URL || `${currentOrigin()}/presets/firmware-presets/`,
    presetsBackupUrl: import.meta.env.VITE_PRESETS_BACKUP_URL || `${currentOrigin()}/presets/firmware-presets/`,
    documentationLabel: import.meta.env.VITE_DOCUMENTATION_LABEL || "文档",
    /**
     * When true, version dropdown is intersected with `/api/firmware/versions` (mirror index subset).
     * Default false: list all releases from `/api/targets/{target}` like official Betaflight Configurator.
     */
    firmwareUseVersionIndexFilter: import.meta.env.VITE_FIRMWARE_USE_VERSION_INDEX_FILTER === "true",
    proxyThirdPartyPresets: import.meta.env.VITE_PROXY_THIRD_PARTY_PRESETS !== "false",
};

export function buildApiUrl(path = "") {
    return buildMirrorUrl(`/api${ensureLeadingSlash(path)}`);
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

export function buildRawProxyBaseUrl(baseUrl) {
    const upstream = new URL(baseUrl);
    const protocol = upstream.protocol.replace(/:$/, "");
    let proxyUrl = `${buildApiUrl(`/external/raw/${encodeURIComponent(protocol)}/${encodeURIComponent(upstream.host)}`)}${encodePathSegments(upstream.pathname)}`;

    if (upstream.pathname.endsWith("/") && !proxyUrl.endsWith("/")) {
        proxyUrl += "/";
    }

    if (upstream.search) {
        proxyUrl += upstream.search;
    }

    if (upstream.hash) {
        proxyUrl += upstream.hash;
    }

    return proxyUrl;
}

export function buildGitHubApiProxyUrl(path = "") {
    const normalizedPath = String(path).replace(/^\/+/, "");
    return buildApiUrl(`/external/github/${normalizedPath}`);
}

export function buildOsmTileProxyUrl() {
    return buildApiUrl("/external/maps/osm/{z}/{x}/{y}.png");
}

export function buildGoogleTileProxyUrl(layer) {
    const params = new URLSearchParams();
    params.set("lyrs", layer);
    return `${buildApiUrl("/external/maps/google")}?${params.toString()}&x={x}&y={y}&z={z}`;
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
