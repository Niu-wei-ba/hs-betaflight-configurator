// SPDX-License-Identifier: GPL-3.0-or-later
import { validateTiming } from "./timing.js";

/** Local spans remain usable even when a different part of the log is malformed. */
export function segmentLog(log) {
    const time = log.channels.time;
    const boundaries = new Set(log.breakIndices);
    for (const event of log.events) if (event.type !== 0 && event.type !== 255) boundaries.add(event.sampleIndex);
    const initial = validateTiming(time, log.sampleRateHeaderHz, [...boundaries]);
    // Unchanged S refreshes do not fragment data; the first S after any boundary reanchors state.
    let lastStateIndex = 0,
        boundaryCursor = 0,
        hadValidState = false;
    for (const state of log.states ?? []) {
        let crossed = false;
        while (boundaryCursor < initial.spans.length && initial.spans[boundaryCursor].start <= state.sampleIndex) {
            if (initial.spans[boundaryCursor].start > lastStateIndex) crossed = true;
            boundaryCursor++;
        }
        if (!state.valid || crossed || !hadValidState) boundaries.add(state.sampleIndex);
        hadValidState = state.valid;
        lastStateIndex = state.sampleIndex;
    }
    const timing = validateTiming(time, log.sampleRateHeaderHz, [...boundaries]);
    for (const boundary of timing.boundaryRecords ?? []) {
        const records = statesAt(log, boundary.sampleIndex);
        boundary.sources =
            records[0] === "explicit_parser_boundary" && boundary.kind === "timestamp_discontinuity"
                ? ["timestamp_discontinuity"]
                : records;
    }
    const configChanges = log.events.filter((event) => event.type === 13).map((event) => event.sampleIndex);
    const states = log.states ?? [];
    let stateCursor = 0,
        configCursor = 0,
        state = null;
    const spans = timing.spans.map((span, index) => {
        while (stateCursor < states.length && states[stateCursor].sampleIndex <= span.start)
            state = states[stateCursor++];
        while (configCursor < configChanges.length && configChanges[configCursor] <= span.start) configCursor++;
        // Timestamp gaps invalidate stale state. Explicit configuration changes retain recorded flags.
        const dt = index ? time[span.start] - time[span.start - 1] : 0;
        const discontinuity = index && Math.abs(dt - timing.periodUs) > Math.max(2, timing.periodUs * 0.02);
        if (discontinuity && state?.sampleIndex < span.start) state = null;
        const local = validateTiming(time.subarray(span.start, span.end));
        const spanFs = local.sampleRateMeasuredHz;
        return {
            ...span,
            id: `span-${index}`,
            configEpoch: configCursor,
            stateFieldsPresent: state?.valid === true,
            stateFlags: state?.valid ? state.fields : null,
            usable: local.status !== "rejected",
            sampleRateHz: spanFs,
            periodUs: local.periodUs,
        };
    });
    return { timing, spans, usableSpans: spans.filter((span) => span.usable) };
}

function statesAt(log, index) {
    const sources = [];
    for (const record of log.states ?? [])
        if (record.sampleIndex === index)
            sources.push(record.valid ? "slow_state_record" : "corruption_resynchronization");
    for (const event of log.events)
        if (event.sampleIndex === index)
            sources.push(
                event.type === 13 ? "configuration_change" : event.type === 14 ? "logging_resume" : "logged_event",
            );
    return [...new Set(sources.length ? sources : ["explicit_parser_boundary"])];
}
