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

/** Fractions use left-endpoint time weights and verified command bounds, never physical thrust. */
export function outputMetrics(log, spans) {
    const bounds = log.motorBounds;
    const motors = Object.keys(log.channels).filter((name) => /^motor\[\d+\]$/.test(name));
    const unavailable = {
        status: "unavailable",
        reasonCode: "OUTPUT_BOUNDS_UNKNOWN",
        nearUpperFraction: null,
        nearLowerFraction: null,
        longestUpperMs: null,
        longestLowerMs: null,
        controlAuthorityLimited: "unknown",
    };
    if (!bounds || !motors.length) return unavailable;
    const time = log.channels.time,
        perMotor = motors.map((name) => ({
            name,
            min: Infinity,
            max: -Infinity,
            validUs: 0,
            invalidUs: 0,
            lowerUs: 0,
            upperUs: 0,
            longestLowerUs: 0,
            longestUpperUs: 0,
            minLowerRoom: Infinity,
            minUpperRoom: Infinity,
        }));
    const counts = new Float64Array(motors.length + 1);
    let total = 0,
        high = 0,
        low = 0,
        longestHigh = 0,
        longestLow = 0,
        invalid = 0,
        available = 0;
    for (const { start, end } of spans) {
        let highRun = 0,
            lowRun = 0;
        const runs = perMotor.map(() => ({ low: 0, high: 0 }));
        for (let i = start; i + 1 < end; i++) {
            const dt = time[i + 1] - time[i];
            if (!(dt > 0)) {
                highRun = lowRun = 0;
                for (const run of runs) run.low = run.high = 0;
                continue;
            }
            available += dt;
            let lowerCount = 0,
                atHigh = false,
                valid = true;
            for (const [j, item] of perMotor.entries()) {
                const v = log.channels[item.name][i];
                if (!Number.isFinite(v) || v < bounds.low || v > bounds.high) {
                    item.invalidUs += dt;
                    runs[j].low = runs[j].high = 0;
                    valid = false;
                    continue;
                }
                item.validUs += dt;
                item.min = Math.min(item.min, v);
                item.max = Math.max(item.max, v);
                const range = bounds.high - bounds.low;
                item.minLowerRoom = Math.min(item.minLowerRoom, (v - bounds.low) / range);
                item.minUpperRoom = Math.min(item.minUpperRoom, (bounds.high - v) / range);
                const lower = v <= bounds.low + bounds.tolerance,
                    upper = v >= bounds.high - bounds.tolerance;
                runs[j].low = lower ? runs[j].low + dt : 0;
                runs[j].high = upper ? runs[j].high + dt : 0;
                item.longestLowerUs = Math.max(item.longestLowerUs, runs[j].low);
                item.longestUpperUs = Math.max(item.longestUpperUs, runs[j].high);
                if (lower) {
                    item.lowerUs += dt;
                    lowerCount++;
                }
                if (upper) {
                    item.upperUs += dt;
                    atHigh = true;
                }
            }
            if (!valid) {
                invalid += dt;
                highRun = lowRun = 0;
                continue;
            }
            total += dt;
            counts[lowerCount] += dt;
            if (lowerCount) low += dt;
            if (atHigh) high += dt;
            lowRun = lowerCount ? lowRun + dt : 0;
            highRun = atHigh ? highRun + dt : 0;
            longestLow = Math.max(longestLow, lowRun);
            longestHigh = Math.max(longestHigh, highRun);
        }
        // Include the final endpoint in extrema, without adding an extra time interval.
        for (const item of perMotor) {
            const v = log.channels[item.name][end - 1];
            if (Number.isFinite(v) && v >= bounds.low && v <= bounds.high) {
                item.min = Math.min(item.min, v);
                item.max = Math.max(item.max, v);
                item.minLowerRoom = Math.min(item.minLowerRoom, (v-bounds.low)/(bounds.high-bounds.low));
                item.minUpperRoom = Math.min(item.minUpperRoom, (bounds.high-v)/(bounds.high-bounds.low));
            }
        }
    }
    const finite = (v) => (Number.isFinite(v) ? v : null);
    return {
        status: total ? "measured" : "unavailable",
        reasonCode: total ? null : "OUTPUT_BOUNDS_UNKNOWN",
        nearUpperFraction: total ? high / total : null,
        nearLowerFraction: total ? low / total : null,
        longestUpperMs: total ? longestHigh / 1000 : null,
        longestLowerMs: total ? longestLow / 1000 : null,
        invalidSeconds: invalid / 1e6,
        availableSeconds: available / 1e6,
        durationSeconds: total / 1e6,
        bounds,
        lowerMotorCountSeconds: Array.from(counts, (value) => value / 1e6),
        perMotor: perMotor.map((m) => ({
            name: m.name,
            min: finite(m.min),
            max: finite(m.max),
            durationSeconds: m.validUs / 1e6,
            invalidSeconds: m.invalidUs / 1e6,
            nearLowerSeconds: m.lowerUs / 1e6,
            nearUpperSeconds: m.upperUs / 1e6,
            nearLowerFraction: m.validUs ? m.lowerUs / m.validUs : null,
            nearUpperFraction: m.validUs ? m.upperUs / m.validUs : null,
            longestLowerMs: m.validUs ? m.longestLowerUs / 1000 : null,
            longestUpperMs: m.validUs ? m.longestUpperUs / 1000 : null,
            minimumLowerCommandRoomFraction: finite(m.minLowerRoom),
            minimumUpperCommandRoomFraction: finite(m.minUpperRoom),
        })),
        controlAuthorityLimited: "unknown",
        weighting: "left_endpoint_valid_time",
        meaning: "motor_command_near_logged_output_bounds_not_physical_thrust",
    };
}
