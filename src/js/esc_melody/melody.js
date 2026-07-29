import Rtttl from "bluejay-rtttl-parse";
import escConfiguratorMelodies from "./esc_configurator_melodies.json";

/**
 * Shared ESC startup melody model.
 *
 * The editor deliberately keeps timing in beats.  This makes the same draft
 * usable by the browser preview and by firmware encoders without rounding
 * every note twice.
 */

export const ESC_MELODY_CAPACITY = 128;
export const ESC_MELODY_MAX_NOTES = 64;
export const ESC_MELODY_MAX_DURATION_MS = 120000;
export const ESC_MELODY_MIN_MIDI = 51; // D#3
export const ESC_MELODY_MAX_MIDI = 98; // D7
export const RTTTL_BPM_MIN = 25;
export const RTTTL_BPM_MAX = 900;
export const RTTTL_DENOMINATORS = Object.freeze([1, 2, 4, 8, 16, 32, 64]);
export const ESC_CONFIGURATOR_MELODY_SOURCE =
    "https://github.com/stylesuxx/esc-configurator/blob/21b407a3f30aaff1b079496f4d13d82544c667c4/src/melodies.json";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
let nextNoteId = 1;

const TWO_TIGERS_MELODY = rtttlToMelody(
    "Two-Tigers:d=8,o=5,b=125:d,e,f#,d,d,e,f#,d,f#,g,4a,f#,g,4a,16a,16b,16a,16g,f#,d,16a,16b,16a,16g,f#,d,d,a4,4d,d,a4,4d",
);

const BUILT_IN_PRESET_MELODIES = [
    {
        id: "two-tigers",
        ...TWO_TIGERS_MELODY,
        description: "两只老虎",
        key: "D",
    },
];

export const ESC_CONFIGURATOR_PRESETS = escConfiguratorMelodies.map(createEscConfiguratorPreset);
export const PRESET_MELODIES = [...BUILT_IN_PRESET_MELODIES, ...ESC_CONFIGURATOR_PRESETS];

export function createNote({ id, midi = 60, start = 0, duration = 1, rest = false } = {}) {
    return {
        id: id || `note-${Date.now().toString(36)}-${nextNoteId++}`,
        midi: rest ? null : clamp(Math.round(midi), ESC_MELODY_MIN_MIDI, ESC_MELODY_MAX_MIDI),
        start: Math.max(0, roundBeat(start)),
        duration: clamp(roundBeat(duration), 0.0625, 8),
        rest: Boolean(rest),
    };
}

export function cloneMelody(melody) {
    return normalizeMelody({
        name: melody?.name || "My startup melody",
        bpm: Number(melody?.bpm) || 120,
        key: melody?.key || "C",
        waitMs: Number(melody?.waitMs) || 0,
        notes: (melody?.notes || []).map((note) => ({ ...note })),
    });
}

export function normalizeMelody(melody = {}) {
    const bpm = normalizeBpm(melody.bpm);
    const notes = (melody.notes || [])
        .map((note) => createNote(note))
        .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

    let cursor = 0;
    const normalized = notes.map((note) => {
        const start = Number.isFinite(note.start) ? note.start : cursor;
        const result = { ...note, start: roundBeat(Math.max(start, cursor)) };
        cursor = result.start + result.duration;
        return result;
    });

    return {
        name: String(melody.name || "My startup melody").slice(0, 32),
        bpm,
        key: NOTE_NAMES.includes(melody.key) ? melody.key : "C",
        waitMs: clamp(Math.round(Number(melody.waitMs) || 0), 0, 65535),
        notes: normalized,
    };
}

export function melodyDurationBeats(melody) {
    return (melody?.notes || []).reduce((max, note) => Math.max(max, note.start + note.duration), 0);
}

export function melodyDurationMs(melody) {
    const bpm = Number(melody?.bpm) || 120;
    const waitMs = Number(melody?.waitMs) || 0;
    return waitMs + (melodyDurationBeats(melody) * 60000) / bpm;
}

export function validateMelody(melody, { capacity = ESC_MELODY_CAPACITY, firmware = "am32" } = {}) {
    const normalized = normalizeMelody(melody);
    const rtttl = melodyToRtttl(normalized, { includeWait: firmware !== "bluejay" });
    // The upstream encoder expects at least one note token.  An empty draft is
    // still a valid editor state, so report it through normal validation
    // instead of passing an empty sequence to the encoder.
    const encoded = normalized.notes.length
        ? encodeRtttlForEsc(rtttl, capacity)
        : { data: new Uint8Array(), errorCodes: [] };
    const encodedLength = normalized.notes.length ? getUsedBinaryLength(encoded.data) : 0;
    const errors = [];

    if (normalized.notes.length === 0) errors.push("旋律至少需要一个音符或休止符。");
    if (normalized.notes.length > ESC_MELODY_MAX_NOTES) errors.push(`旋律最多支持 ${ESC_MELODY_MAX_NOTES} 个事件。`);
    if (melodyDurationMs(normalized) > ESC_MELODY_MAX_DURATION_MS) errors.push("旋律时长不能超过 120 秒。");
    if (encoded.errorCodes.some((code) => code === 1)) errors.push("一个或多个音符超出电调支持的音域。");
    if (encoded.errorCodes.some((code) => code === 2)) errors.push(`编码后的旋律超过目标 ${capacity} B 容量。`);

    return {
        valid: errors.length === 0,
        errors,
        noteCount: normalized.notes.length,
        durationMs: Math.round(melodyDurationMs(normalized)),
        encodedLength,
        rtttl,
        melody: normalized,
    };
}

function encodeRtttlForEsc(rtttl, capacity) {
    const warn = console.warn;
    // The parser emits a warning for extended integer BPMs such as 150 even
    // though it serializes them correctly into the Bluejay BPM header.
    console.warn = (...args) => {
        if (args.length === 1 && /^Invalid BPM \d+$/.test(String(args[0]))) return;
        warn.apply(console, args);
    };
    try {
        return Rtttl.toBluejayStartupMelody(rtttl, capacity);
    } finally {
        console.warn = warn;
    }
}

/** Parse an RTTTL string. Supports standard duration, octave, dotted notes and rests. */
export function rtttlToMelody(input) {
    if (typeof input !== "string" || !input.trim()) throw new Error("RTTTL string is empty");

    const parts = input.trim().split(":");
    if (parts.length < 3) throw new Error("RTTTL requires name, defaults and notes");

    const name = parts.shift().trim() || "Imported melody";
    const defaults = parseRtttlDefaults(parts.shift());
    const notes = [];
    let cursor = 0;

    for (const rawToken of parts.join(":").split(",")) {
        const token = rawToken.trim().toLowerCase();
        if (!token) continue;
        const match = token.match(/^(\d+)?([a-gp])([#b]?)(\.)?(\d)?([#b]?)(\.)?$/);
        if (!match) throw new Error(`Invalid RTTTL note: ${rawToken.trim()}`);

        const denominator = Number(match[1] || defaults.duration);
        const base = match[2].toUpperCase();
        const leadingAccidental = match[3];
        const leadingDot = match[4];
        const octave = Number(match[5] || defaults.octave);
        const trailingAccidental = match[6];
        const trailingDot = match[7];
        if (leadingAccidental && trailingAccidental) {
            throw new Error(`Invalid RTTTL accidental: ${rawToken.trim()}`);
        }
        if (leadingDot && trailingDot) {
            throw new Error(`Invalid RTTTL dotted note: ${rawToken.trim()}`);
        }
        const accidental = leadingAccidental || trailingAccidental;
        const dotted = Boolean(leadingDot || trailingDot);
        if (!Number.isInteger(denominator) || denominator < 1 || denominator > 255) {
            throw new Error(`Invalid RTTTL duration: ${rawToken.trim()}`);
        }
        if (base === "P" && (accidental || match[5])) {
            throw new Error(`Invalid RTTTL rest: ${rawToken.trim()}`);
        }
        const duration = normalizeRtttlEventDuration(denominator, dotted);
        let midi = null;

        if (base !== "P") {
            const flatMap = { db: "C#", eb: "D#", gb: "F#", ab: "G#", bb: "A#" };
            const noteName = accidental === "b" ? flatMap[`${base.toLowerCase()}b`] : `${base}${accidental}`;
            const noteIndex = NOTE_NAMES.indexOf(noteName);
            if (noteIndex < 0 || octave < 3 || octave > 7) throw new Error(`Invalid RTTTL pitch: ${rawToken.trim()}`);
            midi = (octave + 1) * 12 + noteIndex;
            if (midi < ESC_MELODY_MIN_MIDI || midi > ESC_MELODY_MAX_MIDI) {
                throw new Error(`RTTTL pitch is outside the ESC range: ${rawToken.trim()}`);
            }
        }

        notes.push(createNote({ midi, start: cursor, duration, rest: midi === null }));
        cursor += duration;
    }

    const leadingRests = [];
    while (notes[leadingRests.length]?.rest) leadingRests.push(notes[leadingRests.length]);
    const waitBeats = leadingRests.reduce((total, note) => total + note.duration, 0);
    const waitMs = Math.round((waitBeats * 60000) / defaults.bpm);
    const waitOffset = leadingRests.length ? waitBeats : 0;
    return normalizeMelody({
        name,
        bpm: defaults.bpm,
        key: "C",
        waitMs,
        notes: waitMs
            ? notes.slice(leadingRests.length).map((note) => ({ ...note, start: Math.max(0, note.start - waitOffset) }))
            : notes,
    });
}

/**
 * Imports the extended RTTTL dialect used by esc-configurator's public preset
 * collection. Its parser accepts legacy German note names, octave-before-dot
 * tokens and 64th notes that are outside the strict code editor grammar.
 */
export function rtttlPresetToMelody(input, { name } = {}) {
    if (typeof input !== "string" || !input.trim()) throw new Error("RTTTL preset is empty");

    const parsed = parseExtendedRtttl(input);
    const bpm = normalizeBpm(parsed.defaults?.bpm);
    const events = parsed.melody.map((event) => ({
        duration: roundBeat((Number(event.duration) * bpm) / 60000),
        midi: event.frequency > 0 ? frequencyToMidi(event.frequency) : null,
        rest: !(event.frequency > 0),
    }));
    const octaveShift = choosePresetOctaveShift(events);
    let cursor = 0;
    const notes = events.map((event) => {
        const note = createNote({
            midi: event.rest ? null : event.midi + octaveShift,
            start: cursor,
            duration: event.duration,
            rest: event.rest,
        });
        cursor += note.duration;
        return note;
    });
    const leadingRests = [];
    while (notes[leadingRests.length]?.rest) leadingRests.push(notes[leadingRests.length]);
    const waitBeats = leadingRests.reduce((total, note) => total + note.duration, 0);
    const waitMs = Math.round((waitBeats * 60000) / bpm);

    return normalizeMelody({
        name: name || parsed.name || "Imported preset",
        bpm,
        key: "C",
        waitMs,
        notes: waitMs
            ? notes.slice(leadingRests.length).map((note) => ({
                ...note,
                start: roundBeat(note.start - waitBeats),
            }))
            : notes,
    });
}

export function melodyToRtttl(melody, { name = melody?.name || "BF ESC", includeWait = true } = {}) {
    const normalized = normalizeMelody(melody);
    const events = [];
    if (includeWait && normalized.waitMs > 0) {
        events.push(...waitMsToRtttlEvents(normalized.waitMs, normalized.bpm));
    }
    let cursor = 0;
    for (const note of normalized.notes) {
        if (note.start > cursor) events.push(...beatsToRtttlRestEvents(note.start - cursor));
        const timing = beatToRtttlDuration(note.duration);
        if (note.rest || note.midi === null) {
            events.push({ ...timing, rest: true });
        } else {
            events.push({
                ...timing,
                rest: false,
                noteName: NOTE_NAMES[note.midi % 12],
                octave: Math.floor(note.midi / 12) - 1,
            });
        }
        cursor = note.start + note.duration;
    }

    const defaults = {
        duration: chooseDefaultDuration(events),
        octave: chooseDefaultOctave(events),
    };
    const tokens = events.map((event) => formatRtttlEvent(event, defaults));
    return `${sanitizeRtttlName(name)}:d=${defaults.duration},o=${defaults.octave},b=${normalized.bpm}:${tokens.join(",")}`;
}

export function encodeFirmwareMelody(melody, firmware = "bluejay", capacity = ESC_MELODY_CAPACITY) {
    const validation = validateMelody(melody, { capacity, firmware });
    if (!validation.valid) throw new Error(validation.errors.join(" "));

    const encoded = encodeRtttlForEsc(validation.rtttl, capacity);
    const bytes = new Uint8Array(encoded.data);
    return {
        firmware,
        bytes,
        rtttl: validation.rtttl,
        waitMs: validation.melody.waitMs,
        validation,
    };
}

export function decodeFirmwareMelody(bytes, { name = "Imported", waitMs } = {}) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (view.length < 4 || view.every((byte) => byte === 0 || byte === 0xff)) return null;
    const melody = rtttlToMelody(Rtttl.fromBluejayStartupMelody(view, name));
    if (waitMs === undefined) return melody;
    return normalizeMelody({ ...melody, waitMs });
}

export function melodyFingerprint(melody) {
    if (!melody) return "";
    const normalized = normalizeMelody(melody);
    return JSON.stringify({
        bpm: normalized.bpm,
        waitMs: normalized.waitMs,
        notes: normalized.notes.map(({ midi, start, duration, rest }) => ({
            midi,
            start,
            duration,
            rest,
        })),
    });
}

export function melodiesEqual(left, right) {
    if (!left || !right) return left === right;
    return melodyFingerprint(left) === melodyFingerprint(right);
}

export function encodeWaitMs(waitMs) {
    const value = clamp(Math.round(Number(waitMs) || 0), 0, 65535);
    return new Uint8Array([value & 0xff, (value >> 8) & 0xff]);
}

function parseRtttlDefaults(input = "") {
    const defaults = { duration: 4, octave: 5, bpm: 120 };
    for (const part of input.split(",")) {
        const pair = part.split("=");
        if (pair.length !== 2) throw new Error(`Invalid RTTTL default: ${part.trim()}`);
        const [rawKey, rawValue] = pair.map((value) => value.trim().toLowerCase());
        const value = Number(rawValue);
        if (!Number.isInteger(value)) throw new Error(`Invalid RTTTL default: ${part.trim()}`);
        if (rawKey === "d") {
            if (!RTTTL_DENOMINATORS.includes(value)) throw new Error(`Invalid RTTTL duration: ${rawValue}`);
            defaults.duration = value;
            continue;
        }
        if (rawKey === "o") {
            if (value < 4 || value > 7) throw new Error(`Invalid RTTTL octave: ${rawValue}`);
            defaults.octave = value;
            continue;
        }
        if (rawKey === "b") {
            if (value < RTTTL_BPM_MIN || value > RTTTL_BPM_MAX) throw new Error(`Invalid RTTTL BPM: ${rawValue}`);
            defaults.bpm = value;
            continue;
        }
        throw new Error(`Unsupported RTTTL default: ${rawKey}`);
    }
    return defaults;
}

function createEscConfiguratorPreset(preset, index) {
    const idName = String(preset.name || "melody")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
    const trackMelodies = preset.tracks.map((track, trackIndex) =>
        rtttlPresetToMelody(track, {
            name: preset.tracks.length > 1 ? `声部 ${trackIndex + 1} · ${preset.name}` : preset.name,
        }),
    );
    const primary = trackMelodies[0];

    return {
        ...primary,
        id: `esc-configurator-${index + 1}-${idName || "preset"}`,
        name: preset.name,
        description: `${preset.tracks.length} 声部 · ESC Configurator`,
        source: "esc-configurator",
        sourceUrl: ESC_CONFIGURATOR_MELODY_SOURCE,
        tracks: [...preset.tracks],
        trackMelodies,
    };
}

function parseExtendedRtttl(input) {
    const warn = console.warn;
    console.warn = (...args) => {
        if (
            args.length === 1 &&
            (/^(Invalid BPM|Invalid octave) /.test(String(args[0])) ||
                String(args[0]) === "Tune name should not exceed 10 characters.")
        ) {
            return;
        }
        warn.apply(console, args);
    };
    try {
        return Rtttl.parse(input);
    } finally {
        console.warn = warn;
    }
}

function frequencyToMidi(frequency) {
    return Math.round(69 + 12 * Math.log2(Number(frequency) / 440));
}

function choosePresetOctaveShift(events) {
    const pitches = events.filter((event) => !event.rest).map((event) => event.midi);
    if (!pitches.length) return 0;
    const lowest = Math.min(...pitches);
    const highest = Math.max(...pitches);
    const shifts = [];
    for (let shift = -60; shift <= 60; shift += 12) {
        if (lowest + shift >= ESC_MELODY_MIN_MIDI && highest + shift <= ESC_MELODY_MAX_MIDI) {
            shifts.push(shift);
        }
    }
    if (!shifts.length) throw new Error("RTTTL preset cannot fit the ESC piano-roll range");
    return shifts.sort((left, right) => Math.abs(left) - Math.abs(right))[0];
}

function beatToRtttlDuration(beats) {
    let best = { denominator: 4, dotted: false, distance: Number.POSITIVE_INFINITY };
    for (const denominator of RTTTL_DENOMINATORS) {
        for (const dotted of [false, true]) {
            const value = (4 / denominator) * (dotted ? 1.5 : 1);
            const distance = Math.abs(value - beats);
            if (distance < best.distance) best = { denominator, dotted, distance };
        }
    }
    return best;
}

function normalizeRtttlEventDuration(denominator, dotted) {
    const beats = (4 / denominator) * (dotted ? 1.5 : 1);
    if (RTTTL_DENOMINATORS.includes(denominator)) return roundBeat(beats);

    const closest = beatToRtttlDuration(beats);
    return roundBeat((4 / closest.denominator) * (closest.dotted ? 1.5 : 1));
}

function waitMsToRtttlEvents(waitMs, bpm) {
    return beatsToRtttlRestEvents((waitMs * bpm) / 60000);
}

function beatsToRtttlRestEvents(beats) {
    let remaining = Math.max(0, Math.round(beats * 8) / 8);
    const events = [];
    const durations = [
        ...RTTTL_DENOMINATORS.map((denominator) => ({ denominator, dotted: false, beats: 4 / denominator })),
        ...RTTTL_DENOMINATORS.map((denominator) => ({ denominator, dotted: true, beats: (4 / denominator) * 1.5 })),
    ].sort((a, b) => b.beats - a.beats);

    while (remaining > 0.001) {
        const duration = durations.find((candidate) => candidate.beats <= remaining + 0.001) || durations.at(-1);
        events.push({ denominator: duration.denominator, dotted: duration.dotted, rest: true });
        remaining = Math.max(0, remaining - duration.beats);
    }
    return events;
}

function sanitizeRtttlName(name) {
    return (
        String(name || "BF ESC")
            .replace(/[^a-z0-9 _-]/gi, "")
            .slice(0, 10) || "BF ESC"
    );
}

function normalizeBpm(value) {
    return clamp(Math.round(Number(value) || 125), RTTTL_BPM_MIN, RTTTL_BPM_MAX);
}

function chooseDefaultDuration(events) {
    const counts = new Map();
    for (const event of events) {
        if (!event.dotted) counts.set(event.denominator, (counts.get(event.denominator) || 0) + 1);
    }
    return RTTTL_DENOMINATORS.reduce(
        (best, denominator) => (counts.get(denominator) > counts.get(best) ? denominator : best),
        4,
    );
}

function chooseDefaultOctave(events) {
    const counts = new Map();
    for (const event of events) {
        if (!event.rest) counts.set(event.octave, (counts.get(event.octave) || 0) + 1);
    }
    return [4, 5, 6, 7].reduce((best, octave) => (counts.get(octave) > counts.get(best) ? octave : best), 5);
}

function formatRtttlEvent(event, defaults) {
    const duration = event.denominator === defaults.duration ? "" : String(event.denominator);
    const pitch = event.rest
        ? "p"
        : `${event.noteName.toLowerCase()}${event.octave === defaults.octave ? "" : event.octave}`;
    return `${duration}${pitch}${event.dotted ? "." : ""}`;
}

function roundBeat(value) {
    return Math.round(Number(value || 0) * 1000) / 1000;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function getUsedBinaryLength(data) {
    for (let index = data.length - 2; index >= 4; index -= 2) {
        if (data[index] !== 0 || data[index + 1] !== 0) return index + 2;
    }
    return 4;
}
