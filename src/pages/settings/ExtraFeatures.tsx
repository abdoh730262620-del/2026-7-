import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../../store/settingsStore';
import { ChevronRight, BrainCircuit, Wrench, ShieldCheck, Save, Loader2, Star, CheckCircle2, CalendarDays, Globe, Users, MessageCircle, FileSignature, Trash2, Plus, RefreshCw, AlertCircle, Info, Coins, Package } from 'lucide-react';
import { motion } from 'framer-motion';

interface CustomToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    activeColorClass: string;
}

function CustomToggle({ checked, onChange, activeColorClass }: CustomToggleProps) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`w-14 h-8 rounded-full transition-colors duration-300 ease-in-out relative flex items-center cursor-pointer focus:outline-none border shrink-0 ${
                checked 
                    ? `${activeColorClass} border-transparent shadow-[0_0_12px_rgba(0,0,0,0.15)]` 
                    : 'bg-gray-200 dark:bg-slate-800 border-gray-300 dark:border-slate-705'
            }`}
        >
            <span
                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.25)] transform transition-transform duration-300 ease-in-out ${
                    checked ? 'translate-x-7' : 'translate-x-0.5'
                }`}
            />
        </button>
    );
}

export default function ExtraFeatures() {
    const navigate = useNavigate();
    const { settings, updateSettings } = useSettingsStore();
    const [isSaving, setIsSaving] = useState(false);
    const [localSettings, setLocalSettings] = useState(settings);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    // Multi-currency temporary states
    const [newCurrencyCode, setNewCurrencyCode] = useState('');
    const [newCurrencyName, setNewCurrencyName] = useState('');
    const [newCurrencyRate, setNewCurrencyRate] = useState('');
    const [newCurrencySymbol, setNewCurrencySymbol] = useState('');
    const [isFetchingRates, setIsFetchingRates] = useState(false);
    const [rateApiStatus, setRateApiStatus] = useState<string | null>(null);

    const handleAddCurrency = () => {
        if (!newCurrencyCode || !newCurrencyRate || !newCurrencySymbol) {
            alert('يرجى ملء جميع الحقول الإلزامية للعملة الإضافية (الرمز والرمز المختصر وسعر الصرف)');
            return;
        }
        
        const rateVal = parseFloat(newCurrencyRate);
        if (isNaN(rateVal) || rateVal <= 0) {
            alert('سعر الصرف يجب أن يكون رقماً أكبر من صفر');
            return;
        }

        const currentList = localSettings.additionalCurrencies || [];
        if (currentList.some(c => c.code.toUpperCase() === newCurrencyCode.toUpperCase())) {
            alert('هذه العملة مضافة بالفعل!');
            return;
        }

        const newCurr = {
            code: newCurrencyCode.toUpperCase(),
            name: newCurrencyName || newCurrencyCode.toUpperCase(),
            rate: rateVal,
            symbol: newCurrencySymbol,
            updatedAt: Date.now()
        };

        setLocalSettings(prev => ({
            ...prev,
            additionalCurrencies: [...(prev.additionalCurrencies || []), newCurr]
        }));

        setNewCurrencyCode('');
        setNewCurrencyName('');
        setNewCurrencyRate('');
        setNewCurrencySymbol('');
    };

    const handleRemoveCurrency = (code: string) => {
        if (!window.confirm(`هل أنت متأكد من حذف العملة ${code}؟`)) return;
        setLocalSettings(prev => ({
            ...prev,
            additionalCurrencies: (prev.additionalCurrencies || []).filter(c => c.code !== code)
        }));
    };

    const handleFetchExchangeRatesOnline = async () => {
        const base = localSettings.baseCurrency || 'SAR';
        setIsFetchingRates(true);
        setRateApiStatus('جاري الاتصال بـ API لأسعار الصرف...');
        try {
            const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
            if (!res.ok) throw new Error('فشل جلب أسعار الصرف من الخادم');
            const data = await res.json();
            
            if (data && data.rates) {
                const apiRates = data.rates as Record<string, number>;
                const currentList = localSettings.additionalCurrencies || [];
                if (currentList.length === 0) {
                    const prefilled = [
                        { code: 'USD', name: 'دولار أمريكي', rate: apiRates.USD ? parseFloat((1 / apiRates.USD).toFixed(6)) : 3.75, symbol: '$' },
                        { code: 'EUR', name: 'يورو', rate: apiRates.EUR ? parseFloat((1 / apiRates.EUR).toFixed(6)) : 4.05, symbol: '€' },
                        { code: 'YER', name: 'ريال يمني', rate: apiRates.YER ? parseFloat((1 / apiRates.YER).toFixed(6)) : 0.015, symbol: 'ر.ي' }
                    ];
                    setLocalSettings(prev => ({
                        ...prev,
                        additionalCurrencies: prefilled
                    }));
                    setRateApiStatus(`تم استرجاع الأسعار الأساسية لـ ${base} بنجاح!`);
                } else {
                    const updatedList = currentList.map(curr => {
                        const apiRate = apiRates[curr.code];
                        if (apiRate) {
                            return {
                                ...curr,
                                rate: parseFloat((1 / apiRate).toFixed(6)),
                                updatedAt: Date.now()
                            };
                        }
                        return curr;
                    });
                    setLocalSettings(prev => ({
                        ...prev,
                        additionalCurrencies: updatedList
                    }));
                    setRateApiStatus('تم تحديث جميع أسعار العملات المضافة مباشرة من الإنترنت بنجاح!');
                }
            } else {
                throw new Error('بيانات الأسعار غير صالحة');
            }
        } catch (error: any) {
            console.error(error);
            alert(`خطأ أثناء التحديث التلقائي: ${error.message || error}`);
            setRateApiStatus('فشل في جلب الأسعار تلقائياً. يرجى تجربة التحديث اليدوي.');
        } finally {
            setIsFetchingRates(false);
            setTimeout(() => setRateApiStatus(null), 5000);
        }
    };

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
        <div className="pb-8 pt-2 px-2 max-w-4xl mx-auto w-full">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
                <div className="flex flex-col">
                    <h1 className="text-lg md:text-xl font-bold text-black dark:text-white leading-tight">المميزات الإضافية</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">تحكم في الوظائف المتقدمة والأدوات الخاصة والنظام</p>
                </div>
                <div className="mr-auto flex items-center gap-2">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 bg-purple-650 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-705 text-white px-4 py-2 rounded-xl font-bold transition disabled:opacity-50 text-sm shadow-md"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        <span>حفظ</span>
                    </button>
                </div>
            </div>

            {showSuccess && (
                <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-250 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-400 rounded-xl flex items-center gap-2 font-bold text-sm shadow-sm"
                >
                    <CheckCircle2 size={18} className="text-emerald-600" />
                    تم حفظ الإعدادات بنجاح
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* VAT Toggle */}
                <section className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col gap-4 ${
                    localSettings.isVatEnabled 
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-800 ring-2 ring-emerald-200/40 dark:ring-emerald-900/40 shadow-md transform scale-[1.01]' 
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300'
                }`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl shrink-0 border transition-all duration-300 ${
                                localSettings.isVatEnabled 
                                    ? 'bg-emerald-600 text-white border-transparent' 
                                    : 'bg-gray-50 dark:bg-slate-800 text-emerald-600 border-gray-100 dark:border-slate-700'
                            }`}>
                                <CheckCircle2 size={22} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-black dark:text-gray-100">ضريبة القيمة المضافة (VAT)</h3>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">حساب الضريبة تلقائياً وفاتورة ضريبية مبسطة</p>
                            </div>
                        </div>
                        <CustomToggle 
                            checked={!!localSettings.isVatEnabled}
                            onChange={(val) => setLocalSettings(prev => ({ ...prev, isVatEnabled: val }))}
                            activeColorClass="bg-emerald-600"
                        />
                    </div>

                    {localSettings.isVatEnabled && (
                        <div className="bg-white dark:bg-slate-950 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 flex items-center justify-between shadow-inner">
                            <label className="text-xs font-bold text-emerald-800 dark:text-emerald-400">نسبة الضريبة الافتراضية</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="number" 
                                    value={localSettings.vatPercentage || ''}
                                    onChange={(e) => setLocalSettings(prev => ({ ...prev, vatPercentage: parseFloat(e.target.value) || 0 }))}
                                    className="w-16 bg-white dark:bg-slate-900 text-black dark:text-white border border-gray-300 dark:border-slate-700 font-bold text-center px-2 py-1 rounded-md text-sm outline-none"
                                />
                                <span className="font-bold text-sm text-black dark:text-gray-300">%</span>
                            </div>
                        </div>
                    )}
                </section>

                {/* Expiry Tracking */}
                <section className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col gap-4 ${
                    localSettings.isExpiryTrackingEnabled 
                        ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-400 dark:border-rose-800 ring-2 ring-rose-200/40 dark:ring-rose-900/40 shadow-md transform scale-[1.01]' 
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300'
                }`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl shrink-0 border transition-all duration-300 ${
                                localSettings.isExpiryTrackingEnabled 
                                    ? 'bg-rose-600 text-white border-transparent' 
                                    : 'bg-gray-50 dark:bg-slate-800 text-rose-600 border-gray-100 dark:border-slate-700'
                            }`}>
                                <CalendarDays size={22} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-black dark:text-gray-100">تتبع صلاحية المنتجات</h3>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">سجل تواريخ الصلاحية وتنبيهات للمنتجات المنتهية</p>
                            </div>
                        </div>
                        <CustomToggle 
                            checked={!!localSettings.isExpiryTrackingEnabled}
                            onChange={(val) => setLocalSettings(prev => ({ ...prev, isExpiryTrackingEnabled: val }))}
                            activeColorClass="bg-rose-600"
                        />
                    </div>

                    {localSettings.isExpiryTrackingEnabled && (
                        <div className="bg-white dark:bg-slate-950 p-3 rounded-xl border border-rose-200 dark:border-rose-900 flex items-center justify-between shadow-inner">
                            <label className="text-xs font-bold text-rose-800 dark:text-rose-450">فترة التنبيه المسبق قبل الانتهاء</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="number" 
                                    value={localSettings.expiryAlertMonths || ''}
                                    onChange={(e) => setLocalSettings(prev => ({ ...prev, expiryAlertMonths: parseInt(e.target.value) || 0 }))}
                                    className="w-16 bg-white dark:bg-slate-900 text-black dark:text-white border border-gray-300 dark:border-slate-700 font-bold text-center px-2 py-1 rounded-md text-sm outline-none"
                                />
                                <span className="font-bold text-sm text-black dark:text-gray-300">أشهر</span>
                            </div>
                        </div>
                    )}
                </section>


                {/* Commissions */}
                <section className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col gap-4 ${
                    localSettings.isCommissionEnabled 
                        ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-400 dark:border-amber-800 ring-2 ring-amber-200/40 dark:ring-amber-900/40 shadow-md transform scale-[1.01]' 
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300'
                }`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl shrink-0 border transition-all duration-300 ${
                                localSettings.isCommissionEnabled 
                                    ? 'bg-amber-600 text-white border-transparent' 
                                    : 'bg-gray-50 dark:bg-slate-800 text-amber-600 border-gray-100 dark:border-slate-700'
                            }`}>
                                <Users size={22} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-black dark:text-gray-100">عمولات الموظفين</h3>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">حساب عمولة تلقائية للموظف البائع على الفواتير</p>
                            </div>
                        </div>
                        <CustomToggle 
                            checked={!!localSettings.isCommissionEnabled}
                            onChange={(val) => setLocalSettings(prev => ({ ...prev, isCommissionEnabled: val }))}
                            activeColorClass="bg-amber-550"
                        />
                    </div>

                    {localSettings.isCommissionEnabled && (
                        <div className="bg-white dark:bg-slate-950 p-3 rounded-xl border border-amber-200 dark:border-amber-900 flex items-center justify-between shadow-inner">
                            <label className="text-xs font-bold text-amber-800 dark:text-amber-400">النسبة المئوية الافتراضية للعمولة</label>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="number" 
                                    value={localSettings.defaultCommissionPercent || ''}
                                    onChange={(e) => setLocalSettings(prev => ({ ...prev, defaultCommissionPercent: parseFloat(e.target.value) || 0 }))}
                                    className="w-16 bg-white dark:bg-slate-900 text-black dark:text-white border border-gray-300 dark:border-slate-700 font-bold text-center px-2 py-1 rounded-md text-sm outline-none"
                                />
                                <span className="font-bold text-sm text-black dark:text-gray-300">%</span>
                            </div>
                        </div>
                    )}
                </section>

                {/* Smart Alerts */}
                <section className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col gap-4 md:col-span-2 ${
                    localSettings.isOverdueAlertEnabled 
                        ? 'bg-red-50/40 dark:bg-red-950/20 border-red-400 dark:border-red-800 ring-2 ring-red-200/40 dark:ring-red-900/40 shadow-md transform scale-[1.01]' 
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300'
                }`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl shrink-0 border transition-all duration-300 ${
                                localSettings.isOverdueAlertEnabled 
                                    ? 'bg-red-600 text-white border-transparent' 
                                    : 'bg-gray-50 dark:bg-slate-800 text-red-600 border-gray-100 dark:border-slate-700'
                            }`}>
                                <BrainCircuit size={22} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-black dark:text-gray-100">التنبيهات والإنذارات المبكرة</h3>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">تنبيهات تلقائية لانخفاض حد المقبوضات أو الفواتير المتأخرة والآجلة</p>
                            </div>
                        </div>
                        <CustomToggle 
                            checked={!!localSettings.isOverdueAlertEnabled}
                            onChange={(val) => setLocalSettings(prev => ({ ...prev, isOverdueAlertEnabled: val }))}
                            activeColorClass="bg-red-650"
                        />
                    </div>

                    {localSettings.isOverdueAlertEnabled && (
                        <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-red-200 dark:border-red-900 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center shadow-inner">
                            <div className="flex items-center justify-between w-full">
                                <label className="text-xs font-bold text-red-850 dark:text-red-400">حد تأخر السداد الآجل باليوم</label>
                                <div className="flex items-center gap-1.5">
                                    <input 
                                        type="number" 
                                        value={localSettings.overdueDaysThreshold || ''}
                                        onChange={(e) => setLocalSettings(prev => ({ ...prev, overdueDaysThreshold: parseInt(e.target.value) || 0 }))}
                                        className="w-16 bg-white dark:bg-slate-900 text-black dark:text-white border border-gray-300 dark:border-slate-700 font-bold text-center px-1 py-1 rounded-md text-sm outline-none"
                                    />
                                    <span className="text-xs text-black dark:text-gray-300">أيام</span>
                                </div>
                            </div>
                            <div className="flex items-center justify-between w-full border-t sm:border-t-0 sm:border-r border-red-205 dark:border-slate-800 pt-2 sm:pt-0 sm:pr-4">
                                <label className="text-xs font-bold text-red-850 dark:text-red-400">حد السيولة الأدنى بالصندوق</label>
                                <div className="flex items-center gap-1.5">
                                    <input 
                                        type="number" 
                                        value={localSettings.cashMinimumAlertThreshold || ''}
                                        onChange={(e) => setLocalSettings(prev => ({ ...prev, cashMinimumAlertThreshold: parseInt(e.target.value) || 0 }))}
                                        className="w-24 bg-white dark:bg-slate-900 text-black dark:text-white border border-gray-300 dark:border-slate-700 font-bold text-center px-1.5 py-1 rounded-md text-sm outline-none"
                                    />
                                    <span className="text-xs text-black dark:text-gray-300">ر.س</span>
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* Loyalty Program */}
                <section className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col gap-4 md:col-span-2 ${
                    localSettings.isLoyaltyEnabled 
                        ? 'bg-amber-50/20 dark:bg-amber-950/20 border-amber-400 dark:border-amber-800 ring-2 ring-amber-200/40 dark:ring-amber-900/40 shadow-md transform scale-[1.01]' 
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300'
                }`}>
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl shrink-0 border transition-all duration-300 ${
                                localSettings.isLoyaltyEnabled 
                                    ? 'bg-amber-500 text-white border-transparent' 
                                    : 'bg-gray-50 dark:bg-slate-800 text-amber-500 border-gray-100 dark:border-slate-700'
                            }`}>
                                <Star size={22} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-black dark:text-gray-100">نظام نقاط الولاء والجوائز</h3>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400">نظام الولاء والمكافآت التلقائي لعملائك الدائمين لزيادة مبيعاتك</p>
                            </div>
                        </div>
                        <CustomToggle 
                            checked={!!localSettings.isLoyaltyEnabled}
                            onChange={(val) => setLocalSettings(prev => ({ ...prev, isLoyaltyEnabled: val }))}
                            activeColorClass="bg-amber-500"
                        />
                    </div>

                    {localSettings.isLoyaltyEnabled && (
                        <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-amber-250 dark:border-amber-900 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-inner">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-bold text-amber-850 dark:text-amber-400">النقاط لكل (100 ر.س مبيعات)</label>
                                <input 
                                    type="number" 
                                    value={localSettings.loyaltyPointsPerAmount || ''}
                                    onChange={(e) => setLocalSettings(prev => ({ ...prev, loyaltyPointsPerAmount: parseInt(e.target.value) || 0 }))}
                                    className="w-16 bg-white dark:bg-slate-900 text-black dark:text-white border border-gray-300 dark:border-slate-700 font-bold text-center px-2 py-1 rounded-md text-sm outline-none"
                                />
                            </div>
                            <div className="flex items-center gap-3 border-t sm:border-t-0 sm:border-r border-amber-200 dark:border-slate-800 pt-3 sm:pt-0 sm:pr-4 w-full sm:w-auto">
                                <CustomToggle 
                                    checked={!!localSettings.includeCreditInLoyalty}
                                    onChange={(val) => setLocalSettings(prev => ({ ...prev, includeCreditInLoyalty: val }))}
                                    activeColorClass="bg-amber-500"
                                />
                                <span className="text-xs font-bold text-black dark:text-gray-300">تضمين الفواتير الآجلة في حساب النقاط</span>
                            </div>
                        </div>
                    )}
                </section>

                {/* WhatsApp & Quotations */}
                <section className={`p-5 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 ${
                    localSettings.isWhatsAppEnabled 
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-400 dark:border-emerald-800 ring-2 ring-emerald-200/40 dark:ring-emerald-900/40 shadow-md transform scale-[1.01]' 
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300'
                }`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl shrink-0 border transition-all duration-300 ${
                            localSettings.isWhatsAppEnabled 
                                ? 'bg-emerald-600 text-white border-transparent' 
                                : 'bg-gray-50 dark:bg-slate-800 text-emerald-600 border-gray-100 dark:border-slate-700'
                        }`}>
                            <MessageCircle size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-black dark:text-gray-100">سندات الواتساب</h3>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">مشاركة الفواتير والإخطارات مباشرة لعملائك</p>
                        </div>
                    </div>
                    <CustomToggle 
                        checked={!!localSettings.isWhatsAppEnabled}
                        onChange={(val) => setLocalSettings(prev => ({ ...prev, isWhatsAppEnabled: val }))}
                        activeColorClass="bg-emerald-600"
                    />
                </section>

                <section className={`p-5 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 ${
                    localSettings.isQuotationsEnabled 
                        ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-400 dark:border-blue-800 ring-2 ring-blue-200/40 dark:ring-blue-900/40 shadow-md transform scale-[1.01]' 
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300'
                }`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl shrink-0 border transition-all duration-300 ${
                            localSettings.isQuotationsEnabled 
                                ? 'bg-blue-600 text-white border-transparent' 
                                : 'bg-gray-50 dark:bg-slate-800 text-blue-600 border-gray-100 dark:border-slate-700'
                        }`}>
                            <FileSignature size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-black dark:text-gray-100">عروض الأسعار</h3>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">إرسال وتجهيز عروض سعر رسمية للعملاء</p>
                        </div>
                    </div>
                    <CustomToggle 
                        checked={!!localSettings.isQuotationsEnabled}
                        onChange={(val) => setLocalSettings(prev => ({ ...prev, isQuotationsEnabled: val }))}
                        activeColorClass="bg-blue-600"
                    />
                </section>

                <section className={`p-5 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 ${
                    localSettings.allowNegativeStock 
                        ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-400 dark:border-amber-800 ring-2 ring-amber-200/40 dark:ring-amber-900/40 shadow-md transform scale-[1.01]' 
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300'
                }`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl shrink-0 border transition-all duration-300 ${
                            localSettings.allowNegativeStock 
                                ? 'bg-amber-600 text-white border-transparent' 
                                : 'bg-gray-50 dark:bg-slate-800 text-amber-600 border-gray-100 dark:border-slate-700'
                        }`}>
                            <Package size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-black dark:text-gray-100">البيع عند نفاذ المخزن</h3>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">السماح ببيع المنتجات حتى عند نفاذ الكمية (الكمية بالسالب)</p>
                        </div>
                    </div>
                    <CustomToggle 
                        checked={!!localSettings.allowNegativeStock}
                        onChange={(val) => setLocalSettings(prev => ({ ...prev, allowNegativeStock: val }))}
                        activeColorClass="bg-amber-600"
                    />
                </section>

                {/* AI & Advanced */}
                <section className={`p-5 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 md:col-span-2 ${
                    localSettings.isAiEnabled 
                        ? 'bg-purple-50/40 dark:bg-purple-950/20 border-purple-400 dark:border-purple-800 ring-2 ring-purple-200/40 dark:ring-purple-900/40 shadow-md transform scale-[1.01]' 
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 hover:border-gray-300'
                }`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl shrink-0 border transition-all duration-300 ${
                            localSettings.isAiEnabled 
                                ? 'bg-purple-600 text-white border-transparent' 
                                : 'bg-gray-50 dark:bg-slate-800 text-purple-600 border-gray-100 dark:border-slate-700'
                        }`}>
                            <BrainCircuit size={20} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-black dark:text-gray-100">محرك تحليل الذكاء الاصطناعي (AI)</h3>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">تنبؤات حركة المبيعات وتوصيات ذكية بالمتجر وسلوك العملاء</p>
                        </div>
                    </div>
                    <CustomToggle 
                        checked={!!localSettings.isAiEnabled}
                        onChange={(val) => setLocalSettings(prev => ({ ...prev, isAiEnabled: val }))}
                        activeColorClass="bg-purple-600"
                    />
                </section>

                <section className="bg-blue-50/50 dark:bg-slate-800 md:col-span-2 p-4 rounded-2xl flex items-center gap-3 text-blue-800 dark:text-blue-300 border border-blue-105 dark:border-slate-700 mt-2">
                    <ShieldCheck size={26} className="shrink-0 text-blue-600 dark:text-blue-400" />
                    <p className="text-[11px] font-bold leading-relaxed">تفعيل أو تعديل هذه الخيارات الفنية متاح لإدارة النظام فقط، وسيتم تطبيق السياسات فور الحفظ بنجاح.</p>
                </section>
            </div>
        </div>
    );
}
