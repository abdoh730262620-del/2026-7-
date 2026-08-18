import React, { useState, useMemo } from 'react';
import { 
    X, Printer, Download, Filter, Search, Calendar, Banknote, 
    ArrowDownLeft, ArrowRightLeft, Users, Building, FileSpreadsheet,
    CheckCircle2, RefreshCw, Layers
} from 'lucide-react';
import { format } from 'date-fns';
import { useSettingsStore } from '../store/settingsStore';

export interface WithdrawalItem {
    id: string;
    employeeId: string;
    employeeName: string;
    employeeRole: string;
    amount: number;
    notes: string;
    date: number;
    createdBy: string;
    sourceFund: 'network_cashbox' | 'general_cashbox';
    withdrawnFromEmployeeId?: string;
    withdrawnFromEmployeeName?: string;
    withdrawnFromEmployeeRole?: string;
}

export interface EmployeeInfo {
    id: string;
    name: string;
    role: string;
    email?: string;
    salary?: number;
    maxWithdrawalLimit?: number;
}

interface EmployeeWithdrawalsReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    withdrawals: WithdrawalItem[];
    employees: EmployeeInfo[];
    initialEmployeeId?: string;
}

export function EmployeeWithdrawalsReportModal({
    isOpen,
    onClose,
    withdrawals,
    employees,
    initialEmployeeId
}: EmployeeWithdrawalsReportModalProps) {
    const settings = useSettingsStore(state => state.settings);
    const exchangeRate = settings.yemeniExchangeRate || 140;

    // Filters
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(initialEmployeeId || 'all');
    const [dateRangePreset, setDateRangePreset] = useState<'all' | 'today' | 'this_month' | 'last_month' | 'custom'>('all');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [sourceFundFilter, setSourceFundFilter] = useState<'all' | 'network_cashbox' | 'general_cashbox'>('all');
    const [searchTerm, setSearchTerm] = useState<string>('');

    // Quick Date preset handler
    const handlePresetChange = (preset: 'all' | 'today' | 'this_month' | 'last_month' | 'custom') => {
        setDateRangePreset(preset);
        const now = new Date();
        if (preset === 'all') {
            setStartDate('');
            setEndDate('');
        } else if (preset === 'today') {
            const todayStr = format(now, 'yyyy-MM-dd');
            setStartDate(todayStr);
            setEndDate(todayStr);
        } else if (preset === 'this_month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setStartDate(format(firstDay, 'yyyy-MM-dd'));
            setEndDate(format(lastDay, 'yyyy-MM-dd'));
        } else if (preset === 'last_month') {
            const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
            setStartDate(format(firstDay, 'yyyy-MM-dd'));
            setEndDate(format(lastDay, 'yyyy-MM-dd'));
        }
    };

    // Filtered data calculation
    const filteredWithdrawals = useMemo(() => {
        return withdrawals.filter(w => {
            // Employee filter
            if (selectedEmployeeId !== 'all' && w.employeeId !== selectedEmployeeId) {
                return false;
            }

            // Source fund filter
            if (sourceFundFilter !== 'all' && w.sourceFund !== sourceFundFilter) {
                return false;
            }

            // Date filtering
            if (w.date) {
                const itemDateStr = format(new Date(w.date), 'yyyy-MM-dd');
                if (startDate && itemDateStr < startDate) return false;
                if (endDate && itemDateStr > endDate) return false;
            }

            // Search term (employee name, notes, createdBy, withdrawnFromEmployeeName)
            if (searchTerm.trim()) {
                const q = searchTerm.toLowerCase();
                const matchName = (w.employeeName || '').toLowerCase().includes(q);
                const matchNotes = (w.notes || '').toLowerCase().includes(q);
                const matchCreatedBy = (w.createdBy || '').toLowerCase().includes(q);
                const matchFromEmp = (w.withdrawnFromEmployeeName || '').toLowerCase().includes(q);
                if (!matchName && !matchNotes && !matchCreatedBy && !matchFromEmp) {
                    return false;
                }
            }

            return true;
        }).sort((a, b) => (b.date || 0) - (a.date || 0));
    }, [withdrawals, selectedEmployeeId, sourceFundFilter, startDate, endDate, searchTerm]);

    // Financial Metrics
    const totalAmountYER = useMemo(() => {
        return filteredWithdrawals.reduce((sum, w) => sum + (parseFloat(String(w.amount)) || 0), 0);
    }, [filteredWithdrawals]);

    const totalAmountSAR = useMemo(() => {
        return totalAmountYER / exchangeRate;
    }, [totalAmountYER, exchangeRate]);

    const generalFundTotalYER = useMemo(() => {
        return filteredWithdrawals
            .filter(w => w.sourceFund === 'general_cashbox')
            .reduce((sum, w) => sum + (parseFloat(String(w.amount)) || 0), 0);
    }, [filteredWithdrawals]);

    const networkFundTotalYER = useMemo(() => {
        return filteredWithdrawals
            .filter(w => w.sourceFund === 'network_cashbox')
            .reduce((sum, w) => sum + (parseFloat(String(w.amount)) || 0), 0);
    }, [filteredWithdrawals]);

    const uniqueEmployeesCount = useMemo(() => {
        const set = new Set(filteredWithdrawals.map(w => w.employeeId));
        return set.size;
    }, [filteredWithdrawals]);

    // Export & Print Report to PDF
    const handlePrintReport = () => {
        const printWin = window.open('', '_blank', 'width=950,height=850');
        if (!printWin) {
            alert('يرجى السماح بالنوافذ المنبثقة لطباعة التقرير');
            return;
        }

        const selectedEmpName = selectedEmployeeId === 'all' 
            ? 'كافة الموظفين' 
            : (employees.find(e => e.id === selectedEmployeeId)?.name || 'موظف محدد');

        const dateRangeTitle = startDate && endDate 
            ? `الفترة من: ${startDate} إلى: ${endDate}` 
            : startDate ? `من تاريخ: ${startDate}` 
            : endDate ? `حتى تاريخ: ${endDate}` 
            : 'كافة الفترات المسجلة';

        const fundTitle = sourceFundFilter === 'all' 
            ? 'جميع الصناديق' 
            : sourceFundFilter === 'network_cashbox' ? 'صندوق كروت الشبكات' : 'الصندوق العام للمحل';

        const rowsHtml = filteredWithdrawals.map((w, idx) => {
            const dateStr = w.date ? format(new Date(w.date), 'yyyy/MM/dd HH:mm') : '-';
            const amt = parseFloat(String(w.amount)) || 0;
            const fundName = w.sourceFund === 'network_cashbox' ? 'صندوق الشبكات' : 'الصندوق العام';
            const isTransfer = !!w.withdrawnFromEmployeeName;
            const fromInfo = isTransfer ? `صُرف من: ${w.withdrawnFromEmployeeName}` : fundName;

            return `
                <tr>
                    <td style="padding: 7px 5px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">${idx + 1}</td>
                    <td style="padding: 7px 5px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">${dateStr}</td>
                    <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; font-size: 12px;">${w.employeeName}</td>
                    <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #dc2626; font-size: 12px;">${amt.toLocaleString()} ر.ي</td>
                    <td style="padding: 7px 8px; border: 1px solid #cbd5e1; text-align: right; font-size: 11px;">${w.notes || 'سحب سلفة'}</td>
                    <td style="padding: 7px 6px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">${fromInfo}</td>
                    <td style="padding: 7px 6px; border: 1px solid #cbd5e1; text-align: center; font-size: 11px;">${w.createdBy || '-'}</td>
                </tr>
            `;
        }).join('');

        const storeName = settings.businessName || 'مؤسسة نقاط البيع';

        const html = `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>تقرير تفصيلي بسحوبات وخصومات الموظفين</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; color: #1e293b; direction: rtl; }
                    .header-box { border-bottom: 2px solid #334155; padding-bottom: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; }
                    .title { font-size: 18px; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
                    .subtitle { font-size: 12px; color: #64748b; }
                    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px; }
                    .summary-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; text-align: center; }
                    .summary-card .label { font-size: 10px; color: #64748b; margin-bottom: 3px; }
                    .summary-card .val { font-size: 14px; font-weight: bold; color: #0f172a; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th { background-color: #f1f5f9; color: #334155; padding: 8px; border: 1px solid #cbd5e1; font-size: 11px; text-align: center; }
                    .footer-box { margin-top: 30px; display: flex; justify-content: space-between; padding-top: 15px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #475569; }
                    @media print {
                        body { margin: 10mm; }
                        button { display: none !important; }
                    }
                </style>
            </head>
            <body>
                <div class="header-box">
                    <div>
                        <div class="title">${storeName}</div>
                        <div class="subtitle">تقرير تفصيلي بسحوبات وخصومات الموظفين</div>
                        <div class="subtitle" style="margin-top: 3px;">الموظف: <b>${selectedEmpName}</b> | ${dateRangeTitle} | ${fundTitle}</div>
                    </div>
                    <div style="text-align: left; font-size: 11px; color: #64748b;">
                        <div>تاريخ التصدير: ${format(new Date(), 'yyyy/MM/dd HH:mm')}</div>
                        <div>سعر الصرف: 1 ر.س = ${exchangeRate} ر.ي</div>
                    </div>
                </div>

                <div class="summary-grid">
                    <div class="summary-card">
                        <div class="label">إجمالي السحوبات (ر.ي)</div>
                        <div class="val" style="color: #dc2626;">${totalAmountYER.toLocaleString()} ر.ي</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">المعادل بالريال السعودي</div>
                        <div class="val" style="color: #4f46e5;">${totalAmountSAR.toFixed(2)} ر.س</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">عدد العمليات</div>
                        <div class="val">${filteredWithdrawals.length} عملية</div>
                    </div>
                    <div class="summary-card">
                        <div class="label">عدد الموظفين المشمولين</div>
                        <div class="val">${uniqueEmployeesCount} موظف</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 35px;">#</th>
                            <th style="width: 110px;">التاريخ والوقت</th>
                            <th>اسم الموظف</th>
                            <th style="width: 110px;">مبلغ السحب</th>
                            <th>البيان والملاحظات</th>
                            <th style="width: 130px;">جهة الصرف / الخصم</th>
                            <th style="width: 90px;">القائم بالصرف</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #64748b;">لا توجد عمليات سحب مطابقة للفترة المحددة</td></tr>'}
                    </tbody>
                </table>

                <div class="footer-box">
                    <div>إعداد وتدقيق: _____________________</div>
                    <div>اعتماد الإدارة: _____________________</div>
                    <div>توقيع الموظف المستلم: _____________________</div>
                </div>

                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                        }, 500);
                    };
                </script>
            </body>
            </html>
        `;

        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-[9999] transition-all animate-in fade-in duration-200"
            dir="rtl"
        >
            <div 
                className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 overflow-hidden"
            >
                {/* Modal Header */}
                <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-950/40">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            <FileSpreadsheet size={20} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2 truncate">
                                <span>تقرير سحوبات وخصومات الموظفين التفصيلي</span>
                            </h2>
                            <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                                سجل شامل لكافة السلف والمسحوبات، وتوزيع جهات الخصم المالي
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={handlePrintReport}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                            title="طباعة وتصدير التقرير PDF"
                        >
                            <Printer size={14} />
                            <span className="hidden xs:inline">طباعة / PDF</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Filter Controls Bar */}
                <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
                    {/* Top Row: Quick Date Presets & Employee Selector */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        {/* 1. Employee Filter */}
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                                الموظف المستفيد
                            </label>
                            <select
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none focus:border-indigo-500 cursor-pointer"
                            >
                                <option value="all">🌐 كافة الموظفين ({employees.length})</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>
                                        👤 {emp.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* 2. Source Fund Filter */}
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                                جهة الصرف / الخصم
                            </label>
                            <select
                                value={sourceFundFilter}
                                onChange={(e) => setSourceFundFilter(e.target.value as any)}
                                className="w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none focus:border-indigo-500 cursor-pointer"
                            >
                                <option value="all">🏦 كافة الصناديق</option>
                                <option value="general_cashbox">🏪 الصندوق العام للمحل</option>
                                <option value="network_cashbox">📶 صندوق كروت الشبكات</option>
                            </select>
                        </div>

                        {/* 3. Date Presets */}
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                                الفترة الزمنية
                            </label>
                            <select
                                value={dateRangePreset}
                                onChange={(e) => handlePresetChange(e.target.value as any)}
                                className="w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none focus:border-indigo-500 cursor-pointer"
                            >
                                <option value="all">🗓️ كافة الفترات</option>
                                <option value="today">⚡ اليوم</option>
                                <option value="this_month">📅 هذا الشهر</option>
                                <option value="last_month">⏳ الشهر السابق</option>
                                <option value="custom">🛠️ تحديد فترة مخصصة</option>
                            </select>
                        </div>

                        {/* 4. Instant Search Input */}
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                                بحث فوري بالبيان أو المحرر
                            </label>
                            <div className="relative">
                                <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="بحث بالملاحظات أو الاسم..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pr-7 pl-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Custom Date Pickers (if active) */}
                    {dateRangePreset === 'custom' && (
                        <div className="p-2 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/50 flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-bold text-indigo-900 dark:text-indigo-300 text-[11px]">فترة مخصصة:</span>
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500">من:</span>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-mono"
                                />
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-slate-500">إلى:</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs font-mono"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Summary Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800 shrink-0">
                    {/* 1. Total YER */}
                    <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">إجمالي المسحوبات (ر.ي)</div>
                        <div className="text-sm sm:text-base font-black font-mono text-red-600 dark:text-red-400 mt-0.5">
                            {totalAmountYER.toLocaleString()} <span className="text-[10px]">ر.ي</span>
                        </div>
                    </div>

                    {/* 2. Total SAR Equivalent */}
                    <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">المعادل بالسعودي (ر.س)</div>
                        <div className="text-sm sm:text-base font-black font-mono text-indigo-600 dark:text-indigo-400 mt-0.5">
                            {totalAmountSAR.toFixed(2)} <span className="text-[10px]">ر.س</span>
                        </div>
                    </div>

                    {/* 3. General vs Network Fund Split */}
                    <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">حسب الصناديق</div>
                        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 space-y-0.5 mt-0.5">
                            <div>عام: <span className="font-mono text-amber-600 font-black">{generalFundTotalYER.toLocaleString()}</span></div>
                            <div>شبكات: <span className="font-mono text-emerald-600 font-black">{networkFundTotalYER.toLocaleString()}</span></div>
                        </div>
                    </div>

                    {/* 4. Transactions Count */}
                    <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">عدد العمليات والموظفين</div>
                        <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                            {filteredWithdrawals.length} <span className="text-[10px] font-normal text-slate-500">عملية لـ</span> {uniqueEmployeesCount} <span className="text-[10px] font-normal text-slate-500">موظف</span>
                        </div>
                    </div>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-y-auto p-3">
                    {filteredWithdrawals.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <Banknote size={40} className="mx-auto mb-2 opacity-40" />
                            <p className="text-xs font-bold">لا توجد عمليات سحب أو خصومات مطابقة للفلترة المحددة</p>
                        </div>
                    ) : (
                        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                            <table className="w-full text-right text-xs">
                                <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                                        <th className="p-2.5 text-center w-10">#</th>
                                        <th className="p-2.5 text-center">التاريخ والوقت</th>
                                        <th className="p-2.5">الموظف المستفيد</th>
                                        <th className="p-2.5 text-center">مبلغ السحب</th>
                                        <th className="p-2.5">البيان والملاحظات</th>
                                        <th className="p-2.5 text-center">جهة الصرف / الخصم</th>
                                        <th className="p-2.5 text-center">المحرر</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                                    {filteredWithdrawals.map((w, idx) => {
                                        const dateStr = w.date ? format(new Date(w.date), 'yyyy/MM/dd HH:mm') : '-';
                                        const amt = parseFloat(String(w.amount)) || 0;
                                        const isTransfer = !!w.withdrawnFromEmployeeName;

                                        return (
                                            <tr key={w.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                                                <td className="p-2.5 text-center font-mono text-[11px] text-slate-400">
                                                    {idx + 1}
                                                </td>
                                                <td className="p-2.5 text-center font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                    {dateStr}
                                                </td>
                                                <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                                                    <div className="flex items-center gap-1.5">
                                                        <span>{w.employeeName}</span>
                                                        {w.employeeRole && (
                                                            <span className="text-[9px] font-normal px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded">
                                                                {w.employeeRole}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-2.5 text-center font-black font-mono text-red-600 dark:text-red-400 whitespace-nowrap">
                                                    {amt.toLocaleString()} <span className="text-[10px] font-normal">ر.ي</span>
                                                </td>
                                                <td className="p-2.5 text-slate-700 dark:text-slate-300">
                                                    {w.notes || 'سحب سلفة'}
                                                </td>
                                                <td className="p-2.5 text-center">
                                                    {isTransfer ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                                                            <ArrowRightLeft size={10} />
                                                            صندوق: {w.withdrawnFromEmployeeName}
                                                        </span>
                                                    ) : w.sourceFund === 'network_cashbox' ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                                                            صندوق الشبكات
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900">
                                                            الصندوق العام
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-2.5 text-center text-[11px] text-slate-500 font-mono">
                                                    {w.createdBy || '-'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        إجمالي النتائج: <span className="font-mono text-slate-900 dark:text-white font-black">{filteredWithdrawals.length}</span> عملية سحب
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer"
                    >
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
    );
}
