import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, addDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { format } from 'date-fns';
import { logUserAction } from '../lib/logger';
import { ArrowLeft, Check } from 'lucide-react';

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

                    <button type="submit" className="w-full bg-[#D9D9D9] hover:bg-gray-400 py-3 mt-auto rounded-xl shadow flex justify-center text-black font-bold text-lg border border-gray-300 transition-all active:scale-[0.98] shrink-0">
                        أضافة المبلغ للصندوق
                    </button>
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
        </div>
    );
}

