import React, { useState } from 'react';
import { 
    Search, Calendar, FileText, Printer, ShoppingBag, X, Filter, 
    Eye, ChevronDown, ChevronUp, ArrowRight, CheckCircle2, User, Clock,
    DollarSign, Package, RotateCcw, Plus, RefreshCw
} from 'lucide-react';
import { CardPurchase } from '../types/cardTypes';
import { InvoicePdfInput } from '../lib/pdfHelper';
import { printReport, printInvoice } from '../lib/printHelper';

interface CardPurchasesSectionProps {
    purchases: CardPurchase[];
    onViewInvoice: (invoice: InvoicePdfInput) => void;
    onEditInvoice?: (invoice: GroupedPurchaseInvoice) => void;
    onCancelInvoice?: (invoice: GroupedPurchaseInvoice) => void;
    onOpenAddStock?: () => void;
    onOpenExchangeStock?: () => void;
    onBack?: () => void;
    title?: string;
    subtitle?: string;
    appUser: any;
}

export interface GroupedPurchaseInvoice {
    id: string;
    docIds: string[];
    invoiceNumber: string;
    rawInvoiceNumber?: string;
    supplierId: string;
    supplierName: string;
    paymentType: 'cash' | 'credit';
    dateTime: string;
    date: string;
    userName: string;
    isReturn?: boolean;
    items: {
        categoryName: string;
        quantity: number;
        unitPrice: number;
        totalAmount: number;
    }[];
    totalAmount: number;
    totalQuantity: number;
    status?: string;
    cancelledBy?: string;
    cancelledAt?: number;
}

export const CardPurchasesSection: React.FC<CardPurchasesSectionProps> = ({
    purchases,
    onViewInvoice,
    onEditInvoice,
    onCancelInvoice,
    onOpenAddStock,
    onOpenExchangeStock,
    onBack,
    title = 'عرض وطباعة فواتير الشراء والمردودات للموردين',
    subtitle = 'سجل فواتير مشتريات ومردودات كروت الشبكة من وإلى الموردين، تفاصيل الأصناف والكميات والأسعار وطباعة PDF',
    appUser
}) => {
    const [searchText, setSearchText] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'credit'>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'purchase' | 'return'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
    const [showFilters, setShowFilters] = useState(false);
    const [expandedInvoices, setExpandedInvoices] = useState<{ [key: string]: boolean }>({});
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const toggleExpand = (id: string) => {
        setExpandedInvoices(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Ensure pure numeric invoice number
    const getNumericInvoiceNumber = (invStr: string | undefined, id: string): string => {
        if (!invStr) {
            const digits = id.replace(/\D/g, '');
            return digits ? digits.slice(-5) : '2001';
        }
        const digits = invStr.replace(/\D/g, '');
        return digits || '2001';
    };

    // Group purchases into logical invoices
    const groupPurchasesToInvoices = (): GroupedPurchaseInvoice[] => {
        const groupedMap: { [key: string]: GroupedPurchaseInvoice } = {};

        purchases.forEach(p => {
            const dateOnly = p.date || (p.dateTime && p.dateTime.split(' ')[0]) || '';
            const invNumber = getNumericInvoiceNumber(p.invoiceNumber, p.id);
            const isReturn = !!(p.isReturn || p.purchaseType === 'supplier_return' || (p.quantity && p.quantity < 0) || (p.totalAmount && p.totalAmount < 0));
            
            const key = p.invoiceNumber 
                ? `inv_${p.invoiceNumber}_${isReturn ? 'ret' : 'pur'}_${p.status || 'completed'}` 
                : `grp_${p.dateTime}_${p.supplierId || 'cash'}_${p.paymentType}_${isReturn ? 'ret' : 'pur'}_${p.status || 'completed'}`;

            if (!groupedMap[key]) {
                groupedMap[key] = {
                    id: p.id,
                    docIds: [p.id],
                    invoiceNumber: invNumber,
                    rawInvoiceNumber: p.invoiceNumber || '',
                    supplierId: p.supplierId || '',
                    supplierName: p.supplierName || 'مورد نقدي / عام',
                    paymentType: p.paymentType || 'cash',
                    dateTime: p.dateTime || p.date || '',
                    date: dateOnly,
                    userName: p.userName || 'النظام',
                    isReturn,
                    status: p.status || 'completed',
                    cancelledBy: p.cancelledBy,
                    cancelledAt: p.cancelledAt,
                    items: [],
                    totalAmount: 0,
                    totalQuantity: 0
                };
            } else {
                if (!groupedMap[key].docIds.includes(p.id)) {
                    groupedMap[key].docIds.push(p.id);
                }
                if (p.status === 'cancelled') {
                    groupedMap[key].status = 'cancelled';
                    if (p.cancelledBy) groupedMap[key].cancelledBy = p.cancelledBy;
                    if (p.cancelledAt) groupedMap[key].cancelledAt = p.cancelledAt;
                }
                if (isReturn) groupedMap[key].isReturn = true;
            }

            const qty = Math.abs(p.quantity || 0);
            const net = Math.abs(p.totalAmount || 0);
            const price = p.unitPrice || (qty ? (net / qty) : 0);

            groupedMap[key].items.push({
                categoryName: p.categoryName || 'كروت فئة',
                quantity: qty,
                unitPrice: price,
                totalAmount: net
            });

            groupedMap[key].totalAmount += net;
            groupedMap[key].totalQuantity += qty;
        });

        return Object.values(groupedMap).sort((a, b) => b.dateTime.localeCompare(a.dateTime));
    };

    const invoices = groupPurchasesToInvoices();

    // Filter Invoices based on search text, dates, payment type, type (purchase/return), and status
    const filteredInvoices = invoices.filter(inv => {
        if (paymentFilter === 'cash' && inv.paymentType !== 'cash') return false;
        if (paymentFilter === 'credit' && inv.paymentType !== 'credit') return false;

        if (typeFilter === 'purchase' && inv.isReturn) return false;
        if (typeFilter === 'return' && !inv.isReturn) return false;

        if (statusFilter === 'completed' && inv.status === 'cancelled') return false;
        if (statusFilter === 'cancelled' && inv.status !== 'cancelled') return false;

        if (searchText.trim()) {
            const q = searchText.toLowerCase();
            const matchesText = 
                inv.invoiceNumber.toLowerCase().includes(q) ||
                inv.supplierName.toLowerCase().includes(q) ||
                inv.items.some(it => it.categoryName.toLowerCase().includes(q)) ||
                inv.userName.toLowerCase().includes(q);
            
            if (!matchesText) return false;
        }

        if (startDate && inv.date && inv.date < startDate) return false;
        if (endDate && inv.date && inv.date > endDate) return false;

        return true;
    });

    const activeInvoices = filteredInvoices.filter(inv => inv.status !== 'cancelled');
    const totalInvoicesCount = activeInvoices.length;
    const purchasesOnly = activeInvoices.filter(inv => !inv.isReturn);
    const returnsOnly = activeInvoices.filter(inv => inv.isReturn);

    const totalQtyBought = purchasesOnly.reduce((sum, inv) => sum + inv.totalQuantity, 0);
    const totalQtyReturned = returnsOnly.reduce((sum, inv) => sum + inv.totalQuantity, 0);
    const netPurchasesQty = totalQtyBought - totalQtyReturned;

    const cashPurchases = purchasesOnly.filter(i => i.paymentType === 'cash').reduce((sum, i) => sum + i.totalAmount, 0);
    const cashReturns = returnsOnly.filter(i => i.paymentType === 'cash').reduce((sum, i) => sum + i.totalAmount, 0);
    const netCashTotal = cashPurchases - cashReturns;

    const creditPurchases = purchasesOnly.filter(i => i.paymentType === 'credit').reduce((sum, i) => sum + i.totalAmount, 0);
    const creditReturns = returnsOnly.filter(i => i.paymentType === 'credit').reduce((sum, i) => sum + i.totalAmount, 0);
    const netCreditTotal = creditPurchases - creditReturns;

    const overallTotal = netCashTotal + netCreditTotal;

    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;
    const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handleExportPDF = () => {
        const titleText = `سجل فواتير مشتريات ومردودات كروت الشبكة للموردين${startDate || endDate ? ` (الفترة: ${startDate || 'البداية'} إلى ${endDate || 'النهاية'})` : ''}`;
        const headers = ['رقم الفاتورة', 'النوع', 'المورد', 'عدد الأصناف', 'إجمالي الكروت', 'طريقة الدفع', 'المبلغ الإجمالي', 'التاريخ والوقت', 'الحالة'];
        const data = filteredInvoices.map(inv => [
            `#${inv.invoiceNumber}`,
            inv.isReturn ? 'مردودات مشتريات' : 'فاتورة مشتريات',
            inv.supplierName,
            `${inv.items.length} صنف`,
            `${inv.isReturn ? '-' : '+'}${inv.totalQuantity} كارت`,
            inv.paymentType === 'cash' ? (inv.isReturn ? 'استرداد نقدي' : 'نقدي') : (inv.isReturn ? 'خصم آجل' : 'آجل'),
            `${inv.isReturn ? '-' : ''}${inv.totalAmount.toFixed(2)} ريال يمني`,
            inv.dateTime,
            inv.status === 'cancelled' ? 'ملغاة' : 'معتمدة'
        ]);
        
        data.push([
            'الإجمالي الصافي',
            '-',
            `إجمالي فواتير: ${totalInvoicesCount}`,
            '-',
            `صافي: ${netPurchasesQty} كارت (${totalQtyBought} شراء / ${totalQtyReturned} مردود)`,
            `صافي نقدي: ${netCashTotal.toFixed(2)} | صافي آجل: ${netCreditTotal.toFixed(2)}`,
            `${overallTotal.toFixed(2)} ريال يمني`,
            '-',
            '-'
        ]);

        printReport(titleText, headers, data);
    };

    const createInvoiceObj = (inv: GroupedPurchaseInvoice): InvoicePdfInput => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        type: inv.isReturn ? 'purchase_return' : 'purchase',
        isReturn: inv.isReturn,
        totalAmount: inv.totalAmount,
        paymentType: inv.paymentType,
        partyName: inv.supplierName,
        dateTime: inv.dateTime,
        userName: inv.userName,
        status: inv.status,
        cancelledBy: inv.cancelledBy,
        cancelledAt: inv.cancelledAt,
        items: inv.items.map(it => ({
            categoryName: it.categoryName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalAmount: it.totalAmount
        }))
    });

    const handleDirectPrintInvoice = async (inv: GroupedPurchaseInvoice) => {
        const invObj = {
            invoiceNumber: inv.invoiceNumber,
            supplierName: inv.supplierName,
            supplierId: inv.supplierId,
            total: inv.totalAmount,
            paidAmount: inv.paymentType === 'cash' ? inv.totalAmount : 0,
            paymentType: inv.paymentType,
            date: inv.dateTime,
            sellerName: inv.userName || appUser?.name || 'النظام',
            isReturn: inv.isReturn
        };
        const itemObj = inv.items.map(it => ({
            name: `${inv.isReturn ? 'مردودات كروت فئة' : 'كروت فئة'}: ${it.categoryName}`,
            quantity: it.quantity,
            price: it.unitPrice
        }));
        await printInvoice(invObj, inv.isReturn ? 'card_purchase_return' : 'card_purchase', itemObj, 'ريال يمني');
    };

    return (
        <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-200 text-right" dir="rtl">
            {/* Header & Controls */}
            <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900/50 shrink-0">
                        <ShoppingBag size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">{title}</h2>
                            <span className="px-2.5 py-0.5 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-[11px] font-black font-mono rounded-lg">
                                {totalInvoicesCount} فاتورة
                            </span>
                            <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-black font-mono rounded-lg">
                                صافي: {overallTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                            </span>
                        </div>
                        <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 mt-0.5">
                            {subtitle}
                        </p>
                    </div>
                </div>
                
                {/* Action Buttons & Compact Icon Toolbar (Side-by-side) */}
                <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                    {/* Action Button 1: إضافة رصيد كروت جديد */}
                    {onOpenAddStock && (
                        <button
                            type="button"
                            onClick={onOpenAddStock}
                            className="h-9 sm:h-10 px-3 sm:px-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl shadow-sm text-xs font-black flex items-center gap-1.5 transition border border-indigo-500 whitespace-nowrap"
                            title="إضافة رصيد كروت جديد من الموردين"
                        >
                            <Plus size={16} />
                            <span>إضافة رصيد كروت جديد</span>
                        </button>
                    )}

                    {/* Action Button 2: استبدال كروت المخزون */}
                    {onOpenExchangeStock && (
                        <button
                            type="button"
                            onClick={onOpenExchangeStock}
                            className="h-9 sm:h-10 px-3 sm:px-3.5 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 active:scale-95 rounded-xl text-xs font-black flex items-center gap-1.5 transition border border-purple-200 dark:border-purple-800 whitespace-nowrap"
                            title="استبدال كروت المخزون وحساب الفارق المالي"
                        >
                            <RefreshCw size={15} />
                            <span>استبدال كروت المخزون</span>
                        </button>
                    )}

                    {/* Filter Toggle Icon Button */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        title="تصفية وفلترة الفواتير"
                        aria-label="تصفية وفلترة"
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl relative flex items-center justify-center transition border ${
                            showFilters || startDate || endDate || searchText || paymentFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all'
                                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                        }`}
                    >
                        <Filter size={17} />
                        {(startDate || endDate || searchText || paymentFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all') && (
                            <span className="w-2 h-2 rounded-full bg-amber-300 absolute top-1.5 right-1.5 border border-blue-600"></span>
                        )}
                    </button>

                    {/* Export PDF Icon Button */}
                    <button
                        onClick={handleExportPDF}
                        disabled={filteredInvoices.length === 0}
                        title="طباعة وتصدير كشف الفواتير PDF"
                        aria-label="طباعة وتصدير كشف PDF"
                        className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 active:scale-95 text-white rounded-xl shadow-sm flex items-center justify-center transition border border-slate-700"
                    >
                        <Printer size={17} />
                    </button>
                </div>
            </div>

            {/* Compact Toggleable Filter Panel */}
            {showFilters && (
                <div className="bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-2xl border border-blue-200 dark:border-blue-900/50 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 animate-in slide-in-from-top-1 duration-150">
                    <div className="relative sm:col-span-2">
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="بحث: اسم المورد، رقم الفاتورة، فئة الكرت..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full pr-8 pl-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white"
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
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white cursor-pointer"
                        >
                            <option value="all">كل الفواتير (شراء ومردودات)</option>
                            <option value="purchase">فواتير شراء فقط</option>
                            <option value="return">فواتير مردودات فقط</option>
                        </select>
                    </div>

                    <div>
                        <select
                            value={paymentFilter}
                            onChange={(e) => setPaymentFilter(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white cursor-pointer"
                        >
                            <option value="all">جميع طرق الدفع</option>
                            <option value="cash">فواتير نقدية</option>
                            <option value="credit">فواتير آجلة</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            title="من تاريخ"
                            className="w-1/2 px-2 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white"
                        />
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            title="إلى تاريخ"
                            className="w-1/2 px-2 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-[11px] font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white"
                        />
                    </div>
                </div>
            )}

            {/* Quick Statistics Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">إجمالي الفواتير</span>
                    <div className="text-sm sm:text-base font-black text-slate-950 dark:text-white mt-0.5">
                        {totalInvoicesCount} فاتورة
                        {returnsOnly.length > 0 && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 mr-1.5 font-bold">
                                ({returnsOnly.length} مرتجع)
                            </span>
                        )}
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">صافي كمية الكروت</span>
                    <div className="text-sm sm:text-base font-black text-blue-600 dark:text-blue-400 mt-0.5">
                        {netPurchasesQty > 0 ? `+${netPurchasesQty.toLocaleString('en-US')}` : netPurchasesQty.toLocaleString('en-US')} كارت
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">صافي المشتريات النقدية</span>
                    <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {netCashTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">صافي المشتريات الآجلة</span>
                    <div className="text-sm sm:text-base font-black text-amber-600 dark:text-amber-400 mt-0.5">
                        {netCreditTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                    </div>
                </div>
            </div>

            {/* Invoices List with Collapsible Structured Tables per Invoice */}
            <div className="space-y-2.5">
                {paginatedInvoices.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs space-y-2">
                        <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={32} />
                        <p>لا توجد فواتير مطابقة لمعايير البحث.</p>
                    </div>
                ) : (
                    paginatedInvoices.map((inv) => {
                        const isExpanded = !!expandedInvoices[inv.id];
                        const isCancelled = inv.status === 'cancelled';
                        const isRet = !!inv.isReturn;

                        return (
                            <div 
                                key={inv.id}
                                className={`bg-white dark:bg-slate-900 rounded-2xl border transition shadow-sm overflow-hidden ${
                                    isExpanded 
                                        ? (isRet ? 'border-amber-400 dark:border-amber-600 ring-2 ring-amber-500/10' : 'border-blue-400 dark:border-blue-600 ring-2 ring-blue-500/10')
                                        : 'border-slate-200 dark:border-slate-800 hover:border-blue-300'
                                }`}
                            >
                                {/* Invoice Header Bar (Clickable to Expand/Collapse) */}
                                <div 
                                    onClick={() => toggleExpand(inv.id)}
                                    className={`p-3 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer select-none ${
                                        isRet ? 'bg-amber-50/40 dark:bg-amber-950/20' : 'bg-slate-50 dark:bg-slate-800/50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className={`p-1 rounded-lg ${
                                            isRet 
                                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' 
                                                : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                        }`}>
                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </div>

                                        {/* Invoice Number Tag */}
                                        <span className={`px-2.5 py-0.5 font-mono font-black text-[11px] rounded-lg shadow-xs text-white ${
                                            isRet ? 'bg-amber-600' : 'bg-blue-600'
                                        }`}>
                                            #{inv.invoiceNumber}
                                        </span>

                                        <div>
                                            <h4 className="font-black text-slate-900 dark:text-white text-xs flex items-center gap-1.5 flex-wrap">
                                                <span>{inv.supplierName}</span>
                                                {isRet ? (
                                                    <span className="text-[9px] text-amber-700 dark:text-amber-300 font-black bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded-lg border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                                                        <RotateCcw size={10} />
                                                        مردودات مشتريات (-{inv.totalQuantity} كارت)
                                                    </span>
                                                ) : (
                                                    <span className="text-[9px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-900/40">
                                                        +{inv.totalQuantity} كارت
                                                    </span>
                                                )}
                                                <span className="text-[9px] text-slate-400 font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                    {inv.items.length} صنف
                                                </span>
                                            </h4>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium mt-0.5">
                                                <span className="flex items-center gap-1"><Clock size={11} /> {inv.dateTime}</span>
                                                <span>•</span>
                                                <span className="flex items-center gap-1"><User size={11} /> {inv.userName}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Price & Action Buttons */}
                                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end" onClick={(e) => e.stopPropagation()}>
                                        <div className="text-left font-mono">
                                            <span className={`font-black text-xs block ${
                                                isCancelled 
                                                    ? 'text-slate-400 line-through' 
                                                    : (isRet ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400')
                                            }`}>
                                                {isRet ? '-' : ''}{inv.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                                            </span>
                                        </div>

                                        {/* Badges */}
                                        <div className="flex items-center gap-1">
                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                                                inv.paymentType === 'cash'
                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                            }`}>
                                                {inv.paymentType === 'cash' ? (isRet ? 'استرداد نقدي' : 'نقدي') : (isRet ? 'خصم آجل' : 'آجل')}
                                            </span>

                                            {isCancelled && (
                                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                                    ملغاة
                                                </span>
                                            )}
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex items-center gap-1">
                                            {/* Direct Print Button */}
                                            <button
                                                onClick={() => handleDirectPrintInvoice(inv)}
                                                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1 shadow-sm active:scale-95 transition"
                                                title="طباعة الفاتورة PDF مباشرة"
                                            >
                                                <Printer size={12} />
                                                <span className="hidden xs:inline">طباعة</span>
                                            </button>

                                            {/* View / Modal Button */}
                                            <button
                                                onClick={() => onViewInvoice(createInvoiceObj(inv))}
                                                className={`px-2.5 py-1.5 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1 shadow-sm active:scale-95 transition ${
                                                    isRet 
                                                        ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20' 
                                                        : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'
                                                }`}
                                                title="معاينة ومشاركة الفاتورة"
                                            >
                                                <Eye size={12} />
                                                <span>معاينة</span>
                                            </button>

                                            {onEditInvoice && !isCancelled && (
                                                <button
                                                    onClick={() => onEditInvoice(inv)}
                                                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-[10px] font-black inline-flex items-center gap-1 active:scale-95 transition"
                                                >
                                                    <span>تعديل</span>
                                                </button>
                                            )}

                                            {onCancelInvoice && !isCancelled && (
                                                <button
                                                    onClick={() => onCancelInvoice(inv)}
                                                    className="p-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 rounded-xl text-[10px] font-black transition"
                                                    title="إلغاء الفاتورة"
                                                >
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Structured Items Table (Collapsible) */}
                                {isExpanded && (
                                    <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 animate-in fade-in duration-150">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-right text-xs">
                                                <thead>
                                                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[11px] font-black">
                                                        <th className="pb-2.5">فئة الكرت / الصنف</th>
                                                        <th className="pb-2.5 text-center">{isRet ? 'الكمية المرتجعة' : 'الكمية المشتراة'}</th>
                                                        <th className="pb-2.5 text-center">سعر الوحدة / التكلفة</th>
                                                        <th className="pb-2.5 text-left">الإجمالي الفرعي</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
                                                    {inv.items.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                                                            <td className="py-2.5 font-black text-slate-900 dark:text-white flex items-center gap-2">
                                                                <span className={`w-2 h-2 rounded-full ${isRet ? 'bg-amber-500' : 'bg-blue-500'}`}></span>
                                                                <span>{item.categoryName}</span>
                                                            </td>
                                                            <td className={`py-2.5 text-center font-mono font-black ${isRet ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                                                {isRet ? `-${item.quantity.toLocaleString('en-US')}` : `+${item.quantity.toLocaleString('en-US')}`} كارت
                                                            </td>
                                                            <td className="py-2.5 text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                                                                {item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                                                            </td>
                                                            <td className="py-2.5 text-left font-mono font-black text-slate-900 dark:text-white">
                                                                {isRet ? '-' : ''}{item.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Invoice Total Footer */}
                                        <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs">
                                            <div className="flex items-center gap-3 text-slate-500 font-bold text-[11px]">
                                                <span>{isRet ? 'إجمالي الكمية المرتجعة:' : 'إجمالي كمية الفاتورة:'} <strong className={`font-black font-mono ${isRet ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>{isRet ? `-${inv.totalQuantity}` : `+${inv.totalQuantity}`}</strong> كارت</span>
                                                <span>•</span>
                                                <span>المورد: <strong className="text-slate-800 dark:text-white font-black">{inv.supplierName}</strong></span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-500 text-[11px]">{isRet ? 'إجمالي قيمة المردودات:' : 'صافي الفاتورة الإجمالي:'}</span>
                                                <span className={`font-black text-sm font-mono ${isRet ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                                    {isRet ? '-' : ''}{inv.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال يمني
                                                </span>
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
                    <div className="flex flex-row items-center justify-between bg-white dark:bg-slate-900 px-3 py-1 my-0 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold whitespace-nowrap gap-2">
                        <div className="text-slate-500 whitespace-nowrap">
                            عرض الصفحة <span className="font-black text-blue-600">{currentPage}</span> من <span className="font-black">{totalPages}</span> (إجمالي {filteredInvoices.length} فاتورة)
                        </div>
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg font-black text-slate-700 dark:text-slate-300 transition cursor-pointer text-xs"
                            >
                                السابق
                            </button>
                            <span className="font-mono font-black px-1.5">{currentPage} / {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg font-black text-slate-700 dark:text-slate-300 transition cursor-pointer text-xs"
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

export default CardPurchasesSection;
