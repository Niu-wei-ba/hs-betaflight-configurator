export const ESC_EEPROM_BACKUPS_KEY = "betaflight.esc-melody.eeprom-backups.v1";
export const ESC_EEPROM_BACKUP_FORMAT = "betaflight-esc-eeprom-backup";
export const ESC_EEPROM_BACKUP_VERSION = 1;
export const ESC_EEPROM_BACKUP_HISTORY_LIMIT = 20;
export const ESC_EEPROM_BACKUP_FILE_MAX_BYTES = 1024 * 1024;

export function createEscBackupPackage(escs, { now = new Date(), id } = {}) {
    const targets = Array.isArray(escs) ? escs : [];
    if (!targets.length) throw new Error("没有可备份的电调。");

    const createdAt = normalizeDate(now);
    const backup = {
        format: ESC_EEPROM_BACKUP_FORMAT,
        version: ESC_EEPROM_BACKUP_VERSION,
        id: id || createBackupId(createdAt),
        createdAt,
        escCount: targets.length,
        escs: targets.map(serializeEscBackup),
    };
    assertEscBackupPackage(backup);
    return backup;
}

export function saveEscBackup(backup, storage = globalThis.localStorage) {
    assertEscBackupPackage(backup);
    if (!storage?.setItem) throw new Error("无法访问浏览器本地存储，写入已禁用。");

    const history = loadEscBackups(storage).filter((item) => item.id !== backup.id);
    history.unshift(backup);
    try {
        storage.setItem(ESC_EEPROM_BACKUPS_KEY, JSON.stringify(history.slice(0, ESC_EEPROM_BACKUP_HISTORY_LIMIT)));
    } catch (error) {
        throw new Error(`无法保存本地 EEPROM 备份：${error?.message || "本地存储写入失败"}`);
    }
    return backup;
}

export function loadEscBackups(storage = globalThis.localStorage) {
    if (!storage?.getItem) return [];
    try {
        const history = JSON.parse(storage.getItem(ESC_EEPROM_BACKUPS_KEY) || "[]");
        if (!Array.isArray(history)) return [];
        return history.filter(isEscBackupPackage).slice(0, ESC_EEPROM_BACKUP_HISTORY_LIMIT);
    } catch {
        return [];
    }
}

export function findEscBackup(backupId, storage = globalThis.localStorage) {
    if (!backupId) return null;
    return loadEscBackups(storage).find((backup) => backup.id === backupId) || null;
}

export function validateEscBackup(backup, escs) {
    const errors = [];
    if (!isEscBackupPackage(backup)) {
        return { valid: false, errors: ["本地 EEPROM 备份不存在或已损坏。"] };
    }

    const targets = Array.isArray(escs) ? escs : [];
    if (!targets.length) errors.push("当前没有可写入的电调。");
    if (backup.escs.length !== targets.length) errors.push("备份中的电调数量与当前扫描结果不一致。");

    const currentByChannel = new Map(targets.map((esc) => [esc.channel, esc]));
    for (const saved of backup.escs) {
        const current = currentByChannel.get(saved.channel);
        if (!current) {
            errors.push(`备份中的第 ${saved.channel + 1} 路电调不在当前扫描结果中。`);
            continue;
        }
        for (const [savedKey, currentKey, label] of IDENTITY_FIELDS) {
            if (normalizeOptional(saved[savedKey]) !== normalizeOptional(current[currentKey])) {
                errors.push(`第 ${saved.channel + 1} 路电调的${label}与备份不一致。`);
            }
        }

        if (!current.backedUp || !current.originalEeprom) {
            errors.push(`第 ${saved.channel + 1} 路电调没有本次扫描生成的内存备份。`);
        } else if (saved.eeprom.data !== bytesToHex(current.originalEeprom)) {
            errors.push(`第 ${saved.channel + 1} 路电调的原始 EEPROM 与本地备份不一致。`);
        }

        if (Number.isInteger(current.settingsChecksumAddress)) {
            if (!current.originalSettingsChecksum) {
                errors.push(`第 ${saved.channel + 1} 路电调缺少原始配置校验字节。`);
            } else if (saved.settingsChecksum?.data !== bytesToHex(current.originalSettingsChecksum)) {
                errors.push(`第 ${saved.channel + 1} 路电调的配置校验字节与本地备份不一致。`);
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

export function getPersistedEscBackupStatus(backupId, escs, storage = globalThis.localStorage) {
    const backup = findEscBackup(backupId, storage);
    return { backup, ...validateEscBackup(backup, escs) };
}

export function parseEscBackupFile(contents, { fileSize } = {}) {
    if (Number.isFinite(fileSize) && fileSize > ESC_EEPROM_BACKUP_FILE_MAX_BYTES) {
        throw new Error("EEPROM 备份文件超过 1 MiB，已拒绝导入。");
    }
    if (typeof contents !== "string" || !contents.trim()) {
        throw new Error("EEPROM 备份文件为空。");
    }
    const encodedLength = new TextEncoder().encode(contents).length;
    if (encodedLength > ESC_EEPROM_BACKUP_FILE_MAX_BYTES) {
        throw new Error("EEPROM 备份文件超过 1 MiB，已拒绝导入。");
    }

    let backup;
    try {
        backup = JSON.parse(contents);
    } catch {
        throw new Error("EEPROM 备份文件不是有效的 JSON。");
    }
    if (backup?.format !== ESC_EEPROM_BACKUP_FORMAT) {
        throw new Error("文件不是 Betaflight ESC EEPROM 备份。");
    }
    if (backup.version !== ESC_EEPROM_BACKUP_VERSION) {
        throw new Error(`不支持 EEPROM 备份版本 ${String(backup.version)}。`);
    }
    if (!isEscBackupPackage(backup)) {
        throw new Error("EEPROM 备份包数据不完整。");
    }
    return backup;
}

export function matchEscBackupForRestore(backup, escs) {
    assertEscBackupPackage(backup);
    const currentByChannel = new Map((Array.isArray(escs) ? escs : []).map((esc) => [esc.channel, esc]));
    const matches = backup.escs.map((backupEntry) => {
        const esc = currentByChannel.get(backupEntry.channel) || null;
        const errors = [];
        if (!esc) {
            errors.push(`当前扫描结果中没有第 ${backupEntry.channel + 1} 路电调。`);
        } else {
            if (!esc.canBackup || !esc.canWrite) {
                errors.push(esc.reason || "当前电调不支持完整 EEPROM 恢复。");
            }
            errors.push(...getEscRestoreIdentityErrors(backupEntry, esc));
        }
        return {
            backupEntry,
            esc,
            valid: errors.length === 0,
            errors,
        };
    });
    return {
        matches,
        validCount: matches.filter((match) => match.valid).length,
    };
}

export function decodeEscBackupEntry(backupEntry) {
    if (!backupEntry || !isEncodedBytes(backupEntry.eeprom, backupEntry.settingsLength)) {
        throw new Error("EEPROM 备份通道数据无效。");
    }
    if (Number.isInteger(backupEntry.settingsChecksumAddress) && !isEncodedBytes(backupEntry.settingsChecksum, 4)) {
        throw new Error("OX32 配置校验备份无效。");
    }
    return {
        eeprom: hexToBytes(backupEntry.eeprom.data),
        settingsChecksum: backupEntry.settingsChecksum ? hexToBytes(backupEntry.settingsChecksum.data) : null,
    };
}

export function downloadEscBackup(
    backup,
    { documentRef = globalThis.document, urlApi = globalThis.URL, BlobCtor = globalThis.Blob } = {},
) {
    assertEscBackupPackage(backup);
    if (!documentRef?.createElement || !urlApi?.createObjectURL || !BlobCtor) {
        throw new Error("当前环境无法下载 EEPROM 备份文件，写入已禁用。");
    }

    const filename = createBackupFilename(backup.createdAt);
    const blob = new BlobCtor([`${JSON.stringify(backup, null, 2)}\n`], {
        type: "application/json;charset=utf-8",
    });
    const url = urlApi.createObjectURL(blob);
    const anchor = documentRef.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    documentRef.body?.appendChild(anchor);
    try {
        anchor.click();
    } catch (error) {
        throw new Error(`无法下载 EEPROM 备份文件：${error?.message || "下载启动失败"}`);
    } finally {
        anchor.remove();
        urlApi.revokeObjectURL?.(url);
    }
    return filename;
}

export function assertEscBackupPackage(backup) {
    if (!isEscBackupPackage(backup)) throw new Error("EEPROM 备份包数据不完整。");
    return backup;
}

export function isEscBackupPackage(backup) {
    if (
        !backup ||
        backup.format !== ESC_EEPROM_BACKUP_FORMAT ||
        backup.version !== ESC_EEPROM_BACKUP_VERSION ||
        typeof backup.id !== "string" ||
        !backup.id ||
        typeof backup.createdAt !== "string" ||
        Number.isNaN(Date.parse(backup.createdAt)) ||
        !Array.isArray(backup.escs) ||
        !backup.escs.length ||
        backup.escCount !== backup.escs.length
    ) {
        return false;
    }

    const channels = new Set();
    for (const esc of backup.escs) {
        if (
            !Number.isInteger(esc?.channel) ||
            esc.channel < 0 ||
            channels.has(esc.channel) ||
            typeof esc.model !== "string" ||
            !esc.model ||
            !["bluejay", "am32", "ox32", "blheli32", "unknown"].includes(esc.firmwareFamily) ||
            typeof esc.firmwareVersion !== "string" ||
            typeof esc.layout !== "string" ||
            !Number.isInteger(esc.settingsOffset) ||
            esc.settingsOffset < 0 ||
            !Number.isInteger(esc.melodyRelativeOffset) ||
            esc.melodyRelativeOffset < 0 ||
            !isEncodedBytes(esc.eeprom) ||
            !Number.isInteger(esc.settingsLength) ||
            esc.settingsLength <= 0 ||
            esc.eeprom.byteLength !== esc.settingsLength
        ) {
            return false;
        }
        if (
            (Number.isInteger(esc.settingsChecksumAddress) && !isEncodedBytes(esc.settingsChecksum, 4)) ||
            (esc.firmwareFamily === "ox32" &&
                (!Number.isInteger(esc.settingsChecksumAddress) || !isEncodedBytes(esc.settingsChecksum, 4)))
        ) {
            return false;
        }
        channels.add(esc.channel);
    }
    return true;
}

function serializeEscBackup(esc) {
    const eeprom = toUint8Array(esc?.originalEeprom);
    if (!esc?.backedUp || !eeprom.length) {
        throw new Error(`第 ${(esc?.channel ?? 0) + 1} 路电调尚未读取原始 EEPROM。`);
    }
    if (!Number.isInteger(esc.settingsLength) || eeprom.length !== esc.settingsLength) {
        throw new Error(`第 ${esc.channel + 1} 路电调的 EEPROM 长度与布局不一致。`);
    }

    const checksum = toUint8Array(esc.originalSettingsChecksum);
    if (Number.isInteger(esc.settingsChecksumAddress) && checksum.length !== 4) {
        throw new Error(`第 ${esc.channel + 1} 路电调缺少原始配置校验字节。`);
    }

    return {
        channel: esc.channel,
        model: String(esc.model || ""),
        firmwareFamily: String(esc.firmwareFamily || "unknown"),
        firmwareVersion: String(esc.version || ""),
        layout: String(esc.layout || ""),
        signature: normalizeOptional(esc.signature),
        deviceIdentity: normalizeOptional(esc.deviceIdentity),
        interfaceMode: normalizeOptional(esc.interfaceMode),
        inputPin: normalizeOptional(esc.inputPin),
        bootloader: normalizeOptional(esc.bootloader),
        bootloaderVersion: normalizeOptional(esc.bootloaderVersion),
        parameterVersion: normalizeOptional(esc.parameterVersion),
        settingsOffset: normalizeOptional(esc.settingsOffset),
        settingsLength: esc.settingsLength,
        melodyRelativeOffset: normalizeOptional(esc.melodyRelativeOffset),
        waitRelativeOffset: normalizeOptional(esc.waitRelativeOffset),
        settingsPageSize: normalizeOptional(esc.settingsPageSize),
        settingsChecksumAddress: normalizeOptional(esc.settingsChecksumAddress),
        eeprom: encodeBytes(eeprom),
        settingsChecksum: checksum.length ? encodeBytes(checksum) : null,
    };
}

const IDENTITY_FIELDS = [
    ["model", "model", "型号"],
    ["firmwareFamily", "firmwareFamily", "固件家族"],
    ["firmwareVersion", "version", "固件版本"],
    ["layout", "layout", "布局"],
    ["signature", "signature", "芯片签名"],
    ["deviceIdentity", "deviceIdentity", "设备身份"],
    ["interfaceMode", "interfaceMode", "接口模式"],
    ["inputPin", "inputPin", "引脚标识"],
    ["bootloader", "bootloader", "Bootloader"],
    ["bootloaderVersion", "bootloaderVersion", "Bootloader 版本"],
    ["parameterVersion", "parameterVersion", "参数版本"],
    ["settingsOffset", "settingsOffset", "配置地址"],
    ["settingsLength", "settingsLength", "配置长度"],
    ["melodyRelativeOffset", "melodyRelativeOffset", "旋律地址"],
    ["waitRelativeOffset", "waitRelativeOffset", "等待时间地址"],
    ["settingsPageSize", "settingsPageSize", "配置页大小"],
    ["settingsChecksumAddress", "settingsChecksumAddress", "校验地址"],
];

export function getEscRestoreIdentityErrors(saved, current) {
    const errors = [];
    for (const [savedKey, currentKey, label] of IDENTITY_FIELDS) {
        if (normalizeOptional(saved[savedKey]) !== normalizeOptional(current[currentKey])) {
            errors.push(`第 ${saved.channel + 1} 路电调的${label}与备份不一致。`);
        }
    }
    return errors;
}

function encodeBytes(value) {
    const bytes = toUint8Array(value);
    return {
        encoding: "hex",
        byteLength: bytes.length,
        data: bytesToHex(bytes),
    };
}

function isEncodedBytes(value, expectedLength) {
    return (
        value?.encoding === "hex" &&
        Number.isInteger(value.byteLength) &&
        value.byteLength >= 0 &&
        (expectedLength === undefined || value.byteLength === expectedLength) &&
        typeof value.data === "string" &&
        value.data.length === value.byteLength * 2 &&
        /^[0-9a-f]*$/i.test(value.data)
    );
}

function bytesToHex(value) {
    return Array.from(toUint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value) {
    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
}

function toUint8Array(value) {
    if (value instanceof Uint8Array) return value;
    if (Array.isArray(value) || ArrayBuffer.isView(value)) return new Uint8Array(value);
    return new Uint8Array();
}

function normalizeOptional(value) {
    return value === undefined || value === null ? null : value;
}

function normalizeDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("EEPROM 备份时间无效。");
    return date.toISOString();
}

function createBackupId(createdAt) {
    const random = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10);
    return `esc-backup-${createdAt.replace(/\D/g, "").slice(0, 17)}-${random}`;
}

function createBackupFilename(createdAt) {
    return `betaflight-esc-eeprom-${createdAt.replace(/\D/g, "").slice(0, 15)}.json`;
}
