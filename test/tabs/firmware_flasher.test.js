import { beforeEach, describe, expect, it, vi } from "vitest";
import { REMOTE_LOAD_TIMING_STEPS } from "../../src/js/utils/firmwareLoadTiming.js";

const pickSaveFile = vi.fn();
const writeFile = vi.fn();

vi.mock("../../src/js/localization", () => ({
    i18n: {
        getMessage: (key) =>
            ({
                firmwareFlasherLoadTimingStepRequestBuild: "Request build",
                firmwareFlasherLoadTimingStepCloudWait: "Wait for cloud build",
                firmwareFlasherLoadTimingStepDownloadFirmware: "Download firmware",
                firmwareFlasherLoadTimingStepParseFirmware: "Parse firmware",
                firmwareFlasherLoadTimingStatusRunning: "running",
                firmwareFlasherLoadTimingStatusSuccess: "success",
                firmwareFlasherLoadTimingStatusFailed: "failed",
                firmwareFlasherLoadTimingStatusCancelled: "cancelled",
                firmwareFlasherLoadTimingEmpty: "No timing data yet.",
            })[key] || key,
        localizePage: vi.fn(),
    },
}));

vi.mock("../../src/js/gui", () => ({
    default: {
        interval_resume: vi.fn(),
        interval_pause: vi.fn(),
        tab_switch_cleanup: (callback) => callback(),
        content_ready: vi.fn(),
        showYesNoDialog: vi.fn(),
    },
    TABS: {},
}));

vi.mock("../../src/js/ConfigStorage", () => ({ get: vi.fn(() => ({})), set: vi.fn() }));
vi.mock("../../src/js/SessionStorage", () => ({ get: vi.fn(() => ({})), set: vi.fn() }));
vi.mock("../../src/js/BuildApi", () => ({
    default: class BuildApi {},
}));
vi.mock("../../src/js/ConfigInserter.js", () => ({
    default: class ConfigInserter {},
}));
vi.mock("../../src/js/Analytics", () => ({
    tracking: { sendEvent: vi.fn(), EVENT_CATEGORIES: { FLASHING: "FLASHING" } },
}));
vi.mock("../../src/js/port_handler", () => ({ default: {} }));
vi.mock("../../src/js/gui_log", () => ({ gui_log: vi.fn() }));
vi.mock("../../src/js/workers/hex_parser.js", () => ({ default: vi.fn() }));
vi.mock("../../src/js/FileSystem", () => ({
    default: {
        pickSaveFile,
        writeFile,
    },
}));
vi.mock("../../src/js/protocols/webstm32", () => ({ default: {} }));
vi.mock("../../src/js/protocols/webusbdfu", () => ({ default: {} }));
vi.mock("../../src/js/utils/AutoBackup.js", () => ({ default: {} }));
vi.mock("../../src/js/utils/AutoDetect.js", () => ({ default: {} }));
vi.mock("../../src/js/utils/firmwareTargets.js", () => ({
    groupFirmwareTargetDescriptors: vi.fn(),
    normalizeFirmwareTargetDescriptors: vi.fn(),
}));
vi.mock("../../src/components/eventBus", () => ({
    EventBus: { $on: vi.fn(), $off: vi.fn() },
}));
vi.mock("../../src/js/utils/connection.js", () => ({ ispConnected: () => false }));
vi.mock("../../src/js/fc", () => ({ default: { CONFIG: {} } }));
vi.mock("../../src/js/AppConfig", () => ({
    appConfig: {},
    buildDocsUrl: vi.fn(),
    buildLogUrl: vi.fn(),
}));

const { firmware_flasher } = await import("../../src/js/tabs/firmware_flasher.js");

describe("firmware flasher load timing panel", () => {
    beforeEach(() => {
        pickSaveFile.mockReset();
        writeFile.mockReset();
        document.body.innerHTML = `
            <div class="release_info">
                <div id="loadTimingInfo" class="load_timing_info">
                    <span class="load_timing_total_value"></span>
                    <div class="load_timing_empty"></div>
                    <ul class="load_timing_steps"></ul>
                </div>
            </div>
        `;
        firmware_flasher.loadTiming = null;
    });

    it("renders step rows and total duration after a successful session", () => {
        firmware_flasher.beginLoadTimingSession();
        firmware_flasher.startLoadTimingStep(REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD);
        firmware_flasher.completeLoadTimingStep(REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD);
        firmware_flasher.startLoadTimingStep(REMOTE_LOAD_TIMING_STEPS.DOWNLOAD_FIRMWARE);
        firmware_flasher.completeLoadTimingStep(REMOTE_LOAD_TIMING_STEPS.DOWNLOAD_FIRMWARE);
        firmware_flasher.finishLoadTimingSession("success");

        const stepTexts = Array.from(document.querySelectorAll(".load_timing_step")).map((node) => node.textContent);

        expect(getComputedStyle(document.querySelector("#loadTimingInfo")).display).not.toBe("none");
        expect(stepTexts).toHaveLength(2);
        expect(stepTexts[0]).toContain("request_build");
        expect(stepTexts[0]).toContain("success");
        expect(stepTexts[1]).toContain("download_firmware");
        expect(document.querySelector(".load_timing_total_value")?.textContent).toMatch(/ms|s/);
    });

    it("keeps completed rows and marks the failed step", () => {
        firmware_flasher.beginLoadTimingSession();
        firmware_flasher.startLoadTimingStep(REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD);
        firmware_flasher.completeLoadTimingStep(REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD);
        firmware_flasher.startLoadTimingStep(REMOTE_LOAD_TIMING_STEPS.PARSE_FIRMWARE);
        firmware_flasher.failLoadTimingStep(REMOTE_LOAD_TIMING_STEPS.PARSE_FIRMWARE);
        firmware_flasher.finishLoadTimingSession("failed");

        const stepTexts = Array.from(document.querySelectorAll(".load_timing_step")).map((node) => node.textContent);

        expect(stepTexts).toHaveLength(2);
        expect(stepTexts[0]).toContain("request_build");
        expect(stepTexts[0]).toContain("success");
        expect(stepTexts[1]).toContain("parse_firmware");
        expect(stepTexts[1]).toContain("failed");
    });
});

describe("firmware flasher download button", () => {
    beforeEach(() => {
        pickSaveFile.mockReset();
        writeFile.mockReset();
        document.body.innerHTML = `
            <a class="download_firmware disabled" href="#"></a>
            <a class="flash_firmware disabled" href="#"></a>
            <a class="load_remote_file disabled" href="#"></a>
            <a class="load_file disabled" href="#"></a>
            <a class="exit_dfu disabled" href="#"></a>
            <span class="progressLabel"></span>
        `;
        firmware_flasher.localFirmwareLoaded = false;
        firmware_flasher.parsed_hex = undefined;
        firmware_flasher.uf2_binary = undefined;
        firmware_flasher.firmware_type = undefined;
        firmware_flasher.filename = null;
    });

    it("toggles the download button explicitly", () => {
        firmware_flasher.enableDownloadFirmwareButton(true);
        expect(document.querySelector("a.download_firmware")?.classList.contains("disabled")).toBe(false);

        firmware_flasher.enableDownloadFirmwareButton(false);
        expect(document.querySelector("a.download_firmware")?.classList.contains("disabled")).toBe(true);
    });

    it("re-enables download after flashing state reset only for remote firmware", () => {
        firmware_flasher.parsed_hex = { bytes_total: 1234 };
        firmware_flasher.localFirmwareLoaded = false;

        firmware_flasher.resetFlashingState();
        expect(document.querySelector("a.download_firmware")?.classList.contains("disabled")).toBe(false);

        firmware_flasher.localFirmwareLoaded = true;
        firmware_flasher.resetFlashingState();
        expect(document.querySelector("a.download_firmware")?.classList.contains("disabled")).toBe(true);
    });

    it("keeps download disabled after stale remote UF2 state is cleared", () => {
        firmware_flasher.localFirmwareLoaded = false;
        firmware_flasher.enableDownloadFirmwareButton(false);

        firmware_flasher.uf2_binary = undefined;
        firmware_flasher.firmware_type = undefined;
        firmware_flasher.filename = null;

        firmware_flasher.resetFlashingState();

        expect(document.querySelector("a.download_firmware")?.classList.contains("disabled")).toBe(true);
    });

    it("saves online HEX firmware using the current filename", async () => {
        pickSaveFile.mockResolvedValue({ name: "remote.hex" });
        writeFile.mockResolvedValue();

        firmware_flasher.firmware_type = "HEX";
        firmware_flasher.filename = "remote.hex";
        firmware_flasher.intel_hex = ":100000000C9445000C946E000C946E000C946E00";

        await expect(firmware_flasher.saveLoadedFirmware()).resolves.toBe(true);
        expect(pickSaveFile).toHaveBeenCalledWith("remote.hex", "fileSystemPickerFiles", ".hex");
        expect(writeFile).toHaveBeenCalledWith({ name: "remote.hex" }, ":100000000C9445000C946E000C946E000C946E00");
    });

    it("saves online UF2 firmware as binary", async () => {
        const bytes = new Uint8Array([1, 2, 3, 4]);
        pickSaveFile.mockResolvedValue({ name: "remote.uf2" });
        writeFile.mockResolvedValue();

        firmware_flasher.firmware_type = "UF2";
        firmware_flasher.filename = "remote.uf2";
        firmware_flasher.uf2_binary = bytes;

        await expect(firmware_flasher.saveLoadedFirmware()).resolves.toBe(true);
        expect(pickSaveFile).toHaveBeenCalledWith("remote.uf2", "fileSystemPickerFiles", ".uf2");
        expect(writeFile).toHaveBeenCalledWith({ name: "remote.uf2" }, bytes);
    });
});
