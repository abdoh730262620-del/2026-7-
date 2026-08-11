import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, PackageOpen, ClockAlert, FileText, Receipt, Smartphone, CheckCircle, Volume2, List } from 'lucide-react';
import { collection, onSnapshot, query, where, doc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { printReport } from '../lib/printHelper';
import { 
    requestAndroidNotificationPermission, 
    triggerAndroidSystemNotification, 
    playNotificationAudio 
} from '../lib/notificationService';

interface LowStockProduct {
    id: string;
    name: string;
    quantity: number;
    lowStockAlert: number;
}

interface OverdueCustomer {
    id: string;
    name: string;
    balance: number;
    lastInvoiceDate: number;
}

interface ManagerInvoiceNotif {
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    amount: number;
    createdByName: string;
    createdByRole: string;
    createdAt: number;
    title: string;
    body: string;
    read: boolean;
}

export default function NotificationsMenu() {
    const { appUser } = useAuthStore();
    const { settings } = useSettingsStore();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
    const [overdueCustomers, setOverdueCustomers] = useState<OverdueCustomer[]>([]);
    const [cashBalance, setCashBalance] = useState<number | null>(null);
    const [invoiceNotifications, setInvoiceNotifications] = useState<ManagerInvoiceNotif[]>([]);
    const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => {
        return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied';
    });
    
    const [dismissedAlerts, setDismissedAlerts] = useState<string[]>(() => {
        try {
            return JSON.parse(sessionStorage.getItem('dismissed_alerts') || '[]');
        } catch {
            return [];
        }
    });

    const menuRef = useRef<HTMLDivElement>(null);
    const processedNotifIds = useRef<Set<string>>(new Set());

    // Only show to admin / manager
    const isAdmin = appUser?.role === 'admin';

    const dismissAlert = (id: string) => {
        const updated = [...dismissedAlerts, id];
        setDismissedAlerts(updated);
        sessionStorage.setItem('dismissed_alerts', JSON.stringify(updated));
    };

    const markInvoiceNotifRead = async (id: string) => {
        try {
            await updateDoc(doc(db, 'notifications', id), { read: true });
        } catch (err) {
            console.error('Error marking notification read:', err);
        }
    };

    const clearAllInvoiceNotifications = async () => {
        try {
            const batch = writeBatch(db);
            invoiceNotifications.forEach(n => {
                batch.delete(doc(db, 'notifications', n.id));
            });
            await batch.commit();
            setInvoiceNotifications([]);
        } catch (err) {
            console.error('Error clearing invoice notifications:', err);
        }
    };

    const handleEnableAndroidNotifications = async () => {
        const perm = await requestAndroidNotificationPermission();
        setNotifPermission(perm);
        if (perm === 'granted') {
            playNotificationAudio();
            triggerAndroidSystemNotification('🔔 تم تفعيل إشعارات أندرويد بنجاح', {
                body: 'سيصلك إشعار فوري على هاتفك عند إنشاء أي فاتورة بواسطة المستخدمين.',
                tag: 'test-permission'
            });
            alert('تم تفعيل إشعارات أندرويد والنظام بنجاح!');
        } else if (perm === 'denied') {
            alert('تنبيه: تم رفض إذن الإشعارات. يرجى تفعيل السماح بالإشعارات من إعدادات الهاتف.');
        }
    };

    const handleTestNotification = () => {
        playNotificationAudio();
        triggerAndroidSystemNotification('🧾 تجربة إشعار فاتورة أندرويد', {
            body: 'فاتورة مبيعات #10099 بقيمة 250 ر.س بواسطة المحاسب علي',
            tag: `test-${Date.now()}`
        });
    };

    // 1. Listen for Low Stock products
    useEffect(() => {
        if (!isAdmin) return;

        const tenantId = appUser?.tenantId || 'single_store';
        const q = query(collection(db, 'products'), where('tenantId', '==', tenantId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const products: LowStockProduct[] = [];
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const alertLevel = data.lowStockAlert !== undefined && data.lowStockAlert !== null ? data.lowStockAlert : 5;
                if (data.quantity <= alertLevel) {
                    products.push({
                        id: docSnap.id,
                        name: data.name,
                        quantity: data.quantity,
                        lowStockAlert: alertLevel
                    });
                }
            });
            setLowStockProducts(products);
        });

        return () => unsubscribe();
    }, [isAdmin, appUser]);

    // 2. Listen for Real-Time Manager Invoice Notifications from Firestore
    useEffect(() => {
        if (!isAdmin) return;

        const tenantId = appUser?.tenantId || 'single_store';
        const qNotifs = query(
            collection(db, 'notifications'), 
            where('tenantId', '==', tenantId),
            where('recipientRole', '==', 'admin')
        );

        const unsubscribe = onSnapshot(qNotifs, (snapshot) => {
            const list: ManagerInvoiceNotif[] = [];
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const notifId = change.doc.id;

                    // Trigger sound & native Android system notification if not processed yet and not created by admin himself
                    if (!processedNotifIds.current.has(notifId) && !data.read) {
                        processedNotifIds.current.add(notifId);
                        
                        // Audio & Native Android notification
                        playNotificationAudio();
                        triggerAndroidSystemNotification(data.title || '🧾 فاتورة جديدة', {
                            body: data.body || `تم إنشاؤها بواسطة ${data.createdByName}`,
                            tag: notifId,
                            url: '/sales'
                        });
                    }
                }
            });

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                list.push({
                    id: docSnap.id,
                    invoiceNumber: data.invoiceNumber || '',
                    invoiceType: data.invoiceType || 'sale',
                    amount: data.amount || 0,
                    createdByName: data.createdByName || 'مستخدم',
                    createdByRole: data.createdByRole || 'user',
                    createdAt: data.createdAt || Date.now(),
                    title: data.title || 'فاتورة جديدة',
                    body: data.body || '',
                    read: data.read || false
                });
            });

            // Sort newest first
            list.sort((a, b) => b.createdAt - a.createdAt);
            setInvoiceNotifications(list);
        });

        return () => unsubscribe();
    }, [isAdmin, appUser]);

    // 3. Listen for Cash & Overdue
    useEffect(() => {
        if (!isAdmin) return;
        const tenantId = appUser?.tenantId || 'single_store';

        const cashQuery = query(collection(db, 'cash'), where('tenantId', '==', tenantId));
        const unsubCash = onSnapshot(cashQuery, (snapshot) => {
            let bal = 0;
            snapshot.forEach(d => {
                const data = d.data();
                if (data.affectsCash === false) return;
                if (data.type === 'in') bal += (data.amount || 0);
                else if (data.type === 'out') bal -= (data.amount || 0);
            });
            setCashBalance(bal);
        });

        return () => unsubCash();
    }, [isAdmin, appUser]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!isAdmin) return null;

    const isCashLow = cashBalance !== null && settings.cashMinimumAlertThreshold !== undefined && settings.cashMinimumAlertThreshold > 0 && cashBalance < settings.cashMinimumAlertThreshold;
    const activeCashLow = isCashLow && !dismissedAlerts.includes('low-cash');
    const activeOverdue = overdueCustomers.filter(c => !dismissedAlerts.includes(`overdue-${c.id}`));
    const activeLowStock = lowStockProducts.filter(p => !dismissedAlerts.includes(`low-stock-${p.id}`));
    const unreadInvoices = invoiceNotifications.filter(n => !n.read);

    const totalAlerts = activeLowStock.length + activeOverdue.length + (activeCashLow ? 1 : 0) + unreadInvoices.length;

    const dismissAll = () => {
        const allIds: string[] = [];
        if (activeCashLow) allIds.push('low-cash');
        activeOverdue.forEach(c => allIds.push(`overdue-${c.id}`));
        activeLowStock.forEach(p => allIds.push(`low-stock-${p.id}`));
        const updated = Array.from(new Set([...dismissedAlerts, ...allIds]));
        setDismissedAlerts(updated);
        sessionStorage.setItem('dismissed_alerts', JSON.stringify(updated));
    };

    const downloadReport = () => {
        const headers = ['نوع التنبيه', 'الموضوع / العنوان', 'تفاصيل التنبيه الإرشادية'];
        const rows: string[][] = [];

        invoiceNotifications.forEach(inv => {
            rows.push([
                'إشعار فاتورة للمدير',
                inv.title,
                `${inv.body} (التاريخ: ${new Date(inv.createdAt).toLocaleString('ar-EG')})`
            ]);
        });

        if (activeCashLow) {
            rows.push([
                'تحذير سيولة الصندوق',
                'نقص في السيولة النقدية المطلوبة',
                `الرصيد الفعلي في الصندوق (${cashBalance?.toFixed(2)} ر.س) أقل من الحد الأدنى المطلوب (${settings.cashMinimumAlertThreshold} ر.س).`
            ]);
        }

        activeLowStock.forEach(product => {
            rows.push([
                'انخفاض كمية المخزون',
                `طلب تزويد كمية: ${product.name}`,
                `الكمية الحالية (${product.quantity}) وصلت لحد الأمان المخصص للمنتج (${product.lowStockAlert}) أو أقل منه.`
            ]);
        });

        if (rows.length === 0) {
            alert('لا توجد تنبيهات نشطة لتصديرها حالياً.');
            return;
        }

        printReport('تقرير تنبيهات ونواقص النظام الميدانية', headers, rows);
    };

    return (
        <div className="relative" ref={menuRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 relative bg-bg-main text-text-main rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-all shadow-sm border border-border-main active:scale-95 group"
                title="الإشعارات الفورية للمدير"
            >
                <Bell size={18} className="text-text-main group-hover:scale-110 transition-transform" />
                {totalAlerts > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white shadow ring-2 ring-card-bg animate-pulse">
                        {totalAlerts > 9 ? '9+' : totalAlerts}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-80 md:w-96 bg-card-bg rounded-2xl shadow-2xl border border-border-main z-50 flex flex-col max-h-[85vh] overflow-hidden" dir="rtl">
                    
                    {/* Header */}
                    <div className="p-3 md:p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white border-b border-border-main flex flex-col gap-2 shrink-0">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-sm flex items-center gap-2 text-indigo-200">
                                <Bell size={16} className="text-amber-400" /> تنبيهات المدير المباشرة
                            </h3>
                            {totalAlerts > 0 && (
                                <span className="text-xs font-bold bg-red-500/20 text-red-300 px-2.5 py-0.5 rounded-full border border-red-500/40">
                                    {totalAlerts} جديد
                                </span>
                            )}
                        </div>

                        {/* Android Notification Support Bar */}
                        <div className="mt-1 p-2 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-between gap-2 border border-white/10 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <Smartphone size={15} className="text-emerald-400 shrink-0" />
                                <span className="text-[11px] truncate text-slate-200 font-semibold">
                                    إشعارات أندرويد: {notifPermission === 'granted' ? 'مفعلة 🟢' : 'غير مفعلة 🔴'}
                                </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {notifPermission !== 'granted' ? (
                                    <button 
                                        onClick={handleEnableAndroidNotifications}
                                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg transition-all shadow active:scale-95 cursor-pointer"
                                    >
                                        تفعيل الأندرويد
                                    </button>
                                ) : (
                                    <button 
                                        onClick={handleTestNotification}
                                        className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                                        title="إرسال تجربة إشعار أندرويد"
                                    >
                                        <Volume2 size={12} />
                                        <span>تجربة</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Action Toolbar */}
                        <div className="flex items-center justify-between gap-2 mt-1">
                            {unreadInvoices.length > 0 && (
                                <button 
                                    onClick={clearAllInvoiceNotifications}
                                    className="text-[11px] font-bold text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                                >
                                    مسح إشعارات الفواتير ✓
                                </button>
                            )}
                            <button 
                                onClick={downloadReport}
                                className="text-[10px] font-black text-amber-300 hover:text-amber-200 flex items-center gap-1 px-2 py-1 bg-white/10 rounded-lg border border-white/10 transition-colors cursor-pointer ml-auto"
                                title="تصدير كشف التنبيهات كـ PDF"
                            >
                                <FileText size={12} />
                                <span>تصدير PDF</span>
                            </button>
                        </div>
                    </div>
                    
                    {/* Content List */}
                    <div className="flex-1 overflow-y-auto no-scrollbar divide-y divide-border-main">
                        
                        {/* Section: New Invoices for Manager */}
                        {invoiceNotifications.length > 0 && (
                            <div className="p-2 bg-indigo-50/50 dark:bg-indigo-950/20">
                                <div className="p-2 text-xs font-black text-indigo-900 dark:text-indigo-300 flex items-center justify-between">
                                    <span className="flex items-center gap-1">
                                        <Receipt size={14} className="text-indigo-600" />
                                        فواتير المستخدمين الجديدة ({invoiceNotifications.length})
                                    </span>
                                </div>
                                <div className="space-y-2 mt-1">
                                    {invoiceNotifications.map((notif) => (
                                        <div 
                                            key={notif.id}
                                            onClick={() => markInvoiceNotifRead(notif.id)}
                                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 relative ${
                                                !notif.read 
                                                    ? 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-800 shadow-md ring-1 ring-indigo-500/30' 
                                                    : 'bg-card-bg border-border-main opacity-80'
                                            }`}
                                        >
                                            <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-xl shrink-0 mt-0.5">
                                                <Receipt size={18} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1 mb-1">
                                                    <p className="text-xs font-black text-text-main truncate">
                                                        {notif.title}
                                                    </p>
                                                    {!notif.read && (
                                                        <span className="text-[9px] font-black bg-emerald-500 text-white px-1.5 py-0.5 rounded-full shrink-0">
                                                            جديد
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-text-main/80 font-semibold leading-relaxed">
                                                    {notif.body}
                                                </p>
                                                <div className="flex items-center justify-between text-[10px] text-text-main/50 mt-1.5 font-bold">
                                                    <span>المستخدم: {notif.createdByName}</span>
                                                    <span>{new Date(notif.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* System Inventory & Cash Alerts */}
                        {totalAlerts === 0 ? (
                            <div className="p-8 text-center flex flex-col items-center justify-center">
                                <PackageOpen size={44} className="text-text-main/20 mb-2" />
                                <p className="text-text-main/60 text-xs font-bold">لا توجد تنبيهات حالياً</p>
                                <p className="text-text-main/40 text-[11px] mt-1">سيصلك إشعار فوري وتنبيه أندرويد فور إجراء أي فاتورة جديدة.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {activeCashLow && (
                                    <div 
                                        onClick={() => dismissAlert('low-cash')}
                                        className="p-3 md:p-4 hover:bg-bg-main transition-colors flex items-start gap-3 cursor-pointer group/item relative"
                                    >
                                        <div className="p-2 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl shrink-0">
                                            <AlertTriangle size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-xs font-bold text-text-main truncate">
                                                    تحذير سيولة نقدية
                                                </p>
                                                <span className="text-[9px] text-gray-400 group-hover/item:text-red-500 transition-colors">استبعاد ×</span>
                                            </div>
                                            <p className="text-xs text-text-main/70 leading-relaxed font-semibold">
                                                الرصيد الفعلي في الصندوق (<span className="text-red-600 font-bold">{cashBalance?.toFixed(2)}</span> ر.س) أقل من الحد الأدنى المطلوب (<span className="text-red-600">{settings.cashMinimumAlertThreshold}</span> ر.س).
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {activeLowStock.map((product, idx) => (
                                    <div 
                                        key={`stock-${product.id || idx}-${idx}`} 
                                        onClick={() => dismissAlert(`low-stock-${product.id}`)}
                                        className="p-3 md:p-4 hover:bg-bg-main transition-colors flex items-start gap-3 cursor-pointer group/item relative"
                                    >
                                        <div className="p-2 bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
                                            <AlertTriangle size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-xs font-bold text-text-main truncate" title={product.name}>
                                                    انخفاض مخزون: {product.name}
                                                </p>
                                                <span className="text-[9px] text-gray-400 group-hover/item:text-red-500 transition-colors">استبعاد ×</span>
                                            </div>
                                            <p className="text-xs text-text-main/70 leading-relaxed font-semibold">
                                                الكمية الحالية (<span className="text-red-600 font-bold">{product.quantity}</span>) وصلت لحد الأمان المخصص (<span className="text-amber-600">{product.lowStockAlert}</span>) أو أقل منه.
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    {/* View All History Link */}
                    <div className="p-3 bg-bg-main border-t border-border-main shrink-0">
                        <button 
                            onClick={() => {
                                setIsOpen(false);
                                navigate('/notifications-history');
                            }}
                            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 py-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                        >
                            <List size={16} />
                            <span>عرض سجل الإشعارات كاملاً</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
