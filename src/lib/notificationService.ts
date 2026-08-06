import { collection, doc, writeBatch, addDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface InvoiceNotificationData {
    tenantId: string;
    invoiceType: 'sale' | 'purchase' | 'card_sale' | 'card_purchase' | 'voucher';
    invoiceNumber: string | number;
    invoiceId?: string;
    amount: number;
    createdById: string;
    createdByName: string;
    createdByRole: string;
    title?: string;
    body?: string;
}

/**
 * Creates a notification document in Firestore destined specifically for manager/admin role.
 */
export async function createManagerInvoiceNotification(
    data: InvoiceNotificationData,
    batch?: any
) {
    const now = Date.now();
    const defaultTitle = `🧾 فاتورة جديدة #${data.invoiceNumber}`;
    const typeLabel = 
        data.invoiceType === 'sale' ? 'مبيعات' :
        data.invoiceType === 'purchase' ? 'مشتريات' :
        data.invoiceType === 'card_sale' ? 'كروت شبكة' :
        data.invoiceType === 'card_purchase' ? 'شراء كروت' : 'سند';

    const defaultBody = `قام المستخدم (${data.createdByName}) بإنشاء فاتورة ${typeLabel} بمبلغ ${Number(data.amount || 0).toLocaleString('ar-SA')} ر.س`;

    const notificationDoc = {
        tenantId: data.tenantId || 'single_store',
        type: 'invoice_created',
        invoiceType: data.invoiceType,
        invoiceNumber: String(data.invoiceNumber),
        invoiceId: data.invoiceId || '',
        amount: data.amount || 0,
        createdById: data.createdById || '',
        createdByName: data.createdByName || 'مستخدم النظام',
        createdByRole: data.createdByRole || 'user',
        recipientRole: 'admin', // FOR MANAGER ONLY
        createdAt: now,
        read: false,
        title: data.title || defaultTitle,
        body: data.body || defaultBody
    };

    try {
        if (batch) {
            const notifRef = doc(collection(db, 'notifications'));
            batch.set(notifRef, notificationDoc);
        } else {
            await addDoc(collection(db, 'notifications'), notificationDoc);
        }
    } catch (err) {
        console.error('Error recording manager invoice notification:', err);
    }
}

/**
 * Play a notification chime sound using Web Audio API (works on Android & Web)
 */
export function playNotificationAudio() {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();

        const playTone = (freq: number, startTime: number, duration: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;

            gain.gain.setValueAtTime(0.3, ctx.currentTime + startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + startTime);
            osc.stop(ctx.currentTime + startTime + duration);
        };

        // Chime: C5 then G5
        playTone(523.25, 0, 0.15);
        playTone(783.99, 0.15, 0.3);
    } catch (e) {
        console.warn('Audio chime playback omitted:', e);
    }
}

/**
 * Request notification permission for Android / Browser
 */
export async function requestAndroidNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
        console.warn('This browser does not support desktop/Android notifications.');
        return 'denied';
    }

    try {
        const permission = await Notification.requestPermission();
        if ('serviceWorker' in navigator) {
            await navigator.serviceWorker.register('/sw.js');
        }
        return permission;
    } catch (e) {
        console.error('Error requesting notification permission:', e);
        return 'denied';
    }
}

/**
 * Trigger native Android / System Notification
 */
export function triggerAndroidSystemNotification(title: string, options: {
    body?: string;
    tag?: string;
    url?: string;
    invoiceId?: string;
}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }

    const notifOptions = {
        body: options.body || '',
        icon: '/icon.png',
        badge: '/favicon.png',
        vibrate: [200, 100, 200, 100, 200], // Android vibration pattern
        tag: options.tag || `inv-${Date.now()}`,
        renotify: true,
        data: {
            url: options.url || '/sales',
            invoiceId: options.invoiceId
        },
        dir: 'rtl' as NotificationDirection,
        lang: 'ar'
    };

    // Prefer ServiceWorker for Android status bar notifications
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(title, notifOptions);
        }).catch(() => {
            try {
                new Notification(title, notifOptions);
            } catch (err) {
                console.warn('Fallback Notification failed:', err);
            }
        });
    } else {
        try {
            new Notification(title, notifOptions);
        } catch (err) {
            console.warn('Notification constructor failed:', err);
        }
    }
}
