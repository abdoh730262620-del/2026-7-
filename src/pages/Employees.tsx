import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, getDocs, deleteDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { LocalCache } from '../lib/localCache';
import { useAuthStore, AppRole } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { logUserAction } from '../lib/logger';
import { format } from 'date-fns';
import { 
    Users, UserCheck, Banknote, ArrowDownLeft, Sparkles, Plus, X, 
    Search, ArrowLeft, ArrowRight, Wallet, TrendingDown, Receipt, Save, RefreshCw,
    Shield, Briefcase, Wifi, Package, ShoppingBag, Edit3, Coins,
    Filter, FileText, Printer, Share2, Calendar, Trash2, Calculator, CheckCircle2,
    AlertTriangle, CreditCard, Eye, Download, ArrowRightLeft, FileSpreadsheet, ShieldAlert
} from 'lucide-react';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
import { EmployeeMetricDetailModal, MetricType } from '../components/EmployeeMetricDetailModal';
import { EmployeeWithdrawalsReportModal } from '../components/EmployeeWithdrawalsReportModal';

interface EmployeeUser {
    id: string;
    email: string;
    name: string;
    role: AppRole;
    salary?: number;
    maxWithdrawalLimit?: number; // سقف السلف / الحد الأقصى للمسحوبات
    isActive: boolean;
    createdAt?: number;
}

interface WithdrawalRecord {
    id: string;
    withdrawalNumber?: number;
    voucherNumber?: string;
    employeeId: string;
    employeeName: string;
    employeeRole: string;
    amount: number;
    notes: string;
    date: number;
    createdBy: string;
    sourceFund: 'network_cashbox' | 'general_cashbox';
    withdrawnFromEmployeeId?: string;
    withdrawnFromEmployeeName?: string;
    withdrawnFromEmployeeRole?: string;
    linkedCardCashboxId?: string;
    linkedVoucherId?: string;
    linkedCashId?: string;
}

interface CardSaleRecord {
    id: string;
    categoryName?: string;
    quantity?: number;
    saleType?: string;
    paymentType?: string;
    commissionAmount?: number;
    totalAmount?: number;
    totalPrice?: number;
    amount?: number;
    unitPrice?: number;
    price?: number;
    customerName?: string;
    buyerName?: string;
    userName?: string;
    sellerName?: string;
    createdByName?: string;
    userId?: string;
    createdBy?: string;
    date?: string;
    dateTime?: string;
    createdAt?: number;
    invoiceNumber?: string;
    status?: string;
}

interface GeneralSaleRecord {
    id: string;
    invoiceNumber: string;
    date?: number;
    createdAt?: number;
    customerId?: string;
    customerName?: string;
    total?: number;
    paidAmount?: number;
    remainingAmount?: number;
    paymentType?: string;
    createdBy?: string;
    createdByEmail?: string;
    createdByName?: string;
    sellerName?: string;
    items?: any[];
    status?: string;
}

interface ManagerClearanceRecord {
    id: string;
    clearanceNumber?: number;
    voucherNumber?: string;
    employeeId: string;
    employeeName: string;
    employeeRole?: string;
    managerId: string;
    managerName: string;
    boxType: 'general_cashbox' | 'card_cashbox';
    amount: number;
    currency: 'ر.س' | 'ر.ي';
    notes: string;
    date: number;
    createdAt: number;
    tenantId: string;
}

export default function Employees() {
    const { appUser } = useAuthStore();
    const tenantId = appUser?.tenantId || 'single_store';
    const settings = useSettingsStore(state => state.settings);

    const [employees, setEmployees] = useState<EmployeeUser[]>([]);
    const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
    const [cardSales, setCardSales] = useState<CardSaleRecord[]>([]);
    const [generalSales, setGeneralSales] = useState<GeneralSaleRecord[]>([]);
    const [managerClearances, setManagerClearances] = useState<ManagerClearanceRecord[]>([]);
    
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeUser | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Filter states for employee detail view
    const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
    const [filterType, setFilterType] = useState<'all' | 'withdrawals' | 'commissions'>('all');
    const [detailSearchTerm, setDetailSearchTerm] = useState<string>('');
    const [activeSalesCategory, setActiveSalesCategory] = useState<'general' | 'cards' | 'credit_general' | 'credit_cards'>('general');
    const [activeMainTableTab, setActiveMainTableTab] = useState<'sales' | 'withdrawals' | 'manager_clearance'>('sales');
    const [activeManagerMainTableTab, setActiveManagerMainTableTab] = useState<'balances' | 'clearance_history'>('balances');
    const [selectedInvoicePreview, setSelectedInvoicePreview] = useState<{
        isOpen: boolean;
        invoice: any;
        type: 'sale' | 'card_sale';
        items: any[];
    } | null>(null);

    // Manager Clearance modal states
    const [isManagerClearanceModalOpen, setIsManagerClearanceModalOpen] = useState(false);
    const [isManagerOverviewOpen, setIsManagerOverviewOpen] = useState(false);
    const [clearanceBoxType, setClearanceBoxType] = useState<'general_cashbox' | 'card_cashbox'>('general_cashbox');
    const [clearanceAmount, setClearanceAmount] = useState('');
    const [clearanceNotes, setClearanceNotes] = useState('');
    const [isSubmittingClearance, setIsSubmittingClearance] = useState(false);
    const [selectedClearanceVoucher, setSelectedClearanceVoucher] = useState<ManagerClearanceRecord | null>(null);

    const [activeMetricModal, setActiveMetricModal] = useState<MetricType | null>(null);
    const canViewAllEmployees = appUser?.role === 'admin' || (appUser?.role as string) === 'manager' || appUser?.permissions?.users?.view === true || appUser?.permissions?.employees?.edit === true;
    const hasEmployeesViewPermission = appUser?.role === 'admin' || appUser?.permissions?.employees?.view !== false;

    // Auto-select logged in employee if they lack permission to view all employees
    useEffect(() => {
        if (!canViewAllEmployees && appUser) {
            const foundSelf = employees.find(e => 
                e.id === appUser.uid || 
                (e.email && appUser.email && e.email.toLowerCase() === appUser.email.toLowerCase()) ||
                (e.name && appUser.name && e.name.trim().toLowerCase() === appUser.name.trim().toLowerCase())
            );
            if (foundSelf) {
                if (!selectedEmployee || selectedEmployee.id !== foundSelf.id) {
                    setSelectedEmployee(foundSelf);
                }
            } else if (!selectedEmployee) {
                setSelectedEmployee({
                    id: appUser.uid,
                    email: appUser.email || '',
                    name: appUser.name || 'الموظف الحالي',
                    role: appUser.role || 'cashier',
                    salary: appUser.salary || 0,
                    maxWithdrawalLimit: 0,
                    isActive: true
                });
            }
        }
    }, [canViewAllEmployees, appUser, employees, selectedEmployee]);

    // Modal states
    const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [withdrawNotes, setWithdrawNotes] = useState('');
    const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState(false);

    // Withdrawal to another employee states
    const [isWithdrawOtherModalOpen, setIsWithdrawOtherModalOpen] = useState(false);
    const [targetEmployeeId, setTargetEmployeeId] = useState('');
    const [withdrawOtherAmount, setWithdrawOtherAmount] = useState('');
    const [withdrawOtherNotes, setWithdrawOtherNotes] = useState('');
    const [isSubmittingWithdrawOther, setIsSubmittingWithdrawOther] = useState(false);
    const [withdrawalSubTab, setWithdrawalSubTab] = useState<'personal' | 'disbursed_from_fund'>('personal');

    const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
    const [editSalaryInput, setEditSalaryInput] = useState('');
    const [editMaxLimitInput, setEditMaxLimitInput] = useState('');
    const [isSubmittingSalary, setIsSubmittingSalary] = useState(false);

    // Detailed Withdrawals Report Modal State
    const [isWithdrawalsReportModalOpen, setIsWithdrawalsReportModalOpen] = useState(false);

    // Register top header and phone back button action to exit modals or single employee profile view
    useEffect(() => {
        if (selectedClearanceVoucher) {
            (window as any).onHeaderBack = () => {
                setSelectedClearanceVoucher(null);
                return true;
            };
        } else if (isManagerClearanceModalOpen) {
            (window as any).onHeaderBack = () => {
                setIsManagerClearanceModalOpen(false);
                return true;
            };
        } else if (isManagerOverviewOpen) {
            (window as any).onHeaderBack = () => {
                setIsManagerOverviewOpen(false);
                return true;
            };
        } else if (isWithdrawalsReportModalOpen) {
            (window as any).onHeaderBack = () => {
                setIsWithdrawalsReportModalOpen(false);
                return true;
            };
        } else if (isWithdrawOtherModalOpen) {
            (window as any).onHeaderBack = () => {
                setIsWithdrawOtherModalOpen(false);
                return true;
            };
        } else if (isWithdrawModalOpen) {
            (window as any).onHeaderBack = () => {
                setIsWithdrawModalOpen(false);
                return true;
            };
        } else if (isSalaryModalOpen) {
            (window as any).onHeaderBack = () => {
                setIsSalaryModalOpen(false);
                return true;
            };
        } else if (selectedEmployee && canViewAllEmployees) {
            (window as any).onHeaderBack = () => {
                setSelectedEmployee(null);
                return true;
            };
        } else {
            (window as any).onHeaderBack = null;
        }
        return () => {
            (window as any).onHeaderBack = null;
        };
    }, [selectedEmployee, canViewAllEmployees, isWithdrawModalOpen, isWithdrawOtherModalOpen, isSalaryModalOpen, isWithdrawalsReportModalOpen, isManagerClearanceModalOpen, selectedClearanceVoucher]);

    useEffect(() => {
        if (!appUser?.uid) return;

        // 1. Listen to users
        const qUsers = query(collection(db, 'users'), where('tenantId', '==', tenantId));
        const unsubUsers = onSnapshot(qUsers, (snap) => {
            const list: EmployeeUser[] = [];
            snap.forEach((doc) => {
                const data = doc.data();
                if (['cashier', 'inventory', 'network_worker', 'salesman'].includes(data.role)) {
                    list.push({
                        id: doc.id,
                        email: data.email || '',
                        name: data.name || data.email?.split('@')[0] || 'موظف',
                        role: data.role as AppRole,
                        salary: data.salary || 0,
                        maxWithdrawalLimit: data.maxWithdrawalLimit || 0,
                        isActive: data.isActive !== false,
                        createdAt: data.createdAt || Date.now()
                    });
                }
            });
            setEmployees(list);

            if (selectedEmployee) {
                const updated = list.find(e => e.id === selectedEmployee.id);
                if (updated) setSelectedEmployee(updated);
            }
        }, (err) => handleFirestoreError(err, OperationType.GET, 'users-employees'));

        // 2. Listen to withdrawals
        const qWithdrawals = query(
            collection(db, 'employee_withdrawals'),
            where('tenantId', '==', tenantId)
        );
        const unsubWithdrawals = onSnapshot(qWithdrawals, (snap) => {
            const list: WithdrawalRecord[] = [];
            snap.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() } as WithdrawalRecord);
            });
            list.sort((a, b) => (b.date || 0) - (a.date || 0));
            setWithdrawals(list);
        }, (err) => handleFirestoreError(err, OperationType.GET, 'employee_withdrawals'));

        // 3. Listen to card sales for retail commissions
        const qSales = query(
            collection(db, 'card_sales'),
            where('tenantId', '==', tenantId)
        );
        const unsubSales = onSnapshot(qSales, (snap) => {
            const list: CardSaleRecord[] = [];
            snap.forEach((doc) => {
                const data = doc.data();
                if (data.status !== 'cancelled') {
                    list.push({ id: doc.id, ...data } as CardSaleRecord);
                }
            });
            setCardSales(list);
        }, (err) => handleFirestoreError(err, OperationType.GET, 'card_sales-employees'));

        // 4. Listen to general sales invoices
        const qGeneralSales = query(
            collection(db, 'sales'),
            where('tenantId', '==', tenantId)
        );
        const unsubGeneralSales = onSnapshot(qGeneralSales, (snap) => {
            const list: GeneralSaleRecord[] = [];
            snap.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.status !== 'cancelled') {
                    list.push({ id: docSnap.id, ...data } as GeneralSaleRecord);
                }
            });
            setGeneralSales(list);
        }, (err) => handleFirestoreError(err, OperationType.GET, 'sales-employees'));

        // 5. Listen to manager clearances (صندوق المدير / تصفية صناديق الموظفين)
        const qManagerClearances = query(
            collection(db, 'manager_clearances'),
            where('tenantId', '==', tenantId)
        );
        const unsubManagerClearances = onSnapshot(qManagerClearances, (snap) => {
            const list: ManagerClearanceRecord[] = [];
            snap.forEach((docSnap) => {
                list.push({ id: docSnap.id, ...docSnap.data() } as ManagerClearanceRecord);
            });
            list.sort((a, b) => (b.date || 0) - (a.date || 0));
            setManagerClearances(list);
        }, (err) => handleFirestoreError(err, OperationType.GET, 'manager_clearances'));

        return () => {
            unsubUsers();
            unsubWithdrawals();
            unsubSales();
            unsubGeneralSales();
            unsubManagerClearances();
        };
    }, [appUser, tenantId]);

    // Role display names & badge colors
    const roleConfig: Record<string, { label: string; icon: any; color: string; bg: string; border: string }> = {
        'cashier': {
            label: 'كاشير مبيعات',
            icon: ShoppingBag,
            color: 'text-emerald-600 dark:text-emerald-400',
            bg: 'bg-emerald-50 dark:bg-emerald-950/40',
            border: 'border-emerald-200 dark:border-emerald-800'
        },
        'inventory': {
            label: 'أمين مخزن',
            icon: Package,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-50 dark:bg-amber-950/40',
            border: 'border-amber-200 dark:border-amber-800'
        },
        'network_worker': {
            label: 'عامل شبكة',
            icon: Wifi,
            color: 'text-indigo-600 dark:text-indigo-400',
            bg: 'bg-indigo-50 dark:bg-indigo-950/40',
            border: 'border-indigo-200 dark:border-indigo-800'
        },
        'salesman': {
            label: 'مندوب مبيعات',
            icon: Briefcase,
            color: 'text-blue-600 dark:text-blue-400',
            bg: 'bg-blue-50 dark:bg-blue-950/40',
            border: 'border-blue-200 dark:border-blue-800'
        }
    };

    // Filter employees by search term
    const filteredEmployees = employees.filter(e => 
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Helper functions for calculated totals
    const getEmployeeWithdrawals = (emp: EmployeeUser) => {
        return withdrawals.filter(w => w.employeeId === emp.id || (w.employeeName && w.employeeName === emp.name));
    };

    const getTotalWithdrawals = (emp: EmployeeUser) => {
        const empWithdrawals = getEmployeeWithdrawals(emp);
        return empWithdrawals.reduce((sum, w) => sum + (parseFloat(String(w.amount)) || 0), 0);
    };

    const getEmployeeCardSales = (emp: EmployeeUser) => {
        return cardSales.filter(s => {
            const isMatchUser = (s.userName && s.userName === emp.name) ||
                                (s.sellerName && s.sellerName === emp.name) ||
                                (s.createdByName && s.createdByName === emp.name) ||
                                (s.userName && s.userName === emp.email) ||
                                (s.sellerName && s.sellerName === emp.email) ||
                                (s.userId && s.userId === emp.id) ||
                                (s.createdBy && s.createdBy === emp.id);
            return isMatchUser;
        });
    };

    const getEmployeeGeneralSales = (emp: EmployeeUser) => {
        if (!emp) return [];
        const empNameLower = (emp.name || '').trim().toLowerCase();
        const empEmailLower = (emp.email || '').trim().toLowerCase();
        const empId = emp.id;

        return generalSales.filter(inv => {
            if (inv.createdBy && inv.createdBy === empId) return true;
            if (inv.sellerName && inv.sellerName.trim().toLowerCase() === empNameLower) return true;
            if (inv.createdByName && inv.createdByName.trim().toLowerCase() === empNameLower) return true;
            if (empEmailLower && inv.createdByEmail && inv.createdByEmail.trim().toLowerCase() === empEmailLower) return true;
            return false;
        });
    };

    const matchesMonthFilter = (timestamp?: number | string) => {
        if (selectedMonth === 'all') return true;
        if (!timestamp) return true;
        let tsNum = 0;
        if (typeof timestamp === 'number') {
            tsNum = timestamp;
        } else {
            const parsed = new Date(timestamp).getTime();
            if (!isNaN(parsed)) tsNum = parsed;
        }
        if (!tsNum) return true;
        return format(tsNum, 'yyyy-MM') === selectedMonth;
    };

    const getItemCommission = (s: any) => {
        if (s.saleType === 'wholesale' || s.saleType === 'distributor' || Boolean(s.distributorId)) return 0;
        if (typeof s.commissionAmount === 'number') return s.commissionAmount;
        const total = Number(s.totalAmount || s.totalPrice || s.amount || 0);
        const percent = typeof s.commissionPercent === 'number' ? s.commissionPercent : 10;
        return (total * percent) / 100;
    };

    const getTotalCommissions = (emp: EmployeeUser) => {
        const empSales = getEmployeeCardSales(emp);
        return empSales.reduce((sum, s) => sum + getItemCommission(s), 0);
    };

    // Arabic Month Helper
    const getArabicMonthName = (yearMonthStr: string) => {
        if (yearMonthStr === 'all') return 'جميع الأشهر (السجل الكامل)';
        const parts = yearMonthStr.split('-');
        if (parts.length < 2) return yearMonthStr;
        const year = parts[0];
        const month = parseInt(parts[1], 10);
        const monthNames = [
            'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
            'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
        ];
        return `${monthNames[month - 1] || month} ${year}`;
    };

    // Available Months List
    const getAvailableMonths = () => {
        const monthsSet = new Set<string>();
        const currentM = format(new Date(), 'yyyy-MM');
        monthsSet.add(currentM);

        for (let i = 1; i <= 6; i++) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            monthsSet.add(format(d, 'yyyy-MM'));
        }

        withdrawals.forEach(w => {
            if (w.date) {
                monthsSet.add(format(new Date(w.date), 'yyyy-MM'));
            }
        });

        cardSales.forEach(s => {
            const dateVal = s.createdAt || (s.date ? new Date(s.date).getTime() : null);
            if (dateVal) {
                monthsSet.add(format(new Date(dateVal), 'yyyy-MM'));
            }
        });

        return Array.from(monthsSet).sort().reverse();
    };

    // Filtered Withdrawals by Month and Search
    const getFilteredWithdrawals = (emp: EmployeeUser) => {
        let list = getEmployeeWithdrawals(emp);

        if (selectedMonth !== 'all') {
            list = list.filter(w => {
                if (!w.date) return false;
                return format(new Date(w.date), 'yyyy-MM') === selectedMonth;
            });
        }

        if (detailSearchTerm.trim()) {
            const term = detailSearchTerm.toLowerCase();
            list = list.filter(w => 
                (w.notes && w.notes.toLowerCase().includes(term)) ||
                (w.createdBy && w.createdBy.toLowerCase().includes(term)) ||
                (w.amount && w.amount.toString().includes(term))
            );
        }

        return list;
    };

    // Filtered Card Sales/Commissions by Month and Search
    const getFilteredCardSales = (emp: EmployeeUser) => {
        let list = getEmployeeCardSales(emp);

        if (selectedMonth !== 'all') {
            list = list.filter(s => {
                const dateVal = s.createdAt || (s.date ? new Date(s.date).getTime() : null);
                if (!dateVal) return false;
                return format(new Date(dateVal), 'yyyy-MM') === selectedMonth;
            });
        }

        if (detailSearchTerm.trim()) {
            const term = detailSearchTerm.toLowerCase();
            list = list.filter(s => 
                (s.categoryName && s.categoryName.toLowerCase().includes(term)) ||
                (s.invoiceNumber && s.invoiceNumber.toLowerCase().includes(term))
            );
        }

        return list;
    };

    // Manager Clearance Calculations for Employee Funds
    const getEmployeeGeneralCashSalesTotal = (emp: EmployeeUser) => {
        if (!emp) return 0;
        const sales = getEmployeeGeneralSales(emp);
        const cashSales = sales.filter(inv => inv.paymentType !== 'credit' && inv.paymentType !== 'deferred' && inv.paymentType !== 'اجل');
        return cashSales.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
    };

    const getEmployeeGeneralFundClearancesTotal = (emp: EmployeeUser) => {
        if (!emp) return 0;
        return managerClearances
            .filter(c => c.employeeId === emp.id && c.boxType === 'general_cashbox')
            .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    };

    const getEmployeeGeneralFundDisbursedWithdrawalsTotal = (emp: EmployeeUser) => {
        if (!emp) return 0;
        return withdrawals
            .filter(w => w.withdrawnFromEmployeeId === emp.id && w.sourceFund === 'general_cashbox')
            .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
    };

    const getEmployeeGeneralFundNetBalance = (emp: EmployeeUser) => {
        const totalSales = getEmployeeGeneralCashSalesTotal(emp);
        const totalClearances = getEmployeeGeneralFundClearancesTotal(emp);
        const totalDisbursed = getEmployeeGeneralFundDisbursedWithdrawalsTotal(emp);
        return Math.max(0, totalSales - totalClearances - totalDisbursed);
    };

    const getEmployeeCardCashSalesTotal = (emp: EmployeeUser) => {
        if (!emp) return 0;
        const cardSalesList = getEmployeeCardSales(emp);
        const cardCashSales = cardSalesList.filter(cs => cs.saleType !== 'credit' && cs.paymentType !== 'credit' && cs.paymentType !== 'deferred');
        return cardCashSales.reduce((sum, cs) => sum + (Number(cs.totalAmount || cs.totalPrice || cs.amount) || 0), 0);
    };

    const getEmployeeCardFundClearancesTotal = (emp: EmployeeUser) => {
        if (!emp) return 0;
        return managerClearances
            .filter(c => c.employeeId === emp.id && c.boxType === 'card_cashbox')
            .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    };

    const getEmployeeCardFundDisbursedWithdrawalsTotal = (emp: EmployeeUser) => {
        if (!emp) return 0;
        return withdrawals
            .filter(w => w.withdrawnFromEmployeeId === emp.id && w.sourceFund === 'network_cashbox')
            .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
    };

    const getEmployeeCardFundNetBalance = (emp: EmployeeUser) => {
        const totalSales = getEmployeeCardCashSalesTotal(emp);
        const totalClearances = getEmployeeCardFundClearancesTotal(emp);
        const totalDisbursed = getEmployeeCardFundDisbursedWithdrawalsTotal(emp);
        return Math.max(0, totalSales - totalClearances - totalDisbursed);
    };

    // Create Manager Clearance Action
    const handleCreateManagerClearance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;

        const amountNum = parseFloat(clearanceAmount);
        if (isNaN(amountNum) || amountNum <= 0) {
            alert('يرجى إدخال مبلغ صحيح لتصفية/استلام صندوق الموظف');
            return;
        }

        setIsSubmittingClearance(true);
        try {
            const staffName = appUser?.name || appUser?.email || 'المدير';

            let nextClearanceNum = 1;
            try {
                const qNum = query(
                    collection(db, 'manager_clearances'),
                    where('tenantId', '==', tenantId),
                    orderBy('clearanceNumber', 'desc')
                );
                const snap = await getDocs(qNum);
                if (!snap.empty) {
                    const allNums = snap.docs.map(d => {
                        const cn = d.data().clearanceNumber;
                        if (typeof cn === 'number') return cn;
                        if (typeof cn === 'string') {
                            const digits = cn.replace(/\D/g, '');
                            return digits ? parseInt(digits, 10) : 0;
                        }
                        return 0;
                    }).filter(n => !isNaN(n) && n > 0);
                    const maxNum = allNums.length > 0 ? Math.max(...allNums) : 0;
                    nextClearanceNum = maxNum + 1;
                }
            } catch (err) {
                console.error('Error fetching max clearance number:', err);
            }

            const currency: 'ر.س' | 'ر.ي' = clearanceBoxType === 'card_cashbox' ? 'ر.ي' : 'ر.س';
            const boxLabel = clearanceBoxType === 'card_cashbox' ? 'صندوق الكروت' : 'صندوق المحل';
            const defaultNote = `تصفية ${boxLabel} واستلام النقدية بواسطة المدير`;
            const fullNote = clearanceNotes.trim() ? `${clearanceNotes.trim()} (${defaultNote})` : defaultNote;

            const payload = {
                tenantId,
                clearanceNumber: nextClearanceNum,
                voucherNumber: nextClearanceNum.toString(),
                employeeId: selectedEmployee.id,
                employeeName: selectedEmployee.name,
                employeeRole: selectedEmployee.role,
                managerId: appUser?.uid || 'manager',
                managerName: staffName,
                boxType: clearanceBoxType,
                amount: amountNum,
                currency,
                notes: fullNote,
                date: Date.now(),
                createdAt: Date.now()
            };

            const docRef = await addDoc(collection(db, 'manager_clearances'), payload);

            await logUserAction(
                'تصفية صندوق موظف لصندوق المدير',
                `تم استلام وتصفية مبلغ ${amountNum} ${currency} من ${boxLabel} للموظف ${selectedEmployee.name} بواسطة المدير ${staffName} (سند رقم #${nextClearanceNum})`
            );

            setIsManagerClearanceModalOpen(false);
            setClearanceAmount('');
            setClearanceNotes('');

            const createdRecord: ManagerClearanceRecord = { id: docRef.id, ...payload };
            setSelectedClearanceVoucher(createdRecord);

            alert(`تمت تصفية صندوق الموظف واستلام المبلغ بنجاح!\n• رقم السند: #${nextClearanceNum}\n• الموظف: ${selectedEmployee.name}\n• المبلغ المستلم: ${amountNum.toLocaleString()} ${currency}\n• تم خصم المبلغ من صندوق الموظف دون التأثير على الصناديق الرئيسية للمحل.`);
        } catch (err) {
            console.error('Error creating manager clearance:', err);
            alert('حدث خطأ أثناء حفظ سند التصفية');
        } finally {
            setIsSubmittingClearance(false);
        }
    };

    // Delete Manager Clearance Record
    const handleDeleteManagerClearance = async (c: ManagerClearanceRecord) => {
        const vNum = c.clearanceNumber || c.voucherNumber || '';
        if (!window.confirm(`هل أنت متأكد من إلغاء وحذف سند التصفية رقم #${vNum} بمبلغ ${c.amount.toLocaleString()} ${c.currency}؟\nسيتم إعادة المبلغ لصندوق الموظف.`)) {
            return;
        }
        try {
            await deleteDoc(doc(db, 'manager_clearances', c.id));
            await logUserAction('إلغاء سند تصفية صندوق مدير', `تم إلغاء السند رقم #${vNum} بمبلغ ${c.amount} ${c.currency} للموظف ${c.employeeName}`);
            alert('تم حذف سند التصفية وإعادة المبلغ لصندوق الموظف بنجاح.');
        } catch (err) {
            console.error('Error deleting clearance:', err);
            alert('حدث خطأ أثناء حذف السند');
        }
    };

    // Print Manager Clearance Voucher
    const handlePrintClearanceVoucher = (c: ManagerClearanceRecord) => {
        const storeName = settings?.businessName || 'نظام إدارة المؤسسة والشبكات';
        const storeLogo = settings?.businessLogoUrl || '';
        const vNum = c.clearanceNumber || c.voucherNumber || '1';
        const dateStr = c.date ? format(new Date(c.date), 'yyyy/MM/dd HH:mm') : format(new Date(), 'yyyy/MM/dd HH:mm');
        const boxTitle = c.boxType === 'card_cashbox' ? 'صندوق مبيعات كروت الشبكة' : 'صندوق المبيعات العامة للمحل';

        const printWin = window.open('', '_blank', 'width=800,height=700');
        if (!printWin) {
            alert('يرجى السماح بالنوافذ المنبثقة لطباعة سند التصفية');
            return;
        }

        printWin.document.write(`
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>سند استلام وتصفية صندوق المدير #${vNum}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, sans-serif; direction: rtl; padding: 25px; color: #1e293b; background: #fff; }
                    .header { text-align: center; border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 20px; }
                    .header h2 { margin: 0; color: #4338ca; font-size: 22px; }
                    .header h3 { margin: 5px 0 0; color: #334155; font-size: 16px; }
                    .voucher-card { border: 2px solid #e2e8f0; border-radius: 12px; padding: 20px; background: #fafafa; margin-bottom: 25px; }
                    .row { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 8px; font-size: 14px; }
                    .row .label { font-weight: bold; color: #64748b; }
                    .row .val { font-weight: bold; color: #0f172a; }
                    .amount-box { background: #e0e7ff; border: 2px solid #6366f1; color: #3730a3; padding: 12px; border-radius: 10px; text-align: center; font-size: 20px; font-weight: 900; margin: 15px 0; }
                    .signatures { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 15px; border-top: 1px solid #cbd5e1; }
                    .sig-box { text-align: center; width: 45%; }
                    .sig-title { font-weight: bold; margin-bottom: 30px; color: #475569; }
                    .sig-line { border-bottom: 1px solid #94a3b8; width: 80%; margin: 0 auto; }
                    @media print {
                        body { padding: 0; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    ${storeLogo ? `<img src="${storeLogo}" style="max-height: 50px; margin-bottom: 8px;" />` : ''}
                    <h2>${storeName}</h2>
                    <h3>سند استلام مالي وتصفية صندوق المدير</h3>
                </div>

                <div class="voucher-card">
                    <div class="row">
                        <span class="label">رقم السند:</span>
                        <span class="val">#${vNum}</span>
                    </div>
                    <div class="row">
                        <span class="label">التاريخ والوقت:</span>
                        <span class="val">${dateStr}</span>
                    </div>
                    <div class="row">
                        <span class="label">اسم الموظف المصفى صندوقه:</span>
                        <span class="val">${c.employeeName} (${roleConfig[c.employeeRole || '']?.label || c.employeeRole || 'موظف'})</span>
                    </div>
                    <div class="row">
                        <span class="label">الصندوق المخصوم منه:</span>
                        <span class="val">${boxTitle}</span>
                    </div>
                    <div class="row">
                        <span class="label">المستلم (المدير / المسؤول):</span>
                        <span class="val">${c.managerName}</span>
                    </div>
                    <div class="amount-box">
                        المبلغ المستلم: ${c.amount.toLocaleString()} ${c.currency}
                    </div>
                    <div class="row" style="border-bottom: none;">
                        <span class="label">البيان والملاحظات:</span>
                        <span class="val">${c.notes || 'تصفية واستلام نقدية من صندوق الموظف إلى صندوق المدير'}</span>
                    </div>
                </div>

                <div style="font-size: 11px; color: #64748b; text-align: center; margin-bottom: 20px;">
                    * هذا السند يثبت تصفية واستلام المبلغ الموضح من صندوق الموظف الخاص دون تأثير على الصناديق العامة للمحل.
                </div>

                <div class="signatures">
                    <div class="sig-box">
                        <div class="sig-title">توقيع الموظف المصفى:</div>
                        <div class="sig-line"></div>
                    </div>
                    <div class="sig-box">
                        <div class="sig-title">توقيع المدير المستلم:</div>
                        <div class="sig-line"></div>
                    </div>
                </div>

                <div class="no-print" style="text-align: center; margin-top: 25px;">
                    <button onclick="window.print()" style="background: #4f46e5; color: #fff; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer;">طباعة السند</button>
                    <button onclick="window.close()" style="background: #e2e8f0; color: #334155; border: none; padding: 10px 20px; font-weight: bold; border-radius: 8px; cursor: pointer; margin-right: 10px;">إغلاق</button>
                </div>
            </body>
            </html>
        `);
        printWin.document.close();
    };

    // Delete Withdrawal
    const handleDeleteWithdrawal = async (w: WithdrawalRecord) => {
        const vNum = w.withdrawalNumber || w.voucherNumber || '';
        const numLabel = vNum ? `رقم #${vNum} ` : '';
        if (!window.confirm(`هل أنت متأكد من إلغاء وحذف عملية السحب ${numLabel}بمبلغ ${w.amount.toLocaleString()} ر.ي؟`)) {
            return;
        }
        try {
            const withdrawalId = w.id;
            if (w.linkedCardCashboxId) {
                try {
                    await deleteDoc(doc(db, 'card_cashbox', w.linkedCardCashboxId));
                    await LocalCache.removeCachedItem('card_cashbox', tenantId, w.linkedCardCashboxId);
                } catch (e) {
                    console.warn('Failed to delete linked card cashbox entry:', e);
                }
            }
            if (w.linkedVoucherId) {
                try {
                    await deleteDoc(doc(db, 'vouchers', w.linkedVoucherId));
                } catch (e) {
                    console.warn('Failed to delete linked voucher:', e);
                }
            }
            if (w.linkedCashId) {
                try {
                    await deleteDoc(doc(db, 'cash', w.linkedCashId));
                } catch (e) {
                    console.warn('Failed to delete linked general cash entry:', e);
                }
            }

            await deleteDoc(doc(db, 'employee_withdrawals', withdrawalId));
            await logUserAction('حذف مسحوبات موظف', `تم إلغاء وحذف عملية السحب ${numLabel}بمبلغ ${w.amount} ر.ي`);
            alert('تم حذف عملية السحب بنجاح');
        } catch (err: any) {
            console.error('Error deleting withdrawal:', err);
            handleFirestoreError(err, OperationType.DELETE, 'employee_withdrawals');
            alert('حدث خطأ أثناء حذف عملية السحب');
        }
    };

    // Export PDF Report for Employee
    const handleExportPdf = (emp: EmployeeUser) => {
        const settings = useSettingsStore.getState().settings;
        const storeName = settings?.businessName || 'نظام إدارة المؤسسة والشبكات';
        const storeLogo = settings?.businessLogoUrl || '';

        // 1. Withdrawals
        const empWithdrawals = getFilteredWithdrawals(emp);
        const totWithdraw = empWithdrawals.reduce((sum, w) => sum + (parseFloat(String(w.amount)) || 0), 0);

        // 2. Card Sales & Commissions
        const empCardSales = getFilteredCardSales(emp);
        const totComm = empCardSales.reduce((sum, s) => sum + getItemCommission(s), 0);

        const cardCashList = empCardSales.filter(cs => cs.saleType !== 'credit' && cs.paymentType !== 'credit' && cs.paymentType !== 'deferred');
        const totCardCash = cardCashList.reduce((sum, cs) => sum + (Number(cs.totalPrice || cs.amount || cs.totalAmount) || 0), 0);

        const cardCashRetailList = cardCashList.filter(cs => cs.saleType !== 'wholesale' && cs.saleType !== 'distributor' && !(cs as any).distributorId);
        const totCardCashRetail = cardCashRetailList.reduce((sum, cs) => sum + (Number(cs.totalPrice || cs.amount || cs.totalAmount) || 0), 0);
        const totCardCashRetailComm = cardCashRetailList.reduce((sum, cs) => sum + getItemCommission(cs), 0);

        const cardCashWholesaleList = cardCashList.filter(cs => cs.saleType === 'wholesale' || cs.saleType === 'distributor' || Boolean((cs as any).distributorId));
        const totCardCashWholesale = cardCashWholesaleList.reduce((sum, cs) => sum + (Number(cs.totalPrice || cs.amount || cs.totalAmount) || 0), 0);

        const cardCreditList = empCardSales.filter(cs => cs.saleType === 'credit' || cs.paymentType === 'credit' || cs.paymentType === 'deferred');
        const totCardCredit = cardCreditList.reduce((sum, cs) => sum + (Number(cs.totalPrice || cs.amount || cs.totalAmount) || 0), 0);

        const cardCreditRetailList = cardCreditList.filter(cs => cs.saleType !== 'wholesale' && cs.saleType !== 'distributor' && !(cs as any).distributorId);
        const totCardCreditRetail = cardCreditRetailList.reduce((sum, cs) => sum + (Number(cs.totalPrice || cs.amount || cs.totalAmount) || 0), 0);
        const totCardCreditRetailComm = cardCreditRetailList.reduce((sum, cs) => sum + getItemCommission(cs), 0);

        const cardCreditWholesaleList = cardCreditList.filter(cs => cs.saleType === 'wholesale' || cs.saleType === 'distributor' || Boolean((cs as any).distributorId));
        const totCardCreditWholesale = cardCreditWholesaleList.reduce((sum, cs) => sum + (Number(cs.totalPrice || cs.amount || cs.totalAmount) || 0), 0);

        // 3. General Invoices
        const empGenSales = getEmployeeGeneralSales(emp).filter(inv => matchesMonthFilter(inv.createdAt || inv.date));

        const genCashList = empGenSales.filter(inv => inv.paymentType !== 'credit' && inv.paymentType !== 'deferred' && inv.paymentType !== 'اجل');
        const totGenCash = genCashList.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

        const genCreditList = empGenSales.filter(inv => inv.paymentType === 'credit' || inv.paymentType === 'deferred' || inv.paymentType === 'اجل');
        const totGenCredit = genCreditList.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

        const baseSal = emp.salary || 0;
        const netPayable = baseSal + totComm - totWithdraw;

        const monthTitle = getArabicMonthName(selectedMonth);
        const roleLabel = roleConfig[emp.role]?.label || emp.role;

        const printWin = window.open('', '_blank', 'width=950,height=850');
        if (!printWin) {
            alert('يرجى السماح بالنوافذ المنبثقة لطباعة/تصدير كشف حساب الموظف');
            return;
        }

        // Table Rows HTML Builders
        const withdrawalsRows = empWithdrawals.map((w, idx) => `
            <tr>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">#${w.withdrawalNumber || w.voucherNumber || (idx + 1)}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${w.date ? format(new Date(w.date), 'yyyy/MM/dd HH:mm') : '-'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #dc2626;">${parseFloat(String(w.amount)).toLocaleString()} ر.ي</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">${w.notes || 'سحب سلفة'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${w.sourceFund === 'network_cashbox' ? 'صندوق الشبكات' : 'الصندوق العام'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${w.createdBy || '-'}</td>
            </tr>
        `).join('');

        const genCashRows = genCashList.map((inv, idx) => `
            <tr>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">#${inv.invoiceNumber || inv.id?.slice(0, 8)}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${inv.createdAt || inv.date ? format(new Date(inv.createdAt || inv.date), 'yyyy/MM/dd HH:mm') : '-'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">${inv.customerName || 'عميل نقدي'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${inv.paymentType || 'نقدي'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #16a34a;">${(Number(inv.total) || 0).toLocaleString()} ر.س</td>
            </tr>
        `).join('');

        const genCreditRows = genCreditList.map((inv, idx) => `
            <tr>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold;">#${inv.invoiceNumber || inv.id?.slice(0, 8)}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${inv.createdAt || inv.date ? format(new Date(inv.createdAt || inv.date), 'yyyy/MM/dd HH:mm') : '-'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">${inv.customerName || 'عميل آجل'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #d97706;">${(Number(inv.total) || 0).toLocaleString()} ر.س</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; color: #16a34a;">${(Number(inv.paidAmount) || 0).toLocaleString()} ر.س</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #dc2626;">${(Number(inv.remainingAmount) || (Number(inv.total) || 0) - (Number(inv.paidAmount) || 0)).toLocaleString()} ر.س</td>
            </tr>
        `).join('');

        const cardCashRetailRows = cardCashRetailList.map((cs, idx) => `
            <tr>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${cs.categoryName || 'كروت شبكات'} <span style="font-size: 10px; color: #059669;">(قطاعي)</span></td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.createdAt || cs.date ? format(new Date(cs.createdAt || cs.date), 'yyyy/MM/dd HH:mm') : '-'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.quantity || 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${(Number(cs.unitPrice || cs.price) || 0).toLocaleString()} ر.ي</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #059669;">${(Number(cs.totalPrice || cs.amount || cs.totalAmount) || 0).toLocaleString()} ر.ي</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #16a34a;">+${getItemCommission(cs).toFixed(2)} ر.ي (10%)</td>
            </tr>
        `).join('');

        const cardCashWholesaleRows = cardCashWholesaleList.map((cs, idx) => `
            <tr>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${cs.categoryName || 'كروت شبكات'} <span style="font-size: 10px; color: #7c3aed;">(جملة)</span></td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.createdAt || cs.date ? format(new Date(cs.createdAt || cs.date), 'yyyy/MM/dd HH:mm') : '-'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.quantity || 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${(Number(cs.unitPrice || cs.price) || 0).toLocaleString()} ر.ي</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #7c3aed;">${(Number(cs.totalPrice || cs.amount || cs.totalAmount) || 0).toLocaleString()} ر.ي</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; color: #64748b; font-weight: bold;">0.00 ر.ي (0%)</td>
            </tr>
        `).join('');

        const cardCreditRetailRows = cardCreditRetailList.map((cs, idx) => `
            <tr>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${cs.categoryName || 'كروت شبكات (آجل)'} <span style="font-size: 10px; color: #059669;">(قطاعي)</span></td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.createdAt || cs.date ? format(new Date(cs.createdAt || cs.date), 'yyyy/MM/dd HH:mm') : '-'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">${cs.customerName || cs.buyerName || 'عميل آجل'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.quantity || 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #059669;">${(Number(cs.totalPrice || cs.amount || cs.totalAmount) || 0).toLocaleString()} ر.ي</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #16a34a;">+${getItemCommission(cs).toFixed(2)} ر.ي (10%)</td>
            </tr>
        `).join('');

        const cardCreditWholesaleRows = cardCreditWholesaleList.map((cs, idx) => `
            <tr>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${cs.categoryName || 'كروت شبكات (آجل)'} <span style="font-size: 10px; color: #7c3aed;">(جملة)</span></td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.createdAt || cs.date ? format(new Date(cs.createdAt || cs.date), 'yyyy/MM/dd HH:mm') : '-'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">${cs.customerName || cs.buyerName || 'عميل آجل'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.quantity || 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #7c3aed;">${(Number(cs.totalPrice || cs.amount || cs.totalAmount) || 0).toLocaleString()} ر.ي</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; color: #64748b; font-weight: bold;">0.00 ر.ي (0%)</td>
            </tr>
        `).join('');

        const htmlContent = `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>كشف حساب وتفاصيل الموظف الشامل - ${emp.name}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Tajawal', Tahoma, Arial, sans-serif; padding: 20px; color: #0f172a; background: #ffffff; direction: rtl; }
                    .header { text-align: center; border-bottom: 2px dashed #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
                    .logo { max-height: 55px; margin-bottom: 6px; }
                    .title { font-size: 20px; font-weight: 900; color: #1e293b; }
                    .subtitle { font-size: 13px; font-weight: 700; color: #475569; margin-top: 2px; }
                    .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: #f8fafc; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 16px; font-size: 12px; }
                    .info-item { display: flex; flex-direction: column; gap: 2px; }
                    .info-label { font-weight: 700; color: #64748b; font-size: 11px; }
                    .info-value { font-weight: 800; color: #0f172a; font-size: 12px; }
                    .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 20px; }
                    .card { padding: 10px; border-radius: 10px; text-align: center; border: 1px solid #e2e8f0; }
                    .card-title { font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 2px; }
                    .card-value { font-size: 15px; font-weight: 900; }
                    .c-sal { background: #f1f5f9; color: #334155; }
                    .c-with { background: #fef2f2; border-color: #fca5a5; color: #dc2626; }
                    .c-comm { background: #f0fdf4; border-color: #86efac; color: #16a34a; }
                    .c-net { background: #eff6ff; border-color: #93c5fd; color: #2563eb; }
                    .c-cash { background: #ecfdf5; border-color: #a7f3d0; color: #059669; }
                    .c-credit { background: #fffbeb; border-color: #fde68a; color: #d97706; }
                    .c-cardcash { background: #eef2ff; border-color: #c7d2fe; color: #4f46e5; }
                    .c-cardcredit { background: #faf5ff; border-color: #e9d5ff; color: #7c3aed; }
                    .section-title { font-size: 13px; font-weight: 800; margin-top: 16px; margin-bottom: 8px; color: #1e293b; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
                    th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px; font-weight: 800; text-align: center; color: #334155; }
                    .signatures { display: flex; justify-content: space-between; margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; }
                    .no-print-btn { text-align: center; margin-bottom: 16px; }
                    .btn { padding: 8px 18px; background: #2563eb; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-family: inherit; font-size: 13px; }
                    @media print {
                        .no-print-btn { display: none; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="no-print-btn">
                    <button class="btn" onclick="window.print()">🖨️ طباعة / تصدير PDF / مشاركة كشف الحساب الشامل</button>
                </div>

                <div class="header">
                    ${storeLogo ? `<img src="${storeLogo}" class="logo" />` : ''}
                    <div class="title">${storeName}</div>
                    <div class="subtitle">تقرير وتفاصيل كشف حساب الموظف الشامل (${monthTitle})</div>
                </div>

                <div class="info-grid">
                    <div class="info-item"><span class="info-label">اسم الموظف:</span> <span class="info-value">${emp.name}</span></div>
                    <div class="info-item"><span class="info-label">المسمى الوظيفي:</span> <span class="info-value">${roleLabel}</span></div>
                    <div class="info-item"><span class="info-label">فترة الكشف:</span> <span class="info-value">${monthTitle}</span></div>
                    <div class="info-item"><span class="info-label">البريد الإلكتروني:</span> <span class="info-value">${emp.email}</span></div>
                    <div class="info-item"><span class="info-label">سقف السلف المعتمد:</span> <span class="info-value">${emp.maxWithdrawalLimit ? `${emp.maxWithdrawalLimit.toLocaleString()} ر.ي` : 'غير محدد'}</span></div>
                    <div class="info-item"><span class="info-label">تاريخ استخراج التقرير:</span> <span class="info-value">${format(new Date(), 'yyyy/MM/dd HH:mm')}</span></div>
                </div>

                <div class="summary-cards">
                    <div class="card c-sal">
                        <div class="card-title">الراتب الأساسي</div>
                        <div class="card-value">${baseSal.toLocaleString()} ر.ي</div>
                    </div>
                    <div class="card c-comm">
                        <div class="card-title">إجمالي العمولات</div>
                        <div class="card-value">+${totComm.toLocaleString()} ر.ي</div>
                    </div>
                    <div class="card c-with">
                        <div class="card-title">المسحوبات والسلف</div>
                        <div class="card-value">-${totWithdraw.toLocaleString()} ر.ي</div>
                    </div>
                    <div class="card c-net">
                        <div class="card-title">صافي المستحق للصرف</div>
                        <div class="card-value">${netPayable.toLocaleString()} ر.ي</div>
                    </div>
                    <div class="card c-cash">
                        <div class="card-title">المبيعات النقدية</div>
                        <div class="card-value">${totGenCash.toLocaleString()} ر.س</div>
                    </div>
                    <div class="card c-credit">
                        <div class="card-title">المبيعات الآجل</div>
                        <div class="card-value">${totGenCredit.toLocaleString()} ر.س</div>
                    </div>
                    <div class="card c-cardcash">
                        <div class="card-title">الكروت نقدي</div>
                        <div class="card-value">${totCardCash.toLocaleString()} ر.ي</div>
                    </div>
                    <div class="card c-cardcredit">
                        <div class="card-title">الكروت آجل</div>
                        <div class="card-value">${totCardCredit.toLocaleString()} ر.ي</div>
                    </div>
                </div>

                <!-- 1. General Cash Sales Table -->
                <div class="section-title">
                    <span>1. سجل المبيعات النقدية العامة (${genCashList.length})</span>
                    <span style="color: #059669;">الإجمالي: ${totGenCash.toLocaleString()} ر.س</span>
                </div>
                ${genCashList.length === 0 ? '<p style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">لا توجد مبيعات نقدية عامة مسجلة</p>' : `
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px;">#</th>
                                <th>رقم الفاتورة</th>
                                <th>التاريخ والوقت</th>
                                <th>العميل</th>
                                <th>طريقة الدفع</th>
                                <th>إجمالي الفاتورة</th>
                            </tr>
                        </thead>
                        <tbody>${genCashRows}</tbody>
                    </table>
                `}

                <!-- 2. General Credit Sales Table -->
                <div class="section-title">
                    <span>2. سجل المبيعات الآجل العامة (${genCreditList.length})</span>
                    <span style="color: #d97706;">الإجمالي: ${totGenCredit.toLocaleString()} ر.س</span>
                </div>
                ${genCreditList.length === 0 ? '<p style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">لا توجد مبيعات آجل عامة مسجلة</p>' : `
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px;">#</th>
                                <th>رقم الفاتورة</th>
                                <th>التاريخ والوقت</th>
                                <th>العميل / المدين</th>
                                <th>الإجمالي</th>
                                <th>المدفوع</th>
                                <th>المتبقي</th>
                            </tr>
                        </thead>
                        <tbody>${genCreditRows}</tbody>
                    </table>
                `}

                <!-- 3. Card Cash Sales Tables (Separated Retail & Wholesale) -->
                <div class="section-title">
                    <span>3.1 سجل مبيعات الكروت النقدية - قطاعي (${cardCashRetailList.length})</span>
                    <span style="color: #059669;">الإجمالي: ${totCardCashRetail.toLocaleString()} ر.ي (عمولة: +${totCardCashRetailComm.toFixed(2)} ر.ي)</span>
                </div>
                ${cardCashRetailList.length === 0 ? '<p style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">لا توجد مبيعات كروت نقدية بالقطاعي</p>' : `
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px;">#</th>
                                <th>الفئة / الشبكة</th>
                                <th>التاريخ والوقت</th>
                                <th>الكمية</th>
                                <th>السعر</th>
                                <th>إجمالي المبيعات</th>
                                <th>العمولة المكتسبة (10%)</th>
                            </tr>
                        </thead>
                        <tbody>${cardCashRetailRows}</tbody>
                    </table>
                `}

                <div class="section-title">
                    <span>3.2 سجل مبيعات الكروت النقدية - جملة (${cardCashWholesaleList.length})</span>
                    <span style="color: #7c3aed;">الإجمالي: ${totCardCashWholesale.toLocaleString()} ر.ي (بدون عمولة)</span>
                </div>
                ${cardCashWholesaleList.length === 0 ? '<p style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">لا توجد مبيعات كروت نقدية بالجملة</p>' : `
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px;">#</th>
                                <th>الفئة / الشبكة</th>
                                <th>التاريخ والوقت</th>
                                <th>الكمية</th>
                                <th>السعر</th>
                                <th>إجمالي المبيعات</th>
                                <th>العمولة المكتسبة</th>
                            </tr>
                        </thead>
                        <tbody>${cardCashWholesaleRows}</tbody>
                    </table>
                `}

                <!-- 4. Card Credit Sales Tables (Separated Retail & Wholesale) -->
                <div class="section-title">
                    <span>4.1 سجل مبيعات الكروت الآجل - قطاعي (${cardCreditRetailList.length})</span>
                    <span style="color: #059669;">الإجمالي: ${totCardCreditRetail.toLocaleString()} ر.ي (عمولة: +${totCardCreditRetailComm.toFixed(2)} ر.ي)</span>
                </div>
                ${cardCreditRetailList.length === 0 ? '<p style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">لا توجد مبيعات كروت آجل بالقطاعي</p>' : `
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px;">#</th>
                                <th>الفئة / الشبكة</th>
                                <th>التاريخ والوقت</th>
                                <th>العميل / المدين</th>
                                <th>الكمية</th>
                                <th>إجمالي المبيعات</th>
                                <th>العمولة المكتسبة (10%)</th>
                            </tr>
                        </thead>
                        <tbody>${cardCreditRetailRows}</tbody>
                    </table>
                `}

                <div class="section-title">
                    <span>4.2 سجل مبيعات الكروت الآجل - جملة (${cardCreditWholesaleList.length})</span>
                    <span style="color: #7c3aed;">الإجمالي: ${totCardCreditWholesale.toLocaleString()} ر.ي (بدون عمولة)</span>
                </div>
                ${cardCreditWholesaleList.length === 0 ? '<p style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">لا توجد مبيعات كروت آجل بالجملة</p>' : `
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px;">#</th>
                                <th>الفئة / الشبكة</th>
                                <th>التاريخ والوقت</th>
                                <th>العميل / المدين</th>
                                <th>الكمية</th>
                                <th>إجمالي المبيعات</th>
                                <th>العمولة المكتسبة</th>
                            </tr>
                        </thead>
                        <tbody>${cardCreditWholesaleRows}</tbody>
                    </table>
                `}

                <!-- 5. Withdrawals Table -->
                <div class="section-title">
                    <span>5. سجل المسحوبات والسلف المالية (${empWithdrawals.length})</span>
                    <span style="color: #dc2626;">الإجمالي: ${totWithdraw.toLocaleString()} ر.ي</span>
                </div>
                ${empWithdrawals.length === 0 ? '<p style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">لا توجد مسحوبات مسجلة خلال هذه الفترة</p>' : `
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 30px;">#</th>
                                <th>التاريخ والوقت</th>
                                <th>المبلغ</th>
                                <th>البيان / الملاحظات</th>
                                <th>صندوق الخصم</th>
                                <th>بواسطة</th>
                            </tr>
                        </thead>
                        <tbody>${withdrawalsRows}</tbody>
                    </table>
                `}

                <div class="signatures">
                    <div>توقيع واستلام الموظف: .......................................</div>
                    <div>اعتماد المسؤول / الحسابات: .......................................</div>
                </div>

                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                        }, 500);
                    };
                </script>
            </body>
            </html>
        `;

        printWin.document.write(htmlContent);
        printWin.document.close();
    };

    // Handle withdrawal submission
    const handleAddWithdrawal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;

        const amountNum = parseFloat(withdrawAmount);
        if (isNaN(amountNum) || amountNum <= 0) {
            alert('يرجى أدخال مبلغ سحب صحيح وأكبر من الصفر');
            return;
        }

        // Limit Check
        const maxLimit = selectedEmployee.maxWithdrawalLimit || 0;
        const currentTotal = getTotalWithdrawals(selectedEmployee);
        const newTotal = currentTotal + amountNum;

        if (maxLimit > 0 && newTotal > maxLimit) {
            const excess = newTotal - maxLimit;
            const confirmMsg = `⚠️ تنبيه النظام: تجاوز سقف المسحوبات للموظف!

• اسم الموظف: ${selectedEmployee.name}
• المسحوبات الحالية: ${currentTotal.toLocaleString()} ر.ي
• مبلغ السحب المطلوب: ${amountNum.toLocaleString()} ر.ي
• الإجمالي الجديد: ${newTotal.toLocaleString()} ر.ي
• سقف السلف المحدد: ${maxLimit.toLocaleString()} ر.ي
• المبلغ المتجاوز للسقف: ${excess.toLocaleString()} ر.ي

تأكيد التجاوز: هل تريد الموافقة والاستمرار في خصم وسحب المبلغ؟`;

            if (!window.confirm(confirmMsg)) {
                return;
            }
        }

        setIsSubmittingWithdraw(true);
        try {
            const isNetworkWorker = selectedEmployee.role !== 'cashier' && selectedEmployee.role !== 'inventory';
            const sourceFund = isNetworkWorker ? 'network_cashbox' : 'general_cashbox';
            const noteText = withdrawNotes.trim() || 'سحب سلفة موظف';
            const rate = settings.yemeniExchangeRate || 140;
            const convertedSarAmount = parseFloat((amountNum / rate).toFixed(2));

            const now = new Date();
            const dateStr = format(now, 'yyyy-MM-dd');
            const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            const staffName = appUser?.name || appUser?.email || 'المسؤول';

            // Determine strictly numeric sequential withdrawal/voucher number
            let nextWithdrawalNum = 1;
            try {
                const qW = query(
                    collection(db, 'employee_withdrawals'),
                    where('tenantId', '==', tenantId)
                );
                const snapW = await getDocs(qW);
                if (!snapW.empty) {
                    const allWNums = snapW.docs.map(d => {
                        const dat = d.data();
                        const val = dat.withdrawalNumber || dat.voucherNumber;
                        if (typeof val === 'number') return val;
                        if (typeof val === 'string') {
                            const digitsOnly = val.replace(/\D/g, '');
                            return digitsOnly ? parseInt(digitsOnly, 10) : 0;
                        }
                        return 0;
                    }).filter(n => !isNaN(n) && n > 0);
                    if (allWNums.length > 0) {
                        nextWithdrawalNum = Math.max(...allWNums) + 1;
                    }
                }
            } catch (err) {
                console.error('Error fetching max withdrawal number:', err);
                nextWithdrawalNum = withdrawals.length + 1;
            }
            const withdrawalNumberStr = nextWithdrawalNum.toString();

            let linkedCardCashboxId: string | null = null;
            let linkedVoucherId: string | null = null;
            let linkedCashId: string | null = null;

            // 1. Deduct from corresponding cash box
            if (isNetworkWorker) {
                // Deduct from network cards cashbox (card_cashbox) directly in Yemeni Rials (YER)
                const cashEntryPayload: any = {
                    tenantId,
                    type: 'manual_out',
                    voucherNumber: withdrawalNumberStr,
                    title: `سند صرف مسحوبات #${withdrawalNumberStr} - الموظف: ${selectedEmployee.name}${noteText ? ` (${noteText})` : ''}`,
                    amount: amountNum,
                    date: dateStr,
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: staffName,
                    isIncome: false,
                    createdBy: staffName,
                    referenceId: withdrawalNumberStr,
                    disbursedByEmployeeId: selectedEmployee.id,
                    disbursedByEmployeeName: selectedEmployee.name,
                    recipientEmployeeId: selectedEmployee.id,
                    recipientEmployeeName: selectedEmployee.name,
                    createdAt: Date.now()
                };
                const cardCashRef = await addDoc(collection(db, 'card_cashbox'), cashEntryPayload);
                linkedCardCashboxId = cardCashRef.id;
                await LocalCache.updateCachedItem('card_cashbox', tenantId, { id: cardCashRef.id, ...cashEntryPayload });
            } else {
                // Deduct from general cash box via payment voucher (vouchers) and cash entry in Saudi Rials (SAR)
                let nextVNum = '1';
                try {
                    const qNum = query(
                        collection(db, 'vouchers'),
                        where('tenantId', '==', tenantId),
                        orderBy('voucherNumber', 'desc')
                    );
                    const snap = await getDocs(qNum);
                    if (!snap.empty) {
                        const allNums = snap.docs.map(d => {
                            const vn = d.data().voucherNumber;
                            if (typeof vn === 'number') return vn;
                            if (typeof vn === 'string') {
                                const digits = vn.replace(/\D/g, '');
                                return digits ? parseInt(digits, 10) : 0;
                            }
                            return 0;
                        }).filter(n => !isNaN(n) && n > 0);
                        const maxNum = allNums.length > 0 ? Math.max(...allNums) : 0;
                        nextVNum = (maxNum + 1).toString();
                    }
                } catch (err) {
                    console.error('Error fetching max voucher number:', err);
                }

                const voucherRef = await addDoc(collection(db, 'vouchers'), {
                    tenantId,
                    voucherNumber: nextVNum,
                    type: 'payment', // صرف من الصندوق العام
                    partyType: 'customer',
                    partyName: `مسحوبات الموظف: ${selectedEmployee.name}`,
                    partyId: selectedEmployee.id,
                    amount: convertedSarAmount,
                    description: `سند صرف #${nextVNum} - مسحوبات وسلفة الموظف: ${selectedEmployee.name}${noteText ? ` - ${noteText}` : ''} (تم السحب بـ ${amountNum} ر.ي بسعر تحويل ${rate})`,
                    date: Date.now(),
                    createdBy: staffName,
                    disbursedByEmployeeId: selectedEmployee.id,
                    disbursedByEmployeeName: selectedEmployee.name,
                    recipientEmployeeId: selectedEmployee.id,
                    recipientEmployeeName: selectedEmployee.name
                });
                linkedVoucherId = voucherRef.id;

                // Also write to general store cash box collection 'cash'
                const cashRef = await addDoc(collection(db, 'cash'), {
                    tenantId,
                    voucherNumber: nextVNum,
                    date: dateStr,
                    amount: convertedSarAmount,
                    type: 'out',
                    category: 'out_payment',
                    description: `سند صرف #${nextVNum} - مسحوبات الموظف: ${selectedEmployee.name}${noteText ? ` - ${noteText}` : ''} (${amountNum} ر.ي)`,
                    referenceId: voucherRef.id,
                    createdBy: appUser?.uid || staffName,
                    createdAt: Date.now(),
                    affectsCash: true
                });
                linkedCashId = cashRef.id;
            }

            // 2. Create employee_withdrawals record (stores original YER amount and numeric voucher number)
            await addDoc(collection(db, 'employee_withdrawals'), {
                tenantId,
                withdrawalNumber: nextWithdrawalNum,
                voucherNumber: withdrawalNumberStr,
                employeeId: selectedEmployee.id,
                employeeName: selectedEmployee.name,
                employeeRole: selectedEmployee.role,
                amount: amountNum,
                notes: noteText,
                date: Date.now(),
                createdBy: staffName,
                sourceFund,
                linkedCardCashboxId,
                linkedVoucherId,
                linkedCashId
            });

            await logUserAction(
                'إضافة سحب للموظف',
                isNetworkWorker 
                    ? `تم سحب مبلغ ${amountNum} ر.ي (سند رقم #${withdrawalNumberStr}) للموظف ${selectedEmployee.name} والخصم من صندوق الشبكات مباشرة${maxLimit > 0 && newTotal > maxLimit ? ' (تجاوز سقف السلف)' : ''}`
                    : `تم سحب مبلغ ${amountNum} ر.ي (سند رقم #${withdrawalNumberStr} يعادل ${convertedSarAmount} ر.س) للموظف ${selectedEmployee.name} والخصم من الصندوق العام${maxLimit > 0 && newTotal > maxLimit ? ' (تجاوز سقف السلف)' : ''}`
            );

            if (isNetworkWorker) {
                alert(`تم تسجيل سند السحب رقم #${withdrawalNumberStr} بنجاح بمبلغ ${amountNum.toLocaleString()} ر.ي والخصم من صندوق الشبكات مباشرة.`);
            } else {
                alert(`تم تسجيل سند السحب رقم #${withdrawalNumberStr} بنجاح بمبلغ ${amountNum.toLocaleString()} ر.ي (يعادل ${convertedSarAmount.toLocaleString()} ر.س تم خصمها من الصندوق العام بسعر صرف ${rate}).`);
            }
            setWithdrawAmount('');
            setWithdrawNotes('');
            setIsWithdrawModalOpen(false);
        } catch (error: any) {
            console.error('Error adding withdrawal:', error);
            handleFirestoreError(error, OperationType.WRITE, 'employee_withdrawals');
            alert('حدث خطأ أثناء تسجيل عملية السحب');
        } finally {
            setIsSubmittingWithdraw(false);
        }
    };

    // Handle withdrawal to another employee from current employee's fund
    const handleWithdrawToOtherEmployee = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;

        const targetEmp = employees.find(emp => emp.id === targetEmployeeId);
        if (!targetEmp) {
            alert('يرجى اختيار الموظف المستفيد من القائمة');
            return;
        }

        const amountNum = parseFloat(withdrawOtherAmount);
        if (isNaN(amountNum) || amountNum <= 0) {
            alert('يرجى إدخال مبلغ سحب صحيح وأكبر من الصفر');
            return;
        }

        // Limit Check for target employee
        const targetMaxLimit = targetEmp.maxWithdrawalLimit || 0;
        const targetCurrentTotal = getTotalWithdrawals(targetEmp);
        const newTotal = targetCurrentTotal + amountNum;

        if (targetMaxLimit > 0 && newTotal > targetMaxLimit) {
            const excess = newTotal - targetMaxLimit;
            const confirmMsg = `⚠️ تنبيه النظام: تجاوز سقف المسحوبات للموظف المستفيد!

• الموظف المستفيد: ${targetEmp.name}
• المسحوبات الحالية: ${targetCurrentTotal.toLocaleString()} ر.ي
• مبلغ السحب المطلوب: ${amountNum.toLocaleString()} ر.ي
• الإجمالي الجديد: ${newTotal.toLocaleString()} ر.ي
• سقف السلف المحدد: ${targetMaxLimit.toLocaleString()} ر.ي
• المبلغ المتجاوز للسقف: ${excess.toLocaleString()} ر.ي
• مصدر الخصم المالي: صندوق ${selectedEmployee.name}

تأكيد التجاوز: هل تريد الموافقة والاستمرار في خصم وصرف المبلغ؟`;

            if (!window.confirm(confirmMsg)) {
                return;
            }
        }

        setIsSubmittingWithdrawOther(true);
        try {
            const isNetworkWorker = selectedEmployee.role !== 'cashier' && selectedEmployee.role !== 'inventory';
            const sourceFund = isNetworkWorker ? 'network_cashbox' : 'general_cashbox';
            const userNote = withdrawOtherNotes.trim();
            const fullNote = userNote 
                ? `${userNote} (صُرف من صندوق: ${selectedEmployee.name})`
                : `سحب سلفة صُرفت من صندوق: ${selectedEmployee.name}`;
                
            const rate = settings.yemeniExchangeRate || 140;
            const convertedSarAmount = parseFloat((amountNum / rate).toFixed(2));

            const now = new Date();
            const dateStr = format(now, 'yyyy-MM-dd');
            const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            const staffName = appUser?.name || appUser?.email || 'المسؤول';

            // Determine strictly numeric sequential withdrawal/voucher number
            let nextWithdrawalNum = 1;
            try {
                const qW = query(
                    collection(db, 'employee_withdrawals'),
                    where('tenantId', '==', tenantId)
                );
                const snapW = await getDocs(qW);
                if (!snapW.empty) {
                    const allWNums = snapW.docs.map(d => {
                        const dat = d.data();
                        const val = dat.withdrawalNumber || dat.voucherNumber;
                        if (typeof val === 'number') return val;
                        if (typeof val === 'string') {
                            const digitsOnly = val.replace(/\D/g, '');
                            return digitsOnly ? parseInt(digitsOnly, 10) : 0;
                        }
                        return 0;
                    }).filter(n => !isNaN(n) && n > 0);
                    if (allWNums.length > 0) {
                        nextWithdrawalNum = Math.max(...allWNums) + 1;
                    }
                }
            } catch (err) {
                console.error('Error fetching max withdrawal number:', err);
                nextWithdrawalNum = withdrawals.length + 1;
            }
            const withdrawalNumberStr = nextWithdrawalNum.toString();

            let linkedCardCashboxId: string | null = null;
            let linkedVoucherId: string | null = null;
            let linkedCashId: string | null = null;

            // 1. Deduct from the CURRENT EMPLOYEE's corresponding cash box
            if (isNetworkWorker) {
                // Deduct from network cards cashbox in YER
                const cashEntryPayload: any = {
                    tenantId,
                    type: 'manual_out',
                    voucherNumber: withdrawalNumberStr,
                    title: `سند صرف #${withdrawalNumberStr} للموظف: ${targetEmp.name} (صُرف من صندوق: ${selectedEmployee.name})${userNote ? ` - ${userNote}` : ''}`,
                    amount: amountNum,
                    date: dateStr,
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: staffName,
                    isIncome: false,
                    createdBy: staffName,
                    referenceId: withdrawalNumberStr,
                    disbursedByEmployeeId: selectedEmployee.id,
                    disbursedByEmployeeName: selectedEmployee.name,
                    recipientEmployeeId: targetEmp.id,
                    recipientEmployeeName: targetEmp.name,
                    createdAt: Date.now()
                };
                const cardCashRef = await addDoc(collection(db, 'card_cashbox'), cashEntryPayload);
                linkedCardCashboxId = cardCashRef.id;
                await LocalCache.updateCachedItem('card_cashbox', tenantId, { id: cardCashRef.id, ...cashEntryPayload });
            } else {
                // Deduct from general store cash box via payment voucher in SAR
                let nextVNum = '1';
                try {
                    const qNum = query(
                        collection(db, 'vouchers'),
                        where('tenantId', '==', tenantId),
                        orderBy('voucherNumber', 'desc')
                    );
                    const snap = await getDocs(qNum);
                    if (!snap.empty) {
                        const allNums = snap.docs.map(d => {
                            const vn = d.data().voucherNumber;
                            if (typeof vn === 'number') return vn;
                            if (typeof vn === 'string') {
                                const digits = vn.replace(/\D/g, '');
                                return digits ? parseInt(digits, 10) : 0;
                            }
                            return 0;
                        }).filter(n => !isNaN(n) && n > 0);
                        const maxNum = allNums.length > 0 ? Math.max(...allNums) : 0;
                        nextVNum = (maxNum + 1).toString();
                    }
                } catch (err) {
                    console.error('Error fetching max voucher number:', err);
                }

                const voucherRef = await addDoc(collection(db, 'vouchers'), {
                    tenantId,
                    voucherNumber: nextVNum,
                    type: 'payment',
                    partyType: 'customer',
                    partyName: `سحب للموظف: ${targetEmp.name} (صندوق ${selectedEmployee.name})`,
                    partyId: targetEmp.id,
                    amount: convertedSarAmount,
                    description: `سند صرف #${nextVNum} - سحب للموظف: ${targetEmp.name} صُرف من صندوق ${selectedEmployee.name}${userNote ? ` - ${userNote}` : ''} (سحب ${amountNum} ر.ي بسعر صرف ${rate})`,
                    date: Date.now(),
                    createdBy: staffName,
                    disbursedByEmployeeId: selectedEmployee.id,
                    disbursedByEmployeeName: selectedEmployee.name,
                    recipientEmployeeId: targetEmp.id,
                    recipientEmployeeName: targetEmp.name
                });
                linkedVoucherId = voucherRef.id;

                // Also write to general store cash box collection 'cash'
                const cashRef = await addDoc(collection(db, 'cash'), {
                    tenantId,
                    voucherNumber: nextVNum,
                    date: dateStr,
                    amount: convertedSarAmount,
                    type: 'out',
                    category: 'out_payment',
                    description: `سند صرف #${nextVNum} - سحب للموظف: ${targetEmp.name} (صُرف من صندوق ${selectedEmployee.name})`,
                    referenceId: voucherRef.id,
                    createdBy: appUser?.uid || staffName,
                    createdAt: Date.now(),
                    affectsCash: true
                });
                linkedCashId = cashRef.id;
            }

            // 2. Create employee_withdrawals record for the TARGET EMPLOYEE (registered on target employee only)
            await addDoc(collection(db, 'employee_withdrawals'), {
                tenantId,
                withdrawalNumber: nextWithdrawalNum,
                voucherNumber: withdrawalNumberStr,
                employeeId: targetEmp.id,
                employeeName: targetEmp.name,
                employeeRole: targetEmp.role,
                amount: amountNum,
                notes: fullNote,
                date: Date.now(),
                createdBy: staffName,
                sourceFund,
                withdrawnFromEmployeeId: selectedEmployee.id,
                withdrawnFromEmployeeName: selectedEmployee.name,
                withdrawnFromEmployeeRole: selectedEmployee.role,
                linkedCardCashboxId,
                linkedVoucherId,
                linkedCashId
            });

            await logUserAction(
                'سحب لموظف آخر من صندوق موظف',
                isNetworkWorker
                    ? `تم صرف سحب رقم #${withdrawalNumberStr} بمبلغ ${amountNum} ر.ي للموظف ${targetEmp.name} من صندوق كروت الشبكة للموظف ${selectedEmployee.name}`
                    : `تم صرف سحب رقم #${withdrawalNumberStr} بمبلغ ${amountNum} ر.ي (يعادل ${convertedSarAmount} ر.س) للموظف ${targetEmp.name} من الصندوق العام للموظف ${selectedEmployee.name}`
            );

            alert(`تمت عملية السحب بنجاح (سند رقم #${withdrawalNumberStr})!\n• الموظف المستفيد: ${targetEmp.name}\n• المبلغ المسجل عليه: ${amountNum.toLocaleString()} ر.ي\n• تم الخصم المالي من صندوق: ${selectedEmployee.name} (${isNetworkWorker ? 'صندوق كروت الشبكة' : 'الصندوق العام'}) دون إضافة سلفة على رصيده.`);

            setTargetEmployeeId('');
            setWithdrawOtherAmount('');
            setWithdrawOtherNotes('');
            setIsWithdrawOtherModalOpen(false);
        } catch (error: any) {
            console.error('Error adding withdrawal to other employee:', error);
            handleFirestoreError(error, OperationType.WRITE, 'employee_withdrawals');
            alert('حدث خطأ أثناء تسجيل عملية السحب للموظف الآخر');
        } finally {
            setIsSubmittingWithdrawOther(false);
        }
    };

    // Handle salary and limit update
    const handleUpdateSalary = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;

        const salaryVal = parseFloat(editSalaryInput) || 0;
        const maxLimitVal = parseFloat(editMaxLimitInput) || 0;
        setIsSubmittingSalary(true);
        try {
            await updateDoc(doc(db, 'users', selectedEmployee.id), {
                salary: salaryVal,
                maxWithdrawalLimit: maxLimitVal,
                updatedAt: Date.now()
            });

            await logUserAction(
                'تعديل بيانات الموظف والراتب',
                `تم تحديث راتب الموظف ${selectedEmployee.name} إلى ${salaryVal} ر.ي وسقف السلف إلى ${maxLimitVal} ر.ي`
            );

            alert('تم تعديل بيانات الراتب وسقف المسحوبات بنجاح');
            setIsSalaryModalOpen(false);
        } catch (error: any) {
            console.error('Error updating salary:', error);
            handleFirestoreError(error, OperationType.UPDATE, 'users');
            alert('حدث خطأ أثناء حفظ البيانات');
        } finally {
            setIsSubmittingSalary(false);
        }
    };

    if (!hasEmployeesViewPermission) {
        return (
            <div className="p-8 text-center" dir="rtl">
                <div className="max-w-md mx-auto bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/50 rounded-2xl p-6 shadow-sm">
                    <div className="w-12 h-12 bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-3">
                        <ShieldAlert size={24} />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">غير مصرح بالدخول</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        ليس لديك صلاحية لعرض قسم الموظفين وبيانات الحساب. يرجى التواصل مع إدارة النظام لتفعيل الصلاحية.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-2 sm:p-3 space-y-3 max-w-7xl mx-auto pb-12 text-right w-full overflow-x-hidden" dir="rtl">
            {/* MAIN CONTENT AREA */}
            {!selectedEmployee ? (
                /* SECTION 1: GRID OF ALL EMPLOYEES (SQUARES / CARDS) */
                <div className="space-y-3">
                    {/* Header with Search and Detailed Withdrawals Report Button */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
                                <Users size={18} />
                            </div>
                            <div>
                                <h2 className="text-sm font-black text-slate-900 dark:text-white">قائمة الموظفين والرواتب</h2>
                                <p className="text-[10px] text-slate-400">إجمالي الموظفين: {employees.length}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative flex-1 sm:w-60">
                                <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="بحث باسم الموظف أو البريد..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pr-7 pl-2.5 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                                />
                            </div>

                            {/* Detailed Withdrawals Report Button */}
                            <button
                                type="button"
                                onClick={() => setIsWithdrawalsReportModalOpen(true)}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
                                title="تقرير سحوبات وخصومات كافة الموظفين التفصيلي"
                            >
                                <FileSpreadsheet size={14} />
                                <span>تقرير السحوبات والخصومات</span>
                            </button>
                        </div>
                    </div>

                    {!isManagerOverviewOpen ? (
                        filteredEmployees.length === 0 ? (
                            <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-slate-200 dark:border-slate-800">
                                <Users size={40} className="mx-auto text-slate-300 dark:text-slate-700 mb-2 stroke-[1.5]" />
                                <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1">لا يوجد موظفين مطابقين</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    يمكنك تعيين دور (كاشير، أمين مخزن، أو عامل شبكة) لأي مستخدم من قسم إعدادات المستخدمين ليظهر هنا تلقائياً.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                                {/* SPECIAL INTEGRATED CARD: MANAGER CASHBOX / EMPLOYEE FUNDS MANAGER */}
                                {appUser?.role === 'admin' && (
                                    <div
                                        onClick={() => {
                                            setSelectedEmployee(null);
                                            setIsManagerOverviewOpen(true);
                                        }}
                                        className="group bg-gradient-to-br from-purple-500/10 via-purple-600/5 to-indigo-500/10 dark:from-purple-950/40 dark:to-indigo-950/30 rounded-xl border-2 border-purple-500/80 dark:border-purple-600 p-3 shadow-2xs hover:shadow-md hover:border-purple-600 transition-all cursor-pointer flex flex-col justify-between space-y-3"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="p-2.5 rounded-xl bg-purple-600 text-white font-black shadow-2xs shrink-0">
                                                    <Coins size={20} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="font-black text-slate-900 dark:text-white text-sm truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition">
                                                        صناديق الموظفين (صندوق المدير)
                                                    </h3>
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md mt-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300">
                                                        قسم صندوق المدير المالي
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Summary Numbers */}
                                        <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-purple-200/80 dark:border-purple-900/50 text-[10px] font-bold">
                                            <div className="text-purple-700 dark:text-purple-300 truncate">
                                                <span className="block text-slate-500 dark:text-slate-400 text-[9px]">قائم مبيعات المحل:</span>
                                                <span className="font-mono text-xs">{employees.reduce((acc, emp) => acc + getEmployeeGeneralFundNetBalance(emp), 0).toLocaleString()} ر.س</span>
                                            </div>
                                            <div className="text-indigo-600 dark:text-indigo-400 truncate">
                                                <span className="block text-slate-500 dark:text-slate-400 text-[9px]">قائم مبيعات الكروت:</span>
                                                <span className="font-mono text-xs">{employees.reduce((acc, emp) => acc + getEmployeeCardFundNetBalance(emp), 0).toLocaleString()} ر.ي</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between text-xs font-bold text-purple-600 dark:text-purple-400 pt-1 group-hover:underline">
                                            <span>دخول قسم مدير الصناديق</span>
                                            <ArrowLeft size={14} />
                                        </div>
                                    </div>
                                )}

                                {filteredEmployees.map((emp) => {
                                    const roleInfo = roleConfig[emp.role] || {
                                        label: emp.role,
                                        icon: UserCheck,
                                        color: 'text-slate-600',
                                        bg: 'bg-slate-100',
                                        border: 'border-slate-200'
                                    };
                                    const RoleIcon = roleInfo.icon;

                                    return (
                                        <div
                                            key={emp.id}
                                            onClick={() => {
                                                setIsManagerOverviewOpen(false);
                                                setSelectedEmployee(emp);
                                            }}
                                            className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800/90 p-3 shadow-2xs hover:shadow-md hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer flex flex-col justify-between space-y-3"
                                        >
                                            {/* Card Header */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-2.5">
                                                    <div className={`p-2.5 rounded-xl ${roleInfo.bg} ${roleInfo.color} ${roleInfo.border} border shrink-0`}>
                                                        <RoleIcon size={20} className="stroke-[2.2]" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3 className="font-black text-slate-900 dark:text-white text-sm truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                                                            {emp.name}
                                                        </h3>
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md mt-0.5 ${roleInfo.bg} ${roleInfo.color}`}>
                                                            {roleInfo.label}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* View Details Action Link */}
                                            <div className="flex items-center justify-between text-xs font-bold text-indigo-600 dark:text-indigo-400 pt-2 border-t border-slate-100 dark:border-slate-800/80 group-hover:underline">
                                                <span>فتح ملف الموظف والمسحوبات</span>
                                                <ArrowLeft size={14} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )
                    ) : (
                        /* FULL INTEGRATED SECTION FOR MANAGER CASHBOX / EMPLOYEE FUNDS */
                        <div className="space-y-4 animate-in fade-in duration-200">
                            {/* Worker / Manager Banner Info */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-3 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-2xs">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="p-2.5 rounded-xl bg-purple-600 text-white font-black shadow-xs shrink-0">
                                        <Coins size={22} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">قسم مدير صناديق الموظفين وتصفية المبالغ</h2>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                                صندوق المدير
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            إدارة وتصفية المبالغ المتبقية لدى كافة الموظفين وتوريدها لصندوق المدير عبر نظام السندات دون أي تأثير على الصناديق العامة.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setClearanceBoxType('general_cashbox');
                                            setClearanceAmount('');
                                            setClearanceNotes('');
                                            setIsManagerClearanceModalOpen(true);
                                        }}
                                        className="h-9 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                                    >
                                        <Plus size={14} />
                                        <span>إجراء تصفية / استلام مبلغ</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setIsWithdrawalsReportModalOpen(true)}
                                        className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                                    >
                                        <FileSpreadsheet size={14} />
                                        <span>تقرير السحوبات</span>
                                    </button>
                                </div>
                            </div>

                            {/* Top KPI Cards Summary across ALL Employees */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {/* Total General Fund Remaining across all employees */}
                                <div className="p-3.5 bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-900/40 rounded-xl space-y-1 shadow-2xs">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                                            <ShoppingBag size={14} className="text-purple-600" />
                                            إجمالي القائم لدى الموظفين (مبيعات المحل)
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                                            ر.س
                                        </span>
                                    </div>
                                    <div className="text-xl font-black font-mono text-purple-700 dark:text-purple-400 pt-1">
                                        {employees.reduce((acc, emp) => acc + getEmployeeGeneralFundNetBalance(emp), 0).toLocaleString()} <span className="text-xs font-sans">ر.س</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 pt-1 border-t border-purple-100 dark:border-purple-900/50 flex justify-between">
                                        <span>المجموع المصفى سابقاً لصندوق المدير:</span>
                                        <span className="font-bold text-purple-700 dark:text-purple-300 font-mono">
                                            {managerClearances.filter(c => c.boxType === 'general_cashbox').reduce((a, b) => a + Number(b.amount || 0), 0).toLocaleString()} ر.س
                                        </span>
                                    </div>
                                </div>

                                {/* Total Card Fund Remaining across all employees */}
                                <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/40 rounded-xl space-y-1 shadow-2xs">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                                            <Wifi size={14} className="text-indigo-600" />
                                            إجمالي القائم لدى الموظفين (مبيعات الكروت)
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                                            ر.ي
                                        </span>
                                    </div>
                                    <div className="text-xl font-black font-mono text-indigo-700 dark:text-indigo-400 pt-1">
                                        {employees.reduce((acc, emp) => acc + getEmployeeCardFundNetBalance(emp), 0).toLocaleString()} <span className="text-xs font-sans">ر.ي</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 pt-1 border-t border-indigo-100 dark:border-indigo-900/50 flex justify-between">
                                        <span>المجموع المصفى سابقاً لصندوق المدير:</span>
                                        <span className="font-bold text-indigo-700 dark:text-indigo-300 font-mono">
                                            {managerClearances.filter(c => c.boxType === 'card_cashbox').reduce((a, b) => a + Number(b.amount || 0), 0).toLocaleString()} ر.ي
                                        </span>
                                    </div>
                                </div>

                                {/* Total Clearances Count & Manager Box Status */}
                                <div className="p-3.5 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/40 rounded-xl space-y-1 shadow-2xs">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                                            <Receipt size={14} className="text-emerald-600" />
                                            عدد سندات التصفية المكتملة
                                        </span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300">
                                            سند
                                        </span>
                                    </div>
                                    <div className="text-xl font-black font-mono text-emerald-700 dark:text-emerald-400 pt-1">
                                        {managerClearances.length} <span className="text-xs font-sans">سند مالي</span>
                                    </div>
                                    <div className="text-[10px] text-emerald-700 dark:text-emerald-300 pt-1 border-t border-emerald-100 dark:border-emerald-900/50">
                                        حالة صندوق المدير: <span className="font-bold">نشط ومُحدث آلياً</span>
                                    </div>
                                </div>
                            </div>

                            {/* Section A: Employee Funds Balances Table */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-3.5 space-y-3 shadow-2xs">
                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                                        <Users size={16} className="text-purple-600" />
                                        أرصدة صناديق الموظفين القائمة والإجراءات ({employees.length})
                                    </h3>
                                    <span className="text-[11px] text-slate-500 font-medium">
                                        الخصم يتم من صندوق الموظف المختار فقط
                                    </span>
                                </div>

                                <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                                    <table className="w-full min-w-max text-right text-xs whitespace-nowrap">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-extrabold text-[11px]">
                                                <th className="py-3 px-4">الموظف والدور</th>
                                                <th className="py-3 px-4">صندوق المحل المتبقي (ر.س)</th>
                                                <th className="py-3 px-4">صندوق الكروت المتبقي (ر.ي)</th>
                                                <th className="py-3 px-4">إجمالي ما تصفى للمدير سابقاً</th>
                                                <th className="py-3 px-4 text-center">إجراء تصفية مالي مباشر</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                                            {employees.map((emp) => {
                                                const generalNet = getEmployeeGeneralFundNetBalance(emp);
                                                const cardNet = getEmployeeCardFundNetBalance(emp);
                                                const empClearances = managerClearances.filter(c => c.employeeId === emp.id);
                                                const totalSarCleared = empClearances.filter(c => c.boxType === 'general_cashbox').reduce((a, b) => a + Number(b.amount || 0), 0);
                                                const totalYerCleared = empClearances.filter(c => c.boxType === 'card_cashbox').reduce((a, b) => a + Number(b.amount || 0), 0);
                                                const hasFunds = generalNet > 0 || cardNet > 0;

                                                return (
                                                    <tr key={emp.id} className="hover:bg-slate-50/85 dark:hover:bg-slate-950/40 transition">
                                                        <td className="py-3 px-4">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-extrabold text-xs">
                                                                    {emp.name.charAt(0)}
                                                                </div>
                                                                <div>
                                                                    <div className="font-extrabold text-slate-900 dark:text-white text-xs">{emp.name}</div>
                                                                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                                                                        {roleConfig[emp.role]?.label || emp.role}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            {generalNet > 0 ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-mono font-black text-xs border border-emerald-100 dark:border-emerald-900/40">
                                                                    <Coins size={12} />
                                                                    {generalNet.toLocaleString()} ر.س
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 dark:text-slate-600 font-mono text-xs">0 ر.س</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            {cardNet > 0 ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 font-mono font-black text-xs border border-indigo-100 dark:border-indigo-900/40">
                                                                    <Wifi size={12} />
                                                                    {cardNet.toLocaleString()} ر.ي
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 dark:text-slate-600 font-mono text-xs">0 ر.ي</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <div className="text-slate-700 dark:text-slate-300 font-mono font-semibold text-[11px] space-y-0.5">
                                                                {totalSarCleared > 0 && (
                                                                    <div className="text-emerald-600 dark:text-emerald-400 font-bold">• {totalSarCleared.toLocaleString()} ر.س</div>
                                                                )}
                                                                {totalYerCleared > 0 && (
                                                                    <div className="text-indigo-600 dark:text-indigo-400 font-bold">• {totalYerCleared.toLocaleString()} ر.ي</div>
                                                                )}
                                                                {totalSarCleared === 0 && totalYerCleared === 0 && (
                                                                    <span className="text-slate-400 dark:text-slate-600">-</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4 text-center">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedEmployee(emp);
                                                                    setClearanceBoxType(generalNet > 0 ? 'general_cashbox' : 'card_cashbox');
                                                                    setClearanceAmount(generalNet > 0 ? generalNet.toString() : (cardNet > 0 ? cardNet.toString() : ''));
                                                                    setClearanceNotes('');
                                                                    setIsManagerClearanceModalOpen(true);
                                                                }}
                                                                className={`px-3 py-1.5 font-bold rounded-lg text-xs shadow-xs transition flex items-center gap-1.5 mx-auto cursor-pointer ${
                                                                    hasFunds 
                                                                        ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                                }`}
                                                            >
                                                                <Coins size={13} />
                                                                <span>{hasFunds ? 'تصفية صندوق الموظف' : 'الصندوق مصفّر'}</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Responsive Card Grid for Mobile */}
                                <div className="block md:hidden space-y-3">
                                    {employees.map((emp) => {
                                        const generalNet = getEmployeeGeneralFundNetBalance(emp);
                                        const cardNet = getEmployeeCardFundNetBalance(emp);
                                        const empClearances = managerClearances.filter(c => c.employeeId === emp.id);
                                        const totalSarCleared = empClearances.filter(c => c.boxType === 'general_cashbox').reduce((a, b) => a + Number(b.amount || 0), 0);
                                        const totalYerCleared = empClearances.filter(c => c.boxType === 'card_cashbox').reduce((a, b) => a + Number(b.amount || 0), 0);
                                        const hasFunds = generalNet > 0 || cardNet > 0;

                                        return (
                                            <div key={emp.id} className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-150 dark:border-slate-800/80 space-y-3">
                                                {/* Header Info */}
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-extrabold text-xs">
                                                        {emp.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <div className="font-extrabold text-slate-900 dark:text-white text-xs">{emp.name}</div>
                                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                            {roleConfig[emp.role]?.label || emp.role}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Grid Boxes for Balances */}
                                                <div className="grid grid-cols-2 gap-2">
                                                    {/* General Cash Balance */}
                                                    <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/60 dark:border-slate-800/60">
                                                        <div className="text-[9px] text-slate-400 font-bold mb-1">مبيعات المحل (ر.س)</div>
                                                        {generalNet > 0 ? (
                                                            <div className="text-xs font-black font-mono text-emerald-600 dark:text-emerald-400">
                                                                {generalNet.toLocaleString()} ر.س
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs font-mono text-slate-400 dark:text-slate-600">مصفّر</div>
                                                        )}
                                                    </div>

                                                    {/* Network Cards Balance */}
                                                    <div className="p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/60 dark:border-slate-800/60">
                                                        <div className="text-[9px] text-slate-400 font-bold mb-1">مبيعات الكروت (ر.ي)</div>
                                                        {cardNet > 0 ? (
                                                            <div className="text-xs font-black font-mono text-indigo-600 dark:text-indigo-400">
                                                                {cardNet.toLocaleString()} ر.ي
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs font-mono text-slate-400 dark:text-slate-600">مصفّر</div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* History of Clearances Summary */}
                                                {(totalSarCleared > 0 || totalYerCleared > 0) && (
                                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-150/40 dark:bg-slate-900/40 p-1.5 rounded-lg border border-slate-150 dark:border-slate-800/50 flex flex-wrap justify-between gap-1">
                                                        <span>تصفية سابقة للمدير:</span>
                                                        <div className="font-mono font-bold flex gap-2">
                                                            {totalSarCleared > 0 && <span className="text-emerald-600">{totalSarCleared.toLocaleString()} ر.س</span>}
                                                            {totalYerCleared > 0 && <span className="text-indigo-600">{totalYerCleared.toLocaleString()} ر.ي</span>}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Action Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedEmployee(emp);
                                                        setClearanceBoxType(generalNet > 0 ? 'general_cashbox' : 'card_cashbox');
                                                        setClearanceAmount(generalNet > 0 ? generalNet.toString() : (cardNet > 0 ? cardNet.toString() : ''));
                                                        setClearanceNotes('');
                                                        setIsManagerClearanceModalOpen(true);
                                                    }}
                                                    className={`w-full py-2 font-bold rounded-lg text-xs shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                                        hasFunds 
                                                            ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                                                            : 'bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                    }`}
                                                >
                                                    <Coins size={13} />
                                                    <span>{hasFunds ? 'تصفية واستلام صندوق الموظف' : 'الصندوق مصفّر بالكامل'}</span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Section B: All Clearance Vouchers History Table */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-3.5 space-y-3 shadow-2xs">
                                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                                        <Receipt size={16} className="text-purple-600" />
                                        سجل سندات التصفية واستلام مبالغ الموظفين التاريخي ({managerClearances.length})
                                    </h3>
                                    <span className="text-[11px] text-slate-500 font-medium">
                                        سندات رسمية مسجلة ومحفوظة
                                    </span>
                                </div>

                                {managerClearances.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 text-xs">
                                        لا توجد سندات تصفية نقدية سابقة لصندوق المدير حتى الآن.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                                        <table className="w-full min-w-max text-right text-xs whitespace-nowrap">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-extrabold">
                                                    <th className="py-3 px-3">رقم السند</th>
                                                    <th className="py-3 px-3">التاريخ والوقت</th>
                                                    <th className="py-3 px-3">الموظف المصفى</th>
                                                    <th className="py-3 px-3">نوع الصندوق</th>
                                                    <th className="py-3 px-3">المبلغ المصفى</th>
                                                    <th className="py-3 px-3">البيان والملاحظات</th>
                                                    <th className="py-3 px-3">المستلم (المدير)</th>
                                                    <th className="py-3 px-3 text-center">إجراءات السند</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                                                {managerClearances.map((rec) => (
                                                    <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/50 transition">
                                                        <td className="py-2.5 px-3 font-mono font-bold text-purple-600 dark:text-purple-400">
                                                            #{rec.clearanceNumber}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                                                            {rec.createdAt ? new Date(rec.createdAt).toLocaleString('ar-SA') : '-'}
                                                        </td>
                                                        <td className="py-2.5 px-3 font-extrabold text-slate-900 dark:text-white">
                                                            {rec.employeeName}
                                                        </td>
                                                        <td className="py-2.5 px-3">
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${rec.boxType === 'card_cashbox' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'}`}>
                                                                {rec.boxType === 'card_cashbox' ? 'صندوق الكروت (ر.ي)' : 'صندوق المحل (ر.س)'}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-3 font-mono font-extrabold text-sm text-slate-900 dark:text-white">
                                                            {rec.amount.toLocaleString()} <span className="text-xs font-sans font-bold">{rec.currency}</span>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 text-[11px] max-w-xs truncate" title={rec.notes}>
                                                            {rec.notes || '-'}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                                                            {rec.managerName}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-center">
                                                            <div className="flex items-center justify-center gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSelectedClearanceVoucher(rec)}
                                                                    className="p-1.5 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                                                    title="معاينة وطباعة سند التصفية المالي"
                                                                >
                                                                    <Printer size={13} />
                                                                    <span>السند</span>
                                                                </button>
                                                                {canViewAllEmployees && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteManagerClearance(rec)}
                                                                        className="p-1.5 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold transition cursor-pointer"
                                                                        title="حذف هذا السند وإعادة ضبط رصيد الموظف التلقائي"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* SECTION 2: SINGLE EMPLOYEE DETAILED PROFILE VIEW */
                <div className="space-y-3">
                    {/* Worker Banner Info */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 p-2.5 sm:p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3 shadow-2xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-base font-black shadow-sm shrink-0">
                                {selectedEmployee.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">{selectedEmployee.name}</span>
                                    <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900 shrink-0">
                                        {roleConfig[selectedEmployee.role]?.label || selectedEmployee.role}
                                    </span>
                                </div>
                                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                                    {selectedEmployee.email}
                                </p>
                            </div>
                        </div>

                        {/* All actions on the SAME SINGLE ROW: Add Withdrawal, Withdraw to Other, Download PDF, Detailed Report, Filter */}
                        <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto max-w-full py-0.5">
                            {/* 1. إضافة سحب */}
                            <button
                                type="button"
                                onClick={() => {
                                    setWithdrawAmount('');
                                    setWithdrawNotes('');
                                    setIsWithdrawModalOpen(true);
                                }}
                                className="h-8 px-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0 whitespace-nowrap"
                                title="سحب سلفة لهذا الموظف"
                            >
                                <Plus size={13} />
                                <span>إضافة سحب</span>
                            </button>

                            {/* 2. سحب لموظف آخر */}
                            <button
                                type="button"
                                onClick={() => {
                                    setTargetEmployeeId('');
                                    setWithdrawOtherAmount('');
                                    setWithdrawOtherNotes('');
                                    setIsWithdrawOtherModalOpen(true);
                                }}
                                className="h-8 px-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0 whitespace-nowrap"
                                title="سحب لموظف آخر يُخصم من صندوق هذا الموظف"
                            >
                                <ArrowRightLeft size={13} />
                                <span>سحب لموظف آخر</span>
                            </button>

                            {/* 3. تصفية صندوق الموظف (صندوق المدير) */}
                            {canViewAllEmployees && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setClearanceBoxType('general_cashbox');
                                        setClearanceAmount('');
                                        setClearanceNotes('');
                                        setIsManagerClearanceModalOpen(true);
                                    }}
                                    className="h-8 px-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0 whitespace-nowrap"
                                    title="تصفية واستلام مبالغ من صندوق الموظف إلى صندوق المدير"
                                >
                                    <Coins size={13} />
                                    <span>تصفية صندوق الموظف</span>
                                </button>
                            )}

                            {/* 3. أيقونة التنزيل (PDF) */}
                            <button
                                type="button"
                                onClick={() => handleExportPdf(selectedEmployee)}
                                className="h-8 w-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs transition cursor-pointer shrink-0 flex items-center justify-center"
                                title="تصدير وتنزيل كشف حساب (PDF)"
                                aria-label="تنزيل كشف حساب PDF"
                            >
                                <Download size={15} />
                            </button>

                            {/* 4. أيقونة تقرير السحوبات والخصومات التفصيلي بجانب أيقونة التنزيل */}
                            <button
                                type="button"
                                onClick={() => setIsWithdrawalsReportModalOpen(true)}
                                className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs transition cursor-pointer shrink-0 flex items-center justify-center"
                                title="تقرير سحوبات وخصومات الموظفين التفصيلي (فلترة حسب الموظف والتاريخ)"
                                aria-label="تقرير السحوبات والخصومات التفصيلي"
                            >
                                <FileSpreadsheet size={15} />
                            </button>

                            {/* 5. أيقونة وقائمة الفلترة بنفس السطر تماماً */}
                            <div className="relative shrink-0 flex items-center">
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="pl-2 pr-7 h-8 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 cursor-pointer appearance-none shadow-2xs transition whitespace-nowrap"
                                    title="تصفية وفلترة البيانات حسب الشهر"
                                >
                                    {getAvailableMonths().map(m => (
                                        <option key={m} value={m}>
                                            {getArabicMonthName(m)}
                                        </option>
                                    ))}
                                    <option value="all">جميع الأشهر</option>
                                </select>
                                <Filter size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-indigo-600 dark:text-indigo-400 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {/* THE 6 PRIMARY INTERACTIVE FINANCIAL METRIC CARDS AT THE TOP OF EMPLOYEE VIEW */}
                    {(() => {
                        const monthWithdrawalsList = getFilteredWithdrawals(selectedEmployee);
                        const filteredTotWithdraw = monthWithdrawalsList.reduce((sum, w) => sum + (parseFloat(String(w.amount)) || 0), 0);

                        const monthCardSalesList = getFilteredCardSales(selectedEmployee).filter(cs => matchesMonthFilter(cs.createdAt || (cs.date ? new Date(cs.date).getTime() : 0)));
                        const filteredTotComm = monthCardSalesList.reduce((sum, s) => sum + (parseFloat(String(s.commissionAmount)) || 0), 0);

                        const monthGenSalesList = getEmployeeGeneralSales(selectedEmployee).filter(inv => matchesMonthFilter(inv.createdAt || inv.date));

                        // 1. General Cash Sales
                        const genCashItems = monthGenSalesList.filter(inv => inv.paymentType !== 'credit' && inv.paymentType !== 'deferred' && inv.paymentType !== 'اجل');
                        const totGenCash = genCashItems.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

                        // 2. General Credit Sales
                        const genCreditItems = monthGenSalesList.filter(inv => inv.paymentType === 'credit' || inv.paymentType === 'deferred' || inv.paymentType === 'اجل');
                        const totGenCredit = genCreditItems.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

                        // 3. Card Cash Sales
                        const cardCashItems = monthCardSalesList.filter(cs => cs.saleType !== 'credit' && cs.paymentType !== 'credit' && cs.paymentType !== 'deferred');
                        const totCardCash = cardCashItems.reduce((sum, cs) => sum + (Number(cs.totalAmount) || 0), 0);

                        // 4. Card Credit Sales
                        const cardCreditItems = monthCardSalesList.filter(cs => cs.saleType === 'credit' || cs.paymentType === 'credit' || cs.paymentType === 'deferred');
                        const totCardCredit = cardCreditItems.reduce((sum, cs) => sum + (Number(cs.totalAmount) || 0), 0);

                        // 5. Salary + Commissions
                        const baseSalary = selectedEmployee.salary || 0;
                        const totSalaryPlusCommissions = baseSalary + filteredTotComm;

                        // 6. Withdrawals
                        const maxLim = selectedEmployee.maxWithdrawalLimit || 0;
                        const isExceed = maxLim > 0 && filteredTotWithdraw > maxLim;

                        // Alert threshold at 50%
                        const alertThresholdPercent = 50;
                        const withdrawalPercentage = baseSalary > 0 ? (filteredTotWithdraw / baseSalary) * 100 : 0;
                        const isPercentageAlert = baseSalary > 0 && withdrawalPercentage >= alertThresholdPercent;

                        const isManager = appUser?.role === 'admin' || (appUser?.role as string) === 'manager';
                        const isSelf = appUser?.uid === selectedEmployee.id || (!!appUser?.email && !!selectedEmployee.email && appUser.email.toLowerCase() === selectedEmployee.email.toLowerCase());
                        const canSeeAlert = isManager || isSelf;

                        return (
                            <div className="space-y-2.5">
                                {/* VISUAL ALERT BANNER IF WITHDRAWALS EXCEED 50% OF SALARY */}
                                {canSeeAlert && isPercentageAlert && (
                                    <div className="bg-amber-50/90 dark:bg-amber-950/50 border border-amber-400 dark:border-amber-700/80 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-2xs">
                                        <div className="flex items-start sm:items-center gap-2.5">
                                            <div className="p-2 bg-amber-500 text-white rounded-lg shadow-xs shrink-0">
                                                <AlertTriangle size={18} className="stroke-[2.5]" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className="font-extrabold text-xs text-amber-950 dark:text-amber-200">
                                                        تنبيه: تجاوزت المسحوبات {alertThresholdPercent}٪ من الراتب الشهري
                                                    </h4>
                                                    <span className="px-1.5 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 font-mono font-black rounded-md text-[10px] border border-amber-300 dark:border-amber-800">
                                                        {withdrawalPercentage.toFixed(1)}٪
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-amber-800 dark:text-amber-300/90 font-medium mt-0.5">
                                                    بلغت مسحوبات الشهر الحالي ({filteredTotWithdraw.toLocaleString()} ر.ي)، مما يمثل {withdrawalPercentage.toFixed(1)}٪ من إجمالي الراتب الشهري المعتمد ({baseSalary.toLocaleString()} ر.ي).
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* THE 6 TOP INTERACTIVE METRIC CARDS - STRICTLY 3 PER ROW */}
                                <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
                                    {/* 1. المبيعات النقدية */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveMetricModal('gen_cash')}
                                        className="text-right p-2 sm:p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 hover:border-emerald-500 hover:shadow-xs transition-all cursor-pointer space-y-1 group relative overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-[11px] sm:text-xs font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 min-w-0 truncate">
                                                <div className="p-1 sm:p-1.5 bg-emerald-100 dark:bg-emerald-950/80 rounded-lg shrink-0">
                                                    <ShoppingBag size={14} className="text-emerald-600 dark:text-emerald-400" />
                                                </div>
                                                <span className="truncate">المبيعات النقدية</span>
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-sm sm:text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono truncate">
                                                {totGenCash.toLocaleString()} <span className="text-[10px] font-bold">ر.س</span>
                                            </div>
                                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-0.5 group-hover:text-emerald-600 truncate">
                                                <FileText size={11} />
                                                التفاصيل وPDF
                                            </p>
                                        </div>
                                    </button>

                                    {/* 2. المبيعات الآجل */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveMetricModal('gen_credit')}
                                        className="text-right p-2 sm:p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 hover:border-amber-500 hover:shadow-xs transition-all cursor-pointer space-y-1 group relative overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-[11px] sm:text-xs font-extrabold text-amber-700 dark:text-amber-400 flex items-center gap-1 min-w-0 truncate">
                                                <div className="p-1 sm:p-1.5 bg-amber-100 dark:bg-amber-950/80 rounded-lg shrink-0">
                                                    <Receipt size={14} className="text-amber-600 dark:text-amber-400" />
                                                </div>
                                                <span className="truncate">المبيعات الآجل</span>
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-sm sm:text-lg font-black text-amber-600 dark:text-amber-400 font-mono truncate">
                                                {totGenCredit.toLocaleString()} <span className="text-[10px] font-bold">ر.س</span>
                                            </div>
                                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-0.5 group-hover:text-amber-600 truncate">
                                                <FileText size={11} />
                                                التفاصيل وPDF
                                            </p>
                                        </div>
                                    </button>

                                    {/* 3. الكروت نقدي */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveMetricModal('card_cash')}
                                        className="text-right p-2 sm:p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 hover:border-indigo-500 hover:shadow-xs transition-all cursor-pointer space-y-1 group relative overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-[11px] sm:text-xs font-extrabold text-indigo-700 dark:text-indigo-400 flex items-center gap-1 min-w-0 truncate">
                                                <div className="p-1 sm:p-1.5 bg-indigo-100 dark:bg-indigo-950/80 rounded-lg shrink-0">
                                                    <Wifi size={14} className="text-indigo-600 dark:text-indigo-400" />
                                                </div>
                                                <span className="truncate">الكروت نقدي</span>
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-sm sm:text-lg font-black text-indigo-600 dark:text-indigo-400 font-mono truncate">
                                                {totCardCash.toLocaleString()} <span className="text-[10px] font-bold">ر.ي</span>
                                            </div>
                                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-0.5 group-hover:text-indigo-600 truncate">
                                                <FileText size={11} />
                                                التفاصيل وPDF
                                            </p>
                                        </div>
                                    </button>

                                    {/* 4. الكروت آجل */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveMetricModal('card_credit')}
                                        className="text-right p-2 sm:p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/60 hover:border-purple-500 hover:shadow-xs transition-all cursor-pointer space-y-1 group relative overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-[11px] sm:text-xs font-extrabold text-purple-700 dark:text-purple-400 flex items-center gap-1 min-w-0 truncate">
                                                <div className="p-1 sm:p-1.5 bg-purple-100 dark:bg-purple-950/80 rounded-lg shrink-0">
                                                    <CreditCard size={14} className="text-purple-600 dark:text-purple-400" />
                                                </div>
                                                <span className="truncate">الكروت آجل</span>
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-sm sm:text-lg font-black text-purple-600 dark:text-purple-400 font-mono truncate">
                                                {totCardCredit.toLocaleString()} <span className="text-[10px] font-bold">ر.ي</span>
                                            </div>
                                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-0.5 group-hover:text-purple-600 truncate">
                                                <FileText size={11} />
                                                التفاصيل وPDF
                                            </p>
                                        </div>
                                    </button>

                                    {/* 5. الراتب مع العمولات */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveMetricModal('salary_comm')}
                                        className="text-right p-2 sm:p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-900/60 hover:border-sky-500 hover:shadow-xs transition-all cursor-pointer space-y-1 group relative overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-[11px] sm:text-xs font-extrabold text-sky-700 dark:text-sky-400 flex items-center gap-1 min-w-0 truncate">
                                                <div className="p-1 sm:p-1.5 bg-sky-100 dark:bg-sky-950/80 rounded-lg shrink-0">
                                                    <Banknote size={14} className="text-sky-600 dark:text-sky-400" />
                                                </div>
                                                <span className="truncate">الراتب + العمولات</span>
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-sm sm:text-lg font-black text-sky-600 dark:text-sky-400 font-mono truncate">
                                                {totSalaryPlusCommissions.toLocaleString()} <span className="text-[10px] font-bold">ر.ي</span>
                                            </div>
                                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-0.5 group-hover:text-sky-600 truncate">
                                                <FileText size={11} />
                                                كشف الراتب وPDF
                                            </p>
                                        </div>
                                    </button>

                                    {/* 6. المسحوبات */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveMetricModal('withdrawals')}
                                        className={`text-right p-2 sm:p-2.5 rounded-xl bg-white dark:bg-slate-900 border transition-all cursor-pointer space-y-1 group relative overflow-hidden ${
                                            isExceed
                                                ? 'border-red-400 dark:border-red-800 ring-1 ring-red-400/30 hover:border-red-500'
                                                : 'border-red-200 dark:border-red-900/60 hover:border-red-500 hover:shadow-xs'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-1">
                                            <span className="text-[11px] sm:text-xs font-extrabold text-red-700 dark:text-red-400 flex items-center gap-1 min-w-0 truncate">
                                                <div className="p-1 sm:p-1.5 bg-red-100 dark:bg-red-950/80 rounded-lg shrink-0">
                                                    <ArrowDownLeft size={14} className="text-red-600 dark:text-red-400" />
                                                </div>
                                                <span className="truncate">المسحوبات والسلف</span>
                                            </span>
                                        </div>
                                        <div>
                                            <div className="text-sm sm:text-lg font-black text-red-600 dark:text-red-400 font-mono truncate">
                                                {filteredTotWithdraw.toLocaleString()} <span className="text-[10px] font-bold">ر.ي</span>
                                            </div>
                                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-0.5 group-hover:text-red-600 truncate">
                                                <FileText size={11} />
                                                سجل السلف وPDF
                                            </p>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        );
                    })()}

                    {/* SEARCH IN DETAILS BAR */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-2 sm:p-2.5 shadow-2xs">
                        <div className="relative w-full">
                            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="بحث برقم الفاتورة، اسم الصنف، أو الملاحظات..."
                                value={detailSearchTerm}
                                onChange={(e) => setDetailSearchTerm(e.target.value)}
                                className="w-full pr-8 pl-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* MAIN TABLES WITH TABS SWITCHER */}
                    <div className="space-y-2.5">
                        {/* Table Tab Buttons */}
                        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
                            <button
                                type="button"
                                onClick={() => setActiveMainTableTab('sales')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                                    activeMainTableTab === 'sales'
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                <ShoppingBag size={14} />
                                فواتير ومبيعات الموظف
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveMainTableTab('withdrawals')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                                    activeMainTableTab === 'withdrawals'
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                <TrendingDown size={14} />
                                سجل المسحوبات والمديونيات ({getFilteredWithdrawals(selectedEmployee).length})
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveMainTableTab('manager_clearance')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
                                    activeMainTableTab === 'manager_clearance'
                                        ? 'bg-purple-600 text-white shadow-2xs'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                <Coins size={14} />
                                تصفية صندوق الموظف (صندوق المدير) ({managerClearances.filter(c => c.employeeId === selectedEmployee.id).length})
                            </button>
                        </div>

                        {/* TABLE 1: SALES & INVOICES */}
                        {activeMainTableTab === 'sales' && (
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-3">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                    <div>
                                        <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                            <ShoppingBag size={15} className="text-indigo-500" />
                                            {activeSalesCategory === 'general' && 'قائمة الفواتير العامة الخاصة بالموظف'}
                                            {activeSalesCategory === 'cards' && 'قائمة مبيعات الكروت الخاصة بالموظف'}
                                            {activeSalesCategory === 'credit_general' && 'قائمة المبيعات الآجل العامة الخاصة بالموظف'}
                                            {activeSalesCategory === 'credit_cards' && 'قائمة مبيعات آجل الكروت الخاصة بالموظف'}
                                        </h3>
                                    </div>
                                    
                                    {/* Category Toggle Pills */}
                                    <div className="flex items-center gap-1 flex-wrap bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg">
                                        <button
                                            type="button"
                                            onClick={() => setActiveSalesCategory('general')}
                                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                                activeSalesCategory === 'general' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                            }`}
                                        >
                                            عامة
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveSalesCategory('cards')}
                                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                                activeSalesCategory === 'cards' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                            }`}
                                        >
                                            كروت
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveSalesCategory('credit_general')}
                                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                                activeSalesCategory === 'credit_general' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                            }`}
                                        >
                                            آجل عام
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setActiveSalesCategory('credit_cards')}
                                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                                activeSalesCategory === 'credit_cards' ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-2xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                            }`}
                                        >
                                            آجل كروت
                                        </button>
                                    </div>
                                </div>

                                {(() => {
                                    let itemsList: any[] = [];
                                    const empGen = getEmployeeGeneralSales(selectedEmployee).filter(inv => matchesMonthFilter(inv.createdAt || inv.date));
                                    const empCards = getEmployeeCardSales(selectedEmployee).filter(cs => matchesMonthFilter(cs.createdAt || (cs.date ? new Date(cs.date).getTime() : 0)));

                                    if (activeSalesCategory === 'general') {
                                        itemsList = empGen;
                                    } else if (activeSalesCategory === 'cards') {
                                        itemsList = empCards;
                                    } else if (activeSalesCategory === 'credit_general') {
                                        itemsList = empGen.filter(inv => inv.paymentType === 'credit' || inv.paymentType === 'deferred' || inv.paymentType === 'اجل');
                                    } else if (activeSalesCategory === 'credit_cards') {
                                        itemsList = empCards.filter(cs => cs.saleType === 'credit' || cs.paymentType === 'credit' || cs.paymentType === 'deferred');
                                    }

                                    if (detailSearchTerm.trim()) {
                                        const term = detailSearchTerm.trim().toLowerCase();
                                        itemsList = itemsList.filter(item => {
                                            const invNum = (item.invoiceNumber || '').toLowerCase();
                                            const cust = (item.customerName || item.userName || item.categoryName || '').toLowerCase();
                                            return invNum.includes(term) || cust.includes(term);
                                        });
                                    }

                                    if (itemsList.length === 0) {
                                        return (
                                            <div className="text-center py-8 text-slate-400 dark:text-slate-600 text-xs font-medium border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                                                لا توجد فواتير أو حركات مبيعات مسجلة لهذا التصنيف خلال الفترة المحددة.
                                            </div>
                                        );
                                    }

                                    return (
                                        <div className="overflow-x-auto">
                                            <table className="w-full min-w-max text-right text-xs whitespace-nowrap">
                                                <thead>
                                                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold whitespace-nowrap">
                                                        <th className="py-2.5 px-3">رقم الفاتورة</th>
                                                        <th className="py-2.5 px-3">التاريخ والوقت</th>
                                                        <th className="py-2.5 px-3">البيان</th>
                                                        <th className="py-2.5 px-3">طريقة الدفع</th>
                                                        <th className="py-2.5 px-3">الإجمالي</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                                                    {itemsList.map((item, idx) => {
                                                        const isCard = activeSalesCategory === 'cards' || activeSalesCategory === 'credit_cards';
                                                        const invNum = item.invoiceNumber || (isCard ? `CARD-${item.id.slice(0, 6)}` : `INV-${item.id.slice(0, 6)}`);
                                                        const rawDate = item.createdAt || item.date || item.dateTime;
                                                        const dateFormatted = rawDate ? (typeof rawDate === 'number' ? format(rawDate, 'yyyy/MM/dd HH:mm') : String(rawDate)) : '-';
                                                        const partyOrCategory = item.categoryName ? `${item.categoryName} (${item.quantity || 1} كرت)` : (item.customerName || item.userName || 'عميل عام');
                                                        const isCredit = item.paymentType === 'credit' || item.saleType === 'credit' || item.paymentType === 'deferred' || item.paymentType === 'اجل';
                                                        const totalAmt = isCard ? (Number(item.totalAmount) || 0) : (Number(item.total) || 0);

                                                        return (
                                                            <tr 
                                                                key={item.id || idx} 
                                                                onClick={() => {
                                                                    if (isCard) {
                                                                        setSelectedInvoicePreview({
                                                                            isOpen: true,
                                                                            invoice: {
                                                                                ...item,
                                                                                invoiceNumber: invNum,
                                                                                date: typeof rawDate === 'number' ? rawDate : Date.now(),
                                                                                customerName: item.userName || 'مشتري بطاقات',
                                                                                total: totalAmt,
                                                                                paidAmount: totalAmt,
                                                                                paymentType: isCredit ? 'credit' : 'cash',
                                                                                sellerName: selectedEmployee.name
                                                                            },
                                                                            type: 'card_sale',
                                                                            items: [{
                                                                                name: item.categoryName || 'بطاقة شبكة',
                                                                                quantity: item.quantity || 1,
                                                                                price: totalAmt ? (totalAmt / (item.quantity || 1)) : 0,
                                                                                total: totalAmt
                                                                            }]
                                                                        });
                                                                    } else {
                                                                        setSelectedInvoicePreview({
                                                                            isOpen: true,
                                                                            invoice: {
                                                                                ...item,
                                                                                invoiceNumber: invNum,
                                                                                date: typeof rawDate === 'number' ? rawDate : Date.now(),
                                                                                customerName: item.customerName || 'عميل عام',
                                                                                total: totalAmt,
                                                                                paidAmount: item.paidAmount || totalAmt,
                                                                                paymentType: item.paymentType || 'cash',
                                                                                sellerName: selectedEmployee.name
                                                                            },
                                                                            type: 'sale',
                                                                            items: item.items || []
                                                                        });
                                                                    }
                                                                }}
                                                                className="hover:bg-indigo-50/60 dark:hover:bg-indigo-950/40 transition cursor-pointer whitespace-nowrap group"
                                                                title="انقر لمعاينة الفاتورة"
                                                            >
                                                                <td className="py-2.5 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                                                                    {invNum}
                                                                </td>
                                                                <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                                                                    {dateFormatted}
                                                                </td>
                                                                <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-extrabold whitespace-nowrap">
                                                                    {partyOrCategory}
                                                                </td>
                                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                                                                        isCredit 
                                                                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' 
                                                                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                                    }`}>
                                                                        {isCredit ? 'آجل' : 'نقدي'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-3 font-black font-mono text-slate-900 dark:text-white whitespace-nowrap">
                                                                    {totalAmt.toLocaleString()} {isCard ? 'ر.ي' : 'ر.س'}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* TABLE 2: WITHDRAWALS & DEBTS */}
                        {activeMainTableTab === 'withdrawals' && (() => {
                            const personalWithdrawals = getFilteredWithdrawals(selectedEmployee);
                            const disbursementsFromThisFund = withdrawals.filter(w => w.withdrawnFromEmployeeId === selectedEmployee.id && matchesMonthFilter(w.date));

                            return (
                                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                                        <div className="flex flex-wrap items-center gap-3">
                                            <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                                <TrendingDown size={16} className="text-red-500" />
                                                سجل تفاصيل المسحوبات والعمليات المالية
                                            </h3>

                                            {/* Sub-tabs for personal withdrawals vs disbursed to other employees */}
                                            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-bold">
                                                <button
                                                    type="button"
                                                    onClick={() => setWithdrawalSubTab('personal')}
                                                    className={`px-3 py-1 rounded-md transition cursor-pointer ${
                                                        withdrawalSubTab === 'personal'
                                                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-extrabold'
                                                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                                    }`}
                                                >
                                                    مسحوبات الموظف ({personalWithdrawals.length})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setWithdrawalSubTab('disbursed_from_fund')}
                                                    className={`px-3 py-1 rounded-md transition cursor-pointer ${
                                                        withdrawalSubTab === 'disbursed_from_fund'
                                                            ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs font-extrabold'
                                                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                                    }`}
                                                >
                                                    صُرفت لآخرين من صندوقه ({disbursementsFromThisFund.length})
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setTargetEmployeeId('');
                                                    setWithdrawOtherAmount('');
                                                    setWithdrawOtherNotes('');
                                                    setIsWithdrawOtherModalOpen(true);
                                                }}
                                                className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                                            >
                                                <ArrowRightLeft size={13} />
                                                سحب لموظف آخر
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setWithdrawAmount('');
                                                    setWithdrawNotes('');
                                                    setIsWithdrawModalOpen(true);
                                                }}
                                                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 shadow-xs transition cursor-pointer"
                                            >
                                                <Plus size={13} />
                                                سحب للموظف
                                            </button>
                                        </div>
                                    </div>

                                    {/* TAB CONTENT: Personal Withdrawals */}
                                    {withdrawalSubTab === 'personal' && (
                                        personalWithdrawals.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 dark:text-slate-600 text-xs font-medium border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                                                لا توجد مسحوبات أو سلف مسجلة لهذا الموظف خلال هذه الفترة.
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full min-w-max text-right text-xs whitespace-nowrap">
                                                    <thead>
                                                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold whitespace-nowrap">
                                                            <th className="py-2.5 px-3">رقم السند</th>
                                                            <th className="py-2.5 px-3">التاريخ والوقت</th>
                                                            <th className="py-2.5 px-3">المبلغ</th>
                                                            <th className="py-2.5 px-3">البيان / الملاحظات</th>
                                                            <th className="py-2.5 px-3">مصدر الخصم</th>
                                                            <th className="py-2.5 px-3">بواسطة</th>
                                                            <th className="py-2.5 px-3 text-center">حذف</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                                                        {personalWithdrawals.map((w, idx) => (
                                                            <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/50 whitespace-nowrap">
                                                                <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-white whitespace-nowrap">
                                                                    #{w.withdrawalNumber || w.voucherNumber || (idx + 1)}
                                                                </td>
                                                                <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                                                                    {w.date ? format(w.date, 'yyyy/MM/dd HH:mm') : '-'}
                                                                </td>
                                                                <td className="py-2.5 px-3 font-bold font-mono text-red-600 dark:text-red-400 whitespace-nowrap">
                                                                    {parseFloat(String(w.amount)).toLocaleString()} ر.ي
                                                                </td>
                                                                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                                                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                                        <span className="whitespace-nowrap">{w.notes || 'سحب سلفة'}</span>
                                                                        {w.withdrawnFromEmployeeName && (
                                                                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold whitespace-nowrap">
                                                                                (صُرف من: {w.withdrawnFromEmployeeName})
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                                                                        w.sourceFund === 'network_cashbox'
                                                                            ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400'
                                                                            : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                                                                    }`}>
                                                                        {w.sourceFund === 'network_cashbox' ? 'صندوق الشبكات' : 'الصندوق العام'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                                                                    {w.createdBy || '-'}
                                                                </td>
                                                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteWithdrawal(w)}
                                                                        className="p-1 hover:bg-red-50 dark:hover:bg-red-950/50 rounded text-slate-400 hover:text-red-600 transition cursor-pointer"
                                                                        title="حذف عملية السحب"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )
                                    )}

                                    {/* TAB CONTENT: Disbursed From This Fund To Other Employees */}
                                    {withdrawalSubTab === 'disbursed_from_fund' && (
                                        disbursementsFromThisFund.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400 dark:text-slate-600 text-xs font-medium border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                                                لم يتم صرف مسحوبات لموظفين آخرين من صندوق هذا الموظف خلال هذه الفترة.
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto">
                                                <table className="w-full min-w-max text-right text-xs whitespace-nowrap">
                                                    <thead>
                                                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold whitespace-nowrap">
                                                            <th className="py-2.5 px-3">رقم السند</th>
                                                            <th className="py-2.5 px-3">التاريخ والوقت</th>
                                                            <th className="py-2.5 px-3">الموظف المستفيد</th>
                                                            <th className="py-2.5 px-3">المبلغ المصروف</th>
                                                            <th className="py-2.5 px-3">البيان والملاحظات</th>
                                                            <th className="py-2.5 px-3">الصندوق المخصوم منه</th>
                                                            <th className="py-2.5 px-3">بواسطة</th>
                                                            <th className="py-2.5 px-3 text-center">حذف</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                                                        {disbursementsFromThisFund.map((w, idx) => (
                                                            <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/50 whitespace-nowrap">
                                                                <td className="py-2.5 px-3 font-bold font-mono text-slate-900 dark:text-white whitespace-nowrap">
                                                                    #{w.withdrawalNumber || w.voucherNumber || (idx + 1)}
                                                                </td>
                                                                <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                                                                    {w.date ? format(w.date, 'yyyy/MM/dd HH:mm') : '-'}
                                                                </td>
                                                                <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                                                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                                        <span className="whitespace-nowrap">{w.employeeName}</span>
                                                                        <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 whitespace-nowrap">
                                                                            {roleConfig[w.employeeRole as AppRole]?.label || w.employeeRole}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5 px-3 font-bold font-mono text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                                                    {parseFloat(String(w.amount)).toLocaleString()} ر.ي
                                                                </td>
                                                                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                                                    <span className="whitespace-nowrap">{w.notes || 'سحب سلفة صُرفت من صندوق الموظف'}</span>
                                                                </td>
                                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                                                                        w.sourceFund === 'network_cashbox'
                                                                            ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400'
                                                                            : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                                                                    }`}>
                                                                        {w.sourceFund === 'network_cashbox' ? 'صندوق كروت الشبكة' : 'الصندوق العام للمحل'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                                                                    {w.createdBy || '-'}
                                                                </td>
                                                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteWithdrawal(w)}
                                                                        className="p-1 hover:bg-red-50 dark:hover:bg-red-950/50 rounded text-slate-400 hover:text-red-600 transition cursor-pointer"
                                                                        title="حذف عملية السحب"
                                                                    >
                                                                        <Trash2 size={13} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )
                                    )}
                                </div>
                            );
                        })()}

                        {/* TABLE 3: MANAGER CLEARANCE / EMPLOYEE FUND SETTLEMENT */}
                        {activeMainTableTab === 'manager_clearance' && selectedEmployee && (
                            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-4">
                                {/* Header Title and Action */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                                    <div>
                                        <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                            <Coins size={17} className="text-purple-600 dark:text-purple-400" />
                                            تصفية صناديق الموظف واستلام مبالغ لصندوق المدير
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            تصفية مبالغ المبيعات القائمة لدى الموظف دون أي تأثير على الصناديق العامة للمحل.
                                        </p>
                                    </div>
                                    
                                    {canViewAllEmployees && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setClearanceBoxType('general_cashbox');
                                                setClearanceAmount('');
                                                setClearanceNotes('');
                                                setIsManagerClearanceModalOpen(true);
                                            }}
                                            className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-extrabold rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                                        >
                                            <Plus size={14} />
                                            إجراء تصفية / استلام مبلغ إلى صندوق المدير
                                        </button>
                                    )}
                                </div>

                                {/* Balance Cards Summary */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {/* General Fund Box Card */}
                                    <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/40 rounded-xl space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                                                <ShoppingBag size={14} className="text-purple-600" />
                                                صندوق مبيعات المحل (بالريال السعودي ر.س)
                                            </span>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                                                ر.س
                                            </span>
                                        </div>
                                        <div className="flex items-baseline justify-between pt-1">
                                            <span className="text-xs text-slate-500">الرصيد المتبقي القائم لدى الموظف:</span>
                                            <span className="text-lg font-black font-mono text-purple-700 dark:text-purple-400">
                                                {getEmployeeGeneralFundNetBalance(selectedEmployee).toLocaleString()} <span className="text-xs">ر.س</span>
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 space-y-0.5 border-t border-purple-100 dark:border-purple-900/50 pt-2 grid grid-cols-2 gap-1">
                                            <div>إجمالي المبيعات النقدية: <span className="font-bold text-slate-700 dark:text-slate-300">{getEmployeeGeneralCashSalesTotal(selectedEmployee).toLocaleString()}</span></div>
                                            <div>المصروف لموظفين آخرين: <span className="font-bold text-slate-700 dark:text-slate-300">{getEmployeeGeneralFundDisbursedWithdrawalsTotal(selectedEmployee).toLocaleString()}</span></div>
                                            <div className="col-span-2">المورّد لصندوق المدير: <span className="font-bold text-purple-600 dark:text-purple-400">{getEmployeeGeneralFundClearancesTotal(selectedEmployee).toLocaleString()} ر.س</span></div>
                                        </div>
                                    </div>

                                    {/* Card Sales Fund Box Card */}
                                    <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/40 rounded-xl space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                                                <Wifi size={14} className="text-indigo-600" />
                                                صندوق مبيعات الكروت (بالريال اليمني ر.ي)
                                            </span>
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                                                ر.ي
                                            </span>
                                        </div>
                                        <div className="flex items-baseline justify-between pt-1">
                                            <span className="text-xs text-slate-500">الرصيد المتبقي القائم لدى الموظف:</span>
                                            <span className="text-lg font-black font-mono text-indigo-700 dark:text-indigo-400">
                                                {getEmployeeCardFundNetBalance(selectedEmployee).toLocaleString()} <span className="text-xs">ر.ي</span>
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 space-y-0.5 border-t border-indigo-100 dark:border-indigo-900/50 pt-2 grid grid-cols-2 gap-1">
                                            <div>إجمالي المبيعات النقدية: <span className="font-bold text-slate-700 dark:text-slate-300">{getEmployeeCardCashSalesTotal(selectedEmployee).toLocaleString()}</span></div>
                                            <div>المصروف لموظفين آخرين: <span className="font-bold text-slate-700 dark:text-slate-300">{getEmployeeCardFundDisbursedWithdrawalsTotal(selectedEmployee).toLocaleString()}</span></div>
                                            <div className="col-span-2">المورّد لصندوق المدير: <span className="font-bold text-indigo-600 dark:text-indigo-400">{getEmployeeCardFundClearancesTotal(selectedEmployee).toLocaleString()} ر.ي</span></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Clearances History Table */}
                                <div className="space-y-2 pt-2">
                                    <h4 className="font-bold text-xs text-slate-700 dark:text-slate-300">
                                        سجل سندات تصفية واستلام مبالغ لصندوق المدير ({managerClearances.filter(c => c.employeeId === selectedEmployee.id).length})
                                    </h4>

                                    {managerClearances.filter(c => c.employeeId === selectedEmployee.id).length === 0 ? (
                                        <div className="text-center py-8 text-slate-400 dark:text-slate-600 text-xs font-medium border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                                            لا توجد سندات تصفية أو توريد سابقة لصندوق المدير لهذا الموظف.
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full min-w-max text-right text-xs whitespace-nowrap">
                                                <thead>
                                                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold whitespace-nowrap">
                                                        <th className="py-2.5 px-3">رقم السند</th>
                                                        <th className="py-2.5 px-3">التاريخ والوقت</th>
                                                        <th className="py-2.5 px-3">الصندوق المصفى</th>
                                                        <th className="py-2.5 px-3">المبلغ المستلم</th>
                                                        <th className="py-2.5 px-3">البيان والملاحظات</th>
                                                        <th className="py-2.5 px-3">المستلم (المدير)</th>
                                                        <th className="py-2.5 px-3 text-center">إجراءات</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                                                    {managerClearances
                                                        .filter(c => c.employeeId === selectedEmployee.id)
                                                        .map((c, idx) => (
                                                            <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/50 whitespace-nowrap">
                                                                <td className="py-2.5 px-3 font-bold font-mono text-purple-600 dark:text-purple-400 whitespace-nowrap">
                                                                    #{c.clearanceNumber || c.voucherNumber || (idx + 1)}
                                                                </td>
                                                                <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                                                                    {c.date ? format(c.date, 'yyyy/MM/dd HH:mm') : '-'}
                                                                </td>
                                                                <td className="py-2.5 px-3 whitespace-nowrap">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                                                                        c.boxType === 'card_cashbox'
                                                                            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                                                                            : 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                                                                    }`}>
                                                                        {c.boxType === 'card_cashbox' ? 'صندوق الكروت (ر.ي)' : 'صندوق المحل (ر.س)'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-3 font-bold font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                                    {Number(c.amount).toLocaleString()} {c.currency}
                                                                </td>
                                                                <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                                                    <span className="whitespace-nowrap">{c.notes || '-'}</span>
                                                                </td>
                                                                <td className="py-2.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                                                                    {c.managerName || 'المدير'}
                                                                </td>
                                                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                                                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handlePrintClearanceVoucher(c)}
                                                                            className="p-1 hover:bg-purple-50 dark:hover:bg-purple-950/50 rounded text-purple-600 transition cursor-pointer"
                                                                            title="معاينة وطباعة سند التصفية"
                                                                        >
                                                                            <Printer size={13} />
                                                                        </button>
                                                                        {canViewAllEmployees && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleDeleteManagerClearance(c)}
                                                                                className="p-1 hover:bg-red-50 dark:hover:bg-red-950/50 rounded text-slate-400 hover:text-red-600 transition cursor-pointer"
                                                                                title="حذف سند التصفية"
                                                                            >
                                                                                <Trash2 size={13} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* WITHDRAWAL MODAL ("إضافة سحب") */}
            {isWithdrawModalOpen && selectedEmployee && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-all">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                                <ArrowDownLeft size={18} className="text-red-500" />
                                تسجيل سحب / سلفة للموظف
                            </h3>
                            <button 
                                onClick={() => setIsWithdrawModalOpen(false)} 
                                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleAddWithdrawal} className="space-y-4">
                            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                                <div className="font-bold text-slate-800 dark:text-slate-200">
                                    الموظف: <span className="text-indigo-600 dark:text-indigo-400">{selectedEmployee.name}</span>
                                </div>
                                <div className="text-slate-500">
                                    الدور: {roleConfig[selectedEmployee.role]?.label || selectedEmployee.role}
                                </div>
                                <div className="text-slate-500 font-semibold pt-1 border-t border-slate-200 dark:border-slate-800">
                                    خصم السحب المالي: {' '}
                                    <span className="font-bold text-red-600 dark:text-red-400">
                                        {(selectedEmployee.role === 'cashier' || selectedEmployee.role === 'inventory')
                                            ? 'سيتم الخصم تلقائياً من الصندوق العام (بالريال السعودي)'
                                            : 'سيتم الخصم تلقائياً من صندوق كروت الشبكة (بالريال اليمني)'}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    مبلغ السحب (بالريال اليمني - ر.ي) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    step="any"
                                    required
                                    value={withdrawAmount}
                                    onChange={(e) => setWithdrawAmount(e.target.value)}
                                    placeholder="أدخل مبلغ السحب بالريال اليمني..."
                                    className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl p-3 outline-none focus:border-indigo-500 text-sm font-mono"
                                    dir="ltr"
                                />
                                {parseFloat(withdrawAmount) > 0 && (selectedEmployee.role === 'cashier' || selectedEmployee.role === 'inventory') && (
                                    <div className="mt-1 text-xs text-indigo-600 dark:text-indigo-400 font-bold flex justify-between">
                                        <span>يعادل بالسعودي:</span>
                                        <span className="font-mono">
                                            {((parseFloat(withdrawAmount) || 0) / (settings.yemeniExchangeRate || 140)).toFixed(2)} ر.س
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Live limit check warning box inside withdrawal modal */}
                            {(() => {
                                const amt = parseFloat(withdrawAmount) || 0;
                                const currTotal = getTotalWithdrawals(selectedEmployee);
                                const newTot = currTotal + amt;
                                const maxLim = selectedEmployee.maxWithdrawalLimit || 0;
                                if (maxLim > 0 && newTot > maxLim) {
                                    const excess = newTot - maxLim;
                                    return (
                                        <div className="p-3 bg-red-50 dark:bg-red-950/80 border border-red-300 dark:border-red-900 rounded-xl text-xs space-y-1 text-red-800 dark:text-red-200 animate-in fade-in">
                                            <div className="font-black flex items-center gap-1.5 text-red-700 dark:text-red-300">
                                                <span>⚠️ تحذير: هذا السحب يتجاوز سقف المسحوبات المحدد!</span>
                                            </div>
                                            <div className="text-[11px] font-medium space-y-0.5 pt-1 border-t border-red-200 dark:border-red-900">
                                                <div>• سقف السلف المحدد: <span className="font-mono font-bold">{maxLim.toLocaleString()} ر.ي</span></div>
                                                <div>• المسحوبات السابقة: <span className="font-mono font-bold">{currTotal.toLocaleString()} ر.ي</span></div>
                                                <div>• الإجمالي بعد الخصم: <span className="font-mono font-bold">{newTot.toLocaleString()} ر.ي</span></div>
                                                <div className="font-extrabold text-red-700 dark:text-red-300 pt-0.5">• قيمة التجاوز: <span className="font-mono font-black">{excess.toLocaleString()} ر.ي</span></div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    البيان / ملاحظات السحب
                                </label>
                                <input
                                    type="text"
                                    value={withdrawNotes}
                                    onChange={(e) => setWithdrawNotes(e.target.value)}
                                    placeholder="مثال: سلفة منتصف الشهر، مصاريف نقل..."
                                    className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl p-3 outline-none focus:border-indigo-500 text-xs font-medium"
                                />
                            </div>

                            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsWithdrawModalOpen(false)}
                                    className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingWithdraw}
                                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                    {isSubmittingWithdraw ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                                    تأكيد الخصم والسحب
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* WITHDRAWAL TO ANOTHER EMPLOYEE MODAL ("سحب لموظف آخر") */}
            {isWithdrawOtherModalOpen && selectedEmployee && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-all">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                                <ArrowRightLeft size={18} className="text-amber-500" />
                                سحب لموظف آخر من صندوق الموظف
                            </h3>
                            <button 
                                onClick={() => setIsWithdrawOtherModalOpen(false)} 
                                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleWithdrawToOtherEmployee} className="space-y-4">
                            {/* Source Fund Box info */}
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900 text-xs space-y-1.5">
                                <div className="font-bold text-amber-950 dark:text-amber-200 flex items-center justify-between">
                                    <span>الموظف القائم بالصرف (الصندوق):</span>
                                    <span className="font-black text-slate-900 dark:text-white">{selectedEmployee.name}</span>
                                </div>
                                <div className="text-amber-900 dark:text-amber-300 text-[11px] leading-relaxed">
                                    جهة الخصم المالي: <span className="font-bold underline">
                                        {(selectedEmployee.role === 'cashier' || selectedEmployee.role === 'inventory')
                                            ? 'الصندوق العام للمحل (خصم مباشر بالريال السعودي بسند صرف)'
                                            : 'صندوق كروت الشبكات (خصم مباشر بالريال اليمني)'}
                                    </span>
                                </div>
                            </div>

                            {/* Target Employee Selection */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    اختر الموظف المستفيد (المسجل عليه السحب) <span className="text-red-500">*</span>
                                </label>
                                <select
                                    required
                                    value={targetEmployeeId}
                                    onChange={(e) => setTargetEmployeeId(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl p-3 outline-none focus:border-amber-500 text-xs font-bold"
                                >
                                    <option value="">-- اختر الموظف المستفيد --</option>
                                    {employees
                                        .filter(e => e.id !== selectedEmployee.id)
                                        .map(emp => (
                                            <option key={emp.id} value={emp.id}>
                                                {emp.name} ({roleConfig[emp.role]?.label || emp.role})
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>

                            {/* Amount Input */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    مبلغ السحب (بالريال اليمني - ر.ي) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    step="any"
                                    required
                                    value={withdrawOtherAmount}
                                    onChange={(e) => setWithdrawOtherAmount(e.target.value)}
                                    placeholder="أدخل مبلغ السحب بالريال اليمني..."
                                    className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl p-3 outline-none focus:border-amber-500 text-sm font-mono"
                                    dir="ltr"
                                />
                                {parseFloat(withdrawOtherAmount) > 0 && (selectedEmployee.role === 'cashier' || selectedEmployee.role === 'inventory') && (
                                    <div className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-bold flex justify-between">
                                        <span>يعادل الخصم من الصندوق العام:</span>
                                        <span className="font-mono">
                                            {((parseFloat(withdrawOtherAmount) || 0) / (settings.yemeniExchangeRate || 140)).toFixed(2)} ر.س
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Target Employee Limit Warning */}
                            {(() => {
                                if (!targetEmployeeId) return null;
                                const targetEmp = employees.find(e => e.id === targetEmployeeId);
                                if (!targetEmp) return null;

                                const amt = parseFloat(withdrawOtherAmount) || 0;
                                const currTotal = getTotalWithdrawals(targetEmp);
                                const newTot = currTotal + amt;
                                const maxLim = targetEmp.maxWithdrawalLimit || 0;

                                if (maxLim > 0 && newTot > maxLim) {
                                    const excess = newTot - maxLim;
                                    return (
                                        <div className="p-3 bg-red-50 dark:bg-red-950/80 border border-red-300 dark:border-red-900 rounded-xl text-xs space-y-1 text-red-800 dark:text-red-200 animate-in fade-in">
                                            <div className="font-black flex items-center gap-1.5 text-red-700 dark:text-red-300">
                                                <span>⚠️ تحذير: هذا السحب يتجاوز سقف المسحوبات للموظف ({targetEmp.name})!</span>
                                            </div>
                                            <div className="text-[11px] font-medium space-y-0.5 pt-1 border-t border-red-200 dark:border-red-900">
                                                <div>• سقف السلف المحدد للموظف: <span className="font-mono font-bold">{maxLim.toLocaleString()} ر.ي</span></div>
                                                <div>• المسحوبات السابقة عليه: <span className="font-mono font-bold">{currTotal.toLocaleString()} ر.ي</span></div>
                                                <div>• الإجمالي بعد السحب: <span className="font-mono font-bold">{newTot.toLocaleString()} ر.ي</span></div>
                                                <div className="font-extrabold text-red-700 dark:text-red-300 pt-0.5">• قيمة التجاوز: <span className="font-mono font-black">{excess.toLocaleString()} ر.ي</span></div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            })()}

                            {/* Notes Input */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    البيان / ملاحظات العملية
                                </label>
                                <input
                                    type="text"
                                    value={withdrawOtherNotes}
                                    onChange={(e) => setWithdrawOtherNotes(e.target.value)}
                                    placeholder="مثال: سلفة مستعجلة، دفعة حساب..."
                                    className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl p-3 outline-none focus:border-amber-500 text-xs"
                                />
                            </div>

                            {/* Notice box */}
                            <div className="p-2.5 bg-slate-50 dark:bg-slate-950 rounded-lg text-[11px] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                                💡 <span className="font-bold text-slate-700 dark:text-slate-300">ملاحظة محاسبية:</span> سيتم قيد المبلغ على حساب الموظف المستفيد كمسحوبات، ويتم إنقاص المبلغ من صندوق {selectedEmployee.name} دون إضافة أي سلفة على حسابه الشخصي.
                            </div>

                            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsWithdrawOtherModalOpen(false)}
                                    className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingWithdrawOther}
                                    className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                    {isSubmittingWithdrawOther ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                                    تأكيد الخصم والتحويل
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* SALARY AND LIMIT EDIT MODAL */}
            {isSalaryModalOpen && selectedEmployee && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-all">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl p-5 border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-bold text-sm md:text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                                <Banknote size={18} className="text-emerald-500" />
                                تعديل الراتب وسقف السلف
                            </h3>
                            <button onClick={() => setIsSalaryModalOpen(false)} className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                                <X size={16} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdateSalary} className="space-y-4">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                الموظف: <span className="font-bold text-slate-900 dark:text-white">{selectedEmployee.name}</span>
                            </p>

                            <div>
                                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">الراتب الشهري (ر.ي)</label>
                                <input 
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={editSalaryInput}
                                    onChange={(e) => setEditSalaryInput(e.target.value)}
                                    placeholder="أدخل قيمة الراتب الشهري بالريال اليمني"
                                    className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl p-3 outline-none focus:border-indigo-500 text-sm font-mono"
                                    dir="ltr"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                                    سقف السلف / الحد الأقصى للمسحوبات (ر.ي)
                                </label>
                                <input 
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={editMaxLimitInput}
                                    onChange={(e) => setEditMaxLimitInput(e.target.value)}
                                    placeholder="0 لعدم تحديد سقف..."
                                    className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 rounded-xl p-3 outline-none focus:border-indigo-500 text-sm font-mono"
                                    dir="ltr"
                                />
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                                    يظهر تنبيه للنظام والمسؤول عند وصول مسحوبات الموظف لهذا الحد. (ضع 0 لإلغاء السقف).
                                </p>
                            </div>

                            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsSalaryModalOpen(false)}
                                    className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingSalary}
                                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                    {isSubmittingSalary ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                                    حفظ البيانات
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* INVOICE PREVIEW MODAL */}
            {selectedInvoicePreview && selectedInvoicePreview.isOpen && (
                <InvoicePreviewModal
                    invoice={selectedInvoicePreview.invoice}
                    type={selectedInvoicePreview.type}
                    items={selectedInvoicePreview.items}
                    onClose={() => setSelectedInvoicePreview(null)}
                    currency={selectedInvoicePreview.type === "card_sale" ? "ر.ي" : "ر.س"}
                />
            )}

            {/* EMPLOYEE METRIC DETAIL & EXPORT PDF MODAL */}
            {activeMetricModal && selectedEmployee && (
                <EmployeeMetricDetailModal
                    isOpen={!!activeMetricModal}
                    onClose={() => setActiveMetricModal(null)}
                    employeeName={selectedEmployee.name}
                    employeeRole={selectedEmployee.role}
                    employeeSalary={selectedEmployee.salary || 0}
                    employeeMaxLimit={selectedEmployee.maxWithdrawalLimit || 0}
                    month={selectedMonth}
                    metricType={activeMetricModal}
                    items={(() => {
                        const monthGenSalesList = getEmployeeGeneralSales(selectedEmployee).filter(inv => matchesMonthFilter(inv.createdAt || inv.date));
                        const monthCardSalesList = getEmployeeCardSales(selectedEmployee).filter(cs => matchesMonthFilter(cs.createdAt || (cs.date ? new Date(cs.date).getTime() : 0)));
                        const monthWithdrawalsList = getFilteredWithdrawals(selectedEmployee);

                        switch (activeMetricModal) {
                            case 'gen_cash':
                                return monthGenSalesList.filter(inv => inv.paymentType !== 'credit' && inv.paymentType !== 'deferred' && inv.paymentType !== 'اجل');
                            case 'gen_credit':
                                return monthGenSalesList.filter(inv => inv.paymentType === 'credit' || inv.paymentType === 'deferred' || inv.paymentType === 'اجل');
                            case 'card_cash':
                                return monthCardSalesList.filter(cs => cs.saleType !== 'credit' && cs.paymentType !== 'credit' && cs.paymentType !== 'deferred');
                            case 'card_credit':
                                return monthCardSalesList.filter(cs => cs.saleType === 'credit' || cs.paymentType === 'credit' || cs.paymentType === 'deferred');
                            case 'salary_comm':
                                return monthCardSalesList; // Sales generating commissions
                            case 'withdrawals':
                                return monthWithdrawalsList;
                            default:
                                return [];
                        }
                    })()}
                    summaryData={(() => {
                        const monthGenSalesList = getEmployeeGeneralSales(selectedEmployee).filter(inv => matchesMonthFilter(inv.createdAt || inv.date));
                        const monthCardSalesList = getEmployeeCardSales(selectedEmployee).filter(cs => matchesMonthFilter(cs.createdAt || (cs.date ? new Date(cs.date).getTime() : 0)));
                        const monthWithdrawalsList = getFilteredWithdrawals(selectedEmployee);

                        const genCashItems = monthGenSalesList.filter(inv => inv.paymentType !== 'credit' && inv.paymentType !== 'deferred' && inv.paymentType !== 'اجل');
                        const genCreditItems = monthGenSalesList.filter(inv => inv.paymentType === 'credit' || inv.paymentType === 'deferred' || inv.paymentType === 'اجل');
                        const cardCashItems = monthCardSalesList.filter(cs => cs.saleType !== 'credit' && cs.paymentType !== 'credit' && cs.paymentType !== 'deferred');
                        const cardCreditItems = monthCardSalesList.filter(cs => cs.saleType === 'credit' || cs.paymentType === 'credit' || cs.paymentType === 'deferred');

                        const totGenCash = genCashItems.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
                        const totGenCredit = genCreditItems.reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
                        const totCardCash = cardCashItems.reduce((sum, cs) => sum + (Number(cs.totalAmount) || 0), 0);
                        const totCardCredit = cardCreditItems.reduce((sum, cs) => sum + (Number(cs.totalAmount) || 0), 0);

                        const baseSalary = selectedEmployee.salary || 0;
                        const totalCommissions = monthCardSalesList.reduce((sum, cs) => sum + (Number(cs.commissionAmount) || 0), 0);
                        const totalWithdrawals = monthWithdrawalsList.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
                        const netPayable = baseSalary + totalCommissions - totalWithdrawals;

                        let totalAmount = 0;
                        if (activeMetricModal === 'gen_cash') totalAmount = totGenCash;
                        if (activeMetricModal === 'gen_credit') totalAmount = totGenCredit;
                        if (activeMetricModal === 'card_cash') totalAmount = totCardCash;
                        if (activeMetricModal === 'card_credit') totalAmount = totCardCredit;
                        if (activeMetricModal === 'salary_comm') totalAmount = baseSalary + totalCommissions;
                        if (activeMetricModal === 'withdrawals') totalAmount = totalWithdrawals;

                        return {
                            totalAmount,
                            totalCommissions,
                            totalWithdrawals,
                            baseSalary,
                            netPayable
                        };
                    })()}
                    onPreviewInvoice={(invoice, type, items) => {
                        setSelectedInvoicePreview({
                            isOpen: true,
                            invoice,
                            type,
                            items
                        });
                    }}
                />
            )}

            {/* EMPLOYEE WITHDRAWALS DETAILED REPORT MODAL */}
            {isWithdrawalsReportModalOpen && (
                <EmployeeWithdrawalsReportModal
                    isOpen={isWithdrawalsReportModalOpen}
                    onClose={() => setIsWithdrawalsReportModalOpen(false)}
                    withdrawals={withdrawals}
                    employees={employees}
                    initialEmployeeId={selectedEmployee?.id || 'all'}
                />
            )}

            {/* MANAGER CLEARANCE CREATION MODAL */}
            {isManagerClearanceModalOpen && selectedEmployee && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-all">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                                <Coins size={18} className="text-purple-600 dark:text-purple-400" />
                                تصفية صندوق الموظف واستلام مبالغ لصندوق المدير
                            </h3>
                            <button 
                                onClick={() => setIsManagerClearanceModalOpen(false)} 
                                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateManagerClearance} className="space-y-4">
                            {/* Employee Info */}
                            <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                                <div>
                                    <span className="text-[10px] text-slate-400 block font-bold">الموظف المصفى صندوقه:</span>
                                    <span className="font-extrabold text-xs text-slate-900 dark:text-white">{selectedEmployee.name}</span>
                                </div>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                                    {roleConfig[selectedEmployee.role]?.label || selectedEmployee.role}
                                </span>
                            </div>

                            {/* Box Selector */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    اختر الصندوق المراد تصفيته واستلام المبالغ منه:
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setClearanceBoxType('general_cashbox');
                                            const net = getEmployeeGeneralFundNetBalance(selectedEmployee);
                                            if (net > 0 && !clearanceAmount) setClearanceAmount(net.toString());
                                        }}
                                        className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                                            clearanceBoxType === 'general_cashbox'
                                                ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/50 text-purple-900 dark:text-purple-200 ring-2 ring-purple-600/20'
                                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                                        }`}
                                    >
                                        <div className="text-xs font-extrabold">صندوق المحل (ر.س)</div>
                                        <div className="text-[10px] font-mono text-slate-500 mt-1">
                                            القائم: {getEmployeeGeneralFundNetBalance(selectedEmployee).toLocaleString()} ر.س
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setClearanceBoxType('card_cashbox');
                                            const net = getEmployeeCardFundNetBalance(selectedEmployee);
                                            if (net > 0 && !clearanceAmount) setClearanceAmount(net.toString());
                                        }}
                                        className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                                            clearanceBoxType === 'card_cashbox'
                                                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-600/20'
                                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                                        }`}
                                    >
                                        <div className="text-xs font-extrabold">صندوق الكروت (ر.ي)</div>
                                        <div className="text-[10px] font-mono text-slate-500 mt-1">
                                            القائم: {getEmployeeCardFundNetBalance(selectedEmployee).toLocaleString()} ر.ي
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Amount Input with "Fill Full Balance" button */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                        المبلغ المورّد / المستلم بواسطة المدير ({clearanceBoxType === 'card_cashbox' ? 'ر.ي' : 'ر.س'}) *
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const net = clearanceBoxType === 'card_cashbox'
                                                ? getEmployeeCardFundNetBalance(selectedEmployee)
                                                : getEmployeeGeneralFundNetBalance(selectedEmployee);
                                            setClearanceAmount(net.toString());
                                        }}
                                        className="text-[10px] font-bold text-purple-600 hover:text-purple-700 dark:text-purple-400 underline cursor-pointer"
                                    >
                                        تصفية الرصيد القائم بالكامل
                                    </button>
                                </div>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="any"
                                        min="0.01"
                                        required
                                        placeholder="أدخل المبلغ..."
                                        value={clearanceAmount}
                                        onChange={(e) => setClearanceAmount(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-purple-600"
                                    />
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-extrabold text-slate-400 pointer-events-none">
                                        {clearanceBoxType === 'card_cashbox' ? 'ر.ي' : 'ر.س'}
                                    </span>
                                </div>
                            </div>

                            {/* Notes Input */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                                    البيان / الملاحظات:
                                </label>
                                <input
                                    type="text"
                                    placeholder="مثال: تصفية المبيعات اليومية واستلام النقدية بواسطة المدير..."
                                    value={clearanceNotes}
                                    onChange={(e) => setClearanceNotes(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:border-purple-600"
                                />
                            </div>

                            {/* Info Note */}
                            <p className="text-[11px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/40 p-2.5 rounded-xl leading-relaxed">
                                💡 <strong>تنبيه:</strong> هذا الإجراء يُخصم فقط من المبيعات المتبقية القائمة لدى هذا الموظف، ولا يُغير الصناديق الرئيسية العامة للمحل أو الكروت.
                            </p>

                            {/* Buttons */}
                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    type="submit"
                                    disabled={isSubmittingClearance}
                                    className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                    {isSubmittingClearance ? (
                                        <RefreshCw size={14} className="animate-spin" />
                                    ) : (
                                        <Save size={14} />
                                    )}
                                    <span>حفظ وإصدار سند التصفية</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsManagerClearanceModalOpen(false)}
                                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                                >
                                    إلغاء
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* CLEARANCE VOUCHER PREVIEW & PRINT MODAL */}
            {selectedClearanceVoucher && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 transition-all">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                                <Coins size={18} className="text-purple-600 dark:text-purple-400" />
                                معاينة سند استلام وتصفية صندوق المدير
                            </h3>
                            <button 
                                onClick={() => setSelectedClearanceVoucher(null)} 
                                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition cursor-pointer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2">
                                <span className="text-xs text-slate-500 font-bold">رقم السند:</span>
                                <span className="text-sm font-extrabold font-mono text-purple-600 dark:text-purple-400">
                                    #{selectedClearanceVoucher.clearanceNumber || selectedClearanceVoucher.voucherNumber}
                                </span>
                            </div>

                            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2 text-xs">
                                <span className="text-slate-500 font-bold">التاريخ والوقت:</span>
                                <span className="font-mono text-slate-800 dark:text-slate-200">
                                    {selectedClearanceVoucher.date ? format(selectedClearanceVoucher.date, 'yyyy/MM/dd HH:mm') : '-'}
                                </span>
                            </div>

                            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2 text-xs">
                                <span className="text-slate-500 font-bold">الموظف المصفى:</span>
                                <span className="font-extrabold text-slate-900 dark:text-white">
                                    {selectedClearanceVoucher.employeeName}
                                </span>
                            </div>

                            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2 text-xs">
                                <span className="text-slate-500 font-bold">الصندوق المخصوم منه:</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                    {selectedClearanceVoucher.boxType === 'card_cashbox' ? 'صندوق الكروت (ر.ي)' : 'صندوق المحل (ر.س)'}
                                </span>
                            </div>

                            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800 pb-2 text-xs">
                                <span className="text-slate-500 font-bold">المستلم (المدير):</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                    {selectedClearanceVoucher.managerName}
                                </span>
                            </div>

                            <div className="bg-purple-100/80 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-800 rounded-xl p-3 text-center">
                                <div className="text-[11px] font-bold text-purple-800 dark:text-purple-300">المبلغ المستلم والمصفى:</div>
                                <div className="text-xl font-black font-mono text-purple-900 dark:text-purple-200 mt-1">
                                    {selectedClearanceVoucher.amount.toLocaleString()} {selectedClearanceVoucher.currency}
                                </div>
                            </div>

                            <div className="text-xs">
                                <span className="text-slate-500 font-bold block mb-1">البيان والملاحظات:</span>
                                <p className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 leading-relaxed">
                                    {selectedClearanceVoucher.notes || 'سند استلام وتصفية نقدية من صندوق الموظف إلى صندوق المدير'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handlePrintClearanceVoucher(selectedClearanceVoucher)}
                                className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                <Printer size={15} />
                                <span>طباعة سند التصفية</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedClearanceVoucher(null)}
                                className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
