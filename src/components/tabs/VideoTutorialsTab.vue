<template>
    <BaseTab tab-name="video_tutorials">
        <section class="video-tutorials-page" aria-labelledby="video-tutorials-title">
            <header class="video-tutorials-hero">
                <div>
                    <p class="video-tutorials-kicker">花生 FPV 学习中心</p>
                    <h1 id="video-tutorials-title">视频教程</h1>
                    <p class="video-tutorials-intro">
                        汇总 Betaflight 配置教程。选择分类或搜索关键词，直接查看来自抖音和 B 站的视频。
                    </p>
                </div>
                <div class="video-tutorials-hero-actions">
                    <div id="video-tutorial-search-entry"></div>
                    <p class="video-tutorials-count">{{ filteredVideos.length }} 个匹配视频</p>
                </div>
            </header>

            <p v-if="isLoading" class="video-tutorials-no-results" role="status">正在加载视频教程目录…</p>
            <p v-else-if="loadError" class="video-tutorials-no-results" role="alert">
                {{ loadError }} <button type="button" class="video-tutorials-filter" @click="loadCatalog">重试</button>
            </p>

            <div v-if="!isLoading && !loadError" class="video-tutorials-toolbar">
                <button
                    class="video-tutorials-filter"
                    :aria-pressed="selectedCategoryId === null"
                    type="button"
                    @click="selectCategory(null)"
                >
                    全部分类
                </button>
                <button
                    v-for="category in categories"
                    :key="category.id"
                    class="video-tutorials-filter"
                    :aria-pressed="selectedCategoryId === category.id"
                    type="button"
                    @click="selectCategory(category.id)"
                >
                    {{ category.title }}
                </button>
            </div>

            <p
                v-if="!isLoading && !loadError && hasActiveFilters && visibleCategories.length === 0"
                class="video-tutorials-no-results"
                role="status"
            >
                没有找到匹配的视频教程。请换一个关键词或分类试试。
            </p>

            <div
                v-if="!isLoading && !loadError && !(hasActiveFilters && visibleCategories.length === 0)"
                class="video-tutorials-sections"
            >
                <section
                    v-for="category in visibleCategories"
                    :id="`video-tutorial-category-${category.id}`"
                    :key="category.id"
                    class="video-tutorial-section"
                >
                    <div class="video-tutorial-section-heading">
                        <div>
                            <p class="video-tutorial-section-eyebrow">{{ category.title }}</p>
                            <h2>{{ category.title }}教程</h2>
                        </div>
                        <span>{{ category.videos.length }} 个视频</span>
                    </div>

                    <div v-if="category.videos.length" class="video-tutorial-grid">
                        <article
                            v-for="video in category.videos"
                            :id="`video-tutorial-${video.tutorialId || video.id}`"
                            :key="video.id"
                            class="video-tutorial-card"
                        >
                            <div
                                v-if="isEmbeddable(video)"
                                class="video-tutorial-player"
                                :class="{ 'video-tutorial-player--portrait': isPortraitVideo(video) }"
                            >
                                <p v-if="hasFloatingPlayer()" class="video-tutorial-picture-in-picture-status">
                                    {{
                                        isFloating(video.id)
                                            ? "正在画中画播放"
                                            : "已暂停内嵌播放器，以保证画中画播放稳定"
                                    }}
                                </p>
                                <template v-else-if="isInlinePlayerActive(category.id, video)">
                                    <div
                                        v-if="embedFailed(getInlinePlayerKey(category.id, video))"
                                        class="video-tutorial-embed-fallback"
                                        role="alert"
                                    >
                                        <p>播放器加载失败。</p>
                                        <div class="video-tutorial-embed-fallback__actions">
                                            <button type="button" @click="retryInlinePlayer(category.id, video)">
                                                重新加载
                                            </button>
                                            <a :href="getSourceUrl(video)" target="_blank" rel="noopener noreferrer">
                                                打开原视频 <span aria-hidden="true">↗</span>
                                            </a>
                                        </div>
                                    </div>
                                    <template v-else>
                                        <iframe
                                            :key="getPlaybackKey(category.id, video)"
                                            :src="getEmbedUrl(video)"
                                            :title="video.title"
                                            scrolling="no"
                                            border="0"
                                            frameborder="no"
                                            framespacing="0"
                                            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                                            allowfullscreen
                                            :referrerpolicy="embedReferrerPolicy(video)"
                                            @load="markEmbedLoaded(getInlinePlayerKey(category.id, video))"
                                            @error="markEmbedFailed(getInlinePlayerKey(category.id, video))"
                                        ></iframe>
                                        <p
                                            v-if="isInlinePlayerLoading(getInlinePlayerKey(category.id, video))"
                                            class="video-tutorial-player-loading"
                                            role="status"
                                        >
                                            播放器加载中…
                                        </p>
                                    </template>
                                </template>
                                <button
                                    v-else
                                    class="video-tutorial-player-launch"
                                    type="button"
                                    :aria-label="`播放《${video.title}》`"
                                    @click="openInlinePlayer(category.id, video)"
                                >
                                    <img
                                        v-if="video.thumbnailUrl && !thumbnailFailed(video.id)"
                                        :src="video.thumbnailUrl"
                                        alt=""
                                        loading="lazy"
                                        referrerpolicy="no-referrer"
                                        @error="markThumbnailFailed(video.id)"
                                    />
                                    <span v-else class="video-tutorial-placeholder" aria-hidden="true">
                                        {{ platformLabel(video.platform) }}
                                    </span>
                                    <span class="video-tutorial-player-launch__icon" aria-hidden="true"></span>
                                </button>
                            </div>
                            <div v-else class="video-tutorial-media">
                                <img
                                    v-if="video.thumbnailUrl && !thumbnailFailed(video.id)"
                                    :src="video.thumbnailUrl"
                                    :alt="`${video.title} 封面`"
                                    loading="lazy"
                                    referrerpolicy="no-referrer"
                                    @error="markThumbnailFailed(video.id)"
                                />
                                <div v-else class="video-tutorial-placeholder" aria-hidden="true">
                                    <span>{{ platformLabel(video.platform) }}</span>
                                </div>
                            </div>

                            <div
                                v-if="video.authorName || video.authorAvatarUrl || isEmbeddable(video)"
                                class="video-tutorial-author-actions"
                            >
                                <div v-if="video.authorName || video.authorAvatarUrl" class="video-tutorial-author">
                                    <img
                                        v-if="video.authorAvatarUrl"
                                        :src="video.authorAvatarUrl"
                                        :alt="video.authorName ? `${video.authorName} 的头像` : '作者头像'"
                                        loading="lazy"
                                        referrerpolicy="no-referrer"
                                    />
                                    <span>{{ video.authorName || "视频作者" }}</span>
                                </div>
                                <button
                                    v-if="isEmbeddable(video)"
                                    class="video-tutorial-picture-in-picture"
                                    type="button"
                                    :disabled="isFloating(video.id)"
                                    @click="openPictureInPicture(video)"
                                >
                                    {{ isFloating(video.id) ? "正在画中画播放" : "画中画播放" }}
                                </button>
                            </div>

                            <div class="video-tutorial-card-body">
                                <div class="video-tutorial-card-meta">
                                    <span>{{ platformLabel(video.platform) }}</span>
                                    <span v-if="video.duration">{{ video.duration }}</span>
                                </div>
                                <h3>{{ video.title }}</h3>
                                <p v-if="video.description">{{ video.description }}</p>
                                <ul v-if="video.tags?.length" class="video-tutorial-tags">
                                    <li v-for="tag in video.tags" :key="tag">{{ tag }}</li>
                                </ul>
                                <div class="video-tutorial-card-actions">
                                    <a
                                        :href="getSourceUrl(video)"
                                        class="video-tutorial-source"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        观看视频 <span aria-hidden="true">↗</span>
                                    </a>
                                    <button
                                        v-if="video.document?.available"
                                        type="button"
                                        class="video-tutorial-document-link"
                                        @click="openDocument(video)"
                                    >
                                        阅读文档
                                    </button>
                                </div>
                            </div>
                        </article>
                    </div>
                    <div v-else class="video-tutorial-empty">
                        <span aria-hidden="true">▹</span>
                        <p>该分类的视频正在整理中，后续会持续补充。</p>
                    </div>
                </section>
            </div>

            <div v-if="selectedDocumentVideo" class="video-tutorial-document-overlay" role="dialog" aria-modal="true">
                <VideoTutorialDocument
                    :tutorial="selectedDocumentVideo"
                    :video="selectedDocumentVideo"
                    :document="selectedDocument"
                    :loading="documentLoading"
                    :error="documentError"
                    @close="closeDocument"
                />
            </div>
        </section>
    </BaseTab>
</template>

<script>
import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import VideoTutorialDocument from "../VideoTutorialDocument.vue";
import GUI from "../../js/gui";
import {
    VIDEO_TUTORIAL_DOCUMENT_OPEN_EVENT,
    VIDEO_TUTORIAL_SEARCH_EVENT,
    VIDEO_TUTORIALS_OPEN_EVENT,
    consumeRequestedVideoTutorialCategory,
    filterVideoTutorials,
    getVideoTutorialEmbedReferrerPolicy,
    getVideoTutorialEmbedUrl,
    getVideoTutorialSourceUrl,
    getVideoTutorialCatalog,
    isVideoTutorialEmbeddable,
    loadVideoTutorialCatalog,
    loadVideoTutorialDocument,
    subscribeVideoTutorialCatalog,
} from "../../js/video_tutorials";
import {
    hasFloatingVideoTutorial,
    isFloatingVideoTutorial,
    openFloatingVideoTutorial,
} from "../../js/video_tutorial_floating_player";

const platformLabels = { bilibili: "B 站", douyin: "抖音" };

export default defineComponent({
    name: "VideoTutorialsTab",
    components: { BaseTab, VideoTutorialDocument },
    setup() {
        const catalog = ref(getVideoTutorialCatalog());
        const isLoading = ref(true);
        const loadError = ref("");
        const searchQuery = ref("");
        const selectedCategoryId = ref(null);
        const activeInlinePlayerKey = ref(null);
        const failedEmbedPlayerKeys = ref([]);
        const inlinePlayerLoading = ref(false);
        const inlinePlayerVersion = ref(0);
        const failedThumbnailIds = ref([]);
        const selectedDocumentVideo = ref(null);
        const selectedDocument = ref(null);
        const documentLoading = ref(false);
        const documentError = ref("");
        let pendingCategoryId = consumeRequestedVideoTutorialCategory();
        let pendingDocumentTutorialId = null;
        let unsubscribeCatalog = () => {};

        const categories = computed(() => catalog.value.categories);
        const filteredVideos = computed(() =>
            filterVideoTutorials(catalog.value.videos, {
                search: searchQuery.value,
                categoryId: selectedCategoryId.value,
            }),
        );
        const visibleCategories = computed(() => {
            const videosByCategory = new Map();
            filteredVideos.value.forEach((video) => {
                (video.categoryIds?.length ? video.categoryIds : [video.categoryId])
                    .filter(Boolean)
                    .forEach((categoryId) => {
                        const videos = videosByCategory.get(categoryId) ?? [];
                        videos.push(video);
                        videosByCategory.set(categoryId, videos);
                    });
            });
            const shouldHideEmpty = Boolean(searchQuery.value.trim()) || Boolean(selectedCategoryId.value);
            return categories.value
                .filter((category) => !selectedCategoryId.value || category.id === selectedCategoryId.value)
                .map((category) => ({ ...category, videos: videosByCategory.get(category.id) ?? [] }))
                .filter(
                    (category) =>
                        !shouldHideEmpty || category.videos.length || selectedCategoryId.value === category.id,
                );
        });
        const hasActiveFilters = computed(() => Boolean(searchQuery.value.trim()) || Boolean(selectedCategoryId.value));

        function applyPendingCategory() {
            if (!pendingCategoryId) return;
            if (categories.value.some((category) => category.id === pendingCategoryId)) {
                selectedCategoryId.value = pendingCategoryId;
            }
            pendingCategoryId = null;
        }
        function openPendingDocument() {
            if (!pendingDocumentTutorialId || isLoading.value) return;
            const video = catalog.value.videos.find(
                (item) => (item.tutorialId || item.id) === pendingDocumentTutorialId,
            );
            pendingDocumentTutorialId = null;
            if (video) openDocument(video);
        }
        function refreshCatalog(nextCatalog, error) {
            clearInlinePlayer();
            catalog.value = nextCatalog;
            loadError.value = error?.message || "";
            isLoading.value = false;
            applyPendingCategory();
            openPendingDocument();
        }
        async function loadCatalog() {
            clearInlinePlayer();
            isLoading.value = true;
            loadError.value = "";
            try {
                refreshCatalog(await loadVideoTutorialCatalog({ force: true }));
            } catch (error) {
                refreshCatalog(getVideoTutorialCatalog(), error);
            }
        }
        function platformLabel(platform) {
            return platformLabels[platform] ?? platform;
        }
        function isEmbeddable(video) {
            return isVideoTutorialEmbeddable(video);
        }
        function embedReferrerPolicy(video) {
            return getVideoTutorialEmbedReferrerPolicy(video);
        }
        function getEmbedUrl(video) {
            return getVideoTutorialEmbedUrl(video, { autoplay: true });
        }
        function getSourceUrl(video) {
            return getVideoTutorialSourceUrl(video);
        }
        function getInlinePlayerKey(categoryId, video) {
            return `${categoryId}:${video.tutorialId || video.id}`;
        }
        function getPlaybackKey(categoryId, video) {
            return `${getInlinePlayerKey(categoryId, video)}:${inlinePlayerVersion.value}`;
        }
        function isPortraitVideo(video) {
            return video.platform === "douyin";
        }
        function isInlinePlayerActive(categoryId, video) {
            return activeInlinePlayerKey.value === getInlinePlayerKey(categoryId, video);
        }
        function isInlinePlayerLoading(playerKey) {
            return activeInlinePlayerKey.value === playerKey && inlinePlayerLoading.value;
        }
        function clearInlinePlayer() {
            activeInlinePlayerKey.value = null;
            inlinePlayerLoading.value = false;
        }
        function openInlinePlayer(categoryId, video) {
            const playerKey = getInlinePlayerKey(categoryId, video);
            activeInlinePlayerKey.value = playerKey;
            failedEmbedPlayerKeys.value = failedEmbedPlayerKeys.value.filter((key) => key !== playerKey);
            inlinePlayerLoading.value = true;
            inlinePlayerVersion.value += 1;
        }
        function retryInlinePlayer(categoryId, video) {
            openInlinePlayer(categoryId, video);
        }
        function embedFailed(playerKey) {
            return failedEmbedPlayerKeys.value.includes(playerKey);
        }
        function markEmbedFailed(playerKey) {
            if (!embedFailed(playerKey)) {
                failedEmbedPlayerKeys.value = [...failedEmbedPlayerKeys.value, playerKey];
            }
            if (activeInlinePlayerKey.value === playerKey) inlinePlayerLoading.value = false;
        }
        function markEmbedLoaded(playerKey) {
            if (activeInlinePlayerKey.value === playerKey) inlinePlayerLoading.value = false;
        }
        function thumbnailFailed(videoId) {
            return failedThumbnailIds.value.includes(videoId);
        }
        function markThumbnailFailed(videoId) {
            if (!thumbnailFailed(videoId)) failedThumbnailIds.value = [...failedThumbnailIds.value, videoId];
        }
        function hasFloatingPlayer() {
            return hasFloatingVideoTutorial();
        }
        function isFloating(videoId) {
            return isFloatingVideoTutorial(videoId);
        }
        function openPictureInPicture(video) {
            clearInlinePlayer();
            openFloatingVideoTutorial(video);
        }
        async function openDocument(video) {
            selectedDocumentVideo.value = video;
            selectedDocument.value = null;
            documentError.value = "";
            documentLoading.value = true;
            try {
                selectedDocument.value = await loadVideoTutorialDocument(video.tutorialId || video.id);
            } catch (error) {
                documentError.value = error?.message || "教程文档加载失败。仍可观看视频。";
            } finally {
                documentLoading.value = false;
            }
        }
        function closeDocument() {
            selectedDocumentVideo.value = null;
            selectedDocument.value = null;
            documentError.value = "";
        }
        function selectCategory(categoryId) {
            clearInlinePlayer();
            selectedCategoryId.value = categoryId;
        }
        function openRequestedCategory(event) {
            const requested = event.detail?.categoryId ?? null;
            if (!requested) {
                selectCategory(null);
                return;
            }
            if (isLoading.value) {
                pendingCategoryId = requested;
                return;
            }
            selectCategory(categories.value.some((category) => category.id === requested) ? requested : null);
        }
        function applyGlobalSearch(event) {
            // Semantic results are shown in the global panel. Keep category navigation functional without local keyword filtering.
            const categoryId = event.detail?.categoryId;
            if (categoryId) openRequestedCategory({ detail: { categoryId } });
        }
        function openRequestedDocument(event) {
            const tutorialId = event.detail?.tutorialId;
            if (!tutorialId) return;
            const video = catalog.value.videos.find((item) => (item.tutorialId || item.id) === tutorialId);
            if (!video) {
                if (isLoading.value) pendingDocumentTutorialId = tutorialId;
                return;
            }
            openDocument(video);
        }

        onMounted(() => {
            unsubscribeCatalog = subscribeVideoTutorialCatalog(refreshCatalog);
            document.addEventListener(VIDEO_TUTORIALS_OPEN_EVENT, openRequestedCategory);
            document.addEventListener(VIDEO_TUTORIAL_SEARCH_EVENT, applyGlobalSearch);
            document.addEventListener(VIDEO_TUTORIAL_DOCUMENT_OPEN_EVENT, openRequestedDocument);
            loadCatalog();
            GUI.content_ready();
        });
        onBeforeUnmount(() => {
            clearInlinePlayer();
            unsubscribeCatalog();
            document.removeEventListener(VIDEO_TUTORIALS_OPEN_EVENT, openRequestedCategory);
            document.removeEventListener(VIDEO_TUTORIAL_SEARCH_EVENT, applyGlobalSearch);
            document.removeEventListener(VIDEO_TUTORIAL_DOCUMENT_OPEN_EVENT, openRequestedDocument);
        });
        return {
            categories,
            embedFailed,
            embedReferrerPolicy,
            filteredVideos,
            getEmbedUrl,
            getInlinePlayerKey,
            getPlaybackKey,
            getSourceUrl,
            hasActiveFilters,
            hasFloatingPlayer,
            isEmbeddable,
            isFloating,
            isInlinePlayerActive,
            isInlinePlayerLoading,
            isLoading,
            isPortraitVideo,
            loadCatalog,
            loadError,
            markEmbedFailed,
            markEmbedLoaded,
            markThumbnailFailed,
            closeDocument,
            documentError,
            documentLoading,
            openDocument,
            openInlinePlayer,
            openPictureInPicture,
            platformLabel,
            searchQuery,
            selectCategory,
            selectedCategoryId,
            selectedDocument,
            selectedDocumentVideo,
            thumbnailFailed,
            retryInlinePlayer,
            visibleCategories,
        };
    },
});
</script>

<style scoped>
.video-tutorials-page {
    --tutorial-ink: #142342;
    --tutorial-muted: #68738a;
    --tutorial-line: rgba(20, 35, 66, 0.12);
    --tutorial-surface: rgba(255, 255, 255, 0.92);
    --tutorial-accent: #ff7d1f;
    display: flex;
    flex-direction: column;
    gap: 24px;
    width: 100%;
    max-width: 1220px;
    min-height: 100%;
    box-sizing: border-box;
    margin: 0 auto;
    padding: 30px 28px 42px;
    color: var(--tutorial-ink);
}

.video-tutorials-hero {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: end;
    padding: 30px;
    border: 1px solid rgba(255, 125, 31, 0.2);
    border-radius: 20px;
    background:
        radial-gradient(circle at 94% 12%, rgba(255, 125, 31, 0.24), transparent 28%),
        linear-gradient(135deg, #fff7ee 0%, #fff 58%, #f5f8ff 100%);
    box-shadow: 0 18px 40px rgba(16, 36, 79, 0.08);
}

.video-tutorials-kicker,
.video-tutorial-section-eyebrow {
    margin: 0 0 7px;
    color: var(--tutorial-accent);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
}

.video-tutorials-hero h1,
.video-tutorial-section-heading h2,
.video-tutorial-card h3 {
    margin: 0;
}

.video-tutorials-hero h1 {
    font-size: clamp(30px, 4vw, 42px);
    line-height: 1.05;
}

.video-tutorials-intro {
    max-width: 660px;
    margin: 12px 0 0;
    color: var(--tutorial-muted);
    font-size: 15px;
    line-height: 1.7;
}

.video-tutorials-count {
    flex: 0 0 auto;
    margin: 0;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(20, 35, 66, 0.07);
    color: var(--tutorial-muted);
    font-size: 13px;
}

.video-tutorials-hero-actions {
    display: grid;
    justify-items: end;
    gap: 12px;
}

#video-tutorial-search-entry {
    width: min(100%, 360px);
}

.video-tutorials-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    align-items: center;
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

.video-tutorials-search {
    display: flex;
    flex: 1 1 290px;
    gap: 9px;
    align-items: center;
    min-width: 220px;
    padding: 9px 13px;
    border: 1px solid var(--tutorial-line);
    border-radius: 10px;
    background: var(--tutorial-surface);
    color: var(--tutorial-muted);
}

.video-tutorials-search input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font: inherit;
}

.video-tutorials-filter {
    padding: 7px 11px;
    border: 1px solid var(--tutorial-line);
    border-radius: 999px;
    background: var(--tutorial-surface);
    color: var(--tutorial-muted);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
}

.video-tutorials-filter:hover,
.video-tutorials-filter[aria-pressed="true"] {
    border-color: rgba(255, 125, 31, 0.45);
    background: rgba(255, 125, 31, 0.12);
    color: #b95000;
}

.video-tutorials-sections {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.video-tutorial-section {
    padding: 22px;
    border: 1px solid var(--tutorial-line);
    border-radius: 16px;
    background: var(--tutorial-surface);
}

.video-tutorial-section-heading {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
}

.video-tutorial-section-heading h2 {
    font-size: 20px;
}

.video-tutorial-section-heading > span {
    color: var(--tutorial-muted);
    font-size: 13px;
}

.video-tutorial-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-top: 18px;
}

.video-tutorial-card {
    overflow: hidden;
    border: 1px solid var(--tutorial-line);
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 8px 22px rgba(16, 36, 79, 0.06);
}

.video-tutorial-player,
.video-tutorial-media {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: #eaf0fb;
}

.video-tutorial-player iframe {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    background: #1d2941;
}

.video-tutorial-player-loading {
    position: absolute;
    inset: 0;
    display: grid;
    margin: 0;
    place-items: center;
    background: rgba(29, 41, 65, 0.9);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
}

.video-tutorial-player-launch {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    overflow: hidden;
    border: 0;
    background: #253b6c;
    color: #fff;
    cursor: pointer;
}

.video-tutorial-player-launch:focus-visible {
    outline: 3px solid var(--tutorial-accent);
    outline-offset: -3px;
}

.video-tutorial-player-launch img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.video-tutorial-player-launch__icon {
    position: absolute;
    top: 50%;
    left: 50%;
    display: grid;
    width: 48px;
    height: 48px;
    border: 2px solid rgba(255, 255, 255, 0.92);
    border-radius: 50%;
    background: var(--primary-500);
    place-items: center;
    transform: translate(-50%, -50%);
}

.video-tutorial-player-launch__icon::before {
    width: 0;
    height: 0;
    border-top: 9px solid transparent;
    border-bottom: 9px solid transparent;
    border-left: 14px solid #fff;
    content: "";
    transform: translateX(1px);
}

.video-tutorial-player--portrait {
    display: grid;
    place-items: center;
    background: #1d2941;
}

.video-tutorial-player--portrait iframe {
    width: auto;
    height: calc(100% - 12px);
    aspect-ratio: 9 / 16;
}

.video-tutorial-picture-in-picture {
    flex: 0 0 auto;
    padding: 6px 9px;
    border: 1px solid rgba(40, 74, 138, 0.24);
    border-radius: 7px;
    background: #f7f9fd;
    color: #284a8a;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
}

.video-tutorial-picture-in-picture:hover {
    background: #edf3ff;
}

.video-tutorial-picture-in-picture:disabled {
    color: var(--tutorial-muted);
    cursor: default;
}

.video-tutorial-picture-in-picture-status {
    display: grid;
    height: 100%;
    padding: 16px;
    margin: 0;
    place-items: center;
    color: #284a8a;
    font-size: 13px;
    font-weight: 700;
}

.video-tutorial-media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.video-tutorial-placeholder {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    background: #253b6c;
    color: #fff;
    font-size: 24px;
    font-weight: 700;
}

.video-tutorial-embed-fallback {
    display: grid;
    height: 100%;
    padding: 16px;
    place-items: center;
    align-content: center;
    gap: 12px;
    background: #fff7ee;
    color: #9a500f;
    font-size: 13px;
    text-align: center;
}

.video-tutorial-embed-fallback p {
    margin: 0;
}

.video-tutorial-embed-fallback__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
}

.video-tutorial-embed-fallback__actions button,
.video-tutorial-embed-fallback__actions a {
    padding: 6px 10px;
    border: 1px solid rgba(255, 125, 31, 0.32);
    border-radius: 7px;
    background: #fff;
    color: #9a500f;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    text-decoration: none;
}

.video-tutorial-card-body {
    padding: 16px;
}

.video-tutorial-card-meta,
.video-tutorial-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
}

.video-tutorial-card-meta {
    margin-bottom: 9px;
    color: var(--tutorial-muted);
    font-size: 12px;
}

.video-tutorial-card-meta span:not(:last-child)::after {
    margin-left: 7px;
    content: "·";
}

.video-tutorial-card h3 {
    font-size: 17px;
    line-height: 1.35;
}

.video-tutorial-author-actions {
    display: flex;
    gap: 10px;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--tutorial-line);
    background: #f7f9fd;
}

.video-tutorial-author {
    display: flex;
    min-width: 0;
    gap: 7px;
    align-items: center;
    color: var(--tutorial-muted);
    font-size: 12px;
    line-height: 1.25;
}

.video-tutorial-author img {
    width: 22px;
    height: 22px;
    border: 1px solid var(--tutorial-line);
    border-radius: 50%;
    object-fit: cover;
}

.video-tutorial-card-body > p {
    margin: 8px 0 0;
    color: var(--tutorial-muted);
    font-size: 13px;
    line-height: 1.6;
}

.video-tutorial-tags {
    padding: 0;
    margin: 12px 0 0;
    list-style: none;
}

.video-tutorial-tags li {
    padding: 3px 7px;
    border-radius: 5px;
    background: #f0f3f9;
    color: var(--tutorial-muted);
    font-size: 11px;
}

.video-tutorial-card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    align-items: center;
    margin-top: 14px;
}

.video-tutorial-document-link {
    padding: 6px 10px;
    border: 1px solid rgba(255, 125, 31, 0.32);
    border-radius: 7px;
    background: #fff7ee;
    color: #b95000;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 700;
}

.video-tutorial-document-overlay {
    position: fixed;
    z-index: 20;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(20, 35, 66, 0.48);
}
.video-tutorial-source {
    display: inline-block;
    margin-top: 15px;
    color: #c35908;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
}

.video-tutorial-source:hover {
    text-decoration: underline;
}

.video-tutorial-empty,
.video-tutorial-no-results {
    color: var(--tutorial-muted);
    text-align: center;
}

.video-tutorial-empty {
    display: flex;
    gap: 9px;
    justify-content: center;
    align-items: center;
    min-height: 82px;
    margin-top: 18px;
    border: 1px dashed var(--tutorial-line);
    border-radius: 10px;
    background: rgba(242, 245, 251, 0.72);
}

.video-tutorial-empty span {
    color: var(--tutorial-accent);
    font-size: 22px;
}

.video-tutorial-empty p {
    margin: 0;
    font-size: 13px;
}

.video-tutorial-no-results {
    margin: 0;
    padding: 50px 20px;
    border: 1px dashed var(--tutorial-line);
    border-radius: 14px;
    background: var(--tutorial-surface);
}

@media (max-width: 1000px) {
    .video-tutorial-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 700px) {
    .video-tutorials-page {
        padding: 18px 14px 30px;
    }

    .video-tutorials-hero {
        align-items: flex-start;
        flex-direction: column;
        padding: 22px;
    }

    .video-tutorials-hero-actions {
        width: 100%;
        justify-items: stretch;
    }

    #video-tutorial-search-entry {
        width: 100%;
    }

    .video-tutorial-section {
        padding: 16px;
    }

    .video-tutorial-grid {
        grid-template-columns: 1fr;
    }
}
</style>
