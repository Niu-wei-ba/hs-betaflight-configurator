<template>
    <div class="qq-group-contact">
        <span class="qq-group-contact__number">群号 <strong>942085532</strong></span>
        <button
            type="button"
            class="qq-group-contact__copy"
            aria-label="复制 QQ 群号 942085532"
            @click="copyGroupNumber"
        >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
            </svg>
            {{ copied ? "已复制" : "复制群号" }}
        </button>
        <span class="qq-group-contact__feedback" role="status">{{ feedback }}</span>
    </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import BFClipboard from "../../js/Clipboard.js";

const copied = ref(false);
const feedback = ref("");

function copyGroupNumber() {
    copied.value = false;
    feedback.value = "";
    const onFailure = () => {
        feedback.value = "复制失败，请手动复制上方群号。";
    };
    try {
        BFClipboard.writeText(
            "942085532",
            () => {
                copied.value = true;
                feedback.value = "群号已复制。";
            },
            onFailure,
        );
    } catch {
        onFailure();
    }
}
</script>
