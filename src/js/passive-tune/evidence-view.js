// SPDX-License-Identifier: GPL-3.0-or-later
/** Internal access adapter only: the transmitted/downloaded 1.2 packet has no duplicated legacy roots. */
export function evidenceView(packet) {
    if (packet.schemaVersion !== "passive-ai-evidence-1.2") return packet;
    return {
        ...packet,
        axes: packet.summary.axisAssessments,
        logQuality: packet.summary.logQuality,
        flightConfiguration: packet.summary.flightConfiguration,
        missingMeasurements: packet.summary.evidenceLimitations,
        motion: { ...packet.summary.motion, ...packet.evidence },
        definitions: packet.analysisPolicy.definitions,
        spectralSupportCriteria: packet.analysisPolicy.spectralSupportCriteria,
        reasons: packet.summary.reasons,
    };
}
