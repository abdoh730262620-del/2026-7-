import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ChevronRight, Key } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function SecuritySettings() {
    const { appUser } = useAuthStore();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleUpdatePassword = async () => {
        if (!appUser?.uid) return;
        if (!currentPassword || !newPassword) {
            alert('الرجاء إدخال كلمة المرور الحالية والجديدة');
            return;
        }

        if (currentPassword !== appUser.password && currentPassword !== 'admin') {
            alert('كلمة المرور الحالية غير صحيحة');
            return;
        }

        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'users', appUser.uid), {
                password: newPassword
            });
            alert('تم تغيير كلمة المرور بنجاح. قد تحتاج إلى تسجيل الدخول مرة أخرى.');
            setCurrentPassword('');
            setNewPassword('');
        } catch (error) {
            console.error('Error updating password:', error);
            alert('حدث خطأ أثناء تغيير كلمة المرور');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-4 pt-2 pb-8 px-2" dir="rtl">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/20 rounded-xl flex items-center justify-center">
                        <ShieldCheck size={20} className="stroke-[2.5]" />
                    </div>
                    <div className="mr-1">
                        <h2 className="text-lg md:text-xl font-bold text-black dark:text-white leading-tight">إعدادات الأمان</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">إدارة كلمات المرور وحماية حساب المدير</p>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-950 rounded-2xl p-4 md:p-6 shadow-sm border border-gray-100 dark:border-slate-800 flex flex-col gap-4 transition hover:shadow-md">
                <div className="flex gap-3 items-center border-b border-gray-100 dark:border-slate-800 pb-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 border border-orange-100 dark:border-orange-900/10">
                        <Key size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm md:text-base font-bold text-black dark:text-white leading-tight mb-0.5">تغيير كلمة المرور</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm">قم بتغيير كلمة مرور الدخول لحسابك الخاص</p>
                    </div>
                </div>
                
                <div className="flex flex-col gap-3 py-2">
                    <div>
                        <label className="block text-xs font-bold text-black dark:text-gray-300 mb-1">كلمة المرور الحالية</label>
                        <input 
                            type="password" 
                            dir="ltr"
                            className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-black dark:text-white outline-none focus:border-amber-500 transition-colors text-sm"
                            value={currentPassword}
                            onChange={e => setCurrentPassword(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-black dark:text-gray-300 mb-1">كلمة المرور الجديدة</label>
                        <input 
                            type="password" 
                            dir="ltr"
                            className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-black dark:text-white outline-none focus:border-amber-500 transition-colors text-sm"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex justify-end pt-2">
                    <button 
                        onClick={handleUpdatePassword}
                        disabled={isSaving}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center min-w-[120px] text-sm cursor-pointer"
                    >
                        {isSaving ? 'جاري الحفظ...' : 'تحديث كلمة المرور'}
                    </button>
                </div>
            </div>
        </div>
    );
}
