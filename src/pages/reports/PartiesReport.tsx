import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Printer, ChevronLeft, ToggleLeft, ToggleRight, Loader2, AlertCircle } from 'lucide-react';
import { printReport } from '../../lib/printHelper';
import { getDaysSinceLastSync } from '../../lib/syncTracker';
import { useAuthStore } from '../../store/authStore';

import SearchableSelect from '../../components/SearchableSelect';

const CUSTOMER_REPORTS = [
    { id: 'customer_balances', title: 'ذمم العملاء', requiresCustomer: false },
    { id: 'customer_ledger', title: 'كشف حساب عميل', requiresCustomer: true, hasToggles: true },
    { id: 'customer_detailed_settlements', title: 'كشف حساب تفصيلي (تسويات ونقد)', requiresCustomer: true },
    { id: 'customer_confirmation', title: 'تقرير مصادقة حساب العميل', requiresCustomer: true },
    { id: 'customer_opening_cash', title: 'تقرير بحركه الرصيد الافتتاحي والنقد للعميل', requiresCustomer: true },
    { id: 'customer_invoices', title: 'تقرير بالفواتير لعميل', requiresCustomer: true },
    { id: 'customer_invoices_total', title: 'تقرير بالفواتير لعميل - إجمالي', requiresCustomer: true },
    { id: 'customer_returns', title: 'تقرير بالفواتير المرتجع لعميل', requiresCustomer: true },
    { id: 'customer_receipts', title: 'تقرير بسندات القبض لعميل', requiresCustomer: true },
    { id: 'customer_payments', title: 'تقرير بسندات الصرف العميل', requiresCustomer: true },
    { id: 'customer_payment_history', title: 'تقرير بحركة التسديد العميل', requiresCustomer: true },
    { id: 'customer_item_total', title: 'تقرير إجمالي حسب الصنف العميل', requiresCustomer: true },
    { id: 'customers_payment_history', title: 'تقرير بحركه السداد للعملاء', requiresCustomer: false },
    { id: 'customers_payment_methods', title: 'تقرير بحركه السداد للعملاء حسب طريقه الدفع', requiresCustomer: false },
];

const SUPPLIER_REPORTS = [
    { id: 'supplier_balances', title: 'تقرير بالمتبقي للموردين', requiresCustomer: false },
    { id: 'supplier_ledger', title: 'كشف حساب مورد', requiresCustomer: true, hasToggles: true },
    { id: 'supplier_opening_cash', title: 'تقرير بحركه الرصيد الافتتاحي والنقد للمورد', requiresCustomer: true },
    { id: 'supplier_invoices', title: 'تقرير بالفواتير لمورد', requiresCustomer: true },
    { id: 'supplier_invoices_total', title: 'تقرير بالفواتير لمورد - إجمالي', requiresCustomer: true },
    { id: 'supplier_payments', title: 'تقرير بسندات الصرف لمورد', requiresCustomer: true },
    { id: 'supplier_receipts', title: 'تقرير بسندات القبض لمورد', requiresCustomer: true },
    { id: 'supplier_payment_history', title: 'تقرير بحركة التسديد لمورد', requiresCustomer: true },
];

export default function PartiesReport({ dateRange }: { dateRange: { startDate: string, endDate: string } }) {
    const [customers, setCustomers] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
    const [expandedReport, setExpandedReport] = useState<string>('');
    const [selectedPartyName, setSelectedPartyName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const [opts, setOpts] = useState({
        detailed: false,
        hideBalance: false,
        hideOpening: false,
        showCash: false
    });

    useEffect(() => {
        if (!useAuthStore.getState().appUser) return;
        const tenantId = useAuthStore.getState().appUser?.tenantId || 'single_store';

        const unsubCust = onSnapshot(query(collection(db, 'customers'), where('tenantId', '==', tenantId)), snap => {
            setCustomers(snap.docs.map(d => ({id: d.id, ...d.data()})));
        }, (error) => handleFirestoreError(error, OperationType.GET, 'customers'));
        
        const unsubSupp = onSnapshot(query(collection(db, 'suppliers'), where('tenantId', '==', tenantId)), snap => {
            setSuppliers(snap.docs.map(d => ({id: d.id, ...d.data()})));
        }, (error) => handleFirestoreError(error, OperationType.GET, 'suppliers'));
        
        return () => { unsubCust(); unsubSupp(); }
    }, []);

    const toggleOpt = (key: keyof typeof opts) => {
        setOpts(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const runReport = async (reportId: string, partyType: 'customers' | 'suppliers') => {
        const isStatement = ['customer_ledger', 'customer_detailed_settlements', 'supplier_ledger'].includes(reportId);
        const daysNoSync = getDaysSinceLastSync();

        if (isStatement && (daysNoSync > 0 || !window.navigator.onLine)) {
            alert(`تنبيه: يوجد بيانات غير متزامنة مع السحابة منذ (${daysNoSync}) أيام. \nيرجى الاتصال بالإنترنت أولاً لضمان الحصول على كشف حساب صحيح ودقيق بالكامل من السحابة.`);
            // If they are offline, we definitely shouldn't let them think this is a complete statement if there's pending data.
            // But if the user wants to force it, we can allow, but the prompt says "it asks to connect to internet".
            // So we just return.
            return;
        }

        setIsLoading(true);
        try {
            const parties = partyType === 'customers' ? customers : suppliers;
            const isCust = partyType === 'customers';
            const selectedParty = parties.find(p => p.name === selectedPartyName);
            const reportList = isCust ? CUSTOMER_REPORTS : SUPPLIER_REPORTS;
            
            const reqCust = reportList.find(r => r.id === reportId)?.requiresCustomer;
            if (reqCust && !selectedParty) {
                alert('الرجاء اختيار ' + (isCust ? 'العميل' : 'المورد'));
                setIsLoading(false);
                return;
            }

            const start = new Date(dateRange.startDate).getTime();
            const end = new Date(dateRange.endDate).getTime() + 86399999;
            const tenantId = useAuthStore.getState().appUser?.tenantId || 'single_store';
            
            const salesSnap = await getDocs(query(collection(db, 'sales'), where('tenantId', '==', tenantId)));
            const purchSnap = await getDocs(query(collection(db, 'purchases'), where('tenantId', '==', tenantId)));
            const cashSnap = await getDocs(query(collection(db, 'cash'), where('tenantId', '==', tenantId)));
            
            const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            const purch = purchSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            const cash = cashSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

            switch (reportId) {
                case 'customer_balances':
                case 'supplier_balances': {
                    const rows = parties.map(p => [
                        p.name,
                        p.phone || '-',
                        p.balance > 0 ? p.balance.toLocaleString() + (isCust ? ' (عليه)' : ' (له)') : 
                        p.balance < 0 ? Math.abs(p.balance).toLocaleString() + (isCust ? ' (له)' : ' (عليه)') : '0'
                    ]);
                    const total = parties.reduce((a,c) => a + c.balance, 0);
                    rows.push(['الإجمالي الكلي', '-', total.toLocaleString()]);
                    printReport(`ذمم ${isCust ? 'العملاء' : 'الموردين'}`, ['الاسم', 'الهاتف', 'الرصيد الفعلي'], rows);
                    break;
                }
                case 'customer_ledger':
                case 'supplier_ledger': {
                    const docsArr: any[] = [];
                    if (isCust) {
                        sales.filter(s => s.customerId === selectedParty?.id && s.status !== 'cancelled' && s.createdAt >= start && s.createdAt <= end).forEach(s => {
                            if (!opts.showCash && s.paymentType === 'cash') return;
                            docsArr.push({ date: s.createdAt, type: 'فاتورة مبيعات', ref: s.invoiceNumber, debit: s.totalAmount || s.total || 0, credit: 0, desc: s.paymentType === 'cash' ? 'نقدي' : 'آجل' });
                            if (s.paidAmount > 0) docsArr.push({ date: s.createdAt + 1, type: 'دفعة مرتبطة', ref: s.invoiceNumber, debit: 0, credit: s.paidAmount, desc: 'سداد مرتبط' });
                        });
                        cash.filter(c => c.partyId === selectedParty?.id && (c.date || c.createdAt) >= start && (c.date || c.createdAt) <= end).forEach(c => {
                            docsArr.push({ date: c.date || c.createdAt, type: c.type === 'in' ? 'سند قبض' : 'سند صرف', ref: '-', debit: c.type === 'out' ? c.amount : 0, credit: c.type === 'in' ? c.amount : 0, desc: c.description || '-' });
                        });
                    } else {
                        purch.filter(p => p.supplierId === selectedParty?.id && p.status !== 'cancelled' && (p.createdAt || p.date) >= start && (p.createdAt || p.date) <= end).forEach(p => {
                            docsArr.push({ date: p.createdAt || p.date, type: 'فاتورة مشتريات', ref: p.invoiceNumber, credit: p.totalAmount || p.total || 0, debit: 0, desc: p.paymentType === 'cash' ? 'نقدي' : 'آجل' });
                            if (p.paidAmount > 0) docsArr.push({ date: (p.createdAt || p.date) + 1, type: 'دفعة مرتبطة', ref: p.invoiceNumber, credit: 0, debit: p.paidAmount, desc: 'سداد مرتبط' });
                        });
                        cash.filter(c => c.partyId === selectedParty?.id && (c.date || c.createdAt) >= start && (c.date || c.createdAt) <= end).forEach(c => {
                            docsArr.push({ date: c.date || c.createdAt, type: c.type === 'out' ? 'سند صرف' : 'سند قبض', ref: '-', debit: c.type === 'out' ? c.amount : 0, credit: c.type === 'in' ? c.amount : 0, desc: c.description || '-' });
                        });
                    }
                    docsArr.sort((a,b) => a.date - b.date);
                    let running = 0; 
                    const rows = docsArr.map(d => {
                        running += isCust ? (d.debit - d.credit) : (d.credit - d.debit);
                        const row = [new Date(d.date).toLocaleDateString('ar-EG'), d.type, d.ref || '-', d.desc, d.debit > 0 ? d.debit.toLocaleString() : '-', d.credit > 0 ? d.credit.toLocaleString() : '-'];
                        if (!opts.hideBalance) row.push(running.toLocaleString());
                        return row;
                    });
                    const head = ['التاريخ', 'النوع', 'المرجع', 'البيان', 'مدين', 'دائن'];
                    if (!opts.hideBalance) head.push('الرصيد');
                    printReport(`كشف حساب - ${selectedParty?.name}`, head, rows);
                    break;
                }
                case 'customer_detailed_settlements': {
                    const docsArr: any[] = [];
                    let openingBalance = 0;

                    // Invoices
                    sales.filter(s => s.customerId === selectedParty?.id && s.status !== 'cancelled').forEach(s => {
                        const total = s.totalAmount || s.total || 0;
                        if (s.createdAt < start) {
                            openingBalance += total;
                        } else if (s.createdAt <= end) {
                            docsArr.push({ 
                                date: s.createdAt, 
                                type: 'فاتورة ' + (s.paymentType === 'cash' ? 'نقدية' : 'آجلة'), 
                                ref: s.invoiceNumber, 
                                debit: total, 
                                credit: 0, 
                                desc: 'إصدار فاتورة مبيعات'
                            });
                        }
                    });

                    // Cash operations
                    cash.filter(c => c.partyId === selectedParty?.id).forEach(c => {
                        const cDate = c.date || c.createdAt;
                        if (cDate < start) {
                            if (c.type === 'in') openingBalance -= c.amount;
                            if (c.type === 'out') openingBalance += c.amount;
                        } else if (cDate <= end) {
                            docsArr.push({ 
                                date: cDate, 
                                type: c.type === 'in' ? 'دخول نقد / إضافة رصيد' : 'خروج نقد / صرف رصيد', 
                                ref: c.voucherNumber || '-', 
                                debit: c.type === 'out' ? c.amount : 0, 
                                credit: c.type === 'in' ? c.amount : 0, 
                                desc: c.description || '-' 
                            });
                        }
                    });

                    docsArr.sort((a,b) => a.date - b.date);
                    let running = openingBalance; 
                    
                    const rows: any[][] = [];
                    if (openingBalance !== 0) {
                        rows.push([
                            '-', '-', 'رصيد افتتاحي', '-', 'رصيد ما قبل الفترة المحددة', 
                            openingBalance > 0 ? openingBalance.toLocaleString() : '-', 
                            openingBalance < 0 ? Math.abs(openingBalance).toLocaleString() : '-', 
                            openingBalance.toLocaleString()
                        ]);
                    }

                    docsArr.forEach(d => {
                        running += (d.debit - d.credit);
                        rows.push([
                            new Date(d.date).toLocaleDateString('ar-EG'), 
                            new Date(d.date).toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'}),
                            d.type, 
                            d.ref || '-', 
                            d.desc, 
                            d.debit > 0 ? d.debit.toLocaleString() : '-', 
                            d.credit > 0 ? d.credit.toLocaleString() : '-',
                            running.toLocaleString()
                        ]);
                    });
                    printReport(`كشف حساب تفصيلي (فواتير ونقد وتسويات) - ${selectedParty?.name}`, ['التاريخ', 'الوقت', 'النوع', 'المرجع', 'البيان', 'مدين', 'دائن', 'الرصيد'], rows);
                    break;
                }
                case 'customer_confirmation':
                case 'supplier_confirmation': {
                    const rows = [
                        [`السادة / ${selectedParty?.name} المحترمون`, '', ''],
                        [`نفيدكم بأن رصيدكم المطابق لدفاترنا حتى تاريخ ${dateRange.endDate}`, '', ''],
                        [`هو مبلغ وقدره ( ${selectedParty?.balance?.toLocaleString()} ) ريال`, '', ''],
                        ['نرجو المصادقة على ذلك وتوقيع هذا البيان وإعادته لنا.', '', ''],
                        ['توقيع العميل / المورد:', '', '__________________']
                    ];
                    printReport('تقرير مصادقة حساب', ['البيان', '', ''], rows);
                    break;
                }
                case 'customer_invoices': {
                    const invs = sales.filter(s => s.customerId === selectedParty?.id && s.createdAt >= start && s.createdAt <= end);
                    const rows = invs.map(i => ['#' + i.invoiceNumber, new Date(i.createdAt).toLocaleDateString('ar-EG'), i.paymentType === 'cash' ? 'نقدي' : 'آجل', (i.totalAmount || i.total || 0).toLocaleString()]);
                    printReport(`فواتير العميل: ${selectedParty?.name}`, ['رقم الفاتورة', 'التاريخ', 'النوع', 'المبلغ'], rows);
                    break;
                }
                case 'customer_invoices_total': {
                    const invs = sales.filter(s => s.customerId === selectedParty?.id && s.createdAt >= start && s.createdAt <= end);
                    const total = invs.reduce((a,b) => a + (b.totalAmount || b.total || 0), 0);
                    printReport(`إجمالي فواتير العميل: ${selectedParty?.name}`, ['عدد الفواتير', 'الإجمالي'], [[invs.length.toString(), total.toLocaleString()]]);
                    break;
                }
                case 'customer_receipts': {
                    const rec = cash.filter(c => c.partyId === selectedParty?.id && c.type === 'in' && (c.date || c.createdAt) >= start && (c.date || c.createdAt) <= end);
                    const rows = rec.map(r => [new Date(r.date || r.createdAt).toLocaleDateString('ar-EG'), r.amount.toLocaleString(), r.description || '-']);
                    printReport(`سندات القبض: ${selectedParty?.name}`, ['التاريخ', 'المبلغ', 'البيان'], rows);
                    break;
                }
                case 'customer_payments': {
                    const pay = cash.filter(c => c.partyId === selectedParty?.id && c.type === 'out' && (c.date || c.createdAt) >= start && (c.date || c.createdAt) <= end);
                    const rows = pay.map(r => [new Date(r.date || r.createdAt).toLocaleDateString('ar-EG'), r.amount.toLocaleString(), r.description || '-']);
                    printReport(`سندات الصرف: ${selectedParty?.name}`, ['التاريخ', 'المبلغ', 'البيان'], rows);
                    break;
                }
                case 'customer_payment_history': {
                    const pay = cash.filter(c => c.partyId === selectedParty?.id && (c.date || c.createdAt) >= start && (c.date || c.createdAt) <= end);
                    const rows = pay.map(r => [new Date(r.date || r.createdAt).toLocaleDateString('ar-EG'), r.type === 'in' ? 'قبض' : 'صرف', r.amount.toLocaleString(), r.description || '-']);
                    printReport(`حركة التسديد: ${selectedParty?.name}`, ['التاريخ', 'النوع', 'المبلغ', 'البيان'], rows);
                    break;
                }
                case 'customers_payment_history': {
                    const pay = cash.filter(c => c.partyType === 'customer' && (c.date || c.createdAt) >= start && (c.date || c.createdAt) <= end);
                    const rows = pay.map(r => {
                        const pName = customers.find(x => x.id === r.partyId)?.name || 'عام';
                        return [new Date(r.date || r.createdAt).toLocaleDateString('ar-EG'), pName, r.type === 'in' ? 'قبض' : 'صرف', r.amount.toLocaleString(), r.description || '-'];
                    });
                    printReport(`حركة السداد لجميع العملاء`, ['التاريخ', 'العميل', 'النوع', 'المبلغ', 'البيان'], rows);
                    break;
                }
                case 'customers_payment_methods': {
                    const pay = cash.filter(c => c.partyType === 'customer' && (c.date || c.createdAt) >= start && (c.date || c.createdAt) <= end);
                    let sum = 0; 
                    pay.forEach(p => { sum += p.amount; });
                    printReport(`السداد للعملاء حسب طرق الدفع`, ['طريقة الدفع', 'الإجمالي'], [['تحويل نقدي/بنكي (عام)', sum.toLocaleString()]]);
                    break;
                }
                case 'customer_item_total': {
                    const st = sales.filter(s => s.customerId === selectedParty?.id && s.createdAt >= start && s.createdAt <= end);
                    const itemsMap = new Map();
                    st.forEach(s => {
                        if (s.items) {
                            s.items.forEach((it: any) => {
                                const ex = itemsMap.get(it.name) || { qty: 0, sum: 0 };
                                itemsMap.set(it.name, { qty: ex.qty + it.quantity, sum: ex.sum + (it.price * it.quantity) });
                            });
                        }
                    });
                    const rows = Array.from(itemsMap.entries()).map(([k,v]) => [k, v.qty.toString(), v.sum.toLocaleString()]);
                    printReport(`مبيعات الأصناف للعميل: ${selectedParty?.name}`, ['الصنف', 'الكمية', 'الإجمالي'], rows);
                    break;
                }
                case 'supplier_invoices': {
                    const invs = purch.filter(p => p.supplierId === selectedParty?.id && (p.createdAt || p.date) >= start && (p.createdAt || p.date) <= end);
                    const rows = invs.map(i => ['#' + i.invoiceNumber, new Date(i.createdAt || i.date).toLocaleDateString('ar-EG'), i.paymentType === 'cash' ? 'نقدي' : 'آجل', (i.totalAmount || i.total || 0).toLocaleString()]);
                    printReport(`فواتير المورد: ${selectedParty?.name}`, ['رقم الفاتورة', 'التاريخ', 'النوع', 'المبلغ'], rows);
                    break;
                }
                case 'supplier_invoices_total': {
                    const invs = purch.filter(p => p.supplierId === selectedParty?.id && (p.createdAt || p.date) >= start && (p.createdAt || p.date) <= end);
                    const total = invs.reduce((a,b) => a + (b.totalAmount || b.total || 0), 0);
                    printReport(`إجمالي فواتير المورد: ${selectedParty?.name}`, ['عدد الفواتير', 'الإجمالي'], [[invs.length.toString(), total.toLocaleString()]]);
                    break;
                }
                case 'supplier_payments': {
                    const pay = cash.filter(c => c.partyId === selectedParty?.id && c.type === 'out' && (c.date || c.createdAt) >= start && (c.date || c.createdAt) <= end);
                    const rows = pay.map(r => [new Date(r.date || r.createdAt).toLocaleDateString('ar-EG'), r.amount.toLocaleString(), r.description || '-']);
                    printReport(`سندات الصرف: ${selectedParty?.name}`, ['التاريخ', 'المبلغ', 'البيان'], rows);
                    break;
                }
                case 'supplier_receipts': {
                    const rec = cash.filter(c => c.partyId === selectedParty?.id && c.type === 'in' && (c.date || c.createdAt) >= start && (c.date || c.createdAt) <= end);
                    const rows = rec.map(r => [new Date(r.date || r.createdAt).toLocaleDateString('ar-EG'), r.amount.toLocaleString(), r.description || '-']);
                    printReport(`سندات القبض: ${selectedParty?.name}`, ['التاريخ', 'المبلغ', 'البيان'], rows);
                    break;
                }
                case 'supplier_payment_history': {
                    const pay = cash.filter(c => c.partyId === selectedParty?.id && (c.date || c.createdAt) >= start && (c.date || c.createdAt) <= end);
                    const rows = pay.map(r => [new Date(r.date || r.createdAt).toLocaleDateString('ar-EG'), r.type === 'in' ? 'قبض' : 'صرف', r.amount.toLocaleString(), r.description || '-']);
                    printReport(`حركة التسديد: ${selectedParty?.name}`, ['التاريخ', 'النوع', 'المبلغ', 'البيان'], rows);
                    break;
                }
                case 'customer_returns':
                case 'customer_opening_cash':
                case 'supplier_opening_cash':
                    alert('هذا التقرير لا يتوفر بيانات له حالياً');
                    break;
                default: 
                    alert('قيد الإنجاز');
                    break;
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

    const partiesList = activeTab === 'customers' ? customers : suppliers;
    const reportsList = activeTab === 'customers' ? CUSTOMER_REPORTS : SUPPLIER_REPORTS;

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900/50">
            {/* Header Tabs */}
            <div className="flex justify-center bg-white p-2 shrink-0">
                <div className="flex gap-1 bg-white p-1 rounded-xl shadow-sm border border-gray-100 w-full max-w-sm">
                    <button 
                        onClick={() => { setActiveTab('customers'); setExpandedReport(''); setSelectedPartyName(''); }} 
                        className={`flex-1 py-2.5 font-black text-sm rounded-lg transition-all ${activeTab === 'customers' ? 'bg-red-600 text-white shadow-md' : 'text-black hover:bg-white'}`}
                    >
                        العملاء
                    </button>
                    <button 
                        onClick={() => { setActiveTab('suppliers'); setExpandedReport(''); setSelectedPartyName(''); }} 
                        className={`flex-1 py-2.5 font-black text-sm rounded-lg transition-all ${activeTab === 'suppliers' ? 'bg-red-600 text-white shadow-md' : 'text-black hover:bg-white'}`}
                    >
                        الموردين
                    </button>
                </div>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 custom-scrollbar">
                <div className="max-w-2xl mx-auto flex flex-col bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden">
                    {reportsList.map((rep) => {
                        const isExpanded = expandedReport === rep.id;
                        
                        return (
                            <div key={rep.id} className="border-b border-gray-100 last:border-0 flex flex-col transition-colors">
                                {/* Row Header */}
                                <div 
                                    onClick={() => setExpandedReport(isExpanded ? '' : rep.id)}
                                    className={`flex justify-between items-center p-4 md:p-5 cursor-pointer transition-colors group ${isExpanded ? 'bg-white dark:bg-slate-800' : 'hover:bg-white'}`}
                                >
                                    <div className="flex justify-start w-full">
                                        <span className={`font-black text-[15px] ${isExpanded ? 'text-blue-900' : 'text-black dark:text-gray-100'}`}>{rep.title}</span>
                                    </div>
                                    <ChevronLeft className={`text-blue-800 transition-transform ${isExpanded ? '-rotate-90' : 'opacity-40 group-hover:opacity-70'}`} size={24} />
                                </div>

                                {/* Expanded Area */}
                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-2 bg-white dark:bg-slate-800 flex flex-col gap-5 slide-down">
                                        
                                        {rep.requiresCustomer && (
                                            <div className="flex flex-col gap-2">
                                                <div className="w-full md:w-3/4">
                                                    <SearchableSelect 
                                                        options={partiesList.map(p => p.name)}
                                                        value={selectedPartyName}
                                                        onChange={setSelectedPartyName}
                                                        placeholder={`ادخل أو اختر اسم ${activeTab === 'customers' ? 'العميل' : 'المورد'}...`}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {rep.hasToggles && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-1 bg-white p-3 rounded-xl border border-gray-100 shadow-sm w-full md:w-3/4">
                                                {renderToggle('كشف تفصيلي', 'detailed')}
                                                {renderToggle('اخفاء عمود الرصيد', 'hideBalance')}
                                                {renderToggle('اخفاء رصيد ماقبل الفتره', 'hideOpening')}
                                                {renderToggle('اظهار الفواتير النقد', 'showCash')}
                                            </div>
                                        )}

                                        <div className="pt-3 border-t border-gray-100 mt-2">
                                            <button 
                                                onClick={() => runReport(rep.id, activeTab)}
                                                disabled={isLoading}
                                                className="bg-red-600 hover:bg-red-700 text-white font-black py-3 px-8 rounded-xl shadow-[0_4px_12px_-4px_rgba(220,38,38,0.5)] transition-all flex items-center justify-center gap-2 text-[13px] disabled:opacity-50 w-full md:w-auto"
                                            >
                                                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                                                {rep.requiresCustomer ? `عرض وطباعة التقرير` : 'عرض وطباعة التقرير'}
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
