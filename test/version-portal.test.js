import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";

const source = readFileSync("deploy/version-portal/index.html", "utf8");

function evaluatePortal({ localStorage = {} } = {}) {
    const virtualConsole = new VirtualConsole();
    const timers = {
        intervals: [],
        timeouts: [],
        clearedIntervals: [],
        clearedTimeouts: [],
    };
    const dom = new JSDOM(source, {
        runScripts: "outside-only",
        url: "https://bf.hs-fpv.com/",
        virtualConsole,
    });
    Object.entries(localStorage).forEach(([key, value]) => dom.window.localStorage.setItem(key, value));
    dom.window.Promise = undefined;
    dom.window.setInterval = (callback, delay) => {
        const id = timers.intervals.length + 1;
        timers.intervals.push({ id, callback, delay });
        return id;
    };
    dom.window.setTimeout = (callback, delay) => {
        const id = timers.timeouts.length + 1;
        timers.timeouts.push({ id, callback, delay });
        return id;
    };
    dom.window.clearInterval = (id) => timers.clearedIntervals.push(id);
    dom.window.clearTimeout = (id) => timers.clearedTimeouts.push(id);
    dom.window.eval(dom.window.document.querySelector("script").textContent);
    return { dom, timers };
}

describe("version portal browser fallback", () => {
    it("uses a visible 10-second countdown and disables latest-version escape for unsupported browsers", () => {
        const { dom, timers } = evaluatePortal();

        expect(dom.window.document.body.className).toBe("is-incompatible");
        expect(dom.window.document.getElementById("fallback-countdown").textContent).toContain("10 秒");
        expect(timers.intervals).toHaveLength(1);
        expect(timers.timeouts).toEqual([{ id: 1, callback: expect.any(Function), delay: 10_000 }]);
        timers.intervals[0].callback();
        expect(dom.window.document.getElementById("fallback-countdown").textContent).toContain("9 秒");
        expect(dom.window.document.querySelector(".close").getAttribute("aria-label")).toContain("2026.6.1");
    });

    it("remembers a manual switch to 2025.12.2 and cancels the portal countdown", () => {
        const { dom, timers } = evaluatePortal();

        dom.window.document.getElementById("fallback-action").onclick();

        expect(dom.window.localStorage.getItem("bf-configurator-version")).toBe("2025.12.2");
        expect(timers.clearedIntervals).toEqual([1]);
        expect(timers.clearedTimeouts).toEqual([1]);
    });

    it("immediately falls back without scheduling a countdown when warnings are disabled", () => {
        const { dom, timers } = evaluatePortal({
            localStorage: { "bf-configurator-hide-compatibility-warning": "1" },
        });

        expect(dom.window.document.body.className).toBe("is-incompatible");
        expect(timers.intervals).toHaveLength(0);
        expect(timers.timeouts).toHaveLength(0);
    });
});
