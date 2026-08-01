import React, { useState, useEffect } from 'react';
import { Bell, AlertTriangle, CheckCircle2, X, Wifi, ShieldAlert } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';

interface LowStockItem {
  id: string;
  name: string;
  count: number;
}

export function AppStartupModal() {
  const { appUser } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);

  useEffect(() => {
    if (!appUser) return;

    // Check session storage to show once per app launch/session open
    try {
      const hasShown = sessionStorage.getItem('app_startup_notice_shown');
      if (hasShown === 'true') {
        return;
      }
    } catch (e) {
      console.warn('sessionStorage not accessible in AppStartupModal:', e);
    }

    const checkLowStock = async () => {
      try {
        const qCat = query(
          collection(db, 'card_categories'),
          where('tenantId', '==', 'single_store')
        );
        const snapshot = await getDocs(qCat);
        const lowItems: LowStockItem[] = [];
        
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const count = Number(data.availableCount || 0);
          if (count < 5) {
            lowItems.push({
              id: doc.id,
              name: data.name || 'فئة غير مسمّاة',
              count
            });
          }
        });

        setLowStockItems(lowItems);
      } catch (err) {
        console.error('Error fetching low stock categories for startup modal:', err);
      } finally {
        setLoading(false);
        setIsOpen(true);
        try {
          sessionStorage.setItem('app_startup_notice_shown', 'true');
        } catch (e) {}
      }
    };

    checkLowStock();
  }, [appUser]);

  if (!isOpen || !appUser) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fadeIn" dir="rtl">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden transition-all transform scale-100">
        
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white text-center">
          <button 
            onClick={() => setIsOpen(false)}
            className="absolute top-4 left-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            <X size={18} />
          </button>
          
          <div className="w-14 h-14 bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-3 border border-white/20 shadow-inner">
            {lowStockItems.length > 0 ? (
              <ShieldAlert size={32} className="text-amber-300 animate-pulse" />
            ) : (
              <Bell size={30} className="text-blue-100" />
            )}
          </div>
          <h2 className="text-lg font-black leading-tight">إشعار فتح التطبيق</h2>
          <p className="text-xs font-medium text-blue-100 mt-1">مرحباً بك {appUser.name || ''} 👋</p>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed text-right font-bold">
            تم تشغيل التطبيق بنجاح. فيما يلي موجز حالة المخزون وكروت الشبكة المتاحة:
          </div>

          {/* Low stock alert section */}
          {loading ? (
            <div className="py-4 text-center text-xs text-slate-500 font-bold">
              جاري فحص حالة كروت الشبكة...
            </div>
          ) : lowStockItems.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-black text-amber-600 dark:text-amber-400">
                <AlertTriangle size={15} />
                <span>تنبيه كروت شبكة منخفضة (&lt; 5 بطاقات):</span>
              </div>
              <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
                {lowStockItems.map((item) => (
                  <div 
                    key={item.id}
                    className="flex items-center justify-between p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <Wifi size={14} className="text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.name}</span>
                    </div>
                    <span className="text-xs font-black bg-amber-200 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 px-2 py-0.5 rounded-md">
                      {item.count === 0 ? 'نفذت الكمية' : `متبقي ${item.count} كارت`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl text-emerald-700 dark:text-emerald-300 text-xs font-bold">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <span>جميع فئات كروت الشبكة متوفرة بكميات كافية (5 بطاقات فأكثر).</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={() => setIsOpen(false)}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm rounded-xl shadow-md transition-all active:scale-95"
          >
            متابعة العمل
          </button>
        </div>

      </div>
    </div>
  );
}
