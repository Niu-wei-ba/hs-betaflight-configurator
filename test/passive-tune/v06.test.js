import { describe, it, expect } from "vitest";
import { actionPhases } from "../../src/js/passive-tune/phases.js";
import { boundaryAssociation } from "../../src/js/passive-tune/boundary-association.js";
import { outputMetrics } from "../../src/js/passive-tune/tracking-metrics.js";
import { armingEvidence } from "../../src/js/passive-tune/flight-context.js";
import { stopSummary } from "../../src/js/passive-tune/stop-summary.js";
import { aiEvidence, MAX_EVIDENCE_BYTES } from "../../src/js/passive-tune/ai-evidence.js";
import { analyzeLog } from "../../src/js/passive-tune/analysis.js";
import { makeLog } from "./fixtures.js";
import { aiSource } from "./ai-fixtures.js";

function phaseLog(command, gyro = command) {
    return {
        scaleKnown: true,
        throttle: Float32Array.from({ length: 200 }, () => 30),
        motorBounds: { low: 100, high: 200, tolerance: 2 },
        channels: {
            time: Float64Array.from({ length: 200 }, (_, i) => i * 10000),
            ...Object.fromEntries(
                [0, 1, 2].flatMap((axis) => [
                    [`setpoint[${axis}]`, Float32Array.from({ length: 200 }, (_, i) => (axis ? 0 : command(i)))],
                    [`gyroADC[${axis}]`, Float32Array.from({ length: 200 }, (_, i) => (axis ? 0 : gyro(i)))],
                ]),
            ),
            "motor[0]": Float32Array.from({ length: 200 }, () => 150),
        },
    };
}
const event = {
    eventId: "event-roll-test",
    start: 10,
    preStart: 0,
    transitionEnd: 20,
    end: 100,
    nextInputStart: 180,
    analysisSpanEnd: 200,
    x0: -50,
    delta: 50,
    diagnostics: { contextLimitations: [] },
};
describe("V0.6 contextual evidence", () => {
    it("traces continued return input without treating it as missing data or observing before the platform", () => {
        const log = phaseLog((i) => (i < 10 ? -50 : i < 20 ? -40 : i < 40 ? (i - 40) * 2 : 0));
        const p = actionPhases(log, 0, event).phases,
            after = p.find((p) => p.kind === "post_stop"),
            stop = p.find((p) => p.kind === "command_stop");
        expect(after.stopTiming.continuedInputMs).toBeGreaterThan(100);
        expect(after.start).toBeGreaterThan(event.transitionEnd);
        expect(stop.end - 1).toBe(after.start);
        expect(stop.timeRangeSeconds[1]).toBe(after.timeRangeSeconds[0]);
        expect(stop.metricsEvidenceId).toBeUndefined();
        expect(after.command.absolutePeak).toBeLessThanOrEqual(3);
    });
    it("keeps nonzero target angular rate distinct from tracking-error residual", () => {
        const log = phaseLog((i) => (i < 10 ? -50 : 10));
        const after = actionPhases(log, 0, event).phases.find((p) => p.kind === "post_stop");
        expect(after.command.rms).toBe(10);
        expect(after.residual.rmsDegPerSecond).toBe(10);
        expect(after.trackingErrorResidual.rmsDegPerSecond).toBe(0);
        expect(after.trackingErrorResidual.tailToInitialRmsRatio).toBeNull();
        expect(after.trackingErrorResidual.decayStatus).toBe("initial_activity_too_small");
    });
    it("uses common valid duration for joint boundaries, including unequal intervals and unknown ratios", () => {
        const log = {
            scaleKnown: true,
            motorBounds: { low: 100, high: 200, tolerance: 2 },
            channels: {
                time: Float64Array.from([0, 1000000, 3000000, 7000000]),
                "setpoint[0]": Float32Array.from([0, 0, 0, 0]),
                "gyroADC[0]": Float32Array.from([0, 40, 40, 0]),
                "motor[0]": Float32Array.from([100, 150, 150, 100]),
            },
        };
        const a = boundaryAssociation(log, 0, [{ start: 0, end: 4 }]);
        expect(a.durationSeconds).toBe(7);
        expect(a.highErrorSeconds).toBe(6);
        expect(a.nearBoundSeconds).toBe(1);
        expect(a.jointSeconds).toBe(0);
        expect(a.boundFractionGivenHighError).toBe(0);
        expect(a.errorRmsAwayFromBoundsDegPerSecond).toBe(40);
        log.channels["motor[0]"][1] = NaN;
        expect(boundaryAssociation(log, 0, [{ start: 0, end: 4 }]).invalidSeconds).toBe(2);
        expect(boundaryAssociation({ ...log, motorBounds: null }, 0, [{ start: 0, end: 4 }]).status).toBe(
            "unavailable",
        );
    });
    it("weights room quantiles by time and ends union runs at invalid outputs or span boundaries", () => {
        const log = {
            motorBounds: { low: 100, high: 200, tolerance: 2 },
            channels: {
                time: Float64Array.from([0, 1000, 100000, 101000, 102000, 152000]),
                "motor[0]": Float32Array.from([100, 150, 100, NaN, 100, 100]),
            },
        };
        const o = outputMetrics(log, [
            { start: 0, end: 4 },
            { start: 4, end: 6 },
        ]);
        expect(o.lowerRunDuration.count).toBe(3);
        expect(o.commandRoom.lower.p50).toBeCloseTo(0.5, 2);
        expect(o.perMotor[0].lowerRunDuration.count).toBe(3);
        expect(o.invalidSeconds).toBe(0);
    });
    it("reports verified disarm event bounds without claiming a preceding armed or airborne interval", () => {
        const log = phaseLog(() => 0);
        log.firmware = "Betaflight 2026.6.2 (e0b7bb01b)";
        log.events = [{ type: 15, sampleIndex: 200, timeBeforeUs: 1990000, payload: { reason: 4 } }];
        const e = armingEvidence(log);
        expect(e.eventCount).toBe(1);
        expect(e.disarmEvents[0].beforeNextFrameSeconds).toBeNull();
        expect(e.disarmEvents[0].stateAtTransition).toBe("disarmed");
        expect(e.armedIntervals).toBe("unknown");
        expect(e.airborneState).toBe("unknown");
        expect(armingEvidence({ ...log, firmware: "Betaflight 2026.6.2 (other)" }).eventCount).toBe(0);
    });
    it("keeps overlapping stop counts and insufficient distributions explicit", () => {
        const one = (i) => ({
            eventId: `e-${i}`,
            axis: "roll",
            start: i,
            diagnostics: {
                diagnosticEligibility: { stopResidual: { status: "qualified" } },
                context: { armedState: "unknown", airborneState: "unknown" },
            },
            phases: [
                {
                    kind: "post_stop",
                    status: "measured",
                    start: i,
                    end: i + 10,
                    output: { status: "measured", invalidSeconds: 0 },
                    contextLimitations: [],
                    residual: { rmsDegPerSecond: 10 },
                    trackingErrorResidual: { rmsDegPerSecond: 0, decayStatus: "initial_activity_too_small" },
                    command: { rms: 10 },
                },
            ],
        });
        const s = stopSummary([one(0), one(5), one(20)]);
        expect(s.qualifiedCount).toBe(3);
        expect(s.independentCount).toBe(2);
        expect(s.overlappingExcludedCount).toBe(1);
        expect(s.all.trackingErrorRmsDegPerSecond.median).toBeNull();
        expect(s.all.errorDecayStatusCounts.initial_activity_too_small).toBe(2);
    });
    it("protects balanced low-context comparisons and all groups under a tight evidence budget", () => {
        const r = analyzeLog(
            makeLog({
                samples: 3800,
                fs: 1000,
                inputs: [0, 1, 2].map((a) => (n) => (n >= 300 + a * 1100 && n < 800 + a * 1100 ? 100 : 0)),
                slowFrames: new Map([[0, [1, 0, 1, 1]]]),
                extraHeaders: ["H features:0", "H motorOutput:1000,2000"],
                extraChannels: { "setpoint[3]": () => 300, "motor[0]": () => 1500 },
            }),
            0,
        );
        const packet = aiEvidence(r, aiSource);
        expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(MAX_EVIDENCE_BYTES);
        expect(packet.evidence.actionGroups).toHaveLength(r.motion.actionGroups.length);
        expect(
            packet.evidence.representatives.filter((e) =>
                e.selection.categories.includes("typical_qualified_tracking"),
            ),
        ).toHaveLength(3);
        expect(packet.analysisPolicy.attributionSemantics).toContain("never");
    });
});
