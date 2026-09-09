import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportSnapshotRecorder } from "../../src/js/support/SnapshotRecorder";
import { snapshotV2 } from "../fixtures/supportSnapshotV2";

function harness(override) {
    const fixture = snapshotV2();
    const fc = {
        CONFIG: { profile: 1, rateProfile: 2, apiVersion: "1.47.0", flightControllerVersion: "4.6.0" },
        VTX_CONFIG: { vtx_table_bands: 2, vtx_table_powerlevels: 2 },
    };
    const state = {};
    const msp = {
        captureRequest: vi.fn(async (code, data, options) => {
            const entry = fixture.mspResponses.find((item) => item.code === code);
            const bytes = entry
                ? Uint8Array.from(atob(entry.payloadBase64), (c) => c.charCodeAt(0))
                : new Uint8Array([data[0] || 1, 0]);
            return (
                override?.(code, data, options, fc) || {
                    data: new DataView(bytes.buffer),
                    crcError: false,
                    unsupported: false,
                }
            );
        }),
    };
    return { recorder: new SupportSnapshotRecorder({ msp, fc, config: { version: "test" }, state }), msp, fc, state };
}

describe("isolated support capture", () => {
    afterEach(() => vi.useRealTimers());
    it("captures indexed VTX/name requests and freezes the captured Profile", async () => {
        const { recorder, msp, fc, state } = harness();
        await recorder.captureStaticConfiguration();
        expect(msp.captureRequest.mock.calls.some(([code, data]) => code === 137 && data[0] === 2)).toBe(true);
        expect(msp.captureRequest.mock.calls.some(([code]) => code === 0x3006)).toBe(true);
        fc.CONFIG.profile = 0;
        fc.CONFIG.rateProfile = 0;
        expect(recorder.createPayload("cli").captureReport.profile).toEqual({ pid: 1, rate: 2 });
        expect(Object.isFrozen(recorder.frozen.mspResponses[0])).toBe(true);
        expect(state.ready).toBe(true);
        expect(msp.snapshotCaptureActive).toBe(false);
    });
    it("rejects a Profile change and releases capture lock", async () => {
        let statuses = 0;
        const { recorder, state, msp } = harness((code, _data, _options, fc) => {
            if (code === 150 && ++statuses === 3) fc.CONFIG.profile = 0;
        });
        await expect(recorder.captureStaticConfiguration()).rejects.toThrow("Profile");
        expect(state.ready).toBe(false);
        expect(msp.snapshotCaptureActive).toBe(false);
        expect(() => recorder.createPayload("")).toThrow();
    });
    it("records optional unsupported responses without inventing bytes", async () => {
        const { recorder } = harness((code) => (code === 137 ? { unsupported: true } : null));
        const snapshot = await recorder.captureStaticConfiguration();
        expect(snapshot.mspResponses.find((entry) => entry.code === 137)).toMatchObject({
            unsupported: true,
            payloadBase64: "",
        });
    });
    it.each(["crc", "unsupported", "timeout"])("does not submit a %s failure", async (kind) => {
        const { recorder, msp } = harness(() => {
            if (kind === "timeout") throw new DOMException("timeout", "TimeoutError");
            return { crcError: kind === "crc", unsupported: kind === "unsupported" };
        });
        await expect(recorder.captureStaticConfiguration()).rejects.toThrow();
        expect(msp.snapshotCaptureActive).toBe(false);
        expect(() => recorder.createPayload("")).toThrow();
    });
    it("cancels an in-flight request on stop and permits fresh capture", async () => {
        const h = harness();
        h.msp.captureRequest.mockImplementationOnce(
            (_code, _data, { signal }) =>
                new Promise((_resolve, reject) =>
                    signal.addEventListener("abort", () => reject(new Error("cancelled"))),
                ),
        );
        const capture = h.recorder.captureStaticConfiguration();
        const rejection = expect(capture).rejects.toThrow("cancelled");
        h.recorder.stop();
        await rejection;
        expect(h.state.active).toBe(false);
        await h.recorder.captureStaticConfiguration();
        expect(h.state.ready).toBe(true);
    });
    it("aborts the entire operation at 60 seconds", async () => {
        vi.useFakeTimers();
        const h = harness();
        h.msp.captureRequest.mockImplementation(
            (_code, _data, { signal }) =>
                new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
        );
        const assertion = expect(h.recorder.captureStaticConfiguration()).rejects.toThrow("60");
        await vi.advanceTimersByTimeAsync(60_000);
        await assertion;
        expect(h.state.active).toBe(false);
    });
});
