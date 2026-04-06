import { describe, expect, it } from "vitest";
import {
    groupFirmwareTargetDescriptors,
    normalizeFirmwareTargetDescriptors,
} from "../../src/js/utils/firmwareTargets.js";

describe("firmware target helpers", () => {
    it("normalizes current API arrays and legacy cached target descriptor objects", () => {
        const targets = [
            { target: "SPEEDYBEEF405V3", group: "supported" },
            { target: "MATEKF722", group: "supported" },
        ];

        expect(normalizeFirmwareTargetDescriptors(targets)).toBe(targets);
        expect(normalizeFirmwareTargetDescriptors({ targetDescriptors: targets })).toBe(targets);
        expect(normalizeFirmwareTargetDescriptors(null)).toEqual([]);
    });

    it("groups targets without requiring Object.groupBy browser support", () => {
        expect(
            groupFirmwareTargetDescriptors([
                { target: "SPEEDYBEEF405V3", group: "supported" },
                { target: "UNKNOWNF405" },
                { target: "LEGACYF411", group: "legacy" },
            ]),
        ).toEqual({
            supported: [{ target: "SPEEDYBEEF405V3", group: "supported" }],
            unsupported: [{ target: "UNKNOWNF405" }],
            legacy: [{ target: "LEGACYF411", group: "legacy" }],
        });
    });
});
