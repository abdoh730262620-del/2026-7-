import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { TrendingUp, TrendingDown, Activity, Package } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function OverviewReport({ dateRange }: { dateRange: { startDate: string, endDate: string } }) {
    const [stats, setStats] = useState({
        totalSales: 0,
        totalPurchases: 0,
        totalExpenses: 0,
        productsCount: 0,
    });
    const [chartData, setChartData] = useState<any[]>([]);

    useEffect(() => {
        let isMounted = true;
        
        let localStats = {
            totalSales: 0,
            totalPurchases: 0,
            totalExpenses: 0,
            productsCount: 0,
        };

        const start = new Date(dateRange.startDate).getTime();
        const end = new Date(dateRange.endDate).getTime() + 86400000; // End of the day

        let salesData: any[] = [];
        let purchasesData: any[] = [];

        const updateData = () => {
             if (!isMounted) return;

             let totalSales = 0;
             let totalPurchases = 0;
             const newChartData: Record<string, { date: string, sales: number, purchases: number }> = {};

             salesData.forEach(data => {
                 if (data.status !== 'cancelled' && data.createdAt >= start && data.createdAt <= end) {
                     const amount = data.totalAmount || data.total || 0;
                     totalSales += amount;
                     const d = new Date(data.createdAt).toISOString().substring(0, 10);
                     if (!newChartData[d]) newChartData[d] = { date: d, sales: 0, purchases: 0 };
                     newChartData[d].sales += amount;
                 }
             });

             purchasesData.forEach(data => {
                 const dCreated = data.createdAt || data.date;
                 if (data.status !== 'cancelled' && dCreated >= start && dCreated <= end) {
                    const amount = data.totalAmount || data.total || 0;
                    totalPurchases += amount;
                    const d = new Date(dCreated).toISOString().substring(0, 10);
                    if (!newChartData[d]) newChartData[d] = { date: d, sales: 0, purchases: 0 };
                    newChartData[d].purchases += amount;
                 }
             });

             localStats.totalSales = totalSales;
             localStats.totalPurchases = totalPurchases;

             setStats({ ...localStats });
             setChartData(Object.values(newChartData).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        };

        const appUser = useAuthStore.getState().appUser;
        if (!appUser) return;
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

        const unsubSales = onSnapshot(query(collection(db, 'sales'), where('tenantId', '==', tenantId)), (snap) => {
            salesData = snap.docs.map(doc => doc.data());
            updateData();
        }, (error) => handleFirestoreError(error, OperationType.GET, 'sales'));

        const unsubPurch = onSnapshot(query(collection(db, 'purchases'), where('tenantId', '==', tenantId)), (snap) => {
            purchasesData = snap.docs.map(doc => doc.data());
            updateData();
        }, (error) => handleFirestoreError(error, OperationType.GET, 'purchases'));

        const unsubCash = onSnapshot(query(collection(db, 'cash'), where('tenantId', '==', tenantId)), (snap) => {
            let total = 0;
            snap.forEach(doc => {
                const data = doc.data();
                if (data.type === 'out' && data.category === 'expense' && data.date >= start && data.date <= end) {
                    total += data.amount || 0;
                }
            });
            localStats.totalExpenses = total;
            if(isMounted) setStats({ ...localStats });
        }, (error) => handleFirestoreError(error, OperationType.GET, 'cash'));

        const unsubProd = onSnapshot(query(collection(db, 'products'), where('tenantId', '==', tenantId)), (snap) => {
            localStats.productsCount = snap.size;
            if(isMounted) setStats({ ...localStats });
        }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

        return () => {
            isMounted = false;
            unsubSales();
            unsubPurch();
            unsubCash();
            unsubProd();
        };
    }, [dateRange]);

    const netProfit = stats.totalSales - stats.totalPurchases - stats.totalExpenses;

    return (
        <div className="h-full overflow-y-auto w-full pb-10 px-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mb-5 md:mb-8">
                <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full -mr-8 -mt-8"></div>
                    <div className="flex items-center gap-3 text-green-600 relative z-10">
                        <div className="p-3 bg-white rounded-2xl"><TrendingUp size={24} /></div>
                        <h3 className="font-bold text-lg">إجمالي المبيعات</h3>
                    </div>
                    <div className="text-base md:text-xl md:text-3xl font-black text-black dark:text-white relative z-10" dir="ltr">{stats.totalSales.toLocaleString()} <span className="text-sm font-normal text-gray-400">ر.س</span></div>
                    <div className="text-xs text-gray-400 font-medium">إجمالي المبيعات النقدية والآجلة</div>
                </div>

                <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full -mr-8 -mt-8"></div>
                    <div className="flex items-center gap-3 text-purple-600 relative z-10">
                        <div className="p-3 bg-white rounded-2xl"><TrendingDown size={24} /></div>
                        <h3 className="font-bold text-lg">إجمالي المشتريات</h3>
                    </div>
                    <div className="text-base md:text-xl md:text-3xl font-black text-black dark:text-white relative z-10" dir="ltr">{stats.totalPurchases.toLocaleString()} <span className="text-sm font-normal text-gray-400">ر.س</span></div>
                    <div className="text-xs text-gray-400 font-medium">إجمالي فواتير توريد السلع</div>
                </div>

                <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full -mr-8 -mt-8"></div>
                    <div className="flex items-center gap-3 text-red-600 relative z-10">
                        <div className="p-3 bg-white rounded-2xl"><Activity size={24} /></div>
                        <h3 className="font-bold text-lg">إجمالي المصروفات</h3>
                    </div>
                    <div className="text-base md:text-xl md:text-3xl font-black text-black dark:text-white relative z-10" dir="ltr">{stats.totalExpenses.toLocaleString()} <span className="text-sm font-normal text-gray-400">ر.س</span></div>
                    <div className="text-xs text-gray-400 font-medium">الرواتب، الإيجارات، وتكاليف التشغيل</div>
                </div>

                <div className={`col-span-1 sm:col-span-2 lg:col-span-3 p-5 md:p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] border shadow-lg flex flex-col md:flex-row items-center justify-between gap-5 md:gap-8 animate-in fade-in slide-in-from-bottom-4
                    ${netProfit >= 0 ? 'bg-gradient-to-br from-emerald-600 to-teal-700 border-emerald-500 text-white' : 'bg-gradient-to-br from-red-600 to-rose-700 border-red-500 text-white'}
                `}>
                    <div className="flex-1 text-center md:text-right">
                        <h3 className="font-black text-lg md:text-2xl md:text-3xl mb-2">صافي التدفق النقدي للفترة</h3>
                        <p className="text-gray-100/70 text-sm md:text-base max-w-xl">
                            {netProfit >= 0 
                                ? 'أداء ممتاز! التدفق النقدي إيجابي، مما يعني أن المبيعات تفوق التكاليف التشغيلية.' 
                                : 'انتبه! هناك عجز في التدفق النقدي، التكاليف والمشتريات تجاوزت المبيعات في هذه الفترة.'}
                        </p>
                    </div>
                    <div className="text-center md:text-left min-w-max">
                        <div className="text-5xl md:text-7xl font-black drop-shadow-md" dir="ltr">
                            {netProfit > 0 ? '+' : ''}{netProfit.toLocaleString()} <span className="text-lg md:text-2xl font-light opacity-80">ر.س</span>
                        </div>
                        <div className="mt-2 inline-flex items-center gap-2 px-4 py-1 bg-white/20 rounded-full text-xs font-bold backdrop-blur-sm">
                            <Activity size={14} /> حالة السيولة لهذه الفترة
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                <div className="lg:col-span-2 bg-white p-4 md:p-6 md:p-8 rounded-[1.5rem] md:rounded-[2.5rem] border border-gray-100 shadow-sm h-[26rem] w-full relative">
                     <div className="flex items-center justify-between mb-5 md:mb-8 px-2">
                        <h3 className="font-black text-black dark:text-gray-100 text-base md:text-xl tracking-tight">مؤشر الحركة اليومية</h3>
                        <div className="flex items-center gap-4 text-xs font-bold">
                            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> مبيعات</div>
                            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-purple-500"></span> مشتريات</div>
                        </div>
                     </div>
                     {chartData.length > 0 ? (
                         <ResponsiveContainer width="100%" height="80%">
                             <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                 <defs>
                                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorPurchases" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                 <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="#f1f5f9" />
                                 <XAxis dataKey="date" stroke="#94a3b8" tickMargin={10} minTickGap={30} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} axisLine={false} tickLine={false} />
                                 <YAxis stroke="#94a3b8" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} tickFormatter={v => v >= 1000 ? (v/1000)+'k' : v} width={50} axisLine={false} tickLine={false} />
                                 <Tooltip contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', direction: 'rtl' }} />
                                 <Area type="monotone" name="مبيعات" dataKey="sales" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
                                 <Area type="monotone" name="مشتريات" dataKey="purchases" stroke="#a855f7" strokeWidth={4} fillOpacity={1} fill="url(#colorPurchases)" />
                             </AreaChart>
                         </ResponsiveContainer>
                     ) : (
                         <div className="flex items-center justify-center h-full text-gray-300 font-bold italic">لا توجد حركات بيع أو شراء مسجلة في هذه الفترة</div>
                     )}
                </div>

                <div className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-gray-100 p-10 flex flex-col items-center justify-center text-center">
                     <div className="w-24 h-24 bg-white text-yellow-500 rounded-[2rem] flex items-center justify-center mb-4 md:mb-6 shadow-inner">
                        <Package size={48} />
                     </div>
                     <h3 className="text-base md:text-xl font-bold text-black">مجموع الأصناف</h3>
                     <p className="text-6xl font-black text-black dark:text-white mt-2 tracking-tighter">{stats.productsCount}</p>
                     <p className="text-sm text-gray-400 mt-3 font-medium">منتج متوفر بالمخزون حالياً</p>
                     <div className="mt-4 md:mt-8 w-full h-1 bg-white dark:bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-yellow-400 w-2/3"></div>
                     </div>
                </div>
            </div>
        </div>
    );
}
