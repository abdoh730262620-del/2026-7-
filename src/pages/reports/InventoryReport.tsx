import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Printer, ChevronLeft, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { printReport } from '../../lib/printHelper';
import SearchableSelect from '../../components/SearchableSelect';

const INVENTORY_REPORTS = [
    { id: 'inventory_count', title: 'جرد مخزني', hasToggles: true },
    { id: 'inventory_by_category', title: 'جرد مخزني حسب التصنيف' },
    { id: 'inventory_for_category', title: 'جرد مخزني لتصنيف', requiresCategory: true },
    { id: 'products_by_expiry', title: 'تقرير بالمنتجات حسب تاريخ الانتهاء' },
    { id: 'product_movement', title: 'تقرير بحركه منتج', requiresProduct: true },
    { id: 'damaged_products', title: 'تقرير بالمنتجات التالفة' },
];

import { useAuthStore } from '../../store/authStore';

export default function InventoryReport({ dateRange }: { dateRange?: { startDate: string, endDate: string } }) {
    const { appUser } = useAuthStore();
    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    
    const [expandedReport, setExpandedReport] = useState<string>('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedProductName, setSelectedProductName] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    
    const [opts, setOpts] = useState({
        showAvailable: false
    });

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || 'single_store';

        const unsub = onSnapshot(query(collection(db, 'products'), where('tenantId', '==', tenantId)), (snap) => {
            const arr: any[] = [];
            const cats = new Set<string>();
            snap.forEach(doc => {
                const data = doc.data();
                arr.push({ id: doc.id, ...data });
                if (data.category && data.category !== 'General') {
                    cats.add(String(data.category));
                }
            });
            setProducts(arr);
            setCategories(Array.from(cats));
        }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));
        return () => unsub();
    }, [appUser]);

    const toggleOpt = (key: keyof typeof opts) => {
        setOpts(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const runReport = async (reportId: string) => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || 'single_store';
        
        setIsLoading(true);
        try {
            switch(reportId) {
                case 'inventory_count': {
                    let filteredProducts = products.sort((a,b) => (b.quantity || 0) - (a.quantity || 0));
                    if (opts.showAvailable) {
                        filteredProducts = filteredProducts.filter(p => (p.quantity || 0) > 0);
                    }
                    const rows = filteredProducts.map(p => [
                        p.barcode || '-',
                        p.name,
                        p.quantity || 0,
                        (p.buyPrice || 0).toLocaleString(),
                        (p.price || 0).toLocaleString()
                    ]);
                    printReport(`جرد مخزني${opts.showAvailable ? ' (الكميات المتوفرة)' : ''}`, ['الباركود', 'اسم المنتج', 'الكمية الحالية', 'سعر الشراء', 'سعر البيع'], rows);
                    break;
                }
                case 'inventory_by_category': {
                    const catMap = new Map();
                    products.forEach(p => {
                        const cat = p.category || 'عام';
                        const ex = catMap.get(cat) || { count: 0, qty: 0, val: 0 };
                        catMap.set(cat, {
                            count: ex.count + 1,
                            qty: ex.qty + (p.quantity || 0),
                            val: ex.val + ((p.quantity || 0) * (p.buyPrice || 0))
                        });
                    });
                    const rows = Array.from(catMap.entries()).map(([k,v]) => [
                        k,
                        v.count.toString(),
                        v.qty.toString(),
                        v.val.toLocaleString()
                    ]);
                    printReport(`جرد مخزني حسب التصنيف`, ['التصنيف', 'عدد الأصناف', 'إجمالي الكمية', 'إجمالي قيمة التكلفة'], rows);
                    break;
                }
                case 'inventory_for_category': {
                    if (!selectedCategory) {
                        alert('الرجاء اختيار التصنيف');
                        setIsLoading(false);
                        return;
                    }
                    const filteredProducts = products.filter(p => (p.category || 'عام') === selectedCategory);
                    const rows = filteredProducts.map(p => [
                        p.barcode || '-',
                        p.name,
                        p.quantity || 0,
                        (p.buyPrice || 0).toLocaleString(),
                        (p.price || 0).toLocaleString()
                    ]);
                    printReport(`جرد مخزني لتصنيف: ${selectedCategory}`, ['الباركود', 'اسم المنتج', 'الكمية الحالية', 'سعر الشراء', 'سعر البيع'], rows);
                    break;
                }
                case 'products_by_expiry': {
                    const expProducts = products.filter(p => p.expiryDate);
                    expProducts.sort((a,b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
                    const rows = expProducts.map(p => [
                        p.barcode || '-',
                        p.name,
                        p.quantity || 0,
                        new Date(p.expiryDate).toLocaleDateString('ar-EG')
                    ]);
                    printReport(`المنتجات ذات تاريخ انتهاء`, ['الباركود', 'اسم المنتج', 'الكمية الحالية', 'تاريخ الانتهاء'], rows);
                    break;
                }
                case 'product_movement': {
                    if (!selectedProductName) {
                        alert('الرجاء كتابة أو اختيار اسم المنتج');
                        setIsLoading(false);
                        return;
                    }
                    const product = products.find(p => p.name === selectedProductName);
                    if (!product) {
                        alert('المنتج غير موجود');
                        setIsLoading(false);
                        return;
                    }

                    const start = dateRange ? new Date(dateRange.startDate).getTime() : 0;
                    const end = dateRange ? new Date(dateRange.endDate).getTime() + 86399999 : Infinity;
                    
                    const movements: any[] = [];

                    const salesSnap = await getDocs(query(collection(db, 'sales'), where('tenantId', '==', tenantId)));
                    salesSnap.forEach(d => {
                        const s = d.data();
                        if (s.status !== 'cancelled' && s.createdAt >= start && s.createdAt <= end) {
                            if (s.items) {
                                s.items.forEach((it: any) => {
                                    if (it.name === product.name) {
                                        movements.push({ date: s.createdAt, type: 'مبيعات', ref: s.invoiceNumber, qty: -it.quantity, desc: `فاتورة مبيعات ${s.paymentType === 'cash' ? 'نقدية' : 'آجلة'}` });
                                    }
                                });
                            }
                        }
                    });

                    const purchSnap = await getDocs(query(collection(db, 'purchases'), where('tenantId', '==', tenantId)));
                    purchSnap.forEach(d => {
                        const p = d.data();
                        const pDate = p.createdAt || p.date;
                        if (p.status !== 'cancelled' && pDate >= start && pDate <= end) {
                            if (p.items) {
                                p.items.forEach((it: any) => {
                                    if (it.name === product.name) {
                                        movements.push({ date: pDate, type: 'مشتريات', ref: p.invoiceNumber, qty: it.quantity, desc: `فاتورة مشتريات ${p.paymentType === 'cash' ? 'نقدية' : 'آجلة'}` });
                                    }
                                });
                            }
                        }
                    });

                    const adjSnap = await getDocs(query(collection(db, 'adjustments'), where('tenantId', '==', tenantId)));
                    adjSnap.forEach(d => {
                        const a = d.data();
                        if (a.productId === product.id && a.date >= start && a.date <= end) {
                            movements.push({ date: a.date, type: 'تسوية (جرد)', ref: '-', qty: a.diff, desc: `تغيير الكمية من ${a.oldQuantity} إلى ${a.newQuantity} (بواسطة: ${a.userName || 'النظام'})` });
                        }
                    });

                    movements.sort((a,b) => a.date - b.date);

                    let runningQty = 0;
                    const rows = movements.map(m => {
                        runningQty += m.qty;
                        return [
                            new Date(m.date).toLocaleDateString('ar-EG'),
                            m.type,
                            m.ref,
                            m.desc,
                            m.qty > 0 ? m.qty.toString() : '-',
                            m.qty < 0 ? Math.abs(m.qty).toString() : '-',
                            runningQty.toString()
                        ];
                    });

                    printReport(`حركة المنتج: ${product.name}`, ['التاريخ', 'النوع', 'رقم المرجع', 'البيان', 'وارد', 'منصرف', 'الرصيد التراكمي (ضمن الفترة)'], rows);
                    break;
                }
                case 'damaged_products': {
                    // For demo, we check adjustments with negative diff as damaged/lost.
                    const adjSnap = await getDocs(query(collection(db, 'adjustments'), where('tenantId', '==', tenantId)));
                    const rows: any[] = [];
                    const start = dateRange ? new Date(dateRange.startDate).getTime() : 0;
                    const end = dateRange ? new Date(dateRange.endDate).getTime() + 86399999 : Infinity;
                    
                    adjSnap.forEach(d => {
                        const a = d.data();
                        if (a.date >= start && a.date <= end && a.diff < 0) {
                            rows.push([
                                new Date(a.date).toLocaleDateString('ar-EG'),
                                a.productName || '-',
                                Math.abs(a.diff).toString(),
                                a.userName || 'النظام'
                            ]);
                        }
                    });

                    printReport(`المنتجات التالفة / الفروقات السالبة`, ['التاريخ', 'اسم المنتج', 'تلف / نقص', 'المستخدم'], rows);
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
                {opts[key] ? <ToggleRight className="text-emerald-500" size={34} /> : <ToggleLeft size={34} />}
            </div>
            <span className="text-[13px] font-bold text-black dark:text-gray-300 tracking-wide">{label}</span>
        </label>
    );

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900/50">
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 custom-scrollbar">

                <div className="max-w-2xl mx-auto flex flex-col bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
                    {INVENTORY_REPORTS.map((rep) => {
                        const isExpanded = expandedReport === rep.id;
                        
                        return (
                            <div key={rep.id} className="border-b border-gray-100 last:border-0 flex flex-col transition-colors">
                                <div 
                                    onClick={() => setExpandedReport(isExpanded ? '' : rep.id)}
                                    className={`flex justify-between items-center p-4 md:p-5 cursor-pointer transition-colors group ${isExpanded ? 'bg-white' : 'hover:bg-white'}`}
                                >
                                    <div className="flex justify-start w-full">
                                        <span className={`font-black text-[15px] ${isExpanded ? 'text-red-900' : 'text-black dark:text-gray-100'}`}>{rep.title}</span>
                                    </div>
                                    <ChevronLeft className={`text-red-800 transition-transform ${isExpanded ? '-rotate-90' : 'opacity-40 group-hover:opacity-70'}`} size={24} />
                                </div>

                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-2 bg-white flex flex-col gap-5 slide-down">
                                        
                                        {rep.requiresCategory && (
                                            <div className="flex flex-col gap-2">
                                                <select 
                                                    value={selectedCategory}
                                                    onChange={e => setSelectedCategory(e.target.value)}
                                                    className="w-full md:w-3/4 p-3.5 text-sm font-bold border-2 border-transparent bg-white shadow-sm rounded-xl focus:border-red-200 focus:ring-4 focus:ring-red-50 transition outline-none text-black dark:text-gray-100"
                                                >
                                                    <option value="">اختر التصنيف...</option>
                                                    <option value="عام">عام</option>
                                                    {categories.map((c, index) => <option key={`${c}-${index}`} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                        )}

                                        {rep.requiresProduct && (
                                            <div className="flex flex-col gap-2">
                                                <div className="w-full md:w-3/4">
                                                    <SearchableSelect 
                                                        options={products.map(p => p.name)}
                                                        value={selectedProductName}
                                                        onChange={setSelectedProductName}
                                                        placeholder="ادخل أو اختر اسم المنتج..."
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {rep.hasToggles && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-1 bg-white p-3 rounded-xl border border-gray-100 shadow-sm w-full md:w-3/4">
                                                {renderToggle('اظهار الكميات المتوفره', 'showAvailable')}
                                            </div>
                                        )}

                                        <div className="pt-3 border-t border-gray-100 mt-2">
                                            <button 
                                                onClick={() => runReport(rep.id)}
                                                disabled={isLoading}
                                                className="bg-red-600 hover:bg-red-700 text-white font-black py-3 px-8 rounded-xl shadow-[0_4px_12px_-4px_rgba(220,38,38,0.5)] transition-all flex items-center justify-center gap-2 text-[13px] disabled:opacity-50 w-full md:w-auto"
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

