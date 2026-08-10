import { Capacitor, registerPlugin } from "@capacitor/core";
import BuildApi from "./BuildApi.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const DEFAULT_ANDROID_APP_UPDATE_API_BASE_URL = "https://bf.hs-fpv.com";

export const BetaflightAppUpdate = registerPlugin("BetaflightAppUpdate");

/**
 * APK replacement is an Android-native capability. It must never run from the
 * hosted Configurator, even when that page is opened on an Android browser.
 */
export function isAndroidNative(capacitor = Capacitor) {
    return capacitor?.isNativePlatform?.() === true && capacitor?.getPlatform?.() === "android";
}

export function resolveAndroidAppUpdateApiBaseUrl(env = import.meta.env) {
    const configuredValue = String(
        env?.VITE_ANDROID_APP_UPDATE_API_BASE_URL || env?.VITE_BUILD_API_BASE_URL || "",
    ).trim();
    const candidate = configuredValue || DEFAULT_ANDROID_APP_UPDATE_API_BASE_URL;

    try {
        const url = new URL(candidate);
        return url.protocol === "https:" ? url.toString().replace(/\/+$/, "") : DEFAULT_ANDROID_APP_UPDATE_API_BASE_URL;
    } catch {
        return DEFAULT_ANDROID_APP_UPDATE_API_BASE_URL;
    }
}

function positiveInteger(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function httpsUrl(value) {
    try {
        const url = new URL(String(value));
        return url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

/**
 * Validate the release document before handing a download URL to native code.
 * Expected API shape: { versionCode, versionName, apkUrl, sha256, releaseNotes? }.
 */
export function normalizeAndroidRelease(payload) {
    const versionCode = positiveInteger(payload?.versionCode);
    const versionName = typeof payload?.versionName === "string" ? payload.versionName.trim() : "";
    const apkUrl = httpsUrl(payload?.apkUrl);
    const sha256 = typeof payload?.sha256 === "string" ? payload.sha256.trim().toLowerCase() : "";

    if (!versionCode || !versionName || !apkUrl || !SHA256_PATTERN.test(sha256)) {
        return null;
    }

    return {
        versionCode,
        versionName,
        apkUrl,
        sha256,
        releaseNotes: typeof payload.releaseNotes === "string" ? payload.releaseNotes : "",
    };
}

export function compareVersionCodes(currentVersionCode, availableVersionCode) {
    const current = positiveInteger(currentVersionCode);
    const available = positiveInteger(availableVersionCode);

    if (!current || !available) {
        throw new TypeError("Android versionCode must be a positive integer");
    }

    return Math.sign(available - current);
}

export async function checkForAndroidAppUpdate({
    buildApi = new BuildApi(null, resolveAndroidAppUpdateApiBaseUrl()),
    plugin = BetaflightAppUpdate,
    capacitor = Capacitor,
} = {}) {
    if (!isAndroidNative(capacitor)) {
        return { status: "not-android-native" };
    }

    const [appInfo, payload] = await Promise.all([plugin.getAppInfo(), buildApi.loadConfiguratorRelease("android")]);
    const currentVersionCode = positiveInteger(appInfo?.versionCode);
    const release = normalizeAndroidRelease(payload);

    if (!currentVersionCode) {
        throw new TypeError("Native Android app did not provide a valid versionCode");
    }

    if (!release) {
        throw new TypeError("Android update metadata is invalid");
    }

    return compareVersionCodes(currentVersionCode, release.versionCode) > 0
        ? { status: "update-available", appInfo, release }
        : { status: "up-to-date", appInfo, release };
}

export async function downloadAndInstallAndroidUpdate(release, { plugin = BetaflightAppUpdate, onProgress } = {}) {
    const normalizedRelease = normalizeAndroidRelease(release);
    if (!normalizedRelease) {
        throw new TypeError("Android update metadata is invalid");
    }

    const progressListener =
        typeof onProgress === "function" && typeof plugin.addListener === "function"
            ? await plugin.addListener("downloadProgress", onProgress)
            : null;

    try {
        return await plugin.downloadAndInstall({
            apkUrl: normalizedRelease.apkUrl,
            sha256: normalizedRelease.sha256,
            versionCode: normalizedRelease.versionCode,
        });
    } finally {
        await progressListener?.remove?.();
    }
}

export async function installDownloadedAndroidUpdate({ plugin = BetaflightAppUpdate } = {}) {
    return await plugin.installDownloaded();
}
