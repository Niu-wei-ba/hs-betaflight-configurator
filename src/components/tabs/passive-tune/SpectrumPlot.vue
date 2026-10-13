<template>
    <div class="space-y-2">
        <div class="flex gap-3">
            <label v-for="mode in modes" :key="mode">
                <input v-model="selected" type="radio" :value="mode" /> {{ $t(`passiveTunePlot_${mode}`) }}
            </label>
        </div>
        <svg viewBox="0 0 640 220" role="img" :aria-label="$t(`passiveTunePlot_${selected}`)" class="w-full">
            <path d="M 56 15 V 182 H 625" fill="none" stroke="currentColor" opacity="0.5" />
            <text
                v-for="tick in ticks"
                :key="tick.hz"
                :x="tick.x"
                y="203"
                text-anchor="middle"
                fill="currentColor"
                font-size="11"
            >
                {{ tick.hz }}
            </text>
            <text x="615" y="218" fill="currentColor" font-size="11">Hz</text>
            <text x="6" y="23" fill="currentColor" font-size="11">{{ range.max.toFixed(1) }}</text>
            <text x="6" y="180" fill="currentColor" font-size="11">{{ range.min.toFixed(1) }}</text>
            <path :d="path" fill="none" stroke="var(--primary-500, #e6a800)" stroke-width="1.5" />
        </svg>
        <p class="text-xs text-dimmed">{{ $t("passiveTunePlotNote") }}</p>
    </div>
</template>

<script setup>
import { ref, computed } from "vue";
const props = defineProps({ charts: { type: Object, required: true } });
const selected = ref("magnitude");
const modes = ["magnitude", "phase", "coherence", "noise"];
const values = computed(() => {
    const c = props.charts;
    if (selected.value === "noise") return Array.from(c.gyroPsd, (p) => (p > 0 ? 10 * Math.log10(p) : NaN));
    return c[{ magnitude: "magnitudeDb", phase: "phaseDeg", coherence: "coherence" }[selected.value]];
});
const range = computed(() => {
    if (selected.value === "coherence") return { min: 0, max: 1 };
    if (selected.value === "phase") return { min: -180, max: 180 };
    const finite = [...values.value].filter(
        (v, i) => Number.isFinite(v) && (selected.value === "noise" || props.charts.valid[i]),
    );
    return finite.length ? { min: Math.min(...finite) - 1, max: Math.max(...finite) + 1 } : { min: -10, max: 10 };
});
const frequencyRange = computed(() => {
    const supported = Array.from(props.charts.frequencies).filter((hz, i) => hz > 0 && Number.isFinite(hz) &&
        (["noise", "coherence"].includes(selected.value) || props.charts.valid[i]));
    if (!supported.length) return { min: 1, max: 10 };
    const min = Math.max(0.01, supported[0] * 0.85), max = Math.max(min * 2, supported.at(-1) * 1.15);
    return { min, max };
});
const x = (hz) => 56 + ((Math.log10(hz) - Math.log10(frequencyRange.value.min)) / Math.log10(frequencyRange.value.max / frequencyRange.value.min)) * 569;
const ticks = computed(() => Array.from({ length: 5 }, (_, i) => {
    const hz = frequencyRange.value.min * (frequencyRange.value.max / frequencyRange.value.min) ** (i / 4);
    return { hz: Number(hz.toPrecision(2)), x: x(hz) };
}));
const path = computed(() => {
    let drawing = false;
    let output = "";
    values.value.forEach((value, i) => {
        const hz = props.charts.frequencies[i];
        const available = selected.value === "noise" || selected.value === "coherence" || props.charts.valid[i];
        if (hz < frequencyRange.value.min || hz > frequencyRange.value.max || !Number.isFinite(value) || !available) {
            drawing = false;
            return;
        }
        const y = 182 - ((value - range.value.min) / (range.value.max - range.value.min)) * 167;
        // Wrapped phase discontinuities must not be connected across +/-180 degrees.
        if (selected.value === "phase" && i > 0 && Math.abs(value - values.value[i - 1]) > 180) drawing = false;
        output += `${drawing ? "L" : "M"}${x(hz).toFixed(2)},${y.toFixed(2)} `;
        drawing = true;
    });
    return output;
});
</script>
