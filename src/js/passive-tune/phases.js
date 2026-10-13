// SPDX-License-Identifier: GPL-3.0-or-later
import { POLICY } from "./policy.js";
import { controlMetrics, signalSummary } from "./control-metrics.js";
import { throttleWindow } from "./throttle.js";
import { trackingMetrics, outputMetrics } from "./tracking-metrics.js";
/** Detect phases from command only; retain all measured responses regardless of their quality. */
export function actionPhases(log, axisIndex, event) {
    const time = log.channels.time,
        command = log.channels[`setpoint[${axisIndex}]`],
        gyro = log.channels[`gyroADC[${axisIndex}]`];
    const origin = time[0],
        tolerance = Math.max(POLICY.plateauAbsolute, Math.abs(event.delta) * POLICY.plateauRelative);
    const phase = (kind, start, end, reasonCode = null) => {
        if (start == null || end - start < 2)
            return { kind, status: "unavailable", reasonCode: reasonCode ?? "PHASE_NOT_PRESENT" };
        const spans = [{ start, end }];
        return {
            kind,
            start,
            end,
            evidenceId: `${event.eventId}-${kind}`,
            status: "measured",
            timeRangeSeconds: [(time[start] - origin) / 1e6, (time[end - 1] - origin) / 1e6],
            durationSeconds: (time[end - 1] - time[start]) / 1e6,
            tracking: trackingMetrics(time, command, gyro, spans),
            command: signalSummary(time, command, spans),
            control: controlMetrics(log, axisIndex, spans),
            output: outputMetrics(log, spans),
        };
    };
    const transition = phase("command_change", Math.max(event.preStart, event.start - 1), event.transitionEnd + 1);
    // Greedy bounded-range runs: no observed gyro value participates in platform selection.
    let holdStart = null,
        holdEnd = null,
        start = event.transitionEnd,
        min = Infinity,
        max = -Infinity;
    for (let i = start; i < event.end; i++) {
        min = Math.min(min, command[i]);
        max = Math.max(max, command[i]);
        if (!Number.isFinite(min + max) || max - min > tolerance) {
            if (holdStart !== null) {
                holdEnd = i;
                break;
            }
            start = i;
            min = max = command[i];
        }
        if (holdStart === null && time[i] - time[start] >= POLICY.phaseHoldMs * 1000) holdStart = start;
    }
    if (holdStart !== null && holdEnd === null) holdEnd = event.end;
    const hold = phase("command_hold", holdStart, holdEnd);
    let stop = false;
    if (holdStart !== null && Math.abs(event.x0) >= POLICY.minAmplitude) {
        stop = true;
        for (let i = holdStart; i < holdEnd; i++) if (Math.abs(command[i]) > POLICY.stopThreshold) stop = false;
    }
    const recenter = stop
        ? phase("command_stop", transition.start, holdStart + 1)
        : phase("command_stop", null, null, "STOP_PLATFORM_NOT_CONFIRMED");
    if (stop && recenter.end === transition.end) recenter.metricsEvidenceId = transition.evidenceId;
    let observationEnd = holdEnd,
        observationLimitReached = false;
    if (stop) {
        // The event summary window is not a data boundary. Use the available stop-followup up to 500ms.
        const limit = Math.min(event.nextInputStart ?? event.end, event.analysisSpanEnd ?? event.end);
        observationEnd = holdStart + 1;
        let stopMin = command[holdStart],
            stopMax = command[holdStart];
        while (observationEnd < limit && time[observationEnd] - time[holdStart] <= POLICY.observeMs * 1000) {
            const value = command[observationEnd];
            const nextMin = Math.min(stopMin, value),
                nextMax = Math.max(stopMax, value);
            if (!Number.isFinite(value) || Math.abs(value) > POLICY.stopThreshold || nextMax - nextMin > tolerance)
                break;
            stopMin = nextMin;
            stopMax = nextMax;
            observationEnd++;
        }
        observationLimitReached =
            observationEnd < limit && time[observationEnd] - time[holdStart] > POLICY.observeMs * 1000;
    }
    const after = stop
        ? phase("post_stop", holdStart, observationEnd)
        : phase("post_stop", null, null, "STOP_PLATFORM_NOT_CONFIRMED");
    if (stop) {
        after.observationTruncated = !observationLimitReached && after.durationSeconds < POLICY.observeMs / 1000;
        after.stopTiming = {
            detectedChangeEndSeconds: (time[event.transitionEnd] - origin) / 1e6,
            confirmedStopPlatformStartSeconds: (time[holdStart] - origin) / 1e6,
            continuedInputMs: (time[holdStart] - time[event.transitionEnd]) / 1000,
            reason: holdStart > event.transitionEnd ? "CONTINUED_COMMAND_BEFORE_STABLE_PLATFORM" : "PLATFORM_AT_CHANGE_END",
            meaning: "return_command_ends_at_platform_start_not_at_initial_change_end",
        };
        after.endReason = !after.observationTruncated
            ? "OBSERVATION_LIMIT"
            : observationEnd >= (event.analysisSpanEnd ?? event.end)
                ? "ANALYSIS_BOUNDARY"
                : observationEnd >= (event.nextInputStart ?? event.end)
                    ? "NEXT_INPUT"
                    : "COMMAND_CHANGED";
        const throttle = throttleWindow(log.throttle, holdStart, observationEnd);
        after.contextLimitations = [...(event.diagnostics?.contextLimitations ?? [])];
        if (throttle.group === "changing_throttle") after.contextLimitations.push("CHANGING_THROTTLE");
        if (["unknown", "invalid"].includes(throttle.group)) after.contextLimitations.push("THROTTLE_CONTEXT_UNKNOWN");
        if (after.output?.nearLowerFraction > 0) after.contextLimitations.push("LOWER_COMMAND_BOUND_PROXIMITY");
        if (after.output?.nearUpperFraction > 0) after.contextLimitations.push("UPPER_COMMAND_BOUND_PROXIMITY");
        for (let other = 0; other < 3; other++)
            if (other !== axisIndex) {
                const signal = log.channels[`setpoint[${other}]`];
                if (!signal) {
                    after.contextLimitations.push("CROSS_AXIS_CONTEXT_UNKNOWN");
                    continue;
                }
                let low = Infinity,
                    high = -Infinity;
                for (let i = holdStart; i < observationEnd; i++) {
                    low = Math.min(low, signal[i]);
                    high = Math.max(high, signal[i]);
                }
                if (high - low > Math.max(20, Math.abs(event.delta) * 0.25))
                    after.contextLimitations.push("MULTI_AXIS_INPUT");
            }
        after.contextLimitations = [...new Set(after.contextLimitations)];
        after.residual = residualMetrics(time, gyro, holdStart, observationEnd);
        const localTime = time.subarray(holdStart, observationEnd);
        const error = Float64Array.from(localTime, (_, i) => gyro[holdStart + i] - command[holdStart + i]);
        after.trackingErrorResidual = residualMetrics(localTime, error, 0, error.length);
        after.trackingErrorResidual.meaning = "gyro_minus_recorded_setpoint_not_pid_damping_or_causality";
    }
    return {
        phases: [transition, hold, recenter, after],
        stopResidualEligibility: {
            status: stop && after.tracking ? "qualified" : "unavailable",
            reasonCodes: stop && after.tracking ? [] : [stop ? "TRACKING_UNAVAILABLE" : "STOP_PLATFORM_NOT_CONFIRMED"],
        },
    };
}
function clippedRms(time, signal, start, end, low, high) {
    let square = 0,
        duration = 0;
    for (let i = start; i + 1 < end; i++) {
        const a = Math.max(low, time[i]),
            b = Math.min(high, time[i + 1]);
        if (b <= a || !Number.isFinite(signal[i] + signal[i + 1])) continue;
        const delta = time[i + 1] - time[i];
        const va = signal[i] + ((signal[i + 1] - signal[i]) * (a - time[i])) / delta;
        const vb = signal[i] + ((signal[i + 1] - signal[i]) * (b - time[i])) / delta;
        square += ((va * va + vb * vb) * (b - a)) / 2;
        duration += b - a;
    }
    return duration >= high - low - 1e-6 ? Math.sqrt(square / duration) : null;
}
export function residualMetrics(time, gyro, start, end) {
    const low = time[start],
        high = time[end - 1],
        duration = high - low;
    const summary = signalSummary(time, gyro, [{ start, end }]);
    const segmentRms = [];
    for (let k = 0; k < 5; k++) {
        const a = low + k * 100000,
            b = a + 100000;
        segmentRms.push({
            offsetMs: k * 100,
            durationMs: 100,
            rmsDegPerSecond: b <= high ? clippedRms(time, gyro, start, end, a, b) : null,
            status: b <= high ? "measured" : "insufficient",
        });
    }
    const first = duration >= 200000 ? clippedRms(time, gyro, start, end, low, low + 100000) : null;
    const last = duration >= 200000 ? clippedRms(time, gyro, start, end, high - 100000, high) : null;
    // Non-overlapping 5ms median bins provide bounded, deterministic peak candidates.
    const smooth = [];
    let cursor = start;
    for (let t = low; t + 5000 <= high; t += 5000) {
        const values = [];
        while (cursor < end && time[cursor] < t + 5000) {
            if (Number.isFinite(gyro[cursor])) values.push(gyro[cursor]);
            cursor++;
        }
        values.sort((a, b) => a - b);
        if (values.length) smooth.push({ time: t + 2500, value: values[Math.floor(values.length / 2)] });
    }
    const peaks = [];
    for (let i = 1; i + 1 < smooth.length; i++) {
        const p = smooth[i],
            a = smooth[i - 1],
            b = smooth[i + 1];
        if (Math.abs(p.value) < POLICY.residualMinimumAmplitude) continue;
        if (
            !(
                (p.value > 0 && p.value > a.value && p.value >= b.value) ||
                (p.value < 0 && p.value < a.value && p.value <= b.value)
            )
        )
            continue;
        const previous = peaks.at(-1);
        if (previous && Math.sign(previous.value) === Math.sign(p.value)) {
            if (Math.abs(p.value) > Math.abs(previous.value)) peaks[peaks.length - 1] = p;
        } else if (!previous || p.time - previous.time >= POLICY.residualPeakSpacingMs * 1000) peaks.push(p);
    }
    return {
        peakAbsDegPerSecond: summary?.absolutePeak ?? null,
        rmsDegPerSecond: summary?.rms ?? null,
        segmentRms,
        alternatingPeakCount: peaks.length,
        peakMethod: "5ms_median_bins_min_3deg_s_spacing_10ms",
        tailToInitialRmsRatio: first >= POLICY.residualMinimumAmplitude && last !== null ? last / first : null,
        decayStatus:
            first === null || last === null
                ? "insufficient_observation"
                : first < POLICY.residualMinimumAmplitude
                    ? "initial_activity_too_small"
                    : "measured",
        meaning: "recorded_angular_rate_after_command_stop_not_attitude_rebound_or_resonance",
    };
}
