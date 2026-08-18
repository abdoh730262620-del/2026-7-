import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { doc, onSnapshot, setDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { useAuthStore, AppUser } from './store/authStore';
import { useSettingsStore } from './store/settingsStore';
import { App as CapacitorApp } from '@capacitor/app';
import { handleFirestoreError, OperationType } from './lib/firebase';
import Layout from './components/Layout';
import { MonthlyCustomerSync } from './components/MonthlyCustomerSync';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Sales from './pages/Sales';
import Users from './pages/Users';
import Employees from './pages/Employees';
import Logs from './pages/Logs';
import PlaceholderPage from './pages/PlaceholderPage';
import SettingsLayout from './pages/SettingsLayout';
import SecuritySettings from './pages/SecuritySettings';
import BackupRestore from './pages/BackupRestore';
import DemoData from './pages/DemoData';
import ExtraFeatures from './pages/settings/ExtraFeatures';
import InvoiceSettings from './pages/settings/InvoiceSettings';
import InventoryAudit from './pages/InventoryAudit';
import Loyalty from './pages/Loyalty';
import Quotations from './pages/Quotations';

import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Cash from './pages/Cash';
import Vouchers from './pages/Vouchers';
import Expenses from './pages/Expenses';
import Purchases from './pages/Purchases';
import Reports from './pages/Reports';
import NetworkCards from './pages/NetworkCards';
import CardsManagement from './pages/CardsManagement';
import NotificationsHistory from './pages/NotificationsHistory';

import AppLock from './components/AppLock';
import FloatingProgressBar from './components/FloatingProgressBar';
import { ErrorNotificationModal } from './components/ErrorNotificationModal';
import { AppStartupModal } from './components/AppStartupModal';
import { CenterToastContainer } from './components/CenterToastContainer';

import AIInsights from './pages/AIInsights';
import Addons from './pages/settings/Addons';
import MobileSettings from './pages/settings/MobileSettings';
import { initPushNotifications } from './lib/pushNotifications';
import { SplashScreen } from './components/SplashScreen';

export default function App() {
  const { appUser, isLoading, setAppUser, setLoading, logout } = useAuthStore();
  const { init: initSettings } = useSettingsStore();
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize Capacitor Mobile Features & Push Notifications
    initPushNotifications().catch(e => console.warn("Push Notifications Init Error:", e));

    try {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        console.log('App state changed. Is active?', isActive);
        if (isActive) {
          // You could resume check for biometrics here if locked
        }
      });
      
      CapacitorApp.addListener('resume', () => {
         console.log('App resumed');
      });

      CapacitorApp.addListener('backButton', () => {
        if (typeof (window as any).triggerAppBackButton === 'function') {
          (window as any).triggerAppBackButton();
        } else if (window.history.length > 1) {
          window.history.back();
        }
      });

      // Only add app state listeners, do not request permissions automatically on startup to prevent FCM configuration crashes
    } catch (e) {
      console.log('Not running in Capacitor/Mobile environment:', e);
    }

    try {
      const sessionStr = localStorage.getItem('app_session');
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          const uid = session.uid;
          
          // Load user from Firestore
          initSettings();
          const timeoutId = setTimeout(() => {
            console.warn('Session restore timed out. Checking local fallback...');
            const lastAppUserStr = localStorage.getItem('last_logged_in_user');
            if (lastAppUserStr) {
              try {
                const cachedUser = JSON.parse(lastAppUserStr);
                if (cachedUser && cachedUser.uid === uid) {
                  console.log('Restored cached user from localStorage due to timeout');
                  useAuthStore.getState().setAppUser(cachedUser);
                  useAuthStore.getState().setLoading(false);
                  return;
                }
              } catch (e) {
                console.warn('Failed to parse cached user on timeout:', e);
              }
            }
            useAuthStore.getState().logout();
            useAuthStore.getState().setLoading(false);
          }, 8000);

          const unsubscribeDoc = onSnapshot(doc(db, 'users', uid), (userDoc) => {
            clearTimeout(timeoutId);
            if (userDoc.exists()) {
              const fullUser = { uid, ...userDoc.data() } as AppUser;
              
              // Automatically ensure existing accounts are migrated to 'single_store' in Firestore
              if (fullUser.tenantId !== 'single_store') {
                setDoc(doc(db, 'users', uid), { tenantId: 'single_store' }, { merge: true })
                  .catch(e => console.warn("Failed to set tenantId: 'single_store' on restore:", e));
                fullUser.tenantId = 'single_store';
              }
              
              useAuthStore.getState().setAppUser(fullUser);
              try {
                localStorage.setItem('last_logged_in_user', JSON.stringify(fullUser));
              } catch (e) {}
              setInitError(null);
            } else {
              // Try to fall back to cached user in local storage before logging out
              const lastAppUserStr = localStorage.getItem('last_logged_in_user');
              if (lastAppUserStr) {
                try {
                  const cachedUser = JSON.parse(lastAppUserStr);
                  if (cachedUser && cachedUser.uid === uid) {
                    useAuthStore.getState().setAppUser(cachedUser);
                    useAuthStore.getState().setLoading(false);
                    return;
                  }
                } catch (e) {}
              }
              useAuthStore.getState().logout();
              setInitError("حسابك غير مسجل في النظام. يرجى مراجعة المدير.");
            }
            useAuthStore.getState().setLoading(false);
          }, (error) => {
            clearTimeout(timeoutId);
            console.error('Session restore error:', error);
            
            // Try to fall back to cached user in local storage
            const lastAppUserStr = localStorage.getItem('last_logged_in_user');
            if (lastAppUserStr) {
              try {
                const cachedUser = JSON.parse(lastAppUserStr);
                if (cachedUser && cachedUser.uid === uid) {
                  console.log('Restored cached user from localStorage due to snapshot error');
                  useAuthStore.getState().setAppUser(cachedUser);
                  useAuthStore.getState().setLoading(false);
                  return;
                }
              } catch (e) {}
            }

            const errCode = (error as any)?.code;
            const errMsg = error instanceof Error ? error.message : String(error);
            if (errCode === 'unavailable' || errMsg.includes('unavailable') || errMsg.includes('Could not reach Cloud Firestore backend')) {
              console.warn('Firestore backend unreachable on restore, falling back to local session user data gracefully');
              const fallbackUser: AppUser = {
                uid,
                email: session.email || "offline@sales.app",
                name: session.name || "مستخدم متصل محلياً",
                role: session.role || "admin",
                isActive: true,
                permissions: {},
                tenantId: 'single_store'
              };
              useAuthStore.getState().setAppUser(fallbackUser);
              useAuthStore.getState().setLoading(false);
              return;
            }

            setInitError("حدث خطأ في الاتصال بقاعدة البيانات.");
            useAuthStore.getState().setLoading(false);
          });
          return () => {
            clearTimeout(timeoutId);
            unsubscribeDoc();
          };
        } catch (e) {
          useAuthStore.getState().logout();
          useAuthStore.getState().setLoading(false);
        }
      } else {
        useAuthStore.getState().setAppUser(null);
        useAuthStore.getState().setLoading(false);
      }
    } catch (e) {
      console.warn('localStorage is not available:', e);
      useAuthStore.getState().setAppUser(null);
      useAuthStore.getState().setLoading(false);
      setInitError("حدث خطأ في الوصول إلى التخزين المحلي.");
    }
  }, []);

  useEffect(() => {
    if (appUser) {
      initSettings();
    }
  }, [appUser, initSettings]);

  useEffect(() => {
    if (appUser) {
      // Background migration to unify all tenant data to 'single_store'
      const migrateTenantIdsToSingleStore = async () => {
        try {
          const migrationDone = localStorage.getItem('tenant_migration_single_store_done_v2');
          if (migrationDone === 'true') return;

          console.log('Starting background Tenant ID migration to single_store...');
          const collectionsToMigrate = [
            'products',
            'categories',
            'sales',
            'purchases',
            'expenses',
            'vouchers',
            'customers',
            'suppliers',
            'cash',
            'quotations',
            'loyalty_logs'
          ];

          for (const collName of collectionsToMigrate) {
            try {
              const snap = await getDocs(collection(db, collName));
              for (const docSnap of snap.docs) {
                const data = docSnap.data();
                if (data && data.tenantId !== 'single_store') {
                  await updateDoc(docSnap.ref, { tenantId: 'single_store' });
                  console.log(`Migrated ${collName} document ${docSnap.id} to single_store`);
                }
              }
            } catch (e) {
              console.warn(`Error migrating collection ${collName}:`, e);
            }
          }

          // Migrate settings document
          try {
            const settingsSnap = await getDocs(collection(db, 'settings'));
            let hasSingleStoreConfig = false;
            let fallbackConfigData: any = null;
            
            for (const docSnap of settingsSnap.docs) {
              if (docSnap.id === 'app_config_single_store') {
                hasSingleStoreConfig = true;
              } else if (docSnap.id.startsWith('app_config_')) {
                fallbackConfigData = docSnap.data();
              }
            }
            
            if (!hasSingleStoreConfig && fallbackConfigData) {
              await setDoc(doc(db, 'settings', 'app_config_single_store'), fallbackConfigData);
              console.log('Migrated settings configuration to app_config_single_store');
            }
          } catch (e) {
            console.warn('Error migrating settings config:', e);
          }

          localStorage.setItem('tenant_migration_single_store_done_v2', 'true');
          console.log('Tenant ID migration to single_store completed successfully.');
        } catch (err) {
          console.error('Failed tenantId migration:', err);
        }
      };
      
      migrateTenantIdsToSingleStore();
    }
  }, [appUser]);

  useEffect(() => {
    // Perform auto backup check on load
    import('./lib/backupGenerator').then(m => m.initAutoBackup());
  }, []); // Run ONCE on mount

  if (isLoading) {
    return (
      <SplashScreen
        statusMessage="جاري تهيئة الذاكرة والتحقق من حساب الجلسة..."
        progress={70}
        error={initError}
        onRetry={() => window.location.reload()}
        onClearStorage={async () => {
          localStorage.clear();
          try {
            const { clearFirestoreCache } = await import('./lib/firebase');
            await clearFirestoreCache();
          } catch (e) {}
          window.location.reload();
        }}
      />
    );
  }

  if (initError) {
    return (
      <SplashScreen
        statusMessage="فشل البدء"
        progress={100}
        error={initError}
        onRetry={() => {
          setInitError(null);
          logout();
        }}
        onClearStorage={async () => {
          localStorage.clear();
          try {
            const { clearFirestoreCache } = await import('./lib/firebase');
            await clearFirestoreCache();
          } catch (e) {}
          window.location.reload();
        }}
      />
    );
  }

  if (!appUser) {
    return <Login />;
  }

  if (!appUser.isActive) {
    return (
        <div className="flex h-screen flex-col items-center justify-center bg-white dark:bg-slate-900 text-black dark:text-gray-100 p-4 text-center" dir="rtl">
            <div className="bg-white p-5 md:p-8 rounded-2xl shadow-xl max-w-md w-full">
                <div className="w-16 h-16 bg-white text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h2 className="text-lg md:text-2xl font-bold text-black dark:text-white mb-4">حسابك قيد المراجعة</h2>
                <p className="text-black dark:text-gray-300 mb-4 md:mb-6">لقد تم تسجيل حسابك بنجاح، ولكن بانتظار تفعيل المسؤول (المدير) لمنحك الصلاحيات اللازمة.</p>
                <button 
                    onClick={() => logout()} 
                    className="w-full bg-blue-600 text-white rounded-xl py-3 font-semibold hover:bg-blue-700 transition"
                >
                    تسجيل الخروج
                </button>
            </div>
        </div>
    );
  }

  return (
    <AppLock>
      <ErrorNotificationModal />
      <FloatingProgressBar />
      <AppStartupModal />
      <CenterToastContainer />
      <HashRouter>
        <MonthlyCustomerSync />
        <Routes>
          <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="products" element={<Products />} />
          <Route path="sales" element={<Sales />} />
          <Route path="quotations" element={<Quotations />} />
          <Route path="inventory-audit" element={<InventoryAudit />} />
          <Route path="loyalty" element={<Loyalty />} />
          <Route path="logs" element={<Logs />} />
          
          <Route path="purchases" element={<Purchases />} />
          <Route path="customers" element={<Customers />} />
          <Route path="employees" element={<Employees />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="cash" element={<Cash />} />
          <Route path="vouchers" element={<Vouchers />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="network-cards" element={<NetworkCards />} />
          <Route path="cards-management" element={<CardsManagement />} />
          <Route path="reports" element={<Reports />} />
          <Route path="ai" element={<AIInsights />} />
          <Route path="notifications-history" element={<NotificationsHistory />} />
          
          <Route path="settings" element={<SettingsLayout />} />
          <Route path="settings/users" element={<Users />} />
          <Route path="settings/addons" element={<Addons />} />
          <Route path="settings/mobile" element={<MobileSettings />} />
          <Route path="settings/security" element={<SecuritySettings />} />
          <Route path="settings/backup" element={<BackupRestore />} />
          <Route path="backup" element={<BackupRestore />} />
          <Route path="settings/features" element={<ExtraFeatures />} />
          <Route path="settings/demo" element={<DemoData />} />
          <Route path="settings/invoice" element={<InvoiceSettings />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </HashRouter>
    </AppLock>
  );
}
