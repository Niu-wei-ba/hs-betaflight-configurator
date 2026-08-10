import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";

const source = readFileSync("src/public/browser-compatibility.js", "utf8");

function evaluateCompatibility(userAgent, { localStorage = {} } = {}) {
    const virtualConsole = new VirtualConsole();
    const timers = {
        intervals: [],
        timeouts: [],
        clearedIntervals: [],
        clearedTimeouts: [],
    };
    const dom = new JSDOM(
        '<!doctype html><html><body><div id="browser-compatibility-message" hidden></div><div id="main-wrapper"></div></body></html>',
        { runScripts: "outside-only", url: "https://bf.hs-fpv.com/v/2026.6.1/", virtualConsole },
    );
    Object.defineProperty(dom.window.navigator, "userAgent", { configurable: true, value: userAgent });
    Object.entries(localStorage).forEach(([key, value]) => dom.window.localStorage.setItem(key, value));
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
    dom.window.eval(source);
    dom.window.document.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    return { dom, timers };
}

describe("browser startup compatibility guard", () => {
    it("shows an actionable page before the app modules for unsupported Chromium", () => {
        const { dom, timers } = evaluateCompatibility(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/79.0.3945.130 Safari/537.36",
        );

        expect(dom.window.__BF_BROWSER_COMPATIBILITY__).toMatchObject({
            supported: false,
            reason: "outdated",
            minimumVersion: 80,
        });
        expect(dom.window.document.getElementById("browser-compatibility-message").hidden).toBe(false);
        expect(dom.window.document.getElementById("main-wrapper").style.display).toBe("none");
        expect(dom.window.document.getElementById("browser-compatibility-countdown").textContent).toContain("10 秒");
        expect(timers.timeouts).toHaveLength(1);
        expect(timers.timeouts[0].delay).toBe(10_000);
        expect(timers.intervals).toHaveLength(1);
        timers.intervals[0].callback();
        expect(dom.window.document.getElementById("browser-compatibility-countdown").textContent).toContain("9 秒");
    });

    it("allows the supported PC browser baseline and installs missing runtime polyfills", () => {
        const { dom, timers } = evaluateCompatibility(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/80.0.3987.149 Safari/537.36",
        );

        expect(dom.window.__BF_BROWSER_COMPATIBILITY__).toMatchObject({
            supported: true,
            browser: { family: "chromium", version: 80 },
        });
        expect(dom.window.document.getElementById("browser-compatibility-message").hidden).toBe(true);
        expect(typeof dom.window.Array.prototype.at).toBe("function");
        expect(typeof dom.window.String.prototype.replaceAll).toBe("function");
        expect(typeof dom.window.structuredClone).toBe("function");
        expect(timers.timeouts).toHaveLength(0);
    });

    it("rejects legacy Edge before the module bundle can white-screen", () => {
        const { dom } = evaluateCompatibility(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/42.0.2311.135 Safari/537.36 Edge/18.19041",
        );

        expect(dom.window.__BF_BROWSER_COMPATIBILITY__).toMatchObject({ supported: false, reason: "legacy-edge" });
    });

    it("remembers a manual switch to 2025.12.2 and cancels the pending countdown", () => {
        const { dom, timers } = evaluateCompatibility(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/79.0.3945.130 Safari/537.36",
        );

        dom.window.document.getElementById("browser-compatibility-fallback").onclick();

        expect(dom.window.localStorage.getItem("bf-configurator-version")).toBe("2025.12.2");
        expect(timers.clearedIntervals).toEqual([1]);
        expect(timers.clearedTimeouts).toEqual([1]);
    });

    it("skips the dialog when the user asked not to see it again", () => {
        const { dom, timers } = evaluateCompatibility(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/79.0.3945.130 Safari/537.36",
            { localStorage: { "bf-configurator-hide-compatibility-warning": "1" } },
        );

        expect(dom.window.document.getElementById("browser-compatibility-message").hidden).toBe(true);
        expect(timers.intervals).toHaveLength(0);
        expect(timers.timeouts).toHaveLength(0);
    });
});
