import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/js/msp", () => ({ default: {} }));
vi.mock("../../src/js/port_handler", () => ({ default: {} }));
vi.mock("../../src/js/localization", () => ({ i18n: {} }));

import GUI from "../../src/js/gui";

afterEach(() => {
    document.body.innerHTML = "";
});

describe("Switchery state synchronization", () => {
    it.each(["toggle", "togglesmall", "togglemedium"])(
        "refreshes an existing %s after programmatic changes without emitting change events",
        (className) => {
            document.body.innerHTML = `
                <style>.switchery, .switcherymid { width: 32px; } small { width: 16px; }</style>
                <input type="checkbox" class="${className}">
            `;
            const input = document.querySelector<HTMLInputElement>("input")!;
            const onChange = vi.fn();
            input.addEventListener("change", onChange);
            GUI.switchery();
            const switcher = input.nextElementSibling as HTMLElement;
            const knob = switcher.querySelector<HTMLElement>("small")!;

            for (const enabled of [true, false, true, false]) {
                input.checked = enabled;
                GUI.switchery();
                expect(knob.style.left).toBe(enabled ? "16px" : "0px");
                expect(input.checked).toBe(enabled);
                expect(input.nextElementSibling).toBe(switcher);
                expect(document.querySelectorAll("small")).toHaveLength(1);
            }
            expect(onChange).not.toHaveBeenCalled();

            switcher.click();
            expect(input.checked).toBe(true);
            expect(knob.style.left).toBe("16px");
            expect(onChange).toHaveBeenCalledTimes(1);
        },
    );
});
