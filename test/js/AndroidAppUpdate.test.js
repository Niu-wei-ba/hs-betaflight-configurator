import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
    Capacitor: {
        isNativePlatform: () => false,
        getPlatform: () => "web",
    },
    registerPlugin: vi.fn(() => ({})),
}));

vi.mock("../../src/js/BuildApi.js", () => ({ default: class BuildApi {} }));

import {
    checkForAndroidAppUpdate,
    compareVersionCodes,
    downloadAndInstallAndroidUpdate,
    installDownloadedAndroidUpdate,
    isAndroidNative,
    normalizeAndroidRelease,
    resolveAndroidAppUpdateApiBaseUrl,
} from "../../src/js/AndroidAppUpdate.js";

const ANDROID_CAPACITOR = {
    isNativePlatform: () => true,
    getPlatform: () => "android",
};

const RELEASE = {
    versionCode: 42,
    versionName: "2026.6.2",
    apkUrl: "https://downloads.example.com/betaflight.apk",
    sha256: "a".repeat(64),
};

describe("Android APK update guard", () => {
    it("is limited to the Android native Capacitor shell", () => {
        expect(isAndroidNative(ANDROID_CAPACITOR)).toBe(true);
        expect(isAndroidNative({ isNativePlatform: () => true, getPlatform: () => "ios" })).toBe(false);
        expect(isAndroidNative({ isNativePlatform: () => false, getPlatform: () => "android" })).toBe(false);
    });

    it("uses the app update API origin instead of the browser or official build host", () => {
        expect(resolveAndroidAppUpdateApiBaseUrl({})).toBe("https://bf.hs-fpv.com");
        expect(resolveAndroidAppUpdateApiBaseUrl({ VITE_BUILD_API_BASE_URL: "https://mirror.example.test/" })).toBe(
            "https://mirror.example.test",
        );
        expect(
            resolveAndroidAppUpdateApiBaseUrl({ VITE_ANDROID_APP_UPDATE_API_BASE_URL: "http://invalid.example.test" }),
        ).toBe("https://bf.hs-fpv.com");
    });

    it("rejects unsigned-looking or insecure update metadata", () => {
        expect(normalizeAndroidRelease({ ...RELEASE, apkUrl: "http://downloads.example.com/update.apk" })).toBeNull();
        expect(normalizeAndroidRelease({ ...RELEASE, sha256: "not-a-sha256" })).toBeNull();
        expect(normalizeAndroidRelease({ ...RELEASE, versionCode: 0 })).toBeNull();
    });

    it("does not call the update service from the browser", async () => {
        const buildApi = { loadConfiguratorRelease: vi.fn() };
        const plugin = { getAppInfo: vi.fn() };

        await expect(checkForAndroidAppUpdate({ buildApi, plugin })).resolves.toEqual({ status: "not-android-native" });
        expect(buildApi.loadConfiguratorRelease).not.toHaveBeenCalled();
        expect(plugin.getAppInfo).not.toHaveBeenCalled();
    });
});

describe("Android APK update checks", () => {
    it("finds a newer Android versionCode", async () => {
        const buildApi = { loadConfiguratorRelease: vi.fn().mockResolvedValue(RELEASE) };
        const plugin = { getAppInfo: vi.fn().mockResolvedValue({ versionCode: 41, versionName: "2026.6.1" }) };

        await expect(
            checkForAndroidAppUpdate({ buildApi, plugin, capacitor: ANDROID_CAPACITOR }),
        ).resolves.toMatchObject({
            status: "update-available",
            appInfo: { versionCode: 41, versionName: "2026.6.1" },
            release: { ...RELEASE },
        });
        expect(buildApi.loadConfiguratorRelease).toHaveBeenCalledWith("android");
    });

    it("does not offer an equal or older Android versionCode", async () => {
        const buildApi = { loadConfiguratorRelease: vi.fn().mockResolvedValue(RELEASE) };
        const plugin = { getAppInfo: vi.fn().mockResolvedValue({ versionCode: 42 }) };

        await expect(
            checkForAndroidAppUpdate({ buildApi, plugin, capacitor: ANDROID_CAPACITOR }),
        ).resolves.toMatchObject({
            status: "up-to-date",
        });
        expect(compareVersionCodes(42, 42)).toBe(0);
        expect(compareVersionCodes(43, 42)).toBe(-1);
    });

    it("passes only validated release fields to the native installer", async () => {
        const progressListener = { remove: vi.fn().mockResolvedValue(undefined) };
        const onProgress = vi.fn();
        const plugin = {
            addListener: vi.fn().mockImplementation(async (_eventName, listener) => {
                listener({ phase: "downloading", percent: 50 });
                return progressListener;
            }),
            downloadAndInstall: vi.fn().mockResolvedValue({ installationStarted: true }),
        };

        await expect(downloadAndInstallAndroidUpdate(RELEASE, { plugin, onProgress })).resolves.toEqual({
            installationStarted: true,
        });
        expect(plugin.addListener).toHaveBeenCalledWith("downloadProgress", onProgress);
        expect(plugin.downloadAndInstall).toHaveBeenCalledWith({
            apkUrl: RELEASE.apkUrl,
            sha256: RELEASE.sha256,
            versionCode: RELEASE.versionCode,
        });
        expect(onProgress).toHaveBeenCalledWith({ phase: "downloading", percent: 50 });
        expect(progressListener.remove).toHaveBeenCalledOnce();
        await expect(downloadAndInstallAndroidUpdate({ ...RELEASE, sha256: "bad" }, { plugin })).rejects.toThrow(
            "metadata",
        );
    });

    it("removes the progress listener when the native download fails", async () => {
        const progressListener = { remove: vi.fn().mockResolvedValue(undefined) };
        const plugin = {
            addListener: vi.fn().mockResolvedValue(progressListener),
            downloadAndInstall: vi.fn().mockRejectedValue(new Error("download failed")),
        };

        await expect(downloadAndInstallAndroidUpdate(RELEASE, { plugin, onProgress: vi.fn() })).rejects.toThrow(
            "download failed",
        );
        expect(progressListener.remove).toHaveBeenCalledOnce();
    });

    it("can continue installing an APK after Android grants source permission", async () => {
        const plugin = { installDownloaded: vi.fn().mockResolvedValue({ installationStarted: true }) };

        await expect(installDownloadedAndroidUpdate({ plugin })).resolves.toEqual({ installationStarted: true });
        expect(plugin.installDownloaded).toHaveBeenCalledOnce();
    });
});
