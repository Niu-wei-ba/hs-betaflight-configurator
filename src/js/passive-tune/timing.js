// SPDX-License-Identifier: GPL-3.0-or-later
export function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Never close gaps by concatenating samples or using the PID loop frequency. */
export function validateTiming(timeUs, headerRateHz = null, breakIndices = []) {
    const breaks = new Set(breakIndices);
    const intervals = [];
    let invalidIntervals = 0;
    for (let i = 1; i < timeUs.length; i++) {
        const dt = timeUs[i] - timeUs[i - 1];
        if (!Number.isFinite(dt) || dt <= 0) invalidIntervals++;
        else if (!breaks.has(i)) intervals.push(dt);
    }
    const periodUs = median(intervals);
    if (!(periodUs > 0))
        return { status: "rejected", sampleRateMeasuredHz: null, spans: [], reasonCodes: ["TIMESTAMP_UNRELIABLE"] };
    const jitterPct = (100 * median(intervals.map((dt) => Math.abs(dt - periodUs)))) / periodUs;
    const fs = 1e6 / periodUs;
    const mismatchPct = headerRateHz > 0 ? (100 * Math.abs(fs - headerRateHz)) / fs : null;
    const tolerance = Math.max(2, periodUs * 0.02);
    const spans = [];
    let start = 0;
    let gaps = 0;
    const finish = (end) => {
        if (end - start >= 4) spans.push({ start, end });
    };
    for (let i = 1; i < timeUs.length; i++) {
        const dt = timeUs[i] - timeUs[i - 1];
        if (breaks.has(i) || !Number.isFinite(dt) || Math.abs(dt - periodUs) > tolerance) {
            finish(i);
            start = i;
            gaps++;
        }
    }
    finish(timeUs.length);
    const reasonCodes = [];
    if (invalidIntervals || jitterPct > 1 || !spans.length) reasonCodes.push("TIMESTAMP_UNRELIABLE");
    if (mismatchPct === null) reasonCodes.push("SAMPLE_RATE_HEADER_UNAVAILABLE");
    else if (mismatchPct > 1.5) reasonCodes.push("SAMPLE_RATE_MISMATCH");
    if (gaps) reasonCodes.push("FRAME_GAP");
    return {
        status: reasonCodes.includes("TIMESTAMP_UNRELIABLE") ? "rejected" : reasonCodes.length ? "warning" : "valid",
        sampleRateMeasuredHz: fs,
        sampleRateHeaderHz: headerRateHz,
        mismatchPct,
        jitterPct,
        periodUs,
        gaps,
        invalidIntervals,
        spans,
        reasonCodes,
    };
}
