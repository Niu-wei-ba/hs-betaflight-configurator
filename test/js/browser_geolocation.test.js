import { afterEach, describe, expect, it, vi } from "vitest";
import {
    BrowserGeolocationErrorCode,
    getBrowserCoordinates,
    parseCoordinatePair,
} from "../../src/js/utils/browserGeolocation";

function installGeolocation(getCurrentPosition) {
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
}

describe("getBrowserCoordinates", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("returns the high-accuracy browser position first", async () => {
        const getCurrentPosition = vi.fn((success) => {
            success({ coords: { latitude: 31.2304, longitude: 121.4737 } });
        });
        installGeolocation(getCurrentPosition);

        await expect(getBrowserCoordinates()).resolves.toEqual({ lat: 31.2304, lon: 121.4737 });
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);
        expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 3000 });
    });

    it("retries with lower accuracy when high accuracy fails", async () => {
        const getCurrentPosition = vi
            .fn()
            .mockImplementationOnce((_success, error) => error({ code: 2, message: "Unavailable" }))
            .mockImplementationOnce((success) => success({ coords: { latitude: 22.5431, longitude: 114.0579 } }));
        installGeolocation(getCurrentPosition);

        await expect(getBrowserCoordinates()).resolves.toEqual({ lat: 22.5431, lon: 114.0579 });
        expect(getCurrentPosition).toHaveBeenCalledTimes(2);
        expect(getCurrentPosition.mock.calls[1][2]).toEqual({ enableHighAccuracy: false, timeout: 3000 });
    });

    it("reports unsupported browser geolocation", async () => {
        vi.stubGlobal("navigator", {});

        await expect(getBrowserCoordinates()).rejects.toMatchObject({
            code: BrowserGeolocationErrorCode.UNSUPPORTED,
        });
    });

    it.each([
        [1, BrowserGeolocationErrorCode.DENIED],
        [2, BrowserGeolocationErrorCode.UNAVAILABLE],
        [3, BrowserGeolocationErrorCode.TIMEOUT],
    ])("maps browser error %s to %s after both attempts", async (browserCode, expectedCode) => {
        const getCurrentPosition = vi.fn((_success, error) => error({ code: browserCode, message: "Failed" }));
        installGeolocation(getCurrentPosition);

        await expect(getBrowserCoordinates()).rejects.toMatchObject({ code: expectedCode });
        expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    });

    it("rejects invalid coordinates", async () => {
        const getCurrentPosition = vi.fn((success) => {
            success({ coords: { latitude: 95, longitude: 181 } });
        });
        installGeolocation(getCurrentPosition);

        await expect(getBrowserCoordinates()).rejects.toMatchObject({
            code: BrowserGeolocationErrorCode.UNAVAILABLE,
        });
    });

    it("parses valid manual coordinates without persisting them", () => {
        expect(parseCoordinatePair("31.2304", "121.4737")).toEqual({
            ok: true,
            coords: { lat: 31.2304, lon: 121.4737 },
        });
    });

    it.each([
        ["91", "121", "latitude"],
        ["31", "181", "longitude"],
        ["", "121", "latitude"],
        ["31north", "121", "latitude"],
    ])("rejects invalid manual coordinate pair (%s, %s)", (latitude, longitude, error) => {
        expect(parseCoordinatePair(latitude, longitude)).toEqual({ ok: false, error });
    });
});
