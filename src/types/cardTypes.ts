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
}

export interface CardSale {
    id: string;
    tenantId: string;
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
    type: 'cash_sale' | 'distributor_payment' | 'manual_in' | 'manual_out';
    title: string;
    amount: number;
    isIncome: boolean;
    referenceId?: string;
    date: string;
    dateTime: string;
    userName: string;
}
