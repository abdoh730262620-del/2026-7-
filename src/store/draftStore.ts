import { create } from 'zustand';

interface DraftState {
    salesMode: 'list' | 'new';
    salesCart: any[];
    salesSearch: string;
    salesDiscountPercent: number;
    salesCustomerId: string;
    
    purchasesMode: 'list' | 'new';
    purchasesCart: any[];
    purchasesSearch: string;
    purchasesSupplierId: string;
    
    setSalesMode: (m: 'list' | 'new') => void;
    setSalesCart: (cart: any[]) => void;
    setSalesSearch: (s: string) => void;
    setSalesDiscountPercent: (d: number) => void;
    setSalesCustomerId: (c: string) => void;
    clearSalesDraft: () => void;
    
    setPurchasesMode: (m: 'list' | 'new') => void;
    setPurchasesCart: (cart: any[]) => void;
    setPurchasesSearch: (s: string) => void;
    setPurchasesSupplierId: (c: string) => void;
    clearPurchasesDraft: () => void;
}

export const useDraftStore = create<DraftState>((set) => ({
    salesMode: 'list',
    salesCart: [],
    salesSearch: '',
    salesDiscountPercent: 0,
    salesCustomerId: '',
    
    purchasesMode: 'list',
    purchasesCart: [],
    purchasesSearch: '',
    purchasesSupplierId: '',
    
    setSalesMode: (m) => set({ salesMode: m }),
    setSalesCart: (cart) => set({ salesCart: cart }),
    setSalesSearch: (s) => set({ salesSearch: s }),
    setSalesDiscountPercent: (d) => set({ salesDiscountPercent: d }),
    setSalesCustomerId: (c) => set({ salesCustomerId: c }),
    clearSalesDraft: () => set({ salesCart: [], salesSearch: '', salesDiscountPercent: 0, salesCustomerId: '' }),
    
    setPurchasesMode: (m) => set({ purchasesMode: m }),
    setPurchasesCart: (cart) => set({ purchasesCart: cart }),
    setPurchasesSearch: (s) => set({ purchasesSearch: s }),
    setPurchasesSupplierId: (c) => set({ purchasesSupplierId: c }),
    clearPurchasesDraft: () => set({ purchasesCart: [], purchasesSearch: '', purchasesSupplierId: '' }),
}));
