const fs = require('fs');
let code = fs.readFileSync('src/lib/notificationService.ts', 'utf8');

code = code.replace(
    "import { db } from './firebase';",
    "import { db } from './firebase';\nimport { Capacitor } from '@capacitor/core';\nimport { LocalNotifications } from '@capacitor/local-notifications';"
);

code = code.replace(
    "export async function requestAndroidNotificationPermission(): Promise<NotificationPermission> {",
    "export async function requestAndroidNotificationPermission(): Promise<NotificationPermission> {\n    if (Capacitor.isNativePlatform()) {\n        try {\n            const permStatus = await LocalNotifications.requestPermissions();\n            return permStatus.display === 'granted' ? 'granted' : 'denied';\n        } catch (e) {\n            console.error('Error requesting capacitor notification permission:', e);\n            return 'denied';\n        }\n    }\n"
);

code = code.replace(
    "export function triggerAndroidSystemNotification(title: string, options: {\n    body?: string;\n    tag?: string;\n    url?: string;\n    invoiceId?: string;\n}) {",
    "export function triggerAndroidSystemNotification(title: string, options: {\n    body?: string;\n    tag?: string;\n    url?: string;\n    invoiceId?: string;\n}) {\n    if (Capacitor.isNativePlatform()) {\n        LocalNotifications.checkPermissions().then(permStatus => {\n            if (permStatus.display === 'granted') {\n                LocalNotifications.schedule({\n                    notifications: [{\n                        title: title,\n                        body: options.body || '',\n                        id: new Date().getTime(),\n                        schedule: { at: new Date(Date.now() + 100) },\n                        extra: {\n                            url: options.url || '/sales',\n                            invoiceId: options.invoiceId\n                        }\n                    }]\n                });\n            }\n        }).catch(e => console.error('Error triggering capacitor notification:', e));\n        return;\n    }\n"
);

fs.writeFileSync('src/lib/notificationService.ts', code);
