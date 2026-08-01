import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { Printer, FileText, Calendar, TrendingUp } from 'lucide-react';
import { printReport } from '../../lib/printHelper';

interface MonthlySummary {
    customerId: string;
    customerName: string;
    month: number;
    year: number;
    totalSales: number;
    invoiceCount: number;
    totalCardSales: number;
    cardCount: number;
}

export default function MonthlySalesSummary({ dateRange }: { dateRange: { startDate: string, endDate: string } }) {
    const { appUser } = useAuthStore();
    const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

        const fetchMonthlyData = async () => {
            setLoading(true);
            try {
                // 1. Get all monthly customers
                const qCust = query(
                    collection(db, 'customers'),
                    where('tenantId', '==', tenantId),
                    where('isMonthlySalesCustomer', '==', true)
                );
                const custSnap = await getDocs(qCust);
                const monthlyCusts = custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

                const results: MonthlySummary[] = [];

                for (const cust of monthlyCusts) {
                    // 2. Get sales for this customer name within date range
                    const qSales = query(
                        collection(db, 'sales'),
                        where('tenantId', '==', tenantId),
                        where('customerName', '==', cust.name),
                        where('date', '>=', dateRange.startDate),
                        where('date', '<=', dateRange.endDate)
                    );
                    const salesSnap = await getDocs(qSales);
                    let totalSales = 0;
                    salesSnap.forEach(sDoc => {
                        const sData = sDoc.data();
                        if (sData.status !== 'cancelled' && sData.status !== 'returned') {
                            totalSales += parseFloat(sData.total || sData.totalAmount || 0);
                        }
                    });

                    // 3. Get card sales for this customer name (distributorName) within date range
                    // Note: card_sales usually use 'date' as YYYY-MM-DD
                    const qCards = query(
                        collection(db, 'card_sales'),
                        where('tenantId', '==', tenantId),
                        where('distributorName', '==', cust.name),
                        where('date', '>=', dateRange.startDate),
                        where('date', '<=', dateRange.endDate)
                    );
                    const cardsSnap = await getDocs(qCards);
                    let totalCardSales = 0;
                    cardsSnap.forEach(cDoc => {
                        const cData = cDoc.data();
                        totalCardSales += parseFloat(cData.totalAmount || 0);
                    });

                    // Only add if there are sales or cards in this period, or if we want to show all accounts regardless
                    if (salesSnap.size > 0 || cardsSnap.size > 0) {
                        results.push({
                            customerId: cust.id,
                            customerName: cust.name,
                            month: cust.month || 0,
                            year: cust.year || 0,
                            totalSales,
                            invoiceCount: salesSnap.size,
                            totalCardSales,
                            cardCount: cardsSnap.size
                        });
                    }
                }

                // Sort by year and month descending
                results.sort((a, b) => {
                    if (b.year !== a.year) return b.year - a.year;
                    return b.month - a.month;
                });

                setSummaries(results);
            } catch (error) {
                handleFirestoreError(error, OperationType.GET, 'monthly_summary');
            } finally {
                setLoading(false);
            }
        };

        fetchMonthlyData();
    }, [appUser, dateRange]);

    const handlePrint = () => {
        const headers = ['الشهر/السنة', 'اسم الحساب', 'إجمالي المبيعات (ر.س)', 'عدد الفواتير', 'مبيعات الكروت (ر.س)', 'عدد الكروت', 'الإجمالي الكلي'];
        const rows = summaries.map(s => [
            `${s.month}/${s.year}`,
            s.customerName,
            s.totalSales.toLocaleString(),
            s.invoiceCount,
            s.totalCardSales.toLocaleString(),
            s.cardCount,
            (s.totalSales + s.totalCardSales).toLocaleString()
        ]);
        printReport('ملخص مبيعات العملاء الشهريين التلقائي', headers, rows);
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-5 rounded-2xl border border-border-main shadow-sm">
                <div>
                    <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                        <TrendingUp className="text-blue-600" size={24} />
                        ملخص مبيعات الحسابات الشهرية التلقائية
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">عرض إجماليات المبيعات وكروت الشبكة للحسابات التي يتم إنشاؤها تلقائياً مطلع كل شهر</p>
                </div>
                <button 
                    onClick={handlePrint}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg active:scale-95"
                >
                    <Printer size={18} />
                    طباعة التقرير / PDF
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
            ) : summaries.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-border-main p-20 text-center flex flex-col items-center gap-4 shadow-sm">
                    <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center text-blue-600">
                        <FileText size={32} />
                    </div>
                    <p className="text-lg font-bold text-slate-400">لا توجد بيانات متاحة حالياً</p>
                    <p className="text-sm text-slate-500">سيظهر الملخص هنا بمجرد توفر مبيعات مرتبطة بالحسابات الشهرية التلقائية.</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-border-main shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-right border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50">
                                    <th className="p-4 text-sm font-black text-slate-600 dark:text-slate-400 border-b border-border-main">الشهر/السنة</th>
                                    <th className="p-4 text-sm font-black text-slate-600 dark:text-slate-400 border-b border-border-main">اسم الحساب</th>
                                    <th className="p-4 text-sm font-black text-slate-600 dark:text-slate-400 border-b border-border-main">إجمالي المبيعات</th>
                                    <th className="p-4 text-sm font-black text-slate-600 dark:text-slate-400 border-b border-border-main">عدد الفواتير</th>
                                    <th className="p-4 text-sm font-black text-slate-600 dark:text-slate-400 border-b border-border-main">مبيعات الكروت</th>
                                    <th className="p-4 text-sm font-black text-slate-600 dark:text-slate-400 border-b border-border-main">الإجمالي الكلي</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summaries.map((s, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="p-4 border-b border-border-main">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={14} className="text-blue-500" />
                                                <span className="font-bold">{s.month} / {s.year}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 border-b border-border-main font-bold text-slate-700 dark:text-slate-300">{s.customerName}</td>
                                        <td className="p-4 border-b border-border-main font-black text-blue-600 dark:text-blue-400">
                                            {s.totalSales.toLocaleString()} <small className="text-[10px] font-normal">ر.س</small>
                                        </td>
                                        <td className="p-4 border-b border-border-main text-sm font-bold text-slate-500">{s.invoiceCount} فواتير</td>
                                        <td className="p-4 border-b border-border-main font-black text-amber-600 dark:text-amber-400">
                                            {s.totalCardSales.toLocaleString()} <small className="text-[10px] font-normal">ر.س</small>
                                        </td>
                                        <td className="p-4 border-b border-border-main">
                                            <span className="bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg font-black text-slate-800 dark:text-white">
                                                {(s.totalSales + s.totalCardSales).toLocaleString()} <small className="text-[10px] font-normal">ر.س</small>
                                            </span>
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
