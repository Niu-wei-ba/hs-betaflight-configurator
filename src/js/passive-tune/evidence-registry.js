// SPDX-License-Identifier: GPL-3.0-or-later
/** Min/max envelope drawing; all metrics use full-resolution local signals. */
export function eventCurve(log, event, maxPoints = 1800) {
    const time = log.channels.time,
        index = ["roll", "pitch", "yaw"].indexOf(event.axis);
    const input = log.channels[`setpoint[${index}]`],
        output = log.channels[`gyroADC[${index}]`];
    const indices = new Set([event.preStart, event.start, event.transitionEnd, event.end - 1]);
    const width = Math.max(1, Math.ceil((event.end - event.preStart) / Math.floor(maxPoints / 5)));
    for (let start = event.preStart; start < event.end; start += width) {
        const end = Math.min(event.end, start + width);
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
        target: event.x1,
        unit: "deg/s",
        transitionMs: event.transitionMs,
        observationMs: (time[event.end - 1] - time[event.start]) / 1000,
    };
}
