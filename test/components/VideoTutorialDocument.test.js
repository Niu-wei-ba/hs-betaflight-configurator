import { createApp, nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";

async function flush() {
    await Promise.resolve();
    await nextTick();
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("VideoTutorialDocument", () => {
    it("sanitizes Markdown HTML without rendering chapter time jump controls", async () => {
        const { default: Document } = await import("../../src/components/VideoTutorialDocument.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(Document, {
            video: { title: "模式教程", sourceUrl: "https://www.bilibili.com/video/BV119jR6kEyG/" },
            document: {
                title: "模式教程",
                version: 1,
                markdown: "# 模式教程\n\n## 操作步骤\n\n<script>window.__bad = true</script>\n\n正文",
                chapters: [{ title: "第一章", startSeconds: 12 }, { title: "无时间轴" }],
            },
        });
        app.mount(container);
        await flush();

        expect(container.querySelector("script")).toBeNull();
        expect(container.textContent).toContain("正文");
        expect(container.querySelector(".video-tutorial-document__chapters")).toBeNull();
        app.unmount();
    });

    it("shows the video fallback when document loading fails", async () => {
        const { default: Document } = await import("../../src/components/VideoTutorialDocument.vue");
        const container = document.createElement("div");
        document.body.append(container);
        const app = createApp(Document, {
            loading: false,
            error: "教程文档加载失败。仍可观看视频。",
            video: { sourceUrl: "https://www.bilibili.com/video/BV119jR6kEyG/" },
        });
        app.mount(container);
        await flush();
        expect(container.textContent).toContain("教程文档加载失败");
        expect(container.querySelector('a[href="https://www.bilibili.com/video/BV119jR6kEyG/"]')).toBeTruthy();
        app.unmount();
    });
});
