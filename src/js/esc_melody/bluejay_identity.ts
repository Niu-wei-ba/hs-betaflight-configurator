import CryptoES from "crypto-es";

interface BluejayDevice {
    signature?: number;
    interfaceMode?: number;
    settingsOffset?: number;
}

// Hash only the application preceding the mutable pseudo-EEPROM; never include the bootloader.
export const BLUEJAY_APPLICATION_BUILDS = Object.freeze([
    {
        release: "0.19.0",
        target: "B_X_30_24",
        signature: 0xe8b5,
        settingsOffset: 0x3000,
        headerHex: "0013ce",
        applicationSha256: "44e0c896d364c43c5321f285ccb19ad006364884d033c8caf69395bd2588e3e0",
        source: "https://github.com/bird-sanctuary/bluejay/releases/download/v0.19.0/B_X_30_24_v0.19.0.hex",
    },
    {
        release: "0.19.2",
        target: "B_X_30_24",
        signature: 0xe8b5,
        settingsOffset: 0x3000,
        headerHex: "0013ce",
        applicationSha256: "917ce9396f6f1a35952a45de563e5882f6fcd86c3eb06c29c0ae68473f9886d1",
        source: "https://github.com/bird-sanctuary/bluejay/releases/download/v0.19.2/B_X_30_24_v0.19.2.hex",
    },
]);

export function isMissingBluejayName(bytes: Uint8Array): boolean {
    return bytes.length === 16 && bytes.every((byte) => byte === 0xff || byte === 0 || byte === 0x20);
}

export function isTaggedBluejayName(bytes: Uint8Array): boolean {
    const end = bytes.findIndex((byte) => byte === 0 || byte === 0xff);
    const slice = end < 0 ? bytes : bytes.slice(0, end);
    const text = new TextDecoder().decode(slice).trim();
    return /^Bluejay(?:\s|\(|$)/i.test(text);
}

export function isCorruptBluejayName(bytes: Uint8Array): boolean {
    if (bytes.length !== 16 || isTaggedBluejayName(bytes) || isMissingBluejayName(bytes)) return false;
    const end = bytes.findIndex((byte) => byte === 0 || byte === 0xff);
    const slice = end < 0 ? bytes : bytes.slice(0, end);
    if (slice.length === 0 && bytes.some((b) => b !== 0 && b !== 0xff && b !== 0x20)) return true;
    return slice.some((b) => b < 0x20 || b > 0x7e);
}

export function getBluejayApplicationBuilds(device: BluejayDevice, header: Uint8Array) {
    const headerHex = Array.from(header, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return BLUEJAY_APPLICATION_BUILDS.filter(
        (build) =>
            [0, 1].includes(device.interfaceMode ?? -1) &&
            build.signature === device.signature &&
            build.settingsOffset === device.settingsOffset &&
            build.headerHex === headerHex,
    );
}

export function matchBluejayApplication(device: BluejayDevice, header: Uint8Array, application: Uint8Array) {
    if (application.length !== device.settingsOffset) return null;
    const words: number[] = [];
    for (let index = 0; index < application.length; index += 1) {
        words[index >>> 2] = (words[index >>> 2] || 0) | (application[index] << (24 - (index % 4) * 8));
    }
    const digest = CryptoES.SHA256(CryptoES.lib.WordArray.create(words, application.length)).toString();
    return getBluejayApplicationBuilds(device, header).find((build) => build.applicationSha256 === digest) || null;
}
