#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_OPTIONS = ["platform", "url", "id", "category", "title", "description", "tags", "duration"];
const VALUE_OPTIONS = new Set([...REQUIRED_OPTIONS, "author", "avatar", "thumbnail", "catalog"]);
const FLAG_OPTIONS = new Set(["dry-run", "help"]);
const SUPPORTED_PLATFORMS = new Set(["douyin"]);

function printUsage() {
    console.log(`
Add a tutorial from a supported non-Bilibili platform.

Usage:
  node add_external_tutorial.mjs \\
    --platform douyin \\
    --url <canonical-video-URL> \\
    --id <stable-kebab-case-id> \\
    --category <catalog-category-id> \\
    --title <video-title> \\
    --description <curated-Chinese-summary> \\
    --tags <comma-separated-tags> \\
    --duration <m:ss> \\
    [--author <author-name>] \\
    [--avatar <https-avatar-URL>] \\
    [--thumbnail <https-thumbnail-URL>] \\
    [--catalog <path-to-video-tutorials.json>] \\
    [--dry-run]

For Douyin, the script requests the official Open Platform iframe API and stores its returned player URL.
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

function requireOptions(options) {
    for (const option of REQUIRED_OPTIONS) {
        if (!options[option]?.trim()) {
            throw new Error(`--${option} is required.`);
        }
    }
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

function requireHttpsUrl(value, option) {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:") {
            throw new Error();
        }
        return url.toString();
    } catch {
        throw new Error(`--${option} must be an HTTPS URL.`);
    }
}

async function getDouyinEmbed(sourceUrl) {
    const url = new URL(sourceUrl);
    const videoId = url.hostname === "www.douyin.com" ? url.pathname.match(/^\/video\/(\d+)$/)?.[1] : undefined;
    if (!videoId) {
        throw new Error("Douyin URL must use https://www.douyin.com/video/<id>.");
    }

    const response = await fetch(
        `https://open.douyin.com/api/douyin/v1/video/get_iframe_by_video?video_id=${videoId}`,
    );
    const payload = await response.json();
    const iframeCode = payload?.data?.iframe_code;
    const embedUrl = iframeCode?.match(/\ssrc="([^"]+)"/i)?.[1];

    if (!response.ok || payload?.err_no !== 0 || !embedUrl) {
        throw new Error("Douyin official iframe API did not return an embeddable player URL.");
    }

    return requireHttpsUrl(embedUrl, "official Douyin embed URL");
}

async function buildVideo(options) {
    const platform = options.platform.trim().toLowerCase();
    if (!SUPPORTED_PLATFORMS.has(platform)) {
        throw new Error(`Unsupported platform "${platform}". Use one of: ${[...SUPPORTED_PLATFORMS].join(", ")}`);
    }

    if (!/^\d+:\d{2}$/.test(options.duration.trim())) {
        throw new Error("--duration must use m:ss format.");
    }

    const sourceUrl = requireHttpsUrl(options.url.trim(), "url");
    const embedUrl = platform === "douyin" ? await getDouyinEmbed(sourceUrl) : undefined;

    return {
        id: options.id.trim(),
        categoryId: options.category.trim(),
        platform,
        title: options.title.trim(),
        description: options.description.trim(),
        tags: normalizeTags(options.tags),
        sourceUrl,
        ...(embedUrl ? { embedUrl } : {}),
        duration: options.duration.trim(),
        ...(options.thumbnail ? { thumbnailUrl: requireHttpsUrl(options.thumbnail.trim(), "thumbnail") } : {}),
        ...(options.author ? { authorName: options.author.trim() } : {}),
        ...(options.avatar ? { authorAvatarUrl: requireHttpsUrl(options.avatar.trim(), "avatar") } : {}),
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
    const video = await buildVideo(options);
    const categoryIds = new Set(catalog.categories?.map((category) => category.id));

    if (!categoryIds.has(video.categoryId)) {
        throw new Error(`Unknown category "${video.categoryId}". Use one of: ${[...categoryIds].join(", ")}`);
    }
    if (catalog.videos?.some((item) => item.id === video.id)) {
        throw new Error(`A video with id "${video.id}" already exists.`);
    }
    if (catalog.videos?.some((item) => item.sourceUrl === video.sourceUrl)) {
        throw new Error(`The source video ${video.sourceUrl} is already catalogued.`);
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
