import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minimize2, Maximize2 } from 'lucide-react';
import ProgressBar from './ProgressBar';
import { useProgressStore } from '../store/progressStore';
import { useUIStore } from '../store/uiStore';

export default function FloatingProgressBar() {
    const { show, isMinimized, label, processed, total, toggleMinimize } = useProgressStore();
    const { hasActiveModal } = useUIStore();

    if (!show || hasActiveModal()) return null;

    if (isMinimized) {
        const percentage = total > 0 ? Math.min(100, (processed / total) * 100) : 0;
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed top-0 left-0 w-full h-1.5 z-[2000] bg-gray-200 dark:bg-slate-800 cursor-pointer hover:h-2.5 transition-all"
                onClick={toggleMinimize}
                title="اضغط لتوسيع شريط التقدم"
            >
                <div 
                    className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                    style={{ width: `${percentage}%` }}
                />
            </motion.div>
        );
    }

    return (
        <AnimatePresence>
            <div className="fixed bottom-6 left-6 z-[1999] w-full max-w-sm pointer-events-none">
                <motion.div 
                    initial={{ opacity: 0, y: 20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.9 }}
                    className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl rounded-2xl p-5 border border-indigo-100 dark:border-indigo-900/40 ring-1 ring-black/5"
                    dir="rtl"
                >
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-black text-slate-800 dark:text-slate-200">{label || 'جاري المعالجة'}</span>
                        <button onClick={toggleMinimize} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 group transition-all" title="تصغير إلى شريط علوي">
                            <Minimize2 size={16} className="group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                    <ProgressBar processed={processed} total={total} />
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
