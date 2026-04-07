<template>
    <BaseTab tab-name="help">
        <div class="content_wrapper grid-row mirror-help">
            <div class="grid-col col7">
                <div class="gui_box">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title">设置文档</div>
                    </div>
                    <div class="spacer">
                        <p>
                            HS-FPV 镜像站保留 Betaflight Configurator 的调参、预设和固件烧录流程，并将固件列表、
                            构建状态和下载入口接入镜像服务，减少国内访问官方服务时的不稳定因素。
                        </p>
                        <ul>
                            <li>
                                <span>固件烧录前建议先在 CLI 中执行 <code>diff all</code>，保存当前配置备份。</span>
                            </li>
                            <li>
                                <span
                                    >选择飞控目标时，请优先使用自动识别结果；如果无法识别，再手动选择官方 target。</span
                                >
                            </li>
                            <li>
                                <span>固件下载优先走国内 COS 缓存；未命中的固件会由后端按需从官方构建服务同步。</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="grid-col col5">
                <div class="gui_box">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title">支持与声明</div>
                    </div>
                    <div class="spacer">
                        <p>
                            本项目是 Betaflight Configurator 的镜像化修改版本，仍按 GPLv3
                            许可发布，不提供任何形式的担保。
                        </p>
                        <ul>
                            <li><span>许可证：GNU GPL v3 或更高版本</span></li>
                            <li><span>本页面不内置官方社区、赞助商或跳转广告入口</span></li>
                            <li><span>固件构建、下载和预设流量应由镜像后端服务承接</span></li>
                            <li>
                                <span>
                                    <a :href="appConfig.sourceCodeUrl" target="_blank" rel="noopener noreferrer"
                                        >查看源代码仓库</a
                                    >
                                </span>
                            </li>
                            <li>
                                <span>
                                    <a href="#" @click.prevent="openPrivacyPolicy">查看隐私政策</a>
                                </span>
                            </li>
                        </ul>
                        <p class="legal-links">
                            <a
                                href="https://www.gnu.org/licenses/gpl-3.0.html"
                                target="_blank"
                                rel="noopener noreferrer"
                                >GPLv3 许可证</a
                            >
                        </p>
                    </div>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import { appConfig } from "../../js/AppConfig";

export default defineComponent({
    name: "HelpTab",
    components: {
        BaseTab,
    },
    setup() {
        function openPrivacyPolicy() {
            document.querySelector("#tabs .tab_privacy_policy a")?.click();
        }

        function onTabReady() {
            GUI.content_ready();
        }

        return {
            appConfig,
            openPrivacyPolicy,
            onTabReady,
        };
    },
    mounted() {
        this.onTabReady();
    },
});
</script>

<style scoped>
.mirror-help ul {
    margin-left: 18px;
}

.legal-links {
    margin-top: 16px;
}
</style>
