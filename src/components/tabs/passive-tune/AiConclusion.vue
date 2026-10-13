<template>
    <UiBox :title="$t('passiveAiConclusionTitle')">
        <p class="text-sm">{{ $t("passiveAiReference") }}</p>
        <p v-if="busy" role="status" aria-live="polite">
            {{ $t(ai.state.value === "models" ? "passiveAiLoadingModels" : "passiveAiGeneratingConclusion") }}
        </p>
        <p v-else-if="!ai.answer.value && !ai.error.value">
            {{ $t(ai.ready.value ? "passiveAiConclusionReady" : "passiveAiConclusionNeedsConfig") }}
        </p>
        <p v-if="ai.error.value" role="alert">{{ $t(`passiveAiError_${ai.error.value}`) }}</p>
        <template v-if="ai.answer.value">
            <p class="text-sm">{{ $t(`passiveAiStatus_${conclusion.overallStatus}`) }}</p>
            <p class="text-base font-semibold whitespace-pre-wrap" data-testid="passive-ai-answer">
                {{ conclusion.summary }}
            </p>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 my-3">
                <div
                    v-for="axis in conclusion.axes"
                    :key="axis.axis"
                    class="border border-default rounded-lg p-3 space-y-2"
                >
                    <h3 class="font-semibold">
                        {{ $t(`autotuneAxis${axis.axis[0].toUpperCase()}${axis.axis.slice(1)}`) }} ·
                        {{ $t(`passiveAiStatus_${axis.status}`) }}
                    </h3>
                    <p class="whitespace-pre-wrap">{{ axis.conclusion }}</p>
                    <details class="text-sm">
                        <summary class="cursor-pointer">{{ $t("passiveAiConclusionBasis") }}</summary>
                        <ul class="list-disc pl-5 text-sm">
                            <li v-for="item in axis.limitations" :key="item">{{ item }}</li>
                        </ul>
                        <p>{{ $t("passiveTuneUsableBands") }}: {{ supportedBands(axis.axis) }}</p>
                        <button
                            v-for="id in axis.evidenceIds"
                            :key="id"
                            type="button"
                            class="block underline my-1"
                            @click="$emit('evidence', id)"
                        >
                            {{ evidenceLabel(id) }}
                        </button>
                    </details>
                </div>
            </div>
            <div v-if="conclusion.findings?.length" class="space-y-3 my-3">
                <article
                    v-for="(finding, index) in conclusion.findings"
                    :key="index"
                    class="border-l-2 border-amber-500 pl-3"
                >
                    <p>{{ finding.text }}</p>
                    <p v-for="metricRef in finding.metricRefs" :key="metricRef" class="text-sm tabular-nums">
                        {{ metricText(metricRef) }}
                    </p>
                    <button
                        v-for="id in finding.evidenceIds"
                        :key="id"
                        type="button"
                        class="underline text-sm mr-3"
                        @click="$emit('evidence', id)"
                    >
                        {{ evidenceLabel(id) }}
                    </button>
                </article>
            </div>
            <h3 class="font-semibold">{{ $t("passiveAiNextSteps") }}</h3>
            <ol class="list-decimal pl-5">
                <li v-for="step in conclusion.nextSteps" :key="step.action" class="my-1">{{ step.action }}</li>
            </ol>
            <details class="my-2">
                <summary class="cursor-pointer">{{ $t("passiveAiCannotDetermine") }}</summary>
                <ul class="list-disc pl-5">
                    <li v-for="item in conclusion.cannotDetermine" :key="item">{{ item }}</li>
                </ul>
            </details>
            <p>{{ $t("passiveAiPidNotDetermined") }}</p>
            <p class="text-xs break-all">
                {{ ai.answer.value.model }} · {{ evidence.source.sha256.slice(0, 12) }} · #{{
                    evidence.source.logIndex + 1
                }}
            </p>
        </template>
        <div class="flex flex-wrap gap-2 my-2">
            <UButton type="button" :disabled="busy || !ai.ready.value || dirty" @click="$emit('generate')">{{
                $t(ai.answer.value ? "passiveAiRegenerate" : "passiveAiGenerate")
            }}</UButton>
            <UButton v-if="busy || pending" type="button" color="neutral" variant="outline" @click="$emit('cancel')">{{
                $t("passiveTuneCancel")
            }}</UButton>
            <UButton v-if="ai.answer.value" type="button" color="neutral" variant="outline" @click="download">{{
                $t("passiveAiExportConclusion")
            }}</UButton>
        </div>
        <p v-if="dirty" class="text-sm">{{ $t("passiveAiUnsaved") }}</p>
        <details class="mt-2">
            <summary class="cursor-pointer">{{ $t("passiveAiViewPacket") }}</summary>
            <p class="text-sm my-2">{{ $t("passiveAiPacketDescription") }}</p>
            <pre class="text-xs whitespace-pre-wrap break-all max-h-80 overflow-auto">{{
                JSON.stringify(evidence, null, 2)
            }}</pre>
        </details>
    </UiBox>
</template>
<script setup>
import { computed } from "vue";
import { useTranslation } from "i18next-vue";
import UiBox from "../../elements/UiBox.vue";
import { conclusionReport } from "../../../js/passive-tune/ai-conclusion.js";
import { metricReferences } from "../../../js/passive-tune/ai-motion-evidence.js";
const props = defineProps({
    ai: { type: Object, required: true },
    evidence: { type: Object, required: true },
    pending: { type: Boolean, default: false },
    dirty: { type: Boolean, default: false },
});
defineEmits(["generate", "cancel", "evidence"]);
const ai = props.ai;
const { t } = useTranslation();
const busy = computed(() => ai.state.value !== "idle");
const conclusion = computed(() => ai.answer.value?.conclusion);
function evidenceLabel(id) {
    if (
        ["log-quality", "flight-configuration", "missing-measurements", "axis-roll", "axis-pitch", "axis-yaw"].includes(
            id,
        )
    )
        return t(`passiveAiEvidence_${id}`);
    return t(id.startsWith("event-") ? "passiveAnalysisViewCurve" : "passiveAnalysisViewGroup");
}
function metricText(ref) {
    const value = metricReferences(props.evidence).get(ref);
    const descriptors = [
        [/nearUpperFraction/, "OutputUpper", "%", 100], [/longestUpperMs/, "OutputRun", "ms", 1],
        [/tailGainEstimate/, "TailGain", "", 1], [/gainDb|gainRangeDb/, "FrequencyGain", "dB", 1],
        [/rmsDegPerSecond/, "Rms", "°/s", 1], [/maeDegPerSecond/, "Mae", "°/s", 1],
        [/absoluteErrorP95/, "P95", "°/s", 1], [/riseTime/, "Rise", "ms", 1],
        [/overshoot/, "Overshoot", "%", 1], [/unconfirmedFraction/, "NotConfirmed", "%", 100],
        [/settlingTime/, "Settling", "ms", 1], [/candidateCount/, "CandidateCount", "", 1],
    ];
    const [_match, label, unit, factor] = descriptors.find(([pattern]) => pattern.test(ref)) ?? [null, "Evidence", "", 1];
    return `${t(`passiveAnalysis${label}`)}: ${(value * factor).toFixed(2)} ${unit}`;
}
function supportedBands(axis) {
    const values = props.evidence.axes.find((item) => item.axis === axis).supportedFrequencyBandsHz;
    return values.length
        ? values.map(([low, high]) => `${low.toFixed(1)}–${high.toFixed(1)} Hz`).join(", ")
        : t("passiveTuneInsufficient");
}
function download() {
    const report = conclusionReport(props.evidence, ai.answer.value);
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `passive-ai-conclusion-${props.evidence.source.logIndex + 1}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>
