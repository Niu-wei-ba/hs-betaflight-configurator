<template>
    <figure class="response-figure">
        <div class="flex flex-wrap gap-4 text-sm mb-2">
            <span v-if="curve.kind === 'observed'"><i class="legend command" />{{ $t("passiveAnalysisCommand") }}</span>
            <span
                ><i class="legend response" />{{
                    $t(curve.kind === "observed" ? "passiveAnalysisActual" : "passiveAnalysisEstimated")
                }}</span
            >
            <span>{{ $t("passiveAnalysisPlotHint") }}</span>
        </div>
        <svg
            viewBox="0 0 900 320"
            role="img"
            :aria-label="$t('passiveAnalysisResponsePlot')"
            @mousemove="hover"
            @mouseleave="active = null"
        >
            <rect
                v-if="curve.kind === 'observed'"
                :x="sx(0)"
                y="20"
                :width="Math.max(0, sx(curve.transitionMs) - sx(0))"
                height="250"
                fill="currentColor"
                opacity="0.06"
            />
            <g v-for="tick in yTicks" :key="tick">
                <line x1="68" :y1="sy(tick)" x2="875" :y2="sy(tick)" stroke="currentColor" opacity="0.12" />
                <text x="58" :y="sy(tick) + 4" text-anchor="end">{{ tick.toFixed(1) }}</text>
            </g>
            <g v-for="tick in xTicks" :key="tick">
                <text :x="sx(tick)" y="292" text-anchor="middle">{{ Math.round(tick) }}</text>
            </g>
            <line
                v-if="Number.isFinite(curve.target)"
                x1="68"
                :y1="sy(curve.target)"
                x2="875"
                :y2="sy(curve.target)"
                stroke="currentColor"
                opacity="0.35"
                stroke-dasharray="5 5"
            />
            <path
                v-if="curve.kind === 'observed'"
                :d="path('input')"
                fill="none"
                stroke="currentColor"
                opacity="0.65"
                stroke-width="1.6"
            />
            <path :d="path('output')" fill="none" stroke="#f2a900" stroke-width="2.2" />
            <g v-if="active">
                <line
                    :x1="sx(active.timeMs)"
                    y1="20"
                    :x2="sx(active.timeMs)"
                    y2="270"
                    stroke="currentColor"
                    opacity="0.4"
                />
                <circle :cx="sx(active.timeMs)" :cy="sy(active.output)" r="4" fill="#f2a900" />
            </g>
            <text x="68" y="13">{{ curve.unit }}</text>
            <text x="875" y="313" text-anchor="end">{{ $t("passiveAnalysisTimeMs") }}</text>
        </svg>
        <figcaption class="text-sm min-h-6 tabular-nums">
            <template v-if="active"
                >{{ active.timeMs.toFixed(1) }} ms · {{ $t("passiveAnalysisActual") }} {{ active.output.toFixed(2) }}
                {{ curve.unit
                }}<template v-if="Number.isFinite(active.input)">
                    · {{ $t("passiveAnalysisCommand") }} {{ active.input.toFixed(2) }} {{ curve.unit }}</template
                ></template
            >
            <template v-else>{{
                $t(curve.kind === "observed" ? "passiveAnalysisObservedCaption" : "passiveAnalysisEstimateCaption")
            }}</template>
        </figcaption>
    </figure>
</template>
<script setup>
import { computed, ref } from "vue";
const props = defineProps({ curve: { type: Object, required: true } });
const active = ref(null);
const points = computed(() =>
    props.curve.points.filter((point) => Number.isFinite(point.timeMs) && Number.isFinite(point.output)),
);
const bounds = computed(() => {
    const list = points.value;
    let low = Infinity,
        high = -Infinity;
    for (const point of list)
        for (const value of [point.input, point.output])
            if (Number.isFinite(value)) {
                low = Math.min(low, value);
                high = Math.max(high, value);
            }
    const pad = Math.max(1e-3, (high - low) * 0.12);
    return { x0: list[0]?.timeMs ?? 0, x1: list.at(-1)?.timeMs ?? 1, y0: low - pad, y1: high + pad };
});
const sx = (value) => 68 + (807 * (value - bounds.value.x0)) / Math.max(1, bounds.value.x1 - bounds.value.x0);
const sy = (value) => 270 - (250 * (value - bounds.value.y0)) / Math.max(1e-6, bounds.value.y1 - bounds.value.y0);
const xTicks = computed(() =>
    Array.from({ length: 5 }, (_, i) => bounds.value.x0 + (i * (bounds.value.x1 - bounds.value.x0)) / 4),
);
const yTicks = computed(() =>
    Array.from({ length: 5 }, (_, i) => bounds.value.y0 + (i * (bounds.value.y1 - bounds.value.y0)) / 4),
);
const path = (key) =>
    points.value
        .filter((point) => Number.isFinite(point[key]))
        .map((point, i) => `${i ? "L" : "M"}${sx(point.timeMs).toFixed(2)},${sy(point[key]).toFixed(2)}`)
        .join(" ");
function hover(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 900;
    const time = bounds.value.x0 + ((x - 68) / 807) * (bounds.value.x1 - bounds.value.x0);
    active.value = points.value.reduce(
        (best, point) => (!best || Math.abs(point.timeMs - time) < Math.abs(best.timeMs - time) ? point : best),
        null,
    );
}
</script>
<style scoped>
.response-figure svg {
    width: 100%;
    max-height: 360px;
    color: var(--ui-text);
}
svg text {
    font-size: 11px;
    fill: currentColor;
    font-variant-numeric: tabular-nums;
}
.legend {
    display: inline-block;
    width: 18px;
    height: 3px;
    vertical-align: middle;
    margin-right: 6px;
}
.command {
    background: currentColor;
    opacity: 0.65;
}
.response {
    background: #f2a900;
}
</style>
