import { Capacitor } from '@capacitor/core';
import { PushNotifications, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';

export const initPushNotifications = async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
        console.log('[PushNotifications] Running on web/browser mode.');
        if ('Notification' in window && Notification.permission === 'default') {
            try {
                await Notification.requestPermission();
            } catch (e) {
                console.warn('[PushNotifications] Web notification permission error:', e);
            }
        }
        return true;
    }

    try {
        console.log('[PushNotifications] Initializing Push Notifications on native device...');

        // Check/request permissions
        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.warn('[PushNotifications] User denied push notification permissions.');
            return false;
        }

        // Register with Apple / Google FCM
        await PushNotifications.register();

        // Listen for registration success
        PushNotifications.addListener('registration', (token) => {
            console.log('[PushNotifications] FCM/Device Token:', token.value);
            localStorage.setItem('fcm_token', token.value);
        });

        // Listen for registration error
        PushNotifications.addListener('registrationError', (error) => {
            console.warn('[PushNotifications] Registration error:', error.error);
        });

        // Listen for foreground notification received
        PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
            console.log('[PushNotifications] Received in foreground:', notification);
            // Optionally trigger local alert if app is open
            scheduleLocalNotification(
                notification.title || 'تنبيه جديد',
                notification.body || '',
                notification.data
            );
        });

        // Listen for notification tap action
        PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
            console.log('[PushNotifications] Action performed:', notification.actionId, notification.notification);
        });

        // Also request local notification permissions for sync/local alerts
        if (Capacitor.isNativePlatform()) {
            await LocalNotifications.requestPermissions();
        }

        return true;
    } catch (error) {
        console.error('[PushNotifications] Error during push initialization:', error);
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
