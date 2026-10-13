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
export function groupThrottle(log, spans) {
    const coverage = Object.fromEntries([...GROUP_NAMES, "unknown", "invalid"].map((key) => [key, 0]));
    const windows = [];
    const time = log.channels.time;
    for (const span of spans) {
        let start = span.start;
        let group = throttleBin(log.throttle?.[start]);
        const finish = (end) => {
            if (GROUP_NAMES.includes(group) && end - start > 1)
                windows.push({
                    ...span,
                    start,
                    end,
                    group,
                    stable: throttleWindow(log.throttle, start, end).group === group,
                });
        };
        for (let i = span.start; i + 1 < span.end; i++) {
            const current = throttleBin(log.throttle?.[i]);
            coverage[current] += Math.max(0, time[i + 1] - time[i]) / 1e6;
            const next = throttleBin(log.throttle?.[i + 1]);
            if (next !== group) {
                finish(i + 1);
                start = i + 1;
                group = next;
            }
        }
        finish(span.end);
    }
    return {
        source: log.capabilities.throttleSource,
        reasonCode: log.capabilities.throttleReason,
        coverageSeconds: coverage,
        totalSeconds: Object.values(coverage).reduce((a, b) => a + b, 0),
        windows,
    };
}
