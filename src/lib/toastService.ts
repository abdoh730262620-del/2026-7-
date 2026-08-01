import { Toast } from '@capacitor/toast';
import { Capacitor } from '@capacitor/core';

export interface ToastOptions {
  text: string;
  duration?: 'short' | 'long' | number;
  type?: 'welcome' | 'info' | 'success' | 'warning';
}

type ToastListener = (toast: ToastOptions) => void;
const listeners: Set<ToastListener> = new Set();

export const subscribeToCenterToast = (listener: ToastListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Display a toast message in the exact center of the screen.
 * Fully compatible with Capacitor Native Toast and Web fallback.
 */
export const showCenterToast = async (text: string, duration: 'short' | 'long' | number = 'long') => {
  // 1. Trigger Capacitor Native Toast if running natively
  if (Capacitor.isNativePlatform()) {
    try {
      await Toast.show({
        text,
        duration: typeof duration === 'number' ? (duration > 2000 ? 'long' : 'short') : duration,
        position: 'center',
      });
    } catch (err) {
      console.warn('[ToastService] Native Capacitor Toast fallback:', err);
    }
  }

  // 2. Always dispatch event for React UI overlay in center screen
  listeners.forEach((listener) => {
    listener({
      text,
      duration,
      type: 'welcome',
    });
  });
};

/**
 * Specifically welcome the user on app startup in the center of the screen
 */
export const showWelcomeToast = (userName?: string) => {
  const greeting = userName ? `أهلاً بك 👋 ${userName}` : 'أهلاً بك في نظام مبيعات السعيدة المتكامل 👋';
  const fullText = `${greeting} - نتمنى لك يوماً سعيداً!`;
  showCenterToast(fullText, 'long');
};
