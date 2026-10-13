// SPDX-License-Identifier: GPL-3.0-or-later
import {
    motionEvidence,
    actionSummary,
    trackingSummary,
    controlSummary,
    spectrumSummary,
} from "./ai-motion-evidence.js";
export const EVIDENCE_VERSION = "passive-ai-evidence-1.2";
export const MAX_EVIDENCE_BYTES = 98304;
const AXES = ["roll", "pitch", "yaw"];
const number = (value) => (Number.isFinite(value) ? Math.round(value * 1e5) / 1e5 : null);
const reasons = (values) =>
    Array.isArray(values)
        ? [...new Set(values.filter((value) => typeof value === "string" && /^[A-Z_]{1,64}$/.test(value)))].slice(0, 24)
        : [];
const MEANINGS = {
    READ_ONLY_MILESTONE: "当前仅支持只读诊断，不能生成或应用参数改值。",
    ALIASING_UNCERTAIN: "日志记录前的抗混叠链路未验证。",
    FLIGHT_STATE_NOT_CLASSIFIED: "没有区分动作、飞行状态和油门工作点。",
    FRAME_GAP: "存在实测时间不连续，窗口未跨越断点；不能据此确定故障原因。",
    ANALYSIS_BOUNDARY: "存在状态、配置或解析分段边界，不等于时间戳断档；具体来源见boundaryRecords。",
    TIMESTAMP_UNRELIABLE: "时间戳不可靠，此记录的频谱不应解释。",
    SAMPLE_RATE_HEADER_UNAVAILABLE: "缺少日志头采样率，不能与实测采样率交叉验证。",
    SAMPLE_RATE_MISMATCH: "实测采样率与日志头不一致。",
    LOG_CORRUPTION_RECOVERED: "跳过了无法解码的区域，仅在有效主帧处恢复。",
    INSUFFICIENT_EXCITATION: "没有同时满足输入激励、相干性等条件的连续频段，不能解释为性能差。",
    INSUFFICIENT_WELCH_SUPPORT: "有效窗口和独立片段数量不足。",
    MISSING_AXIS_CHANNELS: "缺少该轴所需的指令或陀螺仪通道。",
    UNSUPPORTED_FIELD_SCALE: "字段缩放未知，不能推断幅度。",
};

/** Preserve full-band extrema while bounding the derived spectral evidence, never raw samples. */
function trackingEvidence(charts, bands, rejected) {
    const points = [];
    if (
        !bands.length ||
        !charts?.frequencies?.length ||
        !charts.valid ||
        !charts.magnitudeDb ||
        !charts.phaseDeg ||
        !charts.coherence ||
        rejected
    )
        return { supportedPointCount: 0, gainRangeDb: null, peak: null, points: [] };
    for (let i = 0; i < charts.frequencies.length; i++) {
        const frequencyHz = charts.frequencies[i];
        if (
            !charts.valid[i] ||
            !Number.isFinite(charts.magnitudeDb[i]) ||
            !Number.isFinite(frequencyHz) ||
            !bands.some(([low, high]) => frequencyHz >= low && frequencyHz <= high)
        )
            continue;
        points.push({
            frequencyHz: number(frequencyHz),
            gainDb: number(charts.magnitudeDb[i]),
            phaseDeg: number(charts.phaseDeg[i]),
            coherence: number(charts.coherence[i]),
        });
    }
    if (!points.length) return { supportedPointCount: 0, gainRangeDb: null, peak: null, points: [] };
    const minimum = points.reduce((a, b) => (a.gainDb < b.gainDb ? a : b));
    const peak = points.reduce((a, b) => (a.gainDb > b.gainDb ? a : b));
    const selected = new Set([points.indexOf(minimum), points.indexOf(peak)]);
    for (let k = 0; k < Math.min(46, points.length); k++)
        selected.add(Math.round((k * (points.length - 1)) / Math.max(1, Math.min(46, points.length) - 1)));
    return {
        supportedPointCount: points.length,
        gainRangeDb: { min: minimum.gainDb, max: peak.gainDb },
        peak,
        points: [...selected].sort((a, b) => a - b).map((i) => points[i]),
    };
}

function flightConfiguration(headers = {}) {
    const numeric = (key, length = 1) => {
        const raw = headers[key];
        if (typeof raw !== "string" || raw.length > 128 || !/^\d+(?:\.\d+)?(?:,\d+(?:\.\d+)?)*$/.test(raw)) return null;
        const values = raw.split(",").map(Number);
        if (values.length !== length || values.some((value) => !Number.isFinite(value) || value > 1e7)) return null;
        return length === 1 ? values[0] : values;
    };
    const filters = {};
    for (const key of [
        "gyro_lpf1_static_hz",
        "gyro_lpf2_static_hz",
        "dterm_lpf1_static_hz",
        "dterm_lpf2_static_hz",
        "dyn_notch_min_hz",
        "dyn_notch_max_hz",
        "dyn_notch_count",
        "rpm_filter_harmonics",
        "rpm_filter_min_hz",
    ])
        filters[key] = numeric(key);
    for (const key of ["gyro_lpf1_dyn_hz", "dterm_lpf1_dyn_hz"]) filters[key] = numeric(key, 2);
    return {
        evidenceId: "flight-configuration",
        source: "log_header_numeric_allowlist",
        completeness: "partial",
        pid: Object.fromEntries(
            AXES.map((axis) => {
                const values = numeric(`${axis}PID`, 3);
                return [axis, values ? { p: values[0], i: values[1], d: values[2] } : null];
            }),
        ),
        dMin: numeric("d_min", 3),
        filterSettings: filters,
        pidLoopTimeUs:
            numeric("looptime") !== null && numeric("pid_process_denom") !== null
                ? number(numeric("looptime") * numeric("pid_process_denom"))
                : null,
        warning: "仅为日志头中的部分设置，不是完整配置快照，也不能证明设置合理。",
    };
}

/** Explicit allowlist: no arbitrary headers, filenames, locations, events, credentials or raw sample arrays. */
export function aiEvidence(result, source) {
    if (!result || !source?.sha256) return null;
    const timing = result.timing || {};
    const rejected = timing.status === "rejected" && !timing.localAnalysisAvailable;
    const spans = (timing.spans || []).filter(
        (span) =>
            Number.isInteger(span.start) &&
            Number.isInteger(span.end) &&
            span.start >= 0 &&
            span.end > span.start &&
            span.end <= result.sampleCount,
    );
    const usedSamples = spans.reduce((count, span) => count + span.end - span.start, 0);
    const allReasons = new Set(reasons(result.reasonCodes));
    const axes = AXES.map((axis, index) => {
        const value = result.axes?.[axis] || {};
        const frequency = value.frequency;
        const rawBands = rejected
            ? []
            : (frequency?.usableBandsHz || [])
                .filter(
                    (band) =>
                        Array.isArray(band) &&
                          band.length === 2 &&
                          band.every(Number.isFinite) &&
                          band[0] >= 0 &&
                          band[1] >= band[0],
                )
                .slice(0, 24);
        const bands = rawBands.map((band) => band.map(number));
        const axisReasons = reasons(value.reasonCodes);
        axisReasons.forEach((code) => allReasons.add(code));
        return {
            axis,
            evidenceId: `axis-${axis}`,
            availability: bands.length || value.tracking ? "limited_evidence" : "insufficient_evidence",
            supportedFrequencyBandsHz: bands,
            welchWindowCount: number(frequency?.windowCount),
            independentBlockCount: number(frequency?.independentBlockCount),
            commandRmsDegPerSecond: number(frequency?.inputRms),
            estimatedControlBandwidthHz: null,
            tracking: trackingEvidence(value.charts, rawBands, rejected),
            gyroSignal: {
                source: `gyroADC[${index}]`,
                unit: "deg/s",
                includesCommandResponse: true,
                rmsBands: (value.noise?.gyroBands || []).slice(0, 3).map((band) => ({
                    lowHz: number(band.lowHz),
                    highHz: number(band.highHz),
                    rms: number(band.value),
                    unavailableReason: reasons([band.reasonCode])[0] || null,
                })),
                vibrationRisk: "not_assessed",
                dtermChannelPresent: value.noise ? value.noise.dtermAvailable === true : null,
            },
            reasonCodes: axisReasons,
            ...(result.motion
                ? {
                    observedTracking: trackingSummary(value.tracking),
                    observedActions: actionSummary(value.actions),
                    capabilities: value.capabilities,
                    diagnosticCoverage: value.diagnosticCoverage,
                    control: controlSummary(value.control),
                    controlSpectrum: spectrumSummary(value.controlSpectrum),
                }
                : {}),
        };
    });
    const packet = {
        schemaVersion: result.motion ? EVIDENCE_VERSION : "passive-ai-evidence-1.0",
        algorithmVersion: typeof result.algorithmVersion === "string" ? result.algorithmVersion.slice(0, 64) : null,
        source: {
            sha256: source.sha256,
            logIndex: result.logIndex,
            betaflightVersion: result.firmware?.match(/Betaflight\s+([\d.]+(?:-[\w.]+)?)/)?.[1] || null,
        },
        scope: {
            mode: "read_only",
            applyAllowed: false,
            purpose: "解释现有证据与下一步记录建议，不能确定整机调参质量或输出具体参数改值。",
        },
        definitions: {
            supportedFrequencyBandsHz: "可用于有限诊断的有数据支持频段，不是控制带宽，也不是性能合格范围。",
            trackingGainDb: "gyro/指令的被动传递函数幅度估计；0 dB 约为幅度一致，正值表示更大，不等于已检测到回弹。",
            gyroRms: "记录的 gyro 信号幅度，包含动作响应，不能全部称为噪声。",
            welchWindows: "有重叠的统计窗口，不是独立飞行次数、评分或精度保证。",
        },
        logQuality: {
            evidenceId: "log-quality",
            timingStatus: timing.status || "unknown",
            sampleCount: number(result.sampleCount),
            durationSeconds: number(result.durationSeconds),
            sampleRateMeasuredHz: number(timing.sampleRateMeasuredHz),
            sampleRateHeaderHz: number(timing.sampleRateHeaderHz),
            headerMismatchPct: number(timing.mismatchPct),
            timestampJitterMadPct: number(timing.jitterPct),
            gapCount: number(timing.temporalGapCount ?? timing.gaps),
            boundaryCount: number(timing.gaps),
            explicitOnlyBoundaryCount: number(timing.explicitOnlyBoundaryCount),
            invalidIntervalCount: number(timing.invalidIntervals),
            corruptRegionCount: number(result.corruptRegions),
            continuousSpanCount: spans.length,
            continuousSamples: usedSamples,
            parsedSampleContinuousCoveragePct:
                result.sampleCount > 0 ? number((100 * usedSamples) / result.sampleCount) : null,
            estimatedTimelineCoveragePct: number(timing.estimatedTimelineCoveragePct),
            estimatedMissingSamples: number(timing.estimatedMissingSamples),
            coverageMeaning: "parsed_sample_coverage_and_timestamp_based_estimate_not_capture_completeness",
            boundaryRecords: timing.boundaryRecords ?? [],
            omittedBoundaryRecords: timing.omittedBoundaryRecords ?? 0,
            reasonCodes: reasons(timing.reasonCodes),
        },
        axes,
        flightConfiguration: flightConfiguration(result.configAtFlight?.rawHeaders),
        spectralSupportCriteria: {
            minimumWelchWindows: 6,
            minimumIndependentBlocks: 3,
            minimumCommandRmsDegPerSecond: 0.5,
            minimumCoherence: 0.6,
            calibration: "engineering_candidates_not_dataset_calibrated",
        },
        missingMeasurements: {
            evidenceId: "missing-measurements",
            items: [
                "step_response",
                "overshoot",
                "settling_time",
                "flight_state_and_throttle_groups",
                "motor_saturation",
                "rpm_noise",
                "verified_antialiasing",
                "motor_temperature",
                "complete_configuration_snapshot",
            ],
            consequence: "不能确定是否跟手、是否回弹、滤波安全、温度或 PID 应改多少。",
        },
        reasons: [...new Set([...allReasons, ...reasons(timing.reasonCodes)])].map((code) => ({
            code,
            meaning: MEANINGS[code] || "该项诊断能力受限，不能作为参数调整依据。",
        })),
    };
    if (result.motion) {
        packet.motion = motionEvidence(result);
        packet.definitions.observedResponse =
            "实际有限速度输入动作的观测响应，以指令目标归一化，不将gyro尾部强制缩放为1。";
        packet.definitions.censoring =
            "right_censored表示观察窗内未确认稳定，不是0ms，也不能将窗长直接当真实稳定时间。";
        packet.definitions.selection =
            "输入资格与输出表现分离，差响应仍保留；跨轴/油门/未知状态标为混杂，不代表原因已消除。";
        packet.definitions.errorP95 = "时间加权2048桶近似分位数，误差分辨率单独给出，未做最佳时移。";
        packet.missingMeasurements.items = [
            "verified_flight_state",
            "rpm_noise",
            "verified_antialiasing",
            "motor_temperature",
            "complete_configuration_snapshot",
            "pid_parameter_causality",
        ];
        if (!result.capabilities.throttleGroups) packet.missingMeasurements.items.push("throttle_groups");
        if (!result.capabilities.outputBounds) packet.missingMeasurements.items.push("motor_output_bounds");
        if (!packet.axes.some((axis) => axis.observedActions?.eligibleCount > 0))
            packet.missingMeasurements.items.push("qualified_observed_step_response");
        packet.missingMeasurements.consequence =
            "可解释已测量的记录片段；不能判定未覆盖工况、物理原因、滤波安全、温度或具体PID改值。";
        packet.motion.axesMissingStep = packet.axes
            .filter((axis) => !axis.observedActions?.eligibleCount)
            .map((axis) => axis.axis);
        for (const axis of packet.axes) {
            const peak = axis.tracking.peak;
            axis.tracking.maxObservedGain = peak
                ? {
                    ...peak,
                    atSupportedBandEdge: axis.supportedFrequencyBandsHz.some(
                        ([low, high]) =>
                            Math.abs(peak.frequencyHz - low) < 1e-4 || Math.abs(peak.frequencyHz - high) < 1e-4,
                    ),
                    excitationQualified: true,
                    meaning: "maximum_within_supported_points_not_confirmed_resonance",
                }
                : null;
            delete axis.tracking.peak;
        }
        packet.definitions.stepEligibility =
            "rejectedCount是仅阶跃输入不合格数，拒绝原因在reasonCounts；confoundCounts是混杂标签，不代表所有诊断不可用。未知飞行状态/油门变化不直接取消阶跃输入资格。trackingEligibleCount单独表示可作跟踪观测的数量。";
        packet.definitions.diagnostics =
            "阶跃资格、跟踪资格和控制项可用性独立；多轴和斜坡动作仍可观测，不能直接归因单个PID参数。";
        packet.definitions.lagEstimate =
            "局部0至100ms、5ms网格相关搜索；有限估计，边界或歧义时localLagCandidateMs=null，不是固定延迟，不用于消除原始误差。";
        packet.definitions.throttleCoverage =
            "完整油门箱按左端间隔归属。stable是范围不超过5个百分点且至少250ms的工程子集，不证明油门静止或工况平稳。classificationSeconds.changing_throttle仅统计跨箱或单间隔跳变超过5个百分点的时间，不是所有油门变化时长；与事件CHANGING_THROTTLE标签不能互换。";
        packet.definitions.controlTerms =
            "PID记录输出单位；均值/RMS/峰值与FF-指令变化率相关仅说明活动或关联，不确定参数因果。";
        // Retain every group summary. Trim only optional details fairly, or fail explicitly.
        packet.motion.selection.originalRepresentativeFrequencyPoints = packet.axes.reduce(
            (count, axis) => count + axis.tracking.points.length,
            0,
        );
        packet.motion.selection.sentRepresentativeFrequencyPoints =
            packet.motion.selection.originalRepresentativeFrequencyPoints;
        const byteLength = () => {
            packet.motion.selection.sentRepresentativeCount = packet.motion.representatives.length;
            return new TextEncoder().encode(JSON.stringify(versionedPacket(packet))).length;
        };
        if (byteLength() > MAX_EVIDENCE_BYTES)
            for (const axis of packet.axes)
                axis.tracking.points = axis.tracking.points.filter(
                    (_, i, list) => i % 3 === 0 || i === list.length - 1,
                );
        packet.motion.selection.sentRepresentativeFrequencyPoints = packet.axes.reduce(
            (count, axis) => count + axis.tracking.points.length,
            0,
        );
        while (byteLength() > MAX_EVIDENCE_BYTES && packet.motion.estimates.length) {
            packet.motion.estimates.pop();
            packet.motion.selection.omittedEstimates++;
        }
        while (byteLength() > MAX_EVIDENCE_BYTES) {
            const byAxis = AXES.map((axis) => packet.motion.representatives.filter((item) => item.axis === axis));
            const largest = byAxis.reduce((a, b) => (a.length >= b.length ? a : b));
            if (largest.length <= 1) break;
            const index = packet.motion.representatives.findIndex(
                (item) => item.evidenceId === largest.at(-1).evidenceId,
            );
            packet.motion.representatives.splice(index, 1);
            packet.motion.selection.omittedRepresentatives++;
            packet.motion.selection.omittedRepresentativeCategories ??= {};
            for (const category of largest.at(-1).selection.categories) {
                const key = `${largest.at(-1).axis}:${category}`;
                packet.motion.selection.omittedRepresentativeCategories[key] =
                    (packet.motion.selection.omittedRepresentativeCategories[key] ?? 0) + 1;
            }
        }
    }
    if (packet.motion) {
        packet.motion.selection.sentRepresentativeCount = packet.motion.representatives.length;
        packet.motion.selection.omittedPhaseMotorDetails = packet.motion.representatives.reduce(
            (sum, event) => sum + event.phases.filter((p) => p.status === "measured" && !p.output?.perMotor).length,
            0,
        );
    }
    if (new TextEncoder().encode(JSON.stringify(versionedPacket(packet))).length > MAX_EVIDENCE_BYTES)
        throw new Error("AI_EVIDENCE_LIMIT");
    return versionedPacket(packet);
}

function versionedPacket(packet) {
    if (packet.schemaVersion !== EVIDENCE_VERSION) return packet;
    const { trackingGroups, actionGroups, representatives, estimates, motorConstraints, ...motion } = packet.motion;
    const measuredAxes = packet.axes.filter((axis) => Number.isFinite(axis.observedTracking?.rmsDegPerSecond));
    const largestError = measuredAxes.reduce(
        (best, axis) =>
            !best || axis.observedTracking.rmsDegPerSecond > best.observedTracking.rmsDegPerSecond ? axis : best,
        null,
    );
    return {
        schemaVersion: packet.schemaVersion,
        algorithmVersion: packet.algorithmVersion,
        source: packet.source,
        scope: packet.scope,
        summary: {
            observationHighlights: {
                largestRecordedTrackingRmsAxis: largestError?.axis ?? null,
                comparisonEvidenceIds: measuredAxes.map((axis) => axis.evidenceId),
                comparisonMetricRefs: measuredAxes.map((axis) => `${axis.evidenceId}.observedTracking.rmsDegPerSecond`),
                meaning: "仅比较本日志全段未时移RMS，不表示控制性能排名或PID优劣。",
            },
            logQuality: packet.logQuality,
            axisAssessments: packet.axes,
            flightConfiguration: packet.flightConfiguration,
            evidenceLimitations: packet.missingMeasurements,
            reasons: packet.reasons,
            motion,
            stepResponse: {
                status: packet.axes.some((a) => a.observedActions.eligibleCount) ? "available" : "unavailable",
                axesMissingStep: motion.axesMissingStep,
            },
        },
        evidence: { trackingGroups, actionGroups, motorConstraints, representatives, estimates },
        analysisPolicy: {
            definitions: packet.definitions,
            spectralSupportCriteria: packet.spectralSupportCriteria,
            prohibitedInferences: [
                "physical_thrust_saturation",
                "actual_arming_from_arm_switch",
                "airborne_from_motor_or_rx",
                "pid_or_filter_parameter_changes",
                "fixed_system_delay_from_local_lag",
            ],
            trackingComparison: {
                minimumDurationMs: 250,
                minimumIntervals: 20,
                minimumCommandRangeDegPerSecond: 30,
                minimumCenteredCommandRmsDegPerSecond: 5,
                calibration: "engineering_candidates_not_dataset_calibrated",
            },
            explanationCategories: [
                "lower_command_constraint",
                "upper_command_constraint",
                "multi_axis_input",
                "changing_throttle",
                "command_phase_association",
            ],
        },
    };
}
