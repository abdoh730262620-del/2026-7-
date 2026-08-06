import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Printer, TrendingUp, TrendingDown, Star } from 'lucide-react';
import { printReport } from '../../lib/printHelper';

import { useAuthStore } from '../../store/authStore';

export default function BestSellersReport({ dateRange }: { dateRange: { startDate: string, endDate: string } }) {
    const { appUser } = useAuthStore();
    const [itemStats, setItemStats] = useState<any[]>([]);
    
    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || 'single_store';

        const start = new Date(dateRange.startDate).getTime();
        const end = new Date(dateRange.endDate).getTime() + 86400000;

        const unsubSales = onSnapshot(query(collection(db, 'sales'), where('tenantId', '==', tenantId)), (snap) => {
            const statsMap: Record<string, { id: string, name: string, quantitySold: number, barcode: string, totalRevenue: number }> = {};
            
            snap.forEach(doc => {
                const data = doc.data();
                if (data.status !== 'cancelled' && data.createdAt >= start && data.createdAt <= end) {
                    const items = data.items || [];
                    items.forEach((item: any) => {
                        if (!statsMap[item.id]) {
                            statsMap[item.id] = {
                                id: item.id,
                                name: item.name,
                                barcode: item.barcode || '-',
                                quantitySold: 0,
                                totalRevenue: 0
                            };
                        }
                        statsMap[item.id].quantitySold += (item.quantityStore || item.quantity || 1);
                        statsMap[item.id].totalRevenue += (item.price * (item.quantityStore || item.quantity || 1));
                    });
                }
            });
            
            setItemStats(Object.values(statsMap).sort((a,b) => b.quantitySold - a.quantitySold));
        }, (error) => handleFirestoreError(error, OperationType.GET, 'sales'));

        return () => { unsubSales(); }
    }, [dateRange, appUser]);

    const handlePrint = () => {
        const rows = itemStats.map((item, index) => [
            index + 1,
            item.barcode,
            item.name,
            item.quantitySold,
            item.totalRevenue.toLocaleString() + ' ر.س'
        ]);
        
        printReport(`تقرير حركة الأصناف (الأكثر مبيعاً) - من ${dateRange.startDate} إلى ${dateRange.endDate}`, 
            ['م', 'الباركود', 'اسم المنتج', 'الكمية المباعة', 'إجمالي الإيرادات'], rows);
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 md:mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 md:p-6 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-indigo-800 text-sm font-bold">الصنف الأكثر مبيعاً (كمية)</span>
                        <p className="text-lg md:text-2xl font-black text-indigo-900 mt-2">{itemStats.length > 0 ? itemStats[0].name : '-'}</p>
                        <p className="text-indigo-600 font-bold text-sm">{itemStats.length > 0 ? `${itemStats[0].quantitySold} وحدة` : ''}</p>
                    </div>
                    <Star size={40} className="text-blue-600 opacity-50" />
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-4 md:p-6 rounded-2xl border border-emerald-100 shadow-sm flex items-center justify-between">
                    <div>
                        <span className="text-emerald-800 text-sm font-bold">الصنف الأعلى إيراداً</span>
                        <p className="text-lg md:text-2xl font-black text-emerald-900 mt-2">
                            {itemStats.length > 0 ? [...itemStats].sort((a,b) => b.totalRevenue - a.totalRevenue)[0].name : '-'}
                        </p>
                        <p className="text-emerald-600 font-bold text-sm">
                            {itemStats.length > 0 ? `${[...itemStats].sort((a,b) => b.totalRevenue - a.totalRevenue)[0].totalRevenue.toLocaleString()} ر.س` : ''}
                        </p>
                    </div>
                    <TrendingUp size={40} className="text-emerald-300 opacity-50" />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                <h3 className="font-bold text-black dark:text-gray-100">قائمة الأصناف حسب الكمية المباعة</h3>
                <button onClick={handlePrint} className="w-full sm:w-auto justify-center flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition text-sm font-bold">
                    <Printer size={16} /> طباعة التقرير
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 overflow-auto min-h-0">
                <table className="w-full text-right text-sm whitespace-nowrap">
                    <thead className="bg-white dark:bg-slate-900 sticky top-0 shadow-sm z-10">
                        <tr>
                            <th className="p-4 text-black dark:text-gray-300 font-bold border-b w-16 text-center">الترتيب</th>
                            <th className="p-4 text-black dark:text-gray-300 font-bold border-b">الباركود</th>
                            <th className="p-4 text-black dark:text-gray-300 font-bold border-b">اسم المنتج</th>
                            <th className="p-4 text-black dark:text-gray-300 font-bold border-b text-center">الكمية المباعة</th>
                            <th className="p-4 text-black dark:text-gray-300 font-bold border-b">إجمالي الإيرادات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {itemStats.map((item, index) => (
                            <tr key={`${item.id || 'bestseller'}-${index}`} className="hover:bg-white transition">
                                <td className="p-4 text-center font-bold text-black">#{index + 1}</td>
                                <td className="p-4 font-mono text-black text-xs">{item.barcode}</td>
                                <td className="p-4 font-bold text-black dark:text-gray-100">{item.name}</td>
                                <td className="p-4 text-center">
                                    <span className="bg-white dark:bg-slate-700 text-blue-800 px-3 py-1 rounded-full font-bold text-xs">
                                        {item.quantitySold}
                                    </span>
                                </td>
                                <td className="p-4 font-extrabold text-emerald-600">{item.totalRevenue.toLocaleString()} <span className="text-[10px] text-black font-normal">ر.س</span></td>
                            </tr>
                        ))}
                        {itemStats.length === 0 && (
                            <tr>
                                <td colSpan={5} className="p-12 text-center text-gray-400 font-semibold">لا توجد مبيعات في هذه الفترة لتحليل الأصناف</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
