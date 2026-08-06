import React, { useState } from 'react';
import { FileText, TrendingUp, TrendingDown, Package, Users, Truck, Wallet, Clock, X, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Components for different report views
import SalesReport from './reports/SalesReport';
import PurchasesReport from './reports/PurchasesReport';
import InventoryReport from './reports/InventoryReport';
import PartiesReport from './reports/PartiesReport';
import CashReport from './reports/CashReport';
import ExpensesReport from './reports/ExpensesReport';
import StaffReport from './reports/StaffReport';
import MonthlySalesSummary from './reports/MonthlySalesSummary';

export default function Reports() {
    const navigate = useNavigate();
    const [activeReport, setActiveReport] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().substring(0, 10),
        endDate: new Date().toISOString().substring(0, 10)
    });

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setDateRange(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const reports = [
        { id: 'sales', label: 'المبيعات', icon: TrendingUp, desc: 'بحث مفصل وتحليل للمبيعات والفواتير' },
        { id: 'purchases', label: 'المشتريات', icon: TrendingDown, desc: 'تتبع حركة المشتريات ومصروفات التوريد' },
        { id: 'inventory', label: 'المخزون والمنتجات', icon: Package, desc: 'حالة المخزون، المنتجات الناقصة، وقيمة المتجر' },
        { id: 'staff', label: 'أداء البائعين', icon: Users, desc: 'مبيعات الموظفين، العمولات، والأداء الفردي' },
        { id: 'parties', label: 'العملاء والموردين', icon: Truck, desc: 'أرصدة وحسابات العملاء والموردين بالتفصيل' },
        { id: 'cash', label: 'الصندوق', icon: Wallet, desc: 'تحليل حركات النقد اليومية ورأس المال' },
        { id: 'expenses', label: 'المصروفات', icon: FileText, desc: 'تحليل المصروفات حسب التصنيف والحساب' },
        { id: 'monthly_summary', label: 'الحسابات الشهرية', icon: TrendingUp, desc: 'ملخص مبيعات وكروت الحسابات التلقائية' },
    ] as const;

    const renderReport = () => {
        switch (activeReport) {
            case 'sales': return <SalesReport dateRange={dateRange} />;
            case 'purchases': return <PurchasesReport dateRange={dateRange} />;
            case 'inventory': return <InventoryReport dateRange={dateRange} />;
            case 'staff': return <StaffReport dateRange={dateRange} />;
            case 'parties': return <PartiesReport dateRange={dateRange} />;
            case 'cash': return <CashReport dateRange={dateRange} />;
            case 'expenses': return <ExpensesReport dateRange={dateRange} />;
            case 'monthly_summary': return <MonthlySalesSummary dateRange={dateRange} />;
            default: return null;
        }
    };

    const activeReportData = reports.find(r => r.id === activeReport);

    return (
        <div className="flex flex-col h-full bg-bg-main pb-4" dir="rtl">
            <div className="flex items-center gap-4 mb-3 shrink-0">
                <h1 className="text-xl font-black text-text-main flex items-center gap-2">
                    <FileText className="text-blue-600" size={24} />
                    <span>التقارير التفصيلية</span>
                </h1>
            </div>

            {/* Compact Controls Panel: Selection + Date Filters */}
            <div className="bg-card-bg p-3.5 rounded-2xl shadow-sm border border-border-main flex flex-wrap items-center gap-3 mb-4 shrink-0 transition-all duration-300">
                {/* Custom Styled Select Dropdown (Like category list) */}
                <div className="flex items-center gap-2 bg-bg-main p-1.5 rounded-xl border border-border-main shrink-0 w-full sm:w-auto sm:min-w-[240px]">
                    <FileText size={16} className="text-blue-500 mr-1.5 shrink-0" />
                    <select
                        value={activeReport || ''}
                        onChange={(e) => setActiveReport(e.target.value || null)}
                        className="bg-transparent text-text-main font-black text-xs outline-none w-full cursor-pointer pr-1"
                    >
                        <option value="">📊 جميع التقارير (اختر للتصفح سريعاً)</option>
                        {reports.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Date Filter Row */}
                <div className="flex items-center gap-2 text-[10px] sm:text-xs font-black">
                    <Clock size={14} className="text-blue-500" />
                    <span className="text-text-main/50 hidden sm:inline">فلترة الفترة:</span>
                </div>
                <div className="flex items-center gap-2 bg-bg-main p-1 rounded-xl border border-border-main shrink-0">
                    <input 
                        type="date" 
                        name="startDate"
                        value={dateRange.startDate} 
                        onChange={handleDateChange}
                        className="bg-transparent border-none outline-none font-black text-text-main text-[10px] sm:text-xs py-1 px-2"
                    />
                    <span className="text-text-main/30">-</span>
                    <input 
                        type="date" 
                        name="endDate"
                        value={dateRange.endDate} 
                        onChange={handleDateChange}
                        className="bg-transparent border-none outline-none font-black text-text-main text-[10px] sm:text-xs py-1 px-2"
                    />
                </div>
                <div className="flex-1 flex justify-end gap-1.5 shrink-0">
                    <button 
                        onClick={() => setDateRange({
                            startDate: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().substring(0, 10),
                            endDate: new Date().toISOString().substring(0, 10)
                        })}
                        className="text-[9px] font-black px-2 py-1 bg-white dark:bg-slate-800 dark:bg-blue-900/20 text-blue-600 rounded-lg hover:bg-white transition"
                    >
                        أسبوع
                    </button>
                    <button 
                        onClick={() => setDateRange({
                            startDate: new Date(new Date().setDate(1)).toISOString().substring(0, 10),
                            endDate: new Date().toISOString().substring(0, 10)
                        })}
                        className="text-[9px] font-black px-2 py-1 bg-white dark:bg-slate-800 dark:bg-blue-900/20 text-blue-600 rounded-lg hover:bg-white transition"
                    >
                        شهر
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col">
                {!activeReport ? (
                    /* Show default reports grid */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 pb-2">
                        {reports.map(report => {
                            const Icon = report.icon;
                            return (
                                <button
                                    key={report.id}
                                    onClick={() => setActiveReport(report.id)}
                                    className="bg-card-bg p-3.5 sm:p-4 rounded-xl border border-border-main hover:border-blue-500 hover:shadow-md transition-all flex items-center gap-3 md:gap-4 group text-right focus:outline-none"
                                >
                                    <div className="p-2.5 sm:p-3 bg-white dark:bg-slate-800 dark:bg-gray-800 rounded-xl group-hover:bg-blue-600 transition-all duration-300 shrink-0">
                                        <Icon size={20} className="text-blue-600 dark:text-gray-400 group-hover:text-white transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold sm:font-black text-sm md:text-base text-text-main mb-1 truncate">{report.label}</h3>
                                        <p className="text-[10px] sm:text-xs text-text-main/60 font-bold truncate leading-relaxed">{report.desc}</p>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                ) : (
                    /* Show selected report inline, integrated with the main screen view */
                    <div className="flex-1 overflow-hidden w-full flex flex-col bg-card-bg border border-border-main rounded-2xl p-3 sm:p-4 shadow-sm animate-fadeIn">
                        <div className="flex items-center justify-between border-b border-border-main pb-3 mb-4 shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                                <h2 className="font-black text-sm sm:text-base text-text-main">
                                    معاينة تقرير: {activeReportData?.label}
                                </h2>
                            </div>
                            <button 
                                onClick={() => setActiveReport(null)}
                                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-650 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400 rounded-xl transition-all shrink-0 font-black text-xs"
                            >
                                <X size={14} />
                                <span>إغلاق التقرير</span>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar">
                            {renderReport()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
