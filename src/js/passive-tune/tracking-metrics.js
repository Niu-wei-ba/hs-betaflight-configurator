// SPDX-License-Identifier: GPL-3.0-or-later
/** Trapezoidal time integration. Histogram p95 is explicitly an approximation. */
export function trackingMetrics(time, input, output, spans) {
    if (!input || !output) return null;
    let durationUs = 0,
        squared = 0,
        absolute = 0,
        maxError = 0,
        intervals = 0;
    for (const { start, end } of spans)
        for (let i = start; i + 1 < end; i++) {
            const a = output[i] - input[i],
                b = output[i + 1] - input[i + 1],
                dt = time[i + 1] - time[i];
            if (![a, b, dt].every(Number.isFinite) || dt <= 0) continue;
            durationUs += dt;
            squared += ((a * a + b * b) / 2) * dt;
            absolute += ((Math.abs(a) + Math.abs(b)) / 2) * dt;
            maxError = Math.max(maxError, Math.abs(a), Math.abs(b));
            intervals++;
        }
    if (!durationUs) return null;
    const bins = new Float64Array(2048),
        width = maxError / bins.length;
    for (const { start, end } of spans)
        for (let i = start; i + 1 < end; i++) {
            const a = output[i] - input[i],
                b = output[i + 1] - input[i + 1],
                dt = time[i + 1] - time[i];
            if (![a, b, dt].every(Number.isFinite) || dt <= 0) continue;
            for (const e of [Math.abs(a), Math.abs(b)])
                bins[Math.min(bins.length - 1, width ? Math.floor(e / width) : 0)] += dt / 2;
        }
    let cumulative = 0,
        p95 = 0;
    for (let i = 0; i < bins.length; i++) {
        cumulative += bins[i];
        if (cumulative >= durationUs * 0.95) {
            p95 = maxError ? Math.min(maxError, (i + 0.5) * width) : 0;
            break;
        }
    }
    return {
        rmsDegPerSecond: Math.sqrt(squared / durationUs),
        maeDegPerSecond: absolute / durationUs,
        absoluteErrorP95DegPerSecond: p95,
        p95ResolutionDegPerSecond: width,
        p95Method: "time_weighted_histogram_2048_bins",
        durationSeconds: durationUs / 1e6,
        intervalCount: intervals,
        definitionVersion: "tracking-1.0",
        delayAligned: false,
    };
}

/** Output-command bounds are not physical thrust, ESC current or motor temperature. */
export function outputMetrics(log, spans) {
    const bounds = log.motorBounds;
    const motors = Object.keys(log.channels).filter((name) => /^motor\[\d+\]$/.test(name));
    if (!bounds || !motors.length)
        return { status: "unavailable", reasonCode: "OUTPUT_BOUNDS_UNKNOWN", nearUpperFraction: null };
    const time = log.channels.time;
    let total = 0,
        high = 0,
        low = 0,
        longest = 0,
        invalid = 0;
    for (const { start, end } of spans) {
        let run = 0;
        for (let i = start; i + 1 < end; i++) {
            const dt = time[i + 1] - time[i];
            if (!(dt > 0)) continue;
            const values = motors.map((name) => log.channels[name][i]);
            if (values.some((v) => !Number.isFinite(v) || v < bounds.low || v > bounds.high)) {
                invalid += dt;
                run = 0;
                continue;
            }
            const atHigh = values.some((v) => v >= bounds.high - bounds.tolerance);
            total += dt;
            if (atHigh) {
                high += dt;
                run += dt;
                longest = Math.max(longest, run);
            } else run = 0;
            if (values.some((v) => v <= bounds.low + bounds.tolerance)) low += dt;
        }
    }
    return {
        status: total ? "measured" : "unavailable",
        reasonCode: total ? null : "OUTPUT_BOUNDS_UNKNOWN",
        nearUpperFraction: total ? high / total : null,
        nearLowerFraction: total ? low / total : null,
        longestUpperMs: longest / 1000,
        invalidSeconds: invalid / 1e6,
        durationSeconds: total / 1e6,
        bounds,
        meaning: "motor_command_near_logged_output_bounds",
    };
}
