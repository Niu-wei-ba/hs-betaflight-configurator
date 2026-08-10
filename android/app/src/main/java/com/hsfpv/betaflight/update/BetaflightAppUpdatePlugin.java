package com.hsfpv.betaflight.update;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

import javax.net.ssl.HttpsURLConnection;

@CapacitorPlugin(name = "BetaflightAppUpdate")
public class BetaflightAppUpdatePlugin extends Plugin {
    private static final String TAG = "BetaflightAppUpdate";
    private static final String APK_FILE_NAME = "update.apk";
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            PackageInfo packageInfo = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? packageInfo.getLongVersionCode()
                : packageInfo.versionCode;

            JSObject result = new JSObject();
            result.put("versionCode", versionCode);
            result.put("versionName", packageInfo.versionName == null ? "" : packageInfo.versionName);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Could not determine the installed app version", exception);
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String apkUrl = call.getString("apkUrl");
        final String expectedSha256 = call.getString("sha256");

        if (!isHttpsUrl(apkUrl) || !isSha256(expectedSha256)) {
            call.reject("Invalid Android update metadata");
            return;
        }

        new Thread(() -> {
            try {
                File apkFile = downloadAndVerify(apkUrl, expectedSha256);
                JSObject result = requestPackageInstall(apkFile);
                call.resolve(result);
            } catch (Exception exception) {
                Log.w(TAG, "Failed to download or install Android update", exception);
                call.reject("Could not download or verify Android update", exception);
            }
        }, "betaflight-app-update").start();
    }

    @PluginMethod
    public void installDownloaded(PluginCall call) {
        File apkFile = getUpdateFile();
        if (!apkFile.isFile()) {
            call.reject("No verified Android update is available");
            return;
        }

        try {
            call.resolve(requestPackageInstall(apkFile));
        } catch (Exception exception) {
            call.reject("Could not start Android package installer", exception);
        }
    }

    private boolean isHttpsUrl(String value) {
        try {
            return value != null && "https".equalsIgnoreCase(new URL(value).getProtocol());
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isSha256(String value) {
        return value != null && value.matches("(?i)^[a-f0-9]{64}$");
    }

    private File getUpdateFile() {
        File directory = new File(getContext().getCacheDir(), "app-update");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Could not create update cache directory");
        }
        return new File(directory, APK_FILE_NAME);
    }

    private File downloadAndVerify(String urlValue, String expectedSha256) throws Exception {
        File apkFile = getUpdateFile();
        File temporaryFile = new File(apkFile.getParentFile(), APK_FILE_NAME + ".part");
        if (temporaryFile.exists() && !temporaryFile.delete()) {
            throw new IllegalStateException("Could not remove stale update download");
        }

        URL url = new URL(urlValue);
        HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestProperty("Accept", "application/vnd.android.package-archive");

        try {
            int responseCode = connection.getResponseCode();
            if (responseCode != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("APK download returned HTTP " + responseCode);
            }

            long totalBytes = connection.getContentLengthLong();
            long bytesDownloaded = 0;
            int lastProgress = -1;
            emitDownloadProgress("downloading", bytesDownloaded, totalBytes);

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[32 * 1024];
            int read;

            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(temporaryFile)) {
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    bytesDownloaded += read;

                    int progress = percent(bytesDownloaded, totalBytes);
                    if (progress >= 0 && progress != lastProgress) {
                        lastProgress = progress;
                        emitDownloadProgress("downloading", bytesDownloaded, totalBytes);
                    }
                }
                output.getFD().sync();
            }

            emitDownloadProgress("verifying", bytesDownloaded, totalBytes);
            String actualSha256 = hex(digest.digest());
            if (!actualSha256.equalsIgnoreCase(expectedSha256)) {
                temporaryFile.delete();
                throw new IllegalStateException("APK SHA-256 does not match release metadata");
            }

            if (apkFile.exists() && !apkFile.delete()) {
                throw new IllegalStateException("Could not replace previous update package");
            }
            if (!temporaryFile.renameTo(apkFile)) {
                throw new IllegalStateException("Could not finalize update package");
            }
            emitDownloadProgress("installing", bytesDownloaded, totalBytes);
            return apkFile;
        } finally {
            connection.disconnect();
        }
    }

    private int percent(long bytesDownloaded, long totalBytes) {
        if (totalBytes <= 0) {
            return -1;
        }
        return (int) Math.min(100, Math.round(bytesDownloaded * 100d / totalBytes));
    }

    private void emitDownloadProgress(String phase, long bytesDownloaded, long totalBytes) {
        JSObject progress = new JSObject();
        progress.put("phase", phase);
        progress.put("bytesDownloaded", bytesDownloaded);
        progress.put("totalBytes", totalBytes);
        progress.put("percent", percent(bytesDownloaded, totalBytes));
        notifyListeners("downloadProgress", progress);
    }

    private JSObject requestPackageInstall(File apkFile) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            settingsIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settingsIntent);
            result.put("requiresInstallPermission", true);
            return result;
        }

        Uri apkUri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apkFile
        );
        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(installIntent);
        result.put("installationStarted", true);
        return result;
    }

    private String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder(bytes.length * 2);
        for (byte item : bytes) {
            value.append(String.format(Locale.US, "%02x", item));
        }
        return value.toString();
    }
}
