import { afterEach, describe, expect, it } from "vitest";
import {
    activateSupportSnapshot,
    clearSupportSnapshot,
    createSupportSnapshotRequestKey,
    getSupportSnapshotResponse,
    supportSnapshotSession,
} from "../../src/js/support/SnapshotSession";

describe("support snapshot session", () => {
    afterEach(() => clearSupportSnapshot());

    it("looks up an exact MSP response by code and request payload", () => {
        const requestKey = createSupportSnapshotRequestKey(0x3006, [5]);
        activateSupportSnapshot({
            supportId: "SUP-23456789ABCDEFGH",
            snapshot: {
                schemaVersion: 1,
                mspResponses: [{ code: 0x3006, requestKey, payloadBase64: "AQID" }],
            },
        });

        expect(supportSnapshotSession.active).toBe(true);
        expect([...getSupportSnapshotResponse(0x3006, [5])]).toEqual([1, 2, 3]);
        // Older collectors may not preserve a request payload. A unique response for a code
        // is therefore safe to replay as a compatibility fallback.
        expect([...getSupportSnapshotResponse(0x3006, [2])]).toEqual([1, 2, 3]);
    });

    it("clears the loaded data when the support session is closed", () => {
        activateSupportSnapshot({
            supportId: "SUP-23456789ABCDEFGH",
            snapshot: {
                schemaVersion: 1,
                mspResponses: [{ code: 1, requestKey: createSupportSnapshotRequestKey(1, []), payloadBase64: "AQ==" }],
            },
        });
        clearSupportSnapshot();

        expect(supportSnapshotSession.active).toBe(false);
        expect(getSupportSnapshotResponse(1, [])).toBeNull();
    });
});
