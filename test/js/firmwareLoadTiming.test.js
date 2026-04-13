import { describe, expect, it } from "vitest";
import {
    REMOTE_LOAD_TIMING_STEPS,
    cancelLoadTimingStep,
    completeLoadTimingStep,
    createLoadTiming,
    failLoadTimingStep,
    finishLoadTiming,
    setLoadTimingPhase,
    startLoadTimingStep,
} from "../../src/js/utils/firmwareLoadTiming.js";

describe("firmware remote load timing helpers", () => {
    it("records a successful cloud-build path and total duration", () => {
        const loadTiming = createLoadTiming(1000);

        startLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD, "Request build", 1010);
        completeLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD, "success", 1400);

        startLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.CLOUD_WAIT, "Cloud wait", 1410);
        setLoadTimingPhase(loadTiming, REMOTE_LOAD_TIMING_STEPS.CLOUD_WAIT, "building", 1500);
        setLoadTimingPhase(loadTiming, REMOTE_LOAD_TIMING_STEPS.CLOUD_WAIT, "uploading", 3000);
        completeLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.CLOUD_WAIT, "success", 4100);

        startLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.DOWNLOAD_FIRMWARE, "Download firmware", 4200);
        completeLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.DOWNLOAD_FIRMWARE, "success", 5200);

        startLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.PARSE_FIRMWARE, "Parse firmware", 5300);
        completeLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.PARSE_FIRMWARE, "success", 5600);

        finishLoadTiming(loadTiming, "success", 5800);

        expect(loadTiming.status).toBe("success");
        expect(loadTiming.totalMs).toBe(4800);
        expect(loadTiming.steps.map((step) => step.key)).toEqual([
            REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD,
            REMOTE_LOAD_TIMING_STEPS.CLOUD_WAIT,
            REMOTE_LOAD_TIMING_STEPS.DOWNLOAD_FIRMWARE,
            REMOTE_LOAD_TIMING_STEPS.PARSE_FIRMWARE,
        ]);
        expect(loadTiming.steps.find((step) => step.key === REMOTE_LOAD_TIMING_STEPS.CLOUD_WAIT)?.phases).toEqual([
            {
                phase: "building",
                startedAt: 1500,
                finishedAt: 3000,
                durationMs: 1500,
            },
            {
                phase: "uploading",
                startedAt: 3000,
                finishedAt: 4100,
                durationMs: 1100,
            },
        ]);
    });

    it("keeps finished steps when a later step fails", () => {
        const loadTiming = createLoadTiming(0);

        startLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD, "Request build", 10);
        completeLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD, "success", 110);

        startLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.DOWNLOAD_FIRMWARE, "Download firmware", 120);
        failLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.DOWNLOAD_FIRMWARE, 480);
        finishLoadTiming(loadTiming, "failed", 500);

        expect(loadTiming.status).toBe("failed");
        expect(loadTiming.steps.find((step) => step.key === REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD)?.status).toBe(
            "success",
        );
        expect(loadTiming.steps.find((step) => step.key === REMOTE_LOAD_TIMING_STEPS.DOWNLOAD_FIRMWARE)?.status).toBe(
            "failed",
        );
    });

    it("marks the active step as cancelled", () => {
        const loadTiming = createLoadTiming(0);

        startLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD, "Request build", 5);
        completeLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD, "success", 25);

        startLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.CLOUD_WAIT, "Cloud wait", 30);
        cancelLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.CLOUD_WAIT, 230);
        finishLoadTiming(loadTiming, "cancelled", 240);

        expect(loadTiming.status).toBe("cancelled");
        expect(loadTiming.steps.find((step) => step.key === REMOTE_LOAD_TIMING_STEPS.CLOUD_WAIT)?.status).toBe(
            "cancelled",
        );
    });

    it("supports direct download flows without a cloud wait step", () => {
        const loadTiming = createLoadTiming(0);

        startLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD, "Request build", 10);
        completeLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.REQUEST_BUILD, "success", 50);

        startLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.DOWNLOAD_FIRMWARE, "Download firmware", 60);
        completeLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.DOWNLOAD_FIRMWARE, "success", 120);

        startLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.PARSE_FIRMWARE, "Parse firmware", 130);
        completeLoadTimingStep(loadTiming, REMOTE_LOAD_TIMING_STEPS.PARSE_FIRMWARE, "success", 150);
        finishLoadTiming(loadTiming, "success", 160);

        expect(loadTiming.steps.some((step) => step.key === REMOTE_LOAD_TIMING_STEPS.CLOUD_WAIT)).toBe(false);
    });
});
