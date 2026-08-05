export const ESC_FIRMWARE = Object.freeze({
    BLUEJAY: "bluejay",
    AM32: "am32",
    OX32: "ox32",
    BLHELI32: "blheli32",
    UNKNOWN: "unknown",
});

export const ESC_MELODY_READ_STATUS = Object.freeze({
    IDLE: "idle",
    LOADED: "loaded",
    EMPTY: "empty",
    ERROR: "error",
    UNSUPPORTED: "unsupported",
    REPLACEMENT: "replacement",
});

export const ESC_FIRMWARE_CONFIRMATION_STATUS = Object.freeze({
    PENDING: "pending",
    VERIFYING: "verifying",
    VERIFIED: "verified",
    UNSUPPORTED: "unsupported",
    FAILED: "failed",
});

const CAPABILITY_MATRIX = {
    [ESC_FIRMWARE.BLUEJAY]: {
        label: "Bluejay",
        canRead: true,
        canBackup: true,
        canWrite: true,
        capacity: 128,
        supportsWait: true,
        layout: "Pseudo-EEPROM · 128 B melody + rests",
        storageCommand: "flash",
    },
    [ESC_FIRMWARE.AM32]: {
        label: "AM32",
        canRead: true,
        canBackup: true,
        canWrite: true,
        capacity: 128,
        supportsWait: true,
        layout: "Flash EEPROM · 128 B melody + rests",
        storageCommand: "flash",
    },
    [ESC_FIRMWARE.OX32]: {
        label: "OX32",
        canRead: true,
        canBackup: true,
        canWrite: true,
        capacity: 128,
        supportsWait: true,
        layout: "Flash config page · 128 B melody + rests",
        storageCommand: "flash",
    },
    [ESC_FIRMWARE.BLHELI32]: {
        label: "BLHeli_32",
        canRead: true,
        canBackup: true,
        canWrite: false,
        capacity: 128,
        supportsWait: false,
        layout: "ARM flash · read only",
        storageCommand: "flash",
        reason: "BLHeli_32 cannot be written through this tool. Migrate to AM32 with ST-Link or the ESC bootloader.",
    },
    [ESC_FIRMWARE.UNKNOWN]: {
        label: "Unknown",
        canRead: false,
        canBackup: false,
        canWrite: false,
        capacity: 0,
        supportsWait: false,
        layout: "Unknown EEPROM layout",
        storageCommand: "flash",
        reason: "Firmware family was not recognised. Do not write to this ESC.",
    },
};

export function getEscCapabilities(firmwareFamily) {
    return { ...(CAPABILITY_MATRIX[firmwareFamily] || CAPABILITY_MATRIX[ESC_FIRMWARE.UNKNOWN]) };
}

export function createEscRecord(channel, info = {}) {
    const firmwareFamily = normalizeFirmwareFamily(info.firmwareFamily || info.firmware || info.name || info.text);
    const capability = getEscCapabilities(firmwareFamily);
    return {
        channel,
        id: `esc-${channel}`,
        model: info.model || info.name || "ESC not identified",
        firmwareFamily,
        firmwareLabel: capability.label,
        version: info.version || "--",
        layout: info.layout || capability.layout,
        canRead: info.canRead ?? capability.canRead,
        canBackup: info.canBackup ?? capability.canBackup,
        canWrite: info.canWrite ?? capability.canWrite,
        capacity: info.capacity ?? capability.capacity,
        supportsWait: info.supportsWait ?? capability.supportsWait,
        storageCommand: info.storageCommand || capability.storageCommand,
        settingsOffset: info.settingsOffset,
        settingsLength: info.settingsLength,
        melodyRelativeOffset: info.melodyRelativeOffset,
        waitRelativeOffset: info.waitRelativeOffset,
        erasePage: info.erasePage,
        settingsPageSize: info.settingsPageSize,
        settingsChecksumAddress: info.settingsChecksumAddress,
        signature: info.signature,
        interfaceMode: info.interfaceMode,
        inputPin: info.inputPin,
        bootloader: info.bootloader,
        bootloaderVersion: info.bootloaderVersion,
        parameterVersion: info.parameterVersion,
        deviceIdentity: info.deviceIdentity,
        activated: info.activated,
        reason: info.reason || capability.reason || "",
        status: info.status || "idle",
        backedUp: Boolean(info.backedUp),
        verified: Boolean(info.verified),
        originalEeprom: info.originalEeprom || null,
        currentEeprom: info.currentEeprom || null,
        originalSettingsChecksum: info.originalSettingsChecksum || null,
        currentSettingsChecksum: info.currentSettingsChecksum || null,
        currentMelody: info.currentMelody || null,
        currentMelodyBytes: info.currentMelodyBytes || null,
        currentWaitBytes: info.currentWaitBytes || null,
        melodyReadStatus: info.melodyReadStatus || ESC_MELODY_READ_STATUS.IDLE,
        melodyReadError: info.melodyReadError || "",
        melodyDirty: Boolean(info.melodyDirty),
        // Discovery is deliberately not an authorization decision. A scan may
        // suggest a family, but only an explicit user confirmation followed by
        // a layout probe permits EEPROM access.
        detectedFirmwareFamily: info.detectedFirmwareFamily || firmwareFamily,
        detectedFirmwareLabel: info.detectedFirmwareLabel || capability.label,
        confirmedFirmwareFamily: info.confirmedFirmwareFamily || null,
        confirmationStatus: info.confirmationStatus || ESC_FIRMWARE_CONFIRMATION_STATUS.PENDING,
        confirmationReason: info.confirmationReason || "",
        layoutVerified: Boolean(info.layoutVerified),
    };
}

export function normalizeFirmwareFamily(value) {
    const text = String(value || "").toLowerCase();
    if (text.includes("bluejay")) return ESC_FIRMWARE.BLUEJAY;
    if (text.includes("am32")) return ESC_FIRMWARE.AM32;
    if (text.includes("ox32") || text.includes("oxbot")) return ESC_FIRMWARE.OX32;
    if (text.includes("blheli_32") || text.includes("blheli32") || text.includes("blheli 32")) {
        return ESC_FIRMWARE.BLHELI32;
    }
    return ESC_FIRMWARE.UNKNOWN;
}

/**
 * 4-way device-info responses are not identical across ESC families. Decode
 * printable fields opportunistically and keep unknown bytes opaque.
 */
export function decodeEscInfo(params, channel) {
    const bytes = params instanceof Uint8Array ? params : new Uint8Array(params || []);
    if (bytes.length === 4) return decodeFourWayDeviceInfo(bytes, channel);
    const text = new TextDecoder()
        .decode(bytes)
        .replace(/[\u0000\uffff]/g, " ")
        .replace(/[^\x20-\x7e]+/g, " ")
        .trim();
    const versionMatch = text.match(/(?:v|version\s*)?(\d+\.\d+(?:\.\d+)?)/i);
    const family = normalizeFirmwareFamily(text);
    return createEscRecord(channel, {
        model:
            text.split(/\s{2,}|\u0000/)[0]?.trim() ||
            `${family === ESC_FIRMWARE.UNKNOWN ? "ESC" : family} channel ${channel + 1}`,
        firmwareFamily: family,
        version: versionMatch?.[1] || "--",
    });
}

export function applyEscFirmwareFamily(esc, firmwareFamily, overrides = {}) {
    const capability = getEscCapabilities(firmwareFamily);
    Object.assign(esc, capability, overrides, {
        firmwareFamily,
        firmwareLabel: capability.label,
        reason: overrides.reason ?? capability.reason ?? "",
    });
    return esc;
}

/**
 * Keep the low-risk discovery metadata, but remove every EEPROM permission
 * until a person has confirmed the firmware family for this connected session.
 */
export function lockEscForFirmwareConfirmation(esc) {
    if (!esc || esc.status === "unavailable") return esc;
    esc.detectedFirmwareFamily = esc.firmwareFamily || ESC_FIRMWARE.UNKNOWN;
    esc.detectedFirmwareLabel = getEscCapabilities(esc.detectedFirmwareFamily).label;
    esc.confirmedFirmwareFamily = null;
    esc.confirmationStatus = ESC_FIRMWARE_CONFIRMATION_STATUS.PENDING;
    esc.confirmationReason = "请确认电调固件类型；确认并验证布局前不会读取、备份或写入 EEPROM。";
    esc.layoutVerified = false;
    esc.canRead = false;
    esc.canBackup = false;
    esc.canWrite = false;
    esc.backedUp = false;
    esc.currentMelody = null;
    esc.currentMelodyBytes = null;
    esc.currentWaitBytes = null;
    esc.melodyReadStatus = ESC_MELODY_READ_STATUS.IDLE;
    esc.melodyReadError = "";
    return esc;
}

export function getWritableEscs(escs) {
    return (escs || []).filter((esc) => esc.canWrite && esc.canBackup);
}

export function getIdentifiedEscCount(escs) {
    return (escs || []).filter((esc) => esc && !["idle", "unavailable"].includes(esc.status)).length;
}

export function hasUnsupportedEsc(escs) {
    return (escs || []).some((esc) => !esc.canWrite);
}

const SILABS_MCUS = Object.freeze({
    0xe8b1: { name: "EFM8BB10x", settingsOffset: 0x1a00, pageSize: 512, eraseMultiplier: 1 },
    0xe8b2: { name: "EFM8BB21x", settingsOffset: 0x1a00, pageSize: 512, eraseMultiplier: 1 },
    0xe8b5: { name: "EFM8BB51x", settingsOffset: 0x3000, pageSize: 2048, eraseMultiplier: 4 },
});

const AM32_MCUS = Object.freeze({
    0x1f06: { name: "STM32F051", settingsOffset: 0x7c00, pageSize: 1024 },
    0x3506: { name: "ARM64K / GD32", settingsOffset: 0xf800, pageSize: 1024 },
    // AM32's official NXP MCXA153 target uses a 64 KiB flash image with an
    // 8 KiB configuration sector starting at 0xE000. Its official Bootloader
    // identifies that target with flash-size code 0x15, which Betaflight's
    // 4-way interface exposes as ARM signature 0x1506.
    0x1506: { name: "NXP MCXA153", settingsOffset: 0xe000, pageSize: 8192 },
});

const AM32_BOOTLOADER_PINS = new Set([0x02, 0x06, 0x14]);

export function getAm32LayoutForEsc(esc) {
    if (!esc || esc.interfaceMode !== 4 || !AM32_BOOTLOADER_PINS.has(esc.inputPin)) return null;
    const knownMcu = AM32_MCUS[esc.signature];
    if (!knownMcu) return null;
    return {
        ...knownMcu,
        name: knownMcu.name,
    };
}

function decodeFourWayDeviceInfo(bytes, channel) {
    const signature = bytes[0] | (bytes[1] << 8);
    const inputPin = bytes[2];
    const interfaceMode = bytes[3];
    const silabs = SILABS_MCUS[signature];
    if (silabs) {
        const erasePage = (silabs.settingsOffset / silabs.pageSize) * silabs.eraseMultiplier;
        return createEscRecord(channel, {
            model: silabs.name,
            firmwareFamily: ESC_FIRMWARE.UNKNOWN,
            version: "probe required",
            layout: `SiLabs 0x${silabs.settingsOffset.toString(16).toUpperCase()}`,
            reason: "SiLabs MCU detected. Confirming Bluejay from the firmware name before enabling writes.",
            signature,
            inputPin,
            interfaceMode,
            settingsOffset: silabs.settingsOffset,
            settingsLength: 0xff,
            melodyRelativeOffset: 0x70,
            waitRelativeOffset: 0xf0,
            erasePage,
        });
    }

    const arm = AM32_MCUS[signature];
    if (arm && interfaceMode === 4 && AM32_BOOTLOADER_PINS.has(inputPin)) {
        return createEscRecord(channel, {
            model: arm.name,
            firmwareFamily: ESC_FIRMWARE.AM32,
            version: "reading",
            layout: `Flash 0x${arm.settingsOffset.toString(16).toUpperCase()} + 0x30`,
            signature,
            inputPin,
            interfaceMode,
            settingsOffset: arm.settingsOffset,
            settingsPageSize: arm.pageSize,
            settingsLength: 0xb0,
            melodyRelativeOffset: 0x30,
        });
    }

    if (interfaceMode === 4) {
        return createEscRecord(channel, {
            model: `ARM ESC 0x${signature.toString(16).toUpperCase()}`,
            firmwareFamily: ESC_FIRMWARE.BLHELI32,
            signature,
            inputPin,
            interfaceMode,
        });
    }

    return createEscRecord(channel, {
        model: `ESC 0x${signature.toString(16).toUpperCase()}`,
        signature,
        inputPin,
        interfaceMode,
    });
}
