<template>
    <section class="video-tutorial-document" aria-labelledby="video-tutorial-document-title">
        <header class="video-tutorial-document__header">
            <div>
                <p class="video-tutorial-document__eyebrow">教程文档</p>
                <h2 id="video-tutorial-document-title">{{ documentTitle }}</h2>
                <p v-if="document?.version" class="video-tutorial-document__version">文档版本 {{ document.version }}</p>
            </div>
            <button type="button" class="video-tutorial-document__close" aria-label="关闭文档" @click="$emit('close')">
                ×
            </button>
        </header>

        <p v-if="loading" class="video-tutorial-document__status" role="status">正在加载教程文档…</p>
        <p v-else-if="error" class="video-tutorial-document__status" role="alert">{{ error }}</p>
        <div v-if="video?.sourceUrl" class="video-tutorial-document__actions">
            <a :href="video.sourceUrl" target="_blank" rel="noopener noreferrer">观看视频 ↗</a>
            <span v-if="video?.authorName" class="video-tutorial-document__author">作者：{{ video.authorName }}</span>
        </div>
        <template v-if="!loading && !error && document?.markdown">
            <div class="video-tutorial-document__markdown" v-html="sanitizedHtml"></div>
        </template>
        <p v-else-if="!loading && !error" class="video-tutorial-document__status" role="status">
            教程文档暂时没有可显示内容。
        </p>
    </section>
</template>

<script>
import { computed, defineComponent } from "vue";
import DOMPurify from "dompurify";
import { marked } from "marked";

export default defineComponent({
    name: "VideoTutorialDocument",
    props: {
        tutorial: { type: Object, default: null },
        document: { type: Object, default: null },
        loading: { type: Boolean, default: false },
        error: { type: String, default: "" },
        video: { type: Object, default: null },
    },
    emits: ["close"],
    setup(props) {
        const documentTitle = computed(() => props.document?.title || props.tutorial?.title || "教程文档");
        const sanitizedHtml = computed(() => {
            if (!props.document?.markdown) return "";
            const rendered = marked.parse(props.document.markdown, { mangle: false, headerIds: false });
            return DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } });
        });
        return { documentTitle, sanitizedHtml };
    },
});
</script>

<style scoped>
.video-tutorial-document {
    width: min(100%, 900px);
    max-height: min(88vh, 980px);
    overflow: auto;
    box-sizing: border-box;
    padding: 26px clamp(18px, 4vw, 42px) 36px;
    border: 1px solid rgba(20, 35, 66, 0.14);
    border-radius: 18px;
    background: #fff;
    box-shadow: 0 20px 55px rgba(16, 36, 79, 0.2);
    color: #142342;
}

.video-tutorial-document__header {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-start;
    padding-bottom: 18px;
    border-bottom: 1px solid rgba(20, 35, 66, 0.1);
}

.video-tutorial-document__eyebrow,
.video-tutorial-document__version {
    margin: 0;
    color: #ff7d1f;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
}

.video-tutorial-document h2 {
    margin: 5px 0 0;
    font-size: clamp(22px, 3vw, 34px);
}
.video-tutorial-document__version {
    margin-top: 7px;
    color: #68738a;
    font-size: 12px;
    letter-spacing: 0;
    font-weight: 500;
}
.video-tutorial-document__close {
    border: 0;
    background: transparent;
    color: #68738a;
    cursor: pointer;
    font-size: 28px;
    line-height: 1;
}
.video-tutorial-document__status {
    padding: 24px 0;
    color: #68738a;
    line-height: 1.7;
}
.video-tutorial-document__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    padding: 18px 0 6px;
}
.video-tutorial-document__actions a {
    color: #b95000;
    font-weight: 700;
}
.video-tutorial-document__author {
    color: #68738a;
    font-size: 13px;
}
.video-tutorial-document__chapters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 14px 0 6px;
    color: #68738a;
    font-size: 13px;
}
.video-tutorial-document__chapter-actions {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}
.video-tutorial-document__chapters button,
.video-tutorial-document__chapter-actions a {
    padding: 5px 9px;
    border: 1px solid rgba(255, 125, 31, 0.3);
    border-radius: 999px;
    background: #fff7ee;
    color: #b95000;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    text-decoration: none;
}
.video-tutorial-document__chapter-actions a {
    border-color: transparent;
    background: transparent;
}
.video-tutorial-document__chapter-actions a:hover,
.video-tutorial-document__chapter-actions a:focus-visible {
    border-color: rgba(255, 125, 31, 0.3);
    background: #fff7ee;
}
.video-tutorial-document__markdown {
    padding-top: 15px;
    line-height: 1.8;
}
.video-tutorial-document__markdown :deep(h1),
.video-tutorial-document__markdown :deep(h2),
.video-tutorial-document__markdown :deep(h3) {
    margin: 1.5em 0 0.55em;
    line-height: 1.3;
}
.video-tutorial-document__markdown :deep(h1) {
    font-size: 28px;
}
.video-tutorial-document__markdown :deep(h2) {
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(20, 35, 66, 0.1);
    font-size: 21px;
}
.video-tutorial-document__markdown :deep(p),
.video-tutorial-document__markdown :deep(ul),
.video-tutorial-document__markdown :deep(ol) {
    margin: 0.65em 0;
}
.video-tutorial-document__markdown :deep(code) {
    padding: 2px 4px;
    border-radius: 4px;
    background: #f2f5fa;
}
.video-tutorial-document__markdown :deep(a) {
    color: #b95000;
}
@media (max-width: 640px) {
    .video-tutorial-document {
        max-height: 92vh;
        border-radius: 14px;
    }
    .video-tutorial-document__markdown :deep(h1) {
        font-size: 24px;
    }
}
</style>
