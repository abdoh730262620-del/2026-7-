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
            default: return null;
        }
    };

    const activeReportData = reports.find(r => r.id === activeReport);

    return (
        <div className="flex flex-col h-full bg-bg-main pb-4" dir="rtl">
            <div className="flex items-center gap-4 mb-4 shrink-0">
                {!activeReport ? (
                    null
                ) : (
                    <>
                        <button onClick={() => setActiveReport(null)} className="bg-white dark:bg-slate-800 p-2 rounded-xl text-black dark:text-gray-300 hover:bg-white transition">
                            <ArrowLeft size={24} />
                        </button>
                        <h1 className="text-xl font-black text-text-main">تقرير {activeReportData?.label}</h1>
                    </>
                )}
            </div>
            {/* Compact Global Date Filter */}
            <div className="bg-card-bg p-3 sm:p-4 rounded-xl shadow-sm border border-border-main flex flex-wrap items-center gap-3 mb-4 shrink-0 transition-all duration-300">
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
                <div className="flex-1 flex justify-end gap-2 shrink-0">
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
            
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 pb-2">
                    {reports.map(report => {
                        const Icon = report.icon;
                        return (
                            <button
                                key={report.id}
                                onClick={() => setActiveReport(report.id)}
                                className="bg-card-bg p-3 sm:p-4 rounded-xl border border-border-main hover:border-blue-500 hover:shadow-md transition-all flex items-center gap-3 md:gap-4 group text-right focus:outline-none"
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
            </div>

            {/* Report Overlay Modal */}
            {activeReport && activeReportData && (
                <div className="fixed inset-0 z-[100] flex flex-col bg-bg-main/95 backdrop-blur-md pb-safe">
                    <div className="bg-card-bg border-b border-border-main p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-sm z-10 sticky top-0">
                        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                            <h2 className="font-black text-lg md:text-xl text-text-main pr-1 shrink-0">{activeReportData.label}</h2>
                            <div className="bg-bg-main rounded-xl border border-border-main flex items-center shrink-0 h-10 px-2 shadow-inner">
                                <input 
                                    type="date" 
                                    name="startDate"
                                    value={dateRange.startDate} 
                                    onChange={handleDateChange}
                                    className="bg-transparent border-none outline-none font-bold text-text-main text-xs sm:text-sm h-full px-2"
                                />
                                <span className="text-text-main/50 mx-1 font-bold text-xs sm:text-sm">-</span>
                                <input 
                                    type="date" 
                                    name="endDate"
                                    value={dateRange.endDate} 
                                    onChange={handleDateChange}
                                    className="bg-transparent border-none outline-none font-bold text-text-main text-xs sm:text-sm h-full px-2"
                                />
                            </div>
                        </div>

                        <button 
                            onClick={() => setActiveReport(null)}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-red-650 hover:bg-red-700 active:scale-[0.98] text-white rounded-xl transition-all shrink-0 font-black text-sm shadow-md shadow-red-200 dark:shadow-none"
                            title="الخروج من معاينة التقرير"
                        >
                            <X size={18} strokeWidth={2.5} />
                            <span className="hidden sm:inline">خروج من المعاينة</span>
                            <span className="sm:hidden">خروج</span>
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-hidden w-full flex flex-col">
                        {renderReport()}
                    </div>
                </div>
            )}
        </div>
    );
}
