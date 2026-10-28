import { describe, expect, it } from "vitest";
import { decodeBlheli32Melody, encodeBlheli32Melody } from "../../src/js/esc_melody/blheli32_melody.ts";
import {
    cloneMelody,
    decodeFirmwareMelody,
    encodeFirmwareMelody,
    validateMelody,
} from "../../src/js/esc_melody/melody.js";
import {
    createMelodyDraft,
    createMelodyDraftPackage,
    parseMelodyDraftPackage,
    loadMelodyDrafts,
    ESC_MELODY_DRAFTS_KEY,
} from "../../src/js/esc_melody/drafts.js";
const bytes = (...values: number[]) => {
    const b = new Uint8Array(48).fill(255);
    b.set(values);
    return b;
};

describe("BLHeli32 native music", () => {
    it("requires explicit Music Off and never equates a cleared editor with disabling music", () => {
        expect(() => encodeBlheli32Melody({ bpm: 120, notes: [] })).toThrow("至少一个事件");
        const off = encodeBlheli32Melody({ bpm: 120, notes: [], musicOff: true });
        expect(off.mode).toBe(255);
        expect(off.bytes).toEqual(bytes());
        expect(off.durationMs).toBe(0);
        expect(off.playbackMelody.notes).toEqual([]);
        expect(validateMelody({ bpm: 120, notes: [], musicOff: true }, { firmware: "bluejay" }).valid).toBe(false);
    });
    it("retains explicit off in drafts, distinguishes it from empty and rejects mismatched capacities", () => {
        const map = new Map();
        const storage = {
            getItem: (key: string) => map.get(key) || null,
            setItem: (key: string, value: string) => map.set(key, value),
        };
        const draft = createMelodyDraft({ name: "off", melody: { bpm: 120, notes: [], musicOff: true } }, storage);
        const packageValue = createMelodyDraftPackage([draft]);
        expect(packageValue.version).toBe(2);
        const imported = parseMelodyDraftPackage(JSON.stringify(packageValue)).drafts[0].melody;
        expect(encodeFirmwareMelody(imported, "blheli32").mode).toBe(255);
        expect(validateMelody(imported, { firmware: "blheli32" }).durationMs).toBe(0);
        expect(validateMelody(imported, { firmware: "blheli32", capacity: 128 }).valid).toBe(false);
    });
    it("migrates legacy drafts on save while keeping old storage intact and still imports v1 packages", () => {
        const legacy = [{ id: "old", name: "old", melody: { bpm: 120, notes: [] } }];
        const map = new Map([["betaflight.esc-melody.drafts.v1", JSON.stringify(legacy)]]);
        const storage = {
            getItem: (key: string) => map.get(key) ?? null,
            setItem: (key: string, value: string) => map.set(key, value),
        };
        expect(loadMelodyDrafts(storage)).toHaveLength(1);
        createMelodyDraft({ name: "off", melody: { bpm: 120, notes: [], musicOff: true } }, storage);
        expect(JSON.parse(map.get(ESC_MELODY_DRAFTS_KEY)!)).toHaveLength(2);
        expect(JSON.parse(map.get("betaflight.esc-melody.drafts.v1")!)).toEqual(legacy);
        const packageValue = { ...createMelodyDraftPackage(legacy), version: 1 };
        expect(parseMelodyDraftPackage(JSON.stringify(packageValue)).drafts).toHaveLength(1);
        map.set(ESC_MELODY_DRAFTS_KEY, "[]");
        expect(loadMelodyDrafts(storage)).toEqual([]);
    });
    it("changes pitches in a full native interval tune without expanding its rests", () => {
        for (const mode of [0x08, 0x81, 0x8f, 0xfe]) {
            const source = bytes(...new Array(48).fill(0xc0));
            const melody = decodeBlheli32Melody(source, { mode })!;
            melody.notes[0].midi = 107;
            const encoded = encodeBlheli32Melody(melody);
            expect(encoded.mode).toBe(mode);
            expect(encoded.encodedLength).toBe(48);
            expect(encoded.bytes[0]).toBe(0xfb);
            expect(encoded.bytes.slice(1)).toEqual(source.slice(1));
            expect(encoded.playbackMelody.notes.map(({ start, duration }) => [start, duration])).toEqual(
                melody.notes.map(({ start, duration }) => [start, duration]),
            );
        }
    });
    it("retains native rests and their intervals through pitch edits and draft roundtrips", () => {
        const melody = cloneMelody(decodeBlheli32Melody(bytes(0x3d, 0xc0, 0xfc, 0xc2), { mode: 0x8f })!);
        melody.notes.find((note) => note.midi === 60)!.midi = 74;
        const encoded = encodeBlheli32Melody(cloneMelody(melody));
        expect(encoded.mode).toBe(0x8f);
        expect(encoded.bytes).toEqual(bytes(0x3d, 0xd2, 0xfc, 0xc2));
    });
    it("does not reuse native interval timing after timing edits or forged metadata", () => {
        const melody = decodeBlheli32Melody(bytes(0xc0), { mode: 0x81 })!;
        melody.notes[0].duration = 0.5;
        melody.notes[1].start = 0.5;
        const encoded = encodeBlheli32Melody(melody);
        expect(encoded.mode & 15).toBe(0);
        expect(encoded.warnings.join(" ")).toContain("Interval");
        const forged = decodeBlheli32Melody(bytes(0xc0), { mode: 0x81 })!;
        forged.blheli32!.bytes[0] = 0xc2;
        forged.notes[0].midi = 61;
        expect(encodeBlheli32Melody(forged).mode & 15).toBe(0);
    });
    it("warns when a 60 ms tone is accepted as 62 ms", () => {
        const encoded = encodeBlheli32Melody({ bpm: 120, notes: [{ midi: 60, start: 0, duration: 0.12 }] });
        expect(encoded.warnings.join(" ")).toContain("2.0 ms");
    });
    it("retains native intervals and short rests through draft export/import", () => {
        const source = bytes(0x3d, 0xfb);
        const melody = decodeBlheli32Melody(source, { mode: 0x8f })!;
        const map = new Map();
        const storage = {
            getItem: (key: string) => map.get(key) || null,
            setItem: (key: string, value: string) => map.set(key, value),
        };
        const draft = createMelodyDraft({ name: "native", melody }, storage);
        const imported = parseMelodyDraftPackage(JSON.stringify(createMelodyDraftPackage([draft]))).drafts[0].melody;
        const encoded = encodeFirmwareMelody(imported, "blheli32", 48);
        expect(encoded.mode).toBe(0x8f);
        expect(encoded.bytes).toEqual(source);
        expect(imported.notes[0].duration).toBe(0.006);
    });
    it("decodes independent official table values with neutral length and real pitches", () => {
        const melody = decodeBlheli32Melody(bytes(0x00, 0x40, 0x80, 0xc0, 0xfb), { mode: 0x80 })!;
        expect(melody.notes.map((n) => n.midi)).toEqual([60, 60, 60, 60, 107]);
        expect(melody.notes.map((n) => n.duration * 500)).toEqual([62, 125, 250, 500, 500]);
        expect(melody.notes[4].start * 500).toBe(937);
    });
    it("decodes both rest ranges without clamping sub-64th rests", () => {
        const m = decodeBlheli32Melody(bytes(0x3d, 0x7d, 0xbd, 0xfd, 0x3c, 0x7c, 0xbc, 0xfc), { mode: 0x80 })!;
        expect(m.notes.map((n) => n.duration * 500)).toEqual([3, 7, 15, 31, 62, 125, 250, 500]);
        expect(m.notes.every((n) => n.rest)).toBe(true);
        expect(cloneMelody(m).notes[0].duration).toBe(0.006);
    });
    it("preserves native length-zero, interval and exact full 48-byte arrays through clone and re-encode", () => {
        for (const mode of [0x08, 0x80, 0x8f, 0xfe]) {
            const source = bytes(...new Array(48).fill(0xc0));
            const loaded = decodeBlheli32Melody(source, { mode })!;
            const m = cloneMelody(loaded);
            const encoded = encodeFirmwareMelody(m, "blheli32", 48);
            expect(encoded.bytes).toEqual(source);
            expect(encoded.mode).toBe(mode);
            expect(encoded.encodedLength).toBe(48);
        }
    });
    it("encodes quarter and eighth notes into native values, not a Bluejay header", () => {
        const encoded = encodeFirmwareMelody(
            {
                bpm: 120,
                notes: [
                    { midi: 60, start: 0, duration: 1 },
                    { midi: 74, start: 1, duration: 0.5 },
                ],
            },
            "blheli32",
            48,
        );
        expect(encoded.mode).toBe(0x80);
        expect(encoded.bytes.slice(0, 3)).toEqual(Uint8Array.of(0xc0, 0x92, 0xff));
        expect(decodeFirmwareMelody(encoded.bytes, { firmware: "blheli32", mode: encoded.mode })!.notes[1].midi).toBe(
            74,
        );
    });
    it("rejects 49 events rather than truncating, preserves 48", () => {
        const song = (n: number) => ({
            bpm: 120,
            notes: Array.from({ length: n }, (_, i) => ({ midi: 60, start: i, duration: 1 })),
        });
        expect(encodeBlheli32Melody(song(48)).encodedLength).toBe(48);
        expect(() => encodeBlheli32Melody(song(49))).toThrow("48");
    });
    it("encodes startup wait and timeline gaps as native rests", () => {
        const result = encodeBlheli32Melody({ bpm: 120, waitMs: 500, notes: [{ midi: 60, start: 1, duration: 1 }] });
        expect(result.bytes.slice(0, 4)).toEqual(Uint8Array.of(0xfc, 0xfc, 0xc0, 255));
        expect(result.durationMs).toBe(1500);
    });
    it("does not silently transpose, resolve overlaps, or accept impossible durations", () => {
        for (const midi of [59, 108, 60.2, NaN]) {
            expect(
                validateMelody({ bpm: 120, notes: [{ midi, start: 0, duration: 1 }] }, { firmware: "blheli32" }).valid,
            ).toBe(false);
        }
        expect(() => encodeBlheli32Melody({ bpm: 120, notes: [{ midi: 60, start: 0, duration: 8 }] })).toThrow();
        expect(() =>
            encodeBlheli32Melody({
                bpm: 120,
                notes: [
                    { midi: 60, start: 0, duration: 1 },
                    { midi: 61, start: 0.5, duration: 1 },
                ],
            }),
        ).toThrow("重叠");
    });
    it("reports discrete timing deviation and returns the actual preview", () => {
        const r = encodeBlheli32Melody({
            bpm: 125,
            notes: [
                { midi: 60, start: 0, duration: 0.125 },
                { midi: 62, start: 0.125, duration: 0.25 },
                { midi: 64, start: 0.375, duration: 0.5 },
            ],
        });
        expect(r.warnings.length).toBeGreaterThan(0);
        expect(r.playbackMelody.bpm).toBe(120);
        expect(r.playbackMelody.notes[0].duration * 500).toBe(62);
    });
    it("rejects hidden bytes, reserved opcodes and zero-duration rest, and reads disabled music as empty", () => {
        expect(decodeBlheli32Melody(bytes(0xc0), { mode: 255 })).toBeNull();
        for (const b of [bytes(0xff, 0xc0), bytes(0x3e), bytes(0x0c)])
            expect(() => decodeBlheli32Melody(b, { mode: 0x80 })).toThrow();
        expect(() => decodeBlheli32Melody(bytes(0x3d), { mode: 0x10 })).toThrow("零");
    });
    it("ignores stale or forged raw metadata after an edit", () => {
        const m = decodeBlheli32Melody(bytes(0xc0), { mode: 0x80 })!;
        m.notes[0].midi = 74;
        expect(encodeBlheli32Melody(m).bytes[0]).toBe(0xd2);
        const loaded = decodeBlheli32Melody(bytes(0xc0), { mode: 0x80 })!;
        loaded.blheli32!.bytes[0] = 0xcb;
        expect(encodeBlheli32Melody(loaded).bytes[0]).toBe(0xc0);
    });
});
