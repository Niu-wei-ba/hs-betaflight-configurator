// Wire contract shared with the support API (scripts/support-snapshot-contract.mjs).
// Keep both copies identical; neither imports application state.
export const REQUIRED_RESPONSE_LENGTHS = { 1: 3, 2: 4, 3: 3, 4: 51, 5: 26, 101: 11, 150: 22, 160: 12 };

export function decodeSnapshotBase64(value) {
    if (
        typeof value !== "string" ||
        value.length % 4 !== 0 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
    ) {
        throw new Error("快照载荷编码无效，请重新采集。");
    }
    const binary = atob(value);
    if (btoa(binary) !== value) throw new Error("快照载荷编码无效，请重新采集。");
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function validateSnapshotV2(snapshot) {
    if (snapshot?.schemaVersion !== 2) throw new Error("旧版或不支持的快照格式，请连接飞控重新采集。");
    const report = snapshot.captureReport;
    if (report?.complete !== true || !Array.isArray(report.requests) || !Array.isArray(snapshot.mspResponses)) {
        throw new Error("快照采集不完整，请重新采集。");
    }
    const { profile, startedAt, completedAt } = report;
    if (
        !profile ||
        ![profile.pid, profile.rate].every((value) => Number.isInteger(value) && value >= 0 && value < 128) ||
        !Number.isFinite(Date.parse(startedAt)) ||
        !Number.isFinite(Date.parse(completedAt)) ||
        Date.parse(completedAt) < Date.parse(startedAt) ||
        Date.parse(completedAt) - Date.parse(startedAt) > 60_000
    ) {
        throw new Error("快照采集时间或 Profile 无效，请重新采集。");
    }
    if (
        snapshot.mspResponses.length > 512 ||
        report.requests.length !== snapshot.mspResponses.length ||
        report.responseCount !== snapshot.mspResponses.length ||
        report.plannedResponseCount !== report.requests.length
    ) {
        throw new Error("快照响应清单不完整，请重新采集。");
    }
    const entries = new Map();
    for (const entry of snapshot.mspResponses) {
        if (
            !Number.isInteger(entry?.code) ||
            entry.code < 0 ||
            entry.code > 65535 ||
            typeof entry.requestKey !== "string" ||
            !entry.requestKey.startsWith(`${entry.code}:`) ||
            entry.requestKey.length > 512 ||
            typeof entry.unsupported !== "boolean" ||
            typeof entry.payloadBase64 !== "string" ||
            entry.payloadBase64.length > 512 * 1024 ||
            entries.has(entry.requestKey)
        ) {
            throw new Error("快照请求键或响应无效，请重新采集。");
        }
        decodeSnapshotBase64(entry.requestKey.slice(`${entry.code}:`.length));
        const bytes = decodeSnapshotBase64(entry.payloadBase64);
        if (entry.unsupported && bytes.length) throw new Error("不支持的响应不能包含配置数据。");
        entries.set(entry.requestKey, { ...entry, bytes });
    }
    const seen = new Set();
    for (const request of report.requests) {
        const entry = entries.get(request?.requestKey);
        if (
            !entry ||
            seen.has(request.requestKey) ||
            request.code !== entry.code ||
            typeof request.required !== "boolean" ||
            request.status !== (entry.unsupported ? "unsupported" : "success") ||
            (request.required && entry.unsupported)
        ) {
            throw new Error("快照完成状态与响应不一致，请重新采集。");
        }
        seen.add(request.requestKey);
    }
    for (const [code, minimumLength] of Object.entries(REQUIRED_RESPONSE_LENGTHS)) {
        const entry = entries.get(`${code}:`);
        const request = report.requests.find((item) => item.requestKey === `${code}:`);
        if (!entry || entry.unsupported || entry.bytes.length < minimumLength || !request?.required) {
            throw new Error("快照缺少身份或 Profile 必要响应，请重新采集。");
        }
    }
    const api = entries.get("1:").bytes;
    if (api[1] !== 1 || api[2] < 43) throw new Error("快照 API 版本不受支持。");
    const board = entries.get("4:").bytes;
    let boardOffset = 8;
    for (let index = 0; index < 3; index++) {
        if (boardOffset >= board.length) throw new Error("快照板卡信息不完整。");
        boardOffset += 1 + board[boardOffset];
    }
    if (boardOffset + 40 > board.length) throw new Error("快照板卡信息不完整。");
    const extended = entries.get("150:").bytes;
    const statusLength = 22 + extended[15] + (api[2] >= 46 ? 2 : 0) + (api[2] >= 47 ? 1 : 0) + (api[2] >= 48 ? 2 : 0);
    if (extended.length < statusLength) throw new Error("快照状态信息不完整。");
    for (const entry of entries.values()) {
        if (entry.unsupported) continue;
        if ([137, 138, 0x3006].includes(entry.code)) {
            const requestBytes = decodeSnapshotBase64(entry.requestKey.split(":")[1]);
            if (requestBytes.length !== 1 || entry.bytes.length < 2 || entry.bytes[0] !== requestBytes[0]) {
                throw new Error("快照响应索引与请求不一致。");
            }
        }
    }
    if (String.fromCharCode(...entries.get("2:").bytes) !== "BTFL") throw new Error("快照不是 Betaflight 飞控。");
    const status = entries.get("150:").bytes;
    if (status[10] !== profile.pid || status[14] !== profile.rate || entries.get("101:").bytes[10] !== profile.pid) {
        throw new Error("快照 Profile 不一致，请重新采集。");
    }
    return entries;
}
