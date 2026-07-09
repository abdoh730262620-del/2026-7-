import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Printer, ChevronLeft, Loader2, Download } from 'lucide-react';
import { printReport, printInvoice } from '../../lib/printHelper';
import SearchableSelect from '../../components/SearchableSelect';
import * as XLSX from 'xlsx';

const MAIN_REPORTS = [
    { id: 'purchases', title: 'تقرير بالمشتريات', hasSubTypes: true },
    { id: 'view_purchases', title: 'عرض فواتير المشتريات' },
    { id: 'purchase_returns', title: 'تقرير بالفواتير المرتجع مشتريات' },
    { id: 'cancelled_purchases', title: 'تقرير بفواتير المشتريات التي تم الغائها' },
    { id: 'purchase_orders', title: 'تقرير بطلبات الشراء' },
];

const PURCHASES_SUB_TYPES = [
    { id: 'general', title: 'تقرير المشتريات' },
    { id: 'by_item', title: 'تقرير بالمشتريات حسب الصنف' },
    { id: 'by_category', title: 'تقرير بالمشتريات حسب التصنيف' },
    { id: 'cash', title: 'تقرير بالمشتريات النقد' },
    { id: 'credit', title: 'تقرير بالمشتريات الاجل' },
    { id: 'all', title: 'تقرير بالمشتريات الكل' },
    { id: 'by_supplier', title: 'تقرير بالمشتريات حسب المورد' },
    { id: 'excel', title: 'تقرير بالمشتريات اکسل' },
    { id: 'excel_items', title: 'تقرير بالمشتريات اكسل معا المنتجات' },
];

import { useAuthStore } from '../../store/authStore';

export default function PurchasesReport({ dateRange }: { dateRange: { startDate: string, endDate: string } }) {
    const { appUser } = useAuthStore();
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [expandedReport, setExpandedReport] = useState<string>('');
    const [selectedSubType, setSelectedSubType] = useState<string>('general');
    const [selectedSupplierName, setSelectedSupplierName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

        const unsubSupp = onSnapshot(query(collection(db, 'suppliers'), where('tenantId', '==', tenantId)), snap => {
            setSuppliers(snap.docs.map(d => ({id: d.id, ...d.data()})));
        }, (error) => handleFirestoreError(error, OperationType.GET, 'suppliers'));
        return () => unsubSupp();
    }, [appUser]);

    const generateExcel = (data: any[], filename: string) => {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        XLSX.writeFile(wb, `${filename}.xlsx`);
    };

    const runReport = async (reportId: string) => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

        setIsLoading(true);
        try {
            const start = new Date(dateRange.startDate).getTime();
            const end = new Date(dateRange.endDate).getTime() + 86399999;
            
            const pSnap = await getDocs(query(collection(db, 'purchases'), where('tenantId', '==', tenantId)));
            const purchases = pSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            
            let filteredPurchases = purchases.filter(p => {
                const d = p.createdAt || p.date;
                return d >= start && d <= end;
            });

            if (reportId === 'view_purchases') {
                const p = filteredPurchases.filter(p => p.status !== 'cancelled' && p.status !== 'returned');
                const rows = p.map(i => ['#' + i.invoiceNumber, new Date(i.createdAt || i.date).toLocaleDateString('ar-EG'), i.supplierId ? suppliers.find(s => s.id === i.supplierId)?.name || 'غير معروف' : 'نقدي', i.paymentType === 'cash' ? 'نقدي' : 'آجل', (i.totalAmount || i.total || 0).toLocaleString()]);
                printReport(`فواتير المشتريات`, ['رقم الفاتورة', 'التاريخ', 'المورد', 'طريقة الدفع', 'المبلغ'], rows);
            } else if (reportId === 'purchase_returns') {
                const p = filteredPurchases.filter(p => p.status === 'returned');
                const rows = p.map(i => ['#' + i.invoiceNumber, new Date(i.createdAt || i.date).toLocaleDateString('ar-EG'), typeof i.totalAmount === 'number' ? i.totalAmount.toLocaleString() : '0']);
                printReport(`فواتير مرتجع مشتريات`, ['رقم الفاتورة', 'التاريخ', 'المبلغ'], rows);
            } else if (reportId === 'cancelled_purchases') {
                const p = filteredPurchases.filter(p => p.status === 'cancelled');
                const rows = p.map(i => ['#' + i.invoiceNumber, new Date(i.createdAt || i.date).toLocaleDateString('ar-EG'), typeof i.totalAmount === 'number' ? i.totalAmount.toLocaleString() : '0']);
                printReport(`فواتير مشتريات ملغاة`, ['رقم الفاتورة', 'التاريخ', 'المبلغ'], rows);
            } else if (reportId === 'purchase_orders') {
                alert('طلبات الشراء غير مفعلة حالياً');
            } else if (reportId === 'purchases') {
                let validPurchases = filteredPurchases.filter(p => p.status !== 'cancelled' && p.status !== 'returned');
                
                if (selectedSubType === 'cash') {
                    validPurchases = validPurchases.filter(p => p.paymentType === 'cash');
                } else if (selectedSubType === 'credit') {
                    validPurchases = validPurchases.filter(p => p.paymentType === 'credit');
                } else if (selectedSubType === 'by_supplier') {
                    const supp = suppliers.find(s => s.name === selectedSupplierName);
                    if (!supp) {
                        alert('الرجاء اختيار مورد صحيح');
                        setIsLoading(false);
                        return;
                    }
                    validPurchases = validPurchases.filter(p => p.supplierId === supp.id);
                }

                if (selectedSubType === 'excel') {
                    const exportData = validPurchases.map(p => ({
                        'رقم الفاتورة': p.invoiceNumber,
                        'التاريخ': new Date(p.createdAt || p.date).toLocaleString('ar-EG'),
                        'المورد': p.supplierId ? suppliers.find(s => s.id === p.supplierId)?.name || 'غير معروف' : 'نقدي',
                        'طريقة الدفع': p.paymentType === 'cash' ? 'نقدي' : 'آجل',
                        'المبلغ': p.totalAmount || p.total || 0,
                        'الضريبة': p.taxAmount || 0,
                    }));
                    generateExcel(exportData, `المشتريات_${dateRange.startDate}`);
                    setIsLoading(false);
                    return;
                } else if (selectedSubType === 'excel_items') {
                    const exportData: any[] = [];
                    validPurchases.forEach(p => {
                        if (p.items) {
                            p.items.forEach((item: any) => {
                                exportData.push({
                                    'رقم الفاتورة': p.invoiceNumber,
                                    'التاريخ': new Date(p.createdAt || p.date).toLocaleString('ar-EG'),
                                    'المورد': p.supplierId ? suppliers.find(s => s.id === p.supplierId)?.name || 'غير معروف' : 'نقدي',
                                    'الصنف': item.name,
                                    'الكمية': item.quantity,
                                    'سعر الوحدة': item.price || item.costPrice || 0,
                                    'الإجمالي': item.total || ((item.price || item.costPrice || 0) * item.quantity),
                                });
                            });
                        }
                    });
                    generateExcel(exportData, `مشتريات_المنتجات_${dateRange.startDate}`);
                    setIsLoading(false);
                    return;
                } else if (selectedSubType === 'by_item') {
                    const itemsMap = new Map();
                    validPurchases.forEach(p => {
                        if (p.items) {
                            p.items.forEach((it: any) => {
                                const ex = itemsMap.get(it.name) || { qty: 0, sum: 0 };
                                itemsMap.set(it.name, { qty: ex.qty + it.quantity, sum: ex.sum + (it.total || ((it.price || it.costPrice || 0) * it.quantity)) });
                            });
                        }
                    });
                    const rows = Array.from(itemsMap.entries()).map(([k,v]) => [k, v.qty.toString(), v.sum.toLocaleString()]);
                    printReport(`المشتريات حسب الصنف`, ['الصنف', 'الكمية', 'الإجمالي'], rows);
                } else if (selectedSubType === 'by_category') {
                    const catMap = new Map();
                    validPurchases.forEach(p => {
                        if (p.items) {
                            p.items.forEach((it: any) => {
                                const cat = it.category || 'غير مصنف';
                                const ex = catMap.get(cat) || { qty: 0, sum: 0 };
                                catMap.set(cat, { qty: ex.qty + it.quantity, sum: ex.sum + (it.total || ((it.price || it.costPrice || 0) * it.quantity)) });
                            });
                        }
                    });
                    const rows = Array.from(catMap.entries()).map(([k,v]) => [k, v.qty.toString(), v.sum.toLocaleString()]);
                    printReport(`المشتريات حسب التصنيف`, ['التصنيف', 'الكمية', 'الإجمالي'], rows);
                } else {
                    const rows = validPurchases.map(p => [
                        p.invoiceNumber,
                        new Date(p.createdAt || p.date).toLocaleDateString('ar-EG'),
                        p.supplierId ? suppliers.find(s => s.id === p.supplierId)?.name || 'غير معروف' : 'نقدي',
                        p.paymentType === 'cash' ? 'نقدي' : 'آجل',
                        (p.totalAmount || p.total || 0).toLocaleString()
                    ]);
                    const subTitle = PURCHASES_SUB_TYPES.find(s => s.id === selectedSubType)?.title || 'التقرير';
                    printReport(subTitle, ['رقم الفاتورة', 'التاريخ', 'المورد', 'طريقة الدفع', 'المبلغ'], rows);
                }
            }

        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء إعداد التقرير');
        }
        setIsLoading(false);
    };

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900/50">
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 custom-scrollbar">

                <div className="max-w-2xl mx-auto flex flex-col bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
                    {MAIN_REPORTS.map((rep) => {
                        const isExpanded = expandedReport === rep.id;
                        
                        return (
                            <div key={rep.id} className="border-b border-gray-100 last:border-0 flex flex-col transition-colors">
                                {/* Row Header */}
                                <div 
                                    onClick={() => setExpandedReport(isExpanded ? '' : rep.id)}
                                    className={`flex justify-between items-center p-4 md:p-5 cursor-pointer transition-colors group ${isExpanded ? 'bg-white' : 'hover:bg-white'}`}
                                >
                                    <div className="flex justify-start w-full">
                                        <span className={`font-black text-[15px] ${isExpanded ? 'text-purple-900' : 'text-black dark:text-gray-100'}`}>{rep.title}</span>
                                    </div>
                                    <ChevronLeft className={`text-purple-800 transition-transform ${isExpanded ? '-rotate-90' : 'opacity-40 group-hover:opacity-70'}`} size={24} />
                                </div>

                                {/* Expanded Area */}
                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-2 bg-white flex flex-col gap-5 slide-down">
                                        
                                        {rep.hasSubTypes && (
                                            <div className="flex flex-col gap-4">
                                                <select 
                                                    value={selectedSubType}
                                                    onChange={(e) => setSelectedSubType(e.target.value)}
                                                    className="w-full md:w-3/4 p-3.5 text-sm font-bold border-2 border-transparent bg-white shadow-sm rounded-xl focus:border-purple-200 focus:ring-4 focus:ring-purple-50 transition outline-none text-black dark:text-gray-100 appearance-none cursor-pointer"
                                                >
                                                    {PURCHASES_SUB_TYPES.map(sub => (
                                                        <option key={sub.id} value={sub.id}>{sub.title}</option>
                                                    ))}
                                                </select>

                                                {selectedSubType === 'by_supplier' && (
                                                    <div className="w-full md:w-3/4">
                                                        <SearchableSelect 
                                                            options={suppliers.map(p => p.name)}
                                                            value={selectedSupplierName}
                                                            onChange={setSelectedSupplierName}
                                                            placeholder={`ادخل أو اختر اسم المورد...`}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="pt-3 border-t border-gray-100 mt-2">
                                            <button 
                                                onClick={() => runReport(rep.id)}
                                                disabled={isLoading}
                                                className="bg-red-600 hover:bg-red-700 text-white font-black py-3 px-8 rounded-xl shadow-[0_4px_12px_-4px_rgba(220,38,38,0.5)] transition-all flex items-center justify-center gap-2 text-[13px] disabled:opacity-50 w-full md:w-auto"
                                            >
                                                {isLoading ? (
                                                    <Loader2 size={18} className="animate-spin" />
                                                ) : selectedSubType.includes('excel') && rep.hasSubTypes ? (
                                                    <Download size={18} />
                                                ) : (
                                                    <Printer size={18} />
                                                )}
                                                {selectedSubType.includes('excel') && rep.hasSubTypes ? 'تصدير إكسل' : 'عرض وطباعة التقرير'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            <style>{`
                .slide-down { animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards; transform-origin: top; }
                @keyframes slideDown { from { opacity: 0; transform: translateY(-4px) scaleY(0.98); } to { opacity: 1; transform: translateY(0) scaleY(1); } }
            `}</style>
        </div>
    );
}
