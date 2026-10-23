import { createApp, h, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import QqGroupNumber from "../../src/components/elements/QqGroupNumber.vue";

afterEach(() => vi.unstubAllGlobals());

async function checkCopy(writeText: ((value: string) => Promise<void>) | undefined) {
    vi.stubGlobal("navigator", { clipboard: writeText ? { writeText } : undefined });
    const container = document.createElement("div");
    const app = createApp({ render: () => h(QqGroupNumber) });
    app.mount(container);
    const button = container.querySelector("button")!;
    button.click();
    await Promise.resolve();
    await nextTick();
    return { app, container, button };
}

describe("QQ group contact", () => {
    it("copies only the complete group number and announces success", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        const { app, container, button } = await checkCopy(writeText);
        try {
            expect(container.textContent).toContain("942085532");
            expect(writeText).toHaveBeenCalledExactlyOnceWith("942085532");
            expect(button.textContent).toContain("已复制");
            expect(container.querySelector('[role="status"]')!.textContent).toBe("群号已复制。");
            button.click();
            await Promise.resolve();
            await nextTick();
            expect(writeText).toHaveBeenCalledTimes(2);
        } finally {
            app.unmount();
        }
    });

    it("does not claim success when clipboard permission is rejected", async () => {
        const { app, container, button } = await checkCopy(vi.fn().mockRejectedValue(new Error("denied")));
        try {
            expect(button.textContent).toContain("复制群号");
            expect(container.querySelector('[role="status"]')!.textContent).toContain("复制失败");
            expect(container.textContent).toContain("942085532");
        } finally {
            app.unmount();
        }
    });

    it("keeps the number available for manual copying when the clipboard API is unavailable", async () => {
        const { app, container } = await checkCopy(undefined);
        try {
            expect(container.querySelector('[role="status"]')!.textContent).toContain("请手动复制");
            expect(container.querySelector("strong")!.textContent).toBe("942085532");
        } finally {
            app.unmount();
        }
    });
});
