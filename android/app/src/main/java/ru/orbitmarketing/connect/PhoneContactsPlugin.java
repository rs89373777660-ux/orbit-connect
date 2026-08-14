package ru.orbitmarketing.connect;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.database.Cursor;
import android.provider.ContactsContract;
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

@CapacitorPlugin(name = "PhoneContacts", permissions = {
    @Permission(alias = "contacts", strings = {Manifest.permission.READ_CONTACTS}),
    @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class PhoneContactsPlugin extends Plugin {
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
        String channelId = "orbit_contacts";
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) manager.createNotificationChannel(new NotificationChannel(channelId, "Orbit Connect", NotificationManager.IMPORTANCE_DEFAULT));
        String title = call.getString("title", "Orbit Connect");
        String body = call.getString("body", "Новое событие");
        manager.notify((int) (System.currentTimeMillis() % Integer.MAX_VALUE), new NotificationCompat.Builder(getContext(), channelId).setSmallIcon(R.mipmap.ic_launcher).setContentTitle(title).setContentText(body).setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_DEFAULT).build());
        call.resolve();
    }
}
