import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { useInvoiceStore } from '../store/invoiceStore';
import { Link } from 'react-router-dom';
import { ShoppingCart, Truck, Users, DollarSign, Receipt, Package, RefreshCw, Clock, Sparkles, Loader2, X, ShieldCheck, FileSpreadsheet, Printer, BrainCircuit, ArrowRight, ClipboardCheck, Gift, FileSignature, Coins, Wifi, Layers, Briefcase, Search } from 'lucide-react';
import { collection, query, onSnapshot, getDocs, where, limit, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useSettingsStore } from '../store/settingsStore';
import { printReport } from '../lib/printHelper';
import { getDaysSinceLastSync } from '../lib/syncTracker';
import { useUIStore } from '../store/uiStore';
import SyncProgressIndicator from '../components/SyncProgressIndicator';
import { LocalCache } from '../lib/localCache';
import { format } from 'date-fns';
import { 
    calculateGeneralFundNetBalance, 
    calculateCardFundNetBalance, 
    calculateGeneralCreditReceivables, 
    calculateCardCreditReceivables,
    calculateManagerCashbox
} from '../lib/financialEngine';

interface Product {
    id: string;
    name: string;
    quantity: number;
    lowStockAlert?: number;
    expiryDate?: string;
}

interface OverdueCustomer {
    id: string;
    name: string;
    balance: number;
    lastInvoiceDate: number;
}

export default function Dashboard() {
    const { appUser } = useAuthStore();
    const { settings } = useSettingsStore();
    const { salesCart, purchasesCart, salesMinimized, purchasesMinimized, setSalesActiveTab, setPurchasesActiveTab, setQuotationsActiveTab } = useInvoiceStore();
    
    const [mainCash, setMainCash] = useState(0);
    const [mainCredit, setMainCredit] = useState(0);
    const [mainCashDetails, setMainCashDetails] = useState({
        ownSales: 0,
        clearances: 0
    });

    const [cardCash, setCardCash] = useState(0);
    const [cardCredit, setCardCredit] = useState(0);
    const [cardCashDetails, setCardCashDetails] = useState({
        ownSales: 0,
        clearances: 0
    });

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);

    const setDashboardLastUpdated = useUIStore((s) => s.setDashboardLastUpdated);
    const setIsDashboardRefreshing = useUIStore((s) => s.setIsDashboardRefreshing);
    const dashboardRefreshSignal = useUIStore((s) => s.dashboardRefreshSignal);

    const loadDashboardData = async (force = false) => {
        if (!appUser?.uid) return;
        const tenantId = appUser?.tenantId || 'single_store';
        const isAdmin = appUser?.role === 'admin' || (appUser?.role as string) === 'manager';

        setIsRefreshing(true);
        setIsDashboardRefreshing(true);
        try {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            const currentMonthStr = format(startOfMonth, 'yyyy-MM');

            // Fetch primary operational records
            const qSales = query(collection(db, 'sales'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'), limit(1000));
            const qCardSales = query(collection(db, 'card_sales'), where('tenantId', '==', tenantId), limit(1000));
            const qClearances = query(collection(db, 'manager_clearances'), where('tenantId', '==', tenantId), limit(1000));
            const qWithdrawals = query(collection(db, 'withdrawals'), where('tenantId', '==', tenantId), limit(1000));
            const qVouchers = query(collection(db, 'vouchers'), where('tenantId', '==', tenantId), limit(1000));

            const [salesResult, cardSalesResult, clearancesResult, withdrawalsResult, vouchersResult] = await Promise.all([
                LocalCache.fetchCollection<any>('sales', tenantId, qSales, { forceRefresh: force }),
                LocalCache.fetchCollection<any>('card_sales', tenantId, qCardSales, { forceRefresh: force }),
                LocalCache.fetchCollection<any>('manager_clearances', tenantId, qClearances, { forceRefresh: force }),
                LocalCache.fetchCollection<any>('withdrawals', tenantId, qWithdrawals, { forceRefresh: force }),
                LocalCache.fetchCollection<any>('vouchers', tenantId, qVouchers, { forceRefresh: force })
            ]);

            const currentUserIdentity = {
                id: appUser.uid,
                name: appUser.name,
                email: appUser.email
            };

            const dateFilter = { month: currentMonthStr };

            if (isAdmin) {
                // Calculation for Manager's Cashbox (Own direct sales + total clearances received from employees)
                const mgrData = calculateManagerCashbox(
                    salesResult.data,
                    cardSalesResult.data,
                    clearancesResult.data,
                    withdrawalsResult.data,
                    vouchersResult.data,
                    { manager: currentUserIdentity, dateFilter }
                );

                setMainCash(mgrData.managerGeneralNetBalance);
                setMainCredit(mgrData.managerGeneralCredit);
                setMainCashDetails({
                    ownSales: mgrData.managerGeneralCashSales,
                    clearances: mgrData.receivedGeneralClearances
                });

                setCardCash(mgrData.managerCardNetBalance);
                setCardCredit(mgrData.managerCardCredit);
                setCardCashDetails({
                    ownSales: mgrData.managerCardCashSales,
                    clearances: mgrData.receivedCardClearances
                });
            } else {
                // Calculation for regular Employee's Cashbox (Employee sales minus clearances handed over to manager)
                const genFund = calculateGeneralFundNetBalance(
                    salesResult.data,
                    clearancesResult.data,
                    withdrawalsResult.data,
                    vouchersResult.data,
                    { employee: currentUserIdentity, dateFilter }
                );
                const genCredit = calculateGeneralCreditReceivables(
                    salesResult.data,
                    { employee: currentUserIdentity, dateFilter }
                );
                setMainCash(genFund.netBalance);
                setMainCredit(genCredit);
                setMainCashDetails({
                    ownSales: genFund.grossCashSales,
                    clearances: genFund.clearances
                });

                const cardFund = calculateCardFundNetBalance(
                    cardSalesResult.data,
                    clearancesResult.data,
                    withdrawalsResult.data,
                    vouchersResult.data,
                    { employee: currentUserIdentity, dateFilter }
                );
                const cardCreditVal = calculateCardCreditReceivables(
                    cardSalesResult.data,
                    { employee: currentUserIdentity, dateFilter }
                );
                setCardCash(cardFund.netBalance);
                setCardCredit(cardCreditVal);
                setCardCashDetails({
                    ownSales: cardFund.grossCashSales,
                    clearances: cardFund.clearances
                });
            }

            const meta = await LocalCache.getMetadata('sales', tenantId);
            const updateTime = meta?.lastUpdated || Date.now();
            setLastUpdated(updateTime);
            setDashboardLastUpdated(updateTime);
        } catch (err) {
            console.error('Failed to load dashboard cash/sales counters:', err);
        } finally {
            setIsRefreshing(false);
            setIsDashboardRefreshing(false);
        }
    };

    useEffect(() => {
        loadDashboardData(false);
    }, [appUser]);

    useEffect(() => {
        if (dashboardRefreshSignal > 0) {
            loadDashboardData(true);
        }
    }, [dashboardRefreshSignal]);
    
    // Interactive Statement Flow
    const [aiQuery, setAiQuery] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [aiResult, setAiResult] = useState<{ title: string, data: any[], type: 'sales' | 'products' | 'customers' | 'suppliers' | 'none' } | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);

    // Zustand UI Store bindings and 30s auto-hide timer for search bar
    const showDashboardSearch = useUIStore((s) => s.showDashboardSearch);
    const setShowDashboardSearch = useUIStore((s) => s.setShowDashboardSearch);

    useEffect(() => {
        if (!showDashboardSearch) return;
        if (aiQuery.trim() !== '') return;

        const timer = setTimeout(() => {
            setShowDashboardSearch(false);
        }, 30000);

        return () => clearTimeout(timer);
    }, [showDashboardSearch, aiQuery, setShowDashboardSearch]);

    // Interactive Statement Flow
    const [interactiveStep, setInteractiveStep] = useState<'none' | 'select_entity' | 'select_options'>('none');
    const [statementType, setStatementType] = useState<'customer' | 'supplier' | null>(null);
    const [entities, setEntities] = useState<any[]>([]);
    const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
    const [reportOptions, setReportOptions] = useState({
        period: 'full' as 'full' | 'range',
        startDate: '',
        endDate: '',
        includeInvoices: true
    });

    const allSuggestions = [
        'كشف حساب عميل محدد',
        'كشف حساب مورد محدد',
        'كشف حساب تفصيلي للعملاء',
        'كشف مديونية الموردين',
        'كشف حركة الصندوق اليومية',
        'كشف حساب خلال فترة معينة',
        'تقرير مبيعات الأسبوع',
        'تقرير مبيعات الشهر الحالي',
        'تقرير مبيعات المندوبين اليوم',
        'تقرير جرد الأصناف المخزنية',
        'تقرير الأصناف منخفضة الكمية',
        'تقرير إدارة العملاء النشطين',
        'تقرير الديون المستحقة على العملاء',
        'تقرير الأرباح والخسائر التقريبي'
    ];

    useEffect(() => {
        const queryStr = aiQuery.trim();
        if (!queryStr) {
            setSuggestions([]);
            return;
        }

        const filtered = allSuggestions.filter(s => {
            const lowerS = s.toLowerCase();
            const lowerQ = queryStr.toLowerCase();
            if (lowerQ === 'تقرير') return s.startsWith('تقرير');
            if (lowerQ === 'عرض') return s.startsWith('عرض');
            if (lowerQ === 'تحليل') return s.startsWith('تحليل');
            if (lowerQ === 'كشف') return s.startsWith('كشف');
            return lowerS.includes(lowerQ);
        });
        setSuggestions(filtered.slice(0, 8));
    }, [aiQuery]);

    const handleAISearch = async (queryOverride?: string) => {
        const queryToProcess = queryOverride || aiQuery;
        if (!queryToProcess.trim()) return;
        
        setIsThinking(true);
        setAiResult(null);
        setSuggestions([]);
        setAiQuery('');
        
        const q = queryToProcess.trim().toLowerCase();

        // Check for Detailed Statement Request
        if (q.includes('كشف') && (q.includes('تفصيلي') || q.includes('محدد') || q.includes('تفصيل'))) {
            const type = q.includes('مورد') ? 'supplier' : 'customer';
            setStatementType(type);
            
            try {
                const tenantId = appUser?.tenantId || 'single_store';
                const collectionName = type === 'customer' ? 'customers' : 'suppliers';
                const snap = await getDocs(query(collection(db, collectionName), where('tenantId', '==', tenantId)));
                setEntities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setInteractiveStep('select_entity');
            } catch (e) {
                handleFirestoreError(e, OperationType.GET, type === 'customer' ? 'customers' : 'suppliers');
                console.error(e);
            }
            setIsThinking(false);
            return;
        }

        setTimeout(async () => {
            let collectionName = '';
            let reportTitle = '';
            const tenantId = appUser?.tenantId || 'single_store';

            if (q.includes('مبيعات') || q.includes('تقرير مبيعات') || q.includes('بيع')) {
                collectionName = 'sales';
                reportTitle = 'تقرير المبيعات الشامل (استخراج ذكي)';
            } else if (q.includes('منتجات') || q.includes('بضاعة') || q.includes('أصناف') || q.includes('جرد') || q.includes('مخزن')) {
                collectionName = 'products';
                reportTitle = 'تقرير الجرد والمنتجات (استخراج ذكي)';
            } else if (q.includes('كشف') && q.includes('مورد')) {
                collectionName = 'suppliers';
                reportTitle = 'كشف حساب الموردين (استخراج ذكي)';
            } else if (q.includes('كشف') && q.includes('عميل')) {
                collectionName = 'customers';
                reportTitle = 'كشف حساب العملاء (استخراج ذكي)';
            } else if (q.includes('كشف') || q.includes('تقارير المحاسبة')) {
                // If they strictly type "كشف" or "كشوفات", show a choice or default to common
                collectionName = 'customers'; // Default to customers but title it broadly
                reportTitle = 'كشف الحسابات العام (اختر عميل أو مورد للتفصيل)';
            } else if (q.includes('عملاء') || q.includes('زبائن') || q.includes('ديون')) {
                collectionName = 'customers';
                reportTitle = 'كشف مديونيات العملاء';
            } else if (q.includes('أرباح')) {
                collectionName = 'sales';
                reportTitle = 'تحليل الأرباح التقريبي (بناءً على المبيعات)';
            }

            if (collectionName) {
                try {
                    const snap = await getDocs(query(collection(db, collectionName), where('tenantId', '==', tenantId)));
                    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setAiResult({ title: reportTitle, data, type: collectionName as any });
                } catch (e) {
                    handleFirestoreError(e, OperationType.GET, collectionName);
                    setAiResult({ title: 'حدث خطأ في استخراج البيانات', data: [], type: 'none' });
                }
            } else {
                setAiResult({ title: 'عذراً، لم أستطع فهم رغبتك. حاول طلب "تقرير مبيعات" أو "عرض الديون".', data: [], type: 'none' });
            }
            setIsThinking(false);
        }, 1000);
    };

    const getLocalizedHeaders = (type: string) => {
        switch (type) {
            case 'sales': return ['رقم الفاتورة', 'المبلغ الإجمالي', 'طريقة الدفع', 'التاريخ'];
            case 'products': return ['اسم المنتج', 'السعر', 'الكمية المتوفرة', 'الباركود'];
            case 'customers': return ['اسم العميل', 'الرصيد الحالي', 'رقم الجوال'];
            case 'suppliers': return ['اسم المورد', 'الرصيد المستحق', 'رقم الجوال'];
            default: return ['المعرف', 'القيمة', 'التفاصيل'];
        }
    };

    const getLocalizedRows = (type: string, data: any[]) => {
        return data.map(item => {
            switch (type) {
                case 'sales':
                    return [
                        item.invoiceNumber || item.id,
                        (item.total || 0).toLocaleString() + ' ر.س',
                        item.paymentType === 'cash' ? 'نقدي' : 'آجل',
                        new Date(item.date || item.createdAt).toLocaleDateString('ar-EG')
                    ];
                case 'products':
                    return [
                        item.name || '-',
                        (item.price || 0).toLocaleString() + ' ر.س',
                        item.quantity || 0,
                        item.barcode || '-'
                    ];
                case 'suppliers':
                case 'customers':
                    return [
                        item.name || '-',
                        (item.balance || 0).toLocaleString() + ' ر.س',
                        item.phone || item.mobile || '-'
                    ];
                default:
                    return [item.id, item.name || item.total || '-', item.date ? new Date(item.date).toLocaleDateString('ar-EG') : '-'];
            }
        });
    };

    const finalGeneration = async () => {
        const daysNoSync = getDaysSinceLastSync();
        if (daysNoSync > 0 || !window.navigator.onLine) {
            alert(`تنبيه: يوجد بيانات غير متزامنة مع السحابة منذ (${daysNoSync}) أيام. \nيرجى الاتصال بالإنترنت أولاً لضمان الحصول على كشف حساب صحيح ودقيق بالكامل من السحابة.`);
            return;
        }

        setIsThinking(true);
        const entityName = entities.find(e => e.id === selectedEntityId)?.name || 'الطرف المحدد';
        const tenantId = appUser?.tenantId || 'single_store';
        
        // Mock data fetching based on filters for interactive report
        setTimeout(async () => {
            let mockData = [];
            try {
                if (statementType === 'customer') {
                    const snap = await getDocs(query(collection(db, 'sales'), where('tenantId', '==', tenantId), where('customerId', '==', selectedEntityId)));
                    mockData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                } else {
                    const snap = await getDocs(query(collection(db, 'purchases'), where('tenantId', '==', tenantId), where('supplierId', '==', selectedEntityId)));
                    mockData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                }

                setAiResult({
                    title: `كشف حساب ${statementType === 'customer' ? 'عميل' : 'مورد'}: ${entityName} (${reportOptions.includeInvoices ? 'تفصيلي' : 'سندات فقط'})`,
                    data: mockData,
                    type: statementType === 'customer' ? 'sales' : 'suppliers' as any
                });
            } catch (e) {
                handleFirestoreError(e, OperationType.GET, statementType === 'customer' ? 'sales' : 'purchases');
            }
            setInteractiveStep('none');
            setIsThinking(false);
        }, 800);
    };

    const downloadExcel = () => {
        if (!aiResult || aiResult.data.length === 0) return;
        const headers = getLocalizedHeaders(aiResult.type);
        const rows = getLocalizedRows(aiResult.type, aiResult.data);
        const csvContent = "\uFEFF" + headers.join(',') + "\n" + rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `تقرير_${aiResult.title}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrintReport = () => {
        if (!aiResult) return;
        const headers = getLocalizedHeaders(aiResult.type);
        const rows = getLocalizedRows(aiResult.type, aiResult.data);
        printReport(aiResult.title, headers, rows);
    };
    
    // Define the cards with roles so we only show what the user is allowed to see
    const cards = [
        { title: 'إضافة فاتورة مبيعات', path: '/sales', icon: ShoppingCart, roles: ['admin', 'cashier', 'salesman'], bgColor: 'bg-white', textColor: 'text-green-600', borderColor: 'border-green-100', onClick: () => setSalesActiveTab('add') },
        { title: 'إضافة فاتورة مشتريات', path: '/purchases', icon: Truck, roles: ['admin', 'inventory'], bgColor: 'bg-white', textColor: 'text-purple-600', borderColor: 'border-purple-100', onClick: () => setPurchasesActiveTab('add') },
        { title: 'إضافة عرض سعر', path: '/quotations', icon: FileSignature, roles: ['admin', 'cashier'], bgColor: 'bg-white dark:bg-slate-800', textColor: 'text-blue-600', borderColor: 'border-gray-200', enabled: settings.isQuotationsEnabled, onClick: () => setQuotationsActiveTab('add') },
        { title: 'العملاء', path: '/customers', icon: Users, roles: ['admin', 'cashier', 'salesman'], bgColor: 'bg-white dark:bg-slate-800', textColor: 'text-blue-600', borderColor: 'border-gray-200' },
        { title: 'المنتجات', path: '/products', icon: Package, roles: ['admin', 'inventory', 'cashier'], bgColor: 'bg-white', textColor: 'text-yellow-600', borderColor: 'border-yellow-100' },
        { title: 'الجرد الميداني', path: '/inventory-audit', icon: ClipboardCheck, roles: ['admin', 'inventory'], bgColor: 'bg-white', textColor: 'text-orange-600', borderColor: 'border-orange-100' },
        { title: 'برنامج الولاء', path: '/loyalty', icon: Gift, roles: ['admin', 'cashier'], bgColor: 'bg-white', textColor: 'text-yellow-600', borderColor: 'border-yellow-100', enabled: settings.isLoyaltyEnabled },
        { title: 'الصندوق', path: '/cash', icon: DollarSign, roles: ['admin', 'cashier'], bgColor: 'bg-white', textColor: 'text-emerald-600', borderColor: 'border-emerald-100' },
        { title: 'سندات قبض وصرف', path: '/vouchers', icon: Receipt, roles: ['admin', 'cashier', 'salesman', 'network_worker'], bgColor: 'bg-white', textColor: 'text-red-600', borderColor: 'border-red-100' },
        { title: 'المصروفات', path: '/expenses', icon: Coins, roles: ['admin', 'cashier'], bgColor: 'bg-white', textColor: 'text-pink-600', borderColor: 'border-pink-100' },
        { title: 'كروت الشبكة', path: '/network-cards', icon: Wifi, roles: ['admin', 'cashier', 'salesman', 'inventory', 'network_worker'], bgColor: 'bg-white', textColor: 'text-indigo-600', borderColor: 'border-indigo-100' },
        { title: 'إدارة الكروت', path: '/cards-management', icon: Layers, roles: ['admin', 'cashier', 'inventory', 'network_worker'], bgColor: 'bg-white', textColor: 'text-purple-600', borderColor: 'border-purple-100' },
        { title: 'قسم الموظفين', path: '/employees', icon: Briefcase, roles: ['admin', 'cashier', 'inventory', 'salesman', 'network_worker'], bgColor: 'bg-white', textColor: 'text-indigo-600', borderColor: 'border-indigo-100' }
    ];

    const accessibleCards = cards.filter(card => {
        let hasRole = appUser && card.roles.includes(appUser.role);
        if (appUser && appUser.role !== 'admin') {
            const p = appUser.permissions as any;
            if (p) {
                if (card.path === '/employees') {
                    if (p.employees?.view !== undefined) {
                        hasRole = p.employees.view;
                    } else {
                        hasRole = true;
                    }
                }
                if (card.path === '/sales' && p.sales?.view !== undefined) hasRole = p.sales.view;
                if (card.path === '/purchases' && p.purchases?.view !== undefined) hasRole = p.purchases.view;
                if (card.path === '/products' || card.path === '/inventory-audit') {
                    if (p.products?.view !== undefined) hasRole = p.products.view;
                }
                if (card.path === '/customers' || card.path === '/loyalty') {
                    if (p.customers?.view !== undefined) hasRole = p.customers.view;
                }
                if (card.path === '/quotations' && p.quotations?.view !== undefined) hasRole = p.quotations.view;
                if (card.path === '/cash' && p.cash?.view !== undefined) hasRole = p.cash.view;
                if (card.path === '/vouchers' && p.vouchers?.view !== undefined) hasRole = p.vouchers.view;
                if (card.path === '/expenses' && p.expenses?.view !== undefined) hasRole = p.expenses.view;
                if (card.path === '/cards-management' || card.path === '/network-cards') {
                    if (p.cards?.view !== undefined) hasRole = p.cards.view;
                }
            }
        }
        const isEnabled = card.enabled === undefined ? true : card.enabled;
        return hasRole && isEnabled;
    });

    return (
        <div className="flex-1 w-full min-h-0 overflow-y-auto pb-24 md:pb-8 pt-1 flex flex-col scrollbar-thin">
            <SyncProgressIndicator />
            {/* Intelligent Assistant Section - Hero Search */}
            <div className="mb-3 md:mb-4 shrink-0">
                <div className="relative group max-w-2xl mx-auto">
                    {showDashboardSearch && (
                        <div className="bg-card-bg backdrop-blur-md p-1 sm:p-1.5 rounded-2xl border-2 border-slate-950 dark:border-slate-100 shadow-[0_10px_40px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row items-center gap-1.5 group-focus-within:border-purple-600 group-focus-within:ring-4 group-focus-within:ring-purple-50 dark:group-focus-within:ring-purple-950/50 transition-all duration-300 animate-in fade-in slide-in-from-top-2 duration-300 mb-4">
                            <div className="hidden sm:flex p-1.5 bg-white rounded-xl text-purple-600 shrink-0">
                                <BrainCircuit size={16} />
                            </div>
                            <div className="flex-1 w-full relative">
                                <input 
                                    type="text"
                                    value={aiQuery}
                                    onChange={(e) => setAiQuery(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleAISearch();
                                        }
                                    }}
                                    placeholder="بماذا يمكنني مساعدك اليوم؟ ابحث عن تقارير، عملاء، أو مبيعات..."
                                    className="w-full bg-transparent border-none outline-none text-text-main font-black placeholder:text-text-main/40 py-2 px-3 sm:px-1 text-xs"
                                />

                                {/* Suggestions Dropdown */}
                                {suggestions.length > 0 && !aiResult && !isThinking && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-card-bg border border-border-main rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="p-2 border-b border-border-main bg-bg-main flex items-center gap-2">
                                            <Sparkles size={10} className="text-purple-500 animate-pulse" />
                                            <span className="text-[9px] font-black text-text-main uppercase tracking-widest">مقترحات ذكية</span>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto modern-scrollbar">
                                            {suggestions.map((s, i) => (
                                                <button 
                                                    key={`${s}-${i}`}
                                                    onClick={() => {
                                                        setAiQuery(s);
                                                        setSuggestions([]);
                                                        handleAISearch(s);
                                                    }}
                                                    className="w-full text-right px-4 py-2.5 text-[10px] font-black text-text-main hover:bg-white hover:text-purple-600 transition-colors flex items-center justify-between group border-b last:border-0 border-border-main"
                                                >
                                                    <span className="truncate">{s}</span>
                                                    <ArrowRight size={10} className="opacity-0 group-hover:opacity-100 transition-all -rotate-180 translate-x-2 group-hover:translate-x-0" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={() => handleAISearch()}
                                disabled={isThinking || !aiQuery.trim()}
                                className="w-full sm:w-auto bg-purple-600 text-white px-4 py-2 rounded-xl font-black text-[10px] hover:bg-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 shadow-lg shadow-purple-200"
                            >
                                {isThinking ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                <span>بحث</span>
                            </button>
                        </div>
                    )}

                    {/* Real-time Cashbox Balances - Compact 4-in-a-Row Square Tiles */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-3 w-full">
                        {/* Main Store Cashbox Card */}
                        {(() => {
                            const isManagerUser = appUser?.role === 'admin' || (appUser?.role as string) === 'manager';
                            return (
                                <div className="bg-card-bg dark:bg-slate-900 border border-border-main dark:border-slate-800 p-2.5 rounded-2xl shadow-xs flex flex-col gap-2">
                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <div className="w-5 h-5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                                                <DollarSign size={12} />
                                            </div>
                                            <span className="text-[11px] font-black text-text-main/90 whitespace-nowrap">
                                                صندوق المحل
                                            </span>
                                            <span className={`text-[8px] px-1.5 py-0.2 rounded font-black whitespace-nowrap ${isManagerUser ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300' : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'}`}>
                                                {isManagerUser ? 'صندوق المدير' : 'خاص بك'}
                                            </span>
                                        </div>
                                        <span className="text-[8px] text-emerald-600 dark:text-emerald-400 font-bold whitespace-nowrap shrink-0">
                                            (يتصفّر شهرياً 🔄)
                                        </span>
                                    </div>

                                    {/* 4 Square Tiles on the SAME row (grid-cols-4) with INLINE currency */}
                                    <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
                                        {/* Square 1: Total Cash */}
                                        <div className="bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 p-1.5 sm:p-2 rounded-xl flex flex-col items-center justify-center text-center min-w-0">
                                            <span className="text-[7.5px] sm:text-[9.5px] font-bold text-emerald-800 dark:text-emerald-300 truncate w-full" title={isManagerUser ? 'إجمالي نقد المدير' : 'النقدي المتبقي'}>
                                                {isManagerUser ? 'إجمالي النقد' : 'المتبقي'}
                                            </span>
                                            <div className="flex items-baseline justify-center gap-0.5 sm:gap-1 mt-0.5 w-full min-w-0" dir="ltr">
                                                <span className="font-black text-emerald-700 dark:text-emerald-400 font-mono text-[10px] sm:text-[12.5px] truncate">
                                                    {mainCash.toLocaleString()}
                                                </span>
                                                <span className="text-[7.5px] sm:text-[9px] font-bold text-emerald-600/80 dark:text-emerald-400/80 shrink-0">ر.س</span>
                                            </div>
                                        </div>

                                        {/* Square 2: Direct Sales */}
                                        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 p-1.5 sm:p-2 rounded-xl flex flex-col items-center justify-center text-center min-w-0">
                                            <span className="text-[7.5px] sm:text-[9.5px] font-bold text-slate-600 dark:text-slate-400 truncate w-full" title={isManagerUser ? 'مبيعات المدير النقدية' : 'مبيعاتك نقد'}>
                                                {isManagerUser ? 'مبيعات نقدية' : 'مبيعاتك نقد'}
                                            </span>
                                            <div className="flex items-baseline justify-center gap-0.5 sm:gap-1 mt-0.5 w-full min-w-0" dir="ltr">
                                                <span className="font-black text-slate-800 dark:text-slate-200 font-mono text-[10px] sm:text-[11.5px] truncate">
                                                    {mainCashDetails.ownSales.toLocaleString()}
                                                </span>
                                                <span className="text-[7.5px] sm:text-[9px] font-bold text-slate-500 shrink-0">ر.س</span>
                                            </div>
                                        </div>

                                        {/* Square 3: Clearances */}
                                        <div className="bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/40 p-1.5 sm:p-2 rounded-xl flex flex-col items-center justify-center text-center min-w-0">
                                            <span className="text-[7.5px] sm:text-[9.5px] font-bold text-purple-700 dark:text-purple-300 truncate w-full" title={isManagerUser ? 'مستلم من الموظفين' : 'المسلّم للمدير'}>
                                                {isManagerUser ? 'مستلم تصفيات' : 'مسلّم للمدير'}
                                            </span>
                                            <div className="flex items-baseline justify-center gap-0.5 sm:gap-1 mt-0.5 w-full min-w-0" dir="ltr">
                                                <span className="font-black text-purple-700 dark:text-purple-300 font-mono text-[10px] sm:text-[11.5px] truncate">
                                                    {mainCashDetails.clearances.toLocaleString()}
                                                </span>
                                                <span className="text-[7.5px] sm:text-[9px] font-bold text-purple-500 shrink-0">ر.س</span>
                                            </div>
                                        </div>

                                        {/* Square 4: Credit */}
                                        <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 p-1.5 sm:p-2 rounded-xl flex flex-col items-center justify-center text-center min-w-0">
                                            <span className="text-[7.5px] sm:text-[9.5px] font-bold text-amber-700 dark:text-amber-300 truncate w-full" title="المبيعات الآجلة">
                                                مبيعات آجلة
                                            </span>
                                            <div className="flex items-baseline justify-center gap-0.5 sm:gap-1 mt-0.5 w-full min-w-0" dir="ltr">
                                                <span className="font-black text-amber-700 dark:text-amber-300 font-mono text-[10px] sm:text-[11.5px] truncate">
                                                    {mainCredit.toLocaleString()}
                                                </span>
                                                <span className="text-[7.5px] sm:text-[9px] font-bold text-amber-500 shrink-0">ر.س</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Cards Cashbox Card */}
                        {(() => {
                            const isManagerUser = appUser?.role === 'admin' || (appUser?.role as string) === 'manager';
                            return (
                                <div className="bg-card-bg dark:bg-slate-900 border border-border-main dark:border-slate-800 p-2.5 rounded-2xl shadow-xs flex flex-col gap-2">
                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <div className="w-5 h-5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                                                <Wifi size={12} />
                                            </div>
                                            <span className="text-[11px] font-black text-text-main/90 whitespace-nowrap">
                                                صندوق الكروت
                                            </span>
                                            <span className={`text-[8px] px-1.5 py-0.2 rounded font-black whitespace-nowrap ${isManagerUser ? 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300' : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'}`}>
                                                {isManagerUser ? 'صندوق المدير' : 'خاص بك'}
                                            </span>
                                        </div>
                                        <span className="text-[8px] text-indigo-600 dark:text-indigo-400 font-bold whitespace-nowrap shrink-0">
                                            (يتصفّر شهرياً 🔄)
                                        </span>
                                    </div>

                                    {/* 4 Square Tiles on the SAME row (grid-cols-4) with INLINE currency */}
                                    <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
                                        {/* Square 1: Total Cash */}
                                        <div className="bg-indigo-500/10 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 p-1.5 sm:p-2 rounded-xl flex flex-col items-center justify-center text-center min-w-0">
                                            <span className="text-[7.5px] sm:text-[9.5px] font-bold text-indigo-800 dark:text-indigo-300 truncate w-full" title={isManagerUser ? 'إجمالي نقد المدير' : 'النقدي المتبقي'}>
                                                {isManagerUser ? 'إجمالي النقد' : 'المتبقي'}
                                            </span>
                                            <div className="flex items-baseline justify-center gap-0.5 sm:gap-1 mt-0.5 w-full min-w-0" dir="ltr">
                                                <span className="font-black text-indigo-700 dark:text-indigo-400 font-mono text-[10px] sm:text-[12.5px] truncate">
                                                    {cardCash.toLocaleString()}
                                                </span>
                                                <span className="text-[7.5px] sm:text-[9px] font-bold text-indigo-600/80 dark:text-indigo-400/80 shrink-0">ر.ي</span>
                                            </div>
                                        </div>

                                        {/* Square 2: Direct Sales */}
                                        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 p-1.5 sm:p-2 rounded-xl flex flex-col items-center justify-center text-center min-w-0">
                                            <span className="text-[7.5px] sm:text-[9.5px] font-bold text-slate-600 dark:text-slate-400 truncate w-full" title={isManagerUser ? 'مبيعات كروت نقدية' : 'مبيعاتك كروت'}>
                                                {isManagerUser ? 'مبيعات كروت' : 'مبيعاتك كروت'}
                                            </span>
                                            <div className="flex items-baseline justify-center gap-0.5 sm:gap-1 mt-0.5 w-full min-w-0" dir="ltr">
                                                <span className="font-black text-slate-800 dark:text-slate-200 font-mono text-[10px] sm:text-[11.5px] truncate">
                                                    {cardCashDetails.ownSales.toLocaleString()}
                                                </span>
                                                <span className="text-[7.5px] sm:text-[9px] font-bold text-slate-500 shrink-0">ر.ي</span>
                                            </div>
                                        </div>

                                        {/* Square 3: Clearances */}
                                        <div className="bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/40 p-1.5 sm:p-2 rounded-xl flex flex-col items-center justify-center text-center min-w-0">
                                            <span className="text-[7.5px] sm:text-[9.5px] font-bold text-purple-700 dark:text-purple-300 truncate w-full" title={isManagerUser ? 'مستلم من الموظفين' : 'المسلّم للمدير'}>
                                                {isManagerUser ? 'مستلم تصفيات' : 'مسلّم للمدير'}
                                            </span>
                                            <div className="flex items-baseline justify-center gap-0.5 sm:gap-1 mt-0.5 w-full min-w-0" dir="ltr">
                                                <span className="font-black text-purple-700 dark:text-purple-300 font-mono text-[10px] sm:text-[11.5px] truncate">
                                                    {cardCashDetails.clearances.toLocaleString()}
                                                </span>
                                                <span className="text-[7.5px] sm:text-[9px] font-bold text-purple-500 shrink-0">ر.ي</span>
                                            </div>
                                        </div>

                                        {/* Square 4: Credit */}
                                        <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 p-1.5 sm:p-2 rounded-xl flex flex-col items-center justify-center text-center min-w-0">
                                            <span className="text-[7.5px] sm:text-[9.5px] font-bold text-amber-700 dark:text-amber-300 truncate w-full" title="كروت آجلة">
                                                كروت آجلة
                                            </span>
                                            <div className="flex items-baseline justify-center gap-0.5 sm:gap-1 mt-0.5 w-full min-w-0" dir="ltr">
                                                <span className="font-black text-amber-700 dark:text-amber-300 font-mono text-[10px] sm:text-[11.5px] truncate">
                                                    {cardCredit.toLocaleString()}
                                                </span>
                                                <span className="text-[7.5px] sm:text-[9px] font-bold text-amber-500 shrink-0">ر.ي</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>

            <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Active Drafts Chips */}
                <div className="flex flex-col sm:flex-row gap-3">
                    {(salesCart.length > 0 || salesMinimized) && (
                        <Link 
                            to="/sales" 
                            onClick={() => useInvoiceStore.getState().setSalesMinimized(false)}
                            className="flex items-center gap-3 bg-white dark:bg-slate-900 border-2 border-gray-200 dark:border-blue-800 shadow-md p-3 rounded-2xl hover:bg-white dark:hover:bg-blue-900/20 hover:border-blue-500 transition animate-pulse"
                        >
                            <div className="bg-white dark:bg-slate-700 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 p-2 rounded-xl">
                                <RefreshCw size={24} className="animate-spin-slow" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-blue-800 dark:text-blue-200 font-bold">العودة للمبيعات</span>
                                {salesCart.length > 0 && <span className="text-blue-600 dark:text-blue-400 text-xs">{salesCart.length} منتجات في السلة</span>}
                            </div>
                        </Link>
                    )}
                    {(purchasesCart.length > 0 || purchasesMinimized) && (
                        <Link 
                            to="/purchases" 
                            onClick={() => useInvoiceStore.getState().setPurchasesMinimized(false)}
                            className="flex items-center gap-3 bg-white dark:bg-slate-900 border-2 border-purple-200 dark:border-purple-800 shadow-md p-3 rounded-2xl hover:bg-white dark:hover:bg-purple-900/20 hover:border-purple-400 transition animate-pulse"
                        >
                            <div className="bg-white dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 p-2 rounded-xl">
                                <RefreshCw size={24} className="animate-spin-slow" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-purple-800 dark:text-purple-200 font-bold">العودة للمشتريات</span>
                                {purchasesCart.length > 0 && <span className="text-purple-600 dark:text-purple-400 text-xs">{purchasesCart.length} منتجات في الفاتورة</span>}
                            </div>
                        </Link>
                    )}
                </div>
            </div>
            
            <div className="grid grid-cols-3 gap-3 md:gap-4 mb-3 md:mb-4 shrink-0 px-2 lg:px-4 mx-auto max-w-4xl w-full">
                {accessibleCards.map((card, idx) => (
                    <Link
                        key={card.path}
                        to={card.path}
                        onClick={card.onClick}
                        className={`group flex flex-col items-center justify-center text-center p-3 sm:p-4 rounded-xl md:rounded-2xl border transition-all duration-300 hover:shadow-md bg-card-bg border-border-main ${card.borderColor}`}
                    >
                        <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center mb-2 sm:mb-3 transition-transform group-hover:scale-105 ${card.bgColor} dark:bg-opacity-10 ${card.textColor}`}>
                            <card.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <h3 className="text-[11px] sm:text-xs font-bold text-text-main leading-tight">{card.title}</h3>
                    </Link>
                ))}
            </div>
        </div>
    );
}
