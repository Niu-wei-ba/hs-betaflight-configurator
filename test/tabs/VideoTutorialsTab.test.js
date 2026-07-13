import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, nextTick } from "vue";
import { VIDEO_TUTORIAL_SEARCH_EVENT, getVideoTutorialCatalog } from "../../src/js/video_tutorials";
import {
    closeFloatingVideoTutorial,
    hasFloatingVideoTutorial,
    videoTutorialFloatingPlayer,
} from "../../src/js/video_tutorial_floating_player";

const contentReady = vi.fn();
const seededVideos = structuredClone(getVideoTutorialCatalog().videos);

vi.mock("../../src/js/gui", () => ({
    default: {
        active_tab: null,
        content_ready: contentReady,
    },
}));

describe("VideoTutorialsTab", () => {
    let catalog;

    beforeEach(() => {
        document.body.innerHTML = "";
        contentReady.mockClear();
        catalog = getVideoTutorialCatalog();
        catalog.videos.splice(0, catalog.videos.length, ...structuredClone(seededVideos));
    });

    afterEach(() => {
        closeFloatingVideoTutorial();
        catalog.videos.splice(0, catalog.videos.length, ...structuredClone(seededVideos));
    });

    it("renders every configured category with an empty state and supports search and category filters", async () => {
        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.appendChild(container);

        const app = createApp(VideoTutorialsTab);
        const vm = app.mount(container);
        await nextTick();

        expect(contentReady).toHaveBeenCalledOnce();
        expect(container.querySelectorAll(".video-tutorial-section")).toHaveLength(19);
        const populatedCategoryCount = new Set(catalog.videos.map((video) => video.categoryId)).size;
        expect(container.querySelectorAll(".video-tutorial-empty")).toHaveLength(
            catalog.categories.length - populatedCategoryCount,
        );
        expect(container.querySelectorAll(".video-tutorial-card")).toHaveLength(catalog.videos.length);
        expect(container.textContent).toContain("设置教程");
        expect(container.textContent).toContain("黑盒子教程");

        vm.searchQuery = "不存在的教程";
        await nextTick();

        expect(container.querySelector(".video-tutorials-no-results")).not.toBeNull();

        vm.searchQuery = "";
        await nextTick();

        const portsFilter = [...container.querySelectorAll(".video-tutorials-filter")].find(
            (button) => button.textContent.trim() === "端口",
        );
        portsFilter.click();
        await nextTick();

        expect(container.querySelectorAll(".video-tutorial-section")).toHaveLength(1);
        expect(container.querySelector(".video-tutorial-section-heading h2").textContent).toBe("端口教程");

        app.unmount();
    });

    it("applies global tutorial searches to the current page and clears the selected category", async () => {
        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.appendChild(container);
        const app = createApp(VideoTutorialsTab);
        const vm = app.mount(container);
        await nextTick();

        const sample = catalog.videos.find((video) => video.categoryId === "osd");
        vm.selectedCategoryId = "ports";
        const searchEvent = new CustomEvent(VIDEO_TUTORIAL_SEARCH_EVENT, {
            cancelable: true,
            detail: { query: sample.title },
        });
        document.dispatchEvent(searchEvent);
        await nextTick();

        expect(searchEvent.defaultPrevented).toBe(true);
        expect(vm.searchQuery).toBe(sample.title);
        expect(vm.selectedCategoryId).toBeNull();
        expect(container.querySelectorAll(".video-tutorial-card")).toHaveLength(1);
        expect(container.querySelector(".video-tutorial-card").textContent).toContain(sample.title);
        expect(container.querySelector(".video-tutorial-section-heading h2").textContent).toBe("OSD教程");

        app.unmount();
    });

    it("directly renders supported video players and preserves platform links as the fallback", async () => {
        catalog.videos.push(
            {
                id: "setup-bilibili",
                categoryId: "setup",
                platform: "bilibili",
                title: "B 站设置教程",
                description: "基础设置",
                tags: ["设置"],
                authorName: "测试飞手",
                authorAvatarUrl: "https://i0.hdslb.com/bfs/face/test-avatar.jpg",
                sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
                embedUrl:
                    "https://player.bilibili.com/player.html?isOutside=true&aid=123&bvid=BV1xx411c7mD&cid=456&p=1&autoplay=0",
            },
            {
                id: "ports-douyin",
                categoryId: "ports",
                platform: "douyin",
                title: "抖音端口教程",
                description: "端口设置",
                tags: ["端口"],
                sourceUrl: "https://www.douyin.com/video/123",
                embedUrl: "https://open.douyin.com/player/video?vid=123&autoplay=0",
            },
            {
                id: "setup-thumbnail-fallback",
                categoryId: "setup",
                platform: "bilibili",
                title: "封面降级教程",
                description: "封面加载失败时显示平台占位内容。",
                tags: ["封面"],
                sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
                thumbnailUrl: "https://i0.hdslb.com/bfs/archive/test-thumbnail.jpg",
            },
        );

        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.appendChild(container);

        const app = createApp(VideoTutorialsTab);
        app.mount(container);
        await nextTick();

        const bilibiliCard = [...container.querySelectorAll(".video-tutorial-card")].find((card) =>
            card.textContent.includes("B 站设置教程"),
        );
        const douyinCard = [...container.querySelectorAll(".video-tutorial-card")].find((card) =>
            card.textContent.includes("抖音端口教程"),
        );

        const iframe = bilibiliCard.querySelector("iframe");
        expect(iframe.getAttribute("src")).toBe(
            "https://player.bilibili.com/player.html?isOutside=true&aid=123&bvid=BV1xx411c7mD&cid=456&p=1&autoplay=0",
        );
        expect(iframe.getAttribute("src")).toContain("autoplay=0");
        expect(iframe.getAttribute("allow")).not.toContain("autoplay");
        expect(iframe.getAttribute("scrolling")).toBe("no");
        expect(iframe.getAttribute("frameborder")).toBe("no");
        expect(iframe.getAttribute("framespacing")).toBe("0");
        expect(bilibiliCard.querySelector(".video-tutorial-placeholder")).toBeNull();
        expect(bilibiliCard.querySelector(".video-tutorial-source").getAttribute("href")).toBe(
            "https://www.bilibili.com/video/BV1xx411c7mD",
        );
        expect(bilibiliCard.querySelector(".video-tutorial-author").textContent).toContain("测试飞手");
        expect(bilibiliCard.querySelector(".video-tutorial-author img").getAttribute("src")).toBe(
            "https://i0.hdslb.com/bfs/face/test-avatar.jpg",
        );
        expect(douyinCard.querySelector(".video-tutorial-author")).toBeNull();
        const douyinPlayer = douyinCard.querySelector(".video-tutorial-player");
        const douyinIframe = douyinCard.querySelector("iframe");
        expect(douyinPlayer.classList).toContain("video-tutorial-player--portrait");
        const douyinPlayerUrl = new URL(douyinIframe.getAttribute("src"));
        expect(douyinPlayerUrl.searchParams.get("vid")).toBe("123");
        expect(douyinPlayerUrl.searchParams.get("autoplay")).toBe("0");
        expect(douyinPlayerUrl.searchParams.get("mode")).toBe("mobile");
        expect(douyinPlayerUrl.searchParams.get("width")).toBe("100%");
        expect(douyinPlayerUrl.searchParams.get("height")).toBe("100%");
        expect(douyinIframe.getAttribute("referrerpolicy")).toBe("unsafe-url");
        expect(douyinCard.querySelector(".video-tutorial-placeholder")).toBeNull();

        const thumbnailCard = [...container.querySelectorAll(".video-tutorial-card")].find((card) =>
            card.textContent.includes("封面降级教程"),
        );
        const thumbnail = thumbnailCard.querySelector(".video-tutorial-media img");
        expect(thumbnail.getAttribute("referrerpolicy")).toBe("no-referrer");
        thumbnail.dispatchEvent(new Event("error"));
        await nextTick();
        expect(thumbnailCard.querySelector(".video-tutorial-media img")).toBeNull();
        expect(thumbnailCard.querySelector(".video-tutorial-placeholder")).not.toBeNull();

        iframe.dispatchEvent(new Event("error"));
        await nextTick();

        expect(bilibiliCard.querySelector(".video-tutorial-embed-fallback")).not.toBeNull();
        expect(bilibiliCard.querySelector(".video-tutorial-source")).not.toBeNull();

        bilibiliCard.querySelector(".video-tutorial-picture-in-picture").click();
        await nextTick();

        expect(videoTutorialFloatingPlayer.video.id).toBe("setup-bilibili");
        expect(bilibiliCard.querySelector("iframe")).toBeNull();
        expect(bilibiliCard.querySelector(".video-tutorial-picture-in-picture-status")).not.toBeNull();
        expect(bilibiliCard.querySelector(".video-tutorial-picture-in-picture").disabled).toBe(true);
        expect(douyinCard.querySelector("iframe")).toBeNull();
        expect(douyinCard.querySelector(".video-tutorial-source").getAttribute("href")).toBe(
            "https://www.douyin.com/video/123",
        );

        app.unmount();
    });

    it("unloads every inline player while a floating player is active and restores them when it closes", async () => {
        catalog.videos.push(
            {
                id: "setup-bilibili-inline",
                categoryId: "setup",
                platform: "bilibili",
                title: "设置内嵌教程",
                description: "基础设置",
                tags: ["设置"],
                sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
                embedUrl:
                    "https://player.bilibili.com/player.html?isOutside=true&aid=123&bvid=BV1xx411c7mD&cid=456&p=1&autoplay=0",
            },
            {
                id: "ports-bilibili-inline",
                categoryId: "ports",
                platform: "bilibili",
                title: "端口内嵌教程",
                description: "端口设置",
                tags: ["端口"],
                sourceUrl: "https://www.bilibili.com/video/BV1Hg411e7dR",
                embedUrl:
                    "https://player.bilibili.com/player.html?isOutside=true&aid=789&bvid=BV1Hg411e7dR&cid=101112&p=1&autoplay=0",
            },
        );

        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.appendChild(container);
        const app = createApp(VideoTutorialsTab);
        app.mount(container);
        await nextTick();

        const setupCard = [...container.querySelectorAll(".video-tutorial-card")].find((card) =>
            card.textContent.includes("设置内嵌教程"),
        );
        const portsCard = [...container.querySelectorAll(".video-tutorial-card")].find((card) =>
            card.textContent.includes("端口内嵌教程"),
        );

        expect(setupCard.querySelector("iframe")).not.toBeNull();
        expect(portsCard.querySelector("iframe")).not.toBeNull();

        setupCard.querySelector(".video-tutorial-picture-in-picture").click();
        await nextTick();

        expect(hasFloatingVideoTutorial()).toBe(true);
        expect(videoTutorialFloatingPlayer.video.id).toBe("setup-bilibili-inline");
        expect(container.querySelectorAll(".video-tutorial-player iframe")).toHaveLength(0);
        expect(setupCard.querySelector(".video-tutorial-picture-in-picture-status").textContent).toContain(
            "正在画中画播放",
        );
        expect(portsCard.querySelector(".video-tutorial-picture-in-picture-status").textContent).toContain(
            "已暂停内嵌播放器",
        );

        closeFloatingVideoTutorial();
        await nextTick();

        expect(hasFloatingVideoTutorial()).toBe(false);
        expect(setupCard.querySelector("iframe")).not.toBeNull();
        expect(portsCard.querySelector("iframe")).not.toBeNull();

        app.unmount();
    });
});
