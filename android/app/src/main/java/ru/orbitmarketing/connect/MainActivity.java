package ru.orbitmarketing.connect;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String SITE = "https://tvoy-krug-messenger.rs89373777660.chatgpt.site";
    private final Handler startupHandler = new Handler(Looper.getMainLooper());
    private volatile String startupApkUrl = SITE + "/orbit-connect-v5.apk";
    private volatile boolean recoveryVisible = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhoneContactsPlugin.class);
        super.onCreate(savedInstanceState);
        checkStartupUpdate();
        startupHandler.postDelayed(this::verifyWebAppReady, 15000);
    }

    private void checkStartupUpdate() {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(SITE + "/api/version?current=android-startup&t=" + System.currentTimeMillis()).openConnection();
                connection.setConnectTimeout(7000);
                connection.setReadTimeout(7000);
                connection.setUseCaches(false);
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return;
                StringBuilder json = new StringBuilder();
                try (InputStream input = connection.getInputStream()) {
                    byte[] buffer = new byte[4096]; int read;
                    while ((read = input.read(buffer)) != -1) json.append(new String(buffer, 0, read, java.nio.charset.StandardCharsets.UTF_8));
                }
                JSONObject apk = new JSONObject(json.toString()).getJSONObject("apk");
                startupApkUrl = new URL(new URL(SITE), apk.getString("url")).toString();
                String installed = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
                if (compareVersions(installed, apk.getString("version")) < 0) runOnUiThread(() -> showRecovery(true));
            } catch (Exception ignored) {
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private int compareVersions(String left, String right) {
        String[] a = left.split("\\."), b = right.split("\\.");
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            int av = i < a.length ? Integer.parseInt(a[i]) : 0;
            int bv = i < b.length ? Integer.parseInt(b[i]) : 0;
            if (av != bv) return Integer.compare(av, bv);
        }
        return 0;
    }

    private void verifyWebAppReady() {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) { showRecovery(false); return; }
        webView.evaluateJavascript("Boolean(document.querySelector('.orbit-v4,.registration-screen,.orbit-auth'))", value -> {
            if (!"true".equals(value)) showRecovery(false);
        });
    }

    private void showRecovery(boolean updateAvailable) {
        if (isFinishing() || recoveryVisible) return;
        recoveryVisible = true;
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle(updateAvailable ? "Доступно обновление Orbit" : "Orbit загружается дольше обычного")
            .setMessage(updateAvailable ? "Установите свежую версию до запуска мессенджера." : "Можно повторить загрузку или переустановить актуальную версию приложения.")
            .setPositiveButton("Обновить приложение", (value, which) -> downloadAndInstall())
            .setNegativeButton("Повторить загрузку", (value, which) -> {
                WebView webView = bridge == null ? null : bridge.getWebView();
                if (webView != null) webView.reload();
            })
            .setOnDismissListener(value -> recoveryVisible = false)
            .create();
        dialog.show();
    }

    private void downloadAndInstall() {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(startupApkUrl).openConnection();
                connection.setConnectTimeout(15000); connection.setReadTimeout(60000); connection.setInstanceFollowRedirects(true);
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new Exception("HTTP " + connection.getResponseCode());
                File apk = new File(getCacheDir(), "orbit-startup-update.apk");
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[16384]; int read, total = 0;
                    while ((read = input.read(buffer)) != -1) { total += read; if (total > 150 * 1024 * 1024) throw new Exception("APK too large"); output.write(buffer, 0, read); }
                }
                Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                runOnUiThread(() -> startActivity(intent));
            } catch (Exception error) {
                runOnUiThread(() -> new AlertDialog.Builder(this).setTitle("Не удалось обновить").setMessage("Проверьте интернет и повторите попытку.").setPositiveButton("Понятно", null).show());
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    @Override
    public void onBackPressed() {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView != null) webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('orbit:back'))", null);
        else super.onBackPressed();
    }
}
