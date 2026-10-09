// Synthetic binary BBL fixtures generated from explicit header/predictor contracts.
const encodeUnsigned = (value) => {
    const bytes = [];
    let n = value >>> 0;
    do {
        const byte = n & 127;
        n >>>= 7;
        bytes.push(byte | (n ? 128 : 0));
    } while (n);
    return bytes;
};
const encodeSigned = (value) => encodeUnsigned(((value << 1) ^ (value >> 31)) >>> 0);

export function makeLog({
    samples = 8192,
    fs = 1024,
    headerFs = fs,
    divider = 1,
    highResolution = 0,
    revision = "Betaflight 2026.6.1 (test)",
    input,
    output,
    gaps = new Map(),
    extraHeaders = [],
    explicitP = String(divider),
    grouped = false,
} = {}) {
    const names = [
        "loopIteration",
        "time",
        ...[0, 1, 2].map((i) => `setpoint[${i}]`),
        ...[0, 1, 2].map((i) => `gyroADC[${i}]`),
    ];
    if (grouped) names.push("axisI[0]", "axisI[1]", "axisI[2]");
    const predictorsI = Array(names.length).fill(0);
    const predictorsP = [6, 2, ...Array(names.length - 2).fill(1)];
    const encI = [1, 1, ...Array(names.length - 2).fill(0)];
    const encP = [9, 0, ...Array(names.length - 2).fill(0)];
    if (grouped) encP.splice(8, 3, 7, 7, 7);
    const headers = [
        "H Product:Blackbox flight data recorder by Nicholas Sherlock",
        "H Data version:2",
        `H Firmware revision:${revision}`,
        "H Firmware API version:1.48.0",
        "H debug_mode:0",
        `H looptime:${1000000 / (headerFs * divider)}`,
        "H pid_process_denom:1",
        "H I interval:32",
        `H P interval:${explicitP}`,
        `H blackbox_high_resolution:${highResolution}`,
        `H Field I name:${names.join(",")}`,
        `H Field I signed:${names.map((_, i) => (i < 2 ? 0 : 1)).join(",")}`,
        `H Field I predictor:${predictorsI.join(",")}`,
        `H Field I encoding:${encI.join(",")}`,
        `H Field P predictor:${predictorsP.join(",")}`,
        `H Field P encoding:${encP.join(",")}`,
        ...extraHeaders,
    ];
    const body = [];
    let previous = null;
    let previous2 = null;
    let timeOffset = 0;
    for (let n = 0; n < samples; n++) {
        timeOffset += gaps.get(n) ?? 0;
        const x = Math.round((input?.(n) ?? 100 * Math.sin(n / 13)) * (highResolution ? 10 : 1));
        const y = Math.round((output?.(n) ?? x / (highResolution ? 10 : 1)) * (highResolution ? 10 : 1));
        const frame = [n * divider, Math.round(100000 + (n * 1000000) / fs + timeOffset), x, x, x, y, y, y];
        if (grouped) frame.push(0, 0, 0);
        const intra = frame[0] % 32 === 0;
        body.push(intra ? 73 : 80);
        if (intra) {
            frame.forEach((v, i) => body.push(...(i < 2 ? encodeUnsigned(v) : encodeSigned(v))));
            previous2 = frame;
        } else {
            body.push(...encodeSigned(frame[1] - (previous2 ? 2 * previous[1] - previous2[1] : previous[1])));
            for (let i = 2; i < 8; i++) body.push(...encodeSigned(frame[i] - previous[i]));
            if (grouped) body.push(0); // TAG2_3S32: three zero residuals.
            previous2 = previous;
        }
        previous = frame;
    }
    body.push(69, 255, ...new TextEncoder().encode("End of log\0"));
    const header = new TextEncoder().encode(`${headers.join("\n")}\n`);
    const bytes = new Uint8Array(header.length + body.length);
    bytes.set(header);
    bytes.set(body, header.length);
    return bytes;
}

export function seededSignal(length, amplitude = 100) {
    let seed = 123456;
    return Float64Array.from({ length }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return amplitude * ((2 * seed) / 2 ** 32 - 1);
    });
}
