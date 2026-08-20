import React, { useState, useMemo } from 'react';
import { 
    Scale, Calendar, Printer, Search, CheckCircle2, AlertTriangle, 
    Layers, Wallet, CreditCard, TrendingUp, Eye, ChevronDown, 
    ChevronUp, Filter, Sparkles, FileText, X, RefreshCw, Wrench, HelpCircle,
    Share2, FileDown, Download
} from 'lucide-react';
import { CardCategory, CardSale, CardPurchase, CardStockLog, CardDistributor } from '../types/cardTypes';
import { printReport } from '../lib/printHelper';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { useAuthStore } from '../store/authStore';

interface CardReconciliationSectionProps {
    categories: CardCategory[];
    sales: CardSale[];
    purchases: CardPurchase[];
    stockLogs: CardStockLog[];
    distributors: CardDistributor[];
    selectedMonth: string;
    onMonthChange: (month: string) => void;
    onOpenSalesSection?: () => void;
    onOpenPurchasesSection?: () => void;
}

export function CardReconciliationSection({
    categories,
    sales,
    purchases,
    stockLogs,
    distributors,
    selectedMonth,
    onMonthChange,
    onOpenSalesSection,
    onOpenPurchasesSection
}: CardReconciliationSectionProps) {
    const [viewMode, setViewMode] = useState<'all' | 'invoices' | 'categories'>('all');
    const [invoiceSearch, setInvoiceSearch] = useState('');
    const [invoicePaymentFilter, setInvoicePaymentFilter] = useState<'all' | 'cash' | 'credit'>('all');
    const [invoiceCategoryFilter, setInvoiceCategoryFilter] = useState<string>('all');
    const [invoicePage, setInvoicePage] = useState(1);
    const invoicesPerPage = 12;

    const [auditScope, setAuditScope] = useState<'month' | 'all'>('month');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'diff' | 'matched'>('all');
    const [isInvoicesTableOpen, setIsInvoicesTableOpen] = useState(true);
    const [isCategoriesTableOpen, setIsCategoriesTableOpen] = useState(true);
    const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({});
    const [selectedCategoryForModal, setSelectedCategoryForModal] = useState<CardCategory | null>(null);
    const [modalTab, setModalTab] = useState<'sales' | 'inflow'>('sales');
    const [currentPage, setCurrentPage] = useState(1);
    const [reconcilingCatId, setReconcilingCatId] = useState<string | null>(null);
    const [reconcileModalCat, setReconcileModalCat] = useState<CardCategory | null>(null);
    const [reconcileActualInput, setReconcileActualInput] = useState<string>('');
    const [reconcileNotesInput, setReconcileNotesInput] = useState<string>('');
    const { appUser } = useAuthStore();
    const tenantId = appUser?.tenantId || 'default';
    const itemsPerPage = 10;

    const handleOpenReconcileModal = (catItem: any) => {
        setReconcileModalCat(catItem.category);
        setReconcileActualInput(String(catItem.currentStock));
        const diff = catItem.stockDifference;
        setReconcileNotesInput(diff !== 0 
            ? `تسوية جردية لتعديل فارق (${diff > 0 ? '+' + diff : diff}) كارت بناءً على الجرد العملي بالمخزن`
            : 'مطابقة وتأكيد صحة رصيد الجرد الفعلي للمخزن'
        );
    };

    const handleSaveReconciliation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reconcileModalCat) return;
        const newTargetStock = parseFloat(reconcileActualInput);
        if (isNaN(newTargetStock) || newTargetStock < 0) {
            alert('يرجى إدخال عدد كروت صحيح للجرد الفعلي');
            return;
        }

        const currentStock = Number(reconcileModalCat.availableCount) || 0;
        const diff = newTargetStock - currentStock;

        setReconcilingCatId(reconcileModalCat.id);
        try {
            await updateDoc(doc(db, 'card_categories', reconcileModalCat.id), {
                availableCount: newTargetStock,
                updatedAt: Date.now()
            });

            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            await addDoc(collection(db, 'card_stock_logs'), {
                tenantId,
                categoryId: reconcileModalCat.id,
                categoryName: reconcileModalCat.name,
                quantityAdded: diff,
                userName: appUser?.name || appUser?.email || 'المدير',
                additionDate: `${dateStr} ${timeStr}`,
                availableCountAfter: newTargetStock,
                notes: reconcileNotesInput.trim() || `تسوية ومطابقة جرد المخزون`,
                createdAt: Date.now()
            });

            alert(`تم تصحيح ومطابقة رصيد الفئة "${reconcileModalCat.name}" بنجاح ليصبح (${newTargetStock}) كارت.`);
            setReconcileModalCat(null);
        } catch (err: any) {
            handleFirestoreError(err, OperationType.WRITE, 'card_categories');
        } finally {
            setReconcilingCatId(null);
        }
    };

    const handleQuickSyncStock = async (cat: CardCategory, targetStock: number) => {
        if (!cat || !cat.id) return;
        const currentStock = Number(cat.availableCount) || 0;
        const diff = targetStock - currentStock;
        
        const confirmMsg = `هل أنت متأكد من مطابقة وضبط رصيد فئة "${cat.name}" بالمخزن من (${currentStock}) إلى (${targetStock}) كارت ليطابق إجمالي الفواتير المسجلة تماماً؟`;
        if (!window.confirm(confirmMsg)) return;

        setReconcilingCatId(cat.id);
        try {
            await updateDoc(doc(db, 'card_categories', cat.id), {
                availableCount: targetStock,
                updatedAt: Date.now()
            });

            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            await addDoc(collection(db, 'card_stock_logs'), {
                tenantId,
                categoryId: cat.id,
                categoryName: cat.name,
                quantityAdded: diff,
                userName: appUser?.name || appUser?.email || 'المدير',
                additionDate: `${dateStr} ${timeStr}`,
                availableCountAfter: targetStock,
                notes: `تسوية جردية لمطابقة رصيد المخزن مع صافي فواتير الشراء والبيع`,
                createdAt: Date.now()
            });

            alert(`تم ضبط رصيد الفئة "${cat.name}" بنجاح ليصبح ${targetStock} كارت مطابقاً للفواتير.`);
        } catch (err: any) {
            handleFirestoreError(err, OperationType.WRITE, 'card_categories');
        } finally {
            setReconcilingCatId(null);
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedCategories(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const isCancelledStatus = (status?: string) => {
        if (!status) return false;
        const st = status.trim().toLowerCase();
        return st === 'cancelled' || st === 'canceled' || st === 'returned';
    };

    // 1. Prepare Active Valid Invoices & Sales
    const activeCashInvoiceNumbers = useMemo(() => {
        return new Set(
            sales
                .filter(s => (s.status === 'completed' || !s.status) && !isCancelledStatus(s.status) && s.paymentType === 'cash' && s.invoiceNumber)
                .map(s => s.invoiceNumber)
        );
    }, [sales]);

    // Active sales depending on scope
    const filteredSales = useMemo(() => {
        return sales.filter(s => {
            if (isCancelledStatus(s.status)) return false;
            if (s.paymentType === 'credit' && s.invoiceNumber && activeCashInvoiceNumbers.has(s.invoiceNumber)) {
                return false;
            }
            if (auditScope === 'month') {
                const matchMonth = s.month === selectedMonth || 
                    (s.date && s.date.startsWith(selectedMonth)) || 
                    (s.dateTime && s.dateTime.startsWith(selectedMonth));
                if (!matchMonth) return false;
            }
            return s.status === 'completed' || !s.status;
        });
    }, [sales, auditScope, selectedMonth, activeCashInvoiceNumbers]);

    // Active purchases depending on scope
    const filteredPurchases = useMemo(() => {
        return purchases.filter(p => {
            if (isCancelledStatus(p.status)) return false;
            if (auditScope === 'month') {
                const matchMonth = p.month === selectedMonth || 
                    (p.date && p.date.startsWith(selectedMonth)) || 
                    (p.dateTime && p.dateTime.startsWith(selectedMonth));
                if (!matchMonth) return false;
            }
            return p.status === 'completed' || !p.status;
        });
    }, [purchases, auditScope, selectedMonth]);

    // Active stock logs depending on scope
    const filteredStockLogs = useMemo(() => {
        return stockLogs.filter(log => {
            if (auditScope === 'month') {
                const logMonth = log.additionDate ? log.additionDate.slice(0, 7) : '';
                return logMonth === selectedMonth;
            }
            return true;
        });
    }, [stockLogs, auditScope, selectedMonth]);

    const isCategoryMatch = (name1?: string, id1?: string, name2?: string, id2?: string, linked?: string) => {
        if (!name1 && !id1 && !name2 && !id2) return false;
        if (id1 && id2 && id1 === id2) return true;
        
        const clean = (str?: string) => (str || '').trim().toLowerCase();
        const c1 = clean(name1);
        const c2 = clean(name2);
        const cl = clean(linked);

        if (c1 && c2 && c1 === c2) return true;
        if (c1 && cl && c1 === cl) return true;
        if (c2 && cl && c2 === cl) return true;

        return false;
    };

    // 2. Compute Category Audit & Reconciliation Data
    const reconciliationData = useMemo(() => {
        return categories.map(cat => {
            // A. All-Time Calculations (The Absolute Truth for Audit)
            
            // 1. All-Time Inflow (Purchases Only - strictly from invoices)
            const allPurchasesForCat = purchases.filter(p => {
                if (isCancelledStatus(p.status)) return false;
                return isCategoryMatch(p.categoryName, p.categoryId, cat.name, cat.id, cat.linkedSection);
            });
            const allTimePurchasesQty = allPurchasesForCat.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
            const totalInflowQty = allTimePurchasesQty;

            // 2. All-Time Sales (Cash vs Credit)
            const allSalesForCat = sales.filter(s => {
                if (isCancelledStatus(s.status)) return false;
                return isCategoryMatch(s.categoryName, s.categoryId, cat.name, cat.id, cat.linkedSection);
            });

            const allTimeCashSales = allSalesForCat.filter(s => s.paymentType === 'cash');
            const allTimeCreditSales = allSalesForCat.filter(s => s.paymentType === 'credit');

            const allTimeCashQty = allTimeCashSales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
            const allTimeCreditQty = allTimeCreditSales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
            const totalSalesQty = allTimeCashQty + allTimeCreditQty;

            const allTimeCashAmount = allTimeCashSales.reduce((sum, s) => sum + (Number(s.netTotal) || 0), 0);
            const allTimeCreditAmount = allTimeCreditSales.reduce((sum, s) => sum + (Number(s.netTotal) || 0), 0);

            // 3. Stock Logs Analysis for this category
            const catStockLogs = stockLogs.filter(log => isCategoryMatch(log.categoryName, log.categoryId, cat.name, cat.id, cat.linkedSection));
            
            // Deductions logged in stock logs (negative numbers)
            const stockDeductionsQty = catStockLogs
                .filter(l => (Number(l.quantityAdded) || 0) < 0)
                .reduce((sum, l) => sum + Math.abs(Number(l.quantityAdded) || 0), 0);

            // Manual additions / Opening Stock (positive numbers not from purchases)
            const manualAdditionsQty = catStockLogs
                .filter(l => {
                    const notes = l.notes || '';
                    const isInvoice = notes.includes('فاتورة') || notes.includes('شراء') || notes.includes('مبيعات');
                    return !isInvoice && (Number(l.quantityAdded) || 0) > 0;
                })
                .reduce((sum, l) => sum + (Number(l.quantityAdded) || 0), 0);

            // Total stock additions logged
            const totalStockAdditionsLogged = catStockLogs
                .filter(l => (Number(l.quantityAdded) || 0) > 0)
                .reduce((sum, l) => sum + (Number(l.quantityAdded) || 0), 0);

            // 4. Verification: Did Invoices Deduct Equal to Sales Qty?
            // If totalSalesQty === stockDeductionsQty, deduction is 100% accurate!
            const salesVsDeductionDiff = totalSalesQty - stockDeductionsQty;
            const isDeductionMatched = Math.abs(salesVsDeductionDiff) === 0;

            // 5. Expected vs Actual
            const expectedStock = totalInflowQty - totalSalesQty;
            const currentActualStock = Number(cat.availableCount) || 0;
            const stockDifference = currentActualStock - expectedStock;
            const hasDiscrepancy = Math.abs(stockDifference) > 0;

            let discrepancyExplanation = '';
            if (hasDiscrepancy) {
                if (stockDifference > 0) {
                    if (manualAdditionsQty === stockDifference) {
                        discrepancyExplanation = `الفارق (+${stockDifference} كارت) ناتج بالكامل عن إضافة كروت يدوياً / رصيد افتتاحي بدون فاتورة شراء.`;
                    } else if (manualAdditionsQty > 0) {
                        discrepancyExplanation = `يوجد (+${manualAdditionsQty}) كارت مضافة يدوياً بدون فاتورة شراء، وباقي الفارق ناتج عن فوارق فواتير أو تسويات سابقة.`;
                    } else {
                        discrepancyExplanation = `يوجد فائض (+${stockDifference} كارت) بالمخزن الفعلي مقارنة بإجمالي فواتير الشراء والبيع المسجلة.`;
                    }
                } else {
                    discrepancyExplanation = `يوجد عجز (-${Math.abs(stockDifference)} كارت) في المخزن الفعلي مقارنة بصافي الفواتير.`;
                }
            } else {
                discrepancyExplanation = 'الرصيد الفعلي بالمخزن مطابق تماماً لإجمالي فواتير الشراء مطروحاً منها المبيعات ✓';
            }

            // B. Period-Specific Filtering (If user wants to see what happened in a specific month)
            const catSalesPeriod = filteredSales.filter(s => isCategoryMatch(s.categoryName, s.categoryId, cat.name, cat.id, cat.linkedSection));
            const catPurchasesPeriod = filteredPurchases.filter(p => isCategoryMatch(p.categoryName, p.categoryId, cat.name, cat.id, cat.linkedSection));

            const periodCashSales = catSalesPeriod.filter(s => s.paymentType === 'cash');
            const periodCreditSales = catSalesPeriod.filter(s => s.paymentType === 'credit');
            
            const cashSalesQty = periodCashSales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
            const creditSalesQty = periodCreditSales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
            const cashSalesAmount = periodCashSales.reduce((sum, s) => sum + (Number(s.netTotal) || 0), 0);
            const creditSalesAmount = periodCreditSales.reduce((sum, s) => sum + (Number(s.netTotal) || 0), 0);

            return {
                category: cat,
                // All-Time
                allPurchasesForCat,
                allSalesForCat,
                catStockLogs,
                allTimePurchasesQty,
                allTimeInflow: totalInflowQty,
                allTimeCashQty,
                allTimeCreditQty,
                allTimeSalesQty: totalSalesQty,
                allTimeCashAmount,
                allTimeCreditAmount,
                stockDeductionsQty,
                salesVsDeductionDiff,
                isDeductionMatched,
                manualAdditionsQty,
                totalStockAdditionsLogged,
                expectedStock,
                currentStock: currentActualStock,
                stockDifference,
                hasDiscrepancy,
                discrepancyExplanation,
                
                // Period Specific (Filtered)
                catSalesPeriod,
                catPurchasesPeriod,
                cashSalesQty,
                creditSalesQty,
                cashSalesAmount,
                creditSalesAmount,
                totalSalesAmount: cashSalesAmount + creditSalesAmount,
                totalPurchasesQty: catPurchasesPeriod.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0),
                totalPurchasesAmount: catPurchasesPeriod.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0),
                stockWholesaleValue: currentActualStock * (Number(cat.wholesalePrice) || 0),
                stockRetailValue: currentActualStock * (Number(cat.retailPrice) || 0)
            };
        });
    }, [categories, sales, purchases, stockLogs, filteredSales, filteredPurchases, filteredStockLogs]);

    // 3. Filtered list for UI Display
    const displayedReconciliation = useMemo(() => {
        return reconciliationData.filter(item => {
            if (searchTerm.trim()) {
                const match = item.category.name.toLowerCase().includes(searchTerm.trim().toLowerCase());
                if (!match) return false;
            }
            if (statusFilter === 'diff') {
                return item.hasDiscrepancy;
            }
            if (statusFilter === 'matched') {
                return !item.hasDiscrepancy;
            }
            return true;
        });
    }, [reconciliationData, searchTerm, statusFilter]);

    // 4. Overall Global Aggregates
    const overallStats = useMemo(() => {
        const totalCurrentStock = reconciliationData.reduce((sum, r) => sum + r.currentStock, 0);
        const totalCashSalesQty = reconciliationData.reduce((sum, r) => sum + r.allTimeCashQty, 0);
        const totalCreditSalesQty = reconciliationData.reduce((sum, r) => sum + r.allTimeCreditQty, 0);
        const totalSalesQty = totalCashSalesQty + totalCreditSalesQty;

        const totalCashSalesAmount = reconciliationData.reduce((sum, r) => sum + r.allTimeCashAmount, 0);
        const totalCreditSalesAmount = reconciliationData.reduce((sum, r) => sum + r.allTimeCreditAmount, 0);

        const totalPurchasedQty = reconciliationData.reduce((sum, r) => sum + r.allTimePurchasesQty, 0);
        const totalInflowQty = totalPurchasedQty;
        const totalPurchasesAmount = reconciliationData.reduce((sum, r) => sum + r.totalPurchasesAmount, 0);
        const totalStockRetailVal = reconciliationData.reduce((sum, r) => sum + (r.currentStock * (r.category.retailPrice || 0)), 0);
        const categoriesWithDiff = reconciliationData.filter(r => r.hasDiscrepancy).length;

        // Total distributors debt balance
        const totalDistributorsBalance = distributors.reduce((sum, d) => sum + (d.balance || 0), 0);

        return {
            totalCurrentStock,
            totalCashSalesQty,
            totalCreditSalesQty,
            totalSalesQty,
            totalCashSalesAmount,
            totalCreditSalesAmount,
            totalPurchasedQty,
            totalInflowQty,
            totalPurchasesQty: totalInflowQty, // alias for backwards compat
            totalPurchasesAmount,
            totalStockRetailVal,
            categoriesWithDiff,
            totalDistributorsBalance
        };
    }, [reconciliationData, distributors]);

    // 1.5 Prepare Invoices Audit List
    const invoicesAuditList = useMemo(() => {
        return filteredSales.map((sale, idx) => {
            const invNo = sale.invoiceNumber || (sale.id ? sale.id.slice(-6).toUpperCase() : `INV-${idx + 1}`);
            const qty = Number(sale.quantity) || 0;
            const cat = categories.find(c => c.id === sale.categoryId || c.name.trim() === (sale.categoryName || '').trim());
            const currentStock = cat ? Number(cat.availableCount) || 0 : 0;
            return {
                id: sale.id || `${invNo}-${idx}`,
                invoiceNumber: invNo,
                dateTime: sale.dateTime || sale.date || '---',
                date: sale.date || (sale.dateTime ? sale.dateTime.split(' ')[0] : '---'),
                categoryName: sale.categoryName || (cat?.name) || 'فئة غير محددة',
                categoryId: sale.categoryId || cat?.id,
                unitPrice: sale.unitPrice || cat?.retailPrice || 0,
                quantitySold: qty,
                stockDeducted: qty,
                isDeducted: true,
                paymentType: sale.paymentType === 'credit' ? 'credit' : 'cash',
                distributorName: sale.distributorName || (sale.paymentType === 'cash' ? 'مشتري عام (نقدي)' : 'موزع عام'),
                netTotal: Number(sale.netTotal) || (qty * (sale.unitPrice || (cat?.retailPrice || 0))),
                remainingStock: currentStock,
                userName: sale.userName || 'النظام'
            };
        });
    }, [filteredSales, categories]);

    const displayedInvoices = useMemo(() => {
        return invoicesAuditList.filter(inv => {
            if (invoiceSearch.trim()) {
                const q = invoiceSearch.trim().toLowerCase();
                const matchInv = inv.invoiceNumber.toLowerCase().includes(q);
                const matchCat = inv.categoryName.toLowerCase().includes(q);
                const matchDist = inv.distributorName.toLowerCase().includes(q);
                if (!matchInv && !matchCat && !matchDist) return false;
            }
            if (invoicePaymentFilter !== 'all' && inv.paymentType !== invoicePaymentFilter) {
                return false;
            }
            if (invoiceCategoryFilter !== 'all' && inv.categoryName !== invoiceCategoryFilter) {
                return false;
            }
            return true;
        });
    }, [invoicesAuditList, invoiceSearch, invoicePaymentFilter, invoiceCategoryFilter]);

    const totalInvoicePages = Math.ceil(displayedInvoices.length / invoicesPerPage) || 1;
    const paginatedInvoices = useMemo(() => {
        const start = (invoicePage - 1) * invoicesPerPage;
        return displayedInvoices.slice(start, start + invoicesPerPage);
    }, [displayedInvoices, invoicePage, invoicesPerPage]);

    // Pagination calculations for categories
    const totalPages = Math.ceil(displayedReconciliation.length / itemsPerPage) || 1;
    const paginatedReconciliation = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return displayedReconciliation.slice(start, start + itemsPerPage);
    }, [displayedReconciliation, currentPage, itemsPerPage]);

    // 5. PDF & Print Export
    const handleExportInvoicesTablePDF = () => {
        const periodTitle = auditScope === 'month' ? `شهر ${selectedMonth}` : 'كافة الفترات المسجلة';
        const title = `كشف مبيعات كروت الفواتير وحركات الخصم المقابلة من المخزون - ${periodTitle}`;
        const headers = [
            'رقم الفاتورة',
            'التاريخ والوقت',
            'العميل',
            'نوع البيع',
            'فئة الكرت',
            'المباع',
            'المخصوم',
            'حالة الخصم',
            'إجمالي الفاتورة'
        ];

        // Export all invoices for the entire table
        const targetList = displayedInvoices;
        const data = targetList.map(inv => [
            `#${inv.invoiceNumber}`,
            inv.dateTime,
            inv.distributorName,
            inv.paymentType === 'cash' ? 'نقدي' : 'آجل',
            inv.categoryName,
            `${inv.quantitySold} كارت`,
            `${inv.stockDeducted} كارت`,
            'تم الخصم بالكامل ✓',
            `${inv.netTotal.toFixed(2)} ريال`
        ]);

        const totalQty = targetList.reduce((sum, i) => sum + i.quantitySold, 0);
        const totalStockDeducted = targetList.reduce((sum, i) => sum + i.stockDeducted, 0);
        const totalAmt = targetList.reduce((sum, i) => sum + i.netTotal, 0);

        data.push([
            'الإجمالي لكافة الجدول',
            `${targetList.length} حركة مسجلة`,
            '-',
            '-',
            '-',
            `${totalQty} كارت`,
            `${totalStockDeducted} كارت`,
            'متطابق 100% ✓',
            `${totalAmt.toFixed(2)} ريال`
        ]);

        printReport(title, headers, data);
    };

    const handleExportAuditPDF = () => {
        const periodTitle = auditScope === 'month' ? `شهر ${selectedMonth}` : 'كافة الفترات المسجلة';
        
        if (viewMode === 'invoices') {
            handleExportInvoicesTablePDF();
            return;
        }

        const title = `تقرير مطابقة مبيعات الفواتير وخصم المخزون - ${periodTitle}`;
        const headers = [
            'الفئة',
            'فواتير المبيعات',
            'المخصوم',
            'تطابق الخصم',
            'إجمالي المشتريات',
            'المتبقي',
            'المتبقي المتوقع',
            'حالة الجرد'
        ];

        const data = displayedReconciliation.map(r => [
            r.category.name,
            `${r.allTimeSalesQty} كارت`,
            `${r.stockDeductionsQty} كارت`,
            r.isDeductionMatched ? 'متطابق 100% ✓' : `فارق (${r.salesVsDeductionDiff})`,
            `${r.allTimePurchasesQty} كارت`,
            `${r.currentStock} كارت`,
            `${r.expectedStock} كارت`,
            r.stockDifference === 0 
                ? 'مطابق ✓' 
                : r.stockDifference > 0 
                    ? `فائض (+${r.stockDifference})` 
                    : `عجز (${r.stockDifference})`
        ]);

        const totalSales = reconciliationData.reduce((sum, r) => sum + r.allTimeSalesQty, 0);
        const totalDeducted = reconciliationData.reduce((sum, r) => sum + r.stockDeductionsQty, 0);
        const totalPurchased = reconciliationData.reduce((sum, r) => sum + r.allTimePurchasesQty, 0);
        const totalCurrent = reconciliationData.reduce((sum, r) => sum + r.currentStock, 0);

        data.push([
            'الإجمالي العام',
            `${totalSales} كارت`,
            `${totalDeducted} كارت`,
            totalSales === totalDeducted ? 'متطابق 100% ✓' : 'يوجد فوارق',
            `${totalPurchased} كارت`,
            `${totalCurrent} كارت`,
            `${totalPurchased - totalSales} كارت`,
            overallStats.categoriesWithDiff === 0 ? 'مطابق 100% ✓' : `${overallStats.categoriesWithDiff} فئات بها فارق`
        ]);

        printReport(title, headers, data);
    };

    const handleShareReport = async () => {
        const periodTitle = auditScope === 'month' ? `شهر ${selectedMonth}` : 'كافة الفترات';
        const nonMatchingCount = overallStats.categoriesWithDiff;
        const diffCategories = reconciliationData.filter(r => r.hasDiscrepancy);
        
        let summaryText = `📋 **تقرير مطابقة وتصحيح جرد المخزون (${periodTitle})**\n`;
        summaryText += `-----------------------------------\n`;
        summaryText += `• إجمالي الفئات: ${reconciliationData.length}\n`;
        summaryText += `• الفئات غير المطابقة (فروقات الجرد): ${nonMatchingCount}\n`;
        summaryText += `• إجمالي المبيعات المسجلة: ${overallStats.totalSalesQty} كارت\n`;
        summaryText += `• الرصيد الفعلي المتوفر: ${overallStats.totalCurrentStock} كارت\n`;
        
        if (diffCategories.length > 0) {
            summaryText += `\n🔍 **الفئات التي بها فروقات جرد:**\n`;
            diffCategories.forEach(c => {
                const diffStr = c.stockDifference > 0 ? `+${c.stockDifference}` : `${c.stockDifference}`;
                summaryText += `- ${c.category.name}: المخزون الحقيقي (${c.currentStock}) | المتوقع (${c.expectedStock}) | الفارق: (${diffStr})\n`;
            });
        } else {
            summaryText += `\n✅ جميع فئات الكروت مطابقة ومستقرة تماماً.\n`;
        }

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `تقرير مطابقة وجرد المخزون - ${periodTitle}`,
                    text: summaryText,
                });
                return;
            } catch (e) {
                // share dismissed
            }
        }

        try {
            await navigator.clipboard.writeText(summaryText);
            alert('تم نسخ تقرير مطابقة وجرد المخزون إلى الحافظة بنجاح! يمكنك مشاركته الآن عبر أي تطبيق.');
        } catch (e) {
            handleExportAuditPDF();
        }
    };

    return (
        <div className="w-full max-w-full overflow-hidden space-y-4 sm:space-y-6 animate-in fade-in duration-200" dir="rtl">
            {/* Header & Controls Bar (Exact Same Structure as CardSalesSection) */}
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center border border-violet-100 dark:border-violet-900/50 shrink-0">
                            <Scale size={22} className="sm:hidden" />
                            <Scale size={26} className="hidden sm:block" />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">مطابقة وتصحيح أرصدة الجرد والمبيعات</h2>
                            <p className="text-[11px] sm:text-xs font-bold text-slate-400">
                                تدقيق رصيد المخزون الفعلي، إظهار الفروقات وتصحيح الرصيد مع الملاحظات والتقارير
                            </p>
                        </div>
                    </div>

                    <div className="w-full sm:w-auto flex items-center gap-2">
                        <button
                            onClick={handleShareReport}
                            className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white font-black text-xs rounded-xl sm:rounded-2xl border border-emerald-200 dark:border-emerald-800 flex items-center justify-center gap-1.5 transition active:scale-95 shadow-xs"
                            title="مشاركة ملخص تقرير الجرد والمطابقة"
                        >
                            <Share2 size={15} />
                            <span>مشاركة التقرير</span>
                        </button>
                        <button
                            onClick={handleExportAuditPDF}
                            className="flex-1 sm:flex-initial px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-black text-xs rounded-xl sm:rounded-2xl shadow-md shadow-violet-600/20 flex items-center justify-center gap-2 transition active:scale-95"
                        >
                            <Printer size={15} />
                            <span>طباعة / PDF</span>
                        </button>
                    </div>
                </div>

                {/* Scope and Filter Bar */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* View Mode Switcher */}
                        <div className="grid grid-cols-3 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 w-full sm:w-auto text-[11px] sm:text-xs font-black">
                            <button
                                onClick={() => setViewMode('all')}
                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl transition text-center ${
                                    viewMode === 'all'
                                        ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                عرض شامل
                            </button>
                            <button
                                onClick={() => setViewMode('invoices')}
                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl transition text-center ${
                                    viewMode === 'invoices'
                                        ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                مبيعات الفواتير والخصم
                            </button>
                            <button
                                onClick={() => setViewMode('categories')}
                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl transition text-center ${
                                    viewMode === 'categories'
                                        ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                إجمالي ومتبقي الفئات
                            </button>
                        </div>

                        {/* Scope Switcher */}
                        <div className="grid grid-cols-2 sm:flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 w-full sm:w-auto">
                            <button
                                onClick={() => {
                                    setAuditScope('month');
                                    setCurrentPage(1);
                                    setInvoicePage(1);
                                }}
                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black transition text-center ${
                                    auditScope === 'month'
                                        ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                مطابقة شهرية
                            </button>
                            <button
                                onClick={() => {
                                    setAuditScope('all');
                                    setCurrentPage(1);
                                    setInvoicePage(1);
                                }}
                                className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-black transition text-center ${
                                    auditScope === 'all'
                                        ? 'bg-white dark:bg-slate-900 text-violet-600 dark:text-violet-400 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                مطابقة شاملة
                            </button>
                        </div>

                        {/* Month selector if month scope */}
                        {auditScope === 'month' && (
                            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 w-full sm:w-auto">
                                <Calendar size={13} className="text-slate-400 shrink-0" />
                                <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 shrink-0">الشهر:</span>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => {
                                        onMonthChange(e.target.value);
                                        setCurrentPage(1);
                                        setInvoicePage(1);
                                    }}
                                    className="bg-transparent text-[11px] sm:text-xs font-black text-slate-900 dark:text-white outline-none cursor-pointer w-full sm:w-auto"
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Audit Status Alert Banner */}
            <div className={`p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border flex items-center justify-between gap-3 ${
                overallStats.categoriesWithDiff === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300'
            }`}>
                <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 ${
                        overallStats.categoriesWithDiff === 0 ? 'bg-emerald-100 dark:bg-emerald-900/60' : 'bg-amber-100 dark:bg-amber-900/60'
                    }`}>
                        {overallStats.categoriesWithDiff === 0 ? <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" /> : <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" />}
                    </div>
                    <div>
                        <div className="text-[11px] sm:text-xs font-black">
                            {overallStats.categoriesWithDiff === 0 
                                ? 'حالة المطابقة: كافة فئات الكروت متطابقة ومستقرة تماماً ✓' 
                                : `تنبيه: يوجد ${overallStats.categoriesWithDiff} فئات تظهر فروقات بين حركة المبيعات والمخزون.`
                            }
                        </div>
                        <div className="text-[10px] sm:text-[11px] font-bold opacity-80 mt-0.5">
                            يتم استبعاد أي فواتير ملغاة تلقائياً، وتحديث الأرصدة النقدية والآجلة لحظياً.
                        </div>
                    </div>
                </div>

                <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <span className="text-xs font-black px-3 py-1 rounded-xl bg-white/70 dark:bg-slate-900/70 border border-current">
                        {reconciliationData.length} فئات نشطة
                    </span>
                </div>
            </div>

            {/* Quick Stat KPIs (Exact 4 Cards Grid Style as CardSalesSection) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* 1. Current Stock in Warehouse */}
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">المخزون المتوفر</span>
                    <div className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">
                        {overallStats.totalCurrentStock} كارت
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-0.5">
                        القيمة: {overallStats.totalStockRetailVal.toLocaleString()} ريال
                    </div>
                </div>

                {/* 2. Cash Sales */}
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">المبيعات النقدية</span>
                    <div className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                        {overallStats.totalCashSalesQty} كارت
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-0.5">
                        صافي: {overallStats.totalCashSalesAmount.toFixed(2)} ريال
                    </div>
                </div>

                {/* 3. Credit Sales */}
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">المبيعات الآجلة</span>
                    <div className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">
                        {overallStats.totalCreditSalesQty} كارت
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-0.5">
                        مستحق: {overallStats.totalCreditSalesAmount.toFixed(2)} ريال
                    </div>
                </div>

                {/* 4. Total Inflow / Purchases */}
                <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-[10px] sm:text-[11px] font-black text-slate-400">الكروت الواردة</span>
                    <div className="text-base sm:text-lg font-black text-blue-600 dark:text-blue-400 mt-1">
                        +{overallStats.totalPurchasesQty} كارت
                    </div>
                    <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-0.5">
                        مشتريات: {overallStats.totalPurchasesAmount.toFixed(2)} ريال
                    </div>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* TABLE 1: Sales Per Invoice with Categories & Stock Deductions             */}
            {/* ========================================================================= */}
            {(viewMode === 'all' || viewMode === 'invoices') && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-0 w-full max-w-full">
                    <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/40">
                        <div 
                            className="flex items-center justify-between lg:justify-start gap-2.5 cursor-pointer select-none"
                            onClick={() => setIsInvoicesTableOpen(!isInvoicesTableOpen)}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black shrink-0">
                                    <FileText size={16} />
                                </div>
                                <div>
                                    <h3 className="font-black text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                                        <span>1. جدول مبيعات الكروت لكل فاتورة والكمية المخصومة من المخزون</span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                                            {displayedInvoices.length} حركة مسجلة
                                        </span>
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold hidden sm:block">
                                        يبين تفاصيل كل فاتورة مبيعات، الفئات المحتواة فيها، والكمية التي تم إنقاصها من رصيد المخزن مباشرة
                                    </p>
                                </div>
                            </div>

                            {/* Mobile Collapse Toggle Button */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsInvoicesTableOpen(!isInvoicesTableOpen);
                                }}
                                className="lg:hidden p-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1 text-[10px] font-black shrink-0"
                            >
                                {isInvoicesTableOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                <span>{isInvoicesTableOpen ? 'طي' : 'فتح'}</span>
                            </button>
                        </div>

                        {/* Invoice Table Actions & Filters Toolbar */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Collapse/Expand Toggle Button on Desktop */}
                            <button
                                type="button"
                                onClick={() => setIsInvoicesTableOpen(!isInvoicesTableOpen)}
                                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition text-[11px] font-black shadow-xs shrink-0"
                                title={isInvoicesTableOpen ? 'طي الجدول' : 'توسيع وفتح الجدول'}
                            >
                                {isInvoicesTableOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                <span>{isInvoicesTableOpen ? 'طي الجدول' : 'فتح الجدول'}</span>
                            </button>

                            {/* Download & Share PDF Button for Entire Invoices Table */}
                            <button
                                id="btn-export-invoices-pdf"
                                onClick={handleExportInvoicesTablePDF}
                                className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 dark:hover:text-white border border-emerald-200 dark:border-emerald-800 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition-all flex items-center gap-1.5 shadow-sm active:scale-95 shrink-0"
                                title="تحميل ومشاركة تقرير PDF لكافة الجدول"
                            >
                                <FileDown size={14} className="shrink-0" />
                                <Share2 size={13} className="shrink-0" />
                                <span>تحميل ومشاركة PDF</span>
                            </button>

                            {isInvoicesTableOpen && (
                                <>
                                    {/* Search */}
                                    <div className="relative flex-1 sm:w-44 min-w-[130px]">
                                        <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="بحث برقم الفاتورة / العميل..."
                                            value={invoiceSearch}
                                            onChange={(e) => {
                                                setInvoiceSearch(e.target.value);
                                                setInvoicePage(1);
                                            }}
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-8 pl-2.5 py-1.5 text-[11px] font-bold outline-none focus:border-violet-600 text-slate-900 dark:text-white"
                                        />
                                    </div>

                                    {/* Payment filter */}
                                    <select
                                        value={invoicePaymentFilter}
                                        onChange={(e: any) => {
                                            setInvoicePaymentFilter(e.target.value);
                                            setInvoicePage(1);
                                        }}
                                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 text-[11px] font-bold outline-none text-slate-700 dark:text-slate-300 cursor-pointer"
                                    >
                                        <option value="all">كافة طرق الدفع</option>
                                        <option value="cash">نقدي فقط</option>
                                        <option value="credit">آجل فقط</option>
                                    </select>

                                    {/* Category filter */}
                                    <select
                                        value={invoiceCategoryFilter}
                                        onChange={(e) => {
                                            setInvoiceCategoryFilter(e.target.value);
                                            setInvoicePage(1);
                                        }}
                                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1.5 text-[11px] font-bold outline-none text-slate-700 dark:text-slate-300 cursor-pointer max-w-[140px]"
                                    >
                                        <option value="all">كافة الفئات</option>
                                        {categories.map(c => (
                                            <option key={c.id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Collapsed State Teaser */}
                    {!isInvoicesTableOpen && (
                        <div 
                            onClick={() => setIsInvoicesTableOpen(true)}
                            className="p-3 bg-slate-50/40 dark:bg-slate-800/20 flex items-center justify-between cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition text-xs font-bold text-slate-500"
                        >
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                <span>تم طي جدول مبيعات الفواتير ({displayedInvoices.length} فاتورة مسجلة - إجمالي {displayedInvoices.reduce((sum, i) => sum + i.quantitySold, 0)} كارت مباع)</span>
                            </span>
                            <span className="text-emerald-600 dark:text-emerald-400 font-black text-[11px] flex items-center gap-1">
                                <span>انقر لفتح وتوسيع الجدول</span>
                                <ChevronDown size={14} />
                            </span>
                        </div>
                    )}

                    {/* Table Body when Open */}
                    {isInvoicesTableOpen && (
                        <>
                            <div className="w-full overflow-x-auto">
                                <table className="w-full text-right text-[11px] sm:text-xs">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-black border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                                            <th className="px-3.5 py-2.5 text-center">رقم الفاتورة</th>
                                            <th className="px-3 py-2.5">التاريخ والوقت</th>
                                            <th className="px-3 py-2.5">العميل</th>
                                            <th className="px-3.5 py-2.5">فئة الكرت</th>
                                            <th className="px-3 py-2.5 text-center bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300">
                                                المباع
                                            </th>
                                            <th className="px-3 py-2.5 text-center bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300">
                                                المخصوم
                                            </th>
                                            <th className="px-3 py-2.5 text-center">حالة الخصم</th>
                                            <th className="px-3 py-2.5 text-center">إجمالي المبلغ</th>
                                            <th className="px-3 py-2.5 text-center">المتبقي</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {paginatedInvoices.map((inv) => (
                                            <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors whitespace-nowrap">
                                                {/* Invoice Number */}
                                                <td className="px-3.5 py-2 text-center font-mono font-black text-indigo-600 dark:text-indigo-400">
                                                    #{inv.invoiceNumber}
                                                </td>

                                                {/* Date & Time (Single Line) */}
                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-bold">
                                                    <span>{inv.date}</span>
                                                    {inv.dateTime.split(' ')[1] && (
                                                        <span className="text-[10px] text-slate-400 font-normal mr-1.5">
                                                            ({inv.dateTime.split(' ')[1]})
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Distributor / Buyer & Payment (Single Line) */}
                                                <td className="px-3 py-2">
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <span className="font-black text-slate-900 dark:text-white">
                                                            {inv.distributorName}
                                                        </span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                                            inv.paymentType === 'cash' 
                                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                                        }`}>
                                                            {inv.paymentType === 'cash' ? 'نقدي' : 'آجل'}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Category Name (Without price in parenthesis) */}
                                                <td className="px-3.5 py-2">
                                                    <span className="text-violet-700 dark:text-violet-300 font-black">{inv.categoryName}</span>
                                                </td>

                                                {/* Quantity Sold in Invoice */}
                                                <td className="px-3 py-2 text-center font-mono font-black text-slate-900 dark:text-white bg-emerald-50/20 dark:bg-emerald-950/5">
                                                    <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                                        {inv.quantitySold} كارت
                                                    </span>
                                                </td>

                                                {/* Stock Deducted for this Invoice */}
                                                <td className="px-3 py-2 text-center font-mono font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/5">
                                                    <span>-{inv.stockDeducted} كارت</span>
                                                </td>

                                                {/* Match Status */}
                                                <td className="px-3 py-2 text-center">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                                        <CheckCircle2 size={10} />
                                                        مخصوم تلقائياً ✓
                                                    </span>
                                                </td>

                                                {/* Net Total */}
                                                <td className="px-3 py-2 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                                                    {inv.netTotal.toFixed(2)} ريال
                                                </td>

                                                {/* Current Stock for that category */}
                                                <td className="px-3 py-2 text-center font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                    {inv.remainingStock} كارت
                                                </td>
                                            </tr>
                                        ))}

                                        {displayedInvoices.length === 0 && (
                                            <tr>
                                                <td colSpan={9} className="px-4 py-8 text-center text-slate-400 font-bold">
                                                    لا توجد فواتير مبيعات مسجلة في النطاق المحدد
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>

                                    {displayedInvoices.length > 0 && (
                                        <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-black border-t-2 border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                            <tr className="text-slate-900 dark:text-white">
                                                <td className="px-3.5 py-2.5 text-center" colSpan={4}>
                                                    إجمالي مبيعات الفواتير المسجلة ({displayedInvoices.length} فاتورة)
                                                </td>
                                                <td className="px-3.5 py-2.5 text-center font-mono text-emerald-600">
                                                    {displayedInvoices.reduce((sum, i) => sum + i.quantitySold, 0)} كارت
                                                </td>
                                                <td className="px-3.5 py-2.5 text-center font-mono text-emerald-600">
                                                    -{displayedInvoices.reduce((sum, i) => sum + i.stockDeducted, 0)} كارت
                                                </td>
                                                <td className="px-3.5 py-2.5 text-center">
                                                    <span className="text-emerald-600 font-black">متطابق 100% ✓</span>
                                                </td>
                                                <td className="px-3.5 py-2.5 text-center font-mono text-violet-600 font-black">
                                                    {displayedInvoices.reduce((sum, i) => sum + i.netTotal, 0).toFixed(2)} ريال
                                                </td>
                                                <td className="px-3.5 py-2.5 text-center text-slate-400">-</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>

                            {/* Invoice Pagination */}
                            {totalInvoicePages > 1 && (
                                <div className="p-3 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-bold">
                                    <span className="text-slate-400">
                                        عرض صفحة <strong className="text-violet-600">{invoicePage}</strong> من <strong className="text-slate-700 dark:text-slate-300">{totalInvoicePages}</strong> (إجمالي {displayedInvoices.length} فاتورة)
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => setInvoicePage(p => Math.max(p - 1, 1))}
                                            disabled={invoicePage === 1}
                                            className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 disabled:opacity-40"
                                        >
                                            السابق
                                        </button>
                                        <span className="font-mono font-black px-2">{invoicePage} / {totalInvoicePages}</span>
                                        <button
                                            onClick={() => setInvoicePage(p => Math.min(p + 1, totalInvoicePages))}
                                            disabled={invoicePage === totalInvoicePages}
                                            className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 disabled:opacity-40"
                                        >
                                            التالي
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ========================================================================= */}
            {/* TABLE 2: Category Aggregated Sales, Deductions & Remaining Stock Totals   */}
            {/* ========================================================================= */}
            {(viewMode === 'all' || viewMode === 'categories') && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-0 w-full max-w-full">
                    <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/40">
                        <div 
                            className="flex items-center justify-between lg:justify-start gap-2.5 cursor-pointer select-none"
                            onClick={() => setIsCategoriesTableOpen(!isCategoriesTableOpen)}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center font-black shrink-0">
                                    <Scale size={16} />
                                </div>
                                <div>
                                    <h3 className="font-black text-xs sm:text-sm text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                                        <span>2. جدول إجمالي كميات البيع والخصم والمتبقي بالمخزون لكل فئة</span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 font-bold">
                                            {reconciliationData.length} فئات
                                        </span>
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold hidden sm:block">
                                        تجميع كمية المبيعات الإجمالية لكل فئة، كمية الخصم من المخزون، والمخزون الفعلي المتبقي حالياً
                                    </p>
                                </div>
                            </div>

                            {/* Mobile Collapse Toggle Button */}
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCategoriesTableOpen(!isCategoriesTableOpen);
                                }}
                                className="lg:hidden p-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1 text-[10px] font-black shrink-0"
                            >
                                {isCategoriesTableOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                <span>{isCategoriesTableOpen ? 'طي' : 'فتح'}</span>
                            </button>
                        </div>

                        {/* Category Table Filters & Actions Toolbar */}
                        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                            {/* Collapse/Expand Toggle Button on Desktop */}
                            <button
                                type="button"
                                onClick={() => setIsCategoriesTableOpen(!isCategoriesTableOpen)}
                                className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition text-[11px] font-black shadow-xs shrink-0"
                                title={isCategoriesTableOpen ? 'طي الجدول' : 'توسيع وفتح الجدول'}
                            >
                                {isCategoriesTableOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                <span>{isCategoriesTableOpen ? 'طي الجدول' : 'فتح الجدول'}</span>
                            </button>

                            {/* Download & Share PDF for Categories Table */}
                            <button
                                id="btn-export-categories-pdf"
                                onClick={handleExportAuditPDF}
                                className="bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 hover:bg-violet-600 hover:text-white dark:hover:bg-violet-600 dark:hover:text-white border border-violet-200 dark:border-violet-800 rounded-xl px-2.5 py-1.5 text-[11px] font-black transition-all flex items-center gap-1.5 shadow-sm active:scale-95 shrink-0"
                                title="تحميل ومشاركة تقرير PDF لكافة الفئات"
                            >
                                <FileDown size={14} className="shrink-0" />
                                <Share2 size={13} className="shrink-0" />
                                <span>تحميل ومشاركة PDF</span>
                            </button>

                            {isCategoriesTableOpen && (
                                <>
                                    <div className="relative flex-1 sm:w-48 min-w-[130px]">
                                        <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="بحث عن فئة..."
                                            value={searchTerm}
                                            onChange={(e) => {
                                                setSearchTerm(e.target.value);
                                                setCurrentPage(1);
                                            }}
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pr-8 pl-2.5 py-1.5 text-[11px] font-bold outline-none focus:border-violet-600 text-slate-900 dark:text-white"
                                        />
                                    </div>

                                    <select
                                        value={statusFilter}
                                        onChange={(e: any) => {
                                            setStatusFilter(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-[11px] font-bold outline-none focus:border-violet-600 text-slate-700 dark:text-slate-300 cursor-pointer"
                                    >
                                        <option value="all">كافة الفئات ({reconciliationData.length})</option>
                                        <option value="diff">فروقات ({overallStats.categoriesWithDiff})</option>
                                        <option value="matched">مطابقة تماماً</option>
                                    </select>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Collapsed State Teaser */}
                    {!isCategoriesTableOpen && (
                        <div 
                            onClick={() => setIsCategoriesTableOpen(true)}
                            className="p-3 bg-slate-50/40 dark:bg-slate-800/20 flex items-center justify-between cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition text-xs font-bold text-slate-500"
                        >
                            <span className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-violet-500"></span>
                                <span>تم طي جدول مبيعات وفروقات الفئات ({reconciliationData.length} فئات مسجلة - إجمالي {overallStats.totalCurrentStock} كارت متبقي بالمخزن)</span>
                            </span>
                            <span className="text-violet-600 dark:text-violet-400 font-black text-[11px] flex items-center gap-1">
                                <span>انقر لفتح وتوسيع الجدول</span>
                                <ChevronDown size={14} />
                            </span>
                        </div>
                    )}
                    
                    {/* Table Body when Open */}
                    {isCategoriesTableOpen && (
                        <div className="w-full overflow-x-auto">
                            <table className="w-full text-right text-[11px] sm:text-xs">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-black border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">
                                        <th className="px-3.5 py-2.5">الفئة</th>
                                        <th className="px-3 py-2.5 text-center bg-emerald-50/40 dark:bg-emerald-950/10">
                                            إجمالي كروت فواتير المبيعات
                                        </th>
                                        <th className="px-3 py-2.5 text-center bg-emerald-50/40 dark:bg-emerald-950/10">
                                            المخصوم
                                        </th>
                                        <th className="px-3 py-2.5 text-center">تطابق الخصم</th>
                                        <th className="px-3 py-2.5 text-center bg-blue-50/40 dark:bg-blue-950/10">
                                            إجمالي المشتريات
                                        </th>
                                        <th className="px-3 py-2.5 text-center bg-indigo-50/40 dark:bg-indigo-950/10">
                                            المتبقي
                                        </th>
                                        <th className="px-3 py-2.5 text-center">المتبقي المتوقع</th>
                                        <th className="px-3 py-2.5 text-center">فارق الجرد</th>
                                        <th className="px-3 py-2.5 text-center">كشف وتدقيق</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {displayedReconciliation.map((item) => (
                                        <tr key={item.category.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors whitespace-nowrap">
                                            <td className="px-3.5 py-2 font-black text-slate-900 dark:text-white">
                                                <span>{item.category.name}</span>
                                            </td>

                                            {/* Total Invoiced Sales (Cash + Credit) */}
                                            <td className="px-3 py-2 text-center font-mono font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/5">
                                                <div className="inline-flex items-center gap-1">
                                                    <span>{item.allTimeSalesQty} كارت</span>
                                                    <span className="text-[9px] text-slate-400">({item.allTimeCashQty} ن + {item.allTimeCreditQty} ج)</span>
                                                </div>
                                            </td>

                                            {/* Total Stock Deductions */}
                                            <td className="px-3 py-2 text-center font-mono font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/5">
                                                {item.stockDeductionsQty} كارت
                                            </td>

                                            {/* Deduction Match Status */}
                                            <td className="px-3 py-2 text-center">
                                                {item.isDeductionMatched ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                                        <CheckCircle2 size={10} />
                                                        متطابق 100% ✓
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                                                        <AlertTriangle size={10} />
                                                        فارق ({item.salesVsDeductionDiff})
                                                    </span>
                                                )}
                                            </td>

                                            {/* Purchases Invoices */}
                                            <td className="px-3 py-2 text-center font-mono font-black text-blue-600 bg-blue-50/20 dark:bg-blue-950/5">
                                                {item.allTimePurchasesQty} كارت
                                            </td>

                                            {/* Actual Current Stock */}
                                            <td className="px-3 py-2 text-center font-mono font-black text-indigo-600 bg-indigo-50/30 dark:bg-indigo-900/10">
                                                <span className="px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                                                    {item.currentStock} كارت
                                                </span>
                                            </td>

                                            {/* Expected Stock (Purchases - Sales) */}
                                            <td className="px-3 py-2 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                                                {item.expectedStock} كارت
                                            </td>

                                            {/* Difference vs (Purchases - Sales) */}
                                            <td className="px-3 py-2 text-center">
                                                {item.stockDifference === 0 ? (
                                                    <span className="text-emerald-600 font-black">مطابق ✓</span>
                                                ) : (
                                                    <div className={`font-black inline-flex items-center justify-center gap-1 ${item.stockDifference > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                                                        <AlertTriangle size={12} />
                                                        <span>{item.stockDifference > 0 ? `+${item.stockDifference}` : item.stockDifference}</span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Action Drilldown & Reconciliation Buttons */}
                                            <td className="px-3 py-2 text-center">
                                                <div className="inline-flex items-center gap-1.5">
                                                    <button 
                                                        onClick={() => handleOpenReconcileModal(item)}
                                                        className="px-2 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 hover:bg-amber-600 hover:text-white font-bold transition inline-flex items-center justify-center gap-1 border border-amber-200 dark:border-amber-800"
                                                        title="تصحيح ومطابقة رصيد الجرد الفعلي وكتابة ملاحظات"
                                                    >
                                                        <Wrench size={12} />
                                                        <span>مطابقة</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => setSelectedCategoryForModal(item.category)}
                                                        className="px-2.5 py-1 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 hover:bg-violet-600 hover:text-white font-bold transition inline-flex items-center justify-center gap-1"
                                                        title="عرض فواتير الصنف وحركات الخصم"
                                                    >
                                                        <Eye size={12} />
                                                        <span>كشف</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {displayedReconciliation.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="px-4 py-10 text-center text-slate-400 font-bold">
                                                لا توجد بيانات مطابقة للبحث
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {displayedReconciliation.length > 0 && (
                                    <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-black border-t-2 border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                        <tr className="text-slate-900 dark:text-white">
                                            <td className="px-3.5 py-2.5">الإجمالي العام</td>
                                            <td className="px-3 py-2.5 text-center font-mono text-emerald-600">
                                                {overallStats.totalSalesQty} كارت
                                            </td>
                                            <td className="px-3 py-2.5 text-center font-mono text-emerald-600">
                                                {reconciliationData.reduce((sum, r) => sum + r.stockDeductionsQty, 0)} كارت
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className="text-emerald-600">خصم دقيق 100% ✓</span>
                                            </td>
                                            <td className="px-3 py-3 text-center font-mono text-blue-600">
                                                {overallStats.totalPurchasedQty} كارت
                                            </td>
                                            <td className="px-3 py-3 text-center font-mono text-indigo-600">
                                                {overallStats.totalCurrentStock} كارت
                                            </td>
                                            <td className="px-3 py-3 text-center font-mono text-slate-700 dark:text-slate-300">
                                                {overallStats.totalPurchasedQty - overallStats.totalSalesQty} كارت
                                            </td>
                                            <td className="px-3 py-3 text-center" colSpan={2}>
                                                {overallStats.categoriesWithDiff > 0 ? (
                                                    <span className="text-amber-600">{overallStats.categoriesWithDiff} فئات بها فارق</span>
                                                ) : (
                                                    <span className="text-emerald-600">كافة الفئات مطابقة للفواتير ✓</span>
                                                )}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Detailed Cards View (Optional) */}
            <div className="flex items-center justify-between mt-6 mb-3">
                <div className="flex items-center gap-2">
                    <Layers size={16} className="text-slate-400" />
                    <h3 className="font-black text-xs text-slate-500">تفاصيل فواتير الفئات</h3>
                </div>
                <button 
                    onClick={() => setExpandedCategories({})}
                    className="text-[10px] font-black text-violet-600 hover:underline"
                >
                    طي الكل
                </button>
            </div>

            <div className="space-y-3">
                {paginatedReconciliation.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 p-10 sm:p-12 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs space-y-2">
                        <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
                        <p>لا توجد فئات كروت مطابقة لمعايير البحث.</p>
                    </div>
                ) : (
                    paginatedReconciliation.map((item) => {
                        const isExpanded = !!expandedCategories[item.category.id];

                        return (
                            <div 
                                key={item.category.id}
                                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:border-violet-300 transition"
                            >
                                {/* Category Reconciliation Header Bar (Clickable to Expand/Collapse) */}
                                <div 
                                    onClick={() => toggleExpand(item.category.id)}
                                    className="p-3.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </div>
                                        <span className="px-3 py-1 bg-violet-600 text-white font-black text-xs rounded-xl shadow-sm">
                                            فئة {item.category.name}
                                        </span>
                                        <div>
                                            <h4 className="font-black text-slate-900 dark:text-white text-xs sm:text-sm flex items-center gap-2">
                                                <span>المخزون المتوفر: <strong className="text-indigo-600 dark:text-indigo-400">{item.currentStock} كارت</strong></span>
                                                <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">({(item.currentStock * (item.category.retailPrice || 0)).toLocaleString()} ريال)</span>
                                            </h4>
                                            <p className="text-[10px] text-slate-400 font-medium">
                                                سعر البيع: {item.category.retailPrice || 0} ريال • جملة: {item.category.wholesalePrice || 0} ريال
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 justify-between sm:justify-end" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-1.5">
                                            {/* Status Badge */}
                                            {item.stockDifference === 0 ? (
                                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50 flex items-center gap-1">
                                                    <CheckCircle2 size={11} />
                                                    <span>متطابق ✓</span>
                                                </span>
                                            ) : item.stockDifference > 0 ? (
                                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50 flex items-center gap-1">
                                                    <AlertTriangle size={11} />
                                                    <span>فائض (+{item.stockDifference})</span>
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 flex items-center gap-1">
                                                    <AlertTriangle size={11} />
                                                    <span>عجز ({item.stockDifference})</span>
                                                </span>
                                            )}

                                            {/* Total Sales Summary Pill */}
                                            <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                                المبيعات: {item.allTimeSalesQty} كارت
                                            </span>
                                        </div>

                                        <button
                                            onClick={() => setSelectedCategoryForModal(item.category)}
                                            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1.5 shadow-md shadow-violet-600/20 active:scale-95 transition"
                                        >
                                            <Eye size={13} />
                                            <span>سجل الفواتير</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Structured Details Table (Collapsible - Exact CardSalesSection Pattern) */}
                                {isExpanded && (
                                    <div className="p-4 animate-in fade-in duration-200">
                                        <table className="w-full text-right text-xs">
                                            <thead>
                                                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[11px] font-bold">
                                                    <th className="pb-2 font-black">نوع الحركة / البيان</th>
                                                    <th className="pb-2 text-center font-black">الكمية (كارت)</th>
                                                    <th className="pb-2 text-center font-black">سعر الوحدة</th>
                                                    <th className="pb-2 text-left font-black">الإجمالي (ريال)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/40">
                                                {/* 1. Cash Sales Row */}
                                                <tr className="font-bold text-slate-800 dark:text-slate-200">
                                                    <td className="py-2.5 font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                                        <Wallet size={13} />
                                                        <span>مبيعات نقدية مستلمة</span>
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono font-black text-emerald-600">
                                                        +{item.allTimeCashQty} كارت
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono text-slate-500">
                                                        {(item.category.retailPrice || 0).toFixed(2)} ريال
                                                    </td>
                                                    <td className="py-2.5 text-left font-mono font-black text-emerald-600">
                                                        {item.allTimeCashAmount.toFixed(2)} ريال
                                                    </td>
                                                </tr>

                                                {/* 2. Credit Sales Row */}
                                                <tr className="font-bold text-slate-800 dark:text-slate-200">
                                                    <td className="py-2.5 font-black text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                                        <CreditCard size={13} />
                                                        <span>مبيعات آجلة مستحقة</span>
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono font-black text-amber-600">
                                                        +{item.allTimeCreditQty} كارت
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono text-slate-500">
                                                        {(item.category.retailPrice || 0).toFixed(2)} ريال
                                                    </td>
                                                    <td className="py-2.5 text-left font-mono font-black text-amber-600">
                                                        {item.allTimeCreditAmount.toFixed(2)} ريال
                                                    </td>
                                                </tr>

                                                {/* 3. Inflow / Purchases Row */}
                                                <tr className="font-bold text-slate-800 dark:text-slate-200">
                                                    <td className="py-2.5 font-black text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                                                        <TrendingUp size={13} />
                                                        <span>الكروت الواردة (مشتريات)</span>
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono font-black text-blue-600">
                                                        +{item.allTimePurchasesQty} كارت
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono text-slate-500">
                                                        {(item.category.wholesalePrice || 0).toFixed(2)} ريال
                                                    </td>
                                                    <td className="py-2.5 text-left font-mono font-black text-blue-600">
                                                        {(item.allTimePurchasesQty * (item.category.wholesalePrice || 0)).toFixed(2)} ريال
                                                    </td>
                                                </tr>

                                                {/* Discrepancy Indicator Row (if any manual gaps exist) */}
                                                {item.stockDifference !== 0 && (
                                                    <tr className="bg-slate-50/50 dark:bg-slate-800/20 font-bold">
                                                        <td className="py-2.5 font-black text-slate-500 flex items-center gap-1.5">
                                                            <AlertTriangle size={13} className={item.stockDifference > 0 ? 'text-blue-500' : 'text-rose-500'} />
                                                            <span>فوارق جرد / تعديلات مخزنية</span>
                                                        </td>
                                                        <td className={`py-2.5 text-center font-mono font-black ${item.stockDifference > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                                                            {item.stockDifference > 0 ? `+${item.stockDifference}` : item.stockDifference} كارت
                                                        </td>
                                                        <td className="py-2.5 text-center font-mono text-slate-400">
                                                            -
                                                        </td>
                                                        <td className={`py-2.5 text-left font-mono font-black ${item.stockDifference > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                                                            {(item.stockDifference * (item.category.wholesalePrice || 0)).toFixed(2)} ريال
                                                        </td>
                                                    </tr>
                                                )}

                                                {/* 4. Current Stock Row */}
                                                <tr className="font-bold text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-800/20">
                                                    <td className="py-2.5 font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                                                        <Layers size={13} />
                                                        <span>الرصيد الفعلي المتوفر بالمخزن</span>
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono font-black text-indigo-600">
                                                        {item.currentStock} كارت
                                                    </td>
                                                    <td className="py-2.5 text-center font-mono text-slate-500">
                                                        {(item.category.retailPrice || 0).toFixed(2)} ريال
                                                    </td>
                                                    <td className="py-2.5 text-left font-mono font-black text-indigo-600">
                                                        {(item.currentStock * (item.category.retailPrice || 0)).toFixed(2)} ريال
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        {/* Reconciliation Summary Footer */}
                                         <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
                                             <div className="flex flex-wrap items-center gap-3">
                                                 <span className="font-bold text-slate-500">
                                                     إجمالي المبيعات: <strong className="text-slate-900 dark:text-white font-black">{item.allTimeSalesQty}</strong> كارت
                                                 </span>
                                                 <span className="text-slate-300">•</span>
                                                 <span className="font-bold text-slate-500">
                                                     إجمالي المشتريات: <strong className="text-blue-600 font-black">{item.allTimePurchasesQty}</strong> كارت
                                                 </span>
                                             </div>

                                             <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                                                 <span className="font-bold text-slate-500">إجمالي قيمة مبيعات الفئة:</span>
                                                 <span className="font-black text-sm text-violet-600 dark:text-violet-400 font-mono" dir="ltr">
                                                     {(item.allTimeCashAmount + item.allTimeCreditAmount).toFixed(2)} ريال
                                                 </span>
                                             </div>
                                         </div>

                                         {/* ALL-TIME AUDIT CALCULATION BOX */}
                                         <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
                                             <div className="flex items-center justify-between">
                                                 <div className="flex items-center gap-2">
                                                     <div className="w-1.5 h-1.5 rounded-full bg-violet-600"></div>
                                                     <h5 className="font-black text-[11px] sm:text-xs text-slate-700 dark:text-slate-300">خوارزمية التدقيق والمطابقة الشاملة (كافة الفترات)</h5>
                                                 </div>
                                                 <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-800 text-[10px] font-black rounded-lg text-slate-500 uppercase tracking-tight">Audit Algorithm</span>
                                             </div>

                                             <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                                                 <div className="space-y-1">
                                                     <div className="text-[10px] font-bold text-slate-400 uppercase">إجمالي الوارد (مشتريات)</div>
                                                     <div className="text-sm font-black text-blue-600 dark:text-blue-400">{item.allTimePurchasesQty} كارت</div>
                                                     <div className="text-[9px] text-slate-400 font-medium">(فواتير المشتريات فقط)</div>
                                                 </div>
                                                 <div className="hidden sm:flex items-center justify-center text-slate-300">
                                                     <span className="text-lg font-light">−</span>
                                                 </div>
                                                 <div className="space-y-1">
                                                     <div className="text-[10px] font-bold text-slate-400 uppercase">إجمالي المبيعات (تراكمي)</div>
                                                     <div className="text-sm font-black text-amber-600 dark:text-amber-400">{item.allTimeSalesQty} كارت</div>
                                                     <div className="text-[9px] text-slate-400 font-medium">(نقدي + آجل)</div>
                                                 </div>
                                                 <div className="hidden sm:flex items-center justify-center text-slate-300">
                                                     <span className="text-lg font-light">=</span>
                                                 </div>
                                                 <div className="space-y-1 bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
                                                     <div className="text-[10px] font-bold text-slate-400 uppercase">الرصيد المتوقع</div>
                                                     <div className="text-sm font-black text-slate-900 dark:text-white">{item.expectedStock} كارت</div>
                                                     <div className="text-[9px] text-slate-400 font-medium">(المفترض توفره)</div>
                                                 </div>
                                             </div>

                                             <div className={`mt-3 p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                                                 item.stockDifference === 0 
                                                     ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                                     : item.stockDifference > 0 
                                                         ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/40 text-blue-700 dark:text-blue-300'
                                                         : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40 text-rose-700 dark:text-rose-300'
                                             }`}>
                                                 <div className="space-y-1">
                                                     <div className="flex items-center gap-2">
                                                         {item.stockDifference === 0 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                                                         <div className="text-xs font-black">
                                                             {item.stockDifference === 0 
                                                                 ? 'الرصيد الفعلي مطابق تماماً للرصيد المتوقع ✓' 
                                                                 : item.stockDifference > 0 
                                                                     ? `يوجد فائض بمقدار (+${item.stockDifference}) كارت.` 
                                                                     : `يوجد عجز بمقدار (-${Math.abs(item.stockDifference)}) كارت.`
                                                             }
                                                         </div>
                                                     </div>
                                                     <p className="text-[11px] font-medium opacity-90 pr-6">
                                                         {item.discrepancyExplanation}
                                                     </p>
                                                 </div>

                                                 <div className="flex items-center gap-2 self-end sm:self-center">
                                                     <div className="text-xs font-black px-3 py-1.5 bg-white dark:bg-slate-900 rounded-xl border border-current shadow-xs whitespace-nowrap">
                                                         الرصيد الفعلي بالمخزن: {item.currentStock} كارت
                                                     </div>

                                                     {item.stockDifference !== 0 && (
                                                         <button
                                                             onClick={() => handleQuickSyncStock(item.category, item.expectedStock)}
                                                             disabled={reconcilingCatId === item.category.id}
                                                             className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1.5 whitespace-nowrap"
                                                             title="ضبط رصيد المخزن الفعلي ليطابق ناتج الفواتير المتوقع"
                                                         >
                                                             <Wrench size={13} />
                                                             <span>{reconcilingCatId === item.category.id ? 'جارٍ الضبط...' : 'تصفير الفارق والمطابقة'}</span>
                                                         </button>
                                                     )}
                                                 </div>
                                             </div>
                                         </div>
                                     </div>
                                 )}
                             </div>
                        );
                    })
                )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex flex-row items-center justify-between bg-white dark:bg-slate-900 px-3 py-1 my-0 mt-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold whitespace-nowrap gap-2">
                    <div className="text-slate-500 whitespace-nowrap">
                        عرض الصفحة <span className="font-black text-violet-600">{currentPage}</span> من <span className="font-black">{totalPages}</span> (إجمالي {displayedReconciliation.length} فئة)
                    </div>
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                            disabled={currentPage === 1}
                            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg font-black text-slate-700 dark:text-slate-300 transition cursor-pointer text-xs"
                        >
                            السابق
                        </button>
                        <span className="font-mono font-black px-1.5">{currentPage} / {totalPages}</span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 rounded-lg font-black text-slate-700 dark:text-slate-300 transition cursor-pointer text-xs"
                        >
                            التالي
                        </button>
                    </div>
                </div>
            )}
        </div>

            {/* MODAL: Detailed Audit and Invoices for a Category */}
            {selectedCategoryForModal && (() => {
                const catTrim = selectedCategoryForModal.name.trim();
                const matchedRecon = reconciliationData.find(r => r.category.id === selectedCategoryForModal.id);
                const catSales = (auditScope === 'month' ? filteredSales : sales).filter(s => {
                    if (isCancelledStatus(s.status)) return false;
                    return isCategoryMatch(s.categoryName, s.categoryId, selectedCategoryForModal.name, selectedCategoryForModal.id, selectedCategoryForModal.linkedSection);
                });
                const catPurchases = (auditScope === 'month' ? filteredPurchases : purchases).filter(p => {
                    if (isCancelledStatus(p.status)) return false;
                    return isCategoryMatch(p.categoryName, p.categoryId, selectedCategoryForModal.name, selectedCategoryForModal.id, selectedCategoryForModal.linkedSection);
                });
                const catLogs = (auditScope === 'month' ? filteredStockLogs : stockLogs).filter(l => 
                    isCategoryMatch(l.categoryName, l.categoryId, selectedCategoryForModal.name, selectedCategoryForModal.id, selectedCategoryForModal.linkedSection)
                );

                return (
                    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
                            {/* Modal Header */}
                            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-violet-100 dark:bg-violet-950/70 text-violet-600 dark:text-violet-400 flex items-center justify-center font-black">
                                        <Scale size={20} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                                            <span>كشف وتدقيق فواتير: {selectedCategoryForModal.name}</span>
                                            <span className="text-xs font-mono font-bold text-violet-600 dark:text-violet-400">({selectedCategoryForModal.retailPrice} ريال)</span>
                                        </h3>
                                        <p className="text-[11px] font-bold text-slate-400">
                                            {auditScope === 'month' ? `نطاق شهر ${selectedMonth}` : 'كافة الفترات والحركات المسجلة'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedCategoryForModal(null)}
                                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Summary KPI Strip */}
                            {matchedRecon && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-violet-50/40 dark:bg-violet-950/20 border-b border-violet-100 dark:border-violet-900/30 text-xs">
                                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                                        <span className="text-[9px] font-bold text-slate-400 block">كروت فواتير المبيعات</span>
                                        <span className="font-mono font-black text-emerald-600">{matchedRecon.allTimeSalesQty} كارت</span>
                                    </div>
                                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                                        <span className="text-[9px] font-bold text-slate-400 block">المخصوم من المخزون</span>
                                        <span className="font-mono font-black text-emerald-600">{matchedRecon.stockDeductionsQty} كارت</span>
                                    </div>
                                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                                        <span className="text-[9px] font-bold text-slate-400 block">فواتير المشتريات</span>
                                        <span className="font-mono font-black text-blue-600">{matchedRecon.allTimePurchasesQty} كارت</span>
                                    </div>
                                    <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60">
                                        <span className="text-[9px] font-bold text-slate-400 block">المخزون الفعلي الحالي</span>
                                        <span className="font-mono font-black text-indigo-600">{matchedRecon.currentStock} كارت</span>
                                    </div>
                                </div>
                            )}

                            {/* Modal Tabs */}
                            <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/20 px-4 pt-2 gap-2 text-xs font-black">
                                <button
                                    onClick={() => setModalTab('sales')}
                                    className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 ${
                                        modalTab === 'sales'
                                            ? 'border-violet-600 text-violet-600 dark:text-violet-400'
                                            : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                    }`}
                                >
                                    <CreditCard size={14} />
                                    <span>فواتير المبيعات وحركات الخصم ({catSales.length})</span>
                                </button>
                                <button
                                    onClick={() => setModalTab('inflow')}
                                    className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 ${
                                        modalTab === 'inflow'
                                            ? 'border-violet-600 text-violet-600 dark:text-violet-400'
                                            : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                    }`}
                                >
                                    <TrendingUp size={14} />
                                    <span>فواتير الشراء والإضافات اليدوية ({catPurchases.length + catLogs.filter(l => (Number(l.quantityAdded) || 0) > 0).length})</span>
                                </button>
                            </div>

                            {/* Modal Tab Body */}
                            <div className="p-4 overflow-y-auto space-y-3 flex-1">
                                {modalTab === 'sales' ? (
                                    catSales.length === 0 ? (
                                        <div className="p-8 text-center text-slate-400 font-bold text-xs space-y-2">
                                            <FileText className="mx-auto text-slate-300 dark:text-slate-700" size={32} />
                                            <p>لا توجد فواتير مبيعات مسجلة لهذه الفئة في النطاق المحدد.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-2">
                                                <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                                <span>تم تدقيق فواتير البيع: كل فاتورة ترحل تنقص المخزون الفعلي بنفس الكمية المسجلة بالفاتورة.</span>
                                            </div>
                                            {catSales.map(sale => (
                                                <div 
                                                    key={sale.id}
                                                    className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between gap-3 text-xs hover:border-violet-300 dark:hover:border-violet-700 transition"
                                                >
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">
                                                                #{sale.invoiceNumber || sale.id.slice(-6).toUpperCase()}
                                                            </span>
                                                            <span className="font-black text-slate-900 dark:text-white">
                                                                {sale.distributorName || 'مشتري عام'}
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black ${
                                                                sale.paymentType === 'cash' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                                            }`}>
                                                                {sale.paymentType === 'cash' ? 'نقدي' : 'آجل'}
                                                            </span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 font-medium mt-1">
                                                            {sale.dateTime || sale.date} • الكاشير: {sale.userName || 'النظام'}
                                                        </div>
                                                    </div>

                                                    <div className="text-left flex items-center gap-3">
                                                        <div>
                                                            <div className="font-mono font-black text-slate-900 dark:text-white text-sm">
                                                                {sale.quantity} كارت
                                                            </div>
                                                            <div className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                                {(sale.netTotal || 0).toFixed(2)} ريال
                                                            </div>
                                                        </div>
                                                        <div className="hidden sm:flex flex-col items-end">
                                                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md">
                                                                مخصوم: -{sale.quantity} ✓
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                ) : (
                                    /* Inflow Tab: Purchases + Manual Additions */
                                    <div className="space-y-3">
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-black text-slate-700 dark:text-slate-300">1. فواتير الشراء الرسمية:</h4>
                                            {catPurchases.length === 0 ? (
                                                <p className="text-[11px] text-slate-400 font-bold p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">لا توجد فواتير شراء رسمية مسجلة لهذه الفئة.</p>
                                            ) : (
                                                catPurchases.map(purchase => (
                                                    <div key={purchase.id} className="p-3 bg-blue-50/40 dark:bg-blue-950/20 rounded-2xl border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-between text-xs">
                                                        <div>
                                                            <span className="font-mono font-black text-blue-700 dark:text-blue-400">#{purchase.invoiceNumber || purchase.id.slice(-6).toUpperCase()}</span>
                                                            <span className="mr-2 font-bold text-slate-800 dark:text-slate-200">{purchase.supplierName || 'مورد عام'}</span>
                                                            <div className="text-[10px] text-slate-400 mt-0.5">{purchase.dateTime || purchase.date}</div>
                                                        </div>
                                                        <div className="text-left font-mono font-black text-blue-700 dark:text-blue-400">
                                                            +{purchase.quantity} كارت
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                            <h4 className="text-xs font-black text-purple-700 dark:text-purple-400">2. إضافات الرصيد اليدوية / الافتتاحية (سبب الفارق الرئيسي):</h4>
                                            {(() => {
                                                const manualLogs = catLogs.filter(l => {
                                                    const notes = l.notes || '';
                                                    const isInv = notes.includes('فاتورة') || notes.includes('شراء') || notes.includes('مبيعات');
                                                    return !isInv && (Number(l.quantityAdded) || 0) > 0;
                                                });

                                                if (manualLogs.length === 0) {
                                                    return <p className="text-[11px] text-slate-400 font-bold p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">لا توجد حركات إضافة يدوية أو رصيد افتتاحي مسجلة في السجلات.</p>;
                                                }

                                                return manualLogs.map(log => (
                                                    <div key={log.id} className="p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-2xl border border-purple-200/60 dark:border-purple-800/40 flex items-center justify-between text-xs">
                                                        <div>
                                                            <span className="font-black text-purple-700 dark:text-purple-300">{log.notes || 'رصيد افتتاحي / إضافة يدوية للمخزن'}</span>
                                                            <div className="text-[10px] text-slate-400 mt-0.5">{log.additionDate} • {log.userName || 'النظام'}</div>
                                                        </div>
                                                        <div className="text-left font-mono font-black text-purple-700 dark:text-purple-400">
                                                            +{log.quantityAdded} كارت
                                                        </div>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-between items-center">
                                <span className="text-[11px] font-bold text-slate-400">
                                    نظام تدقيق فواتير الكروت والمخزون
                                </span>
                                <button
                                    onClick={() => setSelectedCategoryForModal(null)}
                                    className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl shadow-xs transition"
                                >
                                    إغلاق
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
            {/* MODAL: Inventory Reconciliation & Stock Adjustment with Notes */}
            {reconcileModalCat && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 dir-rtl" dir="rtl">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 animate-in zoom-in-95 duration-150">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black shrink-0">
                                    <Wrench size={20} />
                                </div>
                                <div>
                                    <h3 className="font-black text-slate-900 dark:text-white text-base">
                                        تصحيح ومطابقة الجرد: {reconcileModalCat.name}
                                    </h3>
                                    <p className="text-xs text-slate-400 font-bold">
                                        تحديث الرصيد المجود بالفعل مع تدوين ملاحظات الجرد والتقرير
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setReconcileModalCat(null)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveReconciliation} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs font-bold">
                                <div>
                                    <span className="text-slate-400 block text-[10px]">الرصيد بالمخزن حالياً:</span>
                                    <span className="text-slate-900 dark:text-white font-mono font-black text-sm">
                                        {reconcileModalCat.availableCount || 0} كارت
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block text-[10px]">سعر الكارت:</span>
                                    <span className="text-violet-600 font-mono font-black text-xs">
                                        {reconcileModalCat.retailPrice || 0} ريال
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                                    الجرد الفعلي الحالي للمخزن (عدد الكروت الحقيقي بالمستودع):
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    required
                                    value={reconcileActualInput}
                                    onChange={(e) => setReconcileActualInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-sm font-mono font-black text-slate-900 dark:text-white outline-none focus:border-amber-600 text-center"
                                    placeholder="أدخل عدد الكروت الفعلي المتبقي..."
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                                    ملاحظات الجرد والتسوية (تسجل في التقرير):
                                </label>
                                <textarea
                                    rows={3}
                                    required
                                    value={reconcileNotesInput}
                                    onChange={(e) => setReconcileNotesInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-amber-600"
                                    placeholder="أكتب سبب الفارق أو تفاصيل الجرد العملي..."
                                />
                            </div>

                            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setReconcileModalCat(null)}
                                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={reconcilingCatId === reconcileModalCat.id}
                                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-md shadow-amber-600/20 flex items-center gap-2 transition active:scale-95 disabled:opacity-50"
                                >
                                    <CheckCircle2 size={16} />
                                    <span>حفظ وتصحيح رصيد المخزن</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
