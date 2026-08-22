package ru.orbitmarketing.connect;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class NotificationActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!"orbit.markRead".equals(intent.getAction())) return;
        String chatId = intent.getStringExtra("chatId");
        String token = intent.getStringExtra("token");
        int notificationId = intent.getIntExtra("notificationId", 0);
        if (notificationId != 0) context.getSystemService(NotificationManager.class).cancel(notificationId);
        if (chatId == null || token == null || token.isEmpty()) return;
        PendingResult pending = goAsync();
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL("https://tvoy-krug-messenger.rs89373777660.chatgpt.site/api/messages").openConnection();
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Authorization", "Bearer " + token);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setDoOutput(true);
                byte[] body = ("{\"action\":\"mark-chat-read\",\"chatId\":\"" + chatId.replace("\\", "\\\\").replace("\"", "\\\"") + "\"}").getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) { output.write(body); }
                connection.getResponseCode();
            } catch (Exception ignored) {
            } finally {
                if (connection != null) connection.disconnect();
                pending.finish();
            }
        }).start();
    }
}
