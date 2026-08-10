<template>
    <UModal :open="open" :title="title" :close="false" :dismissible="false">
        <template #body>
            <div class="flex flex-col gap-3 py-1">
                <div class="flex items-end justify-between gap-3">
                    <p class="text-sm font-medium">{{ status }}</p>
                    <span class="text-sm tabular-nums text-muted">{{ clampedProgress }}%</span>
                </div>
                <UProgress :model-value="clampedProgress" :max="100" size="lg" />
                <p class="min-h-4 text-xs text-muted">{{ transfer }}</p>
            </div>
        </template>
    </UModal>
</template>

<script setup>
import { computed, ref } from "vue";

const props = defineProps({
    title: String,
    status: String,
    progress: {
        type: Number,
        default: 0,
    },
    transfer: String,
});

const open = ref(false);
const clampedProgress = computed(() => Math.min(Math.max(Math.round(props.progress || 0), 0), 100));

const show = () => {
    open.value = true;
};

const close = () => {
    open.value = false;
};

defineExpose({
    show,
    close,
});
</script>
