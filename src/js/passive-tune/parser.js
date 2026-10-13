/**
 * Ordinary BBL reader. Reuses the local Blackbox binary encodings; never
 * requires CHIRP or a connected FC. Predictor semantics follow the Blackbox
 * format and the GPL Blackbox Explorer parser. Unknown formats fail closed.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { ArrayDataStream } from "../blackbox/datastream.js";
import "../blackbox/decoders.js";

export const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MARKER = new TextEncoder().encode("H Product:Blackbox flight data recorder by Nicholas Sherlock\n");
const FRAME_TYPES = new Set([73, 80, 83, 69, 71, 72]);
const ENCODINGS = new Set([0, 1, 3, 6, 7, 8, 9, 10]);

export function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
}

class StrictStream extends ArrayDataStream {
    readByte() {
        if (this.pos >= this.end) fail("TRUNCATED_FRAME");
        return this.data[this.pos++];
    }
    readUnsignedVB() {
        let value = 0;
        for (let i = 0; i < 5; i++) {
            const byte = this.readByte();
            if (i === 4 && byte > 15) fail("INVALID_VARIABLE_BYTE");
            value += (byte & 127) * 2 ** (7 * i);
            if (byte < 128) return value;
        }
        fail("INVALID_VARIABLE_BYTE");
    }
}

function matches(data, offset, pattern) {
    return pattern.every((byte, i) => data[offset + i] === byte);
}

function readHeader(data, start, end) {
    const headers = Object.create(null);
    let pos = start;
    while (pos + 1 < end && data[pos] === 72 && data[pos + 1] === 32) {
        const lineStart = pos;
        while (pos < end && data[pos] !== 10) {
            if (pos - lineStart > 16384 || pos - start > 1024 * 1024) fail("HEADER_TOO_LARGE");
            pos++;
        }
        if (pos === end) fail("INVALID_LOG_HEADER");
        const line = new TextDecoder().decode(data.subarray(lineStart + 2, pos++)).trimEnd();
        const colon = line.indexOf(":");
        if (colon >= 0) headers[line.slice(0, colon)] = line.slice(colon + 1).trim();
    }
    return { headers, dataStart: pos };
}

export function indexLogs(data) {
    if (!(data instanceof Uint8Array) || data.length > MAX_FILE_BYTES) fail("FILE_SIZE_LIMIT");
    const starts = [];
    for (let i = 0; i <= data.length - MARKER.length; i++) {
        if (data[i] === 72 && matches(data, i, MARKER)) {
            if (starts.length >= 256) fail("TOO_MANY_LOGS");
            starts.push(i);
            i += MARKER.length - 1;
        }
    }
    if (!starts.length) fail("UNSUPPORTED_LOG_FORMAT");
    return starts.map((start, index) => {
        const end = starts[index + 1] ?? data.length;
        const { headers, dataStart } = readHeader(data, start, end);
        return { index, start, end, dataStart, firmware: headers["Firmware revision"] ?? null, headers };
    });
}

function numbers(value) {
    return value?.split(",").map(Number) ?? [];
}

function definitions(headers) {
    const defs = {};
    for (const type of ["I", "P", "S", "G", "H"]) {
        const names = (headers[`Field ${type} name`] ?? (type === "P" ? headers["Field I name"] : ""))?.split(",");
        if (!names?.[0]) continue;
        const signed = numbers(headers[`Field ${type} signed`] ?? headers["Field I signed"]);
        const predictor = numbers(headers[`Field ${type} predictor`]);
        const encoding = numbers(headers[`Field ${type} encoding`]);
        if (
            names.length > 128 ||
            new Set(names).size !== names.length ||
            predictor.length !== names.length ||
            encoding.length !== names.length ||
            signed.length !== names.length ||
            signed.some((value) => value !== 0 && value !== 1)
        ) {
            fail("INVALID_FIELD_DEFINITION");
        }
        if (predictor.some((p) => !Number.isInteger(p) || p < 0 || p > 11)) fail("UNSUPPORTED_FIELD_PREDICTOR");
        if (encoding.some((e) => !ENCODINGS.has(e))) fail("UNSUPPORTED_FIELD_ENCODING");
        if (type !== "G" && predictor.includes(7)) fail("UNSUPPORTED_FIELD_PREDICTOR");
        defs[type] = { names, signed, predictor, encoding };
    }
    if (!defs.I || !defs.P || !defs.I.names.includes("time") || !defs.I.names.includes("loopIteration")) {
        fail("INVALID_FIELD_DEFINITION");
    }
    return defs;
}

function sampling(headers) {
    const raw = headers["P interval"];
    if (!raw || !/^\d+(\/\d+)?$/.test(raw)) fail("UNSUPPORTED_SAMPLE_INTERVAL");
    const [num, denom] = raw.includes("/") ? raw.split("/").map(Number) : [1, Number(raw)];
    const intra = Number(headers["I interval"]);
    if (!(num > 0 && num <= denom && denom <= 1024 && intra > 0 && intra <= 65536)) {
        fail("UNSUPPORTED_SAMPLE_INTERVAL");
    }
    const loop = Number(headers.looptime);
    const pid = Number(headers.pid_process_denom);
    return { num, denom, intra, headerRateHz: loop > 0 && pid > 0 ? (1e6 * num) / (loop * pid * denom) : null };
}

function nextIteration(previous, sample) {
    let next = previous + 1;
    while (((next % sample.intra) + sample.num - 1) % sample.denom >= sample.num) next++;
    return next;
}

function headerNumber(headers, name, arrayIndex) {
    const value = arrayIndex === undefined ? Number(headers[name]) : numbers(headers[name])[arrayIndex];
    if (!Number.isFinite(value)) fail("MISSING_PREDICTOR_BASE");
    return value;
}

function predict(raw, index, frame, def, ctx) {
    const previous = ctx.previous;
    const before = previous?.[index] ?? 0;
    switch (def.predictor[index]) {
        case 0:
            return raw;
        case 1:
            return raw + before;
        case 2:
            return raw + (ctx.previous2 ? 2 * before - ctx.previous2[index] : before);
        case 3:
            return raw + (ctx.previous2 ? Math.trunc((before + ctx.previous2[index]) / 2) : before);
        case 4:
            return raw + headerNumber(ctx.headers, "minthrottle");
        case 5: {
            const motor = def.names.indexOf("motor[0]");
            if (motor < 0 || motor >= index) fail("MISSING_PREDICTOR_BASE");
            return raw + frame[motor];
        }
        case 6:
            return before + ctx.iterationIncrement;
        case 7:
            return raw; // GPS is decoded for byte framing only; never exposed as analysis data.
        case 8:
            return raw + 1500;
        case 9:
            return raw + headerNumber(ctx.headers, "vbatref");
        case 10:
            return raw + ctx.lastMainTime;
        case 11:
            return raw + headerNumber(ctx.headers, "motorOutput", 0);
        default:
            fail("UNSUPPORTED_FIELD_PREDICTOR");
    }
}

function decodeFrame(stream, def, ctx) {
    const frame = new Float64Array(def.names.length);
    for (let i = 0; i < frame.length; ) {
        const encoding = def.encoding[i];
        let values = [];
        let count = 1;
        if (def.predictor[i] === 6) {
            if (encoding !== 9) fail("INVALID_FIELD_DEFINITION");
            values = [0];
        } else if (encoding === 6) {
            while (i + count < frame.length && def.encoding[i + count] === 6 && count < 8) count++;
            stream.readTag8_8SVB(values, count);
        } else if (encoding === 7 || encoding === 10) {
            count = 3;
            if (encoding === 7) stream.readTag2_3S32(values);
            else stream.readTag2_3SVariable(values);
        } else if (encoding === 8) {
            count = 4;
            if (ctx.dataVersion === 1) stream.readTag8_4S16_v1(values);
            else stream.readTag8_4S16_v2(values);
        } else if (encoding === 0) values = [stream.readSignedVB()];
        else if (encoding === 1) values = [stream.readUnsignedVB()];
        else if (encoding === 3) {
            const raw = stream.readUnsignedVB();
            values = [-(raw & 0x2000 ? raw | 0xffffc000 : raw)];
        } else if (encoding === 9) values = [0];
        else fail("UNSUPPORTED_FIELD_ENCODING");
        if (i + count > frame.length || (count > 1 && def.encoding.slice(i, i + count).some((e) => e !== encoding))) {
            fail("INVALID_FIELD_DEFINITION");
        }
        for (let g = 0; g < count; g++) {
            const value = predict(values[g], i + g, frame, def, ctx);
            frame[i + g] = def.signed[i + g] ? value | 0 : value >>> 0;
        }
        i += count;
    }
    return frame;
}

function decodeEvent(stream) {
    const type = stream.readByte();
    const payload = {};
    if (type === 255) {
        const text = new TextDecoder().decode(stream.data.subarray(stream.pos, stream.pos + 11));
        if (text !== "End of log\0") fail("TRUNCATED_FRAME");
        stream.pos += 11;
    } else if (type === 14) {
        payload.loopIteration = stream.readUnsignedVB();
        payload.timeUs = stream.readUnsignedVB();
    } else if (type === 30) {
        payload.flags = stream.readUnsignedVB();
        payload.previousFlags = stream.readUnsignedVB();
    } else if (type === 0) payload.timeUs = stream.readUnsignedVB();
    else if (type === 15) payload.reason = stream.readUnsignedVB();
    else if (type === 13) {
        const adjustment = stream.readByte();
        payload.function = adjustment & 127;
        if (adjustment & 128) {
            const bytes = Uint8Array.from({ length: 4 }, () => stream.readByte());
            const value = new DataView(bytes.buffer).getFloat32(0, true);
            payload.value = Number.isFinite(value) ? value : null;
        } else payload.value = stream.readSignedVB();
    } else fail("UNSUPPORTED_EVENT");
    return { type, payload };
}

class Columns {
    constructor(names) {
        this.names = names;
        this.length = 0;
        this.blocks = [];
        this.types = names.map((name) => (["time", "loopIteration"].includes(name) ? Float64Array : Float32Array));
        const bytesPerFrame = this.types.reduce((sum, Type) => sum + Type.BYTES_PER_ELEMENT, 0);
        this.limit = Math.min(1000000, Math.floor((64 * 1024 * 1024) / (8192 * bytesPerFrame)) * 8192);
    }
    push(frame) {
        if (this.length >= this.limit) fail("DECODED_SIZE_LIMIT");
        const offset = this.length % 8192;
        if (!offset) this.blocks.push(this.types.map((Type) => new Type(8192)));
        const block = this.blocks[this.blocks.length - 1];
        this.names.forEach((_, i) => {
            block[i][offset] = frame[i];
        });
        this.length++;
    }
    finish() {
        const result = Object.create(null);
        this.names.forEach((name, i) => {
            const array = new this.types[i](this.length);
            this.blocks.forEach((block, b) =>
                array.set(block[i].subarray(0, Math.min(8192, this.length - b * 8192)), b * 8192),
            );
            result[name] = array;
        });
        this.blocks = [];
        return result;
    }
}

/** Parse exactly the selected internal log. Recovery always invalidates P history. */
export function parseLog(data, logIndex, onProgress = () => {}) {
    const logs = indexLogs(data);
    if (!Number.isInteger(logIndex) || !logs[logIndex]) fail("LOG_SELECTION_REQUIRED");
    const log = logs[logIndex];
    const { headers } = log;
    const defs = definitions(headers);
    const sample = sampling(headers);
    const dataVersion = Number(headers["Data version"]);
    if (![1, 2].includes(dataVersion)) fail("UNSUPPORTED_LOG_FORMAT");
    const names = defs.I.names;
    const selected = names.filter((n) =>
        /^(time|loopIteration|setpoint\[[0-3]\]|gyroADC\[[0-2]\]|axisD\[[0-2]\]|motor\[[0-7]\])$/.test(n),
    );
    const indices = selected.map((n) => names.indexOf(n));
    const columns = new Columns(selected);
    const stream = new StrictStream(data, log.dataStart, log.end);
    const timeIndex = names.indexOf("time");
    const iterationIndex = names.indexOf("loopIteration");
    const ctx = { headers, dataVersion, previous: null, previous2: null, lastMainTime: 0, iterationIncrement: 1 };
    const breaks = new Set([0]);
    const events = [];
    const states = [];
    let previousState = null;
    let corruptRegions = 0;
    let lastTime = null;
    let epoch = 0;
    while (stream.pos < stream.end) {
        const frameStart = stream.pos;
        try {
            const type = String.fromCharCode(stream.readByte());
            if (type === "E") {
                const event = decodeEvent(stream);
                if (events.length >= 10000) fail("DECODED_SIZE_LIMIT");
                events.push({ ...event, sampleIndex: columns.length, timeBeforeUs: lastTime });
                if ([13, 14, 15, 30].includes(event.type)) breaks.add(columns.length);
                if (event.type === 14) {
                    ctx.previous = ctx.previous2 = null;
                    previousState = null;
                }
                if (event.type === 255) break;
                if (stream.pos < stream.end && !FRAME_TYPES.has(data[stream.pos])) fail("INVALID_FRAME_BOUNDARY");
            } else {
                const def = defs[type];
                if (!def || (type === "P" && !ctx.previous)) fail("FRAME_HISTORY_UNAVAILABLE");
                const main = type === "I" || type === "P";
                const frameCtx = { ...ctx, previous: null, previous2: null };
                if (main && type === "P") {
                    frameCtx.previous = ctx.previous;
                    frameCtx.previous2 = ctx.previous2;
                    frameCtx.iterationIncrement =
                        nextIteration(ctx.previous[iterationIndex], sample) - ctx.previous[iterationIndex];
                }
                const frame = decodeFrame(stream, def, frameCtx);
                if (stream.pos - frameStart > 2048 || (stream.pos < stream.end && !FRAME_TYPES.has(data[stream.pos]))) {
                    fail("INVALID_FRAME_BOUNDARY");
                }
                if (type === "S") {
                    const fields = Object.fromEntries(def.names.map((name, i) => [name, frame[i]]));
                    const keys = ["flightModeFlags", "failsafePhase", "rxSignalReceived", "rxFlightChannelsValid"];
                    if (!previousState || keys.some((key) => fields[key] !== previousState[key])) {
                        if (states.length >= 10000) fail("DECODED_SIZE_LIMIT");
                        if (previousState) breaks.add(columns.length);
                        states.push({
                            sampleIndex: columns.length,
                            timeBeforeUs: lastTime,
                            valid: true,
                            fields: Object.fromEntries(
                                keys.filter((key) => Object.hasOwn(fields, key)).map((key) => [key, fields[key]]),
                            ),
                        });
                        previousState = fields;
                    }
                }
                if (main) {
                    const rawTime = frame[timeIndex];
                    let nextEpoch = epoch;
                    if (
                        lastTime !== null &&
                        rawTime + epoch < lastTime &&
                        ctx.lastMainTime > 0xf0000000 &&
                        rawTime < 0x0fffffff
                    ) {
                        nextEpoch += 2 ** 32;
                        breaks.add(columns.length);
                    }
                    const time = rawTime + nextEpoch;
                    if (lastTime !== null && (time <= lastTime || time - lastTime > 10000000))
                        fail("INVALID_FRAME_TIME");
                    if (ctx.previous && frame[iterationIndex] <= ctx.previous[iterationIndex])
                        fail("INVALID_FRAME_ITERATION");
                    epoch = nextEpoch;
                    if (!ctx.previous) breaks.add(columns.length);
                    const output = indices.map((index) => frame[index]);
                    output[selected.indexOf("time")] = time;
                    columns.push(output);
                    ctx.previous2 = type === "I" ? frame : ctx.previous;
                    ctx.previous = frame;
                    ctx.lastMainTime = rawTime;
                    lastTime = time;
                }
            }
        } catch (error) {
            if (["DECODED_SIZE_LIMIT", "MISSING_PREDICTOR_BASE", "INVALID_FIELD_DEFINITION"].includes(error.code))
                throw error;
            corruptRegions++;
            if (corruptRegions > 1000) fail("EXCESSIVE_LOG_CORRUPTION");
            ctx.previous = ctx.previous2 = null;
            previousState = null;
            if (states.length >= 10000) fail("DECODED_SIZE_LIMIT");
            states.push({ sampleIndex: columns.length, timeBeforeUs: lastTime, valid: false, fields: {} });
            breaks.add(columns.length);
            // Only an independently encoded I frame can restore predictor history.
            stream.pos = frameStart + 1;
            while (stream.pos < stream.end && data[stream.pos] !== 73) stream.pos++;
        }
        if (columns.length && columns.length % 8192 === 0) onProgress((stream.pos - log.start) / (log.end - log.start));
    }
    if (columns.length < 4) fail("INSUFFICIENT_LOG_DATA");
    const channels = columns.finish();
    const revision = headers["Firmware revision"] ?? "";
    const knownFirmware = /^Betaflight\s+(?:4\.5\.\d+|2025\.12\.\d+|2026\.6\.\d+)(?:[\s(-]|$)/.test(revision);
    const resolution = headers.blackbox_high_resolution;
    const scaleKnown = knownFirmware && (resolution === undefined || resolution === "0" || resolution === "1");
    const scale = resolution === "1" ? 0.1 : 1;
    if (scaleKnown) {
        for (const [name, channel] of Object.entries(channels)) {
            if (/^(gyroADC|setpoint)\[[0-2]\]$/.test(name))
                for (let i = 0; i < channel.length; i++) channel[i] *= scale;
        }
    }
    return {
        schemaVersion: "0.3.0",
        logIndex,
        firmware: revision || null,
        headers,
        channels,
        sampleRateHeaderHz: sample.headerRateHz,
        sampleCount: columns.length,
        breakIndices: [...breaks].sort((a, b) => a - b),
        events,
        states,
        corruptRegions,
        scaleKnown,
        capabilities: { gyroUnit: scaleKnown ? "deg/s" : "unknown", dtermUnit: "logged-unit", apply: false },
    };
}
