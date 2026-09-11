import { afterEach, expect, it, vi } from "vitest";
import FC from "../../src/js/fc";
import MSP from "../../src/js/msp";
import CONFIGURATOR from "../../src/js/data_storage";
import { sensorTypes } from "../../src/js/sensor_types";

afterEach(() => {
    vi.restoreAllMocks();
    FC.resetState();
    CONFIGURATOR.supportSnapshotMode = false;
});

it("opens API 1.48 snapshot sensor definitions without entering CLI", async () => {
    FC.CONFIG.apiVersion = "1.48.0";
    CONFIGURATOR.supportSnapshotMode = true;
    FC.SENSOR_NAMES = { gyro: ["NONE", "CAPTURED_GYRO"] };
    const send = vi.spyOn(MSP, "send_cli_command");
    const types = await sensorTypes();
    expect(types.gyro.elements).toEqual(["NONE", "CAPTURED_GYRO"]);
    expect(types.sonar.elements[0]).toBe("NONE");
    expect(send).not.toHaveBeenCalled();
});
