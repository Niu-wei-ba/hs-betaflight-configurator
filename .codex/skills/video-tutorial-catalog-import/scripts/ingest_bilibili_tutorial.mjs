#!/usr/bin/env node

/**
 * Build and optionally publish one Bilibili video + calibrated Markdown tutorial.
 *
 * This script deliberately does not download media or invoke Whisper/ffmpeg. The
 * caller supplies the complete preserved Bilibili MCP subtitle response, plus
 * calibrated subtitle JSON and a Markdown document.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const REQUIRED_DOCUMENT_HEADINGS = [
    "本教程讲什么",
    "适用场景与前置条件",
    "操作步骤",
    "Betaflight 参数与界面说明",
    "常见错误与注意事项",
    "术语表",
    "视频章节",
    "来源",
];

// These are common, high-confidence ASR artefacts observed in the previous
// workflow. They are guardrails, not an automatic correction mechanism.
const OBVIOUS_RAW_TERMS = [
    "HENRY",
    "phil safe",
    "BIOCF",
    "hat free",
    "deeper",
    "WIL",
    "web box",
    "PAID",
    "AUS",
    "Peach royu",
    "Playbower after crash",
    "ram预解锁",
    "peter mod",
    "paralyzed",
    "a zero trainer",
];

class IngestError extends Error {}

function parseArgs(argv) {
    const options = {};
    const flags = new Set(["dry-run", "help", "no-publish", "migrate-existing"]);
    const values = new Set([
        "url",
        "raw-subtitles",
        "calibrated-subtitles",
        "official-subtitles",
        "document",
        "chapters",
        "metadata",
        "title",
        "description",
        "categories",
        "tags",
        "version",
        "classification",
        "api-base-url",
        "token",
        "output",
        "retry-output",
        "poll-interval",
        "poll-timeout",
    ]);

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (!argument.startsWith("--")) throw new IngestError(`Unexpected argument: ${argument}`);
        const key = argument.slice(2);
        if (flags.has(key)) {
            options[key] = true;
            continue;
        }
        if (!values.has(key)) throw new IngestError(`Unknown option: --${key}`);
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) throw new IngestError(`Missing value for --${key}`);
        options[key] = value;
        index += 1;
    }
    return options;
}

function printUsage() {
    console.log(`
使用保留的原始字幕、Codex 校准字幕和 Markdown 文档联合入库一个 Bilibili 教程。

必填：
  --url <Bilibili URL 或 BV 号>
  --raw-subtitles <Bilibili MCP 返回的完整原始字幕 JSON>
  --calibrated-subtitles <Codex 校准字幕 JSON>
  --document <校准后的 Markdown 文件>

可选：
  --official-subtitles <官方 VTT/SRT>   用于可靠时间轴对齐；不提供则不生成时间
  --chapters <章节 JSON>               [{"title","startSeconds","endSeconds","goal"}]
  --metadata <Bilibili metadata JSON>  不提供则读取 Bilibili公开 API
  --categories <逗号分隔分类>
  --tags <逗号分隔标签>
  --title <覆盖标题>
  --description <校准后的简介>
  --version <字幕/文档校准版本，默认 1>
  --output <保存联合 payload JSON>
  --dry-run                            只构建并打印 payload，不调用入库 API
  --no-publish                         只构建 payload，不调用入库 API
  --migrate-existing                   显式迁移已有 BV 记录，不创建第二条视频（默认仍拒绝重复）

示例：
  node .codex/skills/video-tutorial-catalog-import/scripts/ingest_bilibili_tutorial.mjs \\
    --url 'https://www.bilibili.com/video/BV119jR6kEyG' \\
    --raw-subtitles raw.json \\
    --calibrated-subtitles calibrated.json \\
    --document tutorial.md \\
    --chapters chapters.json \\
    --dry-run
`);
}

function readJson(text, label) {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new IngestError(`${label} 不是有效 JSON：${error.message}`);
    }
}

async function readJsonFile(filePath, label) {
    try {
        return readJson(await readFile(filePath, "utf8"), label);
    } catch (error) {
        if (error instanceof IngestError) throw error;
        throw new IngestError(`无法读取${label}：${filePath}`);
    }
}

function extractBvid(input) {
    const match = String(input ?? "").match(/(BV[0-9A-Za-z]{10})/i);
    if (!match) throw new IngestError("链接未解析出有效 B 站 BV 号。");
    return match[1];
}

function canonicalSourceUrl(bvid) {
    return `https://www.bilibili.com/video/${bvid}/`;
}

function asTextLines(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split(/\r?\n/).filter(Boolean);
    return [];
}

function unwrapMcpPayload(payload) {
    if (!Array.isArray(payload)) return payload;
    const text = payload.find((item) => typeof item?.text === "string")?.text;
    if (!text) return payload;
    try { return JSON.parse(text); } catch { return payload; }
}

function normalizeSubtitleLines(payload, label) {
    payload = unwrapMcpPayload(payload);
    const source = payload?.content ?? payload?.lines ?? payload?.subtitle ?? payload;
    const lines = asTextLines(source)
        .map((line) => {
            if (typeof line === "string") return { text: line.trim() };
            if (!line || typeof line !== "object") return null;
            const text = String(line.text ?? line.content ?? "").trim();
            if (!text) return null;
            const normalized = { text };
            if (Number.isFinite(Number(line.startSeconds))) normalized.startSeconds = Number(line.startSeconds);
            if (Number.isFinite(Number(line.endSeconds))) normalized.endSeconds = Number(line.endSeconds);
            return normalized;
        })
        .filter(Boolean);
    if (!lines.length) throw new IngestError(`${label}为空，不能入库。`);
    return lines;
}

function normalizeLanguage(payload, fallback) {
    payload = unwrapMcpPayload(payload);
    return String(payload?.language ?? payload?.lan ?? fallback).trim() || fallback;
}

function normalizeMetadata(payload) {
    if (payload?.data && payload?.code !== undefined) return payload.data;
    return payload;
}

function normalizeRawSubtitle(payload) {
    payload = unwrapMcpPayload(payload);
    const source = String(payload?.source ?? "").trim();
    if (source !== "bilibili-video-info-mcp") {
        throw new IngestError("原始字幕必须显式标记为 bilibili-video-info-mcp；本地模型和旧版转写字幕不能入库。");
    }
    return {
        source,
        language: normalizeLanguage(payload, "ai-zh"),
        lines: normalizeSubtitleLines(payload, "原始字幕"),
    };
}

function normalizeCalibratedSubtitle(payload) {
    payload = unwrapMcpPayload(payload);
    return {
        language: normalizeLanguage(payload, "zh-CN"),
        lines: normalizeSubtitleLines(payload, "校准字幕"),
        version: Number.isInteger(Number(payload?.version)) ? Number(payload.version) : undefined,
    };
}

function normalizePlainText(value) {
    return String(value ?? "")
        .toLocaleLowerCase()
        .replace(/[“”‘’'"`，。！？、：；（）()\[\]{}<>《》\-_/\\|]/g, "")
        .replace(/\s+/g, "");
}

function parseTimestamp(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const match = String(value ?? "").trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
    if (!match) return null;
    const hours = Number(match[1] ?? 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const millis = Number((match[4] ?? "").padEnd(3, "0")) || 0;
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function parseTimedSubtitle(text, formatHint = "") {
    const input = String(text ?? "").replace(/\r/g, "");
    const blocks = input.split(/\n\s*\n/);
    const timed = [];
    for (const block of blocks) {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        const timingIndex = lines.findIndex((line) => /\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}\s*-->/.test(line));
        if (timingIndex < 0) continue;
        const timing = lines[timingIndex].match(/(.+?)\s*-->\s*(.+?)(?:\s+.*)?$/);
        if (!timing) continue;
        const startSeconds = parseTimestamp(timing[1]);
        const endSeconds = parseTimestamp(timing[2]);
        const subtitleText = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, "").trim();
        if (startSeconds === null || endSeconds === null || !subtitleText) continue;
        timed.push({ startSeconds, endSeconds, text: subtitleText });
    }
    if (!timed.length) throw new IngestError(`官方 ${formatHint || "VTT/SRT"} 字幕没有可识别的时间行。`);
    return timed;
}

function similarity(a, b) {
    const left = normalizePlainText(a);
    const right = normalizePlainText(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
    const leftChars = new Set(left);
    const rightChars = new Set(right);
    const intersection = [...leftChars].filter((char) => rightChars.has(char)).length;
    return intersection / new Set([...leftChars, ...rightChars]).size;
}

function alignCalibratedToOfficial(calibratedLines, officialLines) {
    const aligned = [];
    let cursor = 0;
    let totalScore = 0;
    for (const calibrated of calibratedLines) {
        let bestIndex = -1;
        let bestScore = 0;
        for (let index = cursor; index < officialLines.length; index += 1) {
            const score = similarity(calibrated.text, officialLines[index].text);
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
            if (score === 1) break;
        }
        if (bestIndex < 0 || bestScore < 0.38) return { reliable: false, lines: [], score: 0 };
        const official = officialLines[bestIndex];
        aligned.push({ ...calibrated, startSeconds: official.startSeconds, endSeconds: official.endSeconds });
        cursor = bestIndex + 1;
        totalScore += bestScore;
    }
    const score = aligned.length ? totalScore / aligned.length : 0;
    return { reliable: aligned.length === calibratedLines.length && score >= 0.58, lines: aligned, score };
}

function parseCsv(value) {
    return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function validateMarkdown(markdown, title, sourceUrl) {
    const text = String(markdown ?? "").trim();
    if (!text) throw new IngestError("Markdown 文档不能为空。");
    if (!/^#\s+\S+/m.test(text)) throw new IngestError("Markdown 必须包含一级标题。");
    if (title && !new RegExp(`^#\\s+${escapeRegExp(title.trim())}\\s*$`, "m").test(text)) {
        throw new IngestError("Markdown 一级标题必须与教程标题一致。");
    }
    const missing = REQUIRED_DOCUMENT_HEADINGS.filter((heading) => !new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "m").test(text));
    if (missing.length) throw new IngestError(`Markdown 缺少固定章节：${missing.join("、")}`);
    if (!text.includes(sourceUrl)) throw new IngestError("Markdown 来源章节必须保留原视频链接。");
    if (!/^###\s+\S+/m.test(text)) throw new IngestError("Markdown 至少需要一个正文章节。");
    for (const rawTerm of OBVIOUS_RAW_TERMS) {
        if (text.toLocaleLowerCase().includes(rawTerm.toLocaleLowerCase())) {
            throw new IngestError(`Markdown 疑似仍包含未校准 ASR 词：${rawTerm}`);
        }
    }
    return text;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeChapters(payload) {
    if (!payload) return [];
    const chapters = Array.isArray(payload) ? payload : payload.chapters;
    if (!Array.isArray(chapters)) throw new IngestError("章节 JSON 必须是数组或包含 chapters 数组。");
    return chapters.map((chapter, index) => {
        const hasStart = chapter.startSeconds !== null && chapter.startSeconds !== undefined && chapter.startSeconds !== "";
        const hasEnd = chapter.endSeconds !== null && chapter.endSeconds !== undefined && chapter.endSeconds !== "";
        const startSeconds = hasStart ? parseTimestamp(chapter.startSeconds) : null;
        const endSeconds = hasEnd ? parseTimestamp(chapter.endSeconds) : null;
        if (hasStart && startSeconds === null) throw new IngestError(`第 ${index + 1} 个章节的开始时间无效。`);
        if (hasEnd && endSeconds === null) throw new IngestError(`第 ${index + 1} 个章节的结束时间无效。`);
        if (startSeconds !== null && endSeconds !== null && startSeconds > endSeconds) throw new IngestError(`第 ${index + 1} 个章节时间范围倒置。`);
        const normalizeChapterList = (value) => {
            if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
            if (typeof value === "string" && value.trim()) return [value.trim()];
            return [];
        };
        return {
            title: String(chapter.title ?? `第 ${index + 1} 章`).trim(),
            goal: String(chapter.goal ?? "").trim(),
            steps: normalizeChapterList(chapter.steps),
            notes: normalizeChapterList(chapter.notes ?? chapter["注意事项"]),
            ...(startSeconds === null ? {} : { startSeconds }),
            ...(endSeconds === null ? {} : { endSeconds }),
        };
    });
}

function validateChapters(chapters, durationSeconds) {
    for (const chapter of chapters) {
        for (const key of ["startSeconds", "endSeconds"]) {
            if (chapter[key] === undefined) continue;
            if (!Number.isFinite(chapter[key]) || chapter[key] < 0 || (durationSeconds > 0 && chapter[key] > durationSeconds)) {
                throw new IngestError(`章节“${chapter.title}”引用了不存在的时间范围。`);
            }
        }
    }
}

function buildEmbedUrl(metadata, bvid) {
    if (!metadata?.aid || !metadata?.cid) throw new IngestError("Bilibili 元数据缺少 aid 或 cid，无法生成播放器地址。");
    return `https://player.bilibili.com/player.html?isOutside=true&aid=${metadata.aid}&bvid=${bvid}&cid=${metadata.cid}&p=1&autoplay=0`;
}

function formatDuration(seconds) {
    const value = Number(seconds);
    return Number.isFinite(value) && value >= 0 ? value : 0;
}

async function fetchMetadata(bvid) {
    const endpoint = new URL("https://api.bilibili.com/x/web-interface/view");
    endpoint.searchParams.set("bvid", bvid);
    const response = await fetch(endpoint, { headers: { "User-Agent": "betaflight-configurator-video-catalog/2.0" } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.code !== 0 || !body.data) throw new IngestError(`Bilibili 元数据获取失败：${body.message ?? response.status}`);
    return body.data;
}

function buildPayload({ options, bvid, metadata, rawSubtitle, calibratedSubtitle, markdown, chapters, segments }) {
    const tutorialId = `bilibili-${bvid}`;
    const title = String(options.title ?? metadata.title ?? "").trim();
    if (!title) throw new IngestError("教程标题不能为空。");
    const sourceUrl = canonicalSourceUrl(bvid);
    const version = Number(options.version ?? calibratedSubtitle.version ?? 1);
    if (!Number.isInteger(version) || version < 1) throw new IngestError("文档/字幕版本必须是正整数。");
    const categories = parseCsv(options.categories || "configuration,modes,adjustments");
    const tags = parseCsv(options.tags || "Betaflight,模式,调整");
    const authorName = metadata.owner?.name?.trim();
    const authorAvatarUrl = metadata.owner?.face?.replace(/^http:\/\//i, "https://");
    const durationSeconds = formatDuration(metadata.duration);
    validateChapters(chapters, durationSeconds);

    const video = {
        id: tutorialId,
        bvid,
        title,
        description: String(options.description ?? metadata.desc ?? "").trim(),
        sourceUrl,
        embedUrl: buildEmbedUrl(metadata, bvid),
        durationSeconds,
        ...(metadata.pic ? { thumbnailUrl: metadata.pic.replace(/^http:\/\//i, "https://") } : {}),
        ...(authorName ? { authorName } : {}),
        ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
        categories,
        tags,
    };

    return {
        tutorialId,
        video,
        subtitle: {
            raw: rawSubtitle,
            calibrated: {
                language: calibratedSubtitle.language,
                lines: calibratedSubtitle.lines,
                version,
            },
        },
        segments,
        documentId: `${tutorialId}-document`,
        document: {
            format: "markdown",
            title,
            markdown,
            version,
            source: "calibrated-subtitle",
            chapters,
        },
        categories,
        tags,
        classification: {
            needsReview: String(options.classification ?? "false") === "true",
            reviewReason: String(options.classification ?? "false") === "true" ? "提交方标记需要复核" : "",
        },
    };
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new IngestError(body.error || `服务端请求失败：HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return body;
}

async function assertNotDuplicate(baseUrl, token, bvid) {
    try {
        const body = await requestJson(`${baseUrl}/tutorials/ingest/videos/${bvid}`, { headers: { Authorization: `Bearer ${token}` } });
        if (body?.exists || body?.video || body?.tutorialId) throw new IngestError(`BV ${bvid} 已入库，拒绝重复生成视频和文档。`);
    } catch (error) {
        if (error.status === 404) return;
        throw error;
    }
}

async function publish(payload, options) {
    const baseUrl = String(options["api-base-url"] ?? process.env.TUTORIAL_API_BASE_URL ?? "").replace(/\/$/, "");
    const token = String(options.token ?? process.env.TUTORIAL_INGEST_TOKEN ?? "");
    if (!baseUrl || !token) throw new IngestError("缺少私有入库 API 配置：TUTORIAL_API_BASE_URL / TUTORIAL_INGEST_TOKEN。");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
    let endpoint = `${baseUrl}/tutorials/ingest`;
    if (options["migrate-existing"]) {
        endpoint = `${baseUrl}/tutorials/ingest/${encodeURIComponent(payload.tutorialId)}/migrate`;
    } else {
        await assertNotDuplicate(baseUrl, token, payload.video.bvid);
    }
    const result = await requestJson(endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
    if (!result.jobId) return result;
    const pollInterval = Math.max(250, Number(options["poll-interval"] ?? 2000));
    const timeout = Math.max(pollInterval, Number(options["poll-timeout"] ?? 120000));
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        const status = await requestJson(`${baseUrl}/tutorials/ingest/${encodeURIComponent(result.jobId)}`, { headers });
        const job = status.job ?? status;
        if (["completed", "succeeded", "success", "published"].includes(job.status)) return { ...result, job };
        if (["failed", "error", "rejected"].includes(job.status)) throw new IngestError(`服务端索引任务失败：${job.error ?? job.status}`);
    }
    throw new IngestError(`服务端索引任务在 ${timeout}ms 内未完成。`);
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.help) return printUsage();
    for (const required of ["url", "raw-subtitles", "calibrated-subtitles", "document"]) {
        if (!options[required]) throw new IngestError(`--${required} 是必填项。`);
    }

    const bvid = extractBvid(options.url);
    const rawSubtitle = normalizeRawSubtitle(await readJsonFile(options["raw-subtitles"], "原始字幕"));
    const calibratedSubtitle = normalizeCalibratedSubtitle(await readJsonFile(options["calibrated-subtitles"], "校准字幕"));
    const metadata = normalizeMetadata(options.metadata ? await readJsonFile(options.metadata, "Bilibili 元数据") : await fetchMetadata(bvid));
    if (!metadata || typeof metadata !== "object") throw new IngestError("Bilibili 元数据格式无效。");
    const documentTitle = String(options.title ?? metadata.title ?? "").trim();
    const markdown = validateMarkdown(await readFile(options.document, "utf8"), documentTitle, canonicalSourceUrl(bvid));

    let segments = [];
    let calibratedLines = calibratedSubtitle.lines;
    if (options["official-subtitles"]) {
        const officialText = await readFile(options["official-subtitles"], "utf8");
        const officialLines = parseTimedSubtitle(officialText, path.extname(options["official-subtitles"]).slice(1));
        const alignment = alignCalibratedToOfficial(calibratedSubtitle.lines, officialLines);
        if (alignment.reliable) {
            calibratedLines = alignment.lines;
            segments = alignment.lines.map(({ text, startSeconds, endSeconds }) => ({ text, startSeconds, endSeconds }));
        } else {
            console.warn("警告：官方时间轴与校准字幕无法可靠对齐，将无时间轴入库，不会伪造时间。");
        }
    }
    const chapters = options.chapters ? normalizeChapters(await readJsonFile(options.chapters, "章节")) : [];
    const payload = buildPayload({
        options,
        bvid,
        metadata,
        rawSubtitle,
        calibratedSubtitle: { ...calibratedSubtitle, lines: calibratedLines },
        markdown,
        chapters,
        segments,
    });
    if (options.output) {
        await mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
        await writeFile(options.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    }
    if (options["dry-run"] || options["no-publish"]) {
        console.log(JSON.stringify(payload, null, 2));
        return payload;
    }
    try {
        const result = await publish(payload, options);
        console.log(JSON.stringify({ tutorialId: payload.tutorialId, published: true, result }, null, 2));
        return payload;
    } catch (error) {
        const retryPath = options["retry-output"] || `./.video-ingest-retry/${payload.tutorialId}.calibrated.json`;
        await mkdir(path.dirname(path.resolve(retryPath)), { recursive: true });
        await writeFile(retryPath, `${JSON.stringify({ ...payload, _retry: { error: error.message, createdAt: new Date().toISOString() } }, null, 2)}\n`, "utf8");
        throw error;
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(async (error) => {
        console.error(`入库失败：${error.message}`);
        process.exitCode = 1;
    });
}

export {
    OBVIOUS_RAW_TERMS,
    alignCalibratedToOfficial,
    buildPayload,
    extractBvid,
    parseArgs,
    normalizeCalibratedSubtitle,
    normalizeMetadata,
    normalizeRawSubtitle,
    normalizeChapters,
    parseTimedSubtitle,
    validateChapters,
    validateMarkdown,
};
