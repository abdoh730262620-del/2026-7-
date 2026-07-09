import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Check, Calendar, Filter, Database, FileCode } from 'lucide-react';
import { generateHtmlExport } from '../lib/htmlExportGenerator';
import { useProgressStore } from '../store/progressStore';
import { useAuthStore } from '../store/authStore';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ExportModal({ isOpen, onClose }: ExportModalProps) {
    const { appUser } = useAuthStore();
    const { start, update, finish, show } = useProgressStore();
    const isExporting = show;
    
    // Filters state
    const [selectedCollections, setSelectedCollections] = useState<string[]>(['all']);
    const [selectedYear, setSelectedYear] = useState<string>('all');
    const [selectedMonths, setSelectedMonths] = useState<string[]>(['all']);

    const collectionsOpts = [
        { id: 'all', label: 'كل السجلات' },
        { id: 'sales', label: 'المبيعات' },
        { id: 'purchases', label: 'المشتريات' },
        { id: 'cash', label: 'حركة الصندوق' },
        { id: 'customers', label: 'العملاء والأرصدة' },
        { id: 'suppliers', label: 'الموردين والأرصدة' },
        { id: 'products', label: 'المنتجات والمخزون' },
        { id: 'vouchers', label: 'سندات القبض والصرف' }
    ];

    const currentYear = new Date().getFullYear();
    const years = ['all', ...Array.from({ length: 5 }, (_, i) => (currentYear - i).toString())];
    
    const months = [
        { id: 'all', label: 'كل الشهور' },
        { id: '1', label: '1' }, { id: '2', label: '2' }, { id: '3', label: '3' },
        { id: '4', label: '4' }, { id: '5', label: '5' }, { id: '6', label: '6' },
        { id: '7', label: '7' }, { id: '8', label: '8' }, { id: '9', label: '9' },
        { id: '10', label: '10' }, { id: '11', label: '11' }, { id: '12', label: '12' }
    ];

    const toggleCollection = (id: string) => {
        if (id === 'all') {
            setSelectedCollections(['all']);
            return;
        }
        let newSelection = selectedCollections.filter(c => c !== 'all');
        if (newSelection.includes(id)) {
            newSelection = newSelection.filter(c => c !== id);
            if (newSelection.length === 0) newSelection = ['all'];
        } else {
            newSelection.push(id);
        }
        setSelectedCollections(newSelection);
    };

    const toggleMonth = (id: string) => {
        if (id === 'all') {
            setSelectedMonths(['all']);
            return;
        }
        let newSelection = selectedMonths.filter(c => c !== 'all');
        if (newSelection.includes(id)) {
            newSelection = newSelection.filter(c => c !== id);
            if (newSelection.length === 0) newSelection = ['all'];
        } else {
            newSelection.push(id);
        }
        setSelectedMonths(newSelection);
    };

    const handleExport = async () => {
        if (!appUser) return;
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

        start(100, "جاري التصدير...");
        update(10);
        try {
            const filters = {
                collections: selectedCollections.includes('all') ? collectionsOpts.map(c => c.id).filter(id => id !== 'all') : selectedCollections,
                year: selectedYear,
                months: selectedMonths.includes('all') ? [] : selectedMonths.map(m => parseInt(m)),
                tenantId
            };
            
            update(30);
            const htmlContent = await generateHtmlExport(filters);
            update(80);
            
            // Download the file
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `export_${new Date().toISOString().split('T')[0]}.html`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            update(100);
            onClose();
        } catch (error) {
            console.error("Export failed:", error);
            alert("حدث خطأ أثناء التصدير");
        } finally {
            finish();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={onClose}
                >
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
                        onClick={e => e.stopPropagation()}
                        dir="rtl"
                    >
                        <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="bg-indigo-500/10 p-2 rounded-xl text-indigo-500">
                                    <FileCode size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-black dark:text-white dark:text-white">التصدير بلاس</h3>
                                    <p className="text-sm text-black mt-1">تصدير شامل لجميع بيانات النظام بصيغة HTML</p>
                                </div>
                            </div>
                            <button 
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-white dark:bg-slate-900 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-8 flex-1 custom-scrollbar">
                            
                            {/* Record types */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 mb-4">
                                    <Database size={18} className="text-gray-400" />
                                    <h4 className="font-bold text-black dark:text-gray-200 dark:text-gray-300">السجلات المراد تصديرها</h4>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {collectionsOpts.map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => toggleCollection(opt.id)}
                                            className={`p-3 rounded-xl border text-sm font-bold flex items-center justify-between transition-all ${
                                                selectedCollections.includes(opt.id) 
                                                    ? 'border-indigo-500 bg-white dark:bg-slate-800 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' 
                                                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-black dark:text-gray-300 dark:text-gray-400 hover:border-blue-500'
                                            }`}
                                        >
                                            <span>{opt.label}</span>
                                            {selectedCollections.includes(opt.id) && <Check size={16} />}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Date filters */}
                            <div className="space-y-6 pt-6 border-t border-gray-100 dark:border-slate-800">
                                <div className="flex items-center gap-2 mb-4">
                                    <Calendar size={18} className="text-gray-400" />
                                    <h4 className="font-bold text-black dark:text-gray-200 dark:text-gray-300">الفترة الزمنية</h4>
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-black dark:text-gray-200 dark:text-gray-400">السنة</label>
                                        <select 
                                            value={selectedYear}
                                            onChange={(e) => setSelectedYear(e.target.value)}
                                            className="w-full p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:bg-slate-800 text-black dark:text-white dark:text-white focus:border-indigo-500 outline-none"
                                        >
                                            <option value="all">كل السنوات</option>
                                            {years.filter(y => y !== 'all').map(y => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-black dark:text-gray-200 dark:text-gray-400">الشهور المحددة</label>
                                        <div className="flex flex-wrap gap-2">
                                            {months.map(m => (
                                                <button
                                                    key={m.id}
                                                    onClick={() => toggleMonth(m.id)}
                                                    className={`px-4 py-2 rounded-lg text-sm font-bold border transition-all ${
                                                        selectedMonths.includes(m.id)
                                                            ? 'border-indigo-500 bg-white dark:bg-slate-800 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' 
                                                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-black dark:text-gray-300 dark:text-gray-400 hover:border-blue-500'
                                                    }`}
                                                >
                                                    {m.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>

                        <div className="p-6 border-t border-gray-100 dark:border-slate-800 shrink-0">
                            <button 
                                onClick={handleExport}
                                disabled={isExporting || selectedCollections.length === 0 || selectedMonths.length === 0}
                                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-xl font-bold transition disabled:opacity-50"
                            >
                                {isExporting ? (
                                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Download size={24} />
                                )}
                                <span>{isExporting ? 'جاري تجهيز وبناء التصدير...' : 'تصدير وإنشاء التقرير (HTML)'}</span>
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
