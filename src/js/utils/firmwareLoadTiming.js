export const REMOTE_LOAD_TIMING_STEPS = Object.freeze({
    REQUEST_BUILD: "request_build",
    CLOUD_WAIT: "cloud_wait",
    DOWNLOAD_FIRMWARE: "download_firmware",
    PARSE_FIRMWARE: "parse_firmware",
});

function getOrCreateStep(loadTiming, key, label = key) {
    let step = loadTiming.steps.find((entry) => entry.key === key);

    if (!step) {
        step = {
            key,
            label,
            status: "pending",
            startedAt: null,
            finishedAt: null,
            durationMs: null,
        };
        loadTiming.steps.push(step);
    } else if (label && step.label !== label) {
        step.label = label;
    }

    return step;
}

function closeOpenPhase(step, now) {
    if (!Array.isArray(step.phases) || step.phases.length === 0) {
        return;
    }

    const currentPhase = step.phases[step.phases.length - 1];
    if (currentPhase.finishedAt == null) {
        currentPhase.finishedAt = now;
        currentPhase.durationMs = Math.max(0, now - currentPhase.startedAt);
    }
}

export function createLoadTiming(now = Date.now()) {
    return {
        status: "running",
        startedAt: now,
        finishedAt: null,
        totalMs: null,
        steps: [],
    };
}

export function startLoadTimingStep(loadTiming, key, label, now = Date.now()) {
    const step = getOrCreateStep(loadTiming, key, label);

    step.status = "running";
    step.startedAt = now;
    step.finishedAt = null;
    step.durationMs = null;

    return step;
}

export function setLoadTimingPhase(loadTiming, key, phase, now = Date.now()) {
    const step = getOrCreateStep(loadTiming, key);
    if (!Array.isArray(step.phases)) {
        step.phases = [];
    }

    const currentPhase = step.phases[step.phases.length - 1];
    if (currentPhase?.phase === phase && currentPhase.finishedAt == null) {
        return step;
    }

    closeOpenPhase(step, now);
    step.phases.push({
        phase,
        startedAt: now,
        finishedAt: null,
        durationMs: null,
    });

    return step;
}

export function completeLoadTimingStep(loadTiming, key, status = "success", now = Date.now()) {
    const step = getOrCreateStep(loadTiming, key);

    if (step.startedAt == null) {
        step.startedAt = now;
    }

    step.status = status;
    step.finishedAt = now;
    step.durationMs = Math.max(0, now - step.startedAt);
    closeOpenPhase(step, now);

    return step;
}

export function failLoadTimingStep(loadTiming, key, now = Date.now()) {
    return completeLoadTimingStep(loadTiming, key, "failed", now);
}

export function cancelLoadTimingStep(loadTiming, key, now = Date.now()) {
    return completeLoadTimingStep(loadTiming, key, "cancelled", now);
}

export function finishLoadTiming(loadTiming, status, now = Date.now()) {
    loadTiming.status = status;
    loadTiming.finishedAt = now;
    loadTiming.totalMs = Math.max(0, now - loadTiming.startedAt);

    loadTiming.steps.forEach((step) => closeOpenPhase(step, now));

    return loadTiming;
}

export function formatLoadTimingDuration(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
        return "--";
    }

    if (durationMs < 1000) {
        return `${Math.round(durationMs)} ms`;
    }

    if (durationMs < 10000) {
        return `${(durationMs / 1000).toFixed(2)} s`;
    }

    return `${(durationMs / 1000).toFixed(1)} s`;
}
