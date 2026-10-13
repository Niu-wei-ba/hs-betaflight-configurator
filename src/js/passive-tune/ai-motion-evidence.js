// SPDX-License-Identifier: GPL-3.0-or-later
/** Explicit derived-data allowlist. No channels, event payloads or arbitrary header text. */
import { evidenceView } from "./evidence-view.js";
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
        rejectedCount: n(value.rejectedCount),
        candidateConfoundedCount: n(value.candidateConfoundedCount),
        trackingEligibleCount: n(value.trackingEligibleCount),
        trackingQualifiedCount: n(value.trackingQualifiedCount),
        mixedManeuverCount: n(value.mixedManeuverCount),
        ...(value.eligibleCount
            ? {
                independentCount: n(value.independentCount),
                eligibleConfoundedCount: n(value.eligibleConfoundedCount),
                unconfirmedCount: n(value.unconfirmedCount),
                unconfirmedFraction: n(value.unconfirmedFraction),
                notReachedCount: n(value.notReachedCount),
                distributionAvailable: value.distributionAvailable === true,
                riseTimeMs: stats(value.riseTimeMs),
                overshootPct: stats(value.overshootPct),
                settlingTimeMs: stats(value.settlingTimeMs),
            }
            : {}),
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
        coverageStatus: value.durationSeconds >= 0.25 ? "covered" : "short_fragment",
        delayAligned: false,
    };
}
export function controlSummary(control) {
    if (!control) return null;
    return {
        status: control.status,
        unit: "logged_pid_output",
        terms: Object.fromEntries(
            Object.entries(control.terms).map(([key, value]) => [
                key,
                value
                    ? {
                        mean: n(value.mean),
                        rms: n(value.rms),
                        absolutePeak: n(value.absolutePeak),
                        endMinusStart: n(value.endMinusStart),
                        durationSeconds: n(value.durationSeconds),
                    }
                    : null,
            ]),
        ),
        pErrorCorrelation: n(control.pErrorCorrelation),
        ffCommandDerivativeCorrelation: n(control.ffCommandDerivativeCorrelation),
        parameterDecision: "not_determined",
    };
}
export function spectrumSummary(value) {
    if (!value) return null;
    const bands = (list) =>
        list?.map((band) => ({
            lowHz: n(band.lowHz),
            highHz: n(band.highHz),
            rms: n(band.value),
            reasonCode: band.reasonCode ?? null,
        })) ?? null;
    return {
        dtermUnit: "logged_pid_output",
        gyroUnit: "deg/s",
        dtermBands: bands(value.dtermBands),
        unfilteredGyroBands: bands(value.unfilteredGyroBands),
        filteredGyroBands: bands(value.filteredGyroBands),
        meaning: "band_activity_not_filter_safety_or_rpm_effectiveness",
    };
}
function rounded(value) {
    if (typeof value === "number") return n(value);
    if (Array.isArray(value)) return value.map(rounded);
    if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rounded(v)]));
    return value;
}
export function outputSummary(value, compact = false) {
    if (!value) return null;
    const keys = [
        "status",
        "reasonCode",
        "nearUpperFraction",
        "nearLowerFraction",
        "longestUpperMs",
        "longestLowerMs",
        "invalidSeconds",
        "availableSeconds",
        "durationSeconds",
        "bounds",
        "lowerMotorCountSeconds",
        "perMotor",
        "controlAuthorityLimited",
        "weighting",
        "meaning",
    ];
    return rounded(
        Object.fromEntries(
            keys
                .filter(
                    (k) =>
                        value[k] !== undefined &&
                        (!compact ||
                            [
                                "status",
                                "nearUpperFraction",
                                "nearLowerFraction",
                                "longestUpperMs",
                                "longestLowerMs",
                                "durationSeconds",
                                "invalidSeconds",
                            ].includes(k)),
                )
                .map((k) => [k, value[k]]),
        ),
    );
}
function phaseSummary(phase) {
    if (phase.kind === "command_stop" && phase.status === "measured")
        return {
            kind: phase.kind,
            evidenceId: phase.evidenceId,
            status: phase.status,
            timeRangeSeconds: phase.timeRangeSeconds.map(n),
            durationSeconds: n(phase.durationSeconds),
            metricsEvidenceId: phase.evidenceId.replace(/-command_stop$/, "-command_change"),
        };

    if (phase.status !== "measured") return { kind: phase.kind, status: phase.status, reasonCode: phase.reasonCode };
    return {
        kind: phase.kind,
        evidenceId: phase.evidenceId,
        status: phase.status,
        timeRangeSeconds: phase.timeRangeSeconds.map(n),
        durationSeconds: n(phase.durationSeconds),
        tracking: phase.tracking
            ? {
                rmsDegPerSecond: n(phase.tracking.rmsDegPerSecond),
                maeDegPerSecond: n(phase.tracking.maeDegPerSecond),
                absoluteErrorP95DegPerSecond: n(phase.tracking.absoluteErrorP95DegPerSecond),
                p95ResolutionDegPerSecond: n(phase.tracking.p95ResolutionDegPerSecond),
            }
            : null,
        control: {
            terms: Object.fromEntries(
                Object.entries(phase.control?.terms ?? {}).map(([key, v]) => [
                    key,
                    v
                        ? {
                            mean: n(v.mean),
                            rms: n(v.rms),
                            absolutePeak: n(v.absolutePeak),
                            endMinusStart: n(v.endMinusStart),
                        }
                        : null,
                ]),
            ),
        },
        output: outputSummary(phase.output, true),
        ...(phase.residual
            ? {
                residual: rounded(phase.residual),
                contextLimitations: phase.contextLimitations ?? [],
                observationTruncated: phase.observationTruncated,
                endReason: phase.endReason,
            }
            : {}),
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
        stepInputEligibility: event.stepInputEligibility ?? event.inputEligibility,
        contextStatus: event.contextStatus,
        direction: event.direction,
        configEpoch: event.configEpoch,
        timeRangeSeconds: [n(event.timeStartSeconds), n(event.timeEndSeconds)],
        amplitudeDegPerSecond: n(Math.abs(event.delta)),
        transitionMs: n(event.transitionMs),
        throttleGroup: event.throttle.group,
        throttle: {
            meanPct: n(event.throttle.meanPct),
            minPct: n(event.throttle.minPct),
            maxPct: n(event.throttle.maxPct),
        },
        eventType: event.diagnostics?.eventType ?? null,
        context: event.diagnostics?.context ?? null,
        measurementStatus: event.diagnostics?.measurementStatus ?? null,
        diagnosticEligibility: event.diagnostics?.diagnosticEligibility ?? null,
        contextLimitations: event.diagnostics?.contextLimitations ?? [],
        command: rounded(event.diagnostics?.command ?? null),
        phases: (event.phases ?? []).map(phaseSummary),
        tracking: trackingSummary(event.diagnostics?.tracking),
        control: controlSummary(event.diagnostics?.control),
        output: outputSummary(event.diagnostics?.output),
        lagEstimate: event.diagnostics?.lagEstimate ?? null,
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
    const rms = (event) => event.diagnostics?.tracking?.rmsDegPerSecond ?? -Infinity;
    const stop = (event) => event.phases?.find((p) => p.kind === "post_stop" && p.status === "measured");
    for (const axis of ["roll", "pitch", "yaw"]) {
        const values = records
            .filter((event) => event.axis === axis)
            .sort((a, b) => a.eventId.localeCompare(b.eventId));
        const qualified = values.filter(
            (e) => e.diagnostics?.diagnosticEligibility?.trackingComparison.status === "qualified",
        );
        const ordered = [...qualified].sort((a, b) => rms(a) - rms(b) || a.eventId.localeCompare(b.eventId));
        const choose = (category, population, score = rms, typical = false) => {
            if (!population.length) return;
            const sorted = [...population].sort((a, b) => score(b) - score(a) || a.eventId.localeCompare(b.eventId));
            const event = typical ? population[Math.floor((population.length - 1) / 2)] : sorted[0];
            let item = selected.get(event.eventId);
            if (!item) {
                item = {
                    ...eventSummary(event),
                    selection: {
                        categories: [],
                        diagnosticTargets: [],
                        representativeOfCount: population.length,
                        populations: {},
                        limitations: event.diagnostics?.contextLimitations ?? [],
                    },
                };
                selected.set(event.eventId, item);
            }
            item.selection.categories.push(category);
            item.selection.populations[category] = population.length;
            item.selection.diagnosticTargets = [...new Set([...item.selection.diagnosticTargets, category])];
        };
        choose("typical_qualified_tracking", ordered, rms, true);
        choose("maximum_qualified_tracking_error", qualified);
        choose(
            "lower_command_constraint",
            values.filter((e) => e.diagnostics?.output.nearLowerFraction > 0),
        );
        choose(
            "upper_command_constraint",
            values.filter((e) => e.diagnostics?.output.nearUpperFraction > 0),
        );
        const stopping = values.filter(
            (e) => e.diagnostics?.diagnosticEligibility?.stopResidual.status === "qualified",
        );
        choose("qualified_command_stop", stopping, (e) => stop(e)?.durationSeconds ?? 0);
        choose("maximum_measured_stop_residual", stopping, (e) => stop(e)?.residual?.peakAbsDegPerSecond ?? -Infinity);
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
            coverage: rounded(result.throttle.coverage),
        },
        output: outputSummary(result.output),
        motorConstraints: [
            ...new Map(
                result.motion.trackingGroups
                    .filter((g) => g.output)
                    .map((g) => [
                        g.outputEvidenceId,
                        {
                            evidenceId: g.outputEvidenceId,
                            throttleGroup: g.throttleGroup,
                            configEpoch: g.configEpoch,
                            stateFieldsPresent: g.stateFieldsPresent,
                            output: outputSummary(g.output),
                        },
                    ]),
            ).values(),
        ],
        trackingGroups: result.motion.trackingGroups.map((group) => ({
            evidenceId: group.evidenceId,
            axis: group.axis,
            throttleGroup: group.throttleGroup,
            configEpoch: group.configEpoch,
            stateFieldsPresent: group.stateFieldsPresent,
            stableSubsetSeconds: n(group.stableSubsetSeconds),
            outputEvidenceId: group.outputEvidenceId,
            tracking: trackingSummary(group.tracking),
        })),
        actionGroups: [...result.motion.actionGroups]
            .sort((a, b) => b.independentCount - a.independentCount)
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
        representatives: [...selected.values()].sort((a, b) => {
            const priority = [
                "lower_command_constraint",
                "maximum_measured_stop_residual",
                "maximum_qualified_tracking_error",
                "upper_command_constraint",
                "qualified_command_stop",
                "typical_qualified_tracking",
            ];
            const rank = (item) => Math.min(...item.selection.categories.map((c) => priority.indexOf(c)));
            return rank(a) - rank(b) || a.evidenceId.localeCompare(b.evidenceId);
        }),
        selection: {
            rule: "all_groups_six_diagnostic_categories_per_axis",
            omittedEstimates: Math.max(0, result.estimates.filter((item) => item.status === "limited").length - 9),
            trackingGroupsTotal: result.motion.trackingGroups.length,
            actionGroupsTotal: result.motion.actionGroups.length,
            omittedTrackingGroups: 0,
            omittedActionGroups: 0,
            omittedRepresentatives: 0,
            originalRepresentativeCount: selected.size,
            omittedPhaseMotorDetails: [...selected.values()].reduce(
                (sum, event) => sum + event.phases.filter((p) => p.status === "measured").length,
                0,
            ),
            phaseMotorDetailPolicy: "phase_compact_metrics_per_motor_and_term_details_retained_in_local_report",
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
    packet = evidenceView(packet);
    return [
        ...new Set([
            "log-quality",
            "flight-configuration",
            "missing-measurements",
            ...packet.axes.map((axis) => axis.evidenceId),
            ...(packet.motion
                ? [
                    packet.motion.evidenceId,
                    ...["trackingGroups", "actionGroups", "representatives", "estimates", "motorConstraints"].flatMap(
                        (key) => (packet.motion[key] ?? []).map((item) => item.evidenceId),
                    ),
                ]
                : []),
            ...(packet.motion?.throttle.coverage?.evidenceId ? [packet.motion.throttle.coverage.evidenceId] : []),
            ...(packet.motion?.representatives ?? []).flatMap((e) =>
                (e.phases ?? []).filter((p) => p.status === "measured").map((p) => p.evidenceId),
            ),
        ]),
    ];
}
export function metricReferences(packet) {
    packet = evidenceView(packet);
    const map = new Map();
    const visit = (value, path) => {
        if (Number.isFinite(value)) map.set(path, value);
        else if (value && typeof value === "object")
            for (const [key, item] of Object.entries(value)) if (key !== "evidenceId") visit(item, `${path}.${key}`);
    };
    for (const item of packet.axes) visit(item, item.evidenceId);
    for (const key of ["logQuality", "flightConfiguration", "missingMeasurements"])
        if (packet[key]?.evidenceId) visit(packet[key], packet[key].evidenceId);
    if (packet.motion) visit(packet.motion, packet.motion.evidenceId);
    if (packet.motion)
        for (const key of ["trackingGroups", "actionGroups", "representatives", "estimates", "motorConstraints"])
            for (const item of packet.motion[key] ?? []) visit(item, item.evidenceId);
    if (packet.motion?.throttle.coverage?.evidenceId)
        visit(packet.motion.throttle.coverage, packet.motion.throttle.coverage.evidenceId);
    for (const event of packet.motion?.representatives ?? [])
        for (const phase of event.phases ?? []) if (phase.status === "measured") visit(phase, phase.evidenceId);
    return map;
}
/** Exact serialized JSON paths may be normalized to registered evidence-id references; no evaluation or guessed paths. */
export function metricReferenceAliases(packet) {
    const registry = metricReferences(packet),
        aliases = new Map();
    const visit = (value, path, ancestors) => {
        if (Number.isFinite(value)) {
            const refs = ancestors
                .map((root) => root.id + path.slice(root.path.length))
                .filter((ref) => registry.has(ref));
            if (refs.length) aliases.set(path, refs);
            return;
        }
        if (!value || typeof value !== "object") return;
        const roots = value.evidenceId ? [...ancestors, { id: value.evidenceId, path }] : ancestors;
        for (const [key, item] of Object.entries(value))
            if (key !== "evidenceId") visit(item, path ? `${path}.${key}` : key, roots);
    };
    visit(packet, "", []);
    return aliases;
}
