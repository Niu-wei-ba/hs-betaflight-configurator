// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { analyzeLog, exportReport } from "../../src/js/passive-tune/analysis.js";
import { aiEvidence, MAX_EVIDENCE_BYTES } from "../../src/js/passive-tune/ai-evidence.js";
import { evidenceIds } from "../../src/js/passive-tune/ai-motion-evidence.js";
const [input, directory, index = "0"] = process.argv.slice(2);
if (!input || !directory || !/^\d+$/.test(index)) {
    console.error("Usage: node scripts/passive-ai/analyze-sample.mjs <log.bbl> <output-directory> [log-index]");
    process.exit(1);
}
const bytes = new Uint8Array(fs.readFileSync(input));
const source = { sha256: crypto.createHash("sha256").update(bytes).digest("hex"), logIndex: Number(index) };
const start = performance.now();
const result = analyzeLog(bytes, source.logIndex);
const coverage = result.throttle.coverage;
const near = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} vs ${expected}`);
near(
    Object.values(coverage.classificationSeconds).reduce((a, b) => a + b, 0),
    result.throttle.totalSeconds,
    "exclusive interval ledger",
);
const groupDurations = Object.fromEntries(
    Object.entries(result.axes).map(([axis, value]) => {
        const duration = result.motion.trackingGroups
            .filter((g) => g.axis === axis)
            .reduce((sum, g) => sum + (g.tracking?.durationSeconds ?? 0), 0);
        if (value.tracking) near(duration, coverage.includedSeconds, `${axis} complete throttle groups`);
        return [axis, duration];
    }),
);
const packet = aiEvidence(result, source);
const packetBytes = Buffer.byteLength(JSON.stringify(packet));
assert.ok(packetBytes <= MAX_EVIDENCE_BYTES);
assert.equal(packet.schemaVersion, "passive-ai-evidence-1.2");
const ids = new Set(evidenceIds(packet));
for (const event of packet.evidence.representatives)
    for (const phase of event.phases) if (phase.status === "measured") assert.ok(ids.has(phase.evidenceId));
let regression = null;
if (source.sha256 === "95dcf89550ccf087a60be0b826aa042f9bebafef948187bbbd4990e8a3ff872e") {
    assert.equal(result.sampleCount, 500134);
    assert.equal(result.motion.candidateCount, 391);
    assert.ok(Object.values(result.axes).every((a) => a.actions.eligibleCount === 0));
    near(coverage.includedSeconds, 250.125712, "sample coverage");
    const roll = result.motion.records.find((e) => e.eventId === "event-roll-240635-240892");
    const pitch = result.motion.records.find((e) => e.eventId === "event-pitch-230961-231035");
    assert.equal(roll.diagnostics.output.nearLowerFraction, 1);
    assert.equal(pitch.diagnostics.measurementStatus, "measured");
    assert.equal(pitch.diagnostics.diagnosticEligibility.trackingComparison.status, "insufficient");
    assert.ok(packet.evidence.representatives.some((e) => e.evidenceId === roll.eventId));
    regression = {
        criticalRollLowerFraction: roll.diagnostics.output.nearLowerFraction,
        criticalRollPerMotor: roll.diagnostics.output.perMotor,
        shortPitchDurationSeconds: pitch.diagnostics.tracking.durationSeconds,
        shortPitchQualification: pitch.diagnostics.diagnosticEligibility.trackingComparison,
    };
}
const audit = {
    algorithmVersion: result.algorithmVersion,
    source,
    elapsedMs: Math.round(performance.now() - start),
    sampleCount: result.sampleCount,
    durationSeconds: result.durationSeconds,
    coverage,
    groupDurations,
    packetBytes,
    selection: packet.summary.motion.selection,
    actions: Object.fromEntries(Object.entries(result.axes).map(([axis, value]) => [axis, value.actions])),
    qualifiedStops: result.motion.records.filter(
        (e) => e.diagnostics.diagnosticEligibility.stopResidual.status === "qualified",
    ).length,
    regression,
};
fs.mkdirSync(directory, { recursive: true });
for (const [name, value] of [
    ["local-report-v05.json", exportReport(result, source)],
    ["ai-evidence-v12.json", packet],
    ["sample-audit-v05.json", audit],
])
    fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + "\n");
console.log(
    JSON.stringify(
        {
            algorithmVersion: audit.algorithmVersion,
            sampleCount: audit.sampleCount,
            includedSeconds: coverage.includedSeconds,
            groupDurations,
            packetBytes,
            representatives: packet.evidence.representatives.length,
            selection: audit.selection,
            regression: regression ? "passed" : "not_this_regression_source",
        },
        null,
        2,
    ),
);
