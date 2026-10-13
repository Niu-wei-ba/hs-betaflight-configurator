// SPDX-License-Identifier: GPL-3.0-or-later
import { distribution, POLICY } from "./policy.js";
import { comparisonBlockers } from "./diagnostic-context.js";
export function stopSummary(records) {
    const candidates = records.filter((e) => e.diagnostics?.diagnosticEligibility?.stopResidual.status === "qualified");
    const independent = [],
        lastEnd = new Map();
    for (const event of [...candidates].sort((a, b) => a.start - b.start || a.eventId.localeCompare(b.eventId))) {
        const phase = event.phases.find((p) => p.kind === "post_stop" && p.status === "measured");
        if (!phase || phase.start < (lastEnd.get(event.axis) ?? -1)) continue;
        independent.push({ event, phase });
        lastEnd.set(event.axis, phase.end);
    }
    const lowContext = independent.filter(({ event, phase }) => !comparisonBlockers(event, phase).length);
    const summarize = (values) => {
        const metric = (getter) => {
            const measured = values.map(getter).filter(Number.isFinite),
                available = measured.length >= POLICY.minimumEvents;
            return {
                count: measured.length,
                median: available ? distribution(measured).median : null,
                p90: available ? distribution(measured).p90 : null,
                status: available ? "measured" : "insufficient_events",
            };
        };
        const reasons = {};
        for (const { phase } of values) {
            const reason = phase.trackingErrorResidual?.decayStatus ?? "unavailable";
            reasons[reason] = (reasons[reason] ?? 0) + 1;
        }
        return {
            count: values.length,
            gyroRmsDegPerSecond: metric((v) => v.phase.residual?.rmsDegPerSecond),
            trackingErrorRmsDegPerSecond: metric((v) => v.phase.trackingErrorResidual?.rmsDegPerSecond),
            commandRmsDegPerSecond: metric((v) => v.phase.command?.rms),
            gyroTailToInitialRmsRatio: metric((v) => v.phase.residual?.tailToInitialRmsRatio),
            errorTailToInitialRmsRatio: metric((v) => v.phase.trackingErrorResidual?.tailToInitialRmsRatio),
            errorDecayStatusCounts: reasons,
            truncatedCount: values.filter((v) => v.phase.observationTruncated).length,
        };
    };
    return {
        qualifiedCount: candidates.length,
        independentCount: independent.length,
        overlappingExcludedCount: candidates.length - independent.length,
        lowerMarkedConfoundCount: lowContext.length,
        unknownFlightStateCount: independent.filter(
            (v) =>
                v.event.diagnostics.context.armedState === "unknown" ||
                v.event.diagnostics.context.airborneState === "unknown",
        ).length,
        all: summarize(independent),
        lowerMarkedConfounds: summarize(lowContext),
        meaning: "per_axis_nonoverlapping_windows_low_marked_confounds_not_verified_flight_or_pid_damping",
    };
}
