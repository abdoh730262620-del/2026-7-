import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, onSnapshot, doc, updateDoc, setDoc, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore, AppRole, AppPermissions, ModulePermissions } from '../store/authStore';
import { UserCheck, UserX, Shield, Plus, X, Settings2, Save, Users as UsersIcon, ChevronRight, Edit3, Banknote, Trash2 } from 'lucide-react';
import { logUserAction } from '../lib/logger';

interface UserData {
    id: string;
    name: string;
    email: string;
    role: AppRole;
    isActive: boolean;
    permissions?: AppPermissions;
    createdAt: number;
    salary?: number;
    password?: string;
}

const defaultModulePerms: ModulePermissions = { view: false, add: false, edit: false, delete: false, return: false };

export const getInitPerms = (): AppPermissions => ({
    sales: { ...defaultModulePerms },
    purchases: { ...defaultModulePerms },
    cash: { ...defaultModulePerms },
    expenses: { ...defaultModulePerms },
    products: { ...defaultModulePerms },
    customers: { ...defaultModulePerms },
    suppliers: { ...defaultModulePerms },
    users: { ...defaultModulePerms },
    settings: { ...defaultModulePerms },
    reports: { ...defaultModulePerms },
    quotations: { ...defaultModulePerms },
    vouchers: { ...defaultModulePerms },
    cards: { ...defaultModulePerms },
    cards_stock: { ...defaultModulePerms },
    cards_categories: { ...defaultModulePerms },
    cards_distributors: { ...defaultModulePerms },
    cards_sellers: { ...defaultModulePerms },
    cards_sales_report: { ...defaultModulePerms },
    cards_cashbox: { ...defaultModulePerms },
    cards_vouchers: { ...defaultModulePerms },
    cards_exchanges: { ...defaultModulePerms },
    backup: false
});

export const getAdminPerms = (): AppPermissions => {
    const adminP: ModulePermissions = { view: true, add: true, edit: true, delete: true, return: true };
    return {
        sales: { ...adminP },
        purchases: { ...adminP },
        cash: { ...adminP },
        expenses: { ...adminP },
        products: { ...adminP },
        customers: { ...adminP },
        suppliers: { ...adminP },
        users: { ...adminP },
        settings: { ...adminP },
        reports: { ...adminP },
        quotations: { ...adminP },
        vouchers: { ...adminP },
        cards: { ...adminP },
        cards_stock: { ...adminP },
        cards_categories: { ...adminP },
        cards_distributors: { ...adminP },
        cards_sellers: { ...adminP },
        cards_sales_report: { ...adminP },
        cards_cashbox: { ...adminP },
        cards_vouchers: { ...adminP },
        cards_exchanges: { ...adminP },
        backup: true
    };
};

export const modulesMap: Record<keyof Omit<AppPermissions, 'edit' | 'add' | 'delete' | 'backup'>, string> = {
    sales: 'المبيعات',
    purchases: 'المشتريات',
    quotations: 'عروض الأسعار',
    vouchers: 'سندات القبض والصرف',
    cash: 'الصندوق',
    expenses: 'المصروفات',
    products: 'المنتجات',
    customers: 'العملاء',
    suppliers: 'الموردين',
    users: 'المستخدمين',
    settings: 'الإعدادات',
    reports: 'التقارير',
    cards: 'الكروت (عام)',
    cards_stock: 'مخزون الكروت (إضافة رصيد)',
    cards_categories: 'فئات كروت الشبكة',
    cards_distributors: 'موزعي الكروت وحساباتهم',
    cards_sellers: 'بائعي الكروت وعمولات التجزئة',
    cards_sales_report: 'تقرير مبيعات الكروت الشهرية',
    cards_cashbox: 'صندوق مبيعات الكروت',
    cards_vouchers: 'سندات قبض وصرف الموزعين',
    cards_exchanges: 'استبدال الكروت'
};

const PermissionsEditor = ({ permissions, onChange, maxHeightClass = "max-h-64" }: { permissions: AppPermissions, onChange: (newPerms: AppPermissions) => void, maxHeightClass?: string }) => {
    const handleModuleChange = (mod: keyof typeof modulesMap, action: keyof ModulePermissions, value: boolean) => {
        const currentModPerms = permissions[mod];
        const baseModPerms = typeof currentModPerms === 'object' && currentModPerms !== null 
            ? { ...currentModPerms } 
            : { ...defaultModulePerms };
            
        baseModPerms[action] = value;

        onChange({
            ...permissions,
            [mod]: baseModPerms
        });
    };

    return (
        <div className="overflow-hidden border border-gray-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 w-full shadow-inner">
            <div className={`overflow-x-auto w-full overflow-y-auto ${maxHeightClass}`}>
                <table className="w-full text-right text-xs whitespace-nowrap">
                    <thead className="bg-gray-50 dark:bg-slate-900 text-black dark:text-gray-200 sticky top-0 border-b border-gray-100 dark:border-slate-800 z-10">
                        <tr>
                            <th className="p-2.5 font-bold">القائمة</th>
                            <th className="p-2.5 border-r border-gray-150 dark:border-slate-800 text-center font-bold">عرض</th>
                            <th className="p-2.5 border-r border-gray-150 dark:border-slate-800 text-center font-bold">إضافة</th>
                            <th className="p-2.5 border-r border-gray-150 dark:border-slate-800 text-center font-bold">تعديل</th>
                            <th className="p-2.5 border-r border-gray-150 dark:border-slate-800 text-center font-bold">حذف</th>
                            <th className="p-2.5 border-r border-gray-150 dark:border-slate-800 text-center font-bold">إرجاع</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800 text-black dark:text-white">
                        {(Object.keys(modulesMap) as Array<keyof typeof modulesMap>).map((mod, index) => (
                            <tr key={mod} className={`hover:bg-gray-50/50 dark:hover:bg-slate-900/50 transition-colors ${index % 2 === 0 ? 'bg-white dark:bg-slate-950' : 'bg-gray-50/30 dark:bg-slate-900/20'}`}>
                                <td className="p-2.5 font-bold text-black dark:text-gray-200 border-l border-gray-150 dark:border-slate-800">{modulesMap[mod]}</td>
                                {(['view', 'add', 'edit', 'delete', 'return'] as Array<keyof ModulePermissions>).map(action => (
                                    <td key={action} className="p-2.5 text-center border-l border-gray-150 dark:border-slate-800 last:border-l-0">
                                        {(action === 'return' && !['sales', 'purchases'].includes(mod as string)) ? (
                                            <span className="text-gray-300 dark:text-slate-800">-</span>
                                        ) : (
                                            <input 
                                                type="checkbox"
                                                checked={permissions[mod]?.[action] || false}
                                                onChange={(e) => handleModuleChange(mod, action, e.target.checked)}
                                                className="w-4 h-4 cursor-pointer rounded border-gray-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                                            />
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-slate-900 border-t border-gray-200 dark:border-slate-800 flex items-center justify-between">
                <label className="font-bold text-xs text-black dark:text-gray-200">صلاحية النسخ الاحتياطي للأرشيف</label>
                <input 
                    type="checkbox"
                    checked={permissions.backup || false}
                    onChange={(e) => onChange({...permissions, backup: e.target.checked})}
                    className="w-4 h-4 cursor-pointer rounded border-gray-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                />
            </div>
        </div>
    );
};

import { useNavigate } from 'react-router-dom';

export default function Users() {
    const navigate = useNavigate();
    const { appUser } = useAuthStore();
    const [users, setUsers] = useState<UserData[]>([]);
    
    // Add user state
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newSalary, setNewSalary] = useState<string>('');
    const [newRole, setNewRole] = useState<AppRole>('cashier');
    const [newPermissions, setNewPermissions] = useState<AppPermissions>(getInitPerms());
    const [isCreating, setIsCreating] = useState(false);

    // Edit permissions state
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editPermissions, setEditPermissions] = useState<AppPermissions>(getInitPerms());

    // Edit User general state
    const [editingUser, setEditingUser] = useState<UserData | null>(null);
    const [editNameInput, setEditNameInput] = useState<string>('');
    const [editPasswordInput, setEditPasswordInput] = useState<string>('');
    const [editSalaryInput, setEditSalaryInput] = useState<string>('');

    useEffect(() => {
        if (appUser?.role !== 'admin') return;
        
        const currentTenantId = appUser?.tenantId || 'single_store';
        const q = query(collection(db, 'users'), where('tenantId', '==', currentTenantId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: UserData[] = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() } as UserData);
            });
            setUsers(list);
        }, (error) => {
             handleFirestoreError(error, OperationType.GET, 'users');
        });
        return () => unsubscribe();
    }, [appUser]);

    const handleToggleActive = async (user: UserData) => {
        try {
            await updateDoc(doc(db, 'users', user.id), {
                isActive: !user.isActive,
                updatedAt: Date.now()
            });
            logUserAction(`تحديث حالة مستخدم`, `تغيير حالة المستخدم ${user.email} إلى ${!user.isActive ? 'مفعل' : 'معطل'}`);
        } catch (error: any) {
            handleFirestoreError(error, OperationType.UPDATE, 'users');
            alert('فشل في تحديث حالة المستخدم');
        }
    };

    const handleRoleChange = async (user: UserData, newRole: AppRole) => {
        try {
            await updateDoc(doc(db, 'users', user.id), {
                role: newRole,
                updatedAt: Date.now()
            });
            logUserAction(`تعديل صلاحية مستخدم`, `تغيير صلاحية المستخدم ${user.email} إلى ${newRole}`);
        } catch (error: any) {
            handleFirestoreError(error, OperationType.UPDATE, 'users');
            alert('فشل في تحديث صلاحية المستخدم');
        }
    };

    const openEditPermissions = (user: UserData) => {
        setEditPermissions(user.permissions || getInitPerms());
        setEditingUserId(user.id);
    };

    const handleSavePermissions = async () => {
        if (!editingUserId) return;
        try {
            await updateDoc(doc(db, 'users', editingUserId), {
                permissions: editPermissions,
                updatedAt: Date.now()
            });
            logUserAction(`تعديل إذن الوصول`, `تم تحديث صلاحيات المستخدم بنجاح`);
            alert('تم حفظ الصلاحيات بنجاح');
            setEditingUserId(null);
        } catch (error: any) {
            handleFirestoreError(error, OperationType.UPDATE, 'users');
            alert('فشل في تحديث الصلاحيات');
        }
    };

    const openEditUser = (user: UserData) => {
        setEditingUser(user);
        setEditNameInput(user.name || '');
        setEditPasswordInput(user.password || '');
        setEditSalaryInput(user.salary ? String(user.salary) : '');
    };

    const handleSaveUser = async () => {
        if (!editingUser) return;
        if (!editNameInput.trim()) {
            return alert('يرجى إدخال اسم المستخدم');
        }
        if (editPasswordInput && editPasswordInput.length < 6) {
            return alert('كلمة المرور يجب أن لا تقل عن 6 أحرف');
        }
        const salaryVal = parseFloat(editSalaryInput) || 0;
        try {
            const updateData: any = {
                name: editNameInput.trim(),
                salary: salaryVal,
                updatedAt: Date.now()
            };
            if (editPasswordInput) {
                updateData.password = editPasswordInput;
            }
            await updateDoc(doc(db, 'users', editingUser.id), updateData);
            logUserAction(`تعديل بيانات مستخدم`, `تحديث الاسم إلى: ${editNameInput.trim()}، والراتب إلى: ${salaryVal}`);
            alert('تم تحديث بيانات المستخدم بنجاح');
            setEditingUser(null);
        } catch (error: any) {
            handleFirestoreError(error, OperationType.UPDATE, 'users');
            alert('فشل في تحديث بيانات المستخدم');
        }
    };

    const handleDeleteUser = async (user: UserData) => {
        if (user.id === appUser?.uid || user.email === appUser?.email) {
            return alert('لا يمكنك حذف حسابك الحالي الناشط');
        }
        if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${user.name}" نهائياً من النظام؟`)) {
            return;
        }
        try {
            await deleteDoc(doc(db, 'users', user.id));
            logUserAction(`حذف مستخدم`, `تم حذف المستخدم ${user.name} (${user.email}) نهائياً`);
            alert('تم حذف المستخدم بنجاح');
        } catch (error: any) {
            handleFirestoreError(error, OperationType.DELETE, 'users');
            alert('فشل في حذف المستخدم');
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername || !newPassword || newPassword.length < 6) {
            return alert('يرجى إدخال اسم المستخدم وكلمة مرور لا تقل عن 6 أحرف');
        }
        setIsCreating(true);
        try {
            // Check if username already exists within this store's tenant
            const currentTenantId = appUser?.tenantId || 'single_store';
            const q = query(
                collection(db, 'users'), 
                where('tenantId', '==', currentTenantId),
                where('name', '==', newUsername)
            );
            const existing = await getDocs(q);
            if (!existing.empty) {
                return alert('اسم المستخدم الخاص بالموظف موجود مسبقاً في هذا المتجر');
            }

            const newUserId = Math.random().toString(36).substring(2, 15);
            const email = newUsername.includes('@') ? newUsername : `${newUsername}@local.app`;
            const salaryVal = parseFloat(newSalary) || 0;
            
            await setDoc(doc(db, 'users', newUserId), {
                email: email,
                name: newUsername,
                password: newPassword, // Note: storing plain text as requested for "internal simplicity"
                role: newRole,
                salary: salaryVal,
                isActive: true,
                permissions: newRole === 'admin' ? getAdminPerms() : newPermissions,
                tenantId: currentTenantId,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            
            await logUserAction('إضافة مستخدم', `تم إضافة مستخدم جديد: ${newUsername}`);
            alert('تم إضافة المستخدم بنجاح');
            setIsAddOpen(false);
            setNewUsername('');
            setNewPassword('');
            setNewSalary('');
            setNewPermissions(getInitPerms());
        } catch (error: any) {
            console.error('Error creating user', error);
            alert('فشل في إضافة المستخدم: ' + error.message);
        } finally {
            setIsCreating(false);
        }
    };

    if (appUser?.role !== 'admin') {
        return <div className="p-5 md:p-8 text-center text-red-600 font-bold text-base md:text-xl">ليس لديك صلاحية للوصول إلى هذه الصفحة</div>;
    }

    const roleNames: Record<AppRole, string> = {
        'admin': 'مدير (Admin)',
        'cashier': 'كاشير (Cashier)',
        'inventory': 'أمين مخزن (Storekeeper)',
        'salesman': 'مندوب مبيعات (Salesman)',
        'network_worker': 'عامل شبكة (Network Worker)'
    };

    const permissionLabels: Partial<Record<keyof AppPermissions, string>> = {
        sales: 'المبيعات',
        purchases: 'المشتريات',
        edit: 'التعديل',
        add: 'الإضافة',
        delete: 'الحذف',
        backup: 'النسخ الاحتياطي'
    };

    return (
        <div className="pb-8 pt-2 px-2 max-w-5xl mx-auto" dir="rtl">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/20 rounded-xl flex items-center justify-center">
                        <UsersIcon size={20} className="stroke-[2.5]" />
                    </div>
                    <div className="mr-1">
                        <h2 className="text-lg md:text-xl font-bold text-black dark:text-white leading-tight">إدارة المستخدمين والصلاحيات</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">إضافة الموظفين وتعديل صلاحيات الوصول اليومية</p>
                    </div>
                </div>
            </div>
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3 bg-white dark:bg-slate-950 p-4 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
                <div>
                    <p className="text-indigo-900 dark:text-indigo-400 text-xs sm:text-sm font-semibold leading-relaxed">تحكم بمدخلات الوصول وصلاحيات الطاقم والموظفين من لوحة أمان مركزية واحدة.</p>
                </div>
                <button 
                    onClick={() => setIsAddOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl flex items-center gap-1.5 font-bold transition whitespace-nowrap text-xs cursor-pointer shadow-sm shadow-indigo-100 dark:shadow-none"
                >
                    <Plus size={16} />
                    إضافة مستخدم جديد
                </button>
            </div>

            <div className="grid grid-cols-2 gap-3 md:gap-5">
                {users.map(user => (
                    <div key={user.id} className="bg-white dark:bg-slate-950 rounded-2xl p-3 sm:p-4 shadow-sm border border-gray-100 dark:border-slate-800/80 flex flex-col justify-between gap-3 transition hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-md h-full min-h-[190px]">
                        {/* Top: Avatar, Name & Role Selection */}
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-base sm:text-lg shrink-0 border border-indigo-100/50 dark:border-indigo-900/20">
                                    {user.name?.charAt(0).toUpperCase() || 'U'}
                                </div>
                                <div className="flex flex-col overflow-hidden leading-tight min-w-0">
                                    <h3 className="font-bold text-xs sm:text-sm text-black dark:text-white truncate">{user.name || 'مستخدم'}</h3>
                                    <p className="text-gray-400 dark:text-gray-500 text-[10px] font-mono truncate mt-0.5">{user.email}</p>
                                </div>
                            </div>

                            {/* Status Pill */}
                            <div className={`px-1.5 py-0.5 rounded-md text-[8px] sm:text-[9px] font-black border shrink-0 ${user.isActive ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-900/30'}`}>
                                {user.isActive ? 'نشط' : 'موقوف'}
                            </div>
                        </div>

                        {/* Middle: Role selector and salary info */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                            <div>
                                <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 mb-1">الدور الوظيفي:</label>
                                <select 
                                    value={user.role} 
                                    onChange={(e) => handleRoleChange(user, e.target.value as AppRole)}
                                    className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-black dark:text-gray-100 font-bold py-1 px-1.5 rounded-lg outline-none focus:border-indigo-500 transition w-full text-[10px] sm:text-xs"
                                >
                                    <option value="admin">{roleNames['admin']}</option>
                                    <option value="cashier">{roleNames['cashier']}</option>
                                    <option value="inventory">{roleNames['inventory']}</option>
                                    <option value="salesman">{roleNames['salesman']}</option>
                                    <option value="network_worker">{roleNames['network_worker']}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 mb-1">الراتب الشهري:</label>
                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-[10px] sm:text-xs h-[28px]">
                                    <span className="font-extrabold font-mono text-emerald-600 dark:text-emerald-400 truncate">
                                        {user.salary !== undefined && user.salary !== null && user.salary > 0 ? `${user.salary.toLocaleString()} ر.ي` : 'غير محدد'}
                                    </span>
                                    <button
                                        onClick={() => openEditUser(user)}
                                        className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-400 hover:text-indigo-600 transition cursor-pointer"
                                        title="تعديل الراتب والاسم وكلمة المرور"
                                    >
                                        <Edit3 size={11} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Bottom: Permissions Action Button & Administration Actions */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 mt-auto">
                            <div>
                                {user.role === 'admin' ? (
                                    <div className="text-gray-500 dark:text-gray-400 font-black text-[9px] bg-gray-50 dark:bg-slate-900 rounded-lg px-2 py-1 border border-gray-100 dark:border-slate-800/60 inline-block">
                                        مسؤول (صلاحيات كاملة)
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => openEditPermissions(user)}
                                        className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-slate-900 dark:hover:bg-slate-850 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded-lg font-black transition text-[9px] cursor-pointer border border-indigo-100/40 dark:border-slate-800"
                                    >
                                        <Settings2 size={11} />
                                        تعديل الصلاحيات 
                                    </button>
                                )}
                            </div>

                            {/* Action Buttons Row */}
                            <div className="flex items-center gap-1 shrink-0">
                                <button 
                                    onClick={() => handleToggleActive(user)}
                                    className={`p-1.5 rounded-lg transition font-bold flex items-center justify-center cursor-pointer border
                                        ${user.isActive 
                                            ? 'text-rose-600 bg-rose-50/40 hover:bg-rose-100 dark:bg-slate-900 dark:text-rose-400 dark:border-slate-800 dark:hover:bg-slate-800' 
                                            : 'text-emerald-600 bg-emerald-50/40 hover:bg-emerald-100 dark:bg-slate-900 dark:text-emerald-400 dark:border-slate-800 dark:hover:bg-slate-800'}
                                    `}
                                    title={user.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                                >
                                    {user.isActive ? <UserX size={13}/> : <UserCheck size={13}/>}
                                </button>
                                <button 
                                    onClick={() => openEditUser(user)}
                                    className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-800 text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                                    title="تعديل الاسم أو كلمة السر أو الراتب"
                                >
                                    <Edit3 size={13} />
                                </button>
                                <button 
                                    onClick={() => handleDeleteUser(user)}
                                    className="p-1.5 rounded-lg border border-rose-100 dark:border-rose-900/30 text-rose-600 hover:text-rose-700 bg-rose-50/30 hover:bg-rose-50 dark:bg-slate-900 dark:hover:bg-rose-950/20 transition cursor-pointer"
                                    title="حذف المستخدم نهائياً"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {isAddOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-all">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[95vh] border border-gray-150 dark:border-slate-800">
                        <div className="p-3.5 sm:p-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center text-black dark:text-white shrink-0">
                            <h3 className="text-sm sm:text-base font-bold">إضافة مستخدم جديد</h3>
                            <button onClick={() => setIsAddOpen(false)} className="bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 p-1.5 rounded-full transition text-black dark:text-white cursor-pointer">
                                <X size={15} />
                            </button>
                        </div>
                        <form onSubmit={handleAddUser} className="flex flex-col flex-1 overflow-hidden">
                            <div className="p-3 sm:p-4 flex flex-col gap-3 overflow-y-auto">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/50 dark:bg-slate-950/20 p-2.5 sm:p-3 rounded-xl border border-gray-100 dark:border-slate-800/60">
                                    <div>
                                        <label className="block text-[10px] font-black text-black dark:text-gray-200 mb-1">اسم المستخدم (أو البريد)</label>
                                        <input 
                                            type="text" 
                                            className="w-full bg-white dark:bg-slate-950 text-black dark:text-white border border-gray-200 dark:border-slate-800 rounded-lg p-2 outline-none focus:border-indigo-500 transition text-xs"
                                            value={newUsername}
                                            onChange={e => setNewUsername(e.target.value)}
                                            placeholder="مثال: abdullah"
                                            dir="ltr"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-black dark:text-gray-200 mb-1">كلمة المرور (6 أحرف على الأقل)</label>
                                        <input 
                                            type="password" 
                                            className="w-full bg-white dark:bg-slate-950 text-black dark:text-white border border-gray-200 dark:border-slate-800 rounded-lg p-2 outline-none focus:border-indigo-500 transition text-xs"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            dir="ltr"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-black dark:text-gray-200 mb-1 flex items-center gap-1">
                                            <Banknote size={11} className="text-emerald-500" />
                                            الراتب الشهري (ر.ي)
                                        </label>
                                        <input 
                                            type="number" 
                                            min="0"
                                            step="any"
                                            className="w-full bg-white dark:bg-slate-950 text-black dark:text-white border border-gray-200 dark:border-slate-800 rounded-lg p-2 outline-none focus:border-indigo-500 transition text-xs font-mono"
                                            value={newSalary}
                                            onChange={e => setNewSalary(e.target.value)}
                                            placeholder="مثال: 3000"
                                            dir="ltr"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-black dark:text-gray-200 mb-1">الدور في النظام</label>
                                        <select 
                                            className="w-full bg-white dark:bg-slate-950 text-black dark:text-white border border-gray-200 dark:border-slate-800 rounded-lg p-2 outline-none focus:border-indigo-500 transition font-bold text-xs"
                                            value={newRole}
                                            onChange={e => setNewRole(e.target.value as AppRole)}
                                        >
                                            <option value="admin">{roleNames['admin']}</option>
                                            <option value="cashier">{roleNames['cashier']}</option>
                                            <option value="inventory">{roleNames['inventory']}</option>
                                            <option value="salesman">{roleNames['salesman']}</option>
                                            <option value="network_worker">{roleNames['network_worker']}</option>
                                        </select>
                                    </div>
                                </div>
                                
                                {newRole !== 'admin' && (
                                    <div className="border-t border-gray-100 dark:border-slate-850 pt-3">
                                        <label className="block text-[11px] font-black text-black dark:text-gray-200 mb-1.5 bg-indigo-50/50 dark:bg-indigo-950/20 px-2 py-1 rounded-md w-max border border-indigo-100/20">الصلاحيات المخصصة لهذا المستخدم</label>
                                        <PermissionsEditor permissions={newPermissions} onChange={setNewPermissions} />
                                    </div>
                                )}
                            </div>
 
                            <div className="p-3 sm:p-4 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 flex gap-2">
                                <button 
                                    type="button"
                                    onClick={() => setIsAddOpen(false)}
                                    className="flex-1 bg-gray-50 hover:bg-gray-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-black dark:text-white font-bold py-2 px-3 rounded-lg transition shadow-sm flex justify-center items-center gap-1.5 text-xs cursor-pointer border border-gray-150 dark:border-slate-700"
                                >
                                    خروج
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isCreating}
                                    className="flex-[2] bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white font-bold py-2 px-3 rounded-lg transition shadow-sm flex justify-center items-center gap-1.5 text-xs cursor-pointer"
                                >
                                    {isCreating ? 'جاري إنشاء المستخدم...' : <><Plus size={14}/> احفظ واعتمد المستخدم</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingUserId && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-all">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95vh] border border-gray-150 dark:border-slate-800">
                        <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center text-black dark:text-white shrink-0">
                            <h3 className="text-base md:text-lg font-bold flex items-center gap-2">
                                <Settings2 size={20} className="text-indigo-600 dark:text-indigo-400" />
                                تعديل الصلاحيات المتقدمة
                            </h3>
                            <button onClick={() => setEditingUserId(null)} className="bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 p-2 rounded-full transition text-black dark:text-white cursor-pointer">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-4 md:p-5 overflow-y-auto flex-1">
                            <PermissionsEditor permissions={editPermissions} onChange={setEditPermissions} maxHeightClass="max-h-[60vh]" />
                        </div>
                        <div className="p-4 md:p-5 border-t border-gray-100 dark:border-slate-800 shrink-0 flex justify-end gap-3 bg-white dark:bg-slate-900">
                            <button 
                                onClick={() => setEditingUserId(null)}
                                className="px-5 py-2.5 rounded-xl font-bold text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition text-xs cursor-pointer"
                            >
                                إلغاء
                            </button>
                            <button 
                                onClick={handleSavePermissions}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-1.5 transition text-xs cursor-pointer"
                            >
                                <Save size={14} />
                                حفظ التعديلات
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingUser && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-all">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl p-5 border border-gray-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-800 pb-3">
                            <h3 className="font-bold text-sm md:text-base text-black dark:text-white flex items-center gap-1.5">
                                <Settings2 size={18} className="text-indigo-500" />
                                تعديل بيانات المستخدم
                            </h3>
                            <button onClick={() => setEditingUser(null)} className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-black dark:text-gray-200 mb-1.5">الاسم / اسم المستخدم</label>
                                <input 
                                    type="text"
                                    value={editNameInput}
                                    onChange={(e) => setEditNameInput(e.target.value)}
                                    placeholder="أدخل اسم المستخدم"
                                    className="w-full bg-white dark:bg-slate-950 text-black dark:text-white border border-gray-200 dark:border-slate-800 rounded-xl p-2.5 outline-none focus:border-indigo-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-black dark:text-gray-200 mb-1.5">كلمة المرور الجديدة (اختياري)</label>
                                <input 
                                    type="password"
                                    value={editPasswordInput}
                                    onChange={(e) => setEditPasswordInput(e.target.value)}
                                    placeholder="اتركها فارغة لعدم التغيير (6 أحرف كحد أدنى)"
                                    className="w-full bg-white dark:bg-slate-950 text-black dark:text-white border border-gray-200 dark:border-slate-800 rounded-xl p-2.5 outline-none focus:border-indigo-500 text-sm"
                                    dir="ltr"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-black dark:text-gray-200 mb-1.5 flex items-center gap-1.5">
                                    <Banknote size={14} className="text-emerald-500" />
                                    الراتب الشهري (ر.ي)
                                </label>
                                <input 
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={editSalaryInput}
                                    onChange={(e) => setEditSalaryInput(e.target.value)}
                                    placeholder="أدخل قيمة الراتب الشهري"
                                    className="w-full bg-white dark:bg-slate-950 text-black dark:text-white border border-gray-200 dark:border-slate-800 rounded-xl p-2.5 outline-none focus:border-indigo-500 text-sm font-mono"
                                    dir="ltr"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
                            <button
                                onClick={() => setEditingUser(null)}
                                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
                            >
                                إلغاء
                            </button>
                            <button
                                onClick={handleSaveUser}
                                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                                <Save size={14} />
                                حفظ التعديلات
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
