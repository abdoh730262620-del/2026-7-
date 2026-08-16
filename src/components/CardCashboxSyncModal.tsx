import React, { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { collection, query, where, getDocs, writeBatch, doc, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CardCashboxEntry, CardSale, CardPurchase, CardVoucher, CardPurchaseVoucher } from '../types/cardTypes';

interface CardCashboxSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    tenantId: string;
    appUser: any;
    currentBalance: number;
    sales: CardSale[];
    purchases: CardPurchase[];
    distributorVouchers: CardVoucher[];
    supplierVouchers: CardPurchaseVoucher[];
    cashboxEntries: CardCashboxEntry[];
    onSyncComplete: () => void;
}

export const CardCashboxSyncModal: React.FC<CardCashboxSyncModalProps> = ({
    isOpen,
    onClose,
    tenantId,
    appUser,
    currentBalance,
    sales,
    purchases,
    distributorVouchers,
    supplierVouchers,
    cashboxEntries,
    onSyncComplete
}) => {
    const [syncMethod, setSyncMethod] = useState<'adjust' | 'replace'>('adjust');
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState('');

    const handleSync = async () => {
        if (!appUser?.uid || appUser?.role !== 'admin') {
            alert('عذراً، هذه الصلاحية مخصصة لمدير النظام فقط.');
            return;
        }

        setIsSyncing(true);
        setSyncProgress('جاري معالجة العمليات...');

        try {
            // Calculate target balance
            let salesCash = 0;
            sales.forEach(s => {
                if (s.status === 'completed' && s.paymentType === 'cash') {
                    salesCash += (s.netTotal || s.totalAmount || 0);
                }
            });

            let purchasesCash = 0;
            purchases.forEach(p => {
                if (p.status === 'completed' && p.paymentType === 'cash') {
                    purchasesCash += (p.totalAmount || p.totalAmount || 0);
                }
            });

            let vouchersIn = 0;
            let vouchersOut = 0;

            distributorVouchers.forEach(v => {
                if (v.type === 'receipt') vouchersIn += (v.amount || 0);
                else vouchersOut += (v.amount || 0);
            });

            supplierVouchers.forEach(v => {
                if (v.type === 'receipt') vouchersIn += (v.amount || 0); // supplier returning money
                else vouchersOut += (v.amount || 0); // paying supplier
            });

            let manualIn = 0;
            let manualOut = 0;
            cashboxEntries.forEach(e => {
                if (e.type === 'manual_in') manualIn += (e.amount || 0);
                if (e.type === 'manual_out') manualOut += (e.amount || 0);
            });

            const targetBal = salesCash + vouchersIn + manualIn - purchasesCash - vouchersOut - manualOut;
            const diff = targetBal - currentBalance;

            if (syncMethod === 'adjust') {
                setSyncProgress('جاري احتساب الفارق وتسجيل قيد تسوية...');
                if (Math.abs(diff) > 0.01) {
                    const isIncome = diff > 0;
                    const adjAmount = Math.abs(diff);
                    const now = new Date();
                    const dateStr = now.toISOString().split('T')[0];
                    const timeStr = now.toTimeString().split(' ')[0];

                    await addDoc(collection(db, 'card_cashbox'), {
                        tenantId,
                        type: isIncome ? 'manual_in' : 'manual_out',
                        title: `قيد تسوية تلقائي لمطابقة الصندوق مع سجل الكروت (الرصيد المستهدف: ${targetBal.toFixed(2)})`,
                        amount: adjAmount,
                        isIncome: isIncome,
                        date: dateStr,
                        dateTime: `${dateStr} ${timeStr}`,
                        userName: appUser.name || 'المدير',
                        createdAt: Date.now()
                    });
                }
            } else {
                setSyncProgress('جاري تصفير حركات الصندوق المولدة آلياً...');
                // Replace mode: Delete all non-manual cashbox entries and regenerate them
                const qCash = query(collection(db, 'card_cashbox'), where('tenantId', '==', tenantId));
                const cashSnap = await getDocs(qCash);
                
                let deleteBatch = writeBatch(db);
                let opCount = 0;
                const deletePromises = [];

                for (const docObj of cashSnap.docs) {
                    const data = docObj.data();
                    const type = data.type;
                    const title = data.title || '';
                    
                    const isPureManual = (type === 'manual_in' || type === 'manual_out') && 
                                         !title.includes('فاتورة') && 
                                         !title.includes('تسوية تعديل') &&
                                         !title.includes('تسوية تلقائي') &&
                                         !title.includes('سند قبض') &&
                                         !title.includes('سند صرف');

                    if (!isPureManual) {
                        deleteBatch.delete(docObj.ref);
                        opCount++;
                        if (opCount === 400) {
                            deletePromises.push(deleteBatch.commit());
                            deleteBatch = writeBatch(db);
                            opCount = 0;
                        }
                    }
                }
                if (opCount > 0) deletePromises.push(deleteBatch.commit());
                await Promise.all(deletePromises);

                setSyncProgress('جاري إعادة بناء حركات الصندوق المطابقة للفواتير...');
                let createBatch = writeBatch(db);
                opCount = 0;
                const createPromises = [];

                const addBatchOp = (data: any) => {
                    const ref = doc(collection(db, 'card_cashbox'));
                    createBatch.set(ref, data);
                    opCount++;
                    if (opCount === 400) {
                        createPromises.push(createBatch.commit());
                        createBatch = writeBatch(db);
                        opCount = 0;
                    }
                };

                // Regenerate Sales Cash
                const processedInvoices = new Set();
                for (const s of sales) {
                    if (s.status === 'completed' && s.paymentType === 'cash' && !processedInvoices.has(s.invoiceNumber)) {
                        processedInvoices.add(s.invoiceNumber);
                        const totalInvoiceAmt = sales.filter(x => x.invoiceNumber === s.invoiceNumber).reduce((sum, item) => sum + ((item as any).netTotal || item.totalAmount || 0), 0);
                        addBatchOp({
                            tenantId,
                            type: 'cash_sale',
                            title: `فاتورة بيع كروت نقدية #${s.invoiceNumber}`,
                            amount: totalInvoiceAmt,
                            isIncome: true,
                            referenceId: s.invoiceNumber,
                            date: s.date || new Date((s as any).createdAt).toISOString().split('T')[0],
                            dateTime: s.dateTime || '',
                            userName: s.userName || appUser.name,
                            createdAt: (s as any).createdAt || Date.now()
                        });
                    }
                }

                // Regenerate Purchases Cash
                const processedPurchases = new Set();
                for (const p of purchases) {
                    if (p.status === 'completed' && p.paymentType === 'cash' && !processedPurchases.has(p.invoiceNumber)) {
                        processedPurchases.add(p.invoiceNumber);
                        const totalInvoiceAmt = purchases.filter(x => x.invoiceNumber === p.invoiceNumber).reduce((sum, item) => sum + ((item as any).netTotal || item.totalAmount || 0), 0);
                        addBatchOp({
                            tenantId,
                            type: 'cash_purchase',
                            title: `فاتورة شراء كروت نقدية #${p.invoiceNumber}`,
                            amount: totalInvoiceAmt,
                            isIncome: false,
                            referenceId: p.invoiceNumber,
                            date: p.date || new Date((p as any).createdAt).toISOString().split('T')[0],
                            dateTime: p.dateTime || '',
                            userName: p.userName || appUser.name,
                            createdAt: (p as any).createdAt || Date.now()
                        });
                    }
                }

                // Regenerate Distributor Vouchers
                for (const v of distributorVouchers) {
                    addBatchOp({
                        tenantId,
                        type: 'distributor_payment',
                        title: v.type === 'receipt' ? `سند قبض من الموزع: ${v.distributorName} (${v.voucherNumber})` : `سند صرف للموزع: ${v.distributorName} (${v.voucherNumber})`,
                        amount: v.amount,
                        isIncome: v.type === 'receipt',
                        referenceId: v.voucherNumber,
                        date: v.date || new Date((v as any).createdAt).toISOString().split('T')[0],
                        dateTime: v.dateTime || '',
                        userName: v.userName || appUser.name,
                        createdAt: (v as any).createdAt || Date.now()
                    });
                }

                // Regenerate Supplier Vouchers
                for (const v of supplierVouchers) {
                    addBatchOp({
                        tenantId,
                        type: 'supplier_payment',
                        title: v.type === 'receipt' ? `سند قبض من المورد: ${v.supplierName} (${v.voucherNumber})` : `سند صرف للمورد: ${v.supplierName} (${v.voucherNumber})`,
                        amount: v.amount,
                        isIncome: v.type === 'receipt',
                        referenceId: v.voucherNumber,
                        date: v.date || new Date((v as any).createdAt).toISOString().split('T')[0],
                        dateTime: v.dateTime || '',
                        userName: v.userName || appUser.name,
                        createdAt: (v as any).createdAt || Date.now()
                    });
                }

                if (opCount > 0) createPromises.push(createBatch.commit());
                await Promise.all(createPromises);
            }

            setSyncProgress('تمت المزامنة بنجاح!');
            setTimeout(() => {
                setIsSyncing(false);
                onSyncComplete();
                onClose();
            }, 1000);

        } catch (error: any) {
            console.error('Sync Error:', error);
            alert('حدث خطأ أثناء المزامنة: ' + error.message);
            setIsSyncing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200" dir="rtl">
                {/* Header */}
                <div className="bg-gradient-to-l from-indigo-600 to-indigo-700 text-white px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
                        <h3 className="font-bold text-base text-white">مزامنة صندوق الكروت</h3>
                    </div>
                    <button onClick={onClose} disabled={isSyncing} className="text-white/70 hover:text-white transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-right">
                    {isSyncing ? (
                        <div className="py-8 text-center space-y-4">
                            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                                <RefreshCw size={28} className="animate-spin" />
                            </div>
                            <div className="space-y-1.5">
                                <p className="font-bold text-slate-800 dark:text-white text-sm">جاري معالجة طلبك...</p>
                                <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{syncProgress}</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                                <p className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300 leading-relaxed">
                                    تعمل هذه الأداة على مراجعة كافة فواتير المبيعات والمشتريات النقدية للكروت وسندات القبض والصرف، ومطابقتها مع رصيد الصندوق الحالي للكروت لإصلاح أي خلل.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">طريقة المزامنة والتسوية:</label>
                                <div className="space-y-2">
                                    <label className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition ${syncMethod === 'adjust' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/10 dark:border-indigo-500' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                        <div className="mt-0.5">
                                            <input type="radio" name="syncMethod" value="adjust" checked={syncMethod === 'adjust'} onChange={() => setSyncMethod('adjust')} className="w-4 h-4 text-indigo-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">تسوية الفارق كقيد مستقل (آمن وسريع)</p>
                                            <p className="text-[10px] text-slate-500 font-bold mt-1">يحتسب النظام فارق الرصيد بين السجلات والصندوق ويضيف عملية "تسوية" واحدة لحل الفارق بدون حذف السجلات القديمة.</p>
                                        </div>
                                    </label>

                                    <label className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition ${syncMethod === 'replace' ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/10 dark:border-indigo-500' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                        <div className="mt-0.5">
                                            <input type="radio" name="syncMethod" value="replace" checked={syncMethod === 'replace'} onChange={() => setSyncMethod('replace')} className="w-4 h-4 text-indigo-600" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">إعادة بناء الصندوق بالكامل</p>
                                            <p className="text-[10px] text-slate-500 font-bold mt-1">سيتم مسح كافة حركات الصندوق المولدة آلياً وإعادة إنشائها من الصفر من الفواتير والسندات. قد تستغرق وقتاً أطول.</p>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 shrink-0 mt-4">
                                <button type="button" onClick={handleSync} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 active:scale-95">
                                    <RefreshCw size={14} />
                                    بدء المزامنة
                                </button>
                                <button type="button" onClick={onClose} className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 py-2.5 rounded-xl font-black text-xs transition active:scale-95">
                                    إلغاء
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
