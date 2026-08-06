import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { Bell, Receipt, CheckCircle, Trash2, Calendar, FileText } from 'lucide-react';
import { printReport } from '../lib/printHelper';

interface NotificationRecord {
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

export default function NotificationsHistory() {
    const { appUser } = useAuthStore();
    const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const isAdmin = appUser?.role === 'admin';

    useEffect(() => {
        if (!isAdmin) {
            setLoading(false);
            return;
        }

        const fetchNotifications = async () => {
            try {
                const tenantId = appUser?.tenantId || 'single_store';
                const q = query(
                    collection(db, 'notifications'),
                    where('tenantId', '==', tenantId),
                    where('recipientRole', '==', 'admin'),
                    orderBy('createdAt', 'desc'),
                    limit(50)
                );

                const snapshot = await getDocs(q);
                const list: NotificationRecord[] = [];
                snapshot.forEach(docSnap => {
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

                setNotifications(list);
            } catch (error) {
                console.error("Error fetching notifications history:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchNotifications();
    }, [isAdmin, appUser]);

    const handleMarkAllRead = async () => {
        if (!confirm('هل أنت متأكد من تحديد جميع الإشعارات كمقروءة؟')) return;
        
        try {
            const batch = writeBatch(db);
            const unreadNotifs = notifications.filter(n => !n.read);
            
            unreadNotifs.forEach(n => {
                const ref = doc(db, 'notifications', n.id);
                batch.update(ref, { read: true });
            });
            
            await batch.commit();
            
            setNotifications(notifications.map(n => ({ ...n, read: true })));
        } catch (error) {
            console.error("Error marking all as read:", error);
            alert('حدث خطأ أثناء التحديث.');
        }
    };

    const handleDeleteAll = async () => {
        if (!confirm('هل أنت متأكد من مسح جميع الإشعارات نهائياً؟')) return;

        try {
            const batch = writeBatch(db);
            notifications.forEach(n => {
                const ref = doc(db, 'notifications', n.id);
                batch.delete(ref);
            });
            
            await batch.commit();
            setNotifications([]);
        } catch (error) {
            console.error("Error deleting all notifications:", error);
            alert('حدث خطأ أثناء المسح.');
        }
    };

    const handlePrint = () => {
        const headers = ['نوع الفاتورة', 'رقم الفاتورة', 'المبلغ', 'المستخدم', 'التاريخ', 'الوقت', 'الحالة'];
        const rows = notifications.map(n => [
            n.invoiceType === 'sale' ? 'مبيعات' : 
            n.invoiceType === 'purchase' ? 'مشتريات' : 
            n.invoiceType === 'card_sale' ? 'كروت شبكة' : 
            n.invoiceType === 'card_purchase' ? 'شراء كروت' : 'أخرى',
            n.invoiceNumber,
            `${n.amount.toLocaleString('ar-SA')} ر.س`,
            n.createdByName,
            new Date(n.createdAt).toLocaleDateString('ar-EG'),
            new Date(n.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
            n.read ? 'مقروءة' : 'جديدة'
        ]);

        printReport('سجل الإشعارات المباشرة', headers, rows);
    };

    if (!isAdmin) {
        return (
            <div className="p-6 md:p-12 text-center text-text-main" dir="rtl">
                <p className="text-xl font-bold">عذراً، هذه الصفحة مخصصة للمدير فقط.</p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6" dir="rtl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 dark:bg-indigo-900/50 p-3 rounded-2xl text-indigo-600 dark:text-indigo-400">
                        <Bell size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-text-main">سجل الإشعارات</h1>
                        <p className="text-text-main/60 font-semibold mt-1">آخر 50 إشعار فاتورة مباشرة</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={handleMarkAllRead}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 dark:bg-emerald-900/40 dark:hover:bg-emerald-800/60 dark:text-emerald-300 font-bold rounded-xl transition-colors"
                    >
                        <CheckCircle size={18} />
                        <span className="hidden sm:inline">تحديد الكل مقروء</span>
                    </button>
                    <button 
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/40 dark:hover:bg-blue-800/60 dark:text-blue-300 font-bold rounded-xl transition-colors"
                    >
                        <FileText size={18} />
                        <span className="hidden sm:inline">طباعة السجل</span>
                    </button>
                    <button 
                        onClick={handleDeleteAll}
                        className="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:hover:bg-red-800/60 dark:text-red-300 font-bold rounded-xl transition-colors"
                    >
                        <Trash2 size={18} />
                        <span className="hidden sm:inline">مسح السجل</span>
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-20">
                    <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>
            ) : notifications.length === 0 ? (
                <div className="bg-card-bg border border-border-main rounded-3xl p-16 text-center shadow-sm">
                    <Bell size={48} className="mx-auto text-text-main/20 mb-4" />
                    <h2 className="text-xl font-bold text-text-main mb-2">لا توجد إشعارات سابقة</h2>
                    <p className="text-text-main/60">لم يتم تلقي أي إشعارات للفواتير حتى الآن.</p>
                </div>
            ) : (
                <div className="bg-card-bg border border-border-main rounded-3xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full whitespace-nowrap text-right">
                            <thead className="bg-bg-main/50 border-b border-border-main">
                                <tr>
                                    <th className="px-6 py-4 font-bold text-text-main text-sm">التفاصيل</th>
                                    <th className="px-6 py-4 font-bold text-text-main text-sm">المبلغ</th>
                                    <th className="px-6 py-4 font-bold text-text-main text-sm">المستخدم</th>
                                    <th className="px-6 py-4 font-bold text-text-main text-sm">التاريخ</th>
                                    <th className="px-6 py-4 font-bold text-text-main text-sm">الحالة</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-main">
                                {notifications.map((notif) => (
                                    <tr 
                                        key={notif.id} 
                                        className={`transition-colors hover:bg-bg-main/50 ${!notif.read ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-xl shrink-0 ${!notif.read ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'bg-bg-main text-text-main/60'}`}>
                                                    <Receipt size={18} />
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-bold ${!notif.read ? 'text-text-main' : 'text-text-main/70'}`}>
                                                        {notif.title}
                                                    </p>
                                                    <p className="text-xs text-text-main/60 mt-1 max-w-[250px] truncate" title={notif.body}>
                                                        {notif.body}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-sm font-black ${!notif.read ? 'text-emerald-600 dark:text-emerald-400' : 'text-text-main'}`}>
                                                {notif.amount.toLocaleString('ar-SA')} ر.س
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-bold text-text-main">
                                                {notif.createdByName}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-text-main/70 text-sm font-medium">
                                                <Calendar size={14} />
                                                <span>{new Date(notif.createdAt).toLocaleDateString('ar-EG')}</span>
                                                <span className="text-xs">({new Date(notif.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {!notif.read ? (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 animate-pulse">
                                                    إشعار جديد
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-bg-main text-text-main/60 border border-border-main">
                                                    مقروء
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
