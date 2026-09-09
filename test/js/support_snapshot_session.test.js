import { afterEach, describe, expect, it } from "vitest";
import {
    activateSupportSnapshot,
    clearSupportSnapshot,
    getSupportSnapshotResponse,
    getSupportSnapshotEntry,
    supportSnapshotSession,
} from "../../src/js/support/SnapshotSession";
import { snapshotV2, addResponse } from "../fixtures/supportSnapshotV2";

describe("support snapshot v2 session", () => {
    afterEach(clearSupportSnapshot);
    it("only replays the exact index, never an empty or unique fallback", () => {
        const snapshot = addResponse(snapshotV2(), 137, "137:AQ==", "AQID");
        activateSupportSnapshot({ supportId: "SUP-TEST", snapshot });
        expect([...getSupportSnapshotResponse(137, [1])]).toEqual([1, 2, 3]);
        expect(getSupportSnapshotResponse(137, [2])).toBeNull();
        expect(getSupportSnapshotResponse(137, [])).toBeNull();
    });
    it.each([
        ["legacy", (s) => (s.schemaVersion = 1)],
        ["incomplete", (s) => (s.captureReport.complete = false)],
        ["missing report", (s) => delete s.captureReport],
        ["forged complete", (s) => (s.captureReport.requests[0].status = "timeout")],
        [
            "missing core identity",
            (s) => {
                s.mspResponses.shift();
                s.captureReport.requests.shift();
                s.captureReport.responseCount--;
                s.captureReport.plannedResponseCount--;
            },
        ],
        ["wrong key", (s) => (s.mspResponses[0].requestKey = "2:")],
        ["invalid base64", (s) => (s.mspResponses[0].payloadBase64 = "a===")],
        ["short payload", (s) => (s.mspResponses[0].payloadBase64 = "AA==")],
        ["wrong Profile", (s) => (s.captureReport.profile.rate = 0)],
    ])("rejects %s without activating or retaining partial data", (_name, mutate) => {
        const snapshot = snapshotV2();
        mutate(snapshot);
        expect(() => activateSupportSnapshot({ snapshot })).toThrow();
        expect(supportSnapshotSession.active).toBe(false);
        expect(getSupportSnapshotResponse(1, [])).toBeNull();
    });
    it("preserves unsupported as distinct from successful empty data", () => {
        const snapshot = addResponse(snapshotV2(), 137, "137:AQ==", "", true);
        activateSupportSnapshot({ snapshot });
        expect(getSupportSnapshotEntry(137, [1]).unsupported).toBe(true);
        expect(getSupportSnapshotResponse(137, [1])).toBeNull();
    });
    it("ignores contradictory summary fields and clears state on exit", () => {
        activateSupportSnapshot({ snapshot: snapshotV2(), captureReport: { profile: { pid: 0, rate: 0 } } });
        expect(supportSnapshotSession.captureReport.profile).toEqual({ pid: 1, rate: 2 });
        clearSupportSnapshot();
        expect(supportSnapshotSession.active).toBe(false);
        expect(getSupportSnapshotResponse(1, [])).toBeNull();
    });
});
