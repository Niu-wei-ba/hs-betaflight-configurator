<template>
    <section class="channel-plan" aria-label="声部与通道分配">
        <div class="panel-heading">
            <strong>{{ modeLabel }}</strong
            ><small>{{ rows.length ? `${rows.length} 路通道` : "未分配" }}</small>
        </div>
        <p v-if="!rows.length" class="workbench-help">可先离线编曲，连接并验证电调后分配到通道。</p>
        <div v-else class="channel-plan-scroll">
            <table>
                <caption class="visually-hidden">
                    声部到电调通道的分配，不代表物理电机位置
                </caption>
                <thead>
                    <tr>
                        <th>通道 / 固件</th>
                        <th>旋律 / 声部</th>
                        <th v-if="separateCapacity">容量</th>
                        <th>状态</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in rows" :key="row.id" :data-state="row.state" :data-status="row.status">
                        <th scope="row">
                            ESC {{ row.channel + 1 }}<small>{{ row.firmware }}</small>
                        </th>
                        <td>
                            <select
                                v-if="editable && voiceCount > 1 && row.editable"
                                :aria-label="`ESC ${row.channel + 1} 分配声部`"
                                :value="row.voiceIndex"
                                @change="emit('assign', row.id, Number($event.target.value))"
                            >
                                <option v-for="voice in voiceCount" :key="voice" :value="voice - 1">
                                    声部 {{ voice }}
                                </option></select
                            ><span v-else>{{ row.voiceLabel }}</span
                            ><small v-if="row.capacity && !separateCapacity">{{ row.capacity }}</small>
                        </td>
                        <td v-if="separateCapacity" class="channel-capacity">{{ row.capacity || "—" }}</td>
                        <td class="channel-status" aria-live="polite" aria-atomic="true">
                            <span class="channel-status-label">{{ row.status }}</span>
                            <small v-if="row.error" class="channel-status-error">{{ row.error }}</small>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p v-for="warning in warnings" :key="warning" class="assignment-warning">{{ warning }}</p>
    </section>
</template>
<script setup lang="ts">
defineProps({
    rows: { type: Array, required: true },
    modeLabel: String,
    voiceCount: Number,
    warnings: Array,
    editable: Boolean,
    separateCapacity: Boolean,
});
const emit = defineEmits(["assign"]);
</script>
