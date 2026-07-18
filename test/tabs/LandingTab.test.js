import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";

const contentReady = vi.fn();
const changeLanguage = vi.fn();
const openVideoTutorials = vi.fn();

vi.mock("../../src/js/gui", () => ({ default: { active_tab: null, content_ready: contentReady } }));
vi.mock("../../src/js/localization", () => ({
    i18n: { getLanguagesAvailables: () => ["en", "zh_CN"], selectedLanguage: "DEFAULT", changeLanguage },
}));
vi.mock("../../src/js/video_tutorials", () => ({ openVideoTutorials }));

describe("LandingTab", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        contentReady.mockClear();
        changeLanguage.mockClear();
        openVideoTutorials.mockClear();
    });

    it("renders the mirror portal body while preserving every resource entry", async () => {
        const { default: LandingTab } = await import("../../src/components/tabs/LandingTab.vue");
        const container = document.createElement("div");
        document.body.appendChild(container);

        const app = createApp(LandingTab);
        app.config.globalProperties.$t = (key) => key;
        app.mount(container);
        await nextTick();

        expect(container.querySelector("#landing-title")?.textContent).toContain("Betaflight");
        expect(container.querySelector(".resource-grid")).not.toBeNull();
        expect(container.querySelectorAll(".resource-card")).toHaveLength(3);
        expect(container.querySelector('.resource-card[href="https://wiki.hs-fpv.com"]')).not.toBeNull();
        expect(container.querySelector('.resource-card[href="https://hs-fpv.com/"]')).not.toBeNull();
        expect(container.querySelector('.resource-card[href="https://bbe.hs-fpv.com"]')).not.toBeNull();
        expect(container.querySelectorAll(".tutorial-card")).toHaveLength(4);
        expect(container.querySelector(".community-panel__qr img")).not.toBeNull();
        expect(container.querySelectorAll(".landing-sponsor img")).toHaveLength(1);
        expect(container.querySelector(".landing-sponsor img")?.getAttribute("alt")).toBe("BUCK");
        expect(container.querySelector(".language-switcher")).not.toBeNull();
        expect(contentReady).toHaveBeenCalledOnce();

        container.querySelector(".tutorial-card").click();
        expect(openVideoTutorials).toHaveBeenCalledOnce();

        app.unmount();
    });
});
