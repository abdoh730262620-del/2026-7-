package com.sales.app;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Safe global exception logger for background threads
        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            Log.e("SalesAppNative", "Uncaught native exception in thread: " + thread.getName(), throwable);
            if (defaultHandler != null && !thread.getName().equals("main")) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });

        try {
            super.onCreate(savedInstanceState);
        } catch (Throwable t) {
            Log.e("SalesAppNative", "Error during MainActivity onCreate execution", t);
        }
    }
}


