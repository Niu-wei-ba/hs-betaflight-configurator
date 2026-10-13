<template>
    <section id="motion-coverage" class="motion-results space-y-4" data-testid="passive-motion-results">
        <UiBox :title="$t('passiveAnalysisCoverage')">
            <p class="text-sm">{{ $t("passiveAnalysisScope") }}</p>
            <p v-if="result.motion.partial" role="alert">{{ $t("passiveAnalysisPartial") }}</p>
            <div class="coverage-strip my-4">
                <div v-for="axis in axes" :id="`axis-${axis}`" :key="axis" class="coverage-cell">
                    <h3>{{ $t(`autotuneAxis${axis[0].toUpperCase()}${axis.slice(1)}`) }}</h3>
                    <strong
                        >{{ result.axes[axis].actions.trackingEligibleCount
                        }}<small> / {{ result.axes[axis].actions.candidateCount }}</small></strong
                    >
                    <p>{{ $t("passiveAnalysisTrackingCandidates") }}</p>
                    <p>
                        {{ $t("passiveAnalysisQualifiedTracking") }}:
                        {{ result.axes[axis].actions.trackingQualifiedCount }}
                    </p>
                    <p>
                        {{ $t("passiveAnalysisStepCount") }}: {{ result.axes[axis].actions.eligibleCount }} ·
                        {{ $t("passiveAnalysisMixedCount") }}: {{ result.axes[axis].actions.mixedManeuverCount }}
                    </p>
                    <p>
                        {{ $t("passiveAnalysisRms") }} <b>{{ fmt(result.axes[axis].tracking?.rmsDegPerSecond) }}</b> °/s
                    </p>
                    <p>
                        {{ $t("passiveAnalysisNotConfirmed") }}
                        {{
                            fmt(
                                result.axes[axis].actions.unconfirmedFraction == null
                                    ? null
                                    : result.axes[axis].actions.unconfirmedFraction * 100,
                            )
                        }}%
                    </p>
                </div>
            </div>
            <MotorEvidence :output="result.output" />
        </UiBox>
        <DiagnosticSummary :result="result" />
        <UiBox :title="$t('passiveAnalysisThrottleTitle')">
            <p>
                {{
                    $t(result.throttle.source ? "passiveAnalysisThrottleMeaning" : "passiveAnalysisThrottleUnavailable")
                }}
            </p>
            <p id="throttle-coverage" class="my-3" data-testid="passive-throttle-accounting">
                {{ $t("passiveAnalysisFullCoverage") }}: {{ fmt(result.throttle.coverage?.includedSeconds) }} /
                {{ fmt(result.throttle.totalSeconds) }} s · {{ $t("passiveAnalysisStableSubset") }}:
                {{ fmt(result.throttle.coverage?.stableSubsetSeconds) }} s
            </p>
            <details class="text-sm">
                <summary>{{ $t("passiveAnalysisCoverageLedger") }}</summary>
                <p v-for="(seconds, kind) in result.throttle.coverage?.classificationSeconds" :key="kind">
                    {{ $t(`passiveAnalysisCoverage_${kind}`) }}: {{ fmt(seconds) }} s
                </p>
                <p>{{ $t("passiveAnalysisIntervalMeaning") }}</p>
            </details>
            <div class="throttle-coverage my-3">
                <div v-for="group in groups" :key="group">
                    <span>{{ group }}%</span>
                    <div class="coverage-track">
                        <i
                            :style="{
                                width: `${(100 * (result.throttle.coverageSeconds[group] || 0)) / Math.max(1, result.throttle.totalSeconds)}%`,
                            }"
                        />
                    </div>
                    <b>{{ fmt(result.throttle.coverageSeconds[group]) }} s</b>
                </div>
            </div>
            <p v-if="result.throttle.coverageSeconds.unknown || result.throttle.coverageSeconds.invalid">
                {{ $t("passiveAnalysisUnknownCoverage") }}: {{ fmt(result.throttle.coverageSeconds.unknown) }} s /
                {{ fmt(result.throttle.coverageSeconds.invalid) }} s
            </p>
            <label class="flex items-center gap-2 my-3"
                ><span>{{ $t("passiveAnalysisAxis") }}</span
                ><select v-model="selectedAxis">
                    <option v-for="axis in axes" :key="axis" :value="axis">
                        {{ $t(`autotuneAxis${axis[0].toUpperCase()}${axis.slice(1)}`) }}
                    </option>
                </select></label
            >
            <div class="overflow-auto">
                <table>
                    <thead>
                        <tr>
                            <th>{{ $t("passiveAnalysisThrottle") }}</th>
                            <th>{{ $t("passiveAnalysisEpoch") }}</th>
                            <th>{{ $t("passiveAnalysisDuration") }}</th>
                            <th>{{ $t("passiveAnalysisStableSubset") }}</th>
                            <th>{{ $t("passiveAnalysisRms") }}</th>
                            <th>{{ $t("passiveAnalysisMae") }}</th>
                            <th>{{ $t("passiveAnalysisP95") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="group in trackingGroups.slice(0, 60)" :key="group.evidenceId" :id="group.evidenceId">
                            <td>{{ group.throttleGroup }}%</td>
                            <td>
                                {{ group.configEpoch }} ·
                                {{
                                    $t(
                                        group.stateFieldsPresent
                                            ? "passiveAnalysisStateRecorded"
                                            : "passiveAnalysisStateUnknown",
                                    )
                                }}
                            </td>
                            <td>
                                {{ fmt(group.tracking?.durationSeconds) }} s
                                <span v-if="group.tracking?.durationSeconds < 0.25" class="text-dimmed"
                                    >· {{ $t("passiveAnalysisTooFew") }}</span
                                >
                            </td>
                            <td>{{ fmt(group.stableSubsetSeconds) }} s</td>
                            <td>{{ fmt(group.tracking?.rmsDegPerSecond) }} °/s</td>
                            <td>{{ fmt(group.tracking?.maeDegPerSecond) }} °/s</td>
                            <td>
                                {{ fmt(group.tracking?.absoluteErrorP95DegPerSecond) }} °/s
                                <details :id="group.outputEvidenceId">
                                    <summary>{{ $t("passiveAnalysisPerMotor") }}</summary>
                                    <MotorEvidence :output="group.output" />
                                </details>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p v-if="!trackingGroups.length" class="my-3">{{ $t("passiveAnalysisNoStableGroups") }}</p>
                <p v-if="trackingGroups.length > 60">{{ $t("passiveAnalysisLimitedRows") }}</p>
            </div>
            <p class="text-sm mt-3">{{ $t("passiveAnalysisGroupLimit") }}</p>
        </UiBox>
        <UiBox :title="$t('passiveAnalysisActionsTitle')">
            <p>{{ $t("passiveAnalysisActionMeaning") }}</p>
            <div class="flex flex-wrap gap-3 items-center my-3">
                <label><input v-model="eligibleOnly" type="checkbox" /> {{ $t("passiveAnalysisOnlyEligible") }}</label>
                <span>{{ filtered.length }} {{ $t("passiveAnalysisCandidates") }}</span>
                <button type="button" :disabled="page === 0" @click="page--">
                    {{ $t("passiveAnalysisPrevious") }}
                </button>
                <span>{{ page + 1 }} / {{ Math.max(1, Math.ceil(filtered.length / 30)) }}</span>
                <button type="button" :disabled="(page + 1) * 30 >= filtered.length" @click="page++">
                    {{ $t("passiveAnalysisNext") }}
                </button>
            </div>
            <div class="overflow-auto action-table">
                <table>
                    <thead>
                        <tr>
                            <th>{{ $t("passiveAnalysisTime") }}</th>
                            <th>{{ $t("passiveAnalysisType") }}</th>
                            <th>{{ $t("passiveAnalysisAmplitude") }}</th>
                            <th>{{ $t("passiveAnalysisEligibility") }}</th>
                            <th>{{ $t("passiveAnalysisRms") }}</th>
                            <th>{{ $t("passiveAnalysisRise") }}</th>
                            <th>{{ $t("passiveAnalysisOvershoot") }}</th>
                            <th>{{ $t("passiveAnalysisSettling") }}</th>
                            <th>{{ $t("passiveAnalysisEvidence") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="event in visible"
                            :key="event.eventId"
                            :class="{ selected: selectedEvent?.eventId === event.eventId }"
                        >
                            <td>{{ fmt(event.timeStartSeconds) }} s</td>
                            <td>{{ $t(`passiveAnalysisType_${event.type}`) }}</td>
                            <td>{{ fmt(event.delta) }} °/s</td>
                            <td>
                                {{
                                    $t(
                                        event.inputEligibility === "eligible"
                                            ? "passiveAnalysisEligible"
                                            : event.diagnostics?.diagnosticEligibility.trackingComparison.status ===
                                                "qualified"
                                              ? "passiveAnalysisQualifiedTracking"
                                              : "passiveAnalysisMeasurableOnly",
                                    )
                                }}
                            </td>
                            <td>{{ fmt(event.diagnostics?.tracking?.rmsDegPerSecond) }} °/s</td>
                            <td>{{ fmt(event.metrics?.riseTime?.value) }} ms</td>
                            <td>{{ fmt(event.metrics?.overshoot?.value) }}%</td>
                            <td>
                                {{
                                    event.metrics?.settlingTime?.status === "right_censored"
                                        ? $t("passiveAnalysisUnconfirmed")
                                        : fmt(event.metrics?.settlingTime?.value) + " ms"
                                }}
                            </td>
                            <td>
                                <button type="button" class="inspect-button" @click="selectEvent(event)">
                                    {{ $t("passiveAnalysisViewCurve") }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p v-if="!visible.length" class="my-3">{{ $t("passiveAnalysisNoActions") }}</p>
            </div>
            <details class="my-3">
                <summary>{{ $t("passiveAnalysisRejectedReasons") }}</summary>
                <ul class="list-disc pl-5">
                    <li v-for="(count, code) in result.axes[selectedAxis].actions.reasonCounts" :key="code">
                        {{ $t(`passiveAnalysisReason_${code}`) }}: {{ count }}
                    </li>
                </ul>
            </details>
            <div
                v-if="selectedEvent"
                ref="detail"
                class="selected-evidence mt-4 p-4"
                data-testid="passive-action-evidence"
            >
                <h3 class="font-semibold">
                    {{ $t("passiveAnalysisActionDetail") }} · {{ fmt(selectedEvent.timeStartSeconds) }}–{{
                        fmt(selectedEvent.timeEndSeconds)
                    }}
                    s
                </h3>
                <p>
                    {{ $t("passiveAnalysisTransition") }} {{ fmt(selectedEvent.transitionMs) }} ms ·
                    {{ $t("passiveAnalysisThrottle") }} {{ groupLabel(selectedEvent.throttle.group) }} ·
                    {{ $t("passiveAnalysisEpoch") }} {{ selectedEvent.configEpoch }}
                </p>
                <p class="my-2">
                    {{ $t("passiveAnalysisRms") }}: {{ fmt(selectedEvent.diagnostics?.tracking?.rmsDegPerSecond) }} °/s
                    · {{ $t("passiveAnalysisMae") }}:
                    {{ fmt(selectedEvent.diagnostics?.tracking?.maeDegPerSecond) }} °/s
                </p>
                <p>
                    {{ $t("passiveAnalysisLocalLag") }}:
                    {{ fmt(selectedEvent.diagnostics?.lagEstimate?.localLagCandidateMs) }} ms ·
                    {{ $t("passiveAnalysisLagMeaning") }}
                </p>
                <p>
                    {{ $t("passiveAnalysisTrackingQualification") }}:
                    {{
                        $t(
                            `passiveAnalysisGrade_${selectedEvent.diagnostics?.diagnosticEligibility.trackingComparison.status}`,
                        )
                    }}
                </p>
                <p>
                    {{ $t("passiveAnalysisStateEvidence") }}: {{ $t("passiveAnalysisActualStateUnknown") }} · ARM
                    {{ selectedEvent.diagnostics?.context.armSwitchActive ?? "—" }}
                </p>
                <MotorEvidence :output="selectedEvent.diagnostics?.output" />
                <p>{{ $t("passiveContextAttribution") }}</p>
                <ControlTerms :control="selectedEvent.diagnostics?.control" />
                <div class="space-y-3 my-3" data-testid="passive-action-phases">
                    <p>{{ $t("passiveContextPhaseLabels") }}</p>
                    <article
                        v-for="phase in selectedEvent.phases"
                        :id="phase.evidenceId"
                        :key="phase.kind"
                        class="border border-default rounded p-3"
                    >
                        <h4>
                            {{ $t(`passiveAnalysisPhase_${phase.kind}`) }} ·
                            {{
                                phase.status === "measured"
                                    ? fmt(phase.durationSeconds) + " s"
                                    : $t("passiveAnalysisPhaseUnavailable")
                            }}
                        </h4>
                        <template v-if="phase.status === 'measured'">
                            <button type="button" class="underline" @click="selectedPhaseId = phase.evidenceId">
                                {{ $t("passiveAnalysisPhaseCurve") }}
                            </button>
                            <p>
                                {{ precise(phase.timeRangeSeconds[0]) }}–{{ precise(phase.timeRangeSeconds[1]) }} s ·
                                {{ $t("passiveAnalysisRms") }} {{ fmt(phase.tracking?.rmsDegPerSecond) }} °/s
                            </p>
                            <p>{{ $t('passiveAnalysisOutputLower') }}: {{ fmt(phase.output?.nearLowerFraction == null ? null : phase.output.nearLowerFraction*100) }}%</p>
                            <details><summary>{{ $t('passiveAnalysisPhaseDetails') }}</summary>
                                <ControlTerms :control="phase.control" /><MotorEvidence :output="phase.output" />
                            </details>
                            <p v-if="phase.residual">
                                {{ $t("passiveAnalysisStopResidual") }}:
                                {{ fmt(phase.residual.peakAbsDegPerSecond) }} °/s ·
                                {{ $t("passiveAnalysisAlternatingPeaks") }}: {{ phase.residual.alternatingPeakCount }} ·
                                {{ $t("passiveAnalysisDecayRatio") }}: {{ fmt(phase.residual.tailToInitialRmsRatio) }}
                            </p>
                            <p v-if="phase.stopTiming" data-testid="passive-stop-timing">
                                {{ $t("passiveContextContinuedInput") }} {{ precise(phase.stopTiming.continuedInputMs) }} ms ·
                                {{ $t("passiveContextStopPlatform") }} {{ precise(phase.stopTiming.confirmedStopPlatformStartSeconds) }} s
                            </p>
                            <p v-if="phase.trackingErrorResidual">
                                {{ $t("passiveContextStopCommand") }} {{ fmt(phase.command?.mean) }} / {{ fmt(phase.command?.rms) }} °/s ·
                                {{ $t("passiveContextStopError") }} {{ fmt(phase.trackingErrorResidual.rmsDegPerSecond) }} °/s
                            </p>
                            <p v-if="phase.observationTruncated">{{ $t("passiveAnalysisPhaseTruncated") }}</p>
                        </template>
                    </article>
                </div>
                <ul class="list-disc pl-5">
                    <li
                        v-for="code in [
                            ...new Set([
                                ...selectedEvent.reasonCodes,
                                ...selectedEvent.diagnostics.contextLimitations,
                                ...selectedEvent.diagnostics.diagnosticEligibility.trackingComparison.reasonCodes,
                            ]),
                        ]"
                        :key="code"
                    >
                        {{ $t(`passiveAnalysisReason_${code}`) }}
                    </li>
                </ul>
                <p v-if="selectedEvent.metrics?.settlingTime?.status === 'right_censored'">
                    {{ $t("passiveAnalysisCensoredMeaning") }} {{ fmt(selectedEvent.metrics.observationMs) }} ms
                </p>
                <p v-if="loading" role="status">{{ $t("passiveAnalysisLoadingCurve") }}</p>
                <ResponsePlot v-if="curve?.eventId === selectedEvent.eventId" :curve="displayCurve" />
            </div>
        </UiBox>
        <UiBox :title="$t('passiveControlTitle')"
            ><ControlTerms
                :control="result.axes[selectedAxis].control"
                :spectrum="result.axes[selectedAxis].controlSpectrum"
        /></UiBox>
        <UiBox :title="$t('passiveAnalysisDistributionTitle')">
            <p class="text-sm">{{ $t("passiveAnalysisDistributionMeaning") }}</p>
            <div class="overflow-auto">
                <table>
                    <thead>
                        <tr>
                            <th>{{ $t("passiveAnalysisThrottle") }}</th>
                            <th>{{ $t("passiveAnalysisDirection") }}</th>
                            <th>{{ $t("passiveAnalysisIndependent") }}</th>
                            <th>{{ $t("passiveAnalysisRise") }}</th>
                            <th>{{ $t("passiveAnalysisOvershoot") }}</th>
                            <th>{{ $t("passiveAnalysisNotConfirmed") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="group in actionGroups.slice(0, 60)" :key="group.evidenceId" :id="group.evidenceId">
                            <td>
                                {{ groupLabel(group.throttleGroup) }} · {{ $t("passiveAnalysisEpoch") }}
                                {{ group.configEpoch }}
                            </td>
                            <td>{{ $t(`passiveAnalysisDirection_${group.direction}`) }}</td>
                            <td>{{ group.independentCount }}</td>
                            <td>
                                {{
                                    group.distributionAvailable
                                        ? fmt(group.riseTimeMs.median) + " ms"
                                        : $t("passiveAnalysisTooFew")
                                }}
                            </td>
                            <td>
                                {{
                                    group.distributionAvailable
                                        ? fmt(group.overshootPct.median) + "%"
                                        : $t("passiveAnalysisTooFew")
                                }}
                            </td>
                            <td>
                                {{ fmt(group.unconfirmedFraction == null ? null : group.unconfirmedFraction * 100) }}%
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </UiBox>
        <details class="estimate-panel p-4">
            <summary class="font-semibold">{{ $t("passiveAnalysisEstimateTitle") }}</summary>
            <p class="my-2">{{ $t("passiveAnalysisEstimateMeaning") }}</p>
            <template v-if="estimates.length"
                ><div v-for="estimate in estimates" :key="estimate.evidenceId" :id="estimate.evidenceId" class="my-4">
                    <p>
                        {{ groupLabel(estimate.throttleGroup) }} · {{ estimate.acceptedWindows }}
                        {{ $t("passiveAnalysisWindows") }} · {{ $t("passiveAnalysisIndependent") }}
                        {{ estimate.independentBlocks }}
                    </p>
                    <ResponsePlot :curve="estimateCurve(estimate)" /></div
            ></template>
            <p v-else>{{ $t("passiveAnalysisNoEstimate") }}</p>
        </details>
    </section>
</template>
<script setup>
import MotorEvidence from "./MotorEvidence.vue";
import { computed, ref, watch, nextTick } from "vue";
import { useTranslation } from "i18next-vue";
import UiBox from "../../elements/UiBox.vue";
import ControlTerms from "./ControlTerms.vue";
import DiagnosticSummary from "./DiagnosticSummary.vue";
import ResponsePlot from "./ResponsePlot.vue";
const props = defineProps({
    result: { type: Object, required: true },
    curve: { type: Object, default: null },
    loading: { type: Boolean, default: false },
});
const emit = defineEmits(["inspect"]);
const axes = ["roll", "pitch", "yaw"],
    groups = ["0-20", "20-40", "40-60", "60-80", "80-100"];
const selectedAxis = ref("roll"),
    eligibleOnly = ref(false),
    page = ref(0),
    selectedEvent = ref(null);
const detail = ref(null),
    selectedPhaseId = ref(null);
const displayCurve = computed(() => {
    const phase = selectedEvent.value?.phases?.find((p) => p.evidenceId === selectedPhaseId.value);
    return props.curve
        ? {
            ...props.curve,
            highlightedPhase:
                  phase?.status === "measured"
                      ? {
                          startMs: (phase.timeRangeSeconds[0] - selectedEvent.value.timeStartSeconds) * 1000,
                          endMs: (phase.timeRangeSeconds[1] - selectedEvent.value.timeStartSeconds) * 1000,
                      }
                      : null,
        }
        : null;
});
const { t } = useTranslation();
const groupLabel = (group) =>
    ["unknown", "invalid", "changing_throttle"].includes(group) ? t(`passiveAnalysisGroup_${group}`) : `${group}%`;
const fmt = (value) =>
    !Number.isFinite(value)
        ? "—"
        : value !== 0 && Math.abs(value) < 0.01
            ? value < 0
                ? ">-0.01"
                : "<0.01"
            : value.toFixed(value !== 0 && Math.abs(value) < 0.1 ? 2 : 1);
const precise = value => Number.isFinite(value) ? value.toFixed(3) : "—";
const filtered = computed(() =>
    props.result.motion.records.filter(
        (event) => event.axis === selectedAxis.value && (!eligibleOnly.value || event.inputEligibility === "eligible"),
    ),
);
const visible = computed(() => filtered.value.slice(page.value * 30, (page.value + 1) * 30));
const trackingGroups = computed(() =>
    props.result.motion.trackingGroups.filter((group) => group.axis === selectedAxis.value),
);
const actionGroups = computed(() =>
    props.result.motion.actionGroups.filter((group) => group.axis === selectedAxis.value && group.candidateCount > 0),
);
const estimates = computed(() =>
    props.result.estimates.filter((item) => item.axis === selectedAxis.value && item.curve),
);
watch([selectedAxis, eligibleOnly], () => {
    page.value = 0;
});
watch(
    () => props.curve,
    async (curve) => {
        if (curve?.eventId !== selectedEvent.value?.eventId) return;
        await nextTick();
        detail.value?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
);
watch(
    () => props.result,
    () => {
        selectedEvent.value = null;
        page.value = 0;
    },
);
function selectEvent(event) {
    selectedAxis.value = event.axis;
    selectedEvent.value = event;
    selectedPhaseId.value = null;
    emit("inspect", event.eventId);
}
function reveal(id) {
    if (/^axis-(roll|pitch|yaw)$/.test(id)) {
        selectedAxis.value = id.slice(5);
        selectedEvent.value = null;
        return;
    }
    const event = props.result.motion.records.find(
        (item) => item.eventId === id || item.phases?.some((p) => p.evidenceId === id),
    );
    if (event) {
        selectEvent(event);
        if (id !== event.eventId) selectedPhaseId.value = id;
        return;
    }
    const group = [
        ...props.result.motion.trackingGroups,
        ...props.result.motion.actionGroups,
        ...props.result.estimates,
    ].find((item) => item.evidenceId === id || item.outputEvidenceId === id);
    if (group) selectedAxis.value = group.axis;
}
const estimateCurve = (item) => ({
    kind: "estimated",
    unit: "relative",
    points: Array.from(item.curve.timeMs, (timeMs, i) => ({ timeMs, output: item.curve.mean[i] })),
});
defineExpose({ reveal });
</script>
<style scoped>
.motion-results {
    font-variant-numeric: tabular-nums;
}
.coverage-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid var(--ui-border);
    border-radius: 8px;
    overflow: hidden;
}
.coverage-cell {
    padding: 18px;
    border-left: 3px solid #f2a900;
}
.coverage-cell + .coverage-cell {
    border-top: 0;
    border-left: 1px solid var(--ui-border);
}
.coverage-cell strong {
    display: block;
    font-size: 30px;
    margin: 8px 0;
}
.coverage-cell small {
    font-size: 15px;
    opacity: 0.65;
}
.coverage-cell p {
    font-size: 13px;
    margin-top: 6px;
}
.throttle-coverage > div {
    display: grid;
    grid-template-columns: 85px 1fr 90px;
    align-items: center;
    gap: 10px;
    margin: 10px 0;
}
.coverage-track {
    height: 8px;
    background: color-mix(in srgb, currentColor 8%, transparent);
    border-radius: 4px;
    overflow: hidden;
}
.coverage-track i {
    display: block;
    height: 100%;
    background: #f2a900;
}
table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    white-space: nowrap;
}
th,
td {
    padding: 11px 12px;
    text-align: left;
    border-bottom: 1px solid var(--ui-border);
}
th {
    font-weight: 600;
    opacity: 0.75;
}
tr.selected {
    background: color-mix(in srgb, #f2a900 12%, transparent);
}
.inspect-button {
    border-bottom: 1px solid #f2a900;
}
.action-table {
    max-height: 380px;
    overflow: auto;
}
.action-table th {
    position: sticky;
    top: 0;
    background: var(--ui-bg);
    z-index: 1;
}
.selected-evidence,
.estimate-panel {
    border: 1px solid var(--ui-border);
    border-radius: 8px;
}
button:disabled {
    opacity: 0.4;
}
summary {
    cursor: pointer;
}
@media (max-width: 700px) {
    .coverage-strip {
        grid-template-columns: 1fr;
    }
    .coverage-cell + .coverage-cell {
        border-left: 3px solid #f2a900;
        border-top: 1px solid var(--ui-border);
    }
}
</style>
