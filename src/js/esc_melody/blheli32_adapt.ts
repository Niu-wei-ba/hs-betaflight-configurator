import { durationMs, encodeBlheli32Melody, type Melody, type Note } from "./blheli32_melody";

export interface AdaptOptions {
    allowOctaveShift?: boolean;
    allowTempoChange?: boolean;
    crop?: { startSeconds: number; durationSeconds: number };
}
export type AdaptResult =
    | { ok: false; errors: string[] }
    | {
          ok: true;
          tracks: Melody[];
          octaves: number;
          tempoScale: number;
          sourceBpms: number[];
          targetBpms: number[];
          usedBytes: number[];
          sourceDurationMs: number;
          durationMs: number;
          cropped: boolean;
          sourceNoteCount: number;
          keptNoteCount: number;
          maxTimingErrorMs: number;
          warnings: string[];
      };

const MAX_DURATION_MS = 120000;
const MAX_TIMING_ERROR_MS = 30;
const automaticResults = new Map<string, AdaptResult>();

/** Automatic use never crops music or changes an already encodable arrangement. */
export function autoAdaptBlheli32Tracks(source: Melody[], targetVoices: number[]) {
    if (!targetVoices.length) return { tracks: source, adapted: false, errors: [] as string[] };
    try {
        targetVoices.forEach((index) => encodeBlheli32Melody(source[index]));
        return { tracks: source, adapted: false, errors: [] as string[] };
    } catch {
        const key = JSON.stringify(source);
        let result = automaticResults.get(key);
        if (!result) {
            result = adaptBlheli32Tracks(source);
            if (automaticResults.size >= 128) automaticResults.delete(automaticResults.keys().next().value!);
            automaticResults.set(key, result);
        }
        if (result.ok) {
            const tracks = result.tracks.map((track, voice) => {
                const tones = source[voice].notes.filter(isTone);
                let tone = 0;
                return {
                    ...track,
                    notes: track.notes.map((note) => ({
                        ...note,
                        id: isTone(note) ? tones[tone++]?.id || note.id : note.id,
                    })),
                };
            });
            return { tracks, adapted: true, errors: [] as string[], result };
        }
        return {
            tracks: source,
            adapted: false,
            errors: result.errors.map(
                (error) => `${error.split("请")[0]}无法完整适配 BL32，保留原曲，不裁剪或删减音符。`,
            ),
        };
    }
}

const fail = (message: string): AdaptResult => ({ ok: false, errors: [message] });
const isTone = (note: Note) => !note.rest && note.midi !== null;
const endMs = (track: Melody) =>
    (track.waitMs || 0) + (Math.max(0, ...track.notes.map((note) => note.start + note.duration)) * 60000) / track.bpm;
const copy = (track: Melody): Melody => ({
    ...track,
    blheli32: undefined,
    notes: track.notes.map((note) => ({ ...note })),
});

function cropTracks(tracks: Melody[], startMs: number, lengthMs: number): Melody[] {
    return tracks.map((track) => {
        const beatMs = 60000 / track.bpm;
        const notes = track.notes.flatMap((note) => {
            const start = (track.waitMs || 0) + note.start * beatMs;
            const left = Math.max(start, startMs);
            const right = Math.min(start + note.duration * beatMs, startMs + lengthMs);
            return right > left
                ? [{ ...note, start: (left - startMs) / beatMs, duration: (right - left) / beatMs }]
                : [];
        });
        const tail = Math.max(0, ...notes.map((note) => note.start + note.duration));
        if (tail * beatMs < lengthMs - 0.001)
            notes.push({
                id: "adapt-trailing-rest",
                midi: null,
                rest: true,
                start: tail,
                duration: lengthMs / beatMs - tail,
            });
        return { ...track, waitMs: 0, notes };
    });
}

function mergeRests(track: Melody): Melody {
    const notes: Note[] = [];
    for (const note of track.notes) {
        const previous = notes.at(-1);
        if (
            !isTone(note) &&
            previous &&
            !isTone(previous) &&
            Math.abs(note.start - previous.start - previous.duration) < 0.000001
        )
            previous.duration += note.duration;
        else notes.push({ ...note });
    }
    return { ...track, notes };
}

function timelineError(expected: Melody, actual: Melody): number {
    const before = expected.notes.filter(isTone);
    const after = actual.notes.filter(isTone);
    if (before.length !== after.length) return Infinity;
    let error = Math.abs(endMs(expected) - endMs(actual));
    before.forEach((note, index) => {
        const rendered = after[index];
        if (note.midi !== rendered.midi) {
            error = Infinity;
            return;
        }
        for (const tail of [0, 1])
            error = Math.max(
                error,
                Math.abs(
                    (expected.waitMs || 0) +
                        ((note.start + tail * note.duration) * 60000) / expected.bpm -
                        ((actual.waitMs || 0) + ((rendered.start + tail * rendered.duration) * 60000) / actual.bpm),
                ),
            );
    });
    return error;
}

/** Generates a separate arrangement. Pitch shift, tempo scale and native timing grid are shared by all voices. */
export function adaptBlheli32Tracks(source: Melody[], options: AdaptOptions = {}): AdaptResult {
    if (!source.length || source.length > 8) return fail("需要 1–8 个声部。");
    for (const track of source) {
        if (
            !Number.isFinite(track.bpm) ||
            track.bpm <= 0 ||
            !Array.isArray(track.notes) ||
            !Number.isFinite(track.waitMs ?? 0) ||
            (track.waitMs ?? 0) < 0
        )
            return fail("原曲 BPM 或启动等待无效。");
        let cursor = 0;
        for (const note of track.notes) {
            if (
                !Number.isFinite(note.start) ||
                !Number.isFinite(note.duration) ||
                note.start < cursor - 0.000001 ||
                note.duration <= 0 ||
                (isTone(note) && (!Number.isInteger(note.midi) || note.midi! < 0 || note.midi! > 127))
            )
                return fail("原曲包含重叠或无效音符，请先在编曲中修正。");
            cursor = note.start + note.duration;
        }
    }
    const sourceDurationMs = Math.max(...source.map(endMs));
    const sourceNoteCount = source.reduce((count, track) => count + track.notes.filter(isTone).length, 0);
    if (!options.crop && source.every((track) => track.blheli32)) {
        try {
            const encoded = source.map((track) => encodeBlheli32Melody(track));
            if (
                encoded.every(
                    (item, index) =>
                        item.mode === source[index].blheli32!.mode &&
                        item.bytes.every((byte, byteIndex) => byte === source[index].blheli32!.bytes[byteIndex]),
                ) &&
                encoded.every((item) => item.durationMs <= MAX_DURATION_MS)
            ) {
                return {
                    ok: true,
                    tracks: encoded.map((item, voice) => ({
                        ...item.playbackMelody,
                        key: source[voice].key || "C",
                        notes: item.playbackMelody.notes.map((note, index) => ({
                            ...note,
                            id: `adapt-${voice}-${index}`,
                        })),
                    })),
                    octaves: 0,
                    tempoScale: 1,
                    sourceBpms: source.map((track) => track.bpm),
                    targetBpms: source.map((track) => track.bpm),
                    usedBytes: encoded.map((item) => item.encodedLength),
                    sourceDurationMs,
                    durationMs: Math.max(...encoded.map((item) => item.durationMs)),
                    cropped: false,
                    sourceNoteCount,
                    keptNoteCount: sourceNoteCount,
                    maxTimingErrorMs: 0,
                    warnings: [],
                };
            }
        } catch {
            /* Edited native data goes through adaptation below. */
        }
    }
    let tracks = source.map(copy);
    if (options.crop) {
        const { startSeconds, durationSeconds } = options.crop;
        if (
            !Number.isFinite(startSeconds) ||
            !Number.isFinite(durationSeconds) ||
            startSeconds < 0 ||
            durationSeconds <= 0 ||
            startSeconds * 1000 >= sourceDurationMs ||
            durationSeconds * 1000 > MAX_DURATION_MS
        )
            return fail("片段起点须在原曲内，片段时长须大于 0 且不超过 120 秒。");
        tracks = cropTracks(
            tracks,
            startSeconds * 1000,
            Math.min(durationSeconds * 1000, sourceDurationMs - startSeconds * 1000),
        );
    }
    tracks = tracks.map(mergeRests);
    const pitches = tracks.flatMap((track) => track.notes.filter(isTone).map((note) => note.midi!));
    if (!pitches.length) return fail("所选范围没有可播放音符，请重新选择片段。");
    if (tracks.some((track) => track.notes.filter(isTone).length > 48))
        return fail("至少一个声部超过 48 个有声音符；请启用截取片段，或在编曲中手动简化。不会自动删音符。");
    const shifts = (
        options.allowOctaveShift === false
            ? [0]
            : [0, ...Array.from({ length: 9 }, (_, i) => [(i + 1) * 12, -(i + 1) * 12]).flat()]
    ).filter((shift) => pitches.every((pitch) => pitch + shift >= 60 && pitch + shift <= 107));
    if (!shifts.length)
        return fail(
            options.allowOctaveShift === false
                ? "原曲超出 C4–B7，请允许整体升降八度或手动调整音域。"
                : "整曲音域无法通过统一八度移调放入 C4–B7，请截取片段或手动简化。不会折叠单个音符。",
        );

    const factors = new Set([1]);
    if (options.allowTempoChange !== false) {
        for (const bpm of [
            25, 60, 80, 90, 100, 110, 120, 125, 128, 150, 160, 180, 200, 240, 300, 360, 480, 600, 720, 900,
        ])
            factors.add(bpm / tracks[0].bpm);
        for (const track of tracks) {
            const durations = new Map<number, number>();
            track.notes
                .filter(isTone)
                .forEach((note) => durations.set(note.duration, (durations.get(note.duration) || 0) + 1));
            for (const [beats] of [...durations].sort((a, b) => b[1] - a[1]).slice(0, 4))
                for (let length = 1; length <= 15; length++)
                    for (const denominator of [1, 2, 4, 8])
                        factors.add((beats * 60000) / track.bpm / durationMs(denominator, length));
        }
    }
    const orderedFactors = [...factors]
        .filter(
            (factor) =>
                factor >= 0.25 &&
                factor <= 4 &&
                tracks.every((track) => track.bpm * factor >= 25 && track.bpm * factor <= 900),
        )
        .sort((a, b) => Math.abs(Math.log(a)) - Math.abs(Math.log(b)));
    let best: Extract<AdaptResult, { ok: true }> | null = null;
    let bestScore = Infinity;
    const toneDurations = [
        ...new Set(
            tracks.flatMap((track) => track.notes.filter(isTone).map((note) => (note.duration * 60000) / track.bpm)),
        ),
    ];
    for (const factor of orderedFactors) {
        // Any larger tempo change cannot improve an already valid closer-tempo result.
        if (best && Math.abs(Math.log(factor)) * 100 > bestScore) break;
        const lengths = Array.from({ length: 15 }, (_, i) => i + 1).filter((length) =>
            toneDurations.every((duration) =>
                [1, 2, 4, 8].some(
                    (denominator) =>
                        Math.abs(durationMs(denominator, length) - duration / factor) <=
                        Math.max(1, (duration / factor) * 0.05),
                ),
            ),
        );
        if (!lengths.length) continue;
        // All permitted octave shifts have identical timing; the nearest one has the lowest score.
        for (const shift of shifts.slice(0, 1)) {
            const changed = tracks.map((track) => ({
                ...track,
                bpm: track.bpm * factor,
                waitMs: (track.waitMs || 0) / factor,
                notes: track.notes.map((note) => ({ ...note, midi: isTone(note) ? note.midi! + shift : null })),
            }));
            for (const length of lengths) {
                try {
                    const encoded = changed.map((track) => encodeBlheli32Melody(track, { length }));
                    const rendered = encoded.map((item, voice) => ({
                        ...item.playbackMelody,
                        key: changed[voice].key || "C",
                        notes: item.playbackMelody.notes.map((note, index) => ({
                            ...note,
                            id: `adapt-${voice}-${index}`,
                        })),
                    }));
                    const maxTimingErrorMs = Math.max(...changed.map((track, i) => timelineError(track, rendered[i])));
                    const duration = Math.max(...rendered.map(endMs));
                    if (maxTimingErrorMs > MAX_TIMING_ERROR_MS || duration > MAX_DURATION_MS) continue;
                    const score = Math.abs(Math.log(factor)) * 100 + Math.abs(shift) / 120 + maxTimingErrorMs / 1000;
                    if (score >= bestScore) continue;
                    bestScore = score;
                    best = {
                        ok: true,
                        tracks: rendered,
                        octaves: shift / 12,
                        tempoScale: factor,
                        sourceBpms: source.map((track) => track.bpm),
                        targetBpms: changed.map((track) => track.bpm),
                        usedBytes: encoded.map((item) => item.encodedLength),
                        sourceDurationMs,
                        durationMs: duration,
                        cropped: Boolean(options.crop),
                        sourceNoteCount,
                        keptNoteCount: pitches.length,
                        maxTimingErrorMs,
                        warnings: [...new Set(encoded.flatMap((item) => item.warnings))],
                    };
                } catch {
                    /* Other timing grids may still encode every voice. */
                }
            }
        }
    }
    return (
        best || fail("无法在保留所选音符、统一声部速度及 48 事件限制下完成适配。请截取更短片段，或在编曲中简化节奏。")
    );
}
