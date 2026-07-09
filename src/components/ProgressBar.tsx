import React from 'react';
import { motion } from 'framer-motion';

interface ProgressBarProps {
    processed: number;
    total: number;
    label?: string;
}

export default function ProgressBar({ processed, total, label }: ProgressBarProps) {
    const percentage = total > 0 ? Math.min(100, (processed / total) * 100) : 0;
    return (
        <div className="w-full mt-4" dir="rtl">
            {label && <p className="text-sm text-gray-500 mb-1 text-right">{label}</p>}
            <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <motion.div 
                    className="h-full bg-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.3 }}
                />
            </div>
            <p className="text-xs text-gray-400 mt-1 text-left">{processed} / {total}</p>
        </div>
    );
}
