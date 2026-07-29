import React, { useState, useEffect, useRef } from 'react';
import { Bell, AlertTriangle, PackageOpen, ClockAlert, FileText } from 'lucide-react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { printReport } from '../lib/printHelper';

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

export default function NotificationsMenu() {
    const { appUser } = useAuthStore();
    const { settings } = useSettingsStore();
    const [isOpen, setIsOpen] = useState(false);
    const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
    const [overdueCustomers, setOverdueCustomers] = useState<OverdueCustomer[]>([]);
    const [cashBalance, setCashBalance] = useState<number | null>(null);
    const [dismissedAlerts, setDismissedAlerts] = useState<string[]>(() => {
        try {
            return JSON.parse(sessionStorage.getItem('dismissed_alerts') || '[]');
        } catch {
            return [];
        }
    });
    const menuRef = useRef<HTMLDivElement>(null);

    const dismissAlert = (id: string) => {
        const updated = [...dismissedAlerts, id];
        setDismissedAlerts(updated);
        sessionStorage.setItem('dismissed_alerts', JSON.stringify(updated));
    };

    // Only show to admin
    const isAdmin = appUser?.role === 'admin';

    const isCashLow = cashBalance !== null && settings.cashMinimumAlertThreshold !== undefined && settings.cashMinimumAlertThreshold > 0 && cashBalance < settings.cashMinimumAlertThreshold;

    useEffect(() => {
        if (!isAdmin) return;

        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
        const q = query(collection(db, 'products'), where('tenantId', '==', tenantId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const products: LowStockProduct[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                const alertLevel = data.lowStockAlert !== undefined && data.lowStockAlert !== null ? data.lowStockAlert : 5;
                if (data.quantity <= alertLevel) {
                    products.push({
                        id: doc.id,
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

    useEffect(() => {
        if (!isAdmin) {
            setOverdueCustomers([]);
            setCashBalance(null);
            return;
        }

        const unsubscribes: any[] = [];
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

        const fetchOverdue = async () => {
            try {
                const thresholdTime = Date.now() - (settings.overdueDaysThreshold * 24 * 60 * 60 * 1000);
                
                const customersSnap = await getDocs(query(
                    collection(db, 'customers'), 
                    where('tenantId', '==', tenantId),
                    where('balance', '>', 1)
                ));
                const overdueList: OverdueCustomer[] = [];

                // To avoid N+1 queries, we fetch credit sales older than thresholdTime once
                // However, without a composite index, we might just query all credit sales or filter clients locally.
                const invoicesSnap = await getDocs(query(
                    collection(db, 'sales'),
                    where('tenantId', '==', tenantId),
                    where('paymentType', '==', 'credit')
                ));

                const customerInvoicesUrls: Record<string, any[]> = {};
                invoicesSnap.forEach(d => {
                    const data = d.data();
                    // Filter by date locally to avoid composite index requirement
                    if (data.date < thresholdTime) {
                        if (!customerInvoicesUrls[data.customerId]) {
                            customerInvoicesUrls[data.customerId] = [];
                        }
                        customerInvoicesUrls[data.customerId].push(data);
                    }
                });

                for (const docRef of customersSnap.docs) {
                    const cust = docRef.data();
                    const invoices = customerInvoicesUrls[docRef.id];

                    if (invoices && invoices.length > 0) {
                        const sortedInvoices = invoices.sort((a, b) => a.date - b.date);
                        overdueList.push({
                            id: docRef.id,
                            name: cust.name,
                            balance: cust.balance,
                            lastInvoiceDate: sortedInvoices[0].date
                        });
                    }
                }
                
                setOverdueCustomers(overdueList);
            } catch (error) {
                console.error("Error fetching overdue logs:", error);
            }
        };

        if (settings.isOverdueAlertEnabled) {
            fetchOverdue();
            const interval = setInterval(fetchOverdue, 300000); // Refresh every 5 minutes
            unsubscribes.push(() => clearInterval(interval));
        } else {
            setOverdueCustomers([]);
        }

        const cashQuery = query(collection(db, 'cash'), where('tenantId', '==', tenantId));
        unsubscribes.push(onSnapshot(cashQuery, (snapshot) => {
            let bal = 0;
            snapshot.forEach(d => {
                const data = d.data();
                if (data.affectsCash === false) return;
                if (data.type === 'in') bal += (data.amount || 0);
                else if (data.type === 'out') bal -= (data.amount || 0);
            });
            setCashBalance(bal);
        }));

        return () => unsubscribes.forEach(unsub => unsub());
    }, [isAdmin, settings, appUser]);

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

    const activeCashLow = isCashLow && !dismissedAlerts.includes('low-cash');
    const activeOverdue = overdueCustomers.filter(c => !dismissedAlerts.includes(`overdue-${c.id}`));
    const activeLowStock = lowStockProducts.filter(p => !dismissedAlerts.includes(`low-stock-${p.id}`));

    const totalAlerts = activeLowStock.length + activeOverdue.length + (activeCashLow ? 1 : 0);

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

        if (activeCashLow) {
            rows.push([
                'تحذير سيولة الصندوق',
                'نقص في السيولة النقدية المطلوبة',
                `الرصيد الفعلي في الصندوق (${cashBalance?.toFixed(2)} ر.س) أقل من الحد الأدنى المطلوب (${settings.cashMinimumAlertThreshold} ر.س).`
            ]);
        }

        activeOverdue.forEach(customer => {
            rows.push([
                'تأخر سداد مستحق للعميل',
                `متابعة ذمة مالية: ${customer.name}`,
                `الرصيد المتبقي المستحق (${customer.balance.toLocaleString()} ر.س). تجاوز العميل فترة السماح المحددة بـ (${settings.overdueDaysThreshold} أيام).`
            ]);
        });

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
                className="p-2 relative bg-bg-main text-text-main rounded-xl hover:bg-white transition-all shadow-sm border border-border-main active:scale-95 group"
                title="الإشعارات"
            >
                <Bell size={18} className="text-text-main group-hover:scale-110 transition-transform" />
                {totalAlerts > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow ring-2 ring-card-bg">
                        {totalAlerts > 9 ? '9+' : totalAlerts}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute left-0 mt-2 w-72 md:w-80 bg-card-bg rounded-xl shadow-xl border border-border-main z-50 flex flex-col max-h-[80vh] overflow-hidden" dir="rtl">
                    <div className="p-3 md:p-4 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/40 dark:to-orange-900/20 border-b border-border-main flex flex-col gap-2 shrink-0">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-sm text-red-800 dark:text-red-400 flex items-center gap-2">
                                <Bell size={16} /> تنبيهات النظام
                            </h3>
                            {totalAlerts > 0 && (
                                <span className="text-xs font-bold bg-white dark:bg-black/20 text-red-600 px-2 py-0.5 rounded-full border border-red-200 dark:border-red-800">
                                    {totalAlerts} تنبيه
                                </span>
                            )}
                        </div>
                        {totalAlerts > 0 && (
                            <div className="flex items-center justify-between gap-2 mt-1">
                                <button 
                                    onClick={dismissAll}
                                    className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-right cursor-pointer flex items-center gap-1"
                                >
                                    قراءة وتجاوز الكل ✓
                                </button>
                                <button 
                                    onClick={downloadReport}
                                    className="text-[10px] font-black text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 flex items-center gap-1 px-2 py-1 bg-red-50 dark:bg-red-950/25 rounded-lg border border-red-100 dark:border-red-900/40 transition-colors cursor-pointer"
                                    title="تنزيل كشف التنبيهات كـ PDF"
                                >
                                    <FileText size={12} />
                                    <span>تصدير PDF</span>
                                </button>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto no-scrollbar">
                        {totalAlerts === 0 ? (
                            <div className="p-8 text-center flex flex-col items-center justify-center">
                                <PackageOpen size={48} className="text-text-main/20 mb-3" />
                                <p className="text-text-main/50 text-sm font-bold mt-2">لا توجد تنبيهات حالياً</p>
                                <p className="text-text-main/40 text-xs mt-1">جميع المؤشرات طبيعية</p>
                            </div>
                        ) : (
                            <div className="flex flex-col divide-y divide-border-main">
                                {activeCashLow && (
                                    <div 
                                        onClick={() => dismissAlert('low-cash')}
                                        className="p-3 md:p-4 hover:bg-bg-main transition-colors flex items-start gap-3 cursor-pointer group/item relative"
                                        title="اضغط للاستبعاد"
                                    >
                                        <div className="p-2 bg-white dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg shrink-0 sm:mt-1">
                                            <AlertTriangle size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-sm font-bold text-text-main truncate">
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
                                {activeOverdue.map((customer, idx) => (
                                    <div 
                                        key={`overdue-${customer.id || idx}-${idx}`} 
                                        onClick={() => dismissAlert(`overdue-${customer.id}`)}
                                        className="p-3 md:p-4 hover:bg-bg-main transition-colors flex items-start gap-3 cursor-pointer group/item relative"
                                        title="اضغط للاستبعاد"
                                    >
                                        <div className="p-2 bg-white dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg shrink-0 sm:mt-1">
                                            <ClockAlert size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-sm font-bold text-text-main truncate" title={customer.name}>
                                                    تأخر سداد: {customer.name}
                                                </p>
                                                <span className="text-[9px] text-gray-400 group-hover/item:text-red-500 transition-colors">استبعاد ×</span>
                                            </div>
                                            <p className="text-xs text-text-main/70 leading-relaxed font-semibold">
                                                الرصيد المتبقي (<span className="text-red-600 font-bold">{customer.balance.toLocaleString()}</span>). تجاوز العميل فترة السماح المحددة (<span className="text-red-600">{settings.overdueDaysThreshold} أيام</span>). يرجى المتابعة.
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {activeLowStock.map((product, idx) => (
                                    <div 
                                        key={`stock-${product.id || idx}-${idx}`} 
                                        onClick={() => dismissAlert(`low-stock-${product.id}`)}
                                        className="p-3 md:p-4 hover:bg-bg-main transition-colors flex items-start gap-3 cursor-pointer group/item relative"
                                        title="اضغط للاستبعاد"
                                    >
                                        <div className="p-2 bg-white dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded-lg shrink-0 sm:mt-1">
                                            <AlertTriangle size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="text-sm font-bold text-text-main truncate" title={product.name}>
                                                    انخفاض مخزون: {product.name}
                                                </p>
                                                <span className="text-[9px] text-gray-400 group-hover/item:text-red-500 transition-colors">استبعاد ×</span>
                                            </div>
                                            <p className="text-xs text-text-main/70 leading-relaxed font-semibold">
                                                الكمية الحالية (<span className="text-red-600 font-bold">{product.quantity}</span>) وصلت لحد الأمان المخصص (<span className="text-amber-600">{product.lowStockAlert}</span>) أو أقل منه. يرجى المراجعة وطلب كميات جديدة.
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
