<template>
    <BaseTab tab-name="landing">
        <div class="content_wrapper mirror-landing">
            <!-- Hero Section -->
            <section class="hero-section">
                <div class="brand-badge">
                    <img class="hero-logo" :src="logoUrl" alt="HS-FPV" />
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
                <h1 class="main-title">{{ appConfig.appName }}</h1>
                <p class="subtitle">保留原版所有功能，彻底解决国内网络环境下固件、预设下载慢或失败的问题。</p>
                <div class="features-row">
                    <div class="feature-item">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="icon-inline"
                        >
                            <path
                                d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"
                            ></path>
                            <path
                                d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
                            ></path>
                            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
                            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
                        </svg>
                        极速固件下载
                    </div>
                    <div class="feature-item">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="icon-inline"
                        >
                            <path d="m7.5 4.27 9 5.15"></path>
                            <path
                                d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"
                            ></path>
                            <path d="m3.3 7 8.7 5 8.7-5"></path>
                            <path d="M12 22V12"></path>
                        </svg>
                        预设环境秒连
                    </div>
                    <div class="feature-item">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            class="icon-inline"
                        >
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                            <path d="M3 3v5h5"></path>
                        </svg>
                        官方数据同步
                    </div>
                </div>
            </section>

            <!-- Community Redirect Section -->
            <section class="community-section">
                <div class="community-card">
                    <div class="card-header">
                        <h2>探索花生 FPV 社区</h2>
                        <p>一个更纯粹的穿越机社区，少一点套路营销，多一点真实的飞行经验。</p>
                    </div>

                    <div class="community-grid">
                        <div class="grid-item">
                            <span class="grid-icon">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path
                                        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
                                    ></path>
                                </svg>
                            </span>
                            <div class="grid-content">
                                <h3>配置广场 & VS对比</h3>
                                <p>看真实配置，拼性能参数</p>
                            </div>
                        </div>
                        <div class="grid-item">
                            <span class="grid-icon">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path
                                        d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"
                                    ></path>
                                    <path d="M9 18h6"></path>
                                    <path d="M10 22h4"></path>
                                </svg>
                            </span>
                            <div class="grid-content">
                                <h3>炸机天堂</h3>
                                <p>真实的复盘与进阶经验</p>
                            </div>
                        </div>
                        <div class="grid-item">
                            <span class="grid-icon">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                                    <circle cx="12" cy="5" r="2"></circle>
                                    <path d="M12 7v4"></path>
                                    <line x1="8" y1="16" x2="8" y2="16"></line>
                                    <line x1="16" y1="16" x2="16" y2="16"></line>
                                </svg>
                            </span>
                            <div class="grid-content">
                                <h3>FPV专属AI教官</h3>
                                <p>24小时排雷，新手答疑</p>
                            </div>
                        </div>
                        <div class="grid-item">
                            <span class="grid-icon">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                                </svg>
                            </span>
                            <div class="grid-content">
                                <h3>教程与硬核社群</h3>
                                <p>不被嘲讽的新手成长环境</p>
                            </div>
                        </div>
                    </div>

                    <div class="cta-container">
                        <a href="https://hs-fpv.com/" target="_blank" rel="noopener noreferrer" class="primary-cta">
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
                            立即访问 HS-FPV.COM
                        </a>
                    </div>
                </div>
            </section>

            <!-- Language Switcher -->
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
import GUI from "../../js/gui";
import { i18n } from "../../js/localization";
import { appConfig } from "../../js/AppConfig";
import logoUrl from "../../images/hs-logo.png";

export default defineComponent({
    name: "LandingTab",
    components: {
        BaseTab,
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
.mirror-landing {
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 1000px;
    margin: 0 auto;
    padding: 30px 20px 40px;
    gap: 40px;
    font-family:
        "SF Pro Display",
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        Helvetica,
        Arial,
        sans-serif;
    color: #1e293b; /* Dark text for light mode */
    /* Add a subtle grid background for the whole landing area */
    background-image:
        linear-gradient(rgba(243, 156, 18, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(243, 156, 18, 0.08) 1px, transparent 1px);
    background-size: 30px 30px;
    background-position: center top;
    border-radius: 16px;
}

/* --- Hero Section --- */
.hero-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 20px;
    animation: fadeIn 0.8s ease-out;
    position: relative;
    z-index: 2;
}

.icon-inline {
    width: 16px;
    height: 16px;
    display: inline-block;
    vertical-align: middle;
    margin-right: 2px;
}

.icon-inline-cta {
    width: 20px;
    height: 20px;
    display: inline-block;
    vertical-align: middle;
    margin-right: 8px;
}

.brand-badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 6px 16px;
    background: rgba(243, 156, 18, 0.05);
    border: 1px solid rgba(243, 156, 18, 0.4);
    border-radius: 4px; /* Techy sharp corners */
    box-shadow: 0 4px 15px rgba(243, 156, 18, 0.05);
    position: relative;
    overflow: hidden;
}

.brand-badge::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 4px;
    height: 100%;
    background: #f39c12;
    box-shadow: 0 0 8px rgba(243, 156, 18, 0.6);
}

.hero-logo {
    width: 24px;
    height: 24px;
    object-fit: contain;
}

.badge-text {
    color: #d68910;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 1px;
    text-transform: uppercase;
}

.main-title {
    font-size: clamp(32px, 5vw, 48px);
    font-weight: 900;
    margin: 0;
    color: #0f172a;
    text-shadow: 0 4px 15px rgba(243, 156, 18, 0.15);
    line-height: 1.2;
    letter-spacing: 2px;
}

.subtitle {
    font-size: 16px;
    color: #475569;
    max-width: 600px;
    line-height: 1.6;
    margin: 0;
}

.features-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px;
    margin-top: 10px;
}

.feature-item {
    background: #f8fafc;
    border: 1px solid rgba(243, 156, 18, 0.3);
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    color: #1e293b;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
    transition: all 0.3s ease;
    position: relative;
}

.feature-item::after {
    content: "";
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 8px;
    height: 8px;
    border-bottom: 2px solid #f39c12;
    border-right: 2px solid #f39c12;
    transition: all 0.3s ease;
}
.feature-item::before {
    content: "";
    position: absolute;
    top: -1px;
    left: -1px;
    width: 8px;
    height: 8px;
    border-top: 2px solid #f39c12;
    border-left: 2px solid #f39c12;
    transition: all 0.3s ease;
}

.feature-item:hover {
    border-color: #f39c12;
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(243, 156, 18, 0.15);
    transform: translateY(-2px);
    color: #0f172a;
}

.feature-item:hover::after,
.feature-item:hover::before {
    width: 100%;
    height: 100%;
    border-color: rgba(243, 156, 18, 0.4);
}

/* --- Community Section --- */
.community-section {
    width: 100%;
    max-width: 800px;
    animation: slideUp 0.8s ease-out 0.2s both;
    position: relative;
    z-index: 2;
}

.community-card {
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(243, 156, 18, 0.2);
    border-radius: 8px;
    padding: 40px;
    box-shadow:
        0 10px 30px rgba(0, 0, 0, 0.05),
        0 0 20px rgba(243, 156, 18, 0.05);
    display: flex;
    flex-direction: column;
    gap: 32px;
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(12px);
}

.card-header {
    text-align: center;
    position: relative;
    z-index: 1;
}

.card-header h2 {
    font-size: 28px;
    color: #0f172a;
    margin: 0 0 12px 0;
    font-weight: 800;
    letter-spacing: 1px;
}

.card-header p {
    color: #475569;
    margin: 0;
    font-size: 15px;
}

.community-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 20px;
    position: relative;
    z-index: 1;
}

.grid-item {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 20px;
    border-radius: 6px;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
}

.grid-item::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    width: 3px;
    height: 100%;
    background: #f39c12;
    opacity: 0;
    transition:
        opacity 0.3s ease,
        box-shadow 0.3s ease;
}

.grid-item:hover {
    transform: translateY(-2px);
    background: #ffffff;
    border-color: rgba(243, 156, 18, 0.3);
    box-shadow:
        0 8px 20px rgba(0, 0, 0, 0.05),
        inset 0 0 15px rgba(243, 156, 18, 0.05);
}

.grid-item:hover::before {
    opacity: 1;
    box-shadow: 0 0 10px rgba(243, 156, 18, 0.4);
}

.grid-icon {
    font-size: 24px;
    background: #fff8f0;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    flex-shrink: 0;
    border: 1px solid rgba(243, 156, 18, 0.3);
    color: #e67e22;
    box-shadow: inset 0 0 8px rgba(243, 156, 18, 0.1);
}

.grid-icon svg {
    width: 24px;
    height: 24px;
}

.grid-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.grid-content h3 {
    margin: 0 0 6px 0;
    font-size: 16px;
    color: #1e293b;
    font-weight: 700;
    letter-spacing: 0.5px;
}

.grid-content p {
    margin: 0;
    font-size: 13px;
    color: #64748b;
    line-height: 1.5;
}

.cta-container {
    text-align: center;
    margin-top: 10px;
    position: relative;
    z-index: 1;
}

.primary-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(243, 156, 18, 0.1);
    color: #d35400;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 1px;
    padding: 14px 40px;
    border-radius: 4px;
    text-decoration: none;
    border: 1px solid #f39c12;
    box-shadow: 0 4px 15px rgba(243, 156, 18, 0.15);
    transition: all 0.3s ease;
    text-transform: uppercase;
    position: relative;
}

.primary-cta:hover {
    background: rgba(243, 156, 18, 0.15);
    border-color: #e67e22;
    box-shadow: 0 8px 25px rgba(243, 156, 18, 0.25);
    transform: translateY(-2px);
    color: #ba4a00;
}

.primary-cta:active {
    transform: translateY(1px);
    box-shadow: 0 2px 10px rgba(243, 156, 18, 0.1);
}

/* --- Language Switcher --- */
.language-switcher {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    animation: fadeIn 0.8s ease-out 0.4s both;
    position: relative;
    z-index: 2;
}

.lang-label {
    color: #64748b;
    font-size: 13px;
    letter-spacing: 1px;
}

.lang-options {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    background: #f8fafc;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
}

.lang-options a {
    color: #64748b;
    text-decoration: none;
    font-size: 13px;
    padding: 6px 12px;
    border-radius: 2px;
    transition: all 0.2s;
    border: 1px solid transparent;
}

.lang-options a:hover {
    color: #1e293b;
    background: rgba(243, 156, 18, 0.05);
    border-color: rgba(243, 156, 18, 0.2);
}

.lang-options a.selected-lang {
    color: #ffffff;
    background: #f39c12;
    border-color: #e67e22;
    font-weight: 600;
    box-shadow: 0 2px 8px rgba(243, 156, 18, 0.3);
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

/* Responsive */
@media (max-width: 640px) {
    .mirror-landing {
        padding: 20px 16px;
    }

    .community-card {
        padding: 24px;
    }

    .main-title {
        font-size: clamp(28px, 8vw, 36px);
    }

    .features-row {
        flex-direction: column;
        align-items: center;
    }
}
</style>
