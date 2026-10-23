import { describe, expect, it } from "vitest";
import { adaptBlheli32Tracks } from "../../src/js/esc_melody/blheli32_adapt";
import { decodeBlheli32Melody, encodeBlheli32Melody, type Melody } from "../../src/js/esc_melody/blheli32_melody";
import { PRESET_MELODIES } from "../../src/js/esc_melody/melody.js";
const track = (midi = 60, count = 4): Melody => ({
    name: "original",
    bpm: 120,
    waitMs: 0,
    notes: Array.from({ length: count }, (_, i) => ({ midi, start: i * 0.5, duration: 0.5 })),
});

describe("BL32 explicit adaptation", () => {
    it("keeps source immutable and shifts all voices together while retaining every tone", () => {
        const source = [
            { ...track(48), key: "D" },
            { ...track(72), key: "D" },
        ];
        const before = JSON.stringify(source);
        const result = adaptBlheli32Tracks(source);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.octaves).toBe(1);
        expect(result.tempoScale).toBe(1);
        expect(result.tracks.map((t) => t.key)).toEqual(["D", "D"]);
        expect(result.keptNoteCount).toBe(8);
        expect(result.tracks.map((t) => t.notes.filter((n) => !n.rest).map((n) => n.midi))).toEqual([
            [60, 60, 60, 60],
            [84, 84, 84, 84],
        ]);
        expect(new Set(result.tracks.flatMap((t) => t.notes.map((n) => n.id))).size).toBe(
            result.tracks.flatMap((t) => t.notes).length,
        );
        for (const converted of result.tracks)
            expect(encodeBlheli32Melody(converted).encodedLength).toBeLessThanOrEqual(48);
        expect(JSON.stringify(source)).toBe(before);
        expect(adaptBlheli32Tracks(source, { allowOctaveShift: false }).ok).toBe(false);
    });
    it("adapts an actual four-voice library song with one tempo scale and native length grid", () => {
        const preset = PRESET_MELODIES.find((p) => p.name === "AC/DC - Back in Black")!;
        const source = preset.trackMelodies;
        const before = JSON.stringify(source);
        const result = adaptBlheli32Tracks(source);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.tracks).toHaveLength(4);
        expect(new Set(result.tracks.map((t) => t.blheli32!.mode >>> 4)).size).toBe(1);
        result.targetBpms.forEach((bpm, index) =>
            expect(bpm / result.sourceBpms[index]).toBeCloseTo(result.tempoScale),
        );
        expect(result.maxTimingErrorMs).toBeLessThanOrEqual(30);
        result.tracks.forEach((t, i) =>
            expect(t.notes.filter((n) => !n.rest)).toHaveLength(source[i].notes.filter((n) => !n.rest).length),
        );
        expect(JSON.stringify(source)).toBe(before);
    });
    it("does not truncate an oversized song unless the user selects a segment", () => {
        const source = [track(60, 60), track(72, 60)];
        const rejected = adaptBlheli32Tracks(source);
        expect(rejected.ok).toBe(false);
        if (!rejected.ok) expect(rejected.errors.join()).toContain("48");
        const result = adaptBlheli32Tracks(source, { crop: { startSeconds: 2, durationSeconds: 4 } });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.cropped).toBe(true);
        expect(result.sourceNoteCount).toBe(120);
        expect(result.keptNoteCount).toBe(32);
        expect(result.tracks.map((t) => t.notes.filter((n) => !n.rest).length)).toEqual([16, 16]);
        expect(source.map((t) => t.notes.length)).toEqual([60, 60]);
    });
    it("clips crossing notes and keeps a silent voice on the same selected time window", () => {
        const source = [
            { ...track(), waitMs: 500, notes: [{ midi: 60, start: 0, duration: 2 }] },
            { ...track(), waitMs: 500, notes: [{ midi: 72, start: 3, duration: 1 }] },
        ];
        const result = adaptBlheli32Tracks(source, { crop: { startSeconds: 0.75, durationSeconds: 0.5 } });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.tracks[0].notes[0].start).toBe(0);
        expect(result.tracks[0].notes[0].duration).toBe(1);
        expect(result.tracks[1].notes.every((n) => n.rest)).toBe(true);
        expect(result.durationMs).toBe(500);
    });
    it("preserves a full native array with intervals instead of expanding it beyond capacity", () => {
        const native = decodeBlheli32Melody(new Uint8Array(48).fill(0xc0), { mode: 0x8f })!;
        const result = adaptBlheli32Tracks([native]);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(encodeBlheli32Melody(result.tracks[0]).bytes).toEqual(new Uint8Array(48).fill(0xc0));
        expect(encodeBlheli32Melody(result.tracks[0]).mode).toBe(0x8f);
    });
    it("rejects overlap, invalid windows and excessive pitch span without silently repairing them", () => {
        expect(
            adaptBlheli32Tracks([
                {
                    ...track(),
                    notes: [
                        { midi: 60, start: 0, duration: 2 },
                        { midi: 62, start: 1, duration: 1 },
                    ],
                },
            ]).ok,
        ).toBe(false);
        for (const crop of [
            { startSeconds: -1, durationSeconds: 1 },
            { startSeconds: 100, durationSeconds: 1 },
            { startSeconds: 0, durationSeconds: NaN },
        ])
            expect(adaptBlheli32Tracks([track()], { crop }).ok).toBe(false);
        expect(adaptBlheli32Tracks([track(48), track(108)]).ok).toBe(false);
        expect(adaptBlheli32Tracks([{ ...track(), waitMs: NaN }]).ok).toBe(false);
    });
    it("distinguishes a timing failure from actual tone capacity overflow", () => {
        expect(() => encodeBlheli32Melody({ bpm: 120, notes: [{ midi: 60, start: 0, duration: 8 }] })).toThrow("音长");
        expect(() => encodeBlheli32Melody(track(60, 49))).toThrow("48");
    });
});
