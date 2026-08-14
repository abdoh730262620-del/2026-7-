import React, { useState } from 'react';
import { Search, Calendar, FileText, Printer, Share2, TrendingUp, X, Filter, Eye, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { CardSale } from '../types/cardTypes';
import { InvoicePdfInput } from '../lib/pdfHelper';
import { printReport } from '../lib/printHelper';

interface CardSalesSectionProps {
    sales: CardSale[];
    onViewInvoice: (invoice: InvoicePdfInput) => void;
    onEditInvoice?: (invoice: GroupedSaleInvoice) => void;
    onCancelInvoice?: (invoice: GroupedSaleInvoice) => void;
    appUser: any;
}

interface GroupedSaleInvoice {
    id: string;
    docIds: string[];
    invoiceNumber: string;
    rawInvoiceNumber?: string;
    distributorId: string;
    distributorName: string;
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

export const CardSalesSection: React.FC<CardSalesSectionProps> = ({
    sales,
    onViewInvoice,
    onEditInvoice,
    onCancelInvoice,
    appUser
}) => {
    const [searchText, setSearchText] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
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
            return digits ? digits.slice(-5) : '1001';
        }
        const digits = invStr.replace(/\D/g, '');
        return digits || '1001';
    };

    // Group sales into logical invoices
    const groupSalesToInvoices = (): GroupedSaleInvoice[] => {
        const groupedMap: { [key: string]: GroupedSaleInvoice } = {};

        sales.forEach(sale => {
            const dateOnly = sale.date || (sale.dateTime && sale.dateTime.split(' ')[0]) || '';
            const invNumber = getNumericInvoiceNumber(sale.invoiceNumber, sale.id);
            
            const key = sale.invoiceNumber 
                ? `inv_${sale.invoiceNumber}` 
                : `grp_${sale.dateTime}_${sale.distributorId || 'walkin'}_${sale.paymentType}`;

            if (!groupedMap[key]) {
                groupedMap[key] = {
                    id: sale.id,
                    docIds: [sale.id],
                    invoiceNumber: invNumber,
                    rawInvoiceNumber: sale.invoiceNumber || '',
                    distributorId: sale.distributorId || '',
                    distributorName: sale.distributorName || 'موزع نقدي / عام',
                    paymentType: sale.paymentType || 'cash',
                    dateTime: sale.dateTime || sale.date || '',
                    date: dateOnly,
                    userName: sale.userName || 'النظام',
                    status: sale.status || 'completed',
                    cancelledBy: sale.cancelledBy,
                    cancelledAt: sale.cancelledAt,
                    items: [],
                    totalAmount: 0,
                    totalQuantity: 0
                };
            } else {
                if (!groupedMap[key].docIds.includes(sale.id)) {
                    groupedMap[key].docIds.push(sale.id);
                }
                if (sale.status === 'cancelled') {
                    groupedMap[key].status = 'cancelled';
                    if (sale.cancelledBy) groupedMap[key].cancelledBy = sale.cancelledBy;
                    if (sale.cancelledAt) groupedMap[key].cancelledAt = sale.cancelledAt;
                }
            }

            const qty = Math.abs(sale.quantity || 0);
            const net = Math.abs(sale.netTotal || sale.totalAmount || 0);
            const price = sale.unitPrice || (qty ? (net / qty) : 0);

            groupedMap[key].items.push({
                categoryName: sale.categoryName || 'كروت فئة',
                quantity: qty,
                unitPrice: price,
                totalAmount: net
            });

            groupedMap[key].totalAmount += net;
            groupedMap[key].totalQuantity += qty;
        });

        return Object.values(groupedMap).sort((a, b) => b.dateTime.localeCompare(a.dateTime));
    };

    const invoices = groupSalesToInvoices();

    // Filter Invoices based on search text and date range
    const filteredInvoices = invoices.filter(inv => {
        if (searchText.trim()) {
            const q = searchText.toLowerCase();
            const matchesText = 
                inv.invoiceNumber.toLowerCase().includes(q) ||
                inv.distributorName.toLowerCase().includes(q) ||
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
    const totalQtySold = activeInvoices.reduce((sum, inv) => sum + inv.totalQuantity, 0);
    const cashTotal = activeInvoices.reduce((sum, inv) => inv.paymentType === 'cash' ? sum + inv.totalAmount : sum, 0);
    const creditTotal = activeInvoices.reduce((sum, inv) => inv.paymentType === 'credit' ? sum + inv.totalAmount : sum, 0);
    const overallTotal = cashTotal + creditTotal;

    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;
    const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handleExportPDF = () => {
        const title = `سجل فواتير مبيعات كروت الشبكة${startDate || endDate ? ` (الفترة: ${startDate || 'البداية'} إلى ${endDate || 'النهاية'})` : ''}`;
        const headers = ['رقم الفاتورة', 'الموزع / العميل', 'عدد الكروت', 'طريقة الدفع', 'المبلغ الإجمالي', 'التاريخ والوقت'];
        const data = filteredInvoices.map(inv => [
            `#${inv.invoiceNumber}`,
            inv.distributorName,
            `${inv.totalQuantity} كارت`,
            inv.paymentType === 'cash' ? 'نقدي' : 'آجل',
            `${inv.totalAmount.toFixed(2)} ريال يمني`,
            inv.dateTime
        ]);
        
        data.push([
            'الإجمالي العام',
            `إجمالي فواتير: ${totalInvoicesCount}`,
            `${totalQtySold} كارت مبيعات`,
            `نقدي: ${cashTotal.toFixed(2)} | آجل: ${creditTotal.toFixed(2)}`,
            `${overallTotal.toFixed(2)} ريال يمني`,
            '-'
        ]);

        printReport(title, headers, data);
    };

    const createInvoiceObj = (inv: GroupedSaleInvoice): InvoicePdfInput => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        type: 'sale',
        totalAmount: inv.totalAmount,
        paymentType: inv.paymentType,
        partyName: inv.distributorName,
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

    return (
        <div className="space-y-3 sm:space-y-3.5 animate-in fade-in duration-200 text-right" dir="rtl">
            {/* Header & Controls */}
            <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/50 shrink-0">
                        <TrendingUp size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">قسم مبيعات الكروت</h2>
                            <span className="px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-black font-mono rounded-lg">
                                {totalInvoicesCount} فاتورة
                            </span>
                        </div>
                        <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 mt-0.5">
                            سجل فواتير مبيعات كروت الشبكة، فلترة وتصدير التقارير، ومعاينة وطباعة الفواتير
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
                            showFilters || startDate || endDate || searchText
                                ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                        }`}
                    >
                        <Filter size={17} />
                        {(startDate || endDate || searchText) && (
                            <span className="w-2 h-2 rounded-full bg-amber-300 absolute top-1.5 right-1.5 border border-emerald-600"></span>
                        )}
                    </button>

                    {/* Export PDF Icon Button */}
                    <button
                        onClick={handleExportPDF}
                        disabled={filteredInvoices.length === 0}
                        title="طباعة وتصدير تقرير المبيعات PDF"
                        aria-label="تصدير PDF"
                        className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 active:scale-95 text-white rounded-xl shadow-sm flex items-center justify-center transition border border-slate-700"
                    >
                        <Printer size={17} />
                    </button>
                </div>
            </div>

            {/* Compact Toggleable Filter Panel */}
            {showFilters && (
                <div className="bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-2.5 animate-in slide-in-from-top-1 duration-150">
                    <div className="relative">
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="text"
                                placeholder="بحث: اسم الموزع، رقم الفاتورة، الصنف..."
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

                    <div className="relative">
                        <div className="relative">
                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full pr-8 pl-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-emerald-600 text-slate-900 dark:text-white"
                                title="من تاريخ"
                            />
                        </div>
                    </div>

                    <div className="relative">
                        <div className="relative">
                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full pr-8 pl-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-emerald-600 text-slate-900 dark:text-white"
                                title="إلى تاريخ"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Statistics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                <div className="bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">عدد الفواتير</span>
                    <div className="text-sm sm:text-base font-black text-slate-950 dark:text-white mt-0.5">{totalInvoicesCount} فاتورة</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">إجمالي الكروت المباعة</span>
                    <div className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{totalQtySold} كارت</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">مبيعات نقدية</span>
                    <div className="text-sm sm:text-base font-black text-indigo-600 dark:text-indigo-400 mt-0.5">{cashTotal.toFixed(2)} ر.ي</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3 sm:p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">مبيعات آجلة</span>
                    <div className="text-sm sm:text-base font-black text-amber-600 dark:text-amber-400 mt-0.5">{creditTotal.toFixed(2)} ر.ي</div>
                </div>
            </div>

            {/* Invoices List with Collapsible Structured Tables per Invoice */}
            <div className="space-y-2 sm:space-y-2.5">
                {paginatedInvoices.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs space-y-2">
                        <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={32} />
                        <p>لا توجد فواتير مبيعات مطابقة.</p>
                    </div>
                ) : (
                    paginatedInvoices.map((inv) => {
                        const isExpanded = !!expandedInvoices[inv.id];
                        return (
                            <div 
                                key={inv.id}
                                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:border-emerald-300 transition"
                            >
                                {/* Invoice Header Bar (Clickable to Expand/Collapse) */}
                                <div 
                                    onClick={() => toggleExpand(inv.id)}
                                    className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 cursor-pointer select-none"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                        </div>
                                        <span className="px-2.5 py-0.5 bg-emerald-600 text-white font-mono font-black text-[11px] rounded-lg shadow-sm">
                                            #{inv.invoiceNumber}
                                        </span>
                                        <div>
                                            <h4 className="font-black text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                                                <span>{inv.distributorName}</span>
                                                <span className="text-[10px] text-slate-400 font-normal">({inv.totalQuantity} كارت)</span>
                                            </h4>
                                            <p className="text-[10px] text-slate-400 font-medium">{inv.dateTime} • {inv.userName}</p>
                                        </div>
                                    </div>

                                    <div className={`flex items-center gap-2 ${inv.status === 'cancelled' ? 'opacity-60' : ''}`} onClick={(e) => e.stopPropagation()}>
                                        <span className={`font-mono font-black text-xs ${inv.status === 'cancelled' ? 'text-gray-500 line-through' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                            {inv.totalAmount.toFixed(2)} ريال يمني
                                        </span>
                                        {inv.status === 'cancelled' && (
                                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                                ملغاة
                                            </span>
                                        )}
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                                            inv.paymentType === 'cash' 
                                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                        }`}>
                                            {inv.paymentType === 'cash' ? 'نقدي' : 'آجل'}
                                        </span>

                                        <button
                                            onClick={() => onViewInvoice(createInvoiceObj(inv))}
                                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition"
                                        >
                                            <Eye size={13} />
                                            <span>عرض</span>
                                        </button>
                                        {onEditInvoice && inv.status !== 'cancelled' && (
                                            <button
                                                onClick={() => onEditInvoice(inv)}
                                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1.5 shadow-md shadow-blue-600/20 active:scale-95 transition"
                                            >
                                                <span>تعديل</span>
                                            </button>
                                        )}
                                        {onCancelInvoice && inv.status !== 'cancelled' && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCancelInvoice(inv);
                                                }}
                                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1.5 shadow-md shadow-rose-600/20 active:scale-95 transition"
                                            >
                                                <X size={13} />
                                                <span>إلغاء</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Structured Items Table (Collapsible) */}
                                {isExpanded && (
                                    <div className="p-4 animate-in fade-in duration-200">
                                        <table className="w-full text-right text-xs">
                                            <thead>
                                                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[11px] font-bold">
                                                    <th className="pb-2 font-black">الصنف (فئة الكرت)</th>
                                                    <th className="pb-2 text-center font-black">الكمية المباعة</th>
                                                    <th className="pb-2 text-center font-black">سعر الوحدة</th>
                                                    <th className="pb-2 text-left font-black">الإجمالي الصافي</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
                                                {inv.items.map((item, idx) => (
                                                    <tr key={idx} className="font-bold text-slate-800 dark:text-slate-200">
                                                        <td className="py-2.5 font-black text-slate-900 dark:text-white">{item.categoryName}</td>
                                                        <td className="py-2.5 text-center font-mono font-black text-emerald-600">{item.quantity} كارت</td>
                                                        <td className="py-2.5 text-center font-mono text-slate-500">{item.unitPrice.toFixed(2)} ريال يمني</td>
                                                        <td className="py-2.5 text-left font-mono font-black text-slate-950 dark:text-white">{item.totalAmount.toFixed(2)} ريال يمني</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        {/* Invoice Total Footer */}
                                        <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs">
                                            <span className="font-bold text-slate-500">إجمالي كمية الفاتورة: <strong className="text-emerald-600 font-black">{inv.totalQuantity}</strong> كارت</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-500">إجمالي الفاتورة:</span>
                                                <span className="font-black text-sm text-emerald-600 dark:text-emerald-400 font-mono" dir="ltr">
                                                    {inv.totalAmount.toFixed(2)} ريال يمني
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
                    <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold mt-4">
                        <div className="text-slate-500">
                            عرض الصفحة <span className="font-black text-emerald-600">{currentPage}</span> من <span className="font-black">{totalPages}</span> (إجمالي {filteredInvoices.length} فاتورة)
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
        </div>
    );
};

