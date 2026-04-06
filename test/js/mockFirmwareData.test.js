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
                expect.objectContaining({ target: "HSF405", group: "supported" }),
                expect.objectContaining({ target: "LEGACYF411", group: "legacy" }),
            ]),
        );
        expect(snapshot.firmwareVersions).toEqual(
            expect.arrayContaining([
                { version: "2025.12.2", channel: "stable" },
                { version: "2025.12.3-rc.1", channel: "rc" },
            ]),
        );
        expect(snapshot.firmwareTargetsByVersion["2025.12.2"]).toEqual(
            expect.arrayContaining([
                { target: "HSF405", cached: true, channel: "stable" },
                { target: "HSF722", cached: true, channel: "stable" },
            ]),
        );
    });

    it("maps build and firmware lookups to the generated metadata shape", () => {
        expect(getTargetReleases("HSF405")).toEqual({
            target: "HSF405",
            releases: [
                { release: "2025.12.3-rc.1", type: "ReleaseCandidate", label: "RC" },
                { release: "2025.12.2", type: "Stable", label: "Stable" },
            ],
        });

        expect(getTargetDetail("2025.12.2", "HSF405")).toEqual(
            expect.objectContaining({
                target: "HSF405",
                release: "2025.12.2",
                channel: "stable",
            }),
        );

        expect(getFirmwareArtifact("2025.12.2", "HSF405")).toEqual({
            file: "HSF405_2025.12.2.hex",
            url: "/mock-api/firmware/HSF405_2025.12.2.hex",
            objectKey: "/firmware/stable/2025.12.2/HSF405/firmware.hex",
        });

        expect(getBuildResponse("2025.12.2", "HSF405")).toEqual({
            key: "mockhsf4052025122000000000000000",
            file: "HSF405_2025.12.2.hex",
            url: "/mock-api/firmware/HSF405_2025.12.2.hex",
        });

        expect(getConfiguratorRelease("stable")).toEqual({
            type: "stable",
            version: "2025.12.2",
            url: "https://github.com/Niu-wei-ba/betaflight-configurator/releases/tag/2025.12.2",
        });
    });
});
