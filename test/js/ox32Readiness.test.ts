import { afterEach, describe, expect, it, vi } from "vitest";
import { EscFourWayController } from "../../src/js/esc_melody/esc_four_way_controller.js";
import { FOUR_WAY_ACK as ACK, FOUR_WAY_COMMANDS as C } from "../../src/js/esc_melody/four_way.js";

afterEach(() => vi.useRealTimers());

interface SetupOptions {
    aliveAck?: number;
    warmFirst?: boolean;
    alwaysReject?: boolean;
    failure?: "invalidChannel" | "transport" | null;
}

function setup({ aliveAck = ACK.ok, warmFirst = false, alwaysReject = false, failure = null }: SetupOptions = {}) {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const commands: number[] = [];
    const waits: number[] = [];
    const handshakes: number[] = [];
    let enteredAt = 0;
    let sessions = 0;
    let selected = 0;
    const identity = "00112233445566778899AABB";
    const bytes = new Uint8Array(92);
    bytes.set(Uint8Array.from(identity.match(/../g)!.map((hex) => parseInt(hex, 16))), 8);
    bytes.set(new TextEncoder().encode("IO02300114100"), 20);
    const esc = (channel = 0) => ({
        channel,
        signature: 0x5306,
        inputPin: 0,
        interfaceMode: 4,
        firmwareFamily: "ox32",
        deviceIdentity: identity,
        bootloaderVersion: "3.00",
    });
    const controller = new EscFourWayController({
        serialAdapter: { send() {} },
        msp: {
            send_message(code, _payload, _sent, callback) {
                if (code === 245) enteredAt = Date.now();
                callback({ data: Uint8Array.of(4) });
                return true;
            },
        },
        sessionFactory() {
            sessions++;
            return {
                start() {},
                async stop() {},
                async send(command, params = []) {
                    commands.push(command);
                    if (command === C.interfaceTestAlive) return { ack: aliveAck, params: Uint8Array.of(0) };
                    if (command === C.deviceInitFlash) {
                        selected = params[0];
                        if (
                            failure ||
                            alwaysReject ||
                            (!(warmFirst && selected === 0) && Date.now() - enteredAt < 4500)
                        ) {
                            throw Object.assign(new Error("OX32 init rejected"), {
                                command,
                                ack: failure === "invalidChannel" ? ACK.invalidChannel : ACK.generalError,
                                ...(failure === "transport"
                                    ? { message: "Serial connection was lost during initialization" }
                                    : {}),
                            });
                        }
                        return { ack: ACK.ok, params: Uint8Array.of(6, 0x53, 0, 4) };
                    }
                    if (command === C.deviceRead) {
                        handshakes.push(selected);
                        return { ack: ACK.ok, params: bytes };
                    }
                    throw new Error(`Unexpected command 0x${command.toString(16)}`);
                },
            };
        },
        probeAlive: true,
        passthroughExitDelay: 0,
        writeInitRecoveryAttempts: 0,
        delay: async (ms) => {
            waits.push(ms);
            vi.setSystemTime(Date.now() + ms);
        },
    });
    return { controller, commands, waits, handshakes, esc, sessionCount: () => sessions };
}

function expectReadOnly(commands: number[]) {
    expect(
        commands.some((command) =>
            [C.deviceReset, C.devicePageErase, C.deviceEraseAll, C.deviceWrite, C.deviceWriteEeprom].includes(command),
        ),
    ).toBe(false);
}

describe("OX32 readiness after entering passthrough", () => {
    it("does not treat Alive ACK 0x0F as a ready ESC", async () => {
        const h = setup({ aliveAck: ACK.generalError });
        await h.controller.enter();
        await h.controller.selectEscWithInitRecovery(h.esc());
        expect(Date.now()).toBe(4500);
        expect(h.commands.filter((c) => c === C.deviceInitFlash)).toHaveLength(1);
        expect(h.sessionCount()).toBe(1);
        expectReadOnly(h.commands);
    });

    it("waits in the same session when Alive is OK but OX32 initialization is still rejected", async () => {
        const h = setup();
        await h.controller.enter();
        await h.controller.selectEscWithInitRecovery(h.esc());
        expect(h.waits).toEqual([100, 4400]);
        expect(h.commands.filter((c) => c === C.deviceInitFlash)).toHaveLength(2);
        expect(h.handshakes).toEqual([0]);
        expect(h.sessionCount()).toBe(1);
        expectReadOnly(h.commands);
    });

    it("keeps the fast path for an ESC which initializes immediately", async () => {
        const h = setup({ warmFirst: true });
        await h.controller.enter();
        await h.controller.selectEscWithInitRecovery(h.esc());
        expect(h.waits).toEqual([100]);
        expect(Date.now()).toBe(100);
        expectReadOnly(h.commands);
    });

    it("does not mistake one ready channel for readiness of every other channel", async () => {
        const h = setup({ warmFirst: true });
        await h.controller.enter();
        await h.controller.selectEscWithInitRecovery(h.esc(0));
        await h.controller.selectEscWithInitRecovery(h.esc(1));
        await h.controller.selectEscWithInitRecovery(h.esc(2));
        expect(h.waits).toEqual([100, 4400]);
        expect(h.handshakes).toEqual([0, 1, 2]);
        expect(h.sessionCount()).toBe(1);
        expectReadOnly(h.commands);
    });

    it("starts a new settling window when the passthrough session is rebuilt", async () => {
        const h = setup();
        await h.controller.enter();
        await h.controller.selectEscWithInitRecovery(h.esc());
        await h.controller.exit();
        await h.controller.enter();
        await h.controller.selectEscWithInitRecovery(h.esc());
        expect(h.waits).toEqual([100, 4400, 100, 4400]);
        expect(h.sessionCount()).toBe(2);
        expectReadOnly(h.commands);
    });

    it("still stops after bounded retries when an OX32 never becomes ready", async () => {
        const h = setup({ alwaysReject: true });
        await h.controller.enter();
        await expect(h.controller.selectEscWithInitRecovery(h.esc())).rejects.toThrow("OX32 init rejected");
        expect(h.commands.filter((c) => c === C.deviceInitFlash)).toHaveLength(4);
        expect(Date.now()).toBe(6000);
        expect(h.handshakes).toHaveLength(0);
        expectReadOnly(h.commands);
    });

    it.each(["invalidChannel", "transport"])("does not mask %s failures behind the settling wait", async (failure) => {
        const h = setup({ failure });
        await h.controller.enter();
        await expect(h.controller.selectEscWithInitRecovery(h.esc())).rejects.toThrow();
        expect(h.waits).toEqual([100]);
        expect(h.commands.filter((c) => c === C.deviceInitFlash)).toHaveLength(1);
        expectReadOnly(h.commands);
    });
});
