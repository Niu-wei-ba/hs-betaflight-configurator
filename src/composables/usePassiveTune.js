import { usePassiveTuneStore } from "../stores/passiveTune.js";
import { MAX_FILE_BYTES } from "../js/passive-tune/parser.js";
import { exportReport } from "../js/passive-tune/analysis.js";

/** The Worker owns the file. Termination also interrupts synchronous FFT/decode. */
export function usePassiveTune() {
    const store = usePassiveTuneStore();
    let worker = null;
    let jobId = 0;
    function cancel() {
        jobId++;
        worker?.terminate();
        worker = null;
        store.reset();
    }
    function failed(code) {
        store.reasonCode = code;
        store.state = "error";
    }
    async function loadFile(file) {
        cancel();
        const current = ++jobId;
        if (!file || file.size > MAX_FILE_BYTES || file.size === 0) {
            failed("FILE_SIZE_LIMIT");
            return;
        }
        store.state = "indexing";
        store.source = { fileName: file.name, fileBytes: file.size, sha256: null };
        try {
            const fileBuffer = await file.arrayBuffer();
            if (current !== jobId) return;
            worker = new Worker(new URL("../workers/passiveTune.worker.js", import.meta.url), { type: "module" });
            const instance = worker;
            worker.onmessage = ({ data }) => {
                if (data.jobId !== jobId) return;
                if (data.type === "INDEXED") {
                    store.logs = data.logs;
                    store.source = { ...store.source, sha256: data.sha256 };
                    store.state = "ready";
                } else if (data.type === "PROGRESS") {
                    store.stage = data.stage;
                    store.progress = Math.round(Math.max(0, Math.min(1, data.fraction)) * 100);
                } else if (data.type === "RESULT") {
                    store.result = data.result;
                    store.state = "done";
                } else if (data.type === "FAILED") failed(data.reasonCode);
            };
            worker.onerror = () => {
                if (worker === instance) failed("WORKER_FAILED");
            };
            worker.postMessage({ type: "INDEX_LOGS", jobId: current, fileBuffer }, [fileBuffer]);
        } catch {
            if (current === jobId) failed("FILE_READ_FAILED");
        }
    }
    function analyze() {
        if (
            !worker ||
            !store.logs.some((log) => log.index === store.selectedLog) ||
            ["indexing", "analyzing"].includes(store.state)
        )
            return;
        store.result = null;
        store.reasonCode = null;
        store.progress = 0;
        store.stage = "parsing";
        store.state = "analyzing";
        worker.postMessage({ type: "ANALYZE", jobId: ++jobId, logIndex: store.selectedLog });
    }
    function downloadReport() {
        if (!store.result || !store.source?.sha256) return;
        const blob = new Blob([JSON.stringify(exportReport(store.result, store.source), null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `passive-blackbox-log-${store.result.logIndex + 1}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return { store, loadFile, analyze, cancel, downloadReport };
}
