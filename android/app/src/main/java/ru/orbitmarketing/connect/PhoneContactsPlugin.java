package ru.orbitmarketing.connect;

import android.Manifest;
import android.content.Intent;
import android.app.PendingIntent;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.database.Cursor;
import android.provider.ContactsContract;
import androidx.core.content.FileProvider;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "PhoneContacts", permissions = {
    @Permission(alias = "contacts", strings = {Manifest.permission.READ_CONTACTS}),
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class PhoneContactsPlugin extends Plugin {
    @PluginMethod
    public void shareText(PluginCall call) {
        String text = call.getString("text", "");
        String title = call.getString("title", "Orbit Connect");
        if (text.isEmpty()) {
            call.reject("Нет текста для отправки");
            return;
        }
        Intent sendIntent = new Intent(Intent.ACTION_SEND);
        sendIntent.setType("text/plain");
        sendIntent.putExtra(Intent.EXTRA_TEXT, text);
        Intent chooser = Intent.createChooser(sendIntent, title);
        getActivity().startActivity(chooser);
        call.resolve();
    }

    private JSObject notificationIntent(Intent intent) {
        JSObject result = new JSObject();
        if (intent != null && "orbit.openChat".equals(intent.getAction())) {
            result.put("action", "openChat");
            result.put("chatId", intent.getStringExtra("chatId"));
            intent.setAction(null);
        }
        return result;
    }

    @PluginMethod
    public void getLaunchAction(PluginCall call) {
        call.resolve(notificationIntent(getActivity().getIntent()));
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSObject data = notificationIntent(intent);
        if (data.has("chatId")) notifyListeners("notificationAction", data, true);
    }

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            android.content.pm.PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionName", info.versionName);
            result.put("versionCode", Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Не удалось определить версию приложения", error);
        }
    }

    @PluginMethod
    public void installUpdate(PluginCall call) {
        String source = call.getString("url", "");
        if (!source.startsWith("https://tvoy-krug-messenger.rs89373777660.chatgpt.site/")) {
            call.reject("Недопустимый адрес обновления");
            return;
        }
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(source).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(60000);
                connection.setInstanceFollowRedirects(true);
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new Exception("HTTP " + connection.getResponseCode());
                int length = connection.getContentLength();
                if (length > 150 * 1024 * 1024) throw new Exception("Файл слишком большой");
                File apk = new File(getContext().getCacheDir(), "orbit-connect-update.apk");
                int total = 0;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(apk)) {
                    byte[] buffer = new byte[16 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        total += read;
                        if (total > 150 * 1024 * 1024) throw new Exception("Файл слишком большой");
                        output.write(buffer, 0, read);
                    }
                }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().runOnUiThread(() -> {
                    getContext().startActivity(intent);
                    JSObject result = new JSObject();
                    result.put("downloaded", true);
                    call.resolve(result);
                });
            } catch (Exception error) {
                call.reject("Не удалось скачать обновление", error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void getContacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "contactsPermissionCallback");
            return;
        }
        readContacts(call);
    }

    @PermissionCallback
    private void contactsPermissionCallback(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) readContacts(call);
        else call.reject("Доступ к контактам не предоставлен");
    }

    private void readContacts(PluginCall call) {
        JSArray contacts = new JSArray();
        String[] projection = {ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER};
        try (Cursor cursor = getContext().getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, projection, null, null, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC")) {
            if (cursor != null) {
                int nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int phoneIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                int count = 0;
                while (cursor.moveToNext() && count < 3000) {
                    String phone = cursor.getString(phoneIndex);
                    if (phone == null || phone.trim().isEmpty()) continue;
                    JSObject contact = new JSObject();
                    contact.put("name", cursor.getString(nameIndex));
                    contact.put("phone", phone);
                    contacts.put(contact);
                    count++;
                }
            }
            JSObject result = new JSObject();
            result.put("contacts", contacts);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Не удалось прочитать контакты", error);
        }
    }

    @PluginMethod
    public void showNotification(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }
        displayNotification(call);
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        if (getPermissionState("notifications") == PermissionState.GRANTED) displayNotification(call);
        else call.reject("Уведомления не разрешены");
    }

    private void displayNotification(PluginCall call) {
        String channelId = "orbit_messages_plum_v1";
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        Uri sound = Uri.parse("android.resource://" + getContext().getPackageName() + "/" + R.raw.orbit_plum);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(channelId, "Сообщения Orbit Connect", NotificationManager.IMPORTANCE_HIGH);
            channel.setSound(sound, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            manager.createNotificationChannel(channel);
        }
        String title = call.getString("title", "Orbit Connect");
        String body = call.getString("body", "Новое событие");
        String chatId = call.getString("chatId", "");
        String token = call.getString("token", "");
        int notificationId = (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
        Intent openIntent = new Intent(getContext(), MainActivity.class).setAction("orbit.openChat").putExtra("chatId", chatId).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending = PendingIntent.getActivity(getContext(), notificationId, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent readIntent = new Intent(getContext(), NotificationActionReceiver.class).setAction("orbit.markRead").putExtra("chatId", chatId).putExtra("token", token).putExtra("notificationId", notificationId);
        PendingIntent readPending = PendingIntent.getBroadcast(getContext(), notificationId + 1, readIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), channelId).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body).setSound(sound).setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_HIGH).setContentIntent(openPending);
        if (!chatId.isEmpty()) builder.addAction(android.R.drawable.ic_menu_view, "Открыть чат", openPending).addAction(android.R.drawable.checkbox_on_background, "Прочитано", readPending);
        manager.notify(notificationId, builder.build());
        call.resolve();
    }
}
