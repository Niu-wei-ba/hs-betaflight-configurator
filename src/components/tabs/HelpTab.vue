<template>
    <BaseTab tab-name="help">
        <div class="content_wrapper grid-row mirror-help">
            <div class="grid-col col7">
                <div class="gui_box">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title">Documentation</div>
                    </div>
                    <div class="spacer">
                        <p>
                            This mirror keeps Betaflight-compatible configuration, presets, and firmware flashing
                            workflows while replacing external service entry points with mirror-controlled endpoints.
                        </p>
                        <ul>
                            <li>
                                <a :href="buildDocsUrl('')" target="_blank" rel="noopener noreferrer"
                                    >Open mirror documentation</a
                                >
                            </li>
                            <li>
                                <a :href="appConfig.sourceCodeUrl" target="_blank" rel="noopener noreferrer"
                                    >Open source repository</a
                                >
                            </li>
                            <li>
                                <a href="#" @click.prevent="openPrivacyPolicy">查看隐私政策</a>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="grid-col col5">
                <div class="gui_box">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title">Legal</div>
                    </div>
                    <div class="spacer">
                        <p>
                            This project is a modified fork of Betaflight Configurator and remains distributed under
                            GPLv3. No warranty is provided.
                        </p>
                        <ul>
                            <li>License: GNU GPL v3 or later</li>
                            <li>No official community or sponsor links are bundled here</li>
                            <li>Build and preset traffic should be served by your mirror infrastructure</li>
                        </ul>
                        <p class="legal-links">
                            <a
                                href="https://www.gnu.org/licenses/gpl-3.0.html"
                                target="_blank"
                                rel="noopener noreferrer"
                                >GPLv3</a
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
import { appConfig, buildDocsUrl } from "../../js/AppConfig";

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
            buildDocsUrl,
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
