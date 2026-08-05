import { reactive } from "vue";
import { getVideoTutorialEmbedUrl } from "./video_tutorials";

const viewportMargin = 16;

export const videoTutorialFloatingPlayer = reactive({
    video: null,
    x: null,
    y: null,
    width: null,
});

export function isFloatingVideoTutorial(videoId) {
    return videoTutorialFloatingPlayer.video?.id === videoId;
}

/**
 * Whether the persistent floating player currently owns an embedded video.
 * Inline embeds must yield while it is active: unloading competing cross-origin
 * players before a tab is destroyed prevents them from interrupting audio.
 */
export function hasFloatingVideoTutorial() {
    return Boolean(videoTutorialFloatingPlayer.video);
}

export function openFloatingVideoTutorial(video) {
    if (!video?.id || !video?.embedUrl) {
        return false;
    }

    const isNewVideo = videoTutorialFloatingPlayer.video?.id !== video.id;
    videoTutorialFloatingPlayer.video = video;
    videoTutorialFloatingPlayer.x = null;
    videoTutorialFloatingPlayer.y = null;
    if (isNewVideo) {
        videoTutorialFloatingPlayer.width = null;
    }

    return true;
}

export function closeFloatingVideoTutorial() {
    videoTutorialFloatingPlayer.video = null;
    videoTutorialFloatingPlayer.x = null;
    videoTutorialFloatingPlayer.y = null;
    videoTutorialFloatingPlayer.width = null;
}

export function setFloatingVideoTutorialWidth(width) {
    if (!Number.isFinite(width) || width <= 0) {
        return;
    }

    videoTutorialFloatingPlayer.width = width;
}

export function getFloatingVideoTutorialEmbedUrl(video) {
    return getVideoTutorialEmbedUrl(video);
}

export function setFloatingVideoTutorialPosition(x, y, width, height) {
    if (typeof window === "undefined") {
        return;
    }

    const maxX = Math.max(viewportMargin, window.innerWidth - width - viewportMargin);
    const maxY = Math.max(viewportMargin, window.innerHeight - height - viewportMargin);

    videoTutorialFloatingPlayer.x = Math.min(Math.max(viewportMargin, x), maxX);
    videoTutorialFloatingPlayer.y = Math.min(Math.max(viewportMargin, y), maxY);
}
