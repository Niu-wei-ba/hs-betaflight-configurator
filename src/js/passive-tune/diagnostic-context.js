// SPDX-License-Identifier: GPL-3.0-or-later
// Context selection never uses the magnitude or quality of the measured gyro response.
const blockers = new Set([
    "MULTI_AXIS_INPUT",
    "CHANGING_THROTTLE",
    "LOWER_COMMAND_BOUND_PROXIMITY",
    "UPPER_COMMAND_BOUND_PROXIMITY",
    "FAILSAFE_CONTEXT",
    "RX_SIGNAL_INVALID",
    "THROTTLE_CONTEXT_UNKNOWN",
    "CROSS_AXIS_CONTEXT_UNKNOWN",
    "STATE_CONTEXT_UNKNOWN",
]);
export function comparisonBlockers(event, phase = null) {
    const output = phase?.output ?? event.diagnostics?.output;
    return [
        ...new Set([
            ...(phase?.contextLimitations ?? event.diagnostics?.contextLimitations ?? []).filter((code) =>
                blockers.has(code),
            ),
            ...(output?.status !== "measured" || output.invalidSeconds > 0 ? ["OUTPUT_COVERAGE_INCOMPLETE"] : []),
        ]),
    ];
}
export function attributionLimits(event) {
    return {
        status: "not_supported",
        blockerCodes: [
            ...new Set([
                ...comparisonBlockers(event),
                ...(event.diagnostics.context.armedState === "unknown" ? ["ARMED_STATE_UNOBSERVED"] : []),
                ...(event.diagnostics.context.airborneState === "unknown" ? ["AIRBORNE_STATE_UNOBSERVED"] : []),
                "PARAMETER_CAUSALITY_NOT_ESTABLISHED",
            ]),
        ],
        parameterDecision: "not_determined",
    };
}
