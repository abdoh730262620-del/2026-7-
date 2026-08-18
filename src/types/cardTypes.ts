export interface CardCategory {
    id: string;
    tenantId: string;
    name: string;
    wholesalePrice: number;
    retailPrice: number;
    availableCount: number;
    linkedSection?: string; // القسم المرتبط في كروت الشبكة
}

export interface CardDistributor {
    id: string;
    tenantId: string;
    name: string;
    phone: string;
    commission: number;
    balance: number; // Positive = credit debt owed by distributor
    previousDebt?: number; // الدين السابق عند تسجيل الموزع
    date: string;
}

export interface CardStockLog {
    id: string;
    tenantId: string;
    categoryId: string;
    categoryName: string;
    quantityAdded: number;
    userName: string;
    additionDate: string;
    availableCountAfter: number;
    notes?: string;
}

export interface CardSale {
    id: string;
    tenantId: string;
    categoryId?: string;
    categoryName: string;
    quantity: number;
    saleType: 'wholesale' | 'retail' | 'distributor'; // جملة | تجزئة | موزع
    paymentType: 'cash' | 'credit'; // نقدي | أجل
    distributorId?: string;
    distributorName?: string;
    unitPrice: number;
    commissionPercent: number;
    commissionAmount: number;
    totalAmount: number;
    netTotal: number;
    month: string; // e.g. "2026-07"
    date: string; // e.g. "2026-07-29"
    dateTime: string;
    userName: string;
    invoiceNumber?: string;
    status?: 'draft' | 'completed' | 'cancelled';
    cancelledBy?: string;
    cancelledAt?: number;
}

export interface CardVoucher {
    id: string;
    tenantId: string;
    type: 'receipt' | 'payment'; // قبض (من الموزع) | صرف (للموزع)
    voucherNumber: string;
    distributorId: string;
    distributorName: string;
    amount: number;
    notes: string;
    date: string;
    dateTime: string;
    userName: string;
}

export interface CardCashboxEntry {
    id: string;
    tenantId: string;
    type: 'cash_sale' | 'distributor_payment' | 'distributor_sale_cash' | 'distributor_return_cash' | 'supplier_payment' | 'supplier_purchase_cash' | 'supplier_return_cash' | 'manual_in' | 'manual_out' | string;
    title: string;
    amount: number;
    isIncome: boolean;
    referenceId?: string;
    date: string;
    dateTime: string;
    userName: string;
}

export interface CardSupplier {
    id: string;
    tenantId: string;
    name: string;
    phone: string;
    balance: number; // Positive = we owe them money (debt)
    previousDebt?: number; // الدين السابق عند تسجيل المورد
    date: string;
}

export interface CardPurchase {
    id: string;
    tenantId: string;
    categoryName: string;
    categoryId: string;
    quantity: number;
    purchaseType: 'supplier' | 'supplier_return' | string;
    paymentType: 'cash' | 'credit'; 
    supplierId?: string;
    supplierName?: string;
    unitPrice: number;
    costPrice?: number;
    totalAmount: number;
    month: string; 
    date: string; 
    dateTime: string;
    userName: string;
    invoiceNumber?: string;
    status?: 'draft' | 'completed' | 'cancelled';
    cancelledBy?: string;
    cancelledAt?: number;
    isReturn?: boolean;
    notes?: string;
}

export interface CardPurchaseVoucher {
    id: string;
    tenantId: string;
    type: 'receipt' | 'payment'; // قبض (من المورد - استرداد) | صرف (للمورد - سداد)
    voucherNumber: string;
    supplierId: string;
    supplierName: string;
    amount: number;
    notes: string;
    date: string;
    dateTime: string;
    userName: string;
}
