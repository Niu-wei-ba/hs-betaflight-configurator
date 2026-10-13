// SPDX-License-Identifier: GPL-3.0-or-later
/** Blackbox S flightModeFlags is the low 32 bits of rcModeActivationMask, not runtime flightModeFlags. */
export function flightContext(log, event) {
    const fields = event.recordedState;
    const supported = /^Betaflight 2026\.6\.2\b/.test(log.firmware ?? "") && /\(e0b7bb01b\)/.test(log.firmware ?? "");
    const present = event.stateFieldsPresent === true;
    const raw = fields?.flightModeFlags;
    const decode = supported && present && Number.isInteger(raw) && raw >= 0 && raw <= 0xffffffff;
    // Decode only the explicitly verified ARM bit. Other mode bits remain uninterpreted.
    return {
        stateFieldsPresent: present,
        recordedFlags: fields,
        modeMaskStatus: decode ? "partially_decoded" : "unavailable",
        armSwitchActive: decode ? ((raw >>> 0) & 1) !== 0 : null,
        unknownModeBits: decode ? (raw >>> 0) - ((raw >>> 0) & 1) : null,
        adapterVersion: "blackbox-rc-mask-e0b7bb01b-1.0",
        source: "logged_rc_mode_activation_mask_low_32_bits",
        armedState: "unknown",
        airborneState: "unknown",
        meaning: "arm_switch_activation_not_actual_arming_or_airborne_evidence",
    };
}
