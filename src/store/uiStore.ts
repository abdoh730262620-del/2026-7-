import { create } from 'zustand';

interface UIState {
    activeModals: string[];
    registerModal: (id: string) => void;
    unregisterModal: (id: string) => void;
    hasActiveModal: () => boolean;
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
}));
