import React, { useState } from 'react';
import { Search, Calendar, FileText, Printer, Share2, ShoppingBag, X, Filter, Eye, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { CardPurchase } from '../types/cardTypes';
import { InvoicePdfInput } from '../lib/pdfHelper';
import { printReport } from '../lib/printHelper';

interface CardPurchasesSectionProps {
    purchases: CardPurchase[];
    onViewInvoice: (invoice: InvoicePdfInput) => void;
    appUser: any;
}

interface GroupedPurchaseInvoice {
    id: string;
    invoiceNumber: string;
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
}

export const CardPurchasesSection: React.FC<CardPurchasesSectionProps> = ({
    purchases,
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
                    invoiceNumber: invNumber,
                    supplierId: p.supplierId || '',
                    supplierName: p.supplierName || 'مورد نقدي / عام',
                    paymentType: p.paymentType || 'cash',
                    dateTime: p.dateTime || p.date || '',
                    date: dateOnly,
                    userName: p.userName || 'النظام',
                    items: [],
                    totalAmount: 0,
                    totalQuantity: 0
                };
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

    // Filter Invoices based on search text and date range
    const filteredInvoices = invoices.filter(inv => {
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

    const totalInvoicesCount = filteredInvoices.length;
    const totalQtyBought = filteredInvoices.reduce((sum, inv) => sum + inv.totalQuantity, 0);
    const cashTotal = filteredInvoices.reduce((sum, inv) => inv.paymentType === 'cash' ? sum + inv.totalAmount : sum, 0);
    const creditTotal = filteredInvoices.reduce((sum, inv) => inv.paymentType === 'credit' ? sum + inv.totalAmount : sum, 0);
    const overallTotal = cashTotal + creditTotal;

    const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage) || 1;
    const paginatedInvoices = filteredInvoices.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handleExportPDF = () => {
        const title = `سجل فواتير مشتريات كروت الشبكة${startDate || endDate ? ` (الفترة: ${startDate || 'البداية'} إلى ${endDate || 'النهاية'})` : ''}`;
        const headers = ['رقم الفاتورة', 'المورد', 'عدد الكروت', 'طريقة الدفع', 'المبلغ الإجمالي', 'التاريخ والوقت'];
        const data = filteredInvoices.map(inv => [
            `#${inv.invoiceNumber}`,
            inv.supplierName,
            `${inv.totalQuantity} كارت`,
            inv.paymentType === 'cash' ? 'نقدي' : 'آجل',
            `${inv.totalAmount.toFixed(2)} ر.س`,
            inv.dateTime
        ]);
        
        data.push([
            'الإجمالي العام',
            `إجمالي فواتير: ${totalInvoicesCount}`,
            `${totalQtyBought} كارت مشتريات`,
            `نقدي: ${cashTotal.toFixed(2)} | آجل: ${creditTotal.toFixed(2)}`,
            `${overallTotal.toFixed(2)} ر.س`,
            '-'
        ]);

        printReport(title, headers, data);
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
                        <ShoppingBag className="text-blue-500" size={24} />
                        <span>قسم مشتريات الكروت</span>
                    </h2>
                    <p className="text-xs font-bold text-slate-400 mt-1">
                        عرض كشوف فواتير المشتريات الفردية لكروت الشبكة، فلترة وتصدير التقارير، ومعاينة الفواتير كـ PDF.
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Filter Icon Toggle Button */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`p-3 rounded-2xl flex items-center gap-2 font-black text-xs transition shadow-sm ${
                            showFilters || startDate || endDate || searchText
                                ? 'bg-blue-600 text-white shadow-blue-600/20'
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
                <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-blue-200 dark:border-blue-900/50 shadow-lg grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="relative">
                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">بحث ذكي</label>
                        <div className="relative">
                            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="اسم المورد، رقم الفاتورة، الصنف..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full pr-10 pl-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white"
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
                                className="w-full pr-10 pl-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white"
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
                                className="w-full pr-10 pl-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white"
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
                    <span className="text-[10px] font-black text-slate-400">إجمالي الكروت المشتراة</span>
                    <div className="text-lg font-black text-blue-600 dark:text-blue-400 mt-1">{totalQtyBought} كارت</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">مشتريات نقدية</span>
                    <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">{cashTotal.toFixed(2)} ر.س</div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400">مشتريات آجلة</span>
                    <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1">{creditTotal.toFixed(2)} ر.س</div>
                </div>
            </div>

            {/* Invoices List with Collapsible Structured Tables per Invoice */}
            <div className="space-y-3">
                {paginatedInvoices.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs space-y-2">
                        <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                        <p>لا توجد فواتير مشتريات مطابقة.</p>
                    </div>
                ) : (
                    paginatedInvoices.map((inv) => {
                        const isExpanded = !!expandedInvoices[inv.id];
                        return (
                            <div 
                                key={inv.id}
                                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:border-blue-300 transition"
                            >
                                {/* Invoice Header Bar (Clickable to Expand/Collapse) */}
                                <div 
                                    onClick={() => toggleExpand(inv.id)}
                                    className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-1 rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </div>
                                        <span className="px-3 py-1 bg-blue-600 text-white font-mono font-black text-xs rounded-xl shadow-sm">
                                            فاتورة #{inv.invoiceNumber}
                                        </span>
                                        <div>
                                            <h4 className="font-black text-slate-900 dark:text-white text-xs flex items-center gap-2">
                                                <span>{inv.supplierName}</span>
                                                <span className="text-[10px] text-slate-400 font-normal">({inv.totalQuantity} كارت)</span>
                                            </h4>
                                            <p className="text-[10px] text-slate-400 font-medium">{inv.dateTime} • {inv.userName}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                        <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-xs">
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
                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1.5 shadow-md shadow-blue-600/20 active:scale-95 transition"
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
                                                    <th className="pb-2 text-center font-black">الكمية المشتراة</th>
                                                    <th className="pb-2 text-center font-black">سعر الشراء</th>
                                                    <th className="pb-2 text-left font-black">الإجمالي الصافي</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
                                                {inv.items.map((item, idx) => (
                                                    <tr key={idx} className="font-bold text-slate-800 dark:text-slate-200">
                                                        <td className="py-2.5 font-black text-slate-900 dark:text-white">{item.categoryName}</td>
                                                        <td className="py-2.5 text-center font-mono font-black text-blue-600">{item.quantity} كارت</td>
                                                        <td className="py-2.5 text-center font-mono text-slate-500">{item.unitPrice.toFixed(2)} ر.س</td>
                                                        <td className="py-2.5 text-left font-mono font-black text-slate-950 dark:text-white">{item.totalAmount.toFixed(2)} ر.س</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        {/* Invoice Total Footer */}
                                        <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs">
                                            <span className="font-bold text-slate-500">إجمالي كمية الفاتورة: <strong className="text-blue-600 font-black">{inv.totalQuantity}</strong> كارت</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-500">إجمالي الفاتورة:</span>
                                                <span className="font-black text-sm text-blue-600 dark:text-blue-400 font-mono" dir="ltr">
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
                            عرض الصفحة <span className="font-black text-blue-600">{currentPage}</span> من <span className="font-black">{totalPages}</span> (إجمالي {filteredInvoices.length} فاتورة)
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

