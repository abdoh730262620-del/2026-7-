import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Plus, Trash2, CheckCircle2, User, Phone, Search, CreditCard, DollarSign, Wifi, Star, RotateCcw, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, runTransaction, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { CardCategory, CardSupplier } from '../types/cardTypes';
import SearchableSelect from './SearchableSelect';
import { printReport } from '../lib/printHelper';
import { InvoicePdfInput } from '../lib/pdfHelper';

interface CardPurchaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    categoryName?: string;
    onSuccess?: () => void;
    onInvoiceCreated?: (invoice: InvoicePdfInput) => void;
    editingInvoice?: any;
    onReverseInvoice?: () => Promise<boolean>;
    prefetchedCategories?: CardCategory[];
    prefetchedSuppliers?: CardSupplier[];
    initialIsReturn?: boolean;
    isReturnOnly?: boolean;
}

interface CartItem {
    id: string;
    categoryId?: string;
    categoryName: string;
    unitPrice: number;
    quantity: number;
    totalAmount: number;
    availableStock: number;
}


export default function CardPurchaseModal({ isOpen, onClose, categoryName, onSuccess, onInvoiceCreated, editingInvoice, onReverseInvoice, prefetchedCategories, prefetchedSuppliers, initialIsReturn, isReturnOnly }: CardPurchaseModalProps) {
    const { appUser } = useAuthStore();
    const { registerModal, unregisterModal } = useUIStore();

    useEffect(() => {
        if (isOpen) {
            registerModal('card-purchase');
        } else {
            unregisterModal('card-purchase');
        }
        return () => unregisterModal('card-purchase');
    }, [isOpen, registerModal, unregisterModal]);
    const tenantId = 'single_store';
    const staffName = appUser?.name || appUser?.email || 'المستخدم';

    const [categories, setCategories] = useState<CardCategory[]>([]);
    const [suppliers, setSuppliers] = useState<CardSupplier[]>([]);

    // Invoice Mode: Standard Purchase vs Purchase Return (مردودات مشتريات)
    const [isReturnInvoice, setIsReturnInvoice] = useState<boolean>(Boolean(isReturnOnly || initialIsReturn));

    // Selected category & row inputs
    const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
    const [selectedSupplierForAdding, setSelectedSupplierForAdding] = useState<CardSupplier | null>(null);
    const [unitPrice, setUnitPrice] = useState<number>(0);
    const [quantity, setQuantity] = useState<string>('1');

    // Cart items
    const [cartItems, setCartItems] = useState<CartItem[]>([]);

    // Payment Drawer / Modal
    const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
    const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
    const [invoiceStatus, setInvoiceStatus] = useState<'draft' | 'completed' | 'cancelled'>('completed');
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
    const [autoUpdateCostPrice, setAutoUpdateCostPrice] = useState<boolean>(true);
    const [notes, setNotes] = useState<string>('');
    const [saving, setSaving] = useState<boolean>(false);

    // Favorites for quick access
    const [favorites, setFavorites] = useState<string[]>(() => {
        try {
            return JSON.parse(localStorage.getItem('favorite_card_categories_purchase') || '[]');
        } catch {
            return [];
        }
    });
    const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(false);

    // Pre-fill if editingInvoice is provided
    useEffect(() => {
        if (isOpen && editingInvoice) {
            setIsReturnInvoice(Boolean(isReturnOnly || editingInvoice.isReturn || editingInvoice.purchaseType === 'supplier_return'));
            setPaymentType(editingInvoice.paymentType || 'cash');
            if (editingInvoice.supplierId) {
                setSelectedSupplierId(editingInvoice.supplierId);
            }
            if (editingInvoice.notes) {
                setNotes(editingInvoice.notes);
            }
            
            if (editingInvoice.items && Array.isArray(editingInvoice.items)) {
                const initialCart = editingInvoice.items.map((it: any) => ({
                    id: Math.random().toString(36).substr(2, 9),
                    categoryName: it.categoryName,
                    unitPrice: it.unitPrice || 0,
                    quantity: Math.abs(it.quantity || 1),
                    totalAmount: Math.abs((it.unitPrice || 0) * (it.quantity || 1)),
                    availableStock: 99999
                }));
                setCartItems(initialCart);
            }
        } else if (isOpen && !editingInvoice) {
            setIsReturnInvoice(Boolean(isReturnOnly || initialIsReturn));
            setCartItems([]);
            setPaymentType('cash');
            setSelectedSupplierId('');
            setNotes('');
        }
    }, [isOpen, editingInvoice, initialIsReturn, isReturnOnly]);


    // Fetch Categories & Suppliers
    useEffect(() => {
        if (!isOpen) return;

        let unsubCat = () => {};
        let unsubSupp = () => {};

        if (!prefetchedCategories) {
            const qCat = query(collection(db, 'card_categories'), where('tenantId', '==', tenantId));
            unsubCat = onSnapshot(qCat, (snap) => {
                const list: CardCategory[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardCategory));
                setCategories(list);
            });
        }

        if (!prefetchedSuppliers) {
            const qSupp = query(collection(db, 'card_suppliers'), where('tenantId', '==', tenantId));
            unsubSupp = onSnapshot(qSupp, (snap) => {
                const list: CardSupplier[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardSupplier));
                setSuppliers(list);
            });
        }

        return () => {
            unsubCat();
            unsubSupp();
        };
    }, [isOpen]);

    useEffect(() => {
        if (prefetchedCategories) setCategories(prefetchedCategories);
    }, [prefetchedCategories]);

    useEffect(() => {
        if (prefetchedSuppliers) setSuppliers(prefetchedSuppliers);
    }, [prefetchedSuppliers]);

    // Available categories display list (strictly from the actual card categories in Card Management)
    const displayCategories = (() => {
        const processedNames = new Set<string>();
        let list: { id: string; name: string; retailPrice: number; wholesalePrice: number; availableCount: number }[] = [];

        categories.forEach(cat => {
            const catName = cat.name?.trim();
            if (catName && !processedNames.has(catName)) {
                processedNames.add(catName);
                const matching = categories.filter(c => c.name.trim() === catName);
                const totalStock = matching.reduce((sum, c) => sum + (c.availableCount || 0), 0);
                list.push({
                    id: cat.id,
                    name: cat.name,
                    retailPrice: cat.retailPrice || 0,
                    wholesalePrice: cat.wholesalePrice || 0,
                    availableCount: totalStock
                });
            }
        });

        if (showOnlyFavorites) {
            list = list.filter(item => favorites.includes(item.name.trim()));
        }

        return list;
    })();

    const toggleFavorite = (catName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const trimmed = catName.trim();
        const updated = favorites.includes(trimmed)
            ? favorites.filter(name => name !== trimmed)
            : [...favorites, trimmed];
        setFavorites(updated);
        localStorage.setItem('favorite_card_categories_purchase', JSON.stringify(updated));
    };

    // Initialize initial category when opened
    useEffect(() => {
        if (!isOpen) return;
        const initial = categoryName || (displayCategories.length > 0 ? displayCategories[0].name : '');
        if (initial) {
            handleSelectCategory(initial);
        }
    }, [isOpen, categoryName, categories.length]);

    // When selecting a category square
    const handleSelectCategory = (catName: string) => {
        setSelectedCategoryName(catName);
        const cat = displayCategories.find(c => c.name.trim() === catName.trim());
        if (cat) {
            setUnitPrice(cat.wholesalePrice || 0);
        } else {
            const match = catName.match(/\d+/);
            setUnitPrice(match ? parseInt(match[0], 10) : 0);
        }
    };

    const handleSelectSupplierForAdding = (supp: CardSupplier) => {
        setSelectedSupplierForAdding(supp);
        setSelectedSupplierId(supp.id);
    };

    const activeCatObj = displayCategories.find(c => c.name.trim() === selectedCategoryName.trim());
    const availableStock = activeCatObj ? activeCatObj.availableCount : 0;

    // Add selected category & quantity to Cart Table
    const handleAddToCart = () => {
        if (!selectedCategoryName) {
            alert('يرجى اختيار فئة كروت أولاً');
            return;
        }

        const qtyNum = parseInt(quantity, 10);
        if (isNaN(qtyNum) || qtyNum <= 0) {
            alert('يرجى كتابة كمية صحيحة أكبر من صفر');
            return;
        }

        if (unitPrice < 0) {
            alert('يرجى كتابة سعر صحيح');
            return;
        }

        const newItem: CartItem = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
            categoryId: activeCatObj?.id,
            categoryName: selectedCategoryName,
            unitPrice,
            quantity: qtyNum,
            totalAmount: unitPrice * qtyNum,
            availableStock
        };

        setCartItems(prev => [...prev, newItem]);
        setQuantity('1');
    };

    const handleRemoveFromCart = (id: string) => {
        setCartItems(prev => prev.filter(item => item.id !== id));
    };

    // Totals calculations
    const invoiceTotal = cartItems.reduce((sum, item) => sum + item.totalAmount, 0);
    const totalCardsQty = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    // Execute Purchase Transaction (Purchase or Purchase Return)
    const handleConfirmCheckout = async () => {
        if (saving) return;
        if (cartItems.length === 0) {
            alert('السلة فارغة، يرجى إضافة كروت للجدول أولاً.');
            return;
        }

        if (paymentType === 'credit' && !selectedSupplierId) {
            alert(isReturnInvoice ? 'في حالة المردودات الآجلة، يجب اختيار المورد لخصم المبلغ من حسابه.' : 'في حالة الشراء الآجل، يجب اختيار المورد.');
            return;
        }

        setSaving(true);
        const selectedSupplier = suppliers.find(d => d.id === selectedSupplierId);
        const now = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

        try {
            // Generate purely numeric invoice number
            let nextInvoiceNumber = '';
            if (editingInvoice && editingInvoice.invoiceNumber) {
                nextInvoiceNumber = String(editingInvoice.invoiceNumber);
            } else {
                try {
                    const q = query(collection(db, 'card_purchases'), where('tenantId', '==', tenantId));
                    const snap = await getDocs(q);
                    const existingNums = snap.docs
                        .map(d => {
                            const numStr = d.data().invoiceNumber;
                            return numStr ? parseInt(numStr.replace(/\D/g, '')) : NaN;
                        })
                        .filter(n => !isNaN(n));
                    const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 1000;
                    nextInvoiceNumber = String(maxNum + 1).padStart(5, '0');
                } catch (e) {
                    console.error('Error generating purchase invoice number:', e);
                    nextInvoiceNumber = String(Date.now()).slice(-8);
                }
            }

            await runTransaction(db, async (transaction) => {
                // --- PHASE 1: COMPUTE DELTAS AND COLLECT OLD DATA ---
                let oldInvoiceTotal = 0;
                let oldPaymentType = '';
                let oldSupplierId = '';
                const oldItems = [];
                const oldDocsToDelete = [];
                let oldCreatedAt = Date.now();
                let oldWasReturn = false;
                
                if (editingInvoice && editingInvoice.docIds) {
                    for (const docId of editingInvoice.docIds) {
                        const oldDocRef = doc(db, 'card_purchases', docId);
                        const oldDocSnap = await transaction.get(oldDocRef);
                        if (oldDocSnap.exists() && oldDocSnap.data().status !== 'cancelled') {
                            const data = oldDocSnap.data();
                            oldDocsToDelete.push(oldDocRef);
                            oldItems.push(data);
                            const itemTotal = Math.abs(data.totalAmount || 0);
                            oldInvoiceTotal += itemTotal;
                            oldPaymentType = data.paymentType;
                            oldSupplierId = data.supplierId || '';
                            if (data.isReturn || data.purchaseType === 'supplier_return') {
                                oldWasReturn = true;
                            }
                            if (data.createdAt) oldCreatedAt = data.createdAt;
                        }
                    }
                }

                const cleanName = (s?: string) => (s || '').replace(/فئة|كروت|كرت|ريال|\s+/g, '').toLowerCase();

                const newItemsWithCats = cartItems.map(item => {
                    // 1. Match by item.categoryId directly if present
                    let catDoc = item.categoryId ? categories.find(c => c.id === item.categoryId) : undefined;
                    
                    // 2. Match by exact name or linkedSection
                    if (!catDoc) {
                        catDoc = categories.find(c => 
                            c.name.trim() === item.categoryName.trim() || 
                            c.linkedSection?.trim() === item.categoryName.trim()
                        );
                    }
                    
                    // 3. Match by cleaned normalized name
                    if (!catDoc) {
                        const itemClean = cleanName(item.categoryName);
                        catDoc = categories.find(c => 
                            cleanName(c.name) === itemClean || 
                            cleanName(c.linkedSection) === itemClean
                        );
                    }

                    // Generate a temp ID for new categories to track them
                    const catId = catDoc ? catDoc.id : (item.categoryId || ('new_' + item.categoryName.trim()));
                    return { ...item, catId, isNewCat: !catDoc && !item.categoryId };
                });

                const stockDeltas: Record<string, number> = {};
                // Rollback old items: if old was purchase (+qty), rollback is -qty. If old was return (-qty), rollback is +qty.
                for (const old of oldItems) {
                    let oldCatId = old.categoryId;
                    if (!oldCatId && old.categoryName) {
                        const matched = categories.find(c => 
                            c.name.trim() === old.categoryName.trim() || 
                            c.linkedSection?.trim() === old.categoryName.trim() ||
                            cleanName(c.name) === cleanName(old.categoryName)
                        );
                        if (matched) oldCatId = matched.id;
                    }
                    if (oldCatId) {
                        const oldQty = Math.abs(old.quantity || 0);
                        const rollbackDelta = (old.isReturn || old.purchaseType === 'supplier_return') ? +oldQty : -oldQty;
                        stockDeltas[oldCatId] = (stockDeltas[oldCatId] || 0) + rollbackDelta;
                    }
                }
                
                // Apply new items stock delta: standard purchase adds stock (+qty), return subtracts stock (-qty)
                if (invoiceStatus === 'completed') {
                    for (const item of newItemsWithCats) {
                        const itemQty = Math.abs(item.quantity || 0);
                        const applyDelta = isReturnInvoice ? -itemQty : +itemQty;
                        stockDeltas[item.catId] = (stockDeltas[item.catId] || 0) + applyDelta;
                    }
                }

                // Supplier balance deltas
                const supplierDeltas: Record<string, number> = {};
                if (oldPaymentType === 'credit' && oldSupplierId) {
                    // Rollback old credit purchase (+debt) => -oldTotal. Rollback old credit return (-debt) => +oldTotal.
                    const rollbackSupp = oldWasReturn ? +oldInvoiceTotal : -oldInvoiceTotal;
                    supplierDeltas[oldSupplierId] = (supplierDeltas[oldSupplierId] || 0) + rollbackSupp;
                }
                if (invoiceStatus === 'completed' && paymentType === 'credit' && selectedSupplierId) {
                    // Standard credit purchase increases debt to supplier (+invoiceTotal)
                    // Credit return decreases debt to supplier (-invoiceTotal)
                    const applySupp = isReturnInvoice ? -invoiceTotal : +invoiceTotal;
                    supplierDeltas[selectedSupplierId] = (supplierDeltas[selectedSupplierId] || 0) + applySupp;
                }

                // Cashbox deltas:
                // Standard cash purchase pays cash out of cashbox (-invoiceTotal)
                // Cash return brings refund cash into cashbox (+invoiceTotal)
                let netCashboxOutflow = 0; // Positive = cash leaving box (expense), Negative = cash entering box (income)
                if (oldPaymentType === 'cash') {
                    // Rollback old: if old was purchase (outflow +total), rollback is -total.
                    // If old was return (inflow -total), rollback is +total.
                    netCashboxOutflow += oldWasReturn ? +oldInvoiceTotal : -oldInvoiceTotal;
                }
                if (invoiceStatus === 'completed' && paymentType === 'cash') {
                    netCashboxOutflow += isReturnInvoice ? -invoiceTotal : +invoiceTotal;
                }

                // --- PHASE 2: ALL READS ---
                const categorySnaps: Record<string, { ref: any; snap: any }> = {};
                for (const item of newItemsWithCats) {
                    if (!item.isNewCat) {
                        const ref = doc(db, 'card_categories', item.catId);
                        if (!categorySnaps[item.catId]) categorySnaps[item.catId] = { ref, snap: await transaction.get(ref) };
                    }
                }
                for (const catId of Object.keys(stockDeltas)) {
                    if (!catId.startsWith('new_') && stockDeltas[catId] !== 0 && !categorySnaps[catId]) {
                        const ref = doc(db, 'card_categories', catId);
                        categorySnaps[catId] = { ref, snap: await transaction.get(ref) };
                    }
                }

                const supplierSnaps: Record<string, { ref: any; snap: any }> = {};
                for (const suppId of Object.keys(supplierDeltas)) {
                    if (supplierDeltas[suppId] !== 0) {
                        const ref = doc(db, 'card_suppliers', suppId);
                        supplierSnaps[suppId] = { ref, snap: await transaction.get(ref) };
                    }
                }

                // --- PHASE 3: ALL WRITES ---
                // 1. Delete old docs
                for (const ref of oldDocsToDelete) transaction.delete(ref);

                // 2. Map new categories to their actual Firestore IDs before saving
                const newCatRefs: Record<string, string> = {};
                if (invoiceStatus === 'completed') {
                    for (const item of newItemsWithCats) {
                        if (item.isNewCat && !newCatRefs[item.catId]) {
                            const newCatRef = doc(collection(db, 'card_categories'));
                            const initCount = isReturnInvoice ? 0 : item.quantity;
                            transaction.set(newCatRef, {
                                tenantId,
                                name: item.categoryName,
                                wholesalePrice: item.unitPrice,
                                retailPrice: item.unitPrice * 1.05,
                                availableCount: initCount,
                                createdAt: Date.now()
                            });
                            newCatRefs[item.catId] = newCatRef.id;

                            const stockLogRef = doc(collection(db, 'card_stock_logs'));
                            transaction.set(stockLogRef, {
                                tenantId,
                                categoryId: newCatRef.id,
                                categoryName: item.categoryName,
                                quantityAdded: isReturnInvoice ? -item.quantity : item.quantity,
                                userName: staffName,
                                additionDate: `${dateStr} ${timeStr}`,
                                availableCountAfter: initCount,
                                notes: isReturnInvoice 
                                    ? `مردودات مشتريات (مرتجع للمورد) - فاتورة #${nextInvoiceNumber}` 
                                    : `إنشاء صنف جديد - فاتورة مشتريات #${nextInvoiceNumber}`,
                                createdAt: Date.now()
                            });
                        }
                    }
                }

                // 3. Create new purchase docs
                for (const item of newItemsWithCats) {
                    const finalCatId = item.isNewCat ? newCatRefs[item.catId] : item.catId;
                    const purchaseRef = doc(collection(db, 'card_purchases'));
                    const cleanNotes = notes.trim();
                    const finalNotes = isReturnInvoice 
                        ? (cleanNotes ? `مردودات مشتريات: ${cleanNotes}` : 'مردودات مشتريات (مرتجع للمورد)') 
                        : cleanNotes;

                    transaction.set(purchaseRef, {
                        tenantId,
                        categoryId: finalCatId || '',
                        categoryName: item.categoryName,
                        quantity: isReturnInvoice ? -Math.abs(item.quantity) : Math.abs(item.quantity),
                        purchaseType: isReturnInvoice ? 'supplier_return' : 'supplier',
                        isReturn: isReturnInvoice,
                        paymentType,
                        supplierId: selectedSupplierId || '',
                        supplierName: selectedSupplier ? selectedSupplier.name : 'مورد نقدي عام',
                        unitPrice: item.unitPrice,
                        totalAmount: isReturnInvoice ? -Math.abs(item.totalAmount) : Math.abs(item.totalAmount),
                        month: yearMonth,
                        date: dateStr,
                        dateTime: `${dateStr} ${timeStr}`,
                        userName: staffName,
                        sellerName: staffName,
                        createdByName: staffName,
                        invoiceNumber: nextInvoiceNumber,
                        status: invoiceStatus,
                        notes: finalNotes,
                        createdAt: oldDocsToDelete.length > 0 ? oldCreatedAt : Date.now()
                    });
                }

                // 4. Update existing categories stock
                if (invoiceStatus === 'completed') {
                    for (const catId of Object.keys(stockDeltas)) {
                        if (catId.startsWith('new_')) continue; // Handled above
                        
                        const delta = stockDeltas[catId];
                        if (delta !== 0 && categorySnaps[catId] && categorySnaps[catId].snap.exists()) {
                            const catRef = categorySnaps[catId].ref;
                            const catData = categorySnaps[catId].snap.data();
                            const currentStock = Number(catData.availableCount) || 0;
                            const newStock = currentStock + delta;
                            
                            const catUpdate: any = { availableCount: newStock, updatedAt: Date.now() };
                            const matchingItem = newItemsWithCats.find(i => i.catId === catId);
                            if (matchingItem && autoUpdateCostPrice && matchingItem.unitPrice > 0 && !isReturnInvoice) {
                                catUpdate.wholesalePrice = matchingItem.unitPrice;
                            }
                            transaction.update(catRef, catUpdate);

                            const stockLogRef = doc(collection(db, 'card_stock_logs'));
                            transaction.set(stockLogRef, {
                                tenantId,
                                categoryId: catId,
                                categoryName: catData.name || 'فئة كروت',
                                quantityAdded: delta,
                                userName: staffName,
                                additionDate: `${dateStr} ${timeStr}`,
                                availableCountAfter: newStock,
                                notes: isReturnInvoice
                                    ? `مردودات مشتريات (مرتجع للمورد) - فاتورة #${nextInvoiceNumber}`
                                    : (oldDocsToDelete.length > 0 ? `تسوية كمية (تعديل فاتورة مشتريات #${nextInvoiceNumber})` : `فاتورة مشتريات #${nextInvoiceNumber}`),
                                createdAt: Date.now()
                            });
                        }
                    }

                    // 5. Update supplier balances
                    for (const suppId of Object.keys(supplierDeltas)) {
                        const delta = supplierDeltas[suppId];
                        if (delta !== 0 && supplierSnaps[suppId] && supplierSnaps[suppId].snap.exists()) {
                            const suppRef = supplierSnaps[suppId].ref;
                            const currentBalance = Number(supplierSnaps[suppId].snap.data().balance) || 0;
                            transaction.update(suppRef, {
                                balance: currentBalance + delta,
                                updatedAt: Date.now()
                            });
                        }
                    }

                    // 6. Apply cashbox diff
                    if (netCashboxOutflow !== 0) {
                        const cashboxRef = doc(collection(db, 'card_cashbox'));
                        const isIncome = netCashboxOutflow < 0; // Inflow / return money into box
                        const absAmount = Math.abs(netCashboxOutflow);
                        
                        transaction.set(cashboxRef, {
                            tenantId,
                            type: isReturnInvoice ? 'supplier_return_cash' : (isIncome ? 'manual_in' : 'supplier_purchase_cash'),
                            title: isReturnInvoice 
                                ? `مردودات مشتريات كروت نقدية - استرداد من المورد (${totalCardsQty} كارت) - فاتورة #${nextInvoiceNumber}`
                                : (oldDocsToDelete.length > 0 ? `تسوية تعديل فاتورة مشتريات #${nextInvoiceNumber} (فارق السعر)` : `فاتورة شراء كروت نقدية (${totalCardsQty} كارت)`),
                            amount: absAmount,
                            isIncome: isIncome,
                            date: dateStr,
                            dateTime: `${dateStr} ${timeStr}`,
                            userName: staffName,
                            createdAt: Date.now()
                        });
                    }

                    // 7. Notification
                    if (oldDocsToDelete.length === 0) {
                        const notifRef = doc(collection(db, 'notifications'));
                        transaction.set(notifRef, {
                            tenantId,
                            type: 'invoice_created',
                            invoiceType: isReturnInvoice ? 'card_purchase_return' : 'card_purchase',
                            invoiceNumber: String(nextInvoiceNumber),
                            amount: invoiceTotal,
                            createdById: appUser?.uid || '',
                            createdByName: staffName,
                            createdByRole: appUser?.role || 'user',
                            recipientRole: 'admin',
                            createdAt: Date.now(),
                            read: false,
                            title: isReturnInvoice 
                                ? `↩️ فاتورة مردودات مشتريات كروت #${nextInvoiceNumber}` 
                                : `🧾 فاتورة شراء كروت جديدة #${nextInvoiceNumber}`,
                            body: isReturnInvoice
                                ? `قام المستخدم (${staffName}) بإنشاء فاتورة مردودات مشتريات كروت بمبلغ ${invoiceTotal.toLocaleString('ar-SA')} ريال يمني`
                                : `قام المستخدم (${staffName}) بإنشاء فاتورة شراء كروت بمبلغ ${invoiceTotal.toLocaleString('ar-SA')} ريال يمني`
                        });
                    }
                }
            });

            // Trigger action modal with full compiled invoice
            if (onInvoiceCreated) {
                onInvoiceCreated({
                    id: nextInvoiceNumber,
                    invoiceNumber: nextInvoiceNumber,
                    type: isReturnInvoice ? 'purchase_return' : 'purchase',
                    isReturn: isReturnInvoice,
                    totalAmount: invoiceTotal,
                    paymentType,
                    partyName: selectedSupplier ? selectedSupplier.name : 'مورد نقدي عام',
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: staffName,
                    notes: isReturnInvoice ? (notes.trim() ? `مردودات مشتريات: ${notes.trim()}` : 'مردودات مشتريات (مرتجع للمورد)') : notes.trim(),
                    items: cartItems.map(item => ({
                        categoryName: item.categoryName,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalAmount: item.totalAmount
                    }))
                });
            }

            setSaving(false);
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            console.error('Error saving card purchase:', error);
            handleFirestoreError(error, OperationType.WRITE, 'card_purchases');
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-stretch justify-center p-0 animate-in fade-in duration-200 dir-rtl overflow-hidden" dir="rtl">
            <div className="bg-white dark:bg-slate-900 w-full h-full max-w-full p-4 sm:p-6 shadow-none flex flex-col justify-between overflow-hidden space-y-4">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5 gap-2 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-2xl border ${
                            isReturnInvoice
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/50'
                                : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/50'
                        }`}>
                            {isReturnInvoice ? <RotateCcw size={22} /> : <ShoppingBag size={22} />}
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="font-black text-lg sm:text-xl text-slate-900 dark:text-white">
                                    {isReturnInvoice ? 'مردودات مشتريات الكروت (إرجاع للمورد / خصم المخزون)' : 'شراء الكروت (تزويد رصيد المخزون)'}
                                </h2>
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
                                    <User size={13} className={isReturnInvoice ? 'text-amber-600' : 'text-indigo-600 dark:text-indigo-400'} />
                                    المستخدم: <strong className="text-slate-900 dark:text-white">{staffName}</strong>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Mode Badge */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                        {isReturnOnly ? (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-black">
                                <RotateCcw size={14} className="text-amber-600" />
                                <span>فاتورة مردودات مشتريات (مرتجع للمورد)</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-black">
                                <ShoppingBag size={14} className="text-indigo-600 dark:text-indigo-400" />
                                <span>فاتورة شراء وتزويد رصيد المخزون</span>
                            </div>
                        )}

                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="overflow-y-auto space-y-3 pr-1 pl-1 custom-scrollbar flex-1">
                    {/* TOP SECTION: Categories Grid */}
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                {isReturnInvoice ? 'اختر فئة الكارت المراد إرجاعها للمورد' : 'اختر فئة الكارت لتزويدها بالرصيد'}
                            </label>
                            
                            {/* Filter Tabs for Favorites vs All */}
                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-xl text-[10px] font-black w-fit border border-slate-200/50 dark:border-slate-700/50">
                                <button
                                    type="button"
                                    onClick={() => setShowOnlyFavorites(false)}
                                    className={`px-2.5 py-1 rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
                                        !showOnlyFavorites
                                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                                    }`}
                                >
                                    <span>الكل</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowOnlyFavorites(true)}
                                    className={`px-2.5 py-1 rounded-lg transition-all duration-200 flex items-center gap-1 ${
                                        showOnlyFavorites
                                            ? 'bg-amber-500 text-white shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                                    }`}
                                >
                                    <Star size={11} className={showOnlyFavorites ? "fill-current" : ""} />
                                    <span>المفضلة ({favorites.length})</span>
                                </button>
                            </div>

                            {activeCatObj && (
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                    المتبقي: <strong>{availableStock} كارت</strong>
                                </span>
                            )}
                        </div>
                        {displayCategories.length === 0 ? (
                            <div className="text-center py-8 px-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-400 font-bold text-xs">
                                {showOnlyFavorites 
                                    ? 'لم تقم بإضافة أي فئات إلى المفضلة بعد. انقر على أيقونة النجمة ⭐ على أي فئة من تبويب "الكل" لإضافتها هنا للوصول السريع.'
                                    : 'لا توجد فئات كروت مضافة حالياً في "إدارة الكروت". يرجى إضافة الفئات أولاً من لوحة تحكم الكروت لتتمكن من تزويد رصيدها هنا.'}
                            </div>
                        ) : (
                            <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
                                {displayCategories.map((cat) => {
                                    const isSelected = selectedCategoryName.trim() === cat.name.trim();
                                    const isFav = favorites.includes(cat.name.trim());
                                    return (
                                        <div
                                            key={cat.name}
                                            onClick={() => handleSelectCategory(cat.name)}
                                            className={`p-2.5 sm:p-3 rounded-2xl border-2 text-center transition flex flex-col items-center justify-center relative cursor-pointer ${
                                                isSelected
                                                    ? 'bg-indigo-50/90 dark:bg-indigo-950/80 border-indigo-600 shadow-md shadow-indigo-600/10 text-slate-900 dark:text-white'
                                                    : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                                            }`}
                                        >
                                            {/* Star icon for toggling favorite */}
                                            <button
                                                type="button"
                                                onClick={(e) => toggleFavorite(cat.name, e)}
                                                className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center transition active:scale-90 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 ${
                                                    isFav
                                                        ? 'text-amber-500'
                                                        : 'text-slate-300 hover:text-slate-400 dark:text-slate-600 dark:hover:text-slate-500'
                                                }`}
                                                title={isFav ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
                                            >
                                                <Star size={13} className={isFav ? "fill-current" : ""} />
                                            </button>

                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${
                                                isSelected ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                            }`}>
                                                <Wifi size={18} />
                                            </div>
                                            <div className="font-black text-xs sm:text-sm leading-tight text-slate-900 dark:text-white select-none">
                                                {cat.name}
                                            </div>
                                            <span className={`text-[10px] font-black mt-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 select-none`}>
                                                المتبقي: {cat.availableCount}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* INPUTS SECTION */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                        <div className="grid grid-cols-12 gap-2.5 items-end">
                            <div className="col-span-4">
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5 text-center">
                                    {isReturnInvoice ? 'سعر تكلفة الكارت المرتجع (ريال)' : 'سعر الشراء الفردي (ريال يمني)'}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={unitPrice}
                                    onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                                    onFocus={(e) => e.target.select()}
                                    onBlur={(e) => {
                                        if (e.target.value === '') {
                                            handleSelectCategory(selectedCategoryName);
                                        }
                                    }}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-indigo-600 text-center"
                                />
                            </div>

                            <div className="col-span-4">
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5 text-center">
                                    {isReturnInvoice ? 'الكمية المرتجعة (عدد الكروت)' : 'الكمية المشتراة (عدد الكروت)'}
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    step="any"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    onBlur={(e) => {
                                        if (e.target.value === '' || parseFloat(e.target.value) <= 0) {
                                            setQuantity('1');
                                        }
                                    }}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-indigo-600 text-center"
                                />
                            </div>

                            <div className="col-span-4">
                                <button
                                    type="button"
                                    onClick={handleAddToCart}
                                    className={`w-full py-2.5 active:scale-95 text-white font-black text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition h-[38px] whitespace-nowrap ${
                                        isReturnInvoice
                                            ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                                            : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
                                    }`}
                                >
                                    {isReturnInvoice ? <RotateCcw size={16} /> : <Plus size={16} />}
                                    <span>{isReturnInvoice ? 'إضافة للمردودات (+)' : 'إضافة للفاتورة (+)'}</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ITEMS TABLE */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200">
                                {isReturnInvoice ? 'كشف الأصناف المضافة لفاتورة مردودات المشتريات' : 'كشف الأصناف المضافة لفاتورة الشراء'} ({cartItems.length})
                            </h3>
                        </div>

                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                            <div className="overflow-x-auto max-h-48">
                                <table className="w-full text-right text-xs">
                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black sticky top-0 border-b border-slate-200 dark:border-slate-700">
                                        <tr>
                                            <th className="p-3">اسم الفئة</th>
                                            <th className="p-3">{isReturnInvoice ? 'سعر الإرجاع الموحد' : 'سعر الشراء الموحد'}</th>
                                            <th className="p-3">الكمية</th>
                                            <th className="p-3">الإجمالي الفرعي</th>
                                            <th className="p-3 text-center">إجراء</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                                        {cartItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-6 text-center text-slate-400 font-bold">
                                                    {isReturnInvoice 
                                                        ? 'لم يتم إضافة أي كروت للإرجاع بعد. اختر فئة واضغط زر "إضافة".' 
                                                        : 'لم يتم إضافة أي كروت للفاتورة بعد. اختر فئة واضغط زر "إضافة".'}
                                                </td>
                                            </tr>
                                        ) : (
                                            cartItems.map((item, idx) => (
                                                <tr key={`${item.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                    <td className="p-3 font-black text-slate-900 dark:text-white">{item.categoryName}</td>
                                                    <td className="p-3">{item.unitPrice} ريال يمني</td>
                                                    <td className={`p-3 font-black ${isReturnInvoice ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                                                        {item.quantity} كارت
                                                    </td>
                                                    <td className="p-3 font-black text-emerald-600 dark:text-emerald-400">{item.totalAmount} ريال يمني</td>
                                                    <td className="p-3 text-center">
                                                        <button
                                                            onClick={() => handleRemoveFromCart(item.id)}
                                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition"
                                                            title="حذف الصنف"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Table Summary Footer */}
                            {cartItems.length > 0 && (
                                <div className={`p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-black ${
                                    isReturnInvoice ? 'bg-amber-50/60 dark:bg-amber-950/40' : 'bg-indigo-50/60 dark:bg-indigo-950/40'
                                }`}>
                                    <span className="text-slate-600 dark:text-slate-300">
                                        إجمالي عدد الكروت: <strong className={isReturnInvoice ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}>{totalCardsQty} كارت</strong>
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-600 dark:text-slate-400">الإجمالي الصافي:</span>
                                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{invoiceTotal} ريال يمني</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* BOTTOM ACTION BUTTON */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={() => setShowPaymentModal(true)}
                        disabled={cartItems.length === 0}
                        className={`flex-1 py-3.5 active:scale-95 text-white font-black text-sm rounded-2xl shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:pointer-events-none ${
                            isReturnInvoice
                                ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                        }`}
                    >
                        {isReturnInvoice ? <RotateCcw size={20} /> : <ShoppingBag size={20} />}
                        <span>
                            {isReturnInvoice 
                                ? `إتمام وحفظ فاتورة المردودات (مرتجع للمورد) - الإجمالي: ${invoiceTotal} ريال يمني`
                                : `إتمام وحفظ فاتورة الشراء - الإجمالي: ${invoiceTotal} ريال يمني`}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-2xl transition"
                    >
                        إلغاء
                    </button>
                </div>
            </div>

            {/* CHECKOUT PAYMENT MODAL */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200 dir-rtl" dir="rtl">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 my-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <div className="flex items-center gap-3">
                                <div className={`p-3 rounded-2xl ${
                                    isReturnInvoice
                                        ? 'bg-amber-50 dark:bg-amber-950 text-amber-600'
                                        : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600'
                                }`}>
                                    {isReturnInvoice ? <RotateCcw size={22} /> : <CreditCard size={22} />}
                                </div>
                                <div>
                                    <h3 className="font-black text-lg text-slate-900 dark:text-white">
                                        {isReturnInvoice ? 'تأكيد وتسديد فاتورة مردودات المشتريات' : 'تسديد وتأكيد فاتورة الشراء'}
                                    </h3>
                                    <p className="text-xs font-bold text-slate-400">
                                        {isReturnInvoice 
                                            ? 'اختر طريقة تسوية المبلغ والمورد لتسجيل مرتجع الكروت'
                                            : 'اختر طريقة الدفع والمورد المستهدف لإتمام العملية'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4 max-h-[75vh] overflow-y-auto p-1">
                            {/* 1. طريقة التسديد بالأعلى */}
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                                    {isReturnInvoice ? 'طريقة تسوية قيمة المردودات' : 'طريقة تسديد الفاتورة'}
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentType('cash')}
                                        className={`py-2.5 px-3 rounded-xl text-xs font-black transition border ${
                                            paymentType === 'cash'
                                                ? (isReturnInvoice ? 'bg-amber-600 text-white border-amber-600 shadow-md' : 'bg-emerald-600 text-white border-emerald-600 shadow-md')
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        {isReturnInvoice ? '💵 استرداد نقدي (إيداع بالصندوق)' : '💵 نقدي (خصم من الصندوق)'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentType('credit')}
                                        className={`py-2.5 px-3 rounded-xl text-xs font-black transition border ${
                                            paymentType === 'credit'
                                                ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        {isReturnInvoice ? '💳 خصم من حساب المورد (آجل)' : '💳 آجل (دين مسجل للمورد)'}
                                    </button>
                                </div>
                            </div>

                            {/* 2. اسم المورد وتحته حقل الملاحظات */}
                            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                                        اختيار المورد {paymentType === 'credit' && <span className="text-rose-500">* (مطلوب للعمليات الآجلة)</span>}
                                    </label>
                                    <SearchableSelect
                                        value={selectedSupplierId || ''}
                                        onChange={setSelectedSupplierId}
                                        placeholder="-- اختر المورد لتسجيل الفاتورة باسمه --"
                                        options={suppliers.map(dist => ({ id: dist.id, label: dist.name, subLabel: dist.phone }))}
                                    />
                                </div>

                                {/* حقل الملاحظات تحت اسم المورد */}
                                <div>
                                    <label className="block text-xs font-black mb-1.5 text-slate-700 dark:text-slate-300">
                                        ملاحظات العملية (تظهر على الفاتورة)
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder={isReturnInvoice ? "سبب الإرجاع أو أي ملاحظات إضافية..." : "أدخل أي ملاحظات على عملية الشراء..."}
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-600 transition resize-none"
                                    />
                                </div>
                            </div>

                            {/* Auto Update Cost Price Option (Only for standard purchases) */}
                            {!isReturnInvoice && (
                                <label className="flex items-center gap-2.5 p-3 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900/50 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={autoUpdateCostPrice}
                                        onChange={(e) => setAutoUpdateCostPrice(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 rounded accent-indigo-600 cursor-pointer"
                                    />
                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                        تحديث سعر الشراء/التكلفة للفئة تلقائياً بناءً على السعر الجديد
                                    </span>
                                </label>
                            )}

                            {/* Workflow Status Selector */}
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                                    حالة الفاتورة (Workflow Status)
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setInvoiceStatus('draft')}
                                        className={`py-2 px-2 rounded-xl text-[11px] font-black transition border flex items-center justify-center gap-1 ${
                                            invoiceStatus === 'draft'
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        <span>مسودة (Draft)</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInvoiceStatus('completed')}
                                        className={`py-2 px-2 rounded-xl text-[11px] font-black transition border flex items-center justify-center gap-1 ${
                                            invoiceStatus === 'completed'
                                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        <span>مكتملة (Approved)</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInvoiceStatus('cancelled')}
                                        className={`py-2 px-2 rounded-xl text-[11px] font-black transition border flex items-center justify-center gap-1 ${
                                            invoiceStatus === 'cancelled'
                                                ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        <span>ملغاة (Cancelled)</span>
                                    </button>
                                </div>
                            </div>

                            {/* 3. السعر والإجمالي في نفس السطر (Row Layout) */}
                            <div className="bg-emerald-50/70 dark:bg-emerald-950/40 p-3 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 space-y-2">
                                <div className="grid grid-cols-2 gap-2 items-center text-center">
                                    <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">إجمالي الكروت</span>
                                        <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                                            {totalCardsQty} كارت
                                        </span>
                                    </div>
                                    <div className={`text-white p-2 rounded-xl flex flex-col justify-center shadow-sm ${
                                        isReturnInvoice ? 'bg-amber-600' : 'bg-emerald-600'
                                    }`}>
                                        <span className="text-[10px] font-bold text-white/90 mb-0.5">
                                            {isReturnInvoice ? 'إجمالي مبلغ المردودات' : 'الإجمالي الصافي للمبلغ'}
                                        </span>
                                        <span className="text-xs font-black truncate" dir="ltr">
                                            {invoiceTotal} ريال يمني
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleConfirmCheckout}
                                    disabled={saving}
                                    className={`flex-1 py-3.5 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg flex items-center justify-center gap-2 transition disabled:opacity-50 ${
                                        isReturnInvoice
                                            ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                                            : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                                    }`}
                                >
                                    <CheckCircle2 size={18} />
                                    <span>
                                        {saving 
                                            ? 'جاري الحفظ والتسجيل...' 
                                            : (isReturnInvoice ? 'تأكيد وإتمام المردودات وطباعة الفاتورة' : 'تأكيد وإتمام الشراء وطباعة الفاتورة')}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowPaymentModal(false)}
                                    className="px-4 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-2xl transition"
                                >
                                    تراجع
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
