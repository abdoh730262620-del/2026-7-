import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, addDoc, updateDoc, getDocs, deleteDoc, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore, AppRole } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { logUserAction } from '../lib/logger';
import { format } from 'date-fns';
import { 
    Users, UserCheck, Banknote, ArrowDownLeft, Sparkles, Plus, X, 
    Search, ArrowLeft, ArrowRight, Wallet, TrendingDown, Receipt, Save, RefreshCw,
    Shield, Briefcase, Wifi, Package, ShoppingBag, Edit3, Coins,
    Filter, FileText, Printer, Share2, Calendar, Trash2, Calculator, CheckCircle2,
    AlertTriangle, CreditCard, Eye, Download, ArrowRightLeft, FileSpreadsheet
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

export default function Employees() {
    const { appUser } = useAuthStore();
    const tenantId = appUser?.tenantId || 'single_store';
    const settings = useSettingsStore(state => state.settings);

    const [employees, setEmployees] = useState<EmployeeUser[]>([]);
    const [withdrawals, setWithdrawals] = useState<WithdrawalRecord[]>([]);
    const [cardSales, setCardSales] = useState<CardSaleRecord[]>([]);
    const [generalSales, setGeneralSales] = useState<GeneralSaleRecord[]>([]);
    
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeUser | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Filter states for employee detail view
    const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
    const [filterType, setFilterType] = useState<'all' | 'withdrawals' | 'commissions'>('all');
    const [detailSearchTerm, setDetailSearchTerm] = useState<string>('');
    const [activeSalesCategory, setActiveSalesCategory] = useState<'general' | 'cards' | 'credit_general' | 'credit_cards'>('general');
    const [activeMainTableTab, setActiveMainTableTab] = useState<'sales' | 'withdrawals'>('sales');
    const [selectedInvoicePreview, setSelectedInvoicePreview] = useState<{
        isOpen: boolean;
        invoice: any;
        type: 'sale' | 'card_sale';
        items: any[];
    } | null>(null);

    const [activeMetricModal, setActiveMetricModal] = useState<MetricType | null>(null);
    const canViewAllEmployees = appUser?.role === 'admin' || (appUser?.role as string) === 'manager' || appUser?.permissions?.users?.view === true;

    // Auto-select logged in employee if they lack permission to view all employees
    useEffect(() => {
        if (!canViewAllEmployees && appUser) {
            const foundSelf = employees.find(e => e.id === appUser.uid || (e.email && appUser.email && e.email.toLowerCase() === appUser.email.toLowerCase()));
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
        if (isWithdrawalsReportModalOpen) {
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
    }, [selectedEmployee, canViewAllEmployees, isWithdrawModalOpen, isWithdrawOtherModalOpen, isSalaryModalOpen, isWithdrawalsReportModalOpen]);

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

        return () => {
            unsubUsers();
            unsubWithdrawals();
            unsubSales();
            unsubGeneralSales();
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

    const getTotalCommissions = (emp: EmployeeUser) => {
        const empSales = getEmployeeCardSales(emp);
        return empSales.reduce((sum, s) => sum + (parseFloat(String(s.commissionAmount)) || 0), 0);
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

    // Delete Withdrawal
    const handleDeleteWithdrawal = async (withdrawalId: string, amount: number) => {
        if (!window.confirm(`هل أنت تأكد من إلغاء وحذف عملية السحب بمبلغ ${amount.toLocaleString()} ر.ي؟`)) {
            return;
        }
        try {
            await deleteDoc(doc(db, 'employee_withdrawals', withdrawalId));
            await logUserAction('حذف مسحوبات موظف', `تم إلغاء وحذف عملية السحب رقم ${withdrawalId} بمبلغ ${amount} ر.ي`);
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
        const totComm = empCardSales.reduce((sum, s) => sum + (parseFloat(String(s.commissionAmount)) || 0), 0);

        const cardCashList = empCardSales.filter(cs => cs.saleType !== 'credit' && cs.paymentType !== 'credit' && cs.paymentType !== 'deferred');
        const totCardCash = cardCashList.reduce((sum, cs) => sum + (Number(cs.totalPrice || cs.amount) || 0), 0);

        const cardCreditList = empCardSales.filter(cs => cs.saleType === 'credit' || cs.paymentType === 'credit' || cs.paymentType === 'deferred');
        const totCardCredit = cardCreditList.reduce((sum, cs) => sum + (Number(cs.totalPrice || cs.amount) || 0), 0);

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
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
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

        const cardCashRows = cardCashList.map((cs, idx) => `
            <tr>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${cs.categoryName || 'كروت شبكات'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.createdAt || cs.date ? format(new Date(cs.createdAt || cs.date), 'yyyy/MM/dd HH:mm') : '-'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.quantity || 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${(Number(cs.unitPrice || cs.price) || 0).toLocaleString()} ر.ي</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #4f46e5;">${(Number(cs.totalPrice || cs.amount) || 0).toLocaleString()} ر.ي</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #16a34a;">+${(Number(cs.commissionAmount) || 0).toLocaleString()} ر.ي</td>
            </tr>
        `).join('');

        const cardCreditRows = cardCreditList.map((cs, idx) => `
            <tr>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${idx + 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${cs.categoryName || 'كروت شبكات (آجل)'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.createdAt || cs.date ? format(new Date(cs.createdAt || cs.date), 'yyyy/MM/dd HH:mm') : '-'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: right;">${cs.customerName || cs.buyerName || 'عميل آجل'}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center;">${cs.quantity || 1}</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #7c3aed;">${(Number(cs.totalPrice || cs.amount) || 0).toLocaleString()} ر.ي</td>
                <td style="padding: 6px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #16a34a;">+${(Number(cs.commissionAmount) || 0).toLocaleString()} ر.ي</td>
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

                <!-- 3. Card Cash Sales Table -->
                <div class="section-title">
                    <span>3. سجل مبيعات الكروت النقدية (${cardCashList.length})</span>
                    <span style="color: #4f46e5;">الإجمالي: ${totCardCash.toLocaleString()} ر.ي</span>
                </div>
                ${cardCashList.length === 0 ? '<p style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">لا توجد مبيعات كروت نقدية مسجلة</p>' : `
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
                        <tbody>${cardCashRows}</tbody>
                    </table>
                `}

                <!-- 4. Card Credit Sales Table -->
                <div class="section-title">
                    <span>4. سجل مبيعات الكروت الآجل (${cardCreditList.length})</span>
                    <span style="color: #7c3aed;">الإجمالي: ${totCardCredit.toLocaleString()} ر.ي</span>
                </div>
                ${cardCreditList.length === 0 ? '<p style="text-align: center; color: #94a3b8; padding: 8px; font-size: 11px;">لا توجد مبيعات كروت آجل مسجلة</p>' : `
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
                        <tbody>${cardCreditRows}</tbody>
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

            // 1. Create employee_withdrawals record (stores original YER amount)
            await addDoc(collection(db, 'employee_withdrawals'), {
                tenantId,
                employeeId: selectedEmployee.id,
                employeeName: selectedEmployee.name,
                employeeRole: selectedEmployee.role,
                amount: amountNum,
                notes: noteText,
                date: Date.now(),
                createdBy: appUser?.name || appUser?.email || 'المسؤول',
                sourceFund
            });

            // 2. Deduct from corresponding cash box
            if (isNetworkWorker) {
                // Deduct from network cards cashbox (card_cashbox) directly in Yemeni Rials (YER)
                await addDoc(collection(db, 'card_cashbox'), {
                    tenantId,
                    type: 'manual_out',
                    title: `مسحوبات الموظف: ${selectedEmployee.name}${noteText ? ` (${noteText})` : ''}`,
                    amount: amountNum,
                    date: Date.now(),
                    isIncome: false,
                    createdBy: appUser?.name || appUser?.email || 'المسؤول'
                });
            } else {
                // Deduct from general cash box via payment voucher (vouchers) in Saudi Rials (SAR)
                let nextVNum = '1';
                try {
                    const qNum = query(
                        collection(db, 'vouchers'),
                        where('tenantId', '==', tenantId),
                        orderBy('voucherNumber', 'desc')
                    );
                    const snap = await getDocs(qNum);
                    if (!snap.empty) {
                        const allNums = snap.docs.map(d => parseInt(d.data().voucherNumber) || 0).filter(n => !isNaN(n));
                        const maxNum = allNums.length > 0 ? Math.max(...allNums) : 0;
                        nextVNum = (maxNum + 1).toString();
                    }
                } catch (err) {
                    console.error('Error fetching max voucher number:', err);
                }

                await addDoc(collection(db, 'vouchers'), {
                    tenantId,
                    voucherNumber: nextVNum,
                    type: 'payment', // صرف من الصندوق العام
                    partyType: 'customer',
                    partyName: `مسحوبات الموظف: ${selectedEmployee.name}`,
                    partyId: selectedEmployee.id,
                    amount: convertedSarAmount,
                    description: `مسحوبات وسلفة الموظف: ${selectedEmployee.name}${noteText ? ` - ${noteText}` : ''} (تم السحب بـ ${amountNum} ر.ي بسعر تحويل ${rate})`,
                    date: Date.now(),
                    createdBy: appUser?.name || appUser?.email || 'المسؤول'
                });
            }

            await logUserAction(
                'إضافة سحب للموظف',
                isNetworkWorker 
                    ? `تم سحب مبلغ ${amountNum} ر.ي للموظف ${selectedEmployee.name} والخصم من صندوق الشبكات مباشرة${maxLimit > 0 && newTotal > maxLimit ? ' (تجاوز سقف السلف)' : ''}`
                    : `تم سحب مبلغ ${amountNum} ر.ي (يعادل ${convertedSarAmount} ر.س) للموظف ${selectedEmployee.name} والخصم من الصندوق العام${maxLimit > 0 && newTotal > maxLimit ? ' (تجاوز سقف السلف)' : ''}`
            );

            if (isNetworkWorker) {
                alert(`تم تسجيل الخصم والسحب بنجاح بمبلغ ${amountNum.toLocaleString()} ر.ي من صندوق الشبكات مباشرة.`);
            } else {
                alert(`تم تسجيل الخصم والسحب بنجاح بمبلغ ${amountNum.toLocaleString()} ر.ي (يعادل ${convertedSarAmount.toLocaleString()} ر.س تم خصمها من الصندوق العام بسعر صرف ${rate}).`);
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

            // 1. Create employee_withdrawals record for the TARGET EMPLOYEE (registered on target employee only)
            await addDoc(collection(db, 'employee_withdrawals'), {
                tenantId,
                employeeId: targetEmp.id,
                employeeName: targetEmp.name,
                employeeRole: targetEmp.role,
                amount: amountNum,
                notes: fullNote,
                date: Date.now(),
                createdBy: appUser?.name || appUser?.email || 'المسؤول',
                sourceFund,
                withdrawnFromEmployeeId: selectedEmployee.id,
                withdrawnFromEmployeeName: selectedEmployee.name,
                withdrawnFromEmployeeRole: selectedEmployee.role
            });

            // 2. Deduct from the CURRENT EMPLOYEE's corresponding cash box
            if (isNetworkWorker) {
                // Deduct from network cards cashbox in YER
                await addDoc(collection(db, 'card_cashbox'), {
                    tenantId,
                    type: 'manual_out',
                    title: `سحب للموظف: ${targetEmp.name} (صُرف من صندوق: ${selectedEmployee.name})${userNote ? ` - ${userNote}` : ''}`,
                    amount: amountNum,
                    date: Date.now(),
                    isIncome: false,
                    createdBy: appUser?.name || appUser?.email || 'المسؤول',
                    disbursedByEmployeeId: selectedEmployee.id,
                    disbursedByEmployeeName: selectedEmployee.name,
                    recipientEmployeeId: targetEmp.id,
                    recipientEmployeeName: targetEmp.name
                });
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
                        const allNums = snap.docs.map(d => parseInt(d.data().voucherNumber) || 0).filter(n => !isNaN(n));
                        const maxNum = allNums.length > 0 ? Math.max(...allNums) : 0;
                        nextVNum = (maxNum + 1).toString();
                    }
                } catch (err) {
                    console.error('Error fetching max voucher number:', err);
                }

                await addDoc(collection(db, 'vouchers'), {
                    tenantId,
                    voucherNumber: nextVNum,
                    type: 'payment',
                    partyType: 'customer',
                    partyName: `سحب للموظف: ${targetEmp.name} (صندوق ${selectedEmployee.name})`,
                    partyId: targetEmp.id,
                    amount: convertedSarAmount,
                    description: `سحب للموظف: ${targetEmp.name} صُرف من صندوق ${selectedEmployee.name}${userNote ? ` - ${userNote}` : ''} (سحب ${amountNum} ر.ي بسعر صرف ${rate})`,
                    date: Date.now(),
                    createdBy: appUser?.name || appUser?.email || 'المسؤول',
                    disbursedByEmployeeId: selectedEmployee.id,
                    disbursedByEmployeeName: selectedEmployee.name,
                    recipientEmployeeId: targetEmp.id,
                    recipientEmployeeName: targetEmp.name
                });
            }

            await logUserAction(
                'سحب لموظف آخر من صندوق موظف',
                isNetworkWorker
                    ? `تم صرف سحب بمبلغ ${amountNum} ر.ي للموظف ${targetEmp.name} من صندوق كروت الشبكة للموظف ${selectedEmployee.name}`
                    : `تم صرف سحب بمبلغ ${amountNum} ر.ي (يعادل ${convertedSarAmount} ر.س) للموظف ${targetEmp.name} من الصندوق العام للموظف ${selectedEmployee.name}`
            );

            alert(`تمت عملية السحب بنجاح!\n• الموظف المستفيد: ${targetEmp.name}\n• المبلغ المسجل عليه: ${amountNum.toLocaleString()} ر.ي\n• تم الخصم المالي من صندوق: ${selectedEmployee.name} (${isNetworkWorker ? 'صندوق كروت الشبكة' : 'الصندوق العام'}) دون إضافة سلفة على رصيده.`);

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

                    {filteredEmployees.length === 0 ? (
                        <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-slate-200 dark:border-slate-800">
                            <Users size={40} className="mx-auto text-slate-300 dark:text-slate-700 mb-2 stroke-[1.5]" />
                            <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300 mb-1">لا يوجد موظفين مطابقين</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                يمكنك تعيين دور (كاشير، أمين مخزن، أو عامل شبكة) لأي مستخدم من قسم إعدادات المستخدمين ليظهر هنا تلقائياً.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                            {filteredEmployees.map((emp) => {
                                const roleInfo = roleConfig[emp.role] || {
                                    label: emp.role,
                                    icon: UserCheck,
                                    color: 'text-slate-600',
                                    bg: 'bg-slate-100',
                                    border: 'border-slate-200'
                                };
                                const RoleIcon = roleInfo.icon;
                                const totalWithdraw = getTotalWithdrawals(emp);
                                const totalComm = getTotalCommissions(emp);

                                return (
                                    <div
                                        key={emp.id}
                                        onClick={() => setSelectedEmployee(emp)}
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
                                            <table className="w-full text-right text-xs">
                                                <thead>
                                                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                                                        <th className="py-2.5 px-2">رقم الفاتورة / الحركة</th>
                                                        <th className="py-2.5 px-2">التاريخ والوقت</th>
                                                        <th className="py-2.5 px-2">البيان / العميل / الفئة</th>
                                                        <th className="py-2.5 px-2">طريقة الدفع</th>
                                                        <th className="py-2.5 px-2">الإجمالي</th>
                                                        <th className="py-2.5 px-2 text-center">إجراء</th>
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
                                                            <tr key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-950/50 transition">
                                                                <td className="py-2.5 px-2 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                                    {invNum}
                                                                </td>
                                                                <td className="py-2.5 px-2 font-mono text-slate-500">
                                                                    {dateFormatted}
                                                                </td>
                                                                <td className="py-2.5 px-2 text-slate-800 dark:text-slate-200 font-extrabold">
                                                                    {partyOrCategory}
                                                                </td>
                                                                <td className="py-2.5 px-2">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                        isCredit 
                                                                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' 
                                                                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                                    }`}>
                                                                        {isCredit ? 'آجل' : 'نقدي'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-2 font-black font-mono text-slate-900 dark:text-white">
                                                                    {totalAmt.toLocaleString()} {isCard ? 'ر.ي' : 'ر.س'}
                                                                </td>
                                                                <td className="py-2.5 px-2 text-center">
                                                                    <button
                                                                        type="button"
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
                                                                        className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/80 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 rounded-lg text-[11px] font-bold flex items-center gap-1 mx-auto transition cursor-pointer"
                                                                        title="معاينة الفاتورة"
                                                                    >
                                                                        <Eye size={12} />
                                                                        معاينة
                                                                    </button>
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
                                                <table className="w-full text-right text-xs">
                                                    <thead>
                                                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                                                            <th className="py-2 px-2">التاريخ والوقت</th>
                                                            <th className="py-2 px-2">المبلغ</th>
                                                            <th className="py-2 px-2">البيان / الملاحظات</th>
                                                            <th className="py-2 px-2">مصدر الخصم</th>
                                                            <th className="py-2 px-2">بواسطة</th>
                                                            <th className="py-2 px-2 text-center">إجراء</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                                                        {personalWithdrawals.map((w) => (
                                                            <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/50">
                                                                <td className="py-2.5 px-2 font-mono text-slate-500">
                                                                    {w.date ? format(w.date, 'yyyy/MM/dd HH:mm') : '-'}
                                                                </td>
                                                                <td className="py-2.5 px-2 font-bold font-mono text-red-600 dark:text-red-400">
                                                                    {parseFloat(String(w.amount)).toLocaleString()} ر.ي
                                                                </td>
                                                                <td className="py-2.5 px-2 text-slate-700 dark:text-slate-300">
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <span>{w.notes || 'سحب سلفة'}</span>
                                                                        {w.withdrawnFromEmployeeName && (
                                                                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                                                                (صُرف من صندوق الموظف: {w.withdrawnFromEmployeeName})
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5 px-2">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                        w.sourceFund === 'network_cashbox'
                                                                            ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400'
                                                                            : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                                                                    }`}>
                                                                        {w.sourceFund === 'network_cashbox' ? 'صندوق الشبكات' : 'الصندوق العام'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-2 text-slate-400 text-[11px]">
                                                                    {w.createdBy || '-'}
                                                                </td>
                                                                <td className="py-2.5 px-2 text-center">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteWithdrawal(w.id, w.amount)}
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
                                                <table className="w-full text-right text-xs">
                                                    <thead>
                                                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold">
                                                            <th className="py-2 px-2">التاريخ والوقت</th>
                                                            <th className="py-2 px-2">الموظف المستفيد</th>
                                                            <th className="py-2 px-2">المبلغ المصروف</th>
                                                            <th className="py-2 px-2">البيان والملاحظات</th>
                                                            <th className="py-2 px-2">الصندوق المخصوم منه</th>
                                                            <th className="py-2 px-2">بواسطة</th>
                                                            <th className="py-2 px-2 text-center">إجراء</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                                                        {disbursementsFromThisFund.map((w) => (
                                                            <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/50">
                                                                <td className="py-2.5 px-2 font-mono text-slate-500">
                                                                    {w.date ? format(w.date, 'yyyy/MM/dd HH:mm') : '-'}
                                                                </td>
                                                                <td className="py-2.5 px-2 font-bold text-slate-800 dark:text-slate-200">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span>{w.employeeName}</span>
                                                                        <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                                                            {roleConfig[w.employeeRole as AppRole]?.label || w.employeeRole}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5 px-2 font-bold font-mono text-amber-600 dark:text-amber-400">
                                                                    {parseFloat(String(w.amount)).toLocaleString()} ر.ي
                                                                </td>
                                                                <td className="py-2.5 px-2 text-slate-700 dark:text-slate-300">
                                                                    {w.notes || 'سحب سلفة صُرفت من صندوق الموظف'}
                                                                </td>
                                                                <td className="py-2.5 px-2">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                        w.sourceFund === 'network_cashbox'
                                                                            ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400'
                                                                            : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                                                                    }`}>
                                                                        {w.sourceFund === 'network_cashbox' ? 'صندوق كروت الشبكة' : 'الصندوق العام للمحل'}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-2 text-slate-400 text-[11px]">
                                                                    {w.createdBy || '-'}
                                                                </td>
                                                                <td className="py-2.5 px-2 text-center">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteWithdrawal(w.id, w.amount)}
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
        </div>
    );
}
