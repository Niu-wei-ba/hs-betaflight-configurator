// SPDX-License-Identifier: GPL-3.0-or-later
/** Left-endpoint common valid time; engineering error threshold, descriptive association only. */
export function boundaryAssociation(log, axisIndex, spans, threshold = 30) {
    const { time } = log.channels;
    const command = log.channels[`setpoint[${axisIndex}]`],
        gyro = log.channels[`gyroADC[${axisIndex}]`];
    const motors = Object.keys(log.channels).filter((name) => /^motor\[\d+\]$/.test(name));
    const bounds = log.motorBounds;
    if (!bounds || !motors.length || !command || !gyro || !log.scaleKnown)
        return { status: "unavailable", reasonCode: "JOINT_SIGNALS_OR_BOUNDS_UNAVAILABLE" };
    let valid = 0,
        invalid = 0,
        near = 0,
        high = 0,
        joint = 0,
        nearSquare = 0,
        awaySquare = 0;
    for (const { start, end } of spans)
        for (let i = start; i + 1 < end; i++) {
            const dt = (time[i + 1] - time[i]) / 1e6,
                error = gyro[i] - command[i];
            if (!(dt > 0)) continue;
            const values = motors.map((name) => log.channels[name][i]);
            if (
                !Number.isFinite(error) ||
                values.some((v) => !Number.isFinite(v) || v < bounds.low || v > bounds.high)
            ) {
                invalid += dt;
                continue;
            }
            const constrained = values.some(
                (v) => v <= bounds.low + bounds.tolerance || v >= bounds.high - bounds.tolerance,
            );
            const large = Math.abs(error) >= threshold;
            valid += dt;
            if (large) high += dt;
            if (constrained) {
                near += dt;
                nearSquare += error * error * dt;
                if (large) joint += dt;
            } else awaySquare += error * error * dt;
        }
    return {
        status: valid ? "measured" : "unavailable",
        durationSeconds: valid,
        invalidSeconds: invalid,
        highErrorThresholdDegPerSecond: threshold,
        highErrorSeconds: high,
        nearBoundSeconds: near,
        jointSeconds: joint,
        jointFractionOfValidTime: valid ? joint / valid : null,
        boundFractionGivenHighError: high ? joint / high : null,
        highErrorFractionGivenBound: near ? joint / near : null,
        errorRmsNearBoundDegPerSecond: near ? Math.sqrt(nearSquare / near) : null,
        errorRmsAwayFromBoundsDegPerSecond: valid > near ? Math.sqrt(awaySquare / (valid - near)) : null,
        definitionVersion: "boundary-association-1.0-left-endpoint-time",
        calibration: "engineering_threshold_not_dataset_calibrated",
        meaning: "cooccurrence_not_physical_thrust_limit_or_pid_causality",
    };
}
