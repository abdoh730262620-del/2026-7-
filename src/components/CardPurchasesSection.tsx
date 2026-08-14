import React, { useState } from 'react';
import { 
    Search, Calendar, FileText, Printer, ShoppingBag, X, Filter, 
    Eye, ChevronDown, ChevronUp, ArrowRight, CheckCircle2, User, Clock,
    DollarSign, Package
} from 'lucide-react';
import { CardPurchase } from '../types/cardTypes';
import { InvoicePdfInput } from '../lib/pdfHelper';
import { printReport, printInvoice } from '../lib/printHelper';

interface CardPurchasesSectionProps {
    purchases: CardPurchase[];
    onViewInvoice: (invoice: InvoicePdfInput) => void;
    onEditInvoice?: (invoice: GroupedPurchaseInvoice) => void;
    onCancelInvoice?: (invoice: GroupedPurchaseInvoice) => void;
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
    onBack,
    title = 'عرض وطباعة فواتير الشراء للموردين',
    subtitle = 'سجل فواتير مشتريات كروت الشبكة من الموردين، تفاصيل الأصناف والكميات والأسعار وطباعة PDF',
    appUser
}) => {
    const [searchText, setSearchText] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'credit'>('all');
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
            
            const key = p.invoiceNumber 
                ? `inv_${p.invoiceNumber}` 
                : `grp_${p.dateTime}_${p.supplierId || 'cash'}_${p.paymentType}`;

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

    // Filter Invoices based on search text, dates, payment type, and status
    const filteredInvoices = invoices.filter(inv => {
        if (paymentFilter === 'cash' && inv.paymentType !== 'cash') return false;
        if (paymentFilter === 'credit' && inv.paymentType !== 'credit') return false;

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
    const totalQtyBought = activeInvoices.reduce((sum, inv) => sum + inv.totalQuantity, 0);
    const cashTotal = activeInvoices.reduce((sum, inv) => inv.paymentType === 'cash' ? sum + inv.totalAmount : sum, 0);
    const creditTotal = activeInvoices.reduce((sum, inv) => inv.paymentType === 'credit' ? sum + inv.totalAmount : sum, 0);
    const overallTotal = cashTotal + creditTotal;

    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;
    const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handleExportPDF = () => {
        const titleText = `سجل فواتير مشتريات كروت الشبكة للموردين${startDate || endDate ? ` (الفترة: ${startDate || 'البداية'} إلى ${endDate || 'النهاية'})` : ''}`;
        const headers = ['رقم الفاتورة', 'المورد', 'عدد الأصناف', 'إجمالي الكروت', 'طريقة الدفع', 'المبلغ الإجمالي', 'التاريخ والوقت', 'الحالة'];
        const data = filteredInvoices.map(inv => [
            `#${inv.invoiceNumber}`,
            inv.supplierName,
            `${inv.items.length} صنف`,
            `${inv.totalQuantity} كارت`,
            inv.paymentType === 'cash' ? 'نقدي' : 'آجل',
            `${inv.totalAmount.toFixed(2)} ريال يمني`,
            inv.dateTime,
            inv.status === 'cancelled' ? 'ملغاة' : 'معتمدة'
        ]);
        
        data.push([
            'الإجمالي العام',
            `إجمالي فواتير: ${totalInvoicesCount}`,
            '-',
            `${totalQtyBought} كارت مشتريات`,
            `نقدي: ${cashTotal.toFixed(2)} | آجل: ${creditTotal.toFixed(2)}`,
            `${overallTotal.toFixed(2)} ريال يمني`,
            '-',
            '-'
        ]);

        printReport(titleText, headers, data);
    };

    const createInvoiceObj = (inv: GroupedPurchaseInvoice): InvoicePdfInput => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        type: 'purchase',
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
            sellerName: inv.userName || appUser?.name || 'النظام'
        };
        const itemObj = inv.items.map(it => ({
            name: `كروت فئة: ${it.categoryName}`,
            quantity: it.quantity,
            price: it.unitPrice
        }));
        await printInvoice(invObj, 'card_purchase', itemObj, 'ريال يمني');
    };

    return (
        <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-200 text-right" dir="rtl">
            {/* Header & Controls */}
            <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                <div className="flex items-center gap-2.5">
                    {onBack && (
                        <button
                            onClick={onBack}
                            title="العودة لقائمة أقسام الموردين"
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl transition"
                        >
                            <ArrowRight size={20} />
                        </button>
                    )}
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
                                {overallTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                            </span>
                        </div>
                        <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 mt-0.5">
                            {subtitle}
                        </p>
                    </div>
                </div>
                
                {/* Compact Icon Buttons Toolbar (Side-by-side) */}
                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                    {/* Filter Toggle Icon Button */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        title="تصفية وفلترة الفواتير"
                        aria-label="تصفية وفلترة"
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl relative flex items-center justify-center transition border ${
                            showFilters || startDate || endDate || searchText || paymentFilter !== 'all' || statusFilter !== 'all'
                                ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                        }`}
                    >
                        <Filter size={17} />
                        {(startDate || endDate || searchText || paymentFilter !== 'all' || statusFilter !== 'all') && (
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
                <div className="bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-2xl border border-blue-200 dark:border-blue-900/50 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 animate-in slide-in-from-top-1 duration-150">
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

            {/* Quick Statistics Cards (4 Grid Cards matching Cashbox) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">إجمالي الفواتير</span>
                    <div className="text-sm sm:text-base font-black text-slate-950 dark:text-white mt-0.5">{totalInvoicesCount} فاتورة</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">إجمالي الكروت المشتراة</span>
                    <div className="text-sm sm:text-base font-black text-blue-600 dark:text-blue-400 mt-0.5">
                        +{totalQtyBought.toLocaleString('en-US')} كارت
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">مشتريات نقدية</span>
                    <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {cashTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">مشتريات آجلة</span>
                    <div className="text-sm sm:text-base font-black text-amber-600 dark:text-amber-400 mt-0.5">
                        {creditTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                    </div>
                </div>
            </div>

            {/* Invoices List with Collapsible Structured Tables per Invoice */}
            <div className="space-y-2.5">
                {paginatedInvoices.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-8 sm:p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs space-y-2">
                        <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={32} />
                        <p>لا توجد فواتير مشتريات مطابقة لمعايير البحث.</p>
                    </div>
                ) : (
                    paginatedInvoices.map((inv) => {
                        const isExpanded = !!expandedInvoices[inv.id];
                        const isCancelled = inv.status === 'cancelled';

                        return (
                            <div 
                                key={inv.id}
                                className={`bg-white dark:bg-slate-900 rounded-2xl border transition shadow-sm overflow-hidden ${
                                    isExpanded 
                                        ? 'border-blue-400 dark:border-blue-600 ring-2 ring-blue-500/10' 
                                        : 'border-slate-200 dark:border-slate-800 hover:border-blue-300'
                                }`}
                            >
                                {/* Invoice Header Bar (Clickable to Expand/Collapse) */}
                                <div 
                                    onClick={() => toggleExpand(inv.id)}
                                    className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer select-none"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </div>

                                        {/* Invoice Number Tag */}
                                        <span className="px-2.5 py-0.5 font-mono font-black text-[11px] rounded-lg shadow-xs text-white bg-blue-600">
                                            #{inv.invoiceNumber}
                                        </span>

                                        <div>
                                            <h4 className="font-black text-slate-900 dark:text-white text-xs flex items-center gap-1.5 flex-wrap">
                                                <span>{inv.supplierName}</span>
                                                <span className="text-[9px] text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-900/40">
                                                    +{inv.totalQuantity} كارت
                                                </span>
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
                                            <span className={`font-black text-xs block ${isCancelled ? 'text-slate-400 line-through' : 'text-blue-600 dark:text-blue-400'}`}>
                                                {inv.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                                            </span>
                                        </div>

                                        {/* Badges */}
                                        <div className="flex items-center gap-1">
                                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                                                inv.paymentType === 'cash'
                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                            }`}>
                                                {inv.paymentType === 'cash' ? 'نقدي' : 'آجل'}
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
                                                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1 shadow-sm shadow-blue-600/20 active:scale-95 transition"
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
                                                    <X size={13} />
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
                                                        <th className="pb-2.5 text-center">الكمية المشتراة</th>
                                                        <th className="pb-2.5 text-center">سعر الشراء / التكلفة</th>
                                                        <th className="pb-2.5 text-left">الإجمالي الصافي</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
                                                    {inv.items.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                                                            <td className="py-2.5 font-black text-slate-900 dark:text-white flex items-center gap-2">
                                                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                                                <span>{item.categoryName}</span>
                                                            </td>
                                                            <td className="py-2.5 text-center font-mono font-black text-blue-600 dark:text-blue-400">
                                                                +{item.quantity.toLocaleString('en-US')} كارت
                                                            </td>
                                                            <td className="py-2.5 text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                                                                {item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                                                            </td>
                                                            <td className="py-2.5 text-left font-mono font-black text-slate-900 dark:text-white">
                                                                {item.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Invoice Total Footer */}
                                        <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs">
                                            <div className="flex items-center gap-3 text-slate-500 font-bold text-[11px]">
                                                <span>إجمالي كمية الفاتورة: <strong className="text-blue-600 font-black font-mono">+{inv.totalQuantity}</strong> كارت</span>
                                                <span>•</span>
                                                <span>المورد: <strong className="text-slate-800 dark:text-white font-black">{inv.supplierName}</strong></span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-500 text-[11px]">صافي الفاتورة الإجمالي:</span>
                                                <span className="font-black text-sm text-blue-600 dark:text-blue-400 font-mono">
                                                    {inv.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ريال يمني
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
                    <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold mt-3">
                        <div className="text-slate-500">
                            عرض الصفحة <span className="font-black text-blue-600">{currentPage}</span> من <span className="font-black">{totalPages}</span> (إجمالي {filteredInvoices.length} فاتورة)
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-xl font-black text-slate-700 dark:text-slate-300 transition cursor-pointer"
                            >
                                السابق
                            </button>
                            <span className="font-mono font-black px-2">{currentPage} / {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-xl font-black text-slate-700 dark:text-slate-300 transition cursor-pointer"
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

