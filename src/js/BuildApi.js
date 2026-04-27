import { gui_log } from "./gui_log";
import { i18n } from "./localization";
import { get as getStorage, set as setStorage } from "./SessionStorage";
import CONFIGURATOR from "./data_storage.js";
import { buildApiUrl, resolveMirrorAssetUrl } from "./AppConfig";

export default class BuildApi {
    constructor() {
        this._cacheExpirationPeriod = 3600 * 1000;
    }

    isSuccessCode(code) {
        return code === 200 || code === 201 || code === 202;
    }

    async fetchBytes(url) {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
            },
        });

        if (this.isSuccessCode(response.status)) {
            return new Uint8Array(await response.arrayBuffer());
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchText(url) {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
            },
        });

        if (this.isSuccessCode(response.status)) {
            return await response.text();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async fetchJson(url) {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
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

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
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
        const url = buildApiUrl("/targets");
        return await this.fetchCachedJson(url);
    }

    /**
     * Optional mirror metadata index. Returns null if the build API does not implement this route.
     */
    async loadFirmwareVersions() {
        const url = buildApiUrl("/firmware/versions");
        return await this.fetchCachedJson(url);
    }

    async loadTargetReleases(target) {
        const url = buildApiUrl(`/targets/${target}`);
        return await this.fetchCachedJson(url);
    }

    async loadTarget(target, release) {
        const url = buildApiUrl(`/builds/${release}/${target}`);
        return await this.fetchCachedJson(url);
    }

    async loadTargetFirmware(path) {
        const url = resolveMirrorAssetUrl(path);
        return await this.fetchBytes(url);
    }

    async getSupportCommands() {
        const url = buildApiUrl("/support/commands");
        return await this.fetchJson(url);
    }

    async submitSupportData(data) {
        const url = buildApiUrl("/support");

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain",
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
            },
            body: data,
        });

        if (response.status === 200) {
            return await response.text();
        }

        gui_log(i18n.getMessage("buildServerFailure", [url, `HTTP ${response.status}`]));
        return null;
    }

    async requestBuild(request) {
        const url = buildApiUrl("/builds");

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": navigator.userAgent,
                "X-CFG-VER": `${CONFIGURATOR.version}`,
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
        const url = buildApiUrl(`/builds/${key}/status`);
        return await this.fetchJson(url);
    }

    async requestBuildOptions(key) {
        const url = buildApiUrl(`/builds/${key}/json`);
        return await this.fetchJson(url);
    }

    async loadOptions(release) {
        const url = buildApiUrl(`/options/${release}`);
        return await this.fetchJson(url);
    }

    async loadOptionsByBuildKey(release, key) {
        const url = buildApiUrl(`/options/${release}/${key}`);
        return await this.fetchJson(url);
    }

    async loadCommits(release) {
        const url = buildApiUrl(`/releases/${release}/commits`);
        return await this.fetchJson(url);
    }

    async loadConfiguratorRelease(type) {
        const url = buildApiUrl(`/configurator/releases/${type}`);
        return await this.fetchJson(url);
    }
}
