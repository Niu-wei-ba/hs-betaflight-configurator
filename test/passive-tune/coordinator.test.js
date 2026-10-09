import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { usePassiveTune } from "../../src/composables/usePassiveTune.js";

class MockWorker {
    static instances = [];
    constructor() {
        MockWorker.instances.push(this);
    }
    postMessage = vi.fn();
    terminate = vi.fn();
    respond(data) {
        this.onmessage({ data });
    }
}

describe("Worker orchestration", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        MockWorker.instances = [];
        vi.stubGlobal("Worker", MockWorker);
    });
    const file = () => ({ name: "ordinary.bbl", size: 8, arrayBuffer: async () => new ArrayBuffer(8) });
    it("indexes first, requires a selection, and discards stale results", async () => {
        const tune = usePassiveTune();
        await tune.loadFile(file());
        const worker = MockWorker.instances[0];
        const indexJob = worker.postMessage.mock.calls[0][0].jobId;
        worker.respond({ type: "INDEXED", jobId: indexJob, logs: [{ index: 0 }, { index: 1 }], sha256: "hash" });
        expect(tune.store.state).toBe("ready");
        tune.store.selectedLog = 1;
        tune.analyze();
        const request = worker.postMessage.mock.calls[1][0];
        expect(request.logIndex).toBe(1);
        worker.respond({ type: "RESULT", jobId: indexJob, result: { stale: true } });
        expect(tune.store.result).toBeNull();
        worker.respond({ type: "RESULT", jobId: request.jobId, result: { correct: true } });
        expect(tune.store.result).toEqual({ correct: true });
    });
    it("terminates on cancellation and ignores old Worker failures", async () => {
        const tune = usePassiveTune();
        await tune.loadFile(file());
        const old = MockWorker.instances[0];
        tune.cancel();
        expect(old.terminate).toHaveBeenCalledOnce();
        await tune.loadFile(file());
        old.onerror();
        expect(tune.store.state).toBe("indexing");
    });
    it("ignores a cancelled file read and rejects empty or oversized inputs", async () => {
        const tune = usePassiveTune();
        let resolve;
        const pending = tune.loadFile({
            ...file(),
            arrayBuffer: () =>
                new Promise((done) => {
                    resolve = done;
                }),
        });
        tune.cancel();
        resolve(new ArrayBuffer(8));
        await pending;
        expect(MockWorker.instances).toHaveLength(0);
        await tune.loadFile({ ...file(), size: 0 });
        expect(tune.store.reasonCode).toBe("FILE_SIZE_LIMIT");
        await tune.loadFile({ ...file(), size: 65 * 1024 * 1024 });
        expect(MockWorker.instances).toHaveLength(0);
    });
});
