// SPDX-License-Identifier: GPL-3.0-or-later
import { ComplexFFT } from "../blackbox/fft.js";
import { periodicHann } from "./spectral.js";
import { POLICY } from "./policy.js";

/** A regularized, band-limited closed-loop estimate, distinct from real actions. */
export function estimateResponse(input, output, sampleRateHz, spans) {
    const empty = {
        status: "unavailable",
        reasonCode: "INSUFFICIENT_ESTIMATE_SUPPORT",
        acceptedWindows: 0,
        rejectedWindows: 0,
        skippedWindows: 0,
        independentBlocks: 0,
        curve: null,
        tailGainEstimate: null,
        definitionVersion: "deconvolution-1.0",
        tailNormalized: false,
        fullDcGainEstablished: false,
    };
    if (!input || !output || !(sampleRateHz > 0)) return empty;
    const length = Math.round(2 * sampleRateHz),
        responseLength = Math.round(0.5 * sampleRateHz) + 1;
    if (length < 64 || length > 32768) return empty;
    const hop = Math.floor(length / 2),
        n = 2 ** Math.ceil(Math.log2(length * 2));
    const potential = spans.reduce(
        (sum, span) => sum + Math.max(0, Math.floor((span.end - span.start - length) / hop) + 1),
        0,
    );
    if (!potential) return empty;
    const stride = Math.max(1, Math.ceil(potential / POLICY.maxEstimateWindows));
    const forward = new ComplexFFT(n, false),
        inverse = new ComplexFFT(n, true),
        window = periodicHann(length);
    const x = new Float64Array(n),
        y = new Float64Array(n),
        X = new Float64Array(2 * n),
        Y = new Float64Array(2 * n),
        H = new Float64Array(2 * n),
        impulse = new Float64Array(2 * n);
    const sum = new Float64Array(responseLength),
        sumSquares = new Float64Array(responseLength);
    let accepted = 0,
        rejected = 0,
        skipped = 0,
        ordinal = 0,
        independent = 0;
    const sampledRanges = [];
    for (const span of spans) {
        let lastIndependentEnd = span.start;
        for (let start = span.start; start + length <= span.end; start += hop) {
            if (ordinal++ % stride) {
                skipped++;
                continue;
            }
            let mx = 0,
                my = 0,
                variance = 0;
            for (let i = 0; i < length; i++) {
                mx += input[start + i];
                my += output[start + i];
            }
            mx /= length;
            my /= length;
            x.fill(0);
            y.fill(0);
            for (let i = 0; i < length; i++) {
                const value = input[start + i] - mx;
                variance += value * value;
                x[i] = value * window[i];
                y[i] = (output[start + i] - my) * window[i];
            }
            if (!Number.isFinite(variance) || !Number.isFinite(my) || Math.sqrt(variance / length) < 3) {
                rejected++;
                continue;
            }
            forward.simple(X, x, "real");
            forward.simple(Y, y, "real");
            let energy = 0;
            for (let k = 0; k < n; k++) energy += X[2 * k] ** 2 + X[2 * k + 1] ** 2;
            const lambda = Math.max(1e-12, (0.01 * energy) / n);
            let supportBins = 0;
            for (let k = 0; k < n; k++) {
                const xr = X[2 * k],
                    xi = X[2 * k + 1],
                    yr = Y[2 * k],
                    yi = Y[2 * k + 1];
                const power = xr * xr + xi * xi,
                    den = power + lambda;
                H[2 * k] = (yr * xr + yi * xi) / den;
                H[2 * k + 1] = (yi * xr - yr * xi) / den;
                if (k >= 2 && k < n / 2 && power > lambda * 10) supportBins++;
            }
            if (supportBins < 3) {
                rejected++;
                continue;
            }
            inverse.simple(impulse, H, "complex");
            let cumulative = 0,
                finite = true;
            const curve = new Float64Array(responseLength);
            for (let i = 0; i < responseLength; i++) {
                cumulative += impulse[2 * i] / n;
                curve[i] = cumulative;
                finite &&= Number.isFinite(cumulative) && Math.abs(cumulative) < 100;
            }
            if (!finite) {
                rejected++;
                continue;
            }
            for (let i = 0; i < responseLength; i++) {
                sum[i] += curve[i];
                sumSquares[i] += curve[i] ** 2;
            }
            accepted++;
            if (start >= lastIndependentEnd) {
                independent++;
                lastIndependentEnd = start + length;
            }
            if (sampledRanges.length < 12) sampledRanges.push({ start, end: start + length });
        }
    }
    if (accepted < 6 || independent < 3)
        return {
            ...empty,
            acceptedWindows: accepted,
            rejectedWindows: rejected,
            skippedWindows: skipped,
            independentBlocks: independent,
        };
    // Full DC/steady-state gain is not established by demeaned, finite windows.
    const mean = Float32Array.from(sum, (value) => value / accepted);
    const deviation = Float32Array.from(sumSquares, (value, i) =>
        Math.sqrt(Math.max(0, value / accepted - mean[i] ** 2)),
    );
    let tail = 0;
    const tailStart = Math.floor(responseLength * 0.75);
    for (let i = tailStart; i < responseLength; i++) tail += mean[i];
    return {
        ...empty,
        status: "limited",
        reasonCode: "LOCAL_LINEAR_BAND_LIMITED_ESTIMATE",
        acceptedWindows: accepted,
        rejectedWindows: rejected,
        skippedWindows: skipped,
        independentBlocks: independent,
        inputWindowMs: 2000,
        responseMs: 500,
        regularization: 0.01,
        sampledRanges,
        tailGainEstimate: tail / (responseLength - tailStart),
        curve: {
            timeMs: Float32Array.from({ length: responseLength }, (_, i) => (1000 * i) / sampleRateHz),
            mean,
            deviation,
        },
    };
}
