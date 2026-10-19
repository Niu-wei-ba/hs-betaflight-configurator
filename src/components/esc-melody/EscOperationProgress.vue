<template>
    <section v-if="rows.length" class="operation-progress" aria-label="逐路操作进度" aria-live="polite">
        <ol>
            <li v-for="row in rows" :key="row.channel" :data-state="row.state">
                <strong>ESC {{ row.channel + 1 }}</strong
                ><span>{{ labels[row.state] || row.state }}</span
                ><small v-if="row.error">{{ row.error }}</small>
            </li>
        </ol>
    </section>
</template>
<script setup lang="ts">
defineProps({ rows: { type: Array, required: true } });
const labels = {
    restore: "从备份恢复中",
    restoreVerify: "恢复读回校验中",
    restored: "已恢复并校验",
    restoreFailed: "恢复失败",
    pending: "待处理",
    write: "写入中",
    verify: "读回校验中",
    written: "已读回校验",
    failed: "失败",
    skipped: "未执行",
    recover: "恢复中",
    recoverVerify: "恢复读回校验中",
    recovered: "已恢复并校验",
    recoverFailed: "恢复失败",
};
</script>
