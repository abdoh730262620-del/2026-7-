import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { Printer, ChevronLeft, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { printReport } from '../../lib/printHelper';

const CASH_REPORTS = [
    { id: 'cash_movement', title: 'تقرير بحركة الصندوق', hasToggles: true },
    { id: 'capital_report', title: 'تقرير رأس المال' },
    { id: 'zakat_calculation', title: 'حساب الزكاة' },
    { id: 'tax_declaration', title: 'تقرير بالاقرار الضريبي' },
    { id: 'tax_declaration_returns', title: 'تقرير بالاقرار الضريبي معا المرتجع' },
];

export default function CashReport({ dateRange }: { dateRange: { startDate: string, endDate: string } }) {
    const [expandedReport, setExpandedReport] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    
    const [opts, setOpts] = useState({
        showAdditions: false,
        showDeductions: false,
        showFromCashScreen: false,
    });

    const toggleOpt = (key: keyof typeof opts) => {
        setOpts(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const runReport = async (reportId: string) => {
        setIsLoading(true);
        try {
            const appUser = useAuthStore.getState().appUser;
            if (!appUser) return;
            const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

            const start = new Date(dateRange.startDate).getTime();
            const end = new Date(dateRange.endDate).getTime() + 86399999;

            switch(reportId) {
                case 'cash_movement': {
                    const snap = await getDocs(query(collection(db, 'cash'), where('tenantId', '==', tenantId)));
                    let movements: any[] = [];
                    snap.forEach(doc => {
                        const d = doc.data();
                        const dateNum = d.date || d.createdAt;
                        if (dateNum >= start && dateNum <= end) {
                            movements.push(d);
                        }
                    });

                    // Toggles filtering
                    // If no type toggles are active, we can show all, or if one is active, show only that.
                    if (opts.showAdditions && !opts.showDeductions) {
                        movements = movements.filter(m => m.type === 'in');
                    } else if (opts.showDeductions && !opts.showAdditions) {
                        movements = movements.filter(m => m.type === 'out');
                    }

                    if (opts.showFromCashScreen) {
                        movements = movements.filter(m => m.category !== 'sale' && m.category !== 'purchase');
                    }

                    movements.sort((a,b) => (a.date || a.createdAt) - (b.date || b.createdAt));

                    const rows = movements.map(m => {
                        const amt = m.amount || Math.abs(m.changeAmount || 0);
                        return [
                            new Date(m.date || m.createdAt).toLocaleString('ar-EG'),
                            m.type === 'in' ? 'إضافة (وارد)' : 'خصم (منصرف)',
                            amt.toLocaleString(),
                            m.description || m.category || '-'
                        ];
                    });

                    printReport(`تقرير بحركة الصندوق`, ['التاريخ', 'النوع', 'المبلغ', 'البيان'], rows);
                    break;
                }
                case 'capital_report': {
                    // Capital = Total Cash In - Total Cash Out + Inventory Value
                    const cashSnap = await getDocs(query(collection(db, 'cash'), where('tenantId', '==', tenantId)));
                    let cashNet = 0;
                    cashSnap.forEach(doc => {
                        const d = doc.data();
                        const amt = d.amount || Math.abs(d.changeAmount || 0);
                        if (d.type === 'in') cashNet += amt;
                        else if (d.type === 'out') cashNet -= amt;
                    });

                    const prodSnap = await getDocs(query(collection(db, 'products'), where('tenantId', '==', tenantId)));
                    let inventoryValue = 0;
                    prodSnap.forEach(doc => {
                        const p = doc.data();
                        inventoryValue += (p.buyPrice || 0) * (p.quantity || 0);
                    });

                    const capital = cashNet + inventoryValue;

                    const rows = [
                        ['صافي النقدية المتوفرة', cashNet.toLocaleString() + ' ر.س'],
                        ['قيمة المخزون (بالتكلفة)', inventoryValue.toLocaleString() + ' ر.س'],
                        ['إجمالي رأس المال التقديري', capital.toLocaleString() + ' ر.س']
                    ];

                    printReport('تقرير رأس المال', ['البند', 'القيمة'], rows);
                    break;
                }
                case 'zakat_calculation': {
                    // Zakat = 2.5% of Capital
                    const cashSnap = await getDocs(query(collection(db, 'cash'), where('tenantId', '==', tenantId)));
                    let cashNet = 0;
                    cashSnap.forEach(doc => {
                        const d = doc.data();
                        const amt = d.amount || Math.abs(d.changeAmount || 0);
                        if (d.type === 'in') cashNet += amt;
                        else if (d.type === 'out') cashNet -= amt;
                    });

                    const prodSnap = await getDocs(query(collection(db, 'products'), where('tenantId', '==', tenantId)));
                    let inventoryValue = 0;
                    prodSnap.forEach(doc => {
                        const p = doc.data();
                        inventoryValue += (p.buyPrice || 0) * (p.quantity || 0);
                    });

                    const capital = cashNet + inventoryValue;
                    const zakat = capital * 0.025;

                    const rows = [
                        ['إجمالي رأس المال الخاضع للزكاة', capital.toLocaleString() + ' ر.س'],
                        ['نسبة الزكاة', '2.5%'],
                        ['الزكاة المستحقة تقديرياً', zakat.toLocaleString() + ' ر.س']
                    ];

                    printReport('تقرير حساب الزكاة', ['البند', 'القيمة'], rows);
                    break;
                }
                case 'tax_declaration':
                case 'tax_declaration_returns': {
                    const withReturns = reportId === 'tax_declaration_returns';
                    
                    const salesSnap = await getDocs(query(collection(db, 'sales'), where('tenantId', '==', tenantId)));
                    let salesAmount = 0;
                    let salesTax = 0;
                    let returnsAmount = 0;
                    let returnsTax = 0;

                    salesSnap.forEach(doc => {
                        const s = doc.data();
                        if (s.createdAt >= start && s.createdAt <= end) {
                            if (s.status !== 'cancelled' && !s.isReturn) {
                                salesAmount += (s.totalAmount || s.total || 0) - (s.taxAmount || 0);
                                salesTax += (s.taxAmount || 0);
                            } else if (withReturns && s.isReturn) {
                                returnsAmount += (s.totalAmount || s.total || 0) - (s.taxAmount || 0);
                                returnsTax += (s.taxAmount || 0);
                            }
                        }
                    });

                    const purchSnap = await getDocs(query(collection(db, 'purchases'), where('tenantId', '==', tenantId)));
                    let purchAmount = 0;
                    let purchTax = 0;

                    purchSnap.forEach(doc => {
                        const p = doc.data();
                        const pDate = p.createdAt || p.date;
                        if (p.status !== 'cancelled' && pDate >= start && pDate <= end) {
                            purchAmount += (p.totalAmount || p.total || 0) - (p.taxAmount || 0);
                            purchTax += (p.taxAmount || 0);
                        }
                    });

                    const netTax = (salesTax - returnsTax) - purchTax;

                    const rows = [
                        ['المبيعات الخاضعة للضريبة', salesAmount.toLocaleString(), salesTax.toLocaleString()],
                    ];
                    
                    if (withReturns) {
                        rows.push(['مرتجعات المبيعات الخاضعة للضريبة', returnsAmount.toLocaleString(), returnsTax.toLocaleString()]);
                        rows.push(['صافي المبيعات', (salesAmount - returnsAmount).toLocaleString(), (salesTax - returnsTax).toLocaleString()]);
                    }

                    rows.push(['المشتريات الخاضعة للضريبة', purchAmount.toLocaleString(), purchTax.toLocaleString()]);
                    rows.push(['صافي الضريبة ' + (netTax >= 0 ? '(مستحقة للدفع)' : '(رصيد دائن)'), '-', netTax.toLocaleString()]);

                    printReport(withReturns ? 'تقرير الاقرار الضريبي مع المرتجع' : 'تقرير الاقرار الضريبي', ['البند', 'المبلغ غير شامل الضريبة', 'الضريبة'], rows);
                    break;
                }
            }
        } catch (e) {
            console.error(e);
            alert('حدث خطأ أثناء إعداد التقرير');
        }
        setIsLoading(false);
    };

    const renderToggle = (label: string, key: keyof typeof opts) => (
        <label className="flex items-center gap-3 cursor-pointer py-2 px-1 hover:bg-white rounded-lg group">
            <input type="checkbox" checked={opts[key]} onChange={() => toggleOpt(key)} className="hidden" />
            <div className={`transition-colors text-gray-300 group-hover:text-gray-400`}>
                {opts[key] ? <ToggleRight className="text-blue-500" size={34} /> : <ToggleLeft size={34} />}
            </div>
            <span className="text-[13px] font-bold text-black dark:text-gray-300 tracking-wide">{label}</span>
        </label>
    );

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900/50">
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 custom-scrollbar">
                <div className="max-w-2xl mx-auto flex flex-col bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
                    {CASH_REPORTS.map((rep) => {
                        const isExpanded = expandedReport === rep.id;
                        
                        return (
                            <div key={rep.id} className="border-b border-gray-100 last:border-0 flex flex-col transition-colors">
                                <div 
                                    onClick={() => setExpandedReport(isExpanded ? '' : rep.id)}
                                    className={`flex justify-between items-center p-4 md:p-5 cursor-pointer transition-colors group ${isExpanded ? 'bg-white dark:bg-slate-800' : 'hover:bg-white'}`}
                                >
                                    <div className="flex justify-start w-full">
                                        <span className={`font-black text-[15px] ${isExpanded ? 'text-blue-900' : 'text-black dark:text-gray-100'}`}>{rep.title}</span>
                                    </div>
                                    <ChevronLeft className={`text-blue-800 transition-transform ${isExpanded ? '-rotate-90' : 'opacity-40 group-hover:opacity-70'}`} size={24} />
                                </div>

                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-2 bg-white dark:bg-slate-800 flex flex-col gap-5 slide-down">
                                        
                                        {rep.hasToggles && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-1 bg-white p-3 rounded-xl border border-gray-100 shadow-sm w-full md:w-3/4">
                                                {renderToggle('اظهار حركات الاضافة', 'showAdditions')}
                                                {renderToggle('اظهار حركات الخصم', 'showDeductions')}
                                                {renderToggle('اظهار الحركات من شاشة الصندوق', 'showFromCashScreen')}
                                            </div>
                                        )}

                                        <div className="pt-3 border-t border-gray-100 mt-2">
                                            <button 
                                                onClick={() => runReport(rep.id)}
                                                disabled={isLoading}
                                                className="bg-blue-600 hover:bg-blue-700 text-white font-black py-3 px-8 rounded-xl shadow-[0_4px_12px_-4px_rgba(37,99,235,0.5)] transition-all flex items-center justify-center gap-2 text-[13px] disabled:opacity-50 w-full md:w-auto"
                                            >
                                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                                                عرض وطباعة التقرير
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
