import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    VIDEO_TUTORIALS_OPEN_EVENT,
    consumeRequestedVideoTutorialCategory,
    filterVideoTutorials,
    getVideoTutorialCatalog,
    getVideoTutorialEmbedUrl,
    getVideosByCategory,
    isVideoTutorialEmbeddable,
    openVideoTutorials,
} from "../../src/js/video_tutorials";

describe("video tutorial catalog", () => {
    afterEach(() => {
        document.body.innerHTML = "";
        consumeRequestedVideoTutorialCategory();
    });

    it("defines the 19 ordered configurator categories and validates each platform's tutorial metadata", () => {
        const catalog = getVideoTutorialCatalog();

        expect(catalog.categories.map((category) => category.id)).toEqual([
            "setup",
            "ports",
            "configuration",
            "power",
            "failsafe",
            "presets",
            "pid-tuning",
            "receiver",
            "modes",
            "adjustments",
            "gps",
            "motors",
            "osd",
            "vtx",
            "led-strip",
            "sensors",
            "logging",
            "blackbox",
            "cli",
        ]);
        expect(catalog.videos.length).toBeGreaterThan(0);
        expect(getVideosByCategory("not-a-category")).toEqual([]);

        const categoryIds = new Set(catalog.categories.map((category) => category.id));
        const videoIds = catalog.videos.map((video) => video.id);
        const bilibiliVideos = catalog.videos.filter((video) => video.platform === "bilibili");
        expect(new Set(videoIds)).toHaveLength(videoIds.length);
        expect(bilibiliVideos.length).toBeGreaterThan(0);
        for (const video of catalog.videos) {
            expect(categoryIds).toContain(video.categoryId);
            expect(video.title).not.toBe("");
            expect(video.description).not.toBe("");
            expect(video.tags.length).toBeGreaterThan(0);
            expect(video.sourceUrl).toMatch(/^https:\/\//);
            expect(video.duration).toMatch(/^\d+:\d{2}$/);
            expect(video.authorName).not.toBe("");
            expect(video.authorAvatarUrl).toMatch(/^https:\/\//);
            if (video.thumbnailUrl) {
                expect(video.thumbnailUrl).toMatch(/^https:\/\//);
            }
        }

        for (const video of bilibiliVideos) {
            expect(video.sourceUrl).toMatch(/^https:\/\/www\.bilibili\.com\/video\/BV[0-9A-Za-z]{10}\/$/);
            expect(video.embedUrl).toContain("isOutside=true");
            expect(video.embedUrl).toMatch(/[?&]aid=\d+/);
            expect(video.embedUrl).toMatch(/[?&]cid=\d+/);
            expect(video.embedUrl).toContain("autoplay=0");
            expect(video.thumbnailUrl).toMatch(/^https:\/\//);
        }
    });

    it("uses responsive dimensions for official Douyin embeds without changing catalog source URLs", () => {
        const douyinEmbedUrl = getVideoTutorialEmbedUrl({
            platform: "douyin",
            embedUrl: "https://open.douyin.com/player/video?vid=123&autoplay=0",
        });
        const douyinUrl = new URL(douyinEmbedUrl);

        expect(douyinUrl.searchParams.get("autoplay")).toBe("0");
        expect(douyinUrl.searchParams.get("mode")).toBe("mobile");
        expect(douyinUrl.searchParams.get("width")).toBe("100%");
        expect(douyinUrl.searchParams.get("height")).toBe("100%");
        expect(getVideoTutorialEmbedUrl({ embedUrl: "not a URL" })).toBe("");
    });

    it("filters supplied video metadata by category, title, description, and tags", () => {
        const videos = [
            {
                id: "pid-bilibili",
                categoryId: "pid-tuning",
                title: "PID 调校入门",
                description: "从基础参数开始调参",
                tags: ["调参", "黑盒子"],
            },
            {
                id: "ports-douyin",
                categoryId: "ports",
                title: "端口配置教程",
                description: "配置串口与接收机",
                tags: ["MSP"],
            },
        ];

        expect(filterVideoTutorials(videos, { search: "黑盒子" })).toEqual([videos[0]]);
        expect(filterVideoTutorials(videos, { search: "接收机", categoryId: "ports" })).toEqual([videos[1]]);
        expect(filterVideoTutorials(videos, { categoryId: "pid-tuning" })).toEqual([videos[0]]);
    });

    it("only allows HTTPS embed URLs and keeps the platform source link as a separate fallback", () => {
        expect(
            isVideoTutorialEmbeddable({
                platform: "bilibili",
                sourceUrl: "https://www.bilibili.com/video/BV1xx411c7mD",
                embedUrl: "https://player.bilibili.com/player.html?bvid=BV1xx411c7mD",
            }),
        ).toBe(true);
        expect(
            isVideoTutorialEmbeddable({
                platform: "douyin",
                sourceUrl: "https://www.douyin.com/video/123",
            }),
        ).toBe(false);
        expect(
            isVideoTutorialEmbeddable({
                platform: "douyin",
                sourceUrl: "https://www.douyin.com/video/123",
                embedUrl: "https://open.douyin.com/player/video?vid=123&autoplay=0",
            }),
        ).toBe(true);
        expect(isVideoTutorialEmbeddable({ embedUrl: "http://example.com/player" })).toBe(false);
    });

    it("opens the shared tutorial tab and delivers a requested category to future contextual entries", () => {
        document.body.innerHTML = `
            <div id="tabs">
                <ul class="mode-disconnected"><li class="tab_video_tutorials"><a href="#">视频教程</a></li></ul>
                <ul class="mode-connected"><li class="tab_video_tutorials"><a href="#">视频教程</a></li></ul>
                <ul class="mode-connected-cli"><li class="tab_video_tutorials"><a href="#">视频教程</a></li></ul>
            </div>
        `;
        const links = [...document.querySelectorAll(".tab_video_tutorials a")];
        const click = vi.fn();
        links[0].addEventListener("click", click);

        expect(openVideoTutorials("ports")).toBe(true);
        expect(click).toHaveBeenCalledOnce();
        expect(consumeRequestedVideoTutorialCategory()).toBe("ports");
        expect(openVideoTutorials("unknown-category")).toBe(false);

        const openEvent = vi.fn();
        document.addEventListener(VIDEO_TUTORIALS_OPEN_EVENT, openEvent);
        links[1].closest("li").classList.add("active");

        expect(openVideoTutorials("setup")).toBe(true);
        expect(openEvent).toHaveBeenCalledOnce();
        expect(openEvent.mock.calls[0][0].detail).toEqual({ categoryId: "setup" });

        document.removeEventListener(VIDEO_TUTORIALS_OPEN_EVENT, openEvent);
    });

    it("renders the shared tutorial entry in disconnected, connected, and CLI-only sidebars", () => {
        document.body.innerHTML = readFileSync("src/index.html", "utf8");

        expect(document.querySelectorAll("#tabs ul.mode-disconnected .tab_video_tutorials a")).toHaveLength(1);
        expect(
            document.querySelectorAll("#tabs ul.mode-connected:not(.mode-connected-cli) .tab_video_tutorials a"),
        ).toHaveLength(1);
        expect(document.querySelectorAll("#tabs ul.mode-connected-cli .tab_video_tutorials a")).toHaveLength(1);
        expect(document.querySelectorAll('[i18n="tabVideoTutorials"]')).toHaveLength(3);
    });
});
