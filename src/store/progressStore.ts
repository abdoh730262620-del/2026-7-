import { create } from 'zustand';

interface ProgressState {
    show: boolean;
    isMinimized: boolean;
    label: string;
    processed: number;
    total: number;
    start: (total: number, label: string) => void;
    update: (processed: number) => void;
    finish: () => void;
    toggleMinimize: () => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
    show: false,
    isMinimized: false,
    label: '',
    processed: 0,
    total: 0,
    start: (total, label) => set({ show: true, isMinimized: false, processed: 0, total, label }),
    update: (processed) => set({ processed }),
    finish: () => set({ show: false, processed: 0, total: 0 }),
    toggleMinimize: () => set((state) => ({ isMinimized: !state.isMinimized }))
}));
