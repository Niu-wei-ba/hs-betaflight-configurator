import { describe, expect, it } from "vitest";
import manifest from "../../resources/firmware-mirror/phase-one-manifest.json";
import { buildFirmwareMetadata } from "../../scripts/generate-firmware-metadata.mjs";

describe("buildFirmwareMetadata", () => {
    it("produces target, version, and build indexes for the phase-one manifest", () => {
        const metadata = buildFirmwareMetadata(manifest);

        expect(metadata.schemaVersion).toBe("1.0");
        expect(metadata.index.versions).toHaveLength(3);
        expect(metadata.index.targets).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ target: "HSF405", group: "supported", releaseCount: 2 }),
                expect.objectContaining({ target: "HSF722", group: "supported", releaseCount: 2 }),
                expect.objectContaining({ target: "LEGACYF411", group: "legacy", releaseCount: 1 }),
            ]),
        );
        expect(metadata.index.hot.versions).toEqual([
            { version: "2025.12.2", channel: "stable" },
            { version: "2025.12.3-rc.1", channel: "rc" },
        ]);
        expect(metadata.targetDetails.HSF405.releases).toEqual([
            { release: "2025.12.3-rc.1", type: "ReleaseCandidate", label: "RC" },
            { release: "2025.12.2", type: "Stable", label: "Stable" },
        ]);
        expect(metadata.buildDetails["2025.12.2:HSF405"]).toEqual(
            expect.objectContaining({
                target: "HSF405",
                release: "2025.12.2",
                cloudBuild: false,
                channel: "stable",
                artifact: expect.objectContaining({
                    fileName: "HSF405_2025.12.2.hex",
                }),
            }),
        );
    });
});
