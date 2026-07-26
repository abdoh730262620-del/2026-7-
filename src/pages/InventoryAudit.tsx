import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, updateDoc, doc, addDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Search, ClipboardCheck, History, Save, ArrowLeftRight, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { logUserAction } from '../lib/logger';
import { motion } from 'framer-motion';

interface Product {
    id: string;
    name: string;
    barcode: string;
    quantity: number;
}

interface AuditItem {
    productId: string;
    productName: string;
    systemQuantity: number;
    actualQuantity: number;
}

import { useNavigate } from 'react-router-dom';

export default function InventoryAudit() {
    const navigate = useNavigate();
    const { appUser } = useAuthStore();
    const [products, setProducts] = useState<Product[]>([]);
    const [search, setSearch] = useState('');
    const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');
        const q = query(collection(db, 'products'), where('tenantId', '==', tenantId));
        return onSnapshot(q, (snap) => {
            const list: Product[] = [];
            snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Product));
            setProducts(list);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));
    }, [appUser]);

    const filtered = products.filter(p => 
        p.name.includes(search) || p.barcode.includes(search)
    ).slice(0, 10);

    const addToAudit = (p: Product) => {
        if (auditItems.find(item => item.productId === p.id)) return;
        setAuditItems([...auditItems, {
            productId: p.id,
            productName: p.name,
            systemQuantity: p.quantity,
            actualQuantity: p.quantity
        }]);
        setSearch('');
    };

    const handleActualChange = (id: string, val: string) => {
        const num = parseInt(val) || 0;
        setAuditItems(auditItems.map(item => 
            item.productId === id ? { ...item, actualQuantity: num } : item
        ));
    };

    const submitAudit = async () => {
        if (auditItems.length === 0 || !appUser) return;
        setIsSaving(true);
        try {
            const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');
            for (const item of auditItems) {
                if (item.actualQuantity !== item.systemQuantity) {
                    // Update stock
                    await updateDoc(doc(db, 'products', item.productId), {
                        quantity: item.actualQuantity,
                        updatedAt: Date.now()
                    });
                    
                    // Log adjustment
                    await addDoc(collection(db, 'adjustments'), {
                        productId: item.productId,
                        productName: item.productName,
                        oldQuantity: item.systemQuantity,
                        newQuantity: item.actualQuantity,
                        diff: item.actualQuantity - item.systemQuantity,
                        userId: appUser?.uid,
                        userName: appUser?.name,
                        date: Date.now(),
                        tenantId
                    });
                }
            }
            await logUserAction('جرد مخزني', `تم تنفيذ جرد لـ ${auditItems.length} صنف`);
            setSuccessMessage('تم تصويب المخزون وتسجيل التسويات بنجاح');
            setAuditItems([]);
            setTimeout(() => setSuccessMessage(''), 3000);
        } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, 'products');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="w-full pb-20 px-2 lg:px-4" dir="rtl">
            <div className="flex items-center gap-4 mb-6 shrink-0 py-2">
                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
                    <ClipboardCheck size={20} className="stroke-[2.5]" />
                </div>
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-black dark:text-white leading-tight">جرد وتصويب المخزون</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">تحديث الكميات ومطابقة الجرد الفعلي للمنتجات</p>
                </div>
            </div>
            {successMessage && (
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 md:mb-6 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-2xl flex items-center gap-3 font-bold text-sm shadow-sm"
                >
                    <CheckCircle2 size={24} />
                    {successMessage}
                </motion.div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-5 md:gap-6">
                {/* Search & Select Section */}
                <div className="xl:col-span-1 space-y-5">
                    <div className="bg-white dark:bg-slate-950 p-4 md:p-5 rounded-[1.5rem] md:rounded-[2rem] border border-gray-150 dark:border-slate-800 shadow-sm">
                        <label className="block text-xs font-bold text-black dark:text-gray-200 mb-3">ابحث وأضف الأصناف للجرد</label>
                        <div className="relative mb-4">
                            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={16} />
                            <input 
                                type="text"
                                placeholder="ابحث بالاسم أو الباركود..."
                                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-black dark:text-white pr-11 pl-4 py-3 rounded-xl font-semibold outline-none focus:border-indigo-500 transition text-sm shadow-inner"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        {search && (
                            <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-1">
                                {filtered.map((p, idx) => (
                                    <button 
                                        key={`audit-search-${p.id || idx}`}
                                        onClick={() => addToAudit(p)}
                                        className="w-full text-right p-3 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-xl transition-all flex justify-between items-center group cursor-pointer shadow-sm hover:shadow-md"
                                    >
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold text-xs text-black dark:text-white">{p.name}</span>
                                            <span className="text-[10px] text-gray-400 font-mono">{p.barcode}</span>
                                        </div>
                                        <ArrowLeftRight size={14} className="text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                ))}
                                {filtered.length === 0 && (
                                     <div className="text-center py-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                         لم يتم العثور على نتائج
                                     </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="bg-indigo-600 dark:bg-indigo-700 p-5 md:p-6 rounded-[1.5rem] md:rounded-[2rem] text-white shadow-md shadow-indigo-100 dark:shadow-none">
                        <h4 className="font-bold mb-3 flex items-center gap-2 text-sm">
                            <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">ℹ</span>
                            تعليمات الجرد:
                        </h4>
                        <ul className="text-xs space-y-3 opacity-90 font-medium leading-relaxed">
                            <li className="flex items-start gap-2"><span className="font-mono bg-indigo-500 rounded px-1.5 py-0.5 text-[10px]">1</span> ابحث عن المنتج وأضفه للقائمة.</li>
                            <li className="flex items-start gap-2"><span className="font-mono bg-indigo-500 rounded px-1.5 py-0.5 text-[10px]">2</span> أدخل الكمية التي وجدتها فعلياً على الرف.</li>
                            <li className="flex items-start gap-2"><span className="font-mono bg-indigo-500 rounded px-1.5 py-0.5 text-[10px]">3</span> سيقوم النظام بحساب الفارق آلياً.</li>
                            <li className="flex items-start gap-2"><span className="font-mono bg-indigo-500 rounded px-1.5 py-0.5 text-[10px]">4</span> عند الحفظ، سيتم تعديل المخزون فوراً.</li>
                        </ul>
                    </div>
                </div>

                {/* Audit List Section */}
                <div className="xl:col-span-3">
                    <div className="bg-white dark:bg-slate-950 rounded-[1.5rem] md:rounded-[2rem] border border-gray-150 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full min-h-[500px]">
                        <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-gray-50/50 dark:bg-slate-900/50">
                            <h3 className="font-bold text-black dark:text-white flex items-center gap-2 text-sm">
                                <History size={16} className="text-indigo-600 dark:text-indigo-400" />
                                قائمة الجرد الحالية 
                                <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-lg text-xs font-mono">{auditItems.length}</span>
                            </h3>
                            {auditItems.length > 0 && (
                                <button 
                                    onClick={() => setAuditItems([])}
                                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition-colors cursor-pointer bg-rose-50 dark:bg-rose-900/20 px-3 py-1.5 rounded-lg"
                                >
                                    مسح القائمة
                                </button>
                            )}
                        </div>

                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-right whitespace-nowrap min-w-[600px]">
                                <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-150 dark:border-slate-800">
                                    <tr>
                                        <th className="px-4 py-3.5 text-xs font-bold text-gray-500 dark:text-gray-400">الصنف</th>
                                        <th className="px-4 py-3.5 text-xs font-bold text-gray-500 dark:text-gray-400 text-center w-32 border-r border-gray-200 dark:border-slate-800">رصيد النظام</th>
                                        <th className="px-4 py-3.5 text-xs font-bold text-gray-500 dark:text-gray-400 text-center w-40 border-r border-gray-200 dark:border-slate-800">الرصيد الفعلي</th>
                                        <th className="px-4 py-3.5 text-xs font-bold text-gray-500 dark:text-gray-400 text-center w-32 border-r border-gray-200 dark:border-slate-800">الفارق</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                    {auditItems.map((item, idx) => {
                                        const diff = item.actualQuantity - item.systemQuantity;
                                        return (
                                        <tr key={`audit-item-${item.productId}-${idx}`} className="hover:bg-gray-50/50 dark:hover:bg-slate-900/50 transition-colors">
                                            <td className="px-4 py-3 font-semibold text-xs md:text-sm text-black dark:text-white border-l border-gray-150 dark:border-slate-800">{item.productName}</td>
                                            <td className="px-4 py-3 text-center font-bold text-gray-600 dark:text-gray-300 border-l border-gray-150 dark:border-slate-800">{item.systemQuantity}</td>
                                            <td className="px-4 py-3 text-center border-l border-gray-150 dark:border-slate-800">
                                                <input 
                                                    type="number"
                                                    className="w-24 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-black dark:text-white text-center py-1.5 rounded-lg font-bold focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition text-sm"
                                                    value={item.actualQuantity}
                                                    onChange={(e) => handleActualChange(item.productId, e.target.value)}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className={`inline-flex items-center justify-center min-w-[3rem] font-bold text-xs px-2.5 py-1.5 rounded-lg border ${
                                                    diff === 0 
                                                        ? 'bg-gray-50 dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700' :
                                                    diff > 0 
                                                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30' 
                                                        : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900/30'
                                                }`}>
                                                    <span className="opacity-70 font-mono tracking-tighter mr-0.5">{diff > 0 ? '+' : ''}</span>
                                                    {diff}
                                                </div>
                                            </td>
                                        </tr>
                                    )})}
                                    {auditItems.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-24 text-center">
                                                <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 gap-3">
                                                    <ClipboardCheck size={40} className="opacity-20" />
                                                    <span className="font-semibold text-sm">لم يتم إضافة أي أصناف للجرد بعد</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {auditItems.length > 0 && (
                            <div className="p-4 md:p-6 bg-gray-50 dark:bg-slate-900 border-t border-gray-150 dark:border-slate-800 mt-auto">
                                <button 
                                    onClick={submitAudit}
                                    disabled={isSaving}
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 md:py-4 rounded-xl md:rounded-2xl font-bold transition-all shadow-sm flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
                                >
                                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                                    <span>اعتماد وتصويب أرصدة المخزون</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function Loader2({ className, size }: { className?: string, size?: number }) {
    return <svg className={`animate-spin ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>;
}
