<template>
    <BaseTab tab-name="passive_tune">
        <div class="content_wrapper space-y-4">
            <div class="tab_title">{{ $t("tabPassiveTune") }}</div>
            <UiBox :title="$t('passiveTuneImportTitle')">
                <p>{{ $t("passiveTuneDescription") }}</p>
                <div class="flex flex-wrap items-center gap-3 my-3">
                    <label class="flex flex-col gap-1">
                        <span>{{ $t("passiveTuneFile") }}</span>
                        <input type="file" accept=".bbl,.BBL,.bfl,.BFL,.txt,.TXT" :disabled="busy" @change="pickFile" />
                    </label>
                    <UButton v-if="busy" type="button" color="neutral" variant="outline" @click="cancelAnalysis">{{
                        $t("passiveTuneCancel")
                    }}</UButton>
                </div>
                <p v-if="store.source" class="text-sm break-all">
                    {{ store.source.fileName }} · {{ (store.source.fileBytes / 1024 / 1024).toFixed(2) }} MiB
                </p>
                <div v-if="store.logs.length" class="flex flex-wrap items-end gap-3 my-3">
                    <label class="flex flex-col gap-1">
                        <span>{{ $t("passiveTuneFlight") }}</span>
                        <select v-model.number="store.selectedLog" :disabled="busy">
                            <option v-for="log in store.logs" :key="log.index" :value="log.index">
                                #{{ log.index + 1 }} · {{ log.firmware || $t("passiveTuneUnknown") }}
                            </option>
                        </select>
                    </label>
                    <UButton type="button" :disabled="busy" @click="analyzeWithAi">
                        {{ $t(ai.config.apiKey ? "passiveAiAnalyzeAndConclude" : "passiveTuneAnalyze") }}
                    </UButton>
                </div>
                <p v-if="busy" role="status" aria-live="polite">
                    {{ $t(store.state === "indexing" ? "passiveTuneIndexing" : `passiveTuneStage_${store.stage}`) }}
                    <span v-if="store.state === 'analyzing'"> · {{ store.progress }}%</span>
                </p>
                <p v-if="store.reasonCode" role="alert">{{ reason(store.reasonCode) }}</p>
            </UiBox>
            <AiConfig :ai="ai" @cancel="flow.cancel" />
            <AiConclusion
                v-if="evidence"
                :ai="ai"
                :evidence="evidence"
                :pending="flow.pending.value"
                :dirty="aiDirty"
                @generate="flow.generate"
                @cancel="flow.cancel"
            />
            <details v-if="store.result" class="space-y-4">
                <summary class="cursor-pointer font-semibold">{{ $t("passiveAiTechnicalDetails") }}</summary>
                <UiBox :title="$t('passiveTuneQualityTitle')">
                    <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3 my-3">
                        <div>
                            <dt>{{ $t("passiveTuneSampleRate") }}</dt>
                            <dd>{{ format(store.result.timing.sampleRateMeasuredHz) }} Hz</dd>
                        </div>
                        <div>
                            <dt>{{ $t("passiveTuneHeaderRate") }}</dt>
                            <dd>{{ format(store.result.timing.sampleRateHeaderHz) }} Hz</dd>
                        </div>
                        <div>
                            <dt>{{ $t("passiveTuneDuration") }}</dt>
                            <dd>{{ format(store.result.durationSeconds) }} s</dd>
                        </div>
                        <div>
                            <dt>{{ $t("passiveTuneFrames") }}</dt>
                            <dd>{{ store.result.sampleCount }}</dd>
                        </div>
                    </dl>
                    <ul class="list-disc pl-5">
                        <li v-for="code in store.result.reasonCodes" :key="code">{{ reason(code) }}</li>
                    </ul>
                    <UButton type="button" color="neutral" variant="outline" class="mt-3" @click="downloadReport">
                        {{ $t("passiveTuneExport") }}
                    </UButton>
                </UiBox>
                <UiBox
                    v-for="axis in axes"
                    :key="axis"
                    :title="$t(`autotuneAxis${axis[0].toUpperCase()}${axis.slice(1)}`)"
                >
                    <p>{{ $t("passiveTuneDiagnosisOnly") }}</p>
                    <template v-if="store.result.axes[axis].frequency">
                        <p class="my-2">
                            {{ $t("passiveTuneUsableBands") }}:
                            {{ bands(store.result.axes[axis].frequency.usableBandsHz) }}
                        </p>
                        <p>{{ $t("passiveTuneWindows") }}: {{ store.result.axes[axis].frequency.windowCount }}</p>
                    </template>
                    <ul class="list-disc pl-5 my-2">
                        <li v-for="code in store.result.axes[axis].reasonCodes" :key="code">{{ reason(code) }}</li>
                    </ul>
                    <details v-if="store.result.axes[axis].charts" class="my-3">
                        <summary class="cursor-pointer">{{ $t("passiveTuneEvidence") }}</summary>
                        <SpectrumPlot :charts="store.result.axes[axis].charts" />
                    </details>
                    <p v-if="store.result.axes[axis].noise" class="text-sm">
                        {{ $t("passiveTuneNoiseUnknown") }}
                    </p>
                </UiBox>
            </details>
        </div>
    </BaseTab>
</template>

<script setup>
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useTranslation } from "i18next-vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "../elements/UiBox.vue";
import AiConclusion from "./passive-tune/AiConclusion.vue";
import { usePassiveAi } from "../../composables/usePassiveAi.js";
import { usePassiveConclusionFlow } from "../../composables/usePassiveConclusionFlow.js";
import AiConfig from "./passive-tune/AiConfig.vue";
import { aiEvidence } from "../../js/passive-tune/ai-provider.js";
import SpectrumPlot from "./passive-tune/SpectrumPlot.vue";
import { usePassiveTune } from "../../composables/usePassiveTune.js";
import { AXES } from "../../js/passive-tune/analysis.js";

const { store, loadFile, analyze, cancel, downloadReport } = usePassiveTune();
const ai = usePassiveAi();
const axes = AXES;
const evidence = computed(() => aiEvidence(store.result, store.source));
const aiDirty = computed(() => ai.draft.baseUrl !== ai.config.baseUrl || ai.draft.apiKey !== ai.config.apiKey);
const flow = usePassiveConclusionFlow(
    ai,
    () => evidence.value,
    () => aiDirty.value,
);
const busy = computed(() => ["indexing", "analyzing"].includes(store.state));
const { t } = useTranslation();
const format = (value) => (Number.isFinite(value) ? value.toFixed(1) : "—");
const bands = (values) =>
    values.length
        ? values.map(([low, high]) => `${format(low)}–${format(high)} Hz`).join(", ")
        : t("passiveTuneInsufficient");
const reason = (code) => t(`passiveTuneReason_${code}`);
function cancelAnalysis() {
    flow.cancel();
    cancel();
}
function analyzeWithAi() {
    analyze();
    flow.arm();
}
watch(
    () => store.selectedLog,
    () => {
        flow.reset();
        store.result = null;
    },
);
onMounted(ai.refreshModels);
function pickFile(event) {
    const file = event.target.files?.[0];
    if (file) {
        flow.reset();
        loadFile(file);
    }
    event.target.value = "";
}
onUnmounted(() => {
    flow.reset();
    ai.cancel();
    cancel();
});
</script>
