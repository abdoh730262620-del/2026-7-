import React, { useState, useEffect } from 'react';
import { Wifi, ArrowRight, RefreshCw, ShoppingBag, DollarSign, Clock, AlertTriangle } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CardCategory, CardSale } from '../types/cardTypes';
import CardSaleModal from '../components/CardSaleModal';
import { useAuthStore } from '../store/authStore';

const DENOMINATIONS = [
    { name: 'فئة 100 ريال', defaultRetail: 100 },
    { name: 'فئة 200 ريال', defaultRetail: 200 },
    { name: 'فئة 250 ريال', defaultRetail: 250 },
    { name: 'فئة 500 ريال', defaultRetail: 500 },
    { name: 'فئة 1000 ريال', defaultRetail: 1000 },
    { name: 'فئة 1500 ريال', defaultRetail: 1500 },
    { name: 'فئة 3000 ريال', defaultRetail: 3000 },
    { name: 'فئة 5000 ريال', defaultRetail: 5000 },
];

export default function NetworkCards() {
    const { appUser, hasPermission } = useAuthStore();
    const canView = hasPermission('cards', 'view');
    const canAdd = hasPermission('cards', 'add');

    const tenantId = 'single_store';
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState<CardCategory[]>([]);
    const [monthSales, setMonthSales] = useState<CardSale[]>([]);
    
    // Modal state for selling card
    const [selectedCategoryForSale, setSelectedCategoryForSale] = useState<string | null>(null);

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    useEffect(() => {
        // Fetch Categories
        const qCat = query(
            collection(db, 'card_categories'),
            where('tenantId', '==', tenantId)
        );
        const unsubCat = onSnapshot(qCat, (snapshot) => {
            const list: CardCategory[] = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            } as CardCategory));
            setCategories(list);
            setLoading(false);
        }, (err) => {
            console.error(err);
            setLoading(false);
        });

        // Fetch Current Month Sales
        const qSales = query(
            collection(db, 'card_sales'),
            where('tenantId', '==', tenantId),
            where('month', '==', currentMonthStr)
        );
        const unsubSales = onSnapshot(qSales, (snapshot) => {
            const list: CardSale[] = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            } as CardSale));
            setMonthSales(list);
        }, (err) => console.error(err));

        return () => {
            unsubCat();
            unsubSales();
        };
    }, [currentMonthStr]);

    // Build displayed items matching default 8 denominations AND any custom categories added now or in the future
    const processedCategoryNames = new Set<string>();

    const defaultGridItems = DENOMINATIONS.map(denom => {
        processedCategoryNames.add(denom.name.trim());
        
        // Find matching categories by direct name OR linkedSection setting
        const matchingCategories = categories.filter(c => 
            c.name.trim() === denom.name.trim() || 
            c.linkedSection?.trim() === denom.name.trim()
        );

        matchingCategories.forEach(c => processedCategoryNames.add(c.name.trim()));
        
        // Sum stock count across all linked categories
        const availableCount = matchingCategories.reduce((sum, c) => sum + (c.availableCount || 0), 0);
        
        // Find main category for retail price if set
        const mainCat = matchingCategories.find(c => c.name.trim() === denom.name.trim()) || matchingCategories[0];
        const retailPrice = mainCat?.retailPrice || denom.defaultRetail;

        // Count cash and credit sales for this category/section in current month
        const categorySales = monthSales.filter(s => {
            const isDirectName = s.categoryName?.trim() === denom.name.trim();
            const isLinkedCat = matchingCategories.some(c => c.name?.trim() === s.categoryName?.trim() || c.id === s.categoryId);
            return isDirectName || isLinkedCat;
        });

        const cashQty = categorySales
            .filter(s => s.paymentType === 'cash')
            .reduce((sum, s) => sum + (s.quantity || 0), 0);
        const creditQty = categorySales
            .filter(s => s.paymentType === 'credit')
            .reduce((sum, s) => sum + (s.quantity || 0), 0);

        return {
            id: mainCat?.id || denom.name,
            name: denom.name,
            retailPrice,
            availableCount,
            cashQty,
            creditQty
        };
    });

    const customGridItems: typeof defaultGridItems = [];
    categories.forEach(cat => {
        const catName = cat.name?.trim();
        if (catName && !processedCategoryNames.has(catName)) {
            processedCategoryNames.add(catName);

            const matchingCategories = categories.filter(c => c.name?.trim() === catName);
            const availableCount = matchingCategories.reduce((sum, c) => sum + (c.availableCount || 0), 0);
            
            const retailPrice = cat.retailPrice || (catName.match(/\d+/) ? parseInt(catName.match(/\d+/)![0], 10) : 0);

            const categorySales = monthSales.filter(s => {
                return s.categoryName?.trim() === catName || s.categoryId === cat.id;
            });

            const cashQty = categorySales
                .filter(s => s.paymentType === 'cash')
                .reduce((sum, s) => sum + (s.quantity || 0), 0);
            const creditQty = categorySales
                .filter(s => s.paymentType === 'credit')
                .reduce((sum, s) => sum + (s.quantity || 0), 0);

            customGridItems.push({
                id: cat.id,
                name: cat.name,
                retailPrice,
                availableCount,
                cashQty,
                creditQty
            });
        }
    });

    const displayGrid = [...defaultGridItems, ...customGridItems];

    if (!canView) {
        return (
            <div className="p-4 sm:p-6 space-y-6 dir-rtl max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[400px] text-center" dir="rtl">
                <div className="p-4 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-100 dark:border-rose-900/50 mb-4">
                    <Wifi size={48} />
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">عذراً، ليس لديك صلاحية لعرض قسم كروت الشبكة</h2>
                <p className="text-sm font-bold text-slate-500 max-w-md mt-2">يرجى التواصل مع مسؤول النظام لتعديل صلاحياتك في الإعدادات.</p>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 space-y-5 dir-rtl" dir="rtl">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black">
                        <Wifi size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 dark:text-white">
                            كروت الشبكة
                        </h1>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                            مربوطة مع فئات الكروت. مبيعات الشهر الحالي ({currentMonthStr}) تتصفّر شهرياً، بينما يبقى رصيد الكروت المتوفر مستمراً.
                        </p>
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
                    <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
                    <span className="mr-3 text-sm font-bold text-slate-600 dark:text-slate-400">جاري تحميل كروت الشبكة...</span>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
                    {displayGrid.map((item) => {
                        const isOutOfStock = item.availableCount === 0;
                        const isLowStock = item.availableCount > 0 && item.availableCount < 5;

                        let borderBgClass = "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800";
                        if (isOutOfStock) {
                            borderBgClass = "bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800/80";
                        } else if (isLowStock) {
                            borderBgClass = "bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/80";
                        }

                        return (
                            <div
                                key={item.id}
                                onClick={() => {
                                    if (canAdd) {
                                        setSelectedCategoryForSale(item.name);
                                    }
                                }}
                                className={`relative group flex flex-col justify-between p-3.5 rounded-2xl border-2 transition-all duration-200 ${borderBgClass} space-y-3 text-center ${
                                    canAdd ? 'hover:shadow-lg hover:border-indigo-500 cursor-pointer' : 'opacity-85 cursor-not-allowed'
                                }`}
                            >
                                {/* Low stock top badge indicator */}
                                {isOutOfStock && (
                                    <span className="absolute -top-2.5 right-3 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow flex items-center gap-1 shrink-0 z-10">
                                        <AlertTriangle size={10} /> نفذت الكمية
                                    </span>
                                )}
                                {isLowStock && (
                                    <span className="absolute -top-2.5 right-3 bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow flex items-center gap-1 shrink-0 z-10 animate-pulse">
                                        <AlertTriangle size={10} /> كمية منخفضة (&lt;5)
                                    </span>
                                )}

                                {/* Wi-Fi Icon & Title in Center */}
                                <div className="flex flex-col items-center justify-center pt-1">
                                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black mb-2 transition-transform group-hover:scale-110 border ${
                                        isOutOfStock 
                                            ? 'bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-300 border-red-200 dark:border-red-800'
                                            : isLowStock
                                            ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                            : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/40'
                                    }`}>
                                        <Wifi size={22} />
                                    </div>
                                    <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white leading-tight">
                                        {item.name}
                                    </h3>
                                </div>

                                {/* Stock Badge */}
                                <div className="w-full flex items-center justify-between bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800 whitespace-nowrap gap-1">
                                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 shrink-0">الكمية:</span>
                                    <span className={`text-xs font-black px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1 ${
                                        isOutOfStock
                                            ? 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/60 border border-red-200 dark:border-red-800'
                                            : isLowStock
                                            ? 'text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/60 border border-amber-200 dark:border-amber-800'
                                            : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60'
                                    }`}>
                                        {(isOutOfStock || isLowStock) && <AlertTriangle size={11} />}
                                        {item.availableCount} كارت
                                    </span>
                                </div>

                                {/* Monthly Cash & Credit Sales stats */}
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-right">
                                    <div className="flex items-center justify-between text-[10px] font-bold">
                                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                            <DollarSign size={10} /> نقدي:
                                        </span>
                                        <span className="font-black text-slate-900 dark:text-white">{item.cashQty}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] font-bold">
                                        <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                            <Clock size={10} /> آجل:
                                        </span>
                                        <span className="font-black text-slate-900 dark:text-white">{item.creditQty}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Sale Modal */}
            {selectedCategoryForSale && (
                <CardSaleModal
                    isOpen={!!selectedCategoryForSale}
                    onClose={() => setSelectedCategoryForSale(null)}
                    categoryName={selectedCategoryForSale}
                />
            )}
        </div>
    );
}
