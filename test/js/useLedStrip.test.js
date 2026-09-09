import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import FC from "../../src/js/fc";

const { sendLedStripConfigValuesMock } = vi.hoisted(() => ({
    sendLedStripConfigValuesMock: vi.fn(async () => {}),
}));

vi.mock("../../src/js/msp/MSPHelper", () => ({
    __esModule: true,
    mspHelper: {
        sendLedStripConfigValues: sendLedStripConfigValuesMock,
    },
}));

vi.mock("../../src/composables/useReboot", () => ({
    __esModule: true,
    useReboot: () => ({ saveToEeprom: vi.fn() }),
}));

import { useLedStrip } from "../../src/composables/useLedStrip";

describe("useLedStrip LED config values", () => {
    let scope;
    let ledStrip;

    beforeEach(() => {
        FC.resetState();
        FC.CONFIG.apiVersion = "1.46.0";
        FC.LED_CONFIG_VALUES = { brightness: 80, rainbow_delta: 20, rainbow_freq: 30 };
        sendLedStripConfigValuesMock.mockClear();
        scope = effectScope();
        scope.run(() => {
            ledStrip = useLedStrip();
        });
    });

    afterEach(() => scope.stop());

    it("does not write values that were just loaded from the flight controller", async () => {
        await expect(ledStrip.updateLedConfigValue("brightness", 80)).resolves.toBe(false);
        expect(sendLedStripConfigValuesMock).not.toHaveBeenCalled();
    });

    it("writes a changed value once", async () => {
        await expect(ledStrip.updateLedConfigValue("brightness", 65)).resolves.toBe(true);
        expect(FC.LED_CONFIG_VALUES.brightness).toBe(65);
        expect(sendLedStripConfigValuesMock).toHaveBeenCalledTimes(1);
    });
});
