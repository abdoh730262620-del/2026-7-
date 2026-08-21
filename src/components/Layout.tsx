import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Home, Package, ShoppingCart, Users, Truck, DollarSign, FileText, Settings, LogOut, Menu, X, RefreshCw, Sparkles, Database, BrainCircuit, Wrench, Moon, Sun, ClipboardCheck, Gift, FileSignature, ArrowRight, Wifi, WifiOff, Cloud, CloudOff, CreditCard, Layers, Briefcase, Search } from 'lucide-react';
import { useInvoiceStore } from '../store/invoiceStore';
import { useTheme } from '../context/ThemeContext';
import { useSettingsStore } from '../store/settingsStore';
import ForcePasswordChangeOverlay from './ForcePasswordChangeOverlay';
import ForceStoreSetupOverlay from './ForceStoreSetupOverlay';
import { useUIStore } from '../store/uiStore';
import { AppExitConfirmModal } from './AppExitConfirmModal';

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
    const [isExitModalOpen, setIsExitModalOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(window.navigator.onLine);
    const [daysNoSync, setDaysNoSync] = useState(getDaysSinceLastSync());
    const { isSyncing, syncProgress, triggerSync } = useSyncStore();
    const { isSalesFocusMode } = useInvoiceStore();
    const showDashboardSearch = useUIStore((s) => s.showDashboardSearch);
    const setShowDashboardSearch = useUIStore((s) => s.setShowDashboardSearch);
    const dashboardLastUpdated = useUIStore((s) => s.dashboardLastUpdated);
    const isDashboardRefreshing = useUIStore((s) => s.isDashboardRefreshing);
    const triggerDashboardRefresh = useUIStore((s) => s.triggerDashboardRefresh);

    // Unified Back Action: handles hardware back button, browser back, and header back button
    const handleUnifiedBack = useCallback(() => {
        // 1. If Exit Modal is open -> close it
        if (isExitModalOpen) {
            setIsExitModalOpen(false);
            return true;
        }

        // 2. If mobile drawer menu is open -> close it
        if (isMobileMenuOpen) {
            setIsMobileMenuOpen(false);
            return true;
        }

        // 3. If any sub-modal or sub-view registered an onHeaderBack hook (e.g. employee details, customer account statement, card batch)
        if (typeof (window as any).onHeaderBack === 'function') {
            try {
                const handled = (window as any).onHeaderBack();
                if (handled !== false) {
                    return true;
                }
            } catch (err) {
                console.warn('Error in onHeaderBack handler:', err);
            }
        }

        // 4. If on a sub-route (not on home page '/')
        if (location.pathname !== '/') {
            if (location.pathname === '/sales') useInvoiceStore.getState().setSalesMinimized(true);
            if (location.pathname === '/purchases') useInvoiceStore.getState().setPurchasesMinimized(true);
            
            if (location.pathname.startsWith('/settings/') && location.pathname !== '/settings') {
                navigate('/settings');
            } else {
                navigate('/');
            }
            return true;
        }

        // 5. If we are on the Main Home Screen ('/'), show the Exit Confirmation Modal!
        setIsExitModalOpen(true);
        return true;
    }, [isExitModalOpen, isMobileMenuOpen, location.pathname, navigate]);

    // Register unified back handler globally so hardware back button & window events trigger it
    useEffect(() => {
        (window as any).triggerAppBackButton = handleUnifiedBack;
        return () => {
            if ((window as any).triggerAppBackButton === handleUnifiedBack) {
                (window as any).triggerAppBackButton = null;
            }
        };
    }, [handleUnifiedBack]);

    // Handle browser popstate / back button on mobile web
    useEffect(() => {
        const handlePopState = () => {
            handleUnifiedBack();
        };
        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [handleUnifiedBack]);

    const handleConfirmAppExit = async () => {
        setIsExitModalOpen(false);
        try {
            const { App: CapacitorApp } = await import('@capacitor/app');
            if (CapacitorApp && typeof CapacitorApp.exitApp === 'function') {
                await CapacitorApp.exitApp();
                return;
            }
        } catch (e) {
            console.log('Capacitor exitApp not available:', e);
        }

        try {
            window.close();
        } catch (e) {}

        // In web browsers where window.close() is prevented:
        window.location.replace('about:blank');
    };

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
        { path: '/', label: 'الرئيسية', icon: Home, roles: ['admin', 'cashier', 'inventory', 'salesman', 'network_worker'] },
        { path: '/sales', label: 'المبيعات', icon: ShoppingCart, roles: ['admin', 'cashier', 'salesman'], onClick: () => useInvoiceStore.getState().setSalesActiveTab('add') },
        { path: '/quotations', label: 'عروض الأسعار', icon: FileSignature, roles: ['admin', 'cashier'], onClick: () => useInvoiceStore.getState().setQuotationsActiveTab('add') },
        { path: '/products', label: 'المنتجات', icon: Package, roles: ['admin', 'inventory', 'cashier'] },
        { path: '/purchases', label: 'المشتريات', icon: Truck, roles: ['admin', 'inventory'], onClick: () => useInvoiceStore.getState().setPurchasesActiveTab('add') },
        { path: '/customers', label: 'العملاء', icon: Users, roles: ['admin', 'cashier', 'salesman'] },
        { path: '/employees', label: 'الموظفين', icon: Briefcase, roles: ['admin', 'cashier', 'inventory', 'salesman', 'network_worker'] },
        { path: '/loyalty', label: 'برنامج الولاء', icon: Gift, roles: ['admin', 'cashier'] },
        { path: '/suppliers', label: 'الموردين', icon: Users, roles: ['admin', 'inventory'] },
        { path: '/cash', label: 'الصندوق', icon: DollarSign, roles: ['admin', 'cashier'] },
        { path: '/vouchers', label: 'قبض وصرف', icon: DollarSign, roles: ['admin', 'cashier', 'salesman', 'network_worker'] },
        { path: '/expenses', label: 'المصروفات', icon: DollarSign, roles: ['admin', 'cashier'] },
        { path: '/network-cards', label: 'كروت الشبكة', icon: CreditCard, roles: ['admin', 'cashier', 'inventory', 'salesman', 'network_worker'] },
        { path: '/cards-management', label: 'إدارة الكروت', icon: Layers, roles: ['admin', 'cashier', 'inventory', 'network_worker'] },
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
                if (item.path === '/employees') {
                    if (p.employees?.view !== undefined) {
                        hasAccess = p.employees.view;
                    } else {
                        hasAccess = true;
                    }
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

        const tenantId = appUser?.tenantId || 'single_store';
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
    const headerTitle = isHome ? 'السعيدة' : (currentPageLabel || 'السعيدة');

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
                        {/* Dashboard Refresh & Last Updated Icon Button */}
                        {isHome && (
                            <button
                                onClick={() => triggerDashboardRefresh()}
                                disabled={isDashboardRefreshing}
                                className={`p-2 rounded-xl border shadow-sm transition-all duration-300 relative group flex items-center justify-center cursor-pointer ${
                                    isDashboardRefreshing
                                        ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400'
                                        : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:scale-105 hover:bg-indigo-50/50'
                                }`}
                                title={`آخر تحديث للوحة التحكم: ${dashboardLastUpdated ? new Date(dashboardLastUpdated).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'مؤخراً'} • اضغط للتحديث الفوري`}
                            >
                                <RefreshCw size={20} className={isDashboardRefreshing ? 'animate-spin' : ''} />
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-500" />
                            </button>
                        )}

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
                                    : daysNoSync > 0
                                    ? 'border-amber-100 dark:border-amber-950/30 text-amber-500 dark:text-amber-400 bg-amber-50/20 animate-pulse'
                                    : 'border-emerald-100 dark:border-emerald-950/30 text-emerald-500 dark:text-emerald-400 hover:scale-105 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                            }`}
                            title={
                                !isOnline
                                    ? 'وضع الأوفلاين (غير متصل بالسحابة)'
                                    : isSyncing
                                    ? `جاري المزامنة... ${syncProgress}%`
                                    : daysNoSync > 0
                                    ? `تنبيه: لم يتم المزامنة منذ ${daysNoSync} يوم • اضغط للمزامنة`
                                    : 'متصل بالسحابة • اضغط للمزامنة اليدوية'
                            }
                        >
                            {isSyncing ? (
                                <RefreshCw size={20} className="animate-spin" />
                            ) : !isOnline ? (
                                <CloudOff size={20} className="animate-pulse" />
                            ) : (
                                <Cloud size={20} className={daysNoSync > 0 ? 'text-amber-500' : ''} />
                            )}
                            {/* Dot Indicator */}
                            <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border border-white dark:border-slate-800 ${
                                !isOnline ? 'bg-red-500 animate-pulse' : isSyncing ? 'bg-blue-500 animate-bounce' : daysNoSync > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`} />
                            
                            {/* Days Badge */}
                            {daysNoSync > 0 && !isSyncing && isOnline && (
                                <span className="absolute -bottom-1 -left-1 bg-amber-600 text-white text-[8px] font-black px-1 rounded-full border border-white dark:border-slate-800">
                                    {daysNoSync}d
                                </span>
                            )}
                        </button>

                        {isHome && (
                            <button
                                onClick={() => {
                                    setShowDashboardSearch(!showDashboardSearch);
                                }}
                                className={`p-2 rounded-xl border shadow-sm transition-all duration-300 relative group flex items-center justify-center cursor-pointer ${
                                    showDashboardSearch
                                        ? 'border-purple-200 dark:border-purple-950/30 text-purple-600 dark:text-purple-400 bg-purple-50/20'
                                        : 'bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:scale-105'
                                }`}
                                title="البحث الذكي"
                            >
                                <Search size={20} />
                            </button>
                        )}

                        <NotificationsMenu />

                        {!isHome && (
                            <button 
                                onClick={handleUnifiedBack}
                                className="p-2 min-w-[40px] px-3 justify-center bg-white dark:bg-slate-800 text-black dark:text-gray-200 dark:text-gray-300 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition font-bold flex items-center gap-2 cursor-pointer" 
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

            {/* Exit Confirmation Modal for Phone Back Button & Main Screen Exit */}
            <AppExitConfirmModal
                isOpen={isExitModalOpen}
                onClose={() => setIsExitModalOpen(false)}
                onConfirmExit={handleConfirmAppExit}
            />
        </div>
    );
}
