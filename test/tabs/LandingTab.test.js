import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";

const contentReady = vi.fn();
const changeLanguage = vi.fn();

vi.mock("../../src/js/gui", () => ({
    default: {
        active_tab: null,
        content_ready: contentReady,
    },
}));

vi.mock("../../src/js/localization", () => ({
    i18n: {
        getLanguagesAvailables: () => ["en", "zh_CN"],
        selectedLanguage: "DEFAULT",
        changeLanguage,
    },
}));

vi.mock("../../src/js/AppConfig", () => ({
    appConfig: {
        appName: "HS-FPV | Betaflight镜像站",
    },
}));

describe("LandingTab", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        contentReady.mockClear();
        changeLanguage.mockClear();
    });

    it("renders the welcome page layout from the latest UI comp", async () => {
        const { default: LandingTab } = await import("../../src/components/tabs/LandingTab.vue");
        const container = document.createElement("div");
        document.body.appendChild(container);

        const app = createApp(LandingTab);
        app.config.globalProperties.$t = (key) => key;
        app.mount(container);
        await nextTick();

        const hero = container.querySelector(".landing-hero");
        const heroCopy = container.querySelector(".hero-copy");
        const heroSidebar = container.querySelector(".hero-sidebar");
        const heroHighlights = container.querySelectorAll(".hero-highlight-item");
        const carouselSlides = container.querySelectorAll(".hero-carousel-slide");
        const sideQr = container.querySelector(".landing-side-qr");
        const qrPanel = container.querySelector(".community-qr-panel");
        const sideQrImage = container.querySelector(".landing-side-qr .welcome-qr-image");
        const actionCards = container.querySelectorAll(".hero-actions .entry-card");
        const mirrorEntry = container.querySelector('.hero-actions .entry-card[href="https://hs-fpv.com/"]');
        const mirrorEntryImage = container.querySelector(".hero-actions .entry-card-image");
        const whySection = container.querySelector(".why-section");

        expect(hero).not.toBeNull();
        expect(heroCopy).not.toBeNull();
        expect(heroSidebar).not.toBeNull();
        expect(hero.firstElementChild).toBe(heroCopy);
        expect(heroHighlights).toHaveLength(4);
        expect(carouselSlides).toHaveLength(5);
        expect(container.textContent).toContain("专为穿越机玩家打造的交流社区");
        expect(container.textContent).toContain("飞手配置海报");
        expect(container.textContent).toContain("QQ 交流群");
        expect(sideQr).not.toBeNull();
        expect(sideQrImage).not.toBeNull();
        expect(qrPanel).toBeNull();
        expect(container.textContent).not.toContain("活跃中");
        expect(container.textContent).not.toContain("2000+ 飞友持续交流");
        expect(actionCards).toHaveLength(1);
        expect(mirrorEntry).not.toBeNull();
        expect(mirrorEntryImage).not.toBeNull();
        expect(mirrorEntryImage.getAttribute("alt")).toContain("进入花生FPV社区");
        expect(whySection).toBeNull();
        expect(contentReady).toHaveBeenCalledOnce();

        app.unmount();
    });
});
