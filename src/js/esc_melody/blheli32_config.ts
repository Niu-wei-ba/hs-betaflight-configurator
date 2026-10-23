export const BLHELI32_SETTINGS_LENGTH = 192;
export const BLHELI32_WIRE_LENGTH = 256;
export const BLHELI32_SETTINGS_OFFSET = 0x7c00;
export const BLHELI32_MELODY_OFFSET = 0x90;
export const BLHELI32_MODE_OFFSET = 0x1c;
export const BLHELI32_MELODY_LENGTH = 48;

const ROUNDS = 32;
const DELTA = 0x9e3779b9;
const KEY = [0x81fbc617, 0x9e81c901, 0x29a1fa54, 0x318234b4];
const VERIFIED_LAYOUT = new TextEncoder().encode("#FPV32#".padEnd(32, " "));
const VERIFIED_MCU = new TextEncoder().encode("#BLHeli_32*AT32F421#".padEnd(32, " "));

export interface Blheli32DeviceIdentity {
    signature?: number;
    inputPin?: number;
    interfaceMode?: number;
}

function requireBytes(bytes: Uint8Array, length: number, label: string): void {
    if (!(bytes instanceof Uint8Array) || bytes.length !== length) {
        throw new Error(`${label} must contain exactly ${length} bytes`);
    }
}

function mix(value: number): number {
    return (((value << 4) ^ (value >>> 5)) + value) >>> 0;
}

// Each encrypted 8-byte block contains a discarded 2-byte random prefix and 6 logical bytes.
// See blheli32_config.sources.md for the verified branch, mapping and captured vectors.
export function decodeBlheli32Settings(raw: Uint8Array): Uint8Array {
    requireBytes(raw, BLHELI32_WIRE_LENGTH, "BLHeli_32 read block");
    const output = new Uint8Array(BLHELI32_SETTINGS_LENGTH);
    const source = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    const block = new Uint8Array(8);
    const words = new DataView(block.buffer);
    for (let index = 0; index < 32; index += 1) {
        let first = source.getUint32(index * 8, true);
        let second = source.getUint32(index * 8 + 4, true);
        let sum = (ROUNDS * DELTA) >>> 0;
        const address = BLHELI32_SETTINGS_OFFSET + index * 8;
        for (let round = 0; round < ROUNDS; round += 1) {
            second = (second - (mix(first) ^ ((address + sum + KEY[(sum >>> 11) & 3]) >>> 0))) >>> 0;
            sum = (sum - DELTA) >>> 0;
            first = (first - (mix(second) ^ ((address + sum + KEY[sum & 3]) >>> 0))) >>> 0;
        }
        words.setUint32(0, first, true);
        words.setUint32(4, second, true);
        output.set(block.subarray(2), index * 6);
    }
    return output;
}

export function encodeBlheli32Settings(plain: Uint8Array): Uint8Array {
    requireBytes(plain, BLHELI32_SETTINGS_LENGTH, "BLHeli_32 settings");
    if (typeof globalThis.crypto?.getRandomValues !== "function") {
        throw new Error("Secure random generation is unavailable for BLHeli_32 configuration encoding");
    }
    const prefixes = globalThis.crypto.getRandomValues(new Uint8Array(64));
    const output = new Uint8Array(BLHELI32_WIRE_LENGTH);
    const destination = new DataView(output.buffer);
    const block = new Uint8Array(8);
    const words = new DataView(block.buffer);
    for (let index = 0; index < 32; index += 1) {
        block.set(prefixes.subarray(index * 2, index * 2 + 2));
        block.set(plain.subarray(index * 6, index * 6 + 6), 2);
        let first = words.getUint32(0, true);
        let second = words.getUint32(4, true);
        let sum = 0;
        const address = BLHELI32_SETTINGS_OFFSET + index * 8;
        for (let round = 0; round < ROUNDS; round += 1) {
            first = (first + (mix(second) ^ ((address + sum + KEY[sum & 3]) >>> 0))) >>> 0;
            sum = (sum + DELTA) >>> 0;
            second = (second + (mix(first) ^ ((address + sum + KEY[(sum >>> 11) & 3]) >>> 0))) >>> 0;
        }
        destination.setUint32(index * 8, first, true);
        destination.setUint32(index * 8 + 4, second, true);
    }
    return output;
}

function matchesField(settings: Uint8Array, offset: number, expected: Uint8Array): boolean {
    return expected.every((value, index) => settings[offset + index] === value);
}

function readText(settings: Uint8Array, start: number, length: number): string {
    return new TextDecoder().decode(settings.subarray(start, start + length)).trimEnd();
}

export function parseBlheli32Settings(plain: Uint8Array, device: Blheli32DeviceIdentity = {}) {
    requireBytes(plain, BLHELI32_SETTINGS_LENGTH, "BLHeli_32 settings");
    const reasons: string[] = [];
    if (device.signature !== 0x1506)
        reasons.push("Unsupported BLHeli_32 MCU signature; only AT32F421 0x1506 is verified");
    if (device.interfaceMode !== 4) reasons.push("BLHeli_32 requires ARM bootloader interface mode 4");
    if (device.inputPin !== 0x6e) reasons.push("Unsupported BLHeli_32 bootloader marker; expected 0x6E");
    if (plain[0] !== 32 || plain[1] !== 100 || plain[2] !== 48) {
        reasons.push("Unsupported BLHeli_32 firmware or layout; only 32.10 layout 0x30 is verified");
    }
    if (!matchesField(plain, 0x40, VERIFIED_LAYOUT))
        reasons.push("Unsupported BLHeli_32 target layout; expected #FPV32#");
    if (!matchesField(plain, 0x60, VERIFIED_MCU))
        reasons.push("BLHeli_32 MCU configuration tag does not match verified AT32F421");
    return {
        firmwareType: "BLHeli32",
        firmwareName: "BLHeli_32",
        version: `${plain[0]}.${plain[1] / 10}`,
        versionBytes: Array.from(plain.subarray(0, 3)),
        layout: readText(plain, 0x40, 32),
        mcu: readText(plain, 0x60, 32),
        name: readText(plain, 0x80, 16),
        melodyMode: plain[BLHELI32_MODE_OFFSET],
        melodyData: plain.slice(BLHELI32_MELODY_OFFSET, BLHELI32_MELODY_OFFSET + BLHELI32_MELODY_LENGTH),
        settings: plain.slice(),
        writable: reasons.length === 0,
        reason: reasons.join("; "),
    };
}
