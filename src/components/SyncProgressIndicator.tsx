import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSyncStore } from '../store/syncStore';
import { useUIStore } from '../store/uiStore';

export default function SyncProgressIndicator() {
    const { isSyncing, syncProgress } = useSyncStore();
    const { hasActiveModal } = useUIStore();

    if (!isSyncing || hasActiveModal()) {
        return null;
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full max-w-2xl mx-auto mb-3 px-1"
                dir="rtl"
            >
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 animate-pulse">جاري المزامنة مع السحابة...</span>
                    <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 font-mono">{syncProgress}%</span>
                </div>
                <div className="w-full h-1 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: '0%' }}
                        animate={{ width: `${syncProgress}%` }}
                        transition={{ duration: 0.1, ease: 'easeOut' }}
                        className="h-full rounded-full bg-blue-500"
                    />
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

