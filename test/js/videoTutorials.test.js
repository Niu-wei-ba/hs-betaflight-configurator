import { afterEach, describe, expect, it, vi } from "vitest";

const catalogPayload = {
    categories: [
        { id: "setup", title: "设置", sortOrder: 0 },
        { id: "receiver", title: "接收机", sortOrder: 1 },
    ],
    videos: [
        {
            id: "video-1",
            platform: "bilibili",
            title: "ELRS 接收机设置",
            sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD/",
            embedUrl: "https://player.bilibili.com/player.html?bvid=BV1xx411c7mD",
            durationSeconds: 122,
            categories: [{ id: "receiver", title: "接收机", confidence: 0.9 }],
            tags: [{ name: "ELRS", confidence: 0.9 }],
        },
    ],
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    document.body.innerHTML = "";
});

describe("database-backed video tutorial catalog", () => {
    it("derives the shared tutorialId from a legacy catalog bvid", async () => {
        global.fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    categories: [],
                    videos: [{ id: "legacy-uuid", platform: "bilibili", bvid: "BV119jR6kEyG", title: "旧目录记录" }],
                }),
                { status: 200 },
            ),
        );
        const tutorials = await import("../../src/js/video_tutorials");
        const loaded = await tutorials.loadVideoTutorialCatalog({ force: true });
        expect(loaded.videos[0].tutorialId).toBe("bilibili-BV119jR6kEyG");
    });

    it("loads the catalog from /api/tutorials/catalog and does not require a static JSON catalog", async () => {
        global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalogPayload), { status: 200 }));
        const tutorials = await import("../../src/js/video_tutorials");
        const catalog = await tutorials.loadVideoTutorialCatalog();
        expect(String(fetch.mock.calls[0][0])).toContain("/api/tutorials/catalog");
        expect(fetch.mock.calls[0][1]).toEqual(expect.any(Object));
        expect(catalog.categories).toHaveLength(2);
        expect(catalog.videos[0]).toMatchObject({
            categoryId: "receiver",
            categoryIds: ["receiver"],
            tags: ["ELRS"],
            duration: "2:02",
        });
        expect(tutorials.filterVideoTutorials(catalog.videos, { categoryId: "receiver", search: "elrs" })).toHaveLength(
            1,
        );
    });

    it("sends semantic search requests and returns matched timestamps rather than seeking the iframe", async () => {
        global.fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    query: "接收机串口",
                    results: [
                        {
                            id: "segment-1",
                            video: catalogPayload.videos[0],
                            startSeconds: 65,
                            endSeconds: 97,
                            text: "把串口协议改为 CRSF",
                            similarity: 0.92,
                        },
                    ],
                }),
                { status: 200 },
            ),
        );
        const tutorials = await import("../../src/js/video_tutorials");
        const result = await tutorials.searchVideoTutorials({ query: "接收机串口" });
        expect(String(fetch.mock.calls.at(-1)[0])).toContain("/api/tutorials/search");
        expect(fetch.mock.calls.at(-1)[1]).toEqual(expect.objectContaining({ method: "POST" }));
        expect(result.results[0]).toMatchObject({ matchedText: "把串口协议改为 CRSF", timeRange: "1:05–1:37" });
    });

    it("allows category navigation before asynchronous catalog validation has completed", async () => {
        const tutorials = await import("../../src/js/video_tutorials");
        document.body.innerHTML = '<ul id="tabs"><li class="tab_video_tutorials"><a></a></li></ul>';
        expect(tutorials.openVideoTutorials("receiver")).toBe(true);
        expect(tutorials.consumeRequestedVideoTutorialCategory()).toBe("receiver");
    });
});

describe("video/document search sources", () => {
    it("merges transcript and document hits into one tutorial result", async () => {
        global.fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    query: "模式",
                    results: [
                        {
                            contentType: "video_transcript",
                            text: "模式页面",
                            startSeconds: 12,
                            endSeconds: 20,
                            similarity: 0.82,
                            video: {
                                tutorialId: "bilibili-BV119jR6kEyG",
                                title: "模式教程",
                                sourceUrl: "https://www.bilibili.com/video/BV119jR6kEyG/",
                                document: { available: true, version: 1 },
                            },
                        },
                        {
                            contentType: "document",
                            text: "配置三档开关",
                            similarity: 0.94,
                            video: {
                                tutorialId: "bilibili-BV119jR6kEyG",
                                title: "模式教程",
                                sourceUrl: "https://www.bilibili.com/video/BV119jR6kEyG/",
                                document: { available: true, version: 1 },
                            },
                            document: {
                                available: true,
                                url: "/api/tutorials/bilibili-BV119jR6kEyG/document",
                                version: 1,
                            },
                        },
                    ],
                }),
                { status: 200 },
            ),
        );
        const tutorials = await import("../../src/js/video_tutorials");
        const result = await tutorials.searchVideoTutorials({ query: "模式" });
        expect(result.results).toHaveLength(1);
        expect(result.results[0]).toMatchObject({
            tutorialId: "bilibili-BV119jR6kEyG",
            contentTypes: ["video_transcript", "document"],
            sourceLabels: ["视频字幕", "教程文档"],
            timeRange: "0:12–0:20",
        });
    });
});

describe("technical tutorial search precision", () => {
    it("does not show unrelated semantic fallback results for a technical identifier", async () => {
        global.fetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    query: "zadig",
                    results: [
                        {
                            contentType: "video_transcript",
                            text: "没有搭载 SBUS 协议的话，像视频里这样操作一下就可以了。",
                            video: {
                                tutorialId: "bilibili-BV1bACPYzEcw",
                                title: "BF 居然删掉了 SBUS 协议？",
                                tags: [{ name: "SBUS" }],
                                sourceUrl: "https://www.bilibili.com/video/BV1bACPYzEcw/",
                            },
                        },
                        {
                            contentType: "document",
                            text: "打开 Zadig，在设备列表中选择 STM32 Bootloader。",
                            video: {
                                tutorialId: "bilibili-BV1qgV26FEGg",
                                title: "七寸远航悬停教程",
                                tags: [{ name: "Zadig" }],
                                sourceUrl: "https://www.bilibili.com/video/BV1qgV26FEGg/",
                            },
                        },
                    ],
                }),
                { status: 200 },
            ),
        );
        const tutorials = await import("../../src/js/video_tutorials");
        const result = await tutorials.searchVideoTutorials({ query: "ZADIG" });
        expect(result.results).toHaveLength(1);
        expect(result.results[0]).toMatchObject({
            tutorialId: "bilibili-BV1qgV26FEGg",
            matchedText: expect.stringContaining("Zadig"),
        });
    });
});

describe("tutorial video URLs", () => {
    it("preserves canonical source URLs and never appends playback timestamps", async () => {
        const tutorials = await import("../../src/js/video_tutorials");
        const video = {
            sourceUrl: "https://www.bilibili.com/video/BV119jR6kEyG/?from=search#chapter-1",
            embedUrl: "https://player.bilibili.com/player.html?bvid=BV119jR6kEyG#player",
        };

        expect(tutorials.getVideoTutorialSourceUrl(video)).toBe(video.sourceUrl);
        expect(tutorials.getVideoTutorialSourceUrl(video, { startSeconds: 12.9 })).toBe(video.sourceUrl);
        expect(tutorials.getVideoTutorialEmbedUrl(video, { startSeconds: 12.9 })).toBe(
            "https://player.bilibili.com/player.html?bvid=BV119jR6kEyG&autoplay=0#player",
        );
        expect(tutorials.getVideoTutorialEmbedUrl(video, { autoplay: true })).toBe(
            "https://player.bilibili.com/player.html?bvid=BV119jR6kEyG&autoplay=1#player",
        );
    });
});
