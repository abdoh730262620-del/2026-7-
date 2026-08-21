import React, { useState, useEffect } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Printer, Calculator, FileCheck, Landmark } from 'lucide-react';
import { printReport } from '../../lib/printHelper';
import { LocalCache } from '../../lib/localCache';

import { useAuthStore } from '../../store/authStore';

export default function TaxReport({ dateRange }: { dateRange: { startDate: string, endDate: string } }) {
    const { appUser } = useAuthStore();
    const [taxData, setTaxData] = useState({
        salesTotal: 0,
        salesTax: 0,
        purchasesTotal: 0,
        purchasesTax: 0,
    });

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || 'single_store';

        const start = new Date(dateRange.startDate).getTime();
        const end = new Date(dateRange.endDate).getTime() + 86400000;

        const loadTaxData = async () => {
            try {
                // Fetch sales from cache/firestore
                const qSales = query(collection(db, 'sales'), where('tenantId', '==', tenantId), limit(1500));
                const salesResult = await LocalCache.fetchCollection<any>('sales', tenantId, qSales);

                // Fetch purchases from cache/firestore
                const qPurch = query(collection(db, 'purchases'), where('tenantId', '==', tenantId), limit(1500));
                const purchasesResult = await LocalCache.fetchCollection<any>('purchases', tenantId, qPurch);

                let sTotal = 0;
                let sTax = 0;
                salesResult.data.forEach(d => {
                    if (d.status !== 'cancelled' && d.createdAt >= start && d.createdAt <= end) {
                        const total = d.totalAmount || d.total || 0;
                        const tax = d.taxAmount || d.tax || 0;
                        sTotal += (total - tax); // Net sales without tax
                        sTax += tax;
                    }
                });

                let pTotal = 0;
                let pTax = 0;
                purchasesResult.data.forEach(d => {
                    const ts = d.createdAt || d.date;
                    if (d.status !== 'cancelled' && ts >= start && ts <= end) {
                        const total = d.totalAmount || d.total || 0;
                        const tax = d.taxAmount || d.tax || 0;
                        pTotal += (total - tax);
                        pTax += tax;
                    }
                });

                setTaxData({
                    salesTotal: sTotal,
                    salesTax: sTax,
                    purchasesTotal: pTotal,
                    purchasesTax: pTax
                });
            } catch (err) {
                console.error('Failed to load tax data from cache/firestore:', err);
            }
        };

        loadTaxData();
    }, [dateRange, appUser]);

    const netTaxPayable = taxData.salesTax - taxData.purchasesTax;

    const handlePrint = () => {
        const rows = [
            ['مبيعات الفترة (بدون ضريبة)', taxData.salesTotal.toLocaleString() + ' ر.س'],
            ['ضريبة القيمة المضافة المحصلة (مبيعات)', taxData.salesTax.toLocaleString() + ' ر.س'],
            ['مشتريات الفترة (بدون ضريبة)', taxData.purchasesTotal.toLocaleString() + ' ر.س'],
            ['ضريبة القيمة المضافة المدفوعة (مشتريات)', taxData.purchasesTax.toLocaleString() + ' ر.س'],
            ['صافي الضريبة المستحقة للسداد', netTaxPayable.toLocaleString() + ' ر.س']
        ];
        printReport(`التقرير الضريبي التفصيلي - الفترة من ${dateRange.startDate} إلى ${dateRange.endDate}`, ['البند', 'القيمة الإجمالية'], rows);
    };

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-5 md:mb-8 text-right">
                <div className="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-gray-100 shadow-sm space-y-6">
                    <div className="flex items-center gap-4 text-green-600 border-b border-gray-50 pb-4">
                        <FileCheck size={28} />
                        <h3 className="font-black text-base md:text-xl">ضريبة المبيعات (المحصلة)</h3>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-black">إجمالي المبيعات (بدون ضريبة)</span>
                        <span className="font-bold text-black dark:text-gray-100">{taxData.salesTotal.toLocaleString()} ر.س</span>
                    </div>
                    <div className="flex justify-between items-center py-4 bg-white px-4 rounded-2xl">
                        <span className="font-bold text-green-800">إجمالي الضريبة (15%)</span>
                        <span className="text-lg md:text-2xl font-black text-green-700">{taxData.salesTax.toLocaleString()} ر.س</span>
                    </div>
                </div>

                <div className="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-gray-100 shadow-sm space-y-6">
                    <div className="flex items-center gap-4 text-purple-600 border-b border-gray-50 pb-4">
                        <Calculator size={28} />
                        <h3 className="font-black text-base md:text-xl">ضريبة المشتريات (المدفوعة)</h3>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-black">إجمالي المشتريات (بدون ضريبة)</span>
                        <span className="font-bold text-black dark:text-gray-100">{taxData.purchasesTotal.toLocaleString()} ر.س</span>
                    </div>
                    <div className="flex justify-between items-center py-4 bg-white px-4 rounded-2xl">
                        <span className="font-bold text-purple-800">إجمالي الضريبة المستردة</span>
                        <span className="text-lg md:text-2xl font-black text-purple-700">{taxData.purchasesTax.toLocaleString()} ر.س</span>
                    </div>
                </div>

                <div className="md:col-span-2 bg-gradient-to-r from-blue-600 to-blue-800 p-5 md:p-8 rounded-2xl md:rounded-3xl shadow-xl text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform">
                        <Landmark size={150} />
                    </div>
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6">
                         <div>
                            <h3 className="text-lg md:text-2xl font-black mb-2">صافي الضريبة الواجب سدادها للهيئة</h3>
                            <p className="text-gray-200 text-sm max-w-lg">تم احتساب هذا المبلغ بناءً على الفرق بين ضريبة مبيعاتك وضريبة مشترياتك في الفترة المحددة.</p>
                         </div>
                         <div className="text-center md:text-left">
                            <div className="text-sm text-blue-600 mb-1 font-bold">المبلـغ المستحـق</div>
                            <div className="text-5xl font-black" dir="ltr">{netTaxPayable.toLocaleString()} <span className="text-base md:text-xl font-normal">ر.س</span></div>
                         </div>
                    </div>
                </div>
            </div>

            <div className="flex justify-center">
                 <button onClick={handlePrint} className="flex items-center gap-3 bg-gray-800 text-white px-10 py-4 rounded-2xl hover:bg-gray-900 transition-all font-black shadow-lg hover:shadow-xl active:scale-95">
                    <Printer size={20} /> طباعة إقرار ضريبي تقديري
                 </button>
            </div>
            
            <p className="text-center text-xs text-gray-400 mt-4 md:mt-8 mb-4 max-w-2xl mx-auto">
                ملاحظة: هذا التقرير هو مجرد تقدير بناءً على العمليات المسجلة في النظام، ولا يعتبر إقراراً رسمياً. يرجى مراجعة محاسبك القانوني قبل تقديم الإقرارات.
            </p>
        </div>
    );
}
