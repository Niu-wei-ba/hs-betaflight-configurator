<template>
    <figure class="melody-overview" aria-label="旋律音高与时间预览">
        <div class="overview-pitches" aria-hidden="true">
            <span v-for="pitch in pitches" :key="pitch">{{ pitchName(pitch) }}</span>
        </div>
        <div class="overview-grid" role="img" :aria-label="`${pitchedNotes.length} 个音符，${seconds.toFixed(1)} 秒`">
            <div v-for="pitch in pitches" :key="pitch" class="overview-grid-row" aria-hidden="true">
                <i v-for="tick in 8" :key="tick"></i>
            </div>
            <span
                v-for="(note, index) in pitchedNotes"
                :key="index"
                class="overview-note"
                :style="noteStyle(note)"
                :title="`${pitchName(note.midi)} · ${((note.start * 60) / bpm).toFixed(1)}s`"
                aria-hidden="true"
            ></span>
            <span v-if="!pitchedNotes.length" class="overview-empty">暂无音符，进入编曲添加</span>
        </div>
        <div class="overview-time" aria-hidden="true">
            <span v-for="tick in 5" :key="tick">{{ (((tick - 1) * seconds) / 4).toFixed(1) }}s</span>
        </div>
        <figcaption class="visually-hidden">音高从上到下递减，时间从左到右；休止与启动等待保留在时间轴中。</figcaption>
    </figure>
</template>
<script setup lang="ts">
import { computed } from "vue";

/** @typedef {{ midi: number | null, start: number, duration: number, rest?: boolean }} PreviewNote */
const props = defineProps({
    notes: { type: Array, required: true },
    bpm: { type: Number, required: true },
    waitMs: { type: Number, default: 0 },
});
const bpm = computed(() => Math.max(1, Number(props.bpm) || 120));
const waitBeats = computed(() => (Math.max(0, props.waitMs || 0) * bpm.value) / 60000);
const pitchedNotes = computed(() =>
    props.notes.filter(
        (note) => !note.rest && Number.isFinite(note.midi) && Number.isFinite(note.start) && note.duration > 0,
    ),
);
const extent = computed(() =>
    Math.max(1, waitBeats.value + Math.max(0, ...props.notes.map((note) => note.start + note.duration))),
);
const seconds = computed(() => (extent.value * 60) / bpm.value);
const upperPitch = computed(() => Math.max(72, ...pitchedNotes.value.map((note) => note.midi)) + 1);
const lowerPitch = computed(() => Math.min(60, ...pitchedNotes.value.map((note) => note.midi)) - 1);
const pitches = computed(() =>
    Array.from({ length: 12 }, (_, index) =>
        Math.round(upperPitch.value - (index * (upperPitch.value - lowerPitch.value)) / 11),
    ),
);
/** @param {number} midi */
function pitchName(midi) {
    return `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`;
}
/** @param {PreviewNote} note */
function noteStyle(note) {
    return {
        left: `${((waitBeats.value + note.start) / extent.value) * 100}%`,
        width: `${(note.duration / extent.value) * 100}%`,
        top: `${((upperPitch.value - note.midi) / (upperPitch.value - lowerPitch.value)) * 92 + 2}%`,
    };
}
</script>
