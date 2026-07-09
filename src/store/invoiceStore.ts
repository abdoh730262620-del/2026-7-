import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
    id: string;
    name: string;
    barcode: string;
    price: number;
    cost?: number;
    buyPrice?: number;
    cartQuantity: number;
    quantity?: number;
}

interface InvoiceState {
    salesCart: CartItem[];
    salesCustomerId: string;
    salesCustomerName: string;
    salesPaymentMethod: 'cash' | 'credit';
    salesDiscountPercent: number;
    salesSearch: string;
    salesActiveTab: 'list' | 'add';
    salesMinimized: boolean;
    salesEditingInvoice: any | null;
    setSalesCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
    setSalesCustomerId: (id: string) => void;
    setSalesCustomerName: (name: string) => void;
    setSalesPaymentMethod: (method: 'cash' | 'credit') => void;
    setSalesDiscountPercent: (pct: number) => void;
    setSalesSearch: (str: string) => void;
    setSalesActiveTab: (tab: 'list' | 'add') => void;
    setSalesMinimized: (val: boolean) => void;
    setSalesEditingInvoice: (inv: any | null) => void;
    clearSales: () => void;

    purchasesCart: CartItem[];
    purchasesSupplierId: string;
    purchasesSupplierName: string;
    purchasesPaymentMethod: 'cash' | 'credit';
    purchasesInvoiceNumber: string;
    purchasesDiscountPercent: number;
    purchasesSearch: string;
    purchasesActiveTab: 'list' | 'add';
    purchasesMinimized: boolean;
    purchasesEditingInvoice: any | null;
    setPurchasesCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
    setPurchasesSupplierId: (id: string) => void;
    setPurchasesSupplierName: (name: string) => void;
    setPurchasesPaymentMethod: (method: 'cash' | 'credit') => void;
    setPurchasesInvoiceNumber: (num: string) => void;
    setPurchasesDiscountPercent: (pct: number) => void;
    setPurchasesSearch: (str: string) => void;
    setPurchasesActiveTab: (tab: 'list' | 'add') => void;
    setPurchasesMinimized: (val: boolean) => void;
    setPurchasesEditingInvoice: (inv: any | null) => void;
    clearPurchases: () => void;

    quotationsCart: CartItem[];
    quotationsCustomerName: string;
    quotationsDiscountPercent: number;
    quotationsSearch: string;
    quotationsActiveTab: 'list' | 'add';
    setQuotationsCart: (cart: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
    setQuotationsCustomerName: (name: string) => void;
    setQuotationsDiscountPercent: (pct: number) => void;
    setQuotationsSearch: (str: string) => void;
    setQuotationsActiveTab: (tab: 'list' | 'add') => void;
    clearQuotations: () => void;
}

export const useInvoiceStore = create<InvoiceState>()(
    persist(
        (set) => ({
            salesCart: [],
            salesCustomerId: '',
            salesCustomerName: '',
            salesPaymentMethod: 'cash',
            salesDiscountPercent: 0,
            salesSearch: '',
            salesActiveTab: 'list',
            salesMinimized: false,
            salesEditingInvoice: null,
            setSalesCart: (cartOrUpdater) => set((state) => ({
                salesCart: typeof cartOrUpdater === 'function' ? cartOrUpdater(state.salesCart) : cartOrUpdater
            })),
            setSalesCustomerId: (id) => set({ salesCustomerId: id }),
            setSalesCustomerName: (name) => set({ salesCustomerName: name }),
            setSalesPaymentMethod: (method) => set({ salesPaymentMethod: method }),
            setSalesDiscountPercent: (pct) => set({ salesDiscountPercent: pct }),
            setSalesSearch: (str) => set({ salesSearch: str }),
            setSalesActiveTab: (tab) => set({ salesActiveTab: tab }),
            setSalesMinimized: (val) => set({ salesMinimized: val }),
            setSalesEditingInvoice: (inv) => set({ salesEditingInvoice: inv }),
            clearSales: () => set({ salesCart: [], salesCustomerId: '', salesCustomerName: '', salesPaymentMethod: 'cash', salesDiscountPercent: 0, salesSearch: '', salesMinimized: false, salesEditingInvoice: null }),

            purchasesCart: [],
            purchasesSupplierId: '',
            purchasesSupplierName: '',
            purchasesPaymentMethod: 'cash',
            purchasesInvoiceNumber: '',
            purchasesDiscountPercent: 0,
            purchasesSearch: '',
            purchasesActiveTab: 'list',
            purchasesMinimized: false,
            purchasesEditingInvoice: null,
            setPurchasesCart: (cartOrUpdater) => set((state) => ({
                purchasesCart: typeof cartOrUpdater === 'function' ? cartOrUpdater(state.purchasesCart) : cartOrUpdater
            })),
            setPurchasesSupplierId: (id) => set({ purchasesSupplierId: id }),
            setPurchasesSupplierName: (name) => set({ purchasesSupplierName: name }),
            setPurchasesPaymentMethod: (method) => set({ purchasesPaymentMethod: method }),
            setPurchasesInvoiceNumber: (num) => set({ purchasesInvoiceNumber: num }),
            setPurchasesDiscountPercent: (pct) => set({ purchasesDiscountPercent: pct }),
            setPurchasesSearch: (str) => set({ purchasesSearch: str }),
            setPurchasesActiveTab: (tab) => set({ purchasesActiveTab: tab }),
            setPurchasesMinimized: (val) => set({ purchasesMinimized: val }),
            setPurchasesEditingInvoice: (inv) => set({ purchasesEditingInvoice: inv }),
            clearPurchases: () => set({ purchasesCart: [], purchasesSupplierId: '', purchasesPaymentMethod: 'cash', purchasesInvoiceNumber: '', purchasesDiscountPercent: 0, purchasesSearch: '', purchasesMinimized: false, purchasesEditingInvoice: null }),

            quotationsCart: [],
            quotationsCustomerName: '',
            quotationsDiscountPercent: 0,
            quotationsSearch: '',
            quotationsActiveTab: 'list',
            setQuotationsCart: (cartOrUpdater) => set((state) => ({
                quotationsCart: typeof cartOrUpdater === 'function' ? cartOrUpdater(state.quotationsCart) : cartOrUpdater
            })),
            setQuotationsCustomerName: (name) => set({ quotationsCustomerName: name }),
            setQuotationsDiscountPercent: (pct) => set({ quotationsDiscountPercent: pct }),
            setQuotationsSearch: (str) => set({ quotationsSearch: str }),
            setQuotationsActiveTab: (tab) => set({ quotationsActiveTab: tab }),
            clearQuotations: () => set({ quotationsCart: [], quotationsCustomerName: '', quotationsDiscountPercent: 0, quotationsSearch: '' }),
        }),
        {
            name: 'invoice-storage',
        }
    )
);

