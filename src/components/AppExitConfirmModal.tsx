import React, { useEffect } from 'react';
import { LogOut, X, AlertTriangle } from 'lucide-react';

interface AppExitConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirmExit: () => void;
}

export function AppExitConfirmModal({
    isOpen,
    onClose,
    onConfirmExit
}: AppExitConfirmModalProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] transition-all animate-in fade-in duration-200"
            dir="rtl"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl p-5 md:p-6 border border-slate-200 dark:border-slate-800 space-y-4 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 flex items-center justify-center shadow-xs shrink-0">
                            <LogOut size={24} />
                        </div>
                        <div>
                            <h3 className="font-black text-base md:text-lg text-slate-900 dark:text-white">
                                الخروج من البرنامج
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                                تأكيد إغلاق التطبيق
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                        title="إلغاء"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body message */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-100 dark:border-slate-800 text-xs space-y-2">
                    <p className="font-bold text-slate-800 dark:text-slate-200 leading-relaxed text-sm">
                        هل أنت متأكد من رغبتك في إغلاق التطبيق والخروج من البرنامج؟
                    </p>
                    <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
                        <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                        <span>سيتم الاحتفاظ بكافة بياناتك وعملياتك المسجلة.</span>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2.5 pt-1">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-2.5 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition cursor-pointer shadow-2xs"
                    >
                        البقاء في البرنامج
                    </button>
                    <button
                        type="button"
                        onClick={onConfirmExit}
                        className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-extrabold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-red-600/20"
                    >
                        <LogOut size={15} />
                        تأكيد الخروج
                    </button>
                </div>
            </div>
        </div>
    );
}
