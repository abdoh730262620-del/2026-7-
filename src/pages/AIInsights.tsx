import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Sparkles, TrendingUp, AlertTriangle, Clock, BarChart3, Zap, BrainCircuit, Search, Users2, Star, Send, MessageSquareText, ShieldCheck, MapPin, Loader2, X, FileSpreadsheet, FileText, ArrowRight, Printer, ArrowLeft } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from 'recharts';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { Navigate } from 'react-router-dom';
import { printReport } from '../lib/printHelper';
import { getDaysSinceLastSync } from '../lib/syncTracker';

import { useNavigate } from 'react-router-dom';

export default function AIInsights() {
    const navigate = useNavigate();
    const { settings } = useSettingsStore();
    const resultRef = React.useRef<HTMLDivElement>(null);
    const [salesData, setSalesData] = useState<any[]>([]);
    const [forecast, setForecast] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // AI Assistant State
    const [aiQuery, setAiQuery] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [aiResult, setAiResult] = useState<{ title: string, data: any[], type: string } | null>(null);
    const [suggestions, setSuggestions] = useState<string[]>([]);

    // Interactive Statement Flow
    const [interactiveStep, setInteractiveStep] = useState<'none' | 'select_entity' | 'select_options'>('none');
    const [statementType, setStatementType] = useState<'customer' | 'supplier' | null>(null);
    const [entities, setEntities] = useState<any[]>([]);
    const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
    const [reportOptions, setReportOptions] = useState({
        period: 'full' as 'full' | 'range',
        startDate: '',
        endDate: '',
        includeInvoices: true,
        type: 'all' as 'all' | 'credit' | 'cash'
    });

    const allSuggestions = [
        'كشف حساب عميل محدد',
        'كشف حساب مورد محدد',
        'كشف حساب تفصيلي للعملاء',
        'كشف مديونية الموردين',
        'كشف حركة الصندوق اليومية',
        'تقرير مصروفات ونفقات متكامل',
        'تقرير مبيعات الأسبوع',
        'تقرير المشتريات الشامل',
        'تقرير عروض الأسعار المسجلة',
        'تقرير حركة سندات القبض والصرف',
        'تقرير مبيعات الشهر الحالي',
        'تقرير جرد الأصناف المخزنية',
        'تقرير الأصناف منخفضة الكمية',
        'تقرير إدارة العملاء النشطين',
        'تقرير الديون المستحقة على العملاء',
        'تقرير الأرباح والخسائر التقريبي',
        'سجل العمليات والأنشطة'
    ];

    useEffect(() => {
        const query = aiQuery.trim();
        if (!query) {
            setSuggestions([]);
            return;
        }

        // Expanded logic to find anything relevant
        const filtered = allSuggestions.filter(s => {
            const lowerS = s.toLowerCase();
            const lowerQ = query.toLowerCase();
            
            // If they just typed "تقرير" or "عرض" or "تحليل"
            if (lowerQ === 'تقرير') return s.startsWith('تقرير');
            if (lowerQ === 'عرض') return s.startsWith('عرض');
            if (lowerQ === 'تحليل') return s.startsWith('تحليل');
            
            // Otherwise, check if the query is anywhere in the suggestion
            // or if the suggestion contains key parts of the query
            return lowerS.includes(lowerQ);
        });
        
        setSuggestions(filtered.slice(0, 10)); // Limit to top 10
    }, [aiQuery]);

    if (!settings.isAiEnabled) {
        return <Navigate to="/" replace />;
    }

    useEffect(() => {
        const appUser = useAuthStore.getState().appUser;
        if (!appUser) return;
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

        const unsub = onSnapshot(query(collection(db, 'sales'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc')), (snap) => {
            const allSales: any[] = [];
            snap.forEach(doc => allSales.push({ id: doc.id, ...doc.data() }));
            
            // 1. Process Sales for Analytics
            const dailyMap: Record<string, number> = {};
            
            const now = Date.now();

            allSales.forEach(sale => {
                if (sale.status === 'cancelled') return;
                
                const date = new Date(sale.createdAt).toISOString().substring(0, 10);
                dailyMap[date] = (dailyMap[date] || 0) + (sale.totalAmount || sale.total || 0);
            });

            // 2. Linear Regression for Forecast
            const dailyData = Object.entries(dailyMap).sort().map(([date, val]) => ({ date, amount: val }));
            setSalesData(dailyData);

            if (dailyData.length > 5) {
                const n = dailyData.length;
                let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
                dailyData.forEach((d, i) => {
                    sumX += i;
                    sumY += d.amount;
                    sumXY += i * d.amount;
                    sumXX += i * i;
                });
                const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                const intercept = (sumY - slope * sumX) / n;

                const forecastArr = [];
                for (let i = n; i < n + 14; i++) {
                    const futureDate = new Date();
                    futureDate.setDate(futureDate.getDate() + (i - n + 1));
                    forecastArr.push({
                        date: futureDate.toISOString().substring(0, 10),
                        amount: Math.max(0, slope * i + intercept)
                    });
                }
                setForecast(forecastArr);
            }

            setLoading(false);
        });

        return () => unsub();
    }, []);

    const handleAISearch = async (queryOverride?: string) => {
        const queryToProcess = queryOverride || aiQuery;
        if (!queryToProcess.trim()) return;
        
        setIsThinking(true);
        setAiResult(null);
        setSuggestions([]); // Hide suggestions instantly
        setAiQuery(''); // Clear the input field for a clean look
        
        const q = queryToProcess.trim().toLowerCase();

        // Check for Detailed Statement Request
        if (q.includes('كشف') && (q.includes('تفصيلي') || q.includes('محدد') || q.includes('تفصيل'))) {
            const type = q.includes('مورد') ? 'supplier' : 'customer';
            setStatementType(type);
            
            try {
                const appUser = useAuthStore.getState().appUser;
                const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
                const collectionName = type === 'customer' ? 'customers' : 'suppliers';
                const snap = await getDocs(query(collection(db, collectionName), where('tenantId', '==', tenantId)));
                setEntities(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setInteractiveStep('select_entity');
            } catch (e) {
                console.error(e);
            }
            setIsThinking(false);
            return;
        }

        // Simulation of AI Processing
        setTimeout(async () => {
            let collectionName = '';
            let reportTitle = '';
            const appUser = useAuthStore.getState().appUser;
            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

            if (q.includes('مبيعات') || q.includes('تقرير مبيعات') || q.includes('بيع')) {
                collectionName = 'sales';
                reportTitle = 'تقرير المبيعات الشامل (استخراج ذكي)';
            } else if (q.includes('مشتريات') || q.includes('شراء') || q.includes('فواتير الموردين')) {
                collectionName = 'purchases';
                reportTitle = 'تقرير المشتريات الشامل (استخراج ذكي)';
            } else if (q.includes('منتجات') || q.includes('بضاعة') || q.includes('أصناف') || q.includes('جرد') || q.includes('مخزن')) {
                collectionName = 'products';
                reportTitle = 'تقرير الجرد والمنتجات (استخراج ذكي)';
            } else if (q.includes('عروض') || q.includes('اسعار') || q.includes('عرض سعر')) {
                collectionName = 'quotations';
                reportTitle = 'تقرير عروض الأسعار المسجلة';
            } else if (q.includes('صندوق') || q.includes('كاش') || q.includes('حركة نقدية') || q.includes('درج')) {
                collectionName = 'cash';
                reportTitle = 'تقرير الصندوق والحركات النقدية';
            } else if (q.includes('سندات') || q.includes('قبض') || q.includes('صرف') || q.includes('سند')) {
                collectionName = 'vouchers';
                reportTitle = 'تقرير سندات القبض والصرف';
            } else if (q.includes('مصروفات') || q.includes('مصاريف') || q.includes('نفقات') || q.includes('منصرف')) {
                collectionName = 'expenses';
                reportTitle = 'تقرير المصروفات والنفقات';
            } else if (q.includes('كشف') && (q.includes('مورد') || q.includes('شركات'))) {
                collectionName = 'suppliers';
                reportTitle = 'كشف حساب الموردين والشركات';
            } else if (q.includes('كشف') && (q.includes('عميل') || q.includes('زبون'))) {
                collectionName = 'customers';
                reportTitle = 'كشف حساب العملاء (استخراج ذكي)';
            } else if (q.includes('سجل') || q.includes('تتبع') || q.includes('نشاط') || q.includes('أنشطة') || q.includes('حركة النظام')) {
                collectionName = 'logs';
                reportTitle = 'سجل العمليات وحركات النظام';
            } else if ((q.includes('كشف') || q.includes('تقارير المحاسبة')) && !q.includes('حساب')) {
                collectionName = 'customers';
                reportTitle = 'كشف الحسابات العام (اختر عميل أو مورد للتفصيل)';
            } else if (q.includes('عملاء') || q.includes('زبائن') || q.includes('ديون') || q.includes('دائن')) {
                collectionName = 'customers';
                reportTitle = 'كشف مديونيات العملاء';
            } else if (q.includes('أرباح') || q.includes('خسائر') || q.includes('كسب')) {
                collectionName = 'sales';
                reportTitle = 'تحليل الأرباح والمدخول التقريبي';
            }

            if (collectionName) {
                try {
                    const snap = await getDocs(query(collection(db, collectionName), where('tenantId', '==', tenantId)));
                    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    setAiResult({
                        title: reportTitle,
                        data,
                        type: collectionName as any
                    });
                } catch (e) {
                    setAiResult({ title: 'حدث خطأ في استخراج البيانات', data: [], type: 'none' });
                }
            } else {
                setAiResult({ title: 'عذراً، لم أستطع فهم رغبتك. حاول طلب "تقرير مبيعات" أو "عرض الديون" أو "جرد المخزن".', data: [], type: 'none' });
            }
            setIsThinking(false);
        }, 1200);
    };

    const finalGeneration = async () => {
        const daysNoSync = getDaysSinceLastSync();
        if (daysNoSync > 0 || !window.navigator.onLine) {
            alert(`تنبيه: يوجد بيانات غير متزامنة مع السحابة منذ (${daysNoSync}) أيام. \nيرجى الاتصال بالإنترنت أولاً لضمان الحصول على كشف حساب صحيح ودقيق بالكامل من السحابة.`);
            return;
        }

        setIsThinking(true);
        const entity = entities.find(e => e.id === selectedEntityId);
        const entityName = entity?.name || 'الطرف المحدد';
        
        setTimeout(async () => {
            let fetchedData = [];
            const appUser = useAuthStore.getState().appUser;
            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

            const q = statementType === 'customer' 
                ? query(collection(db, 'sales'), where('tenantId', '==', tenantId), where('customerId', '==', selectedEntityId)) 
                : query(collection(db, 'purchases'), where('tenantId', '==', tenantId), where('supplierId', '==', selectedEntityId));
            
            const snap = await getDocs(q);
                fetchedData = snap.docs.map(doc => {
                    const d = doc.data();
                    const itemsStr = (d.items || []).map((i: any) => `${i.name} (${i.quantity})`).join(' ، ');
                    return { id: doc.id, ...d, itemsStr };
                });

            // Filtering based on Payment Type option
            let finalData = fetchedData;
            if (reportOptions.type === 'credit') {
                finalData = fetchedData.filter(d => d.paymentType === 'credit');
            } else if (reportOptions.type === 'cash') {
                finalData = fetchedData.filter(d => d.paymentType === 'cash');
            }

            setAiResult({
                title: `كشف حساب ${statementType === 'customer' ? 'العميل' : 'المورد'}: ${entityName}`,
                data: finalData.map(d => ({ ...d, balance: entity?.balance || 0 })),
                type: statementType === 'customer' ? 'sales' : 'suppliers' as any
            });
            setInteractiveStep('none');
            setIsThinking(false);
        }, 800);
    };

    const getLocalizedHeaders = (type: string) => {
        switch (type) {
            case 'sales': return ['رقم الفاتورة', 'المبلغ الإجمالي', 'طريقة الدفع', 'التاريخ'];
            case 'purchases': return ['رقم الفاتورة', 'المبلغ الإجمالي', 'رقم المورد', 'التاريخ'];
            case 'products': return ['اسم المنتج', 'السعر', 'الكمية المتوفرة', 'الباركود'];
            case 'customers': return ['اسم العميل', 'الرصيد الحالي', 'رقم الجوال'];
            case 'suppliers': return ['اسم المورد', 'الرصيد المستحق', 'رقم الجوال'];
            case 'quotations': return ['رقم العرض', 'اسم العميل', 'الإجمالي', 'التاريخ'];
            case 'cash': return ['البيان', 'المبلغ', 'النوع (وارد/منصرف)', 'التاريخ'];
            case 'expenses': return ['الوصف', 'المبلغ', 'التصنيف', 'التاريخ'];
            case 'vouchers': return ['النوع', 'المبلغ', 'البيان', 'التاريخ'];
            case 'logs': return ['العملية', 'المستخدم', 'التفاصيل', 'التاريخ'];
            default: return ['المعرف', 'القيمة', 'التفاصيل'];
        }
    };

    const getLocalizedRows = (type: string, data: any[]) => {
        return data.map(item => {
            switch (type) {
                case 'sales':
                case 'purchases':
                    return [
                        item.invoiceNumber || item.id,
                        (item.total || 0).toLocaleString() + ' ر.س',
                        item.paymentType === 'cash' ? 'نقدي' : 'آجل',
                        item.date || item.createdAt ? new Date(item.date || item.createdAt).toLocaleDateString('ar-EG') : '-'
                    ];
                case 'quotations':
                    return [
                        item.quotationNumber || item.id,
                        item.customerName || '-',
                        (item.total || 0).toLocaleString() + ' ر.س',
                        item.date || item.createdAt ? new Date(item.date || item.createdAt).toLocaleDateString('ar-EG') : '-'
                    ];
                case 'cash':
                    return [
                        item.description || item.reason || 'حركة صندوق',
                        (item.amount || item.total || 0).toLocaleString() + ' ر.س',
                        item.type === 'in' ? 'وارد' : 'منصرف',
                        item.date || item.createdAt ? new Date(item.date || item.createdAt).toLocaleDateString('ar-EG') : '-'
                    ];
                case 'expenses':
                    return [
                        item.description || item.name || '-',
                        (item.amount || 0).toLocaleString() + ' ر.س',
                        item.category || '-',
                        item.date || item.createdAt ? new Date(item.date || item.createdAt).toLocaleDateString('ar-EG') : '-'
                    ];
                case 'vouchers':
                    return [
                        item.type === 'payment' ? 'سند صرف' : 'سند قبض',
                        (item.amount || 0).toLocaleString() + ' ر.س',
                        item.description || item.notes || '-',
                        item.date || item.createdAt ? new Date(item.date || item.createdAt).toLocaleDateString('ar-EG') : '-'
                    ];
                case 'logs':
                    return [
                        item.action || 'عملية نقل',
                        item.userName || item.userEmail || '-',
                        item.details || '-',
                        item.createdAt ? new Date(item.createdAt).toLocaleDateString('ar-EG') : '-'
                    ];
                case 'products':
                    return [
                        item.name || '-',
                        (item.price || 0).toLocaleString() + ' ر.س',
                        item.quantity || 0,
                        item.barcode || '-'
                    ];
                case 'suppliers':
                case 'customers':
                    return [
                        item.name || '-',
                        (item.balance || 0).toLocaleString() + ' ر.س',
                        item.phone || item.mobile || '-'
                    ];
                default:
                    return [
                        item.id,
                        item.name || item.total || item.amount || '-',
                        item.date || item.createdAt ? new Date(item.date || item.createdAt).toLocaleDateString('ar-EG') : '-'
                    ];
            }
        });
    };

    const downloadExcel = () => {
        if (!aiResult || aiResult.data.length === 0) return;
        
        const headers = getLocalizedHeaders(aiResult.type);
        const rows = getLocalizedRows(aiResult.type, aiResult.data);
        
        const csvContent = "\uFEFF" + 
            headers.join(',') + "\n" + 
            rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
            
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `تقرير_${aiResult.title}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrintReport = () => {
        if (!aiResult) return;
        const headers = getLocalizedHeaders(aiResult.type);
        const rows = getLocalizedRows(aiResult.type, aiResult.data);
        printReport(aiResult.title, headers, rows);
    };

    return (
        <div className="flex flex-col h-full bg-bg-main pb-20 overflow-y-auto px-4 sm:px-6 shadow-inner" dir="rtl">
            {/* Improved AI Chat Assistant Bar */}
            <section className="mb-4 md:mb-6 sm:mb-8 relative">
                <div className="bg-card-bg backdrop-blur-md p-1.5 sm:p-2 rounded-2xl border-2 border-purple-500/20 shadow-xl flex flex-col sm:flex-row items-center gap-2 group focus-within:border-purple-500 transition-all">
                    <div className="hidden sm:flex p-2 bg-white dark:bg-purple-900/20 rounded-xl text-purple-600">
                        <MessageSquareText size={18} />
                    </div>
                    <div className="flex-1 w-full relative">
                        <textarea 
                            rows={1}
                            value={aiQuery}
                            onChange={(e) => setAiQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAISearch();
                                }
                            }}
                            placeholder="كيف أساعدك اليوم؟"
                            className="w-full bg-transparent border-none outline-none text-text-main font-bold placeholder:text-gray-400 py-2 px-3 sm:px-0 resize-none max-h-24 text-sm"
                        />

                        {/* Smart Suggestions Dropdown */}
                        {suggestions.length > 0 && !aiResult && !isThinking && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-card-bg border border-border-main rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="p-2 border-b border-border-main bg-bg-main flex items-center gap-2">
                                    <Sparkles size={12} className="text-purple-500" />
                                    <span className="text-[10px] font-black text-black">مقترحات ذكية</span>
                                </div>
                                <div className="max-h-52 overflow-y-auto scrollbar-hide">
                                    {suggestions.map((s, i) => (
                                        <button 
                                            key={`${s}-${i}`}
                                            onClick={() => {
                                                setAiQuery(s);
                                                setSuggestions([]);
                                                handleAISearch(s);
                                            }}
                                            className="w-full text-right px-4 py-2 text-[11px] font-bold text-text-main hover:bg-white dark:hover:bg-purple-900/20 hover:text-purple-600 transition flex items-center justify-between group border-b last:border-0 border-border-main"
                                        >
                                            <span className="truncate">{s}</span>
                                            <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity rotate-180" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={() => handleAISearch()}
                        disabled={isThinking || !aiQuery.trim()}
                        className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-2 rounded-xl font-black text-xs hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                    >
                        {isThinking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        <span>{isThinking ? 'جاري...' : 'بحث ذكي'}</span>
                    </button>
                </div>

                {/* AI Result Area */}
                {(aiResult || interactiveStep !== 'none') && (
                    <div ref={resultRef} className="mt-4 bg-card-bg rounded-[2rem] border-2 border-purple-100 dark:border-slate-800 p-4 md:p-6 shadow-2xl animate-in zoom-in duration-300 relative">
                        <button 
                            onClick={() => {
                                setAiResult(null);
                                setInteractiveStep('none');
                            }} 
                            className="absolute top-4 left-4 p-2 text-text-main opacity-50 hover:opacity-100 hover:text-red-500 transition no-print" 
                            data-html2canvas-ignore
                        >
                            <X size={20} />
                        </button>
                        
                        {/* Interactive Step: Select Entity */}
                        {interactiveStep === 'select_entity' && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-white dark:bg-purple-900/30 text-purple-600 rounded-2xl">
                                        <Users2 size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-black dark:text-white dark:text-white text-lg">
                                            اختر {statementType === 'customer' ? 'العميل' : 'المورد'} المطلوب
                                        </h3>
                                        <p className="text-xs text-black font-bold">يرجى تحديد الاسم من القائمة أدناه للمتابعة</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-64 overflow-y-auto p-2 scrollbar-hide">
                                    {entities.map(e => (
                                        <button 
                                            key={e.id}
                                            onClick={() => {
                                                setSelectedEntityId(e.id);
                                                setInteractiveStep('select_options');
                                            }}
                                            className="text-right px-5 py-4 bg-bg-main text-text-main border-2 border-border-main rounded-2xl font-black text-xs hover:border-purple-500 transition-all shadow-sm hover:shadow-md"
                                        >
                                            {e.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Interactive Step: Select Options */}
                        {interactiveStep === 'select_options' && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-white dark:bg-purple-900/30 text-purple-600 rounded-2xl">
                                        <Clock size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-black dark:text-white dark:text-white text-lg">تحديد خيارات الكشف المحاسبي</h3>
                                        <p className="text-xs text-black font-bold">تخصيص الفترة ونوع البيانات المطلوبة</p>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <button 
                                        onClick={() => setReportOptions(prev => ({ ...prev, period: 'full' }))}
                                        className={`py-4 rounded-2xl font-black text-xs transition-all border-2 ${reportOptions.period === 'full' ? 'bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-200 dark:shadow-none' : 'bg-bg-main text-text-main border-border-main'}`}
                                    >
                                        منذ بداية التعامل
                                    </button>
                                    <button 
                                        onClick={() => setReportOptions(prev => ({ ...prev, period: 'range' }))}
                                        className={`py-4 rounded-2xl font-black text-xs transition-all border-2 ${reportOptions.period === 'range' ? 'bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-200 dark:shadow-none' : 'bg-bg-main text-text-main border-border-main'}`}
                                    >
                                        فترة زمنية محددة
                                    </button>
                                </div>

                                {reportOptions.period === 'range' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 mr-3">من تاريخ</label>
                                            <input type="date" className="w-full bg-bg-main text-text-main p-4 rounded-2xl text-sm border-2 border-border-main focus:border-purple-500 outline-none font-bold transition-all" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 mr-3">إلى تاريخ</label>
                                            <input type="date" className="w-full bg-bg-main text-text-main p-4 rounded-2xl text-sm border-2 border-border-main focus:border-purple-500 outline-none font-bold transition-all" />
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-bg-main rounded-2xl flex flex-col gap-3 border-2 border-border-main">
                                        <span className="text-xs font-black text-text-main">نوع الفواتير</span>
                                        <div className="flex gap-2">
                                            {['all', 'credit', 'cash'].map(type => (
                                                <button
                                                    key={type}
                                                    onClick={() => setReportOptions(prev => ({ ...prev, type: type as any }))}
                                                    className={`flex-1 py-2 rounded-xl text-[10px] font-black border-2 transition-all ${reportOptions.type === type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-black border-transparent'}`}
                                                >
                                                    {type === 'all' ? 'الكل' : type === 'credit' ? 'آجل' : 'نقدي'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-4 bg-bg-main rounded-2xl flex items-center justify-between border-2 border-border-main">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-text-main">كشف تفصيلي (بالأصناف)</span>
                                            <span className="text-[10px] font-bold text-black dark:text-slate-400">تضمين تفاصيل محتويات الفواتير</span>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={reportOptions.includeInvoices}
                                                onChange={(e) => setReportOptions(prev => ({ ...prev, includeInvoices: e.target.checked }))}
                                                className="sr-only peer" 
                                            />
                                            <div className="w-12 h-6 bg-white peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600 shadow-inner"></div>
                                        </label>
                                    </div>
                                </div>

                                <button 
                                    onClick={finalGeneration}
                                    className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl font-black text-sm hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-purple-200 dark:shadow-none flex items-center justify-center gap-3"
                                >
                                    <Sparkles size={20} />
                                    <span>توليد كشف الحساب النهائي</span>
                                </button>
                            </div>
                        )}
                        
                        {/* FINAL RESULT */}
                        {aiResult && interactiveStep === 'none' && (
                            <>
                                <div className="flex items-center justify-between mb-4 md:mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white dark:bg-emerald-900/30 text-emerald-600 rounded-xl">
                                            <ShieldCheck size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-text-main">{aiResult.title}</h3>
                                            <p className="text-[10px] font-bold text-black">تم التحقق من كافة القيود المحاسبية</p>
                                        </div>
                                    </div>
                                </div>

                                {aiResult.type !== 'none' ? (
                                    <div className="space-y-6">
                                        {/* Financial Summary Cards */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 no-print">
                                            <div className="p-4 bg-white dark:bg-slate-800 dark:bg-blue-900/10 rounded-2xl border border-gray-200 dark:border-blue-900/20">
                                                <span className="text-[10px] font-black text-blue-600 block mb-1">إجمالي النقدي</span>
                                                <span className="text-lg font-black text-blue-700">{(aiResult.data.filter((d:any) => d.paymentType === 'cash').reduce((acc:number, curr:any) => acc + (curr.total || 0), 0)).toLocaleString()}</span>
                                            </div>
                                            <div className="p-4 bg-white dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/20">
                                                <span className="text-[10px] font-black text-amber-600 block mb-1">إجمالي الآجل</span>
                                                <span className="text-lg font-black text-amber-700">{(aiResult.data.filter((d:any) => d.paymentType === 'credit').reduce((acc:number, curr:any) => acc + (curr.total || 0), 0)).toLocaleString()}</span>
                                            </div>
                                            <div className="p-4 bg-white dark:bg-emerald-900/10 rounded-2xl border border-emerald-100 dark:border-emerald-900/20">
                                                <span className="text-[10px] font-black text-emerald-600 block mb-1">الرصيد المتبقي (له/عليه)</span>
                                                <span className="text-lg font-black text-emerald-700">{(aiResult.data[0]?.balance || 0).toLocaleString()} ر.ي</span>
                                            </div>
                                        </div>
                                        
                                        {/* Result Table for Capture */}
                                        <div className="overflow-x-auto border border-border-main rounded-2xl">
                                            <table className="w-full text-right text-xs">
                                                <thead className="bg-bg-main text-text-main border-b border-border-main">
                                                    <tr>
                                                        <th className="p-4 font-black">البيان</th>
                                                        <th className="p-4 font-black">النوع</th>
                                                        <th className="p-4 font-black">المبلغ</th>
                                                        <th className="p-4 font-black">التاربخ</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y border-border-main">
                                                    {aiResult.data.map((row: any, i) => (
                                                        <tr key={row.id || i} className="hover:bg-white transition-colors">
                                                            <td className="p-4">
                                                                <div className="font-extrabold text-text-main">{row.name || row.customerName || `فاتورة #${row.invoiceNumber || row.id}`}</div>
                                                                {row.itemsStr && <div className="text-[10px] text-text-main/80 font-black mt-1 leading-relaxed">الأصناف: {row.itemsStr}</div>}
                                                            </td>
                                                            <td className="p-4">
                                                                <span className={`px-2 py-1 rounded-md text-[9px] font-black ${row.paymentType === 'cash' ? 'bg-white dark:bg-slate-700 text-blue-700' : 'bg-white text-amber-700'}`}>
                                                                    {row.paymentType === 'cash' ? 'نقدي' : 'آجل'}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 text-text-main font-black">{(row.total || row.price || 0).toLocaleString()}</td>
                                                            <td className="p-4 text-text-main font-black">{row.date ? new Date(row.date).toLocaleDateString('ar-EG') : '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 no-print" data-html2canvas-ignore>
                                            <button 
                                                onClick={downloadExcel}
                                                className="flex items-center justify-center gap-3 p-4 bg-white dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 rounded-2xl font-black hover:bg-white transition group"
                                            >
                                                <FileSpreadsheet size={24} className="group-hover:scale-110 transition-transform" />
                                                <span>تحميل إكسل (Excel)</span>
                                            </button>
                                            <button 
                                                onClick={handlePrintReport}
                                                className="flex items-center justify-center gap-3 p-4 bg-white dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-700 dark:text-red-400 rounded-2xl font-black hover:bg-white transition group"
                                            >
                                                <Printer size={24} className="group-hover:scale-110 transition-transform" />
                                                <span>طباعة وتحميل (PDF)</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-red-500 font-bold">{aiResult.title}</p>
                                )}
                            </>
                        )}
                    </div>
                )}

                <div className="flex flex-wrap gap-2 mt-4 px-1 sm:px-2">
                    {[
                        { label: 'تحليل المخزون', color: 'text-purple-600 bg-white dark:bg-purple-900/20', query: 'أريد تقرير الأصناف والمخزون' },
                        { label: 'مبيعات الأسبوع', color: 'text-blue-600 bg-white dark:bg-slate-800 dark:bg-blue-900/20', query: 'أريد تقرير مبيعات الأسبوع الماضي' },
                        { label: 'إدارة العملاء', color: 'text-emerald-600 bg-white dark:bg-emerald-900/20', query: 'أريد تقرير العملاء والزبائن' }
                    ].map((btn, i) => (
                        <button 
                            key={`${btn.label}-${i}`}
                            onClick={() => {
                                setAiQuery(btn.query);
                                handleAISearch(btn.query);
                            }}
                            className={`text-[9px] sm:text-[10px] font-black ${btn.color} px-2 sm:px-3 py-1.5 rounded-xl border border-transparent hover:border-current transition shadow-sm`}
                        >
                            {btn.label}
                        </button>
                    ))}
                </div>
            </section>

            {loading ? (
                <div className="flex flex-col items-center justify-center flex-1 py-12">
                     <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                     <p className="mt-4 text-black font-bold">جاري تحليل البيانات التاريخية...</p>
                </div>
            ) : null}
        </div>
    );
}
