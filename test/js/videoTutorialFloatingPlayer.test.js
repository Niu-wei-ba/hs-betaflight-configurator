import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";
import VideoTutorialFloatingPlayer from "../../src/components/VideoTutorialFloatingPlayer.vue";
import {
    closeFloatingVideoTutorial,
    getFloatingVideoTutorialEmbedUrl,
    hasFloatingVideoTutorial,
    openFloatingVideoTutorial,
    setFloatingVideoTutorialPosition,
    videoTutorialFloatingPlayer,
} from "../../src/js/video_tutorial_floating_player";

const mountedApps = [];

const sampleDouyinVideo = {
    id: "sample-douyin-video",
    platform: "douyin",
    title: "抖音竖屏教程",
    sourceUrl: "https://www.douyin.com/video/7651575605116976817",
    embedUrl: "https://open.douyin.com/player/video?vid=7651575605116976817&autoplay=0",
};

const sampleVideo = {
    id: "sample-bilibili-video",
    title: "Betaflight 视频教程",
    sourceUrl: "https://www.bilibili.com/video/BV1Hg411e7dR/",
    embedUrl:
        "https://player.bilibili.com/player.html?isOutside=true&aid=515995638&bvid=BV1Hg411e7dR&cid=844729630&p=1&autoplay=0",
};

function setViewport(width, height) {
    Object.defineProperties(window, {
        innerWidth: { configurable: true, value: width },
        innerHeight: { configurable: true, value: height },
    });
}

async function renderFloatingPlayer() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp(VideoTutorialFloatingPlayer);
    app.mount(container);
    await nextTick();
    await nextTick();

    mountedApps.push(app);
    return app;
}

describe("video tutorial floating player", () => {
    afterEach(async () => {
        mountedApps.splice(0).forEach((app) => app.unmount());
        closeFloatingVideoTutorial();
        await nextTick();
        await nextTick();
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    it("opens without mutating the card URL, keeps autoplay disabled, and clamps its drag position", () => {
        setViewport(1024, 768);

        expect(openFloatingVideoTutorial(sampleVideo)).toBe(true);
        expect(hasFloatingVideoTutorial()).toBe(true);
        expect(videoTutorialFloatingPlayer.video).toEqual(sampleVideo);
        expect(videoTutorialFloatingPlayer.x).toBeNull();
        expect(videoTutorialFloatingPlayer.y).toBeNull();
        expect(getFloatingVideoTutorialEmbedUrl(sampleVideo)).toContain("autoplay=0");
        expect(sampleVideo.embedUrl).toContain("autoplay=0");

        setFloatingVideoTutorialPosition(-100, -100, 440, 248);
        expect(videoTutorialFloatingPlayer.x).toBe(16);
        expect(videoTutorialFloatingPlayer.y).toBe(16);

        setFloatingVideoTutorialPosition(5000, 5000, 440, 248);
        expect(videoTutorialFloatingPlayer.x).toBe(568);
        expect(videoTutorialFloatingPlayer.y).toBe(504);
    });

    it("positions the player before loading the iframe, supports dragging, and removes the iframe when closed", async () => {
        setViewport(1024, 768);
        openFloatingVideoTutorial(sampleVideo);

        const app = await renderFloatingPlayer();
        const player = document.body.querySelector(".video-tutorial-floating-player");
        const iframe = player.querySelector("iframe");
        expect(player).not.toBeNull();
        expect(iframe.getAttribute("src")).toContain("autoplay=0");
        expect(iframe.getAttribute("allow")).not.toContain("autoplay");
        expect(player.parentElement).toBe(document.body);
        expect(player.style.left).toBe("152px");
        expect(player.style.top).toBe("140.5px");
        expect(player.style.transform).toBe("");
        expect(player.style.visibility).toBe("");

        vi.spyOn(player, "getBoundingClientRect").mockReturnValue({ left: 152, top: 140.5, width: 440, height: 248 });
        const dragHandle = player.querySelector(".video-tutorial-floating-player__header");
        dragHandle.dispatchEvent(
            new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 168, clientY: 156 }),
        );
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 300, clientY: 220 }));
        window.dispatchEvent(new MouseEvent("pointerup"));
        await nextTick();

        expect(player.style.left).toBe("284px");
        expect(player.style.top).toBe("204.5px");

        const closeButton = player.querySelector(".video-tutorial-floating-player__header button");
        closeButton.dispatchEvent(
            new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 600, clientY: 520 }),
        );
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 800, clientY: 600 }));
        window.dispatchEvent(new MouseEvent("pointerup"));
        await nextTick();

        expect(player.style.left).toBe("284px");
        expect(player.style.top).toBe("204.5px");

        closeButton.click();
        await nextTick();
        expect(document.body.querySelector(".video-tutorial-floating-player")).toBeNull();

        app.unmount();
    });

    it("resets the saved floating size when switching to a different video", () => {
        setFloatingVideoTutorialPosition(16, 16, 440, 248);
        openFloatingVideoTutorial(sampleVideo);
        videoTutorialFloatingPlayer.width = 720;

        openFloatingVideoTutorial(sampleDouyinVideo);

        expect(videoTutorialFloatingPlayer.width).toBeNull();
    });

    it("uses the official 9:16 portrait layout and referrer policy for Douyin videos", async () => {
        setViewport(1024, 768);
        openFloatingVideoTutorial(sampleDouyinVideo);

        const app = await renderFloatingPlayer();
        const player = document.body.querySelector(".video-tutorial-floating-player");
        const iframe = player.querySelector("iframe");

        expect(player.classList).toContain("video-tutorial-floating-player--portrait");
        expect(player.style.width).toBe("360px");
        expect(player.style.left).toBe("332px");
        expect(player.style.top).toBe("23px");
        const playerUrl = new URL(iframe.getAttribute("src"));
        expect(playerUrl.searchParams.get("mode")).toBe("mobile");
        expect(playerUrl.searchParams.get("width")).toBe("100%");
        expect(playerUrl.searchParams.get("height")).toBe("100%");
        expect(iframe.getAttribute("referrerpolicy")).toBe("unsafe-url");

        app.unmount();
    });

    it("supports proportional manual resizing and keeps the player inside the viewport", async () => {
        setViewport(1024, 768);
        openFloatingVideoTutorial(sampleVideo);

        const app = await renderFloatingPlayer();
        const player = document.body.querySelector(".video-tutorial-floating-player");
        const resizeHandle = player.querySelector(".video-tutorial-floating-player__resize-handle");
        vi.spyOn(player, "getBoundingClientRect").mockReturnValue({ left: 152, top: 140.5, width: 440, height: 248 });

        resizeHandle.dispatchEvent(
            new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 592, clientY: 388 }),
        );
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 712, clientY: 388 }));
        window.dispatchEvent(new MouseEvent("pointerup"));
        await nextTick();

        expect(videoTutorialFloatingPlayer.width).toBe(560);
        expect(player.style.width).toBe("560px");

        resizeHandle.dispatchEvent(
            new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 712, clientY: 388 }),
        );
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 2000, clientY: 2000 }));
        window.dispatchEvent(new MouseEvent("pointerup"));
        await nextTick();

        expect(videoTutorialFloatingPlayer.width).toBe(856);
        expect(player.style.width).toBe("856px");

        resizeHandle.dispatchEvent(
            new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 2000, clientY: 2000 }),
        );
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 0, clientY: 0 }));
        window.dispatchEvent(new MouseEvent("pointerup"));
        await nextTick();

        expect(videoTutorialFloatingPlayer.width).toBe(320);

        closeFloatingVideoTutorial();
        await nextTick();
        expect(videoTutorialFloatingPlayer.width).toBeNull();

        app.unmount();
    });

    it("retries the embedded player without enabling autoplay", async () => {
        setViewport(1024, 768);
        openFloatingVideoTutorial(sampleVideo);

        const app = await renderFloatingPlayer();
        const player = document.body.querySelector(".video-tutorial-floating-player");
        const initialIframe = player.querySelector("iframe");
        const reloadButton = player.querySelector(".video-tutorial-floating-player__footer button");

        reloadButton.click();
        await nextTick();
        await nextTick();
        await nextTick();

        const retriedIframe = player.querySelector("iframe");
        expect(retriedIframe).not.toBe(initialIframe);
        expect(retriedIframe.getAttribute("src")).toContain("autoplay=0");

        app.unmount();
    });
});
