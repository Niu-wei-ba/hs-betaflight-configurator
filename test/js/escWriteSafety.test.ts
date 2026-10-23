import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EscFourWayController } from "../../src/js/esc_melody/esc_four_way_controller.js";
import { FOUR_WAY_COMMANDS as C, FourWaySession, createFourWayResponse } from "../../src/js/esc_melody/four_way.js";

const name = new TextEncoder().encode("Bluejay         ");
function setup({ badBackup = false, unstable = false, failWrites = false } = {}) {
    const mem = new Uint8Array(0x3800).fill(255);
    mem.set(readFileSync("test/fixtures/esc_melody/bluejay-B_X_30_24-v0.19.2-application.bin"));
    mem.set([0, 19, 206], 0x3000);
    mem.set(name, 0x3060);
    const trace = [];
    let fullReads = 0;
    let writeAttempts = 0;
    const factory = () => ({
        start() {},
        async stop() {},
        async send(command, params, address = 0) {
            trace.push({ command, address, length: params.length });
            if (command === C.deviceInitFlash) return { params: Uint8Array.of(0xb5, 0xe8, 100, 1) };
            if (command === C.deviceRead) {
                const bytes = mem.slice(address, address + (params[0] || 256));
                if (address === 0x3000 && params[0] === 255) {
                    fullReads++;
                    if (unstable && fullReads % 2 === 0) bytes[0x1b] ^= 1;
                }
                if (badBackup && address === 0x3000 && params[0] === 255) bytes.fill(255, 0x60, 0x70);
                return { params: bytes };
            }
            if (command === C.devicePageErase) {
                mem.fill(255, 0x3000, 0x3800);
                return { params: Uint8Array.of(0) };
            }
            if (command === C.deviceWrite) {
                writeAttempts++;
                if (failWrites && writeAttempts <= 3) throw Error("4-way command 0x3b timed out");
                mem.set(params, address);
                return { params: Uint8Array.of(0) };
            }
            throw Error("Unexpected " + command);
        },
    });
    const ctl = new EscFourWayController({
        msp: {
            send_message(_c, _p, _s, cb) {
                cb();
                return true;
            },
        },
        serialAdapter: { send() {} },
        sessionFactory: factory,
        passthroughSettleDelay: 0,
        passthroughExitDelay: 0,
        delay: async () => {},
    });
    return { mem, trace, ctl };
}
const song = { bpm: 120, notes: [{ midi: 60, start: 0, duration: 1 }] };

function expectNoWrites(trace) {
    expect(trace.filter(({ command }) => [C.devicePageErase, C.deviceWrite].includes(command))).toEqual([]);
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function blockedSerial() {
    const commands = [];
    let releaseFirst;
    let session;
    const serial = {
        addEventListener() {},
        removeEventListener() {},
        send(frame) {
            commands.push(frame[1]);
            if (commands.length === 1)
                return new Promise((resolve) => {
                    releaseFirst = () => resolve({ bytesSent: frame.length });
                });
            queueMicrotask(() =>
                session.onReceive({
                    detail: { data: createFourWayResponse(frame[1], [0], 0, (frame[2] << 8) | frame[3]) },
                }),
            );
            return Promise.resolve({ bytesSent: frame.length });
        },
    };
    session = new FourWaySession({ serial, timeout: 30 });
    return { session, commands, release: () => releaseFirst() };
}

describe("ESC write safety", () => {
    it("preserves every non-melody byte from a fresh Bluejay snapshot", async () => {
        const { mem, ctl } = setup();
        const [esc] = await ctl.scan({ channels: 1 });
        const original = mem.slice(0x3000, 0x30ff);
        await ctl.writeEsc(esc, song);
        const current = mem.slice(0x3000, 0x30ff);
        for (let i = 0; i < original.length; i++) if (i < 0x70 || i >= 0xf2) expect(current[i]).toBe(original[i]);
        expect(esc.verified).toBe(true);
    });
    it("does not overwrite a repaired name from a stale missing-name backup", async () => {
        const { mem, ctl } = setup();
        mem.fill(255, 0x3060, 0x3070);
        const [esc] = await ctl.scan({ channels: 1 });
        await ctl.backupEsc(esc);
        const historical = new Uint8Array(esc.originalEeprom);
        mem.set(name, 0x3060);
        mem[0x301b] = 37;
        await ctl.writeEsc(esc, song);
        expect(Array.from(mem.slice(0x3060, 0x3070))).toEqual(Array.from(name));
        expect(mem[0x301b]).toBe(37);
        expect(esc.originalEeprom).toEqual(historical);
        expect(Array.from(esc.operationBackup.image.slice(0x60, 0x70))).toEqual(Array.from(name));
        expect(esc.verified).toBe(true);
    });
    it("rejects a repeatable full-page response inconsistent with the independent tags before erasing", async () => {
        const { mem, ctl, trace } = setup({ badBackup: true });
        const [esc] = await ctl.scan({ channels: 1 });
        const original = new Uint8Array(mem);
        await expect(ctl.writeEsc(esc, song)).rejects.toThrow("名称标识不一致");
        expectNoWrites(trace);
        expect(mem).toEqual(original);
        expect(esc.writeTouched).not.toBe(true);
    });
    it("rejects unstable full-page reads before erasing or replacing a historical backup", async () => {
        const { mem, ctl, trace } = setup({ unstable: true });
        const [esc] = await ctl.scan({ channels: 1 });
        const original = new Uint8Array(mem);
        const historical = Uint8Array.of(1, 2, 3);
        esc.originalEeprom = historical;
        esc.backedUp = true;
        await expect(ctl.writeEsc(esc, song)).rejects.toThrow("连续读取不一致");
        expectNoWrites(trace);
        expect(mem).toEqual(original);
        expect(esc.originalEeprom).toBe(historical);
    });
    it("rolls back a failed write to the fresh repaired settings, preserving the older historical backup", async () => {
        const { mem, ctl } = setup({ failWrites: true });
        mem.fill(255, 0x3060, 0x3070);
        const [esc] = await ctl.scan({ channels: 1 });
        await ctl.backupEsc(esc);
        const historical = new Uint8Array(esc.originalEeprom);
        mem.set(name, 0x3060);
        mem[0x301b] = 38;
        const current = mem.slice(0x3000, 0x30ff);
        await expect(ctl.writeEsc(esc, song)).rejects.toThrow("原始 EEPROM 已写回");
        expect(mem.slice(0x3000, 0x30ff)).toEqual(current);
        expect(esc.originalEeprom).toEqual(historical);
        expect(esc.writeTouched).toBe(false);
    });
    it("does not refresh a rollback image while a touched channel still needs recovery", async () => {
        const { ctl, trace, mem } = setup();
        const [esc] = await ctl.scan({ channels: 1 });
        esc.writeTouched = true;
        esc.backedUp = true;
        esc.originalEeprom = mem.slice(0x3000, 0x30ff);
        const previous = new Uint8Array(esc.originalEeprom);
        esc.operationBackup = { image: previous };
        await expect(ctl.writeEsc(esc, song)).rejects.toThrow("不能覆盖");
        expect(esc.operationBackup.image).toBe(previous);
        expectNoWrites(trace);
    });
});

describe("4-way queued frame cancellation", () => {
    it("never transmits an erase that expired in the write queue", async () => {
        const { session, commands, release } = blockedSerial();
        await session.send(C.deviceRead, [3], 0x3000).catch(() => {});
        await session.send(C.devicePageErase, [24], 0).catch(() => {});
        release();
        await pause(5);
        expect(commands).toEqual([C.deviceRead]);
        session.abort(Error("finished"));
    });
    it("invalidates old queued erases across abort and restart while allowing a new live request", async () => {
        const { session, commands, release } = blockedSerial();
        await session.send(C.deviceRead, [3], 0x3000).catch(() => {});
        const erase = session.send(C.devicePageErase, [24], 0).catch((error) => error.message);
        session.abort(Error("test abort"));
        expect(await erase).toBe("test abort");
        session.start();
        const alive = session.send(C.interfaceTestAlive, [0], 0, 200);
        expect(commands).toEqual([C.deviceRead]);
        release();
        await alive;
        expect(commands).toEqual([C.deviceRead, C.interfaceTestAlive]);
        session.abort(Error("finished"));
    });
    it("cancels pending destructive commands before sending InterfaceExit", async () => {
        const { session, commands, release } = blockedSerial();
        await session.send(C.deviceRead, [3], 0x3000).catch(() => {});
        const erase = session.send(C.devicePageErase, [24], 0).catch(() => {});
        const stopped = session.stop({ exit: true });
        await erase;
        release();
        await stopped;
        expect(commands).toEqual([C.deviceRead, C.interfaceExit]);
        expect(session.started).toBe(false);
    });
});
