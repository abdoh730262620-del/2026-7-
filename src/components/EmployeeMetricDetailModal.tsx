import React, { useState } from 'react';
import { X, FileText, Printer, Search, Download, ShoppingBag, CreditCard, Wifi, Wallet, TrendingDown, Eye, CheckCircle2, Banknote, Sparkles, AlertTriangle } from 'lucide-react';
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
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    if (!isOpen) return null;

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

    // Filter items based on search term
    const filteredItems = items.filter(item => {
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

                {/* Sub-Header Controls (Search) */}
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 shrink-0">
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
                    <div className="text-xs font-extrabold text-slate-500 dark:text-slate-400 font-mono shrink-0">
                        العدد: <span className="text-indigo-600 dark:text-indigo-400">{filteredItems.length}</span>
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
                                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block">+ العمولات المكتسبة</span>
                                    <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                                        +{(summaryData.totalCommissions || 0).toLocaleString()} <span className="text-[10px] font-normal">ر.ي</span>
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

                        {/* Special Total Header for Sales Metrics */}
                        {['gen_cash', 'gen_credit', 'card_cash', 'card_credit'].includes(metricType) && (
                            <div className="flex items-center justify-between p-2.5 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                    إجمالي قيمة التقرير ({config.title}):
                                </span>
                                <span className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 font-mono">
                                    {summaryData.totalAmount.toLocaleString()} {['card_cash', 'card_credit'].includes(metricType) ? 'ر.ي' : 'ر.س'}
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
                                <table className="w-full text-right text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-extrabold bg-slate-50 dark:bg-slate-950">
                                            <th className="py-2.5 px-3">#</th>
                                            <th className="py-2.5 px-3">الرقم / البيان</th>
                                            <th className="py-2.5 px-3">التاريخ والوقت</th>
                                            <th className="py-2.5 px-3">التفاصيل / الجهة</th>
                                            {metricType === 'withdrawals' && <th className="py-2.5 px-3">الملاحظات</th>}
                                            {metricType === 'salary_comm' && <th className="py-2.5 px-3">العمولة المكتسبة</th>}
                                            <th className="py-2.5 px-3">المبلغ الإجمالي</th>
                                            {onPreviewInvoice && metricType !== 'withdrawals' && metricType !== 'salary_comm' && (
                                                <th className="py-2.5 px-3 text-center no-print-btn">معاينة</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-medium">
                                        {filteredItems.map((item, index) => {
                                            const isCard = metricType === 'card_cash' || metricType === 'card_credit' || metricType === 'salary_comm';
                                            const invNum = item.invoiceNumber || (isCard ? `CARD-${(item.id || '').slice(0, 6)}` : (item.id || `#${index + 1}`));
                                            const rawDate = item.createdAt || item.date || item.dateTime;
                                            const dateFormatted = rawDate ? (typeof rawDate === 'number' ? format(rawDate, 'yyyy/MM/dd HH:mm') : String(rawDate)) : '-';
                                            const partyOrCategory = item.categoryName ? `${item.categoryName} (${item.quantity || 1} كرت)` : (item.customerName || item.userName || item.notes || 'عميل عام');
                                            
                                            let totalVal = 0;
                                            if (metricType === 'withdrawals') {
                                                totalVal = Number(item.amount) || 0;
                                            } else if (isCard) {
                                                totalVal = Number(item.totalAmount) || 0;
                                            } else {
                                                totalVal = Number(item.total) || 0;
                                            }

                                            return (
                                                <tr key={item.id || index} className="hover:bg-slate-50 dark:hover:bg-slate-950/50">
                                                    <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">{index + 1}</td>
                                                    <td className="py-2.5 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                        {invNum}
                                                    </td>
                                                    <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">
                                                        {dateFormatted}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-extrabold">
                                                        {partyOrCategory}
                                                    </td>

                                                    {metricType === 'withdrawals' && (
                                                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                                                            {item.notes || 'سحب سلفة'}
                                                        </td>
                                                    )}

                                                    {metricType === 'salary_comm' && (
                                                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                            +{(Number(item.commissionAmount) || 0).toFixed(2)} ر.ي
                                                        </td>
                                                    )}

                                                    <td className="py-2.5 px-3 font-black font-mono text-slate-900 dark:text-white">
                                                        {totalVal.toLocaleString()} {['card_cash', 'card_credit', 'salary_comm', 'withdrawals'].includes(metricType) ? 'ر.ي' : 'ر.س'}
                                                    </td>

                                                    {onPreviewInvoice && metricType !== 'withdrawals' && metricType !== 'salary_comm' && (
                                                        <td className="py-2.5 px-3 text-center no-print-btn">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
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
                                                                className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition"
                                                            >
                                                                <Eye size={12} />
                                                                معاينة
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
