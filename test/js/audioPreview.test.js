import { describe, expect, it, vi } from "vitest";
import {
    ensureAudioContextRunning,
    previewGainForChannelCount,
    scheduleEscPreviewTone,
} from "../../src/js/esc_melody/audio_preview.js";

describe("ESC melody audio preview", () => {
    it("waits for a suspended AudioContext to become ready", async () => {
        const context = { state: "suspended", resume: vi.fn() };
        context.resume.mockImplementation(async () => {
            context.state = "running";
        });

        await expect(ensureAudioContextRunning(context)).resolves.toBe(context);
        expect(context.resume).toHaveBeenCalledOnce();
    });

    it("rejects blocked and closed audio output", async () => {
        await expect(ensureAudioContextRunning({ state: "closed" })).rejects.toThrow("音频输出不可用");
        await expect(
            ensureAudioContextRunning({ state: "suspended", resume: vi.fn().mockResolvedValue(undefined) }),
        ).rejects.toThrow("页面声音权限");
    });

    it("schedules an audible short tone and reduces gain for simultaneous channels", () => {
        const oscillator = {
            connect: vi.fn(),
            frequency: { value: 0 },
            start: vi.fn(),
            stop: vi.fn(),
            type: "",
        };
        const gainNode = {
            connect: vi.fn(),
            gain: {
                exponentialRampToValueAtTime: vi.fn(),
                setValueAtTime: vi.fn(),
            },
        };
        const context = {
            currentTime: 2,
            destination: {},
            createOscillator: vi.fn(() => oscillator),
            createGain: vi.fn(() => gainNode),
        };

        const tone = scheduleEscPreviewTone(context, { midi: 69, start: 1, duration: 0.005 });

        expect(tone.start).toBe(2);
        expect(tone.end).toBeCloseTo(2.012);
        expect(oscillator.type).toBe("triangle");
        expect(oscillator.frequency.value).toBe(440);
        expect(gainNode.connect).toHaveBeenCalledWith(context.destination);
        expect(previewGainForChannelCount(4)).toBeCloseTo(0.06);
    });
});
