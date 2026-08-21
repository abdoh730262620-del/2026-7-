import { create } from 'zustand';

interface UIState {
    activeModals: string[];
    registerModal: (id: string) => void;
    unregisterModal: (id: string) => void;
    hasActiveModal: () => boolean;
    showDashboardSearch: boolean;
    setShowDashboardSearch: (val: boolean) => void;
    dashboardLastUpdated: number | null;
    setDashboardLastUpdated: (val: number | null) => void;
    isDashboardRefreshing: boolean;
    setIsDashboardRefreshing: (val: boolean) => void;
    dashboardRefreshSignal: number;
    triggerDashboardRefresh: () => void;
}

export const useUIStore = create<UIState>((set, get) => ({
    activeModals: [],
    registerModal: (id) => set((state) => ({ 
        activeModals: state.activeModals.includes(id) ? state.activeModals : [...state.activeModals, id] 
    })),
    unregisterModal: (id) => set((state) => ({ 
        activeModals: state.activeModals.filter(m => m !== id) 
    })),
    hasActiveModal: () => get().activeModals.length > 0,
    showDashboardSearch: false,
    setShowDashboardSearch: (val) => set({ showDashboardSearch: val }),
    dashboardLastUpdated: null,
    setDashboardLastUpdated: (val) => set({ dashboardLastUpdated: val }),
    isDashboardRefreshing: false,
    setIsDashboardRefreshing: (val) => set({ isDashboardRefreshing: val }),
    dashboardRefreshSignal: 0,
    triggerDashboardRefresh: () => set((state) => ({ dashboardRefreshSignal: state.dashboardRefreshSignal + 1 })),
}));
