import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { format } from 'date-fns';
import { logUserAction } from '../lib/logger';
import { ArrowLeft, Check, RefreshCw, AlertTriangle, Sliders, Info } from 'lucide-react';

import { useNavigate } from 'react-router-dom';

export default function Cash() {
    const navigate = useNavigate();
    const { appUser } = useAuthStore();
    const { settings, updateSettings } = useSettingsStore();
    const [balance, setBalance] = useState(0);

    const [type, setType] = useState<'in' | 'out'>('in');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [description, setDescription] = useState('');
    const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void, isAlert?: boolean}>({isOpen: false, message: '', onConfirm: () => {}});

    // Sync Modal States
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [syncMethod, setSyncMethod] = useState<'adjust' | 'rebuild'>('adjust');
    const [syncSales, setSyncSales] = useState(true);
    const [syncPurchases, setSyncPurchases] = useState(true);
    const [syncExpenses, setSyncExpenses] = useState(true);
    const [syncVouchers, setSyncVouchers] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState('');

    const [totals, setTotals] = useState({
        manual: 0,
        sales: 0,
        vouchersReceipt: 0,
        purchases: 0,
        vouchersPayment: 0,
        expenses: 0
    });

    useEffect(() => {
        if (!appUser?.uid) return;
        
        const tenantId = appUser?.tenantId || 'single_store';
        const q = query(collection(db, 'cash'), where('tenantId', '==', tenantId));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            let bal = 0;
            snapshot.forEach(d => {
                const data = d.data();
                // If it explicitly says it doesn't affect cash, skip it
                if (data.affectsCash === false) return;

                if (data.type === 'in') {
                    bal += (data.amount || 0);
                } else if (data.type === 'out') {
                    bal -= (data.amount || 0);
                }
            });
            setBalance(bal);
        }, (err) => handleFirestoreError(err, OperationType.GET, 'cash'));

        return () => unsubscribe();
    }, [appUser]);

    const handleSettingToggle = (key: keyof typeof settings, currentValue: boolean | undefined) => {
        const newValue = !(currentValue ?? true);
        const confirmMsg = newValue 
            ? 'هل أنت متأكد من تفعيل هذا الخيار؟ (سيسري تغيير هذا الإعداد على العمليات الجديدة فقط)' 
            : 'هل أنت متأكد من إلغاء تفعيل هذا الخيار؟ (سيسري تغيير هذا الإعداد على العمليات الجديدة فقط)';
            
        setConfirmDialog({
            isOpen: true,
            message: confirmMsg,
            isAlert: false,
            onConfirm: async () => {
                setConfirmDialog(p => ({ ...p, isOpen: false }));
                await updateSettings({ [key]: newValue });
                setTimeout(() => {
                    setConfirmDialog({
                        isOpen: true,
                        message: 'تم حفظ الإعدادات بنجاح.',
                        isAlert: true,
                        onConfirm: () => setConfirmDialog(p => ({ ...p, isOpen: false }))
                    });
                }, 300);
            }
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const numAmount = parseFloat(amount);
        if (!numAmount || numAmount <= 0) return;

        if (description.trim().length < 15) {
            setConfirmDialog({
                isOpen: true,
                isAlert: true,
                message: "البيان يجب أن لا يقل عن 15 حرفاً",
                onConfirm: () => setConfirmDialog(p => ({ ...p, isOpen: false }))
            });
            return;
        }

        try {
            const tenantId = appUser?.tenantId || 'single_store';
            const now = Date.now();
            await addDoc(collection(db, 'cash'), {
                date: now,
                amount: numAmount,
                type: type,
                category: 'manual',
                description: description || 'تمت الإضافة يدويا',
                referenceId: `M-${now}`,
                createdBy: appUser?.uid || 'unknown',
                createdAt: now,
                tenantId
            });
            await logUserAction('حركة صندوق يدوية', `تم ${type === 'in' ? 'إضافة' : 'خصم'} مبلغ ${numAmount} من الصندوق`);
            setAmount('');
            setDescription('');
            alert('تمت العملية بنجاح');
        } catch (error) {
            console.error(error);
            alert('حدث خطأ');
        }
    };

    const handleSyncCashbox = async () => {
        if (!appUser?.uid) return;
        if (appUser?.role !== 'admin') {
            alert('عذراً، هذه الصلاحية مخصصة لمدير النظام فقط.');
            return;
        }
        const tenantId = appUser?.tenantId || 'single_store';
        setIsSyncing(true);
        setSyncProgress('جاري جلب الفواتير والعمليات من قاعدة البيانات...');

        try {
            // 1. Fetch Sales
            let sales: any[] = [];
            if (syncSales) {
                const salesSnap = await getDocs(query(collection(db, 'sales'), where('tenantId', '==', tenantId)));
                salesSnap.forEach(docObj => {
                    const data = docObj.data();
                    if (data.status !== 'cancelled' && !data.isReturn) {
                        sales.push({ id: docObj.id, ...data });
                    }
                });
            }

            // 2. Fetch Purchases
            let purchases: any[] = [];
            if (syncPurchases) {
                const purchSnap = await getDocs(query(collection(db, 'purchases'), where('tenantId', '==', tenantId)));
                purchSnap.forEach(docObj => {
                    const data = docObj.data();
                    if (data.status !== 'cancelled') {
                        purchases.push({ id: docObj.id, ...data });
                    }
                });
            }

            // 3. Fetch Expenses
            let expenses: any[] = [];
            if (syncExpenses) {
                const expSnap = await getDocs(query(collection(db, 'expenses'), where('tenantId', '==', tenantId)));
                expSnap.forEach(docObj => {
                    const data = docObj.data();
                    if (data.affectsCash || data.paymentMethod === 'cash') {
                        expenses.push({ id: docObj.id, ...data });
                    }
                });
            }

            // 4. Fetch Vouchers
            let vouchers: any[] = [];
            if (syncVouchers) {
                const vouchersSnap = await getDocs(query(collection(db, 'vouchers'), where('tenantId', '==', tenantId)));
                vouchersSnap.forEach(docObj => {
                    const data = docObj.data();
                    vouchers.push({ id: docObj.id, ...data });
                });
            }

            // Calculate totals
            const salesTotal = sales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
            const purchasesTotal = purchases.reduce((sum, p) => sum + (parseFloat(p.totalAmount || p.total) || 0), 0);
            const expensesTotal = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
            
            let vouchersInTotal = 0;
            let vouchersOutTotal = 0;
            vouchers.forEach(v => {
                const amt = parseFloat(v.amount) || 0;
                if (v.type === 'receipt') vouchersInTotal += amt;
                else if (v.type === 'payment') vouchersOutTotal += amt;
            });

            const targetBal = salesTotal + vouchersInTotal - purchasesTotal - expensesTotal - vouchersOutTotal;

            if (syncMethod === 'adjust') {
                setSyncProgress('جاري احتساب الفارق وتسجيل قيد تسوية...');
                const diff = targetBal - balance;
                if (Math.abs(diff) > 0.01) {
                    const now = Date.now();
                    const adjType = diff > 0 ? 'in' : 'out';
                    const adjAmount = Math.abs(diff);

                    await addDoc(collection(db, 'cash'), {
                        date: now,
                        amount: adjAmount,
                        type: adjType,
                        category: 'manual',
                        description: `قيد تسوية تلقائي لمطابقة الصندوق مع سجل العمليات (الرصيد المستهدف: ${targetBal.toFixed(2)})`,
                        referenceId: `ADJ-${now}`,
                        createdBy: appUser.uid,
                        createdAt: now,
                        tenantId
                    });
                    await logUserAction('تسوية صندوق تلقائية', `تمت مطابقة الصندوق بقيمة تسوية ${adjAmount.toFixed(2)} (${adjType === 'in' ? 'إضافة' : 'خصم'})`);
                }
            } else {
                setSyncProgress('جاري تصفير حركات الصندوق السابقة...');
                const cashSnap = await getDocs(query(collection(db, 'cash'), where('tenantId', '==', tenantId)));
                
                let deleteBatch = writeBatch(db);
                let opCount = 0;
                const deletePromises = [];
                
                for (const docObj of cashSnap.docs) {
                    deleteBatch.delete(docObj.ref);
                    opCount++;
                    if (opCount === 400) {
                        deletePromises.push(deleteBatch.commit());
                        deleteBatch = writeBatch(db);
                        opCount = 0;
                    }
                }
                if (opCount > 0) {
                    deletePromises.push(deleteBatch.commit());
                }
                await Promise.all(deletePromises);

                setSyncProgress('جاري إعادة بناء حركات الصندوق المطابقة للفواتير...');
                let createBatch = writeBatch(db);
                opCount = 0;
                const createPromises = [];

                // Sales
                for (const s of sales) {
                    const cashRef = doc(collection(db, 'cash'));
                    createBatch.set(cashRef, {
                        date: s.date || s.createdAt || Date.now(),
                        amount: parseFloat(s.total) || 0,
                        type: 'in',
                        category: 'sales',
                        description: `فاتورة مبيعات رقم ${s.invoiceNumber}`,
                        referenceId: s.id,
                        createdBy: s.createdBy || appUser.uid,
                        createdAt: s.createdAt || Date.now(),
                        tenantId
                    });
                    opCount++;
                    if (opCount === 400) {
                        createPromises.push(createBatch.commit());
                        createBatch = writeBatch(db);
                        opCount = 0;
                    }
                }

                // Purchases
                for (const p of purchases) {
                    const cashRef = doc(collection(db, 'cash'));
                    createBatch.set(cashRef, {
                        date: p.date || p.createdAt || Date.now(),
                        amount: parseFloat(p.totalAmount || p.total) || 0,
                        type: 'out',
                        category: 'purchases',
                        description: `فاتورة مشتريات رقم ${p.invoiceNumber || p.id}`,
                        referenceId: p.id,
                        createdBy: p.createdBy || appUser.uid,
                        createdAt: p.createdAt || Date.now(),
                        tenantId
                    });
                    opCount++;
                    if (opCount === 400) {
                        createPromises.push(createBatch.commit());
                        createBatch = writeBatch(db);
                        opCount = 0;
                    }
                }

                // Expenses
                for (const e of expenses) {
                    const cashRef = doc(collection(db, 'cash'));
                    createBatch.set(cashRef, {
                        date: e.date || e.createdAt || Date.now(),
                        amount: parseFloat(e.amount) || 0,
                        type: 'out',
                        category: 'expense',
                        description: `${e.account}: ${e.description}`,
                        referenceId: e.referenceId || e.id,
                        expenseId: e.id,
                        createdBy: e.createdBy || appUser.uid,
                        createdAt: e.createdAt || Date.now(),
                        tenantId
                    });
                    opCount++;
                    if (opCount === 400) {
                        createPromises.push(createBatch.commit());
                        createBatch = writeBatch(db);
                        opCount = 0;
                    }
                }

                // Vouchers
                for (const v of vouchers) {
                    const cashRef = doc(collection(db, 'cash'));
                    createBatch.set(cashRef, {
                        voucherNumber: v.voucherNumber,
                        date: v.date || Date.now(),
                        amount: parseFloat(v.amount) || 0,
                        type: v.type === 'receipt' ? 'in' : 'out',
                        category: v.type === 'receipt' ? 'in_payment' : 'out_payment',
                        description: `سند ${v.type === 'receipt' ? 'قبض' : 'صرف'} #${v.voucherNumber} - ${v.partyType === 'customer' ? 'عميل' : 'مورد'}: ${v.partyName} - ${v.description}`,
                        referenceId: v.id,
                        createdBy: v.createdBy || appUser.uid,
                        createdAt: v.createdAt || Date.now(),
                        tenantId
                    });
                    opCount++;
                    if (opCount === 400) {
                        createPromises.push(createBatch.commit());
                        createBatch = writeBatch(db);
                        opCount = 0;
                    }
                }

                if (opCount > 0) {
                    createPromises.push(createBatch.commit());
                }
                await Promise.all(createPromises);
                await logUserAction('إعادة بناء الصندوق بالكامل', `تمت تصفية الصندوق وإعادة بناء ${sales.length + purchases.length + expenses.length + vouchers.length} حركة مطابقة بالكامل`);
            }

            setIsSyncModalOpen(false);
            alert('تمت مزامنة ومطابقة الصندوق بنجاح!');
        } catch (error) {
            console.error('Error during sync:', error);
            alert('حدث خطأ أثناء مزامنة الصندوق. الرجاء المحاولة مجدداً.');
        } finally {
            setIsSyncing(false);
            setSyncProgress('');
        }
    };

    return (
        <div className="max-w-md mx-auto w-full h-full bg-[#FDFDFD] flex flex-col overflow-hidden" dir="rtl">
            <div className="flex flex-col gap-2 px-4 flex-1 overflow-y-auto py-4">
                <form onSubmit={handleSubmit} className="flex flex-col gap-3 flex-1">
                    <div className="flex justify-center items-center gap-6 bg-white py-2.5 shadow-sm rounded-xl shrink-0 border border-gray-100">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" className="hidden" checked={type === 'in'} onChange={() => setType('in')} />
                            <div className={`w-5 h-5 rounded-full border-2 p-0.5 flex items-center justify-center ${type === 'in' ? 'border-[#6EA84F]' : 'border-gray-400'}`}>
                                <div className={`w-full h-full rounded-full ${type === 'in' ? 'bg-[#6EA84F]' : 'bg-transparent'}`}></div>
                            </div>
                            <span className="text-[#6EA84F] font-bold text-sm">اضافه للصندوق</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" className="hidden" checked={type === 'out'} onChange={() => setType('out')} />
                            <div className={`w-5 h-5 rounded-full border-2 p-0.5 flex items-center justify-center ${type === 'out' ? 'border-[#C0392B]' : 'border-gray-400'}`}>
                                <div className={`w-full h-full rounded-full ${type === 'out' ? 'bg-[#C0392B]' : 'bg-transparent'}`}></div>
                            </div>
                            <span className="text-[#C0392B] font-bold text-sm">خصم من الصندوق</span>
                        </label>
                    </div>

                    <div className="flex flex-col gap-1 shrink-0">
                        <label className="text-black font-bold text-sm">ادخل المبلغ</label>
                        <input 
                            type="number" 
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl p-2.5 text-center text-xl font-bold text-[#E91E63] focus:outline-none focus:border-blue-500 transition-all bg-white dark:bg-slate-900"
                            placeholder="0"
                            required
                        />
                    </div>

                    <div className="flex flex-col gap-1 shrink-0">
                        <label className="text-black font-bold text-sm">التاريخ</label>
                        <input 
                            type="date" 
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl p-2.5 text-center font-bold outline-none focus:border-blue-500 transition-all bg-white dark:bg-slate-900 text-base"
                        />
                    </div>

                    <div className="flex flex-col gap-1 shrink-0">
                        <label className="text-black font-bold text-sm">البيان</label>
                        <input 
                            type="text" 
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl p-2.5 bg-white dark:bg-slate-900 focus:outline-none focus:border-blue-500 transition-all text-base"
                        />
                    </div>

                    <div className="flex flex-col mt-1 divide-y divide-gray-100 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden shrink-0">
                        <div className="flex justify-between items-center py-2 px-3 hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => handleSettingToggle('cashIncludeSales', settings.cashIncludeSales)}>
                             <div className="text-black font-semibold text-xs flex-1">اضافة مبالغ المبيعات والعملاء للصندوق</div>
                             <div className="relative inline-flex items-center">
                                 <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                     (settings.cashIncludeSales ?? true) 
                                         ? 'bg-emerald-500 border-emerald-500 text-white' 
                                         : 'bg-white border-gray-300 text-transparent hover:border-gray-400'
                                 }`}>
                                     <Check size={14} strokeWidth={3} />
                                 </div>
                             </div>
                        </div>
                        <div className="flex justify-between items-center py-2 px-3 hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => handleSettingToggle('cashIncludePurchases', settings.cashIncludePurchases)}>
                             <div className="text-black font-semibold text-xs flex-1">خصم مبالغ المشتريات والموردين من الصندوق</div>
                             <div className="relative inline-flex items-center">
                                 <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                     (settings.cashIncludePurchases ?? true) 
                                         ? 'bg-emerald-500 border-emerald-500 text-white' 
                                         : 'bg-white border-gray-300 text-transparent hover:border-gray-400'
                                 }`}>
                                     <Check size={14} strokeWidth={3} />
                                 </div>
                             </div>
                        </div>
                        <div className="flex justify-between items-center py-2 px-3 hover:bg-slate-50 transition-colors cursor-pointer group" onClick={() => handleSettingToggle('cashIncludeExpenses', settings.cashIncludeExpenses)}>
                             <div className="text-black font-semibold text-xs flex-1">خصم مبالغ المصروفات من الصندوق</div>
                             <div className="relative inline-flex items-center">
                                 <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                     (settings.cashIncludeExpenses ?? true) 
                                         ? 'bg-emerald-500 border-emerald-500 text-white' 
                                         : 'bg-white border-gray-300 text-transparent hover:border-gray-400'
                                 }`}>
                                     <Check size={14} strokeWidth={3} />
                                 </div>
                             </div>
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-slate-200 hover:bg-slate-300 text-slate-800 py-3 mt-auto rounded-xl shadow flex justify-center text-black font-bold text-base border border-slate-300 transition-all active:scale-[0.98] shrink-0">
                        إضافة المبلغ يدوياً
                    </button>

                    {appUser?.role === 'admin' && (
                        <button 
                            type="button" 
                            onClick={() => setIsSyncModalOpen(true)}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl shadow flex justify-center items-center gap-2 font-bold text-base transition-all active:scale-[0.98] shrink-0"
                        >
                            <RefreshCw size={18} />
                            مزامنة الصندوق مع المبيعات والعمليات
                        </button>
                    )}
                </form>
            </div>

            <div className="border-t-2 border-gray-300 bg-[#EFEFEF] py-3 px-4 flex items-center justify-between shrink-0 w-full">
                 <div className="text-xl font-bold text-black flex-shrink-0 ml-4">
                     الرصيد
                 </div>
                 <div className="w-full max-w-[200px] border-2 border-[#94B8C7] rounded-full bg-white text-center py-2 text-xl font-bold text-[#C0392B]" dir="ltr">
                     {balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                 </div>
            </div>

            {confirmDialog.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center animate-in fade-in zoom-in duration-200">
                        <p className="text-black dark:text-gray-100 font-bold mb-6 text-lg">{confirmDialog.message}</p>
                        <div className="flex gap-3">
                            {confirmDialog.isAlert ? (
                                <button onClick={confirmDialog.onConfirm} className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-bold hover:bg-green-700 transition">حسناً</button>
                            ) : (
                                <>
                                    <button onClick={confirmDialog.onConfirm} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700 transition">تأكيد</button>
                                    <button onClick={() => setConfirmDialog(p => ({ ...p, isOpen: false }))} className="flex-1 bg-white dark:bg-slate-800 text-black dark:text-gray-100 py-2.5 rounded-lg font-bold hover:bg-white transition">إلغاء</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isSyncModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200" dir="rtl">
                        {/* Header */}
                        <div className="bg-gradient-to-l from-indigo-600 to-indigo-700 text-white px-5 py-4 flex items-center gap-2">
                            <RefreshCw size={18} className={isSyncing ? "animate-spin" : ""} />
                            <h3 className="font-bold text-base text-white">مزامنة ومطابقة رصيد الصندوق</h3>
                        </div>

                        {/* Content */}
                        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                            {isSyncing ? (
                                <div className="py-8 text-center space-y-4">
                                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-50 text-indigo-600">
                                        <RefreshCw size={28} className="animate-spin" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <p className="font-bold text-slate-800 text-sm">جاري معالجة طلبك...</p>
                                        <p className="text-xs text-indigo-600 font-semibold">{syncProgress}</p>
                                    </div>
                                    <p className="text-[10px] text-slate-400">يرجى الانتظار وعدم إغلاق الصفحة حتى اكتمال العملية.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2.5">
                                        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                                        <div className="text-xs text-amber-900 leading-normal font-semibold">
                                            ستقوم هذه الأداة بمطابقة رصيد الصندوق الأساسي وتعديله ليعكس إجمالي الفواتير الفعلية المسجلة في النظام.
                                        </div>
                                    </div>

                                    {/* Sync Method */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-700 flex items-center gap-1">
                                            <Sliders size={13} />
                                            طريقة المزامنة والتسوية:
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSyncMethod('adjust')}
                                                className={`p-3 rounded-xl border-2 text-center transition flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                                                    syncMethod === 'adjust'
                                                        ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                                        : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-200'
                                                }`}
                                            >
                                                <Info size={16} />
                                                <span className="font-bold text-xs">قيد تسوية سريع</span>
                                                <span className="text-[9px] text-slate-400 leading-tight">تعديل فوري للرصيد دون مسح القيود السابقة</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setSyncMethod('rebuild')}
                                                className={`p-3 rounded-xl border-2 text-center transition flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                                                    syncMethod === 'rebuild'
                                                        ? 'bg-red-50 border-red-600 text-red-700 font-bold'
                                                        : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-200'
                                                }`}
                                            >
                                                <AlertTriangle size={16} />
                                                <span className="font-bold text-xs">إعادة بناء شاملة</span>
                                                <span className="text-[9px] text-slate-400 leading-tight">مسح كافة الحركات وإعادة بنائها من الفواتير</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Filters */}
                                    <div className="space-y-2 border-t border-slate-100 pt-3">
                                        <label className="text-xs font-black text-slate-700">العمليات المراد إدراجها وحسابها في الصندوق:</label>
                                        
                                        <div className="space-y-1.5 bg-slate-50 rounded-xl p-2.5">
                                            <label className="flex items-center justify-between py-1 px-1.5 cursor-pointer hover:bg-slate-100 rounded-lg transition-colors">
                                                <span className="text-xs font-semibold text-slate-800">مبيعات الفواتير النقدية (وارد)</span>
                                                <input
                                                    type="checkbox"
                                                    checked={syncSales}
                                                    onChange={(e) => setSyncSales(e.target.checked)}
                                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                />
                                            </label>

                                            <label className="flex items-center justify-between py-1 px-1.5 cursor-pointer hover:bg-slate-100 rounded-lg transition-colors">
                                                <span className="text-xs font-semibold text-slate-800">مشتريات الموردين النقدية (منصرف)</span>
                                                <input
                                                    type="checkbox"
                                                    checked={syncPurchases}
                                                    onChange={(e) => setSyncPurchases(e.target.checked)}
                                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                />
                                            </label>

                                            <label className="flex items-center justify-between py-1 px-1.5 cursor-pointer hover:bg-slate-100 rounded-lg transition-colors">
                                                <span className="text-xs font-semibold text-slate-800">المصروفات النقدية (منصرف)</span>
                                                <input
                                                    type="checkbox"
                                                    checked={syncExpenses}
                                                    onChange={(e) => setSyncExpenses(e.target.checked)}
                                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                />
                                            </label>

                                            <label className="flex items-center justify-between py-1 px-1.5 cursor-pointer hover:bg-slate-100 rounded-lg transition-colors">
                                                <span className="text-xs font-semibold text-slate-800">سندات القبض والصرف (وارد/منصرف)</span>
                                                <input
                                                    type="checkbox"
                                                    checked={syncVouchers}
                                                    onChange={(e) => setSyncVouchers(e.target.checked)}
                                                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                                />
                                            </label>
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex gap-3 border-t border-slate-100 pt-4 shrink-0">
                                        <button
                                            type="button"
                                            onClick={handleSyncCashbox}
                                            disabled={!syncSales && !syncPurchases && !syncExpenses && !syncVouchers}
                                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                                        >
                                            <RefreshCw size={14} />
                                            بدء المزامنة
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsSyncModalOpen(false)}
                                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 py-2.5 rounded-xl font-bold text-sm transition"
                                        >
                                            إلغاء
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

