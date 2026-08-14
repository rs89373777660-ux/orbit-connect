package ru.orbitmarketing.connect;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhoneContactsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
