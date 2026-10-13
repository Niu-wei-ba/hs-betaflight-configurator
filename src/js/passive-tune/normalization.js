// SPDX-License-Identifier: GPL-3.0-or-later
/** Each source capability is independent of the angular-unit adapter. */
export function normalizeLog(log) {
    const header = log.headers;
    const verified = /^Betaflight\s+(?:4\.5\.\d+|2025\.12\.\d+)(?:[\s(-]|$)/.test(log.firmware ?? "");
    const features = /^-?\d+$/.test(header.features ?? "") ? Number(header.features) : null;
    const featureKnown = Number.isInteger(features) && features >= -2147483648 && features <= 4294967295;
    const non3d = verified && featureKnown && !((features >>> 0) & 4096);
    const channel = log.channels["setpoint[3]"];
    const throttle = non3d && channel ? Float32Array.from(channel, (value) => value / 10) : null;
    const limits = /^\d+(?:\.\d+)?,\d+(?:\.\d+)?$/.test(header.motorOutput ?? "")
        ? header.motorOutput.split(",").map(Number)
        : null;
    const motorBounds =
        non3d && limits && limits[0] >= 0 && limits[1] > limits[0] && limits[1] <= 65535
            ? {
                low: limits[0],
                high: limits[1],
                source: "motorOutput_header",
                tolerance: (limits[1] - limits[0]) * 0.02,
            }
            : null;
    return {
        ...log,
        throttle,
        motorBounds,
        capabilities: {
            angularUnits: log.scaleKnown,
            throttleGroups: !!throttle,
            outputBounds: !!motorBounds,
            throttleSource: throttle ? "mixerThrottle" : null,
            throttleReason: throttle ? null : !channel ? "MISSING_THROTTLE_CHANNEL" : "UNSUPPORTED_THROTTLE_SOURCE",
            stateSource: log.states?.some((state) => state.valid) ? "logged_slow_frame_flags" : "unknown",
            armedState: "unknown",
            configuration: "partial",
            apply: false,
        },
    };
}
