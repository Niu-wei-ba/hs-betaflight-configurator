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
        return { supportId, loading, error, session, formattedExpiry, loadSnapshot, closeSnapshot };
    },
});
</script>

<style scoped lang="less">
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
