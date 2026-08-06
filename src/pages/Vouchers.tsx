import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, doc, onSnapshot, orderBy, writeBatch, increment, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { logUserAction } from '../lib/logger';
import { format } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight, Search, ArrowLeft } from 'lucide-react';

interface Party {
    id: string;
    name: string;
    balance: number; // positive means they owe us (Customer), negative means we owe them (Supplier) or vice versa depending on logic.
}

interface Voucher {
    id: string;
    voucherNumber: string;
    date: number;
    amount: number;
    type: 'receipt' | 'payment'; // receipt = in (قبض), payment = out (صرف)
    partyId: string;
    partyType: 'customer' | 'supplier';
    partyName: string;
    description: string;
    createdBy: string;
}

import { useNavigate } from 'react-router-dom';

export default function Vouchers() {
    const navigate = useNavigate();
    const { appUser, hasPermission } = useAuthStore();
    const { settings } = useSettingsStore();

    const canView = hasPermission('vouchers', 'view');
    const canAdd = hasPermission('vouchers', 'add');
    const [vouchers, setVouchers] = useState<Voucher[]>([]);
    const [customers, setCustomers] = useState<Party[]>([]);
    const [suppliers, setSuppliers] = useState<Party[]>([]);
    
    // Form state
    const [type, setType] = useState<'receipt' | 'payment'>('receipt');
    const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer');
    const [partyId, setPartyId] = useState('');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [nextVoucherNum, setNextVoucherNum] = useState('...');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!appUser?.uid) return;
        const tenantId = appUser?.tenantId || 'single_store';

        // Load vouchers
        const qV = query(
            collection(db, 'vouchers'), 
            where('tenantId', '==', tenantId),
            orderBy('date', 'desc')
        );
        const unsubV = onSnapshot(qV, snap => {
            setVouchers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Voucher)));
        });

        // Load next voucher number
        const qNum = query(
            collection(db, 'vouchers'), 
            where('tenantId', '==', tenantId),
            orderBy('voucherNumber', 'desc')
        );
        const unsubNum = onSnapshot(qNum, snap => {
            if (!snap.empty) {
                // Find max voucherNumber numerically
                const allNums = snap.docs.map(d => parseInt(d.data().voucherNumber) || 0);
                const maxNum = Math.max(...allNums);
                setNextVoucherNum((maxNum + 1).toString());
            } else {
                setNextVoucherNum('1');
            }
        });

        // Load customers and suppliers
        const qCust = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
        const unsubCustomers = onSnapshot(qCust, (snap) => {
            setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Party)));
        }, (error) => handleFirestoreError(error, OperationType.GET, 'customers-vouchers'));

        const qSupp = query(collection(db, 'suppliers'), where('tenantId', '==', tenantId));
        const unsubSuppliers = onSnapshot(qSupp, (snap) => {
            setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Party)));
        }, (error) => handleFirestoreError(error, OperationType.GET, 'suppliers-vouchers'));

        return () => {
            unsubV();
            unsubNum();
            unsubCustomers();
            unsubSuppliers();
        };
    }, [appUser]);

    const selectedPartySet = partyType === 'customer' ? customers : suppliers;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canAdd) {
            alert('ليس لديك صلاحية لإضافة سندات.');
            return;
        }
        const numAmount = parseFloat(amount);
        if (numAmount <= 0 || !partyId) return;

        setIsSubmitting(true);
        try {
            const tenantId = appUser?.tenantId || 'single_store';
            const batch = writeBatch(db);
            const now = Date.now();
            const partyRef = doc(db, partyType === 'customer' ? 'customers' : 'suppliers', partyId);
            
            let balanceAmount = numAmount;
            if (partyType === 'customer') {
                if (type === 'receipt') balanceAmount = -numAmount;
                else balanceAmount = numAmount;
            } else {
                if (type === 'payment') balanceAmount = -numAmount;
                else balanceAmount = numAmount;
            }

            batch.update(partyRef, { 
                balance: increment(balanceAmount),
                updatedAt: now 
            });

            const partyName = selectedPartySet.find(p => p.id === partyId)?.name || 'Unknown';
            const vNum = nextVoucherNum === '...' ? '0' : nextVoucherNum;

            // Auto-allocate receipt voucher to credit (آجل) invoices if customer receipt
            let paidInvoiceNumbers: string[] = [];
            if (partyType === 'customer' && type === 'receipt') {
                try {
                    const salesSnap = await getDocs(
                        query(
                            collection(db, 'sales'),
                            where('tenantId', '==', tenantId),
                            where('customerId', '==', partyId),
                            where('paymentType', '==', 'credit')
                        )
                    );
                    
                    const unpaidInvoices: any[] = [];
                    salesSnap.forEach(docSnap => {
                        const data = docSnap.data();
                        if (data.status !== 'paid' && data.status !== 'cancelled' && data.status !== 'returned') {
                            unpaidInvoices.push({ id: docSnap.id, ...data });
                        }
                    });
                    
                    // Oldest first
                    unpaidInvoices.sort((a, b) => (a.createdAt || a.date || 0) - (b.createdAt || b.date || 0));
                    
                    let remainingPayment = numAmount;
                    for (const inv of unpaidInvoices) {
                        if (remainingPayment <= 0) break;
                        
                        const invoiceTotal = parseFloat(inv.total) || 0;
                        const alreadyPaid = parseFloat(inv.paidAmount || 0) || 0;
                        const invoiceRemaining = invoiceTotal - alreadyPaid;
                        
                        if (invoiceRemaining <= 0) continue;
                        
                        if (remainingPayment >= invoiceRemaining) {
                            batch.update(doc(db, 'sales', inv.id), { 
                                status: 'paid', 
                                paidAmount: invoiceTotal 
                            });
                            remainingPayment -= invoiceRemaining;
                            paidInvoiceNumbers.push(inv.invoiceNumber);
                        } else {
                            batch.update(doc(db, 'sales', inv.id), { 
                                paidAmount: alreadyPaid + remainingPayment 
                            });
                            remainingPayment = 0;
                            paidInvoiceNumbers.push(inv.invoiceNumber + ' (جزئي)');
                        }
                    }
                } catch (err) {
                    console.error('Error auto-allocating voucher to invoices:', err);
                }
            }

            const invoiceDetails = paidInvoiceNumbers.length ? ` (تسديد فواتير: ${paidInvoiceNumbers.join(', ')})` : '';
            const finalDescription = description 
                ? `${description}${invoiceDetails}` 
                : (paidInvoiceNumbers.length ? `تسديد فواتير: ${paidInvoiceNumbers.join(', ')}` : 'سند قبض');

            // Save voucher
            const vRef = doc(collection(db, 'vouchers'));
            batch.set(vRef, {
                voucherNumber: vNum,
                date: now,
                amount: numAmount,
                type,
                partyId,
                partyType,
                partyName,
                description: finalDescription,
                createdBy: appUser?.uid,
                tenantId
            });

            // Update Cash Box
            let affectsCash = true;
            if (type === 'receipt') affectsCash = settings.cashIncludeSales !== false;
            else if (type === 'payment') affectsCash = settings.cashIncludePurchases !== false;

            const cashRef = doc(collection(db, 'cash'));
            batch.set(cashRef, {
                voucherNumber: vNum,
                date: now,
                amount: numAmount,
                type: type === 'receipt' ? 'in' : 'out',
                category: type === 'receipt' ? 'in_payment' : 'out_payment',
                description: `سند ${type === 'receipt' ? 'قبض' : 'صرف'} #${vNum} - ${partyType === 'customer' ? 'عميل' : 'مورد'}: ${partyName} - ${finalDescription}`,
                referenceId: vRef.id,
                createdBy: appUser?.uid,
                createdAt: now,
                affectsCash,
                tenantId
            });
            
            await batch.commit();

            logUserAction(`سند ${type === 'receipt' ? 'قبض' : 'صرف'}`, `مبلغ ${amount} ر.س (${partyType === 'customer' ? 'عميل' : 'مورد'})`).catch(()=>{});
            setAmount('');
            setDescription('');
            setPartyId('');
            alert('تم تسجيل العملية بنجاح');
        } catch (error: any) {
            handleFirestoreError(error, OperationType.WRITE, 'vouchers');
            alert('حدث خطأ أثناء حفظ العملية');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!canView) {
        return <div className="p-5 md:p-8 text-center text-red-600 font-bold text-base md:text-xl">ليس لديك صلاحية للوصول إلى صفحة السندات</div>;
    }

    return (
        <div className="pb-8 pt-2 px-2 max-w-lg mx-auto w-full" dir="rtl">
            <div className="flex items-center gap-4 mb-4">
                <h1 className="text-xl font-black text-text-main">سندات القبض والصرف</h1>
            </div>
            <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
                <h2 className="text-sm font-bold mb-3 text-black dark:text-gray-100">إنشاء سند جديد</h2>
                <form onSubmit={handleSubmit} className="space-y-2.5">
                    <div>
                        <label className="block text-xs font-bold mb-1 text-black dark:text-gray-200">نوع السند</label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setType('receipt')}
                                className={`flex-1 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 border transition-all text-sm ${type === 'receipt' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white dark:bg-slate-900 text-black dark:text-gray-300 border-gray-200 hover:bg-white hover:text-emerald-600'}`}
                            >
                                <ArrowDownLeft size={16} /> قبض
                            </button>
                            {appUser?.role !== 'salesman' && (
                                <button
                                    type="button"
                                    onClick={() => setType('payment')}
                                    className={`flex-1 py-1.5 rounded-lg font-bold flex items-center justify-center gap-1 border transition-all text-sm ${type === 'payment' ? 'bg-red-600 text-white border-red-600 shadow-sm' : 'bg-white dark:bg-slate-900 text-black dark:text-gray-300 border-gray-200 hover:bg-white hover:text-red-600'}`}
                                >
                                    <ArrowUpRight size={16} /> صرف
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold mb-1 text-black dark:text-gray-200">الطرف المستهدف</label>
                        <div className="flex gap-4 mb-1.5">
                            <label className="flex items-center gap-1 cursor-pointer group">
                                <input type="radio" checked={partyType === 'customer'} onChange={() => { setPartyType('customer'); setPartyId(''); }} className="accent-blue-600 w-3 h-3 cursor-pointer" /> 
                                <span className="font-bold text-xs text-black dark:text-gray-300 group-hover:text-blue-600 transition-colors">عميل</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer group">
                                <input type="radio" checked={partyType === 'supplier'} onChange={() => { setPartyType('supplier'); setPartyId(''); }} className="accent-purple-600 w-3 h-3 cursor-pointer" /> 
                                <span className="font-bold text-xs text-black dark:text-gray-300 group-hover:text-purple-600 transition-colors">مورد</span>
                            </label>
                        </div>
                        <select 
                            required
                            value={partyId}
                            onChange={e => setPartyId(e.target.value)}
                            className="w-full border border-gray-200 bg-white dark:bg-slate-900 rounded-lg p-2 outline-none focus:border-blue-500 font-bold text-sm text-black dark:text-gray-100 transition-all"
                        >
                            <option value="">-- اختر الطرف --</option>
                            {selectedPartySet.map(p => (
                                <option key={p.id} value={p.id}>{p.name} (الرصيد: {p.balance})</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold mb-1 text-black dark:text-gray-200">المبلغ</label>
                        <input 
                            type="number" 
                            required 
                            min="0.01" 
                            step="0.01"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            className="w-full border border-gray-200 bg-white dark:bg-slate-900 rounded-lg p-2 outline-none focus:border-blue-500 font-bold text-center text-base transition-all"
                            placeholder="0.00"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold mb-1 text-black dark:text-gray-200">البيان / التفاصيل</label>
                        <textarea 
                            required
                            rows={2}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full border border-gray-200 bg-white dark:bg-slate-900 rounded-lg p-2 outline-none focus:border-blue-500 font-bold text-sm text-black dark:text-gray-100 transition-all resize-none"
                            placeholder="سبب القبض أو الصرف..."
                        />
                    </div>

                    <button 
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 mt-2 rounded-lg transition disabled:opacity-50 shadow-sm active:scale-95 text-sm flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? 'جاري الحفظ...' : `حفظ السند #${nextVoucherNum} واعتماده`}
                    </button>
                </form>
            </div>

        </div>
    );
}
