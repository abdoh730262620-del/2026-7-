import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { Printer, ChevronLeft, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';
import { printReport } from '../../lib/printHelper';
import SearchableSelect from '../../components/SearchableSelect';

const EXPENSES_REPORTS = [
    { id: 'expenses_report', title: 'تقرير بالمصروفات' },
    { id: 'expenses_by_account', title: 'تقرير بالمصروفات حسب الحساب' },
    { id: 'expenses_for_account', title: 'تقرير بالمصروفات لحساب', requiresAccount: true },
];

export default function ExpensesReport({ dateRange }: { dateRange: { startDate: string, endDate: string } }) {
    const { appUser } = useAuthStore();
    const [expandedReport, setExpandedReport] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    
    const [accounts, setAccounts] = useState<string[]>([]);
    const [selectedAccount, setSelectedAccount] = useState('');

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || 'single_store';

        // Fetch all unique accounts/categories from past expenses
        const fetchAccounts = async () => {
            try {
                const snap = await getDocs(query(
                    collection(db, 'cash'), 
                    where('tenantId', '==', tenantId),
                    where('type', '==', 'out'), 
                    where('category', '==', 'expense')
                ));
                const accs = new Set<string>();
                snap.forEach(doc => {
                    const desc = doc.data().description || '';
                    const parts = desc.split(':');
                    if (parts.length > 1) {
                        accs.add(parts[0].trim());
                    } else {
                        accs.add('أخرى');
                    }
                });
                setAccounts(Array.from(accs));
            } catch(e) {
                console.error("Failed to load accounts", e);
            }
        };
        fetchAccounts();
    }, [appUser]);

    const runReport = async (reportId: string) => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || 'single_store';

        setIsLoading(true);
        try {
            const start = new Date(dateRange.startDate).getTime();
            const end = new Date(dateRange.endDate).getTime() + 86399999;

            const snap = await getDocs(query(
                collection(db, 'cash'), 
                where('tenantId', '==', tenantId),
                where('type', '==', 'out'), 
                where('category', '==', 'expense')
            ));
            const expenses: any[] = [];
            
            snap.forEach(doc => {
                const d = doc.data();
                const dDate = d.date || d.createdAt;
                if (dDate >= start && dDate <= end) {
                    const desc = d.description || '';
                    const parts = desc.split(':');
                    const account = parts.length > 1 ? parts[0].trim() : 'أخرى';
                    const detail = parts.length > 1 ? parts.slice(1).join(':').trim() : desc;
                    expenses.push({ ...d, account, detail, dDate });
                }
            });

            expenses.sort((a,b) => a.dDate - b.dDate);

            switch(reportId) {
                case 'expenses_report': {
                    const rows = expenses.map(e => [
                        new Date(e.dDate).toLocaleDateString('ar-EG'),
                        e.account,
                        e.amount.toLocaleString(),
                        e.detail || '-'
                    ]);
                    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
                    rows.push(['الإجمالي', '-', total.toLocaleString() + ' ر.س', '-']);

                    printReport(`تقرير بالمصروفات`, ['التاريخ', 'الحساب (الفئة)', 'المبلغ', 'البيان'], rows);
                    break;
                }
                case 'expenses_by_account': {
                    const accMap = new Map();
                    expenses.forEach(e => {
                        const ex = accMap.get(e.account) || { count: 0, total: 0 };
                        accMap.set(e.account, { count: ex.count + 1, total: ex.total + e.amount });
                    });

                    const rows = Array.from(accMap.entries()).map(([k,v]) => [
                        k,
                        v.count.toString(),
                        v.total.toLocaleString()
                    ]);
                    
                    const grandTotal = Array.from(accMap.values()).reduce((sum, v) => sum + v.total, 0);
                    rows.push(['الإجمالي', '-', grandTotal.toLocaleString() + ' ر.س']);

                    printReport(`تقرير بالمصروفات حسب الحساب`, ['الحساب (الفئة)', 'عدد الحركات', 'المبلغ الإجمالي'], rows);
                    break;
                }
                case 'expenses_for_account': {
                    if (!selectedAccount) {
                        alert('الرجاء اختيار الحساب');
                        setIsLoading(false);
                        return;
                    }
                    
                    const filtered = expenses.filter(e => e.account === selectedAccount);
                    const rows = filtered.map(e => [
                        new Date(e.dDate).toLocaleDateString('ar-EG'),
                        e.amount.toLocaleString(),
                        e.detail || '-'
                    ]);
                    
                    const total = filtered.reduce((sum, e) => sum + e.amount, 0);
                    rows.push(['الإجمالي', total.toLocaleString() + ' ر.س', '-']);

                    printReport(`تقرير بالمصروفات لحساب: ${selectedAccount}`, ['التاريخ', 'المبلغ', 'البيان'], rows);
                    break;
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
                    {EXPENSES_REPORTS.map((rep) => {
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
                                        
                                        {rep.requiresAccount && (
                                            <div className="flex flex-col gap-2">
                                                <div className="w-full md:w-3/4">
                                                    <SearchableSelect 
                                                        options={accounts}
                                                        value={selectedAccount}
                                                        onChange={setSelectedAccount}
                                                        placeholder="اختر أو اكتب اسم الحساب..."
                                                    />
                                                </div>
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
