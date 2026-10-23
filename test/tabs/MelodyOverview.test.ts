import { createApp, h, nextTick, reactive } from "vue";
import { describe, expect, it } from "vitest";
import MelodyOverview from "../../src/components/esc-melody/MelodyOverview.vue";

describe("MelodyOverview", () => {
    it("keeps startup wait and rests in the preview timeline and updates after an edit", async () => {
        const melody = reactive({
            notes: [
                { midi: 60, start: 0, duration: 1 },
                { midi: null, start: 1, duration: 2, rest: true },
                { midi: 72, start: 3, duration: 1 },
            ],
            bpm: 120,
            waitMs: 500,
        });
        const container = document.createElement("div");
        const app = createApp({ render: () => h(MelodyOverview, melody) });
        app.mount(container);
        try {
            expect(container.querySelector('[role="img"]').getAttribute("aria-label")).toBe("2 个音符，2.5 秒");
            const notes = container.querySelectorAll<HTMLElement>(".overview-note");
            expect(notes).toHaveLength(2);
            expect(notes[0].style.left).toBe("20%");
            expect(notes[0].style.width).toBe("20%");
            expect(notes[1].style.left).toBe("80%");
            melody.bpm = 60;
            await nextTick();
            expect(container.querySelector('[role="img"]').getAttribute("aria-label")).toBe("2 个音符，4.5 秒");
            expect(container.querySelectorAll(".overview-note")).toHaveLength(2);
        } finally {
            app.unmount();
        }
    });

    it("renders an empty draft and native high notes without invalid positions", async () => {
        const melody = reactive<{
            notes: { midi: number; start: number; duration: number }[];
            bpm: number;
            waitMs: number;
        }>({ notes: [], bpm: 120, waitMs: 0 });
        const container = document.createElement("div");
        const app = createApp({ render: () => h(MelodyOverview, melody) });
        app.mount(container);
        try {
            expect(container.querySelector(".overview-empty").textContent).toContain("暂无音符");
            melody.notes = [{ midi: 107, start: 0, duration: 0.125 }];
            await nextTick();
            expect(container.querySelector(".overview-empty")).toBeNull();
            const note = container.querySelector<HTMLElement>(".overview-note");
            expect(note.title).toContain("B7");
            expect(parseFloat(note.style.top)).toBeGreaterThanOrEqual(0);
            expect(parseFloat(note.style.top)).toBeLessThan(100);
            expect(note.style.cssText).not.toContain("NaN");
        } finally {
            app.unmount();
        }
    });
});
