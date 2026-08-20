import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Users, DatabaseZap, ShieldCheck, ChevronLeft, Printer, Smartphone, Cpu, Palette, Terminal, RefreshCw, CheckCircle2 } from 'lucide-react';
import { LocalCache } from '../lib/localCache';

export default function SettingsLayout() {
    const navigate = useNavigate();
    const { appUser } = useAuthStore();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [cacheSize, setCacheSize] = useState<number>(0);

    const loadCacheSize = async () => {
        if (appUser?.tenantId) {
            const size = await LocalCache.getCacheSize(appUser.tenantId);
            setCacheSize(size);
        }
    };

    useEffect(() => {
        loadCacheSize();
    }, [appUser?.tenantId]);

    const formatBytes = (bytes: number, decimals = 2) => {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    if (appUser?.role !== 'admin') {
        return <div className="p-5 md:p-8 text-center text-red-600 font-bold text-base md:text-xl">ليس لديك صلاحية للوصول إلى هذه الصفحة</div>;
    }

    const handleClearCache = async () => {
        setIsRefreshing(true);
        try {
            await LocalCache.clear(appUser?.tenantId);
            await loadCacheSize();
            // Optionally clear all cache without tenant ID restriction if we wanted to
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Failed to clear cache:', error);
            alert('حدث خطأ أثناء تفريغ الكاش');
        } finally {
            setIsRefreshing(false);
        }
    };

    const tabs = [
        { 
            path: '/settings/users', 
            label: 'إعدادات المستخدمين', 
            icon: Users, 
            desc: 'إضافة وتعديل صلاحيات المستخدمين',
            color: 'text-blue-600 dark:text-blue-400',
            bg: 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/10'
        },
        { 
            path: '/settings/mobile', 
            label: 'إعدادات تطبيق الجوال', 
            icon: Smartphone, 
            desc: 'تفعيل الإشعارات، البصمة، وإعدادات الموبايل',
            color: 'text-purple-600 dark:text-purple-400',
            bg: 'bg-purple-50/80 dark:bg-purple-950/30 border-purple-100 dark:border-purple-900/20'
        },
        { 
            path: '/settings/features', 
            label: 'المميزات الإضافية', 
            icon: Cpu, 
            desc: 'تفعيل الذكاء الاصطناعي، الأدوات المتقدمة والمزيد',
            color: 'text-emerald-700 dark:text-emerald-400',
            bg: 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/20'
        },
        { 
            path: '/settings/invoice', 
            label: 'إعدادات الفاتورة والطباعة', 
            icon: Printer, 
            desc: 'ترويسة الفاتورة، الشعار واعدادات الطباعة',
            color: 'text-rose-600 dark:text-rose-400',
            bg: 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900/20'
        },
        { 
            path: '/settings/addons', 
            label: 'الإضافات والمظهر', 
            icon: Palette, 
            desc: 'تغيير وضع البرنامج والستايلات واكواد الزينة',
            color: 'text-pink-600 dark:text-pink-400',
            bg: 'bg-pink-50/80 dark:bg-pink-950/30 border-pink-100 dark:border-pink-900/20'
        },
        { 
            path: '/settings/security', 
            label: 'إعدادات الأمان', 
            icon: ShieldCheck, 
            desc: 'تغيير كلمة مرور المدير وإعدادات الحماية',
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/20'
        },
        { 
            path: '/settings/backup', 
            label: 'النسخ والبيانات', 
            icon: DatabaseZap, 
            desc: 'النسخ الاحتياطي التلقائي واستعادة البيانات',
            color: 'text-indigo-600 dark:text-indigo-400',
            bg: 'bg-indigo-50/80 dark:bg-indigo-950/30 border-indigo-100 dark:border-indigo-900/20'
        },
        { 
            path: '/settings/demo', 
            label: 'إعدادات النظام (بيانات تجريبية)', 
            icon: Terminal, 
            desc: 'إضافة بضاعة وهمية وحذفها للاختبار',
            color: 'text-cyan-600 dark:text-cyan-400',
            bg: 'bg-cyan-50/80 dark:bg-cyan-950/30 border-cyan-100 dark:border-cyan-900/20'
        },
    ];

    return (
        <div className="max-w-2xl mx-auto w-full pb-8 pt-2" dir="rtl">
            
            <div className="flex flex-col bg-white dark:bg-slate-950 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
                {tabs.map((tab, idx) => (
                    <Link
                        key={tab.path}
                        to={tab.path}
                        className={`p-3.5 md:p-4 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors flex items-center justify-between group ${idx !== tabs.length - 1 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 ${tab.bg} border rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ${tab.color}`}>
                                <tab.icon size={20} className="stroke-[2.5]" />
                            </div>
                            <div>
                                <h2 className="text-sm md:text-base font-bold text-black dark:text-white leading-tight mb-0.5">{tab.label}</h2>
                                <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 line-clamp-1">{tab.desc}</p>
                            </div>
                        </div>
                        <ChevronLeft size={20} className="text-gray-300 dark:text-slate-600 group-hover:text-black dark:group-hover:text-white transition-colors shrink-0 mr-2" />
                    </Link>
                ))}
            </div>

            {/* Cache Management Section */}
            <div className="mt-6 bg-white dark:bg-slate-950 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-sm md:text-base font-bold text-black dark:text-white flex items-center gap-2 mb-1">
                        <DatabaseZap size={18} className="text-indigo-600 dark:text-indigo-400" />
                        تحديث ومزامنة البيانات (مسح الكاش)
                    </h2>
                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
                        استخدم هذا الخيار لمسح البيانات المخزنة مؤقتاً في التطبيق لإجبار جلب أحدث البيانات من السيرفر.
                        {cacheSize > 0 && (
                            <span className="block mt-2 font-semibold text-indigo-600 dark:text-indigo-400">
                                حجم البيانات المستهلكة حالياً: {formatBytes(cacheSize)}
                            </span>
                        )}
                    </p>
                </div>
                <button
                    onClick={handleClearCache}
                    disabled={isRefreshing || showSuccess}
                    className={`shrink-0 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm ${
                        showSuccess 
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95 disabled:opacity-50'
                    }`}
                >
                    {showSuccess ? (
                        <>
                            <CheckCircle2 size={18} />
                            <span>تم التحديث</span>
                        </>
                    ) : (
                        <>
                            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                            <span>{isRefreshing ? 'جاري المسح...' : 'تفريغ الكاش'}</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

