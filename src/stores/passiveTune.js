import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

export const usePassiveTuneStore = defineStore("passiveTune", () => {
    const state = ref("idle");
    const logs = shallowRef([]);
    const result = shallowRef(null);
    const source = shallowRef(null);
    const selectedLog = ref(0);
    const reasonCode = ref(null);
    const stage = ref("parsing");
    const progress = ref(0);
    const evidenceCurve = shallowRef(null);
    const evidenceLoading = ref(false);
    function reset() {
        state.value = "idle";
        logs.value = [];
        result.value = null;
        source.value = null;
        selectedLog.value = 0;
        reasonCode.value = null;
        progress.value = 0;
        evidenceCurve.value = null;
        evidenceLoading.value = false;
    }
    return {
        state,
        logs,
        result,
        source,
        selectedLog,
        reasonCode,
        stage,
        progress,
        evidenceCurve,
        evidenceLoading,
        reset,
    };
});
