<template>
    <div v-if="output" class="text-sm my-2" data-testid="passive-motor-evidence">
        <p>
            {{ $t("passiveAnalysisOutputUpper") }}: {{ pct(output.nearUpperFraction) }} ·
            {{ $t("passiveAnalysisOutputLower") }}: {{ pct(output.nearLowerFraction) }}
        </p>
        <p>
            {{ $t("passiveAnalysisLongestLower") }}: {{ fmt(output.longestLowerMs) }} ms ·
            {{ $t("passiveAnalysisValidOutput") }}: {{ fmt(output.durationSeconds) }} s ·
            {{ $t("passiveAnalysisInvalidOutput") }}: {{ fmt(output.invalidSeconds) }} s
        </p>
        <p class="text-dimmed">{{ $t("passiveAnalysisOutputMeaning") }}</p>
        <details v-if="output.perMotor?.length">
            <summary>{{ $t("passiveAnalysisPerMotor") }}</summary>
            <p>
                {{ output.bounds?.source }} · {{ output.bounds?.low }}–{{ output.bounds?.high }} ·
                {{ $t("passiveAnalysisBoundTolerance") }} {{ fmt(output.bounds?.tolerance) }}
            </p>
            <div class="overflow-auto">
                <table class="w-full">
                    <thead>
                        <tr>
                            <th>{{ $t("passiveAnalysisMotor") }}</th>
                            <th>Min / Max</th>
                            <th>{{ $t("passiveAnalysisOutputLower") }}</th>
                            <th>{{ $t("passiveAnalysisOutputUpper") }}</th>
                            <th>{{ $t("passiveAnalysisCommandRoom") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="motor in output.perMotor" :key="motor.name">
                            <td>{{ motor.name }}</td>
                            <td>{{ fmt(motor.min) }} / {{ fmt(motor.max) }}</td>
                            <td>{{ pct(motor.nearLowerFraction) }} · {{ fmt(motor.longestLowerMs) }} ms</td>
                            <td>{{ pct(motor.nearUpperFraction) }} · {{ fmt(motor.longestUpperMs) }} ms</td>
                            <td>
                                {{ pct(motor.minimumLowerCommandRoomFraction) }} /
                                {{ pct(motor.minimumUpperCommandRoomFraction) }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p v-for="(seconds, count) in output.lowerMotorCountSeconds" :key="count">
                {{ $t("passiveAnalysisLowerMotorCount", { count }) }}: {{ fmt(seconds) }} s
            </p>
        </details>
    </div>
</template>
<script setup>
defineProps({ output: { type: Object, default: null } });
const fmt = (value) => (Number.isFinite(value) ? value.toFixed(3) : "—");
const pct = (value) => (Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—");
</script>
