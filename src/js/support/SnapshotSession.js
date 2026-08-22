import { reactive } from "vue";
import FC from "../fc";

function bytesToBase64(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function toUint8Array(data) {
    if (!data) return new Uint8Array();
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return Uint8Array.from(data);
}

export function createSupportSnapshotRequestKey(code, data) {
    return `${code}:${bytesToBase64(toUint8Array(data))}`;
}

const responses = new Map();

export const supportSnapshotSession = reactive({
    active: false,
    supportId: "",
    metadata: null,
    expiresAt: "",
    captureReport: null,
    sensorNames: null,
});

export function activateSupportSnapshot(snapshotRecord) {
    const snapshot = snapshotRecord?.snapshot;
    if (!snapshot || snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.mspResponses)) {
        throw new Error("不支持或损坏的支持快照。");
    }
    if (snapshot.captureReport?.complete === false) {
        throw new Error("该支持快照采集不完整，无法可靠渲染配置。请让飞手重新连接飞控并提交新的支持数据。");
    }

    responses.clear();
    for (const entry of snapshot.mspResponses) {
        if (!Number.isInteger(entry?.code) || typeof entry.payloadBase64 !== "string") continue;
        const requestKey = entry.requestKey || createSupportSnapshotRequestKey(entry.code, []);
        responses.set(requestKey, base64ToBytes(entry.payloadBase64));
    }

    supportSnapshotSession.active = true;
    supportSnapshotSession.supportId = snapshotRecord.supportId;
    supportSnapshotSession.metadata = snapshotRecord.metadata || snapshot.metadata || null;
    supportSnapshotSession.expiresAt = snapshotRecord.expiresAt || "";
    supportSnapshotSession.captureReport = snapshotRecord.captureReport || snapshot.captureReport || null;
    supportSnapshotSession.sensorNames = snapshot.sensorNames || null;
}

export function applySupportSnapshotAuxiliaryData() {
    if (!supportSnapshotSession.sensorNames) return;

    FC.SENSOR_NAMES = {
        acc: Array.isArray(supportSnapshotSession.sensorNames.acc) ? [...supportSnapshotSession.sensorNames.acc] : [],
        gyro: Array.isArray(supportSnapshotSession.sensorNames.gyro)
            ? [...supportSnapshotSession.sensorNames.gyro]
            : [],
        baro: Array.isArray(supportSnapshotSession.sensorNames.baro)
            ? [...supportSnapshotSession.sensorNames.baro]
            : [],
        mag: Array.isArray(supportSnapshotSession.sensorNames.mag) ? [...supportSnapshotSession.sensorNames.mag] : [],
        sonar: Array.isArray(supportSnapshotSession.sensorNames.sonar)
            ? [...supportSnapshotSession.sensorNames.sonar]
            : [],
        opticalflow: Array.isArray(supportSnapshotSession.sensorNames.opticalflow)
            ? [...supportSnapshotSession.sensorNames.opticalflow]
            : [],
    };
}

export function clearSupportSnapshot() {
    responses.clear();
    supportSnapshotSession.active = false;
    supportSnapshotSession.supportId = "";
    supportSnapshotSession.metadata = null;
    supportSnapshotSession.expiresAt = "";
    supportSnapshotSession.captureReport = null;
    supportSnapshotSession.sensorNames = null;
}

export function getSupportSnapshotResponse(code, data) {
    const exactKey = createSupportSnapshotRequestKey(code, data);
    const exactResponse = responses.get(exactKey);
    if (exactResponse) return exactResponse;

    const emptyRequestResponse = responses.get(createSupportSnapshotRequestKey(code, []));
    if (emptyRequestResponse) return emptyRequestResponse;

    return null;
}

export function hasSupportSnapshotResponse(code, data = []) {
    return getSupportSnapshotResponse(code, data) !== null;
}

export function supportSnapshotResponseEntries() {
    return [...responses.entries()];
}
