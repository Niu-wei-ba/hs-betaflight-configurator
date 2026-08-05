<template>
    <Teleport to="body">
        <section
            v-if="activeVideo"
            ref="playerElement"
            class="video-tutorial-floating-player"
            :class="{ 'video-tutorial-floating-player--portrait': isPortraitVideo }"
            :style="playerStyle"
            aria-label="视频教程画中画播放器"
        >
            <header class="video-tutorial-floating-player__header" @pointerdown="startDragging">
                <p :title="activeVideo.title">{{ activeVideo.title }}</p>
                <button
                    type="button"
                    aria-label="关闭画中画播放器"
                    title="关闭"
                    @pointerdown.stop
                    @click.stop="closePlayer"
                >
                    ×
                </button>
            </header>
            <div class="video-tutorial-floating-player__media" :aria-busy="isLoading">
                <p v-if="!shouldLoadEmbed" class="video-tutorial-floating-player__loading">正在准备播放器…</p>
                <iframe
                    v-else-if="!embedFailed"
                    :key="iframeKey"
                    :src="embedUrl"
                    :title="activeVideo.title"
                    scrolling="no"
                    border="0"
                    frameborder="no"
                    framespacing="0"
                    allow="encrypted-media; fullscreen; picture-in-picture"
                    allowfullscreen
                    :referrerpolicy="embedReferrerPolicy"
                    @error="handleEmbedError"
                    @load="handleEmbedLoad"
                ></iframe>
                <p v-else class="video-tutorial-floating-player__fallback">
                    当前平台不允许内嵌播放，请前往原视频继续观看。
                </p>
                <p
                    v-if="isLoading && shouldLoadEmbed && !embedFailed"
                    class="video-tutorial-floating-player__loading-overlay"
                >
                    播放器加载中…
                </p>
                <div v-if="loadTimedOut && !embedFailed" class="video-tutorial-floating-player__timeout" role="status">
                    <p>播放器加载时间较长。</p>
                    <button type="button" @click="reloadPlayer">重新加载</button>
                </div>
            </div>
            <footer class="video-tutorial-floating-player__footer">
                <button type="button" @click="reloadPlayer">重新加载</button>
                <a :href="activeVideo.sourceUrl" target="_blank" rel="noopener noreferrer">前往原视频 ↗</a>
            </footer>
            <button
                class="video-tutorial-floating-player__resize-handle"
                type="button"
                aria-label="拖动右下角手柄缩放播放器"
                title="拖动缩放"
                @pointerdown.stop.prevent="startResizing"
            >
                <span aria-hidden="true"></span>
            </button>
        </section>
    </Teleport>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
    closeFloatingVideoTutorial,
    getFloatingVideoTutorialEmbedUrl,
    setFloatingVideoTutorialPosition,
    setFloatingVideoTutorialWidth,
    videoTutorialFloatingPlayer,
} from "../js/video_tutorial_floating_player";

const playerWidth = 720;
const portraitPlayerWidth = 360;
const minimumPlayerWidth = 320;
const viewportMargin = 16;
const landscapePlayerAspectRatio = 16 / 9;
const portraitPlayerAspectRatio = 9 / 16;
const playerChromeHeight = 82;
const embedLoadTimeout = 12000;

export default defineComponent({
    name: "VideoTutorialFloatingPlayer",
    setup() {
        const playerElement = ref(null);
        const embedFailed = ref(false);
        const shouldLoadEmbed = ref(false);
        const isLoading = ref(false);
        const loadTimedOut = ref(false);
        const iframeKey = ref(0);
        const dragState = ref(null);
        const resizeState = ref(null);
        let embedLoadTimer;
        let prepareRequestId = 0;

        const activeVideo = computed(() => videoTutorialFloatingPlayer.video);
        const embedUrl = computed(() => getFloatingVideoTutorialEmbedUrl(activeVideo.value));
        const isPortraitVideo = computed(() => activeVideo.value?.platform === "douyin");
        const playerAspectRatio = computed(() =>
            isPortraitVideo.value ? portraitPlayerAspectRatio : landscapePlayerAspectRatio,
        );
        const embedReferrerPolicy = computed(() =>
            isPortraitVideo.value ? "unsafe-url" : "strict-origin-when-cross-origin",
        );

        function getMaximumPlayerWidth() {
            const maximumWidth = Math.max(0, window.innerWidth - viewportMargin * 2);
            const maximumMediaHeight = Math.max(0, window.innerHeight - viewportMargin * 2 - playerChromeHeight);
            return Math.min(maximumWidth, maximumMediaHeight * playerAspectRatio.value);
        }

        function getInitialPlayerWidth() {
            const defaultWidth = isPortraitVideo.value ? portraitPlayerWidth : playerWidth;
            return Math.min(defaultWidth, getMaximumPlayerWidth());
        }

        function getPlayerWidth() {
            return Math.min(videoTutorialFloatingPlayer.width ?? getInitialPlayerWidth(), getMaximumPlayerWidth());
        }

        const playerStyle = computed(() => {
            const style = {
                width: `${getPlayerWidth()}px`,
            };

            if (videoTutorialFloatingPlayer.x === null || videoTutorialFloatingPlayer.y === null) {
                return {
                    ...style,
                    left: `${viewportMargin}px`,
                    top: `${viewportMargin}px`,
                    visibility: "hidden",
                };
            }

            return {
                ...style,
                left: `${videoTutorialFloatingPlayer.x}px`,
                top: `${videoTutorialFloatingPlayer.y}px`,
            };
        });

        function clearEmbedLoadTimer() {
            if (embedLoadTimer) {
                window.clearTimeout(embedLoadTimer);
                embedLoadTimer = undefined;
            }
        }

        function startEmbedLoadTimer() {
            clearEmbedLoadTimer();
            embedLoadTimer = window.setTimeout(() => {
                if (shouldLoadEmbed.value && !embedFailed.value && isLoading.value) {
                    isLoading.value = false;
                    loadTimedOut.value = true;
                }
            }, embedLoadTimeout);
        }

        function getPlayerSize() {
            const rect = playerElement.value?.getBoundingClientRect();
            const width = rect?.width || getPlayerWidth();
            const height = rect?.height || width / playerAspectRatio.value + playerChromeHeight;

            return { width, height };
        }

        function centerPlayer() {
            if (!playerElement.value) {
                return;
            }

            const { width, height } = getPlayerSize();
            setFloatingVideoTutorialPosition(
                (window.innerWidth - width) / 2,
                (window.innerHeight - height) / 2,
                width,
                height,
            );
        }

        async function preparePlayer() {
            const requestId = ++prepareRequestId;
            clearEmbedLoadTimer();
            shouldLoadEmbed.value = false;
            isLoading.value = false;
            loadTimedOut.value = false;
            embedFailed.value = false;

            if (!activeVideo.value) {
                return;
            }

            await nextTick();
            if (requestId !== prepareRequestId || !activeVideo.value) {
                return;
            }

            centerPlayer();

            await nextTick();
            if (requestId !== prepareRequestId || !activeVideo.value) {
                return;
            }

            isLoading.value = true;
            shouldLoadEmbed.value = true;
            startEmbedLoadTimer();
        }

        function reloadPlayer() {
            iframeKey.value += 1;
            preparePlayer();
        }

        function handleEmbedLoad() {
            isLoading.value = false;
            loadTimedOut.value = false;
            clearEmbedLoadTimer();
        }

        function handleEmbedError() {
            embedFailed.value = true;
            isLoading.value = false;
            loadTimedOut.value = false;
            clearEmbedLoadTimer();
        }

        watch(
            () => activeVideo.value?.id,
            () => {
                preparePlayer();
            },
            { immediate: true },
        );

        function stopDragging() {
            dragState.value = null;
            window.removeEventListener("pointermove", movePlayer);
            window.removeEventListener("pointerup", stopDragging);
            window.removeEventListener("pointercancel", stopDragging);
        }

        function movePlayer(event) {
            if (!dragState.value || !playerElement.value) {
                return;
            }

            const rect = playerElement.value.getBoundingClientRect();
            setFloatingVideoTutorialPosition(
                event.clientX - dragState.value.offsetX,
                event.clientY - dragState.value.offsetY,
                rect.width,
                rect.height,
            );
        }

        function startDragging(event) {
            if (event.button !== 0 || event.target.closest("button") || !playerElement.value) {
                return;
            }

            const rect = playerElement.value.getBoundingClientRect();
            dragState.value = {
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            window.addEventListener("pointermove", movePlayer);
            window.addEventListener("pointerup", stopDragging);
            window.addEventListener("pointercancel", stopDragging);
        }

        function getMaximumResizableWidth(left, top) {
            const maximumWidth = Math.max(0, window.innerWidth - left - viewportMargin);
            const maximumMediaHeight = Math.max(0, window.innerHeight - top - viewportMargin - playerChromeHeight);

            return Math.min(maximumWidth, maximumMediaHeight * playerAspectRatio.value);
        }

        function stopResizing() {
            resizeState.value = null;
            window.removeEventListener("pointermove", resizePlayer);
            window.removeEventListener("pointerup", stopResizing);
            window.removeEventListener("pointercancel", stopResizing);
        }

        function resizePlayer(event) {
            if (!resizeState.value) {
                return;
            }

            const { left, top, startClientX, startClientY, startWidth } = resizeState.value;
            const horizontalDelta = event.clientX - startClientX;
            const verticalDelta = (event.clientY - startClientY) * playerAspectRatio.value;
            const widthDelta = Math.abs(horizontalDelta) >= Math.abs(verticalDelta) ? horizontalDelta : verticalDelta;
            const maximumWidth = getMaximumResizableWidth(left, top);
            const minimumWidth = Math.min(minimumPlayerWidth, maximumWidth);
            const width = Math.min(Math.max(minimumWidth, startWidth + widthDelta), maximumWidth);

            setFloatingVideoTutorialWidth(width);
        }

        function startResizing(event) {
            if (event.button !== 0 || !playerElement.value) {
                return;
            }

            const rect = playerElement.value.getBoundingClientRect();
            resizeState.value = {
                left: rect.left,
                top: rect.top,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startWidth: rect.width || getPlayerWidth(),
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            window.addEventListener("pointermove", resizePlayer);
            window.addEventListener("pointerup", stopResizing);
            window.addEventListener("pointercancel", stopResizing);
        }

        function closePlayer() {
            closeFloatingVideoTutorial();
        }

        onBeforeUnmount(() => {
            prepareRequestId += 1;
            clearEmbedLoadTimer();
            stopDragging();
            stopResizing();
        });

        return {
            activeVideo,
            closePlayer,
            embedFailed,
            embedUrl,
            handleEmbedError,
            handleEmbedLoad,
            iframeKey,
            isLoading,
            isPortraitVideo,
            embedReferrerPolicy,
            loadTimedOut,
            playerElement,
            playerStyle,
            reloadPlayer,
            shouldLoadEmbed,
            startDragging,
            startResizing,
        };
    },
});
</script>

<style scoped>
.video-tutorial-floating-player {
    position: fixed;
    z-index: 2147483000;
    overflow: hidden;
    border: 1px solid rgba(20, 35, 66, 0.2);
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 18px 50px rgba(16, 36, 79, 0.3);
}

.video-tutorial-floating-player__header {
    display: flex;
    gap: 12px;
    align-items: center;
    min-height: 38px;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid rgba(20, 35, 66, 0.14);
    background: #fff;
    color: #142342;
    cursor: grab;
    touch-action: none;
    user-select: none;
}

.video-tutorial-floating-player__header:active {
    cursor: grabbing;
}

.video-tutorial-floating-player__header p {
    overflow: hidden;
    flex: 1;
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.video-tutorial-floating-player__header button {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #142342;
    cursor: pointer;
    font-size: 22px;
    line-height: 1;
}

.video-tutorial-floating-player__header button:hover {
    background: #eef3fc;
}

.video-tutorial-floating-player__media {
    position: relative;
    display: grid;
    aspect-ratio: 16 / 9;
    background: #1d2941;
}

.video-tutorial-floating-player--portrait .video-tutorial-floating-player__media {
    aspect-ratio: 9 / 16;
}

.video-tutorial-floating-player__media iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
}

.video-tutorial-floating-player__loading,
.video-tutorial-floating-player__fallback {
    display: grid;
    height: 100%;
    padding: 16px;
    margin: 0;
    place-items: center;
    color: #fff;
    font-size: 13px;
    text-align: center;
}

.video-tutorial-floating-player__loading-overlay {
    position: absolute;
    z-index: 1;
    inset: 0;
    display: grid;
    margin: 0;
    place-items: center;
    background: rgba(29, 41, 65, 0.82);
    color: #fff;
    font-size: 13px;
}

.video-tutorial-floating-player__timeout {
    position: absolute;
    z-index: 2;
    right: 12px;
    bottom: 12px;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 4px 16px rgba(10, 22, 46, 0.24);
    color: #142342;
    font-size: 12px;
}

.video-tutorial-floating-player__timeout p {
    margin: 0;
}

.video-tutorial-floating-player__timeout button,
.video-tutorial-floating-player__footer button {
    border: 0;
    background: transparent;
    color: #c35908;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
}

.video-tutorial-floating-player__timeout button:hover,
.video-tutorial-floating-player__footer button:hover {
    text-decoration: underline;
}

.video-tutorial-floating-player__footer {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 8px 12px;
    background: #fff;
}

.video-tutorial-floating-player__footer a {
    color: #c35908;
    font-size: 12px;
    font-weight: 700;
    text-decoration: none;
}

.video-tutorial-floating-player__footer a:hover {
    text-decoration: underline;
}

.video-tutorial-floating-player__resize-handle {
    position: absolute;
    z-index: 3;
    right: 0;
    bottom: 0;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 8px 0 12px 0;
    background: linear-gradient(135deg, transparent 0 46%, rgba(20, 35, 66, 0.12) 47% 53%, transparent 54% 100%);
    cursor: nwse-resize;
    touch-action: none;
}

.video-tutorial-floating-player__resize-handle::before,
.video-tutorial-floating-player__resize-handle::after,
.video-tutorial-floating-player__resize-handle span {
    position: absolute;
    right: 5px;
    bottom: 5px;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #7b879c;
    content: "";
}

.video-tutorial-floating-player__resize-handle::before {
    right: 10px;
    bottom: 5px;
}

.video-tutorial-floating-player__resize-handle::after {
    right: 5px;
    bottom: 10px;
}

.video-tutorial-floating-player__resize-handle:hover,
.video-tutorial-floating-player__resize-handle:focus-visible {
    background-color: rgba(238, 243, 252, 0.95);
    outline: 2px solid #c35908;
    outline-offset: -2px;
}
</style>
