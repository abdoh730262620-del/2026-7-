import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { Store, MapPin, Phone, Upload, Image, ShieldCheck, Save, Loader2, AlertCircle, Trash2, Sparkles, Building2, X } from 'lucide-react';

export default function ForceStoreSetupOverlay() {
    const { appUser } = useAuthStore();
    const { settings, updateSettings, initialized } = useSettingsStore();

    const [businessName, setBusinessName] = useState('');
    const [businessAddress, setBusinessAddress] = useState('');
    const [businessPhone, setBusinessPhone] = useState('');
    const [businessLogoUrl, setBusinessLogoUrl] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);

    const tenantId = appUser?.tenantId || 'single_store';

    // Sync state with settings if they exist
    useEffect(() => {
        if (settings) {
            setBusinessName(settings.businessName === 'محل بريق للمبيعات' ? '' : settings.businessName || '');
            setBusinessAddress(settings.businessAddress || '');
            setBusinessPhone(settings.businessPhone || '');
            setBusinessLogoUrl(settings.businessLogoUrl || '');
        }
    }, [settings]);

    if (!appUser || !initialized || isDismissed) return null;

    // Check if dismissed in localStorage for this tenant
    const isDismissedInLocal = localStorage.getItem(`store_setup_dismissed_${tenantId}`) === 'true';
    if (isDismissedInLocal) return null;

    // Only administrators (owners) configure the store settings
    if (appUser.role !== 'admin') return null;

    // Determine if they are still on default password. If so, let them change password first!
    const currentPass = (appUser.password || '').trim().toLowerCase();
    const isDefaultPassword = !appUser.password || ['admin', 'admin123', 'admin_initial', 'password'].includes(currentPass);
    if (isDefaultPassword) return null;

    // Determine if the store is configured:
    // If settings.isStoreConfigured is true OR if a valid custom business name is already recorded
    const hasCustomBusinessName = Boolean(
        settings.businessName && 
        settings.businessName.trim() !== '' && 
        settings.businessName !== 'محل بريق للمبيعات'
    );

    if (settings.isStoreConfigured || hasCustomBusinessName) return null;

    const handleDismiss = () => {
        try {
            localStorage.setItem(`store_setup_dismissed_${tenantId}`, 'true');
        } catch (e) {}
        setIsDismissed(true);
    };

    const handleSaveStoreInfo = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const nameTrimmed = businessName.trim();
        const addressTrimmed = businessAddress.trim();
        const phoneTrimmed = businessPhone.trim();

        if (!nameTrimmed) {
            return setError('العفو، يرجى كتابة الاسم الرسمي لمتجرك أولاً لتهيئة الفواتير.');
        }

        if (nameTrimmed === 'محل بريق للمبيعات') {
            return setError('يرجى اختيار اسم تجاري مميز تملكه بدلاً من الاسم الافتراضي المؤقت.');
        }

        setIsSaving(true);
        try {
            await updateSettings({
                businessName: nameTrimmed,
                businessAddress: addressTrimmed,
                businessPhone: phoneTrimmed,
                businessLogoUrl: businessLogoUrl,
                isStoreConfigured: true
            });
            try {
                localStorage.setItem(`store_setup_dismissed_${tenantId}`, 'true');
            } catch (e) {}
            setIsDismissed(true);
        } catch (err: any) {
            console.error('Error saving store initial info:', err);
            setError('فشل حفظ معلومات المتجر سحابياً، تحقق من اتصالك بشبكة الإنترنت وحاول مجدداً.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 dark:bg-slate-950/90 backdrop-blur-md z-[200] flex items-center justify-center p-3 sm:p-4 overflow-y-auto" dir="rtl">
            
            {/* Main Dialog Panel */}
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[28px] shadow-2xl border border-indigo-50/80 dark:border-slate-800/80 overflow-hidden transform transition-all duration-300 my-auto flex flex-col justify-between relative">
                
                {/* Dismiss Close Button */}
                <button
                    type="button"
                    onClick={handleDismiss}
                    className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full transition z-10"
                    title="تخطي وحفظ لاحقاً"
                >
                    <X size={18} />
                </button>

                {/* Visual Top Decorative Gradient */}
                <div className="h-2 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600"></div>

                <div className="p-5 sm:p-7">
                    {/* Header with Luxury Store Icon */}
                    <div className="text-center mb-5 sm:mb-6">
                        <div className="relative inline-block">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md shadow-indigo-200 dark:shadow-none">
                                <Building2 className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                            </div>
                            <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500"></span>
                            </span>
                        </div>
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center justify-center gap-1.5">
                            تهيئة وتخصيص متجرك السحابي
                            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-[11px] sm:text-xs mt-1 leading-relaxed max-w-sm mx-auto">
                            خطوة أخيرة وسريعة! معلوماتك المدخلة هنا ستنطبع وتظهر تلقائياً وبتنسيق احترافي في أعلى <strong>الفواتير الصادرة والتقارير المالية</strong>.
                        </p>
                    </div>

                    <form onSubmit={handleSaveStoreInfo} className="space-y-4">
                        
                        {error && (
                            <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-xs text-right leading-relaxed border border-red-100/60 dark:border-red-900/40 flex gap-2 items-start shrink-0">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Store Name Input */}
                        <div className="space-y-1">
                            <label className="block text-slate-700 dark:text-slate-300 font-extrabold mr-1 text-xs sm:text-[13px] flex items-center gap-1">
                                <Store className="w-3.5 h-3.5 text-indigo-500" />
                                اسم متجرك / اسم النشاط التجاري <span className="text-red-500 font-black">*</span>
                            </label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 p-3 rounded-2xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition text-sm font-bold placeholder:text-gray-300 dark:placeholder:text-gray-700 text-slate-800 dark:text-slate-100 min-h-[44px]"
                                value={businessName}
                                onChange={e => setBusinessName(e.target.value)}
                                placeholder="مثال: أسواق بريق المركزية"
                                required
                            />
                        </div>

                        {/* Address Field */}
                        <div className="space-y-1">
                            <label className="block text-slate-700 dark:text-slate-300 font-extrabold mr-1 text-xs sm:text-[13px] flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                                موقع أو عنوان المتجر بالتفصيل
                            </label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 p-3 rounded-2xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition text-sm font-bold placeholder:text-gray-300 dark:placeholder:text-gray-700 text-slate-800 dark:text-slate-100 min-h-[44px]"
                                value={businessAddress}
                                onChange={e => setBusinessAddress(e.target.value)}
                                placeholder="مثال: الرياض - شارع الملك سلمان، حي النرجس"
                            />
                        </div>

                        {/* Phone Number Field */}
                        <div className="space-y-1">
                            <label className="block text-slate-700 dark:text-slate-300 font-extrabold mr-1 text-xs sm:text-[13px] flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5 text-indigo-500" />
                                رقم الهاتف والاتصال للمتجر
                            </label>
                            <input 
                                type="tel" 
                                className="w-full border border-gray-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 p-3 rounded-2xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition text-sm font-bold placeholder:text-gray-300 dark:placeholder:text-gray-700 text-slate-800 dark:text-slate-100 text-right min-h-[44px]"
                                value={businessPhone}
                                onChange={e => setBusinessPhone(e.target.value)}
                                placeholder="مثال: 0501234567"
                                dir="ltr"
                            />
                        </div>

                        {/* Store Logo (Non-required Upload) */}
                        <div className="space-y-1">
                            <label className="block text-slate-700 dark:text-slate-300 font-extrabold mr-1 text-xs sm:text-[13px] flex items-center gap-1">
                                <Image className="w-3.5 h-3.5 text-indigo-500" />
                                شعار المتجر أو المؤسسة (صورة - اختياري)
                            </label>
                            
                            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-2xl border border-gray-200 dark:border-slate-800/80">
                                {businessLogoUrl ? (
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5 shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
                                        <img src={businessLogoUrl} alt="Store Logo Preview" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                                    </div>
                                ) : (
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl border border-dashed border-gray-350 dark:border-slate-800 bg-white dark:bg-slate-900/50 shrink-0 flex items-center justify-center text-gray-400 dark:text-gray-500">
                                        <Upload className="w-5 h-5" />
                                    </div>
                                )}

                                <div className="flex-1 min-w-0">
                                    <label className="inline-block bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-750 border border-gray-200 dark:border-slate-700 px-3 py-2 rounded-xl text-xs font-black text-slate-700 dark:text-slate-300 cursor-pointer shadow-sm active:scale-98 transition min-h-[38px] flex items-center">
                                        <span>اختر صورة الشعار</span>
                                        <input 
                                            type="file" 
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        setBusinessLogoUrl(reader.result as string);
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                            className="hidden"
                                        />
                                    </label>
                                    <p className="text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-medium leading-tight">سيظهر كعلامة تجارية في ترويسة الفواتير</p>
                                </div>

                                {businessLogoUrl && (
                                    <button 
                                        type="button"
                                        onClick={() => setBusinessLogoUrl('')}
                                        className="p-2 border border-red-200 dark:border-red-950/30 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/60 rounded-xl transition duration-150 shrink-0 min-h-[40px] flex items-center justify-center"
                                        title="حذف الشعار"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Shield confirmation banner */}
                        <div className="bg-indigo-50/50 dark:bg-indigo-950/10 text-indigo-700 dark:text-indigo-400 p-3 rounded-2xl border border-indigo-100/30 dark:border-slate-800/80 text-[10px] sm:text-xs leading-relaxed flex items-start gap-2">
                            <ShieldCheck className="w-4 h-4 shrink-0 text-indigo-500 mt-0.5" />
                            <span>يتم تشفير وتأمين وحفظ كافة البيانات الخاصة بنشاطكم تلقائياً وبأمان تام على خوادم Google Cloud.</span>
                        </div>

                        {/* Action buttons */}
                        <div className="pt-2">
                            <button 
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 active:translate-y-px text-white font-black py-3 px-4 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-xs min-h-[48px]"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                        <span>جاري تأسيس متجرك سحابياً...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 shrink-0" />
                                        <span>حفظ بيانات المتجر وتفعيل لوحة التحكم</span>
                                    </>
                                )}
                            </button>
                        </div>

                    </form>
                </div>
            </div>
            
        </div>
    );
}
