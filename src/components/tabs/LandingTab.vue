<template>
    <BaseTab tab-name="landing">
        <div class="content_wrapper mirror-landing">
            <div class="hero">
                <div class="eyebrow">Mirror</div>
                <h1>{{ appConfig.appName }}</h1>
                <p class="tagline">{{ appConfig.appTagline }}</p>
                <p class="notice">
                    当前部署是 Betaflight Configurator 的独立镜像 / 分叉版本。使用前请先查看源码、
                    隐私政策与镜像文档说明。
                </p>
            </div>

            <div class="languageSwitcher">
                <span>{{ $t("language_choice_message") }}</span>
                <a
                    v-for="lang in availableLanguages"
                    :key="lang"
                    href="#"
                    :lang="lang"
                    :class="{ selected_language: lang === selectedLanguage }"
                    @click.prevent="changeLanguage(lang)"
                >
                    {{ $t(`language_${lang}`) }}
                </a>
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
    gap: 24px;
}

.hero {
    padding: 28px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(238, 166, 0, 0.18), rgba(20, 20, 20, 0.08));
    border: 1px solid rgba(238, 166, 0, 0.28);
}

.eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 12px;
    opacity: 0.7;
}

.hero h1 {
    margin: 8px 0 10px;
}

.tagline,
.notice {
    max-width: 900px;
}

.selected_language {
    font-weight: bold;
}

.languageSwitcher a {
    margin-left: 8px;
}
</style>
