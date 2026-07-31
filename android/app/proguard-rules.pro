# Project specific ProGuard rules for Sales Management Application

# Preserve Line Numbers and Attributes for Debugging Stack Traces
-keepattributes SourceFile,LineNumberTable,Exceptions,InnerClasses,Signature,*Annotation*,EnclosingMethod

# Capacitor Core & Plugin Rules (Prevents startup crash caused by stripping plugin methods)
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public void *(com.getcapacitor.PluginCall);
}
-keep class @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# Preserve WebView Javascript Interfaces
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Firebase & Google Play Services Rules
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Keep Serializable Objects & Models
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Android Native UI & Support Classes
-keep class androidx.core.app.CoreComponentFactory { *; }
-keep class androidx.appcompat.app.** { *; }
