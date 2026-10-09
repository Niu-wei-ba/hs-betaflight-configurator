<template>
    <UiBox :title="$t('passiveAiTitle')">
        <p>{{ $t("passiveAiDescription") }}</p>
        <form class="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3" @submit.prevent="ai.save">
            <label class="flex flex-col gap-1">
                <span>Base URL</span>
                <input
                    v-model="ai.draft.baseUrl"
                    type="url"
                    required
                    autocomplete="off"
                    placeholder="https://8stoken.com/v1"
                />
            </label>
            <label class="flex flex-col gap-1">
                <span>API Key</span>
                <input
                    v-model="ai.draft.apiKey"
                    type="password"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="sk-…"
                />
            </label>
            <div class="flex flex-wrap gap-2 sm:col-span-2">
                <UButton type="submit">{{ $t("passiveAiSave") }}</UButton>
                <UButton type="button" color="neutral" variant="outline" @click="ai.clear">{{
                    $t("passiveAiClear")
                }}</UButton>
            </div>
        </form>
        <div class="flex flex-wrap gap-3 items-end my-3">
            <label class="flex flex-col gap-1 min-w-0">
                <span>{{ $t("passiveAiModel") }}</span>
                <select
                    :value="ai.config.model"
                    :disabled="!ai.models.value.length"
                    @change="ai.selectModel($event.target.value)"
                >
                    <option v-if="!ai.models.value.length" value="">{{ $t("passiveAiNoModel") }}</option>
                    <option v-for="model in ai.models.value" :key="model" :value="model">{{ model }}</option>
                </select>
            </label>
            <UButton
                type="button"
                color="neutral"
                variant="outline"
                :disabled="!ai.config.apiKey || busy"
                @click="ai.refreshModels"
                >{{ $t("passiveAiRefresh") }}</UButton
            >
            <UButton
                type="button"
                :disabled="!evidence || !ai.ready.value || busy || dirty"
                @click="ai.explain(evidence)"
                >{{ $t("passiveAiExplain") }}</UButton
            >
            <UButton v-if="busy" type="button" color="neutral" variant="outline" @click="ai.cancel">{{
                $t("passiveTuneCancel")
            }}</UButton>
        </div>
        <p v-if="dirty" class="text-sm">{{ $t("passiveAiUnsaved") }}</p>
        <p v-if="busy" role="status" aria-live="polite">
            {{ $t(ai.state.value === "models" ? "passiveAiLoadingModels" : "passiveAiExplaining") }}
        </p>
        <p v-if="ai.error.value" role="alert">{{ $t(`passiveAiError_${ai.error.value}`) }}</p>
        <div v-if="ai.answer.value" class="mt-3">
            <p class="text-sm">{{ $t("passiveAiReference") }}</p>
            <p class="text-sm">{{ ai.answer.value.model }} · {{ $t("passiveTuneDiagnosisOnly") }}</p>
            <p v-if="ai.answer.value.truncated" role="status">{{ $t("passiveAiTruncated") }}</p>
            <div class="whitespace-pre-wrap break-words mt-2" data-testid="passive-ai-answer">
                {{ ai.answer.value.text }}
            </div>
        </div>
    </UiBox>
</template>
<script setup>
import { computed, onMounted, onUnmounted, watch } from "vue";
import UiBox from "../../elements/UiBox.vue";
import { usePassiveAi } from "../../../composables/usePassiveAi.js";
const props = defineProps({ evidence: { type: Object, default: null } });
const ai = usePassiveAi();
const busy = computed(() => ai.state.value !== "idle");
const dirty = computed(() => ai.draft.baseUrl !== ai.config.baseUrl || ai.draft.apiKey !== ai.config.apiKey);
watch(() => props.evidence, ai.invalidate);
onMounted(ai.refreshModels);
onUnmounted(ai.cancel);
</script>
