/* eslint-disable no-var, prefer-template, unused-imports/no-unused-vars */
(function (window, document) {
    "use strict";

    // This file deliberately uses ES5 syntax only. It runs before Vite's
    // module bundle, so it is the last reliable place to help a browser that
    // cannot parse the application's normal JavaScript output.
    var minimumVersions = {
        chromium: 80,
        firefox: 78,
        safari: 13,
    };
    var fallbackUrl = "/v/2025.12.2/";
    var fallbackDelaySeconds = 10;
    var warningKey = "bf-configurator-hide-compatibility-warning";
    var versionKey = "bf-configurator-version";
    var fallbackTimer = null;
    var countdownTimer = null;

    function firstMatch(userAgent, pattern) {
        var match = pattern.exec(userAgent);
        return match ? Number(match[1]) : null;
    }

    function detectBrowser(userAgent) {
        var version;

        if (/Edge\//.test(userAgent)) {
            return { family: "legacy-edge", version: firstMatch(userAgent, /Edge\/(\d+)/) };
        }

        version = firstMatch(userAgent, /(?:Edg|OPR)\/(\d+)/);
        if (version !== null) {
            return { family: "chromium", version: version };
        }

        version = firstMatch(userAgent, /(?:Chrome|Chromium)\/(\d+)/);
        if (version !== null && !/Android/.test(userAgent)) {
            return { family: "chromium", version: version };
        }

        version = firstMatch(userAgent, /Firefox\/(\d+)/);
        if (version !== null) {
            return { family: "firefox", version: version };
        }

        if (/Safari\//.test(userAgent) && !/Chrome|Chromium|Android/.test(userAgent)) {
            return { family: "safari", version: firstMatch(userAgent, /Version\/(\d+)/) };
        }

        return { family: "unknown", version: null };
    }

    function getCompatibility(userAgent) {
        var browser = detectBrowser(userAgent || "");
        var minimumVersion = minimumVersions[browser.family];

        if (browser.family === "legacy-edge") {
            return {
                supported: false,
                browser: browser,
                reason: "legacy-edge",
            };
        }

        if (minimumVersion && (browser.version === null || browser.version < minimumVersion)) {
            return {
                supported: false,
                browser: browser,
                reason: "outdated",
                minimumVersion: minimumVersion,
            };
        }

        if (browser.family === "unknown") {
            return {
                supported: false,
                browser: browser,
                reason: "unknown",
            };
        }

        return {
            supported: true,
            browser: browser,
        };
    }

    function addPolyfills() {
        if (!Array.prototype.at) {
            Array.prototype.at = function (index) {
                var length = this.length >>> 0;
                var offset = Number(index) || 0;
                if (offset < 0) {
                    offset += length;
                }
                return offset < 0 || offset >= length ? undefined : this[offset];
            };
        }

        if (!String.prototype.replaceAll) {
            String.prototype.replaceAll = function (searchValue, replaceValue) {
                if (searchValue instanceof RegExp) {
                    if (!searchValue.global) {
                        throw new TypeError("String.prototype.replaceAll requires a global RegExp");
                    }
                    return this.replace(searchValue, replaceValue);
                }
                return this.split(String(searchValue)).join(String(replaceValue));
            };
        }

        if (!Object.hasOwn) {
            Object.hasOwn = function (object, property) {
                return Object.prototype.hasOwnProperty.call(object, property);
            };
        }

        if (typeof window.structuredClone !== "function") {
            window.structuredClone = function (value) {
                var seen = typeof WeakMap === "function" ? new WeakMap() : [];

                function clone(input) {
                    var output;
                    var index;
                    var key;

                    if (input === null || typeof input !== "object") {
                        return input;
                    }
                    if (input instanceof Date) {
                        return new Date(input.getTime());
                    }
                    if (input instanceof RegExp) {
                        return new RegExp(input.source, input.flags);
                    }
                    if (typeof WeakMap === "function") {
                        if (seen.has(input)) {
                            return seen.get(input);
                        }
                    } else {
                        for (index = 0; index < seen.length; index += 1) {
                            if (seen[index][0] === input) {
                                return seen[index][1];
                            }
                        }
                    }

                    output = Array.isArray(input) ? [] : {};
                    if (typeof WeakMap === "function") {
                        seen.set(input, output);
                    } else {
                        seen.push([input, output]);
                    }
                    for (key in input) {
                        if (Object.prototype.hasOwnProperty.call(input, key)) {
                            output[key] = clone(input[key]);
                        }
                    }
                    return output;
                }

                return clone(value);
            };
        }
    }

    function getStorageValue(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (_error) {
            return null;
        }
    }

    function storeWarningPreference(shouldHide) {
        try {
            if (shouldHide) {
                window.localStorage.setItem(warningKey, "1");
            } else {
                window.localStorage.removeItem(warningKey);
            }
        } catch (_error) {
            // Storage can be unavailable in private or legacy browser contexts.
        }
    }

    function storeFallbackVersion() {
        try {
            window.localStorage.setItem(versionKey, "2025.12.2");
        } catch (_error) {
            // Storage can be unavailable in private or legacy browser contexts.
        }
    }

    function clearFallbackTimers() {
        if (fallbackTimer !== null) {
            window.clearTimeout(fallbackTimer);
            fallbackTimer = null;
        }
        if (countdownTimer !== null) {
            window.clearInterval(countdownTimer);
            countdownTimer = null;
        }
    }

    function redirectToFallback(shouldRememberVersion) {
        clearFallbackTimers();
        if (shouldRememberVersion) {
            storeFallbackVersion();
        }
        window.location.replace(fallbackUrl);
    }

    function updateCountdown(secondsRemaining) {
        var countdown = document.getElementById("browser-compatibility-countdown");
        if (countdown) {
            countdown.textContent = "将在 " + secondsRemaining + " 秒后自动跳转至 2025.12.2 版本。";
        }
    }

    function startFallbackCountdown() {
        var secondsRemaining = fallbackDelaySeconds;

        updateCountdown(secondsRemaining);
        countdownTimer = window.setInterval(function () {
            secondsRemaining -= 1;
            if (secondsRemaining > 0) {
                updateCountdown(secondsRemaining);
            }
        }, 1000);
        fallbackTimer = window.setTimeout(function () {
            redirectToFallback(false);
        }, fallbackDelaySeconds * 1000);
    }

    function messageFor(result) {
        if (result.reason === "legacy-edge") {
            return "检测到旧版 Microsoft Edge。请使用新版 Microsoft Edge、Google Chrome 或 Firefox 打开本页面。";
        }
        if (result.reason === "outdated") {
            return (
                "当前浏览器版本过低（检测到 " +
                result.browser.family +
                " " +
                result.browser.version +
                "）。请升级浏览器后重试。"
            );
        }
        return "无法确认当前浏览器是否兼容。请使用新版 Microsoft Edge、Google Chrome 或 Firefox 打开本页面。";
    }

    function showMessage(result) {
        var mount = document.getElementById("browser-compatibility-message");
        var mainWrapper;
        var dontShowAgain;
        var fallbackAction;

        // Honor this preference before changing the page. This prevents even a
        // brief warning flash for users who have chosen to always use 12.2.
        if (getStorageValue(warningKey) === "1") {
            redirectToFallback(false);
            return;
        }
        if (!mount) {
            return;
        }

        mount.hidden = false;
        mount.style.cssText =
            "position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483647;overflow:auto;padding:1px 18px;background:rgba(243,246,250,.98);";
        mount.innerHTML =
            '<section role="dialog" aria-modal="true" aria-labelledby="browser-compatibility-title" style="max-width:560px;margin:72px auto;padding:28px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#172033;background:#fff;border:1px solid #d8dee9;border-radius:12px;box-shadow:0 12px 36px rgba(23,32,51,.12)">' +
            '<h1 id="browser-compatibility-title" style="margin:0 0 12px;font-size:22px">浏览器需要更新</h1>' +
            '<p style="margin:0">' +
            messageFor(result) +
            "</p>" +
            '<p style="margin:12px 0 0">已为你准备兼容的稳定版本 2025.12.2。</p>' +
            '<p id="browser-compatibility-countdown" style="margin:8px 0 0;color:#667085;font-size:14px"></p>' +
            '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:20px">' +
            '<a id="browser-compatibility-fallback" href="/v/2025.12.2/" style="display:inline-block;padding:10px 14px;border-radius:7px;color:#fff;background:#c88400;font-weight:700;text-decoration:none">立即进入 2025.12.2</a>' +
            '<label style="display:inline-flex;align-items:center;gap:7px;color:#475467;font-size:14px"><input id="browser-compatibility-dont-show" type="checkbox" />以后不再提示</label>' +
            "</div>" +
            "</section>";
        document.documentElement.style.background = "#f3f6fa";
        mainWrapper = document.getElementById("main-wrapper");
        if (mainWrapper) {
            mainWrapper.style.display = "none";
        }

        dontShowAgain = document.getElementById("browser-compatibility-dont-show");
        fallbackAction = document.getElementById("browser-compatibility-fallback");
        dontShowAgain.checked = false;
        dontShowAgain.onchange = function () {
            storeWarningPreference(dontShowAgain.checked);
        };
        fallbackAction.onclick = function () {
            redirectToFallback(true);
            return false;
        };

        startFallbackCountdown();
    }

    var result = getCompatibility(window.navigator && window.navigator.userAgent);
    window.__BF_BROWSER_COMPATIBILITY__ = result;

    if (result.supported) {
        addPolyfills();
        return;
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            showMessage(result);
        });
    } else {
        showMessage(result);
    }
})(window, document);
