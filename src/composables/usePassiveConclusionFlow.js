import { ref, watch } from "vue";

/** One AI request per explicitly started analysis; wait for model discovery without cancelling it. */
export function usePassiveConclusionFlow(ai, getEvidence, getDirty) {
    const pending = ref(false);
    watch([getEvidence, () => ai.ready.value, getDirty], ([evidence, ready, dirty], previous) => {
        if (evidence !== previous?.[0]) ai.clearAnswer();
        if (pending.value && evidence && ready && !dirty) {
            pending.value = false;
            void ai.explain(evidence);
        }
    });
    function arm() {
        pending.value = true;
        ai.clearAnswer();
    }
    function reset() {
        pending.value = false;
        ai.clearAnswer();
    }
    function generate() {
        pending.value = false;
        const evidence = getEvidence();
        if (evidence && ai.ready.value && !getDirty()) void ai.explain(evidence);
    }
    function cancel() {
        pending.value = false;
        ai.cancel();
    }
    return { pending, arm, reset, generate, cancel };
}
