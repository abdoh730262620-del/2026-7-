import React, { useState, useMemo } from 'react';
import { 
    Scale, Calendar, Printer, Search, CheckCircle2, AlertTriangle, 
    Layers, Wallet, CreditCard, TrendingUp, Eye, ChevronDown, 
    ChevronUp, Filter, Sparkles, FileText, X
} from 'lucide-react';
import { CardCategory, CardSale, CardPurchase, CardStockLog, CardDistributor } from '../types/cardTypes';
import { printReport } from '../lib/printHelper';

interface CardReconciliationSectionProps {
    categories: CardCategory[];
    sales: CardSale[];
    purchases: CardPurchase[];
    stockLogs: CardStockLog[];
    distributors: CardDistributor[];
    selectedMonth: string;
    onMonthChange: (month: string) => void;
    onOpenSalesSection?: () => void;
    onOpenPurchasesSection?: () => void;
}

export function CardReconciliationSection({
    categories,
    sales,
    purchases,
    stockLogs,
    distributors,
    selectedMonth,
    onMonthChange,
    onOpenSalesSection,
    onOpenPurchasesSection
}: CardReconciliationSectionProps) {
    const [auditScope, setAuditScope] = useState<'month' | 'all'>('month');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'diff' | 'matched'>('all');
    const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({});
    const [selectedCategoryForModal, setSelectedCategoryForModal] = useState<CardCategory | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const toggleExpand = (id: string) => {
        setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const isCancelledStatus = (status?: string) => {
        if (!status) return false;
        const st = status.trim().toLowerCase();
        return st === 'cancelled' || st === 'canceled' || st === 'returned';
    };

    // 1. Prepare Active Valid Invoices & Sales
    const activeCashInvoiceNumbers = useMemo(() => {
        return new Set(
            sales
                .filter(s => (s.status === 'completed' || !s.status) && !isCancelledStatus(s.status) && s.paymentType === 'cash' && s.invoiceNumber)
                .map(s => s.invoiceNumber)
        );
    }, [sales]);

    // Active sales depending on scope
    const filteredSales = useMemo(() => {
        return sales.filter(s => {
            if (isCancelledStatus(s.status)) return false;
            if (s.paymentType === 'credit' && s.invoiceNumber && activeCashInvoiceNumbers.has(s.invoiceNumber)) {
                return false;
            }
            if (auditScope === 'month') {
                const matchMonth = s.month === selectedMonth || 
                    (s.date && s.date.startsWith(selectedMonth)) || 
                    (s.dateTime && s.dateTime.startsWith(selectedMonth));
                if (!matchMonth) return false;
            }
            return s.status === 'completed' || !s.status;
        });
    }, [sales, auditScope, selectedMonth, activeCashInvoiceNumbers]);

    // Active purchases depending on scope
    const filteredPurchases = useMemo(() => {
        return purchases.filter(p => {
            if (isCancelledStatus(p.status)) return false;
            if (auditScope === 'month') {
                const matchMonth = p.month === selectedMonth || 
                    (p.date && p.date.startsWith(selectedMonth)) || 
                    (p.dateTime && p.dateTime.startsWith(selectedMonth));
                if (!matchMonth) return false;
            }
            return p.status === 'completed' || !p.status;
        });
    }, [purchases, auditScope, selectedMonth]);

    // Active stock logs depending on scope
    const filteredStockLogs = useMemo(() => {
        return stockLogs.filter(log => {
            if (auditScope === 'month') {
                const logMonth = log.additionDate ? log.additionDate.slice(0, 7) : '';
                return logMonth === selectedMonth;
            }
            return true;
        });
    }, [stockLogs, auditScope, selectedMonth]);

    const isCategoryMatch = (name1?: string, id1?: string, name2?: string, id2?: string, linked?: string) => {
        if (!name1 && !id1) return false;
        if (id1 && id2 && id1 === id2) return true;
        if (name1 && name2 && name1.trim() === name2.trim()) return true;
        if (name1 && linked && name1.trim() === linked.trim()) return true;

        const clean = (str?: string) => (str || '').replace(/فئة|كروت|كرت|ريال|\s+/g, '').toLowerCase();
        const c1 = clean(name1);
        const c2 = clean(name2);
        const cl = clean(linked);

        if (c1 && c2 && c1 === c2) return true;
        if (c1 && cl && c1 === cl) return true;
        return false;
    };

    // 2. Compute Category Audit & Reconciliation Data
    const reconciliationData = useMemo(() => {
        return categories.map(cat => {
            // Category Sales (Cash vs Credit)
            const catSales = filteredSales.filter(s => {
                return isCategoryMatch(s.categoryName, s.categoryId, cat.name, cat.id, cat.linkedSection);
            });
            const cashSales = catSales.filter(s => s.paymentType === 'cash');
            const creditSales = catSales.filter(s => s.paymentType === 'credit');

            const cashSalesQty = cashSales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
            const creditSalesQty = creditSales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
            const totalSalesQty = cashSalesQty + creditSalesQty;

            const cashSalesAmount = cashSales.reduce((sum, s) => sum + (Number(s.netTotal) || 0), 0);
            const creditSalesAmount = creditSales.reduce((sum, s) => sum + (Number(s.netTotal) || 0), 0);
            const totalSalesAmount = cashSalesAmount + creditSalesAmount;

            // Category Purchases & Stock additions
            const catPurchases = filteredPurchases.filter(p => {
                return isCategoryMatch(p.categoryName, p.categoryId, cat.name, cat.id, cat.linkedSection);
            });
            const cashPurchases = catPurchases.filter(p => p.paymentType === 'cash');
            const creditPurchases = catPurchases.filter(p => p.paymentType === 'credit');

            const cashPurchasesQty = cashPurchases.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
            const creditPurchasesQty = creditPurchases.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
            const totalPurchasesQty = cashPurchasesQty + creditPurchasesQty;

            const cashPurchasesAmount = cashPurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
            const creditPurchasesAmount = creditPurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
            const totalPurchasesAmount = cashPurchasesAmount + creditPurchasesAmount;

            // Stock additions from logs
            const catLogs = filteredStockLogs.filter(l => isCategoryMatch(l.categoryName, l.categoryId, cat.name, cat.id, cat.linkedSection));
            const logsAddedQty = catLogs.reduce((sum, l) => sum + (Number(l.quantityAdded) || 0), 0);

            // Inflow Quantity (Purchases or Logs)
            const effectiveInflowQty = totalPurchasesQty > 0 ? totalPurchasesQty : logsAddedQty;

            // Current Active Stock in System
            const currentStock = Number(cat.availableCount) || 0;
            const stockWholesaleValue = currentStock * (Number(cat.wholesalePrice) || 0);
            const stockRetailValue = currentStock * (Number(cat.retailPrice) || 0);

            // Reconciliation Calculation:
            // Net balance change during period = (Total Inflow - Total Sales)
            const netStockMovement = effectiveInflowQty - totalSalesQty;

            // All-time theoretical stock check (if in all-time mode and logs available)
            let stockDifference = 0;
            if (auditScope === 'all' && (effectiveInflowQty > 0 || totalSalesQty > 0)) {
                const expectedStock = Math.max(0, effectiveInflowQty - totalSalesQty);
                stockDifference = currentStock - expectedStock;
            }

            const hasDiscrepancy = Math.abs(stockDifference) > 0;

            return {
                category: cat,
                currentStock,
                stockWholesaleValue,
                stockRetailValue,
                // Sales
                cashSalesQty,
                creditSalesQty,
                totalSalesQty,
                cashSalesAmount,
                creditSalesAmount,
                totalSalesAmount,
                // Purchases / Inflow
                cashPurchasesQty,
                creditPurchasesQty,
                totalPurchasesQty: effectiveInflowQty,
                cashPurchasesAmount,
                creditPurchasesAmount,
                totalPurchasesAmount,
                // Movement & Audit
                netStockMovement,
                stockDifference,
                hasDiscrepancy,
                catSales,
                catPurchases,
                catLogs
            };
        });
    }, [categories, filteredSales, filteredPurchases, filteredStockLogs, auditScope]);

    // 3. Filtered list for UI Display
    const displayedReconciliation = useMemo(() => {
        return reconciliationData.filter(item => {
            if (searchTerm.trim()) {
                const match = item.category.name.toLowerCase().includes(searchTerm.trim().toLowerCase());
                if (!match) return false;
            }
            if (statusFilter === 'diff') {
                return item.hasDiscrepancy;
            }
            if (statusFilter === 'matched') {
                return !item.hasDiscrepancy;
            }
            return true;
        });
    }, [reconciliationData, searchTerm, statusFilter]);

    // 4. Overall Global Aggregates
    const overallStats = useMemo(() => {
        const totalCurrentStock = reconciliationData.reduce((sum, r) => sum + r.currentStock, 0);
        const totalCashSalesQty = reconciliationData.reduce((sum, r) => sum + r.cashSalesQty, 0);
        const totalCreditSalesQty = reconciliationData.reduce((sum, r) => sum + r.creditSalesQty, 0);
        const totalSalesQty = totalCashSalesQty + totalCreditSalesQty;

        const totalCashSalesAmount = reconciliationData.reduce((sum, r) => sum + r.cashSalesAmount, 0);
        const totalCreditSalesAmount = reconciliationData.reduce((sum, r) => sum + r.creditSalesAmount, 0);
        const totalSalesAmount = totalCashSalesAmount + totalCreditSalesAmount;

        const totalPurchasesQty = reconciliationData.reduce((sum, r) => sum + r.totalPurchasesQty, 0);
        const totalPurchasesAmount = reconciliationData.reduce((sum, r) => sum + r.totalPurchasesAmount, 0);

        const totalStockRetailVal = reconciliationData.reduce((sum, r) => sum + r.stockRetailValue, 0);
        const totalStockWholesaleVal = reconciliationData.reduce((sum, r) => sum + r.stockWholesaleValue, 0);

        const categoriesWithDiff = reconciliationData.filter(r => r.hasDiscrepancy).length;

        // Total distributors debt balance
        const totalDistributorsBalance = distributors.reduce((sum, d) => sum + (d.balance || 0), 0);

        return {
            totalCurrentStock,
            totalCashSalesQty,
            totalCreditSalesQty,
            totalSalesQty,
            totalCashSalesAmount,
            totalCreditSalesAmount,
            totalSalesAmount,
            totalPurchasesQty,
            totalPurchasesAmount,
            totalStockRetailVal,
            totalStockWholesaleVal,
            categoriesWithDiff,
            totalDistributorsBalance
        };
    }, [reconciliationData, distributors]);

    // Pagination calculations
    const totalPages = Math.ceil(displayedReconciliation.length / itemsPerPage) || 1;
    const paginatedReconciliation = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return displayedReconciliation.slice(start, start + itemsPerPage);
    }, [displayedReconciliation, currentPage, itemsPerPage]);

    // 5. PDF & Print Export
    const handleExportAuditPDF = () => {
        const periodTitle = auditScope === 'month' ? `شهر ${selectedMonth}` : 'كافة الفترات المسجلة';
        const title = `تقرير مطابقة أرصدة الكروت والمبيعات - ${periodTitle}`;
        const headers = [
            'فئة الكرت',
            'الرصيد الفعلي',
            'مبيعات نقدي (كارت)',
            'مبيعات آجل (كارت)',
            'إجمالي المبيعات',
            'مبلغ النقدي (ريال)',
            'مبلغ الآجل (ريال)',
            'الوارد/المشتريات',
            'حالة المطابقة'
        ];

        const data = displayedReconciliation.map(r => [
            r.category.name,
            `${r.currentStock} كارت`,
            `${r.cashSalesQty}`,
            `${r.creditSalesQty}`,
            `${r.totalSalesQty} كارت`,
            `${r.cashSalesAmount.toFixed(2)}`,
            `${r.creditSalesAmount.toFixed(2)}`,
            `${r.totalPurchasesQty} كارت`,
            r.stockDifference === 0 
                ? 'متطابق ✓' 
                : r.stockDifference > 0 
                    ? `فائض (+${r.stockDifference})` 
                    : `عجز (${r.stockDifference})`
        ]);

        data.push([
            'الإجمالي العام',
            `${overallStats.totalCurrentStock} كارت`,
            `${overallStats.totalCashSalesQty}`,
            `${overallStats.totalCreditSalesQty}`,
            `${overallStats.totalSalesQty} كارت`,
            `${overallStats.totalCashSalesAmount.toFixed(2)} ريال`,
            `${overallStats.totalCreditSalesAmount.toFixed(2)} ريال`,
            `${overallStats.totalPurchasesQty} كارت`,
            overallStats.categoriesWithDiff === 0 ? 'مطابق 100% ✓' : `يوجد ${overallStats.categoriesWithDiff} فروقات`
        ]);

        printReport(title, headers, data);
    };

    return (
        <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200" dir="rtl">
            {/* Header & Controls Bar (Exact Same Structure as CardSalesSection) */}
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center border border-violet-100 dark:border-violet-900/50 shrink-0">
                            <Scale size={22} className="sm:hidden" />
                            <Scale size={26} className="hidden sm:block" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">مطابقة الأرصدة والمبيعات</h2>
                            <p className="text-[11px] sm:text-xs font-bold text-slate-400">
                                تدقيق رصيد المخزون الفعلي ومطابقته مع المبيعات النقدية والآجلة
                            </p>
                        </div>
                    </div>

                    <div className="w-full sm:w-auto flex items-center gap-2">
                        <button
                            onClick={handleExportAuditPDF}
                            className="w-full sm:w-auto px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs rounded-xl sm:rounded-2xl shadow-md shadow-violet-600/20 flex items-center justify-center gap-2 transition active:scale-95"
                        >
                            <Printer size={15} />
                            <span>طباعة التقرير</span>
                        </button>
                    </div>
                </div>

                {/* Scope and Filter Bar */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Scope Switcher */}
                        <div className="grid grid-cols-2 sm:flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 w-full sm:w-auto">
                            <button
                                onClick={() => {
                                    setAuditScope('month');
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black transition text-center ${
                                    auditScope === 'month'
                                        ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                مطابقة شهرية
                            </button>
                            <button
                                onClick={() => {
                                    setAuditScope('all');
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black transition text-center ${
                                    auditScope === 'all'
                                        ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                مطابقة شاملة
                            </button>
                        </div>

                        {/* Month selector if month scope */}
                        {auditScope === 'month' && (
                            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 w-full sm:w-auto">
                                <Calendar size={13} className="text-slate-400 shrink-0" />
                                <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 shrink-0">الشهر:</span>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => {
                                        onMonthChange(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="bg-transparent text-[11px] sm:text-xs font-black text-slate-900 dark:text-white outline-none cursor-pointer w-full sm:w-auto"
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        {/* Search Input */}
                        <div className="relative flex-1 sm:w-48">
                            <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="بحث عن فئة..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl pr-8 pl-2.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold outline-none focus:border-violet-600 text-slate-900 dark:text-white"
                            />
                        </div>

                        {/* Status Filter */}
                        <select
                            value={statusFilter}
                            onChange={(e: any) => {
                                setStatusFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl px-2 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs font-bold outline-none focus:border-violet-600 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                            <option value="all">الكل ({reconciliationData.length})</option>
                            <option value="diff">فروقات ({overallStats.categoriesWithDiff})</option>
                            <option value="matched">متطابق</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Audit Status Alert Banner */}
            <div className={`p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border flex items-center justify-between gap-3 ${
                overallStats.categoriesWithDiff === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300'
            }`}>
                <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 ${
                        overallStats.categoriesWithDiff === 0 ? 'bg-emerald-100 dark:bg-emerald-900/60' : 'bg-amber-100 dark:bg-amber-900/60'
                    }`}>
                        {overallStats.categoriesWithDiff === 0 ? <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" /> : <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" />}
                    </div>
                    <div>
                        <div className="text-[11px] sm:text-xs font-black">
                            {overallStats.categoriesWithDiff === 0 
                                ? 'حالة المطابقة: كافة فئات الكروت متطابقة ومستقرة تماماً ✓' 
                                : `تنبيه: يوجد ${overallStats.categoriesWithDiff} فئات تظهر فروقات بين حركة المبيعات والمخزون.`
                            }
                        </div>
                        <div className="text-[10px] sm:text-[11px] font-bold opacity-80 mt-0.5">
                            يتم استبعاد أي فواتير ملغاة تلقائياً، وتحديث الأرصدة النقدية والآجلة لحظياً.
                        </div>
                    </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <span className="text-xs font-black px-3 py-1 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-current">
                        {reconciliationData.length} فئات نشطة
                    </span>
                </div>
            </div>

            {/* Quick Stat KPIs (Exact 4 Cards Grid Style as CardSalesSection) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* 1. Current Stock in Warehouse */}
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">المخزون المتوفر</span>
                    <div className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
                        {overallStats.totalCurrentStock} كارت
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-0.5">
                        القيمة: {overallStats.totalStockRetailVal.toLocaleString()} ريال
                    </div>
                </div>

                {/* 2. Cash Sales */}
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">المبيعات النقدية</span>
                    <div className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                        {overallStats.totalCashSalesQty} كارت
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-0.5">
                        صافي: {overallStats.totalCashSalesAmount.toFixed(2)} ريال
                    </div>
                </div>

                {/* 3. Credit Sales */}
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">المبيعات الآجلة</span>
                    <div className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
                        {overallStats.totalCreditSalesQty} كارت
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-0.5">
                        مستحق: {overallStats.totalCreditSalesAmount.toFixed(2)} ريال
                    </div>
                </div>

                {/* 4. Total Inflow / Purchases */}
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">الكروت الواردة</span>
                    <div className="text-base sm:text-lg font-black text-blue-600 dark:text-blue-400 mt-1">
                        +{overallStats.totalPurchasesQty} كارت
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-0.5">
                        مشتريات: {overallStats.totalPurchasesAmount.toFixed(2)} ريال
                    </div>
                </div>
            </div>

            {/* Reconciliation List with Collapsible Structured Tables per Category (Exact CardSalesSection Layout) */}
            <div className="space-y-3">
                {paginatedReconciliation.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-10 sm:p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs space-y-2">
                        <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                        <p>لا توجد فئات كروت مطابقة لمعايير البحث.</p>
                    </div>
                ) : (
                    paginatedReconciliation.map((item) => {
                        const isExpanded = !!expandedCategories[item.category.id];

                        return (
                            <div 
                                key={item.category.id}
                                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:border-violet-300 transition"
                            >
                                {/* Category Reconciliation Header Bar (Clickable to Expand/Collapse) */}
                                <div 
                                    onClick={() => toggleExpand(item.category.id)}
                                    className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </div>
                                        <span className="px-3 py-1 bg-violet-600 text-white font-black text-xs rounded-xl shadow-sm">
                                            فئة {item.category.name}
                                        </span>
                                        <div>
                                            <h4 className="font-black text-slate-900 dark:text-white text-xs sm:text-sm flex items-center gap-2">
                                                <span>المخزون المتوفر: <strong className="text-indigo-600 dark:text-indigo-400">{item.currentStock} كارت</strong></span>
                                                <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">({(item.currentStock * (item.category.retailPrice || 0)).toLocaleString()} ريال)</span>
                                            </h4>
                                            <p className="text-[10px] text-slate-400 font-medium">
                                                سعر البيع: {item.category.retailPrice || 0} ريال • جملة: {item.category.wholesalePrice || 0} ريال
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 justify-between sm:justify-end" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-1.5">
                                            {/* Status Badge */}
                                            {item.stockDifference === 0 ? (
                                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-1">
                                                    <CheckCircle2 size={11} />
                                                    <span>متطابق ✓</span>
                                                </span>
                                            ) : item.stockDifference > 0 ? (
                                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50 flex items-center gap-1">
                                                    <AlertTriangle size={11} />
                                                    <span>فائض (+{item.stockDifference})</span>
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 flex items-center gap-1">
                                                    <AlertTriangle size={11} />
                                                    <span>عجز ({item.stockDifference})</span>
                                                </span>
                                            )}

                                            {/* Total Sales Summary Pill */}
                                            <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                                المبيعات: {item.totalSalesQty} كارت
                                            </span>
                                        </div>

                                        <button
                                            onClick={() => setSelectedCategoryForModal(item.category)}
                                            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1.5 shadow-md shadow-violet-600/20 active:scale-95 transition"
                                        >
                                            <Eye size={13} />
                                            <span>سجل الفواتير</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Structured Details Table (Collapsible - Exact CardSalesSection Pattern) */}
                                {isExpanded && (
                                    <div className="p-4 animate-in fade-in duration-200">
                                        <table className="w-full text-right text-xs">
                                            <thead>
                                                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[11px] font-bold">
                                                    <th className="pb-2 font-black">نوع الحركة / البيان</th>
                                                    <th className="pb-2 text-center font-black">الكمية (كارت)</th>
                                                    <th className="pb-2 text-center font-black">سعر الوحدة</th>
                                                    <th className="pb-2 text-left font-black">الإجمالي (ريال)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
                                                {/* 1. Cash Sales Row */}
                                                <tr className="font-bold text-slate-800 dark:text-slate-200">
                                                    <td className="py-2.5 font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                                        <Wallet size={13} />
                                                        <span>مبيعات نقدية مستلمة</span>
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono font-black text-emerald-600">
                                                        +{item.cashSalesQty} كارت
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono text-slate-500">
                                                        {(item.category.retailPrice || 0).toFixed(2)} ريال
                                                    </td>
                                                    <td className="py-2.5 text-left font-mono font-black text-emerald-600">
                                                        {item.cashSalesAmount.toFixed(2)} ريال
                                                    </td>
                                                </tr>

                                                {/* 2. Credit Sales Row */}
                                                <tr className="font-bold text-slate-800 dark:text-slate-200">
                                                    <td className="py-2.5 font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                                        <CreditCard size={13} />
                                                        <span>مبيعات آجلة مستحقة</span>
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono font-black text-amber-600">
                                                        +{item.creditSalesQty} كارت
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono text-slate-500">
                                                        {(item.category.retailPrice || 0).toFixed(2)} ريال
                                                    </td>
                                                    <td className="py-2.5 text-left font-mono font-black text-amber-600">
                                                        {item.creditSalesAmount.toFixed(2)} ريال
                                                    </td>
                                                </tr>

                                                {/* 3. Inflow / Purchases Row */}
                                                <tr className="font-bold text-slate-800 dark:text-slate-200">
                                                    <td className="py-2.5 font-black text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                                                        <TrendingUp size={13} />
                                                        <span>الكروت الواردة / المشتريات</span>
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono font-black text-blue-600">
                                                        +{item.totalPurchasesQty} كارت
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono text-slate-500">
                                                        {(item.category.wholesalePrice || 0).toFixed(2)} ريال
                                                    </td>
                                                    <td className="py-2.5 text-left font-mono font-black text-blue-600">
                                                        {item.totalPurchasesAmount.toFixed(2)} ريال
                                                    </td>
                                                </tr>

                                                {/* 4. Current Stock Row */}
                                                <tr className="font-bold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/20">
                                                    <td className="py-2.5 font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                                                        <Layers size={13} />
                                                        <span>الرصيد الفعلي المتوفر بالمخزن</span>
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono font-black text-indigo-600">
                                                        {item.currentStock} كارت
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono text-slate-500">
                                                        {(item.category.retailPrice || 0).toFixed(2)} ريال
                                                    </td>
                                                    <td className="py-2.5 text-left font-mono font-black text-indigo-600">
                                                        {item.stockRetailValue.toFixed(2)} ريال
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        {/* Reconciliation Summary Footer */}
                                        <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                                            <div className="flex flex-wrap items-center gap-3">
                                                <span className="font-bold text-slate-500">
                                                    إجمالي المبيعات: <strong className="text-slate-900 dark:text-white font-black">{item.totalSalesQty}</strong> كارت
                                                </span>
                                                <span className="text-slate-300">•</span>
                                                <span className="font-bold text-slate-500">
                                                    صافي الحركة: <strong className={`font-black ${item.netStockMovement >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        {item.netStockMovement >= 0 ? `+${item.netStockMovement}` : item.netStockMovement} كارت
                                                    </strong>
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                                                <span className="font-bold text-slate-500">إجمالي قيمة المبيعات:</span>
                                                <span className="font-black text-sm text-violet-600 dark:text-violet-400 font-mono" dir="ltr">
                                                    {item.totalSalesAmount.toFixed(2)} ريال
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}

                {/* Pagination Controls (Exact Same as CardSalesSection) */}
                {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold gap-3 mt-4">
                        <div className="text-slate-500 text-center sm:text-right">
                            عرض الصفحة <span className="font-black text-violet-600">{currentPage}</span> من <span className="font-black">{totalPages}</span> (إجمالي {displayedReconciliation.length} فئة)
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-xl font-black text-slate-700 dark:text-slate-300 transition"
                            >
                                السابق
                            </button>
                            <span className="font-mono font-black px-2">{currentPage} / {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-xl font-black text-slate-700 dark:text-slate-300 transition"
                            >
                                التالي
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* MODAL: Detailed Invoices for a Category */}
            {selectedCategoryForModal && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
                        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center font-black">
                                    <Scale size={20} />
                                </div>
                                <div>
                                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                                        سجل فواتير مبيعات: {selectedCategoryForModal.name}
                                    </h3>
                                    <p className="text-[11px] font-bold text-slate-400">
                                        {auditScope === 'month' ? `فواتير شهر ${selectedMonth}` : 'كافة الفواتير المسجلة'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedCategoryForModal(null)}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto space-y-3 flex-1">
                            {(() => {
                                const catTrim = selectedCategoryForModal.name.trim();
                                const catSales = filteredSales.filter(s => (s.categoryName && s.categoryName.trim() === catTrim) || s.categoryId === selectedCategoryForModal.id);

                                if (catSales.length === 0) {
                                    return (
                                        <div className="p-8 text-center text-slate-400 font-bold text-xs space-y-2">
                                            <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={32} />
                                            <p>لا توجد فواتير مبيعات مسجلة لهذه الفئة في النطاق المحدد.</p>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="space-y-2">
                                        {catSales.map(sale => (
                                            <div 
                                                key={sale.id}
                                                className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 text-xs"
                                            >
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">
                                                            #{sale.invoiceNumber || sale.id.slice(-6).toUpperCase()}
                                                        </span>
                                                        <span className="font-black text-slate-900 dark:text-white">
                                                            {sale.distributorName || 'مشتري عام'}
                                                        </span>
                                                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black ${
                                                            sale.paymentType === 'cash' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                        }`}>
                                                            {sale.paymentType === 'cash' ? 'نقدي' : 'آجل'}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 font-medium mt-1">
                                                        {sale.dateTime || sale.date} • {sale.userName || 'النظام'}
                                                    </div>
                                                </div>

                                                <div className="text-left">
                                                    <div className="font-mono font-black text-slate-900 dark:text-white">
                                                        {sale.quantity} كارت
                                                    </div>
                                                    <div className="text-[11px] font-mono font-black text-emerald-600 dark:text-emerald-400">
                                                        {(sale.netTotal || 0).toFixed(2)} ريال
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end">
                            <button
                                onClick={() => setSelectedCategoryForModal(null)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
