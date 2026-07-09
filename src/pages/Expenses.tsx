import React, { useState, useEffect } from 'react';
import { collection, doc, writeBatch, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { format } from 'date-fns';
import { logUserAction } from '../lib/logger';
import { Trash2, ArrowLeft } from 'lucide-react';

interface Expense {
    id: string;
    account: string;
    amount: number;
    date: number;
    description: string;
    expenseId?: string;
}

import { useNavigate } from 'react-router-dom';

export default function Expenses() {
    const navigate = useNavigate();
    const { appUser } = useAuthStore();
    const { settings } = useSettingsStore();
    
    const [account, setAccount] = useState('');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'check'>('cash');
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
    const [savedAccounts, setSavedAccounts] = useState<{id: string, name: string}[]>([]);
    const [showAccountSuggestions, setShowAccountSuggestions] = useState(false);

    useEffect(() => {
        if (!appUser?.uid) return;
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

        // We'll query recent expenses from the cash collection (for backward compatibility) and expenses collection
        // Easiest is to query expenses directly
        const qExp = query(
            collection(db, 'expenses'), 
            where('tenantId', '==', tenantId),
            orderBy('createdAt', 'desc'), 
            limit(10)
        );
        const unsubscribeExp = onSnapshot(qExp, (snap) => {
            const list: Expense[] = [];
            snap.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() } as Expense);
            });
            setRecentExpenses(list);
        });
        
        const qAcc = query(
            collection(db, 'expense_accounts'), 
            where('tenantId', '==', tenantId),
            orderBy('name')
        );
        const unsubscribeAcc = onSnapshot(qAcc, snap => {
            const list = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
            setSavedAccounts(list);
        });
        
        return () => {
            unsubscribeExp();
            unsubscribeAcc();
        };
    }, [appUser]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const numAmount = parseFloat(amount);
        if (!numAmount || numAmount <= 0) {
             alert('الرجاء إدخال مبلغ صحيح');
             return;
        }

        if (!account || account.trim() === '') {
            alert('الرجاء إدخال البند / المورد / لحساب');
            return;
        }

        if (!description || description.trim().length < 15) {
            alert('التفاصيل والبيان يجب أن لا تقل عن 15 حرفاً');
            return;
        }

        try {
            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
            const now = Date.now();
            const expenseDate = new Date(date).getTime();
            const referenceId = `EXP-${now}`;
            const affectsCash = paymentMethod === 'cash' && (settings.cashIncludeExpenses !== false);

            const batch = writeBatch(db);

            // 1. Add to expenses collection
            const expRef = doc(collection(db, 'expenses'));
            batch.set(expRef, {
                account,
                description,
                amount: numAmount,
                paymentMethod,
                date: expenseDate,
                referenceId,
                createdBy: appUser?.uid || 'unknown',
                createdAt: now,
                affectsCash,
                tenantId
            });

            // 2. Add to cash collection if it affects cash
            if (affectsCash || paymentMethod !== 'cash') {
                const cashRef = doc(collection(db, 'cash'));
                batch.set(cashRef, {
                    date: expenseDate, // Use the selected date instead of now
                    amount: numAmount,
                    type: 'out',
                    category: 'expense',
                    description: `${account}: ${description} (${paymentMethod === 'cash' ? 'نقد' : paymentMethod === 'card' ? 'بطاقة' : 'شيك'})`,
                    referenceId,
                    expenseId: expRef.id, // Linking back
                    createdBy: appUser?.uid || 'unknown',
                    createdAt: now,
                    affectsCash,
                    tenantId
                });
            }

            // 3. Save account to expense_accounts if it doesn't exist
            const exists = savedAccounts.find(a => a.name === account.trim());
            if (!exists) {
                const accRef = doc(collection(db, 'expense_accounts'));
                batch.set(accRef, { 
                    name: account.trim(),
                    tenantId
                });
            }

            await batch.commit();
            
            await logUserAction('إضافة مصروف', `تم تسجيل مصروف ${account} بقيمة ${numAmount}`);
            setAccount('');
            setDescription('');
            setAmount('');
            alert('تم الحفظ بنجاح');
        } catch (error: any) {
            handleFirestoreError(error, OperationType.CREATE, 'expenses');
            alert('فشل في إضافة المصروف');
        }
    };

    const handleDelete = async (exp: Expense) => {
        if (!window.confirm('هل أنت متأكد من حذف هذا المصروف؟')) return;
        const currentTenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
        try {
            const batch = writeBatch(db);
            // Delete from expenses
            batch.delete(doc(db, 'expenses', exp.id));
            
            // Delete from cash
            // We need to find the cash entry. Usually referenceId matches, but we don't have it in Expense type.
            // Let's do a quick query for cash entries that have expenseId == exp.id
            import('firebase/firestore').then(({ getDocs, query, collection, where }) => {
                getDocs(query(collection(db, 'cash'), where('tenantId', '==', currentTenantId), where('expenseId', '==', exp.id))).then(snap => {
                    snap.forEach(d => batch.delete(d.ref));
                    batch.commit().then(() => {
                        logUserAction('حذف مصروف', `تم حذف مصروف ${exp.account} بقيمة ${exp.amount}`);
                        alert('تم حذف المصروف بنجاح');
                    });
                });
            });
        } catch(e) {
            alert('فشل في الحذف');
        }
    };

    return (
        <div className="max-w-md mx-auto w-full h-full bg-[#FDFDFD] relative flex flex-col overflow-y-auto" dir="rtl">
            <form onSubmit={handleSubmit} className="px-4 flex flex-col gap-4 mt-4 shrink-0">
                
                <div className="flex flex-col gap-1.5 shrink-0">
                    <label className="text-right text-black font-bold mr-2 text-sm">البند / المورد / لحساب</label>
                    <div className="relative">
                        <input 
                            type="text" 
                            value={account}
                            onChange={e => {
                                setAccount(e.target.value);
                                setShowAccountSuggestions(true);
                            }}
                            onFocus={() => setShowAccountSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowAccountSuggestions(false), 200)}
                            className="w-full border-2 border-[#94B8C7] rounded-xl p-3 text-right bg-white focus:outline-none text-base text-black dark:text-gray-100 placeholder-gray-500 font-semibold"
                            placeholder="ابحث أو اكتب اسم الحساب"
                            required
                        />
                        {showAccountSuggestions && savedAccounts.filter(a => a.name.includes(account)).length > 0 && (
                            <div className="absolute top-full right-0 w-full mt-1 max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                                {savedAccounts.filter(a => a.name.includes(account)).map(a => (
                                    <div key={a.id} className="p-3 hover:bg-[#94B8C7]/20 cursor-pointer text-sm font-semibold border-b border-gray-50 last:border-b-0 transition-colors" onClick={() => { setAccount(a.name); setShowAccountSuggestions(false); }}>
                                        {a.name}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-1.5 shrink-0">
                    <label className="text-right text-black font-bold mr-2 text-sm">التفاصيل والبيان</label>
                    <input 
                        type="text" 
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        className="w-full border-2 border-[#94B8C7] rounded-xl p-3 text-right bg-white focus:outline-none text-base text-black dark:text-gray-100 placeholder-gray-500 font-semibold"
                        placeholder="ابحث أو اكتب البيان"
                        required
                    />
                </div>

                <div className="flex flex-col gap-1.5 shrink-0">
                    <label className="text-right text-black font-bold mr-2 text-sm">المبلغ الاجمالي</label>
                    <input 
                        type="number" 
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        className="w-full border-2 border-[#94B8C7] rounded-xl p-3 text-center text-xl font-bold text-[#E91E63] focus:outline-none"
                        placeholder="0"
                        required
                    />
                </div>

                <div className="flex items-center justify-between mt-1 mb-1 shrink-0 bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                    <span className="text-black font-bold text-sm">طريقة الدفع:</span>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer flex-row-reverse border border-[#94B8C7] rounded-lg p-2.5 bg-white dark:bg-slate-900">
                            <span className="text-black font-bold text-sm">شيك</span>
                            <div className={`w-5 h-5 rounded-full border-2 p-0.5 flex items-center justify-center ${paymentMethod === 'check' ? 'border-[#C0392B]' : 'border-gray-400'}`}>
                                <div className={`w-full h-full rounded-full ${paymentMethod === 'check' ? 'bg-[#C0392B]' : 'bg-transparent'}`}></div>
                            </div>
                            <input type="radio" className="hidden" checked={paymentMethod === 'check'} onChange={() => setPaymentMethod('check')} />
                        </label>
                        
                        <label className="flex items-center gap-1.5 cursor-pointer flex-row-reverse border border-[#94B8C7] rounded-lg p-2.5 bg-white dark:bg-slate-900">
                            <span className="text-black font-bold text-sm">بطاقه</span>
                            <div className={`w-5 h-5 rounded-full border-2 p-0.5 flex items-center justify-center ${paymentMethod === 'card' ? 'border-[#C0392B]' : 'border-gray-400'}`}>
                                <div className={`w-full h-full rounded-full ${paymentMethod === 'card' ? 'bg-[#C0392B]' : 'bg-transparent'}`}></div>
                            </div>
                            <input type="radio" className="hidden" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} />
                        </label>

                        <label className="flex items-center gap-1.5 cursor-pointer flex-row-reverse border border-[#6EA84F] rounded-lg p-2.5 bg-[#EEF7D9]">
                            <span className="text-black font-bold text-sm">من الصندوق</span>
                            <div className={`w-5 h-5 rounded-full border-2 p-0.5 flex items-center justify-center ${paymentMethod === 'cash' ? 'border-[#6EA84F]' : 'border-gray-400'}`}>
                                <div className={`w-full h-full rounded-full ${paymentMethod === 'cash' ? 'bg-[#6EA84F]' : 'bg-transparent'}`}></div>
                            </div>
                            <input type="radio" className="hidden" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} />
                        </label>
                    </div>
                </div>

                <div className="flex w-full items-center border-2 border-[#94B8C7] rounded-xl overflow-hidden bg-white mt-1 shrink-0">
                    <div className="w-1/2 p-2 relative h-full">
                         <input 
                            type="date" 
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="w-full bg-[#D9D9D9] p-2 text-center font-bold outline-none text-base h-full rounded"
                         />
                    </div>
                    <div className="w-1/2 text-center text-sm font-bold border-r-2 border-[#94B8C7]">التاريخ</div>
                </div>

                <div className="flex-1"></div>

                <button type="submit" className="w-full bg-[#D9D9D9] hover:bg-gray-400 py-3.5 mt-2 mb-4 rounded-xl shadow flex justify-center text-black font-bold text-xl border border-gray-300 transition-all active:scale-[0.98] shrink-0">
                    حفظ
                </button>
            </form>

            {recentExpenses.length > 0 && (
                <div className="px-4 pb-10 flex flex-col gap-2">
                    <h3 className="text-right text-black font-bold text-sm mb-1">أحدث المصروفات</h3>
                    {recentExpenses.map((exp) => (
                        <div key={exp.id} className="bg-white border hover:bg-white border-gray-100 rounded-xl p-3 flex justify-between items-center shadow-sm">
                            <button onClick={() => handleDelete(exp)} className="text-red-500 p-2 hover:bg-white rounded-lg shrink-0">
                                <Trash2 size={18} />
                            </button>
                            <div className="flex flex-col flex-1 items-end mr-3">
                                <span className="font-bold text-sm text-black dark:text-gray-100">{exp.account}</span>
                                <span className="text-xs text-black font-medium">{exp.description}</span>
                                <span className="text-xs text-gray-400">{new Date(exp.date).toLocaleDateString('ar-EG')}</span>
                            </div>
                            <div className="font-bold text-[#E91E63] shrink-0 bg-white px-2 py-1 rounded-md">
                                {exp.amount.toLocaleString()}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

