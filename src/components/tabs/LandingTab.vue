<template>
    <BaseTab tab-name="landing">
        <div class="content_wrapper landing-page">
            <section class="landing-hero">
                <div class="hero-copy">
                    <div class="hero-kicker">HS-FPV / Betaflight Mirror</div>
                    <div class="hero-brand-row">
                        <div class="brand-badge">
                            <span class="badge-text"
                                ><svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    class="icon-inline"
                                >
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                </svg>
                                国内加速镜像</span
                            >
                        </div>
                        <span class="hero-hint">固件、预设、社区入口合并成一个更顺手的起点</span>
                    </div>
                    <h1 class="hero-title">{{ appConfig.appName }}</h1>
                    <p class="hero-subtitle">
                        保留原版全部配置体验，把下载、同步与社区浏览整理成一条更快、更轻的落地路径。
                    </p>
                    <div class="hero-actions">
                        <a
                            href="https://hs-fpv.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="primary-cta community-cta main-community-btn"
                        >
                            <span class="btn-pulse"></span>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                class="icon-inline-cta"
                            >
                                <path d="M15 3h6v6"></path>
                                <path d="M10 14 21 3"></path>
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            </svg>
                            <span class="btn-text">
                                <span class="btn-label">进入 HS-FPV 社区</span>
                                <span class="btn-sublabel">配置广场 · 社区讨论 · 经验分享</span>
                            </span>
                            <span class="btn-badge">热门</span>
                        </a>
                    </div>
                </div>

                <div class="hero-visual">
                    <div class="hero-visual-frame">
                        <ParticleLogoHero :image-src="logoUrl" :particle-budget="10400" />
                    </div>
                </div>
            </section>

            <section class="support-rail" aria-label="核心能力">
                <div class="support-item">
                    <span class="support-label">01</span>
                    <h2>极速固件下载</h2>
                    <p>把高频固件获取从等待变成即达，减少配置开始前的空转时间。</p>
                </div>
                <div class="support-item">
                    <span class="support-label">02</span>
                    <h2>预设环境秒连</h2>
                    <p>镜像同步官方数据源，预设与配置切换都保持原始使用习惯。</p>
                </div>
                <div class="support-item">
                    <span class="support-label">03</span>
                    <h2>社区入口合一</h2>
                    <p>配置广场、炸机复盘、AI 教官与教程社群，在同一页就能完成跳转。</p>
                </div>
            </section>

            <section class="community-story">
                <div class="story-heading">
                    <p class="story-kicker">Community</p>
                    <h2>探索花生 FPV 社区</h2>
                    <p class="story-summary">一个更纯粹的穿越机社区，少一点套路营销，多一点真实的飞行经验。</p>
                </div>

                <div class="story-layout">
                    <div class="story-list">
                        <a href="https://hs-fpv.com/" target="_blank" rel="noopener noreferrer" class="story-item">
                            <span class="story-index">01</span>
                            <div class="story-copy">
                                <h3>配置广场 & VS 对比</h3>
                                <p>看真实配置，拼性能参数，快速找到更适合自己的方案。</p>
                            </div>
                        </a>
                        <a href="https://hs-fpv.com/" target="_blank" rel="noopener noreferrer" class="story-item">
                            <span class="story-index">02</span>
                            <div class="story-copy">
                                <h3>炸机天堂</h3>
                                <p>真实复盘、失误拆解和进阶经验，少走弯路比堆参数更重要。</p>
                            </div>
                        </a>
                        <a href="https://hs-fpv.com/" target="_blank" rel="noopener noreferrer" class="story-item">
                            <span class="story-index">03</span>
                            <div class="story-copy">
                                <h3>社区问答与排障</h3>
                                <p>把常见问题、排障经验和配置讨论集中起来，减少来回查找的成本。</p>
                            </div>
                        </a>
                        <a href="https://hs-fpv.com/" target="_blank" rel="noopener noreferrer" class="story-item">
                            <span class="story-index">04</span>
                            <div class="story-copy">
                                <h3>教程与硬核社群</h3>
                                <p>更友好的成长环境，让资料、交流和实操能自然串起来。</p>
                            </div>
                        </a>
                    </div>

                    <div class="story-aside">
                        <a
                            href="https://hs-fpv.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="community-spotlight"
                        >
                            <span class="spotlight-badge">推荐</span>
                            <span class="spotlight-kicker">Fast Entry</span>
                            <strong>社区入口</strong>
                            <p>
                                直接进入配置广场、炸机复盘、AI
                                教官与教程社群，不再把"刷机之后再去哪里看"留给用户自己找。
                            </p>
                            <span class="spotlight-link">
                                现在打开
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path d="M5 12h14"></path>
                                    <path d="M12 5l7 7-7 7"></path>
                                </svg>
                            </span>
                        </a>
                        <p class="aside-copy">
                            下载、配置、交流不再被拆成几段孤立流程。你可以先刷机，再看别人的真实配置，最后把问题直接带进社区继续解决。
                        </p>
                        <div class="aside-divider"></div>
                        <p class="aside-meta">同步官方数据，保留原版操作感，只把路径变短。</p>
                    </div>
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
import { defineComponent, onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import ParticleLogoHero from "../landing/ParticleLogoHero.vue";
import GUI from "../../js/gui";
import { i18n } from "../../js/localization";
import { appConfig } from "../../js/AppConfig";
import logoUrl from "../../images/hs-white.png";

export default defineComponent({
    name: "LandingTab",
    components: {
        BaseTab,
        ParticleLogoHero,
    },
    setup() {
        const availableLanguages = ref(["DEFAULT", ...i18n.getLanguagesAvailables()]);
        const selectedLanguage = ref(i18n.selectedLanguage);

        function changeLanguage(lang) {
            if (i18n.selectedLanguage !== lang) {
                i18n.changeLanguage(lang);
                selectedLanguage.value = lang;
            }
        }

        onMounted(() => {
            GUI.content_ready();
        });

        return {
            appConfig,
            availableLanguages,
            logoUrl,
            selectedLanguage,
            changeLanguage,
        };
    },
});
</script>

<style scoped>
.landing-page {
    --landing-ink: #111c38;
    --landing-muted: #66748d;
    --landing-line: rgba(17, 28, 56, 0.1);
    --landing-accent: #f08c1e;
    display: flex;
    flex-direction: column;
    gap: 36px;
    width: 100%;
    max-width: 1120px;
    margin: 0 auto;
    padding: 20px 24px 44px;
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
}

.landing-page::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
        radial-gradient(circle at 12% 10%, rgba(240, 140, 30, 0.1), transparent 24%),
        radial-gradient(circle at 88% 14%, rgba(255, 214, 163, 0.24), transparent 18%),
        linear-gradient(rgba(240, 140, 30, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(240, 140, 30, 0.04) 1px, transparent 1px);
    background-size:
        auto,
        auto,
        36px 36px,
        36px 36px;
    background-position:
        left top,
        right top,
        center top,
        center top;
    pointer-events: none;
    z-index: 0;
}

.landing-page > * {
    position: relative;
    z-index: 1;
}

.landing-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
    align-items: center;
    gap: 36px;
    min-height: 55vh;
    padding: 8px 0;
}

.icon-inline {
    width: 14px;
    height: 14px;
    display: inline-block;
    vertical-align: middle;
    margin-right: 4px;
}

.icon-inline-cta {
    width: 18px;
    height: 18px;
    display: inline-block;
    vertical-align: middle;
    margin-right: 10px;
}

.hero-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
    max-width: 640px;
}

.hero-kicker {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: rgba(17, 28, 56, 0.52);
}

.hero-brand-row {
    display: flex;
    width: 100%;
    flex-wrap: nowrap;
    gap: 18px;
    align-items: center;
    justify-content: space-between;
}

.brand-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(240, 140, 30, 0.18);
    background: rgba(255, 255, 255, 0.22);
    backdrop-filter: blur(14px);
    flex-shrink: 0;
}

.badge-text {
    color: #c56d0c;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.02em;
}

.hero-hint {
    flex: 1;
    min-width: 0;
    font-size: clamp(16px, 1.8vw, 24px);
    line-height: 1.15;
    letter-spacing: -0.02em;
    font-weight: 600;
    color: rgba(17, 28, 56, 0.64);
    white-space: nowrap;
    text-align: left;
}

.hero-title {
    margin: 0;
    font-size: clamp(28px, 4.2vw, 56px);
    line-height: 1;
    letter-spacing: -0.04em;
    font-weight: 800;
    white-space: nowrap;
}

.hero-subtitle {
    margin: 0;
    max-width: 28rem;
    font-size: 16px;
    line-height: 1.65;
    color: var(--landing-muted);
}

.hero-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
}

.hero-visual {
    display: flex;
    justify-content: center;
    align-items: center;
}

.hero-visual-frame {
    width: min(100%, 480px);
    min-height: 420px;
    display: grid;
    place-items: center;
    position: relative;
}

.hero-visual-frame::before,
.hero-visual-frame::after {
    content: "";
    position: absolute;
    pointer-events: none;
}

.hero-visual-frame::before {
    inset: 11% 8% 14%;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(240, 140, 30, 0.12), rgba(240, 140, 30, 0));
    filter: blur(22px);
}

.hero-visual-frame::after {
    inset: 0;
    background-image:
        linear-gradient(rgba(17, 28, 56, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(17, 28, 56, 0.08) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: radial-gradient(circle at center, black 42%, transparent 82%);
    opacity: 0.34;
}

.hero-visual-frame :deep(.particulate-shell) {
    width: min(100%, 440px);
}

.hero-visual-frame :deep(.particulate-cursor) {
    display: none;
}

.support-rail {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
    padding: 18px 0 0;
    border-top: 1px solid var(--landing-line);
}

.support-item {
    padding-right: 16px;
    position: relative;
}

.support-item:not(:last-child)::after {
    content: "";
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 1px;
    background: linear-gradient(180deg, transparent, rgba(17, 28, 56, 0.12), transparent);
}

.support-label {
    display: inline-block;
    margin-bottom: 18px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.24em;
    color: rgba(240, 140, 30, 0.84);
}

.support-item h2 {
    margin: 0 0 10px;
    font-size: 22px;
    line-height: 1.2;
    font-weight: 720;
}

.support-item p {
    margin: 0;
    max-width: 23ch;
    font-size: 15px;
    line-height: 1.75;
    color: var(--landing-muted);
}

.community-story {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
    gap: 42px;
    align-items: start;
    padding-top: 18px;
    border-top: 1px solid var(--landing-line);
}

.story-heading {
    max-width: 380px;
}

.story-kicker {
    margin: 0 0 12px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.26em;
    text-transform: uppercase;
    color: rgba(240, 140, 30, 0.84);
}

.story-heading h2 {
    margin: 0 0 14px;
    font-size: clamp(34px, 4vw, 52px);
    line-height: 1;
    letter-spacing: -0.04em;
    font-weight: 800;
}

.story-summary {
    margin: 0;
    font-size: 18px;
    line-height: 1.75;
    color: var(--landing-muted);
}

.story-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 28px;
}

.story-list {
    display: flex;
    flex-direction: column;
}

.story-item {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 18px;
    align-items: start;
    padding: 18px 0;
    color: inherit;
    text-decoration: none;
    border-bottom: 1px solid rgba(17, 28, 56, 0.09);
    transition:
        transform 0.22s ease,
        color 0.22s ease,
        opacity 0.22s ease;
}

.story-item:first-child {
    padding-top: 0;
}

.story-item:hover {
    transform: translateX(6px);
    color: #0c1630;
}

.story-index {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: rgba(240, 140, 30, 0.84);
}

.story-copy h3 {
    margin: 0 0 8px;
    font-size: 22px;
    line-height: 1.2;
    font-weight: 720;
}

.story-copy p {
    margin: 0;
    font-size: 15px;
    line-height: 1.75;
    color: var(--landing-muted);
}

.story-aside {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding-top: 4px;
}

.aside-copy,
.aside-meta {
    margin: 0;
    font-size: 14px;
    line-height: 1.8;
    color: var(--landing-muted);
}

.aside-divider {
    width: 100%;
    height: 1px;
    background: linear-gradient(90deg, rgba(240, 140, 30, 0.28), rgba(17, 28, 56, 0.1));
}

.primary-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: #ca6b0d;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 14px 0;
    border-radius: 0;
    text-decoration: none;
    border: 0;
    border-bottom: 1px solid rgba(240, 140, 30, 0.36);
    box-shadow: none;
    transition:
        transform 0.28s ease,
        border-color 0.28s ease,
        color 0.28s ease;
    position: relative;
}

.community-cta {
    padding: 18px 26px;
    border: 1.5px solid transparent;
    border-radius: 999px;
    background:
        linear-gradient(135deg, rgba(240, 140, 30, 0.08) 0%, rgba(255, 230, 194, 0.08) 100%),
        linear-gradient(135deg, #ff9a44 0%, #f08c1e 50%, #e67a0e 100%);
    background-origin: border-box;
    background-clip: content-box, border-box;
    box-shadow:
        0 8px 28px rgba(240, 140, 30, 0.32),
        0 4px 12px rgba(240, 140, 30, 0.16),
        inset 0 1px 0 rgba(255, 255, 255, 0.24);
    color: #fff;
    gap: 14px;
    position: relative;
    overflow: visible;
    min-width: 320px;
    justify-content: space-between;
}

.main-community-btn {
    min-width: 360px;
    padding: 20px 28px;
    animation: btn-glow 3s ease-in-out infinite;
}

.btn-pulse {
    position: absolute;
    inset: -4px;
    border-radius: 999px;
    background: linear-gradient(135deg, #ff9a44, #f08c1e, #e67a0e);
    opacity: 0;
    animation: pulse-ring 2.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
    z-index: -1;
}

.btn-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
}

.btn-label {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: 0.04em;
}

.btn-sublabel {
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.06em;
    opacity: 0.92;
}

.btn-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.92);
    color: #e67a0e;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border-radius: 999px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.main-community-btn .icon-inline-cta {
    width: 24px;
    height: 24px;
    margin-right: 0;
}

.primary-cta:hover {
    border-color: rgba(240, 140, 30, 0.72);
    transform: translateY(-1px);
    color: #b85f08;
}

.community-cta:hover {
    background:
        linear-gradient(135deg, rgba(240, 140, 30, 0.12) 0%, rgba(255, 230, 194, 0.12) 100%),
        linear-gradient(135deg, #ffa955 0%, #ff9930 50%, #f08a10 100%);
    background-origin: border-box;
    background-clip: content-box, border-box;
    transform: translateY(-2px) scale(1.02);
    box-shadow:
        0 12px 36px rgba(240, 140, 30, 0.4),
        0 6px 16px rgba(240, 140, 30, 0.24),
        inset 0 1px 0 rgba(255, 255, 255, 0.32);
}

.main-community-btn:hover {
    box-shadow:
        0 16px 44px rgba(240, 140, 30, 0.48),
        0 8px 20px rgba(240, 140, 30, 0.28),
        inset 0 1px 0 rgba(255, 255, 255, 0.36);
}

.main-community-btn:hover .btn-badge {
    background: #fff;
    transform: scale(1.05);
}

.primary-cta:active {
    transform: translateY(0);
}

.secondary-cta {
    display: inline-flex;
    align-items: center;
    padding: 12px 0;
    color: rgba(17, 28, 56, 0.72);
    font-size: 14px;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-decoration: none;
    border-bottom: 1px solid rgba(17, 28, 56, 0.14);
    transition:
        color 0.22s ease,
        border-color 0.22s ease;
}

.secondary-cta:hover {
    color: var(--landing-ink);
    border-color: rgba(17, 28, 56, 0.34);
}

.community-spotlight {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 20px 24px;
    text-decoration: none;
    color: inherit;
    border-radius: 24px;
    border: 1.5px solid rgba(240, 140, 30, 0.28);
    background:
        radial-gradient(circle at top right, rgba(240, 140, 30, 0.2), transparent 42%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 248, 238, 0.96));
    box-shadow:
        0 16px 36px rgba(17, 28, 56, 0.1),
        0 4px 12px rgba(240, 140, 30, 0.08);
    transition:
        transform 0.24s ease,
        box-shadow 0.24s ease,
        border-color 0.24s ease;
    position: relative;
    animation: spotlight-fade 4s ease-in-out infinite;
}

.community-spotlight:hover {
    transform: translateY(-4px);
    border-color: rgba(240, 140, 30, 0.52);
    box-shadow:
        0 24px 52px rgba(17, 28, 56, 0.14),
        0 8px 20px rgba(240, 140, 30, 0.16);
}

.spotlight-badge {
    position: absolute;
    top: -8px;
    right: 16px;
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    background: linear-gradient(135deg, #ff9a44, #f08c1e);
    color: #fff;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    border-radius: 999px;
    box-shadow: 0 4px 12px rgba(240, 140, 30, 0.32);
}

.spotlight-kicker {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(240, 140, 30, 0.84);
}

.community-spotlight strong {
    font-size: 28px;
    line-height: 1;
    letter-spacing: -0.03em;
}

.community-spotlight p {
    margin: 0;
    font-size: 14px;
    line-height: 1.8;
    color: var(--landing-muted);
}

.spotlight-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    padding-bottom: 2px;
    border-bottom: 1px solid rgba(240, 140, 30, 0.44);
    color: #ca6b0d;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.04em;
    transition: gap 0.2s ease;
}

.spotlight-link svg {
    width: 16px;
    height: 16px;
    transition: transform 0.2s ease;
}

.community-spotlight:hover .spotlight-link {
    gap: 10px;
    border-bottom-color: #f08c1e;
}

.community-spotlight:hover .spotlight-link svg {
    transform: translateX(3px);
}

.language-switcher {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-top: 6px;
    animation: fadeIn 0.8s ease-out 0.4s both;
}

.lang-label {
    color: var(--landing-muted);
    font-size: 13px;
    letter-spacing: 0.4px;
}

.lang-options {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    background: transparent;
    padding: 8px;
    border-radius: 999px;
    border: 1px solid rgba(17, 28, 56, 0.08);
}

.lang-options a {
    color: var(--landing-muted);
    text-decoration: none;
    font-size: 13px;
    padding: 7px 14px;
    border-radius: 999px;
    transition: all 0.2s;
    border: 1px solid transparent;
}

.lang-options a:hover {
    color: var(--landing-ink);
    background: rgba(240, 140, 30, 0.08);
    border-color: rgba(240, 140, 30, 0.1);
}

.lang-options a.selected-lang {
    color: #ffffff;
    background: #ea8617;
    border-color: #dc7b0f;
    font-weight: 600;
    box-shadow: 0 10px 18px rgba(240, 140, 30, 0.18);
}

/* Animations */
@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes pulse-ring {
    0% {
        opacity: 0.6;
        transform: scale(1);
    }
    50% {
        opacity: 0.3;
    }
    100% {
        opacity: 0;
        transform: scale(1.18);
    }
}

@keyframes btn-glow {
    0%,
    100% {
        box-shadow:
            0 8px 28px rgba(240, 140, 30, 0.32),
            0 4px 12px rgba(240, 140, 30, 0.16),
            0 0 0 rgba(240, 140, 30, 0);
    }
    50% {
        box-shadow:
            0 8px 28px rgba(240, 140, 30, 0.4),
            0 4px 12px rgba(240, 140, 30, 0.24),
            0 0 20px rgba(240, 140, 30, 0.12);
    }
}

@keyframes spotlight-fade {
    0%,
    100% {
        background:
            radial-gradient(circle at top right, rgba(240, 140, 30, 0.2), transparent 42%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 248, 238, 0.96));
    }
    50% {
        background:
            radial-gradient(circle at top right, rgba(240, 140, 30, 0.3), transparent 42%),
            linear-gradient(180deg, rgba(255, 255, 255, 1), rgba(255, 250, 242, 0.98));
    }
}

/* Responsive */
@media (max-width: 640px) {
    .landing-page {
        gap: 28px;
        padding: 16px 16px 32px;
    }

    .landing-hero {
        grid-template-columns: 1fr;
        gap: 18px;
        min-height: auto;
        padding-top: 8px;
    }

    .hero-copy {
        max-width: none;
    }

    .hero-brand-row {
        flex-direction: column;
        gap: 8px;
        align-items: flex-start;
    }

    .hero-title {
        font-size: clamp(28px, 8vw, 44px);
        white-space: normal;
    }

    .hero-hint {
        white-space: normal;
        font-size: 15px;
        line-height: 1.4;
        letter-spacing: 0;
    }

    .hero-subtitle {
        font-size: 15px;
    }

    .hero-visual-frame {
        min-height: 280px;
    }

    .hero-visual-frame :deep(.particulate-shell) {
        width: min(100%, 300px);
    }

    .support-rail {
        grid-template-columns: 1fr;
        gap: 22px;
    }

    .support-item {
        padding-right: 0;
        padding-bottom: 20px;
    }

    .support-item:not(:last-child)::after {
        right: auto;
        left: 0;
        top: auto;
        bottom: 0;
        width: 100%;
        height: 1px;
    }

    .support-item p {
        max-width: none;
    }

    .community-story {
        grid-template-columns: 1fr;
        gap: 26px;
    }

    .story-layout {
        grid-template-columns: 1fr;
        gap: 24px;
    }

    .story-item {
        grid-template-columns: 40px minmax(0, 1fr);
        gap: 14px;
    }

    .community-cta {
        width: 100%;
        justify-content: center;
        min-width: auto;
    }

    .main-community-btn {
        min-width: auto;
        padding: 16px 20px;
        width: 100%;
    }

    .btn-text {
        align-items: center;
        text-align: center;
        flex: 1;
    }

    .btn-label {
        font-size: 16px;
    }
}
</style>
