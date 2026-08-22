package ru.orbitmarketing.connect;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String SITE = "https://tvoy-krug-messenger.rs89373777660.chatgpt.site";
    private final Handler startupHandler = new Handler(Looper.getMainLooper());
    private volatile String startupApkUrl = SITE + "/orbit-connect-v8.apk";
    private volatile boolean recoveryVisible = false;
    private volatile boolean mainPageLoaded = false;
    private int mainFrameRetries = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhoneContactsPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge != null) bridge.getWebView().setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    int code = error.getErrorCode();
                    String failedUrl = request.getUrl() == null ? "" : request.getUrl().toString();
                    if (mainFrameRetries++ == 0) {
                        view.clearCache(true);
                        startupHandler.postDelayed(() -> view.loadUrl(SITE + "/?native_retry=" + System.currentTimeMillis()), 700);
                    } else {
                        showNativeNetworkError(view, code, String.valueOf(error.getDescription()), failedUrl);
                    }
                    return;
                }
                super.onReceivedError(view, request, error);
            }
        });
        if (bridge != null) bridge.addWebViewListener(new WebViewListener() {
            @Override public void onReceivedError(WebView webView) {
                // This callback also fires for failed images and API requests.
                // A secondary-resource error must not hide a working messenger.
            }
            @Override public void onPageLoaded(WebView webView) {
                mainPageLoaded = true;
                startupHandler.removeCallbacks(MainActivity.this::verifyWebAppReady);
            }
        });
        checkStartupUpdate();
        startupHandler.postDelayed(this::verifyWebAppReady, 30000);
    }

    private void showNativeNetworkError(WebView webView, int code, String description, String failedUrl) {
        String safeDescription = TextUtils.htmlEncode(description == null ? "Неизвестная ошибка" : description);
        String safeUrl = TextUtils.htmlEncode(failedUrl == null ? "" : failedUrl);
        String html = "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>" +
            "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070b08;color:#f4f1e8;font-family:sans-serif;padding:24px;box-sizing:border-box}" +
            "main{max-width:520px}i{display:block;width:58px;height:58px;border:3px solid #cfff3c;border-radius:50%;box-shadow:0 0 32px #cfff3c55}" +
            "h1{font:700 42px Georgia,serif;margin:24px 0 12px}p{color:#a6ae9f;line-height:1.5;word-break:break-word}.code{color:#cfff3c;font-weight:800}" +
            "button{width:100%;border:0;border-radius:28px;padding:17px;background:#cfff3c;color:#07100b;font-weight:900;font-size:16px;margin-top:20px}</style></head>" +
            "<body><main><i></i><h1>Не удалось открыть Orbit</h1><p>Android сообщил: <span class='code'>" + safeDescription + " (код " + code + ")</span></p>" +
            "<p>Адрес: " + safeUrl + "</p><button onclick=\"location.href='" + SITE + "/?manual_retry='+Date.now()\">Повторить подключение</button></main></body></html>";
        webView.loadDataWithBaseURL(SITE, html, "text/html", "UTF-8", null);
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
        if (mainPageLoaded) return;
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) { showRecovery(false); return; }
        webView.evaluateJavascript("Boolean(document.body && (document.body.children.length || document.readyState === 'complete'))", value -> {
            if ("true".equals(value)) mainPageLoaded = true;
            else showRecovery(false);
        });
    }

    private void showRecovery(boolean updateAvailable) {
        if (isFinishing() || recoveryVisible) return;
        recoveryVisible = true;
        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle(updateAvailable ? "Доступно обновление Orbit" : "Orbit загружается дольше обычного")
            .setMessage(updateAvailable ? "Установите свежую версию до запуска мессенджера." : "Сервер не загрузился. Проверьте интернет, отключите VPN при необходимости и повторите подключение.")
            .setPositiveButton("Обновить приложение", (value, which) -> downloadAndInstall())
            .setNegativeButton("Повторить загрузку", (value, which) -> {
                WebView webView = bridge == null ? null : bridge.getWebView();
                mainPageLoaded = false;
                if (webView != null) {
                    webView.clearCache(true);
                    webView.loadUrl(SITE + "/?app_retry=" + System.currentTimeMillis());
                    startupHandler.postDelayed(MainActivity.this::verifyWebAppReady, 30000);
                }
            })
            .setOnDismissListener(value -> recoveryVisible = false)
            .create();
        dialog.setCanceledOnTouchOutside(false);
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
