import { describe, expect, it } from "vitest";
import { EscFourWayController } from "../../src/js/esc_melody/esc_four_way_controller.js";
import { FOUR_WAY_COMMANDS as C, FOUR_WAY_ACK as A } from "../../src/js/esc_melody/four_way.js";

const reply = (params: Uint8Array = Uint8Array.of(0)) => ({ ack: A.ok, params });
const initError = () =>
    Object.assign(new Error("Device init rejected"), { command: C.deviceInitFlash, ack: A.generalError });

function bluejayScan(failed: number[], transientFailures = 0) {
    let active = 0;
    let forcedArm = false;
    let transients = transientFailures;
    const calls: { command: number; channel: number; params: number[] }[] = [];
    const delays: number[] = [];
    const stops: { exit?: boolean }[] = [];
    const session = {
        start() {},
        async stop(options = {}) {
            stops.push(options);
        },
        async send(command: number, params: number[], address = 0) {
            calls.push({ command, channel: active, params: [...params] });
            if (command === C.interfaceSetMode) forcedArm = params[0] === 4;
            if (command === C.deviceInitFlash) {
                active = params[0];
                if (failed.includes(active) || forcedArm || transients-- > 0) throw initError();
                return reply(Uint8Array.of(0xb2, 0xe8, 0x64, 1));
            }
            if (command === C.deviceRead) {
                if (address === 0x1a60) return reply(new TextEncoder().encode("Bluejay TEST    "));
                if (address === 0x1a00) return reply(Uint8Array.of(0, 21, 208));
                if (address === 0x1a70) return reply(new Uint8Array(128).fill(255));
                if (address === 0x1af0) return reply(Uint8Array.of(0, 0));
                throw Error("Unexpected read address");
            }
            if ([C.deviceWrite, C.deviceWriteEeprom, C.devicePageErase, C.deviceEraseAll].includes(command))
                throw Error("Scan must not mutate flash");
            return reply();
        },
    };
    const controller = new EscFourWayController({
        sessionFactory: () => session,
        serialAdapter: { send() {} },
        msp: {
            send_message(_code, _payload, _sent, callback) {
                callback({ data: Uint8Array.of(4) });
                return true;
            },
        },
        passthroughSettleDelay: 0,
        passthroughExitDelay: 0,
        delay: async (milliseconds: number) => {
            delays.push(milliseconds);
        },
    });
    return { controller, calls, delays, stops };
}

const resetOrArmMode = (call: { command: number; params: number[] }) =>
    call.command === C.deviceReset || (call.command === C.interfaceSetMode && call.params[0] === 4);

describe("unknown-channel scan recovery boundaries", () => {
    it.each([0, 2, 3])(
        "does not reset failed channel %i or force later Bluejay channels into ARM mode",
        async (failed) => {
            const h = bluejayScan([failed]);
            const records = await h.controller.scan({ channels: 4 });
            expect(records).toHaveLength(4);
            expect(records[failed].status).toBe("unavailable");
            expect(records.filter((esc) => esc.canWrite)).toHaveLength(3);
            expect(h.calls.some(resetOrArmMode)).toBe(false);
            expect(
                h.calls.filter((call) => call.command === C.deviceInitFlash && call.params[0] === failed),
            ).toHaveLength(3);
            expect(h.delays).toEqual([500, 1000]);
            expect(h.stops).toEqual([{ exit: true }]);
            expect(h.controller.inPassthrough).toBe(false);
        },
    );

    it("exits a scan with no identified family after bounded init retries and no reset commands", async () => {
        const h = bluejayScan([0, 1, 2, 3]);
        const records = await h.controller.scan({ channels: 4 });
        expect(records.every((esc) => esc.status === "unavailable")).toBe(true);
        expect(h.calls.filter((call) => call.command === C.deviceInitFlash)).toHaveLength(12);
        expect(h.calls.some(resetOrArmMode)).toBe(false);
        expect(h.stops).toEqual([{ exit: true }]);
    });

    it("still identifies a transiently rejecting Bluejay without a reset or a second session", async () => {
        const h = bluejayScan([], 2);
        const [esc] = await h.controller.scan({ channels: 1 });
        expect(esc).toMatchObject({ firmwareFamily: "bluejay", canWrite: true, melodyReadStatus: "empty" });
        expect(h.calls.filter((call) => call.command === C.deviceInitFlash)).toHaveLength(3);
        expect(h.calls.some(resetOrArmMode)).toBe(false);
        expect(h.stops).toEqual([{ exit: true }]);
    });
});
