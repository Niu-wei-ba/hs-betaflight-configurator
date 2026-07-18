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
        expect(container.querySelector("iframe")?.getAttribute("src")).toContain("autoplay=0");
        expect(container.textContent).toContain("观看视频");
        expect(container.textContent).toContain("阅读文档");
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
        expect(container.querySelector("iframe")?.getAttribute("src")).not.toContain("t=12");
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
