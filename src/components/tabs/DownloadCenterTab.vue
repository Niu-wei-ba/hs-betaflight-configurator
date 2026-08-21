<template>
    <BaseTab tab-name="download_center">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabDownloadCenter") }}</div>
            <div class="grid-row grid-box col3">
                <UiBox v-for="item in downloads" :key="item.platform" :title="item.title" class="download-card">
                    <p>{{ item.description }}</p>
                    <a :href="item.url" target="_blank" rel="noopener noreferrer" class="download-link">
                        <UIcon :name="item.icon" class="size-4" />
                        {{ item.action }}
                    </a>
                </UiBox>
            </div>
            <UiBox title="离线使用本站" class="offline-guide">
                <p>点击浏览器地址栏右侧的安装按钮（↓），在弹出的提示中选择“安装”，即可将本站安装到电脑。</p>
                <p>安装完成后，可从桌面、开始菜单或应用程序中直接打开地面站，无需先打开浏览器标签页。</p>
                <p>首次安装和更新需要网络；离线时可打开已安装的地面站界面，依赖在线资源的功能仍需要网络连接。</p>
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
                description: "2026.6.1 Android 安装包；仅此 Android 版已集成网络代理，支持从网络加载固件。",
                action: "下载 APK",
                icon: "i-lucide-smartphone",
                url: `${cdnBaseUrl}/betaflight-configurator_2026.6.1_android.apk`,
            },
            {
                platform: "windows",
                title: "Betaflight Configurator 2026.6.1 · Windows x64",
                description: "Betaflight 官方原版 2026.6.1 Windows x64 安装包，不含网络代理。",
                action: "下载 Windows x64 安装包",
                icon: "i-lucide-monitor-down",
                url: `${cdnBaseUrl}/betaflight-2026.6.1-x64-setup.exe`,
            },
            {
                platform: "macos",
                title: "Betaflight Configurator 2026.6.1 · macOS Apple Silicon (aarch64)",
                description: "Betaflight 官方原版 2026.6.1 macOS Apple Silicon（aarch64）安装包，不含网络代理。",
                action: "下载 macOS Apple Silicon 安装包",
                icon: "i-lucide-laptop-minimal",
                url: `${cdnBaseUrl}/betaflight-2026.6.1-aarch64.dmg`,
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

.offline-guide {
    margin-top: 16px;
}

.offline-guide p + p {
    margin-top: 12px;
}
</style>
