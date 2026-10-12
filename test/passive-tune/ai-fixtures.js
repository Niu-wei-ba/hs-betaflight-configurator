export const aiSource = { sha256: "abcd".repeat(16), logIndex: 0, fileName: "private-location.bbl" };
export function aiResult() {
    const axes = Object.fromEntries(
        ["roll", "pitch", "yaw"].map((axis) => [
            axis,
            {
                reasonCodes: axis === "pitch" ? ["INSUFFICIENT_EXCITATION"] : [],
                frequency: {
                    usableBandsHz: axis === "pitch" ? [] : [[2, 6]],
                    windowCount: 12,
                    independentBlockCount: 6,
                    inputRms: 4.5,
                },
                charts: {
                    frequencies: [1, 2, 3, 4, 5, 6, 7],
                    magnitudeDb: [99, -0.4, 0, 1.5, 0.7, 0.5, 88],
                    phaseDeg: [0, -10, -15, -20, -25, -30, 0],
                    coherence: [0.1, 0.8, 0.8, 0.9, 0.8, 0.8, 0.1],
                    valid: [0, 1, 1, 1, 1, 1, 0],
                    gyroPsd: [99],
                },
                noise: {
                    gyroBands: [
                        { lowHz: 0, highHz: 100, value: 4.2 },
                        { lowHz: 400, highHz: 800, value: null, reasonCode: "INCOMPLETE_BAND" },
                    ],
                    dtermAvailable: true,
                },
            },
        ]),
    );
    return {
        schemaVersion: "0.2.0",
        algorithmVersion: "passive-core-0.2.0",
        logIndex: 0,
        firmware: "Betaflight 4.5.2 (hash) BOARD arbitrary untrusted text",
        sampleCount: 1000,
        durationSeconds: 1,
        timing: {
            status: "warning",
            sampleRateMeasuredHz: 1000,
            sampleRateHeaderHz: 1000,
            jitterPct: 0,
            mismatchPct: 0,
            gaps: 1,
            invalidIntervals: 0,
            spans: [
                { start: 0, end: 400 },
                { start: 500, end: 1000 },
            ],
            reasonCodes: ["FRAME_GAP"],
        },
        corruptRegions: 1,
        reasonCodes: ["READ_ONLY_MILESTONE", "FLIGHT_STATE_NOT_CLASSIFIED"],
        axes,
        configAtFlight: {
            rawHeaders: {
                rollPID: "45,80,45",
                pitchPID: "47,84,51",
                yawPID: "45,80,15",
                gyro_lpf1_static_hz: "238",
                gyro_lpf1_dyn_hz: "300,700",
                looptime: "125",
                pid_process_denom: "2",
                secret: "private-secret",
            },
        },
        events: [{ gps: "private-coordinate" }],
    };
}
export function aiConclusion() {
    return {
        schemaVersion: "passive-ai-conclusion-1.0",
        overallStatus: "limited_evidence",
        summary: "这份日志支持有限频谱诊断，但还不能判断 PID 是否合适。",
        axes: ["roll", "pitch", "yaw"].map((axis) => ({
            axis,
            status: axis === "pitch" ? "insufficient_evidence" : "limited_evidence",
            conclusion:
                axis === "pitch"
                    ? "俯仰的数据支持不足，不能据此判断性能差。"
                    : "能观察到有限频段内的响应幅度变化，尚不能确定是否回弹。",
            evidenceIds: [`axis-${axis}`],
            limitations: ["缺少动作分段与阶跃响应"],
        })),
        nextSteps: [
            { action: "补充包含清晰、适度输入动作的记录。", evidenceIds: ["missing-measurements"] },
            { action: "检查记录完整性，补充连续日志。", evidenceIds: ["log-quality"] },
        ],
        cannotDetermine: ["是否跟手", "是否回弹", "PID 应改多少"],
        pidDecision: "not_determined",
    };
}
