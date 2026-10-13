// SPDX-License-Identifier: GPL-3.0-or-later
import { trackingMetrics, outputMetrics } from "./tracking-metrics.js";
import { POLICY } from "./policy.js";
import { flightContext } from "./flight-context.js";
import { boundaryAssociation } from "./boundary-association.js";

/** Logged PID output units, not degrees/s and not parameter-change recommendations. */
export function signalSummary(time, signal, spans) {
    if (!signal) return null;
    let weight = 0,
        sum = 0,
        square = 0,
        peak = 0,
        first = null,
        last = null;
    for (const { start, end } of spans)
        for (let i = start; i + 1 < end; i++) {
            const a = signal[i],
                b = signal[i + 1],
                dt = time[i + 1] - time[i];
            if (![a, b, dt].every(Number.isFinite) || dt <= 0) continue;
            weight += dt;
            sum += ((a + b) * dt) / 2;
            square += ((a * a + b * b) * dt) / 2;
            peak = Math.max(peak, Math.abs(a), Math.abs(b));
            first ??= a;
            last = b;
        }
    return weight
        ? {
            mean: sum / weight,
            rms: Math.sqrt(square / weight),
            absolutePeak: peak,
            endMinusStart: spans.length === 1 ? last - first : null,
            durationSeconds: weight / 1e6,
        }
        : null;
}
function correlation(samples) {
    let w = 0,
        x = 0,
        y = 0,
        xx = 0,
        yy = 0,
        xy = 0;
    for (const [a, b, dt] of samples) {
        if (![a, b, dt].every(Number.isFinite) || dt <= 0) continue;
        w += dt;
        x += a * dt;
        y += b * dt;
        xx += a * a * dt;
        yy += b * b * dt;
        xy += a * b * dt;
    }
    const vx = xx - (x * x) / w,
        vy = yy - (y * y) / w;
    return w && vx > w * 1e-8 && vy > w * 1e-8
        ? Math.max(-1, Math.min(1, (xy - (x * y) / w) / Math.sqrt(vx * vy)))
        : null;
}
function* pairs(time, a, b, spans, derivative = false) {
    for (const { start, end } of spans)
        for (let i = start; i + 1 < end; i++) {
            const dt = time[i + 1] - time[i];
            yield [derivative ? ((a[i + 1] - a[i]) * 1e6) / dt : (a[i] + a[i + 1]) / 2, (b[i] + b[i + 1]) / 2, dt];
        }
}
function* errorPairs(time, input, output, term, spans) {
    for (const { start, end } of spans)
        for (let i = start; i + 1 < end; i++)
            yield [
                (input[i] + input[i + 1] - output[i] - output[i + 1]) / 2,
                (term[i] + term[i + 1]) / 2,
                time[i + 1] - time[i],
            ];
}
export function controlMetrics(log, axisIndex, spans) {
    const time = log.channels.time,
        terms = {};
    for (const term of ["P", "I", "D", "F"])
        terms[term] = signalSummary(time, log.channels[`axis${term}[${axisIndex}]`], spans);
    const pterm = log.channels[`axisP[${axisIndex}]`],
        gyro = log.channels[`gyroADC[${axisIndex}]`];
    const command = log.channels[`setpoint[${axisIndex}]`],
        ff = log.channels[`axisF[${axisIndex}]`];
    return {
        status: Object.values(terms).some(Boolean) ? "measured" : "unavailable",
        unit: "logged_pid_output",
        terms,
        pErrorCorrelation: command && gyro && pterm ? correlation(errorPairs(time, command, gyro, pterm, spans)) : null,
        ffCommandDerivativeCorrelation: command && ff ? correlation(pairs(time, command, ff, spans, true)) : null,
        correlationMeaning: "zero_lag_association_not_causality_or_optimal_feedforward",
        parameterDecision: "not_determined",
    };
}

/** Bounded local correlation search, with common overlap for all candidates; never replaces unaligned error. */
export function lagEstimate(time, input, output, start, end) {
    const durationUs = time[end - 1] - time[start];
    const unavailable = (reasonCode) => ({ status: "unavailable", localLagCandidateMs: null, reasonCode });
    if (end - start < 20 || durationUs < 100000) return unavailable("LAG_WINDOW_TOO_SHORT");
    const window = [{ start, end }],
        inputStats = signalSummary(time, input, window),
        outputStats = signalSummary(time, output, window);
    if (
        !inputStats ||
        !outputStats ||
        inputStats.rms ** 2 - inputStats.mean ** 2 < 25 ||
        outputStats.rms ** 2 - outputStats.mean ** 2 < 4
    )
        return unavailable("LAG_EXCITATION_INSUFFICIENT");
    const maxMs = Math.min(100, Math.floor(durationUs / 4000 / 5) * 5),
        scores = [];
    for (let lagMs = 0; lagMs <= maxMs; lagMs += 5) {
        const samples = [];
        let cursor = start;
        for (let i = start; i + 1 < end; i++) {
            if (time[i] < time[start] + maxMs * 1000) continue;
            const target = time[i] - lagMs * 1000;
            while (cursor + 1 < end && time[cursor + 1] < target) cursor++;
            if (cursor + 1 >= end) continue;
            const dt = time[cursor + 1] - time[cursor];
            const value =
                dt > 0 ? input[cursor] + ((input[cursor + 1] - input[cursor]) * (target - time[cursor])) / dt : NaN;
            samples.push([value, output[i], time[i + 1] - time[i]]);
        }
        scores.push({ lagMs, correlation: correlation(samples) });
    }
    const finite = scores.filter((score) => Number.isFinite(score.correlation));
    if (!finite.length) return unavailable("LAG_EXCITATION_INSUFFICIENT");
    const best = finite.reduce((a, b) => (a.correlation >= b.correlation ? a : b));
    const boundary = best.lagMs === maxMs;
    const ambiguous = finite.some(
        (score) => Math.abs(score.lagMs - best.lagMs) >= 15 && best.correlation - score.correlation < 0.005,
    );
    const useful = best.correlation >= 0.6 && !boundary && !ambiguous;
    return {
        status: "limited",
        localLagCandidateMs: useful ? best.lagMs : null,
        bestCandidateMs: best.lagMs,
        bestCorrelation: best.correlation,
        zeroLagCorrelation: scores[0].correlation,
        searchMaxMs: maxMs,
        gridMs: 5,
        reasonCode: boundary
            ? "LAG_SEARCH_BOUNDARY"
            : ambiguous
                ? "LAG_AMBIGUOUS"
                : !useful
                    ? "LAG_CORRELATION_INSUFFICIENT"
                    : "LOCAL_CORRELATION_NOT_FIXED_SYSTEM_DELAY",
    };
}
export function eventDiagnostics(log, axisIndex, event) {
    const spans = [{ start: event.start, end: event.end }];
    const tracking = trackingMetrics(
        log.channels.time,
        log.channels[`setpoint[${axisIndex}]`],
        log.channels[`gyroADC[${axisIndex}]`],
        spans,
    );
    const control = controlMetrics(log, axisIndex, spans);
    const trackingAvailable = !!tracking && tracking.intervalCount >= 3 && tracking.durationSeconds >= 0.02;
    const command = log.channels[`setpoint[${axisIndex}]`];
    const commandStart = event.inputEligibility === "eligible" ? event.preStart : event.start;
    const commandStats = signalSummary(log.channels.time, command, [{ start: commandStart, end: event.end }]);
    let min = Infinity,
        max = -Infinity;
    for (let i = commandStart; i < event.end; i++) {
        min = Math.min(min, command[i]);
        max = Math.max(max, command[i]);
    }
    const centeredRms = commandStats ? Math.sqrt(Math.max(0, commandStats.rms ** 2 - commandStats.mean ** 2)) : null;
    const trackingReasons = [];
    if (!tracking || tracking.durationSeconds * 1000 < POLICY.trackingMinimumMs)
        trackingReasons.push("TRACKING_WINDOW_TOO_SHORT");
    if (!tracking || tracking.intervalCount < POLICY.trackingMinimumIntervals)
        trackingReasons.push("TRACKING_INTERVALS_INSUFFICIENT");
    if (!Number.isFinite(max - min) || max - min < POLICY.trackingMinimumRange)
        trackingReasons.push("COMMAND_RANGE_INSUFFICIENT");
    if (centeredRms === null || centeredRms < POLICY.trackingMinimumCenteredRms)
        trackingReasons.push("COMMAND_ACTIVITY_INSUFFICIENT");
    const output = outputMetrics(log, spans);
    const lag = trackingAvailable
        ? lagEstimate(log.channels.time, command, log.channels[`gyroADC[${axisIndex}]`], event.start, event.end)
        : null;
    const grade = (qualified, reasons) => ({ status: qualified ? "qualified" : "insufficient", reasonCodes: reasons });
    return {
        measurementStatus: trackingAvailable ? "measured" : "unavailable",
        command: {
            timeRangeSeconds: [
                (log.channels.time[commandStart] - log.channels.time[0]) / 1e6,
                (log.channels.time[event.end - 1] - log.channels.time[0]) / 1e6,
            ],
            rmsDegPerSecond: commandStats?.rms ?? null,
            centeredRmsDegPerSecond: centeredRms,
            peakToPeakDegPerSecond: Number.isFinite(max - min) ? max - min : null,
            setpointMaxAbs: Number.isFinite(max - min) ? Math.max(Math.abs(min), Math.abs(max)) : null,
        },
        diagnosticEligibility: {
            trackingComparison: grade(!trackingReasons.length, trackingReasons),
            stepResponse: grade(event.inputEligibility === "eligible", event.reasonCodes),
            controlTermActivity: grade(
                control.status === "measured",
                control.status === "measured" ? [] : ["CONTROL_TERMS_MISSING"],
            ),
            localLag: {
                status: lag?.localLagCandidateMs != null ? "limited" : "unavailable",
                reasonCodes: lag ? [lag.reasonCode] : ["TRACKING_UNAVAILABLE"],
            },
            stopResidual: { status: "unavailable", reasonCodes: ["STOP_PLATFORM_NOT_CONFIRMED"] },
        },
        contextLimitations: [
            ...new Set([
                ...event.confounds,
                "ARMED_STATE_UNOBSERVED",
                "AIRBORNE_STATE_UNOBSERVED",
                ...(output.nearLowerFraction > 0 ? ["LOWER_COMMAND_BOUND_PROXIMITY"] : []),
                ...(output.nearUpperFraction > 0 ? ["UPPER_COMMAND_BOUND_PROXIMITY"] : []),
            ]),
        ],
        eventType:
            event.inputEligibility === "eligible"
                ? "standard_step"
                : event.type === "mixed_input"
                    ? "mixed_maneuver"
                    : "continuous_tracking",
        eligibility: {
            stepResponse: event.inputEligibility === "eligible",
            tracking: trackingAvailable,
            pidTerms: Object.values(control.terms).some(Boolean),
            outputBounds: !!log.motorBounds,
        },
        tracking,
        control,
        boundaryAssociation: boundaryAssociation(log, axisIndex, spans),
        output,
        lagEstimate: lag,
        context: flightContext(log, event),
    };
}
