import React, { useState, useEffect } from 'react';
import { Fingerprint, LockOpen, LogOut, KeyRound, User as UserIcon } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

export default function AppLock({ children }: { children: React.ReactNode }) {
    const { appUser, logout } = useAuthStore();
    
    // ... rest of the component state ...
    const [loginMethod, setLoginMethod] = useState<'password' | 'pin'>('password');
    const [isBiometricEnabled, setIsBiometricEnabled] = useState<boolean>(() => {
        if (!appUser?.uid) return false;
        try {
            return localStorage.getItem(`biometric_${appUser.uid}`) === 'true';
        } catch (e) {
            return false;
        }
    });
    const [savedPin, setSavedPin] = useState<string | null>(() => {
        if (!appUser?.uid) return null;
        try {
            return localStorage.getItem(`pin_${appUser.uid}`);
        } catch (e) {
            return null;
        }
    });

    useEffect(() => {
        if (!appUser?.uid) return;
        try {
            setIsBiometricEnabled(localStorage.getItem(`biometric_${appUser.uid}`) === 'true');
            setSavedPin(localStorage.getItem(`pin_${appUser.uid}`));
        } catch (e) {
            console.warn('localStorage not available', e);
        }
    }, [appUser?.uid]);
    
    // Default to unlocked if no lock mechanism (PIN / Biometric) is set up on this device
    const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
        if (!appUser?.uid) return false;
        try {
            const unlocked = sessionStorage.getItem(`unlocked_${appUser.uid}`) === 'true';
            if (unlocked) return true;

            const pin = localStorage.getItem(`pin_${appUser.uid}`);
            const bio = localStorage.getItem(`biometric_${appUser.uid}`) === 'true';
            
            // If neither PIN nor biometric lock is set up, unlock immediately
            if (!pin && !bio) {
                return true;
            }
        } catch (e) {
            // Safe fallback
        }
        return false;
    });

    const [isChecking, setIsChecking] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    
    useEffect(() => {
        if (!appUser?.uid) return;
        try {
            const sessionUnlock = sessionStorage.getItem(`unlocked_${appUser?.uid}`);
            if (sessionUnlock === 'true') {
                setIsUnlocked(true);
                return;
            }
        } catch (e) {
            console.warn('sessionStorage not available', e);
        }
        
        if (!savedPin && !isBiometricEnabled) {
            setIsUnlocked(true);
            return;
        }
        
        if (savedPin) {
            setLoginMethod('pin');
        }
        
        if (isBiometricEnabled && window.PublicKeyCredential) {
             handleUnlockBiometric();
        }
    }, [isBiometricEnabled, appUser, savedPin]);

    const handleUnlockBiometric = async () => {
        setIsChecking(true);
        try {
            try {
                const info = await NativeBiometric.isAvailable();
                if (info.isAvailable) {
                    await NativeBiometric.verifyIdentity({
                        reason: "الرجاء تأكيد هويتك لفتح التطبيق",
                        title: "تسجيل الدخول",
                        subtitle: "تطبيق النظام",
                        description: "استخدم بصمة الإصبع أو الوجه للدخول"
                    });
                    bypassLock();
                    return;
                }
            } catch (pluginError) {
                console.warn("Capacitor NativeBiometric not available, falling back to WebAuthn", pluginError);
            }

            if (!window.PublicKeyCredential) {
                if (!savedPin) bypassLock();
                return;
            }
            const challenge = new Uint8Array(32);
            crypto.getRandomValues(challenge);
            const assertion = await navigator.credentials.get({
                publicKey: { challenge, timeout: 60000, userVerification: "required" }
            });
            if (assertion) bypassLock();
        } catch (error: any) {
            console.error("Unlock failed", error);
            if (!savedPin && error.name !== 'NotAllowedError') bypassLock();
        } finally {
            setIsChecking(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        
        if (loginMethod === 'pin') {
            if (inputValue === savedPin) {
                bypassLock();
            } else {
                setErrorMsg('رمز PIN غير صحيح');
                setInputValue('');
            }
        } else {
            setIsChecking(true);
            try {
                if (!appUser?.uid) throw new Error('no-user');
                // Verify password against Firestore
                const userDoc = await getDoc(doc(db, 'users', appUser.uid));
                if (userDoc.exists() && userDoc.data().password === inputValue) {
                    bypassLock();
                } else {
                    setErrorMsg('كلمة المرور غير صحيحة');
                }
            } catch (err: any) {
                setErrorMsg('حدث خطأ في التحقق');
                setInputValue('');
            } finally {
                setIsChecking(false);
            }
        }
    }

    const bypassLock = () => {
         try {
             sessionStorage.setItem(`unlocked_${appUser?.uid}`, 'true');
         } catch (e) {
             console.warn('sessionStorage not available', e);
         }
         setIsUnlocked(true);
    };

    if (isUnlocked) {
        return <>{children}</>;
    }

    return (
        <div className="flex h-screen items-center justify-center bg-white dark:bg-slate-900 text-black dark:text-gray-100 p-4" dir="rtl">
            <div className="bg-white p-6 md:p-10 rounded-2xl md:rounded-3xl shadow-xl max-w-sm w-full flex flex-col items-center">
                <div className="w-20 h-20 bg-white dark:bg-slate-800 text-blue-600 rounded-full flex items-center justify-center mb-4">
                    <UserIcon size={40} />
                </div>
                
                <h2 className="text-xl font-bold text-black dark:text-white mb-1">مرحباً بعودتك!</h2>
                <p className="text-black mb-6 text-sm text-center">{appUser?.name}</p>
                
                <div className="flex bg-white dark:bg-slate-800 p-1 rounded-xl w-full mb-6 relative">
                    <button 
                        onClick={() => {setLoginMethod('password'); setInputValue(''); setErrorMsg('');}}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${loginMethod === 'password' ? 'bg-white shadow-sm text-blue-600' : 'text-black hover:text-gray-700'}`}
                    >
                        كلمة المرور
                    </button>
                    {savedPin && (
                        <button 
                            onClick={() => {setLoginMethod('pin'); setInputValue(''); setErrorMsg('');}}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${loginMethod === 'pin' ? 'bg-white shadow-sm text-blue-600' : 'text-black hover:text-gray-700'}`}
                        >
                            رمز PIN
                        </button>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="w-full mb-6 relative">
                    <input 
                        type="password" 
                        placeholder={loginMethod === 'pin' ? "أدخل رمز PIN ❋❋❋❋" : "أدخل كلمة المرور..."}
                        value={inputValue}
                        onChange={(e) => setInputValue(loginMethod === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                        className={`w-full border-2 rounded-xl p-3.5 text-center text-sm md:text-base font-bold outline-none transition
                            ${errorMsg ? 'border-red-500 bg-white text-red-700' : 'border-gray-200 focus:border-blue-500'}
                        `}
                        dir="ltr"
                        maxLength={loginMethod === 'pin' ? 8 : 50}
                    />
                    {errorMsg && <span className="text-red-500 text-xs font-bold absolute -bottom-5 left-0 right-0 text-center">{errorMsg}</span>}
                    
                    <button 
                        type="submit" 
                        disabled={!inputValue || isChecking}
                        className="mt-6 w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-3 rounded-xl font-bold flex justify-center items-center gap-2 transition"
                    >
                        {isChecking ? 'جاري التحقق...' : <><LockOpen size={18} /> دخول</>}
                    </button>
                </form>

                {isBiometricEnabled && (
                    <button 
                        onClick={handleUnlockBiometric}
                        disabled={isChecking}
                        className="w-full border-2 border-emerald-100 bg-white hover:bg-white text-emerald-700 rounded-xl py-3 font-bold text-sm transition flex justify-center items-center gap-2 mb-4"
                    >
                        <Fingerprint size={18} /> الدخول بالبصمة
                    </button>
                )}

                <button 
                    onClick={() => logout()}
                    className="text-gray-400 hover:text-red-500 text-xs font-semibold flex items-center gap-1 transition mt-2"
                >
                    <LogOut size={14} /> تبديل الحساب (تسجيل خروج)
                </button>
            </div>
        </div>
    );
}
