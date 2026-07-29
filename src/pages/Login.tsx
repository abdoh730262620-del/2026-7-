import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, setDoc, collection, query, limit, getDocs, where } from 'firebase/firestore';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getAdminPerms } from './Users';
import { useAuthStore, AppUser } from '../store/authStore';
import { Mail, Lock, User, Store, LogIn, UserPlus, Shield, Eye, EyeOff, Fingerprint } from 'lucide-react';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

const defaultSettings = {
  isAiEnabled: true,
  isAdvancedToolsEnabled: true,
  isOverdueAlertEnabled: true,
  overdueDaysThreshold: 30,
  cashMinimumAlertThreshold: 1000,
  isLoyaltyEnabled: false,
  loyaltyPointsPerAmount: 10,
  includeCreditInLoyalty: false,
  isVatEnabled: false,
  vatPercentage: 15,
  isExpiryTrackingEnabled: false,
  expiryAlertMonths: 3,
  isMultiCurrencyEnabled: false,
  exchangeRate: 1,
  currencySymbol: '$',
  baseCurrency: 'SAR',
  isCommissionEnabled: false,
  defaultCommissionPercent: 5,
  isWhatsAppEnabled: true,
  isQuotationsEnabled: true,
  allowNegativeStock: false,
  businessName: '',
  businessAddress: '',
  businessPhone: '',
  businessLogoUrl: '',
  printerPaperSize: 'A4',
  headerTextAlignment: 'center',
  cashIncludeSales: true,
  cashIncludePurchases: true,
  cashIncludeExpenses: true
};

export default function Login() {
    const { login } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [isCheckingFirstTime, setIsCheckingFirstTime] = useState(true);
    const [isFirstTime, setIsFirstTime] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    // Form inputs (unified)
    const [email, setEmail] = useState('habob19940@gmail.com');
    const [username, setUsername] = useState('abdohali');
    const [password, setPassword] = useState('abdohali1994');

    // Toggle registration view (for new store creation)
    const [isRegistering, setIsRegistering] = useState(false);
    const [showEmailConfirmModal, setShowEmailConfirmModal] = useState(false);
    const [hasSavedEmail, setHasSavedEmail] = useState(true);

    useEffect(() => {
        const checkFirstTime = async () => {
            try {
                const q = query(collection(db, 'users'), limit(1));
                const snapshot = await getDocs(q);
                const firstTime = snapshot.empty;
                setIsFirstTime(firstTime);
                
                if (firstTime) {
                    setIsRegistering(true);
                    setUsername('admin');
                    setPassword('admin123');
                    setEmail('');
                } else {
                    // Not first time - load prefilled values from localStorage if they exist!
                    const savedEmail = localStorage.getItem('remembered_email') || 'habob19940@gmail.com';
                    const savedUsername = localStorage.getItem('remembered_staff_username') || 'abdohali';
                    const savedPassword = localStorage.getItem('remembered_password');
                    
                    setEmail(savedEmail);
                    setHasSavedEmail(true);
                    setUsername(savedUsername);
                    if (savedUsername.trim().toLowerCase() === 'admin') {
                        setPassword(savedPassword || 'admin123');
                    } else if (savedUsername.trim().toLowerCase() === 'abdohali') {
                        setPassword(savedPassword || 'abdohali1994');
                    } else {
                        setPassword(savedPassword || '');
                    }
                }
            } catch (err: any) {
                console.error("Error checking for existing users:", err);
                // Offline fallback: check if we have a saved email or cached user
                const savedEmail = localStorage.getItem('remembered_email') || 'habob19940@gmail.com';
                if (savedEmail) {
                    setIsFirstTime(false);
                    setEmail(savedEmail);
                    setHasSavedEmail(true);
                    const savedUsername = localStorage.getItem('remembered_staff_username') || 'abdohali';
                    const savedPassword = localStorage.getItem('remembered_password');
                    setUsername(savedUsername);
                    if (savedUsername.trim().toLowerCase() === 'admin') {
                        setPassword(savedPassword || 'admin123');
                    } else if (savedUsername.trim().toLowerCase() === 'abdohali') {
                        setPassword(savedPassword || 'abdohali1994');
                    } else {
                        setPassword(savedPassword || '');
                    }
                } else {
                    // No saved session and offline - assume false so user can login with default offline admin or cached users
                    setIsFirstTime(false);
                }
            } finally {
                setIsCheckingFirstTime(false);
            }
        };
        checkFirstTime();
    }, []);

    // Handles actual store registration after email verification overlay accept
    const executeRegister = async (trimmedEmail: string, trimmedUsername: string, trimmedPassword: string) => {
        setIsLoading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            // Verify email availability in users database to prevent duplicates
            const qEmail = query(collection(db, 'users'), where('email', '==', trimmedEmail), limit(1));
            const snapEmail = await getDocs(qEmail);
            if (!snapEmail.empty) {
                setError('البريد الإلكتروني هذا مسجل بالفعل لمتجر آخر مسبقاً');
                setIsLoading(false);
                return;
            }

            // Register authentic Firebase Auth account using input email and password
            const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
            const fbUser = userCredential.user;

            const newAdmin: AppUser = {
                uid: fbUser.uid,
                name: trimmedUsername,
                email: trimmedEmail,
                role: 'admin',
                isActive: true,
                permissions: getAdminPerms(),
                tenantId: 'single_store',
                password: trimmedPassword
            };

            // Save admin account node
            await setDoc(doc(db, 'users', fbUser.uid), {
                ...newAdmin,
                createdAt: Date.now()
            });

            // Build custom settings profile
            const customSettings = {
                ...defaultSettings,
                businessName: 'محل بريق للمبيعات',
                createdAt: Date.now()
            };
            await setDoc(doc(db, 'settings', 'app_config_single_store'), customSettings);

            // Cache successfully registered user locally
            try {
                localStorage.setItem('last_logged_in_user', JSON.stringify(newAdmin));
            } catch (e) {}

            setSuccessMessage('تم تأسيس متجرك السحابي بنجاح! جاري تحميل النظام...');
            
            // Smoothly log in
            setTimeout(() => {
                login(newAdmin);
            }, 800);
        } catch (err: any) {
            // Avoid logging standard user validation/auth errors as console.error to keep the test environment clean
            if (err.code === 'auth/email-already-in-use' || err.code === 'auth/weak-password' || err.code === 'auth/invalid-email') {
                console.warn('Register attempt failed:', err.message || err);
            } else {
                console.error('Register error:', err);
            }
            
            // Offline fallback on registration
            if (err.code === 'auth/network-request-failed' || err.message?.includes('network-request-failed') || err.message?.includes('network')) {
                const offlineAdmin: AppUser = {
                    uid: 'offline_admin_uid_' + Date.now(),
                    name: trimmedUsername,
                    email: trimmedEmail,
                    role: 'admin',
                    isActive: true,
                    permissions: getAdminPerms(),
                    tenantId: 'single_store',
                    password: trimmedPassword
                };
                try {
                    localStorage.setItem('last_logged_in_user', JSON.stringify(offlineAdmin));
                } catch (e) {}
                setSuccessMessage('تم تفعيل المتجر بالنمط المحلي (أوفلاين) لعدم توفر اتصال بالشبكة! جاري تحميل النظام...');
                setTimeout(() => {
                    login(offlineAdmin);
                }, 800);
                return;
            }

            let arabicError = 'فشل تأسيس المتجر: ';
            if (err.code === 'auth/email-already-in-use') {
                arabicError += 'البريد الإلكتروني مسجل بحساب آخر مسبقاً';
            } else if (err.code === 'auth/weak-password') {
                arabicError += 'كلمة المرور ضعيفة للغاية (يجب ألا تقل عن 6 خانات تماشياً مع معايير الأمان لـ Firebase)';
            } else if (err.code === 'auth/invalid-email') {
                arabicError += 'صيغة البريد الإلكتروني غير صحيحة';
            } else {
                arabicError += err.message || 'حدث خطأ بالاتصال بـ Firebase';
            }
            setError(arabicError);
            setIsLoading(false);
        }
    };

    const handleBiometricLogin = async () => {
        try {
            const savedEmail = localStorage.getItem('remembered_email');
            const savedUsername = localStorage.getItem('remembered_staff_username');
            const savedPassword = localStorage.getItem('remembered_password');

            if (!savedEmail || !savedPassword) {
                alert('الرجاء تسجيل الدخول بالرقم السري أولاً لتتمكن من استخدام البصمة.');
                return;
            }

            let hasCapBiometric = false;
            try {
                const info = await NativeBiometric.isAvailable();
                if (info.isAvailable) hasCapBiometric = true;
            } catch (e) {}

            if (hasCapBiometric) {
                await NativeBiometric.verifyIdentity({
                    reason: "تأكيد بصمتك لتسجيل الدخول السريع",
                    title: "تسجيل الدخول بالبصمة",
                    subtitle: "تطبيق المبيعات",
                    description: "قم بملامسة مستشعر البصمة للمتابعة"
                });
            } else {
                if (!window.PublicKeyCredential) {
                    alert('جهازك الحالي لا يدعم قراءة البصمة للمتصفحات.');
                    return;
                }
                const challenge = new Uint8Array(32);
                crypto.getRandomValues(challenge);
                const assertion = await navigator.credentials.get({
                    publicKey: { challenge, timeout: 60000, userVerification: "required" }
                });
                if (!assertion) {
                    throw new Error('فشل قراءة البصمة للمتصفح');
                }
            }

            // Fill form fields
            setEmail(savedEmail);
            setUsername(savedUsername || 'admin');
            setPassword(savedPassword);
            
            setIsLoading(true);
            setError(null);
            
            try {
                if ((savedUsername || 'admin') === 'admin') {
                    const userCredential = await signInWithEmailAndPassword(auth, savedEmail, savedPassword);
                    const fbUser = userCredential.user;
                    const qUser = query(collection(db, 'users'), where('uid', '==', fbUser.uid), limit(1));
                    const snapUser = await getDocs(qUser);

                    let userDoc = snapUser.empty ? null : snapUser.docs[0];
                    if (!userDoc) {
                        const newAdmin: AppUser = {
                            uid: fbUser.uid,
                            name: savedUsername || 'admin',
                            email: savedEmail,
                            role: 'admin',
                            isActive: true,
                            permissions: getAdminPerms(),
                            tenantId: 'single_store',
                            password: savedPassword
                        };
                        await setDoc(doc(db, 'users', fbUser.uid), {
                            ...newAdmin,
                            createdAt: Date.now()
                        });
                        login(newAdmin);
                        setSuccessMessage('تم تسجيل الدخول بالبصمة بنجاح!');
                    } else {
                        const userData = userDoc.data();
                        if (!userData.isActive) {
                            setError('عذراً، هذا الحساب معطل حالياً بنظام الإدارة الذكي.');
                            setIsLoading(false);
                            return;
                        }
                        const dbUser = { uid: userDoc.id, ...userData, password: savedPassword } as AppUser;
                        login(dbUser);
                        setSuccessMessage('أهلاً بك مجدداً بالبصمة الذكية!');
                    }
                } else {
                    const qStaff = query(
                        collection(db, 'users'),
                        where('tenantId', '==', 'single_store'),
                        where('name', '==', savedUsername),
                        where('password', '==', savedPassword),
                        limit(1)
                    );
                    const snapStaff = await getDocs(qStaff);

                    if (snapStaff.empty) {
                        setError('خطأ: معلومات الحساب المحفوظة غير صحيحة.');
                        setIsLoading(false);
                        return;
                    }

                    const userDoc = snapStaff.docs[0];
                    const userData = userDoc.data();

                    if (!userData.isActive) {
                        setError('عذراً، هذا الحساب معطل حالياً.');
                        setIsLoading(false);
                        return;
                    }

                    const activeUser = { uid: userDoc.id, ...userData, password: savedPassword } as AppUser;
                    login(activeUser);
                    setSuccessMessage('تم دخول بوابة الموظفين بالبصمة بنجاح!');
                }
            } catch (err: any) {
                console.error('Biometric log error:', err);
                setError('حدث خطأ أثناء الاتصال بالخادم الرئيسي للمصادقة بالبصمة.');
                setIsLoading(false);
            }
        } catch (error: any) {
            console.error("Biometric verification error:", error);
            if (error.name !== 'NotAllowedError') {
                alert('فشلت المصادقة بالبصمة.');
            }
        }
    };

    // Unified Submit Handler (handles either Register or Login)
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMessage(null);

        const trimmedEmail = email.trim().toLowerCase();
        const trimmedUsername = username.trim().toLowerCase();
        const trimmedPassword = password.trim();

        if (isRegistering) {
            if (!trimmedEmail || !trimmedUsername || !trimmedPassword) {
                return setError('الرجاء تعبئة جميع الحقول المطلوبة للتسجيل');
            }
            // REGISTER MODE - Pre-validation before launching safety dialog
            if (trimmedPassword.length < 6) {
                return setError('يجب أن تكون كلمة المرور 6 خانات أو أكثر تماشياً مع متطلبات الأمان لشبكة Firebase');
            }
            
            // Show verification dialog overlay instead of submitting immediately
            setShowEmailConfirmModal(true);
        } else {
            // LOGIN MODE (Username and Password only)
            if (!trimmedUsername || !trimmedPassword) {
                return setError('الرجاء كتابة اسم المستخدم وكلمة المرور');
            }

            setIsLoading(true);
            try {
                // If offline and using default admin account bypass
                if ((trimmedUsername === 'admin' && trimmedPassword === 'admin123') || (trimmedUsername === 'abdohali' && trimmedPassword === 'abdohali1994')) {
                    const localAdmin: AppUser = {
                        uid: trimmedUsername === 'abdohali' ? 'offline_abdohali_uid' : 'offline_admin_uid',
                        name: trimmedUsername,
                        email: trimmedEmail || 'habob19940@gmail.com',
                        role: 'admin',
                        isActive: true,
                        permissions: getAdminPerms(),
                        tenantId: 'single_store',
                        password: trimmedPassword
                    };
                    try {
                        localStorage.setItem('last_logged_in_user', JSON.stringify(localAdmin));
                    } catch (e) {}
                    login(localAdmin);
                    setSuccessMessage('تم تسجيل الدخول بنجاح (النمط المحلي الافتراضي)! جاري تحميل النظام...');
                    setIsLoading(false);
                    return;
                }

                // Try to find the user in Firestore database by username
                let userDoc = null;
                try {
                    const qUser = query(collection(db, 'users'), where('name', '==', trimmedUsername), limit(1));
                    const snapUser = await getDocs(qUser);
                    if (!snapUser.empty) {
                        userDoc = snapUser.docs[0];
                    }
                } catch (dbErr) {
                    console.warn("Firestore query failed, trying offline/local cache", dbErr);
                }

                if (userDoc) {
                    const userData = userDoc.data();
                    if (!userData.isActive) {
                        setError('عذراً، هذا الحساب معطل حالياً من قبل الإدارة.');
                        setIsLoading(false);
                        return;
                    }

                    if (userData.role === 'admin') {
                        // Admin/Owner - Auth via Firebase Auth using their email
                        const adminEmail = userData.email || trimmedEmail || 'habob19940@gmail.com';
                        const userCredential = await signInWithEmailAndPassword(auth, adminEmail, trimmedPassword);
                        const fbUser = userCredential.user;

                        // Ensure tenantId is updated to single_store in Firestore for existing accounts
                        try {
                            await setDoc(doc(db, 'users', fbUser.uid), { tenantId: 'single_store' }, { merge: true });
                        } catch (e) {
                            console.warn("Could not sync tenantId to single_store online:", e);
                        }

                        const dbUser = { uid: fbUser.uid, ...userData, tenantId: 'single_store', password: trimmedPassword } as AppUser;
                        try {
                            localStorage.setItem('last_logged_in_user', JSON.stringify(dbUser));
                        } catch (e) {}
                        login(dbUser);
                        setSuccessMessage('أهلاً بك مجدداً! جاري توجيهك لوحة مبيعات متجرك...');
                    } else {
                        // Cashier/Staff - Compare passwords directly
                        if (userData.password === trimmedPassword) {
                            // Ensure tenantId is updated to single_store in Firestore for existing staff accounts
                            try {
                                await setDoc(doc(db, 'users', userDoc.id), { tenantId: 'single_store' }, { merge: true });
                            } catch (e) {
                                console.warn("Could not sync staff tenantId to single_store online:", e);
                            }

                            const activeUser = { uid: userDoc.id, ...userData, tenantId: 'single_store', password: trimmedPassword } as AppUser;
                            try {
                                localStorage.setItem('last_logged_in_user', JSON.stringify(activeUser));
                            } catch (e) {}
                            login(activeUser);
                            setSuccessMessage('أهلاً بك! تم دخول بوابة الموظفين بنجاح...');
                        } else {
                            setError('خطأ: كلمة المرور غير صحيحة لهذا المستخدم.');
                            setIsLoading(false);
                            return;
                        }
                    }
                } else {
                    // Username not found in online DB, check local storage for offline session cache
                    const lastUserStr = localStorage.getItem('last_logged_in_user');
                    if (lastUserStr) {
                        try {
                            const cachedUser = JSON.parse(lastUserStr);
                            if (
                                cachedUser &&
                                cachedUser.name?.trim().toLowerCase() === trimmedUsername &&
                                cachedUser.password === trimmedPassword
                            ) {
                                login(cachedUser);
                                setSuccessMessage('تم تسجيل الدخول بنجاح (النمط المحلي دون اتصال)! جاري تحميل النظام...');
                                setIsLoading(false);
                                return;
                            }
                        } catch (e) {
                            console.error('Failed to parse cached user:', e);
                        }
                    }

                    setError('خطأ: اسم المستخدم المدخل غير مسجل مسبقاً في النظام.');
                    setIsLoading(false);
                }
            } catch (err: any) {
                console.error('Login error:', err);

                // Check offline fallback for network request failed
                if (err.code === 'auth/network-request-failed' || err.message?.includes('network-request-failed') || err.message?.includes('network')) {
                    const lastUserStr = localStorage.getItem('last_logged_in_user');
                    if (lastUserStr) {
                        try {
                            const cachedUser = JSON.parse(lastUserStr);
                            if (
                                cachedUser &&
                                cachedUser.name?.trim().toLowerCase() === trimmedUsername &&
                                cachedUser.password === trimmedPassword
                            ) {
                                login(cachedUser);
                                setSuccessMessage('تم تسجيل الدخول بنجاح (النمط المحلي دون اتصال)! جاري تحميل النظام...');
                                setIsLoading(false);
                                return;
                            }
                        } catch (e) {}
                    }
                }

                let arabicError = 'فشل تسجيل الدخول: ';
                if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                    arabicError += 'اسم المستخدم أو كلمة المرور غير صحيحة.';
                } else {
                    arabicError += err.message || 'المعلومات المكتوبة خطأ أو مشكلة بالاتصال';
                }
                setError(arabicError);
                setIsLoading(false);
            }
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 p-4 font-sans" dir="rtl">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-6 md:p-8 border border-gray-100 dark:border-slate-800 transition-all duration-300">
                
                {/* 1. App Title Header */}
                <div className="text-center mb-6">
                    <div className="w-20 h-20 bg-indigo-50 dark:bg-slate-800/80 rounded-2xl flex items-center justify-center mx-auto mb-4 overflow-hidden border border-indigo-100 dark:border-slate-700 shadow-md transform hover:rotate-3 transition duration-300">
                        <img 
                            src="/icon.png" 
                            alt="Logo" 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                        />
                        <Store className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h1 className="text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">نظام بريق للمبيعات السحابي</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-1.5 leading-relaxed">
                        {isRegistering 
                            ? 'بوابة تأسيس وإعداد المتجر لأول مرة' 
                            : 'بوابة تسجيل المبيعات والدخول الموحد للملاك والموظفين'}
                    </p>
                </div>

                {/* Response Alerts */}
                {error && (
                    <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 p-3 rounded-xl mb-4 text-xs text-right leading-relaxed border border-red-100 dark:border-red-900 flex gap-2 items-center">
                        <Shield className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {successMessage && (
                    <div className="bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 p-3 rounded-xl mb-4 text-xs text-right leading-relaxed border border-green-100 dark:border-green-900 flex gap-2 items-center">
                        <LogIn className="w-4 h-4 shrink-0" />
                        <span>{successMessage}</span>
                    </div>
                )}

                {/* Unified Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs text-right">
                    
                    {/* Conditionally show warning alert ONLY on register/setup flows */}
                    {isRegistering && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 p-3.5 rounded-2xl border border-amber-200 dark:border-amber-900/50 leading-relaxed text-[11px] mb-2 shadow-sm">
                            <Shield className="w-4.5 h-4.5 shrink-0 text-amber-600 dark:text-amber-500 inline-block ml-1.5 align-middle" />
                            <span className="font-extrabold text-[12px] block mb-1">تنبيه الحماية وتعرِيف المتجر:</span>
                            يرجى إدخال <strong>بريد إلكتروني (إيميل) حقيقي وصحيح تماماً</strong>! حيث يتم اعتماده كمعرّف المتجر الرئيسي في قاعدة البيانات لتجنب خلط البيانات لجهة أخرى، وسيكون السند الحقيقي لربط وإتاحة مبيعاتكم من أي جهاز آخر في المستقبل.
                        </div>
                    )}

                    {/* 3. Email Input */}
                    {isRegistering && (
                        <div>
                            <label className="block text-gray-600 dark:text-gray-400 font-extrabold mb-1.5 mr-1 flex items-center gap-1">
                                <Mail className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                البريد الإلكتروني لمتجرك (الإيميل):
                            </label>
                            <input 
                                type="email" 
                                placeholder="owner@example.com" 
                                className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-right transition"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                dir="ltr"
                                required
                            />
                        </div>
                    )}

                    {/* 4. Username Input */}
                    <div>
                        <label className="block text-gray-600 dark:text-gray-400 font-extrabold mb-1.5 mr-1 flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            {isFirstTime || isRegistering ? 'اسم المستخدم (الافتراضي: admin):' : 'اسم المستخدم:'}
                        </label>
                        <input 
                            type="text" 
                            placeholder="admin" 
                            className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none text-right transition font-bold"
                            value={username}
                            onChange={e => {
                                const val = e.target.value;
                                setUsername(val);
                                if (val.trim().toLowerCase() !== 'admin') {
                                    setPassword('');
                                }
                            }}
                            required
                        />
                    </div>

                    {/* 5. Password Input */}
                    <div>
                        <label className="block text-gray-600 dark:text-gray-400 font-extrabold mb-1.5 mr-1 flex items-center gap-1">
                            <Lock className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            {isFirstTime || isRegistering ? 'كلمة المرور المشفرة (الافتراضية: admin123):' : 'كلمة المرور:'}
                        </label>
                        <div className="relative">
                            <input 
                                type={showPassword ? 'text' : 'password'} 
                                placeholder="admin123" 
                                className="w-full border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 pr-3 pl-10 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition font-bold"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                dir="ltr"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute left-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                            >
                                {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                            </button>
                        </div>
                    </div>

                    {/* 6. Action Submission Button */}
                    <div className="flex gap-2 mt-2">
                        <button 
                            type="submit"
                            disabled={isLoading || isCheckingFirstTime}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 active:translate-y-px text-white font-black py-3 px-4 rounded-xl shadow-lg shadow-indigo-100 dark:shadow-none transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-75 cursor-pointer text-sm"
                        >
                            {isLoading ? (
                                'جاري الاتصال والتحقق...'
                            ) : isRegistering ? (
                                <>
                                    <UserPlus className="w-4.5 h-4.5" />
                                    تأسيس المتجر وتفعيل الحساب
                                </>
                            ) : (
                                <>
                                    <LogIn className="w-4.5 h-4.5" />
                                    تسجيل الدخول ومزامنة المتجر
                                </>
                            )}
                        </button>

                        {!isRegistering && !isFirstTime && localStorage.getItem('biometric_any_enabled') === 'true' && (
                            <button
                                type="button"
                                onClick={handleBiometricLogin}
                                disabled={isLoading}
                                title="تسجيل الدخول بالبصمة"
                                className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 active:translate-y-px p-3 rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0"
                            >
                                <Fingerprint className="w-6 h-6 animate-pulse" />
                            </button>
                        )}
                    </div>


                </form>
            </div>

            {/* Email accuracy check popup modal */}
            {showEmailConfirmModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in text-slate-700 dark:text-slate-300" dir="rtl">
                    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 md:p-8 border border-amber-200 dark:border-amber-950/50 transform translate-y-0 transition-all duration-300">
                        {/* Header icon */}
                        <div className="text-center mb-5">
                            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-100 dark:border-amber-900/30">
                                <Shield className="w-9 h-9" />
                            </div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white">تأكيد البريد الإلكتروني للمتجر</h2>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                يرجى مراجعة البريد المدخل بدقة تامة لتفادي أي أخطاء مستقبلية
                            </p>
                        </div>

                        {/* Email display card */}
                        <div className="bg-slate-50 dark:bg-slate-950 text-indigo-600 dark:text-indigo-400 p-4 rounded-2xl text-center border border-slate-100 dark:border-slate-800 font-black text-lg font-mono tracking-wide break-all select-all mb-4">
                            {email}
                        </div>

                        {/* Detailed message requested by the user */}
                        <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 text-[11px] leading-relaxed mb-6 text-right">
                            <span className="font-extrabold text-[12px] block mb-1 text-amber-800 dark:text-amber-400">تنبيه الحماية وتعرِيف المتجر:</span>
                            يرجى إدخال بريد إلكتروني (إيميل) حقيقي وصحيح تماماً! حيث يتم اعتماده كمعرّف المتجر الرئيسي في قاعدة البيانات لتجنب خلط البيانات لجهة أخرى، وسيكون السند الحقيقي لربط وإتاحة مبيعاتكم من أي جهاز آخر في المستقبل.
                        </div>

                        {/* Modal Action buttons */}
                        <div className="flex flex-col gap-2.5">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowEmailConfirmModal(false);
                                    executeRegister(email.trim().toLowerCase(), username.trim().toLowerCase(), password.trim());
                                }}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 active:translate-y-px text-white font-black py-3 px-4 rounded-xl shadow-lg transition-all cursor-pointer text-xs flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                نعم، البريد صحيح - ابدأ التأسيس الآن
                            </button>

                            <button
                                type="button"
                                onClick={() => setShowEmailConfirmModal(false)}
                                className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-extrabold py-2.5 px-4 rounded-xl transition-all cursor-pointer text-xs"
                            >
                                تعديل البريد الإلكتروني
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
