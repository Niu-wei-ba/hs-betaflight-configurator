// SPDX-License-Identifier: GPL-3.0-or-later
import { AXIS_NAMES, POLICY, distribution } from "./policy.js";
import { trackingMetrics } from "./tracking-metrics.js";

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
    return {
        candidateCount: records.length,
        eligibleCount: eligible.length,
        independentCount: independent.length,
        rejectedCount: records.length - eligible.length,
        candidateConfoundedCount: records.filter((event) => event.contextStatus !== "isolated").length,
        eligibleConfoundedCount: eligible.filter((event) => event.contextStatus !== "isolated").length,
        trackingEligibleCount: records.filter((event) => event.diagnostics?.eligibility.tracking).length,
        mixedManeuverCount: records.filter((event) => event.diagnostics?.eventType === "mixed_maneuver").length,
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
    for (const window of throttle.windows.filter((window) => window.stable)) {
        const key = `${window.group}-${window.configEpoch}-${window.stateKnown ? "state-recorded" : "state-unknown"}`;
        if (!groups.has(key))
            groups.set(key, {
                key,
                throttleGroup: window.group,
                configEpoch: window.configEpoch,
                stateKnown: window.stateKnown,
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
            stateKnown: group.stateKnown,
            tracking: log.scaleKnown
                ? trackingMetrics(
                    time,
                    log.channels[`setpoint[${index}]`],
                    log.channels[`gyroADC[${index}]`],
                    group.windows,
                )
                : null,
            continuousWindowCount: group.windows.length,
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
    return { axes, trackingGroups, actionGroups, estimationGroups: [...groups.values()] };
}
