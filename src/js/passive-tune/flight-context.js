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

/** Verified DISARM transition proves state at that event only, not an entire preceding flight. */
export function armingEvidence(log) {
    const supported = /^Betaflight 2026\.6\.2\b/.test(log.firmware ?? "") && /\(e0b7bb01b\)/.test(log.firmware ?? "");
    const time = log.channels.time, origin = time[0];
    const events = supported ? (log.events ?? []).filter(e => e.type === 15) : [];
    return {
        adapterVersion: "blackbox-disarm-e0b7bb01b-1.0",
        status: events.length ? "recorded_disarm_transition" : "unavailable",
        eventCount: events.length,
        omittedEvents: Math.max(0, events.length - 16),
        disarmEvents: events.slice(0, 16).map(e => ({
            sampleIndex: e.sampleIndex,
            afterPreviousFrameSeconds: Number.isFinite(e.timeBeforeUs) ? (e.timeBeforeUs - origin) / 1e6 : null,
            beforeNextFrameSeconds: e.sampleIndex < time.length ? (time[e.sampleIndex] - origin) / 1e6 : null,
            reason: Number.isInteger(e.payload?.reason) ? e.payload.reason : null,
            stateImmediatelyBefore: "armed", stateAtTransition: "disarmed",
        })),
        armedIntervals: "unknown", airborneState: "unknown",
        meaning: "event_only_no_independent_timestamp_no_backfill_across_gaps_or_rearming",
    };
}
