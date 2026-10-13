// SPDX-License-Identifier: GPL-3.0-or-later
import { metric, POLICY, quantile } from "./policy.js";

function crossing(time, output, event, target) {
    const { start, end, x0, delta } = event;
    if ((output[start] - x0) / delta >= target) return null;
    for (let i = start + 1; i < end; i++) {
        const a = (output[i - 1] - x0) / delta,
            b = (output[i] - x0) / delta;
        if (a < target && b >= target) {
            let j = i;
            while (
                j + 1 < end &&
                time[j] - time[i] < POLICY.confirmationMs * 1000 &&
                (output[j + 1] - x0) / delta >= target
            )
                j++;
            if (time[j] - time[i] < POLICY.confirmationMs * 1000) continue;
            return (time[i - 1] + ((target - a) / (b - a)) * (time[i] - time[i - 1]) - time[start]) / 1000;
        }
    }
    return null;
}

/** Actual observations relative to the commanded target; never tail-normalize gyro. */
export function observedStep(time, output, event) {
    const { start, end, x0, x1, delta, y0 } = event;
    const durationMs = (time[end - 1] - time[start]) / 1000;
    const initialError = (y0 - x0) / delta;
    const initialLimited = Math.abs(initialError) > 0.1;
    const firstResponse = (output[start] - x0) / delta;
    const missingRiseCrossing = firstResponse >= 0.1;
    const t10 = crossing(time, output, event, 0.1),
        t90 = crossing(time, output, event, 0.9);
    const t50 = crossing(time, output, event, 0.5);
    let peak = -Infinity,
        peakIndex = start,
        lastOutside = start - 1,
        tailSum = 0,
        tailCount = 0;
    const tolerance = Math.max(2, Math.abs(delta) * POLICY.settleFraction);
    for (let i = start; i < end; i++) {
        const r = (output[i] - x0) / delta;
        if (r > peak) {
            peak = r;
            peakIndex = i;
        }
        if (Math.abs(output[i] - x1) > tolerance) lastOutside = i;
        if (time[end - 1] - time[i] <= 50000) {
            tailSum += output[i] - x1;
            tailCount++;
        }
    }
    const settlingIndex = lastOutside + 1;
    const confirmed = settlingIndex < end && time[end - 1] - time[settlingIndex] >= POLICY.settleConfirmMs * 1000;
    const measuredStatus = initialLimited ? "limited" : "measured";
    const extrema = [];
    for (let i = Math.max(start + 1, event.transitionEnd ?? start); i + 1 < end; i++) {
        const value = output[i] - x1;
        const a = output[i] - output[i - 1], b = output[i + 1] - output[i];
        if (Math.abs(value) < tolerance || !((a > 0 && b <= 0) || (a < 0 && b >= 0))) continue;
        const previous = extrema.at(-1);
        if (previous && Math.sign(previous.value) === Math.sign(value)) {
            if (Math.abs(value) > Math.abs(previous.value)) extrema[extrema.length - 1] = { value, time: time[i] };
        } else if (!previous || time[i] - previous.time >= 5000) extrema.push({ value, time: time[i] });
    }
    const periods = [];
    for (let i = 2; i < extrema.length; i++) periods.push((extrema[i].time - extrema[i - 2].time) / 1e6);
    return {
        definitionVersion: "step-metrics-1.0",
        targetReached: peak >= 0.9,
        initialErrorDegPerSecond: y0 - x0,
        initialErrorFraction: initialError,
        riseTime: metric(
            !initialLimited && !missingRiseCrossing && t10 !== null && t90 !== null ? t90 - t10 : null,
            "ms",
            initialLimited || missingRiseCrossing ? "limited" : t10 === null || t90 === null ? "not_reached" : "measured",
            initialLimited ? "INITIAL_STATE_BIAS" : missingRiseCrossing ? "THRESHOLD_CROSSING_UNOBSERVED" : null,
        ),
        halfTime: metric(t50, "ms", t50 === null ? firstResponse >= 0.5 ? "limited" : "not_reached" : measuredStatus),
        overshoot: metric(Math.max(0, peak - 1) * 100, "%", measuredStatus),
        peakTime: metric((time[peakIndex] - time[start]) / 1000, "ms", measuredStatus),
        stopResidual: event.stopToHold ? metric(Math.max(0, peak - 1) * Math.abs(delta), "deg/s", measuredStatus) : metric(null, "deg/s", "unavailable", "NOT_A_STOP_TO_HOLD"),
        ringing: { alternatingPeakCount: extrema.length, frequency: periods.length >= 2 ? metric(1 / quantile(periods, 0.5), "Hz", "limited", "OSCILLATION_CANDIDATE_NOT_CAUSAL_DIAGNOSIS") : metric(null, "Hz", "unavailable", "INSUFFICIENT_ALTERNATING_PEAKS") },
        settlingTime: {
            ...metric(
                confirmed ? (time[settlingIndex] - time[start]) / 1000 : null,
                "ms",
                confirmed ? measuredStatus : "right_censored",
                confirmed ? null : "NOT_CONFIRMED_WITHIN_WINDOW",
            ),
            observedThroughMs: durationMs,
            lastOutsideMs: lastOutside >= start ? (time[lastOutside] - time[start]) / 1000 : null,
            toleranceDegPerSecond: tolerance,
            confirmationMs: POLICY.settleConfirmMs,
        },
        tailError: metric(
            tailCount ? tailSum / tailCount : null,
            "deg/s",
            "limited",
            "FINITE_TAIL_NOT_VERIFIED_STEADY_STATE",
        ),
        observationMs: durationMs,
        timeResolutionMs: event.periodUs / 1000,
    };
}
