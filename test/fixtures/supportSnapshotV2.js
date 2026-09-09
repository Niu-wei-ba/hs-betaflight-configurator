export function snapshotV2() {
    const lengths = { 1: 3, 2: 4, 3: 3, 4: 51, 5: 26, 101: 11, 150: 25, 160: 12 };
    const mspResponses = Object.entries(lengths).map(([key, length]) => {
        const code = Number(key);
        const bytes = new Uint8Array(length);
        if (code === 1) bytes.set([0, 1, 47]);
        if (code === 2) bytes.set([66, 84, 70, 76]);
        if (code === 3) bytes.set([4, 6, 0]);
        if (code === 101 || code === 150) bytes[10] = 1;
        if (code === 150) bytes[14] = 2;
        return { code, requestKey: `${code}:`, payloadBase64: btoa(String.fromCharCode(...bytes)), unsupported: false };
    });
    return {
        schemaVersion: 2,
        metadata: { firmwareVersion: "4.6.0", apiVersion: "1.47.0", target: "TEST" },
        mspResponses,
        cliTranscript: "# diff all",
        captureReport: {
            complete: true,
            startedAt: "2026-09-08T00:00:00.000Z",
            completedAt: "2026-09-08T00:00:01.000Z",
            profile: { pid: 1, rate: 2 },
            responseCount: mspResponses.length,
            plannedResponseCount: mspResponses.length,
            requests: mspResponses.map(({ code, requestKey }) => ({
                code,
                requestKey,
                required: true,
                status: "success",
            })),
        },
    };
}

export function addResponse(snapshot, code, requestKey, payloadBase64, unsupported = false) {
    snapshot.mspResponses.push({ code, requestKey, payloadBase64, unsupported });
    snapshot.captureReport.requests.push({
        code,
        requestKey,
        required: false,
        status: unsupported ? "unsupported" : "success",
    });
    snapshot.captureReport.responseCount++;
    snapshot.captureReport.plannedResponseCount++;
    return snapshot;
}
