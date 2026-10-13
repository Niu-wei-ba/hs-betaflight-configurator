// SPDX-License-Identifier: GPL-3.0-or-later
import { quantile } from "./policy.js";
export const roomHistogram = () => new Float64Array(256);
export function addRoom(histogram, value, duration) {
    histogram[Math.min(255, Math.max(0, Math.floor(value * 256)))] += duration;
}
export function roomQuantiles(histogram) {
    const duration = histogram.reduce((a, b) => a + b, 0);
    const at = (fraction) => {
        if (!duration) return null;
        let sum = 0;
        for (let i = 0; i < histogram.length; i++) {
            sum += histogram[i];
            if (sum >= duration * fraction) return (i + 0.5) / 256;
        }
        return null;
    };
    return { p5: at(0.05), p50: at(0.5) };
}
export function runDurations(values) {
    return {
        count: values.length,
        p50Ms: quantile(values, 0.5),
        p95Ms: quantile(values, 0.95),
        weighting: "one_continuous_run_one_observation",
    };
}
