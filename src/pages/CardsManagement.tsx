import React, { useState, useEffect, useMemo } from 'react';
import { 
    Layers, Plus, Users, ArrowRight, Trash2, Edit, CreditCard, 
    FileText, Calendar, DollarSign, Receipt, Printer, CheckCircle2, 
    X, Sparkles, TrendingUp, Wallet, ArrowUpRight, ArrowDownLeft, Search, UserCheck,
    Share2, MessageSquare, Send, Truck, ChevronDown, ChevronUp, ShoppingBag, RefreshCw,
    Scale, Eye, Filter, BarChart3, RotateCcw
} from 'lucide-react';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc as firestoreAddDoc, updateDoc as firestoreUpdateDoc, deleteDoc as firestoreDeleteDoc, runTransaction , getDocs, writeBatch, increment } from 'firebase/firestore';

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
import { useUIStore } from '../store/uiStore';
import { CardCategory, CardDistributor, CardStockLog, CardSale, CardVoucher, CardCashboxEntry, CardSupplier, CardPurchase, CardPurchaseVoucher } from '../types/cardTypes';
import { printReport, printInvoice } from '../lib/printHelper';
import CardSaleModal from '../components/CardSaleModal';
import CardPurchaseModal from '../components/CardPurchaseModal';
import CardExchangeModal from '../components/CardExchangeModal';
import SearchableSelect from '../components/SearchableSelect';
import { CardInvoiceActionModal } from '../components/CardInvoiceActionModal';
import { InvoicePdfInput } from '../lib/pdfHelper';
import { CardSalesSection } from '../components/CardSalesSection';
import { CardPurchasesSection } from '../components/CardPurchasesSection';
import { CardReturnsSection } from '../components/CardReturnsSection';
import { CardCashboxSection } from '../components/CardCashboxSection';
import { CardReconciliationSection } from '../components/CardReconciliationSection';
import { CardStockLogsSection } from '../components/CardStockLogsSection';



export default function CardsManagement() {
    const { appUser, hasPermission } = useAuthStore();
    const { registerModal, unregisterModal } = useUIStore();

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
        if (secId === 'card_sales_section') return 'cards_sales_report';
        if (secId === 'card_purchases_section') return 'cards_stock';
        if (secId === 'sales_cashbox') return 'cards_cashbox';
        if (secId === 'vouchers') return 'cards_vouchers';
        if (secId === 'reconciliation') return 'cards_sales_report';
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
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title?: string;
        message: string;
        onConfirm: () => void;
        onCancel: () => void;
    } | null>(null);
    const [suppliers, setSuppliers] = useState<CardSupplier[]>([]);
    const [purchases, setPurchases] = useState<CardPurchase[]>([]);
    const [purchaseVouchers, setPurchaseVouchers] = useState<CardPurchaseVoucher[]>([]);
    const [purchaseSubSection, setPurchaseSubSection] = useState<string | null>(null);
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [supplierName, setSupplierName] = useState('');
    const [supplierPhone, setSupplierPhone] = useState('');
    const [supplierPreviousDebt, setSupplierPreviousDebt] = useState('');
    const [editingSupplier, setEditingSupplier] = useState<CardSupplier | null>(null);
    const [selectedSupplierForDetails, setSelectedSupplierForDetails] = useState<CardSupplier | null>(null);
    const [ledgerStartDate, setLedgerStartDate] = useState('');
    const [ledgerEndDate, setLedgerEndDate] = useState('');
    const [supplierDebtLimit, setSupplierDebtLimit] = useState<number>(1000);
    const [supplierDebtLimitInput, setSupplierDebtLimitInput] = useState('1000');
    const [purchaseInvoiceSearch, setPurchaseInvoiceSearch] = useState('');
    const [purchaseInvoiceDateFilter, setPurchaseInvoiceDateFilter] = useState('');
    
    // Purchase Invoice States
    const [purchaseIsReturn, setPurchaseIsReturn] = useState(false);
    const [purchaseCategoryId, setPurchaseCategoryId] = useState('');
    const [purchaseQuantity, setPurchaseQuantity] = useState('');
    const [purchaseCostPrice, setPurchaseCostPrice] = useState('');
    const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
    const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<'credit' | 'cash'>('credit');
    
    // Purchase Voucher States
    const [isPurchaseVoucherModalOpen, setIsPurchaseVoucherModalOpen] = useState(false);
    const [purchaseVoucherType, setPurchaseVoucherType] = useState<'receipt' | 'payment'>('payment');
    const [purchaseVoucherSupplierId, setPurchaseVoucherSupplierId] = useState('');
    const [purchaseVoucherAmountInput, setPurchaseVoucherAmountInput] = useState('');
    const [purchaseVoucherNotesInput, setPurchaseVoucherNotesInput] = useState('');

    const [distributors, setDistributors] = useState<CardDistributor[]>([]);
    const [stockLogs, setStockLogs] = useState<CardStockLog[]>([]);
    const [sales, setSales] = useState<CardSale[]>([]);
    const [vouchers, setVouchers] = useState<CardVoucher[]>([]);
    const [cashboxEntries, setCashboxEntries] = useState<CardCashboxEntry[]>([]);

    // Sale Modal Trigger
    const [saleModalCategory, setSaleModalCategory] = useState<string | null>(null);

    const [isCardSaleModalOpen, setIsCardSaleModalOpen] = useState(false);
    const [editingCardSale, setEditingCardSale] = useState<any>(null);
    const [editingCardPurchase, setEditingCardPurchase] = useState<any>(null);


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
    const [distributorSubSection, setDistributorSubSection] = useState<'accounts' | 'list' | 'add' | 'sales' | null>(null);
    const [saleDistributorId, setSaleDistributorId] = useState('');
    const [saleCategoryId, setSaleCategoryId] = useState('');
    const [saleQuantity, setSaleQuantity] = useState('');
    const [saleIsReturn, setSaleIsReturn] = useState(false);
    const [salePaymentMethod, setSalePaymentMethod] = useState<'credit' | 'cash'>('credit');
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
    const [isCardPurchaseModalOpen, setIsCardPurchaseModalOpen] = useState(false);
    const [purchaseModalIsReturnOnly, setPurchaseModalIsReturnOnly] = useState(false);
    const [isCardExchangeModalOpen, setIsCardExchangeModalOpen] = useState(false);
    const [voucherType, setVoucherType] = useState<'receipt' | 'payment'>('receipt');
    const [voucherDistributorId, setVoucherDistributorId] = useState('');
    const [voucherAmountInput, setVoucherAmountInput] = useState('');
    const [voucherNotesInput, setVoucherNotesInput] = useState('');

    const [isCashboxModalOpen, setIsCashboxModalOpen] = useState(false);
    const [cashboxIsIncome, setCashboxIsIncome] = useState(true);
    const [cashboxTitleInput, setCashboxTitleInput] = useState('');
    const [cashboxAmountInput, setCashboxAmountInput] = useState('');

    // State for newly saved cards invoice action (print/share) modal
    const [actionModalOpen, setActionModalOpen] = useState(false);
    const [actionModalInvoice, setActionModalInvoice] = useState<InvoicePdfInput | null>(null);

    // Sellers state variables
    const [sellersActiveTab, setSellersActiveTab] = useState<'by_seller' | 'by_day'>('by_seller');
    const [expandedDays, setExpandedDays] = useState<string[]>([]);
    const [sellersSearchQuery, setSellersSearchQuery] = useState('');

    // Register active modals in UI Store to prevent interference
    useEffect(() => {
        const activeCount = [
            isCategoryModalOpen,
            isStockModalOpen,
            isSupplierModalOpen,
            isPurchaseVoucherModalOpen,
            isDistributorModalOpen,
            isVoucherModalOpen,
            isCardPurchaseModalOpen,
            isCardExchangeModalOpen,
            isCashboxModalOpen,
            actionModalOpen,
            isShareModalOpen,
            saleModalCategory !== null
        ].filter(Boolean).length;

        if (activeCount > 0) {
            registerModal('cards-mgmt-active');
        } else {
            unregisterModal('cards-mgmt-active');
        }
        return () => unregisterModal('cards-mgmt-active');
    }, [
        isCategoryModalOpen, isStockModalOpen, isSupplierModalOpen, isPurchaseVoucherModalOpen,
        isDistributorModalOpen, isVoucherModalOpen, isCardPurchaseModalOpen, isCardExchangeModalOpen, isCashboxModalOpen,
        actionModalOpen, isShareModalOpen, saleModalCategory, registerModal, unregisterModal
    ]);

    
    const getNumericInvoiceNumber = (invStr: string | undefined, id: string): string => {
        if (!invStr) {
            const digits = id.replace(/\D/g, '');
            return digits ? digits.slice(-5) : '1001';
        }
        const digits = invStr.replace(/\D/g, '');
        return digits || '1001';
    };

    const reverseCardInvoice = async (
        target: any,
        type: 'sale' | 'purchase',
        silent: boolean = false
    ) => {
        try {
            const collectionName = type === 'sale' ? 'card_sales' : 'card_purchases';
            
            // Extract possible identifiers from target
            let targetInvNum = '';
            let targetRawInvNum = '';
            let targetDocIds: string[] = [];
            
            if (typeof target === 'string') {
                targetInvNum = target.trim();
            } else if (target && typeof target === 'object') {
                targetInvNum = target.invoiceNumber ? String(target.invoiceNumber).trim() : '';
                targetRawInvNum = target.rawInvoiceNumber ? String(target.rawInvoiceNumber).trim() : '';
                if (Array.isArray(target.docIds) && target.docIds.length > 0) {
                    targetDocIds = target.docIds.filter(Boolean);
                } else if (target.id) {
                    targetDocIds = [target.id];
                }
            }

            // Step 1: Collect candidate documents from Firestore and in-memory state
            const docsToCancel: Array<{ id: string; ref: any; data: () => any }> = [];
            const processedDocIds = new Set<string>();

            // 1a. If specific docIds are known, fetch directly
            for (const docId of targetDocIds) {
                if (processedDocIds.has(docId)) continue;
                try {
                    const docSnap = await getDoc(doc(db, collectionName, docId));
                    if (docSnap.exists() && docSnap.data().status !== 'cancelled') {
                        docsToCancel.push(docSnap);
                        processedDocIds.add(docId);
                    }
                } catch (e) {
                    console.warn(`Could not fetch doc by ID ${docId}:`, e);
                }
            }

            // 1b. If we have an invoice number, query Firestore
            if (targetInvNum || targetRawInvNum) {
                const searchNums = Array.from(new Set([targetInvNum, targetRawInvNum].filter(Boolean)));
                for (const num of searchNums) {
                    try {
                        const q1 = query(
                            collection(db, collectionName),
                            where('tenantId', '==', tenantId),
                            where('invoiceNumber', '==', num)
                        );
                        const snap1 = await getDocs(q1);
                        snap1.docs.forEach(d => {
                            if (d.data().status !== 'cancelled' && !processedDocIds.has(d.id)) {
                                docsToCancel.push(d);
                                processedDocIds.add(d.id);
                            }
                        });
                    } catch (e) {
                        console.warn('Error querying by invoiceNumber:', e);
                    }
                }

                // 1c. Search in-memory state
                if (docsToCancel.length === 0) {
                    const candidatePool = type === 'sale' ? sales : purchases;
                    const cleanSearchNum = targetInvNum.replace(/\D/g, '');
                    
                    const matchingCandidates = candidatePool.filter(item => {
                        if (item.status === 'cancelled') return false;
                        const itemInv = item.invoiceNumber || '';
                        const itemClean = itemInv.replace(/\D/g, '');
                        const shortId = item.id.slice(-6).toUpperCase();
                        const numericFromId = getNumericInvoiceNumber(itemInv, item.id);
                        
                        return (
                            item.id === targetInvNum ||
                            itemInv === targetInvNum ||
                            itemInv === targetRawInvNum ||
                            (cleanSearchNum && itemClean === cleanSearchNum) ||
                            (cleanSearchNum && numericFromId === cleanSearchNum) ||
                            shortId === targetInvNum.toUpperCase()
                        );
                    });

                    for (const cand of matchingCandidates) {
                        if (!processedDocIds.has(cand.id)) {
                            const dRef = doc(db, collectionName, cand.id);
                            docsToCancel.push({
                                id: cand.id,
                                ref: dRef,
                                data: () => cand
                            });
                            processedDocIds.add(cand.id);
                        }
                    }
                }

                // 1d. Fallback: query all active tenant documents from Firestore
                if (docsToCancel.length === 0) {
                    try {
                        const fallbackQ = query(collection(db, collectionName), where('tenantId', '==', tenantId));
                        const allSnap = await getDocs(fallbackQ);
                        const cleanSearchNum = targetInvNum.replace(/\D/g, '');
                        
                        allSnap.docs.forEach(d => {
                            const data = d.data();
                            if (data.status === 'cancelled' || processedDocIds.has(d.id)) return;
                            const itemInv = data.invoiceNumber || '';
                            const itemClean = itemInv.replace(/\D/g, '');
                            const shortId = d.id.slice(-6).toUpperCase();
                            const numericFromId = getNumericInvoiceNumber(itemInv, d.id);
                            
                            if (
                                d.id === targetInvNum ||
                                itemInv === targetInvNum ||
                                itemInv === targetRawInvNum ||
                                (cleanSearchNum && itemClean === cleanSearchNum) ||
                                (cleanSearchNum && numericFromId === cleanSearchNum) ||
                                shortId === targetInvNum.toUpperCase()
                            ) {
                                docsToCancel.push(d);
                                processedDocIds.add(d.id);
                            }
                        });
                    } catch (e) {
                        console.warn('Error in fallback query:', e);
                    }
                }
            }

            if (docsToCancel.length === 0) {
                if (!silent) alert('لم يتم العثور على الفاتورة (ID: ' + targetDocIds.join(', ') + ') أو أنها ملغاة بالفعل.');
                return false;
            }

            const foundIds = docsToCancel.map(d => typeof d.data === 'function' ? d.id : d.id);
            console.log(`[reverseCardInvoice] Found ${docsToCancel.length} docs to cancel:`, foundIds);

            // Alert for debugging
            if (!silent && appUser?.role === 'admin') {
                alert(`جار الإلغاء... تم العثور على ${docsToCancel.length} مستندات: \n${foundIds.join('\n')}`);
            }

            const batch = writeBatch(db);
            const categoryUpdates: Record<string, number> = {};
            const partyUpdates: Record<string, number> = {};
            let cashboxEntriesToAdd: Array<{ type: string; amount: number; isIncome: boolean; title: string }> = [];
            let displayInvNum = targetInvNum || targetRawInvNum || '';

            // Process every item in the invoice
            for (const d of docsToCancel) {
                const docData = typeof d.data === 'function' ? d.data() : d.data;
                if (!displayInvNum && docData.invoiceNumber) {
                    displayInvNum = docData.invoiceNumber;
                }
                
                // Mark document as cancelled
                batch.set(d.ref, {
                    status: 'cancelled',
                    cancelledAt: Date.now(),
                    cancelledBy: appUser?.name || 'النظام'
                }, { merge: true });

                // 1. Calculate stock restoration
                // docData.quantity is positive for normal, negative for returns in Sales/Purchases
                const rawQty = docData.quantity || 0;
                let qtyChange = 0;
                
                if (type === 'sale') {
                    // Sale: qty=10 (subtracted 10). Cancel should add 10.
                    // Return Sale: qty=-10 (added 10). Cancel should subtract 10.
                    // So qtyChange = rawQty
                    qtyChange = rawQty;
                } else {
                    // Purchase: qty=10 (added 10). Cancel should subtract 10.
                    // Return Purchase: qty=-10 (subtracted 10). Cancel should add 10.
                    // So qtyChange = -rawQty
                    qtyChange = -rawQty;
                }

                if (qtyChange !== 0) {
                    let catId = docData.categoryId;
                    if (!catId && docData.categoryName) {
                        const matchedCat = categories.find(c =>
                            c.name.trim().toLowerCase() === docData.categoryName.trim().toLowerCase() ||
                            (c.linkedSection && c.linkedSection.trim().toLowerCase() === docData.categoryName.trim().toLowerCase())
                        );
                        if (matchedCat) catId = matchedCat.id;
                    }
                    if (catId) {
                        categoryUpdates[catId] = (categoryUpdates[catId] || 0) + qtyChange;
                    }
                }

                // 2. Calculate party debt/balance and cashbox adjustment
                const rawTotal = docData.netTotal || docData.totalAmount || 0;
                const absTotal = Math.abs(rawTotal);

                if (docData.paymentType === 'cash') {
                    if (absTotal > 0) {
                        if (type === 'sale') {
                            // Sale: rawTotal=100 (Income). Cancel needs Expense 100.
                            // Return Sale: rawTotal=-100 (Expense). Cancel needs Income 100.
                            const isReversalIncome = rawTotal < 0;
                            cashboxEntriesToAdd.push({
                                type: isReversalIncome ? 'manual_in' : 'manual_out',
                                amount: absTotal,
                                isIncome: isReversalIncome,
                                title: `إلغاء فاتورة مبيعات #${displayInvNum || docData.invoiceNumber || '---'} (${isReversalIncome ? 'إرجاع مرتجع' : 'عكس بيع'})`
                            });
                        } else {
                            // Purchase: rawTotal=100 (Expense). Cancel needs Income 100.
                            // Return Purchase: rawTotal=-100 (Income). Cancel needs Expense 100.
                            const isReversalIncome = rawTotal > 0;
                            cashboxEntriesToAdd.push({
                                type: isReversalIncome ? 'manual_in' : 'manual_out',
                                amount: absTotal,
                                isIncome: isReversalIncome,
                                title: `إلغاء فاتورة مشتريات #${displayInvNum || docData.invoiceNumber || '---'} (${isReversalIncome ? 'عكس شراء' : 'إرجاع مرتجع'})`
                            });
                        }
                    }
                } else if (docData.paymentType === 'credit') {
                    const partyId = type === 'sale' ? docData.distributorId : docData.supplierId;
                    if (partyId && partyId !== 'walkin' && partyId !== 'cash') {
                        // For both: Cancellation reverses the sign of the original transaction.
                        // Normal Sale: rawTotal=100 (Debt increased). Cancellation needs -100 (Debt decreased).
                        // Return Sale: rawTotal=-100 (Debt decreased). Cancellation needs +100 (Debt increased).
                        // Normal Purchase: rawTotal=100 (Debt increased). Cancellation needs -100 (Debt decreased).
                        // Return Purchase: rawTotal=-100 (Debt decreased). Cancellation needs +100 (Debt increased).
                        partyUpdates[partyId] = (partyUpdates[partyId] || 0) - rawTotal;
                    }
                }
            }

            // A. Restore category stock in batch and record stock log
            for (const catId of Object.keys(categoryUpdates)) {
                if (categoryUpdates[catId] !== 0) {
                    batch.set(doc(db, 'card_categories', catId), {
                        availableCount: increment(categoryUpdates[catId])
                    }, { merge: true });

                    const matchedCat = categories.find(c => c.id === catId);
                    const catName = matchedCat ? matchedCat.name : 'فئة كروت';
                    const currentCount = matchedCat ? (matchedCat.availableCount || 0) : 0;

                    const stockLogRef = doc(collection(db, 'card_stock_logs'));
                    batch.set(stockLogRef, {
                        tenantId,
                        categoryId: catId,
                        categoryName: catName,
                        quantityAdded: categoryUpdates[catId],
                        userName: appUser?.name || 'النظام',
                        additionDate: new Date().toISOString().replace('T', ' ').slice(0, 19),
                        availableCountAfter: currentCount + categoryUpdates[catId],
                        notes: `إلغاء فاتورة ${type === 'sale' ? 'مبيعات' : 'مشتريات'} رقم #${displayInvNum || '---'}`,
                        createdAt: Date.now()
                    });
                }
            }

            // B. Adjust distributor / supplier balances in batch
            const partyCollection = type === 'sale' ? 'card_distributors' : 'card_suppliers';
            for (const partyId of Object.keys(partyUpdates)) {
                if (partyUpdates[partyId] !== 0) {
                    batch.set(doc(db, partyCollection, partyId), {
                        balance: increment(partyUpdates[partyId])
                    }, { merge: true });
                }
            }

            // C. Add cashbox reversal entries
            for (const entry of cashboxEntriesToAdd) {
                const cashboxRef = doc(collection(db, 'card_cashbox'));
                batch.set(cashboxRef, {
                    tenantId,
                    type: entry.type,
                    title: entry.title,
                    amount: entry.amount,
                    isIncome: entry.isIncome,
                    date: new Date().toISOString().split('T')[0],
                    dateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
                    userName: appUser?.name || 'النظام',
                    createdAt: Date.now()
                });
            }

            console.log(`[reverseCardInvoice] Committing batch...`);
            await batch.commit();
            console.log(`[reverseCardInvoice] Batch committed successfully!`);
            
            if (!silent) alert('تم إلغاء الفاتورة واسترجاع المخزون وتسوية الحسابات بنجاح.');
            return true;
        } catch (error) {
            console.error('Error reversing card invoice:', error);
            if (!silent) alert('حدث خطأ أثناء إلغاء الفاتورة: ' + (error instanceof Error ? error.message : String(error)));
            return false;
        }
    };

    const handleCancelSaleInvoice = async (invoice: any) => {
        try {
            const canDeleteSale = appUser?.role === 'admin' || getSecPermission('cards_sales_report', 'delete') || getSecPermission('cards', 'delete');
            if (!canDeleteSale) {
                alert('عذراً، ليس لديك صلاحية إلغاء فواتير مبيعات الكروت.');
                return;
            }
            const invDisplay = invoice.invoiceNumber || invoice.rawInvoiceNumber || invoice.id;
            
            setConfirmDialog({
                isOpen: true,
                title: 'تأكيد إلغاء الفاتورة',
                message: `هل أنت متأكد من إلغاء فاتورة المبيعات رقم #${invDisplay}؟\nسيتم استرجاع الكروت للمخزون وخصم المبلغ من الموزع/الصندوق.`,
                onCancel: () => setConfirmDialog(null),
                onConfirm: async () => {
                    setConfirmDialog(null);
                    try {
                        const success = await reverseCardInvoice(invoice, 'sale', true);
                        if (!success) {
                            console.warn('reverseCardInvoice returned false for sale');
                        } else {
                            if (appUser?.role === 'admin') alert('تم الإلغاء بنجاح.');
                        }
                    } catch (err: any) {
                        alert('حدث خطأ غير متوقع أثناء الإلغاء: ' + err.message);
                    }
                }
            });
        } catch (err: any) {
            alert('حدث خطأ غير متوقع: ' + err.message);
        }
    };

    const handleCancelPurchaseInvoice = async (invoice: any) => {
        try {
            const canDeletePurchase = appUser?.role === 'admin' || getSecPermission('cards_stock', 'delete') || getSecPermission('cards', 'delete');
            if (!canDeletePurchase) {
                alert('عذراً، ليس لديك صلاحية إلغاء فواتير مشتريات الكروت.');
                return;
            }
            const invDisplay = invoice.invoiceNumber || invoice.rawInvoiceNumber || invoice.id;
            
            setConfirmDialog({
                isOpen: true,
                title: 'تأكيد إلغاء فاتورة المشتريات',
                message: `هل أنت متأكد من إلغاء فاتورة المشتريات رقم #${invDisplay}؟\nسيتم خصم الكروت من المخزون وخصم المبلغ من المورد/الصندوق.`,
                onCancel: () => setConfirmDialog(null),
                onConfirm: async () => {
                    setConfirmDialog(null);
                    try {
                        const success = await reverseCardInvoice(invoice, 'purchase', true);
                        if (!success) {
                            console.warn('reverseCardInvoice returned false for purchase');
                        } else {
                            if (appUser?.role === 'admin') alert('تم الإلغاء بنجاح.');
                        }
                    } catch (err: any) {
                        alert('حدث خطأ غير متوقع أثناء الإلغاء: ' + err.message);
                    }
                }
            });
        } catch (err: any) {
            alert('حدث خطأ غير متوقع: ' + err.message);
        }
    };

    const handleEditSaleInvoice = async (invoice: any) => {
        const canEditSale = appUser?.role === 'admin' || getSecPermission('cards_sales_report', 'edit') || getSecPermission('cards', 'edit');
        if (!canEditSale) {
            alert('عذراً، ليس لديك صلاحية تعديل فواتير مبيعات الكروت.');
            return;
        }
        setEditingCardSale(invoice);
        setIsCardSaleModalOpen(true);
    };

    const handleEditPurchaseInvoice = async (invoice: any) => {
        const canEditPurchase = appUser?.role === 'admin' || getSecPermission('cards_stock', 'edit') || getSecPermission('cards', 'edit');
        if (!canEditPurchase) {
            alert('عذراً، ليس لديك صلاحية تعديل فواتير مشتريات الكروت.');
            return;
        }
        setEditingCardPurchase(invoice);
        setIsCardPurchaseModalOpen(true);
    };

    // Function to handle sharing distributor details and account ledger
    const handleShareClick = (
        dist: CardDistributor | CardSupplier,
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
            `رصيد أول المدة (الدين السابق): ${(dist.previousDebt || 0).toFixed(2)} ريال يمني\n` +
            `إجمالي مبيعات آجلة: ${creditSales.toFixed(2)} ريال يمني\n` +
            `إجمالي مبيعات نقدية: ${cashSales.toFixed(2)} ريال يمني\n` +
            `إجمالي المقبوضات: ${receipts.toFixed(2)} ريال يمني\n` +
            `-----------------------------------\n` +
            `*الرصيد المستحق الحالي:* *${currentBalance.toFixed(2)} ريال يمني*\n\n` +
            `شكراً لتعاملكم معنا.`;

        const smsText = `كشف حساب الموزع: ${dist.name}\n` +
            `رصيد البداية: ${(dist.previousDebt || 0).toFixed(2)} ريال يمني\n` +
            `مبيعات آجلة: ${creditSales.toFixed(2)} ريال يمني\n` +
            `مقبوضات: ${receipts.toFixed(2)} ريال يمني\n` +
            `الرصيد المستحق الحالي: ${currentBalance.toFixed(2)} ريال يمني`;

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
    const [selectedPurchaseMonth, setSelectedPurchaseMonth] = useState(currentMonthDefault);

    // Monthly Report View & Navigation States
    const [monthlySalesTab, setMonthlySalesTab] = useState<'categories' | 'invoices' | 'distributors'>('categories');
    const [monthlyPurchasesTab, setMonthlyPurchasesTab] = useState<'categories' | 'invoices' | 'suppliers'>('categories');
    const [monthlySalesSearch, setMonthlySalesSearch] = useState('');
    const [monthlyPurchasesSearch, setMonthlyPurchasesSearch] = useState('');
    const [expandedMonthlySalesInvoices, setExpandedMonthlySalesInvoices] = useState<Record<string, boolean>>({});
    const [expandedMonthlyPurchaseInvoices, setExpandedMonthlyPurchaseInvoices] = useState<Record<string, boolean>>({});

    // Firebase Subscriptions
    useEffect(() => {
        const qCat = query(collection(db, 'card_categories'), where('tenantId', '==', tenantId));
        const unsubCat = onSnapshot(qCat, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardCategory));
            setCategories(list);
        });

        const qSupp = query(collection(db, 'card_suppliers'), where('tenantId', '==', tenantId));
        const unsubSupp = onSnapshot(qSupp, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardSupplier));
            setSuppliers(list);
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

        const qPurchases = query(collection(db, 'card_purchases'), where('tenantId', '==', tenantId));
        const unsubPurchases = onSnapshot(qPurchases, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardPurchase));
            list.sort((a, b) => (b.dateTime || '').localeCompare(a.dateTime || ''));
            setPurchases(list);
        });

        const qPVouch = query(collection(db, 'card_purchase_vouchers'), where('tenantId', '==', tenantId));
        const unsubPVouch = onSnapshot(qPVouch, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardPurchaseVoucher));
            list.sort((a, b) => (b.dateTime || '').localeCompare(a.dateTime || ''));
            setPurchaseVouchers(list);
        });

        return () => {
            unsubCat();
            unsubSupp();
            unsubDist();
            unsubLogs();
            unsubSales();
            unsubVouch();
            unsubCash();
            unsubPurchases();
            unsubPVouch();
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
            if (activeSection === 'purchases' && selectedSupplierForDetails !== null) {
                setSelectedSupplierForDetails(null);
                return true;
            }
            if (activeSection === 'purchases' && purchaseSubSection !== null) {
                setPurchaseSubSection(null);
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
    }, [activeSection, distributorSubSection, selectedDistributorForDetails, purchaseSubSection, selectedSupplierForDetails]);

    // Prefill purchase cost price when category is selected in purchase form
    useEffect(() => {
        if (purchaseCategoryId) {
            const cat = categories.find(c => c.id === purchaseCategoryId);
            if (cat) {
                setPurchaseCostPrice(cat.wholesalePrice ? cat.wholesalePrice.toString() : '');
            }
        }
    }, [purchaseCategoryId, categories]);

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


    const handleSaveSaleInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!saleDistributorId || !saleCategoryId) {
            alert('يرجى اختيار الموزع والفئة');
            return;
        }
        const qty = parseInt(saleQuantity) || 0;
        if (qty <= 0) {
            alert('يرجى إدخال كمية صحيحة');
            return;
        }

        const cat = categories.find(c => c.id === saleCategoryId);
        const dist = distributors.find(d => d.id === saleDistributorId);
        if (!cat || !dist) return;

        if (!saleIsReturn && cat.availableCount < qty) {
            alert(`الكمية المطلوبة غير متوفرة. المتاح: ${cat.availableCount}`);
            return;
        }

        const unitPrice = cat.wholesalePrice || 0;
        const netTotal = unitPrice * qty; // Wholesale price is already discounted
        const isCash = salePaymentMethod === 'cash';

        // Balance & cash checks for instant feedback
        if (saleIsReturn && isCash && cashboxBalance < netTotal) {
            alert(`تنبيه فوري: رصيد الصندوق (${cashboxBalance.toFixed(2)} ريال يمني) لا يكفي لإتمام عملية المرتجع النقدي بقيمة ${netTotal.toFixed(2)} ريال يمني!`);
            return;
        }

        if (salePaymentMethod === 'credit' && dist) {
            const currentDebt = dist.balance || 0;
            if (currentDebt < 0) {
                const availablePrepaid = Math.abs(currentDebt);
                if (netTotal > availablePrepaid) {
                    const confirmProceed = window.confirm(`تنبيه فوري: رصيد الصندوق للموزع لا يكفي للعملية!\nالمبلغ المتاح كدفعة مقدمة: ${availablePrepaid.toFixed(2)} ريال.\nقيمة الفاتورة الحالية: ${netTotal.toFixed(2)} ريال.\nهل ترغب بالاستمرار بالعملية وتحويل المتبقي كدين؟`);
                    if (!confirmProceed) return;
                }
            } else if (currentDebt > 5000) {
                const confirmProceed = window.confirm(`تنبيه فوري: رصيد مديونية الموزع مرتفع جداً حالياً (${currentDebt.toFixed(2)} ريال)!\nهل ترغب بالاستمرار في إتمام العملية بالآجل؟`);
                if (!confirmProceed) return;
            }
        }

        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            const saleRef = doc(collection(db, 'card_sales'));

            await runTransaction(db, async (transaction) => {
                // Reads
                const catRef = doc(db, 'card_categories', cat.id);
                const distRef = doc(db, 'card_distributors', dist.id);

                const catSnap = await transaction.get(catRef);
                const distSnap = await transaction.get(distRef);

                if (!catSnap.exists() || !distSnap.exists()) {
                    throw new Error('الفئة المطلوبة أو الموزع غير موجود في قاعدة البيانات!');
                }

                const currentAvailableCount = catSnap.data().availableCount || 0;
                const currentBalance = distSnap.data().balance || 0;

                if (!saleIsReturn && currentAvailableCount < qty) {
                    throw new Error(`الكمية المطلوبة غير متوفرة. المتاح: ${currentAvailableCount}`);
                }

                // Writes
                transaction.set(saleRef, {
                    tenantId,
                    invoiceNumber: saleRef.id.slice(-6).toUpperCase(),
                    categoryId: cat.id,
                    categoryName: catSnap.data().name,
                    quantity: saleIsReturn ? -qty : qty,
                    saleType: saleIsReturn ? 'distributor_return' : 'distributor',
                    isReturn: saleIsReturn,
                    paymentType: salePaymentMethod,
                    distributorId: dist.id,
                    distributorName: distSnap.data().name,
                    unitPrice,
                    commissionPercent: 0,
                    commissionAmount: 0,
                    totalAmount: saleIsReturn ? -netTotal : netTotal,
                    netTotal: saleIsReturn ? -netTotal : netTotal,
                    month: dateStr.substring(0, 7),
                    date: dateStr,
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: appUser?.name || appUser?.email || 'المدير',
                    status: 'completed',
                    notes: saleIsReturn ? `مرتجع مبيعات كروت للموزع (${distSnap.data().name})` : `مبيعات كروت للموزع (${distSnap.data().name})`,
                    createdAt: Date.now()
                });

                const newStock = saleIsReturn ? currentAvailableCount + qty : currentAvailableCount - qty;
                transaction.update(catRef, {
                    availableCount: newStock,
                    updatedAt: Date.now()
                });

                const stockLogRef = doc(collection(db, 'card_stock_logs'));
                transaction.set(stockLogRef, {
                    tenantId,
                    categoryId: cat.id,
                    categoryName: catSnap.data().name,
                    quantityAdded: saleIsReturn ? qty : -qty,
                    userName: appUser?.name || appUser?.email || 'المدير',
                    additionDate: `${dateStr} ${timeStr}`,
                    availableCountAfter: newStock,
                    notes: saleIsReturn ? `مرتجع مبيعات كروت للموزع (${distSnap.data().name})` : `مبيعات كروت للموزع (${distSnap.data().name})`,
                    createdAt: Date.now()
                });

                if (isCash) {
                    const cashboxRef = doc(collection(db, 'card_cashbox'));
                    transaction.set(cashboxRef, {
                        tenantId,
                        type: saleIsReturn ? 'distributor_return_cash' : 'distributor_sale_cash',
                        title: saleIsReturn 
                            ? `مرتجع مبيعات نقدي من الموزع: ${distSnap.data().name}`
                            : `مبيعات نقدية للموزع: ${distSnap.data().name}`,
                        amount: netTotal,
                        isIncome: !saleIsReturn,
                        referenceId: saleRef.id,
                        date: dateStr,
                        dateTime: `${dateStr} ${timeStr}`,
                        userName: appUser?.name || appUser?.email || 'المدير',
                        createdAt: Date.now()
                    });
                } else {
                    const newBalance = saleIsReturn ? currentBalance - netTotal : currentBalance + netTotal;
                    transaction.update(distRef, {
                        balance: newBalance,
                        updatedAt: Date.now()
                    });
                }
            });

            const invRef = saleRef.id.slice(-6).toUpperCase();
            setActionModalInvoice({
                id: saleRef.id,
                invoiceNumber: invRef,
                type: saleIsReturn ? 'sale_return' : 'sale',
                isReturn: saleIsReturn,
                categoryName: cat.name,
                quantity: saleIsReturn ? -qty : qty,
                unitPrice,
                totalAmount: netTotal,
                paymentType: salePaymentMethod,
                partyName: dist.name,
                dateTime: `${dateStr} ${timeStr}`,
                userName: appUser?.name || appUser?.email || 'المدير',
                items: [{
                    categoryName: cat.name,
                    quantity: qty,
                    unitPrice,
                    totalAmount: netTotal
                }]
            });
            setActionModalOpen(true);

            setSaleQuantity('');
            setSaleCategoryId('');
        } catch (error: any) {
            alert(error.message || 'حدث خطأ أثناء حفظ الفاتورة');
        }
    };


    // ----------------------------------------------------
    // Suppliers & Purchases Handlers
    // ----------------------------------------------------
    const handleSaveSupplier = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supplierName.trim()) {
            alert('يرجى إدخال اسم المورد');
            return;
        }

        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const pDebt = parseFloat(supplierPreviousDebt) || 0;
            
            if (editingSupplier) {
                // Update
                const diffDebt = pDebt - (editingSupplier.previousDebt || 0);
                await updateDoc(doc(db, 'card_suppliers', editingSupplier.id), {
                    name: supplierName.trim(),
                    phone: supplierPhone.trim(),
                    previousDebt: pDebt,
                    balance: editingSupplier.balance + diffDebt,
                    updatedAt: Date.now()
                });
                alert('تم تحديث المورد بنجاح');
            } else {
                // Create
                await addDoc(collection(db, 'card_suppliers'), {
                    tenantId,
                    name: supplierName.trim(),
                    phone: supplierPhone.trim(),
                    previousDebt: pDebt,
                    balance: pDebt,
                    date: dateStr,
                    createdAt: Date.now()
                });
                alert('تمت إضافة المورد بنجاح');
            }
            setIsSupplierModalOpen(false);
            setSupplierName('');
            setSupplierPhone('');
            setSupplierPreviousDebt('');
            setEditingSupplier(null);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'card_suppliers');
        }
    };

    const handleDeleteSupplier = async (id: string, name: string) => {
        if (!window.confirm(`هل أنت متأكد من حذف المورد "${name}"؟`)) return;
        try {
            await deleteDoc(doc(db, 'card_suppliers', id));
            alert('تم الحذف بنجاح');
        } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, 'card_suppliers');
        }
    };

    const handleSavePurchaseInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!purchaseSupplierId || !purchaseCategoryId) {
            alert('يرجى اختيار المورد والفئة');
            return;
        }
        const qty = parseInt(purchaseQuantity) || 0;
        if (qty <= 0) {
            alert('يرجى إدخال كمية صحيحة');
            return;
        }
        const unitCost = parseFloat(purchaseCostPrice) || 0;
        if (unitCost < 0) {
            alert('يرجى إدخال سعر تكلفة صحيح');
            return;
        }

        const cat = categories.find(c => c.id === purchaseCategoryId);
        const supp = suppliers.find(d => d.id === purchaseSupplierId);
        if (!cat || !supp) return;

        if (purchaseIsReturn && cat.availableCount < qty) {
            alert(`لا يمكن إرجاع كروت للمورد أكثر من المتوفر في المخزون. المتاح: ${cat.availableCount}`);
            return;
        }

        const totalAmount = unitCost * qty; 
        const isCash = purchasePaymentMethod === 'cash';

        // Balance & cash checks for instant feedback
        if (!purchaseIsReturn && isCash && cashboxBalance < totalAmount) {
            alert(`تنبيه فوري: رصيد الصندوق (${cashboxBalance.toFixed(2)} ريال يمني) لا يكفي لشراء الكروت نقداً بقيمة ${totalAmount.toFixed(2)} ريال يمني!`);
            return;
        }

        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            const purchaseRef = doc(collection(db, 'card_purchases'));

            await runTransaction(db, async (transaction) => {
                // Reads
                const catRef = doc(db, 'card_categories', cat.id);
                const suppRef = doc(db, 'card_suppliers', supp.id);

                const catSnap = await transaction.get(catRef);
                const suppSnap = await transaction.get(suppRef);

                if (!catSnap.exists() || !suppSnap.exists()) {
                    throw new Error('الفئة المطلوبة أو المورد غير موجود في قاعدة البيانات!');
                }

                const currentAvailableCount = catSnap.data().availableCount || 0;
                const currentBalance = suppSnap.data().balance || 0;

                if (purchaseIsReturn && currentAvailableCount < qty) {
                    throw new Error(`لا يمكن إرجاع كروت للمورد أكثر من المتوفر في المخزون. المتاح: ${currentAvailableCount}`);
                }

                // Writes
                const invRefId = purchaseRef.id.slice(-6).toUpperCase();
                transaction.set(purchaseRef, {
                    tenantId,
                    invoiceNumber: invRefId,
                    categoryId: cat.id,
                    categoryName: catSnap.data().name,
                    quantity: purchaseIsReturn ? -qty : qty,
                    purchaseType: purchaseIsReturn ? 'supplier_return' : 'supplier',
                    isReturn: purchaseIsReturn,
                    paymentType: purchasePaymentMethod,
                    supplierId: supp.id,
                    supplierName: suppSnap.data().name,
                    unitPrice: unitCost,
                    totalAmount: purchaseIsReturn ? -totalAmount : totalAmount,
                    month: dateStr.substring(0, 7),
                    date: dateStr,
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: appUser?.name || appUser?.email || 'المدير',
                    status: 'completed',
                    notes: purchaseIsReturn ? `مردودات مشتريات للمورد (${suppSnap.data().name})` : `فاتورة مشتريات من المورد (${suppSnap.data().name})`,
                    createdAt: Date.now()
                });

                const newStock = purchaseIsReturn ? currentAvailableCount - qty : currentAvailableCount + qty;
                transaction.update(catRef, {
                    availableCount: newStock,
                    updatedAt: Date.now()
                });

                const stockLogRef = doc(collection(db, 'card_stock_logs'));
                transaction.set(stockLogRef, {
                    tenantId,
                    categoryId: cat.id,
                    categoryName: catSnap.data().name,
                    quantityAdded: purchaseIsReturn ? -qty : qty,
                    userName: appUser?.name || appUser?.email || 'المدير',
                    additionDate: `${dateStr} ${timeStr}`,
                    availableCountAfter: newStock,
                    notes: purchaseIsReturn ? `مرتجع مشتريات #${invRefId}` : `فاتورة مشتريات #${invRefId}`,
                    createdAt: Date.now()
                });

                if (isCash) {
                    const cashboxRef = doc(collection(db, 'card_cashbox'));
                    transaction.set(cashboxRef, {
                        tenantId,
                        type: purchaseIsReturn ? 'supplier_return_cash' : 'supplier_purchase_cash',
                        title: purchaseIsReturn 
                            ? `مسترد نقدي من المورد: ${suppSnap.data().name} (مردودات مشتريات)`
                            : `مدفوع نقدي للمورد: ${suppSnap.data().name} (مشتريات)`,
                        amount: totalAmount,
                        isIncome: purchaseIsReturn,
                        referenceId: purchaseRef.id,
                        date: dateStr,
                        dateTime: `${dateStr} ${timeStr}`,
                        userName: appUser?.name || appUser?.email || 'المدير',
                        createdAt: Date.now()
                    });
                } else {
                    const newBalance = purchaseIsReturn ? currentBalance - totalAmount : currentBalance + totalAmount;
                    transaction.update(suppRef, {
                        balance: newBalance,
                        updatedAt: Date.now()
                    });
                }
            });

            const invRef = purchaseRef.id.slice(-6).toUpperCase();
            setActionModalInvoice({
                id: purchaseRef.id,
                invoiceNumber: invRef,
                type: purchaseIsReturn ? 'purchase_return' : 'purchase',
                isReturn: purchaseIsReturn,
                categoryName: cat.name,
                quantity: purchaseIsReturn ? -qty : qty,
                unitPrice: unitCost,
                totalAmount: totalAmount,
                paymentType: purchasePaymentMethod,
                partyName: supp.name,
                dateTime: `${dateStr} ${timeStr}`,
                userName: appUser?.name || appUser?.email || 'المدير',
                items: [{
                    categoryName: cat.name,
                    quantity: qty,
                    unitPrice: unitCost,
                    totalAmount: totalAmount
                }]
            });
            setActionModalOpen(true);

            setPurchaseQuantity('');
            setPurchaseCostPrice('');
            setPurchaseCategoryId('');
        } catch (error: any) {
            alert(error.message || 'حدث خطأ أثناء حفظ الفاتورة');
        }
    };

    const handleSaveQuickPurchaseReturn = async (data: {
        supplierId: string;
        categoryId: string;
        quantity: number;
        costPrice: number;
        paymentMethod: 'cash' | 'credit';
        notes: string;
    }) => {
        const { supplierId, categoryId, quantity, costPrice, paymentMethod, notes } = data;
        const cat = categories.find(c => c.id === categoryId);
        const supp = suppliers.find(s => s.id === supplierId);
        if (!cat || !supp) {
            throw new Error('الصنف أو المورد غير موجود');
        }
        const totalAmount = quantity * costPrice;
        const dateStr = new Date().toISOString().split('T')[0];
        const timeStr = new Date().toLocaleTimeString('ar-SA', { hour12: false });
        const isCash = paymentMethod === 'cash';

        const purchaseRef = doc(collection(db, 'card_purchases'));
        const catRef = doc(db, 'card_categories', cat.id);
        const suppRef = doc(db, 'card_suppliers', supp.id);

        await runTransaction(db, async (transaction) => {
            const catSnap = await transaction.get(catRef);
            const suppSnap = await transaction.get(suppRef);

            if (!catSnap.exists()) throw new Error('فئة الكروت غير موجودة');
            if (!suppSnap.exists()) throw new Error('المورد غير موجود');

            const currentAvailableCount = Number(catSnap.data().availableCount) || 0;
            const currentBalance = Number(suppSnap.data().balance) || 0;

            if (currentAvailableCount < quantity) {
                throw new Error(`الكمية المتاحة في المخزن (${currentAvailableCount}) أقل من الكمية المراد استرجاعها (${quantity})`);
            }

            const invRefId = purchaseRef.id.slice(-6).toUpperCase();
            transaction.set(purchaseRef, {
                tenantId,
                invoiceNumber: invRefId,
                categoryId: cat.id,
                categoryName: catSnap.data().name,
                quantity: -quantity,
                purchaseType: 'supplier_return',
                isReturn: true,
                paymentType: paymentMethod,
                supplierId: supp.id,
                supplierName: suppSnap.data().name,
                unitPrice: costPrice,
                totalAmount: -totalAmount,
                month: dateStr.substring(0, 7),
                date: dateStr,
                dateTime: `${dateStr} ${timeStr}`,
                userName: appUser?.name || appUser?.email || 'المدير',
                status: 'completed',
                notes: notes ? `مردودات مشتريات: ${notes}` : `مردودات مشتريات للمورد (${suppSnap.data().name})`,
                createdAt: Date.now()
            });

            const newStock = currentAvailableCount - quantity;
            transaction.update(catRef, {
                availableCount: newStock,
                updatedAt: Date.now()
            });

            const stockLogRef = doc(collection(db, 'card_stock_logs'));
            transaction.set(stockLogRef, {
                tenantId,
                categoryId: cat.id,
                categoryName: catSnap.data().name,
                quantityAdded: -quantity,
                userName: appUser?.name || appUser?.email || 'المدير',
                additionDate: `${dateStr} ${timeStr}`,
                availableCountAfter: newStock,
                notes: `مردودات مشتريات كروت للمورد (${suppSnap.data().name}) - فاتورة #${invRefId}`,
                createdAt: Date.now()
            });

            if (isCash) {
                const cashboxRef = doc(collection(db, 'card_cashbox'));
                transaction.set(cashboxRef, {
                    tenantId,
                    type: 'supplier_return_cash',
                    title: `مسترد نقدي من المورد: ${suppSnap.data().name} (مردودات مشتريات)`,
                    amount: totalAmount,
                    isIncome: true,
                    referenceId: purchaseRef.id,
                    date: dateStr,
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: appUser?.name || appUser?.email || 'المدير',
                    createdAt: Date.now()
                });
            } else {
                const newBalance = currentBalance - totalAmount;
                transaction.update(suppRef, {
                    balance: newBalance,
                    updatedAt: Date.now()
                });
            }
        });

        const invRef = purchaseRef.id.slice(-6).toUpperCase();
        setActionModalInvoice({
            id: purchaseRef.id,
            invoiceNumber: invRef,
            type: 'purchase_return',
            isReturn: true,
            categoryName: cat.name,
            quantity: -quantity,
            unitPrice: costPrice,
            totalAmount: totalAmount,
            paymentType: paymentMethod,
            partyName: supp.name,
            dateTime: `${dateStr} ${timeStr}`,
            userName: appUser?.name || appUser?.email || 'المدير',
            notes: notes || `مردودات مشتريات كروت للمورد: ${supp.name}`,
            items: [{
                categoryName: cat.name,
                quantity: quantity,
                unitPrice: costPrice,
                totalAmount: totalAmount
            }]
        });
        setActionModalOpen(true);
    };

    const handleSavePurchaseVoucher = async (e: React.FormEvent) => {
        e.preventDefault();
        const amount = parseFloat(purchaseVoucherAmountInput);
        if (!amount || amount <= 0 || !purchaseVoucherSupplierId) {
            alert('يرجى إدخال مبلغ صحيح واختيار مورد');
            return;
        }

        const supp = suppliers.find(d => d.id === purchaseVoucherSupplierId);
        if (!supp) return;

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const voucherNo = `V-SUPP-${Date.now().toString().slice(-6)}`;
        const staffName = appUser?.name || appUser?.email || 'المدير';

        try {
            await addDoc(collection(db, 'card_purchase_vouchers'), {
                tenantId,
                type: purchaseVoucherType,
                voucherNumber: voucherNo,
                supplierId: supp.id,
                supplierName: supp.name,
                amount,
                notes: purchaseVoucherNotesInput.trim(),
                date: dateStr,
                dateTime: `${dateStr} ${timeStr}`,
                userName: staffName,
                createdAt: Date.now()
            });

            // Update Supplier balance
            // If Payment (صرف للمورد) -> reduces our debt to them
            // If Receipt (قبض من المورد) -> increases our debt to them (they gave us money, or it's a refund that we keep as credit)
            // Wait, standard balance: Positive = we owe them.
            // Payment to them decreases what we owe.
            // Receipt from them increases what we owe (or offsets debt).
            const currentBalance = supp.balance || 0;
            const newBalance = purchaseVoucherType === 'payment' ? currentBalance - amount : currentBalance + amount;

            await updateDoc(doc(db, 'card_suppliers', supp.id), {
                balance: newBalance,
                updatedAt: Date.now()
            });

            // Update Cashbox
            // Payment = Expense from cashbox
            // Receipt = Income to cashbox
            await addDoc(collection(db, 'card_cashbox'), {
                tenantId,
                type: 'supplier_payment',
                title: purchaseVoucherType === 'payment' 
                    ? `سند صرف للمورد (سداد): ${supp.name} (${voucherNo})`
                    : `سند قبض من المورد (استرداد): ${supp.name} (${voucherNo})`,
                amount,
                isIncome: purchaseVoucherType === 'receipt',
                referenceId: voucherNo,
                date: dateStr,
                dateTime: `${dateStr} ${timeStr}`,
                userName: staffName,
                createdAt: Date.now()
            });

            setIsPurchaseVoucherModalOpen(false);
            setPurchaseVoucherSupplierId('');
            setPurchaseVoucherAmountInput('');
            setPurchaseVoucherNotesInput('');
            alert(`تم حفظ ${purchaseVoucherType === 'payment' ? 'سند الصرف' : 'سند القبض'} بنجاح وتحديث حساب المورد.`);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'card_purchase_vouchers');
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

    const handleDeleteCashboxEntry = async (entryId: string) => {
        if (!appUser || appUser.role !== 'admin') {
            alert('عذراً، لا تملك الصلاحية لحذف السجلات. هذه الميزة مخصصة لمدير النظام.');
            return;
        }
        
        setConfirmDialog({
            isOpen: true,
            title: 'تأكيد الحذف',
            message: 'هل أنت متأكد من حذف هذه الحركة من الصندوق نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.',
            onCancel: () => setConfirmDialog(prev => ({ ...prev, isOpen: false })),
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                try {
                    await deleteDoc(doc(db, 'card_cashbox', entryId));
                } catch (error) {
                    handleFirestoreError(error, OperationType.WRITE, 'card_cashbox');
                }
            }
        });
    };

    // Calculate Cashbox total balance
    const cashboxBalance = cashboxEntries.reduce((acc, entry) => {
        return entry.isIncome ? acc + entry.amount : acc - entry.amount;
    }, 0);

    // Filter Sales by selected month (excluding cancelled sales and converted credit sales)
    const activeMonthCashInvoices = new Set(
        sales
            .filter(s => {
                const matchM = s.month === selectedMonth || (s.date && s.date.startsWith(selectedMonth)) || (s.dateTime && s.dateTime.startsWith(selectedMonth));
                const st = (s.status as string) || 'completed';
                return matchM && st === 'completed' && s.paymentType === 'cash' && s.invoiceNumber;
            })
            .map(s => s.invoiceNumber)
    );

    const filteredMonthSales = useMemo(() => {
        return sales.filter(s => {
            const matchM = s.month === selectedMonth || (s.date && s.date.startsWith(selectedMonth)) || (s.dateTime && s.dateTime.startsWith(selectedMonth));
            if (!matchM) return false;
            const st = (s.status as string) || 'completed';
            if (st === 'cancelled' || st === 'canceled' || st === 'returned') return false;
            if (s.paymentType === 'credit' && s.invoiceNumber && activeMonthCashInvoices.has(s.invoiceNumber)) {
                return false;
            }
            return st === 'completed';
        });
    }, [sales, selectedMonth, activeMonthCashInvoices]);

    // Monthly Grouped Sales Invoices for detailed list
    const monthlyGroupedSalesInvoices = useMemo(() => {
        const invoiceMap = new Map<string, {
            id: string;
            invoiceNumber: string;
            distributorName: string;
            distributorId?: string;
            paymentType: 'cash' | 'credit';
            totalAmount: number;
            totalQuantity: number;
            dateTime: string;
            date: string;
            userName: string;
            status?: string;
            cancelledBy?: string;
            cancelledAt?: number;
            items: Array<{
                categoryName: string;
                quantity: number;
                unitPrice: number;
                totalAmount: number;
            }>;
        }>();

        filteredMonthSales.forEach(s => {
            const invNum = s.invoiceNumber ? `${s.invoiceNumber}` : `INV-${s.id.slice(-5)}`;
            if (!invoiceMap.has(invNum)) {
                invoiceMap.set(invNum, {
                    id: s.id,
                    invoiceNumber: invNum,
                    distributorName: s.distributorName || 'مبيعات مباشرة',
                    distributorId: s.distributorId,
                    paymentType: s.paymentType || 'cash',
                    totalAmount: 0,
                    totalQuantity: 0,
                    dateTime: s.dateTime || s.date || '',
                    date: s.date || '',
                    userName: s.userName || 'المدير',
                    status: s.status,
                    cancelledBy: s.cancelledBy,
                    cancelledAt: s.cancelledAt,
                    items: []
                });
            }

            const inv = invoiceMap.get(invNum)!;
            const itemQty = Number(s.quantity) || 0;
            const itemNet = Number(s.netTotal) || 0;
            const itemPrice = Number(s.unitPrice) || (itemQty > 0 ? itemNet / itemQty : 0);

            inv.totalQuantity += itemQty;
            inv.totalAmount += itemNet;
            inv.items.push({
                categoryName: s.categoryName || 'غير محدد',
                quantity: itemQty,
                unitPrice: itemPrice,
                totalAmount: itemNet
            });
        });

        return Array.from(invoiceMap.values()).sort((a, b) => (b.dateTime || '').localeCompare(a.dateTime || ''));
    }, [filteredMonthSales]);

    // Monthly Report Calculations per category (Network Cards only)
    // Monthly Report Calculations per category (Network Cards only)
    const monthlyCategoryReport = useMemo(() => {
        const isNetworkCategory = (c: CardCategory) => {
            if (c.linkedSection && c.linkedSection.trim().length > 0) return true;
            const norm = (c.name || '').trim().toLowerCase();
            if (!norm) return false;

            const defaultDenoms = [
                'فئة 100 ريال', 'فئة 200 ريال', 'فئة 250 ريال', 'فئة 500 ريال',
                'فئة 1000 ريال', 'فئة 1500 ريال', 'فئة 3000 ريال', 'فئة 5000 ريال'
            ];

            if (defaultDenoms.some(d => d.toLowerCase() === norm)) return true;
            if (norm.startsWith('فئة ') || norm.includes('شبك')) return true;

            const cleanStr = norm.replace(/فئة|كروت|كرت|ريال|\s+/g, '');
            if (['100', '200', '250', '500', '1000', '1500', '3000', '5000'].includes(cleanStr)) return true;

            return false;
        };

        const uniqueCategories: CardCategory[] = [];
        const seenCatKeys = new Set<string>();

        // 1. Include only network card categories from categories state
        categories.forEach(c => {
            if (!c.name || !c.name.trim()) return;
            if (!isNetworkCategory(c)) return;

            const normName = c.name.trim().toLowerCase();
            const key = c.id ? `id_${c.id}` : `name_${normName}`;
            if (!seenCatKeys.has(key)) {
                seenCatKeys.add(key);
                uniqueCategories.push(c);
            }
        });

        return uniqueCategories.map(cat => {
            const catNameTrim = (cat.name || '').trim().toLowerCase();
            const linkedTrim = (cat.linkedSection || '').trim().toLowerCase();
            const cleanCat = catNameTrim.replace(/فئة|كروت|كرت|ريال|\s+/g, '');
            const cleanLinked = linkedTrim.replace(/فئة|كروت|كرت|ريال|\s+/g, '');

            const catSales = filteredMonthSales.filter(s => {
                if (s.categoryId && cat.id && s.categoryId === cat.id) return true;
                const sNameTrim = (s.categoryName || '').trim().toLowerCase();
                if (!sNameTrim) return false;

                if (sNameTrim === catNameTrim) return true;
                if (linkedTrim && sNameTrim === linkedTrim) return true;

                const cleanSale = sNameTrim.replace(/فئة|كروت|كرت|ريال|\s+/g, '');
                if (cleanSale && cleanCat && cleanSale === cleanCat) return true;
                if (cleanSale && cleanLinked && cleanSale === cleanLinked) return true;

                return false;
            });

            const cashSales = catSales.filter(s => s.paymentType === 'cash');
            const creditSales = catSales.filter(s => s.paymentType === 'credit');

            const cashQty = cashSales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
            const creditQty = creditSales.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
            const cashAmountTotal = cashSales.reduce((sum, s) => sum + (Number(s.netTotal) || 0), 0);
            const creditAmountTotal = creditSales.reduce((sum, s) => sum + (Number(s.netTotal) || 0), 0);

            return {
                categoryName: cat.name.trim(),
                cashQty,
                creditQty,
                totalQty: cashQty + creditQty,
                cashAmountTotal,
                creditAmountTotal,
                totalAmount: cashAmountTotal + creditAmountTotal
            };
        }).filter(r => r.totalQty > 0 || r.totalAmount > 0);
    }, [categories, filteredMonthSales]);

    const totalMonthCashQty = monthlyCategoryReport.reduce((acc, r) => acc + r.cashQty, 0);
    const totalMonthCreditQty = monthlyCategoryReport.reduce((acc, r) => acc + r.creditQty, 0);
    const totalMonthCashNet = monthlyCategoryReport.reduce((acc, r) => acc + r.cashAmountTotal, 0);
    const totalMonthCreditNet = monthlyCategoryReport.reduce((acc, r) => acc + r.creditAmountTotal, 0);
    const totalMonthOverallQty = totalMonthCashQty + totalMonthCreditQty;
    const totalMonthOverallNet = totalMonthCashNet + totalMonthCreditNet;

    // Export Monthly Report PDF
    const handleExportMonthlyPDF = () => {
        const title = `تقرير المبيعات الشهرية لكروت الشبكة - شهر ${selectedMonth}`;
        const headers = ['فئة الكروت', 'عدد النقدية', 'عدد الآجلة', 'إجمالي النقدية', 'إجمالي الآجلة', 'الصافي الإجمالي'];
        const data = monthlyCategoryReport.map(r => [
            r.categoryName,
            `${r.cashQty} كارت`,
            `${r.creditQty} كارت`,
            `${r.cashAmountTotal.toFixed(2)} ريال`,
            `${r.creditAmountTotal.toFixed(2)} ريال`,
            `${r.totalAmount.toFixed(2)} ريال`
        ]);
        data.push([
            'الإجمالي العام',
            `${totalMonthCashQty} كارت`,
            `${totalMonthCreditQty} كارت`,
            `${totalMonthCashNet.toFixed(2)} ريال`,
            `${totalMonthCreditNet.toFixed(2)} ريال`,
            `${totalMonthOverallNet.toFixed(2)} ريال`
        ]);
        printReport(title, headers, data);
    };

    // Card Sections definition for the Main Squares Grid
    const sections = [
        {
            id: 'card_sales_section',
            title: 'المبيعات',
            subtitle: 'عرض فواتير المبيعات الفردية والـ PDF',
            icon: TrendingUp,
            color: 'bg-emerald-600',
            lightBg: 'bg-emerald-50 dark:bg-emerald-950/60',
            textColor: 'text-emerald-600 dark:text-emerald-400',
            borderColor: 'border-emerald-100 dark:border-emerald-900/50',
            visible: getSecPermission('cards_sales_report', 'view')
        },
        {
            id: 'card_purchases_section',
            title: 'المشتريات',
            subtitle: 'إضافة كروت وفواتير المشتريات والـ PDF',
            icon: ShoppingBag,
            color: 'bg-blue-600',
            lightBg: 'bg-blue-50 dark:bg-blue-950/60',
            textColor: 'text-blue-600 dark:text-blue-400',
            borderColor: 'border-blue-100 dark:border-blue-900/50',
            visible: getSecPermission('cards_stock', 'view')
        },
        {
            id: 'purchases',
            title: 'الموردين',
            subtitle: 'حسابات الموردين وفواتير الشراء',
            icon: Truck,
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
            id: 'monthly_purchases',
            title: 'المشتريات الشهرية',
            subtitle: 'تقارير المشتريات الشهرية وتصدير PDF',
            icon: FileText,
            color: 'bg-indigo-600',
            lightBg: 'bg-indigo-50 dark:bg-indigo-950/60',
            textColor: 'text-indigo-600 dark:text-indigo-400',
            borderColor: 'border-indigo-100 dark:border-indigo-900/50',
            visible: getSecPermission('cards_stock', 'view')
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
            id: 'reconciliation',
            title: 'مطابقة الأرصدة والمبيعات',
            subtitle: 'مطابقة المخزون والتدقيق المالي (نقدي/آجل)',
            icon: Scale,
            color: 'bg-violet-600',
            lightBg: 'bg-violet-50 dark:bg-violet-950/60',
            textColor: 'text-violet-600 dark:text-violet-400',
            borderColor: 'border-violet-100 dark:border-violet-900/50',
            visible: getSecPermission('cards_sales_report', 'view') || getSecPermission('cards_stock', 'view')
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

            
            {/* SECTION 1: إضافة كروت (Add Stock Logs & Quick Actions) */}
            {activeSection === 'add_stock' && (
                <CardStockLogsSection
                    stockLogs={stockLogs}
                    categories={categories}
                    canAdd={canAdd}
                    onOpenAddModal={() => setIsCardPurchaseModalOpen(true)}
                    onOpenExchangeModal={() => {
                        if (!getSecPermission('cards_exchanges', 'view') && !getSecPermission('cards_exchanges', 'add')) {
                            alert('عذراً، ليس لديك صلاحية استبدال الكروت.');
                            return;
                        }
                        setIsCardExchangeModalOpen(true);
                    }}
                />
            )}

            {/* SECTION 1.5: الموردين والمشتريات (Purchases) */}
            {activeSection === 'purchases' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    {/* Header & Sub-Navigation */}
                    {purchaseSubSection === null ? (
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in duration-200">
                            <div>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white">إدارة وحسابات الموردين</h2>
                                <p className="text-xs font-bold text-slate-400 mt-1">تتبع كشوفات الحسابات والديون السابقة للموردين وفواتير الشراء والتنبيهات اليومية</p>
                            </div>
                        </div>
                    ) : (
                        purchaseSubSection === 'list' ? (
                            <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3 animate-in fade-in duration-200">
                                <div className="flex items-center gap-3">
                                    <div>
                                        <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                                            عرض وتعديل بيانات الموردين
                                        </h2>
                                    </div>
                                </div>
                            </div>
                        ) : null
                    )}

                    {/* DAILY DEBT NOTIFICATION BANNER */}
                    {purchaseSubSection === null && (() => {
                        const alertedSupps = suppliers.filter(s => (s.balance || 0) >= supplierDebtLimit);
                        if (alertedSupps.length === 0) return null;
                        return (
                            <div 
                                onClick={() => setPurchaseSubSection('alerts')}
                                className="bg-rose-500/10 border-2 border-rose-500/30 text-rose-700 dark:text-rose-300 p-4 rounded-3xl flex items-center justify-between gap-3 cursor-pointer hover:bg-rose-500/20 transition shadow-sm"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center font-black animate-pulse">
                                        <Sparkles size={20} />
                                    </div>
                                    <div>
                                        <h4 className="font-black text-xs sm:text-sm">تنبيه المديونيات اليومي: يوجد {alertedSupps.length} مورد تجاوزت مديونيتهم الحد المسموح ({supplierDebtLimit} ريال يمني)</h4>
                                        <p className="text-[11px] font-bold opacity-80 mt-0.5">اضغط هنا لاستعراض قائمة الموردين والمتابعة وتغيير الحد المسموح</p>
                                    </div>
                                </div>
                                <button className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-sm whitespace-nowrap">
                                    استعراض التنبيهات
                                </button>
                            </div>
                        );
                    })()}

                    {/* MAIN SUB-SECTION MENU: 7 Cards (أقسام الموردين) */}
                    {purchaseSubSection === null && (() => {
                        const suppSections = [
                            {
                                id: 'accounts',
                                title: 'حسابات الموردين',
                                subtitle: 'كشوف الحسابات وتتبع الديون والواصل بالسجل والتواريخ',
                                icon: Receipt,
                                lightBg: 'bg-blue-50 dark:bg-blue-950/60',
                                textColor: 'text-blue-600 dark:text-blue-400',
                                borderColor: 'border-blue-100 dark:border-blue-900/50'
                            },
                            {
                                id: 'invoices',
                                title: 'فواتير الموردين والطباعة',
                                subtitle: 'عرض وتصفية وطباعة فواتير الشراء PDF',
                                icon: Printer,
                                lightBg: 'bg-emerald-50 dark:bg-emerald-950/60',
                                textColor: 'text-emerald-600 dark:text-emerald-400',
                                borderColor: 'border-emerald-100 dark:border-emerald-900/50'
                            },
                            {
                                id: 'returns',
                                title: 'مردودات كروت الموردين',
                                subtitle: 'قسم مستقل لإدارة وتصفية وطباعة مردودات المشتريات',
                                icon: RotateCcw,
                                lightBg: 'bg-rose-50 dark:bg-rose-950/60',
                                textColor: 'text-rose-600 dark:text-rose-400',
                                borderColor: 'border-rose-100 dark:border-rose-900/50'
                            },
                            {
                                id: 'alerts',
                                title: 'تنبيهات ديون الموردين',
                                subtitle: 'نظام التنبيهات اليومي لتجاوز حدود الديون',
                                icon: Sparkles,
                                lightBg: 'bg-amber-50 dark:bg-amber-950/60',
                                textColor: 'text-amber-600 dark:text-amber-400',
                                borderColor: 'border-amber-100 dark:border-amber-900/50'
                            },
                            {
                                id: 'list',
                                title: 'عرض وتعديل الموردين',
                                subtitle: 'إدارة وتحديث بيانات الموردين',
                                icon: Users,
                                lightBg: 'bg-teal-50 dark:bg-teal-950/60',
                                textColor: 'text-teal-600 dark:text-teal-400',
                                borderColor: 'border-teal-100 dark:border-teal-900/50'
                            },
                            ...(canAdd ? [{
                                id: 'add',
                                title: 'إضافة مورد جديد',
                                subtitle: 'تسجيل مورد جديد وتعيين رصيد البداية',
                                icon: Plus,
                                lightBg: 'bg-indigo-50 dark:bg-indigo-950/60',
                                textColor: 'text-indigo-600 dark:text-indigo-400',
                                borderColor: 'border-indigo-100 dark:border-indigo-900/50'
                            }] : [])
                        ];

                        return (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-5">
                                {suppSections.map(sec => {
                                    const IconComponent = sec.icon;
                                    return (
                                        <div
                                            key={sec.id}
                                            onClick={() => {
                                                if (sec.id === 'add') {
                                                    setEditingSupplier(null);
                                                    setSupplierName('');
                                                    setSupplierPhone('');
                                                    setSupplierPreviousDebt('');
                                                }
                                                setPurchaseSubSection(sec.id as any);
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

                    {/* Sub-Section 1: Suppliers Accounts & Statements */}
                    {purchaseSubSection === 'accounts' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            {selectedSupplierForDetails ? (
                                // Render ledger / account details inline as a screen inside section (بحجم الشاشة)
                                (() => {
                                    const supp = selectedSupplierForDetails;
                                    
                                    // 1. Filter Sales
                                    const suppPurchases = purchases.filter(s => s.supplierId === supp.id && (s.status === 'completed' || !s.status));
                                    const totalPurchasesCash = suppPurchases.filter(s => s.paymentType === 'cash').reduce((acc, s) => acc + (s.totalAmount || 0), 0);
                                    const totalPurchasesCredit = suppPurchases.filter(s => s.paymentType === 'credit').reduce((acc, s) => acc + (s.totalAmount || 0), 0);
                                    
                                    // 2. Filter Vouchers
                                    const suppVouchers = purchaseVouchers.filter(v => v.supplierId === supp.id);
                                    const totalReceipts = suppVouchers.filter(v => v.type === 'receipt').reduce((acc, v) => acc + v.amount, 0);

                                    // 3. Compile Ledger Entries
                                    let ledgerEntries: any[] = [];
                                    const initialDebt = supp.previousDebt || 0;

                                    suppPurchases.forEach(sale => {
                                        const isCredit = sale.paymentType === 'credit';
                                        const saleDate = sale.date || (sale.dateTime && sale.dateTime.split(' ')[0]) || '';
                                        ledgerEntries.push({
                                            id: sale.id,
                                            date: saleDate,
                                            dateTime: sale.dateTime || '',
                                            type: isCredit ? 'sale_credit' : 'sale_cash',
                                            title: `مشتريات كروت (${sale.categoryName}) - عدد ${sale.quantity} (${isCredit ? 'آجل' : 'نقدي'})`,
                                            debit: 0,
                                            credit: isCredit ? (sale.totalAmount || 0) : 0,
                                            ref: sale.id.slice(-6).toUpperCase(),
                                            paymentType: sale.paymentType
                                        });
                                    });

                                    suppVouchers.forEach(v => {
                                        const isReceipt = v.type === 'receipt';
                                        const voucherDate = v.date || (v.dateTime && v.dateTime.split(' ')[0]) || '';
                                        ledgerEntries.push({
                                            id: v.id,
                                            date: voucherDate,
                                            dateTime: v.dateTime || '',
                                            type: isReceipt ? 'voucher_receipt' : 'voucher_payment',
                                            title: isReceipt ? `سند قبض - ${v.notes || 'مسترد من المورد'}` : `سند صرف - ${v.notes || 'مسدد للمورد'}`,
                                            debit: isReceipt ? 0 : v.amount,
                                            credit: isReceipt ? v.amount : 0,
                                            ref: v.voucherNumber,
                                            paymentType: 'voucher'
                                        });
                                    });

                                    // Sort chronological
                                    ledgerEntries.sort((a, b) => (a.dateTime || '').localeCompare(b.dateTime || ''));

                                    // APPLY DATE FILTERS
                                    if (ledgerStartDate) {
                                        ledgerEntries = ledgerEntries.filter(e => e.date >= ledgerStartDate);
                                    }
                                    if (ledgerEndDate) {
                                        ledgerEntries = ledgerEntries.filter(e => e.date <= ledgerEndDate);
                                    }

                                    // Compute running balance starting with previousDebt
                                    let runningBalance = initialDebt;
                                    const ledgerWithRunningBalance = ledgerEntries.map(entry => {
                                        runningBalance = runningBalance + entry.credit - entry.debit;
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
                                                        <h3 className="font-black text-slate-900 dark:text-white text-base">كشف حساب وتفاصيل المورد: {supp.name}</h3>
                                                        <p className="text-xs font-bold text-slate-500 mt-0.5">رقم الهاتف: {supp.phone || 'غير مسجل'} | تاريخ التسجيل: {supp.date}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const titleReport = `كشف حساب المورد: ${supp.name} ${ledgerStartDate ? `(من ${ledgerStartDate})` : ''} ${ledgerEndDate ? `(إلى ${ledgerEndDate})` : ''}`;
                                                            const headersReport = ['التاريخ', 'المرجع', 'البيان', 'مدين (+)', 'دائن (-)', 'الرصيد المستحق'];
                                                            const dataReport = [
                                                                [supp.date, '--', 'رصيد أول المدة', '--', '--', `${initialDebt.toFixed(2)} ريال`]
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
                                                        onClick={() => handleShareClick(supp, runningBalance, totalPurchasesCredit, totalPurchasesCash, totalReceipts)}
                                                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition"
                                                    >
                                                        <Share2 size={16} />
                                                        <span>مشاركة كشف الحساب</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Date Filter & Supplier Switcher Bar */}
                                            <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <label className="text-xs font-black text-slate-700 dark:text-slate-300 whitespace-nowrap">اختيار مورد آخر:</label>
                                                    <select
                                                        value={supp.id}
                                                        onChange={(e) => {
                                                            const found = suppliers.find(s => s.id === e.target.value);
                                                            if (found) setSelectedSupplierForDetails(found);
                                                        }}
                                                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white"
                                                    >
                                                        {suppliers.map(s => (
                                                            <option key={s.id} value={s.id}>{s.name} (دين: {(s.balance || 0).toFixed(2)} ريال يمني)</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[11px] font-bold text-slate-400">من تاريخ:</span>
                                                        <input
                                                            type="date"
                                                            value={ledgerStartDate}
                                                            onChange={(e) => setLedgerStartDate(e.target.value)}
                                                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[11px] font-bold text-slate-400">إلى تاريخ:</span>
                                                        <input
                                                            type="date"
                                                            value={ledgerEndDate}
                                                            onChange={(e) => setLedgerEndDate(e.target.value)}
                                                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white"
                                                        />
                                                    </div>
                                                    {(ledgerStartDate || ledgerEndDate) && (
                                                        <button
                                                            onClick={() => {
                                                                setLedgerStartDate('');
                                                                setLedgerEndDate('');
                                                            }}
                                                            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-bold text-xs rounded-xl transition"
                                                        >
                                                            تفريغ الفلتر
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Ledger Content */}
                                            <div className="p-6 space-y-6">
                                                {/* Statistics Grid */}
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 text-right">
                                                        <span className="text-[10px] font-black text-slate-400 block mb-1">الدين السابق (رصيد البداية)</span>
                                                        <span className="text-sm font-black text-slate-700 dark:text-slate-200">{(supp.previousDebt || 0).toFixed(2)} ريال يمني</span>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 text-right">
                                                        <span className="text-[10px] font-black text-slate-400 block mb-1">صافي الدين الحالي</span>
                                                        <span className={`text-sm font-black ${runningBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                            {runningBalance.toFixed(2)} ريال يمني
                                                        </span>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 text-right">
                                                        <span className="text-[10px] font-black text-slate-400 block mb-1">المبيعات الآجلة</span>
                                                        <span className="text-sm font-black text-amber-600 dark:text-amber-400">{totalPurchasesCredit.toFixed(2)} ريال يمني</span>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 text-right">
                                                        <span className="text-[10px] font-black text-slate-400 block mb-1">المبيعات النقدية</span>
                                                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{totalPurchasesCash.toFixed(2)} ريال يمني</span>
                                                    </div>
                                                </div>

                                                {/* Main Table */}
                                                <div className="space-y-3">
                                                    <h4 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-2">
                                                        <Receipt size={16} className="text-blue-600 dark:text-blue-400" />
                                                        <span>سجل المديونيات والمدفوعات التفصيلي {(ledgerStartDate || ledgerEndDate) ? '(مصفى حسب التاريخ)' : ''}</span>
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
                                                                        <td className="p-3 text-slate-400">{supp.date}</td>
                                                                        <td className="p-3 text-slate-400">--</td>
                                                                        <td className="p-3 font-black text-slate-900 dark:text-white">رصيد أول المدة (الدين السابق)</td>
                                                                        <td className="p-3 text-slate-400">--</td>
                                                                        <td className="p-3 text-slate-400">--</td>
                                                                        <td className="p-3 text-slate-900 dark:text-white font-black">{initialDebt.toFixed(2)} ريال يمني</td>
                                                                    </tr>

                                                                    {ledgerWithRunningBalance.length === 0 ? (
                                                                        <tr>
                                                                            <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">لا يوجد حركات مسجلة لهذا المورد في النطاق الزمني المحدد.</td>
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
                                                                                    {entry.runningBalance.toFixed(2)} ريال يمني
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
                                // Render Suppliers as a beautiful grid of Square Cards
                                <div className="space-y-4">
                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900">
                                        <h3 className="text-sm font-black text-slate-900 dark:text-white">حسابات الموردين وتفاصيل الأرصدة</h3>
                                        <p className="text-[10px] font-bold text-slate-400 mt-1">اضغط على بطاقة المورد لعرض كشف حسابه التفصيلي بالكامل داخل هذا القسم</p>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 md:gap-5">
                                        {suppliers.length === 0 ? (
                                            <div className="col-span-full bg-white dark:bg-slate-900 p-10 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs">
                                                لا يوجد موردون مسجلون بعد. قم بإضافة مورد أولاً.
                                            </div>
                                        ) : (
                                            suppliers.map((supp) => {
                                                const suppPurchases = purchases.filter(s => s.supplierId === supp.id && (s.status === 'completed' || !s.status));
                                                const suppVouchers = purchaseVouchers.filter(v => v.supplierId === supp.id);
                                                const totalPaid = suppVouchers.filter(v => v.type === 'receipt').reduce((sum, v) => sum + v.amount, 0);
                                                const balance = supp.balance || 0;

                                                return (
                                                    <div
                                                        key={supp.id}
                                                        onClick={() => setSelectedSupplierForDetails(supp)}
                                                        className="group flex flex-col items-center justify-center text-center p-5 md:p-6 rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-slate-900 transition-all duration-300 shadow-sm hover:shadow-2xl hover:-translate-y-1 cursor-pointer aspect-square animate-in zoom-in-95 duration-200"
                                                    >
                                                        <div className="flex flex-col items-center w-full">
                                                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 transition-transform group-hover:scale-110 border border-blue-100 dark:border-blue-900/50">
                                                                <Users size={24} />
                                                            </div>
                                                            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight mb-2 truncate max-w-full">
                                                                {supp.name}
                                                            </h3>
                                                            <div className="flex flex-col gap-1 items-center w-full">
                                                                <span className={`text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-xl whitespace-nowrap ${
                                                                    balance > 0 
                                                                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' 
                                                                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                                }`}>
                                                                    الدين: {balance.toFixed(2)} ريال يمني
                                                                </span>
                                                                <span className="text-[9px] font-bold text-slate-400 truncate max-w-full">
                                                                    الواصل: {totalPaid.toFixed(1)} ريال يمني
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

                    {/* Sub-Section 1.5: Supplier Invoices & PDF Printing */}
                    {purchaseSubSection === 'invoices' && (
                        <CardPurchasesSection 
                            purchases={purchases}
                            onViewInvoice={(invoice) => {
                                setActionModalInvoice(invoice);
                                setActionModalOpen(true);
                            }}
                            onEditInvoice={getSecPermission('cards_stock', 'edit') ? handleEditPurchaseInvoice : undefined}
                            onCancelInvoice={getSecPermission('cards_stock', 'delete') ? handleCancelPurchaseInvoice : undefined}
                            onOpenAddStock={canAdd ? () => setIsCardPurchaseModalOpen(true) : undefined}
                            onOpenExchangeStock={() => {
                                if (!getSecPermission('cards_exchanges', 'view') && !getSecPermission('cards_exchanges', 'add')) {
                                    alert('عذراً، ليس لديك صلاحية استبدال الكروت.');
                                    return;
                                }
                                setIsCardExchangeModalOpen(true);
                            }}
                            onBack={() => setPurchaseSubSection(null)}
                            appUser={appUser}
                        />
                    )}

                    {/* Sub-Section 1.6: Dedicated Purchase Returns Section */}
                    {purchaseSubSection === 'returns' && (
                        <CardReturnsSection
                            purchases={purchases}
                            categories={categories}
                            suppliers={suppliers}
                            onViewInvoice={(invoice) => {
                                setActionModalInvoice(invoice);
                                setActionModalOpen(true);
                            }}
                            onOpenMultiReturnModal={() => {
                                setPurchaseModalIsReturnOnly(true);
                                setIsCardPurchaseModalOpen(true);
                            }}
                            onSaveQuickReturn={handleSaveQuickPurchaseReturn}
                            onBack={() => setPurchaseSubSection(null)}
                            appUser={appUser}
                            canAdd={canAdd}
                        />
                    )}

                    {/* Sub-Section 1.8: Daily Debt Alerts */}
                    {purchaseSubSection === 'alerts' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                            {/* Debt Limit Control */}
                            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                                        <Sparkles className="text-rose-500" size={20} />
                                        <span>إعداد حد المديونية للتنبيه اليومي</span>
                                    </h3>
                                    <p className="text-xs font-bold text-slate-400 mt-1">عيّن أقصى مبلغ مسموح لمديونية المورد ليتم تنبيهك تلقائياً عند تجاوزه</p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <label className="text-xs font-black text-slate-700 dark:text-slate-300 whitespace-nowrap">الحد المسموح (ريال يمني):</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="100"
                                        value={supplierDebtLimitInput}
                                        onChange={(e) => setSupplierDebtLimitInput(e.target.value)}
                                        className="w-28 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-2.5 text-xs font-black text-center outline-none focus:border-rose-500 text-slate-900 dark:text-white"
                                    />
                                    <button
                                        onClick={() => {
                                            const val = parseFloat(supplierDebtLimitInput) || 0;
                                            setSupplierDebtLimit(val);
                                            alert(`تم تحديث حد تنبيه ديون الموردين إلى: ${val} ريال`);
                                        }}
                                        className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-2xl shadow-md shadow-rose-600/20 active:scale-95 transition"
                                    >
                                        تطبيق الحد
                                    </button>
                                </div>
                            </div>

                            {/* Alerted Suppliers Dashboard */}
                            {(() => {
                                const alertedSupps = suppliers.filter(s => (s.balance || 0) >= supplierDebtLimit);
                                const totalAlertedDebt = alertedSupps.reduce((sum, s) => sum + (s.balance || 0), 0);

                                if (alertedSupps.length === 0) {
                                    return (
                                        <div className="bg-emerald-500/10 border-2 border-emerald-500/30 p-8 rounded-3xl text-center space-y-3">
                                            <div className="w-14 h-14 bg-emerald-500 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                                                <CheckCircle2 size={32} />
                                            </div>
                                            <h3 className="text-base font-black text-emerald-800 dark:text-emerald-200">جميع مديونيات الموردين آمنة وضمن الحدود المسموحة!</h3>
                                            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 max-w-md mx-auto">
                                                لا يوجد حالياً أي مورد يتجاوز الدين المستحق عليه الحد المحدد ({supplierDebtLimit} ريال يمني).
                                            </p>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="space-y-4">
                                        {/* Summary Card */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <div className="bg-rose-50 dark:bg-rose-950/50 p-4 rounded-2xl border border-rose-200 dark:border-rose-800 flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black">
                                                    <Users size={20} />
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-black text-rose-600 dark:text-rose-400">موردين متجاوزين للحد</span>
                                                    <div className="text-base font-black text-rose-700 dark:text-rose-200">{alertedSupps.length} مورد</div>
                                                </div>
                                            </div>

                                            <div className="bg-rose-50 dark:bg-rose-950/50 p-4 rounded-2xl border border-rose-200 dark:border-rose-800 flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black">
                                                    <DollarSign size={20} />
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-black text-rose-600 dark:text-rose-400">إجمالي الديون المتجاوزة</span>
                                                    <div className="text-base font-black text-rose-700 dark:text-rose-200">{totalAlertedDebt.toFixed(2)} ريال يمني</div>
                                                </div>
                                            </div>

                                            <div className="bg-rose-50 dark:bg-rose-950/50 p-4 rounded-2xl border border-rose-200 dark:border-rose-800 flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black">
                                                    <Sparkles size={20} />
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-black text-rose-600 dark:text-rose-400">حد التنبيه المعيّن</span>
                                                    <div className="text-base font-black text-rose-700 dark:text-rose-200">{supplierDebtLimit} ريال يمني</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Alerted List */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {alertedSupps.map(supp => {
                                                const currentDebt = supp.balance || 0;
                                                const excess = currentDebt - supplierDebtLimit;
                                                return (
                                                    <div key={supp.id} className="bg-white dark:bg-slate-900 p-5 rounded-3xl border-2 border-rose-200 dark:border-rose-900 shadow-sm flex flex-col justify-between gap-4">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center font-black">
                                                                    <Users size={24} />
                                                                </div>
                                                                <div>
                                                                    <h4 className="font-black text-sm text-slate-900 dark:text-white">{supp.name}</h4>
                                                                    <p className="text-xs font-bold text-slate-500 mt-0.5">هاتف: {supp.phone || 'غير مسجل'}</p>
                                                                </div>
                                                            </div>

                                                            <span className="px-3 py-1 bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 font-black text-[10px] rounded-xl border border-rose-200 dark:border-rose-800 animate-pulse">
                                                                ⚠️ تجاوز بـ {excess.toFixed(2)} ريال يمني
                                                            </span>
                                                        </div>

                                                        <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl flex items-center justify-between text-xs font-bold">
                                                            <span className="text-slate-500">الديـن المستحق الحالي:</span>
                                                            <span className="font-black text-rose-600 text-sm">{currentDebt.toFixed(2)} ريال يمني</span>
                                                        </div>

                                                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedSupplierForDetails(supp);
                                                                    setPurchaseSubSection('accounts');
                                                                }}
                                                                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-sm transition text-center"
                                                            >
                                                                كشف الحساب
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setPurchaseVoucherSupplierId(supp.id);
                                                                    setPurchaseVoucherType('payment');
                                                                    setIsPurchaseVoucherModalOpen(true);
                                                                }}
                                                                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-sm transition text-center"
                                                            >
                                                                سداد دين للمورد
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Sub-Section 2: View & Edit Suppliers */}
                    {purchaseSubSection === 'list' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {suppliers.length === 0 ? (
                                    <div className="col-span-full bg-white dark:bg-slate-900 p-10 rounded-3xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 font-bold text-xs">
                                        لا يوجد موردون مسجلون بعد.
                                    </div>
                                ) : (
                                    suppliers.map((supp) => (
                                        <div
                                            key={supp.id}
                                            className="group relative flex flex-col items-center justify-between text-center p-4 rounded-2xl md:rounded-3xl border-2 border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-slate-900 transition-all duration-300 shadow-sm hover:shadow-xl aspect-square"
                                        >
                                            <div className="w-full flex items-center justify-between">

                                                <div className="flex items-center gap-0.5">
                                                    {canEdit && (
                                                        <button
                                                            onClick={() => {
                                                                setEditingSupplier(supp);
                                                                setSupplierName(supp.name);
                                                                setSupplierPhone(supp.phone || '');
                                                                
                                                                setSupplierPreviousDebt(supp.previousDebt ? supp.previousDebt.toString() : '');
                                                                
                                                                setIsSupplierModalOpen(true);
                                                            }}
                                                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                                                            title="تعديل المورد"
                                                        >
                                                            <Edit size={14} />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            onClick={() => handleDeleteSupplier(supp.id, supp.name)}
                                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition"
                                                            title="حذف المورد"
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
                                                    {supp.name}
                                                </h3>
                                                <div className="flex flex-col gap-0.5 mt-1.5">
                                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                                                        (supp.balance || 0) > 0 
                                                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300' 
                                                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                    }`}>
                                                        الدين الحالي: {(supp.balance || 0).toFixed(2)} ريال
                                                    </span>
                                                    {supp.previousDebt !== undefined && supp.previousDebt > 0 && (
                                                        <span className="text-[9px] font-bold text-slate-400">
                                                            الدين السابق: {supp.previousDebt.toFixed(2)} ريال
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="w-full pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold text-slate-400">
                                                <span>{supp.phone || 'بدون رقم'}</span>
                                                <span>{supp.date}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    
                    {/* Sub-Section 3: Add Supplier */}
                    {purchaseSubSection === 'add' && (
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-xl mx-auto animate-in zoom-in-95 duration-200">
                            <h3 className="text-base font-black text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2 w-full text-center">
                                <Plus className="text-blue-600 dark:text-blue-400" size={20} />
                                <span>إضافة مورد جديد للمنظومة</span>
                            </h3>
                            <form onSubmit={async (e) => {
                                await handleSaveSupplier(e);
                                setPurchaseSubSection('accounts'); // navigate to accounts on save
                            }} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">اسم المورد</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="اسم المورد الكامل"
                                        value={supplierName}
                                        onChange={(e) => setSupplierName(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">رقم الهاتف <span className="text-rose-500">*</span></label>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        required
                                        placeholder="05xxxxxxx"
                                        value={supplierPhone}
                                        onChange={(e) => setSupplierPhone(e.target.value.replace(/\D/g, ''))}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">الدين السابق (ريال يمني)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={supplierPreviousDebt}
                                        onChange={(e) => setSupplierPreviousDebt(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-blue-600/20 active:scale-95 transition"
                                >
                                    حفظ بيانات المورد الجديد
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* SECTION: البائعين (Sellers) */}
            {activeSection === 'sellers' && (() => {
                const retailSales = sales.filter(s => s.saleType === 'retail' && (s.status === 'completed' || !s.status));
                
                // 1. Calculate Seller Summaries
                const sellersMap = new Map<string, { userName: string; count: number; totalSales: number; commission: number }>();
                retailSales.forEach(sale => {
                    const name = sale.userName?.trim() || 'بائع مجهول';
                    const amount = sale.netTotal || sale.totalAmount || 0;
                    const current = sellersMap.get(name) || { userName: name, count: 0, totalSales: 0, commission: 0 };
                    current.count += sale.quantity || 0;
                    current.totalSales += amount;
                    current.commission = current.totalSales * 0.10; // 10% commission
                    sellersMap.set(name, current);
                });
                const sellersList = Array.from(sellersMap.values());

                // 2. Calculate Daily Summaries
                const dailySalesMap = new Map<string, {
                    date: string;
                    count: number;
                    totalSales: number;
                    commission: number;
                    sellers: {
                        [sellerName: string]: {
                            count: number;
                            totalSales: number;
                            commission: number;
                        }
                    }
                }>();

                retailSales.forEach(sale => {
                    const dateStr = sale.date || (sale.dateTime ? sale.dateTime.split(' ')[0] : '') || 'تاريخ غير محدد';
                    const name = sale.userName?.trim() || 'بائع مجهول';
                    const amount = sale.netTotal || sale.totalAmount || 0;
                    
                    const currentDay = dailySalesMap.get(dateStr) || {
                        date: dateStr,
                        count: 0,
                        totalSales: 0,
                        commission: 0,
                        sellers: {}
                    };
                    
                    currentDay.count += sale.quantity || 0;
                    currentDay.totalSales += amount;
                    currentDay.commission = currentDay.totalSales * 0.10;
                    
                    if (!currentDay.sellers[name]) {
                        currentDay.sellers[name] = { count: 0, totalSales: 0, commission: 0 };
                    }
                    currentDay.sellers[name].count += sale.quantity || 0;
                    currentDay.sellers[name].totalSales += amount;
                    currentDay.sellers[name].commission = currentDay.sellers[name].totalSales * 0.10;
                    
                    dailySalesMap.set(dateStr, currentDay);
                });

                const dailySalesList = Array.from(dailySalesMap.values()).sort((a, b) => b.date.localeCompare(a.date));

                // Totals
                const grandRetailSales = sellersList.reduce((sum, s) => sum + s.totalSales, 0);
                const grandCommission = sellersList.reduce((sum, s) => sum + s.commission, 0);
                const grandQty = sellersList.reduce((sum, s) => sum + s.count, 0);

                // Filters based on search query
                const filteredSellersList = sellersList.filter(s => 
                    s.userName.toLowerCase().includes(sellersSearchQuery.toLowerCase())
                );

                const filteredDailyList = dailySalesList.filter(d => 
                    d.date.includes(sellersSearchQuery) || 
                    Object.keys(d.sellers).some(name => name.toLowerCase().includes(sellersSearchQuery.toLowerCase()))
                );

                const toggleDay = (dateStr: string) => {
                    setExpandedDays(prev => 
                        prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
                    );
                };

                const handlePrintSellersReport = () => {
                    if (sellersActiveTab === 'by_seller') {
                        const title = 'تقرير عمولات البائعين لكروت التجزئة (10%)';
                        const headers = ['اسم البائع', 'عدد الكروت المباعة', 'إجمالي مبيعات التجزئة', 'العمولة المستحقة (10%)'];
                        const data = filteredSellersList.map(s => [
                            s.userName,
                            `${s.count} كارت`,
                            `${s.totalSales.toFixed(2)} ريال`,
                            `${s.commission.toFixed(2)} ريال`
                        ]);
                        data.push([
                            'الإجمالي العام',
                            `${grandQty} كارت`,
                            `${grandRetailSales.toFixed(2)} ريال`,
                            `${grandCommission.toFixed(2)} ريال`
                        ]);
                        printReport(title, headers, data);
                    } else {
                        const title = 'التقرير اليومي لعمولات كروت التجزئة (10%)';
                        const headers = ['التاريخ', 'عدد الكروت', 'إجمالي المبيعات اليومية', 'العمولة اليومية (10%)'];
                        const data = filteredDailyList.map(d => [
                            d.date,
                            `${d.count} كارت`,
                            `${d.totalSales.toFixed(2)} ريال`,
                            `${d.commission.toFixed(2)} ريال`
                        ]);
                        data.push([
                            'الإجمالي العام',
                            `${grandQty} كارت`,
                            `${grandRetailSales.toFixed(2)} ريال`,
                            `${grandCommission.toFixed(2)} ريال`
                        ]);
                        printReport(title, headers, data);
                    }
                };

                return (
                    <div className="space-y-6 animate-in fade-in duration-200 text-right dir-rtl" dir="rtl">
                        {/* Header Panel */}
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 font-display">
                                    <Sparkles className="text-teal-600 dark:text-teal-400 animate-pulse" size={20} />
                                    <span>تقرير عمولات بائعي كروت التجزئة</span>
                                </h2>
                                <p className="text-xs font-bold text-slate-400 mt-1">عرض وتحليل مبيعات البائعين باليوم وبالاسم والعمولة المستحقة (%10)</p>
                            </div>
                            
                            <button
                                onClick={handlePrintSellersReport}
                                className="px-5 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg flex items-center gap-2 transition"
                            >
                                <Printer size={16} />
                                <span>طباعة التقرير</span>
                            </button>
                        </div>

                        {/* Stats Dashboard */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:shadow-md transition">
                                <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-100 dark:border-teal-900/50">
                                    <UserCheck size={24} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black text-slate-400">إجمالي البائعين النشطين</span>
                                    <div className="text-lg font-black text-slate-900 dark:text-white">{sellersList.length} بائع</div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:shadow-md transition">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/50">
                                    <DollarSign size={24} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black text-slate-400">إجمالي مبيعات التجزئة</span>
                                    <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{grandRetailSales.toFixed(2)} ريال</div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:shadow-md transition">
                                <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center border border-purple-100 dark:border-purple-900/50">
                                    <Sparkles size={24} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black text-slate-400">إجمالي العمولات المستحقة (10%)</span>
                                    <div className="text-lg font-black text-purple-600 dark:text-purple-400">{grandCommission.toFixed(2)} ريال</div>
                                </div>
                            </div>
                        </div>

                        {/* Tab Switcher & Search Bar */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                            {/* Tabs */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        setSellersActiveTab('by_seller');
                                        setSellersSearchQuery('');
                                    }}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs transition active:scale-95 ${
                                        sellersActiveTab === 'by_seller'
                                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-md border border-slate-200/55 dark:border-slate-800'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <Users size={16} />
                                    <span>عرض حسب البائعين</span>
                                </button>
                                <button
                                    onClick={() => {
                                        setSellersActiveTab('by_day');
                                        setSellersSearchQuery('');
                                    }}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs transition active:scale-95 ${
                                        sellersActiveTab === 'by_day'
                                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-md border border-slate-200/55 dark:border-slate-800'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <Calendar size={16} />
                                    <span>التقرير اليومي للعمولات</span>
                                </button>
                            </div>

                            {/* Search */}
                            <div className="relative w-full md:max-w-xs">
                                <Search className="absolute right-3 top-2.5 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder={sellersActiveTab === 'by_seller' ? "ابحث باسم البائع..." : "ابحث بالتاريخ أو الموظف..."}
                                    value={sellersSearchQuery}
                                    onChange={(e) => setSellersSearchQuery(e.target.value)}
                                    className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl pr-9 pl-3 py-2 text-xs font-bold outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
                                />
                            </div>
                        </div>

                        {/* Tab Content 1: Sellers Summary */}
                        {sellersActiveTab === 'by_seller' && (
                            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-right text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800 animate-in fade-in duration-100">
                                            <tr>
                                                <th className="p-4">اسم البائع</th>
                                                <th className="p-4 text-center">عدد الكروت المباعة (تجزئة)</th>
                                                <th className="p-4 text-center">إجمالي مبيعات التجزئة</th>
                                                <th className="p-4 text-left">نسبة العمولة (10%)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                                            {filteredSellersList.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="p-8 text-center text-slate-400 font-bold">
                                                        لا توجد نتائج مطابقة لمبيعات البائعين.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredSellersList.map((seller) => (
                                                    <tr key={seller.userName} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                                                        <td className="p-4 font-black flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black text-xs border border-teal-100 dark:border-teal-900/30">
                                                                <UserCheck size={14} />
                                                            </div>
                                                            <span>{seller.userName}</span>
                                                        </td>
                                                        <td className="p-4 text-center font-black text-slate-700 dark:text-slate-300">{seller.count} كارت</td>
                                                        <td className="p-4 text-center font-black text-emerald-600 dark:text-emerald-400">{seller.totalSales.toFixed(2)} ريال</td>
                                                        <td className="p-4 text-left">
                                                            <span className="inline-flex bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/60 px-3 py-1.5 rounded-xl font-black text-xs">
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
                        )}

                        {/* Tab Content 2: Daily Report with Breakdown */}
                        {sellersActiveTab === 'by_day' && (
                            <div className="space-y-4 animate-in fade-in duration-200">
                                {filteredDailyList.length === 0 ? (
                                    <div className="bg-white dark:bg-slate-900 p-8 text-center text-slate-400 font-bold border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
                                        لا توجد مبيعات تجزئة مسجلة في هذا التاريخ حتى الآن.
                                    </div>
                                ) : (
                                    filteredDailyList.map((day) => {
                                        const isExpanded = expandedDays.includes(day.date);
                                        return (
                                            <div 
                                                key={day.date}
                                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-all duration-300"
                                            >
                                                {/* Day Row Header */}
                                                <div 
                                                    onClick={() => toggleDay(day.date)}
                                                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/20 select-none"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-900/30">
                                                            <Calendar size={18} />
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-black text-slate-800 dark:text-white">{day.date}</span>
                                                            <div className="text-[10px] font-bold text-slate-400 mt-0.5">عدد المبيعات اليومية: {day.count} كارت</div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-4 sm:gap-6 justify-between sm:justify-start">
                                                        <div className="text-right">
                                                            <span className="text-[10px] font-bold text-slate-400 block">إجمالي مبيعات اليوم</span>
                                                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{day.totalSales.toFixed(2)} ريال</span>
                                                        </div>

                                                        <div className="text-right">
                                                            <span className="text-[10px] font-bold text-slate-400 block">العمولة اليومية (10%)</span>
                                                            <span className="inline-flex bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-900 px-2.5 py-1 rounded-xl text-xs font-black">
                                                                {day.commission.toFixed(2)} ريال
                                                            </span>
                                                        </div>

                                                        <div className="text-slate-400 hover:text-indigo-600 transition">
                                                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Day Row Breakdown */}
                                                {isExpanded && (
                                                    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4">
                                                        <div className="text-xs font-black text-slate-400 mb-3 block">تفاصيل مبيعات البائعين لهذا اليوم:</div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            {Object.entries(day.sellers).map(([sellerName, sellerData]) => (
                                                                <div 
                                                                    key={sellerName}
                                                                    className="bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-slate-850 p-3 rounded-xl flex items-center justify-between shadow-sm hover:shadow-md transition"
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-7 h-7 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black text-xs border border-teal-100/30">
                                                                            <UserCheck size={12} />
                                                                        </div>
                                                                        <div>
                                                                            <span className="text-xs font-black text-slate-800 dark:text-slate-200">{sellerName}</span>
                                                                            <span className="text-[10px] font-bold text-slate-400 block mt-0.5">باع {sellerData.count} كارت</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <span className="text-[10px] font-bold text-slate-400 block">صافي مبيعاته</span>
                                                                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block">{sellerData.totalSales.toFixed(2)} ريال يمني</span>
                                                                        <span className="text-[10px] font-black text-purple-600 dark:text-purple-400 mt-1 block">عمولته: {sellerData.commission.toFixed(2)} ريال يمني</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                );
            })()}

            
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
                                            {cat.retailPrice || 0} ريال يمني
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
                                                جملة: {cat.wholesalePrice} ريال يمني
                                            </span>
                                        )}
                                    </div>

                                    <div className="w-full pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-black">
                                        <span className="text-[10px] text-slate-400">الرصيد:</span>
                                        <span className={`px-2 py-0.5 rounded-lg text-xs ${
                                            (cat.availableCount || 0) <= 20 
                                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 animate-pulse' 
                                            : 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                        }`}>
                                            {cat.availableCount || 0} كارت
                                            {(cat.availableCount || 0) <= 20 && ' (ناقص)'}
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
                                id: 'sales',
                                title: 'فواتير ومردودات',
                                subtitle: 'إصدار فواتير مبيعات للموزعين أو استرجاع كروت',
                                icon: FileText,
                                lightBg: 'bg-orange-50 dark:bg-orange-950/60',
                                textColor: 'text-orange-600 dark:text-orange-400',
                                borderColor: 'border-orange-100 dark:border-orange-900/50'
                            }] : []),
                            ...(canAdd ? [{
                                id: 'add',
                                title: 'إضافة موزع جديد',
                                subtitle: 'تسجيل موزع جديد وتعيين رصيد البداية',
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
                                    const activeCashInvoices = new Set(
                                        sales
                                            .filter(s => s.distributorId === dist.id && (s.status === 'completed' || !s.status) && s.paymentType === 'cash' && s.invoiceNumber)
                                            .map(s => s.invoiceNumber)
                                    );
                                    const distSales = sales.filter(s => {
                                        if (s.distributorId !== dist.id) return false;
                                        if (s.status === 'cancelled') return false;
                                        if (s.paymentType === 'credit' && s.invoiceNumber && activeCashInvoices.has(s.invoiceNumber)) {
                                            return false;
                                        }
                                        return true;
                                    });
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
                                                                [dist.date, '--', 'رصيد أول المدة', '--', '--', `${initialDebt.toFixed(2)} ريال يمني`]
                                                            ];
                                                            ledgerWithRunningBalance.forEach(e => {
                                                                dataReport.push([
                                                                    e.date,
                                                                    e.ref,
                                                                    e.title,
                                                                    e.debit > 0 ? `${e.debit.toFixed(2)} ريال يمني` : '--',
                                                                    e.credit > 0 ? `${e.credit.toFixed(2)} ريال يمني` : '--',
                                                                    `${e.runningBalance.toFixed(2)} ريال يمني`
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
                                                        <span className="text-sm font-black text-slate-700 dark:text-slate-200">{(dist.previousDebt || 0).toFixed(2)} ريال يمني</span>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 text-right">
                                                        <span className="text-[10px] font-black text-slate-400 block mb-1">صافي الدين الحالي</span>
                                                        <span className={`text-sm font-black ${runningBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                            {runningBalance.toFixed(2)} ريال يمني
                                                        </span>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 text-right">
                                                        <span className="text-[10px] font-black text-slate-400 block mb-1">المبيعات الآجلة</span>
                                                        <span className="text-sm font-black text-amber-600 dark:text-amber-400">{totalSalesCredit.toFixed(2)} ريال يمني</span>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-900 text-right">
                                                        <span className="text-[10px] font-black text-slate-400 block mb-1">المبيعات النقدية</span>
                                                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{totalSalesCash.toFixed(2)} ريال يمني</span>
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
                                                                        <td className="p-3 text-slate-900 dark:text-white font-black">{initialDebt.toFixed(2)} ريال يمني</td>
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
                                                                                    {entry.runningBalance.toFixed(2)} ريال يمني
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
                                                const distSales = sales.filter(s => s.distributorId === dist.id && (s.status === 'completed' || !s.status));
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
                                                                    الدين: {balance.toFixed(2)} ريال يمني
                                                                </span>
                                                                <span className="text-[9px] font-bold text-slate-400 truncate max-w-full">
                                                                    الواصل: {totalPaid.toFixed(1)} ريال يمني
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
                                                        الدين الحالي: {(dist.balance || 0).toFixed(2)} ريال يمني
                                                    </span>
                                                    {dist.previousDebt !== undefined && dist.previousDebt > 0 && (
                                                        <span className="text-[9px] font-bold text-slate-400">
                                                            الدين السابق: {dist.previousDebt.toFixed(2)} ريال يمني
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

                    
                    {/* Sub-Section 4: Sales & Returns */}
                    {distributorSubSection === 'sales' && (
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-2xl mx-auto animate-in zoom-in-95 duration-200 text-right" dir="rtl">
                            <h3 className="text-base font-black text-slate-900 dark:text-white mb-6 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2 w-full text-center">
                                <FileText className="text-orange-600 dark:text-orange-400" size={20} />
                                <span>إصدار فاتورة مبيعات / مرتجع لموزع</span>
                            </h3>

                            {/* Type Toggle */}
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl mb-6 relative w-full sm:w-2/3 mx-auto">
                                <button
                                    onClick={() => setSaleIsReturn(false)}
                                    className={`flex-1 py-2 text-xs font-black rounded-xl transition-all z-10 flex items-center justify-center gap-2 ${!saleIsReturn ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                >
                                    فاتورة مبيعات
                                </button>
                                <button
                                    onClick={() => setSaleIsReturn(true)}
                                    className={`flex-1 py-2 text-xs font-black rounded-xl transition-all z-10 flex items-center justify-center gap-2 ${saleIsReturn ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                >
                                    فاتورة مرتجع
                                </button>
                                <div
                                    className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-slate-900 dark:bg-slate-700 rounded-xl transition-all duration-300 shadow-md"
                                    style={{ right: !saleIsReturn ? '4px' : 'calc(50%)' }}
                                />
                            </div>

                            <form onSubmit={handleSaveSaleInvoice} className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">الموزع <span className="text-rose-500">*</span></label>
                                        <SearchableSelect
                                            required
                                            value={saleDistributorId}
                                            onChange={setSaleDistributorId}
                                            placeholder="اختر الموزع..."
                                            options={distributors.map(d => ({ id: d.id, label: d.name, subLabel: d.phone }))}
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">الفئة (نوع الكروت) <span className="text-rose-500">*</span></label>
                                        <SearchableSelect
                                            required
                                            value={saleCategoryId}
                                            onChange={setSaleCategoryId}
                                            placeholder="اختر الفئة..."
                                            options={categories.map(c => ({ id: c.id, label: c.name, subLabel: `متوفر: ${c.availableCount}` }))}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">الكمية <span className="text-rose-500">*</span></label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        placeholder="عدد الكروت..."
                                        value={saleQuantity}
                                        onChange={(e) => setSaleQuantity(e.target.value)}
                                        onFocus={(e) => {
                                            setSaleQuantity('');
                                            e.target.select();
                                        }}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-orange-500 text-slate-900 dark:text-white"
                                    />
                                </div>


                                {/* Payment Method Toggle */}
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">طريقة الدفع والتسديد <span className="text-rose-500">*</span></label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSalePaymentMethod('cash')}
                                            className={`flex-1 py-3 text-xs font-black rounded-xl transition-all border flex items-center justify-center gap-2 ${salePaymentMethod === 'cash' ? 'bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-600/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                        >
                                            <Wallet size={16} />
                                            <span>مدفوع نقدي</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSalePaymentMethod('credit')}
                                            className={`flex-1 py-3 text-xs font-black rounded-xl transition-all border flex items-center justify-center gap-2 ${salePaymentMethod === 'credit' ? 'bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-600/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                        >
                                            <Receipt size={16} />
                                            <span>تسجيل كدين (آجل)</span>
                                        </button>
                                    </div>
                                </div>

                                {saleCategoryId && saleDistributorId && saleQuantity && (() => {
                                    const cat = categories.find(c => c.id === saleCategoryId);
                                    const dist = distributors.find(d => d.id === saleDistributorId);
                                    const qty = parseInt(saleQuantity) || 0;
                                    if (cat && dist && qty > 0) {
                                        const unitPrice = cat.wholesalePrice || 0;
                                        const total = unitPrice * qty;
                                        return (
                                            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800/30 space-y-3">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-slate-500 dark:text-slate-400">الإجمالي:</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">{total.toLocaleString()} ريال يمني</span>
                                                </div>
                                                <div className="pt-2 border-t border-orange-200/50 dark:border-orange-800/50 flex justify-between items-center">
                                                    <span className="font-black text-slate-800 dark:text-slate-200 text-sm">المبلغ المطلوب ({salePaymentMethod === 'cash' ? 'يضاف للصندوق' : 'يسجل كدين'}):</span>
                                                    <span className="font-black text-orange-600 dark:text-orange-400 text-sm">{total.toLocaleString()} ريال يمني</span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <button
                                        type="submit"
                                        className={`w-full py-3.5 rounded-2xl font-black text-white text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${
                                            saleIsReturn 
                                            ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30' 
                                            : 'bg-orange-600 hover:bg-orange-700 shadow-orange-600/30'
                                        }`}
                                    >
                                        <CheckCircle2 size={18} />
                                        <span>{saleIsReturn ? 'تأكيد المرتجع' : 'تأكيد الفاتورة وخصم المخزون'}</span>
                                    </button>
                                </div>
                            </form>
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
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">الدين السابق (ريال يمني)</label>
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



            {/* SECTION 4: المبيعات الشهرية (Monthly Sales Report) */}
            {activeSection === 'monthly_sales' && (
                <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-200" dir="rtl">
                    {/* Header Bar */}
                    <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
                                <TrendingUp size={20} />
                            </div>
                            <div>
                                <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">تقرير المبيعات الشهرية لكروت الشبكة</h2>
                                <p className="text-[10px] sm:text-[11px] font-bold text-slate-400">إحصائيات المبيعات النقدية والآجلة وتوزيع الفئات وسجل الفواتير</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 flex-1 sm:flex-none">
                                <Calendar size={14} className="text-slate-400" />
                                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">الشهر:</span>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="bg-transparent text-xs font-black text-slate-900 dark:text-white outline-none cursor-pointer"
                                />
                            </div>
                            <button
                                onClick={handleExportMonthlyPDF}
                                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition shrink-0 active:scale-95"
                                title="تصدير PDF"
                            >
                                <Printer size={15} />
                                <span className="inline">تصدير PDF</span>
                            </button>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                            <span className="text-[10px] sm:text-[11px] font-black text-slate-400">كروت مبيعات نقدية</span>
                            <div className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">{totalMonthCashQty.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">كارت</span></div>
                            <div className="text-[11px] font-bold text-slate-500 font-mono mt-0.5">{totalMonthCashNet.toLocaleString()} ر.ي</div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                            <span className="text-[10px] sm:text-[11px] font-black text-slate-400">كروت مبيعات آجلة</span>
                            <div className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">{totalMonthCreditQty.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">كارت</span></div>
                            <div className="text-[11px] font-bold text-slate-500 font-mono mt-0.5">{totalMonthCreditNet.toLocaleString()} ر.ي</div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                            <span className="text-[10px] sm:text-[11px] font-black text-slate-400">إجمالي الكروت المباعة</span>
                            <div className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">{totalMonthOverallQty.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">كارت</span></div>
                            <div className="text-[11px] font-bold text-slate-500 font-mono mt-0.5">{monthlyGroupedSalesInvoices.length} فاتورة مسجلة</div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                            <span className="text-[10px] sm:text-[11px] font-black text-slate-400">إجمالي صافي المبيعات</span>
                            <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1 font-mono">{totalMonthOverallNet.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">ر.ي</span></div>
                            <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">شهر {selectedMonth}</div>
                        </div>
                    </div>

                    {/* View Switcher Tabs */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-[11px] sm:text-xs font-black">
                        <button
                            onClick={() => setMonthlySalesTab('categories')}
                            className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition ${
                                monthlySalesTab === 'categories'
                                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <BarChart3 size={14} className="shrink-0" />
                            <span className="truncate">جدول فئات الكروت</span>
                        </button>
                        <button
                            onClick={() => setMonthlySalesTab('invoices')}
                            className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition ${
                                monthlySalesTab === 'invoices'
                                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <Receipt size={14} className="shrink-0" />
                            <span className="truncate">سجل الفواتير ({monthlyGroupedSalesInvoices.length})</span>
                        </button>
                        <button
                            onClick={() => setMonthlySalesTab('distributors')}
                            className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition ${
                                monthlySalesTab === 'distributors'
                                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <Users size={14} className="shrink-0" />
                            <span className="truncate">سحب الموزعين</span>
                        </button>
                    </div>

                    {/* TAB 1: Categories Full Width Structured Table matching CardCashboxSection */}
                    {monthlySalesTab === 'categories' && (
                        <div className="-mx-4 sm:-mx-6 lg:-mx-8 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-in fade-in duration-150">
                            {monthlyCategoryReport.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 font-bold text-xs">
                                    لا توجد مبيعات مسجلة في هذا الشهر حتى الآن.
                                </div>
                            ) : (
                                <div className="w-full">
                                    <table className="w-full text-right text-[11px] sm:text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                                            <tr>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-3 font-black text-center w-6 sm:w-10 hidden sm:table-cell">#</th>
                                                <th className="py-2.5 sm:py-3.5 px-1.5 sm:px-3 font-black">فئة الكرت</th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                    <span className="hidden sm:inline">مبيعات نقدية</span>
                                                    <span className="sm:hidden">نقدي</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                    <span className="hidden sm:inline">مبيعات آجلة</span>
                                                    <span className="sm:hidden">آجل</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                    <span className="hidden sm:inline">إجمالي الكروت</span>
                                                    <span className="sm:hidden">العدد</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1.5 sm:px-3 font-black text-left">
                                                    <span className="hidden sm:inline">إجمالي الصافي</span>
                                                    <span className="sm:hidden">الصافي</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center w-10 sm:w-24 hidden sm:table-cell">النسبة</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                                            {monthlyCategoryReport.map((r, idx) => {
                                                const percent = totalMonthOverallNet > 0 ? (r.totalAmount / totalMonthOverallNet) * 100 : 0;
                                                return (
                                                    <tr key={r.categoryName} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition font-bold">
                                                        <td className="py-2.5 px-1 text-center font-mono text-slate-400 text-[10px] sm:text-[11px] hidden sm:table-cell">{idx + 1}</td>
                                                        <td className="py-2.5 px-1.5 sm:px-3 text-right">
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-1.5 h-4 bg-emerald-500 rounded-full shrink-0" />
                                                                <span className="font-black text-slate-900 dark:text-white text-[10px] sm:text-sm truncate block">{r.categoryName}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center">
                                                            <div className="flex flex-col items-center leading-tight">
                                                                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-[10px] sm:text-xs">{r.cashQty}</span>
                                                                <span className="hidden sm:block text-[9px] sm:text-[10px] text-slate-400 font-mono">{r.cashAmountTotal.toFixed(0)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center">
                                                            <div className="flex flex-col items-center leading-tight">
                                                                <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-[10px] sm:text-xs">{r.creditQty}</span>
                                                                <span className="hidden sm:block text-[9px] sm:text-[10px] text-slate-400 font-mono">{r.creditAmountTotal.toFixed(0)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center">
                                                            <span className="inline-block px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-mono font-black text-[10px] sm:text-xs border border-indigo-100 dark:border-indigo-900/30">
                                                                {r.totalQty}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-1.5 sm:px-3 text-left">
                                                            <span className="font-mono font-black text-slate-900 dark:text-white text-[10px] sm:text-xs whitespace-nowrap">
                                                                {r.totalAmount.toFixed(0)}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center hidden sm:table-cell">
                                                            <div className="flex flex-col items-center gap-0.5">
                                                                <span className="font-mono font-bold text-[10px] text-slate-600 dark:text-slate-400">{percent.toFixed(1)}%</span>
                                                                <div className="hidden sm:block w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(percent, 100)}%` }} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700 font-black text-[11px] sm:text-xs">
                                            <tr>
                                                <td colSpan={2} className="py-2.5 sm:py-3.5 px-2 sm:px-4 text-slate-900 dark:text-white hidden sm:table-cell"></td>
                                                <td className="py-2.5 sm:py-3.5 px-2 sm:px-4 text-slate-900 dark:text-white sm:text-right">
                                                    <span className="hidden sm:inline">الإجمالي العام لشهر {selectedMonth}</span>
                                                    <span className="sm:hidden text-[10px]">الإجمالي العام</span>
                                                </td>
                                                <td className="py-2.5 sm:py-3.5 px-1 sm:px-2 text-center text-emerald-600 dark:text-emerald-400 font-mono">
                                                    <div>{totalMonthCashQty}</div>
                                                    <div className="hidden sm:block text-[9px] sm:text-[10px] font-mono">{totalMonthCashNet.toFixed(0)}</div>
                                                </td>
                                                <td className="py-2.5 sm:py-3.5 px-1 sm:px-2 text-center text-amber-600 dark:text-amber-400 font-mono">
                                                    <div>{totalMonthCreditQty}</div>
                                                    <div className="hidden sm:block text-[9px] sm:text-[10px] font-mono">{totalMonthCreditNet.toFixed(0)}</div>
                                                </td>
                                                <td className="py-2.5 sm:py-3.5 px-1 sm:px-2 text-center text-indigo-600 dark:text-indigo-400 font-mono text-[11px] sm:text-sm">
                                                    {totalMonthOverallQty}
                                                </td>
                                                <td className="py-2.5 sm:py-3.5 px-1.5 sm:px-3 text-left font-mono text-slate-950 dark:text-white text-[11px] sm:text-sm whitespace-nowrap">
                                                    {totalMonthOverallNet.toFixed(0)}
                                                </td>
                                                <td className="py-2.5 sm:py-3.5 px-1 sm:px-2 text-center text-slate-400 font-mono text-[10px] sm:text-xs hidden sm:table-cell">100%</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: Monthly Invoices Log matching CardSalesSection & CardCashboxSection */}
                    {monthlySalesTab === 'invoices' && (
                        <div className="space-y-3 animate-in fade-in duration-150">
                            {/* Search bar */}
                            <div className="relative">
                                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="بحث برقم الفاتورة، اسم الموزع، الفئة..."
                                    value={monthlySalesSearch}
                                    onChange={(e) => setMonthlySalesSearch(e.target.value)}
                                    className="w-full pr-10 pl-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold outline-none focus:border-emerald-600 text-slate-900 dark:text-white"
                                />
                            </div>

                            {(() => {
                                const q = monthlySalesSearch.toLowerCase().trim();
                                const filtered = monthlyGroupedSalesInvoices.filter(inv => {
                                    if (!q) return true;
                                    return (
                                        inv.invoiceNumber.toLowerCase().includes(q) ||
                                        inv.distributorName.toLowerCase().includes(q) ||
                                        inv.items.some(it => it.categoryName.toLowerCase().includes(q))
                                    );
                                });

                                if (filtered.length === 0) {
                                    return (
                                        <div className="-mx-4 sm:-mx-6 bg-white dark:bg-slate-900 p-8 text-center text-slate-400 font-bold border-y border-slate-200 dark:border-slate-800 text-xs">
                                            لا توجد فواتير مطابقة للبحث في هذا الشهر.
                                        </div>
                                    );
                                }

                                return (
                                    <div className="-mx-4 sm:-mx-6 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                        {filtered.map(inv => {
                                            const isExp = !!expandedMonthlySalesInvoices[inv.invoiceNumber];
                                            return (
                                                <div key={inv.invoiceNumber} className="transition">
                                                    <div className="p-3 sm:p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black text-xs ${
                                                                inv.paymentType === 'cash'
                                                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40'
                                                                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40'
                                                            }`}>
                                                                {inv.paymentType === 'cash' ? 'نقد' : 'أجل'}
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">#{inv.invoiceNumber}</span>
                                                                    <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">- {inv.distributorName}</span>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold mt-0.5">
                                                                    <span>{inv.dateTime}</span>
                                                                    <span>•</span>
                                                                    <span>بواسطة: {inv.userName}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                                                            <div className="text-right sm:text-left">
                                                                <span className="block text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white">{inv.totalAmount.toFixed(2)} ر.ي</span>
                                                                <span className="block text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{inv.totalQuantity} كارت ({inv.items.length} صنف)</span>
                                                            </div>

                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    onClick={() => {
                                                                        const invoiceObj: InvoicePdfInput = {
                                                                            id: inv.id,
                                                                            invoiceNumber: inv.invoiceNumber,
                                                                            type: 'sale',
                                                                            totalAmount: inv.totalAmount,
                                                                            paymentType: inv.paymentType,
                                                                            partyName: inv.distributorName,
                                                                            dateTime: inv.dateTime,
                                                                            userName: inv.userName,
                                                                            status: inv.status,
                                                                            items: inv.items.map(it => ({
                                                                                categoryName: it.categoryName,
                                                                                quantity: it.quantity,
                                                                                unitPrice: it.unitPrice,
                                                                                totalAmount: it.totalAmount
                                                                            }))
                                                                        };
                                                                        setActionModalInvoice(invoiceObj);
                                                                        setActionModalOpen(true);
                                                                    }}
                                                                    className="p-2 text-slate-500 hover:text-emerald-600 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-xl transition"
                                                                    title="عرض وطباعة الفاتورة"
                                                                >
                                                                    <Eye size={15} />
                                                                </button>
                                                                <button
                                                                    onClick={() => setExpandedMonthlySalesInvoices(prev => ({ ...prev, [inv.invoiceNumber]: !isExp }))}
                                                                    className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-800 rounded-xl transition"
                                                                    title="تفاصيل الأصناف"
                                                                >
                                                                    {isExp ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Items Table */}
                                                    {isExp && (
                                                        <div className="bg-slate-50 dark:bg-slate-950/50 p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800">
                                                            <table className="w-full text-right text-[11px]">
                                                                <thead>
                                                                    <tr className="text-slate-500 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                                                                        <th className="pb-1.5 px-2">#</th>
                                                                        <th className="pb-1.5 px-2">فئة الكرت</th>
                                                                        <th className="pb-1.5 px-2 text-center">الكمية</th>
                                                                        <th className="pb-1.5 px-2 text-center">سعر الوحدة</th>
                                                                        <th className="pb-1.5 px-2 text-left">الإجمالي</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                                                    {inv.items.map((it, iIdx) => (
                                                                        <tr key={iIdx} className="font-bold text-slate-800 dark:text-slate-200">
                                                                            <td className="py-1.5 px-2 text-slate-400 font-mono">{iIdx + 1}</td>
                                                                            <td className="py-1.5 px-2">{it.categoryName}</td>
                                                                            <td className="py-1.5 px-2 text-center font-mono text-indigo-600 dark:text-indigo-400">{it.quantity} كارت</td>
                                                                            <td className="py-1.5 px-2 text-center font-mono">{it.unitPrice.toFixed(2)} ر.ي</td>
                                                                            <td className="py-1.5 px-2 text-left font-mono font-black">{it.totalAmount.toFixed(2)} ر.ي</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* TAB 3: Top Distributors Structured Table */}
                    {monthlySalesTab === 'distributors' && (() => {
                        const monthDistSales = filteredMonthSales.filter(s => s.saleType === 'distributor' || s.distributorName);
                        if (monthDistSales.length === 0) {
                            return (
                                <div className="-mx-4 sm:-mx-6 bg-white dark:bg-slate-900 p-8 text-center text-slate-400 font-bold border-y border-slate-200 dark:border-slate-800 text-xs">
                                    لا توجد مبيعات موزعين مسجلة في هذا الشهر حتى الآن.
                                </div>
                            );
                        }
                        
                        const distMap = new Map<string, { name: string; cashQty: number; creditQty: number; totalQty: number; cashNet: number; creditNet: number; totalNet: number }>();
                        monthDistSales.forEach(s => {
                            const name = s.distributorName || 'مبيعات مباشرة';
                            if (!distMap.has(name)) {
                                distMap.set(name, { name, cashQty: 0, creditQty: 0, totalQty: 0, cashNet: 0, creditNet: 0, totalNet: 0 });
                            }
                            const entry = distMap.get(name)!;
                            const qty = Number(s.quantity) || 0;
                            const net = Number(s.netTotal) || 0;
                            entry.totalQty += qty;
                            entry.totalNet += net;
                            if (s.paymentType === 'cash') {
                                entry.cashQty += qty;
                                entry.cashNet += net;
                            } else {
                                entry.creditQty += qty;
                                entry.creditNet += net;
                            }
                        });

                        const sortedDistributors = Array.from(distMap.values()).sort((a, b) => b.totalNet - a.totalNet);

                        return (
                            <div className="-mx-4 sm:-mx-6 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-in fade-in duration-150">
                                <div className="w-full">
                                    <table className="w-full text-right text-[11px] sm:text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-black">
                                            <tr>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-3 font-black w-6 sm:w-10 text-center">#</th>
                                                <th className="py-2.5 sm:py-3.5 px-1.5 sm:px-3 font-black">الموزع</th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                    <span className="hidden sm:inline">سحب نقدي</span>
                                                    <span className="sm:hidden">نقدي</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                    <span className="hidden sm:inline">سحب آجل</span>
                                                    <span className="sm:hidden">آجل</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                    <span className="hidden sm:inline">إجمالي الكروت</span>
                                                    <span className="sm:hidden">العدد</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1.5 sm:px-3 font-black text-left">
                                                    <span className="hidden sm:inline">إجمالي المبالغ</span>
                                                    <span className="sm:hidden">المبلغ</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center w-10 sm:w-24">النسبة</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                                            {sortedDistributors.map((d, idx) => {
                                                const sharePercent = totalMonthOverallNet > 0 ? (d.totalNet / totalMonthOverallNet) * 100 : 0;
                                                return (
                                                    <tr key={d.name} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition font-bold">
                                                        <td className="py-2.5 px-1 text-center">
                                                            <span className={`inline-flex items-center justify-center w-5 h-5 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-xs ${
                                                                idx === 0
                                                                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                                                                    : idx === 1
                                                                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                                                    : idx === 2
                                                                    ? 'bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-400'
                                                                    : 'text-slate-400 font-mono'
                                                            }`}>
                                                                #{idx + 1}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-1.5 sm:px-3">
                                                            <span className="font-black text-slate-900 dark:text-white text-[11px] sm:text-sm truncate block">{d.name}</span>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center">
                                                            <div className="flex flex-col items-center leading-tight">
                                                                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-[10px] sm:text-xs">{d.cashQty}</span>
                                                                <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono">{d.cashNet.toFixed(0)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center">
                                                            <div className="flex flex-col items-center leading-tight">
                                                                <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-[10px] sm:text-xs">{d.creditQty}</span>
                                                                <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono">{d.creditNet.toFixed(0)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center">
                                                            <span className="inline-block px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-mono font-black text-[10px] sm:text-xs">
                                                                {d.totalQty}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-1.5 sm:px-3 text-left">
                                                            <span className="font-mono font-black text-slate-900 dark:text-white text-[10px] sm:text-xs whitespace-nowrap">
                                                                {d.totalNet.toFixed(2)}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center">
                                                            <div className="flex flex-col items-center gap-0.5">
                                                                <span className="font-mono font-bold text-[10px] text-slate-600 dark:text-slate-400">{sharePercent.toFixed(1)}%</span>
                                                                <div className="hidden sm:block w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.min(sharePercent, 100)}%` }} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* SECTION 4.5: المشتريات الشهرية (Monthly Purchases Report) */}
            {activeSection === 'monthly_purchases' && (() => {
                const filteredMonthPurchases = purchases.filter(p => {
                    const matchM = p.month === selectedPurchaseMonth || (p.date && p.date.startsWith(selectedPurchaseMonth)) || (p.dateTime && p.dateTime.startsWith(selectedPurchaseMonth));
                    if (!matchM) return false;
                    return p.status === 'completed' || !p.status;
                });

                const totalMonthPurchasesCashQty = filteredMonthPurchases.filter(p => p.paymentType === 'cash').reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
                const totalMonthPurchasesCreditQty = filteredMonthPurchases.filter(p => p.paymentType === 'credit').reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
                const totalMonthPurchasesCashNet = filteredMonthPurchases.filter(p => p.paymentType === 'cash').reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
                const totalMonthPurchasesCreditNet = filteredMonthPurchases.filter(p => p.paymentType === 'credit').reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
                const totalMonthPurchasesOverallQty = totalMonthPurchasesCashQty + totalMonthPurchasesCreditQty;
                const totalMonthPurchasesOverallNet = totalMonthPurchasesCashNet + totalMonthPurchasesCreditNet;

                // Monthly Grouped Purchase Invoices
                const monthlyGroupedPurchaseInvoices = (() => {
                    const invoiceMap = new Map<string, {
                        id: string;
                        invoiceNumber: string;
                        supplierName: string;
                        supplierId?: string;
                        paymentType: 'cash' | 'credit';
                        totalAmount: number;
                        totalQuantity: number;
                        dateTime: string;
                        date: string;
                        userName: string;
                        status?: string;
                        items: Array<{
                            categoryName: string;
                            quantity: number;
                            unitCost: number;
                            totalAmount: number;
                        }>;
                    }>();

                    filteredMonthPurchases.forEach(p => {
                        const invNum = p.invoiceNumber ? `${p.invoiceNumber}` : `PUR-${p.id.slice(-5)}`;
                        if (!invoiceMap.has(invNum)) {
                            invoiceMap.set(invNum, {
                                id: p.id,
                                invoiceNumber: invNum,
                                supplierName: p.supplierName || 'مورد نقدي',
                                supplierId: p.supplierId,
                                paymentType: p.paymentType || 'cash',
                                totalAmount: 0,
                                totalQuantity: 0,
                                dateTime: p.dateTime || p.date || '',
                                date: p.date || '',
                                userName: p.userName || 'المدير',
                                status: p.status,
                                items: []
                            });
                        }

                        const inv = invoiceMap.get(invNum)!;
                        const itemQty = Number(p.quantity) || 0;
                        const itemNet = Number(p.totalAmount) || 0;
                        const itemCost = Number(p.costPrice || (itemQty > 0 ? itemNet / itemQty : 0));

                        inv.totalQuantity += itemQty;
                        inv.totalAmount += itemNet;
                        inv.items.push({
                            categoryName: p.categoryName || 'غير محدد',
                            quantity: itemQty,
                            unitCost: itemCost,
                            totalAmount: itemNet
                        });
                    });

                    return Array.from(invoiceMap.values()).sort((a, b) => (b.dateTime || '').localeCompare(a.dateTime || ''));
                })();

                const uniqueCategoriesForPurchases: CardCategory[] = [];
                const seenPurchaseCatKeys = new Set<string>();

                categories.forEach(c => {
                    if (!c.name || !c.name.trim()) return;
                    const normName = c.name.trim().toLowerCase();
                    const key = c.id ? `id_${c.id}` : `name_${normName}`;
                    if (!seenPurchaseCatKeys.has(key) && !seenPurchaseCatKeys.has(`name_${normName}`)) {
                        seenPurchaseCatKeys.add(key);
                        seenPurchaseCatKeys.add(`name_${normName}`);
                        uniqueCategoriesForPurchases.push(c);
                    }
                });

                const monthlyCategoryPurchaseReport = uniqueCategoriesForPurchases.map(cat => {
                    const catNameTrim = (cat.name || '').trim().toLowerCase();
                    const catPurchases = filteredMonthPurchases.filter(p => {
                        if (p.categoryId && cat.id && p.categoryId === cat.id) return true;
                        if (p.categoryName) {
                            return p.categoryName.trim().toLowerCase() === catNameTrim;
                        }
                        return false;
                    });

                    const cashPurchases = catPurchases.filter(p => p.paymentType === 'cash');
                    const creditPurchases = catPurchases.filter(p => p.paymentType === 'credit');

                    const cashQty = cashPurchases.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
                    const creditQty = creditPurchases.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);
                    const cashAmountTotal = cashPurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
                    const creditAmountTotal = creditPurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);

                    return {
                        categoryName: cat.name.trim(),
                        cashQty,
                        creditQty,
                        totalQty: cashQty + creditQty,
                        cashAmountTotal,
                        creditAmountTotal,
                        totalAmount: cashAmountTotal + creditAmountTotal
                    };
                });

                const handleExportMonthlyPurchasesPDF = () => {
                    const title = `تقرير المشتريات الشهرية لكروت الشبكة - شهر ${selectedPurchaseMonth}`;
                    const headers = ['فئة الكروت', 'الكروت النقدية', 'الكروت الآجلة', 'إجمالي العدد', 'مجموع النقدية', 'مجموع الآجلة', 'الصافي الإجمالي'];
                    const data = monthlyCategoryPurchaseReport.map(r => [
                        r.categoryName,
                        `${r.cashQty}`,
                        `${r.creditQty}`,
                        `${r.totalQty}`,
                        `${r.cashAmountTotal.toFixed(2)} ريال يمني`,
                        `${r.creditAmountTotal.toFixed(2)} ريال يمني`,
                        `${r.totalAmount.toFixed(2)} ريال يمني`
                    ]);
                    data.push([
                        'الإجمالي العام',
                        `${totalMonthPurchasesCashQty}`,
                        `${totalMonthPurchasesCreditQty}`,
                        `${totalMonthPurchasesOverallQty}`,
                        `${totalMonthPurchasesCashNet.toFixed(2)} ريال يمني`,
                        `${totalMonthPurchasesCreditNet.toFixed(2)} ريال يمني`,
                        `${totalMonthPurchasesOverallNet.toFixed(2)} ريال يمني`
                    ]);
                    printReport(title, headers, data);
                };

                return (
                    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-200" dir="rtl">
                        {/* Header Bar */}
                        <div className="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black">
                                    <Truck size={20} />
                                </div>
                                <div>
                                    <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">تقرير المشتريات الشهرية لكروت الشبكة</h2>
                                    <p className="text-[10px] sm:text-[11px] font-bold text-slate-400">إحصائيات المشتريات وتوريدات الكروت والموردين وسجل الفواتير</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 flex-1 sm:flex-none">
                                    <Calendar size={14} className="text-slate-400" />
                                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">الشهر:</span>
                                    <input
                                        type="month"
                                        value={selectedPurchaseMonth}
                                        onChange={(e) => setSelectedPurchaseMonth(e.target.value)}
                                        className="bg-transparent text-xs font-black text-slate-900 dark:text-white outline-none cursor-pointer"
                                    />
                                </div>
                                <button
                                    onClick={handleExportMonthlyPurchasesPDF}
                                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 transition shrink-0 active:scale-95"
                                    title="تصدير PDF"
                                >
                                    <Printer size={15} />
                                    <span className="inline">تصدير PDF</span>
                                </button>
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                                <span className="text-[10px] sm:text-[11px] font-black text-slate-400">كروت مشتريات نقدي</span>
                                <div className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">{totalMonthPurchasesCashQty.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">كارت</span></div>
                                <div className="text-[11px] font-bold text-slate-500 font-mono mt-0.5">{totalMonthPurchasesCashNet.toLocaleString()} ر.ي</div>
                            </div>
                            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                                <span className="text-[10px] sm:text-[11px] font-black text-slate-400">كروت مشتريات أجل</span>
                                <div className="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-1">{totalMonthPurchasesCreditQty.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">كارت</span></div>
                                <div className="text-[11px] font-bold text-slate-500 font-mono mt-0.5">{totalMonthPurchasesCreditNet.toLocaleString()} ر.ي</div>
                            </div>
                            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                                <span className="text-[10px] sm:text-[11px] font-black text-slate-400">إجمالي الكروت المشتراة</span>
                                <div className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 mt-1">{totalMonthPurchasesOverallQty.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">كارت</span></div>
                                <div className="text-[11px] font-bold text-slate-500 font-mono mt-0.5">{monthlyGroupedPurchaseInvoices.length} فاتورة توريد</div>
                            </div>
                            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                                <span className="text-[10px] sm:text-[11px] font-black text-slate-400">إجمالي تكلفة المشتريات</span>
                                <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-1 font-mono">{totalMonthPurchasesOverallNet.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">ر.ي</span></div>
                                <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 font-mono mt-0.5">شهر {selectedPurchaseMonth}</div>
                            </div>
                        </div>

                        {/* View Switcher Tabs */}
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-[11px] sm:text-xs font-black">
                            <button
                                onClick={() => setMonthlyPurchasesTab('categories')}
                                className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition ${
                                    monthlyPurchasesTab === 'categories'
                                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                <BarChart3 size={14} className="shrink-0" />
                                <span className="truncate">جدول فئات المشتريات</span>
                            </button>
                            <button
                                onClick={() => setMonthlyPurchasesTab('invoices')}
                                className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition ${
                                    monthlyPurchasesTab === 'invoices'
                                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                <Receipt size={14} className="shrink-0" />
                                <span className="truncate">سجل الفواتير ({monthlyGroupedPurchaseInvoices.length})</span>
                            </button>
                            <button
                                onClick={() => setMonthlyPurchasesTab('suppliers')}
                                className={`flex-1 py-1.5 sm:py-2 px-2 sm:px-3 rounded-xl flex items-center justify-center gap-1.5 transition ${
                                    monthlyPurchasesTab === 'suppliers'
                                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                <Truck size={14} className="shrink-0" />
                                <span className="truncate">أكثر الموردين توريداً</span>
                            </button>
                        </div>

                        {/* TAB 1: Categories Full Width Structured Table */}
                        {monthlyPurchasesTab === 'categories' && (
                            <div className="-mx-4 sm:-mx-6 lg:-mx-8 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-in fade-in duration-150">
                                {monthlyCategoryPurchaseReport.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 font-bold text-xs">
                                        لا توجد مشتريات مسجلة في هذا الشهر حتى الآن.
                                    </div>
                                ) : (
                                    <div className="w-full">
                                        <table className="w-full text-right text-[11px] sm:text-xs">
                                            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
                                                <tr>
                                                    <th className="py-2.5 sm:py-3.5 px-1 sm:px-3 font-black text-center w-6 sm:w-10 hidden sm:table-cell">#</th>
                                                    <th className="py-2.5 sm:py-3.5 px-1.5 sm:px-3 font-black text-right">فئة الكرت</th>
                                                    <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                        <span className="hidden sm:inline">مشتريات نقدية</span>
                                                        <span className="sm:hidden">نقدي</span>
                                                    </th>
                                                    <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                        <span className="hidden sm:inline">مشتريات آجلة</span>
                                                        <span className="sm:hidden">آجل</span>
                                                    </th>
                                                    <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                        <span className="hidden sm:inline">إجمالي الكروت</span>
                                                        <span className="sm:hidden">العدد</span>
                                                    </th>
                                                    <th className="py-2.5 sm:py-3.5 px-1.5 sm:px-3 font-black text-left">
                                                        <span className="hidden sm:inline">إجمالي التكلفة</span>
                                                        <span className="sm:hidden">التكلفة</span>
                                                    </th>
                                                    <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center w-10 sm:w-24 hidden sm:table-cell">النسبة</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                                                {monthlyCategoryPurchaseReport.map((r, idx) => {
                                                    const percent = totalMonthPurchasesOverallNet > 0 ? (r.totalAmount / totalMonthPurchasesOverallNet) * 100 : 0;
                                                    return (
                                                        <tr key={r.categoryName} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition font-bold">
                                                            <td className="py-2.5 px-1 text-center font-mono text-slate-400 text-[10px] sm:text-[11px] hidden sm:table-cell">{idx + 1}</td>
                                                            <td className="py-2.5 px-1.5 sm:px-3 text-right">
                                                                <div className="flex items-center gap-1.5">
                                                                    <div className="w-1.5 h-4 bg-indigo-500 rounded-full shrink-0" />
                                                                    <span className="font-black text-slate-900 dark:text-white text-[10px] sm:text-sm truncate block">{r.categoryName}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-2.5 px-1 sm:px-2 text-center">
                                                                <div className="flex flex-col items-center leading-tight">
                                                                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-[10px] sm:text-xs">{r.cashQty}</span>
                                                                    <span className="hidden sm:block text-[9px] sm:text-[10px] text-slate-400 font-mono">{r.cashAmountTotal.toFixed(0)}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-2.5 px-1 sm:px-2 text-center">
                                                                <div className="flex flex-col items-center leading-tight">
                                                                    <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-[10px] sm:text-xs">{r.creditQty}</span>
                                                                    <span className="hidden sm:block text-[9px] sm:text-[10px] text-slate-400 font-mono">{r.creditAmountTotal.toFixed(0)}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-2.5 px-1 sm:px-2 text-center">
                                                                <span className="inline-block px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-mono font-black text-[10px] sm:text-xs border border-indigo-100 dark:border-indigo-900/30">
                                                                    {r.totalQty}
                                                                </span>
                                                            </td>
                                                            <td className="py-2.5 px-1.5 sm:px-3 text-left">
                                                                <span className="font-mono font-black text-slate-900 dark:text-white text-[10px] sm:text-xs whitespace-nowrap">
                                                                    {r.totalAmount.toFixed(0)}
                                                                </span>
                                                            </td>
                                                            <td className="py-2.5 px-1 sm:px-2 text-center hidden sm:table-cell">
                                                                <div className="flex flex-col items-center gap-0.5">
                                                                    <span className="font-mono font-bold text-[10px] text-slate-600 dark:text-slate-400">{percent.toFixed(1)}%</span>
                                                                    <div className="hidden sm:block w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(percent, 100)}%` }} />
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot className="bg-slate-100/80 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-700 font-black text-[11px] sm:text-xs">
                                                <tr>
                                                    <td colSpan={2} className="py-2.5 sm:py-3.5 px-2 sm:px-4 text-slate-900 dark:text-white hidden sm:table-cell"></td>
                                                    <td className="py-2.5 sm:py-3.5 px-2 sm:px-4 text-slate-900 dark:text-white sm:text-right">
                                                        <span className="hidden sm:inline">إجمالي مشتريات شهر {selectedPurchaseMonth}</span>
                                                        <span className="sm:hidden text-[10px]">إجمالي المشتريات</span>
                                                    </td>
                                                    <td className="py-2.5 sm:py-3.5 px-1 sm:px-2 text-center text-emerald-600 dark:text-emerald-400 font-mono">
                                                        <div>{totalMonthPurchasesCashQty}</div>
                                                        <div className="hidden sm:block text-[9px] sm:text-[10px] font-mono">{totalMonthPurchasesCashNet.toFixed(0)}</div>
                                                    </td>
                                                    <td className="py-2.5 sm:py-3.5 px-1 sm:px-2 text-center text-amber-600 dark:text-amber-400 font-mono">
                                                        <div>{totalMonthPurchasesCreditQty}</div>
                                                        <div className="hidden sm:block text-[9px] sm:text-[10px] font-mono">{totalMonthPurchasesCreditNet.toFixed(0)}</div>
                                                    </td>
                                                    <td className="py-2.5 sm:py-3.5 px-1 sm:px-2 text-center text-indigo-600 dark:text-indigo-400 font-mono text-[11px] sm:text-sm">
                                                        {totalMonthPurchasesOverallQty}
                                                    </td>
                                                    <td className="py-2.5 sm:py-3.5 px-1.5 sm:px-3 text-left font-mono text-slate-950 dark:text-white text-[11px] sm:text-sm whitespace-nowrap">
                                                        {totalMonthPurchasesOverallNet.toFixed(0)}
                                                    </td>
                                                    <td className="py-2.5 sm:py-3.5 px-1 sm:px-2 text-center text-slate-400 font-mono text-[10px] sm:text-xs hidden sm:table-cell">100%</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                    {/* TAB 2: Monthly Purchase Invoices Log */}
                    {monthlyPurchasesTab === 'invoices' && (
                        <div className="space-y-3 animate-in fade-in duration-150">
                            <div className="relative">
                                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="بحث برقم الفاتورة، اسم المورد، الفئة..."
                                    value={monthlyPurchasesSearch}
                                    onChange={(e) => setMonthlyPurchasesSearch(e.target.value)}
                                    className="w-full pr-10 pl-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold outline-none focus:border-indigo-600 text-slate-900 dark:text-white"
                                />
                            </div>

                            {(() => {
                                const q = monthlyPurchasesSearch.toLowerCase().trim();
                                const filtered = monthlyGroupedPurchaseInvoices.filter(inv => {
                                    if (!q) return true;
                                    return (
                                        inv.invoiceNumber.toLowerCase().includes(q) ||
                                        inv.supplierName.toLowerCase().includes(q) ||
                                        inv.items.some(it => it.categoryName.toLowerCase().includes(q))
                                    );
                                });

                                if (filtered.length === 0) {
                                    return (
                                        <div className="-mx-4 sm:-mx-6 bg-white dark:bg-slate-900 p-8 text-center text-slate-400 font-bold border-y border-slate-200 dark:border-slate-800 text-xs">
                                            لا توجد فواتير مشتريات مطابقة للبحث في هذا الشهر.
                                        </div>
                                    );
                                }

                                return (
                                    <div className="-mx-4 sm:-mx-6 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                        {filtered.map(inv => {
                                            const isExp = !!expandedMonthlyPurchaseInvoices[inv.invoiceNumber];
                                            return (
                                                <div key={inv.invoiceNumber} className="transition">
                                                    <div className="p-3 sm:p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black text-xs ${
                                                                inv.paymentType === 'cash'
                                                                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40'
                                                                    : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40'
                                                            }`}>
                                                                {inv.paymentType === 'cash' ? 'نقد' : 'أجل'}
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">#{inv.invoiceNumber}</span>
                                                                    <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">- {inv.supplierName}</span>
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold mt-0.5">
                                                                    <span>{inv.dateTime}</span>
                                                                    <span>•</span>
                                                                    <span>بواسطة: {inv.userName}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                                                            <div className="text-right sm:text-left">
                                                                <span className="block text-xs sm:text-sm font-black font-mono text-slate-900 dark:text-white">{inv.totalAmount.toFixed(2)} ر.ي</span>
                                                                <span className="block text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{inv.totalQuantity} كارت ({inv.items.length} صنف)</span>
                                                            </div>

                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    onClick={() => {
                                                                        const invoiceObj: InvoicePdfInput = {
                                                                            id: inv.id,
                                                                            invoiceNumber: inv.invoiceNumber,
                                                                            type: 'purchase',
                                                                            totalAmount: inv.totalAmount,
                                                                            paymentType: inv.paymentType,
                                                                            partyName: inv.supplierName,
                                                                            dateTime: inv.dateTime,
                                                                            userName: inv.userName,
                                                                            status: inv.status,
                                                                            items: inv.items.map(it => ({
                                                                                categoryName: it.categoryName,
                                                                                quantity: it.quantity,
                                                                                unitPrice: it.unitCost,
                                                                                totalAmount: it.totalAmount
                                                                            }))
                                                                        };
                                                                        setActionModalInvoice(invoiceObj);
                                                                        setActionModalOpen(true);
                                                                    }}
                                                                    className="p-2 text-slate-500 hover:text-indigo-600 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-xl transition"
                                                                    title="عرض وطباعة الفاتورة"
                                                                >
                                                                    <Eye size={15} />
                                                                </button>
                                                                <button
                                                                    onClick={() => setExpandedMonthlyPurchaseInvoices(prev => ({ ...prev, [inv.invoiceNumber]: !isExp }))}
                                                                    className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white bg-slate-50 dark:bg-slate-800 rounded-xl transition"
                                                                    title="تفاصيل الأصناف"
                                                                >
                                                                    {isExp ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Items Table */}
                                                    {isExp && (
                                                        <div className="bg-slate-50 dark:bg-slate-950/50 p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800">
                                                            <table className="w-full text-right text-[11px]">
                                                                <thead>
                                                                    <tr className="text-slate-500 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                                                                        <th className="pb-1.5 px-2">#</th>
                                                                        <th className="pb-1.5 px-2">فئة الكرت</th>
                                                                        <th className="pb-1.5 px-2 text-center">الكمية</th>
                                                                        <th className="pb-1.5 px-2 text-center">سعر التكلفة</th>
                                                                        <th className="pb-1.5 px-2 text-left">الإجمالي</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                                                    {inv.items.map((it, iIdx) => (
                                                                        <tr key={iIdx} className="font-bold text-slate-800 dark:text-slate-200">
                                                                            <td className="py-1.5 px-2 text-slate-400 font-mono">{iIdx + 1}</td>
                                                                            <td className="py-1.5 px-2">{it.categoryName}</td>
                                                                            <td className="py-1.5 px-2 text-center font-mono text-indigo-600 dark:text-indigo-400">{it.quantity} كارت</td>
                                                                            <td className="py-1.5 px-2 text-center font-mono">{it.unitCost.toFixed(2)} ر.ي</td>
                                                                            <td className="py-1.5 px-2 text-left font-mono font-black">{it.totalAmount.toFixed(2)} ر.ي</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* TAB 3: Top Suppliers Structured Table */}
                    {monthlyPurchasesTab === 'suppliers' && (() => {
                        const monthSuppPurchases = filteredMonthPurchases.filter(p => p.supplierName);
                        if (monthSuppPurchases.length === 0) {
                            return (
                                <div className="-mx-4 sm:-mx-6 bg-white dark:bg-slate-900 p-8 text-center text-slate-400 font-bold border-y border-slate-200 dark:border-slate-800 text-xs">
                                    لا توجد مشتريات موردين مسجلة في هذا الشهر حتى الآن.
                                </div>
                            );
                        }
                        
                        const suppMap = new Map<string, { name: string; cashQty: number; creditQty: number; totalQty: number; cashNet: number; creditNet: number; totalNet: number }>();
                        monthSuppPurchases.forEach(p => {
                            const name = p.supplierName || 'مورد نقدي';
                            if (!suppMap.has(name)) {
                                suppMap.set(name, { name, cashQty: 0, creditQty: 0, totalQty: 0, cashNet: 0, creditNet: 0, totalNet: 0 });
                            }
                            const entry = suppMap.get(name)!;
                            const qty = Number(p.quantity) || 0;
                            const net = Number(p.totalAmount) || 0;
                            entry.totalQty += qty;
                            entry.totalNet += net;
                            if (p.paymentType === 'cash') {
                                entry.cashQty += qty;
                                entry.cashNet += net;
                            } else {
                                entry.creditQty += qty;
                                entry.creditNet += net;
                            }
                        });

                        const sortedSuppliers = Array.from(suppMap.values()).sort((a, b) => b.totalNet - a.totalNet);

                        return (
                            <div className="-mx-4 sm:-mx-6 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-in fade-in duration-150">
                                <div className="w-full">
                                    <table className="w-full text-right text-[11px] sm:text-xs">
                                        <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-black">
                                            <tr>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-3 font-black w-6 sm:w-10 text-center">#</th>
                                                <th className="py-2.5 sm:py-3.5 px-1.5 sm:px-3 font-black">المورد</th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                    <span className="hidden sm:inline">توريد نقدي</span>
                                                    <span className="sm:hidden">نقدي</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                    <span className="hidden sm:inline">توريد آجل</span>
                                                    <span className="sm:hidden">آجل</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center">
                                                    <span className="hidden sm:inline">إجمالي الكروت</span>
                                                    <span className="sm:hidden">العدد</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1.5 sm:px-3 font-black text-left">
                                                    <span className="hidden sm:inline">إجمالي التكلفة</span>
                                                    <span className="sm:hidden">التكلفة</span>
                                                </th>
                                                <th className="py-2.5 sm:py-3.5 px-1 sm:px-2 font-black text-center w-10 sm:w-24">النسبة</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                                            {sortedSuppliers.map((d, idx) => {
                                                const sharePercent = totalMonthPurchasesOverallNet > 0 ? (d.totalNet / totalMonthPurchasesOverallNet) * 100 : 0;
                                                return (
                                                    <tr key={d.name} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition font-bold">
                                                        <td className="py-2.5 px-1 text-center">
                                                            <span className={`inline-flex items-center justify-center w-5 h-5 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl font-black text-[10px] sm:text-xs ${
                                                                idx === 0
                                                                    ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-800'
                                                                    : idx === 1
                                                                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                                                    : idx === 2
                                                                    ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-400'
                                                                    : 'text-slate-400 font-mono'
                                                            }`}>
                                                                #{idx + 1}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-1.5 sm:px-3">
                                                            <span className="font-black text-slate-900 dark:text-white text-[11px] sm:text-sm truncate block">{d.name}</span>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center">
                                                            <div className="flex flex-col items-center leading-tight">
                                                                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-[10px] sm:text-xs">{d.cashQty}</span>
                                                                <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono">{d.cashNet.toFixed(0)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center">
                                                            <div className="flex flex-col items-center leading-tight">
                                                                <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-[10px] sm:text-xs">{d.creditQty}</span>
                                                                <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono">{d.creditNet.toFixed(0)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center">
                                                            <span className="inline-block px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-mono font-black text-[10px] sm:text-xs">
                                                                {d.totalQty}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-1.5 sm:px-3 text-left">
                                                            <span className="font-mono font-black text-slate-900 dark:text-white text-[10px] sm:text-xs whitespace-nowrap">
                                                                {d.totalNet.toFixed(2)}
                                                            </span>
                                                        </td>
                                                        <td className="py-2.5 px-1 sm:px-2 text-center">
                                                            <div className="flex flex-col items-center gap-0.5">
                                                                <span className="font-mono font-bold text-[10px] text-slate-600 dark:text-slate-400">{sharePercent.toFixed(1)}%</span>
                                                                <div className="hidden sm:block w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(sharePercent, 100)}%` }} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })()}
                </div>
            );
        })()}

            {/* SECTION 5: صندوق المبيعات (Sales Cashbox) */}
            {activeSection === 'sales_cashbox' && (
                <CardCashboxSection
                    entries={cashboxEntries}
                    sales={sales}
                    purchases={purchases}
                    vouchers={vouchers}
                    purchaseVouchers={purchaseVouchers}
                    cashboxBalance={cashboxBalance}
                    canAdd={canAdd}
                    onOpenDepositWithdraw={() => setIsCashboxModalOpen(true)}
                    onDeleteEntry={handleDeleteCashboxEntry}
                    appUser={appUser}
                />
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

            {/* SECTION: مبيعات الكروت الفردية (Sales) */}
            {activeSection === 'card_sales_section' && (
                <CardSalesSection 
                    sales={sales}
                    onViewInvoice={(invoice) => {
                        setActionModalInvoice(invoice);
                        setActionModalOpen(true);
                    }}
                    onEditInvoice={getSecPermission('cards_sales_report', 'edit') ? handleEditSaleInvoice : undefined}
                    onCancelInvoice={getSecPermission('cards_sales_report', 'delete') ? handleCancelSaleInvoice : undefined}
                    appUser={appUser}
                />
            )}

            {/* SECTION: مشتريات الكروت الفردية (Purchases) */}
            {activeSection === 'card_purchases_section' && (
                <CardPurchasesSection 
                    purchases={purchases}
                    onViewInvoice={(invoice) => {
                        setActionModalInvoice(invoice);
                        setActionModalOpen(true);
                    }}
                    onEditInvoice={getSecPermission('cards_stock', 'edit') ? handleEditPurchaseInvoice : undefined}
                    onCancelInvoice={getSecPermission('cards_stock', 'delete') ? handleCancelPurchaseInvoice : undefined}
                    onOpenAddStock={canAdd ? () => setIsCardPurchaseModalOpen(true) : undefined}
                    onOpenExchangeStock={() => {
                        if (!getSecPermission('cards_exchanges', 'view') && !getSecPermission('cards_exchanges', 'add')) {
                            alert('عذراً، ليس لديك صلاحية استبدال الكروت.');
                            return;
                        }
                        setIsCardExchangeModalOpen(true);
                    }}
                    appUser={appUser}
                />
            )}

            {/* SECTION: مطابقة الأرصدة والمبيعات (Reconciliation & Audit) */}
            {activeSection === 'reconciliation' && (
                <CardReconciliationSection
                    categories={categories}
                    sales={sales}
                    purchases={purchases}
                    stockLogs={stockLogs}
                    distributors={distributors}
                    selectedMonth={selectedMonth}
                    onMonthChange={(m) => setSelectedMonth(m)}
                    onOpenSalesSection={() => setActiveSection('card_sales_section')}
                    onOpenPurchasesSection={() => setActiveSection('card_purchases_section')}
                />
            )}

            {/* MODAL: Category Create / Edit */}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
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
                <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
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
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">الدين السابق (ريال يمني)</label>
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
                <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
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
                                    onFocus={(e) => {
                                        setStockQtyInput('');
                                        e.target.select();
                                    }}
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


            {/* MODAL: Add/Edit Supplier */}
            {isSupplierModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="relative flex items-center justify-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-black text-slate-900 dark:text-white text-base text-center">
                                {editingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
                            </h3>
                            <button onClick={() => setIsSupplierModalOpen(false)} className="absolute left-0 text-slate-400 hover:text-slate-600 transition">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveSupplier} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">اسم المورد <span className="text-rose-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={supplierName}
                                    onChange={(e) => setSupplierName(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">رقم الهاتف</label>
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    value={supplierPhone}
                                    onChange={(e) => setSupplierPhone(e.target.value.replace(/\D/g, ''))}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            {!editingSupplier && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">الرصيد السابق (دين للمورد)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={supplierPreviousDebt}
                                        onChange={(e) => setSupplierPreviousDebt(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            )}
                            <button
                                type="submit"
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95 text-sm"
                            >
                                حفظ بيانات المورد
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Purchase Voucher */}
            {isPurchaseVoucherModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="relative flex items-center justify-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-black text-slate-900 dark:text-white text-base text-center">إنشاء سند للمورد</h3>
                            <button onClick={() => setIsPurchaseVoucherModalOpen(false)} className="absolute left-0 text-slate-400 hover:text-slate-600 transition">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSavePurchaseVoucher} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">نوع السند</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPurchaseVoucherType('payment')}
                                        className={`flex-1 py-2 text-xs font-black rounded-xl transition-all border ${purchaseVoucherType === 'payment' ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                    >
                                        صرف (سداد للمورد)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPurchaseVoucherType('receipt')}
                                        className={`flex-1 py-2 text-xs font-black rounded-xl transition-all border ${purchaseVoucherType === 'receipt' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                    >
                                        قبض (استرداد نقدية)
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">المورد <span className="text-rose-500">*</span></label>
                                <SearchableSelect
                                    required
                                    value={purchaseVoucherSupplierId}
                                    onChange={setPurchaseVoucherSupplierId}
                                    placeholder="اختر المورد..."
                                    options={suppliers.map(d => ({ id: d.id, label: d.name, subLabel: `الدين الحالي: ${(d.balance || 0).toFixed(2)}` }))}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">المبلغ (ريال) <span className="text-rose-500">*</span></label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    required
                                    value={purchaseVoucherAmountInput}
                                    onChange={(e) => setPurchaseVoucherAmountInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-left"
                                    placeholder="0.00"
                                    dir="ltr"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">البيان / ملاحظات</label>
                                <input
                                    type="text"
                                    value={purchaseVoucherNotesInput}
                                    onChange={(e) => setPurchaseVoucherNotesInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="مثال: دفعة من الحساب"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95 text-sm"
                            >
                                حفظ السند
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Distributor Voucher (سند قبض أو صرف) */}
            {isVoucherModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
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
                                <SearchableSelect
                                    required
                                    value={voucherDistributorId}
                                    onChange={setVoucherDistributorId}
                                    placeholder="اختر الموزع..."
                                    options={distributors.map(dist => ({ id: dist.id, label: dist.name, subLabel: `رصيد الدين الحالي: ${(dist.balance || 0).toFixed(2)} ريال` }))}
                                />
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
                <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
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
            {(saleModalCategory || isCardSaleModalOpen) && (
                <CardSaleModal
                    prefetchedCategories={categories}
                    prefetchedDistributors={distributors}
                    isOpen={!!saleModalCategory || isCardSaleModalOpen}
                    editingInvoice={editingCardSale}
                    onReverseInvoice={editingCardSale ? () => reverseCardInvoice(editingCardSale, 'sale', true) : undefined}
                    onClose={() => { setSaleModalCategory(null); setIsCardSaleModalOpen(false); setEditingCardSale(null); }}
                    categoryName={saleModalCategory || undefined}
                    onInvoiceCreated={(invoice) => {
                        setActionModalInvoice(invoice);
                        setActionModalOpen(true);
                    }}
                />
            )}

            {/* MODAL: Share Distributor Account */}
            {isShareModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center p-4">
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

            <CardPurchaseModal
                prefetchedCategories={categories}
                prefetchedSuppliers={suppliers}
                isOpen={isCardPurchaseModalOpen}
                isReturnOnly={purchaseModalIsReturnOnly}
                initialIsReturn={purchaseModalIsReturnOnly}
                editingInvoice={editingCardPurchase}
                onReverseInvoice={editingCardPurchase ? () => reverseCardInvoice(editingCardPurchase, 'purchase', true) : undefined}
                onClose={() => { 
                    setIsCardPurchaseModalOpen(false); 
                    setEditingCardPurchase(null); 
                    setPurchaseModalIsReturnOnly(false);
                }}
                onInvoiceCreated={(invoice) => {
                    setActionModalInvoice(invoice);
                    setActionModalOpen(true);
                }}
            />

            {confirmDialog && confirmDialog.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-700">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                {confirmDialog.title || 'تأكيد'}
                            </h3>
                            <p className="text-gray-600 dark:text-gray-300 text-sm mb-6 whitespace-pre-wrap">
                                {confirmDialog.message}
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={confirmDialog.onCancel}
                                    className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold py-2.5 rounded-xl transition-colors"
                                >
                                    تراجع
                                </button>
                                <button
                                    onClick={confirmDialog.onConfirm}
                                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl transition-colors"
                                >
                                    تأكيد الإلغاء
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <CardInvoiceActionModal
                isOpen={actionModalOpen}
                invoice={actionModalInvoice}
                onClose={() => {
                    setActionModalOpen(false);
                    setActionModalInvoice(null);
                }}
            />

            <CardExchangeModal
                isOpen={isCardExchangeModalOpen}
                categories={categories}
                onClose={() => setIsCardExchangeModalOpen(false)}
            />
        </div>
    );
}
