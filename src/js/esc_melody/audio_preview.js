export const ESC_PREVIEW_GAIN = 0.12;

export async function ensureAudioContextRunning(context) {
    if (!context || context.state === "closed") {
        throw new Error("音频输出不可用，请重新打开试听。");
    }
    if (context.state !== "running" && typeof context.resume === "function") {
        await context.resume();
    }
    if (context.state && context.state !== "running") {
        throw new Error("浏览器未允许播放声音，请检查页面声音权限后重试。");
    }
    return context;
}

export function previewGainForChannelCount(channelCount) {
    return ESC_PREVIEW_GAIN / Math.sqrt(Math.max(1, Number(channelCount) || 1));
}

export function scheduleEscPreviewTone(context, { midi, start, duration, gain = ESC_PREVIEW_GAIN }) {
    const toneDuration = Math.max(0.012, Number(duration) || 0);
    const toneStart = Math.max(context.currentTime, Number(start) || context.currentTime);
    const toneEnd = toneStart + toneDuration;
    const attackDuration = Math.min(0.012, toneDuration * 0.35);
    const releaseDuration = Math.min(0.014, toneDuration * 0.3);
    const releaseStart = Math.max(toneStart + attackDuration, toneEnd - releaseDuration);
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.value = 440 * 2 ** ((Number(midi) - 69) / 12);
    gainNode.gain.setValueAtTime(0.0001, toneStart);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), toneStart + attackDuration);
    gainNode.gain.setValueAtTime(Math.max(0.0002, gain), releaseStart);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, toneEnd);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(toneStart);
    oscillator.stop(toneEnd + 0.02);

    return { oscillator, start: toneStart, end: toneEnd };
}
