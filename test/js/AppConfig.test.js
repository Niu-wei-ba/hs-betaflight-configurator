import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAppConfigModule(env = {}) {
    vi.resetModules();

    for (const [key, value] of Object.entries(env)) {
        vi.stubEnv(key, value);
    }

    return import("../../src/js/AppConfig.js");
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe("AppConfig proxy builders", () => {
    it("defaults API URLs to the current origin when no override is set", async () => {
        const appConfigModule = await loadAppConfigModule();

        expect(appConfigModule.buildApiUrl("/targets")).toBe(`${window.location.origin}/api/targets`);
    });

    it("builds same-origin external proxy URLs", async () => {
        const appConfigModule = await loadAppConfigModule({
            VITE_BUILD_API_BASE_URL: "https://mirror.example.com",
        });

        expect(appConfigModule.buildApiUrl("/targets")).toBe("https://mirror.example.com/api/targets");
        expect(appConfigModule.buildRawProxyBaseUrl("https://raw.githubusercontent.com/foo/bar/main/")).toBe(
            "https://mirror.example.com/api/external/raw/https/raw.githubusercontent.com/foo/bar/main/",
        );
        expect(appConfigModule.buildRawProxyBaseUrl("https://example.com/presets")).toBe(
            "https://mirror.example.com/api/external/raw/https/example.com/presets",
        );
        expect(appConfigModule.buildGitHubApiProxyUrl("/repos/foo/bar")).toBe(
            "https://mirror.example.com/api/external/github/repos/foo/bar",
        );
        expect(appConfigModule.buildOsmTileProxyUrl()).toBe(
            "https://mirror.example.com/api/external/maps/osm/{z}/{x}/{y}.png",
        );
        expect(appConfigModule.buildGoogleTileProxyUrl("s")).toBe(
            "https://mirror.example.com/api/external/maps/google?lyrs=s&x={x}&y={y}&z={z}",
        );
    });

    it("preserves raw proxy search params and hash", async () => {
        const appConfigModule = await loadAppConfigModule({
            VITE_BUILD_API_BASE_URL: "https://mirror.example.com",
        });

        expect(appConfigModule.buildRawProxyBaseUrl("https://example.com/presets/?token=abc#v1")).toBe(
            "https://mirror.example.com/api/external/raw/https/example.com/presets/?token=abc#v1",
        );
    });

    it("enables third-party preset proxy by default", async () => {
        const appConfigModule = await loadAppConfigModule({
            VITE_BUILD_API_BASE_URL: "https://mirror.example.com",
        });

        expect(appConfigModule.appConfig.proxyThirdPartyPresets).toBe(true);
    });

    it("can disable third-party preset proxy via env", async () => {
        const appConfigModule = await loadAppConfigModule({
            VITE_BUILD_API_BASE_URL: "https://mirror.example.com",
            VITE_PROXY_THIRD_PARTY_PRESETS: "false",
        });

        expect(appConfigModule.appConfig.proxyThirdPartyPresets).toBe(false);
    });
});
