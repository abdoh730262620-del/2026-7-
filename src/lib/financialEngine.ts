import { format } from 'date-fns';

export interface EmployeeIdentity {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
}

export interface DateFilterOptions {
    month?: string; // 'yyyy-MM' or 'all'
    startMs?: number;
    endMs?: number;
}

/**
 * Normalizes timestamp into numeric milliseconds
 */
export function getTimestampMs(val?: any): number {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (val instanceof Date) return val.getTime();
    if (typeof val === 'string') {
        const parsed = new Date(val).getTime();
        return isNaN(parsed) ? 0 : parsed;
    }
    if (val?.seconds) {
        return val.seconds * 1000;
    }
    return 0;
}

/**
 * Checks if a transaction matches the given date / month filter
 */
export function matchesDateFilter(timestampVal?: any, options?: DateFilterOptions): boolean {
    if (!options) return true;
    const { month, startMs, endMs } = options;
    if (month === 'all' && startMs === undefined && endMs === undefined) return true;

    const ts = getTimestampMs(timestampVal);
    if (!ts) return true; // Keep transactions with indeterminate timestamps by default

    if (startMs !== undefined && ts < startMs) return false;
    if (endMs !== undefined && ts > endMs) return false;

    if (month && month !== 'all') {
        const itemMonth = format(new Date(ts), 'yyyy-MM');
        if (itemMonth !== month) return false;
    }

    return true;
}

/**
 * Helper to match an entity or transaction to an employee
 */
export function isTransactionForEmployee(
    tx: any,
    emp?: EmployeeIdentity | null
): boolean {
    if (!emp) return true; // If no employee specified, matches all (store-wide)
    if (!tx) return false;

    const empId = emp.id;
    const empNameClean = (emp.name || '').trim().toLowerCase();
    const empEmailClean = (emp.email || '').trim().toLowerCase();

    // Check direct ID references
    if (empId) {
        if (tx.employeeId === empId || tx.userId === empId || tx.createdBy === empId || tx.withdrawnFromEmployeeId === empId || tx.sourceEmployeeId === empId || tx.targetEmployeeId === empId || tx.partyId === empId) {
            return true;
        }
    }

    // Check name references
    if (empNameClean) {
        const txEmployeeName = (tx.employeeName || '').trim().toLowerCase();
        const txUserName = (tx.userName || '').trim().toLowerCase();
        const txSellerName = (tx.sellerName || '').trim().toLowerCase();
        const txCreatedByName = (tx.createdByName || '').trim().toLowerCase();
        const txPartyName = (tx.partyName || '').trim().toLowerCase();

        if (txEmployeeName === empNameClean || txUserName === empNameClean || txSellerName === empNameClean || txCreatedByName === empNameClean || txPartyName === empNameClean) {
            return true;
        }
    }

    // Check email references
    if (empEmailClean) {
        const txEmail = (tx.createdByEmail || tx.email || tx.userEmail || '').trim().toLowerCase();
        if (txEmail && txEmail === empEmailClean) {
            return true;
        }
    }

    return false;
}

/**
 * Checks if a voucher belongs to an employee (created by or for them)
 */
export function isVoucherForEmployee(v: any, emp?: EmployeeIdentity | null): boolean {
    if (!emp) return true;
    if (!v) return false;

    const empId = emp.id;
    const empNameClean = (emp.name || '').trim().toLowerCase();
    const partyNameClean = (v.partyName || '').trim().toLowerCase();
    const descClean = (v.description || '').toLowerCase();

    if (empId && (v.createdBy === empId || v.employeeId === empId || v.partyId === empId)) {
        return true;
    }

    if (empNameClean) {
        if (partyNameClean === empNameClean || partyNameClean.includes(empNameClean)) return true;
        if (descClean && descClean.includes(empNameClean)) return true;
    }

    return false;
}

/**
 * Checks whether a voucher applies to Card Fund (YER) or General Store Fund (SAR)
 */
export function isCardVoucher(v: any): boolean {
    if (!v) return false;
    const desc = (v.description || '').toLowerCase();
    const boxType = v.boxType || '';
    const currency = v.currency || '';

    return (
        boxType === 'card_cashbox' ||
        boxType === 'network_cashbox' ||
        currency === 'YER' ||
        currency === 'ر.ي' ||
        desc.includes('كروت') ||
        desc.includes('شبكة') ||
        desc.includes('ر.ي') ||
        desc.includes('ريال يمني')
    );
}

/**
 * Single Source of Truth for General Cashbox (SAR) calculations
 */
export interface GeneralFundCalculationResult {
    grossCashSales: number;
    clearances: number;
    disbursedWithdrawals: number;
    vouchers: number;
    totalDeductions: number;
    netBalance: number;
    salesCount: number;
}

export function calculateGeneralFundNetBalance(
    generalSales: any[],
    managerClearances: any[],
    withdrawals: any[],
    vouchers: any[],
    options?: {
        employee?: EmployeeIdentity | null;
        dateFilter?: DateFilterOptions;
    }
): GeneralFundCalculationResult {
    const emp = options?.employee;
    const dateFilter = options?.dateFilter;

    // 1. Cash sales from general invoices (SAR)
    const validSales = (generalSales || []).filter(inv => {
        if (inv.status === 'returned' || inv.status === 'cancelled') return false;
        if (inv.paymentType === 'credit' || inv.paymentType === 'deferred' || inv.paymentType === 'اجل') return false;
        if (!isTransactionForEmployee(inv, emp)) return false;
        if (!matchesDateFilter(inv.date || inv.createdAt, dateFilter)) return false;
        return true;
    });

    const grossCashSales = validSales.reduce((sum, inv) => {
        const val = Number(inv.total || inv.paidAmount) || 0;
        return sum + val;
    }, 0);

    // 2. Manager clearances for general cashbox (SAR)
    const validClearances = (managerClearances || []).filter(c => {
        if (c.boxType === 'card_cashbox') return false; // Card box is excluded
        if (!isTransactionForEmployee(c, emp)) return false;
        if (!matchesDateFilter(c.date || c.createdAt, dateFilter)) return false;
        return true;
    });

    const clearances = validClearances.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    // 3. Disbursed withdrawals from general cashbox (SAR)
    const validWithdrawals = (withdrawals || []).filter(w => {
        if (w.sourceFund === 'network_cashbox' || w.sourceFund === 'card_cashbox') return false;
        const isFromEmp = emp ? (w.withdrawnFromEmployeeId === emp.id || (w as any).sourceEmployeeId === emp.id) : true;
        if (!isFromEmp) return false;
        if (!matchesDateFilter(w.date || w.createdAt, dateFilter)) return false;
        return true;
    });

    const disbursedWithdrawals = validWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

    // 4. General vouchers (سندات قبض استلام نقدية من الموظف/الصندوق)
    const validVouchers = (vouchers || []).filter(v => {
        if (isCardVoucher(v)) return false;
        if (!isVoucherForEmployee(v, emp)) return false;
        if (!matchesDateFilter(v.date || v.createdAt, dateFilter)) return false;
        return true;
    });

    const vouchersTotal = validVouchers.reduce((sum, v) => {
        const amt = Number(v.amount) || 0;
        // Receipt voucher = handed over -> deduct from employee box
        return v.type === 'receipt' ? sum + amt : sum - amt;
    }, 0);

    const totalDeductions = clearances + disbursedWithdrawals + vouchersTotal;
    const netBalance = Math.max(0, grossCashSales - totalDeductions);

    return {
        grossCashSales,
        clearances,
        disbursedWithdrawals,
        vouchers: vouchersTotal,
        totalDeductions,
        netBalance,
        salesCount: validSales.length
    };
}

/**
 * Single Source of Truth for Card / Network Cashbox (YER) calculations
 */
export interface CardFundCalculationResult {
    grossCashSales: number;
    retailSales: number;
    wholesaleSales: number;
    clearances: number;
    disbursedWithdrawals: number;
    vouchers: number;
    totalDeductions: number;
    netBalance: number;
    salesCount: number;
}

export function calculateCardFundNetBalance(
    cardSales: any[],
    managerClearances: any[],
    withdrawals: any[],
    vouchers: any[],
    options?: {
        employee?: EmployeeIdentity | null;
        dateFilter?: DateFilterOptions;
    }
): CardFundCalculationResult {
    const emp = options?.employee;
    const dateFilter = options?.dateFilter;

    // 1. Cash card sales (YER)
    const validSales = (cardSales || []).filter(cs => {
        if (cs.status === 'returned' || cs.status === 'cancelled') return false;
        if (cs.saleType === 'credit' || cs.paymentType === 'credit' || cs.paymentType === 'deferred' || cs.paymentType === 'اجل') return false;
        if (!isTransactionForEmployee(cs, emp)) return false;
        if (!matchesDateFilter(cs.date || cs.createdAt, dateFilter)) return false;
        return true;
    });

    let retailSales = 0;
    let wholesaleSales = 0;
    validSales.forEach(cs => {
        const val = Number(cs.totalAmount || cs.totalPrice || cs.amount) || 0;
        const isWholesale = cs.saleType === 'wholesale' || cs.saleType === 'distributor' || Boolean(cs.distributorId);
        if (isWholesale) {
            wholesaleSales += val;
        } else {
            retailSales += val;
        }
    });

    const grossCashSales = retailSales + wholesaleSales;

    // 2. Manager clearances for card box (YER)
    const validClearances = (managerClearances || []).filter(c => {
        if (c.boxType !== 'card_cashbox') return false;
        if (!isTransactionForEmployee(c, emp)) return false;
        if (!matchesDateFilter(c.date || c.createdAt, dateFilter)) return false;
        return true;
    });

    const clearances = validClearances.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    // 3. Withdrawals from card fund (YER)
    const validWithdrawals = (withdrawals || []).filter(w => {
        if (w.sourceFund !== 'network_cashbox' && w.sourceFund !== 'card_cashbox') return false;
        const isFromEmp = emp ? (w.withdrawnFromEmployeeId === emp.id || (w as any).sourceEmployeeId === emp.id) : true;
        if (!isFromEmp) return false;
        if (!matchesDateFilter(w.date || w.createdAt, dateFilter)) return false;
        return true;
    });

    const disbursedWithdrawals = validWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

    // 4. Card vouchers (سندات استلام كروت)
    const validVouchers = (vouchers || []).filter(v => {
        if (!isCardVoucher(v)) return false;
        if (!isVoucherForEmployee(v, emp)) return false;
        if (!matchesDateFilter(v.date || v.createdAt, dateFilter)) return false;
        return true;
    });

    const vouchersTotal = validVouchers.reduce((sum, v) => {
        const amt = Number(v.amount) || 0;
        return v.type === 'receipt' ? sum + amt : sum - amt;
    }, 0);

    const totalDeductions = clearances + disbursedWithdrawals + vouchersTotal;
    const netBalance = Math.max(0, grossCashSales - totalDeductions);

    return {
        grossCashSales,
        retailSales,
        wholesaleSales,
        clearances,
        disbursedWithdrawals,
        vouchers: vouchersTotal,
        totalDeductions,
        netBalance,
        salesCount: validSales.length
    };
}

/**
 * Single Source of Truth for Credit (الآجل) Calculations
 */
export function calculateGeneralCreditReceivables(
    generalSales: any[],
    options?: {
        employee?: EmployeeIdentity | null;
        dateFilter?: DateFilterOptions;
    }
): number {
    const emp = options?.employee;
    const dateFilter = options?.dateFilter;

    return (generalSales || []).filter(inv => {
        if (inv.status === 'returned' || inv.status === 'cancelled') return false;
        const isCredit = inv.paymentType === 'credit' || inv.paymentType === 'deferred' || inv.paymentType === 'اجل';
        if (!isCredit) return false;
        if (!isTransactionForEmployee(inv, emp)) return false;
        if (!matchesDateFilter(inv.date || inv.createdAt, dateFilter)) return false;
        return true;
    }).reduce((sum, inv) => {
        const total = Number(inv.total) || 0;
        const paid = Number(inv.paidAmount) || 0;
        return sum + Math.max(0, total - paid);
    }, 0);
}

export function calculateCardCreditReceivables(
    cardSales: any[],
    options?: {
        employee?: EmployeeIdentity | null;
        dateFilter?: DateFilterOptions;
    }
): number {
    const emp = options?.employee;
    const dateFilter = options?.dateFilter;

    return (cardSales || []).filter(cs => {
        if (cs.status === 'returned' || cs.status === 'cancelled') return false;
        const isCredit = cs.saleType === 'credit' || cs.paymentType === 'credit' || cs.paymentType === 'deferred' || cs.paymentType === 'اجل';
        if (!isCredit) return false;
        if (!isTransactionForEmployee(cs, emp)) return false;
        if (!matchesDateFilter(cs.date || cs.createdAt, dateFilter)) return false;
        return true;
    }).reduce((sum, cs) => sum + (Number(cs.totalAmount || cs.totalPrice || cs.amount) || 0), 0);
}

export interface ManagerCashboxCalculationResult {
    managerGeneralCashSales: number;
    receivedGeneralClearances: number;
    managerGeneralWithdrawals: number;
    managerGeneralNetBalance: number;
    managerGeneralCredit: number;

    managerCardCashSales: number;
    receivedCardClearances: number;
    managerCardWithdrawals: number;
    managerCardNetBalance: number;
    managerCardCredit: number;
}

/**
 * Calculates Manager's Cashbox balances (combines manager's own direct sales + clearances received from employees)
 */
export function calculateManagerCashbox(
    generalSales: any[],
    cardSales: any[],
    managerClearances: any[],
    withdrawals: any[],
    vouchers: any[],
    options?: {
        manager?: EmployeeIdentity | null;
        dateFilter?: DateFilterOptions;
    }
): ManagerCashboxCalculationResult {
    const mgr = options?.manager;
    const dateFilter = options?.dateFilter;

    // 1. Manager's direct cash sales in SAR
    const validGeneralSales = (generalSales || []).filter(inv => {
        if (inv.status === 'returned' || inv.status === 'cancelled') return false;
        if (inv.paymentType === 'credit' || inv.paymentType === 'deferred' || inv.paymentType === 'اجل') return false;
        if (!isTransactionForEmployee(inv, mgr)) return false;
        if (!matchesDateFilter(inv.date || inv.createdAt, dateFilter)) return false;
        return true;
    });
    const managerGeneralCashSales = validGeneralSales.reduce((sum, inv) => sum + (Number(inv.total || inv.paidAmount) || 0), 0);

    // 2. Clearances received from employees for General Fund in SAR
    const validGeneralClearances = (managerClearances || []).filter(c => {
        if (c.boxType === 'card_cashbox') return false;
        if (!matchesDateFilter(c.date || c.createdAt, dateFilter)) return false;
        return true;
    });
    const receivedGeneralClearances = validGeneralClearances.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    // 3. Manager's withdrawals from General Fund in SAR
    const validGeneralWithdrawals = (withdrawals || []).filter(w => {
        if (w.sourceFund === 'network_cashbox' || w.sourceFund === 'card_cashbox') return false;
        const isFromMgr = mgr ? (w.withdrawnFromEmployeeId === mgr.id || (w as any).sourceEmployeeId === mgr.id) : true;
        if (!isFromMgr) return false;
        if (!matchesDateFilter(w.date || w.createdAt, dateFilter)) return false;
        return true;
    });
    const managerGeneralWithdrawals = validGeneralWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

    const managerGeneralNetBalance = Math.max(0, managerGeneralCashSales + receivedGeneralClearances - managerGeneralWithdrawals);
    const managerGeneralCredit = calculateGeneralCreditReceivables(generalSales, { employee: mgr, dateFilter });

    // 4. Manager's direct cash sales in YER (Cards)
    const validCardSales = (cardSales || []).filter(cs => {
        if (cs.status === 'returned' || cs.status === 'cancelled') return false;
        if (cs.saleType === 'credit' || cs.paymentType === 'credit' || cs.paymentType === 'deferred' || cs.paymentType === 'اجل') return false;
        if (!isTransactionForEmployee(cs, mgr)) return false;
        if (!matchesDateFilter(cs.date || cs.createdAt, dateFilter)) return false;
        return true;
    });
    const managerCardCashSales = validCardSales.reduce((sum, cs) => sum + (Number(cs.totalAmount || cs.totalPrice || cs.amount) || 0), 0);

    // 5. Clearances received from employees for Card Fund in YER
    const validCardClearances = (managerClearances || []).filter(c => {
        if (c.boxType !== 'card_cashbox') return false;
        if (!matchesDateFilter(c.date || c.createdAt, dateFilter)) return false;
        return true;
    });
    const receivedCardClearances = validCardClearances.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    // 6. Manager's withdrawals from Card Fund in YER
    const validCardWithdrawals = (withdrawals || []).filter(w => {
        if (w.sourceFund !== 'network_cashbox' && w.sourceFund !== 'card_cashbox') return false;
        const isFromMgr = mgr ? (w.withdrawnFromEmployeeId === mgr.id || (w as any).sourceEmployeeId === mgr.id) : true;
        if (!isFromMgr) return false;
        if (!matchesDateFilter(w.date || w.createdAt, dateFilter)) return false;
        return true;
    });
    const managerCardWithdrawals = validCardWithdrawals.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

    const managerCardNetBalance = Math.max(0, managerCardCashSales + receivedCardClearances - managerCardWithdrawals);
    const managerCardCredit = calculateCardCreditReceivables(cardSales, { employee: mgr, dateFilter });

    return {
        managerGeneralCashSales,
        receivedGeneralClearances,
        managerGeneralWithdrawals,
        managerGeneralNetBalance,
        managerGeneralCredit,

        managerCardCashSales,
        receivedCardClearances,
        managerCardWithdrawals,
        managerCardNetBalance,
        managerCardCredit
    };
}
