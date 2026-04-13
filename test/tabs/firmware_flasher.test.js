import { beforeEach, describe, expect, it, vi } from "vitest";
import { REMOTE_LOAD_TIMING_STEPS } from "../../src/js/utils/firmwareLoadTiming.js";

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
vi.mock("../../src/js/FileSystem", () => ({ default: {} }));
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
