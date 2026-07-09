import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, where, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Star, Users, History, Gift, Search, ArrowUpRight, ArrowDownRight, Settings, ArrowLeft } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';
import { motion, AnimatePresence } from 'framer-motion';

interface LoyaltyLog {
    id: string;
    customerId: string;
    customerName: string;
    points: number;
    type: 'earn' | 'redeem';
    reason: string;
    timestamp: number;
}

interface Customer {
    id: string;
    name: string;
    points: number;
    phone?: string;
}

import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../store/authStore';

export default function Loyalty() {
    const { appUser } = useAuthStore();
    const navigate = useNavigate();
    const { settings } = useSettingsStore();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [logs, setLogs] = useState<LoyaltyLog[]>([]);
    const [search, setSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [redeemAmount, setRedeemAmount] = useState(0);
    const [isSuggestOpen, setIsSuggestOpen] = useState(false);

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

        const qUsers = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
        const unsubUsers = onSnapshot(qUsers, (snap) => {
            const list: Customer[] = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() } as Customer));
            setCustomers(list);
        });

        const qLogs = query(collection(db, 'loyalty_logs'), where('tenantId', '==', tenantId));
        const unsubLogs = onSnapshot(qLogs, (snap) => {
            const list: LoyaltyLog[] = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() } as LoyaltyLog));
            setLogs(list.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50));
        });

        return () => { unsubUsers(); unsubLogs(); };
    }, [appUser]);

    const filtered = customers.filter(c => {
        const matches = (c.name || '').toLowerCase().includes(search.toLowerCase()) || 
                        (c.phone || '').includes(search);
        if (search === '') {
            return matches && (c.points || 0) > 0;
        }
        return matches;
    });

    const handleRedeem = async () => {
        if (!selectedCustomer || redeemAmount <= 0 || redeemAmount > selectedCustomer.points || !appUser) return;
        
        try {
            const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

            await updateDoc(doc(db, 'customers', selectedCustomer.id), {
                points: selectedCustomer.points - redeemAmount
            });

            await addDoc(collection(db, 'loyalty_logs'), {
                customerId: selectedCustomer.id,
                customerName: selectedCustomer.name,
                points: redeemAmount,
                type: 'redeem',
                reason: 'استبدال نقاط يدوياً',
                timestamp: Date.now(),
                tenantId
            });

            setSelectedCustomer(null);
            setRedeemAmount(0);
        } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, 'customers');
        }
    };

    return (
        <div className="w-full h-full pb-4 px-2" dir="rtl">
            <div className="bg-white text-black px-3 py-1.5 rounded-lg border border-gray-200 flex items-center gap-2 font-bold shadow-sm mb-4 w-fit">
                <span>إجمالي النقاط النشطة:</span>
                <span>{customers.reduce((sum, c) => sum + (c.points || 0), 0).toLocaleString()}</span>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Customers with Points */}
                <div className="lg:col-span-2">
                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex-1 relative">
                                <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input 
                                    type="text" 
                                    placeholder="ابحث عن عميل..."
                                    className="w-full bg-white dark:bg-slate-900 border border-gray-200 pr-9 pl-3 py-2 rounded-lg font-bold text-sm outline-none focus:border-yellow-400 focus:bg-white transition-colors"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setIsSuggestOpen(true);
                                    }}
                                    onFocus={() => setIsSuggestOpen(true)}
                                    onBlur={() => setTimeout(() => setIsSuggestOpen(false), 200)}
                                />
                                <AnimatePresence>
                                    {isSuggestOpen && search.trim() !== '' && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 5 }}
                                            className="absolute top-full right-0 left-0 mt-1.5 z-[100] bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto p-1.5 flex flex-col gap-1"
                                        >
                                            {filtered.slice(0, 8).map(c => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSearch(c.name);
                                                        setSelectedCustomer(c);
                                                        setIsSuggestOpen(false);
                                                    }}
                                                    className="w-full text-right p-2.5 hover:bg-yellow-50 dark:hover:bg-yellow-950/20 rounded-lg flex items-center justify-between transition-colors border border-transparent hover:border-yellow-105"
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sm text-black dark:text-gray-100">{c.name}</span>
                                                        <span className="text-[10px] text-gray-400 font-bold mt-0.5">{c.phone || 'بدون هاتف'}</span>
                                                    </div>
                                                    <div className="text-left bg-yellow-50 dark:bg-yellow-950/20 text-yellow-600 px-2 py-1 rounded-lg text-xs font-black flex items-center gap-1">
                                                        <Star size={12} className="fill-yellow-500 text-yellow-500" />
                                                        <span>{(c.points || 0).toLocaleString()} نقطة</span>
                                                    </div>
                                                </button>
                                            ))}
                                            {filtered.length === 0 && (
                                                <div className="p-4 text-center text-xs font-extrabold text-gray-400 italic">
                                                    لا يوجد عميل مطابق للبحث
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
                            {filtered.map(customer => (
                                <div key={customer.id} className="p-3 bg-white dark:bg-slate-900 hover:bg-white border border-gray-100 rounded-lg flex items-center justify-between transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 flex-none bg-white rounded-lg flex items-center justify-center font-bold text-black dark:text-gray-200 border border-gray-200 shadow-sm">
                                            {customer.name[0]}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-black dark:text-gray-100">{customer.name}</p>
                                            <p className="text-xs text-black font-semibold">{customer.phone || 'بدون هاتف'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-left leading-tight">
                                            <p className="text-sm font-black text-yellow-600">{(customer.points || 0).toLocaleString()}</p>
                                            <p className="text-[10px] font-bold text-gray-400">نقطة</p>
                                        </div>
                                        <button 
                                            onClick={() => setSelectedCustomer(customer)}
                                            className="p-2 bg-yellow-400 text-white rounded-lg hover:bg-yellow-500 transition-colors shadow-sm"
                                        >
                                            <Gift size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Sidebar: Logs & Settings Info */}
                <div className="flex flex-col gap-3">
                    <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex-1 max-h-[40vh] overflow-hidden flex flex-col">
                        <h3 className="font-bold text-black dark:text-gray-100 text-sm mb-3 flex items-center gap-1.5">
                            <History size={16} className="text-black" />
                            السجلات الأخيرة
                        </h3>
                        <div className="flex-col flex gap-2 overflow-y-auto pr-1">
                            {logs.map(log => (
                                <div key={log.id} className="flex gap-2 items-start p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-100">
                                    <div className={`p-1.5 rounded-md shrink-0 mt-0.5 ${log.type === 'earn' ? 'bg-white text-emerald-600' : 'bg-white text-rose-600'}`}>
                                        {log.type === 'earn' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <p className="text-xs font-bold text-black dark:text-gray-100 truncate pl-2">{log.customerName}</p>
                                            <span className={`text-xs font-black shrink-0 ${log.type === 'earn' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {log.type === 'earn' ? '+' : '-'}{log.points}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-end mt-1">
                                            <span className="text-[10px] font-semibold text-black">{log.reason}</span>
                                            <span className="text-[9px] font-medium text-gray-400 text-left shrink-0">
                                                {new Date(log.timestamp).toLocaleTimeString('ar-SA')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200">
                        <h4 className="text-sm font-bold mb-3 text-black dark:text-gray-100 flex items-center gap-1.5">
                            <Settings size={16} className="text-black" /> 
                            إعدادات النقاط
                        </h4>
                        <div className="space-y-2 text-sm max-w-sm">
                            <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                                <span className="font-semibold text-black dark:text-gray-300 text-xs">النقاط لكل 100 ر.س</span>
                                <span className="font-black text-yellow-600">{settings.loyaltyPointsPerAmount}</span>
                            </div>
                            <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                                <span className="font-semibold text-black dark:text-gray-300 text-xs">تضمين الآجل</span>
                                <span className="font-bold text-black dark:text-gray-100 text-xs">{settings.includeCreditInLoyalty ? 'نعم' : 'لا'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Redemption Modal */}
            <AnimatePresence>
                {selectedCustomer && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-3">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl p-5 max-w-[320px] w-full shadow-xl border border-gray-100"
                        >
                            <h2 className="text-base font-bold text-black dark:text-gray-100 mb-1">استبدال نقاط</h2>
                            <p className="text-xs font-semibold text-black mb-4">{selectedCustomer.name}</p>

                            <div className="mb-4 p-3 bg-white rounded-xl text-center border border-yellow-100">
                                <p className="text-[10px] font-bold text-yellow-700 mb-1">الرصيد المتاح</p>
                                <p className="text-2xl font-black text-yellow-600">{(selectedCustomer.points || 0).toLocaleString()}</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-black dark:text-gray-300 mb-1.5 block">عدد النقاط المراد خصمها</label>
                                    <input 
                                        type="number" 
                                        max={selectedCustomer.points || 0}
                                        value={redeemAmount}
                                        onChange={(e) => setRedeemAmount(Number(e.target.value))}
                                        className="w-full bg-white border border-gray-200 p-2.5 rounded-xl text-center text-lg font-black focus:border-yellow-400 outline-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2 mt-4">
                                    <button 
                                        onClick={() => setSelectedCustomer(null)}
                                        className="py-2.5 rounded-xl bg-white dark:bg-slate-800 text-black dark:text-gray-300 font-bold hover:bg-white transition-colors text-sm"
                                    >
                                        إلغاء
                                    </button>
                                    <button 
                                        onClick={handleRedeem}
                                        disabled={redeemAmount <= 0 || redeemAmount > (selectedCustomer.points || 0)}
                                        className="py-2.5 rounded-xl bg-yellow-400 text-white font-bold hover:bg-yellow-500 transition-colors disabled:opacity-50 text-sm shadow-sm"
                                    >
                                        تأكيد
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
