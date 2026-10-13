// SPDX-License-Identifier: GPL-3.0-or-later
import { AXIS_NAMES, POLICY, distribution } from "./policy.js";
import { trackingMetrics, outputMetrics } from "./tracking-metrics.js";
import { comparisonBlockers } from "./diagnostic-context.js";
import { stopSummary } from "./stop-summary.js";
import { boundaryAssociation } from "./boundary-association.js";

export function aggregateActions(records) {
    const eligible = records.filter((event) => event.inputEligibility === "eligible");
    const independent = [];
    let lastEnd = -1;
    for (const event of [...eligible].sort((a, b) => a.start - b.start)) {
        if (event.start >= lastEnd) {
            independent.push(event);
            lastEnd = event.end;
        }
    }
    const measured = (name) =>
        independent
            .filter((event) => event.metrics?.[name]?.status === "measured")
            .map((event) => event.metrics[name].value);
    const counts = (field) =>
        records.reduce((result, event) => {
            for (const code of event[field] ?? []) result[code] = (result[code] ?? 0) + 1;
            return result;
        }, {});
    const unconfirmed = independent.filter((event) => event.metrics.settlingTime.status === "right_censored").length;
    const comparable = records.filter(e => e.diagnostics?.diagnosticEligibility?.trackingComparison.status === "qualified");
    return {
        candidateCount: records.length,
        eligibleCount: eligible.length,
        independentCount: independent.length,
        rejectedCount: records.length - eligible.length,
        candidateConfoundedCount: records.filter((event) => event.contextStatus !== "isolated").length,
        eligibleConfoundedCount: eligible.filter((event) => event.contextStatus !== "isolated").length,
        trackingEligibleCount: records.filter((event) => event.diagnostics?.eligibility.tracking).length,
        trackingQualifiedCount: records.filter(
            (e) => e.diagnostics?.diagnosticEligibility?.trackingComparison.status === "qualified",
        ).length,
        mixedManeuverCount: records.filter((event) => event.diagnostics?.eventType === "mixed_maneuver").length,
        lowerMarkedConfoundTrackingCount: comparable.filter(e => !comparisonBlockers(e).length).length,
        stopResponses: stopSummary(records),
        parameterAttribution: {
            status: "not_supported",
            blockerCounts: records.reduce((summary, event) => {
                for (const code of event.diagnostics?.parameterAttribution?.blockerCodes ?? []) summary[code] = (summary[code] ?? 0) + 1;
                return summary;
            }, {}),
            parameterDecision: "not_determined",
        },
        unconfirmedCount: unconfirmed,
        unconfirmedFraction: independent.length ? unconfirmed / independent.length : null,
        notReachedCount: independent.filter((event) => !event.metrics.targetReached).length,
        distributionAvailable: independent.length >= POLICY.minimumEvents,
        riseTimeMs: distribution(measured("riseTime")),
        overshootPct: distribution(measured("overshoot")),
        // Censored observations are never silently dropped from a reported overall percentile.
        settlingTimeMs: unconfirmed
            ? { count: independent.length, median: null, p90: null, status: "censored_distribution" }
            : { ...distribution(measured("settlingTime")), status: independent.length ? "measured" : "unavailable" },
        reasonCounts: counts("reasonCodes"),
        confoundCounts: counts("confounds"),
    };
}
export function aggregateLog(log, spans, throttle, actions) {
    const time = log.channels.time;
    const axes = Object.fromEntries(
        AXIS_NAMES.map((axis, index) => [
            axis,
            {
                tracking: log.scaleKnown
                    ? trackingMetrics(
                        time,
                        log.channels[`setpoint[${index}]`],
                        log.channels[`gyroADC[${index}]`],
                        spans,
                    )
                    : null,
                actions: aggregateActions(actions.records.filter((event) => event.axis === axis)),
            },
        ]),
    );
    const groups = new Map();
    for (const window of throttle.windows.filter((window) => !["unknown", "invalid"].includes(window.group))) {
        const key = `${window.group}-${window.configEpoch}-${window.stateFieldsPresent ? "state-recorded" : "state-unknown"}`;
        if (!groups.has(key))
            groups.set(key, {
                key,
                throttleGroup: window.group,
                configEpoch: window.configEpoch,
                stateFieldsPresent: window.stateFieldsPresent,
                windows: [],
            });
        groups.get(key).windows.push(window);
    }
    const trackingGroups = [...groups.values()].flatMap((group) =>
        AXIS_NAMES.map((axis, index) => ({
            evidenceId: `group-${axis}-${group.key}`,
            axis,
            throttleGroup: group.throttleGroup,
            configEpoch: group.configEpoch,
            stateFieldsPresent: group.stateFieldsPresent,
            tracking: log.scaleKnown
                ? trackingMetrics(
                    time,
                    log.channels[`setpoint[${index}]`],
                    log.channels[`gyroADC[${index}]`],
                    group.windows,
                )
                : null,
            continuousWindowCount: group.windows.length,
            outputEvidenceId: `motors-${group.key}`,
            output: outputMetrics(log, group.windows),
            boundaryAssociation: boundaryAssociation(log, index, group.windows),
            stableSubsetSeconds: throttle.stableWindows
                .filter(
                    (w) =>
                        w.group === group.throttleGroup &&
                        w.configEpoch === group.configEpoch &&
                        w.stateFieldsPresent === group.stateFieldsPresent,
                )
                .reduce((s, w) => s + (time[w.end - 1] - time[w.start]) / 1e6, 0),
        })),
    );
    const actionMap = new Map();
    for (const event of actions.records) {
        const key = `${event.axis}-${event.throttle.group}-${event.configEpoch}-${event.direction}-${event.contextStatus}`;
        if (!actionMap.has(key)) actionMap.set(key, []);
        actionMap.get(key).push(event);
    }
    const actionGroups = [...actionMap.entries()].map(([key, records]) => ({
        evidenceId: `actions-${key}`,
        axis: records[0].axis,
        throttleGroup: records[0].throttle.group,
        configEpoch: records[0].configEpoch,
        direction: records[0].direction,
        contextStatus: records[0].contextStatus,
        amplitudeRangeDegPerSecond: [
            Math.min(...records.map((event) => Math.abs(event.delta))),
            Math.max(...records.map((event) => Math.abs(event.delta))),
        ],
        ...aggregateActions(records),
    }));
    return {
        axes,
        trackingGroups,
        actionGroups,
        estimationGroups: [...groups.values()]
            .map((group) => ({
                ...group,
                windows: throttle.stableWindows.filter(
                    (w) =>
                        w.group === group.throttleGroup &&
                        w.configEpoch === group.configEpoch &&
                        w.stateFieldsPresent === group.stateFieldsPresent,
                ),
            }))
            .filter((group) => group.windows.length),
    };
}
