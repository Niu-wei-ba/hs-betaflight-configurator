import { describe, expect, it } from "vitest";
import manifest from "../../resources/firmware-mirror/phase-one-manifest.json";
import { createFirmwareArtifactPlan } from "../../scripts/mirror-firmware-artifacts.mjs";

describe("firmware artifact mirroring", () => {
    it("plans COS object-key outputs and Cloud Build requests from the manifest", () => {
        const plan = createFirmwareArtifactPlan(manifest, {
            outputDir: "artifacts/firmware-files",
            objectPrefix: "firmware",
        });

        expect(plan).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    version: "2025.12.2",
                    target: "HSF405",
                    sourceType: "betaflight-cloud-build",
                    buildRequest: {
                        target: "HSF405",
                        release: "2025.12.2",
                        options: ["CORE_BUILD"],
                    },
                    objectKey: "/firmware/stable/2025.12.2/HSF405/firmware.hex",
                    outputPath: "artifacts/firmware-files/stable/2025.12.2/HSF405/firmware.hex",
                }),
            ]),
        );
    });
});
