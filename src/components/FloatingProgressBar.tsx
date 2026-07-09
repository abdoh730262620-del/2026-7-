import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minimize2, Maximize2 } from 'lucide-react';
import ProgressBar from './ProgressBar';
import { useProgressStore } from '../store/progressStore';

export default function FloatingProgressBar() {
    const { show, isMinimized, label, processed, total, toggleMinimize } = useProgressStore();

    if (!show) return null;

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
            <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[1999] flex items-center justify-center p-4">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl rounded-2xl p-6 border border-gray-200 dark:border-slate-800"
                    dir="rtl"
                >
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-base font-black text-gray-800 dark:text-gray-200">{label || 'جاري المعالجة'}</span>
                        <button onClick={toggleMinimize} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-500 dark:text-gray-400 group transition-all" title="تصغير إلى شريط علوي">
                            <Minimize2 size={18} className="group-hover:scale-110 transition-transform" />
                        </button>
                    </div>
                    <ProgressBar processed={processed} total={total} />
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
