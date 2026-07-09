import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ShieldAlert, Key, Eye, EyeOff, Lock, LogOut, CheckCircle, AlertTriangle } from 'lucide-react';

export default function ForcePasswordChangeOverlay() {
    const { appUser, logout } = useAuthStore();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    if (!appUser) return null;

    // Determine if the password is still set to any default placeholder
    const currentPass = (appUser.password || '').trim().toLowerCase();
    const isDefault = !appUser.password || ['admin', 'admin123', 'admin_initial', 'password'].includes(currentPass);

    // If the password is NOT default, do not render this blocking modal
    if (!isDefault) return null;

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const trimmedPass = newPassword.trim();
        const trimmedConfirm = confirmPassword.trim();

        if (trimmedPass.length < 6) {
            return setError('يجب أن تكون كلمة المرور الجديدة مكونة من 6 خانات أو أكثر لضمان الأمان الفائق لبياناتك.');
        }

        if (trimmedPass === 'admin' || trimmedPass === 'admin123') {
            return setError('يرجى اختيار كلمة مرور جديدة تختلف تماماً عن كلمة المرور الافتراضية المسبقة.');
        }

        if (trimmedPass !== trimmedConfirm) {
            return setError('كلمة المرور الجديدة غير متطابقة مع حقل التأكيد.');
        }

        setIsSaving(true);
        try {
            // Update Firestore user document
            await updateDoc(doc(db, 'users', appUser.uid), {
                password: trimmedPass
            });

            // Update remembered password in localStorage for instant prefilling next login
            localStorage.setItem('remembered_password', trimmedPass);

            setSuccess(true);
            setError(null);
        } catch (err: any) {
            console.error('Error updating default password:', err);
            setError('فشل تعديل كلمة المرور بقاعدة البيانات. يرجى محاولة الاتصال بالإنترنت مجدداً.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[100] flex items-center justify-center p-4" dir="rtl">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 md:p-8 border border-amber-200 dark:border-amber-950/50 transform translate-y-0 opacity-100 transition-all duration-300">
                
                {/* Visual Icon Header */}
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/40 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200 dark:border-amber-900/50 shadow-sm animate-pulse">
                        <ShieldAlert className="w-9 h-9 text-amber-600 dark:text-amber-500" />
                    </div>
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">تأمين الحساب وحماية المتجر مطلوب!</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mt-2 leading-relaxed">
                        أنت تسجل الدخول حالياً باستخدام <strong>كلمة المرور الافتراضية المؤقتة</strong>. لحماية أرباحك، مبيعاتك، وسيرفرات متجرك السحابية، يجب تبديلها الآن قبل بدء تصفح لوحة التحكم.
                    </p>
                </div>

                {success ? (
                    <div className="text-center py-6 flex flex-col items-center gap-3 animate-fade-in">
                        <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center">
                            <CheckCircle className="w-8 h-8" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">تم تغيير كلمة المرور بنجاح!</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            جاري تهيئة لوحة التحكم ومزامنة بيانات متجرك السحابي بآمان ممتد...
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleUpdatePassword} className="space-y-4">
                        
                        {/* Status Warning Banner */}
                        <div className="bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 p-3 rounded-xl border border-amber-200 dark:border-amber-900/30 text-xs leading-relaxed flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
                            <span>
                                المعرّف الافتراضي لمتجرك ضعيف جداً للعامة. يرجى صياغة رمز خاص حصري بك يتذكره جهازك تلقائياً لسهولة الدخول لاحقاً.
                            </span>
                        </div>

                        {error && (
                            <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 p-3 rounded-xl text-xs text-right leading-relaxed border border-red-100 dark:border-red-900/50 flex gap-2 items-center">
                                <ShieldAlert className="w-4 h-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* New Password Field */}
                        <div>
                            <label className="block text-slate-600 dark:text-slate-400 font-extrabold mb-1.5 mr-1 text-xs">
                                اكتب كلمة المرور الجديدة القوية:
                            </label>
                            <div className="relative">
                                <input 
                                    type={showPassword ? 'text' : 'password'} 
                                    className="w-full border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 pr-3 pl-10 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition text-sm font-bold tracking-wider"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="6 رموز أو أكثر"
                                    dir="ltr"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute left-3 top-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                                <Lock className="absolute right-3 top-3.5 w-4 h-4 text-gray-400" />
                            </div>
                        </div>

                        {/* Confirm Password Field */}
                        <div>
                            <label className="block text-slate-600 dark:text-slate-400 font-extrabold mb-1.5 mr-1 text-xs">
                                تأكيد كلمة المرور الجديدة:
                            </label>
                            <div className="relative">
                                <input 
                                    type={showPassword ? 'text' : 'password'} 
                                    className="w-full border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3 pr-3 pl-10 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition text-sm font-bold tracking-wider"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="أعد كتابتها للتأكيد"
                                    dir="ltr"
                                    required
                                />
                                <Key className="absolute right-3 top-3.5 w-4 h-4 text-gray-400" />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2 pt-2">
                            <button 
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-amber-600 hover:bg-amber-700 active:translate-y-px text-white font-extrabold py-3 px-4 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer text-xs"
                            >
                                {isSaving ? 'جاري تشفير وتحديث كلمة المرور...' : 'تحديث كلمة المرور وتفعيل المتجر الآمن'}
                            </button>

                            <button
                                type="button"
                                onClick={() => logout()}
                                className="w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-extrabold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs mt-1"
                            >
                                <LogOut className="w-4 h-4" />
                                تسجيل الخروج والعودة لاحقاً
                            </button>
                        </div>
                    </form>
                )}

            </div>
        </div>
    );
}
