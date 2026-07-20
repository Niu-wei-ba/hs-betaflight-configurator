import { buildApiUrl } from "./AppConfig";

export const VIDEO_TUTORIALS_OPEN_EVENT = "video-tutorials:open";
export const VIDEO_TUTORIAL_DOCUMENT_OPEN_EVENT = "video-tutorials:document-open";
export const VIDEO_TUTORIAL_SEARCH_EVENT = "video-tutorials:search";

const emptyCatalog = Object.freeze({ categories: [], videos: [] });
let catalog = emptyCatalog;
let catalogLoadPromise = null;
let catalogError = null;
let requestedCategoryId = null;
const catalogListeners = new Set();

function normalizeSearchText(value) {
    return String(value ?? "")
        .trim()
        .toLocaleLowerCase();
}

/**
 * A technical identifier such as Zadig, CRSF, SBUS, or ICM-42688-P must be
 * present in the returned content. This client-side guard keeps an older API
 * that only has vector search from showing unrelated Top-N results while the
 * server is being rolled out.
 */
function getTechnicalSearchTokens(query) {
    return (
        normalizeSearchText(query)
            .match(/[a-z][a-z0-9._+-]*/g)
            ?.filter((token) => token.length >= 2) ?? []
    );
}

function matchesTechnicalSearch(result, tokens) {
    if (!tokens.length) return true;
    const searchable = [
        result.title,
        result.description,
        result.matchedText,
        result.document?.title,
        ...(result.tags ?? []),
    ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
    return tokens.every((token) => searchable.includes(token));
}

function normalizeDocumentSummary(document, tutorialId) {
    if (!document || typeof document !== "object") return { available: false, title: "", url: "", version: null };
    return {
        available: Boolean(document.available ?? document.url ?? document.markdown),
        title: document.title || "",
        url: document.url || (tutorialId ? `/api/tutorials/${encodeURIComponent(tutorialId)}/document` : ""),
        version: Number.isFinite(Number(document.version)) ? Number(document.version) : null,
    };
}

function normalizeVideo(video = {}) {
    const videoCategories = Array.isArray(video.categories) ? video.categories : [];
    const tags = Array.isArray(video.tags)
        ? video.tags.map((tag) => (typeof tag === "string" ? tag : tag?.name)).filter(Boolean)
        : [];
    const tutorialId =
        video.tutorialId || (video.bvid ? `${video.platform || "bilibili"}-${video.bvid}` : null) || video.id;
    return {
        ...video,
        id: video.id || tutorialId,
        tutorialId,
        categoryId: videoCategories[0]?.id ?? (typeof videoCategories[0] === "string" ? videoCategories[0] : null),
        categoryIds: videoCategories
            .map((category) => (typeof category === "string" ? category : category.id))
            .filter(Boolean),
        categoryTitles: videoCategories
            .map((category) => (typeof category === "string" ? category : category.title))
            .filter(Boolean),
        tags,
        document: normalizeDocumentSummary(video.document, tutorialId),
        duration: formatTutorialDuration(video.durationSeconds ?? video.duration),
    };
}

function normalizeCatalog(nextCatalog) {
    const categories = Array.isArray(nextCatalog?.categories) ? nextCatalog.categories : [];
    const videos = Array.isArray(nextCatalog?.videos) ? nextCatalog.videos.map(normalizeVideo) : [];
    return { categories, videos };
}

function notifyCatalogListeners() {
    const snapshot = getVideoTutorialCatalog();
    catalogListeners.forEach((listener) => listener(snapshot, catalogError));
}

export function subscribeVideoTutorialCatalog(listener) {
    catalogListeners.add(listener);
    return () => catalogListeners.delete(listener);
}

export async function loadVideoTutorialCatalog({ force = false, fetchImpl = fetch } = {}) {
    if (catalogLoadPromise && !force) return catalogLoadPromise;
    if (catalog.videos.length && !force) return catalog;
    catalogError = null;
    catalogLoadPromise = fetchImpl(buildApiUrl("/tutorials/catalog"), { headers: { Accept: "application/json" } })
        .then(async (response) => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body?.error || "视频教程目录加载失败。");
            catalog = normalizeCatalog(body);
            notifyCatalogListeners();
            return catalog;
        })
        .catch((error) => {
            catalogError = error instanceof Error ? error : new Error("视频教程目录加载失败。");
            notifyCatalogListeners();
            throw catalogError;
        })
        .finally(() => {
            catalogLoadPromise = null;
        });
    return catalogLoadPromise;
}

export async function loadVideoTutorialDocument(tutorialId, { fetchImpl = fetch } = {}) {
    if (!tutorialId) throw new Error("缺少教程 ID，无法加载文档。");
    const response = await fetchImpl(buildApiUrl(`/tutorials/${encodeURIComponent(tutorialId)}/document`), {
        headers: { Accept: "application/json" },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || "教程文档加载失败。");
    return {
        ...body,
        tutorialId: body.tutorialId || tutorialId,
        title: body.title || "教程文档",
        format: body.format || "markdown",
        markdown: typeof body.markdown === "string" ? body.markdown : "",
        chapters: Array.isArray(body.chapters) ? body.chapters : [],
        version: Number.isFinite(Number(body.version)) ? Number(body.version) : 1,
    };
}

function normalizeSearchResult(result) {
    const video = normalizeVideo(result?.video || result);
    const contentType = result?.contentType === "document" ? "document" : "video_transcript";
    const document = normalizeDocumentSummary(result?.document || video.document, video.tutorialId);
    const startSeconds = result?.startSeconds ?? null;
    const endSeconds = result?.endSeconds ?? null;
    return {
        ...video,
        document,
        contentType,
        sourceLabel: contentType === "document" ? "教程文档" : "视频字幕",
        contentTypes: [contentType],
        sourceLabels: [contentType === "document" ? "教程文档" : "视频字幕"],
        description: result?.text || video.description || "",
        matchedText: result?.text || "",
        startSeconds,
        endSeconds,
        timeRange: formatTutorialTimeRange(startSeconds, endSeconds),
        similarity: result?.similarity,
    };
}

function mergeSearchResults(results) {
    const merged = new Map();
    for (const result of results) {
        const key = result.tutorialId || result.id;
        const previous = merged.get(key);
        if (!previous) {
            merged.set(key, result);
            continue;
        }
        const contentTypes = [...new Set([...previous.contentTypes, ...result.contentTypes])];
        const sourceLabels = [...new Set([...previous.sourceLabels, ...result.sourceLabels])];
        merged.set(key, {
            ...previous,
            contentTypes,
            sourceLabels,
            matchedText: [previous.matchedText, result.matchedText].filter(Boolean).join("；"),
            description: [previous.description, result.description].filter(Boolean).join("；"),
            startSeconds: previous.startSeconds ?? result.startSeconds,
            endSeconds: previous.endSeconds ?? result.endSeconds,
            timeRange: previous.timeRange || result.timeRange,
            similarity: Math.max(Number(previous.similarity ?? 0), Number(result.similarity ?? 0)),
            document: result.document.available ? result.document : previous.document,
        });
    }
    return [...merged.values()];
}

export async function searchVideoTutorials({ query, categoryIds = [], tags = [], limit = 12, fetchImpl = fetch } = {}) {
    const response = await fetchImpl(buildApiUrl("/tutorials/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, categoryIds, tags, limit }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || "视频教程语义搜索失败。");
    const results = mergeSearchResults((Array.isArray(body.results) ? body.results : []).map(normalizeSearchResult));
    const technicalTokens = getTechnicalSearchTokens(query);
    return {
        query: body.query || query,
        results: results.filter((result) => matchesTechnicalSearch(result, technicalTokens)),
    };
}

export function getVideoTutorialCatalog() {
    return catalog;
}
export function getVideoTutorialCatalogError() {
    return catalogError;
}
export function getVideoTutorialCategories() {
    return catalog.categories;
}
export function isVideoTutorialCategory(categoryId) {
    return catalog.categories.some((category) => category.id === categoryId);
}
export function getVideosByCategory(categoryId) {
    if (!isVideoTutorialCategory(categoryId)) return [];
    return catalog.videos.filter((video) => video.categoryIds?.includes(categoryId));
}

export function filterVideoTutorials(videos, { search = "", categoryId = null } = {}) {
    const normalizedSearch = normalizeSearchText(search);
    return videos.filter((video) => {
        const searchable = [video.title, video.description, ...(video.tags ?? []), ...(video.categoryTitles ?? [])]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase();
        return (
            (!categoryId || video.categoryIds?.includes(categoryId)) &&
            (!normalizedSearch || searchable.includes(normalizedSearch))
        );
    });
}

export function formatTutorialDuration(seconds) {
    if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return "";
    const total = Math.floor(Number(seconds));
    const minutes = Math.floor(total / 60);
    const remainder = String(total % 60).padStart(2, "0");
    return `${minutes}:${remainder}`;
}

export function formatTutorialTimeRange(startSeconds, endSeconds) {
    const start = formatTutorialDuration(startSeconds);
    const end = formatTutorialDuration(endSeconds);
    return start && end ? `${start}–${end}` : "";
}

export function isVideoTutorialEmbeddable(video) {
    return Boolean(video?.embedUrl && /^https:\/\//i.test(video.embedUrl));
}

export function getVideoTutorialSourceUrl(video) {
    return video?.sourceUrl || "";
}

export function getVideoTutorialEmbedUrl(video, { autoplay = false } = {}) {
    try {
        const url = new URL(video?.embedUrl);
        url.searchParams.set("autoplay", autoplay ? "1" : "0");
        if (video?.platform === "douyin" && url.hostname === "open.douyin.com") {
            url.searchParams.set("mode", "mobile");
            url.searchParams.set("width", "100%");
            url.searchParams.set("height", "100%");
        }
        return url.toString();
    } catch {
        return "";
    }
}

export function getVideoTutorialEmbedReferrerPolicy(video) {
    return video?.platform === "douyin" ? "unsafe-url" : "strict-origin-when-cross-origin";
}
export function consumeRequestedVideoTutorialCategory() {
    const categoryId = requestedCategoryId;
    requestedCategoryId = null;
    return categoryId;
}

export function openVideoTutorialDocument(tutorialId) {
    if (!tutorialId) return false;
    if (typeof document !== "undefined")
        document.dispatchEvent(new CustomEvent(VIDEO_TUTORIAL_DOCUMENT_OPEN_EVENT, { detail: { tutorialId } }));
    return true;
}

export function openVideoTutorials(categoryId = null) {
    if (categoryId && catalog.categories.length && !isVideoTutorialCategory(categoryId)) return false;
    requestedCategoryId = categoryId;
    if (typeof document === "undefined") return true;
    const tutorialLinks = [...document.querySelectorAll("#tabs .tab_video_tutorials a")];
    const isTutorialTabActive = tutorialLinks.some((link) => link.closest("li")?.classList.contains("active"));
    if (isTutorialTabActive)
        document.dispatchEvent(new CustomEvent(VIDEO_TUTORIALS_OPEN_EVENT, { detail: { categoryId } }));
    else tutorialLinks[0]?.click();
    return true;
}
