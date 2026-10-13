// SPDX-License-Identifier: GPL-3.0-or-later
import { GROUP_NAMES, POLICY } from "./policy.js";
export function throttleBin(value) {
    if (!Number.isFinite(value)) return "unknown";
    if (value < 0 || value > 100) return "invalid";
    return GROUP_NAMES[Math.min(4, Math.floor(value / 20))];
}
export function throttleWindow(throttle, start, end) {
    if (!throttle) return { group: "unknown", minPct: null, maxPct: null, meanPct: null };
    let min = Infinity,
        max = -Infinity,
        sum = 0;
    for (let i = start; i < end; i++) {
        const value = throttle[i];
        if (!Number.isFinite(value) || value < 0 || value > 100)
            return { group: "invalid", minPct: null, maxPct: null, meanPct: null };
        min = Math.min(min, value);
        max = Math.max(max, value);
        sum += value;
    }
    if (end <= start) return { group: "unknown", minPct: null, maxPct: null, meanPct: null };
    const group =
        max - min > POLICY.throttleRangePct || throttleBin(min) !== throttleBin(max)
            ? "changing_throttle"
            : throttleBin(sum / (end - start));
    return { group, minPct: min, maxPct: max, meanPct: sum / (end - start) };
}
/** Windows own intervals [start,end-1); their right endpoint is retained for trapezoidal integration. */
export function groupThrottle(log, spans) {
    const coverage = Object.fromEntries([...GROUP_NAMES, "unknown", "invalid"].map((key) => [key, 0]));
    const classes = { stable: 0, short_fragment: 0, changing_throttle: 0, unknown: 0, invalid: 0 };
    const perBin = Object.fromEntries([...GROUP_NAMES, "unknown", "invalid"].map((key) => [key, { ...classes }]));
    const windows = [],
        stableWindows = [],
        time = log.channels.time;
    for (const span of spans) {
        let full = null,
            stable = null;
        const finishFull = () => {
            if (full) windows.push(full);
            full = null;
        };
        const finishStable = () => {
            if (!stable) return;
            const duration = (time[stable.end - 1] - time[stable.start]) / 1e6;
            const kind = duration * 1000 >= POLICY.trackingMinimumMs ? "stable" : "short_fragment";
            classes[kind] += duration;
            perBin[stable.group][kind] += duration;
            if (kind === "stable") stableWindows.push({ ...stable, stable: true });
            stable = null;
        };
        for (let i = span.start; i + 1 < span.end; i++) {
            const dt = (time[i + 1] - time[i]) / 1e6;
            if (!(dt > 0)) {
                finishFull();
                finishStable();
                continue;
            }
            const a = log.throttle?.[i],
                b = log.throttle?.[i + 1],
                group = throttleBin(a);
            coverage[group] += dt;
            if (full?.group !== group) {
                finishFull();
                full = { ...span, group, start: i, end: i + 2 };
            } else full.end = i + 2;
            const next = throttleBin(b);
            const kind = !GROUP_NAMES.includes(group)
                ? group
                : next !== group || Math.abs(b - a) > POLICY.throttleRangePct
                    ? "changing_throttle"
                    : null;
            if (kind) {
                finishStable();
                classes[kind] += dt;
                perBin[group][kind] += dt;
                continue;
            }
            const min = Math.min(stable?.min ?? a, a, b),
                max = Math.max(stable?.max ?? a, a, b);
            if (stable && (stable.group !== group || max - min > POLICY.throttleRangePct)) finishStable();
            if (!stable) stable = { ...span, group, start: i, end: i + 2, min: Math.min(a, b), max: Math.max(a, b) };
            else {
                stable.end = i + 2;
                stable.min = min;
                stable.max = max;
            }
        }
        finishFull();
        finishStable();
    }
    const totalSeconds = Object.values(coverage).reduce((a, b) => a + b, 0);
    return {
        source: log.capabilities.throttleSource,
        reasonCode: log.capabilities.throttleReason,
        coverageSeconds: coverage,
        totalSeconds,
        windows,
        stableWindows,
        coverage: {
            evidenceId: "throttle-coverage",
            totalAvailableSeconds: totalSeconds,
            includedSeconds: GROUP_NAMES.reduce((s, k) => s + coverage[k], 0),
            excludedSeconds: coverage.unknown + coverage.invalid,
            stableSubsetSeconds: classes.stable,
            classificationSeconds: classes,
            perBin,
            selectionPolicy: "left_endpoint_intervals_stable_range_5pct_min_250ms",
            accountingErrorSeconds: totalSeconds - Object.values(classes).reduce((a, b) => a + b, 0),
        },
    };
}
