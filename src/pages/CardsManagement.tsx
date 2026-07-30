import React, { useState, useEffect } from 'react';
import { 
    Layers, Plus, Users, ArrowRight, Trash2, Edit, CreditCard, 
    FileText, Calendar, DollarSign, Receipt, Printer, CheckCircle2, 
    X, Sparkles, TrendingUp, Wallet, ArrowUpRight, ArrowDownLeft, Search, UserCheck,
    Share2, MessageSquare, Send
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc, addDoc as firestoreAddDoc, updateDoc as firestoreUpdateDoc, deleteDoc as firestoreDeleteDoc } from 'firebase/firestore';

// Helper functions for offline-safe writes
const safeWrite = async (promise: Promise<any>) => {
    if (!window.navigator.onLine) {
        promise.catch((e: any) => console.warn('Offline write deferred', e));
        return Promise.resolve();
    }
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(resolve, 800)) // 800ms timeout for UI responsiveness
    ]);
};

const addDoc = (ref: any, data: any) => safeWrite(firestoreAddDoc(ref, data));
const updateDoc = (ref: any, data: any) => safeWrite(firestoreUpdateDoc(ref, data));
const deleteDoc = (ref: any) => safeWrite(firestoreDeleteDoc(ref));

import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { CardCategory, CardDistributor, CardStockLog, CardSale, CardVoucher, CardCashboxEntry } from '../types/cardTypes';
import { printReport } from '../lib/printHelper';
import CardSaleModal from '../components/CardSaleModal';



export default function CardsManagement() {
    const { appUser, hasPermission } = useAuthStore();
    const tenantId = 'single_store';

    // Active Section View: null (Main 6 Squares Grid) OR 'add_stock' | 'categories' | 'distributors' | 'monthly_sales' | 'sales_cashbox' | 'vouchers'
    const [activeSection, setActiveSection] = useState<string | null>(null);

    // General Cards Permissions for backward compatibility
    const canViewCards = hasPermission('cards', 'view');
    const canAddCards = hasPermission('cards', 'add');
    const canEditCards = hasPermission('cards', 'edit');
    const canDeleteCards = hasPermission('cards', 'delete');

    // Section-specific view/add/edit/delete helper
    const getSecPermission = (module: string, action: 'view' | 'add' | 'edit' | 'delete') => {
        // If specific permission exists in user permissions, check it. Otherwise fallback to general cards permission
        const hasSpecificPerm = appUser?.permissions && module in appUser.permissions;
        if (hasSpecificPerm) {
            return hasPermission(module as any, action);
        }
        if (action === 'view') return canViewCards;
        if (action === 'add') return canAddCards;
        if (action === 'edit') return canEditCards;
        if (action === 'delete') return canDeleteCards;
        return false;
    };

    const getPermKeyForSection = (secId: string | null) => {
        if (secId === 'add_stock') return 'cards_stock';
        if (secId === 'categories') return 'cards_categories';
        if (secId === 'distributors') return 'cards_distributors';
        if (secId === 'sellers') return 'cards_sellers';
        if (secId === 'monthly_sales') return 'cards_sales_report';
        if (secId === 'sales_cashbox') return 'cards_cashbox';
        if (secId === 'vouchers') return 'cards_vouchers';
        return 'cards';
    };

    // Can view general dashboard if they have general cards view OR any cards subsection view permission
    const canViewDashboard = canViewCards || 
        getSecPermission('cards_stock', 'view') ||
        getSecPermission('cards_categories', 'view') ||
        getSecPermission('cards_distributors', 'view') ||
        getSecPermission('cards_sellers', 'view') ||
        getSecPermission('cards_sales_report', 'view') ||
        getSecPermission('cards_cashbox', 'view') ||
        getSecPermission('cards_vouchers', 'view');

    // Determine current active section permissions dynamically
    const currentPermKey = getPermKeyForSection(activeSection);
    const canView = activeSection === null ? canViewDashboard : getSecPermission(currentPermKey, 'view');
    const canAdd = getSecPermission(currentPermKey, 'add');
    const canEdit = getSecPermission(currentPermKey, 'edit');
    const canDelete = getSecPermission(currentPermKey, 'delete');

    // Data State
    const [categories, setCategories] = useState<CardCategory[]>([]);
    const [distributors, setDistributors] = useState<CardDistributor[]>([]);
    const [stockLogs, setStockLogs] = useState<CardStockLog[]>([]);
    const [sales, setSales] = useState<CardSale[]>([]);
    const [vouchers, setVouchers] = useState<CardVoucher[]>([]);
    const [cashboxEntries, setCashboxEntries] = useState<CardCashboxEntry[]>([]);

    // Sale Modal Trigger
    const [saleModalCategory, setSaleModalCategory] = useState<string | null>(null);

    // Modals
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<CardCategory | null>(null);
    const [catNameInput, setCatNameInput] = useState('');
    const [catWholesaleInput, setCatWholesaleInput] = useState('');
    const [catRetailInput, setCatRetailInput] = useState('');
    const [catLinkedSectionInput, setCatLinkedSectionInput] = useState('');

    const [isDistributorModalOpen, setIsDistributorModalOpen] = useState(false);
    const [editingDistributor, setEditingDistributor] = useState<CardDistributor | null>(null);
    const [distNameInput, setDistNameInput] = useState('');
    const [distPhoneInput, setDistPhoneInput] = useState('');
    const [distCommissionInput, setDistCommissionInput] = useState('');
    const [distPreviousDebtInput, setDistPreviousDebtInput] = useState('');
    const [distDateInput, setDistDateInput] = useState(new Date().toISOString().split('T')[0]);
    const [distributorSubSection, setDistributorSubSection] = useState<'accounts' | 'list' | 'add' | null>(null);
    const [selectedDistributorForDetails, setSelectedDistributorForDetails] = useState<CardDistributor | null>(null);

    // Share states for Distributor Ledger
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareDistName, setShareDistName] = useState('');
    const [sharePhone, setSharePhone] = useState('');
    const [shareText, setShareText] = useState('');
    const [shareSmsText, setShareSmsText] = useState('');

    const [isStockModalOpen, setIsStockModalOpen] = useState(false);
    const [stockCategoryId, setStockCategoryId] = useState('');
    const [stockQtyInput, setStockQtyInput] = useState('');

    const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);
    const [voucherType, setVoucherType] = useState<'receipt' | 'payment'>('receipt');
    const [voucherDistributorId, setVoucherDistributorId] = useState('');
    const [voucherAmountInput, setVoucherAmountInput] = useState('');
    const [voucherNotesInput, setVoucherNotesInput] = useState('');

    const [isCashboxModalOpen, setIsCashboxModalOpen] = useState(false);
    const [cashboxIsIncome, setCashboxIsIncome] = useState(true);
    const [cashboxTitleInput, setCashboxTitleInput] = useState('');
    const [cashboxAmountInput, setCashboxAmountInput] = useState('');

    // Function to handle sharing distributor details and account ledger
    const handleShareClick = (
        dist: CardDistributor,
        currentBalance: number,
        creditSales: number,
        cashSales: number,
        receipts: number
    ) => {
        if (!dist.phone || dist.phone.trim() === '') {
            alert('عذراً، لا يوجد رقم هاتف مسجل لهذا الموزع. يرجى تعديل بيانات الموزع وإضافة رقم هاتف أولاً لإتمام المشاركة.');
            return;
        }

        // Clean and format yemen phone number
        let cleaned = dist.phone.replace(/\D/g, '');
        if (cleaned.startsWith('00967')) {
            cleaned = cleaned.substring(5);
        } else if (cleaned.startsWith('967')) {
            cleaned = cleaned.substring(3);
        }
        if (cleaned.startsWith('0')) {
            cleaned = cleaned.substring(1);
        }
        const finalPhone = '967' + cleaned;

        const messageText = `*كشف حساب الموزع: ${dist.name}*\n` +
            `التاريخ: ${new Date().toLocaleDateString('ar-YE')}\n\n` +
            `رصيد أول المدة (الدين السابق): ${(dist.previousDebt || 0).toFixed(2)} ر.س\n` +
            `إجمالي مبيعات آجلة: ${creditSales.toFixed(2)} ر.س\n` +
            `إجمالي مبيعات نقدية: ${cashSales.toFixed(2)} ر.س\n` +
            `إجمالي المقبوضات: ${receipts.toFixed(2)} ر.س\n` +
            `-----------------------------------\n` +
            `*الرصيد المستحق الحالي:* *${currentBalance.toFixed(2)} ر.س*\n\n` +
            `شكراً لتعاملكم معنا.`;

        const smsText = `كشف حساب الموزع: ${dist.name}\n` +
            `رصيد البداية: ${(dist.previousDebt || 0).toFixed(2)} ر.س\n` +
            `مبيعات آجلة: ${creditSales.toFixed(2)} ر.س\n` +
            `مقبوضات: ${receipts.toFixed(2)} ر.س\n` +
            `الرصيد المستحق الحالي: ${currentBalance.toFixed(2)} ر.س`;

        setShareDistName(dist.name);
        setSharePhone(finalPhone);
        setShareText(messageText);
        setShareSmsText(smsText);
        setIsShareModalOpen(true);
    };

    // Monthly Sales Filter
    const now = new Date();
    const currentMonthDefault = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [selectedMonth, setSelectedMonth] = useState(currentMonthDefault);

    // Firebase Subscriptions
    useEffect(() => {
        const qCat = query(collection(db, 'card_categories'), where('tenantId', '==', tenantId));
        const unsubCat = onSnapshot(qCat, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardCategory));
            setCategories(list);
        });

        const qDist = query(collection(db, 'card_distributors'), where('tenantId', '==', tenantId));
        const unsubDist = onSnapshot(qDist, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardDistributor));
            setDistributors(list);
        });

        const qLogs = query(collection(db, 'card_stock_logs'), where('tenantId', '==', tenantId));
        const unsubLogs = onSnapshot(qLogs, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardStockLog));
            list.sort((a, b) => b.additionDate.localeCompare(a.additionDate));
            setStockLogs(list);
        });

        const qSales = query(collection(db, 'card_sales'), where('tenantId', '==', tenantId));
        const unsubSales = onSnapshot(qSales, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardSale));
            list.sort((a, b) => b.dateTime.localeCompare(a.dateTime));
            setSales(list);
        });

        const qVouch = query(collection(db, 'card_vouchers'), where('tenantId', '==', tenantId));
        const unsubVouch = onSnapshot(qVouch, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardVoucher));
            list.sort((a, b) => b.dateTime.localeCompare(a.dateTime));
            setVouchers(list);
        });

        const qCash = query(collection(db, 'card_cashbox'), where('tenantId', '==', tenantId));
        const unsubCash = onSnapshot(qCash, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardCashboxEntry));
            list.sort((a, b) => b.dateTime.localeCompare(a.dateTime));
            setCashboxEntries(list);
        });

        return () => {
            unsubCat();
            unsubDist();
            unsubLogs();
            unsubSales();
            unsubVouch();
            unsubCash();
        };
    }, []);

    // Handle global Layout header back action to go back between sections
    useEffect(() => {
        (window as any).onHeaderBack = () => {
            if (activeSection === 'distributors' && selectedDistributorForDetails !== null) {
                setSelectedDistributorForDetails(null);
                return true;
            }
            if (activeSection === 'distributors' && distributorSubSection !== null) {
                setDistributorSubSection(null);
                return true;
            }
            if (activeSection !== null) {
                setActiveSection(null);
                return true; // handled
            }
            return false; // not handled, will go to home
        };
        return () => {
            if ((window as any).onHeaderBack) {
                delete (window as any).onHeaderBack;
            }
        };
    }, [activeSection, distributorSubSection, selectedDistributorForDetails]);

    // ----------------------------------------------------
    // Category Operations
    // ----------------------------------------------------
    const handleSaveCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!catNameInput.trim()) return;

        try {
            const wholesalePrice = parseFloat(catWholesaleInput) || 0;
            const retailPrice = parseFloat(catRetailInput) || 0;

            if (editingCategory) {
                await updateDoc(doc(db, 'card_categories', editingCategory.id), {
                    name: catNameInput.trim(),
                    wholesalePrice,
                    retailPrice,
                    linkedSection: catLinkedSectionInput.trim(),
                    updatedAt: Date.now()
                });
            } else {
                await addDoc(collection(db, 'card_categories'), {
                    tenantId,
                    name: catNameInput.trim(),
                    wholesalePrice,
                    retailPrice,
                    availableCount: 0,
                    linkedSection: catLinkedSectionInput.trim(),
                    createdAt: Date.now()
                });
            }

            setIsCategoryModalOpen(false);
            setEditingCategory(null);
            setCatNameInput('');
            setCatWholesaleInput('');
            setCatRetailInput('');
            setCatLinkedSectionInput('');
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'card_categories');
        }
    };

    const handleDeleteCategory = async (id: string, name: string) => {
        if (window.confirm(`هل أنت تأكد من حذف الفئة "${name}"؟`)) {
            try {
                await deleteDoc(doc(db, 'card_categories', id));
            } catch (error) {
                handleFirestoreError(error, OperationType.DELETE, 'card_categories');
            }
        }
    };

    // ----------------------------------------------------
    // Stock Operations (إضافة رصيد كروت)
    // ----------------------------------------------------
    const handleSaveAddStock = async (e: React.FormEvent) => {
        e.preventDefault();
        const cat = categories.find(c => c.id === stockCategoryId);
        if (!cat) {
            alert('يرجى اختيار الفئة');
            return;
        }

        const qty = parseInt(stockQtyInput, 10);
        if (!qty || qty <= 0) {
            alert('يرجى كتابة عدد كروت صحيح');
            return;
        }

        try {
            const newAvailableCount = (cat.availableCount || 0) + qty;
            await updateDoc(doc(db, 'card_categories', cat.id), {
                availableCount: newAvailableCount,
                updatedAt: Date.now()
            });

            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            await addDoc(collection(db, 'card_stock_logs'), {
                tenantId,
                categoryId: cat.id,
                categoryName: cat.name,
                quantityAdded: qty,
                userName: appUser?.name || appUser?.email || 'المدير',
                additionDate: `${dateStr} ${timeStr}`,
                availableCountAfter: newAvailableCount,
                createdAt: Date.now()
            });

            setIsStockModalOpen(false);
            setStockCategoryId('');
            setStockQtyInput('');
            alert(`تمت إضافة ${qty} كارت إلى فئة "${cat.name}" بنجاح.`);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'card_categories');
        }
    };

    // ----------------------------------------------------
    // Distributor Operations
    // ----------------------------------------------------
    const handleSaveDistributor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!distNameInput.trim()) return;
        if (!distPhoneInput.trim()) {
            alert('يرجى إدخال رقم هاتف الموزع');
            return;
        }

        try {
            const commission = parseFloat(distCommissionInput) || 0;
            const prevDebt = parseFloat(distPreviousDebtInput) || 0;

            if (editingDistributor) {
                const oldPrevDebt = editingDistributor.previousDebt || 0;
                const diff = prevDebt - oldPrevDebt;
                const newBalance = (editingDistributor.balance || 0) + diff;

                await updateDoc(doc(db, 'card_distributors', editingDistributor.id), {
                    name: distNameInput.trim(),
                    phone: distPhoneInput.trim(),
                    commission,
                    previousDebt: prevDebt,
                    balance: newBalance,
                    date: distDateInput,
                    updatedAt: Date.now()
                });
            } else {
                await addDoc(collection(db, 'card_distributors'), {
                    tenantId,
                    name: distNameInput.trim(),
                    phone: distPhoneInput.trim(),
                    commission,
                    previousDebt: prevDebt,
                    balance: prevDebt, // initial balance is set to previous debt
                    date: distDateInput,
                    createdAt: Date.now()
                });
            }

            setIsDistributorModalOpen(false);
            setEditingDistributor(null);
            setDistNameInput('');
            setDistPhoneInput('');
            setDistCommissionInput('');
            setDistPreviousDebtInput('');
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'card_distributors');
        }
    };

    const handleDeleteDistributor = async (id: string, name: string) => {
        if (window.confirm(`هل أنت تأكد من حذف الموزع "${name}"؟`)) {
            try {
                await deleteDoc(doc(db, 'card_distributors', id));
            } catch (error) {
                handleFirestoreError(error, OperationType.DELETE, 'card_distributors');
            }
        }
    };

    // ----------------------------------------------------
    // Distributor Voucher Operations (سندات القبض والصرف)
    // ----------------------------------------------------
    const handleSaveVoucher = async (e: React.FormEvent) => {
        e.preventDefault();
        const dist = distributors.find(d => d.id === voucherDistributorId);
        if (!dist) {
            alert('يرجى تحديد الموزع المستهدف');
            return;
        }

        const amount = parseFloat(voucherAmountInput);
        if (!amount || amount <= 0) {
            alert('يرجى إدخال مبلغ صحيح');
            return;
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const voucherNo = `V-CARD-${Date.now().toString().slice(-6)}`;
        const staffName = appUser?.name || appUser?.email || 'المدير';

        try {
            // 1. Add Voucher Doc
            await addDoc(collection(db, 'card_vouchers'), {
                tenantId,
                type: voucherType,
                voucherNumber: voucherNo,
                distributorId: dist.id,
                distributorName: dist.name,
                amount,
                notes: voucherNotesInput.trim(),
                date: dateStr,
                dateTime: `${dateStr} ${timeStr}`,
                userName: staffName,
                createdAt: Date.now()
            });

            // 2. Update Distributor balance
            // If Receipt (قبض من موزع) -> reduces his debt (balance)
            // If Payment (صرف لموزع) -> increases his debt (balance)
            const currentBalance = dist.balance || 0;
            const newBalance = voucherType === 'receipt' ? currentBalance - amount : currentBalance + amount;
            await updateDoc(doc(db, 'card_distributors', dist.id), {
                balance: newBalance,
                updatedAt: Date.now()
            });

            // 3. Update Sales Cashbox
            // Receipt = Income to cashbox
            // Payment = Expense from cashbox
            await addDoc(collection(db, 'card_cashbox'), {
                tenantId,
                type: 'distributor_payment',
                title: voucherType === 'receipt' 
                    ? `سند قبض من الموزع: ${dist.name} (${voucherNo})`
                    : `سند صرف للموزع: ${dist.name} (${voucherNo})`,
                amount,
                isIncome: voucherType === 'receipt',
                referenceId: voucherNo,
                date: dateStr,
                dateTime: `${dateStr} ${timeStr}`,
                userName: staffName,
                createdAt: Date.now()
            });

            setIsVoucherModalOpen(false);
            setVoucherDistributorId('');
            setVoucherAmountInput('');
            setVoucherNotesInput('');
            alert(`تم حفظ ${voucherType === 'receipt' ? 'سند القبض' : 'سند الصرف'} بنجاح وتحديث حساب الموزع والصندوق.`);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'card_vouchers');
        }
    };

    // ----------------------------------------------------
    // Manual Cashbox Operations (إيداع / سحب)
    // ----------------------------------------------------
    const handleSaveCashboxEntry = async (e: React.FormEvent) => {
        e.preventDefault();
        const amount = parseFloat(cashboxAmountInput);
        if (!amount || amount <= 0 || !cashboxTitleInput.trim()) {
            alert('يرجى كتابة بيان ومبلغ صحيح');
            return;
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const staffName = appUser?.name || appUser?.email || 'المدير';

        try {
            await addDoc(collection(db, 'card_cashbox'), {
                tenantId,
                type: cashboxIsIncome ? 'manual_in' : 'manual_out',
                title: cashboxTitleInput.trim(),
                amount,
                isIncome: cashboxIsIncome,
                date: dateStr,
                dateTime: `${dateStr} ${timeStr}`,
                userName: staffName,
                createdAt: Date.now()
            });

            setIsCashboxModalOpen(false);
            setCashboxTitleInput('');
            setCashboxAmountInput('');
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'card_cashbox');
        }
    };

    // Calculate Cashbox total balance
    const cashboxBalance = cashboxEntries.reduce((acc, entry) => {
        return entry.isIncome ? acc + entry.amount : acc - entry.amount;
    }, 0);

    // Filter Sales by selected month
    const filteredMonthSales = sales.filter(s => s.month === selectedMonth);

    // Monthly Report Calculations per category
    const monthlyCategoryReport = categories.map(cat => {
        const catSales = filteredMonthSales.filter(s => s.categoryName.trim() === cat.name.trim());
        const cashSales = catSales.filter(s => s.paymentType === 'cash');
        const creditSales = catSales.filter(s => s.paymentType === 'credit');

        const cashQty = cashSales.reduce((sum, s) => sum + s.quantity, 0);
        const creditQty = creditSales.reduce((sum, s) => sum + s.quantity, 0);
        const cashNetTotal = cashSales.reduce((sum, s) => sum + s.netTotal, 0);
        const creditNetTotal = creditSales.reduce((sum, s) => sum + s.netTotal, 0);

        return {
            categoryName: cat.name,
            cashQty,
            creditQty,
            totalQty: cashQty + creditQty,
            cashNetTotal,
            creditNetTotal,
            totalNet: cashNetTotal + creditNetTotal
        };
    });

    const totalMonthCashQty = monthlyCategoryReport.reduce((acc, r) => acc + r.cashQty, 0);
    const totalMonthCreditQty = monthlyCategoryReport.reduce((acc, r) => acc + r.creditQty, 0);
    const totalMonthCashNet = monthlyCategoryReport.reduce((acc, r) => acc + r.cashNetTotal, 0);
    const totalMonthCreditNet = monthlyCategoryReport.reduce((acc, r) => acc + r.creditNetTotal, 0);

    // Export Monthly Report PDF
    const handleExportMonthlyPDF = () => {
        const title = `تقرير المبيعات الشهرية لكروت الشبكة - شهر ${selectedMonth}`;
        const headers = ['فئة الكروت', 'عدد النقدية', 'عدد الآجلة', 'إجمالي النقدية', 'إجمالي الآجلة', 'الصافي الإجمالي'];
        const data = monthlyCategoryReport.map(r => [
            r.categoryName,
            `${r.cashQty} كارت`,
            `${r.creditQty} كارت`,
            `${r.cashNetTotal.toFixed(2)} ريال`,
            `${r.creditNetTotal.toFixed(2)} ريال`,
            `${r.totalNet.toFixed(2)} ريال`
        ]);
        data.push([
            'الإجمالي العام',
            `${totalMonthCashQty} كارت`,
            `${totalMonthCreditQty} كارت`,
            `${totalMonthCashNet.toFixed(2)} ريال`,
            `${totalMonthCreditNet.toFixed(2)} ريال`,
            `${(totalMonthCashNet + totalMonthCreditNet).toFixed(2)} ريال`
        ]);
        printReport(title, headers, data);
    };

    // Card Sections definition for the Main Squares Grid
    const sections = [
        {
            id: 'add_stock',
            title: 'إضافة كروت',
            subtitle: 'تزويد ورصيد المخزون',
            icon: Plus,
            color: 'bg-indigo-600',
            lightBg: 'bg-indigo-50 dark:bg-indigo-950/60',
            textColor: 'text-indigo-600 dark:text-indigo-400',
            borderColor: 'border-indigo-100 dark:border-indigo-900/50',
            visible: getSecPermission('cards_stock', 'view')
        },
        {
            id: 'categories',
            title: 'فئات الكروت',
            subtitle: 'إدارة الأسعار والفئات',
            icon: Layers,
            color: 'bg-purple-600',
            lightBg: 'bg-purple-50 dark:bg-purple-950/60',
            textColor: 'text-purple-600 dark:text-purple-400',
            borderColor: 'border-purple-100 dark:border-purple-900/50',
            visible: getSecPermission('cards_categories', 'view')
        },
        {
            id: 'distributors',
            title: 'الموزعين',
            subtitle: 'دليل وحسابات الموزعين',
            icon: Users,
            color: 'bg-blue-600',
            lightBg: 'bg-blue-50 dark:bg-blue-950/60',
            textColor: 'text-blue-600 dark:text-blue-400',
            borderColor: 'border-blue-100 dark:border-blue-900/50',
            visible: getSecPermission('cards_distributors', 'view')
        },
        {
            id: 'sellers',
            title: 'البائعين',
            subtitle: 'عمولات مبيعات التجزئة (10%)',
            icon: UserCheck,
            color: 'bg-teal-600',
            lightBg: 'bg-teal-50 dark:bg-teal-950/60',
            textColor: 'text-teal-600 dark:text-teal-400',
            borderColor: 'border-teal-100 dark:border-teal-900/50',
            visible: getSecPermission('cards_sellers', 'view')
        },
        {
            id: 'monthly_sales',
            title: 'المبيعات الشهرية',
            subtitle: 'تقارير شهري وتصدير PDF',
            icon: TrendingUp,
            color: 'bg-emerald-600',
            lightBg: 'bg-emerald-50 dark:bg-emerald-950/60',
            textColor: 'text-emerald-600 dark:text-emerald-400',
            borderColor: 'border-emerald-100 dark:border-emerald-900/50',
            visible: getSecPermission('cards_sales_report', 'view')
        },
        {
            id: 'sales_cashbox',
            title: 'صندوق المبيعات',
            subtitle: 'تتبع حركة النقدية والمقبوضات',
            icon: Wallet,
            color: 'bg-amber-600',
            lightBg: 'bg-amber-50 dark:bg-amber-950/60',
            textColor: 'text-amber-600 dark:text-amber-400',
            borderColor: 'border-amber-100 dark:border-amber-900/50',
            visible: getSecPermission('cards_cashbox', 'view')
        },
        {
            id: 'vouchers',
            title: 'سندات القبض والصرف',
            subtitle: 'قبض وصرف الموزعين',
            icon: Receipt,
            color: 'bg-rose-600',
            lightBg: 'bg-rose-50 dark:bg-rose-950/60',
            textColor: 'text-rose-600 dark:text-rose-400',
            borderColor: 'border-rose-100 dark:border-rose-900/50',
            visible: getSecPermission('cards_vouchers', 'view')
        }
    ].filter(sec => sec.visible);

    if (!canView) {
        return (
            <div className="p-4 sm:p-6 space-y-6 dir-rtl max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[400px] text-center" dir="rtl">
                <div className="p-4 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl border border-rose-100 dark:border-rose-900/50 mb-4">
                    <Layers size={48} />
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">عذراً، ليس لديك صلاحية لعرض قسم إدارة الكروت</h2>
                <p className="text-sm font-bold text-slate-500 max-w-md mt-2">يرجى التواصل مع مسؤول النظام لتعديل صلاحياتك في الإعدادات.</p>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 space-y-6 dir-rtl max-w-7xl mx-auto" dir="rtl">
            {/* MAIN VIEW: 7 Square Cards (أقسام مربعة مثل القائمة الرئيسية) */}
            {!activeSection && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-5">
                    {sections.map(sec => {
                        const IconComponent = sec.icon;
                        return (
                            <div
                                key={sec.id}
                                onClick={() => setActiveSection(sec.id)}
                                className="group flex flex-col items-center justify-center text-center p-5 md:p-6 rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 bg-white dark:bg-slate-900 transition-all duration-300 shadow-sm hover:shadow-2xl hover:-translate-y-1 cursor-pointer aspect-square"
                            >
                                <div className="flex flex-col items-center">
                                    <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${sec.lightBg} ${sec.textColor} flex items-center justify-center mb-3 transition-transform group-hover:scale-110 border ${sec.borderColor}`}>
                                        <IconComponent className="w-7 h-7 sm:w-8 sm:h-8" />
                                    </div>
                                    <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight mb-1">
                                        {sec.title}
                                    </h3>
                                    <p className="text-[11px] font-bold text-slate-400 max-w-[150px] leading-relaxed">
                                        {sec.subtitle}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* SECTION 1: إضافة كروت (Add Stock) */}
            {activeSection === 'add_stock' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3">
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">سجل إضافة رصيد الكروت</h2>
                        <div className="flex items-center gap-2">
                            {canAdd && (
                                <button
                                    onClick={() => setIsStockModalOpen(true)}
                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition"
                                >
                                    <Plus size={18} />
                                    <span>إضافة رصيد كروت جديد</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-right text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                        <th className="p-4">الفئة</th>
                                        <th className="p-4">الكمية المضافة</th>
                                        <th className="p-4">الرصيد الكلي بعد الإضافة</th>
                                        <th className="p-4">التاريخ والوقت</th>
                                        <th className="p-4">المستخدم</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                                    {stockLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                                                لا توجد عمليات إضافة رصيد سابقة. اضغط "إضافة رصيد كروت جديد" لتزويد الرصيد.
                                            </td>
                                        </tr>
                                    ) : (
                                        stockLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                <td className="p-4 font-black">{log.categoryName}</td>
                                                <td className="p-4 text-emerald-600 font-black">+{log.quantityAdded} كارت</td>
                                                <td className="p-4 text-indigo-600 font-black">{log.availableCountAfter} كارت</td>
                                                <td className="p-4 text-slate-500">{log.additionDate}</td>
                                                <td className="p-4 text-slate-500">{log.userName}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* SECTION 2: فئات الكروت (Card Categories) */}
            {activeSection === 'categories' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3">
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">فئات كروت الشبكة</h2>
                        <div className="flex items-center gap-2">
                            {canAdd && (
                                <button
                                    onClick={() => {
                                        setEditingCategory(null);
                                        setCatNameInput('');
                                        setCatWholesaleInput('');
                                        setCatRetailInput('');
                                        setCatLinkedSectionInput('');
                                        setIsCategoryModalOpen(true);
                                    }}
                                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg shadow-purple-600/20 flex items-center gap-2 transition"
                                >
                                    <Plus size={18} />
                                    <span>إضافة فئة جديدة</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
                        {categories.length === 0 ? (
                            <div className="col-span-full bg-white dark:bg-slate-900 p-10 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs">
                                لم يتم إدخال فئات كروت مخصصة بعد. انقر على زر "إضافة فئة جديدة" للبدء.
                            </div>
                        ) : (
                            categories.map((cat) => (
                                <div
                                    key={cat.id}
                                    className="group relative flex flex-col items-center justify-between text-center p-4 rounded-2xl md:rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-purple-500 dark:hover:border-purple-500 bg-white dark:bg-slate-900 transition-all duration-300 shadow-sm hover:shadow-xl cursor-pointer min-h-[160px]"
                                >
                                    <div className="w-full flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                                        <span className="text-[10px] font-black text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-2 py-0.5 rounded-full">
                                            {cat.retailPrice || 0} ريال
                                        </span>
                                        <div className="flex items-center gap-0.5">
                                            {canEdit && (
                                                <button
                                                    onClick={() => {
                                                        setEditingCategory(cat);
                                                        setCatNameInput(cat.name);
                                                        setCatWholesaleInput(cat.wholesalePrice ? cat.wholesalePrice.toString() : '');
                                                        setCatRetailInput(cat.retailPrice ? cat.retailPrice.toString() : '');
                                                        setCatLinkedSectionInput(cat.linkedSection || '');
                                                        setIsCategoryModalOpen(true);
                                                    }}
                                                    className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                                    title="تعديل الفئة"
                                                >
                                                    <Edit size={14} />
                                                </button>
                                            )}
                                            {canDelete && (
                                                <button
                                                    onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition"
                                                    title="حذف الفئة"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="my-auto flex flex-col items-center py-2">
                                        <div className="w-10 h-10 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform border border-purple-100 dark:border-purple-900/50">
                                            <Layers size={20} />
                                        </div>
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                                            {cat.name}
                                        </h3>
                                        {cat.linkedSection && (
                                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full mt-1">
                                                مرتبط: {cat.linkedSection}
                                            </span>
                                        )}
                                        {cat.wholesalePrice > 0 && (
                                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                                جملة: {cat.wholesalePrice} ريال
                                            </span>
                                        )}
                                    </div>

                                    <div className="w-full pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-black">
                                        <span className="text-[10px] text-slate-400">الرصيد:</span>
                                        <span className="px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-xs">
                                            {cat.availableCount || 0} كارت
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* SECTION 3: الموزعين (Distributors) */}
            {activeSection === 'distributors' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Header & Sub-Navigation */}
                    {distributorSubSection === null && (
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-200">
                            <div>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white">إدارة وحسابات الموزعين</h2>
                                <p className="text-xs font-bold text-slate-400 mt-1">تتبع كشوفات الحسابات والعمولات والديون السابقة للعملاء والمناديب</p>
                            </div>
                        </div>
                    )}

                    {/* MAIN SUB-SECTION MENU: 3 Square Cards (أقسام الموزعين) */}
                    {distributorSubSection === null && (() => {
                        const distSections = [
                            {
                                id: 'accounts',
                                title: 'حسابات الموزعين',
                                subtitle: 'كشوف الحسابات وتتبع الديون والواصل بالتفصيل',
                                icon: Receipt,
                                lightBg: 'bg-blue-50 dark:bg-blue-950/60',
                                textColor: 'text-blue-600 dark:text-blue-400',
                                borderColor: 'border-blue-100 dark:border-blue-900/50'
                            },
                            {
                                id: 'list',
                                title: 'عرض وتعديل الموزعين',
                                subtitle: 'إدارة وتحديث بيانات الموزعين والعمولات والمناديب',
                                icon: Users,
                                lightBg: 'bg-teal-50 dark:bg-teal-950/60',
                                textColor: 'text-teal-600 dark:text-teal-400',
                                borderColor: 'border-teal-100 dark:border-teal-900/50'
                            },
                            ...(canAdd ? [{
                                id: 'add',
                                title: 'إضافة موزع جديد',
                                subtitle: 'تسجيل موزع جديد وتعيين نسبة العمولة له ورصيد البداية',
                                icon: Plus,
                                lightBg: 'bg-indigo-50 dark:bg-indigo-950/60',
                                textColor: 'text-indigo-600 dark:text-indigo-400',
                                borderColor: 'border-indigo-100 dark:border-indigo-900/50'
                            }] : [])
                        ];

                        return (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-5">
                                {distSections.map(sec => {
                                    const IconComponent = sec.icon;
                                    return (
                                        <div
                                            key={sec.id}
                                            onClick={() => {
                                                if (sec.id === 'add') {
                                                    setEditingDistributor(null);
                                                    setDistNameInput('');
                                                    setDistPhoneInput('');
                                                    setDistCommissionInput('');
                                                    setDistPreviousDebtInput('');
                                                    setDistDateInput(new Date().toISOString().split('T')[0]);
                                                }
                                                setDistributorSubSection(sec.id as any);
                                            }}
                                            className="group flex flex-col items-center justify-center text-center p-5 md:p-6 rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-slate-900 transition-all duration-300 shadow-sm hover:shadow-2xl hover:-translate-y-1 cursor-pointer aspect-square animate-in zoom-in-95 duration-200"
                                        >
                                            <div className="flex flex-col items-center">
                                                <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${sec.lightBg} ${sec.textColor} flex items-center justify-center mb-3 transition-transform group-hover:scale-110 border ${sec.borderColor}`}>
                                                    <IconComponent className="w-7 h-7 sm:w-8 sm:h-8" />
                                                </div>
                                                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight mb-1">
                                                    {sec.title}
                                                </h3>
                                                <p className="text-[11px] font-bold text-slate-400 max-w-[150px] leading-relaxed">
                                                    {sec.subtitle}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}

                    {/* Sub-Section 1: Distributors Accounts & Statements */}
                    {distributorSubSection === 'accounts' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            {selectedDistributorForDetails ? (
                                // Render ledger / account details inline as a screen inside section (بحجم الشاشة)
                                (() => {
                                    const dist = selectedDistributorForDetails;
                                    
                                    // 1. Filter Sales
                                    const distSales = sales.filter(s => s.distributorId === dist.id);
                                    const totalSalesCount = distSales.reduce((acc, s) => acc + (s.quantity || 0), 0);
                                    const totalSalesCash = distSales.filter(s => s.paymentType === 'cash').reduce((acc, s) => acc + (s.netTotal || 0), 0);
                                    const totalSalesCredit = distSales.filter(s => s.paymentType === 'credit').reduce((acc, s) => acc + (s.netTotal || 0), 0);
                                    
                                    // 2. Filter Vouchers
                                    const distVouchers = vouchers.filter(v => v.distributorId === dist.id);
                                    const totalReceipts = distVouchers.filter(v => v.type === 'receipt').reduce((acc, v) => acc + v.amount, 0);
                                    const totalPayments = distVouchers.filter(v => v.type === 'payment').reduce((acc, v) => acc + v.amount, 0);

                                    // 3. Compile Ledger Entries
                                    const ledgerEntries: any[] = [];
                                    const initialDebt = dist.previousDebt || 0;

                                    distSales.forEach(sale => {
                                        const isCredit = sale.paymentType === 'credit';
                                        ledgerEntries.push({
                                            id: sale.id,
                                            date: sale.date || (sale.dateTime && sale.dateTime.split(' ')[0]) || '',
                                            dateTime: sale.dateTime || '',
                                            type: isCredit ? 'sale_credit' : 'sale_cash',
                                            title: `مبيعات كروت (${sale.categoryName}) - عدد ${sale.quantity} (${isCredit ? 'آجل' : 'نقدي'})`,
                                            debit: isCredit ? (sale.netTotal || 0) : 0, // Debit increases what they owe us if credit
                                            credit: 0,
                                            ref: sale.id.slice(-6).toUpperCase(),
                                            paymentType: sale.paymentType
                                        });
                                    });

                                    distVouchers.forEach(v => {
                                        const isReceipt = v.type === 'receipt';
                                        ledgerEntries.push({
                                            id: v.id,
                                            date: v.date || (v.dateTime && v.dateTime.split(' ')[0]) || '',
                                            dateTime: v.dateTime || '',
                                            type: isReceipt ? 'voucher_receipt' : 'voucher_payment',
                                            title: isReceipt ? `سند قبض - ${v.notes || 'مستلم من الموزع'}` : `سند صرف - ${v.notes || 'مصروف للموزع'}`,
                                            debit: isReceipt ? 0 : v.amount, // Payment to them increases what they owe us
                                            credit: isReceipt ? v.amount : 0, // Receipt from them reduces what they owe us
                                            ref: v.voucherNumber,
                                            paymentType: 'voucher'
                                        });
                                    });

                                    // Sort chronological
                                    ledgerEntries.sort((a, b) => (a.dateTime || '').localeCompare(b.dateTime || ''));

                                    // Compute running balance starting with previousDebt
                                    let runningBalance = initialDebt;
                                    const ledgerWithRunningBalance = ledgerEntries.map(entry => {
                                        runningBalance = runningBalance + entry.debit - entry.credit;
                                        return {
                                            ...entry,
                                            runningBalance
                                        };
                                    });

                                    return (
                                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col shadow-sm text-right animate-in zoom-in-95 duration-200" dir="rtl">
                                            {/* Sub Header */}
                                            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                                        <Users size={24} />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-black text-slate-900 dark:text-white text-base">كشف حساب وتفاصيل الموزع: {dist.name}</h3>
                                                        <p className="text-xs font-bold text-slate-500 mt-0.5">رقم الهاتف: {dist.phone || 'غير مسجل'} | تاريخ التسجيل: {dist.date}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const titleReport = `كشف حساب الموزع: ${dist.name}`;
                                                            const headersReport = ['التاريخ', 'المرجع', 'البيان', 'مدين (+)', 'دائن (-)', 'الرصيد المستحق'];
                                                            const dataReport = [
                                                                [dist.date, '--', 'رصيد أول المدة', '--', '--', `${initialDebt.toFixed(2)} ريال`]
                                                            ];
                                                            ledgerWithRunningBalance.forEach(e => {
                                                                dataReport.push([
                                                                    e.date,
                                                                    e.ref,
                                                                    e.title,
                                                                    e.debit > 0 ? `${e.debit.toFixed(2)} ريال` : '--',
                                                                    e.credit > 0 ? `${e.credit.toFixed(2)} ريال` : '--',
                                                                    `${e.runningBalance.toFixed(2)} ريال`
                                                                ]);
                                                            });
                                                            printReport(titleReport, headersReport, dataReport);
                                                        }}
                                                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 transition"
                                                    >
                                                        <Printer size={16} />
                                                        <span>طباعة كشف الحساب PDF</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleShareClick(dist, runningBalance, totalSalesCredit, totalSalesCash, totalReceipts)}
                                                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition"
                                                    >
                                                        <Share2 size={16} />
                                                        <span>مشاركة كشف الحساب</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Ledger Content */}
                                            <div className="p-6 space-y-6">
                                                {/* Statistics Grid */}
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 text-right">
                                                        <span className="text-[10px] font-black text-slate-400 block mb-1">الدين السابق (رصيد البداية)</span>
                                                        <span className="text-sm font-black text-slate-700 dark:text-slate-200">{(dist.previousDebt || 0).toFixed(2)} ر.س</span>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 text-right">
                                                        <span className="text-[10px] font-black text-slate-400 block mb-1">صافي الدين الحالي</span>
                                                        <span className={`text-sm font-black ${runningBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                            {runningBalance.toFixed(2)} ر.س
                                                        </span>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 text-right">
                                                        <span className="text-[10px] font-black text-slate-400 block mb-1">المبيعات الآجلة</span>
                                                        <span className="text-sm font-black text-amber-600 dark:text-amber-400">{totalSalesCredit.toFixed(2)} ر.س</span>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 text-right">
                                                        <span className="text-[10px] font-black text-slate-400 block mb-1">المبيعات النقدية</span>
                                                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{totalSalesCash.toFixed(2)} ر.س</span>
                                                    </div>
                                                </div>

                                                {/* Main Table */}
                                                <div className="space-y-3">
                                                    <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                                                        <Receipt size={16} className="text-blue-600 dark:text-blue-400" />
                                                        <span>دفتر كشف الحساب والعمليات التفصيلية</span>
                                                    </h4>
                                                    
                                                    <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-right border-collapse text-xs">
                                                                <thead>
                                                                    <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 font-black border-b border-slate-200 dark:border-slate-800">
                                                                        <th className="p-3">التاريخ</th>
                                                                        <th className="p-3">رقم المرجع</th>
                                                                        <th className="p-3">نوع الحركة / البيان</th>
                                                                        <th className="p-3 text-rose-600 dark:text-rose-400">مدين (+)</th>
                                                                        <th className="p-3 text-emerald-600 dark:text-emerald-400">دائن (-)</th>
                                                                        <th className="p-3">الرصيد المستحق</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold">
                                                                    {/* Row for Starting Balance */}
                                                                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                                                                        <td className="p-3 text-slate-400">{dist.date}</td>
                                                                        <td className="p-3 text-slate-400">--</td>
                                                                        <td className="p-3 font-black text-slate-900 dark:text-white">رصيد أول المدة (الدين السابق)</td>
                                                                        <td className="p-3 text-slate-400">--</td>
                                                                        <td className="p-3 text-slate-400">--</td>
                                                                        <td className="p-3 text-slate-900 dark:text-white font-black">{initialDebt.toFixed(2)} ر.س</td>
                                                                    </tr>

                                                                    {ledgerWithRunningBalance.length === 0 ? (
                                                                        <tr>
                                                                            <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">لا يوجد حركات مسجلة لهذا الموزع بعد.</td>
                                                                        </tr>
                                                                    ) : (
                                                                        ledgerWithRunningBalance.map((entry, index) => (
                                                                            <tr key={`${entry.id}-${index}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                                                                                <td className="p-3 text-slate-500">{entry.date}</td>
                                                                                <td className="p-3 text-slate-400 font-mono text-[10px]">{entry.ref}</td>
                                                                                <td className="p-3 text-slate-800 dark:text-slate-200">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className={`w-2 h-2 rounded-full ${
                                                                                            entry.type === 'sale_credit' 
                                                                                                ? 'bg-amber-400' 
                                                                                                : entry.type === 'sale_cash' 
                                                                                                ? 'bg-emerald-400' 
                                                                                                : entry.type === 'voucher_receipt' 
                                                                                                ? 'bg-teal-500' 
                                                                                                : 'bg-rose-500'
                                                                                        }`} />
                                                                                        <span>{entry.title}</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="p-3 text-rose-600 dark:text-rose-400 font-black">
                                                                                    {entry.debit > 0 ? `+${entry.debit.toFixed(2)}` : '--'}
                                                                                </td>
                                                                                <td className="p-3 text-emerald-600 dark:text-emerald-400 font-black">
                                                                                    {entry.credit > 0 ? `-${entry.credit.toFixed(2)}` : '--'}
                                                                                </td>
                                                                                <td className="p-3 text-slate-900 dark:text-white font-black">
                                                                                    {entry.runningBalance.toFixed(2)} ر.س
                                                                                </td>
                                                                            </tr>
                                                                        ))
                                                                    )}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()
                            ) : (
                                // Render Distributors as a beautiful grid of Square Cards
                                <div className="space-y-4">
                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900">
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">حسابات الموزعين وتفاصيل الأرصدة</h3>
                                        <p className="text-[10px] font-bold text-slate-400 mt-1">اضغط على بطاقة الموزع لعرض كشف حسابه التفصيلي بالكامل داخل هذا القسم</p>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-5">
                                        {distributors.length === 0 ? (
                                            <div className="col-span-full bg-white dark:bg-slate-900 p-10 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs">
                                                لا يوجد موزعون مسجلون بعد. قم بإضافة موزع أولاً.
                                            </div>
                                        ) : (
                                            distributors.map((dist) => {
                                                const distSales = sales.filter(s => s.distributorId === dist.id);
                                                const totalSales = distSales.reduce((sum, s) => sum + (s.netTotal || 0), 0);
                                                const distVouchers = vouchers.filter(v => v.distributorId === dist.id);
                                                const totalPaid = distVouchers.filter(v => v.type === 'receipt').reduce((sum, v) => sum + v.amount, 0);
                                                const balance = dist.balance || 0;

                                                return (
                                                    <div
                                                        key={dist.id}
                                                        onClick={() => setSelectedDistributorForDetails(dist)}
                                                        className="group flex flex-col items-center justify-center text-center p-5 md:p-6 rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-slate-900 transition-all duration-300 shadow-sm hover:shadow-2xl hover:-translate-y-1 cursor-pointer aspect-square animate-in zoom-in-95 duration-200"
                                                    >
                                                        <div className="flex flex-col items-center w-full">
                                                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 transition-transform group-hover:scale-110 border border-blue-100 dark:border-blue-900/50">
                                                                <Users size={24} />
                                                            </div>
                                                            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight mb-2 truncate max-w-full">
                                                                {dist.name}
                                                            </h3>
                                                            <div className="flex flex-col gap-1 items-center w-full">
                                                                <span className={`text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-xl whitespace-nowrap ${
                                                                    balance > 0 
                                                                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' 
                                                                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                                }`}>
                                                                    الدين: {balance.toFixed(2)} ر.س
                                                                </span>
                                                                <span className="text-[9px] font-bold text-slate-400 truncate max-w-full">
                                                                    الواصل: {totalPaid.toFixed(1)} ر.س
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Sub-Section 2: View & Edit Distributors */}
                    {distributorSubSection === 'list' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {distributors.length === 0 ? (
                                    <div className="col-span-full bg-white dark:bg-slate-900 p-10 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs">
                                        لا يوجد موزعون مسجلون بعد.
                                    </div>
                                ) : (
                                    distributors.map((dist) => (
                                        <div
                                            key={dist.id}
                                            className="group relative flex flex-col items-center justify-between text-center p-4 rounded-2xl md:rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-slate-900 transition-all duration-300 shadow-sm hover:shadow-xl aspect-square"
                                        >
                                            <div className="w-full flex items-center justify-between">
                                                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                                                    %{dist.commission || 0} عمولة
                                                </span>
                                                <div className="flex items-center gap-0.5">
                                                    {canEdit && (
                                                        <button
                                                            onClick={() => {
                                                                setEditingDistributor(dist);
                                                                setDistNameInput(dist.name);
                                                                setDistPhoneInput(dist.phone || '');
                                                                setDistCommissionInput(dist.commission ? dist.commission.toString() : '');
                                                                setDistPreviousDebtInput(dist.previousDebt ? dist.previousDebt.toString() : '');
                                                                setDistDateInput(dist.date || new Date().toISOString().split('T')[0]);
                                                                setIsDistributorModalOpen(true);
                                                            }}
                                                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                                            title="تعديل الموزع"
                                                        >
                                                            <Edit size={14} />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            onClick={() => handleDeleteDistributor(dist.id, dist.name)}
                                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition"
                                                            title="حذف الموزع"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="my-auto flex flex-col items-center">
                                                <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform border border-blue-100 dark:border-blue-900/50">
                                                    <Users size={22} />
                                                </div>
                                                <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                                                    {dist.name}
                                                </h3>
                                                <div className="flex flex-col gap-0.5 mt-1.5">
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                                                        (dist.balance || 0) > 0 
                                                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' 
                                                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                    }`}>
                                                        الدين الحالي: {(dist.balance || 0).toFixed(2)} ريال
                                                    </span>
                                                    {dist.previousDebt !== undefined && dist.previousDebt > 0 && (
                                                        <span className="text-[9px] font-bold text-slate-400">
                                                            الدين السابق: {dist.previousDebt.toFixed(2)} ريال
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="w-full pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold text-slate-400">
                                                <span>{dist.phone || 'بدون رقم'}</span>
                                                <span>{dist.date}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Sub-Section 3: Add Distributor */}
                    {distributorSubSection === 'add' && (
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-xl mx-auto animate-in zoom-in-95 duration-200">
                            <h3 className="text-base font-black text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2 w-full text-center">
                                <Plus className="text-blue-600 dark:text-blue-400" size={20} />
                                <span>إضافة موزع جديد للمنظومة</span>
                            </h3>
                            <form onSubmit={async (e) => {
                                await handleSaveDistributor(e);
                                setDistributorSubSection('accounts'); // navigate to accounts on save
                            }} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">اسم الموزع</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="اسم الموزع الكامل"
                                        value={distNameInput}
                                        onChange={(e) => setDistNameInput(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">رقم الهاتف <span className="text-rose-500">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="05xxxxxxx"
                                            value={distPhoneInput}
                                            onChange={(e) => setDistPhoneInput(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">نسبة العمولة (%)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="5"
                                            value={distCommissionInput}
                                            onChange={(e) => setDistCommissionInput(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">تاريخ التسجيل</label>
                                        <input
                                            type="date"
                                            value={distDateInput}
                                            onChange={(e) => setDistDateInput(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">الدين السابق (ر.س)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={distPreviousDebtInput}
                                            onChange={(e) => setDistPreviousDebtInput(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-blue-600/20 active:scale-95 transition"
                                >
                                    حفظ بيانات الموزع الجديد
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* SECTION: البائعين (Sellers) */}
            {activeSection === 'sellers' && (() => {
                const retailSales = sales.filter(s => s.saleType === 'retail');
                const sellersMap = new Map<string, { userName: string; count: number; totalSales: number; commission: number }>();
                
                retailSales.forEach(sale => {
                    const name = sale.userName?.trim() || 'بائع مجهول';
                    const amount = sale.netTotal || sale.totalAmount || 0;
                    const current = sellersMap.get(name) || { userName: name, count: 0, totalSales: 0, commission: 0 };
                    current.count += sale.quantity || 0;
                    current.totalSales += amount;
                    current.commission = current.totalSales * 0.10;
                    sellersMap.set(name, current);
                });

                const sellersList = Array.from(sellersMap.values());
                const grandRetailSales = sellersList.reduce((sum, s) => sum + s.totalSales, 0);
                const grandCommission = sellersList.reduce((sum, s) => sum + s.commission, 0);

                return (
                    <div className="space-y-6 animate-in fade-in duration-200">
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3">
                            <h2 className="text-lg font-black text-slate-900 dark:text-white">سجل البائعين وعمولات التجزئة (10%)</h2>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black">
                                    <UserCheck size={20} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black text-slate-400">إجمالي البائعين</span>
                                    <div className="text-base font-black text-slate-900 dark:text-white">{sellersList.length} بائع</div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
                                    <DollarSign size={20} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black text-slate-400">إجمالي مبيعات التجزئة</span>
                                    <div className="text-base font-black text-emerald-600 dark:text-emerald-400">{grandRetailSales.toFixed(2)} ريال</div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black">
                                    <Sparkles size={20} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black text-slate-400">إجمالي عمولات البائعين (10%)</span>
                                    <div className="text-base font-black text-purple-600 dark:text-purple-400">{grandCommission.toFixed(2)} ريال</div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-right text-xs">
                                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                            <th className="p-4">اسم البائع</th>
                                            <th className="p-4 text-center">عدد الكروت المباعة (تجزئة)</th>
                                            <th className="p-4 text-left">إجمالي مبيعات التجزئة</th>
                                            <th className="p-4 text-left">نسبة العمولة (10%)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                                        {sellersList.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="p-8 text-center text-slate-400 font-bold">
                                                    لا توجد مبيعات تجزئة مسجلة للبائعين حتى الآن.
                                                </td>
                                            </tr>
                                        ) : (
                                            sellersList.map((seller) => (
                                                <tr key={seller.userName} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                    <td className="p-4 font-black flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black text-xs">
                                                            <UserCheck size={14} />
                                                        </div>
                                                        <span>{seller.userName}</span>
                                                    </td>
                                                    <td className="p-4 text-center font-black text-indigo-600 dark:text-indigo-400">{seller.count} كارت</td>
                                                    <td className="p-4 text-left font-black text-emerald-600 dark:text-emerald-400">{seller.totalSales.toFixed(2)} ريال</td>
                                                    <td className="p-4 text-left">
                                                        <span className="bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-3 py-1 rounded-xl font-black text-xs">
                                                            {seller.commission.toFixed(2)} ريال (10%)
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* SECTION 4: المبيعات الشهرية (Monthly Sales Report) */}
            {activeSection === 'monthly_sales' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">تقرير المبيعات الشهرية لكروت الشبكة</h2>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <Calendar size={16} className="text-slate-400" />
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">الشهر:</span>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="bg-transparent text-xs font-black text-slate-900 dark:text-white outline-none"
                                />
                            </div>
                            <button
                                onClick={handleExportMonthlyPDF}
                                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition"
                            >
                                <Printer size={16} />
                                <span>تصدير PDF</span>
                            </button>
                        </div>
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <span className="text-[10px] font-black text-slate-400">عدد الكروت النقدية</span>
                            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{totalMonthCashQty} كارت</div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <span className="text-[10px] font-black text-slate-400">عدد الكروت الآجلة</span>
                            <div className="text-lg font-black text-amber-600 dark:text-amber-400">{totalMonthCreditQty} كارت</div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <span className="text-[10px] font-black text-slate-400">مقبوضات نقدي</span>
                            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{totalMonthCashNet.toFixed(2)} ريال</div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <span className="text-[10px] font-black text-slate-400">ديون أجل مستحقة</span>
                            <div className="text-lg font-black text-amber-600 dark:text-amber-400">{totalMonthCreditNet.toFixed(2)} ريال</div>
                        </div>
                    </div>

                    {/* Report Table */}
                    <div className="bg-transparent md:bg-white md:dark:bg-slate-900 md:rounded-3xl md:border md:border-slate-200 md:dark:border-slate-800 md:overflow-hidden md:shadow-sm">
                        {/* Mobile View: Cards */}
                        <div className="block md:hidden space-y-4">
                            {monthlyCategoryReport.length === 0 ? (
                                <div className="bg-white dark:bg-slate-900 p-8 text-center text-slate-400 font-bold rounded-2xl border border-slate-200 dark:border-slate-800">
                                    لا توجد مبيعات مسجلة في هذا الشهر حتى الآن.
                                </div>
                            ) : (
                                monthlyCategoryReport.map((r) => (
                                    <div key={r.categoryName} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                            <span className="font-black text-slate-900 dark:text-white text-sm">{r.categoryName}</span>
                                            <span className="text-[10px] font-black bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-lg">
                                                إجمالي العدد: {r.totalQty} كارت
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                                            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                <span className="text-slate-400 font-bold">كروت نقدية</span>
                                                <span className="text-emerald-600 font-black">{r.cashQty}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                <span className="text-slate-400 font-bold">كروت آجلة</span>
                                                <span className="text-amber-600 font-black">{r.creditQty}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                <span className="text-slate-400 font-bold">مجموع النقدي</span>
                                                <span className="text-emerald-600 font-black">{r.cashNetTotal.toFixed(2)} ر.س</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                <span className="text-slate-400 font-bold">مجموع الآجل</span>
                                                <span className="text-amber-600 font-black">{r.creditNetTotal.toFixed(2)} ر.س</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <span className="text-xs font-bold text-slate-500">الصافي الإجمالي</span>
                                            <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{r.totalNet.toFixed(2)} ريال</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Desktop View: Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-right text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                        <th className="p-4">فئة الكروت</th>
                                        <th className="p-4 text-center">الكروت النقدية</th>
                                        <th className="p-4 text-center">الكروت الآجلة</th>
                                        <th className="p-4 text-center">إجمالي العدد</th>
                                        <th className="p-4 text-left">مجموع النقدية</th>
                                        <th className="p-4 text-left">مجموع الآجلة</th>
                                        <th className="p-4 text-left">الصافي الإجمالي</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                                    {monthlyCategoryReport.map((r) => (
                                        <tr key={r.categoryName} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                            <td className="p-4 font-black">{r.categoryName}</td>
                                            <td className="p-4 text-center text-emerald-600 font-black">{r.cashQty}</td>
                                            <td className="p-4 text-center text-amber-600 font-black">{r.creditQty}</td>
                                            <td className="p-4 text-center font-black">{r.totalQty}</td>
                                            <td className="p-4 text-left text-emerald-600 font-black">{r.cashNetTotal.toFixed(2)} ريال</td>
                                            <td className="p-4 text-left text-amber-600 font-black">{r.creditNetTotal.toFixed(2)} ريال</td>
                                            <td className="p-4 text-left text-indigo-600 font-black">{r.totalNet.toFixed(2)} ريال</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* SECTION 5: صندوق المبيعات (Sales Cashbox) */}
            {activeSection === 'sales_cashbox' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">صندوق مبيعات الكروت</h2>
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-2">
                                <Wallet className="text-emerald-600 dark:text-emerald-400" size={16} />
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">الرصيد:</span>
                                <span className="text-xs font-black text-emerald-700 dark:text-emerald-300">{cashboxBalance.toFixed(2)} ريال</span>
                            </div>
                            {canAdd && (
                                <button
                                    onClick={() => setIsCashboxModalOpen(true)}
                                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-amber-600/20 flex items-center gap-2 transition"
                                >
                                    <Plus size={16} />
                                    <span>إيداع / مسحوبات</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-right text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                        <th className="p-4">البيان</th>
                                        <th className="p-4">نوع الحركة</th>
                                        <th className="p-4 text-left">المبلغ</th>
                                        <th className="p-4">التاريخ والوقت</th>
                                        <th className="p-4">المستخدم</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                                    {cashboxEntries.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                                                لا توجد حركات في صندوق المبيعات حتى الآن.
                                            </td>
                                        </tr>
                                    ) : (
                                        cashboxEntries.map((entry) => (
                                            <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                <td className="p-4 font-black">{entry.title}</td>
                                                <td className="p-4">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                                                        entry.isIncome 
                                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                                                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                                    }`}>
                                                        {entry.isIncome ? 'إيداع / مقبوضات +' : 'مصروفات / مسحوبات -'}
                                                    </span>
                                                </td>
                                                <td className={`p-4 text-left font-black ${entry.isIncome ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {entry.isIncome ? '+' : '-'}{entry.amount.toFixed(2)} ريال
                                                </td>
                                                <td className="p-4 text-slate-500">{entry.dateTime}</td>
                                                <td className="p-4 text-slate-500">{entry.userName}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* SECTION 6: سندات القبض والصرف للموزعين (Vouchers) */}
            {activeSection === 'vouchers' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3">
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">سندات القبض والصرف</h2>
                        <div className="flex items-center gap-2">
                            {canAdd && (
                                <button
                                    onClick={() => setIsVoucherModalOpen(true)}
                                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg shadow-rose-600/20 flex items-center gap-2 transition"
                                >
                                    <Plus size={18} />
                                    <span>إنشاء سند جديد</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-transparent md:bg-white md:dark:bg-slate-900 md:rounded-3xl md:border md:border-slate-200 md:dark:border-slate-800 md:overflow-hidden md:shadow-sm">
                        {/* Mobile View: Cards */}
                        <div className="block md:hidden space-y-4">
                            {vouchers.length === 0 ? (
                                <div className="bg-white dark:bg-slate-900 p-8 text-center text-slate-400 font-bold rounded-2xl border border-slate-200 dark:border-slate-800">
                                    لا توجد سندات قبض أو صرف مسجلة للموزعين حتى الآن.
                                </div>
                            ) : (
                                vouchers.map((v) => (
                                    <div key={v.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-slate-900 dark:text-white text-sm">#{v.voucherNumber}</span>
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                                                    v.type === 'receipt' 
                                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                                                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                                }`}>
                                                    {v.type === 'receipt' ? 'سند قبض' : 'سند صرف'}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    printReport(`سند ${v.type === 'receipt' ? 'قبض' : 'صرف'} - ${v.voucherNumber}`, [
                                                        'البيان', 'التفاصيل'
                                                    ], [
                                                        ['رقم السند', v.voucherNumber],
                                                        ['نوع السند', v.type === 'receipt' ? 'قبض من موزع' : 'صرف لموزع'],
                                                        ['الموزع المستهدف', v.distributorName],
                                                        ['المبلغ', `${v.amount} ريال`],
                                                        ['البيان / ملاحظات', v.notes || '-'],
                                                        ['التاريخ والوقت', v.dateTime],
                                                        ['المستخدم', v.userName]
                                                    ]);
                                                }}
                                                className="p-2 text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-xl transition flex items-center gap-1 text-[11px] font-black"
                                                title="طباعة السند"
                                            >
                                                <Printer size={14} />
                                                <span>طباعة</span>
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                                            <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                <span className="text-slate-400 font-bold block">اسم الموزع</span>
                                                <span className="text-slate-800 dark:text-slate-200 font-black">{v.distributorName}</span>
                                            </div>
                                            <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                <span className="text-slate-400 font-bold block">المبلغ</span>
                                                <span className={`font-black ${v.type === 'receipt' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {v.amount.toFixed(2)} ريال
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl col-span-2">
                                                <span className="text-slate-400 font-bold block">البيان / الملاحظات</span>
                                                <span className="text-slate-600 dark:text-slate-300 font-bold">{v.notes || '-'}</span>
                                            </div>
                                            <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                <span className="text-slate-400 font-bold block">التاريخ والوقت</span>
                                                <span className="text-slate-500 font-medium">{v.dateTime}</span>
                                            </div>
                                            <div className="bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                <span className="text-slate-400 font-bold block">المستخدم</span>
                                                <span className="text-slate-500 font-medium">{v.userName}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Desktop View: Table */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-right text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                        <th className="p-4">رقم السند</th>
                                        <th className="p-4">نوع السند</th>
                                        <th className="p-4">اسم الموزع</th>
                                        <th className="p-4 text-left">المبلغ</th>
                                        <th className="p-4">ملاحظات / البيان</th>
                                        <th className="p-4">التاريخ والوقت</th>
                                        <th className="p-4">المستخدم</th>
                                        <th className="p-4 text-center">طباعة</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                                    {vouchers.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                                                لا توجد سندات قبض أو صرف مسجلة للموزعين حتى الآن.
                                            </td>
                                        </tr>
                                    ) : (
                                        vouchers.map((v) => (
                                            <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                <td className="p-4 font-black">{v.voucherNumber}</td>
                                                <td className="p-4">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                                                        v.type === 'receipt' 
                                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                                                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                                    }`}>
                                                        {v.type === 'receipt' ? 'سند قبض' : 'سند صرف'}
                                                    </span>
                                                </td>
                                                <td className="p-4 font-black">{v.distributorName}</td>
                                                <td className={`p-4 text-left font-black ${v.type === 'receipt' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {v.amount.toFixed(2)} ريال
                                                </td>
                                                <td className="p-4 text-slate-500">{v.notes || '-'}</td>
                                                <td className="p-4 text-slate-500">{v.dateTime}</td>
                                                <td className="p-4 text-slate-500">{v.userName}</td>
                                                <td className="p-4 text-center">
                                                    <button
                                                        onClick={() => {
                                                            printReport(`سند ${v.type === 'receipt' ? 'قبض' : 'صرف'} - ${v.voucherNumber}`, [
                                                                'البيان', 'التفاصيل'
                                                            ], [
                                                                ['رقم السند', v.voucherNumber],
                                                                ['نوع السند', v.type === 'receipt' ? 'قبض من موزع' : 'صرف لموزع'],
                                                                ['الموزع المستهدف', v.distributorName],
                                                                ['المبلغ', `${v.amount} ريال`],
                                                                ['البيان / ملاحظات', v.notes || '-'],
                                                                ['التاريخ والوقت', v.dateTime],
                                                                ['المستخدم', v.userName]
                                                            ]);
                                                        }}
                                                        className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                                        title="طباعة السند"
                                                    >
                                                        <Printer size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Category Create / Edit */}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="relative flex items-center justify-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-black text-slate-900 dark:text-white text-base text-center">
                                {editingCategory ? 'تعديل فئة كارت' : 'إضافة فئة كروت جديدة'}
                            </h3>
                            <button onClick={() => setIsCategoryModalOpen(false)} className="absolute left-0 text-slate-400 hover:text-slate-600 transition">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveCategory} className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">اسم الفئة</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="مثال: فئة 100 ريال"
                                    value={catNameInput}
                                    onChange={(e) => setCatNameInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">سعر الجملة (ريال)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0"
                                        value={catWholesaleInput}
                                        onChange={(e) => setCatWholesaleInput(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">سعر التجزئة (ريال)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0"
                                        value={catRetailInput}
                                        onChange={(e) => setCatRetailInput(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">
                                    ربط بقسم كروت الشبكة (لإظهار رصيد المخزون)
                                </label>
                                <select
                                    value={catLinkedSectionInput}
                                    onChange={(e) => setCatLinkedSectionInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                >
                                    <option value="">-- ربط تلقائي بنفس الاسم (إن وُجد) --</option>
                                    <option value="فئة 100 ريال">فئة 100 ريال</option>
                                    <option value="فئة 200 ريال">فئة 200 ريال</option>
                                    <option value="فئة 250 ريال">فئة 250 ريال</option>
                                    <option value="فئة 500 ريال">فئة 500 ريال</option>
                                    <option value="فئة 1000 ريال">فئة 1000 ريال</option>
                                    <option value="فئة 1500 ريال">فئة 1500 ريال</option>
                                    <option value="فئة 3000 ريال">فئة 3000 ريال</option>
                                    <option value="فئة 5000 ريال">فئة 5000 ريال</option>
                                </select>
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-purple-600/20"
                            >
                                حفظ الفئة
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Distributor Create / Edit */}
            {isDistributorModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="relative flex items-center justify-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-black text-slate-900 dark:text-white text-base text-center">
                                {editingDistributor ? 'تعديل بيانات موزع' : 'إضافة موزع جديد'}
                            </h3>
                            <button onClick={() => setIsDistributorModalOpen(false)} className="absolute left-0 text-slate-400 hover:text-slate-600 transition">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveDistributor} className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">اسم الموزع</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="اسم الموزع"
                                    value={distNameInput}
                                    onChange={(e) => setDistNameInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">رقم الهاتف <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="05xxxxxxx"
                                        value={distPhoneInput}
                                        onChange={(e) => setDistPhoneInput(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">نسبة العمولة (%)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        placeholder="5"
                                        value={distCommissionInput}
                                        onChange={(e) => setDistCommissionInput(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">تاريخ التسجيل</label>
                                    <input
                                        type="date"
                                        value={distDateInput}
                                        onChange={(e) => setDistDateInput(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">الدين السابق (ر.س)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={distPreviousDebtInput}
                                        onChange={(e) => setDistPreviousDebtInput(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-blue-600/20"
                            >
                                حفظ بيانات الموزع
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Add Stock (إضافة رصيد كروت) */}
            {isStockModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="relative flex items-center justify-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-black text-slate-900 dark:text-white text-base text-center">إضافة رصيد كروت جديد</h3>
                            <button onClick={() => setIsStockModalOpen(false)} className="absolute left-0 text-slate-400 hover:text-slate-600 transition">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveAddStock} className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">اختيار فئة الكارت</label>
                                <select
                                    required
                                    value={stockCategoryId}
                                    onChange={(e) => setStockCategoryId(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                >
                                    <option value="">-- حدد الفئة --</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name} (الرصيد الحالي: {cat.availableCount || 0} كارت)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">الكمية المضافة (عدد الكروت)</label>
                                <input
                                    type="number"
                                    min="1"
                                    required
                                    placeholder="مثال: 50"
                                    value={stockQtyInput}
                                    onChange={(e) => setStockQtyInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-indigo-600/20"
                            >
                                حفظ وإضافة إلى الرصيد
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Distributor Voucher (سند قبض أو صرف) */}
            {isVoucherModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="relative flex items-center justify-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-black text-slate-900 dark:text-white text-base text-center">إنشاء سند للموزع</h3>
                            <button onClick={() => setIsVoucherModalOpen(false)} className="absolute left-0 text-slate-400 hover:text-slate-600 transition">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveVoucher} className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">نوع السند</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setVoucherType('receipt')}
                                        className={`py-2.5 px-3 rounded-xl text-xs font-black transition border ${
                                            voucherType === 'receipt'
                                                ? 'bg-emerald-600 text-white border-emerald-600'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        سند قبض (تسديد من الموزع)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setVoucherType('payment')}
                                        className={`py-2.5 px-3 rounded-xl text-xs font-black transition border ${
                                            voucherType === 'payment'
                                                ? 'bg-rose-600 text-white border-rose-600'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        سند صرف (دفعة للموزع)
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">الموزع المستهدف</label>
                                <select
                                    required
                                    value={voucherDistributorId}
                                    onChange={(e) => setVoucherDistributorId(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                >
                                    <option value="">-- اختر الموزع --</option>
                                    {distributors.map(dist => (
                                        <option key={dist.id} value={dist.id}>
                                            {dist.name} (رصيد الدين: {dist.balance || 0} ريال)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">المبلغ (ريال)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.1"
                                    required
                                    placeholder="أدخل المبلغ"
                                    value={voucherAmountInput}
                                    onChange={(e) => setVoucherAmountInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">البيان / ملاحظات السند</label>
                                <input
                                    type="text"
                                    placeholder="ملاحظات توضيحية..."
                                    value={voucherNotesInput}
                                    onChange={(e) => setVoucherNotesInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white text-center"
                                />
                            </div>
                            <button
                                type="submit"
                                className={`w-full py-3 font-black text-xs rounded-2xl text-white shadow-lg ${
                                    voucherType === 'receipt' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                                }`}
                            >
                                حفظ وطباعة السند
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Cashbox Manual Transaction */}
            {isCashboxModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-black text-slate-900 dark:text-white text-base">تسجيل حركة صندوق الكروت</h3>
                            <button onClick={() => setIsCashboxModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveCashboxEntry} className="space-y-4">
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">نوع الحركة</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setCashboxIsIncome(true)}
                                        className={`py-2.5 px-3 rounded-xl text-xs font-black transition border ${
                                            cashboxIsIncome
                                                ? 'bg-emerald-600 text-white border-emerald-600'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        إيداع / مقبوضات +
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCashboxIsIncome(false)}
                                        className={`py-2.5 px-3 rounded-xl text-xs font-black transition border ${
                                            !cashboxIsIncome
                                                ? 'bg-rose-600 text-white border-rose-600'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        سحب / مصاريف -
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">بيان الحركة</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="مثال: توريد نقدي يدوي / سحب للصندوق الرئيسي..."
                                    value={cashboxTitleInput}
                                    onChange={(e) => setCashboxTitleInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1">المبلغ (ريال)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.1"
                                    required
                                    placeholder="أدخل المبلغ"
                                    value={cashboxAmountInput}
                                    onChange={(e) => setCashboxAmountInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-amber-600/20"
                            >
                                حفظ الحركة
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* SALE MODAL */}
            {saleModalCategory && (
                <CardSaleModal
                    isOpen={!!saleModalCategory}
                    onClose={() => setSaleModalCategory(null)}
                    categoryName={saleModalCategory}
                />
            )}

            {/* MODAL: Share Distributor Account */}
            {isShareModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-right animate-in fade-in zoom-in-95 duration-150" dir="rtl">
                        <div className="relative flex items-center justify-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-black text-slate-900 dark:text-white text-base text-center">مشاركة كشف الحساب</h3>
                            <button onClick={() => setIsShareModalOpen(false)} className="absolute left-0 text-slate-400 hover:text-slate-600 transition">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="space-y-3">
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-900">
                                <span className="text-[10px] font-black text-slate-400 block mb-1">الموزع المستهدف</span>
                                <span className="text-sm font-black text-slate-800 dark:text-white">{shareDistName}</span>
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 block mt-1">رقم الهاتف: +{sharePhone}</span>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-850 p-3 rounded-2xl border border-slate-100 dark:border-slate-900">
                                <span className="text-[10px] font-black text-slate-400 block mb-1.5">معاينة نص الرسالة</span>
                                <pre className="text-[11px] font-bold text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto font-sans text-right" dir="rtl">
                                    {shareText}
                                </pre>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <a
                                href={`https://wa.me/${sharePhone}?text=${encodeURIComponent(shareText)}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => setIsShareModalOpen(false)}
                                className="flex flex-col items-center justify-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 transition active:scale-95 text-center"
                            >
                                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                                    <MessageSquare size={20} />
                                </div>
                                <span className="text-xs font-black">واتساب (WhatsApp)</span>
                            </a>

                            <a
                                href={`sms:+${sharePhone}?body=${encodeURIComponent(shareSmsText)}`}
                                onClick={() => setIsShareModalOpen(false)}
                                className="flex flex-col items-center justify-center gap-2 p-4 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-2xl border border-blue-200 dark:border-blue-900/60 transition active:scale-95 text-center"
                            >
                                <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                                    <Send size={20} />
                                </div>
                                <span className="text-xs font-black">رسالة نصية (SMS)</span>
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Old floating modal code removed - details view is now rendered inline */}
        </div>
    );
}
