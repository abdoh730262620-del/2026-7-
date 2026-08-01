import { Capacitor } from '@capacitor/core';
import { PushNotifications, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';

export const initPushNotifications = async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
        console.log('[PushNotifications] Running on web/browser mode.');
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            try {
                await Notification.requestPermission();
            } catch (e) {
                console.warn('[PushNotifications] Web notification permission error:', e);
            }
        }
        return true;
    }

    try {
        console.log('[PushNotifications] Checking Push Notifications support on native device...');

        // Safely attempt local notification setup first
        try {
            await LocalNotifications.requestPermissions();
        } catch (localErr) {
            console.warn('[PushNotifications] Local notification permission request failed:', localErr);
        }

        // Check/request permissions with extra defensive handling for APKs without FCM
        let permStatus;
        try {
            permStatus = await PushNotifications.checkPermissions();
            if (permStatus?.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }
        } catch (permErr) {
            console.warn('[PushNotifications] PushNotifications.checkPermissions failed:', permErr);
            return false;
        }

        if (permStatus?.receive !== 'granted') {
            console.warn('[PushNotifications] Push notification permissions not granted.');
            return false;
        }

        // Add listeners before registration
        try {
            PushNotifications.addListener('registration', (token) => {
                console.log('[PushNotifications] FCM/Device Token:', token.value);
                try {
                    localStorage.setItem('fcm_token', token.value);
                } catch (e) {}
            });

            PushNotifications.addListener('registrationError', (error) => {
                console.warn('[PushNotifications] Registration error:', error.error);
            });

            PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
                console.log('[PushNotifications] Received in foreground:', notification);
                scheduleLocalNotification(
                    notification.title || 'تنبيه جديد',
                    notification.body || '',
                    notification.data
                );
            });

            PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
                console.log('[PushNotifications] Action performed:', notification.actionId, notification.notification);
            });
        } catch (listenerErr) {
            console.warn('[PushNotifications] Failed to attach push listeners:', listenerErr);
        }

        // Register with Apple / Google FCM safely
        try {
            await PushNotifications.register();
        } catch (regErr) {
            console.warn('[PushNotifications] PushNotifications.register failed (likely missing google-services.json or FCM config in APK):', regErr);
        }

        return true;
    } catch (error) {
        console.warn('[PushNotifications] Safe catch during push initialization:', error);
        return false;
    }
};

/**
 * Schedule a local notification (e.g. sync completed, inventory alerts, updates)
 */
export const scheduleLocalNotification = async (title: string, body: string, extraData?: any) => {
    const id = Math.floor(Math.random() * 100000);

    if (Capacitor.isNativePlatform()) {
        try {
            await LocalNotifications.schedule({
                notifications: [
                    {
                        title: title,
                        body: body,
                        id: id,
                        schedule: { at: new Date(Date.now() + 100) },
                        sound: 'default',
                        smallIcon: 'ic_launcher',
                        extra: extraData || {}
                    }
                ]
            });
            return;
        } catch (err) {
            console.warn('[PushNotifications] Native local notification error:', err);
        }
    }

    // Web Fallback
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, {
                body,
                icon: '/favicon.png',
                data: extraData
            });
        } catch (e) {
            console.warn('[PushNotifications] Web notification trigger error:', e);
        }
    }
};

/**
 * Notify user when sync completes
 */
export const notifySyncComplete = async (customMessage?: string) => {
    const title = '🔄 اكتملت المزامنة السحابية';
    const body = customMessage || 'تم تحديث كافة بيانات المحل والمخزون والفواتير بالسحابة بنجاح.';
    await scheduleLocalNotification(title, body, { type: 'SYNC_COMPLETE' });
};

/**
 * Notify user for important system updates
 */
export const notifyImportantUpdate = async (title: string, body: string, updateUrl?: string) => {
    const notificationTitle = title.startsWith('📢') ? title : `📢 ${title}`;
    await scheduleLocalNotification(notificationTitle, body, { type: 'IMPORTANT_UPDATE', url: updateUrl });
};
