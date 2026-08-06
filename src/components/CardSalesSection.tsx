import React, { useState } from 'react';
import { Search, Calendar, FileText, Printer, Share2, TrendingUp, X, Filter, Eye, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { CardSale } from '../types/cardTypes';
import { InvoicePdfInput } from '../lib/pdfHelper';
import { printReport } from '../lib/printHelper';

interface CardSalesSectionProps {
    sales: CardSale[];
    onViewInvoice: (invoice: InvoicePdfInput) => void;
    appUser: any;
}

interface GroupedSaleInvoice {
    id: string;
    invoiceNumber: string;
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
}

export const CardSalesSection: React.FC<CardSalesSectionProps> = ({
    sales,
    onViewInvoice,
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
                    invoiceNumber: invNumber,
                    distributorId: sale.distributorId || '',
                    distributorName: sale.distributorName || 'موزع نقدي / عام',
                    paymentType: sale.paymentType || 'cash',
                    dateTime: sale.dateTime || sale.date || '',
                    date: dateOnly,
                    userName: sale.userName || 'النظام',
                    items: [],
                    totalAmount: 0,
                    totalQuantity: 0
                };
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

    const totalInvoicesCount = filteredInvoices.length;
    const totalQtySold = filteredInvoices.reduce((sum, inv) => sum + inv.totalQuantity, 0);
    const cashTotal = filteredInvoices.reduce((sum, inv) => inv.paymentType === 'cash' ? sum + inv.totalAmount : sum, 0);
    const creditTotal = filteredInvoices.reduce((sum, inv) => inv.paymentType === 'credit' ? sum + inv.totalAmount : sum, 0);
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
            `${inv.totalAmount.toFixed(2)} ر.س`,
            inv.dateTime
        ]);
        
        data.push([
            'الإجمالي العام',
            `إجمالي فواتير: ${totalInvoicesCount}`,
            `${totalQtySold} كارت مبيعات`,
            `نقدي: ${cashTotal.toFixed(2)} | آجل: ${creditTotal.toFixed(2)}`,
            `${overallTotal.toFixed(2)} ر.س`,
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
        items: inv.items.map(it => ({
            categoryName: it.categoryName,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalAmount: it.totalAmount
        }))
    });

    return (
        <div className="space-y-6 animate-in fade-in duration-200 text-right" dir="rtl">
            {/* Header & Controls */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <TrendingUp className="text-emerald-500" size={24} />
                        <span>قسم مبيعات الكروت</span>
                    </h2>
                    <p className="text-xs font-bold text-slate-400 mt-1">
                        عرض كشوف فواتير المبيعات الفردية لكروت الشبكة، فلترة وتصدير التقارير، ومعاينة الفواتير كـ PDF.
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Filter Icon Toggle Button */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`p-3 rounded-2xl flex items-center gap-2 font-black text-xs transition shadow-sm ${
                            showFilters || startDate || endDate || searchText
                                ? 'bg-emerald-600 text-white shadow-emerald-600/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                        title="فلترة الفواتير"
                    >
                        <Filter size={18} />
                        <span>فلترة وبحث</span>
                        {(startDate || endDate || searchText) && (
                            <span className="w-2 h-2 rounded-full bg-amber-300"></span>
                        )}
                    </button>

                    {/* Export PDF Button */}
                    <button
                        onClick={handleExportPDF}
                        disabled={filteredInvoices.length === 0}
                        className="px-4 py-3 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 active:scale-95 text-white font-black text-xs rounded-2xl shadow-sm flex items-center gap-2 transition"
                    >
                        <Printer size={16} />
                        <span>تصدير PDF</span>
                    </button>
                </div>
            </div>

            {/* Toggleable Filter Panel */}
            {showFilters && (
                <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-emerald-200 dark:border-emerald-900/50 shadow-lg grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="relative">
                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">بحث ذكي</label>
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="اسم الموزع، رقم الفاتورة، الصنف..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full pr-10 pl-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none focus:border-emerald-600 text-slate-900 dark:text-white"
                            />
                            {searchText && (
                                <button onClick={() => setSearchText('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">من تاريخ</label>
                        <div className="relative">
                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full pr-10 pl-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none focus:border-emerald-600 text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">إلى تاريخ</label>
                        <div className="relative">
                            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full pr-10 pl-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none focus:border-emerald-600 text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Statistics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">عدد الفواتير</span>
                    <div className="text-lg font-black text-slate-950 dark:text-white mt-1">{totalInvoicesCount} فاتورة</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">إجمالي الكروت المباعة</span>
                    <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">{totalQtySold} كارت</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">مبيعات نقدية</span>
                    <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">{cashTotal.toFixed(2)} ر.س</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">مبيعات آجلة</span>
                    <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1">{creditTotal.toFixed(2)} ر.س</div>
                </div>
            </div>

            {/* Invoices List with Collapsible Structured Tables per Invoice */}
            <div className="space-y-3">
                {paginatedInvoices.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs space-y-2">
                        <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                        <p>لا توجد فواتير مبيعات مطابقة.</p>
                    </div>
                ) : (
                    paginatedInvoices.map((inv) => {
                        const isExpanded = !!expandedInvoices[inv.id];
                        return (
                            <div 
                                key={inv.id}
                                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:border-emerald-300 transition"
                            >
                                {/* Invoice Header Bar (Clickable to Expand/Collapse) */}
                                <div 
                                    onClick={() => toggleExpand(inv.id)}
                                    className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-1 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </div>
                                        <span className="px-3 py-1 bg-emerald-600 text-white font-mono font-black text-xs rounded-xl shadow-sm">
                                            فاتورة #{inv.invoiceNumber}
                                        </span>
                                        <div>
                                            <h4 className="font-black text-slate-900 dark:text-white text-xs flex items-center gap-2">
                                                <span>{inv.distributorName}</span>
                                                <span className="text-[10px] text-slate-400 font-normal">({inv.totalQuantity} كارت)</span>
                                            </h4>
                                            <p className="text-[10px] text-slate-400 font-medium">{inv.dateTime} • {inv.userName}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                        <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-xs">
                                            {inv.totalAmount.toFixed(2)} ر.س
                                        </span>

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
                                            <span>عرض PDF</span>
                                        </button>
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
                                                        <td className="py-2.5 text-center font-mono text-slate-500">{item.unitPrice.toFixed(2)} ر.س</td>
                                                        <td className="py-2.5 text-left font-mono font-black text-slate-950 dark:text-white">{item.totalAmount.toFixed(2)} ر.س</td>
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
                                                    {inv.totalAmount.toFixed(2)} ر.س
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

