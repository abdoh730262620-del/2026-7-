import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Printer, UserCheck, TrendingUp, Award } from 'lucide-react';
import { printReport } from '../../lib/printHelper';

import { useAuthStore } from '../../store/authStore';

export default function StaffReport({ dateRange }: { dateRange: { startDate: string, endDate: string } }) {
    const { appUser } = useAuthStore();
    const [performance, setPerformance] = useState<any[]>([]);
    
    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

        const start = new Date(dateRange.startDate).getTime();
        const end = new Date(dateRange.endDate).getTime() + 86400000;

        const unsubSales = onSnapshot(query(collection(db, 'sales'), where('tenantId', '==', tenantId)), (snap) => {
            const staffMap: Record<string, { name: string, totalSales: number, invoiceCount: number, avgInvoice: number }> = {};
            
            snap.forEach(doc => {
                const data = doc.data();
                if (data.status !== 'cancelled' && data.createdAt >= start && data.createdAt <= end) {
                    const seller = data.sellerName || 'موظف غير معرف';
                    const amount = data.totalAmount || data.total || 0;
                    
                    if (!staffMap[seller]) {
                        staffMap[seller] = {
                            name: seller,
                            totalSales: 0,
                            invoiceCount: 0,
                            avgInvoice: 0
                        };
                    }
                    staffMap[seller].totalSales += amount;
                    staffMap[seller].invoiceCount += 1;
                }
            });
            
            const results = Object.values(staffMap).map(s => ({
                ...s,
                avgInvoice: s.totalSales / s.invoiceCount
            })).sort((a,b) => b.totalSales - a.totalSales);
            
            setPerformance(results);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'sales'));

        return () => unsubSales();
    }, [dateRange, appUser]);

    const handlePrint = () => {
        const rows = performance.map((s, i) => [
            i + 1,
            s.name,
            s.invoiceCount,
            s.avgInvoice.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ر.س',
            s.totalSales.toLocaleString() + ' ر.س'
        ]);
        printReport(`تقرير أداء البائعين - الفترة من ${dateRange.startDate} إلى ${dateRange.endDate}`, 
            ['م', 'اسم الموظف/البائع', 'عدد الفواتير', 'متوسط الفاتورة', 'إجمالي المبيعات'], rows);
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-4 md:mb-6">
                {performance.slice(0, 3).map((s, i) => (
                    <div key={`${s.name || 'staff'}-${i}`} className={`p-4 md:p-6 rounded-2xl md:rounded-3xl border shadow-sm flex flex-col gap-4 relative overflow-hidden
                        ${i === 0 ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200' : 'bg-white border-gray-100'}
                    `}>
                        <div className="flex items-center justify-between">
                            <div className={`p-3 rounded-2xl ${i === 0 ? 'bg-yellow-400 text-white' : 'bg-white dark:bg-slate-700 text-blue-600'}`}>
                                {i === 0 ? <Award size={24} /> : <UserCheck size={24} />}
                            </div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">الترتيب #{i+1}</span>
                        </div>
                        <div>
                            <h3 className="font-black text-base md:text-xl text-black dark:text-gray-100">{s.name}</h3>
                            <p className="text-black text-sm mt-1">إجمالي مبيعات الفترة</p>
                        </div>
                        <div className="text-base md:text-xl md:text-3xl font-black text-black dark:text-white" dir="ltr">{s.totalSales.toLocaleString()} <span className="text-sm font-normal">ر.س</span></div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <h3 className="font-bold text-black dark:text-gray-100">ترتيب البائعين حسب المبيعات</h3>
                <button onClick={handlePrint} className="w-full sm:w-auto justify-center flex items-center gap-2 bg-gray-800 text-white px-5 py-2.5 rounded-xl hover:bg-gray-900 transition text-sm font-bold shadow-sm">
                    <Printer size={16} /> طباعة القائمة
                </button>
            </div>

            <div className="bg-white rounded-2xl md:rounded-3xl shadow-sm border border-gray-100 flex-1 overflow-auto min-h-0">
                <table className="w-full text-right text-sm">
                    <thead className="bg-white dark:bg-slate-900 sticky top-0 shadow-sm z-10">
                        <tr>
                            <th className="p-4 text-black dark:text-gray-300 font-bold border-b text-center w-16">م</th>
                            <th className="p-4 text-black dark:text-gray-300 font-bold border-b">اسم الموظف</th>
                            <th className="p-4 text-black dark:text-gray-300 font-bold border-b text-center">عدد الفواتير</th>
                            <th className="p-4 text-black dark:text-gray-300 font-bold border-b">متوسط قيمة الفاتورة</th>
                            <th className="p-4 text-black dark:text-gray-300 font-bold border-b text-blue-600">إجمالي المبيعات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {performance.map((s, index) => (
                            <tr key={`${s.name || 'staff'}-${index}`} className="hover:bg-white transition">
                                <td className="p-4 text-center font-bold text-gray-400">{index + 1}</td>
                                <td className="p-4 font-bold text-black dark:text-gray-100">{s.name}</td>
                                <td className="p-4 text-center">
                                    <span className="bg-white dark:bg-slate-800 text-black dark:text-gray-200 px-3 py-1 rounded-full text-xs font-bold">{s.invoiceCount}</span>
                                </td>
                                <td className="p-4 text-black dark:text-gray-300 font-mono">{s.avgInvoice.toLocaleString(undefined, { maximumFractionDigits: 2 })} ر.س</td>
                                <td className="p-4 font-black text-blue-600 text-lg">{s.totalSales.toLocaleString()} ر.س</td>
                            </tr>
                        ))}
                        {performance.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-12 text-center text-gray-400 font-semibold italic">لا توجد بيانات بائعين في هذه الفترة</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
