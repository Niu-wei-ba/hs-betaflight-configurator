import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/localization", () => ({ i18n: { getMessage: (key) => key } }));
vi.mock("../../src/js/SessionStorage", () => ({
    get: vi.fn(() => ({})),
    set: vi.fn(),
}));
vi.mock("../../src/js/data_storage.js", () => ({ default: { version: "test" } }));
vi.mock("../../src/js/LoginApi", () => ({ default: class LoginApi {} }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import BuildApi, { resolveBuildApiBaseUrl, resolveBuildApiUrl } from "../../src/js/BuildApi.js";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("BuildApi gateway routing", () => {
    const browserLocation = {
        protocol: "https:",
        origin: "https://bf.hs-fpv.com",
    };

    it("uses the deployed web origin by default", () => {
        expect(resolveBuildApiBaseUrl({ env: { PROD: true }, location: browserLocation })).toBe(
            "https://bf.hs-fpv.com",
        );
    });

    it("keeps unconfigured development and desktop-style runtimes on the official API", () => {
        expect(resolveBuildApiBaseUrl({ env: { DEV: true }, location: browserLocation })).toBe(
            "https://build.betaflight.com",
        );
        expect(
            resolveBuildApiBaseUrl({
                env: { PROD: true },
                location: { protocol: "http:", origin: "http://localhost" },
                nativeShell: true,
            }),
        ).toBe("https://build.betaflight.com");
    });

    it("honors explicit gateway configuration, including the same-origin marker", () => {
        expect(
            resolveBuildApiBaseUrl({
                env: { VITE_BUILD_API_BASE_URL: "https://mirror.example.com/" },
                location: browserLocation,
            }),
        ).toBe("https://mirror.example.com");
        expect(resolveBuildApiBaseUrl({ env: { VITE_BUILD_API_BASE_URL: "/" }, location: browserLocation })).toBe(
            "https://bf.hs-fpv.com",
        );
    });

    it("routes API and relative firmware URLs through the selected gateway while retaining absolute URLs", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify([{ target: "TEST" }]), { status: 200 }))
            .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
            .mockResolvedValueOnce(new Response(new Uint8Array([4]), { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        const api = new BuildApi(null, "https://mirror.example.com/");
        await api.loadTargets();
        await api.loadTargetFirmware("/api/builds/task/firmware");
        await api.loadTargetFirmware("https://files.example.com/firmware.hex");

        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            "https://mirror.example.com/api/targets",
            "https://mirror.example.com/api/builds/task/firmware",
            "https://files.example.com/firmware.hex",
        ]);
        expect(resolveBuildApiUrl("api/targets", "https://mirror.example.com/")).toBe(
            "https://mirror.example.com/api/targets",
        );
    });
});
