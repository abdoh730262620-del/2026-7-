// Service Worker for Android System Notifications & Web Push
const CACHE_NAME = 'saada-pos-cache-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Handle notification click on Android / Mobile
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    client.postMessage({ type: 'NAVIGATE_TO_INVOICE', url: targetUrl, data: event.notification.data });
                    return;
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// Listen for background postMessages to trigger native Android system notifications
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SHOW_INVOICE_NOTIFICATION') {
        const { title, body, icon, tag, data } = event.data;
        self.registration.showNotification(title || '🧾 فاتورة جديدة', {
            body: body || 'تم إنشاء فاتورة جديدة في النظام',
            icon: icon || '/icon.png',
            badge: '/favicon.png',
            vibrate: [200, 100, 200, 100, 200],
            tag: tag || `invoice-${Date.now()}`,
            renotify: true,
            data: data || {},
            dir: 'rtl',
            lang: 'ar'
        });
    }
});
