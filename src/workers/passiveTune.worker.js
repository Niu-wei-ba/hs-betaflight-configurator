// SPDX-License-Identifier: GPL-3.0-or-later
import { indexLogs, fail } from "../js/passive-tune/parser.js";
import { analyzeLog } from "../js/passive-tune/analysis.js";
import { eventCurve } from "../js/passive-tune/evidence-registry.js";

let bytes = null;
let indexedJob = null;
let analysisResult = null;
let resultJob = null;
globalThis.onmessage = async ({ data }) => {
    const { type, jobId } = data ?? {};
    if (!Number.isInteger(jobId)) return;
    try {
        if (type === "INDEX_LOGS") {
            indexedJob = jobId;
            bytes = null;
            analysisResult = null;
            const candidate = new Uint8Array(data.fileBuffer);
            const logs = indexLogs(candidate);
            const digest = await globalThis.crypto.subtle.digest("SHA-256", candidate);
            if (indexedJob !== jobId) return;
            bytes = candidate;
            const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
            globalThis.postMessage({
                type: "INDEXED",
                jobId,
                logs: logs.map(({ index, firmware, start, end }) => ({ index, firmware, bytes: end - start })),
                sha256,
            });
        } else if (type === "ANALYZE") {
            if (!bytes) fail("LOG_SELECTION_REQUIRED");
            analysisResult = null;
            const result = analyzeLog(bytes, data.logIndex, (stage, fraction) => {
                globalThis.postMessage({ type: "PROGRESS", jobId, stage, fraction });
            });
            analysisResult = result;
            resultJob = jobId;
            globalThis.postMessage({ type: "RESULT", jobId, result });
        } else if (type === "GET_EVIDENCE" && jobId === resultJob && analysisResult) {
            const event = analysisResult.motion.records.find((item) => item.eventId === data.evidenceId);
            const curve = event ? eventCurve(analysisResult.localLog, event) : null;
            globalThis.postMessage({ type: "EVIDENCE_RESULT", jobId, requestId: data.requestId, curve });
        }
    } catch (error) {
        globalThis.postMessage({ type: "FAILED", jobId, reasonCode: error.code ?? "ANALYSIS_FAILED" });
    }
};
