import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EscFourWayController } from "../../src/js/esc_melody/esc_four_way_controller.js";
import { FOUR_WAY_COMMANDS as C, FOUR_WAY_ACK as A } from "../../src/js/esc_melody/four_way.js";
import { decodeBlheli32Settings, encodeBlheli32Settings } from "../../src/js/esc_melody/blheli32_config.ts";
import { createEscBackupPackage, parseEscBackupFile } from "../../src/js/esc_melody/backups.js";
import MSPCodes from "../../src/js/msp/MSPCodes.js";
const fixture = (suffix: string) =>
    new Uint8Array(readFileSync(`test/fixtures/esc_melody/blheli32-FPV32-32.10-${suffix}.bin`));
const SONG = { bpm: 120, notes: [{ midi: 60, start: 0, duration: 1 }] };
const reply = (params = Uint8Array.of(0)) => ({ ack: 0, params });
function deviceError(command: number, ack = A.generalError) {
    return Object.assign(new Error(`ACK ${ack}`), { command, ack });
}
function setup() {
    let image = fixture("decoded-1");
    let initFailures = 0;
    let failuresAfterWrite = 0;
    let readCount = 0;
    let writeAttempts = 0;
    let unstable = false;
    let fault: { command: number; message?: string } | null = null;
    let sessions = 0;
    let reentryFailure = false;
    let signature = Uint8Array.of(6, 21, 110, 4);
    const calls: { command: number; params: number[]; address: number }[] = [];
    const waits: number[] = [];
    const session = () => {
        sessions++;
        return {
            start() {},
            async stop() {},
            async send(command: number, params: number[], address = 0) {
                calls.push({ command, params: [...params], address });
                if (fault?.command === command) {
                    const failure = fault;
                    fault = null;
                    throw failure.message ? new Error(failure.message) : deviceError(command, A.invalidCommand);
                }
                if (command === C.deviceInitFlash) {
                    if (initFailures-- > 0) throw deviceError(command);
                    return reply(signature);
                }
                if (command === C.deviceRead) {
                    if (address !== 0x7c00 || params[0] !== 0)
                        throw Error("BLHeli32 must read one entire 256-byte wire block");
                    readCount++;
                    const next = image.slice();
                    if (unstable && readCount % 2 === 0) next[0x12] ^= 1;
                    return reply(encodeBlheli32Settings(next));
                }
                if (command === C.deviceWrite) {
                    expect(address).toBe(0x7c00);
                    expect(params).toHaveLength(256);
                    writeAttempts++;
                    image = decodeBlheli32Settings(Uint8Array.from(params));
                    if (failuresAfterWrite-- > 0) throw Error("4-way command 0x3b timed out");
                    return reply();
                }
                if ([C.devicePageErase, C.deviceEraseAll, C.deviceWriteEeprom].includes(command))
                    throw Error("Forbidden erase/EEPROM write");
                return reply();
            },
        };
    };
    const ctl = new EscFourWayController({
        serialAdapter: { send() {} },
        msp: {
            send_message(_c, _p, _s, cb) {
                if (reentryFailure && sessions > 0 && _c === MSPCodes.MSP_SET_4WAY_IF)
                    throw new Error("Flight controller is not connected");
                cb({ data: Uint8Array.of(1) });
                return true;
            },
        },
        sessionFactory: session,
        passthroughSettleDelay: 0,
        passthroughExitDelay: 0,
        delay: async (ms: number) => {
            waits.push(ms);
        },
    });
    return {
        ctl,
        calls,
        waits,
        get sessions() {
            return sessions;
        },
        set reentryFailure(value: boolean) {
            reentryFailure = value;
        },
        set fault(value: { command: number; message?: string }) {
            fault = value;
        },
        get image() {
            return image;
        },
        set image(v) {
            image = v;
        },
        set failures(v: number) {
            failuresAfterWrite = v;
        },
        set initFailures(v: number) {
            initFailures = v;
        },
        set unstable(v: boolean) {
            unstable = v;
        },
        set signature(v: Uint8Array) {
            signature = v;
        },
        get writes() {
            return writeAttempts;
        },
    };
}

describe("BLHeli32 protected full-config controller", () => {
    it("stops scanning when rebuilding the session after a recovery failure also fails", async () => {
        const h = setup();
        h.initFailures = 3;
        h.fault = { command: C.interfaceSetMode };
        h.reentryFailure = true;
        await expect(h.ctl.scan({ channels: 2 })).rejects.toThrow("无法重建");
        expect(h.calls.some((call) => call.command === C.deviceInitFlash && call.params[0] === 1)).toBe(false);
        expect(h.writes).toBe(0);
    });
    it("bounds failed cold-init retries and still scans the next channel in a new session", async () => {
        const h = setup();
        h.initFailures = 8;
        const escs = await h.ctl.scan({ channels: 2 });
        expect(escs[0].status).toBe("unavailable");
        expect(escs[1].canWrite).toBe(true);
        expect(h.calls.filter((call) => call.command === C.deviceInitFlash && call.params[0] === 0)).toHaveLength(8);
        expect(h.sessions).toBe(2);
    });
    it("restores the preceding music if a Music Off write loses every ACK", async () => {
        const h = setup();
        const [esc] = await h.ctl.scan();
        await h.ctl.writeEsc(esc, SONG);
        const before = h.image.slice();
        h.failures = 3;
        await expect(h.ctl.writeEsc(esc, { ...SONG, musicOff: true })).rejects.toThrow("原始 EEPROM 已写回");
        expect(h.image).toEqual(before);
        expect(esc.currentMelody.notes[0].midi).toBe(60);
    });
    for (const command of [
        C.protocolGetVersion,
        C.interfaceGetName,
        C.interfaceGetVersion,
        C.interfaceSetMode,
        C.interfaceTestAlive,
        C.deviceReset,
    ]) {
        for (const timeout of [false, true]) {
            it(`isolates recovery command 0x${command.toString(16)} ${timeout ? "timeout" : "rejection"} and scans the next channel`, async () => {
                const h = setup();
                h.initFailures = 3;
                h.fault = { command, ...(timeout ? { message: "4-way recovery command timed out" } : {}) };
                const escs = await h.ctl.scan({ channels: 2 });
                expect(escs[0].status).toBe("unavailable");
                expect(escs[0].reason).toContain("ARM 初始化恢复失败");
                expect(escs[1].canWrite).toBe(true);
                expect(h.sessions).toBe(2);
                expect(h.writes).toBe(0);
            });
        }
        it(`stops on connection loss in recovery command 0x${command.toString(16)}`, async () => {
            const h = setup();
            h.initFailures = 3;
            h.fault = { command, message: "Serial connection was lost during the 4-way operation" };
            await expect(h.ctl.scan({ channels: 2 })).rejects.toThrow("connection was lost");
            expect(h.calls.some((call) => call.command === C.deviceInitFlash && call.params[0] === 1)).toBe(false);
            expect(h.sessions).toBe(1);
            expect(h.writes).toBe(0);
        });
    }
    it("classifies a matching device with firmware 32.9 as unsupported after reading its configuration", async () => {
        const h = setup();
        const image = h.image.slice();
        image[1] = 90;
        h.image = image;
        const [esc] = await h.ctl.scan();
        expect(esc.confirmationStatus).toBe("unsupported");
        expect(esc.canRead).toBe(false);
        expect(h.calls.some((call) => call.command === C.deviceRead)).toBe(true);
    });
    it("writes explicit Music Off, verifies it, and can enable music again", async () => {
        const h = setup();
        const [esc] = await h.ctl.scan();
        await h.ctl.writeEsc(esc, SONG);
        const before = h.image.slice();
        await h.ctl.writeEsc(esc, { ...SONG, musicOff: true });
        expect(h.image[0x1c]).toBe(255);
        expect(h.image.slice(0x90)).toEqual(new Uint8Array(48).fill(255));
        for (let i = 0; i < 192; i++) if (i !== 0x1c && i < 0x90) expect(h.image[i]).toBe(before[i]);
        expect(esc.currentMelody).toBeNull();
        expect(esc.melodyReadStatus).toBe("empty");
        expect(esc.verified).toBe(true);
        await h.ctl.writeEsc(esc, SONG);
        expect(esc.currentMelody.notes[0].midi).toBe(60);
    });
    it("scans and reads the verified real profile without probing OX32 or restarting a working channel", async () => {
        const h = setup();
        const [esc] = await h.ctl.scan();
        expect(esc).toMatchObject({
            model: "FPV32",
            version: "32.10",
            firmwareFamily: "blheli32",
            settingsLength: 192,
            capacity: 48,
            canRead: true,
            canWrite: true,
            layoutVerified: true,
            currentMelodyMode: 255,
            melodyReadStatus: "empty",
        });
        expect(h.calls.filter((c) => c.command === C.deviceInitFlash)).toHaveLength(1);
        expect(h.calls.filter((c) => c.command === C.deviceRead)).toHaveLength(1);
        expect(h.calls.some((c) => c.command === C.deviceReset)).toBe(false);
    });
    it("uses official bounded cold-init recovery when normal init receives device errors", async () => {
        const h = setup();
        h.initFailures = 7;
        const [esc] = await h.ctl.scan();
        expect(esc.canWrite).toBe(true);
        expect(h.waits).toEqual([500, 1000, 100, 500, 500, 500, 5000]);
        expect(h.calls.filter((c) => c.command === C.deviceReset)).toHaveLength(1);
    });
    it("never reads a guessed address for unknown MCU/bootloader or accepts a corrupt layout", async () => {
        const h = setup();
        h.signature = Uint8Array.of(6, 53, 110, 4);
        const [unsupported] = await h.ctl.scan();
        expect(unsupported.canWrite).toBe(false);
        expect(h.calls.filter((c) => c.command === C.deviceRead).some((c) => c.address === 0x7c00)).toBe(false);
        const other = setup();
        const bad = other.image.slice();
        bad[0x60] ^= 1;
        other.image = bad;
        expect((await other.ctl.scan())[0].canWrite).toBe(false);
    });
    it("backs up decoded192, patches only native music, and verifies randomized reads without erasing", async () => {
        const h = setup();
        const [esc] = await h.ctl.scan();
        const original = h.image.slice();
        await h.ctl.backupEsc(esc);
        expect(esc.originalEeprom).toEqual(original);
        const backup = createEscBackupPackage([esc]);
        expect(parseEscBackupFile(JSON.stringify(backup)).escs[0].eeprom.byteLength).toBe(192);
        const result = await h.ctl.writeEsc(esc, SONG);
        expect(result.encoded.mode).toBe(0x80);
        expect(h.image[0x1c]).toBe(0x80);
        expect(h.image[0x90]).toBe(0xc0);
        for (let i = 0; i < 192; i++) if (i !== 0x1c && (i < 0x90 || i >= 0xc0)) expect(h.image[i]).toBe(original[i]);
        expect(esc.verified).toBe(true);
        expect(esc.currentMelody.notes[0].midi).toBe(60);
        expect(h.calls.some((c) => [C.devicePageErase, C.deviceEraseAll].includes(c.command))).toBe(false);
        expect(h.writes).toBe(1);
        const restore = await h.ctl.restoreBackup([{ esc, backupEntry: backup.escs[0] }]);
        expect(restore.ok).toBe(true);
        expect(h.image).toEqual(original);
        expect(esc.currentMelody).toBeNull();
        expect(esc.restoreTouched).toBe(false);
    });
    it("rejects changed decoded snapshots, even though ciphertext is always random", async () => {
        const h = setup();
        const [esc] = await h.ctl.scan();
        h.unstable = true;
        await expect(h.ctl.writeEsc(esc, SONG)).rejects.toThrow("连续读取不一致");
        expect(h.writes).toBe(0);
        expect(esc.writeTouched).toBe(false);
    });
    it("rechecks current firmware identity before any write", async () => {
        const h = setup();
        const [esc] = await h.ctl.scan();
        const changed = h.image.slice();
        changed[1] = 90;
        h.image = changed;
        await expect(h.ctl.writeEsc(esc, SONG)).rejects.toThrow("Unsupported");
        expect(h.writes).toBe(0);
    });
    it("retries identical encoded bytes and restores decoded original after a lost write ACK", async () => {
        const h = setup();
        const [esc] = await h.ctl.scan();
        const original = h.image.slice();
        h.failures = 3;
        await expect(h.ctl.writeEsc(esc, SONG)).rejects.toThrow("原始 EEPROM 已写回");
        expect(h.image).toEqual(original);
        expect(esc.writeTouched).toBe(false);
        const writes = h.calls.filter((c) => c.command === C.deviceWrite);
        expect(writes).toHaveLength(4);
        expect(writes[0].params).toEqual(writes[1].params);
        expect(writes[1].params).toEqual(writes[2].params);
    });
    it("retains recovery data when rollback fails, then re-encodes it during explicit recovery", async () => {
        const h = setup();
        const [esc] = await h.ctl.scan();
        const original = h.image.slice();
        h.failures = 6;
        await expect(h.ctl.writeEsc(esc, SONG)).rejects.toThrow("未能写回");
        expect(esc.writeTouched).toBe(true);
        expect(esc.operationBackup.image).toEqual(original);
        await h.ctl.recoverEsc(esc);
        expect(esc.writeTouched).toBe(false);
        expect(h.image).toEqual(original);
    });
    it("rejects encrypted or wrong-profile backups before writing", async () => {
        const h = setup();
        const [esc] = await h.ctl.scan();
        await h.ctl.backupEsc(esc);
        const backup = createEscBackupPackage([esc]);
        const bad = JSON.parse(JSON.stringify(backup));
        bad.escs[0].settingsLength = 256;
        bad.escs[0].eeprom = { encoding: "hex", byteLength: 256, data: Buffer.from(fixture("raw-1")).toString("hex") };
        expect(() => parseEscBackupFile(JSON.stringify(bad))).toThrow();
        const wrong = JSON.parse(JSON.stringify(backup.escs[0]));
        wrong.eeprom.data = "ff" + wrong.eeprom.data.slice(2);
        expect((await h.ctl.restoreBackup([{ esc, backupEntry: wrong }])).ok).toBe(false);
        expect(h.writes).toBe(0);
    });
});
