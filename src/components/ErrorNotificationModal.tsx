import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    AlertTriangle, 
    XCircle, 
    WifiOff, 
    Database, 
    ShieldAlert, 
    Copy, 
    Check, 
    RefreshCw, 
    X, 
    ChevronDown, 
    ChevronUp, 
    Trash2,
    Bug
} from 'lucide-react';
import { ErrorNotifier, GlobalAppError } from '../lib/errorNotifier';

export const ErrorNotificationModal: React.FC = () => {
    const [currentError, setCurrentError] = useState<GlobalAppError | null>(null);
    const [allErrors, setAllErrors] = useState<GlobalAppError[]>([]);
    const [showDetails, setShowDetails] = useState(false);
    const [copied, setCopied] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const unsubscribe = ErrorNotifier.subscribe((err, list) => {
            setCurrentError(err);
            setAllErrors(list);
            if (err) {
                setCurrentIndex(0);
            }
        });
        return unsubscribe;
    }, []);

    if (!currentError && allErrors.length === 0) {
        return null;
    }

    const displayedError = currentError || (allErrors.length > 0 ? allErrors[currentIndex] : null);
    if (!displayedError) return null;

    const handleClose = () => {
        setShowDetails(false);
        setCopied(false);
        ErrorNotifier.clearCurrent();
    };

    const handleClearAll = () => {
        setShowDetails(false);
        setCopied(false);
        ErrorNotifier.clearAll();
    };

    const handleCopyDetails = () => {
        const fullText = `[${displayedError.title}]\nالرسالة: ${displayedError.message}\nالمصدر: ${displayedError.source || 'غير محدد'}\nالوقت: ${new Date(displayedError.timestamp).toLocaleString('ar-SA')}\n\nالتفاصيل الفنية:\n${displayedError.errorDetails || 'لا توجد تفاصيل إضافية'}`;
        navigator.clipboard.writeText(fullText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getIcon = (type?: string) => {
        switch (type) {
            case 'network':
                return <WifiOff className="w-8 h-8 text-amber-500 animate-pulse" />;
            case 'firebase':
                return <Database className="w-8 h-8 text-red-500" />;
            case 'warning':
                return <AlertTriangle className="w-8 h-8 text-amber-500" />;
            case 'error':
            default:
                return <XCircle className="w-8 h-8 text-rose-600 dark:text-rose-400" />;
        }
    };

    const getBadgeStyle = (type?: string) => {
        switch (type) {
            case 'network':
            case 'warning':
                return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-200 border-amber-300 dark:border-amber-700';
            case 'firebase':
            case 'error':
            default:
                return 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-200 border-rose-300 dark:border-rose-800';
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md dir-rtl overflow-y-auto">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-rose-200 dark:border-rose-900/50 overflow-hidden"
                >
                    {/* Header Decorative Bar */}
                    <div className="h-2 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-600" />

                    <div className="p-6">
                        {/* Top Bar with Icon & Actions */}
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className={`p-3 rounded-2xl border shadow-inner flex items-center justify-center shrink-0 ${getBadgeStyle(displayedError.iconType)}`}>
                                    {getIcon(displayedError.iconType)}
                                </div>
                                <div>
                                    <span className="text-[11px] font-black tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 inline-block mb-1">
                                        تنبيه نظام
                                    </span>
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                                        {displayedError.title}
                                    </h3>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                title="إغلاق النافذة"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Error Message Box */}
                        <div className="mt-4 p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 text-rose-950 dark:text-rose-100 font-bold text-sm leading-relaxed">
                            {displayedError.message}
                        </div>

                        {/* Source & Timestamp Metadata */}
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1 font-semibold">
                            <span>المصدر: {displayedError.source || 'التطبيق الرئيسي'}</span>
                            <span>{new Date(displayedError.timestamp).toLocaleTimeString('ar-SA')}</span>
                        </div>

                        {/* Technical Details Accordion (If details exist) */}
                        {displayedError.errorDetails && (
                            <div className="mt-4 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950/60">
                                <button
                                    onClick={() => setShowDetails(!showDetails)}
                                    className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition"
                                >
                                    <span className="flex items-center gap-1.5">
                                        <Bug size={14} className="text-rose-500" />
                                        التفاصيل الفنية وتتبع الخطأ
                                    </span>
                                    {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>

                                {showDetails && (
                                    <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-200 font-mono text-[11px] dir-ltr text-left overflow-x-auto max-h-48 rounded-b-2xl">
                                        <pre className="whitespace-pre-wrap break-all">
                                            {displayedError.errorDetails}
                                        </pre>
                                        <div className="mt-2 pt-2 border-t border-slate-800 flex justify-end">
                                            <button
                                                onClick={handleCopyDetails}
                                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1 text-[10px] font-sans font-bold transition"
                                            >
                                                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                {copied ? 'تم النسخ!' : 'نسخ التفاصيل'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Pagination if multiple errors */}
                        {allErrors.length > 1 && (
                            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold text-slate-500">
                                <span>عدد الأخطاء المكتشفة: {allErrors.length}</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : allErrors.length - 1))}
                                        className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition"
                                    >
                                        السابق
                                    </button>
                                    <span>{currentIndex + 1} / {allErrors.length}</span>
                                    <button
                                        onClick={() => setCurrentIndex((prev) => (prev < allErrors.length - 1 ? prev + 1 : 0))}
                                        className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition"
                                    >
                                        التالي
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Action Buttons Footer */}
                        <div className="mt-6 flex items-center justify-between gap-3 pt-2">
                            <button
                                onClick={handleClearAll}
                                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 flex items-center gap-1.5 transition"
                            >
                                <Trash2 size={14} />
                                مسح الكل
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                                >
                                    <RefreshCw size={14} />
                                    تحديث الصفحة
                                </button>

                                <button
                                    onClick={handleClose}
                                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-md shadow-rose-600/20 transition cursor-pointer"
                                >
                                    فهمت ذلك (موافق)
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
