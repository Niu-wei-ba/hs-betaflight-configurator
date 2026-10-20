export const BLHELI32_MELODY_CAPACITY = 48;
const TONE_DENOMINATORS = [8, 4, 2, 1];
const REST_DENOMINATORS = [128, 64, 32, 16, 8, 4, 2, 1];

interface Note {
    id?: string;
    midi: number | null;
    start: number;
    duration: number;
    rest?: boolean;
}
interface Melody {
    name?: string;
    bpm: number;
    waitMs?: number;
    key?: string;
    notes: Note[];
    blheli32?: { mode: number; bytes: number[]; fingerprint: string };
}

function fingerprint(melody: Melody): string {
    return JSON.stringify({
        bpm: melody.bpm,
        waitMs: melody.waitMs || 0,
        notes: melody.notes.map(({ midi, start, duration, rest }) => ({ midi, start, duration, rest: Boolean(rest) })),
    });
}

// Official parser 0x100570330: integer 500/denominator, scaled by max(Length,1)/8.
function durationMs(denominator: number, length: number): number {
    return Math.floor((Math.floor(500 / denominator) * Math.max(length, 1)) / 8);
}

export function decodeBlheli32Melody(bytes: Uint8Array, { mode, name = "BLHeli_32" }: { mode: number; name?: string }) {
    if (bytes.length !== 48 || !Number.isInteger(mode) || mode < 0 || mode > 255) {
        throw new Error("BLHeli_32 音符数组或音乐模式无效。");
    }
    if (mode === 255 || bytes.every((byte) => byte === 255)) return null;
    const length = mode >>> 4;
    const interval = mode & 15;
    const notes: Note[] = [];
    let cursorMs = 0;
    let ended = false;
    const append = (midi: number | null, milliseconds: number) => {
        if (milliseconds <= 0) return;
        notes.push({
            id: `blheli32-${notes.length}`,
            midi,
            rest: midi === null,
            start: cursorMs / 500,
            duration: milliseconds / 500,
        });
        cursorMs += milliseconds;
    };
    for (const byte of bytes) {
        if (byte === 255) {
            ended = true;
            continue;
        }
        if (ended) throw new Error("BLHeli_32 音符结束标志后存在非空数据。");
        const pitch = byte & 15;
        const octave = (byte >>> 4) & 3;
        const durationIndex = byte >>> 6;
        let denominator: number;
        if (pitch < 12) denominator = TONE_DENOMINATORS[durationIndex];
        else if ((pitch === 12 || pitch === 13) && octave === 3) {
            denominator = REST_DENOMINATORS[durationIndex + (pitch === 12 ? 4 : 0)];
        } else throw new Error(`BLHeli_32 音符编码 0x${byte.toString(16)} 未支持。`);
        const duration = durationMs(denominator, length);
        if (duration <= 0) throw new Error("BLHeli_32 音符时长为零，不能可靠解析。");
        append(pitch < 12 ? 60 + octave * 12 + pitch : null, duration);
        append(null, Math.floor((duration * interval) / 32));
    }
    const melody: Melody = { name, bpm: 120, key: "C", waitMs: 0, notes };
    melody.blheli32 = { mode, bytes: Array.from(bytes), fingerprint: fingerprint(melody) };
    return melody;
}

export function encodeBlheli32Melody(melody: Melody) {
    if (!Number.isFinite(melody.bpm) || melody.bpm <= 0 || !melody.notes?.length) {
        throw new Error("BLHeli_32 旋律需要有效 BPM 和至少一个事件。");
    }
    const saved = melody.blheli32;
    if (saved?.bytes?.length === 48 && saved.fingerprint === fingerprint(melody)) {
        const original = decodeBlheli32Melody(Uint8Array.from(saved.bytes), { mode: saved.mode });
        if (original && fingerprint(original) === fingerprint(melody)) {
            return result(Uint8Array.from(saved.bytes), saved.mode, [], original);
        }
    }
    const events: { midi: number | null; milliseconds: number }[] = [];
    if ((melody.waitMs || 0) > 0) events.push({ midi: null, milliseconds: melody.waitMs! });
    let cursor = 0;
    for (const note of melody.notes) {
        if (
            !Number.isFinite(note.start) ||
            !Number.isFinite(note.duration) ||
            note.start < cursor - 0.0001 ||
            note.duration <= 0
        ) {
            throw new Error("BLHeli_32 不支持重叠、负时值或无效音符。");
        }
        if (note.start > cursor + 0.0001)
            events.push({ midi: null, milliseconds: ((note.start - cursor) * 60000) / melody.bpm });
        const midi = note.rest || note.midi === null ? null : note.midi;
        if (midi !== null && (!Number.isInteger(midi) || midi < 60 || midi > 107)) {
            throw new Error("BLHeli_32 音域为 C4–B7，请调整超出范围的音符。");
        }
        events.push({ midi, milliseconds: (note.duration * 60000) / melody.bpm });
        cursor = note.start + note.duration;
    }
    let best: { bytes: Uint8Array; mode: number; score: number; maxError: number } | null = null;
    for (let length = 1; length <= 15; length++) {
        const encoded: number[] = [];
        let score = 0;
        let maxError = 0;
        let valid = true;
        for (const event of events) {
            if (event.midi === null) {
                let remaining = event.milliseconds;
                const rests = REST_DENOMINATORS.map((d, index) => ({ index, duration: durationMs(d, length) }))
                    .filter((r) => r.duration > 0)
                    .sort((a, b) => b.duration - a.duration);
                while (remaining > 1 && encoded.length <= 48) {
                    const rest = rests.find((r) => r.duration <= remaining + 1);
                    if (!rest) {
                        valid = false;
                        break;
                    }
                    encoded.push(((rest.index % 4) << 6) | 0x30 | (rest.index < 4 ? 13 : 12));
                    remaining -= rest.duration;
                }
                maxError = Math.max(maxError, Math.abs(remaining));
                score += Math.abs(remaining);
            } else {
                const options = TONE_DENOMINATORS.map((d, index) => ({ index, duration: durationMs(d, length) }));
                const nearest = options.sort(
                    (a, b) => Math.abs(a.duration - event.milliseconds) - Math.abs(b.duration - event.milliseconds),
                )[0];
                const error = Math.abs(nearest.duration - event.milliseconds);
                if (error > Math.max(1, event.milliseconds * 0.05)) {
                    valid = false;
                    break;
                }
                score += error;
                maxError = Math.max(maxError, error);
                const pitch = event.midi - 60;
                encoded.push((nearest.index << 6) | (Math.floor(pitch / 12) << 4) | (pitch % 12));
            }
            if (!valid || encoded.length > 48) {
                valid = false;
                break;
            }
        }
        if (valid && encoded.length > 0 && (!best || score < best.score || (score === best.score && length === 8))) {
            const bytes = new Uint8Array(48).fill(255);
            bytes.set(encoded);
            best = { bytes, mode: length << 4, score, maxError };
        }
    }
    if (!best)
        throw new Error(
            "BLHeli_32 只能保存 48 个离散时值事件；请减少音符/休止符，或调整 BPM、音长（可尝试 120 BPM）。",
        );
    const warnings =
        best.maxError > 1
            ? [
                  `BLHeli_32 使用离散音长档位，本曲单个音符最多偏差 ${best.maxError.toFixed(1)} ms（不超过 5%），写入前请试听目标编码。`,
              ]
            : [];
    return result(
        best.bytes,
        best.mode,
        warnings,
        decodeBlheli32Melody(best.bytes, { mode: best.mode, name: melody.name })!,
    );
}

function result(bytes: Uint8Array, mode: number, warnings: string[], playbackMelody: Melody) {
    const end = bytes.indexOf(255);
    return {
        bytes,
        mode,
        warnings,
        encodedLength: end < 0 ? 48 : end,
        playbackMelody,
        durationMs: playbackMelody.notes.reduce((max, note) => Math.max(max, (note.start + note.duration) * 500), 0),
    };
}
