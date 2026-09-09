import { reactive } from "vue";
import { validateSnapshotV2 } from "./SnapshotContract";

export function createSupportSnapshotRequestKey(code, data) {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data || []);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `${code}:${btoa(binary)}`;
}

let responses = new Map();
export const supportSnapshotSession = reactive({
    active: false,
    supportId: "",
    metadata: null,
    expiresAt: "",
    captureReport: null,
    issues: {},
});

export function activateSupportSnapshot(snapshotRecord) {
    // Validate into a temporary map: a bad record must never partially activate a session.
    const validated = validateSnapshotV2(snapshotRecord?.snapshot);
    responses = validated;
    Object.assign(supportSnapshotSession, {
        active: true,
        supportId: snapshotRecord.supportId,
        metadata: snapshotRecord.snapshot.metadata || null,
        expiresAt: snapshotRecord.expiresAt || "",
        captureReport: snapshotRecord.snapshot.captureReport,
        issues: {},
    });
}

export function clearSupportSnapshot() {
    responses = new Map();
    Object.assign(supportSnapshotSession, {
        active: false,
        supportId: "",
        metadata: null,
        expiresAt: "",
        captureReport: null,
        issues: {},
    });
}

// Kept as compatibility no-ops for tabs shared with legacy snapshots. v2 never
// switches profiles or relies on CLI-derived sensor labels.
export function applySupportSnapshotAuxiliaryData() {}
export function applySupportSnapshotRateProfile() {
    return false;
}

export function getSupportSnapshotEntry(code, data) {
    return responses.get(createSupportSnapshotRequestKey(code, data)) || null;
}

export function isSupportSnapshotResponseUnsupported(code, data = []) {
    return getSupportSnapshotEntry(code, data)?.unsupported === true;
}

export function getSupportSnapshotResponse(code, data) {
    const entry = getSupportSnapshotEntry(code, data);
    return entry && !entry.unsupported ? entry.bytes : null;
}

export function hasSupportSnapshotResponse(code, data = []) {
    return getSupportSnapshotEntry(code, data) !== null;
}

export function reportSupportSnapshotIssue(tab, message) {
    supportSnapshotSession.issues[tab || "setup"] = message;
}

export function supportSnapshotResponseEntries() {
    return [...responses.entries()];
}
