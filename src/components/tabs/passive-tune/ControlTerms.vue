<template>
    <div class="space-y-2" data-testid="passive-control-terms">
        <p class="text-sm">{{ $t("passiveControlMeaning") }}</p>
        <div class="overflow-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr>
                        <th>{{ $t("passiveControlTerm") }}</th>
                        <th>{{ $t("passiveControlMean") }}</th>
                        <th>RMS</th>
                        <th>{{ $t("passiveControlPeak") }}</th>
                        <th>{{ $t("passiveControlChange") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="term in ['P', 'I', 'D', 'F']" :key="term">
                        <td>{{ term === "F" ? "FF" : term }}</td>
                        <td>{{ fmt(control?.terms[term]?.mean) }}</td>
                        <td>{{ fmt(control?.terms[term]?.rms) }}</td>
                        <td>{{ fmt(control?.terms[term]?.absolutePeak) }}</td>
                        <td>{{ fmt(control?.terms[term]?.endMinusStart) }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p>{{ $t("passiveControlPCorrelation") }}: {{ fmt(control?.pErrorCorrelation) }}</p>
        <p>{{ $t("passiveControlFfCorrelation") }}: {{ fmt(control?.ffCommandDerivativeCorrelation) }}</p>
        <details v-if="spectrum">
            <summary>{{ $t("passiveControlSpectrum") }}</summary>
            <p class="text-sm my-2">{{ $t("passiveControlSpectrumMeaning") }}</p>
            <div class="overflow-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr>
                            <th>Hz</th>
                            <th>D RMS</th>
                            <th>{{ $t("passiveControlRawGyro") }}</th>
                            <th>{{ $t("passiveControlFilteredGyro") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(band, index) in spectrum.filteredGyroBands ?? []" :key="index">
                            <td>{{ band.lowHz }}–{{ band.highHz }}</td>
                            <td>{{ fmt(spectrum.dtermBands?.[index]?.value) }}</td>
                            <td>{{ fmt(spectrum.unfilteredGyroBands?.[index]?.value) }} °/s</td>
                            <td>{{ fmt(band.value) }} °/s</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </details>
    </div>
</template>
<script setup>
defineProps({ control: { type: Object, default: null }, spectrum: { type: Object, default: null } });
const fmt = (value) => (Number.isFinite(value) ? value.toFixed(2) : "—");
</script>
<style scoped>
th,
td {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid var(--ui-border);
}
</style>
