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
import { ESC_OPERATION_LABELS as labels } from "../../js/esc_melody/operation_progress";

defineProps({ rows: { type: Array, required: true } });
</script>
