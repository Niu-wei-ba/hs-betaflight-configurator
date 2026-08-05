#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_OPTIONS = ["url", "id", "category", "description", "tags"];
const VALUE_OPTIONS = new Set([...REQUIRED_OPTIONS, "title", "catalog"]);
const FLAG_OPTIONS = new Set(["dry-run", "help"]);

function printUsage() {
    console.log(`
Add one Bilibili tutorial to the Betaflight Configurator catalog.

Usage:
  node add_bilibili_tutorial.mjs \\
    --url <Bilibili-video-URL-or-BV-ID> \\
    --id <stable-kebab-case-id> \\
    --category <catalog-category-id> \\
    --description <curated-Chinese-summary> \\
    --tags <comma-separated-tags> \\
    [--title <override-title>] \\
    [--catalog <path-to-video-tutorials.json>] \\
    [--dry-run]

Example:
  node .codex/skills/video-tutorial-catalog-import/scripts/add_bilibili_tutorial.mjs \\
    --url https://www.bilibili.com/video/BV1bACPYzEcw/ \\
    --id bilibili-dji-fpv-sbus-receiver-fix \\
    --category receiver \\
    --description '解决大疆 FPV 接收机的 SBUS 配置页面无响应问题。' \\
    --tags '接收机,SBUS,大疆FPV,遥控器,Betaflight' \\
    --dry-run
`);
}

function parseArgs(argv) {
    const options = {};

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        if (!argument.startsWith("--")) {
            throw new Error(`Unexpected argument: ${argument}`);
        }

        const key = argument.slice(2);
        if (FLAG_OPTIONS.has(key)) {
            options[key] = true;
            continue;
        }
        if (!VALUE_OPTIONS.has(key)) {
            throw new Error(`Unknown option: --${key}`);
        }

        const value = argv[index + 1];
        if (!value || value.startsWith("--")) {
            throw new Error(`Missing value for --${key}`);
        }
        options[key] = value;
        index += 1;
    }

    return options;
}

function extractBvid(input) {
    const match = String(input).match(/(BV[0-9A-Za-z]{10})/i);
    if (!match) {
        throw new Error("Could not find a valid BV ID in --url.");
    }
    return match[1];
}

function formatDuration(seconds) {
    const duration = Number(seconds);
    if (!Number.isFinite(duration) || duration < 0) {
        throw new Error("Bilibili returned an invalid video duration.");
    }

    const totalSeconds = Math.round(duration);
    const minutes = Math.floor(totalSeconds / 60);
    const remainder = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${remainder}`;
}

function normalizeTags(value) {
    const tags = value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

    if (!tags.length) {
        throw new Error("--tags must contain at least one comma-separated tag.");
    }

    return [...new Set(tags)];
}

function requireOptions(options) {
    for (const option of REQUIRED_OPTIONS) {
        if (!options[option]?.trim()) {
            throw new Error(`--${option} is required.`);
        }
    }
}

async function fetchVideoMetadata(bvid) {
    const endpoint = new URL("https://api.bilibili.com/x/web-interface/view");
    endpoint.searchParams.set("bvid", bvid);

    const response = await fetch(endpoint, {
        headers: { "User-Agent": "betaflight-configurator-video-catalog/1.0" },
    });
    if (!response.ok) {
        throw new Error(`Bilibili metadata request failed with HTTP ${response.status}.`);
    }

    const payload = await response.json();
    if (payload.code !== 0 || !payload.data) {
        throw new Error(`Bilibili metadata request failed: ${payload.message ?? "unknown error"}`);
    }

    return payload.data;
}

function buildVideo(options, metadata, bvid) {
    if (!metadata.aid || !metadata.cid || !metadata.pic) {
        throw new Error("Bilibili metadata is missing an aid, cid, or thumbnail.");
    }

    const authorName = metadata.owner?.name?.trim();
    const authorAvatarUrl = metadata.owner?.face?.replace(/^http:\/\//i, "https://");

    return {
        id: options.id.trim(),
        categoryId: options.category.trim(),
        platform: "bilibili",
        title: (options.title ?? metadata.title).trim(),
        description: options.description.trim(),
        tags: normalizeTags(options.tags),
        sourceUrl: `https://www.bilibili.com/video/${bvid}/`,
        embedUrl: `https://player.bilibili.com/player.html?isOutside=true&aid=${metadata.aid}&bvid=${bvid}&cid=${metadata.cid}&p=1&autoplay=0`,
        thumbnailUrl: metadata.pic.replace(/^http:\/\//i, "https://"),
        duration: formatDuration(metadata.duration),
        ...(authorName ? { authorName } : {}),
        ...(authorAvatarUrl ? { authorAvatarUrl } : {}),
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printUsage();
        return;
    }

    requireOptions(options);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.id.trim())) {
        throw new Error("--id must be a lowercase kebab-case identifier.");
    }

    const catalogPath = path.resolve(options.catalog ?? "src/data/video-tutorials.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    const bvid = extractBvid(options.url);
    const metadata = await fetchVideoMetadata(bvid);
    const video = buildVideo(options, metadata, bvid);

    const categoryIds = new Set(catalog.categories?.map((category) => category.id));
    if (!categoryIds.has(video.categoryId)) {
        throw new Error(`Unknown category "${video.categoryId}". Use one of: ${[...categoryIds].join(", ")}`);
    }
    if (catalog.videos?.some((item) => item.id === video.id)) {
        throw new Error(`A video with id "${video.id}" already exists.`);
    }
    if (catalog.videos?.some((item) => item.sourceUrl === video.sourceUrl)) {
        throw new Error(`The Bilibili video ${bvid} is already catalogued.`);
    }

    if (options["dry-run"]) {
        console.log(JSON.stringify(video, null, 2));
        console.log(`Dry run: would append this video to ${catalogPath}`);
        return;
    }

    catalog.videos.push(video);
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 4)}\n`, "utf8");
    console.log(`Added ${video.id} to ${catalogPath}`);
}

main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
});
