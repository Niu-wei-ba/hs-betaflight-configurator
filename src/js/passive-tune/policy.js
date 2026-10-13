// SPDX-License-Identifier: GPL-3.0-or-later
export const POLICY = Object.freeze({
    version: "passive-policy-1.1",
    calibration: "engineering_candidates_not_dataset_calibrated",
    trackingMinimumMs: 250,
    trackingMinimumIntervals: 20,
    trackingMinimumRange: 30,
    trackingMinimumCenteredRms: 5,
    phaseHoldMs: 50,
    stopThreshold: 15,
    residualMinimumAmplitude: 3,
    residualPeakSpacingMs: 10,
    preMs: 100,
    postMs: 250,
    transitionMs: 50,
    observeMs: 500,
    minAmplitude: 30,
    plateauAbsolute: 3,
    plateauRelative: 0.05,
    triggerDelta: 8,
    bridgeMs: 12,
    confirmationMs: 5,
    settleFraction: 0.05,
    settleConfirmMs: 50,
    throttleRangePct: 5,
    minimumEvents: 5,
    maxCandidates: 50000,
    maxEstimateWindows: 256,
});
export const AXIS_NAMES = ["roll", "pitch", "yaw"];
export const GROUP_NAMES = ["0-20", "20-40", "40-60", "60-80", "80-100"];
export const metric = (
    value,
    unit,
    status = Number.isFinite(value) ? "measured" : "unavailable",
    reasonCode = null,
) => ({
    value: Number.isFinite(value) ? value : null,
    unit,
    status,
    reasonCode,
});
export function quantile(values, fraction) {
    if (!values.length) return null;
    const sorted = Float64Array.from(values).sort();
    const i = (sorted.length - 1) * fraction,
        lo = Math.floor(i);
    return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}
export function distribution(values) {
    const valid = values.filter(Number.isFinite);
    return {
        count: valid.length,
        median: quantile(valid, 0.5),
        p25: quantile(valid, 0.25),
        p75: quantile(valid, 0.75),
        p90: quantile(valid, 0.9),
    };
}
