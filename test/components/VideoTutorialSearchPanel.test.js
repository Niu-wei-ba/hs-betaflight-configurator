import { createApp, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    await nextTick();
}
function installShell() {
    document.body.innerHTML =
        '<div id="tab-content-container"></div><div id="content"><h1>设置</h1></div><ul id="tabs"><li class="tab_setup active"></li></ul>';
}
afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    document.body.innerHTML = "";
});

describe("VideoTutorialSearchPanel", () => {
    it("submits semantic API search and displays source metadata, matched transcript, and mm:ss time range", async () => {
        installShell();
        global.fetch = vi.fn((url) => {
            if (String(url).endsWith("/catalog"))
                return Promise.resolve(new Response(JSON.stringify({ categories: [], videos: [] }), { status: 200 }));
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        query: "接收机",
                        results: [
                            {
                                id: "s1",
                                startSeconds: 65,
                                endSeconds: 97,
                                text: "在端口页选择 CRSF",
                                similarity: 0.9,
                                video: {
                                    id: "v1",
                                    platform: "bilibili",
                                    title: "接收机教程",
                                    sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD/",
                                    categories: [{ id: "receiver", title: "接收机" }],
                                    tags: [{ name: "ELRS" }],
                                },
                            },
                        ],
                    }),
                    { status: 200 },
                ),
            );
        });
        const { default: Panel } = await import("../../src/components/VideoTutorialSearchPanel.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(Panel);
        app.mount(container);
        await flush();
        const input = document.querySelector(".video-tutorial-search-entry input");
        input.value = "接收机";
        input.dispatchEvent(new Event("input"));
        input.closest("form").dispatchEvent(new Event("submit", { cancelable: true }));
        await flush();
        expect(String(fetch.mock.calls.at(-1)[0])).toContain("/api/tutorials/search");
        expect(fetch.mock.calls.at(-1)[1]).toEqual(expect.objectContaining({ method: "POST" }));
        const card = document.querySelector(".video-tutorial-search-result");
        expect(card.textContent).toContain("1:05–1:37");
        expect(card.textContent).toContain("在端口页选择 CRSF");
        expect(card.textContent).toContain("标签：ELRS");
        app.unmount();
    });

    it("shows both actions and keeps the video action when document loading fails", async () => {
        installShell();
        global.fetch = vi.fn((url) => {
            if (String(url).endsWith("/catalog"))
                return Promise.resolve(new Response(JSON.stringify({ categories: [], videos: [] }), { status: 200 }));
            if (String(url).endsWith("/search"))
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            results: [
                                {
                                    contentType: "video_transcript",
                                    text: "模式字幕",
                                    startSeconds: 10,
                                    endSeconds: 20,
                                    video: {
                                        tutorialId: "bilibili-BV119jR6kEyG",
                                        title: "模式教程",
                                        sourceUrl: "https://www.bilibili.com/video/BV119jR6kEyG/",
                                        embedUrl: "https://player.bilibili.com/player.html?bvid=BV119jR6kEyG",
                                        document: { available: true, version: 1 },
                                    },
                                },
                                {
                                    contentType: "document",
                                    text: "模式页面",
                                    video: {
                                        tutorialId: "bilibili-BV119jR6kEyG",
                                        title: "模式教程",
                                        sourceUrl: "https://www.bilibili.com/video/BV119jR6kEyG/",
                                        embedUrl: "https://player.bilibili.com/player.html?bvid=BV119jR6kEyG",
                                        document: { available: true, version: 1 },
                                    },
                                    document: { available: true, version: 1 },
                                },
                            ],
                        }),
                        { status: 200 },
                    ),
                );
            return Promise.resolve(new Response(JSON.stringify({ error: "文档服务暂时不可用" }), { status: 503 }));
        });
        const { default: Panel } = await import("../../src/components/VideoTutorialSearchPanel.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(Panel);
        app.mount(container);
        await flush();
        const input = document.querySelector(".video-tutorial-search-entry input");
        input.value = "模式";
        input.dispatchEvent(new Event("input"));
        input.closest("form").dispatchEvent(new Event("submit", { cancelable: true }));
        await flush();
        expect(container.textContent).toContain("视频字幕");
        expect(container.textContent).toContain("教程文档");
        const documentButton = [...container.querySelectorAll(".video-tutorial-search-result__action")].find((button) =>
            button.textContent.includes("阅读文档"),
        );
        documentButton.click();
        await flush();
        expect(container.textContent).toContain("文档服务暂时不可用");
        expect(container.querySelector('a[href="https://www.bilibili.com/video/BV119jR6kEyG/"]')).toBeTruthy();
        app.unmount();
    });
});

describe("VideoTutorialSearchPanel playback", () => {
    it("opens a search match from the beginning and keeps the canonical external URL", async () => {
        installShell();
        global.fetch = vi.fn((url) => {
            if (String(url).endsWith("/catalog"))
                return Promise.resolve(new Response(JSON.stringify({ categories: [], videos: [] }), { status: 200 }));
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        results: [
                            {
                                text: "在 10 秒处设置模式",
                                startSeconds: 10.8,
                                video: {
                                    tutorialId: "bilibili-BV119jR6kEyG",
                                    title: "模式教程",
                                    sourceUrl: "https://www.bilibili.com/video/BV119jR6kEyG/",
                                    embedUrl: "https://player.bilibili.com/player.html?bvid=BV119jR6kEyG",
                                },
                            },
                        ],
                    }),
                    { status: 200 },
                ),
            );
        });
        const { default: Panel } = await import("../../src/components/VideoTutorialSearchPanel.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(Panel);
        app.mount(container);
        await flush();

        const input = document.querySelector(".video-tutorial-search-entry input");
        input.value = "模式";
        input.dispatchEvent(new Event("input"));
        input.closest("form").dispatchEvent(new Event("submit", { cancelable: true }));
        await flush();
        container.querySelector(".video-tutorial-search-result__action").click();
        await flush();

        const iframe = container.querySelector("iframe");
        expect(iframe?.getAttribute("src")).not.toContain("t=10");
        iframe.dispatchEvent(new Event("error"));
        await flush();
        expect(container.querySelector(".video-tutorial-search-panel__embed-fallback a")?.getAttribute("href")).toBe(
            "https://www.bilibili.com/video/BV119jR6kEyG/",
        );
        app.unmount();
    });
});
