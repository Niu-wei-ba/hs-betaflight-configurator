<template>
    <BaseTab tab-name="support_snapshot">
        <div class="content_wrapper support-snapshot">
            <div class="tab_title">{{ $t("supportSnapshotTitle") }}</div>
            <UiBox :title="$t('supportSnapshotLoadTitle')">
                <form class="support-snapshot__form" @submit.prevent="loadSnapshot">
                    <UInput
                        v-model="supportId"
                        :placeholder="$t('supportSnapshotIdPlaceholder')"
                        :disabled="loading || session.active"
                    />
                    <UButton
                        type="submit"
                        icon="i-lucide-folder-open"
                        :label="$t('supportSnapshotLoadAction')"
                        :loading="loading"
                        :disabled="loading || session.active || !supportId.trim()"
                    />
                </form>
                <p v-if="error" class="support-snapshot__error">{{ error }}</p>
            </UiBox>

            <UiBox v-if="session.active" :title="$t('supportSnapshotActiveTitle')" class="support-snapshot__details">
                <p>仅查看采集时的数据，动态曲线不代表当前飞控状态。</p>
                <p>
                    PID Profile {{ session.captureReport?.profile?.pid + 1 }} / Rates Profile
                    {{ session.captureReport?.profile?.rate + 1 }}（固定只读）
                </p>
                <dl>
                    <div>
                        <dt>{{ $t("supportSnapshotIdLabel") }}</dt>
                        <dd>{{ session.supportId }}</dd>
                    </div>
                    <div>
                        <dt>{{ $t("supportSnapshotFirmwareLabel") }}</dt>
                        <dd>{{ session.metadata?.firmwareVersion || "-" }}</dd>
                    </div>
                    <div>
                        <dt>{{ $t("supportSnapshotTargetLabel") }}</dt>
                        <dd>{{ session.metadata?.target || session.metadata?.boardName || "-" }}</dd>
                    </div>
                    <div>
                        <dt>{{ $t("supportSnapshotExpiresLabel") }}</dt>
                        <dd>{{ formattedExpiry }}</dd>
                    </div>
                </dl>
                <pre class="support-snapshot__terminal" tabindex="0" aria-label="快照信息与 CLI 记录">{{
                    terminalText
                }}</pre>
                <UButton
                    color="error"
                    variant="soft"
                    icon="i-lucide-link-2-off"
                    :label="$t('disconnectSupportSnapshot')"
                    @click="closeSnapshot"
                />
            </UiBox>
        </div>
    </BaseTab>
</template>

<script>
import { computed, defineComponent, onMounted, ref } from "vue";
import BaseTab from "./BaseTab.vue";
import UiBox from "../elements/UiBox.vue";
import BuildApi from "../../js/BuildApi";
import GUI from "../../js/gui";
import { closeSupportSnapshotSession, openSupportSnapshotSession } from "../../js/serial_backend";
import { supportSnapshotSession } from "../../js/support/SnapshotSession";

export default defineComponent({
    name: "SupportSnapshotTab",
    components: { BaseTab, UiBox },
    setup() {
        const supportId = ref("");
        const loading = ref(false);
        const error = ref("");
        const session = supportSnapshotSession;
        const formattedExpiry = computed(() =>
            session.expiresAt ? new Date(session.expiresAt).toLocaleString() : "-",
        );

        const terminalText = computed(() => {
            const report = session.captureReport;
            const requests = report?.requests || [];
            const date = (value) => (value ? new Date(value).toLocaleString() : "未记录");
            return [
                `# Support ID: ${session.supportId}`,
                `# 固件: ${session.metadata?.firmwareVersion || "未记录"}`,
                `# 板卡: ${session.metadata?.target || session.metadata?.boardName || "未记录"}`,
                `# 采集时间: ${date(report?.startedAt || session.metadata?.createdAt)}`,
                `# 到期时间: ${date(session.expiresAt)}`,
                `# PID Profile: ${report?.profile?.pid + 1} / Rates Profile: ${report?.profile?.rate + 1}（固定只读）`,
                `# 采集结果: ${report?.complete ? "完整" : "不完整"}；成功 ${requests.filter((r) => r.status === "success").length}；不支持 ${requests.filter((r) => r.status === "unsupported").length}；共 ${requests.length} 项`,
                "",
                "# 采集时的 CLI 记录（只读）",
                "",
                session.cliTranscript || "此快照未保存 CLI 记录",
            ].join("\n");
        });

        async function loadSnapshot() {
            error.value = "";
            loading.value = true;
            try {
                const snapshot = await new BuildApi().loadSupportSnapshot(supportId.value.trim());
                if (!snapshot) throw new Error("未找到支持快照、快照已过期，或当前账号没有访问权限。");
                await openSupportSnapshotSession(snapshot);
            } catch (loadError) {
                error.value = loadError.message || "加载支持快照失败。";
            } finally {
                loading.value = false;
            }
        }

        function closeSnapshot() {
            closeSupportSnapshotSession();
        }

        onMounted(() => GUI.content_ready());
        return { terminalText, supportId, loading, error, session, formattedExpiry, loadSnapshot, closeSnapshot };
    },
});
</script>

<style scoped lang="less">
.support-snapshot__terminal {
    max-height: 60vh;
    overflow: auto;
    padding: 16px;
    background: #15191f;
    color: #e4e9ef;
    font-family: monospace;
    white-space: pre;
    user-select: text;
}

.support-snapshot__form {
    display: flex;
    gap: 8px;
    align-items: center;
}

.support-snapshot__form :deep(input) {
    text-transform: uppercase;
}

.support-snapshot__error {
    margin-top: 10px;
    color: var(--error-500);
}

.support-snapshot__details {
    margin-top: 12px;
}

.support-snapshot__details dl {
    display: grid;
    gap: 8px;
    margin: 0 0 16px;
}

.support-snapshot__details dl > div {
    display: grid;
    grid-template-columns: minmax(120px, 180px) 1fr;
    gap: 12px;
}

.support-snapshot__details dt {
    color: var(--text-secondary);
}

.support-snapshot__details dd {
    margin: 0;
    font-family: monospace;
}

@media (max-width: 575px) {
    .support-snapshot__form {
        align-items: stretch;
        flex-direction: column;
    }
}
</style>
