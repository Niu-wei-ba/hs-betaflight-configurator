import { createApp, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

const catalog = {
    categories: [
        { id: "setup", title: "设置" },
        { id: "receiver", title: "接收机" },
    ],
    videos: [
        {
            id: "video-1",
            tutorialId: "bilibili-BV1xx411c7mD",
            platform: "bilibili",
            title: "ELRS 接收机设置",
            sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD/",
            embedUrl: "https://player.bilibili.com/player.html?bvid=BV1xx411c7mD",
            thumbnailUrl: "https://i0.hdslb.com/bfs/archive/video-1.jpg",
            categories: [{ id: "receiver", title: "接收机" }],
            tags: [{ name: "ELRS" }],
            document: { available: true, title: "ELRS 接收机设置", version: 1 },
        },
    ],
};
async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await nextTick();
}
afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    document.body.innerHTML = "";
});

describe("VideoTutorialsTab", () => {
    it("shows load state then renders database categories, empty categories, and API video cards", async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));
        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(VideoTutorialsTab);
        app.mount(container);
        expect(container.textContent).toContain("正在加载视频教程目录");
        await flush();
        expect(String(fetch.mock.calls[0][0])).toContain("/api/tutorials/catalog");
        expect(fetch.mock.calls[0][1]).toEqual(expect.any(Object));
        expect(container.querySelectorAll(".video-tutorial-section")).toHaveLength(2);
        expect(container.textContent).toContain("该分类的视频正在整理中");
        expect(container.querySelector("iframe")).toBeNull();
        const playButton = container.querySelector(".video-tutorial-player-launch");
        expect(playButton?.getAttribute("aria-label")).toBe("播放《ELRS 接收机设置》");
        expect(playButton?.querySelector("img")?.getAttribute("src")).toBe(
            "https://i0.hdslb.com/bfs/archive/video-1.jpg",
        );
        playButton.click();
        await nextTick();
        expect(container.querySelector("iframe")?.getAttribute("src")).toContain("autoplay=1");
        expect(container.querySelector("iframe")?.getAttribute("allow")).toContain("autoplay");
        expect(container.textContent).toContain("播放器加载中");
        container.querySelector("iframe").dispatchEvent(new Event("load"));
        await nextTick();
        expect(container.textContent).not.toContain("播放器加载中");
        expect(container.textContent).toContain("观看视频");
        expect(container.textContent).toContain("阅读文档");
        app.unmount();
    });

    it("keeps exactly one inline iframe while switching cards", async () => {
        const secondVideo = {
            ...catalog.videos[0],
            id: "video-2",
            tutorialId: "bilibili-BV1yy411c7mD",
            title: "第二个接收机教程",
            sourceUrl: "https://www.bilibili.com/video/BV1yy411c7mD/",
            embedUrl: "https://player.bilibili.com/player.html?bvid=BV1yy411c7mD",
            thumbnailUrl: "https://i0.hdslb.com/bfs/archive/video-2.jpg",
        };
        global.fetch = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify({ ...catalog, videos: [...catalog.videos, secondVideo] }), { status: 200 }),
            );
        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(VideoTutorialsTab);
        app.mount(container);
        await flush();

        const playButtons = container.querySelectorAll(".video-tutorial-player-launch");
        expect(playButtons).toHaveLength(2);
        playButtons[0].click();
        await nextTick();
        expect(container.querySelectorAll("iframe")).toHaveLength(1);
        expect(container.querySelector("iframe")?.getAttribute("title")).toBe("ELRS 接收机设置");

        playButtons[1].click();
        await nextTick();
        expect(container.querySelectorAll("iframe")).toHaveLength(1);
        expect(container.querySelector("iframe")?.getAttribute("title")).toBe("第二个接收机教程");
        app.unmount();
    });

    it("uses a category-specific player key when one video appears in multiple sections", async () => {
        const sharedVideo = {
            ...catalog.videos[0],
            categories: catalog.categories,
        };
        global.fetch = vi
            .fn()
            .mockResolvedValue(new Response(JSON.stringify({ ...catalog, videos: [sharedVideo] }), { status: 200 }));
        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(VideoTutorialsTab);
        app.mount(container);
        await flush();

        const playButtons = container.querySelectorAll(".video-tutorial-player-launch");
        expect(playButtons).toHaveLength(2);
        playButtons[1].click();
        await nextTick();
        expect(container.querySelectorAll("iframe")).toHaveLength(1);
        expect(container.querySelectorAll(".video-tutorial-card")[0].querySelector("iframe")).toBeNull();
        expect(container.querySelectorAll(".video-tutorial-card")[1].querySelector("iframe")).not.toBeNull();
        app.unmount();
    });

    it("unloads the inline player when changing category or opening picture in picture", async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));
        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(VideoTutorialsTab);
        app.mount(container);
        await flush();

        container.querySelector(".video-tutorial-player-launch").click();
        await nextTick();
        expect(container.querySelector("iframe")).not.toBeNull();

        [...container.querySelectorAll(".video-tutorials-filter")]
            .find((button) => button.textContent.trim() === "接收机")
            .click();
        await nextTick();
        expect(container.querySelector("iframe")).toBeNull();

        container.querySelector(".video-tutorial-player-launch").click();
        await nextTick();
        container.querySelector(".video-tutorial-picture-in-picture").click();
        await nextTick();
        expect(container.querySelector("iframe")).toBeNull();
        expect(container.textContent).toContain("正在画中画播放");
        app.unmount();
    });

    it("shows a placeholder and supports retrying an inline embed failure", async () => {
        const videoWithoutThumbnail = { ...catalog.videos[0], thumbnailUrl: "" };
        global.fetch = vi
            .fn()
            .mockResolvedValue(
                new Response(JSON.stringify({ ...catalog, videos: [videoWithoutThumbnail] }), { status: 200 }),
            );
        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(VideoTutorialsTab);
        app.mount(container);
        await flush();

        const playButton = container.querySelector(".video-tutorial-player-launch");
        expect(playButton.querySelector("img")).toBeNull();
        expect(playButton.textContent).toContain("B 站");
        playButton.click();
        await nextTick();
        const failedIframe = container.querySelector("iframe");
        failedIframe.dispatchEvent(new Event("error"));
        await nextTick();
        expect(container.textContent).toContain("播放器加载失败");
        expect(container.querySelector(".video-tutorial-embed-fallback a")?.getAttribute("href")).toBe(
            "https://www.bilibili.com/video/BV1xx411c7mD/",
        );

        container.querySelector(".video-tutorial-embed-fallback button").click();
        await nextTick();
        expect(container.querySelector("iframe")).not.toBeNull();
        expect(container.querySelector("iframe")).not.toBe(failedIframe);
        app.unmount();
    });

    it("opens a document requested through the shared tutorial navigation event", async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(catalog), { status: 200 }))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        tutorialId: "bilibili-BV1xx411c7mD",
                        title: "ELRS 接收机设置",
                        format: "markdown",
                        markdown: "# ELRS 接收机设置\n\n## 操作步骤\n\n正文",
                        chapters: [],
                        version: 1,
                    }),
                    { status: 200 },
                ),
            );
        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(VideoTutorialsTab);
        app.mount(container);
        await flush();
        document.dispatchEvent(
            new CustomEvent("video-tutorials:document-open", { detail: { tutorialId: "bilibili-BV1xx411c7mD" } }),
        );
        await flush();
        expect(String(fetch.mock.calls[1][0])).toContain("/api/tutorials/bilibili-BV1xx411c7mD/document");
        expect(container.textContent).toContain("ELRS 接收机设置");
        app.unmount();
    });

    it("does not render document chapter time jump controls", async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify(catalog), { status: 200 }))
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        tutorialId: "bilibili-BV1xx411c7mD",
                        title: "ELRS 接收机设置",
                        markdown: "# ELRS 接收机设置\n\n## 视频章节\n\n正文",
                        chapters: [{ title: "端口设置", startSeconds: 12 }],
                    }),
                    { status: 200 },
                ),
            );
        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(VideoTutorialsTab);
        app.mount(container);
        await flush();

        container.querySelector(".video-tutorial-document-link").click();
        await flush();
        expect(container.querySelector(".video-tutorial-document__chapters")).toBeNull();
        expect(container.querySelector("iframe")).toBeNull();
        expect(container.querySelector(".video-tutorial-source")?.getAttribute("href")).toBe(
            "https://www.bilibili.com/video/BV1xx411c7mD/",
        );
        app.unmount();
    });

    it("shows API error and supports a retry without falling back to static data", async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ error: "数据库不可用" }), { status: 503 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ categories: [], videos: [] }), { status: 200 }));
        const { default: VideoTutorialsTab } = await import("../../src/components/tabs/VideoTutorialsTab.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(VideoTutorialsTab);
        app.mount(container);
        await flush();
        expect(container.textContent).toContain("数据库不可用");
        container.querySelector("button.video-tutorials-filter").click();
        await flush();
        expect(container.textContent).toContain("0 个匹配视频");
        app.unmount();
    });
});
