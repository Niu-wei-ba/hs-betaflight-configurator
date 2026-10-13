// SPDX-License-Identifier: GPL-3.0-or-later
/** Explicit derived-data allowlist. No channels, event payloads or arbitrary header text. */
const n = (value) => (Number.isFinite(value) ? Math.round(value * 1e5) / 1e5 : null);
const stats = (value) =>
    value
        ? {
            count: n(value.count),
            median: n(value.median),
            p25: n(value.p25),
            p75: n(value.p75),
            p90: n(value.p90),
            ...(value.status ? { status: value.status } : {}),
        }
        : null;
const counts = (value = {}) =>
    Object.fromEntries(
        Object.entries(value)
            .filter(([key, count]) => /^[A-Z_]{1,64}$/.test(key) && Number.isFinite(count))
            .map(([key, count]) => [key, n(count)]),
    );
export function actionSummary(value) {
    if (!value) return null;
    return {
        candidateCount: n(value.candidateCount),
        eligibleCount: n(value.eligibleCount),
        independentCount: n(value.independentCount),
        rejectedCount: n(value.rejectedCount),
        confoundedCount: n(value.confoundedCount),
        unconfirmedCount: n(value.unconfirmedCount),
        unconfirmedFraction: n(value.unconfirmedFraction),
        notReachedCount: n(value.notReachedCount),
        distributionAvailable: value.distributionAvailable === true,
        riseTimeMs: stats(value.riseTimeMs),
        overshootPct: stats(value.overshootPct),
        settlingTimeMs: stats(value.settlingTimeMs),
        reasonCounts: counts(value.reasonCounts),
        confoundCounts: counts(value.confoundCounts),
    };
}
export function trackingSummary(value) {
    if (!value) return null;
    return {
        rmsDegPerSecond: n(value.rmsDegPerSecond),
        maeDegPerSecond: n(value.maeDegPerSecond),
        absoluteErrorP95DegPerSecond: n(value.absoluteErrorP95DegPerSecond),
        p95ResolutionDegPerSecond: n(value.p95ResolutionDegPerSecond),
        p95Method: "time_weighted_histogram_2048_bins",
        durationSeconds: n(value.durationSeconds),
        delayAligned: false,
    };
}
function eventSummary(event) {
    const m = event.metrics;
    const measurement = (value) =>
        value
            ? {
                value: n(value.value),
                unit: value.unit,
                status: value.status,
                reasonCode: value.reasonCode,
                ...(value.observedThroughMs === undefined ? {} : { observedThroughMs: n(value.observedThroughMs) }),
            }
            : null;
    return {
        evidenceId: event.eventId,
        axis: event.axis,
        type: event.type,
        inputEligibility: event.inputEligibility,
        contextStatus: event.contextStatus,
        direction: event.direction,
        configEpoch: event.configEpoch,
        timeRangeSeconds: [n(event.timeStartSeconds), n(event.timeEndSeconds)],
        amplitudeDegPerSecond: n(Math.abs(event.delta)),
        transitionMs: n(event.transitionMs),
        throttleGroup: event.throttle.group,
        reasonCodes: Object.keys(counts(Object.fromEntries(event.reasonCodes.map((code) => [code, 1])))),
        confounds: Object.keys(counts(Object.fromEntries(event.confounds.map((code) => [code, 1])))),
        metrics: m
            ? {
                targetReached: m.targetReached,
                riseTime: measurement(m.riseTime),
                overshoot: measurement(m.overshoot),
                settlingTime: measurement(m.settlingTime),
                tailError: measurement(m.tailError),
                stopResidual: measurement(m.stopResidual),
                ringingPeakCount: n(m.ringing?.alternatingPeakCount),
            }
            : null,
    };
}
export function motionEvidence(result) {
    const records = result.motion.records;
    const selected = new Map();
    for (const axis of ["roll", "pitch", "yaw"]) {
        const values = records.filter((event) => event.axis === axis);
        const eligible = values.filter((event) => event.metrics);
        const choices = [
            eligible[Math.floor(eligible.length / 2)],
            eligible.reduce((a, b) => (!a || b.metrics.overshoot.value > a.metrics.overshoot.value ? b : a), null),
            eligible.find((event) => event.metrics.settlingTime.status === "right_censored"),
            values.find((event) => !event.metrics),
        ];
        for (const event of choices) if (event) selected.set(event.eventId, eventSummary(event));
    }
    return {
        estimationCoverage: result.estimationCoverage,
        evidenceId: "motion-coverage",
        policyVersion: result.policy.version,
        calibration: result.policy.calibration,
        candidateCount: records.length,
        partialAnalysis: result.motion.partial,
        capabilities: {
            angularUnits: result.capabilities.angularUnits,
            throttleGroups: result.capabilities.throttleGroups,
            outputBounds: result.capabilities.outputBounds,
            armedState: "unknown",
            configuration: "partial",
        },
        throttle: {
            source: result.throttle.source,
            reasonCode: result.throttle.reasonCode,
            coverageSeconds: Object.fromEntries(
                Object.entries(result.throttle.coverageSeconds).map(([key, value]) => [key, n(value)]),
            ),
            totalSeconds: n(result.throttle.totalSeconds),
        },
        output: {
            status: result.output.status,
            nearUpperFraction: n(result.output.nearUpperFraction),
            longestUpperMs: n(result.output.longestUpperMs),
            meaning: "motor_command_near_logged_output_bounds_not_physical_thrust",
        },
        trackingGroups: result.motion.trackingGroups.slice(0, 15).map((group) => ({
            evidenceId: group.evidenceId,
            axis: group.axis,
            throttleGroup: group.throttleGroup,
            configEpoch: group.configEpoch,
            stateKnown: group.stateKnown,
            tracking: trackingSummary(group.tracking),
        })),
        actionGroups: [...result.motion.actionGroups]
            .sort((a, b) => b.independentCount - a.independentCount)
            .slice(0, 15)
            .map((group) => ({
                evidenceId: group.evidenceId,
                axis: group.axis,
                throttleGroup: group.throttleGroup,
                direction: group.direction,
                configEpoch: group.configEpoch,
                contextStatus: group.contextStatus,
                amplitudeRangeDegPerSecond: group.amplitudeRangeDegPerSecond.map(n),
                ...actionSummary(group),
            })),
        representatives: [...selected.values()],
        selection: {
            rule: "per_axis_typical_worst_unconfirmed_rejected",
            trackingGroupsTotal: result.motion.trackingGroups.length,
            actionGroupsTotal: result.motion.actionGroups.length,
            omittedTrackingGroups: Math.max(0, result.motion.trackingGroups.length - 15),
            omittedActionGroups: Math.max(0, result.motion.actionGroups.length - 15),
            omittedRepresentatives: 0,
        },
        estimates: result.estimates
            .filter((item) => item.status === "limited")
            .slice(0, 9)
            .map((item) => ({
                evidenceId: item.evidenceId,
                axis: item.axis,
                throttleGroup: item.throttleGroup,
                configEpoch: item.configEpoch,
                status: item.status,
                acceptedWindows: item.acceptedWindows,
                rejectedWindows: item.rejectedWindows,
                skippedWindows: item.skippedWindows,
                independentBlocks: item.independentBlocks,
                tailGainEstimate: n(item.tailGainEstimate),
                tailNormalized: false,
                fullDcGainEstablished: false,
                limitation: "band_limited_local_linear_estimate_not_observed_step_metrics",
            })),
    };
}
export function evidenceIds(packet) {
    return [
        "log-quality",
        "flight-configuration",
        "missing-measurements",
        ...packet.axes.map((axis) => axis.evidenceId),
        ...(packet.motion
            ? [
                packet.motion.evidenceId,
                ...["trackingGroups", "actionGroups", "representatives", "estimates"].flatMap((key) =>
                    packet.motion[key].map((item) => item.evidenceId),
                ),
            ]
            : []),
    ];
}
export function metricReferences(packet) {
    const map = new Map();
    const visit = (value, path) => {
        if (Number.isFinite(value)) map.set(path, value);
        else if (value && typeof value === "object" && !Array.isArray(value))
            for (const [key, item] of Object.entries(value)) if (key !== "evidenceId") visit(item, `${path}.${key}`);
    };
    for (const item of packet.axes) visit(item, item.evidenceId);
    if (packet.motion)
        for (const key of ["trackingGroups", "actionGroups", "representatives", "estimates"])
            for (const item of packet.motion[key]) visit(item, item.evidenceId);
    return map;
}
