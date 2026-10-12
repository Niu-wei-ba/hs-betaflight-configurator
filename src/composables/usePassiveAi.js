import { computed, reactive, ref } from "vue";
import {
    AI_STORAGE_KEY,
    loadAiConfig,
    saveAiConfig,
    normalizeBaseUrl,
    fetchModels,
    explainEvidence,
} from "../js/passive-tune/ai-provider.js";

export function usePassiveAi(storage) {
    if (!storage) {
        try {
            storage = window.localStorage;
        } catch {
            storage = {
                getItem: () => null,
                setItem: () => {
                    throw new Error("AI_STORAGE_FAILED");
                },
                removeItem: () => {
                    throw new Error("AI_STORAGE_FAILED");
                },
            };
        }
    }
    const config = reactive(loadAiConfig(storage));
    const draft = reactive({ ...config });
    const models = ref([]);
    const state = ref("idle");
    const error = ref("");
    const answer = ref(null);
    const ready = computed(() => !!config.apiKey && models.value.includes(config.model));
    let controller = null;
    let job = 0;
    let lastRequestKind = "";
    function cancel() {
        job++;
        controller?.abort();
        controller = null;
        state.value = "idle";
    }
    function invalidate() {
        cancel();
        answer.value = null;
        error.value = "";
    }
    function clearAnswer() {
        answer.value = null;
        if (state.value === "explaining") cancel();
        if (lastRequestKind === "explaining") error.value = "";
    }
    async function run(kind, request) {
        cancel();
        const current = ++job;
        const active = new AbortController();
        controller = active;
        state.value = kind;
        lastRequestKind = kind;
        error.value = "";
        const timer = setTimeout(() => active.abort("timeout"), kind === "models" ? 20000 : 90000);
        try {
            const result = await request(active.signal);
            if (current !== job) return;
            return result;
        } catch (failure) {
            if (current === job)
                error.value = active.signal.aborted
                    ? "AI_TIMEOUT"
                    : failure.message.startsWith("AI_")
                        ? failure.message
                        : "AI_PROVIDER_FAILED";
        } finally {
            clearTimeout(timer);
            if (current === job) {
                state.value = "idle";
                controller = null;
            }
        }
    }
    async function refreshModels() {
        invalidate();
        models.value = [];
        if (!config.apiKey) return;
        const result = await run("models", (signal) => fetchModels({ ...config }, { signal }));
        if (!result) return;
        models.value = result;
        if (!result.includes(config.model)) config.model = result[0];
        draft.model = config.model;
        try {
            saveAiConfig(storage, config);
        } catch (failure) {
            error.value = failure.message;
        }
    }
    async function save() {
        invalidate();
        try {
            const next = { baseUrl: normalizeBaseUrl(draft.baseUrl), apiKey: draft.apiKey.trim(), model: config.model };
            if (/[\r\n]/.test(next.apiKey)) throw new Error("AI_KEY_REQUIRED");
            saveAiConfig(storage, next);
            Object.assign(config, next);
            Object.assign(draft, next);
            await refreshModels();
        } catch (failure) {
            error.value = failure.message;
        }
    }
    function selectModel(model) {
        invalidate();
        if (!models.value.includes(model)) return;
        config.model = model;
        draft.model = model;
        try {
            saveAiConfig(storage, config);
        } catch (failure) {
            error.value = failure.message;
        }
    }
    function clear() {
        invalidate();
        try {
            storage.removeItem(AI_STORAGE_KEY);
        } catch {
            error.value = "AI_STORAGE_FAILED";
            return;
        }
        Object.assign(config, loadAiConfig(storage));
        Object.assign(draft, config);
        models.value = [];
    }
    async function explain(evidence) {
        invalidate();
        if (!ready.value || !evidence) return;
        const selected = { ...config };
        const result = await run("explaining", (signal) => explainEvidence(selected, evidence, { signal }));
        if (result)
            answer.value = {
                ...result,
                source: evidence.source,
                baseUrl: selected.baseUrl,
                requestedModel: selected.model,
                algorithmVersion: evidence.algorithmVersion,
                generatedAt: new Date().toISOString(),
            };
    }
    return {
        config,
        draft,
        models,
        state,
        error,
        answer,
        ready,
        save,
        refreshModels,
        selectModel,
        clear,
        explain,
        cancel,
        invalidate,
        clearAnswer,
    };
}
