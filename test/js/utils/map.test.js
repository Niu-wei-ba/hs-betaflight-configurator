import { describe, expect, it } from "vitest";
import { resolveGoogleTileUrl } from "../../../src/js/utils/map.js";

describe("Google map tile gateway routing", () => {
    it("keeps desktop and unconfigured development on the official Google tile endpoint", () => {
        expect(resolveGoogleTileUrl("s", { baseUrl: "https://build.betaflight.com" })).toBe(
            "https://mt1.google.com/vt?lyrs=s&x={x}&y={y}&z={z}",
        );
    });

    it("routes published web tiles through the same-origin gateway", () => {
        expect(resolveGoogleTileUrl("s", { baseUrl: "https://bf.hs-fpv.com" })).toBe(
            "https://bf.hs-fpv.com/api/external/maps/google?lyrs=s&x={x}&y={y}&z={z}",
        );
        expect(resolveGoogleTileUrl("y", { baseUrl: "https://bf.hs-fpv.com/" })).toBe(
            "https://bf.hs-fpv.com/api/external/maps/google?lyrs=y&x={x}&y={y}&z={z}",
        );
    });

    it("honors an explicitly configured mirror gateway", () => {
        expect(resolveGoogleTileUrl("s", { baseUrl: "https://mirror.example.com/" })).toBe(
            "https://mirror.example.com/api/external/maps/google?lyrs=s&x={x}&y={y}&z={z}",
        );
    });
});
