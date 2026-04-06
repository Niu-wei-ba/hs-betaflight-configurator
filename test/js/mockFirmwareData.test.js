import { describe, expect, it } from "vitest";
import {
    getBuildResponse,
    getConfiguratorRelease,
    getFirmwareArtifact,
    getSnapshot,
    getTargetDetail,
    getTargetReleases,
} from "../../mock-api/data.js";

describe("mock firmware data", () => {
    it("derives api payloads from the metadata snapshot", () => {
        const snapshot = getSnapshot();

        expect(snapshot.targetDescriptors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ target: "SPEEDYBEEF405V3", group: "supported" }),
                expect.objectContaining({ target: "MATEKF722", group: "supported" }),
            ]),
        );
        expect(snapshot.firmwareVersions).toEqual(
            expect.arrayContaining([{ version: "2025.12.2", channel: "stable" }]),
        );
        expect(snapshot.firmwareTargetsByVersion["2025.12.2"]).toEqual(
            expect.arrayContaining([
                { target: "SPEEDYBEEF405V3", cached: true, channel: "stable" },
                { target: "MATEKF722", cached: true, channel: "stable" },
            ]),
        );
    });

    it("maps build and firmware lookups to the generated metadata shape", () => {
        expect(getTargetReleases("SPEEDYBEEF405V3")).toEqual({
            target: "SPEEDYBEEF405V3",
            releases: [{ release: "2025.12.2", type: "Stable", label: "Stable" }],
        });

        expect(getTargetDetail("2025.12.2", "SPEEDYBEEF405V3")).toEqual(
            expect.objectContaining({
                target: "SPEEDYBEEF405V3",
                release: "2025.12.2",
                channel: "stable",
                manufacturer: "SPBE",
            }),
        );

        expect(getFirmwareArtifact("2025.12.2", "SPEEDYBEEF405V3")).toEqual({
            file: "SPEEDYBEEF405V3_2025.12.2.hex",
            url: "/mock-api/firmware/SPEEDYBEEF405V3_2025.12.2.hex",
            objectKey: "/firmware/stable/2025.12.2/SPEEDYBEEF405V3/firmware.hex",
        });

        expect(getBuildResponse("2025.12.2", "SPEEDYBEEF405V3")).toEqual({
            key: "mockspeedybeef405v32025122000000",
            file: "SPEEDYBEEF405V3_2025.12.2.hex",
            url: "/mock-api/firmware/SPEEDYBEEF405V3_2025.12.2.hex",
        });

        expect(getConfiguratorRelease("stable")).toEqual({
            type: "stable",
            version: "2025.12.2",
            url: "https://github.com/Niu-wei-ba/hs-betaflight-configurator/releases/tag/2025.12.2",
        });
    });
});
