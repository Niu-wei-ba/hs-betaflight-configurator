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
                <p class="video-tutorials-count">{{ filteredVideos.length }} 个匹配视频</p>
            </header>

            <div class="video-tutorials-toolbar">
                <label class="video-tutorials-search" for="video-tutorials-search">
                    <span class="visually-hidden">搜索视频教程</span>
                    <span aria-hidden="true">⌕</span>
                    <input
                        id="video-tutorials-search"
                        v-model="searchQuery"
                        type="search"
                        placeholder="搜索标题、简介或标签"
                    />
                </label>
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
                v-if="hasActiveFilters && visibleCategories.length === 0"
                class="video-tutorials-no-results"
                role="status"
            >
                没有找到匹配的视频教程。请换一个关键词或分类试试。
            </p>

            <div v-else class="video-tutorials-sections">
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
                        <article v-for="video in category.videos" :key="video.id" class="video-tutorial-card">
                            <div
                                v-if="isEmbeddable(video)"
                                class="video-tutorial-player"
                                :class="{ 'video-tutorial-player--portrait': isPortraitVideo(video) }"
                            >
                                <iframe
                                    v-if="!embedFailed(video.id) && !hasFloatingPlayer()"
                                    :src="getEmbedUrl(video)"
                                    :title="video.title"
                                    scrolling="no"
                                    border="0"
                                    frameborder="no"
                                    framespacing="0"
                                    allow="encrypted-media; fullscreen; picture-in-picture"
                                    allowfullscreen
                                    loading="lazy"
                                    :referrerpolicy="embedReferrerPolicy(video)"
                                    @error="markEmbedFailed(video.id)"
                                ></iframe>
                                <p v-else-if="hasFloatingPlayer()" class="video-tutorial-picture-in-picture-status">
                                    {{
                                        isFloating(video.id)
                                            ? "正在画中画播放"
                                            : "已暂停内嵌播放器，以保证画中画播放稳定"
                                    }}
                                </p>
                                <p v-else class="video-tutorial-embed-fallback">
                                    当前平台不允许内嵌播放，请使用下方原始链接观看。
                                </p>
                            </div>
                            <div v-else class="video-tutorial-media">
                                <img
                                    v-if="video.thumbnailUrl"
                                    :src="video.thumbnailUrl"
                                    :alt="`${video.title} 封面`"
                                    loading="lazy"
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
                                <a
                                    :href="video.sourceUrl"
                                    class="video-tutorial-source"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    在{{ platformLabel(video.platform) }}打开原视频 <span aria-hidden="true">↗</span>
                                </a>
                            </div>
                        </article>
                    </div>
                    <div v-else class="video-tutorial-empty">
                        <span aria-hidden="true">▹</span>
                        <p>该分类的视频正在整理中，后续会持续补充。</p>
                    </div>
                </section>
            </div>
        </section>
    </BaseTab>
</template>

<script>
import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import {
    VIDEO_TUTORIALS_OPEN_EVENT,
    consumeRequestedVideoTutorialCategory,
    filterVideoTutorials,
    getVideoTutorialCatalog,
    getVideoTutorialEmbedUrl,
    isVideoTutorialEmbeddable,
} from "../../js/video_tutorials";
import {
    hasFloatingVideoTutorial,
    isFloatingVideoTutorial,
    openFloatingVideoTutorial,
} from "../../js/video_tutorial_floating_player";

const platformLabels = {
    bilibili: "B 站",
    douyin: "抖音",
};

export default defineComponent({
    name: "VideoTutorialsTab",
    components: {
        BaseTab,
    },
    setup() {
        const catalog = getVideoTutorialCatalog();
        const searchQuery = ref("");
        const selectedCategoryId = ref(null);
        const failedEmbedVideoIds = ref([]);

        const filteredVideos = computed(() =>
            filterVideoTutorials(catalog.videos, {
                search: searchQuery.value,
                categoryId: selectedCategoryId.value,
            }),
        );

        const visibleCategories = computed(() => {
            const videosByCategory = new Map();
            filteredVideos.value.forEach((video) => {
                const videos = videosByCategory.get(video.categoryId) ?? [];
                videos.push(video);
                videosByCategory.set(video.categoryId, videos);
            });

            const shouldHideEmptyCategories = Boolean(searchQuery.value.trim()) || Boolean(selectedCategoryId.value);

            return catalog.categories
                .filter((category) => !selectedCategoryId.value || category.id === selectedCategoryId.value)
                .map((category) => ({
                    ...category,
                    videos: videosByCategory.get(category.id) ?? [],
                }))
                .filter(
                    (category) =>
                        !shouldHideEmptyCategories ||
                        category.videos.length > 0 ||
                        selectedCategoryId.value === category.id,
                );
        });

        const hasActiveFilters = computed(() => Boolean(searchQuery.value.trim()) || Boolean(selectedCategoryId.value));

        function platformLabel(platform) {
            return platformLabels[platform] ?? platform;
        }

        function isEmbeddable(video) {
            return isVideoTutorialEmbeddable(video);
        }

        function embedReferrerPolicy(video) {
            return video.platform === "douyin" ? "unsafe-url" : "strict-origin-when-cross-origin";
        }

        function getEmbedUrl(video) {
            return getVideoTutorialEmbedUrl(video);
        }

        function isPortraitVideo(video) {
            return video.platform === "douyin";
        }

        function embedFailed(videoId) {
            return failedEmbedVideoIds.value.includes(videoId);
        }

        function markEmbedFailed(videoId) {
            if (!embedFailed(videoId)) {
                failedEmbedVideoIds.value = [...failedEmbedVideoIds.value, videoId];
            }
        }

        function hasFloatingPlayer() {
            return hasFloatingVideoTutorial();
        }

        function isFloating(videoId) {
            return isFloatingVideoTutorial(videoId);
        }

        function openPictureInPicture(video) {
            openFloatingVideoTutorial(video);
        }

        function selectCategory(categoryId) {
            selectedCategoryId.value = categoryId;
        }

        function openRequestedCategory(event) {
            selectCategory(event.detail?.categoryId ?? null);
        }

        onMounted(() => {
            selectCategory(consumeRequestedVideoTutorialCategory());
            document.addEventListener(VIDEO_TUTORIALS_OPEN_EVENT, openRequestedCategory);
            GUI.content_ready();
        });

        onBeforeUnmount(() => {
            document.removeEventListener(VIDEO_TUTORIALS_OPEN_EVENT, openRequestedCategory);
        });

        return {
            categories: catalog.categories,
            embedFailed,
            embedReferrerPolicy,
            filteredVideos,
            getEmbedUrl,
            hasActiveFilters,
            hasFloatingPlayer,
            isEmbeddable,
            isFloating,
            isPortraitVideo,
            markEmbedFailed,
            openPictureInPicture,
            platformLabel,
            searchQuery,
            selectCategory,
            selectedCategoryId,
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
    background: linear-gradient(135deg, #253b6c, #587fe0);
    color: #fff;
    font-size: 24px;
    font-weight: 700;
}

.video-tutorial-embed-fallback {
    display: grid;
    height: 100%;
    padding: 16px;
    margin: 0;
    place-items: center;
    color: #9a500f;
    font-size: 13px;
    text-align: center;
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

    .video-tutorial-section {
        padding: 16px;
    }

    .video-tutorial-grid {
        grid-template-columns: 1fr;
    }
}
</style>
