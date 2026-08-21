import React, { useState } from 'react';
import { X, FileText, Printer, Search, Download, ShoppingBag, CreditCard, Wifi, Wallet, TrendingDown, Eye, CheckCircle2, Banknote, Sparkles, AlertTriangle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useSettingsStore } from '../store/settingsStore';

export type MetricType = 'gen_cash' | 'gen_credit' | 'card_cash' | 'card_credit' | 'salary_comm' | 'withdrawals';

export interface EmployeeMetricDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    employeeName: string;
    employeeRole?: string;
    employeeSalary?: number;
    employeeMaxLimit?: number;
    month: string;
    metricType: MetricType;
    items: any[];
    summaryData: {
        totalAmount: number;
        totalCommissions?: number;
        totalWithdrawals?: number;
        baseSalary?: number;
        netPayable?: number;
    };
    onPreviewInvoice?: (invoice: any, type: 'sale' | 'card_sale', items: any[]) => void;
}

export const EmployeeMetricDetailModal: React.FC<EmployeeMetricDetailModalProps> = ({
    isOpen,
    onClose,
    employeeName,
    employeeRole,
    employeeSalary = 0,
    employeeMaxLimit = 0,
    month,
    metricType,
    items,
    summaryData,
    onPreviewInvoice
}) => {
    const settings = useSettingsStore(state => state.settings);
    const [searchTerm, setSearchTerm] = useState('');
    const [cardFilterType, setCardFilterType] = useState<'all' | 'retail' | 'wholesale'>('all');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [visibleCount, setVisibleCount] = useState(5);

    if (!isOpen) return null;

    const isCardMetric = ['card_cash', 'card_credit', 'salary_comm'].includes(metricType);

    // Calculate separated card metrics
    const retailItemsAll = items.filter(item => !item.isClearance && !item.isWithdrawal && !item.isVoucher && item.saleType !== 'wholesale' && item.saleType !== 'distributor' && !item.distributorId);
    const wholesaleItemsAll = items.filter(item => !item.isClearance && !item.isWithdrawal && !item.isVoucher && (item.saleType === 'wholesale' || item.saleType === 'distributor' || Boolean(item.distributorId)));

    const totRetailAmount = retailItemsAll.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
    const totRetailQty = retailItemsAll.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const totRetailCommissions = retailItemsAll.reduce((sum, item) => {
        const comm = typeof item.commissionAmount === 'number'
            ? item.commissionAmount
            : ((Number(item.totalAmount) || 0) * (typeof item.commissionPercent === 'number' ? item.commissionPercent / 100 : 0.1));
        return sum + comm;
    }, 0);

    const totWholesaleAmount = wholesaleItemsAll.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);
    const totWholesaleQty = wholesaleItemsAll.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    
    const clearancesTotal = items.filter(item => item.isClearance).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const withdrawalsTotal = items.filter(item => item.isWithdrawal).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const vouchersTotal = items.filter(item => item.isVoucher).reduce((sum, item) => {
        const amt = Number(item.amount) || 0;
        return item.type === 'receipt' ? sum + amt : sum - amt;
    }, 0);
    const grandCardsAmount = Math.max(0, totRetailAmount + totWholesaleAmount - clearancesTotal - withdrawalsTotal - vouchersTotal);

    const getMetricConfig = () => {
        switch (metricType) {
            case 'gen_cash':
                return {
                    title: 'المبيعات النقدية العامة',
                    icon: ShoppingBag,
                    colorClass: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/80 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
                    badge: 'مبيعات نقدي',
                    accentBg: 'bg-emerald-500'
                };
            case 'gen_credit':
                return {
                    title: 'المبيعات الآجلة العامة',
                    icon: CreditCard,
                    colorClass: 'text-amber-600 bg-amber-50 dark:bg-amber-950/80 dark:text-amber-400 border-amber-200 dark:border-amber-800',
                    badge: 'مبيعات آجل',
                    accentBg: 'bg-amber-500'
                };
            case 'card_cash':
                return {
                    title: 'مبيعات الكروت النقدية',
                    icon: Wifi,
                    colorClass: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/80 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
                    badge: 'كروت نقدي',
                    accentBg: 'bg-indigo-500'
                };
            case 'card_credit':
                return {
                    title: 'مبيعات الكروت الآجلة',
                    icon: CreditCard,
                    colorClass: 'text-purple-600 bg-purple-50 dark:bg-purple-950/80 dark:text-purple-400 border-purple-200 dark:border-purple-800',
                    badge: 'كروت آجل',
                    accentBg: 'bg-purple-500'
                };
            case 'salary_comm':
                return {
                    title: 'كشف حساب الراتب مع العمولات',
                    icon: Wallet,
                    colorClass: 'text-sky-600 bg-sky-50 dark:bg-sky-950/80 dark:text-sky-400 border-sky-200 dark:border-sky-800',
                    badge: 'راتب + عمولات',
                    accentBg: 'bg-sky-500'
                };
            case 'withdrawals':
                return {
                    title: 'سجل المسحوبات والسلف والمديونيات',
                    icon: TrendingDown,
                    colorClass: 'text-red-600 bg-red-50 dark:bg-red-950/80 dark:text-red-400 border-red-200 dark:border-red-800',
                    badge: 'مسحوبات وسلف',
                    accentBg: 'bg-red-500'
                };
        }
    };

    const config = getMetricConfig();
    const MetricIcon = config.icon;

    // Filter items based on search term and cardFilterType
    const filteredItems = items.filter(item => {
        if (isCardMetric && cardFilterType !== 'all') {
            if (item.isClearance || item.isWithdrawal) return false;
            const isWholesale = item.saleType === 'wholesale' || item.saleType === 'distributor' || Boolean(item.distributorId);
            if (cardFilterType === 'wholesale' && !isWholesale) return false;
            if (cardFilterType === 'retail' && isWholesale) return false;
        }

        if (!searchTerm.trim()) return true;
        const term = searchTerm.trim().toLowerCase();
        const invNum = (item.invoiceNumber || item.id || '').toString().toLowerCase();
        const name = (item.customerName || item.userName || item.categoryName || item.notes || item.createdBy || '').toString().toLowerCase();
        return invNum.includes(term) || name.includes(term);
    });

    const monthLabel = month === 'all' ? 'جميع الفترات' : `شهر: ${month}`;

    const handleDownloadPdf = async () => {
        setIsGeneratingPdf(true);
        try {
            const element = document.getElementById('employee-metric-report-content');
            if (!element) return;

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
            });

            const pdfWidth = 210;
            const pageHeight = 297;
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            const cleanEmpName = employeeName.replace(/\s+/g, '_');
            const fileName = `تقرير_${config.title}_${cleanEmpName}_${month}.pdf`;
            pdf.save(fileName);
        } catch (err) {
            console.error('Error generating PDF:', err);
            alert('حدث خطأ أثناء تحميل ملف PDF');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const handlePrintReport = () => {
        const element = document.getElementById('employee-metric-report-content');
        if (!element) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('الرجاء السماح بالنوافذ المنبثقة للطباعة');
            return;
        }

        printWindow.document.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="utf-8" />
                <title>تقرير ${config.title} - ${employeeName}</title>
                <style>
                    body {
                        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        padding: 20px;
                        direction: rtl;
                        text-align: right;
                        color: #1e293b;
                        background: #fff;
                    }
                    .report-header {
                        text-align: center;
                        margin-bottom: 20px;
                        border-bottom: 2px solid #6366f1;
                        padding-bottom: 12px;
                    }
                    .report-header h2 { margin: 0 0 6px 0; color: #1e293b; font-size: 20px; }
                    .report-header h3 { margin: 0; color: #4f46e5; font-size: 16px; }
                    .meta-grid {
                        display: grid;
                        grid-template-columns: repeat(2, 1fr);
                        gap: 12px;
                        margin-bottom: 20px;
                        background: #f8fafc;
                        padding: 12px 16px;
                        border-radius: 8px;
                        border: 1px solid #e2e8f0;
                        font-size: 12px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 15px;
                        font-size: 11px;
                    }
                    th, td {
                        border: 1px solid #cbd5e1;
                        padding: 8px 10px;
                        text-align: right;
                    }
                    th {
                        background-color: #f1f5f9;
                        font-weight: bold;
                        color: #334155;
                    }
                    .total-box {
                        margin-top: 20px;
                        background: #f0fdf4;
                        border: 1px solid #86efac;
                        padding: 12px;
                        border-radius: 8px;
                        text-align: left;
                        font-size: 14px;
                        font-weight: bold;
                        color: #166534;
                    }
                    .no-print-btn { display: none !important; }
                    @media print {
                        @page { margin: 10mm; size: A4; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="report-header">
                    <h2>${settings.businessName || 'المتجر'}</h2>
                    <h3>تفاصيل ${config.title}</h3>
                </div>
                ${element.innerHTML}
            </body>
            </html>
        `);

        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-3 overflow-y-auto" dir="rtl">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                
                {/* Modal Header */}
                <div className="p-3 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-xl border ${config.colorClass}`}>
                            <MetricIcon size={18} className="stroke-[2.2]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                                    {config.title}
                                </h2>
                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${config.colorClass}`}>
                                    {config.badge}
                                </span>
                            </div>
                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5">
                                الموظف: <span className="text-slate-800 dark:text-slate-200">{employeeName}</span> ({monthLabel})
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        {/* PDF Download Button */}
                        <button
                            type="button"
                            onClick={handleDownloadPdf}
                            disabled={isGeneratingPdf}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer disabled:opacity-50"
                            title="تحميل التقرير كملف PDF"
                        >
                            <Download size={14} />
                            <span className="hidden sm:inline">{isGeneratingPdf ? 'جاري التحميل...' : 'حفظ PDF'}</span>
                        </button>

                        {/* Print Button */}
                        <button
                            type="button"
                            onClick={handlePrintReport}
                            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer"
                            title="طباعة التقرير"
                        >
                            <Printer size={14} />
                            <span className="hidden sm:inline">طباعة</span>
                        </button>

                        {/* Close Button */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg transition cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Sub-Header Controls (Search & Card Category Sub-filters) */}
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2 flex-1">
                        <div className="relative flex-1 max-w-xs sm:max-w-sm">
                            <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="بحث برقم الفاتورة أو الاسم..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pr-7 pl-2 py-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                            />
                        </div>

                        {/* Card Sub-Filters (الكل / قطاعي / جملة) */}
                        {isCardMetric && (
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setCardFilterType('all')}
                                    className={`px-2 py-1 rounded-md text-[11px] font-extrabold transition cursor-pointer ${
                                        cardFilterType === 'all'
                                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    الكل ({items.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCardFilterType('retail')}
                                    className={`px-2 py-1 rounded-md text-[11px] font-extrabold transition cursor-pointer flex items-center gap-1 ${
                                        cardFilterType === 'retail'
                                            ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    <span>قطاعي ({retailItemsAll.length})</span>
                                    <span className="text-[9px] px-1 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded font-mono">10%</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCardFilterType('wholesale')}
                                    className={`px-2 py-1 rounded-md text-[11px] font-extrabold transition cursor-pointer flex items-center gap-1 ${
                                        cardFilterType === 'wholesale'
                                            ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    <span>جملة ({wholesaleItemsAll.length})</span>
                                    <span className="text-[9px] px-1 py-0.2 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded font-mono">0%</span>
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="text-xs font-extrabold text-slate-500 dark:text-slate-400 font-mono shrink-0 text-left">
                        العدد المعروض: <span className="text-indigo-600 dark:text-indigo-400">{filteredItems.length}</span>
                    </div>
                </div>

                {/* Modal Printable Content Body */}
                <div className="p-2 sm:p-3 overflow-y-auto flex-1 space-y-3 bg-slate-50/30 dark:bg-slate-950/20">
                    
                    {/* Element Target for html2canvas / print */}
                    <div id="employee-metric-report-content" className="p-2.5 sm:p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                        
                        {/* Special Summary Banner for Salary & Commissions */}
                        {metricType === 'salary_comm' && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-sky-50/60 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 rounded-xl">
                                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-sky-100 dark:border-sky-900/60">
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">الراتب الأساسي</span>
                                    <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white font-mono">
                                        {(summaryData.baseSalary || employeeSalary || 0).toLocaleString()} <span className="text-[10px] font-normal">ر.ي</span>
                                    </span>
                                </div>
 
                                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-sky-100 dark:border-sky-900/60">
                                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">+ العمولات المكتسبة (قطاعي)</span>
                                    <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                        +{(summaryData.totalCommissions || totRetailCommissions || 0).toLocaleString()} <span className="text-[10px] font-normal">ر.ي</span>
                                    </span>
                                </div>
 
                                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-sky-100 dark:border-sky-900/60">
                                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 block">- المسحوبات والسلف</span>
                                    <span className="text-sm sm:text-base font-black text-red-600 dark:text-red-400 font-mono">
                                        -{(summaryData.totalWithdrawals || 0).toLocaleString()} <span className="text-[10px] font-normal">ر.ي</span>
                                    </span>
                                </div>
 
                                <div className="p-2 bg-sky-600 text-white rounded-lg shadow-xs">
                                    <span className="text-[10px] font-bold opacity-90 block">صافي الراتب المستحق</span>
                                    <span className="text-sm sm:text-base font-black font-mono">
                                        {(summaryData.netPayable !== undefined ? summaryData.netPayable : ((summaryData.baseSalary || employeeSalary || 0) + (summaryData.totalCommissions || 0) - (summaryData.totalWithdrawals || 0))).toLocaleString()} <span className="text-[10px] font-normal">ر.ي</span>
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Special Summary Banner for Withdrawals */}
                        {metricType === 'withdrawals' && (
                            <div className="grid grid-cols-2 gap-2 p-2.5 bg-red-50/60 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl">
                                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-red-100 dark:border-red-900/60">
                                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 block">إجمالي المسحوبات والسلف</span>
                                    <span className="text-sm sm:text-base font-black text-red-600 dark:text-red-400 font-mono">
                                        {(summaryData.totalWithdrawals || summaryData.totalAmount || 0).toLocaleString()} <span className="text-[10px] font-normal">ر.ي</span>
                                    </span>
                                </div>

                                <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-red-100 dark:border-red-900/60">
                                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block">سقف السلف المسموح بها</span>
                                    <span className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-200 font-mono">
                                        {employeeMaxLimit > 0 ? `${employeeMaxLimit.toLocaleString()} ر.ي` : 'غير محدد'}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Special SEPARATED Total Header for Card Sales Metrics */}
                        {['card_cash', 'card_credit'].includes(metricType) && (
                            <div className="space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {/* 1. مبيعات القطاعي */}
                                    <div className="p-2.5 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-xl flex flex-col justify-between">
                                        <div className="flex items-center justify-between gap-1 mb-1">
                                            <span className="text-[11px] font-extrabold text-emerald-800 dark:text-emerald-300">
                                                مبيعات القطاعي ({totRetailQty} كرت)
                                            </span>
                                            <span className="text-[10px] font-black px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded">
                                                عمولة 10%
                                            </span>
                                        </div>
                                        <div className="flex items-baseline justify-between gap-1">
                                            <span className="text-sm sm:text-base font-black text-emerald-700 dark:text-emerald-400 font-mono">
                                                {totRetailAmount.toLocaleString()} ر.ي
                                            </span>
                                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                                عمولة: +{totRetailCommissions.toLocaleString()} ر.ي
                                            </span>
                                        </div>
                                    </div>

                                    {/* 2. مبيعات الجملة */}
                                    <div className="p-2.5 bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/70 rounded-xl flex flex-col justify-between">
                                        <div className="flex items-center justify-between gap-1 mb-1">
                                            <span className="text-[11px] font-extrabold text-purple-800 dark:text-purple-300">
                                                مبيعات الجملة ({totWholesaleQty} كرت)
                                            </span>
                                            <span className="text-[10px] font-black px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                                                بدون عمولة 0%
                                            </span>
                                        </div>
                                        <div className="flex items-baseline justify-between gap-1">
                                            <span className="text-sm sm:text-base font-black text-purple-700 dark:text-purple-400 font-mono">
                                                {totWholesaleAmount.toLocaleString()} ر.ي
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 font-mono">
                                                (0% عمولة)
                                            </span>
                                        </div>
                                    </div>

                                    {/* 3. إجمالي قيمة التقرير الشاملة */}
                                    <div className="p-2.5 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 rounded-xl flex flex-col justify-between">
                                        <div className="flex items-center justify-between gap-1 mb-1">
                                            <span className="text-[11px] font-extrabold text-indigo-900 dark:text-indigo-200">
                                                إجمالي قيمة التقرير ({config.title})
                                            </span>
                                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                                                {totRetailQty + totWholesaleQty} كرت
                                            </span>
                                        </div>
                                        <div className="flex items-baseline justify-between gap-1">
                                            <span className="text-base sm:text-lg font-black text-indigo-700 dark:text-indigo-300 font-mono">
                                                {grandCardsAmount.toLocaleString()} ر.ي
                                            </span>
                                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                                إجمالي العمولة: +{totRetailCommissions.toLocaleString()} ر.ي
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Special Total Header for General Sales Metrics */}
                        {['gen_cash', 'gen_credit'].includes(metricType) && (
                            <div className="flex items-center justify-between p-2.5 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                    إجمالي قيمة التقرير ({config.title}):
                                </span>
                                <span className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 font-mono">
                                    {summaryData.totalAmount.toLocaleString()} ر.س
                                </span>
                            </div>
                        )}

                        {/* TABLE CONTENT */}
                        {filteredItems.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 dark:text-slate-600 text-xs font-medium border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                                لا توجد سجلات مطابقة لهذه الفئة أو فترة الفلترة المحددة.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-max text-right text-xs whitespace-nowrap">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-extrabold bg-slate-50 dark:bg-slate-950 whitespace-nowrap">
                                            <th className="py-2.5 px-3 whitespace-nowrap">#</th>
                                            <th className="py-2.5 px-3 whitespace-nowrap">رقم الفاتورة</th>
                                            <th className="py-2.5 px-3 whitespace-nowrap">التاريخ والوقت</th>
                                            <th className="py-2.5 px-3 whitespace-nowrap">البيان</th>
                                            {isCardMetric && <th className="py-2.5 px-3 whitespace-nowrap">نوع البيع والعمولة</th>}
                                            {metricType === 'withdrawals' && <th className="py-2.5 px-3 whitespace-nowrap">الملاحظات</th>}
                                            {metricType === 'salary_comm' && <th className="py-2.5 px-3 whitespace-nowrap">العمولة المكتسبة</th>}
                                            <th className="py-2.5 px-3 whitespace-nowrap">المبلغ الإجمالي</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
                                        {filteredItems.slice(0, visibleCount).map((item, index) => {
                                            const isCard = metricType === 'card_cash' || metricType === 'card_credit' || metricType === 'salary_comm';
                                            let invNum = '';
                                            if (item.isClearance) {
                                                invNum = `تصفية #${item.clearanceNumber || item.voucherNumber || 'سند'}`;
                                            } else if (item.isWithdrawal) {
                                                invNum = `سحب #${item.withdrawalNumber || item.voucherNumber || 'سند'}`;
                                            } else if (item.isVoucher) {
                                                invNum = `سند #${item.voucherNumber || 'سند'}`;
                                            } else {
                                                invNum = item.invoiceNumber || (isCard ? `CARD-${(item.id || '').slice(0, 6)}` : (item.id || `#${index + 1}`));
                                            }

                                            const rawDate = item.createdAt || item.date || item.dateTime;
                                            const dateFormatted = rawDate ? (typeof rawDate === 'number' ? format(rawDate, 'yyyy/MM/dd HH:mm') : String(rawDate)) : '-';
                                            
                                            let partyOrCategory = '';
                                            if (item.isClearance) {
                                                partyOrCategory = item.notes || 'تصفية صندوق واستلام مبالغ للمدير';
                                            } else if (item.isWithdrawal) {
                                                partyOrCategory = item.notes || 'سحب سلفة نقداً للموظف';
                                            } else if (item.isVoucher) {
                                                partyOrCategory = `سند ${item.type === 'receipt' ? 'قبض' : 'صرف'} - ${item.partyName}: ${item.description || ''}`;
                                            } else {
                                                partyOrCategory = item.categoryName ? `${item.categoryName} (${item.quantity || 1} كرت)` : (item.customerName || item.userName || item.notes || 'عميل عام');
                                            }

                                            const isWholesale = item.saleType === 'wholesale' || item.saleType === 'distributor' || Boolean(item.distributorId);
                                            const cardComm = isWholesale ? 0 : (typeof item.commissionAmount === 'number' ? item.commissionAmount : ((Number(item.totalAmount) || 0) * (typeof item.commissionPercent === 'number' ? item.commissionPercent / 100 : 0.1)));
                                            
                                            let totalVal = 0;
                                            if (item.isClearance || item.isWithdrawal) {
                                                totalVal = -(Number(item.amount) || 0);
                                            } else if (item.isVoucher) {
                                                const amt = Number(item.amount) || 0;
                                                totalVal = item.type === 'receipt' ? -amt : amt;
                                            } else if (metricType === 'withdrawals') {
                                                totalVal = Number(item.amount) || 0;
                                            } else if (isCard) {
                                                totalVal = Number(item.totalAmount) || 0;
                                            } else {
                                                totalVal = Number(item.total) || 0;
                                            }

                                            const isClickable = Boolean(onPreviewInvoice && !item.isClearance && !item.isWithdrawal && metricType !== 'withdrawals' && metricType !== 'salary_comm');

                                            return (
                                                <tr 
                                                    key={item.id || index} 
                                                    onClick={() => {
                                                        if (!isClickable || !onPreviewInvoice) return;
                                                        if (isCard) {
                                                            onPreviewInvoice(
                                                                {
                                                                    ...item,
                                                                    invoiceNumber: invNum,
                                                                    date: typeof rawDate === 'number' ? rawDate : Date.now(),
                                                                    customerName: item.userName || 'مشتري بطاقات',
                                                                    total: totalVal,
                                                                    paidAmount: totalVal,
                                                                    paymentType: metricType === 'card_credit' ? 'credit' : 'cash',
                                                                    sellerName: employeeName
                                                                },
                                                                'card_sale',
                                                                [{
                                                                    name: item.categoryName || 'بطاقة شبكة',
                                                                    quantity: item.quantity || 1,
                                                                    price: totalVal ? (totalVal / (item.quantity || 1)) : 0,
                                                                    total: totalVal
                                                                }]
                                                            );
                                                        } else {
                                                            onPreviewInvoice(
                                                                {
                                                                    ...item,
                                                                    invoiceNumber: invNum,
                                                                    date: typeof rawDate === 'number' ? rawDate : Date.now(),
                                                                    customerName: item.customerName || 'عميل عام',
                                                                    total: totalVal,
                                                                    paidAmount: item.paidAmount || totalVal,
                                                                    paymentType: item.paymentType || 'cash',
                                                                    sellerName: employeeName
                                                                },
                                                                'sale',
                                                                item.items || []
                                                            );
                                                        }
                                                    }}
                                                    className={`whitespace-nowrap transition ${
                                                        isClickable 
                                                            ? 'hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 cursor-pointer group' 
                                                            : 'hover:bg-slate-50 dark:hover:bg-slate-950/50'
                                                    }`}
                                                    title={isClickable ? 'انقر لمعاينة الفاتورة' : undefined}
                                                >
                                                    <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px] whitespace-nowrap">{index + 1}</td>
                                                    <td className={`py-2.5 px-3 font-mono font-bold whitespace-nowrap ${item.isClearance || item.isWithdrawal || (item.isVoucher && item.type === 'payment') ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                                                        {invNum}
                                                    </td>
                                                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                                                        {dateFormatted}
                                                    </td>
                                                    <td className={`py-2.5 px-3 font-extrabold whitespace-nowrap ${item.isClearance || item.isWithdrawal || (item.isVoucher && item.type === 'payment') ? 'text-rose-700/90 dark:text-rose-300/90' : 'text-slate-800 dark:text-slate-200'}`}>
                                                        {partyOrCategory}
                                                    </td>

                                                    {isCardMetric && (
                                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                                            {item.isClearance ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-black font-sans">
                                                                    تصفية واستلام (مدير)
                                                                </span>
                                                            ) : item.isWithdrawal ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-[10px] font-black font-sans">
                                                                    سحب نقدي (سلفة)
                                                                </span>
                                                            ) : item.isVoucher ? (
                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-black font-sans ${
                                                                    item.type === 'receipt' 
                                                                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                                                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                                                                }`}>
                                                                    سند {item.type === 'receipt' ? 'قبض' : 'صرف'}
                                                                </span>
                                                            ) : isWholesale ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[10px] font-black">
                                                                    جملة (بدون عمولة 0%)
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-black font-mono">
                                                                    قطاعي (عمولة: +{cardComm.toFixed(2)} ر.ي)
                                                                </span>
                                                            )}
                                                        </td>
                                                    )}

                                                    {metricType === 'withdrawals' && (
                                                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                            {item.notes || 'سحب سلفة'}
                                                        </td>
                                                    )}

                                                    {metricType === 'salary_comm' && (
                                                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                            +{(cardComm).toFixed(2)} ر.ي
                                                        </td>
                                                    )}

                                                    <td className={`py-2.5 px-3 font-black font-mono whitespace-nowrap ${item.isClearance || item.isWithdrawal || (item.isVoucher && item.type === 'receipt') ? 'text-rose-600 dark:text-rose-400 font-extrabold' : 'text-slate-900 dark:text-white'}`}>
                                                        {totalVal.toLocaleString()} {['card_cash', 'card_credit', 'salary_comm', 'withdrawals'].includes(metricType) ? 'ر.ي' : 'ر.س'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* Pagination: Load More Button */}
                                {visibleCount < filteredItems.length && (
                                    <div className="py-4 flex justify-center border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                                        <button
                                            type="button"
                                            onClick={() => setVisibleCount(prev => prev + 10)}
                                            className="flex items-center gap-2 px-6 py-2 bg-white dark:bg-slate-800 border-2 border-indigo-100 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-black shadow-sm hover:bg-indigo-50 dark:hover:bg-slate-700/80 transition active:scale-95 cursor-pointer"
                                        >
                                            <RefreshCw size={14} className="animate-spin-slow" />
                                            <span>عرض المزيد من السجلات ({filteredItems.length - visibleCount} متبقية)</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
