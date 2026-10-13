import { describe, expect, it } from "vitest";
import { makeLog } from "./fixtures.js";
import { analyzeLog } from "../../src/js/passive-tune/analysis.js";
import { parseLog } from "../../src/js/passive-tune/parser.js";
import { normalizeLog } from "../../src/js/passive-tune/normalization.js";
import { segmentLog } from "../../src/js/passive-tune/segmentation.js";
import { controlMetrics, lagEstimate, signalSummary } from "../../src/js/passive-tune/control-metrics.js";
import { aiEvidence } from "../../src/js/passive-tune/ai-evidence.js";
import { aiSource } from "./ai-fixtures.js";

describe("independent motion and controller evidence", () => {
    it("anchors the first S frame after a main frame without splitting every unchanged refresh", () => {
        const log = normalizeLog(
            parseLog(
                makeLog({
                    samples: 100,
                    slowFrames: new Map([
                        [1, [1, 0, 1, 1]],
                        [40, [1, 0, 1, 1]],
                        [80, [1, 0, 1, 1]],
                    ]),
                }),
                0,
            ),
        );
        const spans = segmentLog(log).usableSpans;
        expect(spans).toHaveLength(1);
        expect(spans[0].start).toBe(1);
        expect(spans[0].stateKnown).toBe(true);
    });
    it("supports verified 2026.6 throttle/output, angular raw gyro scale and unscaled PID terms", () => {
        const log = normalizeLog(
            parseLog(
                makeLog({
                    revision: "Betaflight 2026.6.2 (fixture)",
                    samples: 128,
                    highResolution: 1,
                    extraChannels: {
                        "setpoint[3]": () => 600,
                        "motor[0]": () => 1800,
                        "gyroUnfilt[0]": () => 1200,
                        "axisP[0]": () => 50,
                    },
                    extraHeaders: ["H features:0", "H motorOutput:1000,2000"],
                }),
                0,
            ),
        );
        expect(log.throttle[0]).toBe(60);
        expect(log.motorBounds.high).toBe(2000);
        expect(log.channels["gyroUnfilt[0]"][0]).toBe(120);
        expect(log.channels["axisP[0]"][0]).toBe(50);
        expect(normalizeLog({ ...log, firmware: "Betaflight 2027.1.0" }).throttle).toBeNull();
    });
    it("retains repeated S refreshes and stateFlags, while invalidating state across a real timing gap", () => {
        const log = normalizeLog(
            parseLog(
                makeLog({
                    samples: 100,
                    slowFields: [
                        "flightModeFlags",
                        "stateFlags",
                        "failsafePhase",
                        "rxSignalReceived",
                        "rxFlightChannelsValid",
                    ],
                    slowFrames: new Map([
                        [0, [1, 3, 0, 1, 1]],
                        [50, [1, 3, 0, 1, 1]],
                        [80, [1, 3, 0, 1, 1]],
                    ]),
                    gaps: new Map([[40, 50000]]),
                }),
                0,
            ),
        );
        expect(log.states).toHaveLength(3);
        expect(log.states[0].fields.stateFlags).toBe(3);
        const spans = segmentLog(log).usableSpans;
        expect(spans.find((s) => s.start === 40).stateKnown).toBe(false);
        expect(spans.find((s) => s.start === 50).stateKnown).toBe(true);
    });
    it("keeps multi-axis non-step tracking and controller observations without inventing step metrics", () => {
        const input = (n) => 50 * Math.sin(n / 35),
            other = (n) => 80 * Math.sin(n / 29);
        const result = analyzeLog(
            makeLog({
                samples: 2048,
                fs: 1000,
                inputs: [input, other, () => 0],
                outputs: [(n) => input(n) - 3, other, () => 0],
                extraChannels: {
                    "axisP[0]": () => 10,
                    "axisI[0]": () => -4,
                    "axisD[0]": () => 2,
                    "axisF[0]": (n) => Math.round((50 * Math.cos(n / 35)) / 35),
                },
                slowFrames: new Map([[0, [1, 0, 1, 1]]]),
            }),
            0,
        );
        const mixed = result.motion.records.find((e) => e.type === "mixed_input");
        expect(mixed.inputEligibility).toBe("ineligible");
        expect(mixed.metrics).toBeNull();
        expect(mixed.diagnostics.eligibility.tracking).toBe(true);
        expect(mixed.diagnostics.tracking.rmsDegPerSecond).toBeCloseTo(3, 1);
        expect(mixed.diagnostics.control.terms.I.mean).toBe(-4);
        expect(result.axes.roll.actions.candidateConfoundedCount).toBe(result.axes.roll.actions.candidateCount);
        expect(result.axes.roll.actions.eligibleConfoundedCount).toBe(0);
        const packet = aiEvidence(result, aiSource);
        expect(packet.motion.representatives.some((e) => e.eventType === "mixed_maneuver" && e.tracking)).toBe(true);
        expect(packet.axes[0].capabilities.tracking).toBe(true);
        expect(packet.axes[0].capabilities.stepResponse).toBe(false);
    });
    it("integrates PID activity by actual dt, preserves bias and detects FF derivative association", () => {
        const time = [0, 1000, 4000];
        expect(signalSummary(time, [0, 2, 2], [{ start: 0, end: 3 }]).rms).toBeCloseTo(Math.sqrt(3.5));
        const t = Float64Array.from({ length: 501 }, (_, i) => i * 1000),
            x = Float32Array.from(t, (v) => (v / 1000) ** 2),
            f = Float32Array.from(t, (v) => 2 * v);
        const result = controlMetrics(
            { channels: { time: t, "setpoint[0]": x, "axisF[0]": f, "axisI[0]": Float32Array.from(t, () => -5) } },
            0,
            [{ start: 0, end: t.length }],
        );
        expect(result.terms.I.mean).toBe(-5);
        expect(result.ffCommandDerivativeCorrelation).toBeCloseTo(1, 5);
        expect(result.terms.D).toBeNull();
    });
    it("recovers a known local lag without changing raw error, and rejects constant or boundary searches", () => {
        const t = Float64Array.from({ length: 1000 }, (_, i) => i * 1000);
        const fn = (i) => 50 * Math.sin(i * 0.09) + 30 * Math.sin(i * 0.037);
        const x = Float32Array.from(t, (_, i) => fn(i)),
            y = Float32Array.from(t, (_, i) => fn(i - 20));
        const estimate = lagEstimate(t, x, y, 0, t.length);
        expect(estimate.valueMs).toBe(20);
        expect(estimate.status).toBe("limited");
        expect(
            lagEstimate(
                t,
                Float32Array.from(t, () => 100),
                y,
                0,
                t.length,
            ).valueMs,
        ).toBeNull();
        expect(
            lagEstimate(
                t,
                x,
                Float32Array.from(t, (_, i) => fn(i - 100)),
                0,
                t.length,
            ).reasonCode,
        ).toBe("LAG_SEARCH_BOUNDARY");
    });
});
