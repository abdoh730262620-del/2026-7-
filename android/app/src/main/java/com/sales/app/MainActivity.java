package com.sales.app;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        try {
            SplashScreen.installSplashScreen(this);
        } catch (Throwable t) {
            // Prevent OEM / API-level splash screen crash on startup
        }
        super.onCreate(savedInstanceState);
    }
}

