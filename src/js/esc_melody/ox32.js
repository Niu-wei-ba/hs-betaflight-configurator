import CryptoES from "crypto-es";
import { crc16Xmodem } from "./four_way.js";

export const OX32_HANDSHAKE_OFFSET = 0x0f7f;
export const OX32_HANDSHAKE_LENGTH = 92;
export const OX32_SETTINGS_LENGTH = 204;
export const OX32_MELODY_RELATIVE_OFFSET = 0x44;
export const OX32_MELODY_CAPACITY = 128;

const OX32_LAYOUTS = Object.freeze({
    "1.00": Object.freeze({
        oemOffset: 0x1000,
        settingsOffset: 0x1400,
        pageSize: 0x400,
    }),
    "2.00": Object.freeze({
        oemOffset: 0xf000,
        settingsOffset: 0xf400,
        pageSize: 0x400,
    }),
    "3.00": Object.freeze({
        oemOffset: 0xf000,
        settingsOffset: 0xf400,
        pageSize: 0x400,
    }),
});

export function parseOx32Handshake(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    if (bytes.length < 39) return null;

    const bootloader = decodeAscii(bytes, 20, 4);
    const bootloaderVersion = decodeVersion(bytes, 24);
    if (!/^IO\d{2}$/i.test(bootloader) || !bootloaderVersion) return null;

    return {
        license: decodeHex(bytes, 0, 8),
        mcuId: decodeHex(bytes, 8, 12),
        bootloader: bootloader.toUpperCase(),
        bootloaderVersion,
        firmwareVersion: decodeVersion(bytes, 27) || "--",
        deviceId: decodeHex(bytes, 30, 6),
        parameterVersion: decodeVersion(bytes, 36) || "--",
    };
}

export function verifyOx32License(handshake) {
    if (!handshake?.license || !handshake?.mcuId) return false;
    const expected = CryptoES.SHA1(handshake.mcuId).toString().slice(0, 16).toUpperCase();
    return expected === handshake.license.toUpperCase();
}

export function getOx32Layout(bootloaderVersion) {
    const layout = OX32_LAYOUTS[bootloaderVersion];
    if (!layout) return null;
    return {
        ...layout,
        settingsLength: OX32_SETTINGS_LENGTH,
        melodyRelativeOffset: OX32_MELODY_RELATIVE_OFFSET,
        melodyCapacity: OX32_MELODY_CAPACITY,
        checksumAddress: layout.settingsOffset + layout.pageSize - 4,
    };
}

export function decodeOx32Model(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    const end = bytes.findIndex((byte) => byte === 0 || byte === 0xff);
    const model = new TextDecoder().decode(end < 0 ? bytes : bytes.slice(0, end)).trim();
    return model || "OX32 ESC";
}

export function createOx32ChecksumTrailer(settings) {
    const bytes = settings instanceof Uint8Array ? settings : new Uint8Array(settings || []);
    if (bytes.length !== OX32_SETTINGS_LENGTH) {
        throw new RangeError(`OX32 settings image must be ${OX32_SETTINGS_LENGTH} bytes`);
    }
    const checksum = crc16Xmodem(bytes);
    return new Uint8Array([0xff, 0xff, checksum & 0xff, (checksum >> 8) & 0xff]);
}

function decodeAscii(bytes, offset, length) {
    return new TextDecoder()
        .decode(bytes.slice(offset, offset + length))
        .replace(/\0/g, "")
        .trim();
}

function decodeHex(bytes, offset, length) {
    return Array.from(bytes.slice(offset, offset + length), (byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
}

function decodeVersion(bytes, offset) {
    const encoded = decodeAscii(bytes, offset, 3);
    return /^\d{3}$/.test(encoded) ? `${encoded[0]}.${encoded.slice(1)}` : "";
}
