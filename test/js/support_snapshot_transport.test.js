import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MSP from "../../src/js/msp";
import CONFIGURATOR from "../../src/js/data_storage";
import { serial } from "../../src/js/serial";
import MspHelper from "../../src/js/msp/MSPHelper";
import FC from "../../src/js/fc";
import "../../src/js/injected_methods";
import { activateSupportSnapshot, clearSupportSnapshot } from "../../src/js/support/SnapshotSession";
import { snapshotV2, addResponse } from "../fixtures/supportSnapshotV2";

beforeEach(() => {
    FC.resetState();
    FC.CONFIG.apiVersion = "1.47.0";
    MSP.clearListeners();
    MSP.callbacks_cleanup();
    MSP.listen(new MspHelper().process_data.bind(new MspHelper()));
});
afterEach(() => {
    CONFIGURATOR.supportSnapshotMode = false;
    MSP.snapshotCaptureActive = false;
    MSP.callbacks_cleanup();
    MSP.clearListeners();
    clearSupportSnapshot();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("snapshot MSP transport", () => {
    it("blocks writes even when the snapshot contains a recorded write acknowledgement", async () => {
        activateSupportSnapshot({ snapshot: addResponse(snapshotV2(), 210, "210:AQ==", "") });
        CONFIGURATOR.supportSnapshotMode = true;
        const send = vi.spyOn(serial, "send");
        await expect(MSP.promise(210, [1])).rejects.toThrow("只读");
        expect(send).not.toHaveBeenCalled();
    });
    it("preserves unsupported and skips decoding instead of setting defaults", async () => {
        activateSupportSnapshot({ snapshot: addResponse(snapshotV2(), 96, "96:", "", true) });
        CONFIGURATOR.supportSnapshotMode = true;
        FC.SENSOR_CONFIG.acc_hardware = 42;
        await expect(MSP.promise(96)).rejects.toThrow("不支持");
        expect(MSP.unsupported).toBe(1);
        expect(FC.SENSOR_CONFIG.acc_hardware).toBe(42);
    });
    it("rejects absent replies instead of resolving with default state", async () => {
        activateSupportSnapshot({ snapshot: snapshotV2() });
        CONFIGURATOR.supportSnapshotMode = true;
        await expect(MSP.promise(137, [2])).rejects.toThrow("未采集");
    });
    it("does not replay queued data after the session is closed", async () => {
        activateSupportSnapshot({ snapshot: snapshotV2() });
        CONFIGURATOR.supportSnapshotMode = true;
        const pending = MSP.promise(1);
        clearSupportSnapshot();
        CONFIGURATOR.supportSnapshotMode = false;
        await expect(pending).rejects.toThrow("已关闭");
    });
    it("keeps concurrent parameterised response callbacks separate", async () => {
        const snapshot = addResponse(
            addResponse(snapshotV2(), 0x3006, "12294:AQ==", "AQFB"),
            0x3006,
            "12294:Ag==",
            "AgFC",
        );
        activateSupportSnapshot({ snapshot });
        CONFIGURATOR.supportSnapshotMode = true;
        const [first, second] = await Promise.all([MSP.promise(0x3006, [1]), MSP.promise(0x3006, [2])]);
        expect(first.data.getUint8(0)).toBe(1);
        expect(second.data.getUint8(0)).toBe(2);
    });
    it("times out the actual pending request and removes retry timers/callbacks", async () => {
        vi.useFakeTimers();
        vi.spyOn(serial, "connected", "get").mockReturnValue(true);
        vi.spyOn(serial, "send").mockImplementation(() => {});
        MSP.snapshotCaptureActive = true;
        const result = expect(MSP.captureRequest(1, [], { signal: new AbortController().signal })).rejects.toThrow(
            "超时",
        );
        expect(MSP.callbacks.length).toBe(1);
        await vi.advanceTimersByTimeAsync(3000);
        await result;
        expect(MSP.callbacks).toHaveLength(0);
        expect(vi.getTimerCount()).toBe(0);
    });
    it("settles a pending capture on tab cleanup/disconnect", async () => {
        vi.spyOn(serial, "connected", "get").mockReturnValue(true);
        vi.spyOn(serial, "send").mockImplementation(() => {});
        MSP.snapshotCaptureActive = true;
        const result = expect(MSP.captureRequest(1, [], { signal: new AbortController().signal })).rejects.toThrow(
            "取消",
        );
        MSP.callbacks_cleanup();
        await result;
        expect(MSP.callbacks).toHaveLength(0);
    });
    it("passes a firmware unsupported packet through the live decoder to the collector", async () => {
        vi.spyOn(serial, "connected", "get").mockReturnValue(true);
        vi.spyOn(serial, "send").mockImplementation(() => {});
        MSP.snapshotCaptureActive = true;
        const pending = MSP.captureRequest(96, [], { signal: new AbortController().signal });
        // $M! <length=0> <code=96> <checksum=96>
        MSP.read({ data: new Uint8Array([36, 77, 33, 0, 96, 96]).buffer });
        expect((await pending).unsupported).toBe(true);
    });
    it("reports CRC failure from the wire and resumes real transport after snapshot exit", async () => {
        vi.spyOn(serial, "connected", "get").mockReturnValue(true);
        const send = vi.spyOn(serial, "send").mockImplementation(() => {});
        MSP.snapshotCaptureActive = true;
        const capture = MSP.captureRequest(1, [], { signal: new AbortController().signal });
        MSP.read({ data: new Uint8Array([36, 77, 62, 3, 1, 0, 1, 47, 0]).buffer });
        await expect(capture).rejects.toThrow("CRC");
        MSP.snapshotCaptureActive = false;
        activateSupportSnapshot({ snapshot: snapshotV2() });
        CONFIGURATOR.supportSnapshotMode = true;
        await MSP.promise(1);
        clearSupportSnapshot();
        CONFIGURATOR.supportSnapshotMode = false;
        const before = send.mock.calls.length;
        MSP.send_message(1);
        expect(send.mock.calls.length).toBe(before + 1);
    });
});
