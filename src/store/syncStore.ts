import { create } from 'zustand';
import { updateLastSyncTime } from '../lib/syncTracker';
import { SyncManager } from '../lib/syncManager';
import { useAuthStore } from './authStore';
import { notifySyncComplete } from '../lib/pushNotifications';

interface SyncState {
    isSyncing: boolean;
    syncProgress: number; // 0 to 100
    syncStatus: 'idle' | 'syncing' | 'completed' | 'error';
    syncMessage: string;
    triggerSync: () => Promise<void>;
    resetSync: () => void;
}

export const useSyncStore = create<SyncState>((set, get) => ({
    isSyncing: false,
    syncProgress: 0,
    syncStatus: 'idle',
    syncMessage: '',
    resetSync: () => set({ isSyncing: false, syncProgress: 0, syncStatus: 'idle', syncMessage: '' }),
    triggerSync: async () => {
        if (get().isSyncing) return;

        set({ 
            isSyncing: true, 
            syncProgress: 5, 
            syncStatus: 'syncing', 
            syncMessage: 'جاري فحص الاتصال بالشبكة...' 
        });

        // Step 1: Verify online
        if (!window.navigator.onLine) {
            set({ 
                isSyncing: false, 
                syncStatus: 'error', 
                syncMessage: 'فشلت المزامنة: لا يوجد اتصال بالإنترنت حالياً' 
            });
            return;
        }

        const appUser = useAuthStore.getState().appUser;
        const tenantId = appUser?.tenantId || 'single_store';

        // Professional multi-step progress bar integrated with real SyncManager
        try {
            set({ syncProgress: 20, syncMessage: 'جاري التحقق من الفواتير المحلية غير المرفوعة...' });
            await new Promise(resolve => setTimeout(resolve, 500));

            set({ syncProgress: 45, syncMessage: 'جاري تفعيل الاتصال مع السيرفر السحابي...' });
            await new Promise(resolve => setTimeout(resolve, 500));

            set({ syncProgress: 75, syncMessage: 'جاري تطبيق آلية عدم التكرار وضمان تسلسل البيانات...' });
            
            // Execute the actual SyncManager operations
            const result = await SyncManager.synchronizeData(tenantId);
            
            if (!result.success) {
                set({ 
                    isSyncing: false, 
                    syncStatus: 'error', 
                    syncMessage: result.message 
                });
                return;
            }

            set({ 
                syncProgress: 100, 
                syncStatus: 'completed',
                syncMessage: 'تمت المزامنة بنجاح وحفظ كافة التغييرات بالسحابة!' 
            });

            updateLastSyncTime();
            notifySyncComplete().catch(err => console.warn("Sync completion push notification notice failed:", err));

            // Auto-clear message after 4 seconds
            setTimeout(() => {
                set({ isSyncing: false, syncProgress: 0, syncStatus: 'idle', syncMessage: '' });
            }, 4000);

        } catch (error) {
            console.error("Sync store error:", error);
            set({
                isSyncing: false,
                syncStatus: 'error',
                syncMessage: 'حدث خطأ غير متوقع أثناء المزامنة السحابية.'
            });
        }
    }
}));

