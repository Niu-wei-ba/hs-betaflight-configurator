import MSP from "../msp.js";
import MSPCodes from "../msp/MSPCodes.js";
import { serial as defaultSerial } from "../serial.js";
import { FOUR_WAY_ACK, FOUR_WAY_COMMANDS, FourWaySession } from "./four_way.js";
import {
    applyEscFirmwareFamily,
    decodeEscInfo,
    createEscRecord,
    ESC_FIRMWARE,
    ESC_FIRMWARE_CONFIRMATION_STATUS,
    ESC_MELODY_READ_STATUS,
    getAm32LayoutForEsc,
} from "./esc_capabilities.js";
import { decodeFirmwareMelody, encodeFirmwareMelody, encodeWaitMs } from "./melody.js";
import {
    createOx32ChecksumTrailer,
    decodeOx32Model,
    getOx32Layout,
    OX32_HANDSHAKE_LENGTH,
    OX32_HANDSHAKE_OFFSET,
    parseOx32Handshake,
    verifyOx32License,
} from "./ox32.js";
import { decodeEscBackupEntry, getEscRestoreIdentityErrors } from "./backups.js";
import {
    BLHELI32_SETTINGS_OFFSET,
    BLHELI32_SETTINGS_LENGTH,
    BLHELI32_WIRE_LENGTH,
    BLHELI32_MODE_OFFSET,
    BLHELI32_MELODY_OFFSET,
    decodeBlheli32Settings,
    encodeBlheli32Settings,
    parseBlheli32Settings,
} from "./blheli32_config.ts";
import {
    getBluejayApplicationBuilds,
    isCorruptBluejayName,
    isMissingBluejayName,
    isTaggedBluejayName,
    matchBluejayApplication,
} from "./bluejay_identity.ts";

export class EscFourWayController {
    constructor({
        serialAdapter = defaultSerial,
        msp = MSP,
        onProgress,
        sessionFactory = (options) => new FourWaySession(options),
        enterTimeout = 5000,
        mspIdleTimeout = 1500,
        mspIdlePollDelay = 25,
        passthroughSettleDelay = 4500,
        passthroughExitDelay = 3000,
        probeAlive = false,
        initRetryDelays = [0, 500, 1000],
        writeInitRecoveryAttempts = 2,
        delay = wait,
    } = {}) {
        this.serial = serialAdapter;
        this.msp = msp;
        this.onProgress = onProgress;
        this.sessionFactory = sessionFactory;
        this.enterTimeout = enterTimeout;
        this.mspIdleTimeout = mspIdleTimeout;
        this.mspIdlePollDelay = mspIdlePollDelay;
        this.passthroughSettleDelay = passthroughSettleDelay;
        this.passthroughExitDelay = passthroughExitDelay;
        this.probeAlive = probeAlive;
        this.initRetryDelays = initRetryDelays;
        this.writeInitRecoveryAttempts = writeInitRecoveryAttempts;
        this.delay = delay;
        this.session = null;
        this.inPassthrough = false;
        this.activeChannel = null;
        this.connectedEscCount = null;
        this.passthroughSettleUntil = 0;
    }

    async enter() {
        if (this.session && this.inPassthrough) return this.session;
        await this.waitForMspIdle();
        const response = await new Promise((resolve, reject) => {
            let settled = false;
            let timer;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                callback(value);
            };
            const sent = this.msp.send_message(MSPCodes.MSP_SET_4WAY_IF, false, false, (data) => finish(resolve, data));
            if (sent === false) {
                finish(reject, new Error("Flight controller is not connected"));
                return;
            }
            if (!settled) {
                timer = setTimeout(
                    () => finish(reject, new Error("Timed out while entering ESC 4-way passthrough")),
                    this.enterTimeout,
                );
            }
        });
        this.connectedEscCount = decodeConnectedEscCount(response);
        this.inPassthrough = true;
        try {
            this.session = this.sessionFactory({ serial: this.serial });
            this.session.start();
            this.activeChannel = null;
            this.passthroughSettleUntil = Date.now() + this.passthroughSettleDelay;
            if (this.probeAlive) {
                const probed = await this.probePassthroughAlive(this.session);
                if (!probed && this.passthroughSettleDelay > 0) {
                    await this.waitForPassthroughSettle();
                }
            } else if (this.passthroughSettleDelay > 0) {
                await this.delay(this.passthroughSettleDelay);
                this.passthroughSettleUntil = 0;
            }
            return this.session;
        } catch (error) {
            // MSP has already entered 4-way, even if no usable session was created.
            await this.exit().catch(() => {});
            throw error;
        }
    }

    async probePassthroughAlive(session) {
        const deadline = Date.now() + Math.min(this.passthroughSettleDelay, 1500);
        await this.delay(100);
        while (Date.now() < deadline) {
            try {
                const response = await session.send(FOUR_WAY_COMMANDS.interfaceTestAlive, [0], 0, 250);
                return response.ack === FOUR_WAY_ACK.ok;
            } catch (error) {
                if (isTransportFailure(error)) throw error;
                await this.delay(50);
            }
        }
        return false;
    }

    /** Alive only proves interface health; an OX32 may still reject flash initialization. */
    async waitForPassthroughSettle() {
        const remaining = this.passthroughSettleUntil - Date.now();
        if (remaining > 0) await this.delay(remaining);
        this.passthroughSettleUntil = 0;
    }

    async waitForMspIdle() {
        if (!Array.isArray(this.msp?.callbacks) || this.msp.callbacks.length === 0) return;
        const deadline = Date.now() + this.mspIdleTimeout;
        while (this.msp.callbacks.length > 0) {
            if (Date.now() >= deadline) {
                throw new Error("Timed out while waiting for active MSP requests to finish");
            }
            await this.delay(this.mspIdlePollDelay);
        }
    }

    async scan({ channels } = {}) {
        const escs = [];
        await this.enter();
        const channelCount = channels ?? this.connectedEscCount ?? 4;
        try {
            for (let channel = 0; channel < channelCount; channel += 1) {
                this.report({ phase: "scan", channel, total: channelCount });
                let record;
                try {
                    const initResponse = await this.initFlash(channel, { armRecovery: false });
                    this.activeChannel = channel;
                    record = decodeEscInfo(initResponse.params, channel);
                    record.status = "ready";
                    record.canRead = record.canBackup = record.canWrite = false;
                    escs.push(record);
                    await this.probeFirmware(record);
                    record.model = record.model === "ESC not identified" ? `ESC channel ${channel + 1}` : record.model;
                    record.detectedFirmwareFamily = record.firmwareFamily;
                    record.detectedFirmwareLabel = record.firmwareLabel;
                    await this.verifyDetectedFirmware(record);
                } catch (error) {
                    if (record) {
                        this.lockFirmwareFailure(record, error?.message || "固件识别或配置布局验证失败。");
                    }
                    if (isTransportFailure(error)) {
                        error.escs = escs;
                        throw error;
                    }
                    if (!record) {
                        escs.push(
                            createEscRecord(channel, {
                                model: `ESC channel ${channel + 1}`,
                                reason: error?.message || "No response from this ESC.",
                                status: "unavailable",
                            }),
                        );
                    }
                }
            }
            return escs;
        } finally {
            await this.exit();
        }
    }

    /**
     * Unknown channels may be SiLabs devices; family-specific reset recovery must be explicitly requested.
     * @param {number} channel
     * @param {{armRecovery?: boolean}} options
     */
    async initFlash(channel, { armRecovery = false } = {}) {
        let lastError;
        const retryDelays = [...this.initRetryDelays];
        while (retryDelays.length) {
            const retryDelay = retryDelays.shift();
            if (retryDelay > 0) await this.delay(retryDelay);
            try {
                return await this.session.send(FOUR_WAY_COMMANDS.deviceInitFlash, [channel]);
            } catch (error) {
                lastError = error;
                if (isTransportFailure(error) || error?.ack === FOUR_WAY_ACK.invalidChannel) throw error;
                if (isRetryableInitFailure(error) && this.passthroughSettleUntil > Date.now()) {
                    // Stay in this session until the startup window ends, before reset/reconnect recovery.
                    await this.waitForPassthroughSettle();
                    retryDelays.unshift(0);
                }
            }
        }
        if (armRecovery && isRetryableInitFailure(lastError)) return this.initArmWithRecovery(channel);
        throw lastError || new Error(`ESC ${channel + 1} did not respond to 4-way initialization`);
    }

    /** Recover a rejected cold init without resetting channels that initialized normally. */
    async initArmWithRecovery(channel) {
        for (const command of [
            FOUR_WAY_COMMANDS.protocolGetVersion,
            FOUR_WAY_COMMANDS.interfaceGetName,
            FOUR_WAY_COMMANDS.interfaceGetVersion,
        ]) {
            await this.session.send(command, [0]);
        }
        await this.session.send(FOUR_WAY_COMMANDS.interfaceSetMode, [4]);
        const alive = await this.session.send(FOUR_WAY_COMMANDS.interfaceTestAlive, [0]);
        if (alive.ack !== FOUR_WAY_ACK.ok) {
            // A stale device connection may fail KeepAlive. Re-enter before selecting any ESC.
            await this.exit();
            await this.enter();
            await this.session.send(FOUR_WAY_COMMANDS.interfaceSetMode, [4]);
        }
        await this.session.send(FOUR_WAY_COMMANDS.deviceReset, [channel]);
        let lastError;
        for (const delayMs of [100, 500, 500, 500, 5000]) {
            await this.delay(delayMs);
            try {
                return await this.session.send(FOUR_WAY_COMMANDS.deviceInitFlash, [channel]);
            } catch (error) {
                lastError = error;
                if (!isRetryableInitFailure(error)) throw error;
            }
        }
        throw lastError;
    }

    async probeFirmware(esc) {
        if (esc.interfaceMode === 0 || esc.interfaceMode === 1) {
            if (!esc.settingsOffset) return esc;
            const nameBytes = await this.readMemoryImage(esc.settingsOffset + 0x60, 16);
            if (isTaggedBluejayName(nameBytes) || isMissingBluejayName(nameBytes) || isCorruptBluejayName(nameBytes)) {
                // The selected channel stays in this session while its identity,
                // layout and current melody are read below.
                applyEscFirmwareFamily(esc, ESC_FIRMWARE.BLUEJAY, {
                    reason: "",
                    canRead: false,
                    canBackup: false,
                    canWrite: false,
                });
            }
            return esc;
        }

        if (esc.interfaceMode === 4 && !isVerifiedBlheli32Device(esc)) await this.probeOx32(esc);
        return esc;
    }

    async probeOx32(esc) {
        let handshake;
        try {
            const bytes = await this.readMemoryImage(OX32_HANDSHAKE_OFFSET, OX32_HANDSHAKE_LENGTH);
            handshake = parseOx32Handshake(bytes);
        } catch (error) {
            if (/connection was lost|serial adapter/i.test(error?.message || "")) throw error;
            // A failed OX32 handshake is not evidence that a known AM32 MCU
            // has changed family. Preserve the candidate for its own layout probe.
            return false;
        }
        if (!handshake) return false;

        const ox32Layout = getOx32Layout(handshake.bootloaderVersion);
        const activated = verifyOx32License(handshake);
        let model = "OX32 ESC";
        if (ox32Layout) {
            model = decodeOx32Model(await this.readMemoryImage(ox32Layout.oemOffset, 32));
        }

        let reason = "";
        if (!ox32Layout) {
            reason = `OX32 bootloader ${handshake.bootloaderVersion} has an unknown settings layout. Writing is disabled.`;
        } else if (!activated) {
            reason = "OX32 device is not activated. Use the official OX32 Configurator before writing.";
        }

        applyEscFirmwareFamily(esc, ESC_FIRMWARE.OX32, {
            model,
            version: handshake.firmwareVersion,
            canBackup: Boolean(ox32Layout),
            canWrite: Boolean(ox32Layout && activated),
            layout: ox32Layout
                ? `Flash 0x${ox32Layout.settingsOffset.toString(16).toUpperCase()} + 0x44 · 204 B config · CRC`
                : `OX32 ${handshake.bootloader} ${handshake.bootloaderVersion} · unknown layout`,
            settingsOffset: ox32Layout?.settingsOffset,
            settingsLength: ox32Layout?.settingsLength,
            melodyRelativeOffset: ox32Layout?.melodyRelativeOffset,
            capacity: ox32Layout?.melodyCapacity ?? 128,
            settingsPageSize: ox32Layout?.pageSize,
            settingsChecksumAddress: ox32Layout?.checksumAddress,
            bootloader: handshake.bootloader,
            bootloaderVersion: handshake.bootloaderVersion,
            parameterVersion: handshake.parameterVersion,
            deviceIdentity: handshake.mcuId,
            activated,
            reason,
        });
        return true;
    }

    assertEscFingerprint(original, current) {
        for (const field of ["signature", "inputPin", "interfaceMode"]) {
            if (original?.[field] !== undefined && current?.[field] !== original[field]) {
                throw new Error(`ESC ${original.channel + 1} identity changed; operation was cancelled`);
            }
        }
    }

    lockFirmwareFailure(esc, reason, status = ESC_FIRMWARE_CONFIRMATION_STATUS.FAILED) {
        esc.confirmationStatus = status;
        esc.confirmationReason = reason;
        esc.layoutVerified = false;
        esc.canRead = false;
        esc.canBackup = false;
        esc.canWrite = false;
        esc.currentMelody = null;
        esc.currentMelodyBytes = null;
        esc.currentWaitBytes = null;
        esc.melodyReadStatus = ESC_MELODY_READ_STATUS.IDLE;
        esc.reason = reason;
        return esc;
    }

    /** Validate and read the channel already selected by scan, without re-entering passthrough. */
    async verifyDetectedFirmware(esc) {
        const firmwareFamily = esc.firmwareFamily;
        esc.confirmedFirmwareFamily = firmwareFamily;
        if (firmwareFamily === ESC_FIRMWARE.UNKNOWN) {
            return this.lockFirmwareFailure(
                esc,
                "未识别固件类型；读取、备份和写入保持锁定。",
                ESC_FIRMWARE_CONFIRMATION_STATUS.UNSUPPORTED,
            );
        }

        if (firmwareFamily === ESC_FIRMWARE.BLUEJAY) {
            if (![0, 1].includes(esc.interfaceMode) || !Number.isInteger(esc.settingsOffset)) {
                return this.lockFirmwareFailure(esc, "此设备接口与 Bluejay 不匹配，未验证 EEPROM 布局。");
            }
            const identity = await this.readBluejayIdentity(esc);
            applyEscFirmwareFamily(esc, ESC_FIRMWARE.BLUEJAY, {
                ...identity,
                layout: `Pseudo-EEPROM 0x${esc.settingsOffset.toString(16).toUpperCase()} + 0x70 · 128 B melody + rests`,
                reason: "",
            });
            esc.layoutVerified = true;
        } else if (firmwareFamily === ESC_FIRMWARE.AM32) {
            const am32Layout = getAm32LayoutForEsc(esc);
            if (!am32Layout) {
                applyEscFirmwareFamily(esc, ESC_FIRMWARE.AM32, {
                    layout: "AM32 · MCU 配置布局未支持",
                    reason: "AM32 已识别，但此 Bootloader/MCU 配置布局未支持；不会猜测 EEPROM 地址。",
                });
                return this.lockFirmwareFailure(
                    esc,
                    "AM32 已识别，但此 Bootloader/MCU 配置布局未支持；读取、备份和写入保持锁定。",
                    ESC_FIRMWARE_CONFIRMATION_STATUS.UNSUPPORTED,
                );
            }
            esc.settingsOffset = am32Layout.settingsOffset;
            esc.settingsPageSize = am32Layout.pageSize;
            esc.melodyRelativeOffset = 0x30;
            const header = await this.readMemoryImage(esc.settingsOffset, 5);
            const layout = validateSettingsHeader(header, ESC_FIRMWARE.AM32);
            applyEscFirmwareFamily(esc, ESC_FIRMWARE.AM32, {
                ...layout,
                layout: `Flash 0x${esc.settingsOffset.toString(16).toUpperCase()} + 0x30 · ${layout.settingsLength} B · page ${am32Layout.pageSize / 1024} KB`,
                reason: "",
            });
            esc.layoutVerified = true;
        } else if (firmwareFamily === ESC_FIRMWARE.OX32) {
            if (!Number.isInteger(esc.settingsOffset)) {
                return this.lockFirmwareFailure(
                    esc,
                    "未验证 OX32 握手或 Bootloader 配置布局。",
                    ESC_FIRMWARE_CONFIRMATION_STATUS.UNSUPPORTED,
                );
            }
            esc.layoutVerified = true;
        } else if (firmwareFamily === ESC_FIRMWARE.BLHELI32) {
            if (!isVerifiedBlheli32Device(esc)) {
                return this.lockFirmwareFailure(
                    esc,
                    "BLHeli_32 的 MCU 或 Bootloader 尚未支持；当前仅验证 FPV32 / AT32F421 / 32.10。",
                    ESC_FIRMWARE_CONFIRMATION_STATUS.UNSUPPORTED,
                );
            }
            const image = await this.readBlheli32Settings();
            const identity = parseBlheli32Settings(image, esc);
            if (!identity.writable) throw new Error(identity.reason);
            applyEscFirmwareFamily(esc, ESC_FIRMWARE.BLHELI32, {
                model: identity.layout.replaceAll("#", ""),
                version: identity.version,
                layoutRevision: image[2],
                firmwareName: identity.firmwareName,
                layout: "BLHeli_32 · 0x7C00 · 192 B config / 48 B notes",
                settingsOffset: BLHELI32_SETTINGS_OFFSET,
                settingsLength: BLHELI32_SETTINGS_LENGTH,
                melodyRelativeOffset: BLHELI32_MELODY_OFFSET,
                canRead: true,
                canBackup: true,
                canWrite: true,
                reason: "",
            });
            esc.currentEeprom = image;
            esc.layoutVerified = true;
        }

        if (!esc.layoutVerified) return esc;
        esc.confirmationStatus = ESC_FIRMWARE_CONFIRMATION_STATUS.VERIFIED;
        esc.confirmationReason =
            esc.bluejayIdentity?.metadataMissing || esc.bluejayIdentity?.metadataCorrupt
                ? `已通过官方 Bluejay ${esc.bluejayIdentity.release} ${esc.bluejayIdentity.target} 程序指纹核验；${esc.bluejayIdentity.metadataCorrupt ? "名称标识异常" : "名称标识缺失"}，未自动修复配置。`
                : "固件类型与配置布局已验证。";
        esc.reason = esc.reason || "";
        await this.readSelectedEscMelody(esc);
        return esc;
    }

    async readSelectedEscMelody(esc) {
        const capacity = esc?.capacity || 128;
        if (
            !esc?.canRead ||
            !Number.isInteger(esc.settingsOffset) ||
            !Number.isInteger(esc.melodyRelativeOffset) ||
            !Number.isInteger(capacity) ||
            capacity <= 0
        ) {
            esc.melodyReadStatus = ESC_MELODY_READ_STATUS.UNSUPPORTED;
            esc.melodyReadError = "This firmware does not expose a safe startup-melody layout.";
            return null;
        }

        try {
            if (esc.firmwareFamily === ESC_FIRMWARE.BLHELI32) {
                const image = esc.currentEeprom || (await this.readBlheli32Settings());
                this.assertBlheli32Settings(esc, image);
                esc.currentMelodyMode = image[BLHELI32_MODE_OFFSET];
                return this.storeCurrentMelody(esc, image.slice(BLHELI32_MELODY_OFFSET));
            }
            const melodyBytes = await this.readMemoryImage(esc.settingsOffset + esc.melodyRelativeOffset, capacity);
            let currentWaitBytes = null;
            if (Number.isInteger(esc.waitRelativeOffset)) {
                currentWaitBytes = await this.readMemoryImage(esc.settingsOffset + esc.waitRelativeOffset, 2);
            }
            return this.storeCurrentMelody(esc, melodyBytes, currentWaitBytes);
        } catch (error) {
            if (isTransportFailure(error)) throw error;
            esc.currentMelody = null;
            esc.currentMelodyBytes = null;
            esc.currentWaitBytes = null;
            esc.melodyReadStatus = ESC_MELODY_READ_STATUS.ERROR;
            esc.melodyReadError = error?.message || "The startup melody could not be decoded.";
            return null;
        }
    }

    async backupEsc(esc) {
        await this.enter();
        try {
            await this.selectEscWithInitRecovery(esc);
            return await this.backupSelectedEsc(esc);
        } finally {
            await this.exit();
        }
    }

    async backupEscs(escs) {
        const targets = escs || [];
        await this.enter();
        try {
            const backups = [];
            for (let index = 0; index < targets.length; index += 1) {
                const esc = targets[index];
                this.report({ phase: "backup", channel: esc.channel, index, total: targets.length });
                await this.selectEscWithInitRecovery(esc);
                backups.push(await this.backupSelectedEsc(esc));
            }
            return backups;
        } finally {
            await this.exit();
        }
    }

    async backupSelectedEsc(esc) {
        if (esc.writeTouched || esc.restoreTouched) throw new Error("请先恢复受影响通道，不能覆盖原始备份。");
        if (!esc?.canBackup) throw new Error(`ESC ${esc?.channel + 1} does not support backups`);
        if (!esc.settingsOffset || !esc.settingsLength) throw new Error("ESC settings layout is incomplete");
        const { image, settingsChecksum } = await this.readSelectedSettingsSnapshot(esc);
        esc.originalEeprom = image;
        esc.currentEeprom = new Uint8Array(image);
        if (settingsChecksum) {
            esc.originalSettingsChecksum = settingsChecksum;
            esc.currentSettingsChecksum = new Uint8Array(esc.originalSettingsChecksum);
        }
        if (esc.waitRelativeOffset !== undefined) {
            esc.originalWaitBytes = esc.originalEeprom.slice(esc.waitRelativeOffset, esc.waitRelativeOffset + 2);
        }
        esc.operationBackup = null;
        esc.backedUp = true;
        return esc.originalEeprom;
    }

    /**
     * Capture the selected ESC before erasing. Independent tag reads reject a
     * full-page reply inconsistent with the identity used to select the ESC.
     * @param {object} esc
     * @returns {Promise<{image: Uint8Array, settingsChecksum: Uint8Array|null}>}
     */
    async readSelectedSettingsSnapshot(esc) {
        const image = await this.readSettingsImage(esc);
        const repeated = await this.readSettingsImage(esc);
        if (!equalBytes(image, repeated)) throw new Error("配置连续读取不一致，已取消擦写，请重新扫描。");
        if (esc.firmwareFamily === ESC_FIRMWARE.BLHELI32) this.assertBlheli32Settings(esc, image);
        if ([ESC_FIRMWARE.BLUEJAY, ESC_FIRMWARE.AM32].includes(esc.firmwareFamily)) {
            const bluejay = esc.firmwareFamily === ESC_FIRMWARE.BLUEJAY;
            const headerLength = bluejay ? 3 : 5;
            const header = await this.readMemoryImage(esc.settingsOffset, headerLength);
            const layout = validateSettingsHeader(header, esc.firmwareFamily);
            if (!equalBytes(image.slice(0, headerLength), header)) {
                throw new Error("配置快照与当前配置头不一致，已取消擦写。");
            }
            for (const key of ["version", "settingsLength", "layoutRevision"]) {
                if (esc[key] !== undefined && layout[key] !== esc[key]) {
                    throw new Error("配置布局已变化，已取消擦写，请重新扫描。");
                }
            }
            if (bluejay) {
                const tags = await this.readMemoryImage(esc.settingsOffset + 0x40, 48);
                if (!equalBytes(image.slice(0x40, 0x70), tags)) {
                    throw new Error("配置快照与当前型号或名称标识不一致，已取消擦写。");
                }
            }
        }
        let settingsChecksum = null;
        if (Number.isInteger(esc.settingsChecksumAddress)) {
            settingsChecksum = await this.readMemoryImage(esc.settingsChecksumAddress, 4);
            const repeatedChecksum = await this.readMemoryImage(esc.settingsChecksumAddress, 4);
            if (!equalBytes(settingsChecksum, repeatedChecksum)) {
                throw new Error("配置校验值连续读取不一致，已取消擦写。");
            }
        }
        return { image, settingsChecksum };
    }

    async writeEsc(esc, melody) {
        await this.enter();
        try {
            const result = await this.writeSelectedEsc(esc, melody);
            esc.writeTouched = false;
            return result;
        } finally {
            await this.exit();
        }
    }

    async writeSelectedEsc(esc, melody) {
        if (!esc?.canWrite) throw new Error(esc?.reason || "This ESC cannot be written");
        if (esc.writeTouched || esc.restoreTouched) throw new Error("请先恢复受影响通道，不能覆盖回滚快照。");
        esc.verified = false;
        const encoded = encodeFirmwareMelody(melody, esc.firmwareFamily, esc.capacity || 128);
        await this.selectEscWithInitRecovery(esc);
        const snapshot = await this.readSelectedSettingsSnapshot(esc);
        if (!esc.backedUp) {
            esc.originalEeprom = new Uint8Array(snapshot.image);
            esc.originalSettingsChecksum = snapshot.settingsChecksum ? new Uint8Array(snapshot.settingsChecksum) : null;
            esc.backedUp = true;
        }
        esc.operationBackup = snapshot;

        const patched = patchSettingsImage(snapshot.image, esc, encoded.bytes, encoded.waitMs, encoded.mode);
        const wireImage = this.encodeSettingsImage(esc, patched);
        esc.writeTouched = true;
        try {
            if (esc.firmwareFamily !== ESC_FIRMWARE.BLHELI32 && esc.erasePage !== undefined) {
                await this.sendFlashCommand(
                    FOUR_WAY_COMMANDS.devicePageErase,
                    [esc.erasePage],
                    0,
                    `ESC ${esc.channel + 1} 擦除分页`,
                );
            }
            await this.writeMemoryImage(esc.settingsOffset, wireImage);
            this.report({ phase: "verify", channel: esc.channel });
            const readBack = await this.readSettingsImage(esc);
            esc.currentEeprom = new Uint8Array(readBack);
            if (!equalBytes(patched, readBack)) {
                throw new Error(`ESC ${esc.channel + 1} read-back verification failed`);
            }
            if (Number.isInteger(esc.settingsChecksumAddress)) {
                esc.currentSettingsChecksum = await this.writeAndVerifyOx32Checksum(esc, patched);
            }
        } catch (error) {
            // The erase is the point of no return: a lost ACK after a successful
            // erase leaves the settings page blank, which removes the ESC name and
            // layout tags and makes the board unusable until the page is rewritten.
            // Always try to put the original image back before reporting failure.
            const restored = await this.restoreAfterFailedWrite(esc);
            if (!restored) {
                const state = esc.firmwareFamily === ESC_FIRMWARE.BLHELI32 ? "配置状态不确定" : "可能已被擦除";
                throw new Error(
                    `${error.message}；原始 EEPROM 未能写回，第 ${esc.channel + 1} 路${state}，请保持供电并立即重试恢复。`,
                    { cause: error },
                );
            }
            throw new Error(`${error.message}（原始 EEPROM 已写回）`, { cause: error });
        }
        if (esc.firmwareFamily === ESC_FIRMWARE.BLHELI32) esc.currentMelodyMode = patched[BLHELI32_MODE_OFFSET];
        this.storeCurrentMelody(
            esc,
            encoded.bytes,
            Number.isInteger(esc.waitRelativeOffset) ? encodeWaitMs(encoded.waitMs) : null,
        );
        esc.verified = true;
        return { esc, encoded };
    }

    /** Write the pre-write image back after a failed erase/write/verify. */
    async restoreAfterFailedWrite(esc) {
        if (!getEscRecoverySnapshot(esc).image?.length) return false;
        try {
            await this.recoverSelectedEsc(esc);
            return true;
        } catch (error) {
            console.warn(`[ESC-MELODY] Could not restore ESC ${esc.channel + 1} after a failed write:`, error);
            return false;
        }
    }

    async selectEscWithInitRecovery(esc, options) {
        for (let recovery = 0; ; recovery += 1) {
            try {
                return await this.selectEsc(esc, options);
            } catch (error) {
                if (!isRetryableInitFailure(error) || recovery >= this.writeInitRecoveryAttempts) throw error;

                // Some ESCs can reject init-flash after a busy passthrough
                // session. This happens before accessing the current channel,
                // so a bounded clean-session rebuild is safe.
                await this.exit();
                await this.enter();
            }
        }
    }

    async writeMelody(escs, melody) {
        const writable = (escs || []).filter((esc) => esc.canWrite);
        const written = [];
        const rollback = [];
        await this.enter();
        try {
            for (let index = 0; index < writable.length; index += 1) {
                const esc = writable[index];
                this.report({ phase: "write", channel: esc.channel, index, total: writable.length });
                try {
                    await this.writeSelectedEsc(esc, typeof melody === "function" ? melody(esc) : melody);
                    esc.status = "verified";
                    written.push(esc);
                    this.report({ phase: "written", channel: esc.channel });
                    rollback.push(esc);
                } catch (error) {
                    esc.status = "failed";
                    this.report({ phase: "failed", channel: esc.channel, error: error.message });
                    if (esc.writeTouched && !rollback.includes(esc)) rollback.push(esc);
                    return { ok: false, error, failed: esc, written, rollback };
                }
            }
            for (const esc of written) esc.writeTouched = false;
            return { ok: true, written, rollback };
        } finally {
            await this.exit();
        }
    }

    async recoverEsc(esc) {
        await this.enter();
        try {
            await this.selectEscWithInitRecovery(esc, { recovery: true });
            return await this.recoverSelectedEsc(esc);
        } finally {
            await this.exit();
        }
    }

    async recoverEscs(escs) {
        const targets = escs || [];
        await this.enter();
        try {
            const recovered = [];
            for (let index = 0; index < targets.length; index += 1) {
                const esc = targets[index];
                this.report({ phase: "recover", channel: esc.channel, index, total: targets.length });
                try {
                    await this.selectEscWithInitRecovery(esc, { recovery: true });
                    recovered.push(await this.recoverSelectedEsc(esc));
                    this.report({ phase: "recovered", channel: esc.channel });
                } catch (error) {
                    this.report({ phase: "recoverFailed", channel: esc.channel, error: error.message });
                    throw error;
                }
            }
            return recovered;
        } finally {
            await this.exit();
        }
    }

    async restoreBackup(targets) {
        const queue = Array.isArray(targets) ? targets : [];
        const restored = [];
        const rollback = [];
        await this.enter();
        try {
            for (let index = 0; index < queue.length; index += 1) {
                const target = queue[index];
                const esc = target?.esc;
                this.report({ phase: "restore", channel: esc?.channel, index, total: queue.length });
                try {
                    if (esc) esc.restoreTouched = false;
                    await this.selectEscWithInitRecovery(esc);
                    await this.restoreBackupSelectedEsc(esc, target.backupEntry);
                    restored.push(esc);
                    this.report({ phase: "restored", channel: esc.channel });
                    rollback.push(esc);
                } catch (error) {
                    if (esc) esc.status = "failed";
                    this.report({ phase: "restoreFailed", channel: esc?.channel, error: error.message });
                    if (esc?.restoreTouched && !rollback.includes(esc)) rollback.push(esc);
                    return { ok: false, error, failed: esc, restored, rollback };
                }
            }
            return { ok: true, restored, rollback };
        } finally {
            await this.exit();
        }
    }

    async restoreBackupSelectedEsc(esc, backupEntry) {
        if (!esc?.canBackup || !esc?.canWrite) {
            throw new Error(esc?.reason || `ESC ${esc?.channel + 1} does not support EEPROM recovery`);
        }
        const identityErrors = getEscRestoreIdentityErrors(backupEntry, esc);
        if (identityErrors.length) {
            throw new Error(identityErrors[0]);
        }

        const { eeprom, settingsChecksum } = decodeEscBackupEntry(backupEntry);
        await this.assertRestorePayload(esc, eeprom, settingsChecksum);
        esc.operationBackup = {
            image: esc.originalEeprom ? new Uint8Array(esc.originalEeprom) : null,
            settingsChecksum: esc.originalSettingsChecksum ? new Uint8Array(esc.originalSettingsChecksum) : null,
        };
        if (esc.firmwareFamily === ESC_FIRMWARE.BLHELI32) {
            esc.operationBackup = await this.readSelectedSettingsSnapshot(esc);
        }
        const wireImage = this.encodeSettingsImage(esc, eeprom);
        esc.restoreTouched = true;
        if (esc.firmwareFamily !== ESC_FIRMWARE.BLHELI32 && esc.erasePage !== undefined) {
            await this.sendFlashCommand(
                FOUR_WAY_COMMANDS.devicePageErase,
                [esc.erasePage],
                0,
                `ESC ${esc.channel + 1} 擦除分页`,
            );
        }
        await this.writeMemoryImage(esc.settingsOffset, wireImage);
        this.report({ phase: "restoreVerify", channel: esc.channel });
        const readBack = await this.readSettingsImage(esc);
        if (!equalBytes(eeprom, readBack)) {
            throw new Error(`ESC ${esc.channel + 1} EEPROM recovery verification failed`);
        }

        let checksumReadBack = null;
        if (Number.isInteger(esc.settingsChecksumAddress)) {
            if (settingsChecksum?.length !== 4) {
                throw new Error(`ESC ${esc.channel + 1} OX32 checksum backup is missing`);
            }
            await this.writeMemoryImage(esc.settingsChecksumAddress, settingsChecksum);
            checksumReadBack = await this.readMemoryImage(esc.settingsChecksumAddress, settingsChecksum.length);
            if (!equalBytes(settingsChecksum, checksumReadBack)) {
                throw new Error(`ESC ${esc.channel + 1} OX32 checksum recovery verification failed`);
            }
        }

        this.applyRestoredSettings(esc, readBack, checksumReadBack);
        esc.restoreTouched = false;
        return esc;
    }

    /**
     * Validate the configuration bytes, independently of the backup's JSON identity fields.
     * @param {object} esc
     * @param {Uint8Array} image
     * @param {Uint8Array|null} checksum
     * @returns {Promise<void>}
     */
    async assertRestorePayload(esc, image, checksum) {
        if (image.length !== esc.settingsLength) throw new Error("备份配置长度与电调布局不匹配。");
        if (esc.firmwareFamily === ESC_FIRMWARE.BLHELI32) {
            this.assertBlheli32Settings(esc, image);
        } else if ([ESC_FIRMWARE.BLUEJAY, ESC_FIRMWARE.AM32].includes(esc.firmwareFamily)) {
            const bluejay = esc.firmwareFamily === ESC_FIRMWARE.BLUEJAY;
            const header = image.slice(0, bluejay ? 3 : 5);
            const layout = bluejay
                ? await this.readBluejayIdentity(esc, {
                    header,
                    nameBytes: image.slice(0x60, 0x70),
                    forceRecheck: true,
                })
                : validateSettingsHeader(header, esc.firmwareFamily);
            for (const key of ["version", "settingsLength", "layoutRevision"]) {
                if (esc[key] !== undefined && layout[key] !== esc[key]) {
                    throw new Error("备份内部固件版本或布局与当前电调不匹配。");
                }
            }
            if (bluejay) {
                const tags = await this.readMemoryImage(esc.settingsOffset + 0x40, 32);
                if (!equalBytes(image.slice(0x40, 0x60), tags)) {
                    throw new Error("备份内部型号或芯片标识与当前电调不匹配。");
                }
            }
        } else if (esc.firmwareFamily === ESC_FIRMWARE.OX32) {
            if (!equalBytes(createOx32ChecksumTrailer(image), checksum)) {
                throw new Error("备份内部 OX32 配置与 CRC 校验值不匹配。");
            }
        } else {
            throw new Error("未支持的备份固件类型，已取消恢复。");
        }
    }

    async recoverSelectedEsc(esc) {
        const { image, settingsChecksum } = getEscRecoverySnapshot(esc);
        if (!image?.length) throw new Error("No backup is available for this ESC");
        if (esc.firmwareFamily !== ESC_FIRMWARE.BLHELI32 && esc.erasePage !== undefined) {
            await this.sendFlashCommand(
                FOUR_WAY_COMMANDS.devicePageErase,
                [esc.erasePage],
                0,
                `ESC ${esc.channel + 1} 擦除分页`,
            );
        }
        await this.writeSettingsImage(esc, image);
        this.report({ phase: "recoverVerify", channel: esc.channel });
        const check = await this.readSettingsImage(esc);
        if (!equalBytes(image, check)) throw new Error("Backup recovery verification failed");
        if (Number.isInteger(esc.settingsChecksumAddress)) {
            if (!settingsChecksum?.length) throw new Error("No OX32 checksum backup is available");
            await this.writeMemoryImage(esc.settingsChecksumAddress, settingsChecksum);
            const checksumCheck = await this.readMemoryImage(esc.settingsChecksumAddress, 4);
            if (!equalBytes(settingsChecksum, checksumCheck)) {
                throw new Error("OX32 checksum recovery verification failed");
            }
            esc.currentSettingsChecksum = new Uint8Array(checksumCheck);
        }
        this.applyRestoredSettings(esc, check, esc.currentSettingsChecksum);
        esc.restoreTouched = false;
        esc.writeTouched = false;
        return esc;
    }

    applyRestoredSettings(esc, settings, settingsChecksum = null) {
        esc.currentEeprom = new Uint8Array(settings);
        if (esc.firmwareFamily === ESC_FIRMWARE.BLHELI32) esc.currentMelodyMode = settings[BLHELI32_MODE_OFFSET];
        if (settingsChecksum?.length) {
            esc.currentSettingsChecksum = new Uint8Array(settingsChecksum);
        }
        const melodyBytes = esc.currentEeprom.slice(
            esc.melodyRelativeOffset,
            esc.melodyRelativeOffset + (esc.capacity || 128),
        );
        const waitBytes = Number.isInteger(esc.waitRelativeOffset)
            ? esc.currentEeprom.slice(esc.waitRelativeOffset, esc.waitRelativeOffset + 2)
            : null;
        try {
            this.storeCurrentMelody(esc, melodyBytes, waitBytes);
        } catch (error) {
            esc.currentMelodyBytes = new Uint8Array(melodyBytes);
            esc.currentWaitBytes = waitBytes ? new Uint8Array(waitBytes) : null;
            esc.currentMelody = null;
            esc.melodyReadStatus = ESC_MELODY_READ_STATUS.ERROR;
            esc.melodyReadError = error?.message || "The restored startup melody could not be decoded.";
        }
        esc.status = "recovered";
        esc.verified = false;
        return esc.currentEeprom;
    }

    storeCurrentMelody(esc, melodyBytes, waitBytes = null) {
        const currentMelody = decodeFirmwareMelody(melodyBytes, {
            name: `ESC ${esc.channel + 1}`,
            firmware: esc.firmwareFamily,
            mode: esc.currentMelodyMode,
        });
        esc.currentMelodyBytes = new Uint8Array(melodyBytes);
        esc.currentWaitBytes = waitBytes ? new Uint8Array(waitBytes) : null;
        esc.currentMelody = currentMelody;
        esc.melodyReadStatus = currentMelody ? ESC_MELODY_READ_STATUS.LOADED : ESC_MELODY_READ_STATUS.EMPTY;
        esc.melodyReadError = "";
        return currentMelody;
    }

    async selectEsc(esc, { recovery = false } = {}) {
        if (!this.session) throw new Error("ESC 4-way session is not active");
        const channel = Number(esc?.channel);
        if (!Number.isInteger(channel) || channel < 0) throw new Error("ESC channel is invalid");
        const response = await this.initFlash(channel, { armRecovery: esc.firmwareFamily === ESC_FIRMWARE.BLHELI32 });
        const selected = decodeEscInfo(response.params, channel);
        try {
            this.assertEscFingerprint(esc, selected);
            if (esc.firmwareFamily === ESC_FIRMWARE.BLHELI32) {
                const fromBackup = recovery && (esc.writeTouched || esc.restoreTouched);
                const image = fromBackup ? getEscRecoverySnapshot(esc).image : await this.readBlheli32Settings();
                this.assertBlheli32Settings(esc, image);
            }
            if ([ESC_FIRMWARE.BLUEJAY, ESC_FIRMWARE.AM32].includes(esc.firmwareFamily)) {
                // An interrupted erase can destroy the identity stored in the settings page.
                // Only this operation's touched channels may recover using their original image.
                const fromBackup = recovery && (esc.writeTouched || esc.restoreTouched);
                const layout = await this.readSelectedLayout(
                    esc,
                    fromBackup ? getEscRecoverySnapshot(esc).image : null,
                );
                for (const key of ["version", "settingsLength", "layoutRevision", "firmwareName"]) {
                    if (esc[key] !== undefined && layout[key] !== esc[key]) {
                        throw new Error(
                            `ESC ${channel + 1} firmware or settings layout changed; scan and back up again`,
                        );
                    }
                }
            }
        } catch (error) {
            this.lockFirmwareFailure(esc, error.message);
            esc.backedUp = false;
            throw error;
        }
        if (esc.firmwareFamily === ESC_FIRMWARE.OX32) {
            const bytes = await this.readMemoryImage(OX32_HANDSHAKE_OFFSET, OX32_HANDSHAKE_LENGTH);
            const handshake = parseOx32Handshake(bytes);
            if (!handshake || handshake.mcuId !== esc.deviceIdentity) {
                throw new Error(`ESC ${channel + 1} OX32 identity changed; write was cancelled`);
            }
            if (handshake.bootloaderVersion !== esc.bootloaderVersion) {
                throw new Error(`ESC ${channel + 1} OX32 bootloader layout changed; write was cancelled`);
            }
        }
        this.activeChannel = channel;
        return response;
    }

    /**
     * Recheck the firmware header and mapped layout without granting new permissions.
     * @param {object} esc
     * @param {Uint8Array|null} backup Original image of a touched channel, only during recovery.
     */
    async readSelectedLayout(esc, backup = null) {
        const bluejay = esc.firmwareFamily === ESC_FIRMWARE.BLUEJAY;
        if (!bluejay) {
            const mapping = getAm32LayoutForEsc(esc);
            if (!mapping || mapping.settingsOffset !== esc.settingsOffset) throw new Error("AM32 配置地址不匹配。");
        }
        const size = bluejay ? 3 : 5;
        if (backup && backup.length !== esc.settingsLength) throw new Error("原始备份长度不匹配。");
        const header = backup ? backup.slice(0, size) : await this.readMemoryImage(esc.settingsOffset, size);
        const layout = validateSettingsHeader(header, esc.firmwareFamily);
        if (bluejay) {
            const bytes = backup ? backup.slice(0x60, 0x70) : await this.readMemoryImage(esc.settingsOffset + 0x60, 16);
            return this.readBluejayIdentity(esc, { header, nameBytes: bytes, forceRecheck: true });
        }
        return layout;
    }

    /**
     * Missing or corrupt EEPROM tags require an exact official application match, including during reselection.
     * @param {object} esc
     * @param {{header?: Uint8Array, nameBytes?: Uint8Array, forceRecheck?: boolean}} options
     */
    async readBluejayIdentity(esc, { header, nameBytes, forceRecheck = false } = {}) {
        nameBytes ??= await this.readMemoryImage(esc.settingsOffset + 0x60, 16);
        const name = decodeNullTerminated(nameBytes);
        const tagged = isTaggedBluejayName(nameBytes);
        const missing = isMissingBluejayName(nameBytes);
        const corrupt = isCorruptBluejayName(nameBytes);
        if (!tagged && !missing && !corrupt) {
            throw new Error(`未检测到 Bluejay 固件标识（返回：${name || "无效内容"}），未开放读写。`);
        }
        header ??= await this.readMemoryImage(esc.settingsOffset, 3);
        const layout = validateSettingsHeader(header, ESC_FIRMWARE.BLUEJAY);
        if (tagged && !esc.bluejayIdentity?.applicationSha256) {
            return { ...layout, firmwareName: name, bluejayIdentity: { method: "nameTag", metadataMissing: false } };
        }
        const builds = getBluejayApplicationBuilds(esc, header);
        if (!builds.length) {
            throw new Error(
                "Bluejay 名称标识缺失，当前 MCU/版本/布局没有已核验的官方程序指纹；不能仅凭版本号开放读写。",
            );
        }
        let build = null;
        if (
            !forceRecheck &&
            esc.cachedApplicationBuild &&
            (!esc.bluejayIdentity?.applicationSha256 ||
                esc.cachedApplicationBuild.applicationSha256 === esc.bluejayIdentity.applicationSha256)
        ) {
            build = esc.cachedApplicationBuild;
        } else {
            const application = await this.readMemoryImage(0, esc.settingsOffset);
            build = matchBluejayApplication(esc, header, application);
            if (build) {
                esc.cachedApplicationBuild = build;
            }
        }
        if (
            !build ||
            (esc.bluejayIdentity?.applicationSha256 &&
                build.applicationSha256 !== esc.bluejayIdentity.applicationSha256)
        ) {
            throw new Error("Bluejay 程序指纹与已核验的官方固件不匹配，通道保持锁定。");
        }
        return {
            ...layout,
            firmwareName: tagged ? name : "Bluejay",
            bluejayIdentity: {
                ...build,
                method: "officialApplicationSha256",
                metadataMissing: missing,
                metadataCorrupt: corrupt,
            },
        };
    }

    /**
     * Erase, read and write are idempotent, so a dropped frame is retried
     * instead of aborting a flash operation half way through. A frame the
     * adapter could not write at all is a transport failure and is not retried.
     */
    async sendFlashCommand(command, params, address, label) {
        let lastError;
        for (let attempt = 1; attempt <= FLASH_COMMAND_ATTEMPTS; attempt += 1) {
            try {
                return await this.session.send(command, params, address);
            } catch (error) {
                lastError = error;
                if (!isRetryableFlashFailure(error)) break;
                if (attempt === FLASH_COMMAND_ATTEMPTS) break;
                await this.delay(FLASH_COMMAND_RETRY_DELAY_MS);
            }
        }
        throw new Error(`${label}失败：${lastError.message}`, { cause: lastError });
    }

    async readMemoryImage(address, length) {
        const image = new Uint8Array(length);
        for (let offset = 0; offset < length; offset += 256) {
            const chunkLength = Math.min(256, length - offset);
            const response = await this.sendFlashCommand(
                FOUR_WAY_COMMANDS.deviceRead,
                [chunkLength === 256 ? 0 : chunkLength],
                address + offset,
                "EEPROM 读取",
            );
            if (response.params.length !== chunkLength) {
                throw new Error(`4-way read returned ${response.params.length} bytes; expected ${chunkLength}`);
            }
            image.set(response.params, offset);
        }
        return image;
    }

    async readBlheli32Settings() {
        const raw = await this.readMemoryImage(BLHELI32_SETTINGS_OFFSET, BLHELI32_WIRE_LENGTH);
        return decodeBlheli32Settings(raw);
    }

    /** Storage snapshots and comparisons always use logical settings, never randomized ciphertext. */
    async readSettingsImage(esc) {
        if (esc.firmwareFamily === ESC_FIRMWARE.BLHELI32) {
            if (esc.settingsOffset !== BLHELI32_SETTINGS_OFFSET || esc.settingsLength !== BLHELI32_SETTINGS_LENGTH) {
                throw new Error("BLHeli_32 配置地址或长度不匹配，已取消操作。");
            }
            return this.readBlheli32Settings();
        }
        return this.readMemoryImage(esc.settingsOffset, esc.settingsLength);
    }

    assertBlheli32Settings(esc, image) {
        const identity = parseBlheli32Settings(image, esc);
        if (!identity.writable) throw new Error(identity.reason);
        if (
            esc.settingsOffset !== BLHELI32_SETTINGS_OFFSET ||
            esc.settingsLength !== BLHELI32_SETTINGS_LENGTH ||
            esc.melodyRelativeOffset !== BLHELI32_MELODY_OFFSET ||
            esc.capacity !== 48 ||
            Number.isInteger(esc.settingsChecksumAddress) ||
            esc.waitRelativeOffset !== undefined
        ) {
            throw new Error("BLHeli_32 配置布局已变化，已取消操作。");
        }
        return identity;
    }

    encodeSettingsImage(esc, image) {
        if (esc.firmwareFamily === ESC_FIRMWARE.BLHELI32) {
            this.assertBlheli32Settings(esc, image);
            // The verified 0x6E bootloader accepts one encoded config block without a page-erase command.
            return encodeBlheli32Settings(image);
        }
        return image;
    }

    async writeSettingsImage(esc, image) {
        return this.writeMemoryImage(esc.settingsOffset, this.encodeSettingsImage(esc, image));
    }

    async writeMemoryImage(address, image) {
        const bytes = image instanceof Uint8Array ? image : new Uint8Array(image || []);
        for (let offset = 0; offset < bytes.length; offset += 256) {
            const chunk = bytes.slice(offset, offset + 256);
            await this.sendFlashCommand(
                FOUR_WAY_COMMANDS.deviceWrite,
                Array.from(chunk),
                address + offset,
                "EEPROM 写入",
            );
        }
    }

    async writeAndVerifyOx32Checksum(esc, settings) {
        const trailer = createOx32ChecksumTrailer(settings);
        await this.writeMemoryImage(esc.settingsChecksumAddress, trailer);
        const readBack = await this.readMemoryImage(esc.settingsChecksumAddress, trailer.length);
        if (!equalBytes(trailer, readBack)) {
            throw new Error(`ESC ${esc.channel + 1} OX32 checksum verification failed`);
        }
        return new Uint8Array(readBack);
    }

    async exit() {
        const session = this.session;
        const shouldExit = this.inPassthrough;
        this.session = null;
        this.inPassthrough = false;
        this.activeChannel = null;
        this.passthroughSettleUntil = 0;
        if (session) {
            try {
                await session.stop({ exit: shouldExit });
            } catch {
                // Session state is cleared even when the serial link has
                // already disappeared, allowing MSP to reconnect cleanly.
            }
        }
        if (shouldExit) {
            await this.ensureMspReleased();
            if (this.passthroughExitDelay > 0) {
                await this.delay(this.passthroughExitDelay);
            }
        }
    }

    /**
     * InterfaceExit is answered by the flight controller itself, but a dropped
     * frame leaves it in 4-way mode: every later MSP request then goes
     * unanswered and the dead-link watchdog closes the connection. Prove the
     * board is back on MSP, and resend the exit through a throwaway session
     * when it is not.
     */
    async ensureMspReleased() {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            if (await this.probeMsp()) return true;
            this.msp.callbacks_cleanup?.();
            if (attempt === 2) break;
            const session = this.sessionFactory({ serial: this.serial });
            try {
                await session.send(FOUR_WAY_COMMANDS.interfaceExit, [0], 0, 1200);
            } catch {
                // The probe below decides whether a further attempt is needed.
            } finally {
                await session.stop();
            }
        }
        console.warn("[ESC-MELODY] Flight controller did not answer MSP after leaving 4-way passthrough");
        return false;
    }

    probeMsp(timeoutMs = 700) {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (ok) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(ok);
            };
            const timer = setTimeout(() => finish(false), timeoutMs);
            try {
                const sent = this.msp.send_message(MSPCodes.MSP_API_VERSION, false, false, () => finish(true));
                if (sent === false) finish(false);
            } catch {
                finish(false);
            }
        });
    }

    report(progress) {
        this.onProgress?.(progress);
    }
}

/** @param {object} esc */
function getEscRecoverySnapshot(esc) {
    return esc?.operationBackup || { image: esc?.originalEeprom, settingsChecksum: esc?.originalSettingsChecksum };
}

export function equalBytes(a, b) {
    const left = a instanceof Uint8Array ? a : new Uint8Array(a || []);
    const right = b instanceof Uint8Array ? b : new Uint8Array(b || []);
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

/**
 * Validate the known EEPROM schemas before deriving addresses or write permissions.
 * @param {Uint8Array} header
 * @param {string} family
 * @returns {{version: string, layoutRevision: number, settingsLength: number}}
 */
function validateSettingsHeader(header, family) {
    const bluejay = family === ESC_FIRMWARE.BLUEJAY;
    const major = header[bluejay ? 0 : 3];
    const minor = header[bluejay ? 1 : 4];
    const revision = header[bluejay ? 2 : 1];
    if (
        header.length !== (bluejay ? 3 : 5) ||
        major === 255 ||
        minor === 255 ||
        (!major && !minor) ||
        (bluejay ? revision === 0 || revision === 255 : header[0] !== 1 || ![1, 2, 3].includes(revision))
    )
        throw new Error(`${bluejay ? "Bluejay" : "AM32"} 配置头无效或布局版本未支持，读写保持锁定。`);
    return {
        version: `${major}.${minor}`,
        layoutRevision: revision,
        settingsLength: bluejay ? 0xff : revision === 3 ? 0xc0 : 0xb0,
    };
}

export function patchSettingsImage(original, esc, melodyBytes, waitMs = 0, melodyMode) {
    const image = new Uint8Array(original);
    if (esc?.firmwareFamily === ESC_FIRMWARE.BLHELI32) {
        if (
            image.length !== BLHELI32_SETTINGS_LENGTH ||
            melodyBytes.length !== 48 ||
            !Number.isInteger(melodyMode) ||
            melodyMode < 0 ||
            melodyMode > 255 ||
            esc.melodyRelativeOffset !== BLHELI32_MELODY_OFFSET
        ) {
            throw new Error("BLHeli_32 音乐配置不完整，已取消写入。");
        }
        image[BLHELI32_MODE_OFFSET] = melodyMode;
        image.set(melodyBytes, BLHELI32_MELODY_OFFSET);
        return image;
    }
    const melodyOffset = esc?.melodyRelativeOffset;
    if (!Number.isInteger(melodyOffset) || melodyOffset < 0 || melodyOffset + melodyBytes.length > image.length) {
        throw new RangeError("Melody does not fit the detected ESC settings layout");
    }
    image.set(melodyBytes, melodyOffset);
    if (esc.waitRelativeOffset !== undefined) {
        image.set(encodeWaitMs(waitMs), esc.waitRelativeOffset);
    }
    return image;
}

function isTransportFailure(error) {
    return /timed out|serial adapter|connection was lost/i.test(error?.message || "");
}

function isRetryableInitFailure(error) {
    return error?.command === FOUR_WAY_COMMANDS.deviceInitFlash && error?.ack === FOUR_WAY_ACK.generalError;
}

function isVerifiedBlheli32Device(esc) {
    return esc?.signature === 0x1506 && esc?.inputPin === 0x6e && esc?.interfaceMode === 4;
}

// A single dropped frame at 115200 baud must not abort a flash write. Page
// erase, read and write are idempotent, so bounded retries are safe here
// (esc-configurator retries every 4-way command for the same reason).
const FLASH_COMMAND_ATTEMPTS = 3;
const FLASH_COMMAND_RETRY_DELAY_MS = 200;

function isRetryableFlashFailure(error) {
    return /timed out/i.test(error?.message || "");
}

function decodeNullTerminated(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    const end = view.findIndex((byte) => byte === 0 || byte === 0xff);
    return new TextDecoder().decode(end < 0 ? view : view.slice(0, end)).trim();
}

function decodeConnectedEscCount(response) {
    const data = response?.data;
    if (data instanceof DataView && data.byteLength > 0) return data.getUint8(0);
    if (data instanceof Uint8Array && data.byteLength > 0) return data[0];
    return null;
}

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export { FOUR_WAY_ACK };
