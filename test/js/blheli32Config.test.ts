import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    BLHELI32_MELODY_OFFSET,
    BLHELI32_MODE_OFFSET,
    BLHELI32_SETTINGS_LENGTH,
    BLHELI32_SETTINGS_OFFSET,
    BLHELI32_WIRE_LENGTH,
    decodeBlheli32Settings,
    encodeBlheli32Settings,
    parseBlheli32Settings,
} from "../../src/js/esc_melody/blheli32_config.ts";

const fixture = (name: string) =>
    new Uint8Array(readFileSync(`test/fixtures/esc_melody/blheli32-FPV32-32.10-${name}.bin`));
const raw = fixture("raw-1");
const rawRepeat = fixture("raw-2");
const plain = fixture("decoded-1");
const prefixes = fixture("prefixes-1");
const device = { signature: 0x1506, inputPin: 0x6e, interfaceMode: 4 };

afterEach(() => vi.unstubAllGlobals());

describe("BLHeli_32 verified AT32F421 configuration codec", () => {
    it("decodes both independently captured read blocks to the saved official configuration", () => {
        expect(raw).not.toEqual(rawRepeat);
        expect(decodeBlheli32Settings(raw)).toEqual(plain);
        expect(decodeBlheli32Settings(rawRepeat)).toEqual(plain);
        expect(plain).toEqual(fixture("decoded-2"));
        expect(Array.from(plain.slice(0, 3))).toEqual([32, 100, 48]);
        expect(new TextDecoder().decode(plain.slice(0x60, 0x80)).trim()).toBe("#BLHeli_32*AT32F421#");
    });

    it("reproduces exact captured ciphertext using its independently recovered random prefixes", () => {
        const getRandomValues = vi.fn((target: Uint8Array) => {
            target.set(prefixes);
            return target;
        });
        vi.stubGlobal("crypto", { getRandomValues });
        expect(encodeBlheli32Settings(plain)).toEqual(raw);
        expect(getRandomValues).toHaveBeenCalledTimes(1);
        expect(getRandomValues.mock.calls[0][0]).toHaveLength(64);
    });

    it("roundtrips every logical position without mutating the input or unrelated settings", () => {
        const changed = plain.slice();
        changed[BLHELI32_MODE_OFFSET] = 0x80;
        for (let index = 0; index < 48; index += 1) changed[BLHELI32_MELODY_OFFSET + index] = index;
        const before = changed.slice();
        vi.stubGlobal("crypto", {
            getRandomValues: (target: Uint8Array) => {
                target.fill(0xa5);
                return target;
            },
        });
        const encoded = encodeBlheli32Settings(changed);
        expect(encoded).toHaveLength(256);
        expect(decodeBlheli32Settings(encoded)).toEqual(before);
        expect(changed).toEqual(before);
        expect(decodeBlheli32Settings(encoded).slice(0x40, 0x90)).toEqual(plain.slice(0x40, 0x90));
        const allBytes = Uint8Array.from({ length: 192 }, (_, index) => (index * 73) & 255);
        expect(decodeBlheli32Settings(encodeBlheli32Settings(allBytes))).toEqual(allBytes);
    });

    it("uses each buffer view's own byte offset", () => {
        const padded = new Uint8Array(260);
        padded.set(raw, 3);
        expect(decodeBlheli32Settings(padded.subarray(3, 259))).toEqual(plain);
    });

    it("rejects incomplete or extra bytes instead of padding or guessing a key branch", () => {
        for (const length of [0, 1, 192, 255, 257, 512]) {
            expect(() => decodeBlheli32Settings(new Uint8Array(length))).toThrow("exactly 256 bytes");
        }
        for (const length of [0, 1, 191, 193, 256]) {
            expect(() => encodeBlheli32Settings(new Uint8Array(length))).toThrow("exactly 192 bytes");
            expect(() => parseBlheli32Settings(new Uint8Array(length), device)).toThrow("exactly 192 bytes");
        }
    });

    it("fails encoding explicitly if a secure random source is unavailable", () => {
        vi.stubGlobal("crypto", undefined);
        expect(() => encodeBlheli32Settings(plain)).toThrow("Secure random generation is unavailable");
        vi.stubGlobal("crypto", {});
        expect(() => encodeBlheli32Settings(plain)).toThrow("Secure random generation is unavailable");
    });

    it("exposes the verified settings and independent melody slices", () => {
        const result = parseBlheli32Settings(plain, device);
        expect(result).toMatchObject({
            firmwareType: "BLHeli32",
            version: "32.10",
            versionBytes: [32, 100, 48],
            layout: "#FPV32#",
            mcu: "#BLHeli_32*AT32F421#",
            name: "",
            writable: true,
            reason: "",
            melodyMode: 255,
        });
        expect(result.melodyData).toEqual(new Uint8Array(48).fill(255));
        result.melodyData.fill(0);
        result.settings.fill(0);
        expect(plain).toEqual(fixture("decoded-1"));
        expect(BLHELI32_SETTINGS_OFFSET).toBe(0x7c00);
        expect(BLHELI32_SETTINGS_LENGTH).toBe(192);
        expect(BLHELI32_WIRE_LENGTH).toBe(256);
    });

    it("blocks any unknown signature, marker, interface, version or identity field", () => {
        for (const identity of [
            {},
            { ...device, signature: 0x3506 },
            { ...device, signature: 0x1f06 },
            { ...device, inputPin: 0 },
            { ...device, interfaceMode: 1 },
        ]) {
            const result = parseBlheli32Settings(plain, identity);
            expect(result.writable).toBe(false);
            expect(result.reason).not.toBe("");
        }
        for (const offset of [0, 1, 2, 0x40, 0x46, 0x5f, 0x60, 0x71, 0x7f]) {
            const changed = plain.slice();
            changed[offset] ^= 1;
            const result = parseBlheli32Settings(changed, device);
            expect(result.writable, `offset 0x${offset.toString(16)}`).toBe(false);
            expect(result.reason).not.toBe("");
        }
        expect(parseBlheli32Settings(new Uint8Array(192).fill(255), device).writable).toBe(false);
        const damaged = raw.slice();
        damaged[0] ^= 1;
        expect(parseBlheli32Settings(decodeBlheli32Settings(damaged), device).writable).toBe(false);
    });
});
