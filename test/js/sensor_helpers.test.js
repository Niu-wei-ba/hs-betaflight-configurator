import { beforeEach, describe, expect, it } from "vitest";
import { sensor_status } from "../../src/js/sensor_helpers";

function renderSensorStatus() {
    document.body.innerHTML = `
        <div id="sensor-status">
            <div class="accel"><div class="accicon"></div></div>
            <div class="gyro"><div class="gyroicon"></div></div>
            <div class="baro"><div class="baroicon"></div></div>
            <div class="mag"><div class="magicon"></div></div>
            <div class="gps"><div class="gpsicon"></div></div>
            <div class="sonar"><div class="sonaricon"></div></div>
        </div>
    `;
}

describe("sensor_status", () => {
    beforeEach(() => {
        renderSensorStatus();
        sensor_status.previous_sensors_detected = -1;
        sensor_status.previous_gps_fix_state = -1;
    });

    it("renders active sensors from the MSP bitmask", () => {
        sensor_status((1 << 0) | (1 << 5));

        expect(document.querySelector(".accel").classList.contains("on")).toBe(true);
        expect(document.querySelector(".accicon").classList.contains("active")).toBe(true);
        expect(document.querySelector(".gyro").classList.contains("on")).toBe(true);
        expect(document.querySelector(".gyroicon").classList.contains("active")).toBe(true);
        expect(document.querySelector(".baro").classList.contains("on")).toBe(false);
    });

    it("re-renders when the DOM is recreated with the same sensor state", () => {
        sensor_status(1 << 5);

        document.querySelector(".gyro").className = "gyro";
        document.querySelector(".gyroicon").className = "gyroicon";
        sensor_status(1 << 5);

        expect(document.querySelector(".gyro").classList.contains("on")).toBe(true);
        expect(document.querySelector(".gyroicon").classList.contains("active")).toBe(true);
    });
});
