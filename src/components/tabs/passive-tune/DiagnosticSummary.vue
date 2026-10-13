<template>
    <UiBox :title="$t('passiveContextTitle')">
        <p>{{ $t("passiveContextMeaning") }}</p>
        <div class="overflow-auto my-3" data-testid="passive-context-summary">
            <table class="w-full text-sm">
                <thead>
                    <tr>
                        <th>{{ $t("passiveAnalysisAxis") }}</th>
                        <th>{{ $t("passiveContextTracking") }}</th>
                        <th>{{ $t("passiveContextStopCount") }}</th>
                        <th>{{ $t("passiveContextErrorDistribution") }}</th>
                        <th>{{ $t("passiveContextDecayCount") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="axis in axes" :key="axis">
                        <td>{{ $t(`autotuneAxis${axis[0].toUpperCase()}${axis.slice(1)}`) }}</td>
                        <td>
                            {{ result.axes[axis].actions.lowerMarkedConfoundTrackingCount }} /
                            {{ result.axes[axis].actions.trackingQualifiedCount }}
                        </td>
                        <td>{{ stops(axis).lowerMarkedConfoundCount }} / {{ stops(axis).independentCount }}</td>
                        <td>
                            {{ fmt(stops(axis).all?.trackingErrorRmsDegPerSecond.median) }} /
                            {{ fmt(stops(axis).all?.trackingErrorRmsDegPerSecond.p90) }} °/s
                        </td>
                        <td>
                            {{ stops(axis).all?.errorDecayStatusCounts.measured ?? 0 }} /
                            {{ stops(axis).independentCount }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p class="text-sm">{{ $t("passiveContextDistributionMeaning") }}</p>
        <details class="my-3" data-testid="passive-boundary-association">
            <summary>{{ $t("passiveContextBoundaryTitle") }}</summary>
            <p>{{ $t("passiveContextBoundaryMeaning") }}</p>
            <p v-for="axis in axes" :key="axis">
                {{ $t(`autotuneAxis${axis[0].toUpperCase()}${axis.slice(1)}`) }} · {{ $t("passiveContextOverlap") }}
                {{ pct(result.axes[axis].boundaryAssociation?.jointFractionOfValidTime) }} ·
                {{ $t("passiveContextConditionalOverlap") }}
                {{ pct(result.axes[axis].boundaryAssociation?.boundFractionGivenHighError) }} ·
                {{ $t("passiveContextConditionalRms") }}
                {{ fmt(result.axes[axis].boundaryAssociation?.errorRmsNearBoundDegPerSecond) }} /
                {{ fmt(result.axes[axis].boundaryAssociation?.errorRmsAwayFromBoundsDegPerSecond) }} °/s
            </p>
        </details>
        <p>{{ $t("passiveContextState", { count: result.armingEvidence?.eventCount ?? 0 }) }}</p>
        <details v-if="result.armingEvidence?.eventCount" class="text-sm my-2">
            <summary>{{ $t("passiveContextStateDetails") }}</summary>
            <p v-for="(event, index) in result.armingEvidence.disarmEvents" :key="index">
                {{ $t("passiveContextStateRange") }} {{ fmt(event.afterPreviousFrameSeconds) }}–{{
                    fmt(event.beforeNextFrameSeconds)
                }}
                s
            </p>
        </details>
    </UiBox>
</template>
<script setup>
import UiBox from "../../elements/UiBox.vue";
const props = defineProps({ result: { type: Object, required: true } });
const axes = ["roll", "pitch", "yaw"];
const stops = (axis) => props.result.axes[axis].actions.stopResponses ?? {};
const fmt = (value) => (Number.isFinite(value) ? value.toFixed(2) : "—");
const pct = (value) => (Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—");
</script>
