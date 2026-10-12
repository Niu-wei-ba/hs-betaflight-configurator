import { ref, nextTick, effectScope } from "vue";
import { describe, it, expect, vi } from "vitest";
import { usePassiveConclusionFlow } from "../../src/composables/usePassiveConclusionFlow.js";
function setup() {
    const evidence = ref(null),
        dirty = ref(false);
    const ai = { ready: ref(true), clearAnswer: vi.fn(), explain: vi.fn(), cancel: vi.fn() };
    const scope = effectScope();
    const flow = scope.run(() =>
        usePassiveConclusionFlow(
            ai,
            () => evidence.value,
            () => dirty.value,
        ),
    );
    return { evidence, dirty, ai, flow, scope };
}
describe("analysis to AI conclusion workflow", () => {
    it("automatically concludes once after a requested analysis, with the completed packet", async () => {
        const { evidence, ai, flow, scope } = setup();
        flow.arm();
        evidence.value = { source: { sha256: "new" } };
        await nextTick();
        expect(ai.explain).toHaveBeenCalledOnce();
        expect(ai.explain).toHaveBeenCalledWith(evidence.value);
        ai.ready.value = false;
        await nextTick();
        ai.ready.value = true;
        await nextTick();
        expect(ai.explain).toHaveBeenCalledOnce();
        scope.stop();
    });
    it("waits for model discovery and saved configuration without disrupting either", async () => {
        const { evidence, dirty, ai, flow, scope } = setup();
        ai.ready.value = false;
        dirty.value = true;
        flow.arm();
        evidence.value = { source: { sha256: "new" } };
        await nextTick();
        expect(ai.explain).not.toHaveBeenCalled();
        ai.ready.value = true;
        await nextTick();
        expect(ai.explain).not.toHaveBeenCalled();
        dirty.value = false;
        await nextTick();
        expect(ai.explain).toHaveBeenCalledOnce();
        expect(ai.cancel).not.toHaveBeenCalled();
        scope.stop();
    });
    it("cancels queued generation for a new selection and allows an explicit retry", async () => {
        const { evidence, ai, flow, scope } = setup();
        flow.arm();
        flow.reset();
        evidence.value = { source: { sha256: "different" } };
        await nextTick();
        expect(ai.explain).not.toHaveBeenCalled();
        flow.generate();
        expect(ai.explain).toHaveBeenCalledOnce();
        flow.arm();
        flow.cancel();
        expect(flow.pending.value).toBe(false);
        expect(ai.cancel).toHaveBeenCalledOnce();
        scope.stop();
    });
});
