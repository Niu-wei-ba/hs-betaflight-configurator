import { gui_log } from "./gui_log";
import { i18n } from "./localization";
import { get as getStorage, set as setStorage } from "./SessionStorage";
import CONFIGURATOR from "./data_storage.js";
import LoginApi from "./LoginApi";
import { Capacitor } from "@capacitor/core";

const OFFICIAL_BUILD_API_BASE_URL = "https://build.betaflight.com";

function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

function hasHttpOrigin(location) {
    return Boolean(location?.origin) && (location.protocol === "http:" || location.protocol === "https:");
}

function isNativeShell() {
    return Capacitor?.isNativePlatform?.() === true || "__TAURI_INTERNALS__" in globalThis;
}

/**
 * Select the Build API host without changing the official desktop/local-development default.
 *
 * Published web and PWA builds use their own origin so the mirror can proxy all firmware
 * requests through its same-origin `/api` gateway. Set VITE_BUILD_API_BASE_URL to override
 * this in any runtime; `/` explicitly selects the current browser origin.
 */
export function resolveBuildApiBaseUrl({
    env = import.meta.env,
    location = globalThis.window?.location,
    nativeShell = isNativeShell(),
} = {}) {
    const configuredBaseUrl = String(env?.VITE_BUILD_API_BASE_URL || "").trim();

    if (configuredBaseUrl) {
        if (configuredBaseUrl === "/") {
            return hasHttpOrigin(location) ? trimTrailingSlash(location.origin) : OFFICIAL_BUILD_API_BASE_URL;
        }

        return trimTrailingSlash(configuredBaseUrl);
    }

    if (env?.PROD === true && !nativeShell && hasHttpOrigin(location)) {
        return trimTrailingSlash(location.origin);
    }

    return OFFICIAL_BUILD_API_BASE_URL;
}

export function resolveBuildApiUrl(path, baseUrl = resolveBuildApiBaseUrl()) {
    const value = String(path || "");
    if (/^https?:\/\//i.test(value)) {
        try {
            const parsed = new URL(value);
            const official = new URL(OFFICIAL_BUILD_API_BASE_URL);
            if (parsed.origin === official.origin) {
                return `${trimTrailingSlash(baseUrl)}${parsed.pathname}${parsed.search}${parsed.hash}`;
            }
        } catch (_error) {
            // Preserve malformed or non-URL values for the existing fetch error path.
        }
        return value;
    }

    return `${trimTrailingSlash(baseUrl)}${value.startsWith("/") ? value : `/${value}`}`;
}

export default class BuildApi {
    constructor(loginApi = new LoginApi(), baseUrl = resolveBuildApiBaseUrl()) {
        this._url = trimTrailingSlash(baseUrl);
        this._supportUrl = trimTrailingSlash(
            import.meta.env.VITE_SUPPORT_API_URL || globalThis.BF_SUPPORT_API_URL || this._url,
        );
        this._cacheExpirationPeriod = 3600 * 1000;
        this._loginApi = loginApi;
    }

    isSuccessCode(code) {
        return code === 200 || code === 201 || code === 202;
    }

    async _authHeaders() {
        if (!this._loginApi) {
            return {};
        }

        try {
            const token = await this._loginApi.getAccessToken();
            if (token) {
                return { Authorization: `Bearer ${token}` };
            }
        } catch (_error) {
            // Silently continue without auth headers
            console.log(`Unable to obtain access token for Build API. ${_error}`);
        }

        return {};
    }

    async fetchBytes(url) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
        });

        if (this.isSuccessCode(response.status)) {
            return new Uint8Array(await response.arrayBuffer());
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchText(url) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
        });

        if (this.isSuccessCode(response.status)) {
            return await response.text();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchJson(url) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
        });

        if (this.isSuccessCode(response.status)) {
            return await response.json();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchCachedJson(url) {
        const dataTag = `${url}_Data`;
        const cacheLastUpdateTag = `${url}_LastUpdate`;

        const storageResult = getStorage([cacheLastUpdateTag, dataTag]);
        const dataTimestamp = Date.now();
        const cachedData = storageResult[dataTag];
        const cachedLastUpdate = storageResult[cacheLastUpdateTag];

        if (cachedData && cachedLastUpdate && dataTimestamp - cachedLastUpdate < this._cacheExpirationPeriod) {
            gui_log(i18n.getMessage("buildServerUsingCached", [url]));
            return cachedData;
        }

        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
        });

        if (response.status === 500) {
            throw new Error(await response.text());
        }

        if (response.status === 404) {
            return null;
        }

        const result = await response.json();

        const object = {};
        object[dataTag] = result;
        object[cacheLastUpdateTag] = Date.now();
        setStorage(object);
        return result;
    }

    async loadTargets() {
        const url = `${this._url}/api/targets`;
        return await this.fetchCachedJson(url);
    }

    async loadTargetReleases(target) {
        const url = `${this._url}/api/targets/${target}`;
        return await this.fetchCachedJson(url);
    }

    async loadTarget(target, release) {
        const url = `${this._url}/api/builds/${release}/${target}`;
        return await this.fetchCachedJson(url);
    }

    async loadTargetFirmware(path) {
        const url = resolveBuildApiUrl(path, this._url);
        return await this.fetchBytes(url);
    }

    async getSupportCommands() {
        const url = `${this._url}/api/support/commands`;
        return await this.fetchJson(url);
    }

    async submitSupportData(data) {
        const url = `${this._url}/api/support`;

        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain",
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
            body: data,
        });

        if (response.status === 200) {
            return await response.text();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async submitSupportSnapshot(snapshot) {
        const url = `${this._supportUrl}/api/support/snapshots`;
        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
            body: JSON.stringify(snapshot),
        });
        if (response.status === 201) return await response.json();
        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async loadSupportSnapshot(supportId) {
        const url = `${this._supportUrl}/api/support/snapshots/${encodeURIComponent(supportId)}`;
        return await this.fetchSupportJson(url);
    }

    async fetchSupportJson(url) {
        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "GET",
            headers: { "X-CFG-VER": `${CONFIGURATOR.version}`, ...authHeaders },
        });
        if (this.isSuccessCode(response.status)) return await response.json();
        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async requestBuild(request) {
        const url = `${this._url}/api/builds`;

        const authHeaders = await this._authHeaders();
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CFG-VER": `${CONFIGURATOR.version}`,
                ...authHeaders,
            },
            body: JSON.stringify(request),
        });

        if (this.isSuccessCode(response.status)) {
            return await response.json();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async requestBuildStatus(key) {
        const url = `${this._url}/api/builds/${key}/status`;
        return await this.fetchJson(url);
    }

    async requestBuildOptions(key) {
        const url = `${this._url}/api/builds/${key}/json`;
        return await this.fetchJson(url);
    }

    async loadOptions(release) {
        const url = `${this._url}/api/options/${release}`;
        return await this.fetchJson(url);
    }

    async loadOptionsByBuildKey(release, key) {
        const url = `${this._url}/api/options/${release}/${key}`;
        return await this.fetchJson(url);
    }

    async loadCommits(release) {
        const url = `${this._url}/api/releases/${release}/commits`;
        return await this.fetchJson(url);
    }

    async loadConfiguratorRelease(type) {
        const url = `${this._url}/api/app/releases/${type}`;
        return await this.fetchJson(url);
    }

    async loadDeviceFilters() {
        try {
            return await this.fetchJson("/api/app/devices");
        } catch {
            // offline or network error — caller falls back to cache
            return null;
        }
    }

    async loadSponsorTile(mode, page) {
        const url = `${this._url}/api/app/sponsors/${mode}/${page}`;
        return await this.fetchText(url);
    }
}
