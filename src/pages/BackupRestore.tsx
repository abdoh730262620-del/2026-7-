import React, { useState, useEffect, useRef } from 'react';
import { useBackupStore } from '../store/backupStore';
import { LocalBackupRecord, getLocalBackups, getLocalBackupData, deleteLocalBackup, restoreFromBackupData, performBackup, saveDirHandle } from '../lib/backupService';
import { Settings, Save, Clock, Cloud, Download, Trash2, Mail, Database, HardDrive, RefreshCw, ChevronDown, ChevronUp, FileCode, Archive, Upload, ArrowLeft, FolderOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ExportModal from '../components/ExportModal';
import ArchiveModal from '../components/ArchiveModal';
import DataOperationsModal from '../components/DataOperationsModal';
import { useNavigate } from 'react-router-dom';

export default function BackupRestore() {
    const navigate = useNavigate();
    const { settings, updateSettings } = useBackupStore();
    const [localBackups, setLocalBackups] = useState<Omit<LocalBackupRecord, 'data'>[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isRestoring, setIsRestoring] = useState<{ id: string | null, status: 'loading' | 'success' | 'error' | null }>({ id: null, status: null });

    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
    const [isLocalBackupsModalOpen, setIsLocalBackupsModalOpen] = useState(false);
    const [isDataOperationsModalOpen, setIsDataOperationsModalOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadLocalBackups = async () => {
        const backups = await getLocalBackups();
        setLocalBackups(backups);
    };

    useEffect(() => {
        loadLocalBackups();
    }, []);

    const handleManualBackup = async () => {
        setIsSaving(true);
        try {
            await performBackup(settings.destinations, settings.targetEmail, settings.maxBackupsCount);
            await loadLocalBackups();
        } catch (e) {
            console.error("Backup failed", e);
        }
        setIsSaving(false);
    };

    const handleDeleteBackup = async (id: string) => {
        if (!confirm('هل أنت متأكد من حذف هذه النسخة الاحتياطية؟')) return;
        await deleteLocalBackup(id);
        await loadLocalBackups();
    };

    const handleRestore = async (id: string) => {
        if (!confirm('سيتم استبدال البيانات الحالية ببيانات هذه النسخة. هل أنت متأكد؟')) return;
        setIsRestoring({ id, status: 'loading' });
        try {
            const backup = await getLocalBackupData(id);
            if (backup) {
                const ok = await restoreFromBackupData(backup.data);
                setIsRestoring({ id, status: ok ? 'success' : 'error' });
            } else {
                setIsRestoring({ id, status: 'error' });
            }
        } catch (e) {
            setIsRestoring({ id, status: 'error' });
        }
        setTimeout(() => setIsRestoring({ id: null, status: null }), 3000);
    };

    const handleDownload = async (id: string) => {
        try {
            const backup = await getLocalBackupData(id);
            if (backup) {
                const json = JSON.stringify(backup.data);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `backup_${new Date(backup.timestamp).toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            console.error("Download failed", e);
        }
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            setIsRestoring({ id: 'import', status: 'loading' });
            await restoreFromBackupData(data);
            setIsRestoring({ id: 'import', status: 'success' });
            alert("تم استيراد البيانات واستعادتها بنجاح!");
            window.location.reload(); 
        } catch (err) {
            setIsRestoring({ id: null, status: 'error' });
            alert("حدث خطأ أثناء قراءة أو استعادة الملف. الرجاء التأكد من صحة الملف.");
            console.error("Import failed:", err);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4 bg-white dark:bg-transparent min-h-screen text-black dark:text-gray-100" dir="rtl">
            <div className="flex items-center gap-4 py-2 shrink-0 px-2">
                <h1 className="text-xl font-black text-text-main">النسخ الاحتياطي والاستعادة</h1>
            </div>
            <div className="space-y-4">
                {/* Auto Backup Settings Trigger */}
                <div className="bg-white dark:bg-slate-950 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-[#94B8C7]/20 p-2 rounded-xl text-[#94B8C7]">
                            <RefreshCw size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-black dark:text-white dark:text-gray-100 text-base">النسخ الاحتياطي</h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="text-black dark:text-gray-300 dark:text-gray-400 hover:text-[#94B8C7] transition p-2"
                        >
                            <Settings size={20} />
                        </button>
                        <button 
                            onClick={handleManualBackup}
                            disabled={isSaving}
                            className="flex items-center justify-center gap-2 bg-[#94B8C7] hover:bg-[#7a9da8] text-white py-2 px-3 rounded-xl font-bold transition disabled:opacity-50"
                        >
                            {isSaving ? (
                                <RefreshCw className="animate-spin" size={18} />
                            ) : (
                                <Save size={18} />
                            )}
                            <span className="hidden sm:inline">{isSaving ? "جاري الحفظ..." : "حفظ"}</span>
                        </button>
                    </div>
                </div>

                {/* Export Section */}
                <div className="bg-white dark:bg-slate-950 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-500/20 p-2 rounded-xl text-indigo-500">
                            <FileCode size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-black dark:text-white dark:text-gray-100 text-base">التصدير بلاس</h3>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsExportModalOpen(true)}
                        className="flex items-center justify-center gap-2 bg-white dark:bg-slate-800 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 py-2 px-4 rounded-xl font-bold transition hover:bg-white dark:hover:bg-indigo-900"
                    >
                        <FileCode size={18} />
                        <span>تصدير</span>
                    </button>
                </div>

                {/* Archive Section */}
                <div className="bg-white dark:bg-slate-950 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-amber-500/20 p-2 rounded-xl text-amber-500">
                            <Archive size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-black dark:text-white dark:text-gray-100 text-base">الارشفه</h3>
                        </div>
                    </div>
                    <button 
                        onClick={() => setIsArchiveModalOpen(true)}
                        className="flex items-center justify-center gap-2 bg-white dark:bg-amber-950 text-amber-700 dark:text-amber-300 py-2 px-4 rounded-xl font-bold transition hover:bg-white dark:hover:bg-amber-900"
                    >
                        <Archive size={18} />
                        <span>أرشفة</span>
                    </button>
                </div>

                {/* Restore and Import Section */}
                <div className="bg-white dark:bg-slate-950 rounded-2xl p-4 border border-gray-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-green-500/20 p-2 rounded-xl text-green-500">
                            <RefreshCw size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-black dark:text-white dark:text-gray-100 text-base">الاستعاده والاسترداد</h3>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => setIsDataOperationsModalOpen(true)}
                            className="flex items-center justify-center gap-2 bg-white dark:bg-slate-900 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:border-green-300 text-black dark:text-gray-200 dark:text-gray-300 py-2 px-3 rounded-xl font-bold transition"
                        >
                            <HardDrive size={18} className="text-green-600 dark:text-green-400" />
                            <span className="hidden sm:inline">خيارات الاستعادة</span>
                        </button>
                        
                        <input 
                            type="file" 
                            accept=".json" 
                            className="hidden" 
                            ref={fileInputRef} 
                            onChange={handleImportFile}
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isRestoring.id === 'import' && isRestoring.status === 'loading'}
                            className="flex items-center justify-center gap-2 bg-white dark:bg-green-950 text-green-700 dark:text-green-300 py-2 px-3 rounded-xl font-bold transition hover:bg-white dark:hover:bg-green-900 disabled:opacity-50"
                        >
                            {isRestoring.id === 'import' && isRestoring.status === 'loading' ? (
                                <RefreshCw className="animate-spin" size={18} />
                            ) : (
                                <Upload size={18} />
                            )}
                            <span className="hidden sm:inline">استيراد</span>
                        </button>
                    </div>
                </div>
            </div>
            {/* Auto Backup Settings Modal */}
            <AnimatePresence>
                {isSettingsModalOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setIsSettingsModalOpen(false)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl shadow-xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                            dir="rtl"
                        >
                            <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="bg-[#94B8C7]/10 p-2 rounded-xl text-[#94B8C7]">
                                        <Settings size={20} />
                                    </div>
                                    <h3 className="text-xl font-bold text-black dark:text-white dark:text-white">إعدادات النسخ التلقائي</h3>
                                </div>
                                <button 
                                    onClick={() => setIsSettingsModalOpen(false)}
                                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-white dark:bg-slate-900 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                </button>
                            </div>

                            <div className="p-6 space-y-6">
                                <div className="flex items-center justify-between bg-white dark:bg-slate-900 dark:bg-slate-800/50 p-4 rounded-xl">
                                    <div>
                                        <h4 className="font-bold text-black dark:text-white dark:text-white">تفعيل النسخ التلقائي</h4>
                                        <p className="text-sm text-black mt-1">تشغيل عملية النسخ الاحتياطي بالخلفية</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer"
                                            checked={settings.autoBackupEnabled}
                                            onChange={(e) => updateSettings({ autoBackupEnabled: e.target.checked })}
                                        />
                                        <div className="w-11 h-6 bg-white peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#94B8C7]"></div>
                                    </label>
                                </div>

                                <AnimatePresence>
                                    {settings.autoBackupEnabled && (
                                        <motion.div 
                                            initial={{ opacity: 0, height: 0 }} 
                                            animate={{ opacity: 1, height: 'auto' }} 
                                            exit={{ opacity: 0, height: 0 }}
                                            className="space-y-4"
                                        >
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold text-black dark:text-gray-200 dark:text-gray-300">معدل النسخ التلقائي</label>
                                                    <select 
                                                        className="w-full p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:bg-slate-800 text-black dark:text-white dark:text-white focus:border-[#94B8C7] outline-none transition"
                                                        value={settings.autoBackupInterval}
                                                        onChange={(e) => updateSettings({ autoBackupInterval: e.target.value as any })}
                                                    >
                                                        <option value="5_min">كل 5 دقائق</option>
                                                        <option value="1_hour">كل ساعة</option>
                                                        <option value="daily">يومياً</option>
                                                        <option value="on_change">عند كل تغيير للبيانات</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-bold text-black dark:text-gray-200 dark:text-gray-300">الحد الأقصى لعدد النسخ المحتفظ بها محلياً</label>
                                                    <input 
                                                        type="number" 
                                                        className="w-full p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:bg-slate-800 text-black dark:text-white dark:text-white focus:border-[#94B8C7] outline-none transition"
                                                        value={settings.maxBackupsCount}
                                                        onChange={(e) => updateSettings({ maxBackupsCount: parseInt(e.target.value) || 1 })}
                                                        min="1"
                                                        max="100"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-slate-800">
                                                <label className="text-sm font-bold text-black dark:text-gray-200 dark:text-gray-300 mb-2 block">أماكن الحفظ</label>
                                                
                                                <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 dark:bg-slate-800/50 cursor-pointer hover:border-[#94B8C7] transition">
                                                    <input 
                                                        type="checkbox" 
                                                        className="w-4 h-4 text-[#94B8C7] rounded border-gray-300"
                                                        checked={settings.destinations.local}
                                                        onChange={(e) => updateSettings({ destinations: { ...settings.destinations, local: e.target.checked } })}
                                                    />
                                                    <HardDrive size={18} className="text-black" />
                                                    <span className="text-sm font-semibold text-black dark:text-gray-200 dark:text-gray-300">التخزين المحلي للجهاز</span>
                                                </label>

                                                <div className="space-y-2">
                                                    <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 dark:bg-slate-800/50 cursor-pointer hover:border-[#94B8C7] transition">
                                                        <input 
                                                            type="checkbox" 
                                                            className="w-4 h-4 text-[#94B8C7] rounded border-gray-300"
                                                            checked={settings.destinations.email}
                                                            onChange={(e) => updateSettings({ destinations: { ...settings.destinations, email: e.target.checked } })}
                                                        />
                                                        <Mail size={18} className="text-black" />
                                                        <span className="text-sm font-semibold text-black dark:text-gray-200 dark:text-gray-300">البريد الإلكتروني</span>
                                                    </label>
                                                    {settings.destinations.email && (
                                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                                            <input 
                                                                type="email"
                                                                placeholder="test@example.com"
                                                                dir="ltr"
                                                                value={settings.targetEmail}
                                                                onChange={(e) => updateSettings({ targetEmail: e.target.value })}
                                                                className="w-full mt-2 p-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-left font-mono text-sm focus:border-[#94B8C7] outline-none text-black dark:text-white dark:text-white transition"
                                                            />
                                                        </motion.div>
                                                    )}
                                                </div>

                                                <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 dark:bg-slate-800/50 cursor-pointer hover:border-[#94B8C7] transition">
                                                    <input 
                                                        type="checkbox" 
                                                        className="w-4 h-4 text-[#94B8C7] rounded border-gray-300"
                                                        checked={settings.destinations.cloud}
                                                        onChange={(e) => updateSettings({ destinations: { ...settings.destinations, cloud: e.target.checked } })}
                                                    />
                                                    <Cloud size={18} className="text-black" />
                                                    <span className="text-sm font-semibold text-black dark:text-gray-200 dark:text-gray-300">التخزين السحابي</span>
                                                </label>
                                                
                                                <div className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 dark:bg-slate-800/50 hover:border-[#94B8C7] transition">
                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                        <input 
                                                            type="checkbox" 
                                                            className="w-4 h-4 text-[#94B8C7] rounded border-gray-300"
                                                            checked={settings.destinations.fileSystem}
                                                            onChange={(e) => updateSettings({ destinations: { ...settings.destinations, fileSystem: e.target.checked } })}
                                                        />
                                                        <FolderOpen size={18} className="text-black" />
                                                        <span className="text-sm font-semibold text-black dark:text-gray-200 dark:text-gray-300">مجلد في الجهاز (حفظ مباشر)</span>
                                                    </label>
                                                    
                                                    {settings.destinations.fileSystem && (
                                                        <button 
                                                            onClick={async () => {
                                                                if ('showDirectoryPicker' in window) {
                                                                    try {
                                                                        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
                                                                        await saveDirHandle(dirHandle);
                                                                        alert('تم تحديد المجلد بنجاح. سيتم إنشاء مجلد الفرعي "نسخ_تطبيق_المبيعات" داخله.');
                                                                    } catch (err) {
                                                                        console.error(err);
                                                                    }
                                                                } else {
                                                                    alert('عذراً، متصفحك لا يدعم هذه الميزة.');
                                                                }
                                                            }}
                                                            className="text-xs font-bold text-white bg-[#94B8C7] px-3 py-1.5 rounded-lg hover:bg-[#7a9da8] transition"
                                                        >
                                                            تحديد المجلد
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <ExportModal 
                isOpen={isExportModalOpen} 
                onClose={() => setIsExportModalOpen(false)} 
            />

            <ArchiveModal 
                isOpen={isArchiveModalOpen} 
                onClose={() => setIsArchiveModalOpen(false)} 
            />

            <DataOperationsModal 
                isOpen={isDataOperationsModalOpen}
                onClose={() => setIsDataOperationsModalOpen(false)}
            />

            <AnimatePresence>
                {isLocalBackupsModalOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setIsLocalBackupsModalOpen(false)}
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
                                    <div className="bg-[#94B8C7]/10 p-2 rounded-xl text-[#94B8C7]">
                                        <HardDrive size={24} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-black dark:text-white dark:text-white">النسخ المحلية بالجهاز</h3>
                                        <p className="text-sm text-black mt-1">تتم أرشفة {localBackups.length} من أصل {settings.maxBackupsCount} في جهازك</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setIsLocalBackupsModalOpen(false)}
                                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-white dark:bg-slate-900 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-colors"
                                >
                                    <ChevronDown size={20} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                                {localBackups.length === 0 ? (
                                    <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-gray-400">
                                        <Database size={40} className="mb-3 opacity-20" />
                                        <p className="text-sm font-medium">لا توجد نسخ احتياطية محفوظة حالياً</p>
                                    </div>
                                ) : (
                                    localBackups.map(backup => (
                                        <div key={backup.id} className="p-4 rounded-xl border border-gray-100 dark:border-slate-800 flex items-center justify-between hover:border-[#94B8C7] transition group">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-[#94B8C7]/10 p-2 rounded-lg text-[#94B8C7]">
                                                    <ArchiveIcon />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-black dark:text-white dark:text-white" dir="ltr">
                                                        {new Date(backup.timestamp).toLocaleString()}
                                                    </div>
                                                    <div className="text-xs text-black">
                                                        {(backup.sizeBytes / 1024).toFixed(1)} KB
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                
                                                {isRestoring.id === backup.id ? (
                                                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${isRestoring.status === 'loading' ? 'text-blue-500' : isRestoring.status === 'success' ? 'text-green-500' : 'text-red-500'}`}>
                                                        {isRestoring.status === 'loading' ? 'جاري...' : isRestoring.status === 'success' ? 'تمت بنجاح' : 'فشل'}
                                                    </span>
                                                ) : (
                                                    <button 
                                                        onClick={() => handleRestore(backup.id)}
                                                        title="استعادة"
                                                        className="p-1.5 text-blue-500 hover:bg-white dark:hover:bg-blue-500/10 rounded-lg transition"
                                                    >
                                                        <RefreshCw size={18} />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={() => handleDownload(backup.id)}
                                                    title="تحميل"
                                                    className="p-1.5 text-black hover:bg-white dark:hover:bg-slate-800 rounded-lg transition"
                                                >
                                                    <Download size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteBackup(backup.id)}
                                                    title="حذف"
                                                    className="p-1.5 text-red-500 hover:bg-white dark:hover:bg-red-500/10 rounded-lg transition opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function ArchiveIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="8" x="2" y="3" rx="2" />
            <path d="M4 11v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9" />
            <path d="M10 16h4" />
        </svg>
    );
}
