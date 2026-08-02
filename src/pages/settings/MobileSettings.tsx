import React, { useState, useEffect } from 'react';
import { Smartphone, Fingerprint, Bell, Settings2, KeyRound, Check, Trash2, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useNavigate } from 'react-router-dom';

export default function MobileSettings() {
    const { appUser } = useAuthStore();
    const navigate = useNavigate();
    
    // Biometric & PIN
    const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
    const [isCheckingBiometric, setIsCheckingBiometric] = useState(true);
    const [pinCode, setPinCode] = useState('');
    const [hasPin, setHasPin] = useState(false);

    // Notifications & Sync
    const [notificationsEnabled, setNotificationsEnabled] = useState(localStorage.getItem('notifications_enabled') === 'true');
    const [backgroundSyncEnabled, setBackgroundSyncEnabled] = useState(localStorage.getItem('bg_sync_enabled') === 'true');

    useEffect(() => {
        const checkBiometricAvailability = async () => {
            let isAvailable = false;
            try {
                const info = await NativeBiometric.isAvailable();
                if (info.isAvailable) {
                    isAvailable = true;
                }
            } catch (e) {}

            if (!isAvailable && window.PublicKeyCredential) {
                try {
                    isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                } catch (e) {}
            }

            setIsCheckingBiometric(false);
            try {
                const saved = localStorage.getItem(`biometric_${appUser?.uid}`);
                setIsBiometricEnabled(saved === 'true');
            } catch (e) {}
        };

        checkBiometricAvailability();

        try {
            const savedPin = localStorage.getItem(`pin_${appUser?.uid}`);
            if (savedPin) {
                setHasPin(true);
            }
        } catch (e) {}
    }, [appUser]);

    const handleToggleBiometric = async () => {
        if (isBiometricEnabled) {
            try {
                localStorage.removeItem(`biometric_${appUser?.uid}`);
            } catch (e) {}
            setIsBiometricEnabled(false);
            alert('تم إلغاء تفعيل البصمة لتسجيل الدخول.');
            return;
        }

        try {
            let hasCapBiometric = false;
            try {
                const info = await NativeBiometric.isAvailable();
                if (info.isAvailable) hasCapBiometric = true;
            } catch (e) {}

            if (hasCapBiometric) {
                await NativeBiometric.verifyIdentity({
                    reason: "الرجاء تأكيد هويتك لتفعيل البصمة على هذا الجهاز",
                    title: "تفعيل البصمة",
                    subtitle: "تطبيق المبيعات",
                    description: "استخدم بصمة الإصبع أو الوجه لتفعيل الدخول بالبصمة"
                });

                try {
                    localStorage.setItem(`biometric_${appUser?.uid}`, 'true');
                    localStorage.setItem('biometric_any_enabled', 'true');
                } catch (e) {}
                setIsBiometricEnabled(true);
                alert('تم تفعيل البصمة بنجاح! يمكنك الآن استخدامها لتسجيل الدخول مستقبلاً.');
                return;
            }

            if (!window.PublicKeyCredential) {
                alert('جهازك لا يدعم تسجيل الدخول بالبصمة للمتصفح الحالي.');
                return;
            }

            if (window !== window.top) {
                alert('يرجى فتح التطبيق في نافذة مستقلة (New Tab) لتتمكن من تفعيل البصمة. البصمة لا تعمل داخل النوافذ المصغرة (Iframe).');
                return;
            }

            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);
            const userId = new Uint8Array(16);
            crypto.getRandomValues(userId);

            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge,
                    rp: { name: "تطبيق المبيعات" },
                    user: {
                        id: userId,
                        name: appUser?.email || "user",
                        displayName: appUser?.name || "User"
                    },
                    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "required"
                    },
                    timeout: 60000
                }
            });

            if (credential) {
                try {
                    localStorage.setItem(`biometric_${appUser?.uid}`, 'true');
                    localStorage.setItem('biometric_any_enabled', 'true');
                } catch (e) {}
                setIsBiometricEnabled(true);
                alert('تم تفعيل البصمة بنجاح! يمكنك الآن استخدامها لتسجيل الدخول مستقبلاً.');
            }
        } catch (error: any) {
            console.error(error);
            if (error.name === 'NotAllowedError') {
                alert('تم إلغاء عملية قراءة البصمة بواسطة المستخدم.');
            } else {
                alert('حدث خطأ أثناء تفعيل البصمة. تأكد من أن جهازك يدعم البصمة أو قم بإعداد رمز PIN بدلاً من ذلك.');
            }
        }
    };

    const handleSavePin = () => {
        if (!pinCode || pinCode.length < 4) {
            alert('رمز PIN يجب أن يتكون من 4 أرقام على الأقل');
            return;
        }
        try {
            localStorage.setItem(`pin_${appUser?.uid}`, pinCode);
        } catch (e) {
            console.warn('localStorage not available', e);
            alert('حدث خطأ في تفعيل PIN. قد تكون الكوكيز محجوبة.');
            return;
        }
        setHasPin(true);
        setPinCode('');
        alert('تم تفعيل رمز PIN بنجاح!');
    };

    const handleRemovePin = () => {
        try {
            localStorage.removeItem(`pin_${appUser?.uid}`);
        } catch (e) {}
        setHasPin(false);
        alert('تم إزالة رمز PIN بنجاح.');
    };

    const toggleNotifications = async () => {
        const newValue = !notificationsEnabled;
        if (newValue) {
             try {
                const localRes = await LocalNotifications.requestPermissions();
                if (localRes.display === 'granted') {
                    setNotificationsEnabled(true);
                    localStorage.setItem('notifications_enabled', 'true');
                    alert('تم تفعيل الإشعارات بنجاح!');
                } else {
                    alert('لم يتم منح إذن الإشعارات.');
                }
             } catch (err) {
                alert('الإشعارات غير مدعومة على هذا الجهاز حالياً.');
             }
        } else {
            setNotificationsEnabled(false);
            localStorage.setItem('notifications_enabled', 'false');
        }
    };

    const toggleBackgroundSync = () => {
         const newValue = !backgroundSyncEnabled;
         setBackgroundSyncEnabled(newValue);
         localStorage.setItem('bg_sync_enabled', newValue ? 'true' : 'false');
    };

    return (
        <div className="max-w-2xl mx-auto w-full pb-8 pt-2" dir="rtl">
            <div className="flex items-center gap-3 mb-6 px-2">
                <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
                    <Smartphone size={20} className="stroke-[2.5]" />
                </div>
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-black dark:text-white leading-tight">إعدادات تطبيق الجوال</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">إدارة الإشعارات، التشغيل بالخلفية، والدخول الذكي</p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-950 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm">
                
                {/* Biometric Login */}
                <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-800 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-teal-50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/20 text-teal-600 dark:text-teal-400 rounded-lg flex items-center justify-center shrink-0 mt-1">
                            <Fingerprint size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-black dark:text-white text-sm md:text-base">تفعيل الدخول السريع بالبصمة / Face ID</h3>
                            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 leading-relaxed mt-1">
                                استخدم بصمة الإصبع أو التعرف على الوجه لتسجيل الدخول بأمان وسرعة بدلاً من إدخال كلمة المرور.
                            </p>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-2">
                        <input type="checkbox" className="sr-only peer" disabled={isCheckingBiometric} checked={isBiometricEnabled} onChange={handleToggleBiometric} />
                        <div className="w-11 h-6 bg-gray-250 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-350 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600 dark:peer-checked:bg-teal-500 truncate"></div>
                    </label>
                </div>

                {/* PIN Login */}
                <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg flex items-center justify-center shrink-0 mt-1">
                            <KeyRound size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-black dark:text-white text-sm md:text-base">الدخول برمز PIN</h3>
                            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 leading-relaxed mt-1">
                                طريقة بديلة للبصمة (4 أرقام فأكثر للدخول السريع).
                            </p>
                            <div className="mt-3">
                                {hasPin ? (
                                    <div className="flex items-center gap-4 bg-gray-50 dark:bg-slate-900 p-3 rounded-xl border border-gray-100 dark:border-slate-800 w-fit">
                                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                                            <Check size={16} />
                                            رمز PIN نشط ومفعل
                                        </div>
                                        <button 
                                            onClick={handleRemovePin}
                                            className="flex items-center gap-1.5 text-rose-600 hover:text-rose-700 bg-white dark:bg-slate-850 px-2.5 py-1 rounded-lg transition font-semibold text-xs border border-rose-100 dark:border-rose-900/40 cursor-pointer"
                                        >
                                            <Trash2 size={14} />
                                            إزالة الرمز
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                        <input 
                                            type="password" 
                                            placeholder="أدخل رمز PIN الجديد..." 
                                            value={pinCode}
                                            onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                                            className="border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-black dark:text-white rounded-xl px-3 py-2 outline-none focus:border-indigo-500 w-full sm:max-w-[200px] font-mono text-left text-sm"
                                            dir="ltr"
                                            maxLength={8}
                                        />
                                        <button 
                                            onClick={handleSavePin}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold transition text-xs whitespace-nowrap cursor-pointer shadow-sm shadow-indigo-100 dark:shadow-none"
                                        >
                                            تفعيل الرمز
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Notifications */}
                <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-800 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg flex items-center justify-center shrink-0 mt-1">
                            <Bell size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-black dark:text-white text-sm md:text-base">إشعارات وتنبيهات النظام</h3>
                            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 leading-relaxed mt-1">
                                استلام إشعارات بحركات المبيعات، ومخزون المنتجات المنخفض.
                            </p>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-2">
                        <input type="checkbox" className="sr-only peer" checked={notificationsEnabled} onChange={toggleNotifications} />
                        <div className="w-11 h-6 bg-gray-250 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-350 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600 dark:peer-checked:bg-rose-500"></div>
                    </label>
                </div>

                {/* Background Sync */}
                <div className="p-4 md:p-5 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center shrink-0 mt-1">
                            <Settings2 size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-black dark:text-white text-sm md:text-base">المزامنة والتشغيل بالخلفية</h3>
                            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 leading-relaxed mt-1">
                                السماح للتطبيق بالعمل في الخلفية لاستقبال الإشعارات ومزامنة النسخ الاحتياطية.
                            </p>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-2">
                        <input type="checkbox" className="sr-only peer" checked={backgroundSyncEnabled} onChange={toggleBackgroundSync} />
                        <div className="w-11 h-6 bg-gray-250 dark:bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-350 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500"></div>
                    </label>
                </div>

            </div>
        </div>
    );
}
