import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    getBluejayApplicationBuilds,
    isCorruptBluejayName,
    isMissingBluejayName,
    isTaggedBluejayName,
    matchBluejayApplication,
} from "../../src/js/esc_melody/bluejay_identity.ts";

const application = new Uint8Array(readFileSync("test/fixtures/esc_melody/bluejay-B_X_30_24-v0.19.2-application.bin"));
const device = { signature: 0xe8b5, interfaceMode: 1, settingsOffset: 0x3000 };
const header = new Uint8Array([0, 19, 206]);

describe("Bluejay official application identification", () => {
    it("matches an independently hashed official image rather than the user's mutable tags", () => {
        const identity = matchBluejayApplication(device, header, application);
        expect(identity).toMatchObject({ release: "0.19.2", target: "B_X_30_24" });
        expect(identity?.applicationSha256).toBe(createHash("sha256").update(application).digest("hex"));
    });
    it("rejects one-byte changes, truncated images and erased application data", () => {
        const changed = application.slice();
        changed[0x2000] ^= 1;
        expect(matchBluejayApplication(device, header, changed)).toBeNull();
        expect(matchBluejayApplication(device, header, application.slice(1))).toBeNull();
        expect(matchBluejayApplication(device, header, new Uint8Array(0x3000).fill(255))).toBeNull();
    });
    it("requires a matching MCU, interface, address and header even when the program hash is known", () => {
        for (const other of [{ signature: 0xe8b2 }, { interfaceMode: 4 }, { settingsOffset: 0x1a00 }]) {
            expect(matchBluejayApplication({ ...device, ...other }, header, application)).toBeNull();
        }
        expect(matchBluejayApplication(device, new Uint8Array([0, 19, 207]), application)).toBeNull();
        expect(getBluejayApplicationBuilds(device, new Uint8Array([0, 19]))).toEqual([]);
    });
    it("only treats a complete blank name field as missing, not a conflicting firmware name", () => {
        expect(isMissingBluejayName(new Uint8Array(16).fill(255))).toBe(true);
        expect(isMissingBluejayName(new Uint8Array(16))).toBe(true);
        expect(isMissingBluejayName(new Uint8Array(15).fill(255))).toBe(false);
        expect(isMissingBluejayName(new TextEncoder().encode("BLHeli_S        "))).toBe(false);
    });
    it("distinguishes valid Bluejay tags from binary corruption and conflicting names", () => {
        const hardwareCorruptedName = Uint8Array.from(
            Buffer.from("00082440680108202000202020202000", "hex"),
        );
        expect(isTaggedBluejayName(new TextEncoder().encode("Bluejay         "))).toBe(true);
        expect(isTaggedBluejayName(new TextEncoder().encode("Bluejay (v0.19) "))).toBe(true);
        expect(isTaggedBluejayName(hardwareCorruptedName)).toBe(false);
        expect(isTaggedBluejayName(new TextEncoder().encode("BLHeli_S        "))).toBe(false);

        expect(isCorruptBluejayName(hardwareCorruptedName)).toBe(true);
        expect(isCorruptBluejayName(new Uint8Array([1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(true);
        expect(isCorruptBluejayName(new Uint8Array(16).fill(255))).toBe(false);
        expect(isCorruptBluejayName(new Uint8Array(16))).toBe(false);
        expect(isCorruptBluejayName(new TextEncoder().encode("BLHeli_S        "))).toBe(false);
        expect(isCorruptBluejayName(new TextEncoder().encode("Bluejay         "))).toBe(false);
    });
});
