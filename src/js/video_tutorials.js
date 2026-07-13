import catalog from "../data/video-tutorials.json";

export const VIDEO_TUTORIALS_OPEN_EVENT = "video-tutorials:open";
export const VIDEO_TUTORIAL_SEARCH_EVENT = "video-tutorials:search";

const categoryIds = new Set(catalog.categories.map((category) => category.id));
let requestedCategoryId = null;

function normalizeSearchText(value) {
    return String(value ?? "")
        .trim()
        .toLocaleLowerCase();
}

function getSearchableText(video) {
    return [video.title, video.description, ...(video.tags ?? [])].filter(Boolean).join(" ").toLocaleLowerCase();
}

export function getVideoTutorialCatalog() {
    return catalog;
}

export function getVideoTutorialCategories() {
    return catalog.categories;
}

export function isVideoTutorialCategory(categoryId) {
    return categoryIds.has(categoryId);
}

export function getVideosByCategory(categoryId) {
    if (!isVideoTutorialCategory(categoryId)) {
        return [];
    }

    return catalog.videos.filter((video) => video.categoryId === categoryId);
}

export function filterVideoTutorials(videos, { search = "", categoryId = null } = {}) {
    const normalizedSearch = normalizeSearchText(search);

    return videos.filter((video) => {
        const matchesCategory = !categoryId || video.categoryId === categoryId;
        const matchesSearch = !normalizedSearch || getSearchableText(video).includes(normalizedSearch);

        return matchesCategory && matchesSearch;
    });
}

export function isVideoTutorialEmbeddable(video) {
    return Boolean(video?.embedUrl && /^https:\/\//i.test(video.embedUrl));
}

/**
 * Normalizes platform player URLs for their actual rendering mode.
 *
 * Douyin's official player falls back to a fixed 324 × 672 mobile canvas
 * when no dimensions are supplied. That leaves a large blank area whenever
 * the host iframe is sized by the card or floating-player layout. Let the
 * official mobile player use the iframe's available dimensions instead.
 */
export function getVideoTutorialEmbedUrl(video) {
    try {
        const url = new URL(video?.embedUrl);
        url.searchParams.set("autoplay", "0");

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

/**
 * Returns the referrer policy required by the platform's supported embed.
 * Keep every tutorial player on the same policy so the catalog page and the
 * global search panel behave identically.
 */
export function getVideoTutorialEmbedReferrerPolicy(video) {
    return video?.platform === "douyin" ? "unsafe-url" : "strict-origin-when-cross-origin";
}

export function consumeRequestedVideoTutorialCategory() {
    const categoryId = requestedCategoryId;
    requestedCategoryId = null;
    return categoryId;
}

/**
 * Opens the tutorial center and optionally focuses a category.
 * Existing configuration pages can import this function when their contextual
 * tutorial entries are added in a future change.
 */
export function openVideoTutorials(categoryId = null) {
    if (categoryId && !isVideoTutorialCategory(categoryId)) {
        return false;
    }

    requestedCategoryId = categoryId;

    if (typeof document === "undefined") {
        return true;
    }

    const tutorialLinks = [...document.querySelectorAll("#tabs .tab_video_tutorials a")];
    const isTutorialTabActive = tutorialLinks.some((link) => link.closest("li")?.classList.contains("active"));

    if (isTutorialTabActive) {
        document.dispatchEvent(new CustomEvent(VIDEO_TUTORIALS_OPEN_EVENT, { detail: { categoryId } }));
    } else {
        tutorialLinks[0]?.click();
    }

    return true;
}
