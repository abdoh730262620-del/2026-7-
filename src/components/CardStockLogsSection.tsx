import React, { useState, useMemo } from 'react';
import { 
    Layers, Search, Calendar, Printer, Eye, ChevronDown, ChevronUp, 
    Filter, Plus, RefreshCw, FileText, UserCheck, ArrowUpRight, ArrowDownLeft, X, Sparkles
} from 'lucide-react';
import { CardStockLog, CardCategory } from '../types/cardTypes';
import { printReport } from '../lib/printHelper';

interface CardStockLogsSectionProps {
    stockLogs: CardStockLog[];
    categories: CardCategory[];
    canAdd?: boolean;
    onOpenAddModal?: () => void;
    onOpenExchangeModal?: () => void;
}

export const CardStockLogsSection: React.FC<CardStockLogsSectionProps> = ({
    stockLogs,
    categories,
    canAdd = true,
    onOpenAddModal,
    onOpenExchangeModal
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'addition' | 'reduction'>('all');
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [expandedLogs, setExpandedLogs] = useState<{ [key: string]: boolean }>({});
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const toggleExpand = (id: string) => {
        setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Filter stock logs
    const filteredLogs = useMemo(() => {
        return stockLogs.filter(log => {
            // Search text
            if (searchTerm.trim()) {
                const term = searchTerm.trim().toLowerCase();
                const matchCat = log.categoryName?.toLowerCase().includes(term);
                const matchUser = log.userName?.toLowerCase().includes(term);
                const matchNotes = log.notes?.toLowerCase().includes(term);
                if (!matchCat && !matchUser && !matchNotes) return false;
            }

            // Category filter
            if (selectedCategoryFilter) {
                if (log.categoryId !== selectedCategoryFilter && log.categoryName !== selectedCategoryFilter) {
                    return false;
                }
            }

            // Type filter
            if (typeFilter === 'addition' && (log.quantityAdded || 0) <= 0) return false;
            if (typeFilter === 'reduction' && (log.quantityAdded || 0) >= 0) return false;

            // Date filtering
            const logDate = log.additionDate ? log.additionDate.split(' ')[0] : '';
            if (startDate && logDate && logDate < startDate) return false;
            if (endDate && logDate && logDate > endDate) return false;

            return true;
        });
    }, [stockLogs, searchTerm, selectedCategoryFilter, typeFilter, startDate, endDate]);

    // KPI Aggregates
    const stats = useMemo(() => {
        const totalOps = filteredLogs.length;
        const totalAdded = filteredLogs.filter(l => (l.quantityAdded || 0) > 0).reduce((sum, l) => sum + (l.quantityAdded || 0), 0);
        const totalReduced = Math.abs(filteredLogs.filter(l => (l.quantityAdded || 0) < 0).reduce((sum, l) => sum + (l.quantityAdded || 0), 0));
        const totalCurrentStock = categories.reduce((sum, c) => sum + (c.availableCount || 0), 0);

        return {
            totalOps,
            totalAdded,
            totalReduced,
            totalCurrentStock
        };
    }, [filteredLogs, categories]);

    // Pagination
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
    const paginatedLogs = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredLogs.slice(start, start + itemsPerPage);
    }, [filteredLogs, currentPage, itemsPerPage]);

    // Print PDF Report
    const handlePrintReport = () => {
        const title = 'تقرير سجل إضافة وتعديل رصيد الكروت';
        const headers = [
            'فئة الكرت',
            'نوع العملية',
            'الكمية',
            'الرصيد بعد العملية',
            'التاريخ والوقت',
            'المستخدم المسؤول'
        ];

        const data = filteredLogs.map(log => {
            const isNegative = (log.quantityAdded || 0) < 0;
            return [
                log.categoryName || 'فئة غير محددة',
                isNegative ? 'سحب / استبدال' : 'إضافة رصيد',
                `${isNegative ? '' : '+'}${log.quantityAdded} كارت`,
                `${log.availableCountAfter || 0} كارت`,
                log.additionDate || '--',
                log.userName || 'النظام'
            ];
        });

        data.push([
            'الإجمالي',
            `${stats.totalOps} عملية`,
            `+${stats.totalAdded} / -${stats.totalReduced}`,
            `${stats.totalCurrentStock} كارت حالي`,
            '--',
            '--'
        ]);

        printReport(title, headers, data);
    };

    return (
        <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-200" dir="rtl">
            {/* Quick Action Navigation Cards */}
            {canAdd && (
                <div className="space-y-3">
                    <h3 className="text-xs sm:text-sm font-black text-slate-400 dark:text-slate-500 mr-1">العمليات السريعة للمخزون</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                        {/* Card 1: إضافة رصيد كروت جديد */}
                        {onOpenAddModal && (
                            <div
                                onClick={onOpenAddModal}
                                className="group flex flex-col items-center justify-center text-center p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 bg-white dark:bg-slate-900 transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1 cursor-pointer aspect-square"
                            >
                                <div className="flex flex-col items-center">
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2.5 sm:mb-3 transition-transform group-hover:scale-110 border border-indigo-100 dark:border-indigo-900/50">
                                        <Plus className="w-6 h-6 sm:w-7 sm:h-7" />
                                    </div>
                                    <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-tight mb-1">
                                        إضافة رصيد كروت جديد
                                    </h3>
                                    <p className="text-[10px] font-bold text-slate-400 max-w-[140px] leading-relaxed hidden sm:block">
                                        تزويد المخزن عبر تسجيل فواتير شراء من الموردين
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Card 2: استبدال كروت */}
                        {onOpenExchangeModal && (
                            <div
                                onClick={onOpenExchangeModal}
                                className="group flex flex-col items-center justify-center text-center p-4 sm:p-5 rounded-2xl sm:rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-purple-500 dark:hover:border-purple-500 bg-white dark:bg-slate-900 transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1 cursor-pointer aspect-square"
                            >
                                <div className="flex flex-col items-center">
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2.5 sm:mb-3 transition-transform group-hover:scale-110 border border-purple-100 dark:border-purple-900/50">
                                        <RefreshCw className="w-6 h-6 sm:w-7 sm:h-7" />
                                    </div>
                                    <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-tight mb-1">
                                        استبدال كروت المخزون
                                    </h3>
                                    <p className="text-[10px] font-bold text-slate-400 max-w-[140px] leading-relaxed hidden sm:block">
                                        تبديل فئات كروت المخزون وحساب الفارق المالي تلقائياً
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Header & Controls Bar (Same style as CardSalesSection) */}
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/50 shrink-0">
                            <Layers size={22} className="sm:hidden" />
                            <Layers size={26} className="hidden sm:block" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">سجل إضافة وتعديل رصيد الكروت</h2>
                            <p className="text-[11px] sm:text-xs font-bold text-slate-400">
                                تتبع تفصيلي لكافة عمليات تزويد الرصيد والتوريدات مع اسم المستخدم والرصيد التراكمي
                            </p>
                        </div>
                    </div>

                    <div className="w-full sm:w-auto flex items-center gap-2">
                        <button
                            onClick={handlePrintReport}
                            className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl sm:rounded-2xl shadow-sm flex items-center justify-center gap-2 transition active:scale-95"
                        >
                            <Printer size={15} />
                            <span>طباعة السجل</span>
                        </button>
                    </div>
                </div>

                {/* Search & Quick Filter Bar */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="بحث باسم الفئة، المستخدم، أو البيان..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl pr-9 pl-3 py-2 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <select
                            value={selectedCategoryFilter}
                            onChange={(e) => {
                                setSelectedCategoryFilter(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-600 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                            <option value="">جميع الفئات</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>

                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`px-3 py-2 rounded-xl sm:rounded-2xl border text-xs font-black flex items-center gap-1.5 transition shrink-0 ${
                                showFilters || startDate || endDate || typeFilter !== 'all'
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-400'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                            }`}
                        >
                            <Filter size={14} />
                            <span>تصفية</span>
                        </button>
                    </div>
                </div>

                {/* Extended Collapsible Filters */}
                {showFilters && (
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-500">نوع الحركة:</span>
                            <div className="flex bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                <button
                                    onClick={() => { setTypeFilter('all'); setCurrentPage(1); }}
                                    className={`px-2.5 py-1 text-[11px] font-black rounded ${typeFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
                                >
                                    الكل
                                </button>
                                <button
                                    onClick={() => { setTypeFilter('addition'); setCurrentPage(1); }}
                                    className={`px-2.5 py-1 text-[11px] font-black rounded ${typeFilter === 'addition' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
                                >
                                    إضافة فقط
                                </button>
                                <button
                                    onClick={() => { setTypeFilter('reduction'); setCurrentPage(1); }}
                                    className={`px-2.5 py-1 text-[11px] font-black rounded ${typeFilter === 'reduction' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}
                                >
                                    سحب / استبدال
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-500">من تاريخ:</span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold outline-none text-slate-900 dark:text-white"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-500">إلى تاريخ:</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold outline-none text-slate-900 dark:text-white"
                            />
                        </div>

                        {(startDate || endDate || typeFilter !== 'all' || selectedCategoryFilter || searchTerm) && (
                            <button
                                onClick={() => {
                                    setStartDate('');
                                    setEndDate('');
                                    setTypeFilter('all');
                                    setSelectedCategoryFilter('');
                                    setSearchTerm('');
                                    setCurrentPage(1);
                                }}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[11px] font-black rounded-lg transition"
                            >
                                إعادة تعيين
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Quick Stat KPIs (Exact 4 Cards Grid Style as CardSalesSection) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">عدد العمليات المسجلة</span>
                    <div className="text-base sm:text-lg font-black text-slate-950 dark:text-white mt-1">
                        {stats.totalOps} عملية
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">إجمالي الكروت المضافة</span>
                    <div className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                        +{stats.totalAdded} كارت
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">الكروت المسحوبة / المستبدلة</span>
                    <div className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 mt-1">
                        -{stats.totalReduced} كارت
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">إجمالي المخزون الحالي</span>
                    <div className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
                        {stats.totalCurrentStock} كارت
                    </div>
                </div>
            </div>

            {/* List with Collapsible Structured Tables per Record (Exact CardSalesSection Pattern) */}
            <div className="space-y-3">
                {paginatedLogs.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-10 sm:p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs space-y-2">
                        <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                        <p>لا توجد عمليات إضافة رصيد مطابقة لمعايير البحث.</p>
                    </div>
                ) : (
                    paginatedLogs.map((log) => {
                        const isExpanded = !!expandedLogs[log.id];
                        const isNegative = (log.quantityAdded || 0) < 0;

                        return (
                            <div 
                                key={log.id}
                                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:border-indigo-300 transition"
                            >
                                {/* Log Header Bar (Clickable to Expand/Collapse) */}
                                <div 
                                    onClick={() => toggleExpand(log.id)}
                                    className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-1.5 rounded-lg ${isNegative ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'}`}>
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </div>
                                        <span className={`px-3 py-1 text-white font-black text-xs rounded-xl shadow-sm ${isNegative ? 'bg-rose-600' : 'bg-indigo-600'}`}>
                                            {isNegative ? 'سحب / استبدال' : 'إضافة رصيد'}
                                        </span>
                                        <div>
                                            <h4 className="font-black text-slate-900 dark:text-white text-xs sm:text-sm flex items-center gap-2">
                                                <span>فئة: {log.categoryName || 'غير محدد'}</span>
                                            </h4>
                                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                                {log.additionDate} • المسؤول: <span className="font-black text-slate-600 dark:text-slate-300">{log.userName || 'النظام'}</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 justify-between sm:justify-end" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-2">
                                            <span className={`font-mono font-black text-xs sm:text-sm px-2.5 py-1 rounded-xl border ${
                                                isNegative 
                                                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900/50' 
                                                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50'
                                            }`}>
                                                {isNegative ? '' : '+'}{log.quantityAdded} كارت
                                            </span>

                                            <span className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/40">
                                                الرصيد بعد الإضافة: {log.availableCountAfter || 0}
                                            </span>
                                        </div>

                                        <button
                                            onClick={() => toggleExpand(log.id)}
                                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-black inline-flex items-center gap-1 transition"
                                        >
                                            <Eye size={13} />
                                            <span>{isExpanded ? 'إخفاء' : 'تفاصيل'}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Structured Details Table (Collapsible) */}
                                {isExpanded && (
                                    <div className="p-4 animate-in fade-in duration-200">
                                        <table className="w-full text-right text-xs">
                                            <thead>
                                                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[11px] font-bold">
                                                    <th className="pb-2 font-black">البيان</th>
                                                    <th className="pb-2 text-center font-black">الكمية المسجلة</th>
                                                    <th className="pb-2 text-center font-black">الرصيد الكلي بعد الإجراء</th>
                                                    <th className="pb-2 text-left font-black">تاريخ التوثيق</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
                                                <tr className="font-bold text-slate-800 dark:text-slate-200">
                                                    <td className="py-2.5 font-black text-slate-900 dark:text-white">
                                                        {log.notes || (isNegative ? 'خصم / استبدال رصيد كروت' : 'توريد وإضافة رصيد كروت')}
                                                    </td>
                                                    <td className={`py-2.5 text-center font-mono font-black ${isNegative ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        {isNegative ? '' : '+'}{log.quantityAdded} كارت
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono font-black text-indigo-600 dark:text-indigo-400">
                                                        {log.availableCountAfter || 0} كارت
                                                    </td>
                                                    <td className="py-2.5 text-left font-mono text-slate-500 dark:text-slate-400">
                                                        {log.additionDate || '--'}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        {/* Total Footer Bar */}
                                        <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                                            <span className="font-bold text-slate-500">
                                                المسؤول عن العملية: <strong className="text-slate-900 dark:text-white font-black">{log.userName || 'النظام'}</strong>
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-500">معرّف السجل:</span>
                                                <span className="font-mono text-[10px] text-slate-400">
                                                    #{log.id.slice(-8).toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}

                {/* Pagination Controls (Exact Same as CardSalesSection) */}
                {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold gap-3 mt-4">
                        <div className="text-slate-500 text-center sm:text-right">
                            عرض الصفحة <span className="font-black text-indigo-600">{currentPage}</span> من <span className="font-black">{totalPages}</span> (إجمالي {filteredLogs.length} عملية)
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
