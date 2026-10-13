// SPDX-License-Identifier: GPL-3.0-or-later
/** Min/max envelope drawing; all metrics use full-resolution local signals. */
export function eventCurve(log, event, maxPoints = 1800) {
    const time = log.channels.time,
        index = ["roll", "pitch", "yaw"].indexOf(event.axis);
    const input = log.channels[`setpoint[${index}]`],
        output = log.channels[`gyroADC[${index}]`];
    const curveEnd = Math.max(
        event.end,
        ...(event.phases ?? []).filter((p) => p.status === "measured").map((p) => p.end ?? event.end),
    );
    const indices = new Set([event.preStart, event.start, event.transitionEnd, curveEnd - 1]);
    for (const phase of event.phases ?? [])
        if (phase.status === "measured" && Number.isInteger(phase.start) && Number.isInteger(phase.end)) {
            indices.add(phase.start);
            indices.add(phase.end - 1);
        }
    const width = Math.max(
        1,
        Math.ceil((curveEnd - event.preStart) / Math.max(1, Math.floor((maxPoints - indices.size) / 5))),
    );
    for (let start = event.preStart; start < curveEnd; start += width) {
        const end = Math.min(curveEnd, start + width);
        let lo = start,
            hi = start,
            xlo = start,
            xhi = start;
        for (let i = start + 1; i < end; i++) {
            if (output[i] < output[lo]) lo = i;
            if (output[i] > output[hi]) hi = i;
            if (input[i] < input[xlo]) xlo = i;
            if (input[i] > input[xhi]) xhi = i;
        }
        for (const i of [start, lo, hi, xlo, xhi]) indices.add(i);
    }
    return {
        kind: "observed",
        eventId: event.eventId,
        points: [...indices]
            .sort((a, b) => a - b)
            .map((i) => ({ timeMs: (time[i] - time[event.start]) / 1000, input: input[i], output: output[i] })),
        target: event.metrics ? event.x1 : null,
        unit: "deg/s",
        transitionMs: event.transitionMs,
        observationMs: (time[curveEnd - 1] - time[event.start]) / 1000,
    };
}
