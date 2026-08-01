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
            // Safe fallback if splash screen API initialization fails
        }
        super.onCreate(savedInstanceState);
    }
}
