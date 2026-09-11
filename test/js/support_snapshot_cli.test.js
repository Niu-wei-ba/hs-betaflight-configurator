import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCli } from "../../src/composables/useCli";
import { supportSnapshotRecorder, supportSnapshotCaptureState } from "../../src/js/support/SnapshotRecorder";
import CONFIGURATOR from "../../src/js/data_storage";
import GUI from "../../src/js/gui";
import CliAutoComplete from "../../src/js/CliAutoComplete";

let cli;
beforeEach(() => {
    CONFIGURATOR.cliActive = false;
    CONFIGURATOR.cliValid = false;
    CONFIGURATOR.connectionValid = false;
    supportSnapshotRecorder.stop();
    supportSnapshotCaptureState.active = false;
    vi.spyOn(GUI, "timeout_add").mockImplementation(() => {});
    vi.spyOn(CliAutoComplete, "initialize").mockImplementation(() => {});
    cli = useCli();
});
afterEach(() => {
    cli.cleanup();
    vi.restoreAllMocks();
});

describe("CLI capture lifecycle", () => {
    it("does not enter CLI or schedule # until capture succeeds", async () => {
        let resolve;
        vi.spyOn(supportSnapshotRecorder, "captureStaticConfiguration").mockImplementation(
            () => new Promise((done) => (resolve = done)),
        );
        const pending = cli.initialize();
        expect(CONFIGURATOR.cliActive).toBe(false);
        expect(cli.state.cliReady).toBe(false);
        expect(GUI.timeout_add).not.toHaveBeenCalled();
        resolve();
        await pending;
        expect(CONFIGURATOR.cliActive).toBe(true);
        expect(GUI.timeout_add).toHaveBeenCalledWith("enter_cli", expect.any(Function), 250);
    });
    it("does not enter CLI after leaving the page during capture", async () => {
        let resolve;
        vi.spyOn(supportSnapshotRecorder, "captureStaticConfiguration").mockImplementation(
            () => new Promise((done) => (resolve = done)),
        );
        const pending = cli.initialize();
        cli.cleanup();
        resolve();
        await pending;
        expect(CONFIGURATOR.cliActive).toBe(false);
        expect(GUI.timeout_add).not.toHaveBeenCalled();
    });
    it("allows retry after failure and never offers an incomplete payload", async () => {
        const capture = vi
            .spyOn(supportSnapshotRecorder, "captureStaticConfiguration")
            .mockRejectedValueOnce(new Error("timeout"))
            .mockResolvedValueOnce({});
        await cli.initialize();
        expect(cli.state.cliReady).toBe(false);
        expect(() => supportSnapshotRecorder.createPayload("")).toThrow();
        await cli.initialize();
        expect(capture).toHaveBeenCalledTimes(2);
        expect(cli.state.cliReady).toBe(true);
    });
    it("preserves CLI-only recovery without allowing support submission", async () => {
        const capture = vi.spyOn(supportSnapshotRecorder, "captureStaticConfiguration");
        await cli.initialize({ withoutSnapshot: true });
        expect(capture).not.toHaveBeenCalled();
        expect(cli.state.cliReady).toBe(true);
        expect(supportSnapshotCaptureState.ready).toBe(false);
        expect(() => supportSnapshotRecorder.createPayload("")).toThrow();
    });
});
