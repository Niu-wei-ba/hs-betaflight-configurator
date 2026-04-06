import { describe, expect, it } from "vitest";
import manifest from "../../resources/firmware-mirror/phase-one-manifest.json";
import { buildFirmwareMetadata } from "../../scripts/generate-firmware-metadata.mjs";

describe("buildFirmwareMetadata", () => {
    it("produces target, version, and build indexes for the phase-one manifest", () => {
        const metadata = buildFirmwareMetadata(manifest);

        expect(metadata.schemaVersion).toBe("1.0");
        expect(metadata.index.versions).toHaveLength(1);
        expect(metadata.index.targets).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    target: "SPEEDYBEEF405V3",
                    group: "supported",
                    mcu: "STM32F405",
                    manufacturer: "SPBE",
                    releaseCount: 1,
                }),
                expect.objectContaining({
                    target: "MATEKF722",
                    group: "supported",
                    mcu: "STM32F7X2",
                    manufacturer: "MTKS",
                    releaseCount: 1,
                }),
            ]),
        );
        expect(metadata.index.hot.versions).toEqual([{ version: "2025.12.2", channel: "stable" }]);
        expect(metadata.index.hot.targets).toHaveLength(12);
        expect(metadata.targetDetails.SPEEDYBEEF405V3.releases).toEqual([
            { release: "2025.12.2", type: "Stable", label: "Stable" },
        ]);
        expect(metadata.buildDetails["2025.12.2:SPEEDYBEEF405V3"]).toEqual(
            expect.objectContaining({
                target: "SPEEDYBEEF405V3",
                release: "2025.12.2",
                manufacturer: "SPBE",
                cloudBuild: false,
                channel: "stable",
                artifact: expect.objectContaining({
                    fileName: "SPEEDYBEEF405V3_2025.12.2.hex",
                }),
            }),
        );
    });
});
