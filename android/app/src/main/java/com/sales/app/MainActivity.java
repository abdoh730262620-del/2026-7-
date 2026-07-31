package com.sales.app;

import android.os.Bundle;
import android.os.StrictMode;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "SalesAppNative";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Setup Native Global Uncaught Exception Handler to catch and log startup crashes
        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable throwable) {
                Log.e(TAG, "FATAL CRASH DETECTED ON THREAD: " + thread.getName(), throwable);
                if (defaultHandler != null) {
                    defaultHandler.uncaughtException(thread, throwable);
                }
            }
        });

        // Enable Advanced StrictMode to detect main thread disk/network blockages
        try {
            StrictMode.setThreadPolicy(new StrictMode.ThreadPolicy.Builder()
                    .detectAll()
                    .penaltyLog()
                    .build());

            StrictMode.setVmPolicy(new StrictMode.VmPolicy.Builder()
                    .detectLeakedSqlLiteObjects()
                    .detectLeakedClosableObjects()
                    .penaltyLog()
                    .build());

            Log.i(TAG, "Android StrictMode initialized successfully for main thread detection.");
        } catch (Exception e) {
            Log.w(TAG, "Could not initialize StrictMode: " + e.getMessage());
        }

        super.onCreate(savedInstanceState);
    }
}
