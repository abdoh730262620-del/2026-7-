import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const initPushNotifications = async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
        console.log('[Notifications] Running on web/browser mode.');
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            try {
                await Notification.requestPermission();
            } catch (e) {
                console.warn('[Notifications] Web notification permission error:', e);
            }
        }
        return true;
    }

    try {
        console.log('[Notifications] Initializing Local Notifications on native device...');

        // Check & request local notification permissions safely (without FCM / remote push registration crash)
        let status = await LocalNotifications.checkPermissions();
        if (status?.display === 'prompt') {
            status = await LocalNotifications.requestPermissions();
        }

        if (status?.display !== 'granted') {
            console.warn('[Notifications] Local notification permission not granted or denied.');
            return false;
        }

        // Register action listeners for local notifications
        try {
            await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
                console.log('[Notifications] User clicked local notification:', action.notification);
            });
        } catch (listenerErr) {
            console.warn('[Notifications] Listener setup warning:', listenerErr);
        }

        return true;
    } catch (error) {
        console.warn('[Notifications] Safe catch during notification initialization:', error);
        return false;
    }
};

/**
 * Schedule a local notification (e.g. sync completed, inventory alerts, updates)
 */
export const scheduleLocalNotification = async (title: string, body: string, extraData?: any) => {
    const id = Math.floor(Math.random() * 100000) + 1;

    if (Capacitor.isNativePlatform()) {
        try {
            const perm = await LocalNotifications.checkPermissions();
            if (perm?.display !== 'granted') {
                const req = await LocalNotifications.requestPermissions();
                if (req?.display !== 'granted') return;
            }

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
            console.warn('[Notifications] Native local notification schedule error:', err);
        }
    }

    // Web Fallback
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification(title, {
                body,
                icon: '/favicon.png',
                data: extraData
            });
        } catch (e) {
            console.warn('[Notifications] Web notification trigger error:', e);
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

