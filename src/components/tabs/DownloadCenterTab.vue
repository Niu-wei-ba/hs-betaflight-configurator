<template>
    <BaseTab tab-name="download_center">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabDownloadCenter") }}</div>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <UiBox v-for="item in downloads" :key="item.url" :title="item.title" class="download-card">
                    <p>{{ item.description }}</p>
                    <a :href="item.url" target="_blank" rel="noopener noreferrer" class="download-link">
                        <UIcon name="i-lucide-download" class="size-4" aria-hidden="true" />
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

<script setup lang="ts">
import { onMounted } from "vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "../elements/UiBox.vue";
import GUI from "../../js/gui";

const cdnBaseUrl = "https://download.hs-fpv.com/downloads";

const downloads = [
    {
        title: "Betaflight Configurator · Android",
        description: "2026.6.1 Android 安装包；仅此 Android 版已集成网络代理，支持从网络加载固件。",
        action: "下载 APK",
        url: `${cdnBaseUrl}/betaflight-configurator_2026.6.1_android.apk`,
    },
    {
        title: "Betaflight Configurator 2026.6.1 · Windows x64",
        description: "Betaflight 官方原版 2026.6.1 Windows x64 安装包，不含网络代理。",
        action: "下载 Windows x64 安装包",
        url: `${cdnBaseUrl}/betaflight-2026.6.1-x64-setup.exe`,
    },
    {
        title: "Betaflight Configurator 2026.6.1 · macOS Apple Silicon (aarch64)",
        description: "Betaflight 官方原版 2026.6.1 macOS Apple Silicon（aarch64）安装包，不含网络代理。",
        action: "下载 macOS Apple Silicon 安装包",
        url: `${cdnBaseUrl}/betaflight-2026.6.1-aarch64.dmg`,
    },
    {
        title: "Zadig 2.9 · Windows",
        description: "安装或替换 USB 驱动，适用于 Windows 无法识别 STM32 Bootloader（DFU）的情况。",
        action: "下载 Zadig 2.9",
        url: `${cdnBaseUrl}/zadig-2.9.exe`,
    },
    {
        title: "ImpulseRC Driver Fixer · Windows",
        description: "自动修复 Windows 上的飞控 USB 驱动，适用于飞控进入 DFU 模式后无法识别的情况。",
        action: "下载 ImpulseRC Driver Fixer",
        url: `${cdnBaseUrl}/ImpulseRC_Driver_Fixer.exe`,
    },
];

onMounted(() => {
    GUI.content_ready();
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
    color: var(--text);
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 0.15em;
}

.offline-guide {
    margin-top: 16px;
}

.offline-guide p + p {
    margin-top: 12px;
}
</style>
