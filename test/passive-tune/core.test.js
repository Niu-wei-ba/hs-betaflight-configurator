import { describe, expect, it } from "vitest";
import { indexLogs, parseLog } from "../../src/js/passive-tune/parser.js";
import { validateTiming } from "../../src/js/passive-tune/timing.js";
import { periodicHann, welchSpectra, passiveTransferFunction, bandRms } from "../../src/js/passive-tune/spectral.js";
import { analyzeLog, exportReport } from "../../src/js/passive-tune/analysis.js";
import { makeLog, seededSignal } from "./fixtures.js";

describe("ordinary Blackbox decode", () => {
    it("reads non-CHIRP I/P frames and preserves high-resolution units", () => {
        const bytes = makeLog({ samples: 500, highResolution: 1, grouped: true });
        const result = parseLog(bytes, 0);
        expect(result.sampleCount).toBe(500);
        expect(result.channels["setpoint[0]"][10]).toBeCloseTo(100 * Math.sin(10 / 13), 1);
        expect(result.channels.time[499]).toBe(100000 + Math.round((499 * 1000000) / 1024));
        expect(result.capabilities.apply).toBe(false);
        expect(result.corruptRegions).toBe(0);
    });
    it.each([1, 2, 4, 8])("decodes logging divider %i without losing iteration increments", (divider) => {
        const log = parseLog(makeLog({ samples: 100, fs: 2000, divider }), 0);
        expect(log.sampleRateHeaderHz).toBe(2000);
        expect(log.channels.loopIteration[99]).toBe(99 * divider);
        expect(validateTiming(log.channels.time, log.sampleRateHeaderHz).sampleRateMeasuredHz).toBe(2000);
    });
    it("keeps an explicit P interval instead of overwriting it with P ratio", () => {
        const log = parseLog(makeLog({ explicitP: "1/2", divider: 2, extraHeaders: ["H P ratio:16"] }), 0);
        expect(log.sampleRateHeaderHz).toBe(1024);
        expect(log.channels.loopIteration[10]).toBe(20);
    });
    it("requires explicit selection and isolates files with multiple logs", () => {
        const a = makeLog({ samples: 100 });
        const b = makeLog({ samples: 120 });
        const bytes = new Uint8Array(a.length + b.length);
        bytes.set(a);
        bytes.set(b, a.length);
        expect(indexLogs(bytes)).toHaveLength(2);
        expect(() => parseLog(bytes)).toThrow("LOG_SELECTION_REQUIRED");
        expect(parseLog(bytes, 1).sampleCount).toBe(120);
    });
    it("refuses unknown encodings, predictors and missing timing metadata", () => {
        expect(() => parseLog(makeLog({ extraHeaders: ["H Field P encoding:9,0,99,0,0,0,0,0"] }), 0)).toThrow(
            "UNSUPPORTED_FIELD_ENCODING",
        );
        expect(() => parseLog(makeLog({ extraHeaders: ["H Field P predictor:6,2,12,1,1,1,1,1"] }), 0)).toThrow(
            "UNSUPPORTED_FIELD_PREDICTOR",
        );
        expect(() => parseLog(makeLog({ extraHeaders: ["H P interval:0"] }), 0)).toThrow("UNSUPPORTED_SAMPLE_INTERVAL");
    });
    it("recovers corruption only at an intra frame and marks the discontinuity", () => {
        const bytes = makeLog({ samples: 200 });
        const log = indexLogs(bytes)[0];
        bytes[log.dataStart + 50] = 0xff;
        const result = parseLog(bytes, 0);
        expect(result.corruptRegions).toBeGreaterThan(0);
        expect(result.sampleCount).toBeLessThan(200);
        expect(result.breakIndices.length).toBeGreaterThan(1);
    });
    it("does not guess unknown firmware scaling", () => {
        const report = analyzeLog(makeLog({ revision: "custom experimental firmware" }), 0);
        expect(report.axes.roll.charts).toBeNull();
        expect(report.axes.roll.reasonCodes).toContain("UNSUPPORTED_FIELD_SCALE");
    });
    it("rejects invalid signed metadata and ignores truncated frames", () => {
        expect(() => parseLog(makeLog({ extraHeaders: ["H Field I signed:0,0,2,1,1,1,1,1"] }), 0)).toThrow(
            "INVALID_FIELD_DEFINITION",
        );
        const bytes = makeLog({ samples: 100 });
        const partial = bytes.subarray(0, bytes.length - 20);
        const result = parseLog(partial, 0);
        expect(result.sampleCount).toBeLessThan(100);
        expect(result.corruptRegions).toBeGreaterThan(0);
    });
    it("does not treat a custom firmware description as a known unit adapter", () => {
        const report = analyzeLog(makeLog({ revision: "BetaflightCustom 2026.6.1" }), 0);
        expect(report.axes.roll.charts).toBeNull();
    });
});

describe("measured time and continuous windows", () => {
    it("detects 2x header errors while retaining the measured frequency axis", () => {
        const log = parseLog(makeLog({ fs: 2000, headerFs: 4000 }), 0);
        const timing = validateTiming(log.channels.time, log.sampleRateHeaderHz);
        expect(timing.mismatchPct).toBe(100);
        expect(timing.reasonCodes).toContain("SAMPLE_RATE_MISMATCH");
        expect(timing.sampleRateMeasuredHz).toBe(2000);
    });
    it("splits time gaps and parser boundaries without filling data", () => {
        const time = Float64Array.from({ length: 100 }, (_, i) => i * 500 + (i >= 50 ? 10000 : 0));
        const timing = validateTiming(time, 2000, [25]);
        expect(timing.spans).toEqual([
            { start: 0, end: 25 },
            { start: 25, end: 50 },
            { start: 50, end: 100 },
        ]);
        expect(timing.reasonCodes).toContain("FRAME_GAP");
    });
    it("rejects alternating periods and non-finite timestamps", () => {
        expect(validateTiming([0, 500, 750, 1250, 1500, 2000]).status).toBe("rejected");
        expect(validateTiming([0, 500, NaN, 1500, 2000]).status).toBe("rejected");
    });
});

describe("independent spectral correctness", () => {
    it("matches a direct DFT oracle for density, conjugation, and edge-bin normalization", () => {
        const n = 64,
            fs = 512;
        const input = seededSignal(n);
        const output = Float64Array.from(input, (_, i) => input[(i + n - 3) % n]);
        const s = welchSpectra(input, output, fs, [{ start: 0, end: n }], n);
        const window = periodicHann(n);
        const meanX = input.reduce((a, b) => a + b, 0) / n;
        const meanY = output.reduce((a, b) => a + b, 0) / n;
        for (let k = 0; k <= n / 2; k++) {
            let xr = 0,
                xi = 0,
                yr = 0,
                yi = 0;
            for (let i = 0; i < n; i++) {
                const phase = (-2 * Math.PI * k * i) / n;
                xr += (input[i] - meanX) * window[i] * Math.cos(phase);
                xi += (input[i] - meanX) * window[i] * Math.sin(phase);
                yr += (output[i] - meanY) * window[i] * Math.cos(phase);
                yi += (output[i] - meanY) * window[i] * Math.sin(phase);
            }
            const scale = (k === 0 || k === n / 2 ? 1 : 2) / (fs * window.reduce((sum, w) => sum + w * w, 0));
            expect(s.sxx[k]).toBeCloseTo((xr * xr + xi * xi) * scale, 8);
            expect(s.syy[k]).toBeCloseTo((yr * yr + yi * yi) * scale, 8);
            expect(s.sxyRe[k]).toBeCloseTo((xr * yr + xi * yi) * scale, 8);
            expect(s.sxyIm[k]).toBeCloseTo((xr * yi - xi * yr) * scale, 8);
        }
    });
    it("integrates sine power and marks inaccessible noise bands unavailable", () => {
        const signal = Float64Array.from({ length: 4096 }, (_, i) => 4 * Math.sin((2 * Math.PI * 32 * i) / 512));
        const s = welchSpectra(signal, signal, 512, [{ start: 0, end: signal.length }], 512);
        expect(bandRms(s, 20, 50).value).toBeCloseTo(4 / Math.sqrt(2), 6);
        expect(bandRms(s, 200, 400)).toEqual({ value: null, reasonCode: "INCOMPLETE_BAND" });
    });
    it("never promotes a single-window coherence estimate", () => {
        const x = seededSignal(512);
        const tf = passiveTransferFunction(welchSpectra(x, x, 512, [{ start: 0, end: 512 }], 512));
        expect(tf.coherence[10]).toBeCloseTo(1);
        expect(tf.usableBandsHz).toEqual([]);
        expect(tf.reasonCodes).toContain("INSUFFICIENT_WELCH_SUPPORT");
    });
    it("rejects absent excitation and preserves delayed tracking phase sign", () => {
        const x = seededSignal(8192);
        const y = Float64Array.from(x, (_, i) => (i >= 3 ? x[i - 3] : 0));
        const tf = passiveTransferFunction(welchSpectra(x, y, 512, [{ start: 0, end: x.length }], 512));
        expect(tf.usableBandsHz.length).toBeGreaterThan(0);
        expect(tf.phaseDeg[20]).toBeCloseTo((-360 * 20 * 3) / 512, 0);
        expect(tf.bandwidthHz).toBeNull();
        const zero = new Float64Array(8192);
        expect(
            passiveTransferFunction(welchSpectra(zero, y, 512, [{ start: 0, end: zero.length }], 512)).usableBandsHz,
        ).toEqual([]);
    });
    it("never builds FFT windows across discontinuous spans", () => {
        const x = seededSignal(4096);
        const s = welchSpectra(
            x,
            x,
            512,
            [
                { start: 0, end: 1500 },
                { start: 2000, end: 4096 },
            ],
            512,
        );
        expect(s.windows.every((w) => w.end <= 1500 || w.start >= 2000)).toBe(true);
    });
    it("rejects invalid sizes, spans and non-finite channel data", () => {
        const x = seededSignal(1024);
        expect(() => welchSpectra(x, x, 512, [{ start: 0, end: x.length }], 500)).toThrow("INVALID_SPECTRAL_INPUT");
        expect(() => welchSpectra(x, x, 512, [{ start: 0, end: 2000 }], 512)).toThrow("INVALID_SPECTRAL_INPUT");
        x[10] = NaN;
        expect(() => welchSpectra(x, x, 512, [{ start: 0, end: x.length }], 512)).toThrow("INVALID_SPECTRAL_INPUT");
    });
});

describe("read-only analysis report", () => {
    it("is deterministic, exports source provenance, and cannot apply gains", () => {
        const signal = seededSignal(8192);
        const bytes = makeLog({ input: (n) => signal[n], output: (n) => signal[n] });
        const a = analyzeLog(bytes, 0);
        const b = analyzeLog(bytes, 0);
        expect(a).toEqual(b);
        expect(a.applyAllowed).toBe(false);
        for (const axis of Object.values(a.axes)) {
            expect(axis.recommendation).toEqual({ changes: [], applyAllowed: false });
            expect(axis.frequency.usableBandsHz.length).toBeGreaterThan(0);
        }
        const report = exportReport(a, { sha256: "fixture-hash", fileName: "fixture.bbl", fileBytes: bytes.length });
        expect(report.axes.roll.charts).toBeUndefined();
        expect(JSON.stringify(report)).not.toContain("magnitudeDb");
        expect(report.source.sha256).toBe("fixture-hash");
    });
});
