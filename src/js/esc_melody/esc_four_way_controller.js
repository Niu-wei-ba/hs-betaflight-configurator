import MSP from "../msp.js";
import MSPCodes from "../msp/MSPCodes.js";
import { serial as defaultSerial } from "../serial.js";
import { FOUR_WAY_ACK, FOUR_WAY_COMMANDS, FourWaySession } from "./four_way.js";
import {
    applyEscFirmwareFamily,
    decodeEscInfo,
    createEscRecord,
    ESC_FIRMWARE,
    ESC_MELODY_READ_STATUS,
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
        initRetryDelays = [0, 500, 1000],
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
        this.initRetryDelays = initRetryDelays;
        this.delay = delay;
        this.session = null;
        this.inPassthrough = false;
        this.activeChannel = null;
        this.connectedEscCount = null;
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
        this.session = this.sessionFactory({ serial: this.serial });
        this.session.start();
        this.inPassthrough = true;
        this.activeChannel = null;
        if (this.passthroughSettleDelay > 0) {
            await this.delay(this.passthroughSettleDelay);
        }
        return this.session;
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
                try {
                    const initResponse = await this.initFlash(channel);
                    this.activeChannel = channel;
                    const record = decodeEscInfo(initResponse.params, channel);
                    await this.probeFirmware(record);
                    await this.readSelectedEscMelody(record);
                    record.model = record.model === "ESC not identified" ? `ESC channel ${channel + 1}` : record.model;
                    record.status = "ready";
                    escs.push(record);
                } catch (error) {
                    if (isTransportFailure(error)) throw error;
                    escs.push(
                        createEscRecord(channel, {
                            model: `ESC channel ${channel + 1}`,
                            reason: error?.message || "No response from this ESC.",
                            status: "unavailable",
                        }),
                    );
                }
            }
            return escs;
        } finally {
            await this.exit();
        }
    }

    async initFlash(channel) {
        let lastError;
        for (const retryDelay of this.initRetryDelays) {
            if (retryDelay > 0) await this.delay(retryDelay);
            try {
                return await this.session.send(FOUR_WAY_COMMANDS.deviceInitFlash, [channel]);
            } catch (error) {
                lastError = error;
                if (isTransportFailure(error) || error?.ack === FOUR_WAY_ACK.invalidChannel) throw error;
            }
        }
        throw lastError || new Error(`ESC ${channel + 1} did not respond to 4-way initialization`);
    }

    async probeFirmware(esc) {
        if (esc.interfaceMode === 0 || esc.interfaceMode === 1) {
            if (!esc.settingsOffset) return esc;
            const nameResponse = await this.session.send(FOUR_WAY_COMMANDS.deviceRead, [16], esc.settingsOffset + 0x60);
            const name = decodeNullTerminated(nameResponse.params);
            if (/^Bluejay(?:\s|\(|$)/i.test(name)) {
                applyEscFirmwareFamily(esc, ESC_FIRMWARE.BLUEJAY, {
                    reason: "",
                    layout: `Pseudo-EEPROM 0x${esc.settingsOffset.toString(16).toUpperCase()} + 0x70 · 128 B melody + rests`,
                });
                const header = await this.session.send(FOUR_WAY_COMMANDS.deviceRead, [3], esc.settingsOffset);
                esc.version = `${header.params[0]}.${header.params[1]}`;
            }
            return esc;
        }

        if (esc.interfaceMode === 4 && (await this.probeOx32(esc))) return esc;
        if (!esc.settingsOffset) return esc;

        if (esc.firmwareFamily === ESC_FIRMWARE.AM32) {
            const header = await this.session.send(FOUR_WAY_COMMANDS.deviceRead, [5], esc.settingsOffset);
            esc.version = `${header.params[3]}.${header.params[4]}`;
            esc.settingsLength = header.params[1] >= 3 ? 0xc0 : 0xb0;
            esc.layout = `Flash 0x${esc.settingsOffset.toString(16).toUpperCase()} + 0x30 · ${esc.settingsLength} B · page 1 KB`;
        }
        return esc;
    }

    async probeOx32(esc) {
        let handshake;
        try {
            const bytes = await this.readMemoryImage(OX32_HANDSHAKE_OFFSET, OX32_HANDSHAKE_LENGTH);
            handshake = parseOx32Handshake(bytes);
        } catch (error) {
            if (/connection was lost|serial adapter/i.test(error?.message || "")) throw error;
            applyEscFirmwareFamily(esc, ESC_FIRMWARE.UNKNOWN, {
                canRead: true,
                canBackup: false,
                canWrite: false,
                layout: "ARM firmware · OX32 handshake not readable",
                reason: "ARM firmware could not be distinguished safely from OX32. Writing is disabled for this channel.",
            });
            return true;
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
            const melodyBytes = await this.readMemoryImage(esc.settingsOffset + esc.melodyRelativeOffset, capacity);
            let currentWaitBytes = null;
            let waitMs;
            if (Number.isInteger(esc.waitRelativeOffset)) {
                currentWaitBytes = await this.readMemoryImage(esc.settingsOffset + esc.waitRelativeOffset, 2);
                waitMs = currentWaitBytes[0] | (currentWaitBytes[1] << 8);
            }
            return this.storeCurrentMelody(esc, melodyBytes, currentWaitBytes, waitMs);
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
            await this.selectEsc(esc);
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
                await this.selectEsc(esc);
                backups.push(await this.backupSelectedEsc(esc));
            }
            return backups;
        } finally {
            await this.exit();
        }
    }

    async backupSelectedEsc(esc) {
        if (!esc?.canBackup) throw new Error(`ESC ${esc?.channel + 1} does not support backups`);
        if (!esc.settingsOffset || !esc.settingsLength) throw new Error("ESC settings layout is incomplete");
        const image = await this.readMemoryImage(esc.settingsOffset, esc.settingsLength);
        esc.originalEeprom = image;
        esc.currentEeprom = new Uint8Array(image);
        if (Number.isInteger(esc.settingsChecksumAddress)) {
            esc.originalSettingsChecksum = await this.readMemoryImage(esc.settingsChecksumAddress, 4);
            esc.currentSettingsChecksum = new Uint8Array(esc.originalSettingsChecksum);
        }
        if (esc.waitRelativeOffset !== undefined) {
            esc.originalWaitBytes = esc.originalEeprom.slice(esc.waitRelativeOffset, esc.waitRelativeOffset + 2);
            esc.waitMs = esc.originalWaitBytes[0] | (esc.originalWaitBytes[1] << 8);
        }
        esc.backedUp = true;
        return esc.originalEeprom;
    }

    async writeEsc(esc, melody) {
        await this.enter();
        try {
            return await this.writeSelectedEsc(esc, melody);
        } finally {
            await this.exit();
        }
    }

    async writeSelectedEsc(esc, melody) {
        if (!esc?.canWrite) throw new Error(esc?.reason || "This ESC cannot be written");
        const encoded = encodeFirmwareMelody(melody, esc.firmwareFamily, esc.capacity || 128);
        await this.selectEsc(esc);
        if (!esc.backedUp) await this.backupSelectedEsc(esc);

        const patched = patchSettingsImage(esc.originalEeprom, esc, encoded.bytes, encoded.waitMs);
        if (esc.erasePage !== undefined) {
            await this.session.send(FOUR_WAY_COMMANDS.devicePageErase, [esc.erasePage]);
        }
        await this.writeMemoryImage(esc.settingsOffset, patched);
        const readBack = await this.readMemoryImage(esc.settingsOffset, patched.length);
        esc.currentEeprom = new Uint8Array(readBack);
        if (!equalBytes(patched, readBack)) throw new Error(`ESC ${esc.channel + 1} read-back verification failed`);
        if (Number.isInteger(esc.settingsChecksumAddress)) {
            esc.currentSettingsChecksum = await this.writeAndVerifyOx32Checksum(esc, patched);
        }
        this.storeCurrentMelody(
            esc,
            encoded.bytes,
            Number.isInteger(esc.waitRelativeOffset) ? encodeWaitMs(encoded.waitMs) : null,
            Number.isInteger(esc.waitRelativeOffset) ? encoded.waitMs : undefined,
        );
        esc.verified = true;
        return { esc, encoded };
    }

    async writeMelody(escs, melody) {
        const writable = (escs || []).filter((esc) => esc.canWrite);
        const written = [];
        await this.enter();
        try {
            for (let index = 0; index < writable.length; index += 1) {
                const esc = writable[index];
                this.report({ phase: "write", channel: esc.channel, index, total: writable.length });
                try {
                    await this.writeSelectedEsc(esc, typeof melody === "function" ? melody(esc) : melody);
                    esc.status = "verified";
                    written.push(esc);
                } catch (error) {
                    esc.status = "failed";
                    return { ok: false, error, failed: esc, written };
                }
            }
            return { ok: true, written };
        } finally {
            await this.exit();
        }
    }

    async recoverEsc(esc) {
        await this.enter();
        try {
            await this.selectEsc(esc);
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
                await this.selectEsc(esc);
                recovered.push(await this.recoverSelectedEsc(esc));
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
                    await this.selectEsc(esc);
                    await this.restoreBackupSelectedEsc(esc, target.backupEntry);
                    restored.push(esc);
                    rollback.push(esc);
                } catch (error) {
                    if (esc) esc.status = "failed";
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
        esc.restoreTouched = true;
        if (esc.erasePage !== undefined) {
            await this.session.send(FOUR_WAY_COMMANDS.devicePageErase, [esc.erasePage]);
        }
        await this.writeMemoryImage(esc.settingsOffset, eeprom);
        const readBack = await this.readMemoryImage(esc.settingsOffset, eeprom.length);
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

    async recoverSelectedEsc(esc) {
        if (!esc?.originalEeprom?.length) throw new Error("No backup is available for this ESC");
        if (esc.erasePage !== undefined) {
            await this.session.send(FOUR_WAY_COMMANDS.devicePageErase, [esc.erasePage]);
        }
        await this.writeMemoryImage(esc.settingsOffset, esc.originalEeprom);
        const check = await this.readMemoryImage(esc.settingsOffset, esc.originalEeprom.length);
        if (!equalBytes(esc.originalEeprom, check)) throw new Error("Backup recovery verification failed");
        if (Number.isInteger(esc.settingsChecksumAddress)) {
            if (!esc.originalSettingsChecksum?.length) throw new Error("No OX32 checksum backup is available");
            await this.writeMemoryImage(esc.settingsChecksumAddress, esc.originalSettingsChecksum);
            const checksumCheck = await this.readMemoryImage(esc.settingsChecksumAddress, 4);
            if (!equalBytes(esc.originalSettingsChecksum, checksumCheck)) {
                throw new Error("OX32 checksum recovery verification failed");
            }
            esc.currentSettingsChecksum = new Uint8Array(checksumCheck);
        }
        this.applyRestoredSettings(esc, check, esc.currentSettingsChecksum);
        esc.restoreTouched = false;
        return esc;
    }

    applyRestoredSettings(esc, settings, settingsChecksum = null) {
        esc.currentEeprom = new Uint8Array(settings);
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
            this.storeCurrentMelody(
                esc,
                melodyBytes,
                waitBytes,
                waitBytes ? waitBytes[0] | (waitBytes[1] << 8) : undefined,
            );
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

    storeCurrentMelody(esc, melodyBytes, waitBytes = null, waitMs) {
        const currentMelody = decodeFirmwareMelody(melodyBytes, {
            name: `ESC ${esc.channel + 1}`,
            waitMs,
        });
        esc.currentMelodyBytes = new Uint8Array(melodyBytes);
        esc.currentWaitBytes = waitBytes ? new Uint8Array(waitBytes) : null;
        esc.currentMelody = currentMelody;
        esc.melodyReadStatus = currentMelody ? ESC_MELODY_READ_STATUS.LOADED : ESC_MELODY_READ_STATUS.EMPTY;
        esc.melodyReadError = "";
        return currentMelody;
    }

    async selectEsc(esc) {
        if (!this.session) throw new Error("ESC 4-way session is not active");
        const channel = Number(esc?.channel);
        if (!Number.isInteger(channel) || channel < 0) throw new Error("ESC channel is invalid");
        const response = await this.initFlash(channel);
        const selected = decodeEscInfo(response.params, channel);
        if (esc.signature !== undefined && selected.signature !== esc.signature) {
            throw new Error(`ESC ${channel + 1} identity changed; write was cancelled`);
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

    async readMemoryImage(address, length) {
        const image = new Uint8Array(length);
        for (let offset = 0; offset < length; offset += 256) {
            const chunkLength = Math.min(256, length - offset);
            const response = await this.session.send(
                FOUR_WAY_COMMANDS.deviceRead,
                [chunkLength === 256 ? 0 : chunkLength],
                address + offset,
            );
            if (response.params.length !== chunkLength) {
                throw new Error(`4-way read returned ${response.params.length} bytes; expected ${chunkLength}`);
            }
            image.set(response.params, offset);
        }
        return image;
    }

    async writeMemoryImage(address, image) {
        const bytes = image instanceof Uint8Array ? image : new Uint8Array(image || []);
        for (let offset = 0; offset < bytes.length; offset += 256) {
            const chunk = bytes.slice(offset, offset + 256);
            await this.session.send(FOUR_WAY_COMMANDS.deviceWrite, Array.from(chunk), address + offset);
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
        if (session) {
            try {
                await session.stop({ exit: shouldExit });
            } catch {
                // Session state is cleared even when the serial link has
                // already disappeared, allowing MSP to reconnect cleanly.
            }
        }
        if (shouldExit && this.passthroughExitDelay > 0) {
            await this.delay(this.passthroughExitDelay);
        }
    }

    report(progress) {
        this.onProgress?.(progress);
    }
}

export function equalBytes(a, b) {
    const left = a instanceof Uint8Array ? a : new Uint8Array(a || []);
    const right = b instanceof Uint8Array ? b : new Uint8Array(b || []);
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

export function patchSettingsImage(original, esc, melodyBytes, waitMs = 0) {
    const image = new Uint8Array(original);
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
