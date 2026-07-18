<template>
    <aside
        v-if="isOpen"
        class="video-tutorial-search-panel"
        :class="{ 'video-tutorial-search-panel--playing': selectedVideo }"
        aria-label="视频教程搜索结果"
    >
        <template v-if="selectedDocumentVideo">
            <header class="video-tutorial-search-panel__header video-tutorial-search-panel__header--player">
                <button class="video-tutorial-search-panel__back" type="button" @click="backToResults">
                    ← {{ t("tutorialSearchBackToResults", "返回结果") }}
                </button>
                <button
                    class="video-tutorial-search-panel__close"
                    type="button"
                    :aria-label="t('tutorialSearchClose', '关闭')"
                    :title="t('tutorialSearchClose', '关闭')"
                    @click="closePanel"
                >
                    ×
                </button>
            </header>
            <VideoTutorialDocument
                :tutorial="selectedDocumentVideo"
                :video="selectedDocumentVideo"
                :document="selectedDocument"
                :loading="documentLoading"
                :error="documentError"
                @close="backToResults"
            />
        </template>

        <template v-else-if="!selectedVideo">
            <header class="video-tutorial-search-panel__header">
                <div>
                    <p class="video-tutorial-search-panel__eyebrow">{{ t("tutorialSearchTitle", "视频教程") }}</p>
                    <h2>{{ t("tutorialSearchResults", "搜索结果") }}</h2>
                    <p class="video-tutorial-search-panel__query">
                        {{ t("tutorialSearchResultCount", undefined, { count: results.length }) }} · “{{
                            submittedQuery
                        }}”
                    </p>
                </div>
                <button
                    class="video-tutorial-search-panel__close"
                    type="button"
                    :aria-label="t('tutorialSearchClose', '关闭')"
                    :title="t('tutorialSearchClose', '关闭')"
                    @click="closePanel"
                >
                    ×
                </button>
            </header>

            <p v-if="isSearching" class="video-tutorial-search-panel__empty" role="status">正在进行语义检索…</p>
            <p v-else-if="searchError" class="video-tutorial-search-panel__empty" role="alert">{{ searchError }}</p>
            <p v-else-if="!results.length" class="video-tutorial-search-panel__empty" role="status">
                {{ t("tutorialSearchNoResults", "没有找到相关视频片段。请换一个描述试试。") }}
            </p>

            <div v-else class="video-tutorial-search-panel__results">
                <article
                    v-for="video in results"
                    :key="video.tutorialId || video.id"
                    class="video-tutorial-search-result"
                >
                    <img
                        v-if="video.thumbnailUrl && !thumbnailFailed(video.id)"
                        class="video-tutorial-search-result__thumbnail"
                        :src="video.thumbnailUrl"
                        :alt="`${video.title} 封面`"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        @error="markThumbnailFailed(video.id)"
                    />
                    <span
                        v-else
                        class="video-tutorial-search-result__thumbnail video-tutorial-search-result__thumbnail--empty"
                    >
                        ▶
                    </span>
                    <span class="video-tutorial-search-result__content">
                        <span class="video-tutorial-search-result__meta">
                            {{ categoryTitle(video) }} · {{ platformLabel(video.platform) }}
                            <strong v-if="video.timeRange"> · {{ video.timeRange }}</strong>
                        </span>
                        <span class="video-tutorial-search-result__sources">
                            <span
                                v-for="label in video.sourceLabels || [video.sourceLabel]"
                                :key="label"
                                class="video-tutorial-search-result__source-label"
                            >
                                {{ label }}
                            </span>
                        </span>
                        <span
                            v-if="video.authorName || (video.authorAvatarUrl && !authorAvatarFailed(video.id))"
                            class="video-tutorial-search-result__author"
                        >
                            <img
                                v-if="video.authorAvatarUrl && !authorAvatarFailed(video.id)"
                                :src="video.authorAvatarUrl"
                                :alt="video.authorName ? `${video.authorName} 的头像` : '视频作者头像'"
                                loading="lazy"
                                referrerpolicy="no-referrer"
                                @error="markAuthorAvatarFailed(video.id)"
                            />
                            <span>{{ video.authorName || "视频作者" }}</span>
                        </span>
                        <span class="video-tutorial-search-result__title">{{ video.title }}</span>
                    </span>
                    <span v-if="video.tags?.length" class="video-tutorial-search-result__description"
                        >标签：{{ video.tags.join(" · ") }}</span
                    >
                    <span class="video-tutorial-search-result__description">{{
                        video.matchedText || video.description
                    }}</span>
                    <span class="video-tutorial-search-result__actions">
                        <button type="button" class="video-tutorial-search-result__action" @click="openVideo(video)">
                            观看视频
                        </button>
                        <button
                            v-if="video.document?.available"
                            type="button"
                            class="video-tutorial-search-result__action video-tutorial-search-result__action--document"
                            @click="openDocument(video)"
                        >
                            阅读文档
                        </button>
                    </span>
                </article>
            </div>
        </template>

        <template v-else>
            <header class="video-tutorial-search-panel__header video-tutorial-search-panel__header--player">
                <button class="video-tutorial-search-panel__back" type="button" @click="backToResults">
                    ← {{ t("tutorialSearchBackToResults", "返回结果") }}
                </button>
                <button
                    class="video-tutorial-search-panel__close"
                    type="button"
                    :aria-label="t('tutorialSearchClose', '关闭')"
                    :title="t('tutorialSearchClose', '关闭')"
                    @click="closePanel"
                >
                    ×
                </button>
            </header>

            <div class="video-tutorial-search-panel__player-view">
                <p class="video-tutorial-search-panel__eyebrow">
                    {{ categoryTitle(selectedVideo) }} · {{ platformLabel(selectedVideo.platform) }}
                    <strong v-if="selectedVideo.timeRange"> · 命中时间 {{ selectedVideo.timeRange }}</strong>
                </p>
                <p
                    v-if="
                        selectedVideo.authorName ||
                        (selectedVideo.authorAvatarUrl && !authorAvatarFailed(selectedVideo.id))
                    "
                    class="video-tutorial-search-panel__author"
                >
                    <img
                        v-if="selectedVideo.authorAvatarUrl && !authorAvatarFailed(selectedVideo.id)"
                        :src="selectedVideo.authorAvatarUrl"
                        :alt="selectedVideo.authorName ? `${selectedVideo.authorName} 的头像` : '视频作者头像'"
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        @error="markAuthorAvatarFailed(selectedVideo.id)"
                    />
                    <span>{{ selectedVideo.authorName || "视频作者" }}</span>
                </p>
                <h2>{{ selectedVideo.title }}</h2>

                <div
                    v-if="canEmbedSelectedVideo && !embedFailed"
                    class="video-tutorial-search-panel__player"
                    :class="{ 'video-tutorial-search-panel__player--portrait': selectedVideo.platform === 'douyin' }"
                >
                    <iframe
                        :src="selectedEmbedUrl"
                        :title="selectedVideo.title"
                        scrolling="no"
                        border="0"
                        frameborder="no"
                        framespacing="0"
                        allow="encrypted-media; fullscreen; picture-in-picture"
                        allowfullscreen
                        :referrerpolicy="getVideoTutorialEmbedReferrerPolicy(selectedVideo)"
                        @error="embedFailed = true"
                    ></iframe>
                </div>

                <div v-else class="video-tutorial-search-panel__embed-fallback" role="status">
                    <p>{{ t("tutorialSearchEmbedUnavailable", "当前平台暂时无法内嵌播放，请打开原始视频观看。") }}</p>
                    <a
                        v-if="hasValidSourceUrl(selectedVideo)"
                        :href="selectedVideoSourceUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {{ t("tutorialSearchOpenSource", "打开原始视频") }} <span aria-hidden="true">↗</span>
                    </a>
                </div>

                <p class="video-tutorial-search-panel__player-description">{{ selectedVideo.description }}</p>
            </div>
        </template>
    </aside>
</template>

<script>
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import i18next from "i18next";
import VideoTutorialDocument from "./VideoTutorialDocument.vue";
import {
    getVideoTutorialCatalog,
    getVideoTutorialEmbedReferrerPolicy,
    getVideoTutorialEmbedUrl,
    getVideoTutorialSourceUrl,
    isVideoTutorialEmbeddable,
    loadVideoTutorialCatalog,
    loadVideoTutorialDocument,
    searchVideoTutorials,
} from "../js/video_tutorials";

const CONTENT_READY_EVENT = "video-tutorial-search:content-ready";
const SEARCH_DISABLED_TABS = new Set(["landing", "privacy_policy", "help"]);
const fallbackMessages = {
    tutorialSearchTitle: "视频教程",
    tutorialSearchPlaceholder: "语义搜索 Betaflight 教程",
    tutorialSearchButton: "搜索",
    tutorialSearchResults: "语义搜索结果",
    tutorialSearchResultCount: "共找到 {{count}} 个命中片段",
    tutorialSearchNoResults: "没有找到相关视频片段。请换一个描述试试。",
    tutorialSearchClose: "关闭",
    tutorialSearchBackToResults: "返回结果",
    tutorialSearchEmbedUnavailable: "当前平台暂时无法内嵌播放，请打开原始视频观看。",
    tutorialSearchOpenSource: "打开原始视频",
};
const platformLabels = { bilibili: "B 站", douyin: "抖音" };

export default defineComponent({
    name: "VideoTutorialSearchPanel",
    components: { VideoTutorialDocument },
    setup() {
        const catalog = ref(getVideoTutorialCatalog());
        const draftQuery = ref("");
        const submittedQuery = ref("");
        const isOpen = ref(false);
        const isSearching = ref(false);
        const searchError = ref("");
        const results = ref([]);
        const selectedVideo = ref(null);
        const selectedDocumentVideo = ref(null);
        const selectedDocument = ref(null);
        const documentLoading = ref(false);
        const documentError = ref("");
        const embedFailed = ref(false);
        const failedThumbnailIds = ref(new Set());
        const failedAuthorAvatarIds = ref(new Set());
        const languageVersion = ref(0);
        const selectedEmbedUrl = computed(() => getVideoTutorialEmbedUrl(selectedVideo.value));
        const selectedVideoSourceUrl = computed(() => getVideoTutorialSourceUrl(selectedVideo.value));
        const canEmbedSelectedVideo = computed(
            () => isVideoTutorialEmbeddable(selectedVideo.value) && Boolean(selectedEmbedUrl.value),
        );

        function t(key, fallback = fallbackMessages[key] ?? key, options = {}) {
            void languageVersion.value;
            const translated = i18next.t(key, options);
            return translated === key ? fallback : translated;
        }
        function categoryTitle(video) {
            return (
                video?.categoryTitles?.join("、") ||
                video?.categories?.map((category) => category.title).join("、") ||
                "未分类"
            );
        }
        function platformLabel(platform) {
            return platformLabels[platform] ?? platform;
        }
        function hasValidSourceUrl(video) {
            return /^https:\/\//i.test(video?.sourceUrl ?? "");
        }
        function thumbnailFailed(videoId) {
            return failedThumbnailIds.value.has(videoId);
        }
        function markThumbnailFailed(videoId) {
            failedThumbnailIds.value = new Set([...failedThumbnailIds.value, videoId]);
        }
        function authorAvatarFailed(videoId) {
            return failedAuthorAvatarIds.value.has(videoId);
        }
        function markAuthorAvatarFailed(videoId) {
            failedAuthorAvatarIds.value = new Set([...failedAuthorAvatarIds.value, videoId]);
        }
        function updateLayout() {
            document
                .getElementById("tab-content-container")
                ?.classList.toggle("video-tutorial-search-open", isOpen.value);
        }
        function syncSearchControls() {
            document.querySelectorAll(".video-tutorial-search-entry input").forEach((input) => {
                if (input.value !== draftQuery.value) input.value = draftQuery.value;
            });
        }

        async function submitSearch() {
            const normalizedQuery = draftQuery.value.trim();
            if (!normalizedQuery || isSearching.value) return;
            draftQuery.value = normalizedQuery;
            submittedQuery.value = normalizedQuery;
            selectedVideo.value = null;
            selectedDocumentVideo.value = null;
            selectedDocument.value = null;
            documentError.value = "";
            embedFailed.value = false;
            searchError.value = "";
            isSearching.value = true;
            isOpen.value = true;
            syncSearchControls();
            try {
                const response = await searchVideoTutorials({ query: normalizedQuery });
                results.value = response.results;
                catalog.value = getVideoTutorialCatalog();
            } catch (error) {
                results.value = [];
                searchError.value = error?.message || "视频教程语义搜索失败。";
            } finally {
                isSearching.value = false;
            }
        }
        function closePanel() {
            isOpen.value = false;
            selectedVideo.value = null;
            selectedDocumentVideo.value = null;
            selectedDocument.value = null;
            documentError.value = "";
            embedFailed.value = false;
        }
        function openVideo(video) {
            selectedDocumentVideo.value = null;
            selectedDocument.value = null;
            documentError.value = "";
            selectedVideo.value = video;
            embedFailed.value = false;
        }
        async function openDocument(video) {
            selectedVideo.value = null;
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
        function backToResults() {
            selectedVideo.value = null;
            selectedDocumentVideo.value = null;
            selectedDocument.value = null;
            documentError.value = "";
            embedFailed.value = false;
        }

        function createSearchControl() {
            const form = document.createElement("form");
            form.className = "video-tutorial-search-entry";
            form.setAttribute("role", "search");
            form.setAttribute("aria-label", t("tutorialSearchTitle"));
            const label = document.createElement("label");
            label.className = "video-tutorial-search-entry__label";
            const input = document.createElement("input");
            input.type = "search";
            input.placeholder = t("tutorialSearchPlaceholder");
            input.value = draftQuery.value;
            input.setAttribute("aria-label", t("tutorialSearchPlaceholder"));
            input.addEventListener("input", () => {
                draftQuery.value = input.value;
            });
            const button = document.createElement("button");
            button.type = "submit";
            button.textContent = t("tutorialSearchButton");
            label.append(input);
            form.append(label, button);
            form.addEventListener("submit", (event) => {
                event.preventDefault();
                submitSearch();
            });
            return form;
        }
        function getActiveTab() {
            const activeTab = document.querySelector("#tabs li.active");
            const tabClass = [...(activeTab?.classList ?? [])].find((className) => className.startsWith("tab_"));
            return tabClass?.slice("tab_".length) ?? null;
        }
        function searchIsAvailable() {
            return !SEARCH_DISABLED_TABS.has(getActiveTab());
        }
        function clearSearchControls(content) {
            content.querySelectorAll(".video-tutorial-search-title-row").forEach((row) => {
                const title = row.querySelector(".tab_title, h1");
                if (title) row.parentNode?.insertBefore(title, row);
                row.remove();
            });
            content.querySelectorAll(".video-tutorial-search-fallback").forEach((entry) => entry.remove());
        }
        function mountSearchControl() {
            const content = document.getElementById("content");
            if (!content) return;
            clearSearchControls(content);
            if (!searchIsAvailable()) {
                closePanel();
                return;
            }
            const form = createSearchControl();
            const title = content.querySelector(".tab_title, h1");
            if (title?.parentNode) {
                const row = document.createElement("div");
                row.className = "video-tutorial-search-title-row";
                title.parentNode.insertBefore(row, title);
                row.append(title, form);
            } else {
                const fallback = document.createElement("div");
                fallback.className = "video-tutorial-search-fallback";
                const heading = document.createElement("h2");
                heading.textContent = t("tutorialSearchTitle");
                fallback.append(heading, form);
                (content.querySelector(".content_wrapper") ?? content).prepend(fallback);
            }
        }
        function refreshSearchControl() {
            languageVersion.value += 1;
            mountSearchControl();
        }
        function handleContentReady() {
            mountSearchControl();
            loadVideoTutorialCatalog()
                .then((value) => {
                    catalog.value = value;
                })
                .catch(() => {});
        }
        watch(isOpen, updateLayout);
        onMounted(() => {
            document.addEventListener(CONTENT_READY_EVENT, handleContentReady);
            i18next.on("languageChanged", refreshSearchControl);
            nextTick(handleContentReady);
        });
        onBeforeUnmount(() => {
            document.removeEventListener(CONTENT_READY_EVENT, handleContentReady);
            i18next.off("languageChanged", refreshSearchControl);
            document.getElementById("tab-content-container")?.classList.remove("video-tutorial-search-open");
        });
        return {
            authorAvatarFailed,
            backToResults,
            canEmbedSelectedVideo,
            categoryTitle,
            closePanel,
            embedFailed,
            getVideoTutorialEmbedReferrerPolicy,
            hasValidSourceUrl,
            isOpen,
            isSearching,
            markAuthorAvatarFailed,
            markThumbnailFailed,
            openDocument,
            openVideo,
            platformLabel,
            results,
            searchError,
            selectedEmbedUrl,
            selectedVideoSourceUrl,
            selectedDocument,
            selectedDocumentVideo,
            documentError,
            documentLoading,
            selectedVideo,
            submittedQuery,
            t,
            thumbnailFailed,
        };
    },
});
</script>
