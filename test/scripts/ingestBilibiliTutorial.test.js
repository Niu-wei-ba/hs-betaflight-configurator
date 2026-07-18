import { describe, expect, it } from "vitest";
import {
    alignCalibratedToOfficial,
    buildPayload,
    normalizeMetadata,
    normalizeRawSubtitle,
    normalizeChapters,
    parseArgs,
    parseTimedSubtitle,
    validateChapters,
    validateMarkdown,
} from "../../.codex/skills/video-tutorial-catalog-import/scripts/ingest_bilibili_tutorial.mjs";

const metadata = {
    aid: 123,
    cid: 456,
    bvid: "BV119jR6kEyG",
    title: "模式设置教程",
    desc: "校准后的简介",
    duration: 450,
    owner: { name: "作者" },
};
const markdown = `# 模式设置教程

## 本教程讲什么

介绍模式配置。

## 适用场景与前置条件

已连接飞控。

## 操作步骤

### 1. 进入模式页面

打开页面。

## Betaflight 参数与界面说明

视频未明确说明具体默认值。

## 常见错误与注意事项

测试前拆桨。

## 术语表

| 术语 | 含义 |
| --- | --- |
| ARM | 解锁 |

## 视频章节

1. 进入模式页面

## 来源

https://www.bilibili.com/video/BV119jR6kEyG/
`;

const calibrated = { language: "zh-CN", version: 1, lines: [{ text: "进入模式页面" }] };
const raw = normalizeRawSubtitle({ source: "bilibili-video-info-mcp", lan: "ai-zh", content: ["进入模式页面"] });

describe("subtitle-first Bilibili ingest", () => {
    it("preserves subtitle provenance and builds one shared tutorial/document identity", () => {
        expect(normalizeMetadata({ code: 0, data: metadata })).toEqual(metadata);
        const payload = buildPayload({
            options: {},
            bvid: "BV119jR6kEyG",
            metadata,
            rawSubtitle: raw,
            calibratedSubtitle: calibrated,
            markdown,
            chapters: [{ title: "进入模式页面", goal: "识别页面" }],
            segments: [],
        });
        expect(payload).toMatchObject({
            tutorialId: "bilibili-BV119jR6kEyG",
            documentId: "bilibili-BV119jR6kEyG-document",
            subtitle: { raw: { source: "bilibili-video-info-mcp" }, calibrated: { language: "zh-CN" } },
            document: { source: "calibrated-subtitle", version: 1, markdown },
        });
        expect(payload.subtitle.raw.lines).toEqual([{ text: "进入模式页面" }]);
        expect(() => normalizeRawSubtitle({ source: "legacy-whisper", language: "zh", content: ["旧字幕"] })).toThrow(
            /必须显式标记为 bilibili-video-info-mcp/,
        );
        expect(() => normalizeRawSubtitle({ lan: "ai-zh", content: ["缺少来源"] })).toThrow(
            /必须显式标记为 bilibili-video-info-mcp/,
        );
        expect(payload.subtitle.calibrated.version).toBe(1);
    });

    it("rejects incomplete or obviously uncalibrated Markdown before publishing", () => {
        expect(() => validateMarkdown("# 标题\n\n## 本教程讲什么", "标题", "https://example.com")).toThrow(
            /缺少固定章节/,
        );
        expect(() =>
            validateMarkdown(
                `# 模式设置教程\n\n${[
                    "本教程讲什么",
                    "适用场景与前置条件",
                    "操作步骤",
                    "Betaflight 参数与界面说明",
                    "常见错误与注意事项",
                    "术语表",
                    "视频章节",
                    "来源",
                ]
                    .map((heading) => `## ${heading}\n\n内容`)
                    .join("\n\n")}\n\nhttps://www.bilibili.com/video/BV119jR6kEyG/`,
                "模式设置教程",
                "https://www.bilibili.com/video/BV119jR6kEyG/",
            ),
        ).toThrow(/至少需要一个正文章节/);
        expect(() =>
            validateMarkdown(
                markdown.replace("模式配置", "web box 配置"),
                "模式设置教程",
                "https://www.bilibili.com/video/BV119jR6kEyG/",
            ),
        ).toThrow(/未校准 ASR/);
    });

    it("uses reliable official timestamps and drops all timestamps when alignment is unreliable", () => {
        const official = parseTimedSubtitle(`WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n进入模式页面`);
        const aligned = alignCalibratedToOfficial([{ text: "进入模式页面" }], official);
        expect(aligned).toMatchObject({ reliable: true, lines: [{ startSeconds: 1, endSeconds: 3 }] });

        const failed = alignCalibratedToOfficial([{ text: "完全不同的内容" }], official);
        expect(failed).toMatchObject({ reliable: false, lines: [], score: 0 });
    });

    it("accepts chapters without timestamps but rejects ranges outside the video", () => {
        expect(() => validateChapters([{ title: "无时间轴" }], 450)).not.toThrow();
        expect(() => validateChapters([{ title: "越界", startSeconds: 451 }], 450)).toThrow(/不存在的时间范围/);
        expect(normalizeChapters([{ title: "章节", goal: "目标", steps: ["步骤"], notes: ["注意"] }])).toEqual([
            { title: "章节", goal: "目标", steps: ["步骤"], notes: ["注意"] },
        ]);
    });

    it("requires an explicit flag to migrate an existing BV", () => {
        expect(parseArgs(["--migrate-existing"])["migrate-existing"]).toBe(true);
        expect(parseArgs(["--dry-run"])["migrate-existing"]).toBeUndefined();
    });
});
