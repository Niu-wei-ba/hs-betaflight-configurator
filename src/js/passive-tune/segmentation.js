// SPDX-License-Identifier: GPL-3.0-or-later
import { validateTiming } from "./timing.js";

/** Local spans remain usable even when a different part of the log is malformed. */
export function segmentLog(log) {
    const time = log.channels.time;
    const boundaries = new Set(log.breakIndices);
    for (const record of [...(log.states ?? []), ...log.events])
        if (record.type !== 0 && record.type !== 255) boundaries.add(record.sampleIndex);
    const timing = validateTiming(time, log.sampleRateHeaderHz, [...boundaries]);
    const configChanges = log.events.filter((event) => event.type === 13).map((event) => event.sampleIndex);
    const states = log.states ?? [];
    let stateCursor = 0,
        configCursor = 0,
        state = null;
    const spans = timing.spans.map((span, index) => {
        while (stateCursor < states.length && states[stateCursor].sampleIndex <= span.start)
            state = states[stateCursor++];
        while (configCursor < configChanges.length && configChanges[configCursor] <= span.start) configCursor++;
        // Any parser/timing gap invalidates stale state unless an S record anchors this boundary.
        if (index && state?.sampleIndex < span.start) state = null;
        const local = validateTiming(time.subarray(span.start, span.end));
        const spanFs = local.sampleRateMeasuredHz;
        return {
            ...span,
            id: `span-${index}`,
            configEpoch: configCursor,
            stateKnown: state?.valid === true,
            stateFlags: state?.valid ? state.fields : null,
            usable: local.status !== "rejected",
            sampleRateHz: spanFs,
            periodUs: local.periodUs,
        };
    });
    return { timing, spans, usableSpans: spans.filter((span) => span.usable) };
}
