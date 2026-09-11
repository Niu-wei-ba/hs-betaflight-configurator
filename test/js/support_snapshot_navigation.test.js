import { describe, expect, it } from "vitest";
import { isSupportSnapshotMenuVisible } from "../../src/js/support/SnapshotNavigation";
describe("snapshot menu visibility", () => {
    it.each(["CONNECTING", "HANDSHAKING", "CONNECTED", "CLI", "REBOOTING", "RECONNECTING", "FLASHING"])(
        "hides during %s",
        (connectionPhase) => {
            expect(isSupportSnapshotMenuVisible({ connectionPhase })).toBe(false);
            expect(isSupportSnapshotMenuVisible({ connectionPhase, supportSnapshotMode: true })).toBe(true);
        },
    );
    it("shows when disconnected and hides as soon as a connection starts", () => {
        expect(isSupportSnapshotMenuVisible({ connectionPhase: "IDLE" })).toBe(true);
        expect(isSupportSnapshotMenuVisible({ connectionPhase: "IDLE", connectingTo: "serial" })).toBe(false);
        expect(isSupportSnapshotMenuVisible({ connectionPhase: "FAILED" })).toBe(true);
    });
});
