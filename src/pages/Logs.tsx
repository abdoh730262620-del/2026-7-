import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, limit, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';

interface SystemLog {
    id: string;
    userId: string;
    userName?: string;
    action: string;
    details: string;
    date: number;
}

import { useNavigate } from 'react-router-dom';

export default function Logs() {
    const navigate = useNavigate();
    const { appUser } = useAuthStore();
    const [logs, setLogs] = useState<SystemLog[]>([]);

    useEffect(() => {
        if (appUser?.role !== 'admin') return;

        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
        const q = query(
            collection(db, 'logs'), 
            where('tenantId', '==', tenantId),
            orderBy('date', 'desc'), 
            limit(100)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: SystemLog[] = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() } as SystemLog);
            });
            setLogs(list);
        }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'logs');
        });
        return () => unsubscribe();
    }, [appUser]);

    if (appUser?.role !== 'admin') {
        return <div className="p-5 md:p-8 text-center text-red-600 font-bold text-base md:text-xl">ليس لديك صلاحية للوصول إلى هذه الصفحة</div>;
    }

    return (
        <div dir="rtl">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right whitespace-nowrap">
                        <thead className="bg-white dark:bg-slate-900 border-b border-gray-100">
                            <tr>
                                <th className="px-4 md:px-6 py-4 font-semibold text-black dark:text-gray-300">التاريخ والوقت</th>
                                <th className="px-4 md:px-6 py-4 font-semibold text-black dark:text-gray-300">المستخدم</th>
                                <th className="px-4 md:px-6 py-4 font-semibold text-black dark:text-gray-300">العملية</th>
                                <th className="px-4 md:px-6 py-4 font-semibold text-black dark:text-gray-300">التفاصيل</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {logs.map(log => (
                                <tr key={log.id} className="hover:bg-white">
                                    <td className="px-4 md:px-6 py-4 text-black font-mono text-sm" dir="ltr">
                                        {format(new Date(log.date), 'yyyy-MM-dd HH:mm:ss')}
                                    </td>
                                    <td className="px-4 md:px-6 py-4 font-semibold text-black dark:text-white">{log.userName || log.userId}</td>
                                    <td className="px-4 md:px-6 py-4 font-semibold text-blue-700">{log.action}</td>
                                    <td className="px-4 md:px-6 py-4 text-black dark:text-gray-300 max-w-md truncate" title={log.details}>{log.details}</td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-4 md:px-6 py-5 md:py-8 text-center text-black">لا توجد سجلات حالياً</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
