// SPDX-License-Identifier: GPL-3.0-or-later
import { parseLog } from "./parser.js";
import { welchSpectra, passiveTransferFunction, bandRms } from "./spectral.js";
import { normalizeLog } from "./normalization.js";
import { segmentLog } from "./segmentation.js";
import { groupThrottle } from "./throttle.js";
import { detectActions } from "./actions.js";
import { aggregateLog } from "./aggregate.js";
import { outputMetrics } from "./tracking-metrics.js";
import { estimateResponse } from "./deconvolution.js";
import { controlMetrics } from "./control-metrics.js";
import { POLICY } from "./policy.js";

export const ALGORITHM_VERSION = "passive-core-0.5.0";
export const AXES = ["roll", "pitch", "yaw"];

/** First read-only milestone: no PID candidate or device transport dependency. */
export function analyzeLog(bytes, logIndex, onProgress = () => {}) {
    const parsed = parseLog(bytes, logIndex, (fraction) => onProgress("parsing", fraction));
    onProgress("normalizing", 0);
    const log = normalizeLog(parsed);
    const { timing, usableSpans } = segmentLog(log);
    timing.localAnalysisAvailable = usableSpans.length > 0;
    onProgress("throttle", 0);
    const throttle = groupThrottle(log, usableSpans);
    onProgress("actions", 0);
    const actions = detectActions(log, usableSpans);
    onProgress("metrics", 0);
    const aggregate = aggregateLog(log, usableSpans, throttle, actions);
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
        let controlSpectrum = null;
        if (input && output && log.scaleKnown && usableSpans.length) {
            const commonRateSpans = usableSpans.filter((span) => Math.abs(span.sampleRateHz - fs) / fs < 0.02);
            const spectrum = welchSpectra(input, output, fs, commonRateSpans, size);
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
            const dterm = log.channels[`axisD[${index}]`],
                rawGyro = log.channels[`gyroUnfilt[${index}]`];
            const bands = [
                [0, 100],
                [100, 200],
                [200, 400],
            ];
            const bandsFor = (signal) => {
                if (!signal) return null;
                const localSpectrum = welchSpectra(signal, signal, fs, commonRateSpans, size);
                return bands.map(([low, high]) => ({ lowHz: low, highHz: high, ...bandRms(localSpectrum, low, high) }));
            };
            controlSpectrum = {
                dtermUnit: "logged_pid_output",
                gyroUnit: "deg/s",
                dtermBands: bandsFor(dterm),
                unfilteredGyroBands: bandsFor(rawGyro),
                filteredGyroBands: noise.gyroBands,
                meaning: "recorded_band_activity_not_filter_safety_or_rpm_effectiveness",
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
            tracking: aggregate.axes[axis].tracking,
            control: controlMetrics(log, index, usableSpans),
            controlSpectrum,
            capabilities: {
                tracking: !!aggregate.axes[axis].tracking,
                stepResponse: aggregate.axes[axis].actions.eligibleCount > 0,
                pidTerms: ["P", "I", "D", "F"].some((term) => !!log.channels[`axis${term}[${index}]`]),
                gyroComparison: !!log.channels[`gyroUnfilt[${index}]`],
                vibrationSafety: false,
            },
            diagnosticCoverage: Object.fromEntries(
                ["trackingComparison", "stepResponse", "stopResidual", "controlTermActivity", "localLag"].map(
                    (name) => {
                        const records = actions.records.filter((e) => e.axis === axis);
                        const statuses = records.map((e) => e.diagnostics.diagnosticEligibility[name].status);
                        const qualifiedCount = statuses.filter((s) => s === "qualified").length;
                        const limitedCount = statuses.filter((s) => s === "limited").length;
                        return [
                            name,
                            {
                                status: qualifiedCount ? "qualified" : limitedCount ? "limited" : "insufficient",
                                qualifiedCount,
                                limitedCount,
                                candidateCount: records.length,
                            },
                        ];
                    },
                ),
            ),
            actions: aggregate.axes[axis].actions,
            recommendation: { changes: [], applyAllowed: false },
        };
    });
    onProgress("estimating", 0);
    const unknownGroups = new Map();
    for (const span of usableSpans) {
        const key = `unknown-${span.configEpoch}-${span.stateFieldsPresent ? "state-recorded" : "state-unknown"}`;
        if (!unknownGroups.has(key)) unknownGroups.set(key, { key, configEpoch: span.configEpoch, windows: [] });
        unknownGroups.get(key).windows.push(span);
    }
    const estimationGroups = aggregate.estimationGroups.length
        ? aggregate.estimationGroups
        : [...unknownGroups.values()];
    const estimates = log.scaleKnown
        ? estimationGroups.slice(0, 15).flatMap((group) =>
            AXES.map((axis, index) => {
                const windows = group.windows.filter((span) => Math.abs(span.sampleRateHz - fs) / fs < 0.02);
                return {
                    evidenceId: `estimate-${axis}-${group.key}`,
                    axis,
                    throttleGroup: group.throttleGroup ?? "unknown",
                    configEpoch: group.configEpoch,
                    ...estimateResponse(
                        log.channels[`setpoint[${index}]`],
                        log.channels[`gyroADC[${index}]`],
                        fs,
                        windows,
                    ),
                };
            }),
        )
        : [];
    onProgress("aggregating", 1);
    const { windows: _windows, stableWindows: _stableWindows, ...throttleSummary } = throttle;
    const result = {
        schemaVersion: "0.5.0",
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
        policy: POLICY,
        capabilities: { ...log.capabilities, actionDetection: log.scaleKnown, localTiming: usableSpans.length > 0 },
        throttle: throttleSummary,
        output: outputMetrics(log, usableSpans),
        motion: {
            candidateCount: actions.records.length,
            limitReached: actions.limitReached,
            partial: actions.limitReached,
            records: actions.records,
            trackingGroups: aggregate.trackingGroups,
            actionGroups: aggregate.actionGroups,
        },
        estimates,
        estimationCoverage: {
            totalGroups: estimationGroups.length,
            processedGroups: Math.min(15, estimationGroups.length),
            omittedGroups: Math.max(0, estimationGroups.length - 15),
        },
        applyAllowed: false,
        reasonCodes: [
            "READ_ONLY_MILESTONE",
            "ALIASING_UNCERTAIN",
            "FLIGHT_STATE_UNKNOWN",
            ...(actions.limitReached ? ["ACTION_RESOURCE_LIMIT"] : []),
        ],
    };
    Object.defineProperty(result, "localLog", { value: log });
    return result;
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
        estimates: (result.estimates ?? []).map(({ curve: _curve, ...summary }) => summary),
        source: { sha256: source.sha256, fileName: source.fileName, fileBytes: source.fileBytes },
    };
}
