import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Home, Package, ShoppingCart, Users, Truck, DollarSign, FileText, Settings, LogOut, Menu, X, RefreshCw, Sparkles, Database, BrainCircuit, Wrench, Moon, Sun, ClipboardCheck, Gift, FileSignature, ArrowRight, Wifi, WifiOff, Cloud, CloudOff, CreditCard, Layers } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useInvoiceStore } from '../store/invoiceStore';
import { useTheme } from '../context/ThemeContext';
import { useSettingsStore } from '../store/settingsStore';
import ForcePasswordChangeOverlay from './ForcePasswordChangeOverlay';
import ForceStoreSetupOverlay from './ForceStoreSetupOverlay';

import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import NotificationsMenu from './NotificationsMenu';
import { getDaysSinceLastSync } from '../lib/syncTracker';
import { useSyncStore } from '../store/syncStore';

export default function Layout() {
    const { appUser, logout } = useAuthStore();
    const { settings } = useSettingsStore();
    const { mode, style, toggleMode } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(window.navigator.onLine);
    const [daysNoSync, setDaysNoSync] = useState(getDaysSinceLastSync());
    const { isSyncing, syncProgress, triggerSync } = useSyncStore();
    const { isSalesFocusMode } = useInvoiceStore();

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            triggerSync().catch(err => console.warn("Auto sync on reconnection failed:", err));
        };
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        const syncInterval = setInterval(() => {
            setDaysNoSync(getDaysSinceLastSync());
        }, 30000); // Check every 30 seconds

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(syncInterval);
        };
    }, [triggerSync]);

    useEffect(() => {
        if (location.pathname !== '/sales' && isSalesFocusMode) {
            useInvoiceStore.getState().setIsSalesFocusMode(false);
        }
    }, [location.pathname, isSalesFocusMode]);

    const navItems = [
        { path: '/', label: 'الرئيسية', icon: Home, roles: ['admin', 'cashier', 'inventory', 'salesman'] },
        { path: '/sales', label: 'المبيعات', icon: ShoppingCart, roles: ['admin', 'cashier', 'salesman'], onClick: () => useInvoiceStore.getState().setSalesActiveTab('add') },
        { path: '/quotations', label: 'عروض الأسعار', icon: FileSignature, roles: ['admin', 'cashier'], onClick: () => useInvoiceStore.getState().setQuotationsActiveTab('add') },
        { path: '/products', label: 'المنتجات', icon: Package, roles: ['admin', 'inventory', 'cashier'] },
        { path: '/purchases', label: 'المشتريات', icon: Truck, roles: ['admin', 'inventory'], onClick: () => useInvoiceStore.getState().setPurchasesActiveTab('add') },
        { path: '/customers', label: 'العملاء', icon: Users, roles: ['admin', 'cashier', 'salesman'] },
        { path: '/loyalty', label: 'برنامج الولاء', icon: Gift, roles: ['admin', 'cashier'] },
        { path: '/suppliers', label: 'الموردين', icon: Users, roles: ['admin', 'inventory'] },
        { path: '/cash', label: 'الصندوق', icon: DollarSign, roles: ['admin', 'cashier'] },
        { path: '/vouchers', label: 'قبض وصرف', icon: DollarSign, roles: ['admin', 'cashier', 'salesman'] },
        { path: '/expenses', label: 'المصروفات', icon: DollarSign, roles: ['admin', 'cashier'] },
        { path: '/network-cards', label: 'كروت الشبكة', icon: CreditCard, roles: ['admin', 'cashier', 'inventory', 'salesman'] },
        { path: '/cards-management', label: 'إدارة الكروت', icon: Layers, roles: ['admin', 'cashier', 'inventory'] },
        { path: '/reports', label: 'التقارير', icon: FileText, roles: ['admin'] },
        { path: '/ai', label: 'الذكاء الاصطناعي', icon: BrainCircuit, roles: ['admin'] },
        { path: '/logs', label: 'سجل العمليات', icon: FileText, roles: ['admin'] },
        { path: '/settings', label: 'الإعدادات', icon: Settings, roles: ['admin'] },
    ];

    const filteredNav = navItems.filter(item => {
        let hasAccess = appUser && item.roles.includes(appUser.role);
        
        if (appUser && appUser.role !== 'admin') {
            const p = appUser.permissions as any;
            if (p) {
                // If it's the new object structure
                if (item.path === '/sales' && p.sales?.view !== undefined) hasAccess = p.sales.view;
                if (item.path === '/purchases' && p.purchases?.view !== undefined) hasAccess = p.purchases.view;
                if (item.path === '/products' || item.path === '/inventory-audit') {
                    if (p.products?.view !== undefined) hasAccess = p.products.view;
                }
                if (item.path === '/customers' || item.path === '/loyalty') {
                    if (p.customers?.view !== undefined) hasAccess = p.customers.view;
                }
                if (item.path === '/quotations') {
                    if (p.quotations?.view !== undefined) hasAccess = p.quotations.view;
                }
                if (item.path === '/suppliers') {
                    if (p.suppliers?.view !== undefined) hasAccess = p.suppliers.view;
                }
                if (item.path === '/cash') {
                    if (p.cash?.view !== undefined) hasAccess = p.cash.view;
                }
                if (item.path === '/vouchers') {
                    if (p.vouchers?.view !== undefined) hasAccess = p.vouchers.view;
                }
                if (item.path === '/expenses') {
                    if (p.expenses?.view !== undefined) hasAccess = p.expenses.view;
                }
                if (item.path === '/reports' || item.path === '/logs') {
                    if (p.reports?.view !== undefined) hasAccess = p.reports.view;
                }
                if (item.path === '/settings' || item.path === '/tools' || item.path === '/ai') {
                    if (p.settings?.view !== undefined) hasAccess = p.settings.view;
                }
                if (item.path === '/cards-management' || item.path === '/network-cards') {
                    if (p.cards?.view !== undefined) hasAccess = p.cards.view;
                }
            }
        }

        // Check feature toggles
        if (item.path === '/ai' && !settings.isAiEnabled) return false;
        if (item.path === '/tools' && !settings.isAdvancedToolsEnabled) return false;
        if (item.path === '/loyalty' && !settings.isLoyaltyEnabled) return false;
        if (item.path === '/quotations' && !settings.isQuotationsEnabled) return false;

        // إخفاء "القائمة الرئيسية" من القائمة الجانبية فقط إذا كنا في الصفحة الرئيسية (أو دائماً حسب طلبك)
        const isSelectedHome = location.pathname === '/' && item.path === '/';
        return hasAccess && !isSelectedHome;
    });
    
    const hasProductsAccess = filteredNav.some(item => item.path === '/products');
    const [lowStockCount, setLowStockCount] = useState(0);

    useEffect(() => {
        if (!hasProductsAccess) {
            if (lowStockCount > 0) setLowStockCount(0);
            return;
        }

        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
        const q = query(collection(db, 'products'), where('tenantId', '==', tenantId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let count = 0;
            snapshot.forEach((doc) => {
                const data = doc.data();
                const alertLevel = data.lowStockAlert !== undefined && data.lowStockAlert !== null ? data.lowStockAlert : 5;
                if (data.quantity !== undefined && data.quantity <= alertLevel) {
                    count++;
                }
            });
            setLowStockCount(count);
        });

        return () => unsubscribe();
    }, [hasProductsAccess]);
    
    // Find matching route label
    const currentPageItem = [...navItems].sort((a,b) => b.path.length - a.path.length).find(item => 
        (location.pathname === item.path) || 
        (item.path !== '/' && location.pathname.startsWith(item.path + '/')) ||
        (item.path !== '/' && location.pathname === item.path)
    );
    const currentPageLabel = currentPageItem?.label;
    const isHome = location.pathname === '/';
    const headerTitle = isHome ? 'نظام المبيعات المتكامل' : (currentPageLabel || 'نظام المبيعات');

    const handleLogout = async () => {
        await logout();
    };

    return (
        <div dir="rtl" className={`flex flex-col h-[100dvh] bg-[var(--bg-main)] text-[var(--text-main)] font-sans overflow-hidden style-${style}`}>
            <ForcePasswordChangeOverlay />
            <ForceStoreSetupOverlay />
            {!isSalesFocusMode && <div className="h-[5px] bg-white dark:bg-slate-900 shrink-0 w-full z-50"></div>}
            {/* Global Header */}
            {!isSalesFocusMode && (
                <header className="h-16 shrink-0 bg-card-bg shadow-sm border-b border-border-main z-30 flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-white dark:bg-slate-800 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-white transition shadow-sm border border-gray-200 dark:border-blue-800">
                            <Menu size={24} />
                        </button>
                        <div className="flex items-center gap-2 mr-1">
                            <span className="h-6 w-[2px] bg-border-main hidden sm:block"></span>
                            <h1 className="font-black text-lg md:text-xl text-text-main">{headerTitle}</h1>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2 md:gap-3">
                        {/* Sync Status Icon Button */}
                        <button
                            onClick={() => {
                                if (isOnline && !isSyncing) {
                                    triggerSync();
                                }
                            }}
                            disabled={!isOnline || isSyncing}
                            className={`p-2 bg-white dark:bg-slate-800 rounded-xl border shadow-sm transition-all duration-300 relative group flex items-center justify-center cursor-pointer ${
                                !isOnline
                                    ? 'border-red-100 dark:border-red-950/30 text-red-500 dark:text-red-400 bg-red-50/20'
                                    : isSyncing
                                    ? 'border-blue-100 dark:border-blue-950/30 text-blue-500 dark:text-blue-400 bg-blue-50/20'
                                    : 'border-emerald-100 dark:border-emerald-950/30 text-emerald-500 dark:text-emerald-400 hover:scale-105 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                            title={
                                !isOnline
                                    ? 'وضع الأوفلاين (غير متصل بالسحابة)'
                                    : isSyncing
                                    ? `جاري المزامنة... ${syncProgress}%`
                                    : 'متصل بالسحابة • اضغط للمزامنة اليدوية'
                            }
                        >
                            {isSyncing ? (
                                <RefreshCw size={20} className="animate-spin" />
                            ) : !isOnline ? (
                                <CloudOff size={20} className="animate-pulse" />
                            ) : (
                                <Cloud size={20} />
                            )}
                            {/* Dot Indicator */}
                            <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white dark:border-slate-800 ${
                                !isOnline ? 'bg-red-500 animate-pulse' : isSyncing ? 'bg-blue-500 animate-bounce' : 'bg-emerald-500'
                            }`} />
                        </button>

                        <NotificationsMenu />

                        {!isHome && (
                            <button 
                                onClick={() => {
                                    if (typeof (window as any).onHeaderBack === 'function') {
                                        const handled = (window as any).onHeaderBack();
                                        if (handled) return;
                                    }

                                    if (location.pathname === '/sales') useInvoiceStore.getState().setSalesMinimized(true);
                                    if (location.pathname === '/purchases') useInvoiceStore.getState().setPurchasesMinimized(true);
                                    
                                    if (location.pathname.startsWith('/settings/') && location.pathname !== '/settings') {
                                        navigate('/settings');
                                    } else {
                                        navigate('/');
                                    }
                                }}
                                className="p-2 min-w-[40px] px-3 justify-center bg-white dark:bg-slate-800 text-black dark:text-gray-200 dark:text-gray-300 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition font-bold flex items-center gap-2" 
                                title="رجوع / خروج"
                            >
                                <ArrowRight size={20} className="md:hidden" />
                                <span className="hidden sm:inline">رجوع</span>
                            </button>
                        )}
                        <span className="text-sm font-semibold text-black dark:text-gray-300 dark:text-slate-400 hidden md:block bg-white dark:bg-slate-800 dark:bg-slate-800 px-3 py-1.5 rounded-lg border dark:border-slate-700">{appUser?.name}</span>
                    </div>
                </header>
            )}

            {/* Offline Sync Warning Banner */}
            {!isSalesFocusMode && daysNoSync > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2 flex items-center justify-between shrink-0 z-20">
                    <div className="flex items-center gap-2">
                        <RefreshCw className="text-amber-600 animate-spin-slow" size={16} />
                        <span className="text-amber-900 dark:text-amber-100 text-[11px] font-bold">
                            تنبيه: لم يتم المزامنة مع السحابة منذ ({daysNoSync}) {daysNoSync === 1 ? 'يوم' : 'أيام'}. يرجى السعي للارتباط بالإنترنت لحفظ البيانات سحابياً!
                        </span>
                    </div>
                    {isOnline && (
                        <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">جاري المحاولة...</span>
                    )}
                </div>
            )}

            {/* Overlay */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 bg-black/50 z-[290] backdrop-blur-xs" onClick={() => setIsMobileMenuOpen(false)}></div>
            )}

            {/* Sidebar Drawer */}
            <aside className={`
                fixed inset-y-0 right-0 z-[300] w-[260px] bg-card-bg shadow-2xl transform transition-transform duration-300 ease-in-out
                ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}
                flex flex-col h-full border-l border-border-main
            `}>
                <div className="p-3 flex justify-between items-center border-b border-border-main bg-card-bg">
                    <div>
                        <h1 className="font-bold text-base md:text-lg text-text-main">القائمة</h1>
                        <p className="text-xs text-text-main/40 font-bold mt-0.5 uppercase tracking-wide">{appUser?.name} • {appUser?.role}</p>
                    </div>
                    <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 bg-bg-main rounded-lg text-text-main hover:text-red-600 shadow-sm transition border border-border-main">
                        <X size={16} />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto py-1 scrollbar-hide">
                    <ul className="space-y-[3px] px-2">
                        {filteredNav.map((item) => (
                            <li key={item.path}>
                                <Link
                                    to={item.path}
                                    onClick={() => {
                                        setIsMobileMenuOpen(false);
                                        if (item.onClick) item.onClick();
                                    }}
                                    className={`
                                        flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all font-bold text-[15px]
                                        ${location.pathname === item.path 
                                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 translate-x-[-3px]' 
                                            : 'text-text-main hover:bg-white dark:hover:bg-slate-800/40 hover:text-blue-600 dark:hover:text-blue-600'}
                                    `}
                                >
                                    <item.icon size={18} className={location.pathname === item.path ? 'text-white' : 'text-gray-400 dark:text-slate-500'} />
                                    <span className="flex-1 leading-relaxed">{item.label}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="p-2 border-t border-border-main bg-card-bg flex flex-col gap-1">
                    <button
                        onClick={handleLogout}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-white text-red-700 hover:bg-white font-bold rounded-lg transition-all active:scale-95 border border-red-100 group shadow-sm text-xs"
                    >
                        <LogOut size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                        <span>تسجيل الخروج الآمن</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className={`flex-1 flex flex-col min-h-0 overflow-y-auto bg-[var(--bg-main)] w-full relative ${isSalesFocusMode ? 'p-0' : 'p-2 md:p-6'}`}>
                <Outlet />
            </main>
        </div>
    );
}
