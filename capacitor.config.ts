import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sales.app',
  appName: 'نظام مبيعات السعيدة المتكامل',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#0F172A",
      androidSplashResourceName: "splash",
      showSpinner: false
    }
  }
};

export default config;
