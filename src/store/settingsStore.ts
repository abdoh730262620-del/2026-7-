import { create } from 'zustand';
import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from './authStore';

interface AppSettings {
  isAiEnabled: boolean;
  isAdvancedToolsEnabled: boolean;
  isOverdueAlertEnabled: boolean;
  overdueDaysThreshold: number;
  cashMinimumAlertThreshold?: number;
  isLoyaltyEnabled: boolean;
  loyaltyPointsPerAmount: number; // e.g. 1 point for every 10 USD
  includeCreditInLoyalty: boolean;
  isVatEnabled: boolean;
  vatPercentage: number;
  isExpiryTrackingEnabled: boolean;
  expiryAlertMonths: number;
  isMultiCurrencyEnabled: boolean;
  exchangeRate: number; // e.g. USD to Local
  currencySymbol: string;
  baseCurrency?: string;
  additionalCurrencies?: { code: string; name: string; rate: number; symbol: string; updatedAt?: number }[];
  isCommissionEnabled: boolean;
  defaultCommissionPercent: number;
  isWhatsAppEnabled: boolean;
  isQuotationsEnabled: boolean;
  allowNegativeStock?: boolean;
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessLogoUrl: string;
  isStoreConfigured?: boolean;
  printerPaperSize: 'A4' | 'Thermal80' | 'Thermal58';
  headerTextAlignment: 'center' | 'left' | 'right';
  cashIncludeSales?: boolean;
  cashIncludePurchases?: boolean;
  cashIncludeExpenses?: boolean;
  yemeniExchangeRate?: number;
}

interface SettingsState {
  settings: AppSettings;
  loading: boolean;
  initialized: boolean;
  init: () => void;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

const defaultSettings: AppSettings = {
  isAiEnabled: true,
  isAdvancedToolsEnabled: true,
  isOverdueAlertEnabled: true,
  overdueDaysThreshold: 30,
  cashMinimumAlertThreshold: 1000,
  isLoyaltyEnabled: false,
  loyaltyPointsPerAmount: 10,
  includeCreditInLoyalty: false,
  isVatEnabled: false,
  vatPercentage: 15,
  isExpiryTrackingEnabled: false,
  expiryAlertMonths: 3,
  isMultiCurrencyEnabled: false,
  exchangeRate: 1,
  currencySymbol: 'ر.س',
  baseCurrency: 'SAR',
  additionalCurrencies: [
    { code: 'USD', name: 'دولار أمريكي', rate: 3.75, symbol: '$' },
    { code: 'EUR', name: 'يورو', rate: 4.05, symbol: '€' },
    { code: 'YMR', name: 'ريال يمني', rate: 0.015, symbol: 'ر.ي' }
  ],
  isCommissionEnabled: false,
  defaultCommissionPercent: 5,
  isWhatsAppEnabled: true,
  isQuotationsEnabled: true,
  allowNegativeStock: false,
  businessName: '',
  businessAddress: '',
  businessPhone: '',
  businessLogoUrl: '',
  isStoreConfigured: false,
  printerPaperSize: 'A4',
  headerTextAlignment: 'center',
  cashIncludeSales: true,
  cashIncludePurchases: true,
  cashIncludeExpenses: true,
  yemeniExchangeRate: 140
};

export const useSettingsStore = create<SettingsState>((set, get) => {
  // Load initially from localStorage as immediate fallback
  let initialSettings = defaultSettings;
  try {
     const cached = localStorage.getItem('app_config_settings');
     if (cached) {
         initialSettings = { ...defaultSettings, ...JSON.parse(cached) };
     }
  } catch (e) {
     console.warn('Failed to load settings from localStorage on startup', e);
  }

  return {
    settings: initialSettings,
    loading: true,
    initialized: false,
    init: () => {
      const appUser = useAuthStore.getState().appUser;
      if (!appUser) return;
      
      const tenantId = appUser.tenantId || 'single_store';
      
      // Prevent double init if already initialized for this tenant
      if (get().initialized && (get() as any).currentTenantId === tenantId) return;
      
      // Cleanup previous watcher if any
      if ((get() as any).unsubSettings) {
        (get() as any).unsubSettings();
      }

      const docRef = doc(db, 'settings', `app_config_${tenantId}`);
      const unsub = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const rawData = docSnap.data() as AppSettings;
          const isConfigured = Boolean(rawData.isStoreConfigured || (rawData.businessName && rawData.businessName !== 'محل بريق للمبيعات'));
          const loadedSettings = { ...defaultSettings, ...rawData, isStoreConfigured: isConfigured } as AppSettings;
          try {
             localStorage.setItem('app_config_settings', JSON.stringify(loadedSettings));
          } catch (e) {}
          set({ settings: loadedSettings, loading: false, initialized: true, currentTenantId: tenantId } as any);
        } else {
          // Create default settings if they don't exist
          setDoc(docRef, defaultSettings).catch(() => {});
          set({ settings: defaultSettings, loading: false, initialized: true, currentTenantId: tenantId } as any);
        }
      }, (error) => {
        if (error.code === 'permission-denied') {
            console.warn("Settings access denied (likely not logged in yet)");
            return;
        }
        handleFirestoreError(error, OperationType.GET, `settings/app_config_${tenantId}`);
      });
      
      set({ unsubSettings: unsub } as any);
      return unsub;
    },
    updateSettings: async (newSettings) => {
      const appUser = useAuthStore.getState().appUser;
      if (!appUser) return;
      const tenantId = appUser.tenantId || 'single_store';

      const docRef = doc(db, 'settings', `app_config_${tenantId}`);
      
      // Merge local state immediately for snappy UX/offline
      const mergedSettings = { ...get().settings, ...newSettings };
      set({ settings: mergedSettings });
      
      try {
         localStorage.setItem('app_config_settings', JSON.stringify(mergedSettings));
      } catch (e) {}

      try {
          // Sanitize the patch object to remove undefined values for Firestore compatibility
          const cleanSettings: any = {};
          for (const [key, value] of Object.entries(newSettings)) {
              if (value !== undefined) {
                  cleanSettings[key] = value;
              }
          }

          await setDoc(docRef, {
              ...cleanSettings,
              updatedAt: Date.now()
          }, { merge: true });
      } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `settings/app_config_${tenantId}`);
          throw error; // Throw error to trigger UI catch blocks!
      }
    },
  };
});
