import { i18n } from "./localization.js";
import { gui_log } from "./gui_log.js";
import { pinia } from "./pinia_instance.js";
import { useDialogStore } from "../stores/dialog.js";
import {
    checkForAndroidAppUpdate,
    downloadAndInstallAndroidUpdate,
    installDownloadedAndroidUpdate,
    isAndroidNative,
} from "./AndroidAppUpdate.js";

let pendingInstallation = false;

function message(key, parameters) {
    return i18n.getMessage(key, parameters);
}

function showInfo(dialogStore, text) {
    dialogStore.open(
        "InformationDialog",
        {
            title: message("androidAppUpdateTitle"),
            text,
            confirmText: message("androidAppUpdateConfirm"),
        },
        { confirm: () => dialogStore.close() },
    );
}

function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) {
        return "";
    }

    if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function progressDialogProps(progress) {
    const phase = progress?.phase;
    const bytesDownloaded = Number(progress?.bytesDownloaded);
    const totalBytes = Number(progress?.totalBytes);
    const percentage = Number(progress?.percent);
    const hasTotal = Number.isFinite(totalBytes) && totalBytes > 0;
    const hasProgress = Number.isFinite(percentage) && percentage >= 0;
    const calculatedProgress =
        hasProgress || !hasTotal || !Number.isFinite(bytesDownloaded)
            ? percentage
            : (bytesDownloaded * 100) / totalBytes;

    if (phase === "verifying") {
        return {
            status: message("androidAppUpdateVerifying"),
            progress: 100,
            transfer: message("androidAppUpdateDownloaded"),
        };
    }

    if (phase === "installing") {
        return {
            status: message("androidAppUpdateStartingInstaller"),
            progress: 100,
            transfer: message("androidAppUpdateDownloaded"),
        };
    }

    return {
        status: message("androidAppUpdateDownloading"),
        progress: Number.isFinite(calculatedProgress) ? Math.min(Math.round(calculatedProgress), 100) : 0,
        transfer:
            hasTotal && Number.isFinite(bytesDownloaded)
                ? message("androidAppUpdateProgress", [
                    formatBytes(bytesDownloaded),
                    formatBytes(totalBytes),
                    `${Math.round(calculatedProgress)}%`,
                ])
                : message("androidAppUpdateProgressUnknown"),
    };
}

async function downloadAndInstall(release, dialogStore) {
    dialogStore.open("AndroidAppUpdateProgressDialog", {
        title: message("androidAppUpdateTitle"),
        status: message("androidAppUpdatePreparing"),
        progress: 0,
        transfer: message("androidAppUpdatePreparing"),
    });

    try {
        const result = await downloadAndInstallAndroidUpdate(release, {
            onProgress: (progress) => {
                if (dialogStore.activeDialog?.type === "AndroidAppUpdateProgressDialog") {
                    dialogStore.updateProps(progressDialogProps(progress));
                }
            },
        });
        dialogStore.close();

        if (result?.requiresInstallPermission) {
            pendingInstallation = true;
            showInfo(dialogStore, message("androidAppUpdateInstallPermission"));
        }
    } catch (error) {
        dialogStore.close();
        console.warn("Android app update failed", error);
        showInfo(dialogStore, message("androidAppUpdateDownloadFailed"));
    }
}

/**
 * Check and present Android APK updates. This is intentionally gated here as
 * well as in the low-level module so a browser can neither request metadata
 * nor render an update dialog.
 */
export async function checkAndPromptAndroidAppUpdate({ notifyUpToDate = false } = {}) {
    if (!isAndroidNative()) {
        return { status: "not-android-native" };
    }

    const dialogStore = useDialogStore(pinia);

    try {
        if (pendingInstallation) {
            const installResult = await installDownloadedAndroidUpdate();
            if (installResult?.requiresInstallPermission) {
                showInfo(dialogStore, message("androidAppUpdateInstallPermission"));
            } else {
                pendingInstallation = false;
            }
            return { status: "install-requested", result: installResult };
        }

        const result = await checkForAndroidAppUpdate();
        if (result.status === "up-to-date") {
            if (notifyUpToDate) {
                showInfo(dialogStore, message("androidAppUpdateUpToDate"));
            }
            return result;
        }

        if (result.status === "update-available") {
            dialogStore.open(
                "YesNoDialog",
                {
                    title: message("androidAppUpdateTitle"),
                    text: message("androidAppUpdateAvailable", [result.release.versionName]),
                    yesText: message("androidAppUpdateDownload"),
                    noText: message("androidAppUpdateLater"),
                },
                {
                    yes: () => {
                        dialogStore.close();
                        void downloadAndInstall(result.release, dialogStore);
                    },
                    no: () => dialogStore.close(),
                },
            );
        }

        return result;
    } catch (error) {
        gui_log(`Android app update check failed: ${error instanceof Error ? error.message : String(error)}`);
        console.warn("Android app update check failed", error);

        if (notifyUpToDate) {
            showInfo(dialogStore, message("androidAppUpdateCheckFailed"));
        }

        return { status: "check-failed", error };
    }
}
