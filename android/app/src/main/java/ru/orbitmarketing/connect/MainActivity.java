package ru.orbitmarketing.connect;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhoneContactsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onBackPressed() {
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView != null) webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('orbit:back'))", null);
        else super.onBackPressed();
    }
}
