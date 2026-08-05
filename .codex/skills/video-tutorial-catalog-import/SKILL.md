---
name: video-tutorial-catalog-import
description: 将 Bilibili 的穿越机、Betaflight 或 Betaflight Configurator 视频通过 Bilibili MCP 原始字幕校准后收录为“视频 + Markdown 文档”双教程。用户提供视频链接、要求收录/解析/校准字幕，或要求生成教程文档时使用。
---

# Video Tutorial Catalog Import

本 skill 的正式产物不是一条未经审核的自动转写，而是一份共享同一 `tutorialId` 的联合入库 payload：

```text
一个 tutorialId
├── 视频：原视频元数据、校准字幕、可选时间轴
└── 文档：由校准字幕生成的 Markdown 教程、章节、步骤和注意事项
```

## 硬性流程

1. **先用 MCP 获取原始字幕**
   - 调用 `mcp__bilibili_video_info_mcp.get_subtitles`。
   - 保存 MCP 返回的完整原始 JSON，并明确保留 `source: "bilibili-video-info-mcp"`；入库脚本会拒绝任何其他来源。
   - `lan`/`content` 不得直接公开为正式字幕或文档。
   - 不下载原视频，不调用 `yt-dlp`、Whisper、FFmpeg、FFprobe 或任何本地/外部语音识别模型。
2. **由 Codex 校准字幕**
   - 校准 Betaflight、FPV、遥控协议、飞控模式、参数和界面术语。
   - 修复明显 ASR 同音词、中文断句、重复句和语义错误。
   - 只修正视频实际表达的内容，不补写视频未确认的默认值、固件版本、硬件兼容性或操作步骤。
   - 输出 `language: zh-CN` 和结构化 `lines`，原始字幕必须同时保留。
3. **可选对齐官方时间轴**
   - 如果能取得 Bilibili 官方 VTT/SRT，则按字幕文本可靠对齐。
   - 对齐失败或没有官方时间轴时，`segments` 和章节不填写猜测时间；仍然允许入库。
4. **生成 Markdown 文档**
   - 文档只能基于校准字幕和 Bilibili 元数据生成，禁止直接引用 MCP 原文。
   - 固定包含以下二级标题：
     - `本教程讲什么`
     - `适用场景与前置条件`
     - `操作步骤`
     - `Betaflight 参数与界面说明`
     - `常见错误与注意事项`
     - `术语表`
     - `视频章节`
     - `来源`
   - 每个视频生成一篇正式文档；文档语言简洁、可执行。
   - 未能从视频确认的参数必须写“视频未明确说明”，不能擅自补充。
   - 文末保留原视频链接和作者信息；不得出现 MCP、内部流程或模型提示词。
5. **生成章节、分类和标签**
   - 章节按视频实际内容划分；每章应包含目标、步骤和注意事项。
   - 只有存在可靠官方时间轴时才添加 `startSeconds`/`endSeconds`。
   - 分类使用现有 Betaflight 分类 ID；标签必须来自校准后内容。
6. **校验一致性并联合入库**
   - 视频、原始字幕、校准字幕、文档和章节必须共享 `tutorialId=bilibili-<BV号>`。
   - `document.markdown` 只能是校准后文档；文档不能为空，必须有标题和正文章节。
   - 校验文档没有明显未校准 ASR 词，章节没有越界或倒置时间。
   - 重复 BV 号拒绝重复入库。
   - 如果服务端已有旧版视频记录但没有文档，不绕过重复检查创建第二条视频；重新用 Bilibili MCP 获取原始字幕后，使用服务端提供的迁移/更新接口补齐同一 `tutorialId` 的文档。
   - 文档生成失败或服务端拒绝时，不发布半成品；脚本保留可重试的校准 payload。
7. **等待服务端索引任务完成**
   - 使用私有 `/tutorials/ingest` 提交联合 payload。
   - 轮询 `/tutorials/ingest/:jobId`，直到 `completed`/`published`；失败即任务失败。

## 推荐脚本

脚本只处理字幕、校准结果、可选官方时间轴、Markdown、Bilibili 元数据和私有入库 API：

```bash
node .codex/skills/video-tutorial-catalog-import/scripts/ingest_bilibili_tutorial.mjs \
  --url 'https://www.bilibili.com/video/BV…/' \
  --raw-subtitles raw-subtitles.json \
  --calibrated-subtitles calibrated.json \
  --document tutorial.md \
  --chapters chapters.json \
  --dry-run
```

脚本不会要求：

- `yt-dlp`、视频下载或 Cookie；
- `ffmpeg`、`ffprobe` 或音频解析；
- Whisper、任何本地模型或外部语音转写 API；
- 分类模型 API Key；
- 外部模型直接生成正式教程文本。

去掉 `--dry-run`/改用 `--no-publish` 前，必须确认 payload。正式发布需要仅保存在本机环境变量中的：

```text
TUTORIAL_API_BASE_URL
TUTORIAL_INGEST_TOKEN
```

禁止把 Token、Cookie、模型、原视频或 `.env` 写入仓库。

## API 数据约定

联合 payload 至少包含：

```json
{
  "tutorialId": "bilibili-BVxxxxxxxxxx",
  "video": { "bvid": "BVxxxxxxxxxx", "sourceUrl": "...", "embedUrl": "..." },
  "subtitle": {
    "raw": { "source": "bilibili-video-info-mcp", "language": "ai-zh", "lines": [] },
    "calibrated": { "language": "zh-CN", "lines": [] }
  },
  "segments": [],
  "document": {
    "format": "markdown",
    "title": "教程标题",
    "markdown": "# 教程标题\n\n...",
    "version": 1,
    "source": "calibrated-subtitle",
    "chapters": []
  },
  "categories": [],
  "tags": [],
  "classification": { "needsReview": false, "reviewReason": "" }
}
```

目录只返回文档摘要，不返回完整 Markdown：

```json
{
  "id": "bilibili-BVxxxxxxxxxx",
  "document": {
    "available": true,
    "title": "教程标题",
    "url": "/api/tutorials/bilibili-BVxxxxxxxxxx/document",
    "version": 1
  }
}
```

只读文档接口：`GET /api/tutorials/:tutorialId/document`。
搜索结果中的 `contentType` 只能是 `video_transcript` 或 `document`，但两者始终回到同一个 `tutorialId`，前端合并展示“视频字幕/教程文档”来源。

## 前端验收

视频卡片和搜索结果应提供“观看视频”和“阅读文档”；文档阅读必须用现有 `marked` 生成 HTML，再用 `DOMPurify` 清理后渲染。文档接口失败时保留视频入口并显示中文错误。没有可靠时间轴时不得显示跳转时间。

## 验证

```bash
python /Users/lihao/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  .codex/skills/video-tutorial-catalog-import

python /Users/lihao/.codex/skills/.system/skill-creator/scripts/generate_openai_yaml.py \
  .codex/skills/video-tutorial-catalog-import

PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH" \
  yarn vitest run \
  test/js/videoTutorials.test.js \
  test/components/VideoTutorialSearchPanel.test.js \
  test/tabs/VideoTutorialsTab.test.js \
  --reporter=dot
```
