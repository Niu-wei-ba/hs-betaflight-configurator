<template>
    <BaseTab tab-name="landing">
        <main class="content_wrapper landing-page" aria-labelledby="landing-title">
            <section class="landing-shell">
                <a
                    class="version-switch-link"
                    href="/v/2025.12.2/"
                    aria-label="切换至地面站 2025.12.2版本"
                    @click="rememberVersion('2025.12.2')"
                >
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M3 12a9 9 0 1 0 3-6.7"></path>
                        <path d="M3 4v5h5"></path>
                    </svg>
                    <span>切换 2025.12.2版本</span>
                </a>
                <aside class="landing-sponsor" aria-label="赞助商 BUCK">
                    <p>赞助支持</p>
                    <img :src="buckLogoUrl" alt="BUCK" />
                </aside>
                <header class="landing-hero">
                    <p class="hero-kicker">
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path d="m13 2-9 12h7l-1 8 10-13h-7z"></path>
                        </svg>
                        更快下载 · 更稳访问 · 官方同步
                    </p>
                    <h1 id="landing-title">Betaflight <em>中国镜像站</em></h1>
                    <p class="hero-subtitle">为穿越机玩家提供更稳定、更快速的资源与交流平台</p>
                </header>

                <section class="resource-grid" aria-label="快捷入口">
                    <component
                        :is="resource.href ? 'a' : 'button'"
                        v-for="resource in resourceCards"
                        :key="resource.title"
                        :href="resource.href"
                        :target="resource.href ? '_blank' : undefined"
                        :rel="resource.href ? 'noopener noreferrer' : undefined"
                        type="button"
                        class="resource-card"
                        :class="`resource-card--${resource.id}`"
                    >
                        <img class="resource-card__image" :src="resource.image" alt="" aria-hidden="true" />
                        <span class="resource-card__wash" aria-hidden="true"></span>
                        <span class="resource-card__copy">
                            <span class="resource-card__icon" aria-hidden="true">
                                <svg
                                    v-if="resource.id === 'docs'"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.9"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path d="M6 3h8l4 4v14H6z"></path>
                                    <path d="M14 3v5h5"></path>
                                    <path d="M9 13h6"></path>
                                    <path d="M9 17h6"></path>
                                </svg>
                                <svg
                                    v-else-if="resource.id === 'community'"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.9"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <circle cx="9" cy="8" r="3"></circle>
                                    <path d="M3.5 20v-1.2A4.8 4.8 0 0 1 8.3 14h1.4a4.8 4.8 0 0 1 4.8 4.8V20"></path>
                                    <path d="M16 6.5a2.7 2.7 0 0 1 0 5.2"></path>
                                    <path d="M17.5 14.2a4.8 4.8 0 0 1 3 4.4V20"></path>
                                </svg>
                                <svg
                                    v-else
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.9"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path d="M3 14h3l2.2-7 3.5 12 2.5-8H21"></path>
                                    <path d="M3 19h18"></path>
                                </svg>
                            </span>
                            <span class="resource-card__text">
                                <strong>{{ resource.title }}</strong>
                                <small>{{ resource.description }}</small>
                            </span>
                            <span class="resource-card__action"
                                >{{ resource.action }} <span aria-hidden="true">→</span></span
                            >
                        </span>
                    </component>
                </section>

                <section class="support-grid" aria-label="教程与社群">
                    <section class="tutorial-section" aria-labelledby="tutorial-title">
                        <header class="section-heading">
                            <div>
                                <span class="section-heading__icon" aria-hidden="true">
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="1.9"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <rect x="3" y="5" width="18" height="14" rx="2"></rect>
                                        <path d="m10 9 5 3-5 3V9Z"></path>
                                    </svg>
                                </span>
                                <h2 id="tutorial-title">视频教程</h2>
                            </div>
                            <button type="button" class="section-heading__link" @click="openVideoTutorials()">
                                查看全部 <span aria-hidden="true">→</span>
                            </button>
                        </header>
                        <div class="tutorial-grid">
                            <button
                                v-for="tutorial in tutorialCards"
                                :key="tutorial.title"
                                type="button"
                                class="tutorial-card"
                                :class="`tutorial-card--${tutorial.id}`"
                                @click="openVideoTutorials()"
                            >
                                <span class="tutorial-card__media">
                                    <img :src="tutorial.image" alt="" aria-hidden="true" />
                                    <span class="tutorial-card__play" aria-hidden="true">
                                        <svg viewBox="0 0 24 24" fill="currentColor">
                                            <path d="m9 6 8 6-8 6z"></path>
                                        </svg>
                                    </span>
                                </span>
                                <strong>{{ tutorial.title }}</strong>
                                <small>{{ tutorial.description }}</small>
                            </button>
                        </div>
                    </section>

                    <aside class="community-panel" aria-labelledby="community-title">
                        <div class="community-panel__copy">
                            <div class="community-panel__heading">
                                <span aria-hidden="true">
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="1.9"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <path
                                            d="M21 11.5a7.2 7.2 0 0 1-7.5 7.2 8.6 8.6 0 0 1-2.7-.5L5 21l1.2-4A6.8 6.8 0 0 1 3 11.5a7.2 7.2 0 0 1 7.5-7.2H14A7.2 7.2 0 0 1 21 11.5Z"
                                        ></path>
                                        <path d="M8 11h.01"></path>
                                        <path d="M12 11h.01"></path>
                                        <path d="M16 11h.01"></path>
                                    </svg>
                                </span>
                                <h2 id="community-title">官方交流群</h2>
                            </div>
                            <ul>
                                <li v-for="benefit in communityBenefits" :key="benefit">
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <circle cx="12" cy="12" r="8"></circle>
                                        <path d="m8.5 12 2.2 2.2 4.8-4.8"></path>
                                    </svg>
                                    {{ benefit }}
                                </li>
                            </ul>
                        </div>
                        <figure class="community-panel__qr">
                            <img :src="qqQrUrl" alt="花生 FPV 官方交流群二维码" />
                            <figcaption>扫码加入交流群</figcaption>
                        </figure>
                    </aside>
                </section>

                <footer class="language-switcher">
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
                </footer>
            </section>
        </main>
    </BaseTab>
</template>

<script>
import { defineComponent, onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import { i18n } from "../../js/localization";
import { openVideoTutorials } from "../../js/video_tutorials";
import qqQrUrl from "../../images/hs-qq-qr.png";
import flightViewUrl from "../../images/osd-bg-1.jpg";
import fieldViewUrl from "../../images/osd-bg-2.png";
import buckLogoUrl from "../../images/sponsors/buck-logo.png";
import resourceDocsUrl from "../../images/landing-resource-docs.png";
import resourceCommunityUrl from "../../images/landing-resource-community.png";
import resourceBlackboxUrl from "../../images/landing-resource-blackbox.png";

const resourceCards = [
    {
        id: "docs",
        title: "BF 中文文档",
        description: "官方文档中文翻译，快速查阅，持续更新",
        action: "打开文档",
        href: "https://wiki.hs-fpv.com",
        image: resourceDocsUrl,
    },
    {
        id: "community",
        title: "花生 FPV 社区",
        description: "配置分享、经验交流、问题互助、成长记录",
        action: "进入社区",
        href: "https://hs-fpv.com/",
        image: resourceCommunityUrl,
    },
    {
        id: "blackbox",
        title: "Blackbox Explorer",
        description: "高效稳定的日志分析平台，支持在线解析与可视化",
        action: "使用工具",
        href: "https://bbe.hs-fpv.com",
        image: resourceBlackboxUrl,
    },
];

const tutorialCards = [
    { id: "beginner", title: "Betaflight 快速入门", description: "新手必看 · 10 分钟上手", image: flightViewUrl },
    { id: "pid", title: "PID 调参详解", description: "从原理到实战", image: fieldViewUrl },
    { id: "elrs", title: "ELRS 接收机配置", description: "一步步教你设置", image: flightViewUrl },
    { id: "blackbox", title: "滤波器设置指南", description: "提升飞行稳定性", image: fieldViewUrl },
];

const communityBenefits = ["大佬答疑", "AI机器人", "新固件通知", "活动与福利"];

export default defineComponent({
    name: "LandingTab",
    components: { BaseTab },
    setup() {
        const availableLanguages = ref(["DEFAULT", ...i18n.getLanguagesAvailables()]);
        const selectedLanguage = ref(i18n.selectedLanguage);

        function changeLanguage(lang) {
            if (i18n.selectedLanguage !== lang) {
                i18n.changeLanguage(lang);
                selectedLanguage.value = lang;
            }
        }

        function rememberVersion(version) {
            try {
                window.localStorage.setItem("bf-configurator-version", version);
            } catch (error) {
                // Storage can be unavailable in private browser contexts.
            }
        }

        onMounted(() => GUI.content_ready());

        return {
            availableLanguages,
            buckLogoUrl,
            changeLanguage,
            communityBenefits,
            openVideoTutorials,
            qqQrUrl,
            rememberVersion,
            resourceCards,
            selectedLanguage,
            tutorialCards,
        };
    },
});
</script>

<style scoped>
.landing-page {
    --ink: #101827;
    --copy: #5e6878;
    --muted: #8791a0;
    --line: #e7e9ed;
    --paper: #ffffff;
    --surface: #f5f6f8;
    --amber: #ffb300;
    --amber-deep: #ed9800;
    width: 100%;
    min-height: 100%;
    box-sizing: border-box;
    overflow: auto;
    background: var(--surface);
    color: var(--ink);
    font-family: "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
}
.landing-shell {
    position: relative;
    width: min(100%, 1420px);
    box-sizing: border-box;
    margin: 0 auto;
    padding: 30px 38px 22px;
}
.version-switch-link {
    position: absolute;
    top: 28px;
    left: 38px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 0 13px;
    border: 1px solid #dce1e8;
    border-radius: 8px;
    background: rgb(255 255 255 / 92%);
    box-shadow: 0 7px 16px rgb(16 24 39 / 6%);
    color: #3b4658;
    font-size: 14px;
    font-weight: 750;
    line-height: 1;
    text-decoration: none;
    transition:
        border-color 0.18s ease,
        box-shadow 0.18s ease,
        color 0.18s ease,
        transform 0.18s ease;
}
.version-switch-link svg {
    width: 18px;
    height: 18px;
    color: var(--amber-deep);
}
.version-switch-link:hover {
    border-color: #ffd979;
    box-shadow: 0 10px 20px rgb(16 24 39 / 10%);
    color: var(--amber-deep);
    transform: translateY(-1px);
}
.version-switch-link:focus-visible {
    outline: 3px solid rgb(255 179 0 / 55%);
    outline-offset: 3px;
}
.landing-sponsor {
    box-shadow: rgba(16, 36, 79, 0.08) 0px 28px 64px 0px;
    border-radius: 8px;
    padding: 30px;
    position: absolute;
    top: 28px;
    right: 38px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1;
}

.landing-sponsor p {
    color: rgba(0, 0, 0, 0.701);
    font-size: 16px;
    font-weight: 700;
}

.landing-sponsor img {
    display: block;
    width: 200px;
    object-fit: contain;
}
.landing-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 4px 0 30px;
    text-align: center;
}
.hero-kicker {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    margin: 0;
    padding: 9px 18px;
    border-radius: 999px;
    background: var(--paper);
    box-shadow: 0 7px 16px rgba(16, 24, 39, 0.08);
    color: #3b4658;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
}
.hero-kicker svg {
    width: 17px;
    height: 17px;
    color: var(--amber-deep);
}
.landing-hero h1 {
    margin: 17px 0 8px;
    font-size: 48px;
    line-height: 1.14;
    font-weight: 850;
    letter-spacing: 0;
}
.landing-hero h1 em {
    color: var(--amber);
    font-style: normal;
}
.hero-subtitle {
    margin: 0;
    color: var(--copy);
    font-size: 17px;
    line-height: 1.5;
}
.resource-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
}
.resource-card {
    display: grid;
    position: relative;
    min-height: 220px;
    overflow: hidden;
    padding: 0;
    border: 0;
    border-radius: 8px;
    color: var(--ink);
    background: var(--paper);
    box-shadow: 0 5px 18px rgba(16, 24, 39, 0.08);
    text-align: left;
    text-decoration: none;
    cursor: pointer;
    transition:
        transform 0.18s ease,
        box-shadow 0.18s ease;
}
.resource-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 12px 24px rgba(16, 24, 39, 0.14);
}
.resource-card:focus-visible,
.tutorial-card:focus-visible,
.section-heading__link:focus-visible,
.language-switcher a:focus-visible {
    outline: 3px solid rgba(255, 179, 0, 0.55);
    outline-offset: 3px;
}
.resource-card__image {
    position: absolute;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: saturate(0.82) contrast(0.94);
    transition: transform 0.3s ease;
}
.resource-card:hover .resource-card__image {
    transform: scale(1.045);
}
.resource-card__wash {
    position: absolute;
    inset: 0;
    background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.96) 0%,
        rgba(255, 255, 255, 0.87) 52%,
        rgba(255, 255, 255, 0.32) 100%
    );
}
.resource-card--community .resource-card__wash {
    background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.96) 0%,
        rgba(255, 255, 255, 0.82) 58%,
        rgba(255, 255, 255, 0.14) 100%
    );
}
.resource-card--blackbox .resource-card__image {
    filter: saturate(0.92) contrast(0.98) brightness(0.82);
}
.resource-card--blackbox .resource-card__wash {
    background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.96),
        rgba(255, 255, 255, 0.83) 52%,
        rgba(255, 255, 255, 0.4)
    );
}
.resource-card__copy {
    display: flex;
    z-index: 1;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
    padding: 24px;
}
.resource-card__icon {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    margin-bottom: auto;
    border-radius: 7px;
    background: #fff5d8;
    color: var(--amber-deep);
}
.resource-card__icon svg {
    width: 21px;
    height: 21px;
}
.resource-card__text {
    display: grid;
    gap: 8px;
    max-width: 72%;
    margin-top: 20px;
}
.resource-card__text strong {
    font-size: 20px;
    line-height: 1.2;
}
.resource-card__text small {
    color: var(--copy);
    font-size: 14px;
    line-height: 1.55;
}
.resource-card__action {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    margin-top: 18px;
    padding: 9px 14px;
    border-radius: 999px;
    background: var(--amber);
    color: #fff;
    font-size: 13px;
    font-weight: 800;
    line-height: 1;
}
.resource-card__action span {
    font-size: 18px;
}
.support-grid {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(315px, 1fr);
    gap: 16px;
    margin-top: 16px;
}
.tutorial-section,
.community-panel {
    box-sizing: border-box;
    border-radius: 8px;
    background: var(--paper);
    box-shadow: 0 5px 18px rgba(16, 24, 39, 0.06);
}
.tutorial-section {
    padding: 20px;
}
.section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
}
.section-heading > div,
.community-panel__heading {
    display: flex;
    align-items: center;
    gap: 10px;
}
.section-heading__icon,
.community-panel__heading > span {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 1px solid #ffd979;
    border-radius: 6px;
    color: var(--amber-deep);
}
.section-heading__icon svg,
.community-panel__heading svg {
    width: 18px;
    height: 18px;
}
.section-heading h2,
.community-panel h2 {
    margin: 0;
    font-size: 20px;
    line-height: 1.2;
}
.section-heading__link {
    padding: 3px 0;
    border: 0;
    background: transparent;
    color: var(--amber-deep);
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    cursor: default;
}
.section-heading__link span {
    margin-left: 4px;
    font-size: 18px;
}
.tutorial-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
}
.tutorial-card {
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: default;
}
.tutorial-card__media {
    position: relative;
    display: grid;
    overflow: hidden;
    aspect-ratio: 16 / 9;
    border-radius: 7px;
    background: #1c2633;
}
.tutorial-card__media::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(12, 20, 31, 0.1), rgba(12, 20, 31, 0.54));
}
.tutorial-card__media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.2s ease;
}
.tutorial-card--pid img {
    transform: scale(1.2) translateX(-11%);
    filter: saturate(0.5) hue-rotate(35deg) brightness(0.72);
}
.tutorial-card--elrs img {
    transform: scale(1.26) translate(6%, 7%);
    filter: saturate(0.55) contrast(1.1) brightness(0.68);
}
.tutorial-card--blackbox img {
    transform: scale(1.24) translateX(10%);
    filter: saturate(0.48) hue-rotate(145deg) brightness(0.58);
}
.tutorial-card:hover img {
    transform: scale(1.07);
}
.tutorial-card--pid:hover img {
    transform: scale(1.27) translateX(-11%);
}
.tutorial-card--elrs:hover img {
    transform: scale(1.33) translate(6%, 7%);
}
.tutorial-card--blackbox:hover img {
    transform: scale(1.31) translateX(10%);
}
.tutorial-card__play {
    position: absolute;
    z-index: 1;
    left: 50%;
    top: 50%;
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border-radius: 50%;
    background: var(--amber);
    color: #fff;
    transform: translate(-50%, -50%);
    box-shadow: 0 4px 12px rgba(65, 44, 0, 0.25);
}
.tutorial-card__play svg {
    width: 22px;
    height: 22px;
    margin-left: 2px;
}
.tutorial-card strong {
    display: block;
    margin-top: 10px;
    font-size: 14px;
    line-height: 1.3;
}
.tutorial-card small {
    display: block;
    margin-top: 5px;
    color: var(--copy);
    font-size: 12px;
    line-height: 1.4;
}
.community-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 132px;
    align-items: center;
    gap: 10px;
    padding: 21px;
}
.community-panel__copy {
    min-width: 0;
}
.community-panel ul {
    display: grid;
    gap: 12px;
    margin: 22px 0 0;
    padding: 0;
    list-style: none;
    color: #3f4958;
    font-size: 14px;
}
.community-panel li {
    display: flex;
    align-items: center;
    gap: 10px;
}
.community-panel li svg {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    color: var(--amber-deep);
}
.community-panel__qr {
    width: 132px;
    margin: 0;
    text-align: center;
}
.community-panel__qr img {
    display: block;
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
}
.community-panel__qr figcaption {
    margin-top: 8px;
    color: var(--copy);
    font-size: 12px;
    white-space: nowrap;
}
.language-switcher {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding-top: 18px;
    color: var(--copy);
    font-size: 12px;
}
.lang-options {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
}
.language-switcher a {
    color: inherit;
    text-decoration: none;
}
.language-switcher a:not(:last-child)::after {
    content: "/";
    margin-left: 8px;
    color: #c2c7d0;
}
.language-switcher .selected-lang {
    color: var(--amber-deep);
    font-weight: 800;
}
@media (max-width: 1120px) {
    .landing-shell {
        padding: 28px;
    }
    .support-grid {
        grid-template-columns: 1fr;
    }
    .community-panel {
        grid-template-columns: minmax(0, 1fr) 152px;
    }
    .community-panel__qr {
        width: 152px;
    }
}
@media (max-width: 820px) {
    .landing-shell {
        padding: 24px 18px 20px;
    }
    .version-switch-link {
        position: static;
        width: fit-content;
        margin: 0 0 14px;
    }
    .landing-sponsor {
        position: static;
        justify-content: center;
        margin: 0 0 18px;
    }
    .landing-hero h1 {
        font-size: 40px;
    }
    .resource-grid {
        grid-template-columns: 1fr;
    }
    .resource-card {
        min-height: 205px;
    }
    .tutorial-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px 14px;
    }
}
@media (max-width: 520px) {
    .landing-shell {
        padding: 20px 12px 16px;
    }
    .landing-sponsor {
        margin-bottom: 14px;
    }
    .version-switch-link {
        min-height: 40px;
        margin-bottom: 12px;
        font-size: 13px;
    }
    .landing-sponsor img {
        width: 102px;
        height: 34px;
    }
    .landing-hero {
        padding-bottom: 22px;
    }
    .landing-hero h1 {
        font-size: 32px;
    }
    .hero-kicker {
        font-size: 12px;
    }
    .hero-subtitle {
        font-size: 14px;
    }
    .resource-card {
        min-height: 190px;
    }
    .resource-card__copy {
        padding: 20px;
    }
    .tutorial-section,
    .community-panel {
        padding: 17px;
    }
    .community-panel {
        grid-template-columns: minmax(0, 1fr) 106px;
    }
    .community-panel__qr {
        width: 106px;
    }
    .community-panel ul {
        gap: 9px;
        margin-top: 16px;
        font-size: 13px;
    }
    .community-panel__qr figcaption {
        font-size: 10px;
    }
    .language-switcher {
        flex-direction: column;
    }
}
@media (prefers-reduced-motion: reduce) {
    .resource-card,
    .resource-card__image,
    .tutorial-card__media img {
        transition: none;
    }
}
</style>
