<template>
    <div :class="[`tab-${tabName}`, extraClass]">
        <p v-if="snapshotIssue" role="alert" class="p-4">{{ snapshotIssue }}</p>
        <div ref="content" v-show="!snapshotIssue" class="snapshot-tab-content"><slot></slot></div>
    </div>
</template>

<script>
import { defineComponent, onMounted, onUnmounted, inject, ref, computed, watch, onErrorCaptured } from "vue";
import GUI from "../../js/gui";
import { supportSnapshotSession, reportSupportSnapshotIssue } from "../../js/support/SnapshotSession";
import { guardSnapshotControls } from "../../js/support/SnapshotReadOnly";

/**
 * BaseTab provides common tab lifecycle management for Vue tabs.
 *
 * Usage:
 *   <BaseTab tab-name="help" @mounted="onTabMounted">
 *     <template>...content...</template>
 *   </BaseTab>
 */
export default defineComponent({
    name: "BaseTab",
    props: {
        tabName: {
            type: String,
            required: true,
        },
        extraClass: {
            type: String,
            default: "",
        },
    },
    emits: ["mounted", "cleanup"],
    setup(props, { emit }) {
        const content = ref(null);
        const readOnly = computed(() => supportSnapshotSession.active && props.tabName !== "support_snapshot");
        const snapshotIssue = computed(() => (readOnly.value ? supportSnapshotSession.issues[props.tabName] : ""));
        let releaseControls;
        watch(
            [content, readOnly],
            () => {
                releaseControls?.();
                releaseControls = content.value && readOnly.value ? guardSnapshotControls(content.value) : null;
            },
            { flush: "post" },
        );
        onErrorCaptured((error) => {
            if (!readOnly.value) return;
            reportSupportSnapshotIssue(props.tabName, `快照数据不可用：${error.message}。请重新采集。`);
            return false;
        });
        // Access the global reactive model
        const model = inject("betaflightModel", null);

        onMounted(() => {
            GUI.active_tab = props.tabName;
            emit("mounted");
        });

        onUnmounted(() => {
            releaseControls?.();
            // Clean up any intervals/timeouts when tab is destroyed
            // Global cleanup removed to allow tabs to manage their own intervals individually
            // GUI.interval_kill_all();
            // GUI.timeout_kill_all();
            emit("cleanup");
        });

        return { model, content, snapshotIssue };
    },
});
</script>

<style scoped>
.snapshot-tab-content {
    display: contents;
}
</style>
