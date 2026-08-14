import React, { useState } from 'react';
import { 
    Search, Calendar, FileText, Printer, TrendingUp, X, Filter, 
    ChevronDown, ChevronUp, Wallet, ArrowDownLeft, ArrowUpRight, 
    Plus, CheckCircle2, User, Clock, ArrowRightLeft, DollarSign, Receipt
} from 'lucide-react';
import { CardCashboxEntry, CardSale, CardPurchase, CardVoucher, CardPurchaseVoucher } from '../types/cardTypes';
import { printReport } from '../lib/printHelper';

interface CardCashboxSectionProps {
    entries: CardCashboxEntry[];
    sales?: CardSale[];
    purchases?: CardPurchase[];
    vouchers?: CardVoucher[];
    purchaseVouchers?: CardPurchaseVoucher[];
    cashboxBalance: number;
    canAdd: boolean;
    onOpenDepositWithdraw: () => void;
    appUser: any;
}

export interface DetailedCashboxInvoice {
    id: string;
    entry: CardCashboxEntry;
    typeCategory: 'sale' | 'purchase' | 'voucher_distributor' | 'voucher_supplier' | 'manual';
    typeLabel: string;
    invoiceNumber: string;
    partyName: string;
    amount: number;
    isIncome: boolean;
    dateTime: string;
    date: string;
    userName: string;
    items?: {
        name: string;
        quantity: number;
        unitPrice: number;
        total: number;
    }[];
    totalQuantity?: number;
    notes?: string;
}

export const CardCashboxSection: React.FC<CardCashboxSectionProps> = ({
    entries,
    sales = [],
    purchases = [],
    vouchers = [],
    purchaseVouchers = [],
    cashboxBalance,
    canAdd,
    onOpenDepositWithdraw,
    appUser
}) => {
    const [searchText, setSearchText] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
    const [showFilters, setShowFilters] = useState(false);
    const [expandedRows, setExpandedRows] = useState<{ [key: string]: boolean }>({});
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const toggleExpand = (id: string) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Helper: Extract invoice/reference number from title or id
    const extractInvoiceNumber = (title: string, id: string): string => {
        const hashMatch = title.match(/#([A-Za-z0-9_-]+)/);
        if (hashMatch && hashMatch[1]) {
            return hashMatch[1];
        }
        const digits = title.replace(/\D/g, '');
        if (digits) return digits.slice(-5);
        return id.slice(-5).toUpperCase();
    };

    // Build enriched invoice-like records for every cashbox entry
    const detailedInvoices: DetailedCashboxInvoice[] = entries.map(entry => {
        const dateOnly = entry.date || (entry.dateTime && entry.dateTime.split(' ')[0]) || '';
        const invNum = extractInvoiceNumber(entry.title, entry.id);
        const cleanInvNum = invNum.replace(/\D/g, '');

        let typeCategory: DetailedCashboxInvoice['typeCategory'] = 'manual';
        let typeLabel = entry.isIncome ? 'إيداع نقدي' : 'سحب نقدي';
        let partyName = 'حركة نقدية مباشرة';
        let items: DetailedCashboxInvoice['items'] = [];
        let totalQuantity = 0;
        let notes = entry.title;

        // 1. Check if related to a Cash Sale
        if (
            entry.type === 'cash_sale' || 
            entry.title.includes('مبيعات') || 
            entry.title.includes('بيع') ||
            entry.type === 'distributor_sale_cash'
        ) {
            typeCategory = 'sale';
            typeLabel = 'فاتورة مبيعات كروت (نقدي)';
            partyName = 'موزع / عميل نقدي';

            // Find matching card sales
            const matchedSales = sales.filter(s => {
                if (s.status === 'cancelled') return false;
                const sInv = s.invoiceNumber || '';
                const sClean = sInv.replace(/\D/g, '');
                return (
                    (cleanInvNum && sClean && sClean === cleanInvNum) ||
                    (invNum && sInv === invNum) ||
                    (entry.referenceId && (s.id === entry.referenceId || s.invoiceNumber === entry.referenceId))
                );
            });

            if (matchedSales.length > 0) {
                if (matchedSales[0].distributorName) {
                    partyName = matchedSales[0].distributorName;
                }
                items = matchedSales.map(s => {
                    const qty = Math.abs(s.quantity || 0);
                    const unitP = s.unitPrice || 0;
                    const total = s.netTotal || s.totalAmount || (qty * unitP);
                    totalQuantity += qty;
                    return {
                        name: s.categoryName || 'كروت شبكة',
                        quantity: qty,
                        unitPrice: unitP,
                        total: total
                    };
                });
            }
        }
        // 2. Check if related to a Cash Purchase
        else if (
            entry.type === 'supplier_purchase_cash' ||
            entry.title.includes('مشتريات') || 
            entry.title.includes('شراء')
        ) {
            typeCategory = 'purchase';
            typeLabel = 'فاتورة مشتريات كروت (نقدي)';
            partyName = 'مورد نقدي';

            const matchedPurchases = purchases.filter(p => {
                if (p.status === 'cancelled') return false;
                const pInv = p.invoiceNumber || '';
                const pClean = pInv.replace(/\D/g, '');
                return (
                    (cleanInvNum && pClean && pClean === cleanInvNum) ||
                    (invNum && pInv === invNum) ||
                    (entry.referenceId && (p.id === entry.referenceId || p.invoiceNumber === entry.referenceId))
                );
            });

            if (matchedPurchases.length > 0) {
                if (matchedPurchases[0].supplierName) {
                    partyName = matchedPurchases[0].supplierName;
                }
                items = matchedPurchases.map(p => {
                    const qty = Math.abs(p.quantity || 0);
                    const unitP = p.unitPrice || 0;
                    const total = p.totalAmount || (qty * unitP);
                    totalQuantity += qty;
                    return {
                        name: p.categoryName || 'كروت شبكة',
                        quantity: qty,
                        unitPrice: unitP,
                        total: total
                    };
                });
            }
        }
        // 3. Distributor Payment / Voucher
        else if (
            entry.type === 'distributor_payment' || 
            entry.title.includes('موزع') ||
            entry.title.includes('سند قبض') ||
            entry.title.includes('سند صرف')
        ) {
            typeCategory = 'voucher_distributor';
            typeLabel = entry.isIncome ? 'سند قبض من موزع' : 'سند صرف لموزع';
            partyName = 'حساب موزع';

            const matchedVoucher = vouchers.find(v => 
                (invNum && v.voucherNumber === invNum) ||
                (cleanInvNum && v.voucherNumber?.replace(/\D/g, '') === cleanInvNum) ||
                (entry.referenceId && v.id === entry.referenceId)
            );
            if (matchedVoucher) {
                partyName = matchedVoucher.distributorName;
                notes = matchedVoucher.notes || entry.title;
            }
        }
        // 4. Supplier Payment / Voucher
        else if (
            entry.type === 'supplier_payment' ||
            entry.title.includes('مورد')
        ) {
            typeCategory = 'voucher_supplier';
            typeLabel = entry.isIncome ? 'استرداد نقدي من مورد' : 'سند صرف لمورد';
            partyName = 'حساب مورد';

            const matchedPVoucher = purchaseVouchers.find(v =>
                (invNum && v.voucherNumber === invNum) ||
                (cleanInvNum && v.voucherNumber?.replace(/\D/g, '') === cleanInvNum) ||
                (entry.referenceId && v.id === entry.referenceId)
            );
            if (matchedPVoucher) {
                partyName = matchedPVoucher.supplierName;
                notes = matchedPVoucher.notes || entry.title;
            }
        }

        return {
            id: entry.id,
            entry,
            typeCategory,
            typeLabel,
            invoiceNumber: invNum,
            partyName,
            amount: entry.amount,
            isIncome: entry.isIncome,
            dateTime: entry.dateTime || dateOnly || '',
            date: dateOnly,
            userName: entry.userName || 'النظام',
            items: items.length > 0 ? items : undefined,
            totalQuantity: totalQuantity > 0 ? totalQuantity : undefined,
            notes
        };
    });

    // Filter by search, dates, and type
    const filteredInvoices = detailedInvoices.filter(inv => {
        if (filterType === 'income' && !inv.isIncome) return false;
        if (filterType === 'expense' && inv.isIncome) return false;

        if (searchText.trim()) {
            const q = searchText.toLowerCase();
            const matches = 
                inv.invoiceNumber.toLowerCase().includes(q) ||
                inv.partyName.toLowerCase().includes(q) ||
                inv.typeLabel.toLowerCase().includes(q) ||
                inv.notes?.toLowerCase().includes(q) ||
                inv.userName.toLowerCase().includes(q) ||
                (inv.items && inv.items.some(it => it.name.toLowerCase().includes(q)));
            
            if (!matches) return false;
        }

        if (startDate && inv.date && inv.date < startDate) return false;
        if (endDate && inv.date && inv.date > endDate) return false;

        return true;
    });

    // Quick Stats
    const totalTransactions = filteredInvoices.length;
    const totalIncome = filteredInvoices.reduce((sum, inv) => inv.isIncome ? sum + inv.amount : sum, 0);
    const totalExpense = filteredInvoices.reduce((sum, inv) => !inv.isIncome ? sum + inv.amount : sum, 0);
    const netPeriodChange = totalIncome - totalExpense;

    // Pagination
    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;
    const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handleExportPDF = () => {
        const title = `كشف حركة صندوق مبيعات الكروت${startDate || endDate ? ` (الفترة: ${startDate || 'البداية'} إلى ${endDate || 'النهاية'})` : ''}`;
        const headers = ['رقم الفاتورة / الحركة', 'نوع الحركة', 'الطرف / البيان', 'المبلغ', 'التاريخ والوقت', 'المستخدم'];
        const data = filteredInvoices.map(inv => [
            `#${inv.invoiceNumber}`,
            inv.typeLabel,
            inv.partyName,
            `${inv.isIncome ? '+' : '-'}${inv.amount.toFixed(2)} ر.ي`,
            inv.dateTime,
            inv.userName
        ]);

        data.push([
            'الإجمالي العام للفترة',
            `إجمالي الحركات: ${totalTransactions}`,
            `المقبوضات: ${totalIncome.toFixed(2)} | المصروفات: ${totalExpense.toFixed(2)}`,
            `الصافي: ${netPeriodChange.toFixed(2)} ريال يمني`,
            `رصيد الصندوق الحالي: ${cashboxBalance.toFixed(2)} ريال يمني`,
            '-'
        ]);

        printReport(title, headers, data);
    };

    return (
        <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-200 text-right" dir="rtl">
            {/* Header & Controls */}
            <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-100 dark:border-amber-900/50 shrink-0">
                        <Wallet size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">صندوق مبيعات الكروت</h2>
                            <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-black font-mono rounded-lg">
                                {cashboxBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                            </span>
                        </div>
                        <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 mt-0.5">
                            سجل حركات ونقدية فواتير الكروت، تفاصيل المبيعات والمشتريات والإيداع والسحب
                        </p>
                    </div>
                </div>
                
                {/* Compact Icon Buttons Toolbar (Side-by-side) */}
                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    {/* Manual Deposit/Withdraw Icon Button */}
                    {canAdd && (
                        <button
                            onClick={onOpenDepositWithdraw}
                            title="إيداع / سحب نقدي يدوي"
                            aria-label="إيداع أو سحب نقدي"
                            className="w-9 h-9 sm:w-10 sm:h-10 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl shadow-sm flex items-center justify-center transition border border-amber-500"
                        >
                            <Plus size={18} />
                        </button>
                    )}

                    {/* Filter Toggle Icon Button */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        title="تصفية وفلترة الحركات"
                        aria-label="تصفية وفلترة"
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl relative flex items-center justify-center transition border ${
                            showFilters || startDate || endDate || searchText || filterType !== 'all'
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                        }`}
                    >
                        <Filter size={17} />
                        {(startDate || endDate || searchText || filterType !== 'all') && (
                            <span className="w-2 h-2 rounded-full bg-amber-300 absolute top-1.5 right-1.5 border border-emerald-600"></span>
                        )}
                    </button>

                    {/* Export / Print Icon Button */}
                    <button
                        onClick={handleExportPDF}
                        disabled={filteredInvoices.length === 0}
                        title="طباعة وتصدير كشف PDF"
                        aria-label="طباعة وتصدير كشف PDF"
                        className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 active:scale-95 text-white rounded-xl shadow-sm flex items-center justify-center transition border border-slate-700"
                    >
                        <Printer size={17} />
                    </button>
                </div>
            </div>

            {/* Compact Toggleable Filter Panel */}
            {showFilters && (
                <div className="bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 animate-in slide-in-from-top-1 duration-150">
                    <div className="relative sm:col-span-2">
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="بحث: رقم الفاتورة، الطرف، البيان..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full pr-8 pl-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-emerald-600 text-slate-900 dark:text-white"
                            />
                            {searchText && (
                                <button onClick={() => setSearchText('')} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500">
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-emerald-600 text-slate-900 dark:text-white cursor-pointer"
                        >
                            <option value="all">جميع الحركات</option>
                            <option value="income">مقبوضات / إيداعات (+)</option>
                            <option value="expense">مدفوعات / مسحوبات (-)</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            title="من تاريخ"
                            className="w-1/2 px-2 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold outline-none focus:border-emerald-600 text-slate-900 dark:text-white"
                        />
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            title="إلى تاريخ"
                            className="w-1/2 px-2 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold outline-none focus:border-emerald-600 text-slate-900 dark:text-white"
                        />
                    </div>
                </div>
            )}

            {/* Quick Statistics Cards (Compact 4 Grid) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">إجمالي الحركات</span>
                    <div className="text-sm sm:text-base font-black text-slate-950 dark:text-white mt-0.5">{totalTransactions} حركة</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">المقبوضات / إيداع</span>
                    <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                        +{totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">المدفوعات / مسحوبات</span>
                    <div className="text-sm sm:text-base font-black text-rose-600 dark:text-rose-400 mt-0.5">
                        -{totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">صافي حركة الفترة</span>
                    <div className={`text-sm sm:text-base font-black mt-0.5 ${netPeriodChange >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {netPeriodChange >= 0 ? '+' : ''}{netPeriodChange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                    </div>
                </div>
            </div>

            {/* Invoices List with Collapsible Structured Tables per Cashbox Entry */}
            <div className="space-y-2.5">
                {paginatedInvoices.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs space-y-2">
                        <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={32} />
                        <p>لا توجد حركات في صندوق المبيعات مطابقة لمعايير البحث.</p>
                    </div>
                ) : (
                    paginatedInvoices.map((inv) => {
                        const isExpanded = !!expandedRows[inv.id];
                        const hasItems = inv.items && inv.items.length > 0;

                        return (
                            <div 
                                key={inv.id}
                                className={`bg-white dark:bg-slate-900 rounded-2xl border transition shadow-sm overflow-hidden ${
                                    isExpanded 
                                        ? 'border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-500/10' 
                                        : 'border-slate-200 dark:border-slate-800 hover:border-emerald-300'
                                }`}
                            >
                                {/* Invoice Header Bar (Clickable to Expand/Collapse) */}
                                <div 
                                    onClick={() => toggleExpand(inv.id)}
                                    className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer select-none"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className={`p-1 rounded-lg ${
                                            inv.isIncome 
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                        }`}>
                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </div>

                                        {/* Invoice Number Tag */}
                                        <span className={`px-2.5 py-0.5 font-mono font-black text-[11px] rounded-lg shadow-xs text-white ${
                                            inv.isIncome ? 'bg-emerald-600' : 'bg-rose-600'
                                        }`}>
                                            #{inv.invoiceNumber}
                                        </span>

                                        <div>
                                            <h4 className="font-black text-slate-900 dark:text-white text-xs flex items-center gap-1.5 flex-wrap">
                                                <span>{inv.partyName}</span>
                                                <span className="text-[9px] text-slate-400 font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                    {inv.typeLabel}
                                                </span>
                                                {inv.totalQuantity ? (
                                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black">
                                                        ({inv.totalQuantity} كارت)
                                                    </span>
                                                ) : null}
                                            </h4>
                                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                                {inv.dateTime} • {inv.userName}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 justify-between sm:justify-end" onClick={(e) => e.stopPropagation()}>
                                        {/* Amount */}
                                        <div className="text-left">
                                            <span className={`font-mono font-black text-xs sm:text-sm block ${
                                                inv.isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                            }`}>
                                                {inv.isIncome ? '+' : '-'}{inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                                            </span>
                                        </div>

                                        {/* Income / Expense Badge */}
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${
                                            inv.isIncome 
                                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/50'
                                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/50'
                                        }`}>
                                            {inv.isIncome ? 'مقبوضات' : 'مسحوبات'}
                                        </span>

                                        {/* Details toggle button */}
                                        <button
                                            onClick={() => toggleExpand(inv.id)}
                                            className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-100 rounded-lg text-[10px] font-black inline-flex items-center gap-1 transition"
                                        >
                                            <span>{isExpanded ? 'إخفاء' : 'تفاصيل'}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Structured Details / Items Table (Collapsible) */}
                                {isExpanded && (
                                    <div className="p-3 animate-in fade-in duration-150 bg-slate-50/40 dark:bg-slate-900/40 space-y-2.5">
                                        {/* Statement / Notes Box */}
                                        <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs">
                                            <span className="font-black text-slate-500 dark:text-slate-400 block mb-0.5 text-[10px]">البيان المسجل:</span>
                                            <p className="font-bold text-slate-900 dark:text-slate-100 leading-relaxed text-xs">{inv.notes || inv.entry.title}</p>
                                        </div>

                                        {/* Items Table if available */}
                                        {hasItems && (
                                            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/60 p-2.5">
                                                <div className="text-[11px] font-black text-slate-700 dark:text-slate-300 mb-1.5">بنود وأصناف الفاتورة:</div>
                                                <table className="w-full text-right text-xs">
                                                    <thead>
                                                        <tr className="border-b border-slate-100 dark:border-slate-700 text-slate-400 text-[10px] font-bold">
                                                            <th className="pb-1.5 font-black">الصنف (فئة الكرت)</th>
                                                            <th className="pb-1.5 text-center font-black">الكمية</th>
                                                            <th className="pb-1.5 text-center font-black">سعر الوحدة</th>
                                                            <th className="pb-1.5 text-left font-black">الإجمالي</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-700/40">
                                                        {inv.items!.map((item, idx) => (
                                                            <tr key={idx} className="font-bold text-slate-800 dark:text-slate-200">
                                                                <td className="py-1.5 font-black text-slate-900 dark:text-white">{item.name}</td>
                                                                <td className="py-1.5 text-center font-mono font-black text-emerald-600">{item.quantity} كارت</td>
                                                                <td className="py-1.5 text-center font-mono text-slate-500">{item.unitPrice.toFixed(2)} ر.ي</td>
                                                                <td className="py-1.5 text-left font-mono font-black text-slate-950 dark:text-white">{item.total.toFixed(2)} ر.ي</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {/* Transaction Metadata Footer */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 text-[10px] text-slate-500 border-t border-slate-200 dark:border-slate-700/60">
                                            <div className="flex items-center gap-3">
                                                <span>المسؤول: <strong className="text-slate-800 dark:text-slate-200 font-black">{inv.userName}</strong></span>
                                                <span>التاريخ والوقت: <strong className="font-mono text-slate-800 dark:text-slate-200">{inv.dateTime}</strong></span>
                                            </div>
                                            <div className="font-black text-[11px] text-slate-900 dark:text-white font-mono">
                                                المبلغ الكلي: <span className={inv.isIncome ? 'text-emerald-600' : 'text-rose-600'}>{inv.amount.toFixed(2)} ريال يمني</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold mt-3">
                        <div className="text-slate-500 text-[11px]">
                            الصفحة <span className="font-black text-emerald-600">{currentPage}</span> من <span className="font-black">{totalPages}</span> ({filteredInvoices.length} حركة)
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg font-black text-slate-700 dark:text-slate-300 transition text-xs"
                            >
                                السابق
                            </button>
                            <span className="font-mono font-black px-1.5 text-xs">{currentPage} / {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg font-black text-slate-700 dark:text-slate-300 transition text-xs"
                            >
                                التالي
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
