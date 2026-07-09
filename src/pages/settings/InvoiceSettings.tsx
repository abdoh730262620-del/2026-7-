import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../../store/settingsStore';
import { FileSignature, ChevronRight, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function InvoiceSettings() {
    const navigate = useNavigate();
    const { settings, updateSettings } = useSettingsStore();
    const [isSaving, setIsSaving] = useState(false);
    const [localSettings, setLocalSettings] = useState(settings);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateSettings(localSettings);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء حفظ الإعدادات');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="pb-8 pt-2 px-2 max-w-2xl mx-auto w-full">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                    <div className="w-10 h-10 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 rounded-xl flex items-center justify-center">
                        <FileSignature size={20} className="stroke-[2.5]" />
                    </div>
                    <div className="mr-1">
                        <h2 className="text-lg md:text-xl font-bold text-black dark:text-white leading-tight">إعدادات الفاتورة والطباعة</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">تعديل معلومات الفاتورة المطبوعة والشعار الافتراضي</p>
                    </div>
                </div>
                <div className="mr-auto flex items-center gap-2">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 bg-black hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-100 text-white px-3 py-1.5 rounded-lg font-bold transition disabled:opacity-50 text-sm cursor-pointer"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        <span>حفظ الإعدادات</span>
                    </button>
                </div>
            </div>

            {showSuccess && (
                <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-3 p-3 bg-white dark:bg-slate-950 border border-emerald-200 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-xl flex items-center gap-2 font-bold text-sm shadow-sm"
                >
                    <CheckCircle2 size={16} />
                    تم حفظ الإعدادات بنجاح
                </motion.div>
            )}

            <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-black dark:text-gray-300">اسم النشاط التجاري</label>
                        <input 
                            type="text" 
                            value={localSettings.businessName || ''}
                            onChange={(e) => setLocalSettings(prev => ({ ...prev, businessName: e.target.value }))}
                            className="w-full border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-black dark:text-white px-3 py-2 rounded-lg text-sm focus:border-rose-500 outline-none"
                            placeholder="مثال: أسواق عبدالمجيد"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-black dark:text-gray-300">المقاس الافتراضي للطباعة</label>
                        <select 
                            value={localSettings.printerPaperSize || 'A4'}
                            onChange={(e) => setLocalSettings(prev => ({ ...prev, printerPaperSize: e.target.value as any }))}
                            className="w-full border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-black dark:text-white px-3 py-2 rounded-lg text-sm focus:border-rose-500 outline-none"
                        >
                            <option value="A4" className="bg-white dark:bg-slate-900 text-black dark:text-white">A4 (طابعة عادية)</option>
                            <option value="Thermal80" className="bg-white dark:bg-slate-900 text-black dark:text-white">ورق حراري 80mm</option>
                            <option value="Thermal58" className="bg-white dark:bg-slate-900 text-black dark:text-white">ورق حراري 58mm</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-black dark:text-gray-300">العنوان</label>
                        <input 
                            type="text" 
                            value={localSettings.businessAddress || ''}
                            onChange={(e) => setLocalSettings(prev => ({ ...prev, businessAddress: e.target.value }))}
                            className="w-full border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-black dark:text-white px-3 py-2 rounded-lg text-sm focus:border-rose-500 outline-none"
                            placeholder="مثال: الرياض"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-black dark:text-gray-300">أرقام التواصل</label>
                        <input 
                            type="text" 
                            value={localSettings.businessPhone || ''}
                            onChange={(e) => setLocalSettings(prev => ({ ...prev, businessPhone: e.target.value }))}
                            className="w-full border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-black dark:text-white px-3 py-2 rounded-lg text-sm focus:border-rose-500 outline-none"
                            placeholder="مثال: 0500000000"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-black dark:text-gray-300">توسيط النصوص (الترويسات)</label>
                        <select 
                            value={localSettings.headerTextAlignment || 'center'}
                            onChange={(e) => setLocalSettings(prev => ({ ...prev, headerTextAlignment: e.target.value as any }))}
                            className="w-full border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-black dark:text-white px-3 py-2 rounded-lg text-sm focus:border-rose-500 outline-none"
                        >
                            <option value="center" className="bg-white dark:bg-slate-900 text-black dark:text-white">في المنتصف</option>
                            <option value="right" className="bg-white dark:bg-slate-900 text-black dark:text-white">يمين (افتراضي)</option>
                            <option value="left" className="bg-white dark:bg-slate-900 text-black dark:text-white">يسار</option>
                        </select>
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-1.5 mt-2">
                        <label className="text-[11px] font-bold text-black dark:text-gray-300">شعار المؤسسة (صورة)</label>
                        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-gray-150 dark:border-slate-800">
                            {localSettings.businessLogoUrl && (
                                <div className="w-12 h-12 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5 shrink-0 flex items-center justify-center overflow-hidden">
                                    <img src={localSettings.businessLogoUrl} alt="Logo" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                                </div>
                            )}
                            <div className="flex-1">
                                <input 
                                    type="file" 
                                    accept="image/*"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                                setLocalSettings(prev => ({ ...prev, businessLogoUrl: reader.result as string }));
                                            };
                                            reader.readAsDataURL(file);
                                        }
                                    }}
                                    className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border file:border-gray-200 dark:file:border-slate-800 file:text-xs file:font-semibold file:bg-gray-50 dark:file:bg-slate-800 file:text-rose-600 dark:file:text-rose-400 hover:file:bg-gray-100 cursor-pointer text-gray-500"
                                />
                            </div>
                            {localSettings.businessLogoUrl && (
                                <button 
                                    onClick={() => setLocalSettings(prev => ({ ...prev, businessLogoUrl: '' }))}
                                    className="px-3 py-1.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-lg text-xs hover:bg-red-100 font-bold shrink-0 transition"
                                >
                                    حذف
                                </button>
                            )}
                        </div>
                        <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-1 font-bold">* الشعار يظهر أعلى الفاتورة (متاح للطابعات العادية والحرارية).</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
