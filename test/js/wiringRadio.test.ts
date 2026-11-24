import { describe, expect, it } from "vitest";
import { mapRadioChannels, validRadioChannels } from "../../src/js/wiringRadio";

describe("virtual receiver channels", () => {
    it("maps AETR to Betaflight's AERT order and preserves extra channels", () => {
        const channels = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];
        expect(mapRadioChannels(channels, undefined)).toEqual([1100, 1200, 1400, 1300, 1500, 1600, 1700, 1800, 1900]);
        expect(mapRadioChannels(channels, [1, 2, 3, 0, 5, 4, 6, 7])).toEqual([
            1200, 1300, 1400, 1100, 1600, 1500, 1700, 1800, 1900,
        ]);
    });

    it("never invents input for an unavailable channel", () => {
        const channels = [1100, 1200, 1300, 1400, 1500];
        expect(mapRadioChannels(channels, [0, 1, 3, 2, 5, 4, 6, 7])).toEqual([1100, 1200, 1400, 1300]);
        expect(mapRadioChannels(channels, [6, 1, 3, 2, 0, 4, 5, 7])).toEqual([]);
    });

    it("rejects malformed or non-joystick sample values", () => {
        expect(validRadioChannels([1000, 1500, 2000, 1500])).toBe(true);
        expect(validRadioChannels([1500, 1500.5, 1500, 1500])).toBe(false);
        expect(validRadioChannels([999, 1500, 1500, 1500])).toBe(false);
        expect(validRadioChannels([1500, 2001, 1500, 1500])).toBe(false);
        expect(validRadioChannels([1500, 1500, 1500])).toBe(false);
        expect(validRadioChannels(Array(17).fill(1500))).toBe(false);
        expect(validRadioChannels(Array(4))).toBe(false);
    });
});
