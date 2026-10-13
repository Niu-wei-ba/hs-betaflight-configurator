import { eventCurve } from "../../src/js/passive-tune/evidence-registry.js";
import { explainEvidence } from "../../src/js/passive-tune/ai-provider.js";
import { describe, expect, it, vi } from "vitest";
import { groupThrottle } from "../../src/js/passive-tune/throttle.js";
import { trackingMetrics, outputMetrics } from "../../src/js/passive-tune/tracking-metrics.js";
import { analyzeLog } from "../../src/js/passive-tune/analysis.js";
import { residualMetrics } from "../../src/js/passive-tune/phases.js";
import { flightContext } from "../../src/js/passive-tune/flight-context.js";
import { aiEvidence } from "../../src/js/passive-tune/ai-evidence.js";
import { evidenceView } from "../../src/js/passive-tune/evidence-view.js";
import { metricReferences, evidenceIds } from "../../src/js/passive-tune/ai-motion-evidence.js";
import { conclusionMessages, parseConclusion } from "../../src/js/passive-tune/ai-conclusion.js";
import { makeLog } from "./fixtures.js";
import { aiSource, aiConclusion } from "./ai-fixtures.js";

describe("V0.5 interval accounting and output constraints", () => {
    it("owns every unequal-dt interval including singleton bins, excludes gaps, and partitions independently", () => {
        const time = Float64Array.from([0, 100000, 300000, 400000, 500000, 1000000, 1100000, 1400000]);
        const log = {
            channels: { time },
            throttle: Float32Array.from([10, 25, 10, 16, 19, 65, 66, 67]),
            capabilities: {},
        };
        const spans = [
            { start: 0, end: 5, configEpoch: 0, stateFieldsPresent: true },
            { start: 5, end: 8, configEpoch: 0, stateFieldsPresent: false },
        ];
        const value = groupThrottle(log, spans);
        expect(value.totalSeconds).toBeCloseTo(0.9, 12);
        expect(value.coverageSeconds["20-40"]).toBeCloseTo(0.2, 12);
        expect(Object.values(value.coverage.classificationSeconds).reduce((a, b) => a + b, 0)).toBeCloseTo(0.9, 12);
        expect(value.coverage.accountingErrorSeconds).toBeCloseTo(0, 12);
        const signal = Float32Array.from(time, () => 3),
            target = Float32Array.from(time, () => 0);
        expect(
            value.windows.reduce((sum, w) => sum + trackingMetrics(time, target, signal, [w]).durationSeconds, 0),
        ).toBeCloseTo(0.9, 12);
        expect(value.stableWindows).toHaveLength(1);
        expect(value.stableWindows[0].start).toBe(5);
    });
    it("separates changing, short, stable, unknown and invalid intervals with a complete ledger", () => {
        const log = {
            channels: { time: Float64Array.from([0, 100000, 200000, 300000, 400000, 500000, 600000, 700000, 800000]) },
            throttle: Float32Array.from([NaN, -1, 10, 40, 41, 42, 43, 44, 45]),
            capabilities: {},
        };
        const t = groupThrottle(log, [{ start: 0, end: 9 }]);
        expect(t.coverage.classificationSeconds).toMatchObject({ unknown: 0.1, invalid: 0.1, changing_throttle: 0.1 });
        expect(t.coverage.includedSeconds + t.coverage.excludedSeconds).toBeCloseTo(0.8);
        expect(t.coverage.accountingErrorSeconds).toBeCloseTo(0, 12);
    });
    it("measures union bounds, per-motor runs, simultaneous counts and independent invalid denominators", () => {
        const log = {
            motorBounds: { low: 100, high: 200, tolerance: 2, source: "header" },
            channels: {
                time: Float64Array.from([0, 1000, 3000, 4000, 6000]),
                "motor[0]": Float32Array.from([100, 100, 150, 250, 150]),
                "motor[1]": Float32Array.from([200, 150, 100, 100, 100]),
            },
        };
        const o = outputMetrics(log, [{ start: 0, end: 5 }]);
        expect(o.durationSeconds).toBe(0.004);
        expect(o.invalidSeconds).toBe(0.002);
        expect(o.nearLowerFraction).toBe(1);
        expect(o.nearUpperFraction).toBe(0.25);
        expect(o.longestLowerMs).toBe(4);
        expect(o.perMotor[0].longestLowerMs).toBe(3);
        expect(o.lowerMotorCountSeconds).toEqual([0, 0.004, 0]);
        expect(o.perMotor[1].durationSeconds).toBe(0.006);
        expect(o.controlAuthorityLimited).toBe("unknown");
        expect(outputMetrics({ ...log, motorBounds: null }, [{ start: 0, end: 5 }]).nearLowerFraction).toBeNull();
    });
});
function stoppedLog(gain = 1) {
    return makeLog({
        samples: 1600,
        fs: 1000,
        input: (n) => (n >= 300 && n < 800 ? 100 : 0),
        output: (n) => {
            if (n < 300) return 0;
            if (n < 800) return Math.round(gain * 100 * (1 - Math.exp(-(n - 300) / 35)));
            return Math.round(gain * 100 * Math.exp(-(n - 800) / 35));
        },
        extraChannels: {
            "setpoint[3]": () => 300,
            "motor[0]": () => 1100,
            "axisP[0]": () => 5,
            "axisD[0]": () => 2,
            "axisI[0]": () => 3,
            "axisF[0]": () => 1,
        },
        extraHeaders: ["H features:0", "H motorOutput:1000,2000"],
    });
}
describe("V0.5 diagnosis eligibility and phases", () => {
    it("retains poor responses under the same command qualification and provides real stop phases", () => {
        const good = analyzeLog(stoppedLog(), 0),
            poor = analyzeLog(stoppedLog(0.4), 0);
        expect(good.motion.records[0].phases.find((p) => p.kind === "command_change").status).toBe("measured");
        expect(good.motion.records[0].phases.find((p) => p.kind === "command_change").durationSeconds).toBeCloseTo(
            0.001,
            8,
        );
        expect(poor.motion.records.length).toBe(good.motion.records.length);
        expect(poor.axes.roll.actions.eligibleCount).toBe(good.axes.roll.actions.eligibleCount);
        const e = poor.motion.records.find((e) => e.stopToHold);
        expect(e.phases.find((p) => p.kind === "post_stop").residual.peakAbsDegPerSecond).toBeGreaterThan(0);
        expect(e.phases.find((p) => p.kind === "post_stop").observationTruncated).toBe(false);
        expect(e.phases.find((p) => p.kind === "post_stop").durationSeconds).toBeCloseTo(0.5, 8);
        const curve = eventCurve(poor.localLog, e);
        expect(curve.points.at(-1).timeMs).toBeGreaterThan((e.timeEndSeconds - e.timeStartSeconds) * 1000);
        expect(curve.points.length).toBeLessThanOrEqual(1800);
        expect(e.diagnostics.context.armedState).toBe("unknown");
        expect(e.diagnostics.diagnosticEligibility.stopResidual.status).toBe("qualified");
        expect(e.diagnostics.control.terms.D).not.toBeNull();
        expect(poor.axes.yaw.control.terms.D).toBeNull();
    });
    it("keeps 52ms measurements but prevents comparison and lag claims", () => {
        const input = (n) => (n < 300 ? 0 : n < 320 ? (n - 300) * 2 : n < 352 ? 40 : 0);
        const result = analyzeLog(makeLog({ samples: 1000, fs: 1000, input, output: (n) => input(n) - 30 }), 0);
        const short = result.motion.records.find((e) => e.diagnostics.tracking.durationSeconds < 0.1);
        expect(short.diagnostics.measurementStatus).toBe("measured");
        expect(short.diagnostics.diagnosticEligibility.trackingComparison.status).toBe("insufficient");
        expect(short.diagnostics.lagEstimate.localLagCandidateMs).toBeNull();
    });
    it("does not equate the verified ARM switch bit to actual arming, and refuses unknown builds", () => {
        const event = { stateFieldsPresent: true, recordedState: { flightModeFlags: 0x80800001 } };
        const c = flightContext({ firmware: "Betaflight 2026.6.2 (e0b7bb01b)" }, event);
        expect(c.armSwitchActive).toBe(true);
        expect(c.armedState).toBe("unknown");
        expect(c.airborneState).toBe("unknown");
        expect(c.unknownModeBits).toBe(0x80800000);
        expect(flightContext({ firmware: "Betaflight 2026.6.2 (unknown)" }, event).armSwitchActive).toBeNull();
    });
    it("does not invent decay for short or inactive observations and identifies alternating residual candidates", () => {
        const time = Float64Array.from({ length: 501 }, (_, i) => i * 1000);
        const gyro = Float32Array.from(time, (_, i) => 20 * Math.exp(-i / 250) * Math.sin(i * 0.08));
        const value = residualMetrics(time, gyro, 0, time.length);
        expect(value.alternatingPeakCount).toBeGreaterThan(3);
        expect(value.tailToInitialRmsRatio).toBeLessThan(1);
        expect(residualMetrics(time, gyro, 0, 100).tailToInitialRmsRatio).toBeNull();
        expect(
            residualMetrics(
                time,
                Float32Array.from(time, () => 1),
                0,
                time.length,
            ).decayStatus,
        ).toBe("initial_activity_too_small");
    });
});
describe("V0.5 compact evidence and supported explanations", () => {
    it("sends only versioned summary/evidence/policy roots, retains citations and bounds, omits empty step distributions", () => {
        const p = aiEvidence(analyzeLog(stoppedLog(), 0), aiSource),
            v = evidenceView(p);
        expect(p.axes).toBeUndefined();
        expect(p.motion).toBeUndefined();
        expect(p.schemaVersion).toBe("passive-ai-evidence-1.2");
        expect(p.evidence.motorConstraints.length).toBeGreaterThan(0);
        for (const g of p.evidence.actionGroups) if (!g.eligibleCount) expect(g.riseTimeMs).toBeUndefined();
        const e = p.evidence.representatives.find((e) =>
            e.phases.some((p) => p.kind === "post_stop" && p.status === "measured"),
        );
        const phase = e.phases.find((p) => p.kind === "post_stop");
        expect(evidenceIds(p)).toContain(phase.evidenceId);
        expect(evidenceIds(p)).toContain("throttle-coverage");
        expect(metricReferences(p).get(`${phase.evidenceId}.residual.peakAbsDegPerSecond`)).toBeGreaterThan(0);
        expect(v.motion.representatives.every((e) => e.selection.categories.length > 0)).toBe(true);
        expect(conclusionMessages(p)[1].content).toContain('"summary"');
        expect(conclusionMessages(p)[1].content).not.toContain('"axes":');
    });
    it("requires supported explanation categories, limitations, verification and bound finite references", () => {
        const p = aiEvidence(analyzeLog(stoppedLog(), 0), aiSource),
            v = evidenceView(p),
            e = p.evidence.representatives[0];
        const answer = {
            ...aiConclusion(),
            schemaVersion: "passive-ai-conclusion-1.2",
            axes: aiConclusion().axes.map((a) => ({
                ...a,
                status: v.axes.find((b) => b.axis === a.axis).availability,
            })),
            findings: [
                {
                    kind: "possible_explanation",
                    text: "指令接近下限可能影响局部响应，仍需验证。",
                    evidenceIds: [e.evidenceId],
                    metricRefs: [`${e.evidenceId}.tracking.rmsDegPerSecond`],
                    explanationCategory: "lower_command_constraint",
                    limitations: ["不能证明真实推力不足"],
                    verification: "对比同类正常记录的指令边界。",
                },
            ],
        };
        // The fixture motors have ample command room; this explanation must be rejected.
        expect(() => parseConclusion(JSON.stringify(answer), p)).toThrow("AI_CONCLUSION_INVALID");
        answer.findings[0].explanationCategory = "command_phase_association";
        expect(parseConclusion(JSON.stringify(answer), p).findings[0].verification).toBeTruthy();
        const stopPhase = p.evidence.representatives
            .flatMap((e) => e.phases)
            .find((phase) => phase.kind === "post_stop" && phase.status === "measured");
        const directPhase = {
            ...answer,
            findings: [
                {
                    ...answer.findings[0],
                    evidenceIds: [stopPhase.evidenceId],
                    metricRefs: [`${stopPhase.evidenceId}.residual.peakAbsDegPerSecond`],
                },
            ],
        };
        expect(parseConclusion(JSON.stringify(directPhase), p).findings).toHaveLength(1);
        answer.findings[0].metricRefs = ["evidence.representatives[0].tracking.rmsDegPerSecond"];
        expect(parseConclusion(JSON.stringify(answer), p).findings[0].metricRefs).toEqual([
            `${e.evidenceId}.tracking.rmsDegPerSecond`,
        ]);
        answer.findings[0].metricRefs = ["summary.axisAssessments[1].observedTracking.rmsDegPerSecond"];
        expect(() => parseConclusion(JSON.stringify(answer), p)).toThrow("AI_CONCLUSION_INVALID");
        answer.findings[0].metricRefs = [`${e.evidenceId}.tracking.rmsDegPerSecond`];
        delete answer.findings[0].verification;
        expect(() => parseConclusion(JSON.stringify(answer), p)).toThrow("AI_CONCLUSION_INVALID");
        // Keep the legacy 1.1 parser usable with its own evidence version.
        const legacy = { ...v, schemaVersion: "passive-ai-evidence-1.1" };
        const old = {
            ...answer,
            schemaVersion: "passive-ai-conclusion-1.1",
            findings: [{ kind: "limitation", text: "旧版证据", evidenceIds: ["log-quality"], metricRefs: [] }],
        };
        expect(parseConclusion(JSON.stringify(old), legacy).schemaVersion).toBe("passive-ai-conclusion-1.1");
    });
    it("rejects unbound prose numbers, excessive conclusions and actionable control changes", () => {
        const p = aiEvidence(analyzeLog(stoppedLog(), 0), aiSource),
            v = evidenceView(p);
        const answer = {
            ...aiConclusion(),
            schemaVersion: "passive-ai-conclusion-1.2",
            axes: aiConclusion().axes.map((a) => ({
                ...a,
                status: v.axes.find((b) => b.axis === a.axis).availability,
            })),
            findings: [
                {
                    kind: "observed_response",
                    text: "本轴有可测量的跟踪误差。",
                    evidenceIds: ["axis-roll"],
                    metricRefs: ["axis-roll.observedTracking.rmsDegPerSecond"],
                },
            ],
        };
        expect(parseConclusion(JSON.stringify(answer), p).findings).toHaveLength(1);
        answer.nextSteps.push({
            action: "在稳定油门下执行速度足够快的单轴输入。",
            evidenceIds: ["missing-measurements"],
        });
        const filtered = parseConclusion(JSON.stringify(answer), p);
        expect(filtered.nextSteps).toHaveLength(2);
        expect(filtered.omittedNextSteps).toBe(1);
        expect(JSON.stringify(filtered)).not.toContain("执行速度");
        answer.nextSteps.pop();
        answer.findings[0].text = "跟踪误差为999度每秒。";
        expect(() => parseConclusion(JSON.stringify(answer), p)).toThrow("AI_CONCLUSION_INVALID");
        answer.findings[0].text = "本轴有可测量的跟踪误差。";
        answer.nextSteps[0].action = "降低电机输出下限以提高控制精度。";
        expect(() => parseConclusion(JSON.stringify(answer), p)).toThrow("AI_CONCLUSION_INVALID");
        answer.nextSteps[0].action = "补充已有的正常飞行记录。";
        answer.summary = "过长".repeat(100);
        expect(() => parseConclusion(JSON.stringify(answer), p)).toThrow("AI_CONCLUSION_INVALID");
        answer.summary = null;
        expect(() => parseConclusion(JSON.stringify(answer), p)).toThrow("AI_CONCLUSION_INVALID");
    });
    it("attempts one bounded correction using the same evidence and never accepts an invalid second reply", async () => {
        const p = aiEvidence(analyzeLog(stoppedLog(), 0), aiSource),
            v = evidenceView(p);
        const answer = {
            ...aiConclusion(),
            schemaVersion: "passive-ai-conclusion-1.2",
            axes: aiConclusion().axes.map((a) => ({
                ...a,
                status: v.axes.find((b) => b.axis === a.axis).availability,
            })),
            findings: [
                {
                    kind: "observed_response",
                    text: "本轴有可测量的跟踪误差。",
                    evidenceIds: ["axis-roll"],
                    metricRefs: ["axis-roll.observedTracking.rmsDegPerSecond"],
                },
            ],
        };
        const response = (value) => ({
            ok: true,
            json: async () => ({
                model: "fixture-model",
                choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }],
            }),
        });
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(response({ invalid: true }))
            .mockResolvedValueOnce(response(answer));
        vi.stubGlobal("fetch", fetcher);
        try {
            const config = { baseUrl: "https://8stoken.com/v1", apiKey: "test-only", model: "fixture-model" };
            const result = await explainEvidence(config, p);
            expect(result.repairAttempted).toBe(true);
            expect(fetcher).toHaveBeenCalledTimes(2);
            const first = JSON.parse(fetcher.mock.calls[0][1].body),
                second = JSON.parse(fetcher.mock.calls[1][1].body);
            expect(second.messages[1]).toEqual(first.messages[1]);
            expect(second.messages.at(-1).content).toContain("上一份输出未通过本地校验");
            fetcher.mockReset().mockResolvedValue(response({ invalid: true }));
            await expect(explainEvidence(config, p)).rejects.toThrow("AI_CONCLUSION_INVALID");
            expect(fetcher).toHaveBeenCalledTimes(2);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
