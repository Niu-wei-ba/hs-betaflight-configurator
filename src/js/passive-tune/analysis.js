// SPDX-License-Identifier: GPL-3.0-or-later
import { parseLog } from "./parser.js";
import { validateTiming } from "./timing.js";
import { welchSpectra, passiveTransferFunction, bandRms } from "./spectral.js";

export const ALGORITHM_VERSION = "passive-core-0.2.0";
export const AXES = ["roll", "pitch", "yaw"];

/** First read-only milestone: no PID candidate or device transport dependency. */
export function analyzeLog(bytes, logIndex, onProgress = () => {}) {
    const log = parseLog(bytes, logIndex, (fraction) => onProgress("parsing", fraction));
    const timing = validateTiming(log.channels.time, log.sampleRateHeaderHz, log.breakIndices);
    const fs = timing.sampleRateMeasuredHz;
    const size = fs ? Math.max(256, Math.min(8192, 2 ** Math.round(Math.log2(fs)))) : 1024;
    const axes = {};
    AXES.forEach((axis, index) => {
        onProgress("spectral", index / 3);
        const input = log.channels[`setpoint[${index}]`];
        const output = log.channels[`gyroADC[${index}]`];
        const reasonCodes = [...timing.reasonCodes];
        if (!input || !output) reasonCodes.push("MISSING_AXIS_CHANNELS");
        if (!log.scaleKnown) reasonCodes.push("UNSUPPORTED_FIELD_SCALE");
        if (log.corruptRegions) reasonCodes.push("LOG_CORRUPTION_RECOVERED");
        let frequency = null;
        let noise = null;
        let charts = null;
        if (input && output && log.scaleKnown && timing.status !== "rejected") {
            const spectrum = welchSpectra(input, output, fs, timing.spans, size);
            const tf = passiveTransferFunction(spectrum);
            reasonCodes.push(...tf.reasonCodes);
            frequency = { ...tf };
            delete frequency.magnitudeDb;
            delete frequency.phaseDeg;
            delete frequency.coherence;
            delete frequency.valid;
            noise = {
                gyroUnit: "deg/s",
                source: `gyroADC[${index}]`,
                risk: "unknown",
                gyroBands: [
                    [0, 100],
                    [100, 200],
                    [200, 400],
                ].map(([low, high]) => ({ lowHz: low, highHz: high, ...bandRms(spectrum, low, high) })),
                dtermAvailable: !!log.channels[`axisD[${index}]`],
                dtermRisk: "unknown",
            };
            charts = {
                frequencies: spectrum.frequencies,
                magnitudeDb: tf.magnitudeDb,
                phaseDeg: tf.phaseDeg,
                coherence: tf.coherence,
                valid: tf.valid,
                gyroPsd: spectrum.syy,
            };
        }
        axes[axis] = {
            decisionCapability: "diagnosis_only",
            reasonCodes: [...new Set(reasonCodes)],
            frequency,
            noise,
            charts,
            recommendation: { changes: [], applyAllowed: false },
        };
    });
    return {
        schemaVersion: "0.2.0",
        algorithmVersion: ALGORITHM_VERSION,
        logIndex,
        firmware: log.firmware,
        sampleCount: log.sampleCount,
        durationSeconds: (log.channels.time[log.sampleCount - 1] - log.channels.time[0]) / 1e6,
        timing,
        corruptRegions: log.corruptRegions,
        events: log.events,
        configAtFlight: { source: "log-header", completeness: "partial", rawHeaders: log.headers },
        axes,
        applyAllowed: false,
        reasonCodes: ["READ_ONLY_MILESTONE", "ALIASING_UNCERTAIN", "FLIGHT_STATE_NOT_CLASSIFIED"],
    };
}

/** Charts stay local; the portable report contains deterministic finite metadata only. */
export function exportReport(result, source) {
    const axes = Object.fromEntries(
        Object.entries(result.axes).map(([axis, value]) => {
            const { charts: _charts, ...summary } = value;
            return [axis, summary];
        }),
    );
    return {
        ...result,
        axes,
        source: { sha256: source.sha256, fileName: source.fileName, fileBytes: source.fileBytes },
    };
}
