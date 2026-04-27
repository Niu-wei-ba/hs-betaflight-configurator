<template>
    <BaseTab tab-name="landing">
        <div class="content_wrapper landing-page">
            <aside class="landing-side-qr" aria-label="左侧 QQ 二维码">
                <div class="landing-side-qr-head">
                    <span class="landing-side-qr-title">QQ 交流群</span>
                    <span class="landing-side-qr-note">扫码加入</span>
                </div>
                <div class="landing-side-qr-frame">
                    <img class="welcome-qr-image" :src="qqQrUrl" alt="HS-FPV QQ 交流群二维码" />
                </div>
            </aside>

            <section class="landing-hero">
                <div class="hero-copy">
                    <div class="hero-copy-main">
                        <h1 class="hero-title hero-title-community">
                            <span class="hero-title-line">专为穿越机玩家</span>
                            <span class="hero-title-line hero-title-line-indent"
                                >打造的<span class="hero-title-accent">交流社区</span></span
                            >
                        </h1>

                        <p class="hero-subtitle">让花生 FPV 成为中文穿越机玩家共享经验与持续成长的社区入口。</p>
                    </div>

                    <div class="hero-highlights">
                        <article v-for="highlight in heroHighlights" :key="highlight.title" class="hero-highlight-item">
                            <div
                                class="hero-highlight-icon-shell"
                                :class="`hero-highlight-icon-shell-${highlight.tint}`"
                            >
                                <svg
                                    v-if="highlight.icon === 'rocket'"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    width="22"
                                    height="22"
                                    fill="currentColor"
                                    class="hero-highlight-icon"
                                >
                                    <path
                                        d="M14.5 3.5c2.9-.2 5.7 2.6 5.5 5.5-.1 1.5-.8 2.9-1.9 4l-2.5 2.5-3.6-3.6 2.5-2.5c1.1-1.1 2.5-1.8 4-1.9ZM10.4 13.6l3 3-2 2a3 3 0 0 1-1.3.8l-3.7 1.1 1.1-3.7a3 3 0 0 1 .8-1.3l2.1-1.9ZM8 7l3 3-3 3-3-3 3-3Z"
                                    ></path>
                                </svg>
                                <svg
                                    v-else-if="highlight.icon === 'layers'"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    width="22"
                                    height="22"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="hero-highlight-icon"
                                >
                                    <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z"></path>
                                    <path d="m3 12 9 4.5 9-4.5"></path>
                                    <path d="m3 16.5 9 4.5 9-4.5"></path>
                                </svg>
                                <svg
                                    v-else-if="highlight.icon === 'users'"
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    width="22"
                                    height="22"
                                    fill="currentColor"
                                    class="hero-highlight-icon"
                                >
                                    <path
                                        d="M16 11a4 4 0 1 0-3.999-4A4 4 0 0 0 16 11Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4ZM8 13c-.29 0-.62.02-.97.05A4.2 4.2 0 0 1 9 17v2H2v-2c0-2.21 3.58-3.73 6-3.99Z"
                                    ></path>
                                </svg>
                                <svg
                                    v-else
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    width="22"
                                    height="22"
                                    fill="currentColor"
                                    class="hero-highlight-icon"
                                >
                                    <path
                                        d="m12 2 7 3v6c0 5-3.4 9.74-7 11-3.6-1.26-7-6-7-11V5l7-3Zm0 5.2L8.9 8.8l.6 3.4L12 14l2.5-1.8.6-3.4L12 7.2Z"
                                    ></path>
                                </svg>
                            </div>

                            <div class="hero-highlight-copy">
                                <h2>{{ highlight.title }}</h2>
                                <p>{{ highlight.lines[0] }}</p>
                                <p>{{ highlight.lines[1] }}</p>
                            </div>
                        </article>
                    </div>

                    <div class="hero-actions hero-actions-grid">
                        <div class="hero-actions-copy-stack">
                            <a
                                href="https://hs-fpv.com/"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="entry-card entry-card-primary"
                            >
                                <img
                                    class="entry-card-image"
                                    :src="communityCtaUrl"
                                    alt="进入花生FPV社区，探索更多装机方案与经验分享"
                                />
                            </a>
                        </div>
                    </div>
                </div>

                <div class="hero-sidebar">
                    <section class="panel-card hero-poster-card" aria-label="飞手配置海报">
                        <div class="panel-head">
                            <span class="panel-head-icon panel-head-icon-blue">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    width="20"
                                    height="20"
                                    fill="currentColor"
                                    class="panel-head-svg"
                                >
                                    <path
                                        d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm-1 14H6V7h12v10Zm-8.5-2.5 2.3-2.9 1.7 2.1 2.5-3.2L18 15H8.5Z"
                                    ></path>
                                </svg>
                            </span>
                            <div>
                                <h2>飞手配置海报</h2>
                                <p>记录你的穿越机配置，生成可分享的装备卡片</p>
                            </div>
                        </div>

                        <div class="hero-carousel-frame hero-carousel-frame-poster">
                            <button
                                type="button"
                                class="hero-carousel-arrow hero-carousel-arrow-left"
                                aria-label="上一张海报"
                                @click="showPrevPoster"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    width="20"
                                    height="20"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="hero-carousel-arrow-icon"
                                >
                                    <path d="m15 18-6-6 6-6"></path>
                                </svg>
                            </button>

                            <a
                                v-for="(poster, index) in showcasePosters"
                                :key="poster.src"
                                :href="poster.src"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="hero-carousel-slide"
                                :class="{ 'is-active': index === activePosterIndex }"
                            >
                                <img :src="poster.src" :alt="poster.alt" :loading="index === 0 ? 'eager' : 'lazy'" />
                            </a>

                            <button
                                type="button"
                                class="hero-carousel-arrow hero-carousel-arrow-right"
                                aria-label="下一张海报"
                                @click="showNextPoster"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    width="20"
                                    height="20"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="hero-carousel-arrow-icon"
                                >
                                    <path d="m9 18 6-6-6-6"></path>
                                </svg>
                            </button>
                        </div>

                        <div class="hero-carousel-dots">
                            <button
                                v-for="(poster, index) in showcasePosters"
                                :key="`${poster.alt}-${index}`"
                                type="button"
                                class="hero-carousel-dot"
                                :class="{ 'is-active': index === activePosterIndex }"
                                :aria-label="`切换到第 ${index + 1} 张海报`"
                                @click="setActivePoster(index)"
                            ></button>
                        </div>
                    </section>
                </div>
            </section>

            <div class="language-switcher">
                <span class="lang-label">{{ $t("language_choice_message") }}</span>
                <div class="lang-options">
                    <a
                        v-for="lang in availableLanguages"
                        :key="lang"
                        href="#"
                        :lang="lang"
                        :class="{ 'selected-lang': lang === selectedLanguage }"
                        @click.prevent="changeLanguage(lang)"
                    >
                        {{ $t(`language_${lang}`) }}
                    </a>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, onBeforeUnmount, onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import { i18n } from "../../js/localization";
import communityCtaUrl from "../../images/landing-community-cta.png";
import qqQrUrl from "../../images/hs-qq-qr.png";

const showcasePosters = [
    {
        src: "https://public-1322839452.cos.ap-guangzhou.myqcloud.com/5%E5%AF%B8%E8%8A%B1%E9%A3%9E%E6%9C%BA-share-poster.png",
        alt: "五寸花飞机海报",
    },
    {
        src: "https://public-1322839452.cos.ap-guangzhou.myqcloud.com/Mario5%E5%AE%BDX%EF%BC%88%E6%A8%A1%E6%8B%9F%E7%89%88%EF%BC%89-share-poster.png",
        alt: "Mario5 模拟版海报",
    },
    {
        src: "https://public-1322839452.cos.ap-guangzhou.myqcloud.com/Mark5-share-poster.png",
        alt: "Mark5 海报",
    },
    {
        src: "https://public-1322839452.cos.ap-guangzhou.myqcloud.com/%E4%BA%94%E5%AF%B8%E8%8A%B1%E9%A3%9E-share-poster.png",
        alt: "五寸花飞海报",
    },
    {
        src: "https://public-1322839452.cos.ap-guangzhou.myqcloud.com/%E6%9A%B4%E5%90%9BX5-%E4%BA%94%E5%AF%B8%E8%B6%85%E8%80%90%E7%82%B8-share-poster.png",
        alt: "暴君 X5 超耐炸海报",
    },
];

const heroHighlights = [
    {
        title: "配置广场",
        icon: "rocket",
        tint: "orange",
        lines: ["真实装机方案", "配置对比参考"],
    },
    {
        title: "经验沉淀",
        icon: "layers",
        tint: "blue",
        lines: ["炸机复盘记录", "排障思路整理"],
    },
    {
        title: "飞友交流",
        icon: "users",
        tint: "green",
        lines: ["问题讨论互助", "日常分享更新"],
    },
    {
        title: "教程资料",
        icon: "shield",
        tint: "violet",
        lines: ["入门到进阶", "持续补充内容"],
    },
];

export default defineComponent({
    name: "LandingTab",
    components: {
        BaseTab,
    },
    setup() {
        const availableLanguages = ref(["DEFAULT", ...i18n.getLanguagesAvailables()]);
        const selectedLanguage = ref(i18n.selectedLanguage);
        const activePosterIndex = ref(0);
        let posterTimer = null;

        function changeLanguage(lang) {
            if (i18n.selectedLanguage !== lang) {
                i18n.changeLanguage(lang);
                selectedLanguage.value = lang;
            }
        }

        function setActivePoster(index) {
            activePosterIndex.value = index;
        }

        function showPrevPoster() {
            activePosterIndex.value = (activePosterIndex.value - 1 + showcasePosters.length) % showcasePosters.length;
        }

        function showNextPoster() {
            activePosterIndex.value = (activePosterIndex.value + 1) % showcasePosters.length;
        }

        function startPosterRotation() {
            const reducedMotionQuery =
                typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

            if (reducedMotionQuery?.matches) {
                return;
            }

            posterTimer = window.setInterval(() => {
                showNextPoster();
            }, 3600);
        }

        onMounted(() => {
            GUI.content_ready();
            startPosterRotation();
        });

        onBeforeUnmount(() => {
            if (posterTimer !== null) {
                window.clearInterval(posterTimer);
            }
        });

        return {
            activePosterIndex,
            availableLanguages,
            changeLanguage,
            communityCtaUrl,
            heroHighlights,
            qqQrUrl,
            setActivePoster,
            selectedLanguage,
            showcasePosters,
            showNextPoster,
            showPrevPoster,
        };
    },
});
</script>

<style scoped>
.landing-page {
    --landing-ink: #10244f;
    --landing-ink-soft: rgba(16, 36, 79, 0.68);
    --landing-muted: #8b97b6;
    --landing-line: rgba(16, 36, 79, 0.08);
    --landing-orange: #ff7d1f;
    --landing-orange-soft: rgba(255, 125, 31, 0.1);
    --landing-blue: #5c8dff;
    --landing-blue-soft: rgba(92, 141, 255, 0.12);
    --landing-green: #35c983;
    --landing-green-soft: rgba(53, 201, 131, 0.12);
    --landing-violet: #8e68ff;
    --landing-violet-soft: rgba(142, 104, 255, 0.12);
    --landing-shadow: 0 28px 64px rgba(16, 36, 79, 0.08);
    display: flex;
    flex-direction: column;
    gap: 26px;
    width: 100%;
    max-width: 1220px;
    margin: 0 auto;
    padding: 30px 28px 40px;
    font-family:
        "SF Pro Display",
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        Helvetica,
        Arial,
        sans-serif;
    color: var(--landing-ink);
    position: relative;
    overflow: hidden;
}

.landing-page::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
        radial-gradient(circle at 18% 18%, rgba(255, 137, 41, 0.18), transparent 28%),
        radial-gradient(circle at 82% 14%, rgba(86, 142, 255, 0.12), transparent 24%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 251, 255, 0.96));
    z-index: 0;
    pointer-events: none;
}

.landing-page::after {
    content: "";
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(
            30deg,
            rgba(16, 36, 79, 0.028) 12%,
            transparent 12.5%,
            transparent 87%,
            rgba(16, 36, 79, 0.028) 87.5%,
            rgba(16, 36, 79, 0.028)
        ),
        linear-gradient(
            150deg,
            rgba(16, 36, 79, 0.028) 12%,
            transparent 12.5%,
            transparent 87%,
            rgba(16, 36, 79, 0.028) 87.5%,
            rgba(16, 36, 79, 0.028)
        ),
        linear-gradient(
            90deg,
            rgba(16, 36, 79, 0.018) 2%,
            transparent 2.5%,
            transparent 97%,
            rgba(16, 36, 79, 0.018) 97.5%,
            rgba(16, 36, 79, 0.018)
        );
    background-size: 44px 76px;
    background-position:
        0 0,
        0 0,
        22px 38px;
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.26), rgba(0, 0, 0, 0.04) 40%, transparent 80%);
    z-index: 0;
    pointer-events: none;
}

.landing-page > * {
    position: relative;
    z-index: 1;
}

.landing-side-qr {
    position: fixed;
    left: 1rem;
    top: 372px;
    z-index: 6;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 13rem;
    padding: 10px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid rgba(16, 36, 79, 0.08);
    box-shadow: 0 12px 28px rgba(16, 36, 79, 0.08);
}

.landing-side-qr-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.landing-side-qr-title {
    color: var(--landing-ink);
    font-size: 15px;
    line-height: 1.2;
    font-weight: 900;
}

.landing-side-qr-note {
    color: rgba(16, 36, 79, 0.52);
    font-size: 11px;
    line-height: 1.4;
    font-weight: 700;
}

.landing-side-qr-frame {
    box-sizing: border-box;
    width: 100%;
    padding: 12px;
    border-radius: 16px;
    background: rgba(247, 249, 255, 0.96);
    border: 1px solid rgba(16, 36, 79, 0.06);
    overflow: hidden;
}

.landing-hero {
    display: grid;
    grid-template-columns: minmax(0, 590px) minmax(0, 430px);
    justify-content: center;
    gap: 32px;
    align-items: start;
}

.hero-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
    padding-top: 16px;
    min-width: 0;
}

.hero-copy-main {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 16px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid rgba(255, 125, 31, 0.18);
    box-shadow: 0 12px 28px rgba(16, 36, 79, 0.05);
    color: var(--landing-orange);
    font-size: 14px;
    line-height: 1;
    font-weight: 700;
}

.hero-badge-icon,
.hero-note-icon,
.entry-icon,
.panel-head-svg,
.hero-carousel-arrow-icon,
.announcement-icon {
    width: 20px;
    height: 20px;
}

.hero-title {
    margin: 0;
    max-width: 12ch;
    font-size: 50px;
    line-height: 1.12;
    letter-spacing: 0;
    font-weight: 850;
}

.hero-title-line {
    display: block;
}

.hero-title-line-indent {
    padding-left: 2em;
    white-space: nowrap;
}

.hero-title-accent {
    display: inline;
    color: var(--landing-orange);
    font-size: 0.92em;
    font-weight: 900;
}

.hero-subtitle {
    margin: 0;
    max-width: 590px;
    color: var(--landing-ink-soft);
    font-size: 18px;
    line-height: 1.55;
    letter-spacing: -0.02em;
    white-space: nowrap;
}

.hero-highlights {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    width: 100%;
    max-width: 590px;
}

.hero-highlight-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
    min-height: 88px;
    padding: 14px 16px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.58);
    border: 1px solid rgba(16, 36, 79, 0.05);
    box-shadow: 0 12px 30px rgba(16, 36, 79, 0.04);
    transition:
        transform 0.2s ease,
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        background-color 0.2s ease;
}

.hero-highlight-item:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 125, 31, 0.12);
    background: rgba(255, 255, 255, 0.76);
    box-shadow: 0 18px 38px rgba(16, 36, 79, 0.08);
}

.hero-highlight-icon-shell {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    border-radius: 17px;
}

.hero-highlight-icon-shell-orange {
    background: var(--landing-orange-soft);
    color: var(--landing-orange);
}

.hero-highlight-icon-shell-blue {
    background: var(--landing-blue-soft);
    color: var(--landing-blue);
}

.hero-highlight-icon-shell-green {
    background: var(--landing-green-soft);
    color: var(--landing-green);
}

.hero-highlight-icon-shell-violet {
    background: var(--landing-violet-soft);
    color: var(--landing-violet);
}

.hero-highlight-icon {
    width: 22px;
    height: 22px;
}

.hero-highlight-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.hero-highlight-copy h2 {
    margin: 0;
    font-size: 16px;
    line-height: 1.2;
    font-weight: 800;
    color: var(--landing-ink);
}

.hero-highlight-copy p {
    margin: 0;
    font-size: 13px;
    line-height: 1.35;
    color: rgba(16, 36, 79, 0.52);
    font-weight: 600;
}

.hero-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    width: 100%;
    max-width: 590px;
}

.hero-actions-grid {
    display: grid;
    grid-template-columns: minmax(0, 520px);
    gap: 16px;
    width: 100%;
    max-width: 520px;
    align-items: stretch;
    margin-top: 4px;
    margin-left: 30px;
}

.hero-actions-copy-stack {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
}

.entry-card {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 22px;
    text-decoration: none;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition:
        transform 0.22s ease,
        box-shadow 0.22s ease;
}

.entry-card:hover {
    transform: translateY(-2px) scale(1.035);
}

.entry-card:focus-visible,
.hero-carousel-dot:focus-visible,
.hero-carousel-arrow:focus-visible,
.announcement-link:focus-visible,
.lang-options a:focus-visible {
    outline: 3px solid rgba(92, 141, 255, 0.28);
    outline-offset: 3px;
}

.entry-card-primary {
    background: transparent;
    box-shadow: 0 18px 40px rgba(16, 36, 79, 0.12);
}

.entry-card-primary::after {
    content: "";
    position: absolute;
    inset: -42% -28%;
    background: linear-gradient(
        110deg,
        transparent 40%,
        rgba(255, 255, 255, 0.12) 47%,
        rgba(255, 255, 255, 0.52) 50%,
        rgba(255, 255, 255, 0.12) 53%,
        transparent 60%
    );
    transform: translateX(-72%) skewX(-18deg);
    animation: entry-shine 3.8s ease-in-out infinite;
    pointer-events: none;
}

.entry-card-image {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 22px;
}

@keyframes entry-shine {
    0%,
    18% {
        transform: translateX(-72%) skewX(-18deg);
    }

    48%,
    100% {
        transform: translateX(72%) skewX(-18deg);
    }
}

@media (prefers-reduced-motion: reduce) {
    .entry-card-primary::after {
        animation: none;
        opacity: 0;
    }
}

.hero-note {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: rgba(16, 36, 79, 0.42);
    font-size: 15px;
    line-height: 1.4;
    font-weight: 700;
}

.landing-announcement {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    width: 100%;
    max-width: 720px;
    min-height: 64px;
    padding: 12px 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.72);
    box-shadow: 0 18px 36px rgba(16, 36, 79, 0.06);
}

.announcement-copy {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
}

.announcement-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    color: var(--landing-orange);
    font-size: 14px;
    line-height: 1;
    font-weight: 800;
}

.announcement-text,
.announcement-date {
    font-size: 14px;
    line-height: 1.4;
    color: rgba(16, 36, 79, 0.72);
    font-weight: 600;
}

.announcement-link {
    flex-shrink: 0;
    color: var(--landing-orange);
    text-decoration: none;
    font-size: 14px;
    line-height: 1;
    font-weight: 800;
}

.hero-sidebar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    min-width: 0;
    width: min(100%, 430px);
    justify-self: start;
    align-self: start;
}

.panel-card {
    padding: 20px;
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.78);
    box-shadow: var(--landing-shadow);
}

.panel-head {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    width: 100%;
    margin-bottom: 18px;
}

.hero-poster-card {
    --poster-frame-width: min(100%, clamp(240px, 34vh, 360px));
    display: flex;
    flex-direction: column;
    align-items: center;
    width: fit-content;
    max-width: 100%;
    padding: 22px 22px 18px;
}

.hero-poster-card .panel-head {
    width: var(--poster-frame-width);
}

.panel-head-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex-shrink: 0;
    border-radius: 14px;
}

.panel-head-icon-blue {
    background: var(--landing-blue-soft);
    color: var(--landing-blue);
}

.panel-head h2 {
    margin: 0 0 6px;
    font-size: 16px;
    line-height: 1.2;
    font-weight: 800;
}

.panel-head p {
    margin: 0;
    color: rgba(16, 36, 79, 0.52);
    font-size: 13px;
    line-height: 1.45;
    font-weight: 600;
}

.hero-carousel-frame {
    position: relative;
    aspect-ratio: 1.2 / 0.84;
    border-radius: 26px;
    overflow: hidden;
    background: #081120;
}

.hero-carousel-frame-poster {
    align-self: center;
    width: var(--poster-frame-width);
    aspect-ratio: 9 / 16;
    min-height: 0;
}

.hero-carousel-slide {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.28s ease;
}

.hero-carousel-slide.is-active {
    opacity: 1;
    pointer-events: auto;
}

.hero-carousel-slide img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center;
}

.hero-carousel-arrow {
    position: absolute;
    top: 50%;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-top: -22px;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    color: rgba(16, 36, 79, 0.72);
    box-shadow: 0 12px 24px rgba(16, 36, 79, 0.12);
    cursor: pointer;
}

.hero-carousel-arrow-left {
    left: 12px;
}

.hero-carousel-arrow-right {
    right: 12px;
}

.hero-carousel-dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    width: var(--poster-frame-width);
    padding-top: 12px;
}

.hero-carousel-dot {
    width: 8px;
    height: 8px;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: rgba(16, 36, 79, 0.16);
    cursor: pointer;
    transition:
        width 0.2s ease,
        background-color 0.2s ease;
}

.hero-carousel-dot.is-active {
    width: 22px;
    background: var(--landing-orange);
}

.welcome-qr-image {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 16px;
}

.language-switcher {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 14px;
    padding-top: 18px;
    border-top: 1px solid rgba(16, 36, 79, 0.06);
}

.lang-label {
    color: rgba(16, 36, 79, 0.52);
    font-size: 13px;
    line-height: 1.4;
    font-weight: 700;
}

.lang-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.lang-options a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(16, 36, 79, 0.08);
    background: rgba(255, 255, 255, 0.88);
    color: rgba(16, 36, 79, 0.66);
    text-decoration: none;
    font-size: 13px;
    line-height: 1;
    font-weight: 700;
}

.lang-options a.selected-lang {
    border-color: rgba(255, 125, 31, 0.24);
    color: var(--landing-orange);
}

@media (max-width: 1120px) {
    .landing-side-qr {
        display: none;
    }

    .landing-hero {
        grid-template-columns: 1fr;
        gap: 30px;
    }

    .hero-copy {
        padding-top: 10px;
    }

    .hero-highlights {
        max-width: none;
    }

    .hero-actions,
    .landing-announcement {
        max-width: none;
    }

    .hero-actions-grid {
        grid-template-columns: 1fr;
        max-width: 520px;
        margin-left: 0;
    }

    .hero-poster-card {
        --poster-frame-width: min(100%, clamp(220px, 36vh, 330px));
    }

    .hero-sidebar {
        width: min(100%, 390px);
        justify-self: start;
    }
}

@media (max-width: 840px) {
    .landing-page {
        padding: 20px 16px 34px;
    }

    .hero-subtitle {
        max-width: 28ch;
        font-size: 17px;
        white-space: normal;
    }

    .hero-poster-card {
        --poster-frame-width: min(100%, clamp(210px, 40vh, 310px));
    }

    .landing-announcement,
    .language-switcher {
        flex-direction: column;
        align-items: flex-start;
    }

    .announcement-copy {
        flex-wrap: wrap;
        gap: 10px;
    }
}

@media (max-width: 640px) {
    .hero-title {
        font-size: 36px;
    }

    .hero-copy-main {
        gap: 16px;
    }

    .hero-highlights {
        grid-template-columns: 1fr;
    }

    .hero-actions-grid {
        max-width: none;
    }

    .panel-card {
        padding: 16px;
        border-radius: 22px;
    }

    .hero-carousel-arrow {
        width: 40px;
        height: 40px;
        margin-top: -20px;
    }

    .hero-poster-card {
        --poster-frame-width: min(100%, clamp(200px, 58vw, 300px));
    }
}
</style>
