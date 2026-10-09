// SPDX-License-Identifier: GPL-3.0-or-later
import { ComplexFFT } from "../blackbox/fft.js";
import { median } from "./timing.js";
import { fail } from "./parser.js";

export function periodicHann(size) {
    return Float64Array.from({ length: size }, (_, n) => 0.5 * (1 - Math.cos((2 * Math.PI * n) / size)));
}

/** Unregularized density spectra, conj(X)*Y, with one-sided DC/Nyquist handling. */
export function welchSpectra(input, output, sampleRateHz, spans, size = 1024) {
    if (
        input.length !== output.length ||
        !(sampleRateHz > 0) ||
        !Number.isFinite(sampleRateHz) ||
        !Number.isInteger(size) ||
        size < 4 ||
        size & (size - 1)
    )
        fail("INVALID_SPECTRAL_INPUT");
    const bins = size / 2 + 1;
    const sxx = new Float64Array(bins);
    const syy = new Float64Array(bins);
    const sxyRe = new Float64Array(bins);
    const sxyIm = new Float64Array(bins);
    const window = periodicHann(size);
    const density = 1 / (sampleRateHz * window.reduce((sum, w) => sum + w * w, 0));
    const fft = new ComplexFFT(size, false);
    const x = new Float64Array(size);
    const y = new Float64Array(size);
    const X = new Float64Array(2 * size);
    const Y = new Float64Array(2 * size);
    const windows = [];
    let independentBlockCount = 0;
    for (const span of spans) {
        if (
            !Number.isInteger(span.start) ||
            !Number.isInteger(span.end) ||
            span.start < 0 ||
            span.end > input.length ||
            span.end < span.start
        ) {
            fail("INVALID_SPECTRAL_INPUT");
        }
        independentBlockCount += Math.floor((span.end - span.start) / size);
        for (let start = span.start; start + size <= span.end; start += size / 2) {
            let mx = 0;
            let my = 0;
            for (let i = 0; i < size; i++) {
                mx += input[start + i];
                my += output[start + i];
            }
            mx /= size;
            my /= size;
            if (!Number.isFinite(mx) || !Number.isFinite(my)) fail("INVALID_SPECTRAL_INPUT");
            for (let i = 0; i < size; i++) {
                x[i] = (input[start + i] - mx) * window[i];
                y[i] = (output[start + i] - my) * window[i];
            }
            fft.simple(X, x, "real");
            fft.simple(Y, y, "real");
            for (let k = 0; k < bins; k++) {
                const xr = X[2 * k],
                    xi = X[2 * k + 1],
                    yr = Y[2 * k],
                    yi = Y[2 * k + 1];
                const scale = density * (k === 0 || k === bins - 1 ? 1 : 2);
                sxx[k] += (xr * xr + xi * xi) * scale;
                syy[k] += (yr * yr + yi * yi) * scale;
                sxyRe[k] += (xr * yr + xi * yi) * scale;
                sxyIm[k] += (xr * yi - xi * yr) * scale;
            }
            windows.push({ start, end: start + size });
        }
    }
    if (windows.length) {
        for (const spectrum of [sxx, syy, sxyRe, sxyIm]) for (let k = 0; k < bins; k++) spectrum[k] /= windows.length;
    }
    return {
        frequencies: Float64Array.from({ length: bins }, (_, k) => (k * sampleRateHz) / size),
        sxx,
        syy,
        sxyRe,
        sxyIm,
        windows,
        independentBlockCount,
        sampleRateHz,
        size,
    };
}

function bandList(frequencies, valid) {
    const bands = [];
    let start = null;
    for (let k = 0; k <= valid.length; k++) {
        if (valid[k]) {
            if (start === null) start = k;
        } else if (start !== null) {
            if (k - start >= 3) bands.push([frequencies[start], frequencies[k - 1]]);
            else for (let i = start; i < k; i++) valid[i] = 0;
            start = null;
        }
    }
    return bands;
}

export function passiveTransferFunction(spectra) {
    const { sxx, syy, sxyRe, sxyIm, frequencies, windows, independentBlockCount } = spectra;
    const bins = frequencies.length;
    const magnitudeDb = new Float64Array(bins).fill(NaN);
    const phaseDeg = new Float64Array(bins).fill(NaN);
    const coherence = new Float64Array(bins);
    const valid = new Uint8Array(bins);
    const maximum = Math.max(...sxx);
    const regularization = Math.max(1e-12, (median(sxx) ?? 0) * 0.001);
    const sufficientWindows = windows.length >= 6 && independentBlockCount >= 3;
    const df = frequencies[1] ?? 0;
    const inputRms = Math.sqrt(sxx.reduce((sum, p) => sum + p * df, 0));
    for (let k = 1; k < bins; k++) {
        const denominator = sxx[k] * syy[k];
        coherence[k] = denominator > 1e-30 ? Math.min(1, (sxyRe[k] ** 2 + sxyIm[k] ** 2) / denominator) : 0;
        const magnitude = Math.hypot(sxyRe[k], sxyIm[k]) / (sxx[k] + regularization);
        if (magnitude > 0) {
            magnitudeDb[k] = 20 * Math.log10(magnitude);
            phaseDeg[k] = (Math.atan2(sxyIm[k], sxyRe[k]) * 180) / Math.PI;
        }
        valid[k] =
            sufficientWindows &&
            inputRms >= 0.5 &&
            frequencies[k] >= 2 * df &&
            frequencies[k] <= spectra.sampleRateHz * 0.45 &&
            sxx[k] > Math.max(1e-8, maximum * 1e-5) &&
            regularization / sxx[k] <= 0.1 &&
            coherence[k] >= 0.6
                ? 1
                : 0;
    }
    const usableBandsHz = bandList(frequencies, valid);
    const reasonCodes = [];
    if (!sufficientWindows) reasonCodes.push("INSUFFICIENT_WELCH_SUPPORT");
    if (!usableBandsHz.length) reasonCodes.push("INSUFFICIENT_EXCITATION");
    // No passive open-loop margin, assumed bandwidth, or coherence-based noise floor.
    return {
        magnitudeDb,
        phaseDeg,
        coherence,
        valid,
        usableBandsHz,
        inputRms,
        regularization,
        windowCount: windows.length,
        independentBlockCount,
        bandwidthHz: null,
        bandwidthReason: "BANDWIDTH_NOT_ESTABLISHED",
        reasonCodes,
    };
}

export function bandRms(spectra, lowHz, highHz) {
    const df = spectra.frequencies[1] ?? 0;
    if (!spectra.windows.length || highHz > spectra.sampleRateHz * 0.45) {
        return { value: null, reasonCode: "INCOMPLETE_BAND" };
    }
    let power = 0;
    for (let k = 0; k < spectra.frequencies.length; k++) {
        if (spectra.frequencies[k] >= lowHz && spectra.frequencies[k] < highHz) power += spectra.syy[k] * df;
    }
    return { value: Math.sqrt(power), reasonCode: null };
}
