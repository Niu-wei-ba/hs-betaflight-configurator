import { describe, expect, it } from "vitest";
import { parseLog } from "../../src/js/passive-tune/parser.js";
import { analyzeLog, exportReport } from "../../src/js/passive-tune/analysis.js";
import { normalizeLog } from "../../src/js/passive-tune/normalization.js";
import { segmentLog } from "../../src/js/passive-tune/segmentation.js";
import { groupThrottle, throttleBin } from "../../src/js/passive-tune/throttle.js";
import { trackingMetrics } from "../../src/js/passive-tune/tracking-metrics.js";
import { observedStep } from "../../src/js/passive-tune/step-metrics.js";
import { detectActions } from "../../src/js/passive-tune/actions.js";
import { aggregateActions } from "../../src/js/passive-tune/aggregate.js";
import { estimateResponse } from "../../src/js/passive-tune/deconvolution.js";
import { eventCurve } from "../../src/js/passive-tune/evidence-registry.js";
import { aiEvidence, MAX_EVIDENCE_BYTES } from "../../src/js/passive-tune/ai-evidence.js";
import { parseConclusion, conclusionMessages } from "../../src/js/passive-tune/ai-conclusion.js";
import { evidenceIds, metricReferences } from "../../src/js/passive-tune/ai-motion-evidence.js";
import { makeLog, seededSignal } from "./fixtures.js";
import { aiConclusion, aiSource } from "./ai-fixtures.js";

function stepLog({ sign = 1, gain = 1, gaps = new Map(), states = true } = {}) {
    const zero = () => 0,
        input = (n) => (n < 200 ? 0 : sign * 100);
    const output = (n) => (n < 200 ? 0 : sign * 100 * gain * (1 - Math.exp(-(n - 200) / 20)));
    return makeLog({
        revision: "Betaflight 4.5.2 (fixture)",
        samples: 1000,
        fs: 1000,
        highResolution: 1,
        inputs: [input, zero, zero],
        outputs: [output, zero, zero],
        gaps,
        extraChannels: { "setpoint[3]": () => 500, "motor[0]": () => 1500 },
        extraHeaders: ["H features:0", "H motorOutput:1000,2000"],
        slowFrames: states ? new Map([[0, [1, 0, 1, 1]]]) : new Map(),
    });
}
describe("versioned context and BBL state", () => {
    it("preserves slow fields and signed adjustment payload, and splits config epochs", () => {
        const bytes = makeLog({
            samples: 120,
            events: new Map([[64, [69, 13, 5, 39]]]),
            slowFrames: new Map([
                [0, [1, 0, 1, 1]],
                [80, [2, 0, 1, 1]],
            ]),
        });
        const log = parseLog(bytes, 0);
        expect(log.events[0]).toMatchObject({ type: 13, sampleIndex: 64, payload: { function: 5, value: -20 } });
        expect(log.states[1]).toMatchObject({ sampleIndex: 80, fields: { flightModeFlags: 2 } });
        const { usableSpans } = segmentLog(normalizeLog(log));
        expect(usableSpans.map((span) => [span.start, span.configEpoch])).toEqual([
            [0, 0],
            [64, 1],
            [80, 1],
        ]);
        expect(usableSpans[1].stateKnown).toBe(false);
        expect(usableSpans[2].stateKnown).toBe(true);
    });
    it("does not scale mixer throttle by high-resolution angular scaling or infer its range", () => {
        const parsed = parseLog(stepLog(), 0),
            log = normalizeLog(parsed);
        expect(log.channels["setpoint[0]"][400]).toBe(100);
        expect(log.throttle[400]).toBe(50);
        expect(log.motorBounds).toMatchObject({ low: 1000, high: 2000 });
        expect(normalizeLog({ ...parsed, headers: { ...parsed.headers, features: "4096" } }).throttle).toBeNull();
        expect(normalizeLog({ ...parsed, headers: { ...parsed.headers, features: undefined } }).throttle).toBeNull();
        expect(normalizeLog({ ...parsed, firmware: "custom" }).motorBounds).toBeNull();
    });
    it("uses typed signal storage and keeps time precision", () => {
        const parsed = parseLog(stepLog(), 0);
        expect(parsed.channels.time).toBeInstanceOf(Float64Array);
        expect(parsed.channels["setpoint[0]"]).toBeInstanceOf(Float32Array);
    });
});
describe("time-weighted coverage and errors", () => {
    it("integrates error over actual dt and preserves delay", () => {
        const value = trackingMetrics([0, 1000, 4000], [0, 0, 0], [0, 2, 2], [{ start: 0, end: 3 }]);
        expect(value.rmsDegPerSecond).toBeCloseTo(Math.sqrt(3.5));
        expect(value.maeDegPerSecond).toBeCloseTo(1.75);
        expect(value.delayAligned).toBe(false);
        expect(value.p95ResolutionDegPerSecond).toBeCloseTo(2 / 2048);
    });
    it("conserves covered duration without counting gaps or invalid throttle as normal", () => {
        const log = {
            channels: { time: [0, 1000, 2000, 50000, 51000] },
            throttle: [19, 20, 100, NaN, 120],
            capabilities: {},
        };
        const grouped = groupThrottle(log, [
            { start: 0, end: 3 },
            { start: 3, end: 5 },
        ]);
        expect(grouped.totalSeconds).toBeCloseTo(0.003);
        expect(grouped.coverageSeconds["0-20"]).toBeCloseTo(0.001);
        expect(grouped.coverageSeconds["20-40"]).toBeCloseTo(0.001);
        expect(grouped.coverageSeconds.unknown).toBeCloseTo(0.001);
        expect(throttleBin(100)).toBe("80-100");
        expect(throttleBin(120)).toBe("invalid");
    });
});
describe("observed actions and independent analytical responses", () => {
    it.each([1, -1])("recovers the analytical first-order 10–90 rise for sign %s", (sign) => {
        const log = normalizeLog(parseLog(stepLog({ sign }), 0));
        const { records } = detectActions(log, segmentLog(log).usableSpans);
        const event = records.find((item) => item.axis === "roll");
        expect(event.inputEligibility).toBe("eligible");
        expect(event.metrics.riseTime.value).toBeCloseTo(20 * Math.log(9), 0);
        expect(event.metrics.overshoot.value).toBeLessThan(0.2);
        expect(event.metrics.settlingTime.value).toBeCloseTo(-20 * Math.log(0.05), 0);
        expect(eventCurve(log, event).points.some((point) => Math.abs(point.input) === 100)).toBe(true);
    });
    it("keeps eligible undertracking and overshooting actions instead of selecting nice outputs", () => {
        for (const gain of [0.7, 1.3]) {
            const log = normalizeLog(parseLog(stepLog({ gain }), 0));
            const { records } = detectActions(log, segmentLog(log).usableSpans);
            const event = records.find((item) => item.axis === "roll");
            expect(event.inputEligibility).toBe("eligible");
            expect(event.metrics.settlingTime.status).toBe("right_censored");
            if (gain < 1) {
                expect(event.metrics.riseTime.value).toBeNull();
                expect(event.metrics.targetReached).toBe(false);
            } else expect(event.metrics.overshoot.value).toBeCloseTo(30, 0);
            expect(aggregateActions(records).settlingTimeMs.p90).toBeNull();
        }
    });
    it("never crosses a time gap to obtain a pre/post platform", () => {
        const log = normalizeLog(parseLog(stepLog({ gaps: new Map([[250, 10000]]) }), 0));
        const { records } = detectActions(log, segmentLog(log).usableSpans);
        expect(records.every((event) => event.inputEligibility !== "eligible")).toBe(true);
        expect(records.some((event) => event.reasonCodes.includes("POST_PLATFORM_INSUFFICIENT"))).toBe(true);
    });
    it("preserves initial offset rather than converting actual undertracking into unity", () => {
        const time = Float64Array.from({ length: 501 }, (_, i) => i * 1000);
        const output = Float64Array.from(time, (t) => 20 + 80 * (1 - Math.exp(-t / 20000)));
        const metrics = observedStep(time, output, {
            start: 0,
            end: 501,
            x0: 0,
            x1: 100,
            delta: 100,
            y0: 20,
            periodUs: 1000,
        });
        expect(metrics.initialErrorFraction).toBe(0.2);
        expect(metrics.riseTime.value).toBeNull();
        expect(metrics.riseTime.status).toBe("limited");
    });
    it("does not label an already-crossed first sample as failure to reach the target", () => {
        const time = Float64Array.from({ length: 501 }, (_, i) => i * 1000);
        const m = observedStep(time, Float64Array.from(time, () => 100), { start: 0, end: 501, x0: 0, x1: 100, delta: 100, y0: 0, periodUs: 1000 });
        expect(m.targetReached).toBe(true);
        expect(m.riseTime).toMatchObject({ value: null, status: "limited", reasonCode: "THRESHOLD_CROSSING_UNOBSERVED" });
    });
});
describe("regularized estimate is a separate evidence path", () => {
    it("marks too few oscillation peaks as unavailable and measures a sufficiently observed candidate", () => {
        const time = Float64Array.from({ length: 501 }, (_, i) => i * 1000);
        const event = { start: 0, end: 501, transitionEnd: 0, x0: 0, x1: 100, delta: 100, y0: 0, periodUs: 1000 };
        const ringing = observedStep(time, Float64Array.from(time, (t) => 100 + 20 * Math.sin(2 * Math.PI * t / 100000)), event).ringing;
        expect(ringing.frequency.status).toBe("limited");
        expect(ringing.frequency.value).toBeCloseTo(10, 1);
        expect(observedStep(time, Float64Array.from(time, () => 100), event).ringing.frequency.value).toBeNull();
    });
    it("rejects constant input despite a large numeric setpoint", () => {
        const input = Float32Array.from({ length: 8192 }, () => 500);
        expect(estimateResponse(input, input, 1024, [{ start: 0, end: input.length }]).curve).toBeNull();
    });
    it("matches identity shape with correct inverse FFT scale, retains raw gain and marks limitations", () => {
        const input = seededSignal(16384),
            output = Float64Array.from(input, (v) => 0.7 * v);
        const value = estimateResponse(input, output, 1024, [{ start: 0, end: input.length }]);
        expect(value.status).toBe("limited");
        expect(value.curve.mean[0]).toBeGreaterThan(0.6);
        expect(value.curve.mean[0]).toBeLessThan(0.75);
        expect(value.tailNormalized).toBe(false);
        expect(value.fullDcGainEstablished).toBe(false);
        expect(value.acceptedWindows).toBeGreaterThanOrEqual(6);
    });
});
describe("source-bound derived evidence and AI 1.1", () => {
    it("registers actual coverage-root values and supported passive frequency estimates", () => {
        const signal = seededSignal(8192);
        const result = analyzeLog(makeLog({ input: (n) => signal[n], output: (n) => signal[n] }), 0);
        const packet = aiEvidence(result, aiSource);
        const metrics = metricReferences(packet);
        expect(metrics.get("motion-coverage.candidateCount")).toBe(packet.motion.candidateCount);
        expect(packet.axes[0].supportedFrequencyBandsHz.length).toBeGreaterThan(0);
        const answer = { ...aiConclusion(), schemaVersion: "passive-ai-conclusion-1.1",
            axes: aiConclusion().axes.map((axis) => ({ ...axis, status: "limited_evidence" })),
            findings: [{ kind: "estimated_response", text: "有支持频段的有限频响估计。", evidenceIds: ["axis-roll"], metricRefs: ["axis-roll.tracking.peak.gainDb"] },
                { kind: "limitation", text: "覆盖汇总。", evidenceIds: ["motion-coverage"], metricRefs: ["motion-coverage.candidateCount"] }] };
        expect(parseConclusion(JSON.stringify(answer), packet).findings).toHaveLength(2);
        answer.findings[1].metricRefs = ["motion-coverage.output.unknownBound"];
        expect(() => parseConclusion(JSON.stringify(answer), packet)).toThrow("AI_CONCLUSION_INVALID");
    });
    it("bounds group detail without losing global coverage, rejection or censoring counts", () => {
        const result = analyzeLog(stepLog({ gain: 0.7 }), 0);
        result.motion.actionGroups = Array.from({ length: 200 }, (_, i) => ({ ...result.motion.actionGroups[0], evidenceId: `actions-roll-extra-${i}` }));
        const packet = aiEvidence(result, aiSource);
        expect(packet.motion.selection.omittedActionGroups).toBeGreaterThanOrEqual(185);
        expect(packet.axes[0].observedActions.unconfirmedCount).toBe(1);
        expect(packet.axes[0].observedActions.settlingTimeMs.p90).toBeNull();
        expect(packet.motion.throttle.totalSeconds).toBeGreaterThan(0);
        expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThan(MAX_EVIDENCE_BYTES);
    });
    it("exports summaries without Worker channels and dynamically exposes real step metrics", () => {
        const result = analyzeLog(stepLog(), 0),
            packet = aiEvidence(result, aiSource);
        expect(packet.schemaVersion).toBe("passive-ai-evidence-1.1");
        expect(packet.axes[0].observedActions.eligibleCount).toBe(1);
        expect(packet.missingMeasurements.items).not.toContain("qualified_observed_step_response");
        expect(packet.motion.axesMissingStep).toEqual(["pitch", "yaw"]);
        expect(new TextEncoder().encode(JSON.stringify(packet)).length).toBeLessThan(MAX_EVIDENCE_BYTES);
        expect(JSON.stringify(packet)).not.toMatch(/localLog|channels|points.*timeMs|private-location/);
        expect(Object.keys(result)).not.toContain("localLog");
        expect(JSON.stringify(exportReport(result, aiSource))).not.toContain("localLog");
        const conclusion = {
            ...aiConclusion(),
            schemaVersion: "passive-ai-conclusion-1.1",
            axes: aiConclusion().axes.map((axis) => ({ ...axis, status: "limited_evidence" })),
            findings: [
                {
                    kind: "observed_response",
                    text: "本次横滚记录有可观察的响应。",
                    evidenceIds: ["axis-roll"],
                    metricRefs: ["axis-roll.observedTracking.rmsDegPerSecond"],
                },
            ],
        };
        expect(parseConclusion(JSON.stringify(conclusion), packet).findings).toHaveLength(1);
        expect(conclusionMessages(packet)[0].content).toContain("right_censored");
        expect(evidenceIds(packet)).toContain(packet.motion.representatives[0].evidenceId);
        conclusion.findings[0].metricRefs = ["axis-roll.inventedLatency"];
        expect(() => parseConclusion(JSON.stringify(conclusion), packet)).toThrow("AI_CONCLUSION_INVALID");
        conclusion.findings[0] = { kind: "estimated_response", text: "这是估计响应。", evidenceIds: ["axis-roll"], metricRefs: [] };
        expect(() => parseConclusion(JSON.stringify(conclusion), packet)).toThrow("AI_CONCLUSION_INVALID");
    });
});
