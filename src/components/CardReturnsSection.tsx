import React, { useState } from 'react';
import { 
    Search, Calendar, FileText, Printer, RotateCcw, X, Filter, 
    Eye, ChevronDown, ChevronUp, ArrowRight, CheckCircle2, User, Clock,
    DollarSign, Package, AlertTriangle, Plus, ArrowDownRight, Wallet, Receipt
} from 'lucide-react';
import { CardPurchase, CardCategory, CardSupplier } from '../types/cardTypes';
import { InvoicePdfInput } from '../lib/pdfHelper';
import { printReport, printInvoice } from '../lib/printHelper';
import SearchableSelect from './SearchableSelect';

interface CardReturnsSectionProps {
    purchases: CardPurchase[];
    categories: CardCategory[];
    suppliers: CardSupplier[];
    onViewInvoice: (invoice: InvoicePdfInput) => void;
    onCancelInvoice?: (invoice: GroupedReturnInvoice) => void;
    onOpenMultiReturnModal?: () => void;
    onSaveQuickReturn?: (data: {
        supplierId: string;
        categoryId: string;
        quantity: number;
        costPrice: number;
        paymentMethod: 'cash' | 'credit';
        notes: string;
    }) => Promise<void>;
    onBack?: () => void;
    appUser: any;
    canAdd?: boolean;
    cashboxBalance?: number;
}

export interface GroupedReturnInvoice {
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
    notes?: string;
    status?: string;
    cancelledBy?: string;
    cancelledAt?: number;
}

export const CardReturnsSection: React.FC<CardReturnsSectionProps> = ({
    purchases,
    categories,
    suppliers,
    onViewInvoice,
    onCancelInvoice,
    onOpenMultiReturnModal,
    onSaveQuickReturn,
    onBack,
    appUser,
    canAdd = true,
    cashboxBalance = 0
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

    // Extract pure numeric invoice number
    const getNumericInvoiceNumber = (invStr: string | undefined, id: string): string => {
        if (!invStr) {
            const digits = id.replace(/\D/g, '');
            return digits ? digits.slice(-5) : '2001';
        }
        const digits = invStr.replace(/\D/g, '');
        return digits || '2001';
    };

    // Filter purchases that are strictly returns
    const returnPurchases = purchases.filter(p => 
        p.isReturn === true || 
        p.purchaseType === 'supplier_return' || 
        (p.quantity !== undefined && p.quantity < 0) || 
        (p.totalAmount !== undefined && p.totalAmount < 0)
    );

    // Group returns into logical invoices
    const groupReturnsToInvoices = (): GroupedReturnInvoice[] => {
        const groupedMap: { [key: string]: GroupedReturnInvoice } = {};

        returnPurchases.forEach(p => {
            const dateOnly = p.date || (p.dateTime && p.dateTime.split(' ')[0]) || '';
            const invNumber = getNumericInvoiceNumber(p.invoiceNumber, p.id);
            
            const key = p.invoiceNumber 
                ? `ret_${p.invoiceNumber}_${p.status || 'completed'}` 
                : `ret_${p.dateTime}_${p.supplierId || 'cash'}_${p.paymentType}_${p.status || 'completed'}`;

            if (!groupedMap[key]) {
                groupedMap[key] = {
                    id: p.id,
                    docIds: [p.id],
                    invoiceNumber: invNumber,
                    rawInvoiceNumber: p.invoiceNumber || '',
                    supplierId: p.supplierId || '',
                    supplierName: p.supplierName || 'مورد عام',
                    paymentType: p.paymentType || 'cash',
                    dateTime: p.dateTime || p.date || '',
                    date: dateOnly,
                    userName: p.userName || 'النظام',
                    notes: p.notes,
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

    const invoices = groupReturnsToInvoices();

    // Filter Returns based on search text, dates, payment type, and status
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
                inv.userName.toLowerCase().includes(q) ||
                (inv.notes && inv.notes.toLowerCase().includes(q));
            
            if (!matchesText) return false;
        }

        if (startDate && inv.date && inv.date < startDate) return false;
        if (endDate && inv.date && inv.date > endDate) return false;

        return true;
    });

    const activeInvoices = filteredInvoices.filter(inv => inv.status !== 'cancelled');
    const totalInvoicesCount = activeInvoices.length;
    const totalQtyReturned = activeInvoices.reduce((sum, inv) => sum + inv.totalQuantity, 0);
    const cashReturns = activeInvoices.filter(i => i.paymentType === 'cash').reduce((sum, i) => sum + i.totalAmount, 0);
    const creditReturns = activeInvoices.filter(i => i.paymentType === 'credit').reduce((sum, i) => sum + i.totalAmount, 0);
    const totalReturnsValue = cashReturns + creditReturns;

    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;
    const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handleExportPDF = () => {
        const titleText = `سجل فواتير مردودات مشتريات كروت الشبكة للموردين${startDate || endDate ? ` (الفترة: ${startDate || 'البداية'} إلى ${endDate || 'النهاية'})` : ''}`;
        const headers = ['رقم الفاتورة', 'المورد', 'الأصناف المسترجعة', 'إجمالي الكروت', 'طريقة الاسترداد', 'المبلغ المسترد', 'التاريخ والوقت', 'الحالة'];
        const data = filteredInvoices.map(inv => [
            `#${inv.invoiceNumber}`,
            inv.supplierName,
            inv.items.map(it => `${it.categoryName} (${it.quantity})`).join('، '),
            `-${inv.totalQuantity} كارت`,
            inv.paymentType === 'cash' ? 'استرداد نقدي للصندوق' : 'خصم من دين المورد',
            `-${inv.totalAmount.toFixed(2)} ريال يمني`,
            inv.dateTime,
            inv.status === 'cancelled' ? 'ملغاة' : 'معتمدة'
        ]);
        
        data.push([
            'الإجمالي',
            `فواتير معتمدة: ${totalInvoicesCount}`,
            '-',
            `-${totalQtyReturned} كارت`,
            `نقدي: ${cashReturns.toFixed(2)} | آجل: ${creditReturns.toFixed(2)}`,
            `-${totalReturnsValue.toFixed(2)} ريال يمني`,
            '-',
            '-'
        ]);

        printReport(titleText, headers, data);
    };

    const createInvoiceObj = (inv: GroupedReturnInvoice): InvoicePdfInput => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        type: 'purchase_return',
        isReturn: true,
        totalAmount: inv.totalAmount,
        paymentType: inv.paymentType,
        partyName: inv.supplierName,
        dateTime: inv.dateTime,
        userName: inv.userName,
        status: inv.status,
        notes: inv.notes,
        cancelledBy: inv.cancelledBy,
        cancelledAt: inv.cancelledAt,
        items: inv.items.map(it => ({
            categoryName: it.categoryName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalAmount: it.totalAmount
        }))
    });

    const handleDirectPrintInvoice = async (inv: GroupedReturnInvoice) => {
        const invObj = {
            invoiceNumber: inv.invoiceNumber,
            supplierName: inv.supplierName,
            supplierId: inv.supplierId,
            total: inv.totalAmount,
            paidAmount: inv.paymentType === 'cash' ? inv.totalAmount : 0,
            paymentType: inv.paymentType,
            date: inv.dateTime,
            sellerName: inv.userName || appUser?.name || 'النظام',
            isReturn: true,
            notes: inv.notes || 'فاتورة مردودات مشتريات كروت للمورد'
        };
        const itemObj = inv.items.map(it => ({
            name: `مردودات كروت: ${it.categoryName}`,
            quantity: it.quantity,
            price: it.unitPrice
        }));
        await printInvoice(invObj, 'card_purchase_return', itemObj, 'ريال يمني');
    };

    return (
        <div className="space-y-6 dir-rtl text-right font-sans" dir="rtl">
            {/* Top Bar / Header */}
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-100 dark:border-rose-900/50 shrink-0">
                        <RotateCcw size={24} />
                    </div>
                    <div>
                        <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                            قسم مردودات مشتريات الكروت للموردين
                        </h2>
                        <p className="text-xs font-bold text-slate-400 mt-0.5">
                            سجل مستقل لإصدار واستعراض وطباعة فواتير استرجاع الكروت للموردين وخصمها من المخزون
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {canAdd && onOpenMultiReturnModal && (
                        <button
                            onClick={onOpenMultiReturnModal}
                            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm shadow-rose-600/20 transition"
                        >
                            <FileText size={16} />
                            <span>إنشاء مردودات كروت</span>
                        </button>
                    )}
                </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl md:rounded-3xl border border-rose-100 dark:border-rose-900/40 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-400">إجمالي فواتير المردودات</span>
                        <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
                            <RotateCcw size={16} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">{totalInvoicesCount}</span>
                        <span className="text-xs font-bold text-slate-400 mr-1.5">فاتورة معتمدة</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl md:rounded-3xl border border-rose-100 dark:border-rose-900/40 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-400">الكروت المسترجعة</span>
                        <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
                            <Package size={16} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <span className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400">-{totalQtyReturned}</span>
                        <span className="text-xs font-bold text-slate-400 mr-1.5">كارت مخصوم</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-400">مستردات نقدية للصندوق</span>
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                            <Wallet size={16} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <span className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400">{cashReturns.toLocaleString()}</span>
                        <span className="text-[10px] font-bold text-slate-400 mr-1">ريال يمني</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl md:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black text-slate-400">خصم من ديون الموردين</span>
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                            <Receipt size={16} />
                        </div>
                    </div>
                    <div className="mt-3">
                        <span className="text-lg sm:text-xl font-black text-indigo-600 dark:text-indigo-400">{creditReturns.toLocaleString()}</span>
                        <span className="text-[10px] font-bold text-slate-400 mr-1">ريال يمني</span>
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <div className="relative w-full">
                    <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="بحث برقم الفاتورة، اسم المورد، الصنف، المستخدم..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="w-full pl-3 pr-10 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-rose-500 font-bold text-slate-800 dark:text-white"
                    />
                    {searchText && (
                        <button onClick={() => setSearchText('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X size={14} />
                        </button>
                    )}
                </div>

                {showFilters && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-2.5 animate-in fade-in duration-150">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 mb-1">من تاريخ</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-rose-500"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 mb-1">إلى تاريخ</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-rose-500"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 mb-1">طريقة الاسترداد</label>
                            <select
                                value={paymentFilter}
                                onChange={(e: any) => setPaymentFilter(e.target.value)}
                                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-rose-500"
                            >
                                <option value="all">الكل (نقدي وآجل)</option>
                                <option value="cash">استرداد نقدي فقط</option>
                                <option value="credit">خصم من دين المورد فقط</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black text-slate-400 mb-1">حالة الفاتورة</label>
                            <select
                                value={statusFilter}
                                onChange={(e: any) => setStatusFilter(e.target.value)}
                                className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white outline-none focus:border-rose-500"
                            >
                                <option value="all">كافة الحالات</option>
                                <option value="completed">معتمدة فقط</option>
                                <option value="cancelled">ملغاة فقط</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Table Header with Filter & PDF Icon Buttons */}
            <div className="flex items-center justify-between px-2 pt-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">
                        جدول فواتير المردودات
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60">
                        {filteredInvoices.length} فاتورة
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowFilters(!showFilters)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black border flex items-center gap-1.5 transition ${
                            showFilters || startDate || endDate || paymentFilter !== 'all' || statusFilter !== 'all'
                                ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                        title="تصفية فواتير المردودات"
                    >
                        <Filter size={14} />
                        <span>تصفية</span>
                        {(startDate || endDate || paymentFilter !== 'all' || statusFilter !== 'all') && (
                            <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                        )}
                    </button>

                    {(startDate || endDate || paymentFilter !== 'all' || statusFilter !== 'all' || searchText) && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchText('');
                                setStartDate('');
                                setEndDate('');
                                setPaymentFilter('all');
                                setStatusFilter('all');
                            }}
                            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-600 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl transition"
                            title="إعادة تعيين الفلاتر"
                        >
                            <RotateCcw size={14} />
                        </button>
                    )}

                    {/* PDF Export Icon-only Button */}
                    <button
                        type="button"
                        onClick={handleExportPDF}
                        disabled={filteredInvoices.length === 0}
                        title="تصدير كشف المردودات PDF"
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-600 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 shadow-sm transition active:scale-95 disabled:opacity-40"
                    >
                        <Printer size={17} />
                    </button>
                </div>
            </div>

            {/* Invoices List / Cards */}
            {filteredInvoices.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
                    <div className="w-16 h-16 rounded-3xl bg-rose-50 dark:bg-rose-950/50 text-rose-500 flex items-center justify-center mx-auto">
                        <RotateCcw size={28} />
                    </div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">لا توجد فواتير مردودات مشتريات</h3>
                    <p className="text-xs font-bold text-slate-400 max-w-sm mx-auto">
                        لم يتم العثور على أي فواتير مردودات تطابق معايير البحث الحالية. يمكنك إصدار فاتورة مردودات جديدة بسهولة.
                    </p>
                    {canAdd && onOpenMultiReturnModal && (
                        <button
                            onClick={onOpenMultiReturnModal}
                            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition inline-flex items-center gap-2 shadow-sm shadow-rose-600/20"
                        >
                            <FileText size={16} />
                            <span>إنشاء مردودات كروت</span>
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {paginatedInvoices.map((inv) => {
                        const isExpanded = expandedInvoices[inv.id];
                        const isCancelled = inv.status === 'cancelled';

                        return (
                            <div
                                key={inv.id}
                                className={`bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl border transition-all duration-200 overflow-hidden shadow-sm ${
                                    isCancelled 
                                        ? 'border-slate-200 dark:border-slate-800 opacity-60 bg-slate-50/50 dark:bg-slate-900/50' 
                                        : 'border-rose-200 dark:border-rose-900/60 hover:border-rose-400 dark:hover:border-rose-700'
                                }`}
                            >
                                {/* Main Row */}
                                <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-start sm:items-center gap-3">
                                        <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center font-black shrink-0 border border-rose-200 dark:border-rose-900">
                                            <RotateCcw size={20} />
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-mono text-sm font-black text-slate-900 dark:text-white">
                                                    #{inv.invoiceNumber}
                                                </span>
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                                    مردودات مشتريات
                                                </span>
                                                {inv.paymentType === 'cash' ? (
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                                        استرداد نقدي
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                                        خصم من الدين
                                                    </span>
                                                )}
                                                {isCancelled && (
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200">
                                                        ملغاة
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-slate-500">
                                                <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-black">
                                                    <User size={13} className="text-slate-400" />
                                                    المورد: {inv.supplierName}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock size={13} className="text-slate-400" />
                                                    {inv.dateTime}
                                                </span>
                                                <span className="text-[11px] text-slate-400">
                                                    بواسطة: {inv.userName}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between md:justify-end gap-4 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                                        <div className="text-right">
                                            <span className="text-[10px] font-bold text-slate-400 block">المبلغ المسترد</span>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400">
                                                    -{inv.totalAmount.toLocaleString()}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-400">ريال</span>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400 block">
                                                -{inv.totalQuantity} كارت ({inv.items.length} صنف)
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                            <button
                                                onClick={() => onViewInvoice(createInvoiceObj(inv))}
                                                className="p-2 text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition"
                                                title="معاينة الفاتورة"
                                            >
                                                <Eye size={16} />
                                            </button>

                                            <button
                                                onClick={() => handleDirectPrintInvoice(inv)}
                                                className="p-2 text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition"
                                                title="طباعة إيصال فوري"
                                            >
                                                <Printer size={16} />
                                            </button>

                                            <button
                                                onClick={() => toggleExpand(inv.id)}
                                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl transition"
                                                title={isExpanded ? 'طي التفاصيل' : 'عرض الأصناف'}
                                            >
                                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Items Table */}
                                {isExpanded && (
                                    <div className="bg-slate-50/80 dark:bg-slate-950/40 p-4 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-in fade-in duration-150">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                                        <th className="py-2 text-right font-black">الصنف / فئة الكارت</th>
                                                        <th className="py-2 text-center font-black">الكمية المرتجعة</th>
                                                        <th className="py-2 text-center font-black">سعر التكلفة</th>
                                                        <th className="py-2 text-left font-black">إجمالي المسترد</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-bold">
                                                    {inv.items.map((it, idx) => (
                                                        <tr key={idx} className="hover:bg-white dark:hover:bg-slate-900 transition-colors">
                                                            <td className="py-2.5 text-slate-900 dark:text-white font-black">
                                                                {it.categoryName}
                                                            </td>
                                                            <td className="py-2.5 text-center text-rose-600 dark:text-rose-400 font-black">
                                                                -{it.quantity}
                                                            </td>
                                                            <td className="py-2.5 text-center text-slate-600 dark:text-slate-300">
                                                                {it.unitPrice.toFixed(2)} ريال
                                                            </td>
                                                            <td className="py-2.5 text-left text-rose-600 dark:text-rose-400 font-black">
                                                                -{it.totalAmount.toFixed(2)} ريال
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {inv.notes && (
                                            <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 font-bold">
                                                <span className="text-slate-400 font-black ml-1">ملاحظات الفاتورة:</span>
                                                {inv.notes}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <span className="text-xs font-bold text-slate-400">
                                صفحة {currentPage} من {totalPages} (إجمالي: {filteredInvoices.length} فاتورة)
                            </span>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                                >
                                    السابق
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                                >
                                    التالي
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
export default CardReturnsSection;
