<template>
    <BaseTab tab-name="download_center">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabDownloadCenter") }}</div>
            <p class="download-center-intro">
                常用安装包由 HS-FPV 国内下载节点提供。固件烧写请继续使用“固件烧写工具”，它会优先从国内缓存获取固件。
            </p>
            <div class="grid-row grid-box col3">
                <UiBox v-for="item in downloads" :key="item.platform" :title="item.title" class="download-card">
                    <p>{{ item.description }}</p>
                    <a :href="item.url" target="_blank" rel="noopener noreferrer" class="download-link">
                        <UIcon :name="item.icon" class="size-4" />
                        {{ item.action }}
                    </a>
                </UiBox>
            </div>
            <UiBox title="说明" class="download-note">
                <p>
                    下载链接使用
                    <code>download.hs-fpv.com</code> CDN。若浏览器或网络策略拦截下载，请检查本机安全软件并稍后重试。
                </p>
            </UiBox>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent } from "vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "../elements/UiBox.vue";
import GUI from "../../js/gui";

const cdnBaseUrl = "https://download.hs-fpv.com/downloads";

export default defineComponent({
    name: "DownloadCenterTab",
    components: {
        BaseTab,
        UiBox,
    },
    setup() {
        const downloads = [
            {
                platform: "android",
                title: "Betaflight Configurator · Android",
                description: "2026.6.1 安装包，适用于 Android 手机或平板。",
                action: "下载 APK",
                icon: "i-lucide-smartphone",
                url: `${cdnBaseUrl}/betaflight-configurator_2026.6.1_android.apk`,
            },
            {
                platform: "windows",
                title: "Betaflight Configurator · Windows",
                description: "Windows 64 位安装包。",
                action: "下载 Windows 安装包",
                icon: "i-lucide-monitor-down",
                url: `${cdnBaseUrl}/betaflight-configurator_10.10.0_win64-installer.exe`,
            },
            {
                platform: "macos",
                title: "Betaflight Configurator · macOS",
                description: "macOS 磁盘镜像安装包。",
                action: "下载 macOS 安装包",
                icon: "i-lucide-laptop-minimal",
                url: `${cdnBaseUrl}/betaflight-configurator_10.10.0_macOS.dmg`,
            },
        ];

        return { downloads };
    },
    mounted() {
        GUI.content_ready();
    },
});
</script>

<style scoped lang="less">
.download-center-intro {
    margin-bottom: 16px;
    color: var(--text-secondary);
}

.download-card {
    min-height: 150px;
}

.download-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: auto;
    color: var(--primary-500);
    font-weight: 600;
}

.download-note {
    margin-top: 8px;
}
</style>
