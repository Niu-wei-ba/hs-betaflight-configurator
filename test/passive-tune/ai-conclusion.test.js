import { describe, expect, it } from "vitest";
import { aiEvidence, MAX_EVIDENCE_BYTES } from "../../src/js/passive-tune/ai-evidence.js";
import { conclusionMessages, parseConclusion, conclusionReport } from "../../src/js/passive-tune/ai-conclusion.js";
import { aiSource, aiResult, aiConclusion } from "./ai-fixtures.js";

describe("LLM evidence packet", () => {
    it("packages units, log quality, missing metrics and supported tracking extrema", () => {
        const packet = aiEvidence(aiResult(), aiSource);
        expect(packet.logQuality).toMatchObject({
            corruptRegionCount: 1,
            continuousSpanCount: 2,
            continuousSampleCoveragePct: 90,
            timestampJitterMadPct: 0,
        });
        expect(packet.axes[0].tracking).toMatchObject({
            supportedPointCount: 5,
            gainRangeDb: { min: -0.4, max: 1.5 },
            peak: { frequencyHz: 4, gainDb: 1.5 },
        });
        expect(packet.axes[1]).toMatchObject({ availability: "insufficient_evidence", supportedFrequencyBandsHz: [] });
        expect(packet.axes[1].tracking.peak).toBeNull();
        expect(packet.axes[0].gyroSignal.rmsBands[1].rms).toBeNull();
        expect(packet.axes.every((axis) => axis.estimatedControlBandwidthHz === null)).toBe(true);
        expect(packet.source.betaflightVersion).toBe("4.5.2");
        expect(packet.flightConfiguration).toMatchObject({
            pid: { roll: { p: 45, i: 80, d: 45 } },
            pidLoopTimeUs: 250,
            filterSettings: { gyro_lpf1_dyn_hz: [300, 700] },
        });
        const payload = JSON.stringify(packet);
        expect(payload).not.toMatch(
            /private-location|private-secret|private-coordinate|arbitrary untrusted|rawHeaders|gyroPsd/,
        );
        expect(new TextEncoder().encode(payload).length).toBeLessThan(MAX_EVIDENCE_BYTES);
    });
    it("does not pass unparsed header strings as settings or invent missing numeric values", () => {
        const result = aiResult();
        result.configAtFlight.rawHeaders.rollPID = "45,80,45; private-secret";
        result.configAtFlight.rawHeaders.gyro_lpf1_static_hz = "Infinity";
        result.configAtFlight.rawHeaders.pitchPID = "1,2";
        result.timing.jitterPct = NaN;
        const packet = aiEvidence(result, aiSource);
        expect(packet.flightConfiguration.pid.roll).toBeNull();
        expect(packet.flightConfiguration.pid.pitch).toBeNull();
        expect(packet.flightConfiguration.filterSettings.gyro_lpf1_static_hz).toBeNull();
        expect(packet.logQuality.timestampJitterMadPct).toBeNull();
    });
    it("bounds representative spectral points while retaining full-spectrum extrema", () => {
        const result = aiResult();
        result.axes.roll.frequency.usableBandsHz = [[1, 100]];
        const sequence = Array.from({ length: 100 }, (_, i) => i + 1);
        result.axes.roll.charts = {
            frequencies: sequence,
            magnitudeDb: sequence.map((v) => (v === 54 ? 12 : 0)),
            phaseDeg: sequence.map(() => 0),
            coherence: sequence.map(() => 0.9),
            valid: sequence.map(() => 1),
        };
        const tracking = aiEvidence(result, aiSource).axes[0].tracking;
        expect(tracking.supportedPointCount).toBe(100);
        expect(tracking.points.length).toBeLessThanOrEqual(48);
        expect(tracking.peak).toMatchObject({ frequencyHz: 54, gainDb: 12 });
        expect(tracking.points.some((point) => point.frequencyHz === 54)).toBe(true);
    });
    it("suppresses spectral interpretation when timestamps are rejected", () => {
        const result = aiResult();
        result.timing.status = "rejected";
        const packet = aiEvidence(result, aiSource);
        expect(
            packet.axes.every((axis) => axis.availability === "insufficient_evidence" && !axis.tracking.points.length),
        ).toBe(true);
    });
});

describe("structured AI conclusions", () => {
    const packet = () => aiEvidence(aiResult(), aiSource);
    it("requires complete axis conclusions and binds citations to actual evidence", () => {
        const conclusion = aiConclusion();
        expect(parseConclusion(JSON.stringify(conclusion), packet())).toEqual(conclusion);
        expect(parseConclusion(`\`\`\`json\n${JSON.stringify(conclusion)}\n\`\`\``, packet())).toEqual(conclusion);
        const messages = conclusionMessages(packet());
        expect(messages[0].content).toContain("estimatedControlBandwidthHz=null");
        expect(messages[0].content).toContain("不能判定是否跟手");
    });
    it("rejects invented citations, unavailable support, missing axes and write instructions in extra fields", () => {
        for (const mutate of [
            (value) => (value.axes[0].evidenceIds = ["invented-measurement"]),
            (value) => (value.axes[1].status = "limited_evidence"),
            (value) => (value.overallStatus = "good"),
            (value) => (value.axes[1].axis = "roll"),
            (value) => value.axes.pop(),
            (value) => (value.pidDecision = "apply"),
            (value) => (value.cli = "set p_pitch=90"),
        ]) {
            const value = aiConclusion();
            mutate(value);
            expect(() => parseConclusion(JSON.stringify(value), packet())).toThrow("AI_CONCLUSION_INVALID");
        }
        expect(() => parseConclusion("plain text answer", packet())).toThrow("AI_CONCLUSION_INVALID");
    });
    it("exports the exact input and validated answer with no credentials and rejects stale source bindings", () => {
        const evidence = packet();
        const answer = {
            source: evidence.source,
            algorithmVersion: evidence.algorithmVersion,
            evidenceVersion: evidence.schemaVersion,
            conclusion: aiConclusion(),
            model: "model",
            requestedModel: "model",
            generatedAt: "date",
            apiKey: "private-key",
        };
        const report = conclusionReport(evidence, answer);
        expect(report.input).toEqual(evidence);
        expect(report.output.conclusion).toEqual(aiConclusion());
        expect(JSON.stringify(report)).not.toContain("private-key");
        expect(() => conclusionReport(evidence, { ...answer, source: { ...answer.source, logIndex: 1 } })).toThrow(
            "AI_CONCLUSION_STALE",
        );
        expect(() => conclusionReport(evidence, { ...answer, algorithmVersion: "different" })).toThrow(
            "AI_CONCLUSION_STALE",
        );
    });
});
