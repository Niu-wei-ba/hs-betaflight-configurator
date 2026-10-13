// SPDX-License-Identifier: GPL-3.0-or-later
import { AXIS_NAMES, POLICY, quantile } from "./policy.js";
import { throttleWindow } from "./throttle.js";
import { observedStep } from "./step-metrics.js";

const lowerBound = (time, value, lo, hi) => {
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (time[mid] < value) lo = mid + 1;
        else hi = mid;
    }
    return lo;
};
function platform(signal, start, end) {
    if (end <= start) return { center: null, spread: Infinity };
    const values = signal.subarray(start, end);
    return { center: quantile(values, 0.5), spread: quantile(values, 0.95) - quantile(values, 0.05) };
}

export function detectActions(log, spans) {
    const time = log.channels.time,
        records = [];
    let limitReached = false;
    for (const [axisIndex, axis] of AXIS_NAMES.entries()) {
        const input = log.channels[`setpoint[${axisIndex}]`],
            output = log.channels[`gyroADC[${axisIndex}]`];
        if (!input || !output || !log.scaleKnown) continue;
        for (const span of spans) {
            const look = Math.max(1, Math.round(20000 / span.periodUs)),
                bridge = Math.max(1, Math.round((POLICY.bridgeMs * 1000) / span.periodUs));
            const clusters = [];
            let first = null,
                last = null;
            for (let i = span.start + look; i < span.end; i++) {
                if (Math.abs(input[i] - input[i - look]) >= POLICY.triggerDelta) {
                    first ??= i - look + 1;
                    last = i;
                }
                if (first !== null && (i - last > bridge || i === span.end - 1)) {
                    let begin = null,
                        finish = null;
                    for (let j = Math.max(span.start + 1, first); j <= last; j++)
                        if (Math.abs(input[j] - input[j - 1]) > 0.25) {
                            begin ??= j;
                            finish = j;
                        }
                    if (begin !== null) clusters.push({ start: begin, transitionEnd: finish });
                    first = last = null;
                }
            }
            for (let k = 0; k < clusters.length; k++) {
                if (records.length >= POLICY.maxCandidates) {
                    limitReached = true;
                    break;
                }
                const candidate = clusters[k];
                const { start, transitionEnd } = candidate;
                const end = Math.min(
                    clusters[k + 1]?.start ?? span.end,
                    lowerBound(time, time[start] + POLICY.observeMs * 1000, start, span.end),
                );
                if (end <= transitionEnd + 1) continue;
                const preStart = lowerBound(time, time[start] - POLICY.preMs * 1000, span.start, start);
                const targetEnd = Math.min(
                    end,
                    lowerBound(time, time[transitionEnd] + POLICY.postMs * 1000, transitionEnd + 1, end),
                );
                const pre = platform(input, preStart, start),
                    post = platform(input, transitionEnd + 1, targetEnd);
                const x0 = pre.center,
                    x1 = post.center,
                    delta = x1 - x0;
                const transitionMs = (time[transitionEnd] - time[start] + span.periodUs) / 1000;
                const preMs = (time[start] - time[preStart]) / 1000;
                const postMs = (time[end - 1] - time[transitionEnd]) / 1000;
                const tolerance = Math.max(POLICY.plateauAbsolute, Math.abs(delta) * POLICY.plateauRelative);
                const reasons = [];
                if (pre.center === null || preMs < POLICY.preMs - span.periodUs / 1000 || pre.spread > tolerance)
                    reasons.push("PRE_PLATFORM_UNSTABLE");
                if (post.center === null || postMs < POLICY.postMs || post.spread > tolerance)
                    reasons.push("POST_PLATFORM_INSUFFICIENT");
                if (Math.abs(delta) < POLICY.minAmplitude) reasons.push("ACTION_TOO_SMALL");
                if (transitionMs > POLICY.transitionMs) reasons.push("INPUT_TOO_SLOW");
                const throttle = throttleWindow(log.throttle, start, end);
                const confounds = [];
                confounds.push("FLIGHT_STATE_UNKNOWN");
                if (span.stateFlags?.failsafePhase > 0) confounds.push("FAILSAFE_CONTEXT");
                if (span.stateFlags?.rxSignalReceived === 0 || span.stateFlags?.rxFlightChannelsValid === 0) confounds.push("RX_SIGNAL_INVALID");
                if (throttle.group === "changing_throttle") confounds.push("CHANGING_THROTTLE");
                if (["unknown", "invalid"].includes(throttle.group)) confounds.push("THROTTLE_CONTEXT_UNKNOWN");
                for (let other = 0; other < 3; other++)
                    if (other !== axisIndex) {
                        const signal = log.channels[`setpoint[${other}]`];
                        if (!signal) {
                            confounds.push("CROSS_AXIS_CONTEXT_UNKNOWN");
                            continue;
                        }
                        const values = platform(signal, preStart, end);
                        if (values.spread > Math.max(20, Math.abs(delta) * 0.25)) confounds.push("MULTI_AXIS_INPUT");
                    }
                let type =
                    transitionMs > POLICY.transitionMs
                        ? "ramp"
                        : x0 * x1 < 0 && Math.min(Math.abs(x0), Math.abs(x1)) >= 15
                            ? "reversal"
                            : "near_step";
                if (confounds.includes("MULTI_AXIS_INPUT")) type = "mixed_input";
                if (type === "mixed_input") reasons.push("MULTI_AXIS_INPUT");
                if (type === "reversal") reasons.push("INPUT_REVERSAL");
                const eligible = !reasons.length && type === "near_step";
                const event = {
                    eventId: `event-${axis}-${start}-${transitionEnd}`,
                    axis,
                    type,
                    start,
                    end,
                    transitionEnd,
                    preStart,
                    x0,
                    x1,
                    delta,
                    y0: platform(output, preStart, start).center,
                    direction: delta >= 0 ? "positive" : "negative",
                    timeStartSeconds: (time[start] - time[0]) / 1e6,
                    timeEndSeconds: (time[end - 1] - time[0]) / 1e6,
                    transitionMs,
                    preMs,
                    postMs,
                    periodUs: span.periodUs,
                    configEpoch: span.configEpoch,
                    stateKnown: span.stateKnown,
                    inputEligibility: eligible ? "eligible" : "ineligible",
                    contextStatus: confounds.length ? "confounded" : "isolated",
                    reasonCodes: reasons,
                    confounds: [...new Set(confounds)],
                    throttle,
                    stopToHold: Math.abs(x1) < 15 && Math.abs(x0) >= POLICY.minAmplitude,
                    truncated: end < span.end && end === clusters[k + 1]?.start,
                };
                event.metrics = eligible ? observedStep(time, output, event) : null;
                records.push(event);
            }
            if (limitReached) break;
        }
        if (limitReached) break;
    }
    return { records, limitReached, policyVersion: POLICY.version };
}
