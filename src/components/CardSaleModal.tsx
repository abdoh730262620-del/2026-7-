import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Plus, Trash2, CheckCircle2, User, Phone, Search, CreditCard, DollarSign, Wifi, AlertTriangle } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, runTransaction, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { CardCategory, CardDistributor } from '../types/cardTypes';
import SearchableSelect from './SearchableSelect';
import { printReport } from '../lib/printHelper';
import { InvoicePdfInput } from '../lib/pdfHelper';

interface CardSaleModalProps {
    isOpen: boolean;
    onClose: () => void;
    categoryName?: string;
    onSuccess?: () => void;
    onInvoiceCreated?: (invoice: InvoicePdfInput) => void;
    editingInvoice?: any;
    onReverseInvoice?: () => Promise<boolean>;
    prefetchedCategories?: CardCategory[];
    prefetchedDistributors?: CardDistributor[];
}

interface CartItem {
    id: string;
    categoryId?: string;
    categoryName: string;
    saleType: 'retail' | 'wholesale' | 'distributor';
    unitPrice: number;
    quantity: number;
    totalAmount: number;
    availableStock: number;
}

const DEFAULT_DENOMINATIONS = [
    { name: 'فئة 100 ريال', retailPrice: 100, wholesalePrice: 95 },
    { name: 'فئة 200 ريال', retailPrice: 200, wholesalePrice: 190 },
    { name: 'فئة 250 ريال', retailPrice: 250, wholesalePrice: 235 },
    { name: 'فئة 500 ريال', retailPrice: 500, wholesalePrice: 475 },
    { name: 'فئة 1000 ريال', retailPrice: 1000, wholesalePrice: 950 },
    { name: 'فئة 1500 ريال', retailPrice: 1500, wholesalePrice: 1425 },
    { name: 'فئة 3000 ريال', retailPrice: 3000, wholesalePrice: 2850 },
    { name: 'فئة 5000 ريال', retailPrice: 5000, wholesalePrice: 4750 },
];

export default function CardSaleModal({ isOpen, onClose, categoryName, onSuccess, onInvoiceCreated, editingInvoice, onReverseInvoice, prefetchedCategories, prefetchedDistributors }: CardSaleModalProps) {
    const { appUser } = useAuthStore();
    const { registerModal, unregisterModal } = useUIStore();

    useEffect(() => {
        if (isOpen) {
            registerModal('card-sale');
        } else {
            unregisterModal('card-sale');
        }
        return () => unregisterModal('card-sale');
    }, [isOpen, registerModal, unregisterModal]);
    const tenantId = 'single_store';
    const staffName = appUser?.name || appUser?.email || 'المستخدم الحياتي';

    const [categories, setCategories] = useState<CardCategory[]>([]);
    const [distributors, setDistributors] = useState<CardDistributor[]>([]);

    // Selected category & row inputs
    const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
    const [saleType, setSaleType] = useState<'retail' | 'wholesale' | 'distributor'>('retail');
    const [selectedDistributorForAdding, setSelectedDistributorForAdding] = useState<CardDistributor | null>(null);
    const [unitPrice, setUnitPrice] = useState<number>(0);
    const [quantity, setQuantity] = useState<string>('1');

    // Cart items
    const [cartItems, setCartItems] = useState<CartItem[]>([]);

    // Payment Drawer / Modal
    const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
    const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
    const [invoiceStatus, setInvoiceStatus] = useState<'draft' | 'completed' | 'cancelled'>('completed');
    const [selectedDistributorId, setSelectedDistributorId] = useState<string>('');
    const [distributorSearch, setDistributorSearch] = useState<string>('');
    const [showDistributorDropdown, setShowDistributorDropdown] = useState<boolean>(false);
    const [commissionPercent, setCommissionPercent] = useState<number>(0);
    const [notes, setNotes] = useState<string>('');
    const [saving, setSaving] = useState<boolean>(false);

    // Pre-fill if editingInvoice is provided
    useEffect(() => {
        if (isOpen && editingInvoice) {
            setPaymentType(editingInvoice.paymentType || 'cash');
            if (editingInvoice.distributorId) {
                setSelectedDistributorId(editingInvoice.distributorId);
            }
            if (editingInvoice.distributorName) {
                setDistributorSearch(editingInvoice.distributorName);
            }
            if (editingInvoice.notes) {
                setNotes(editingInvoice.notes);
            }
            
            if (editingInvoice.items && Array.isArray(editingInvoice.items)) {
                const initialCart = editingInvoice.items.map((it: any) => ({
                    id: Math.random().toString(36).substr(2, 9),
                    categoryName: it.categoryName || '',
                    saleType: it.saleType || 'retail',
                    unitPrice: it.unitPrice || 0,
                    quantity: it.quantity || 1,
                    totalAmount: it.totalAmount || ((it.unitPrice || 0) * (it.quantity || 1)),
                    availableStock: 99999
                }));
                setCartItems(initialCart);
            }
        } else if (isOpen && !editingInvoice) {
            setCartItems([]);
            setPaymentType('cash');
            setSelectedDistributorId('');
            setDistributorSearch('');
            setNotes('');
        }
    }, [isOpen, editingInvoice]);

    // Negative Stock Warning Modal State
    const [negativeStockWarning, setNegativeStockWarning] = useState<{
        isOpen: boolean;
        categoryName: string;
        requestedQty: number;
        availableStock: number;
        pendingItem?: CartItem;
    } | null>(null);

    // Fetch Categories & Distributors
    useEffect(() => {
        if (!isOpen) return;

        let unsubCat = () => {};
        let unsubDist = () => {};

        if (!prefetchedCategories) {
            const qCat = query(collection(db, 'card_categories'), where('tenantId', '==', tenantId));
            unsubCat = onSnapshot(qCat, (snap) => {
                const list: CardCategory[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardCategory));
                setCategories(list);
            });
        }

        if (!prefetchedDistributors) {
            const qDist = query(collection(db, 'card_distributors'), where('tenantId', '==', tenantId));
            unsubDist = onSnapshot(qDist, (snap) => {
                const list: CardDistributor[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardDistributor));
                setDistributors(list);
            });
        }

        return () => {
            unsubCat();
            unsubDist();
        };
    }, [isOpen]);

    useEffect(() => {
        if (prefetchedCategories) setCategories(prefetchedCategories);
    }, [prefetchedCategories]);

    useEffect(() => {
        if (prefetchedDistributors) setDistributors(prefetchedDistributors);
    }, [prefetchedDistributors]);

    // Available categories display list (from default 8 network card sections + any custom created categories)
    const processedNames = new Set<string>();

    const defaultDisplayCategories = DEFAULT_DENOMINATIONS.map(denom => {
        processedNames.add(denom.name.trim());
        const matching = categories.filter(c => c.name.trim() === denom.name.trim() || c.linkedSection?.trim() === denom.name.trim());
        matching.forEach(c => processedNames.add(c.name.trim()));
        const totalStock = matching.reduce((sum, c) => sum + (c.availableCount || 0), 0);
        const mainCat = matching.find(c => c.name.trim() === denom.name.trim()) || matching[0];
        return {
            id: mainCat?.id,
            name: denom.name,
            retailPrice: mainCat?.retailPrice || denom.retailPrice,
            wholesalePrice: mainCat?.wholesalePrice || denom.wholesalePrice,
            availableCount: totalStock
        };
    });

    const customDisplayCategories: typeof defaultDisplayCategories = [];
    categories.forEach(cat => {
        const catName = cat.name?.trim();
        if (catName && !processedNames.has(catName)) {
            processedNames.add(catName);
            const matching = categories.filter(c => c.name?.trim() === catName);
            const totalStock = matching.reduce((sum, c) => sum + (c.availableCount || 0), 0);
            const price = cat.retailPrice || (catName.match(/\d+/) ? parseInt(catName.match(/\d+/)![0], 10) : 0);
            const wPrice = cat.wholesalePrice || price * 0.95;
            customDisplayCategories.push({
                id: cat.id,
                name: cat.name,
                retailPrice: price,
                wholesalePrice: wPrice,
                availableCount: totalStock
            });
        }
    });

    const displayCategories = [...defaultDisplayCategories, ...customDisplayCategories];

    // Initialize initial category when opened
    useEffect(() => {
        if (!isOpen) return;
        const initial = categoryName || (displayCategories.length > 0 ? displayCategories[0].name : '');
        if (initial) {
            handleSelectCategory(initial, saleType);
        }
    }, [isOpen, categoryName, categories.length]);

    // When selecting a category square or changing sale type
    const handleSelectCategory = (catName: string, type: 'retail' | 'wholesale' | 'distributor', customDist?: CardDistributor | null) => {
        setSelectedCategoryName(catName);
        const cat = displayCategories.find(c => c.name.trim() === catName.trim());
        if (cat) {
            if (type === 'wholesale' && cat.wholesalePrice > 0) {
                setUnitPrice(cat.wholesalePrice);
            } else if (type === 'distributor') {
                const distObj = customDist !== undefined ? customDist : selectedDistributorForAdding;
                if (distObj) {
                    const commission = distObj.commission || 0;
                    const basePrice = cat.retailPrice || 0;
                    const calculated = basePrice * (1 - commission / 100);
                    setUnitPrice(calculated);
                } else {
                    setUnitPrice(cat.retailPrice || 0);
                }
            } else {
                setUnitPrice(cat.retailPrice || 0);
            }
        } else {
            const match = catName.match(/\d+/);
            setUnitPrice(match ? parseInt(match[0], 10) : 0);
        }
    };

    const handleSaleTypeChange = (type: 'retail' | 'wholesale' | 'distributor') => {
        setSaleType(type);
        if (selectedCategoryName) {
            handleSelectCategory(selectedCategoryName, type);
        }
    };

    const handleSelectDistributorForAdding = (dist: CardDistributor) => {
        setSelectedDistributorForAdding(dist);
        setSelectedDistributorId(dist.id);
        setDistributorSearch(dist.name);
        setCommissionPercent(dist.commission || 0);
        if (selectedCategoryName) {
            handleSelectCategory(selectedCategoryName, 'distributor', dist);
        }
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

        // Check stock considering already added qty in cart
        const currentQtyInCart = cartItems
            .filter(item => item.categoryName.trim() === selectedCategoryName.trim())
            .reduce((sum, item) => sum + item.quantity, 0);

        const totalRequested = currentQtyInCart + qtyNum;

        const newItem: CartItem = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
            categoryId: activeCatObj?.id,
            categoryName: selectedCategoryName,
            saleType,
            unitPrice,
            quantity: qtyNum,
            totalAmount: unitPrice * qtyNum,
            availableStock
        };

        if (availableStock < totalRequested) {
            setNegativeStockWarning({
                isOpen: true,
                categoryName: selectedCategoryName,
                requestedQty: qtyNum,
                availableStock,
                pendingItem: newItem
            });
            return;
        }

        setCartItems(prev => [...prev, newItem]);
        setQuantity('1');
    };

    const handleConfirmNegativeStock = () => {
        if (negativeStockWarning?.pendingItem) {
            setCartItems(prev => [...prev, negativeStockWarning.pendingItem!]);
            setQuantity('1');
        }
        setNegativeStockWarning(null);
    };

    const handleRemoveFromCart = (id: string) => {
        setCartItems(prev => prev.filter(item => item.id !== id));
    };

    // Distributor Selection
    const handleSelectDistributor = (dist: CardDistributor) => {
        setSelectedDistributorId(dist.id);
        setDistributorSearch(dist.name);
        setCommissionPercent(dist.commission || 0);
        setShowDistributorDropdown(false);
    };

    const filteredDistributors = distributors.filter(d => 
        d.name.toLowerCase().includes(distributorSearch.toLowerCase()) ||
        (d.phone && d.phone.includes(distributorSearch))
    );

    // Totals calculations
    const invoiceTotal = cartItems.reduce((sum, item) => sum + item.totalAmount, 0);
    const totalCardsQty = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const commissionAmount = saleType === 'distributor' ? 0 : invoiceTotal * (commissionPercent / 100);
    const netTotal = invoiceTotal - commissionAmount;

    // Execute Sales Transaction
    const handleConfirmCheckout = async () => {
        if (saving) return;
        if (cartItems.length === 0) {
            alert('السلة فارغة، يرجى إضافة كروت للجدول أولاً.');
            return;
        }

        if (paymentType === 'credit' && !selectedDistributorId) {
            alert('في حالة البيع الآجل، يجب اختيار الموزع / العميل.');
            return;
        }

        setSaving(true);
        const selectedDistributor = distributors.find(d => d.id === selectedDistributorId);
        const now = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

        // Immediate Alert/Verification for distributor credit and balance/prepaid status
        if (paymentType === 'credit' && selectedDistributor) {
            const currentDebt = selectedDistributor.balance || 0;
            // If they have prepaid balance (stored as negative debt), check if current sale exceeds it
            if (currentDebt < 0) {
                const availablePrepaid = Math.abs(currentDebt);
                if (netTotal > availablePrepaid) {
                    const confirmProceed = window.confirm(`تنبيه فوري: رصيد الصندوق للموزع لا يكفي للعملية!\nالمبلغ المتوفر كدفعة مقدمة: ${availablePrepaid.toFixed(2)} ريال.\nقيمة الفاتورة الحالية: ${netTotal.toFixed(2)} ريال.\nهل ترغب بالاستمرار وتحويل المبلغ المتبقي (${(netTotal - availablePrepaid).toFixed(2)} ريال) كدين مستحق؟`);
                    if (!confirmProceed) {
                        setSaving(false);
                        return;
                    }
                }
            } else if (currentDebt > 5000) {
                // If they have high debt
                const confirmProceed = window.confirm(`تنبيه فوري: رصيد مديونية الموزع مرتفع جداً حالياً (${currentDebt.toFixed(2)} ريال)!\nهل ترغب بالاستمرار في إتمام العملية بالآجل؟`);
                if (!confirmProceed) {
                    setSaving(false);
                    return;
                }
            }
        }

        try {
            // Generate purely numeric invoice number
            let nextInvoiceNumber = '';
            if (editingInvoice && editingInvoice.invoiceNumber) {
                nextInvoiceNumber = String(editingInvoice.invoiceNumber);
            } else {
                try {
                    const q = query(collection(db, 'card_sales'), where('tenantId', '==', tenantId));
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
                    console.error('Error generating sale invoice number:', e);
                    nextInvoiceNumber = String(Date.now()).slice(-8);
                }
            }

            await runTransaction(db, async (transaction) => {
                // --- PHASE 1: COMPUTE DELTAS AND COLLECT OLD DATA ---
                let oldInvoiceTotal = 0;
                let oldPaymentType = '';
                let oldDistributorId = '';
                const oldItems = [];
                const oldDocsToDelete = [];
                let oldCreatedAt = Date.now();
                
                if (editingInvoice && editingInvoice.docIds) {
                    for (const docId of editingInvoice.docIds) {
                        const oldDocRef = doc(db, 'card_sales', docId);
                        const oldDocSnap = await transaction.get(oldDocRef);
                        if (oldDocSnap.exists() && oldDocSnap.data().status !== 'cancelled') {
                            const data = oldDocSnap.data();
                            oldDocsToDelete.push(oldDocRef);
                            oldItems.push(data);
                            oldInvoiceTotal += (data.netTotal || data.totalAmount || 0);
                            oldPaymentType = data.paymentType;
                            oldDistributorId = data.distributorId || '';
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
                    
                    // 3. Match by cleaned normalized name (handles "فئة 100" vs "100" vs "100 ريال")
                    if (!catDoc) {
                        const itemClean = cleanName(item.categoryName);
                        catDoc = categories.find(c => 
                            cleanName(c.name) === itemClean || 
                            cleanName(c.linkedSection) === itemClean
                        );
                    }

                    const catId = catDoc ? catDoc.id : (item.categoryId || ('new_' + item.categoryName.trim()));
                    return { ...item, catId, isNewCat: !catDoc && !item.categoryId };
                });

                const stockDeltas: Record<string, number> = {};
                // When we cancel/delete a sale, stock GOES UP
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
                        stockDeltas[oldCatId] = (stockDeltas[oldCatId] || 0) + (old.quantity || 0);
                    }
                }
                
                // When we add a new sale, stock GOES DOWN
                if (invoiceStatus === 'completed') {
                    for (const item of newItemsWithCats) {
                        stockDeltas[item.catId] = (stockDeltas[item.catId] || 0) - (item.quantity || 0);
                    }
                }

                const distributorDeltas = {};
                // If old was credit, cancelling it means the distributor owes LESS (subtract oldInvoiceTotal)
                if (oldPaymentType === 'credit' && oldDistributorId) {
                    distributorDeltas[oldDistributorId] = (distributorDeltas[oldDistributorId] || 0) - oldInvoiceTotal;
                }
                // If new is credit, new sale means the distributor owes MORE (add netTotal)
                if (invoiceStatus === 'completed' && paymentType === 'credit' && selectedDistributorId) {
                    distributorDeltas[selectedDistributorId] = (distributorDeltas[selectedDistributorId] || 0) + netTotal;
                }

                let netCashboxInflow = 0;
                // Old cash sale cancelled = cash goes OUT
                if (oldPaymentType === 'cash') netCashboxInflow -= oldInvoiceTotal;
                // New cash sale = cash goes IN
                if (invoiceStatus === 'completed' && paymentType === 'cash') netCashboxInflow += netTotal;

                // --- PHASE 2: ALL READS ---
                const categorySnaps = {};
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

                const distributorSnaps = {};
                for (const distId of Object.keys(distributorDeltas)) {
                    if (distributorDeltas[distId] !== 0) {
                        const ref = doc(db, 'card_distributors', distId);
                        distributorSnaps[distId] = { ref, snap: await transaction.get(ref) };
                    }
                }

                // --- PHASE 3: ALL WRITES ---
                // 1. Delete old docs
                for (const ref of oldDocsToDelete) transaction.delete(ref);

                // 2. Map new categories to their actual Firestore IDs before saving
                const newCatRefs = {};
                if (invoiceStatus === 'completed') {
                    for (const item of newItemsWithCats) {
                        if (item.isNewCat && !newCatRefs[item.catId]) {
                            const newCatRef = doc(collection(db, 'card_categories'));
                            transaction.set(newCatRef, {
                                tenantId,
                                name: item.categoryName,
                                wholesalePrice: item.saleType === 'wholesale' ? item.unitPrice : 0,
                                retailPrice: item.saleType === 'retail' ? item.unitPrice : 0,
                                availableCount: 0, // Gets updated by stock delta below
                                createdAt: Date.now()
                            });
                            newCatRefs[item.catId] = newCatRef.id;
                        }
                    }
                }

                // 3. Create new sale docs
                for (const item of newItemsWithCats) {
                    const finalCatId = item.isNewCat ? newCatRefs[item.catId] : item.catId;
                    
                    const itemCommission = commissionPercent > 0 ? (item.totalAmount * commissionPercent) / 100 : 0;
                    const itemNetTotal = item.totalAmount - itemCommission;

                    const saleRef = doc(collection(db, 'card_sales'));
                    transaction.set(saleRef, {
                        tenantId,
                        categoryId: finalCatId || '',
                        categoryName: item.categoryName,
                        quantity: item.quantity,
                        saleType: item.saleType,
                        paymentType,
                        distributorId: selectedDistributorId || '',
                        distributorName: selectedDistributor ? selectedDistributor.name : 'عميل نقدي',
                        unitPrice: item.unitPrice,
                        commissionPercent,
                        commissionAmount: itemCommission,
                        totalAmount: item.totalAmount,
                        netTotal: itemNetTotal,
                        month: yearMonth,
                        monthNum: now.getMonth() + 1,
                        yearNum: now.getFullYear(),
                        date: dateStr,
                        dateTime: `${dateStr} ${timeStr}`,
                        userName: staffName,
                        sellerName: staffName,
                        createdByName: staffName,
                        invoiceNumber: nextInvoiceNumber,
                        status: invoiceStatus,
                        notes: notes.trim(),
                        createdAt: oldDocsToDelete.length > 0 ? oldCreatedAt : Date.now()
                    });
                }

                // 4. Update existing categories stock
                if (invoiceStatus === 'completed') {
                    for (const catId of Object.keys(stockDeltas)) {
                        const delta = stockDeltas[catId];
                        
                        let finalCatId = catId;
                        let catData = { name: 'فئة كروت', availableCount: 0 };
                        let catRef;
                        let isNew = false;
                        
                        if (catId.startsWith('new_')) {
                            finalCatId = newCatRefs[catId];
                            catRef = doc(db, 'card_categories', finalCatId);
                            catData.name = catId.replace('new_', '');
                            isNew = true;
                        } else {
                            if (categorySnaps[catId] && categorySnaps[catId].snap.exists()) {
                                catRef = categorySnaps[catId].ref;
                                catData = categorySnaps[catId].snap.data();
                            } else {
                                continue;
                            }
                        }
                        
                        if (delta !== 0) {
                            const currentStock = catData.availableCount || 0;
                            const newStock = currentStock + delta; // Note: delta is negative for sales, so this correctly reduces stock.
                            
                            // We only update if it's an existing category. For new categories, we just set the availableCount when creating it, but wait, we initialized it to 0 above! So we SHOULD update it here.
                            transaction.update(catRef, {
                                availableCount: newStock,
                                updatedAt: Date.now()
                            });

                            const stockLogRef = doc(collection(db, 'card_stock_logs'));
                            transaction.set(stockLogRef, {
                                tenantId,
                                categoryId: finalCatId,
                                categoryName: catData.name,
                                quantityAdded: delta, // Will be negative for sales
                                userName: staffName,
                                additionDate: `${dateStr} ${timeStr}`,
                                availableCountAfter: newStock,
                                notes: oldDocsToDelete.length > 0 ? `تسوية مبيعات (تعديل فاتورة #${nextInvoiceNumber})` : `فاتورة مبيعات كروت #${nextInvoiceNumber}`,
                                createdAt: Date.now()
                            });
                        }
                    }

                    // 5. Update distributor balances
                    for (const distId of Object.keys(distributorDeltas)) {
                        const delta = distributorDeltas[distId];
                        if (delta !== 0 && distributorSnaps[distId] && distributorSnaps[distId].snap.exists()) {
                            const suppRef = distributorSnaps[distId].ref;
                            const currentBalance = distributorSnaps[distId].snap.data().balance || 0;
                            transaction.update(suppRef, {
                                balance: currentBalance + delta,
                                updatedAt: Date.now()
                            });
                        }
                    }

                    // 6. Apply cashbox diff
                    if (netCashboxInflow !== 0) {
                        const cashboxRef = doc(collection(db, 'card_cashbox'));
                        const isIncome = netCashboxInflow > 0; 
                        const absAmount = Math.abs(netCashboxInflow);
                        
                        transaction.set(cashboxRef, {
                            tenantId,
                            type: isIncome ? 'cash_sale' : 'manual_out',
                            title: oldDocsToDelete.length > 0 ? `تسوية تعديل فاتورة مبيعات #${nextInvoiceNumber} (فارق السعر)` : `فاتورة بيع كروت نقدية (${totalCardsQty} كارت)`,
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
                            invoiceType: 'card_sale',
                            invoiceNumber: String(nextInvoiceNumber),
                            amount: netTotal,
                            createdById: appUser?.uid || '',
                            createdByName: staffName,
                            createdByRole: appUser?.role || 'user',
                            recipientRole: 'admin',
                            createdAt: Date.now(),
                            read: false,
                            title: `🧾 فاتورة مبيعات كروت جديدة #${nextInvoiceNumber}`,
                            body: `قام المستخدم (${staffName}) بإنشاء فاتورة مبيعات بمبلغ ${netTotal.toLocaleString('ar-SA')} ريال يمني`
                        });
                    }
                }
            });
            // Trigger action modal with full compiled invoice
            if (onInvoiceCreated) {
                onInvoiceCreated({
                    id: nextInvoiceNumber,
                    invoiceNumber: nextInvoiceNumber,
                    type: 'sale',
                    totalAmount: netTotal,
                    paymentType,
                    partyName: selectedDistributor ? selectedDistributor.name : 'عميل نقدي',
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: staffName,
                    notes: notes.trim(),
                    items: cartItems.map(item => {
                        const itemCommission = item.totalAmount * (commissionPercent / 100);
                        return {
                            categoryName: item.categoryName,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            totalAmount: item.totalAmount - itemCommission
                        };
                    })
                });
            }

            setSaving(false);
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            console.error('Error saving card sale:', error);
            handleFirestoreError(error, OperationType.WRITE, 'card_sales');
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/20  flex items-stretch justify-center p-0 animate-in fade-in duration-200 dir-rtl overflow-hidden" dir="rtl">
            <div className="bg-white dark:bg-slate-900 w-full h-full max-w-full p-4 sm:p-6 shadow-none flex flex-col justify-between overflow-hidden space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
                            <ShoppingBag size={22} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="font-black text-lg sm:text-xl text-slate-900 dark:text-white">
                                    بيع الكروت
                                </h2>
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
                                    <User size={13} className="text-indigo-600 dark:text-indigo-400" />
                                    المستخدم: <strong className="text-slate-900 dark:text-white">{staffName}</strong>
                                </span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto space-y-3 pr-1 pl-1 custom-scrollbar flex-1">
                    {/* TOP SECTION: 4-Column Categories Grid (فئات الكروت المربعة) */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                اختر فئة الكارت
                            </label>
                            {activeCatObj && (
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                    المتوفر بالفئة المحددة: <strong>{availableStock} كارت</strong>
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
                            {displayCategories.map((cat, catIdx) => {
                                const isSelected = selectedCategoryName.trim() === cat.name.trim();
                                return (
                                    <button
                                        key={`${cat.id || cat.name || 'cat'}-${catIdx}`}
                                        type="button"
                                        onClick={() => handleSelectCategory(cat.name, saleType)}
                                        className={`p-2.5 sm:p-3 rounded-2xl border-2 text-center transition flex flex-col items-center justify-center relative cursor-pointer ${
                                            isSelected
                                                ? 'bg-indigo-50/90 dark:bg-indigo-950/80 border-indigo-600 shadow-md shadow-indigo-600/10 text-slate-900 dark:text-white'
                                                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${
                                            isSelected ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                        }`}>
                                            <Wifi size={18} />
                                        </div>
                                        <div className="font-black text-xs sm:text-sm leading-tight text-slate-900 dark:text-white">
                                            {cat.name}
                                        </div>
                                        <span className={`text-[10px] font-black mt-1 px-2 py-0.5 rounded-full ${
                                            cat.availableCount > 0 
                                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                                : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                                        }`}>
                                            المتوفر: {cat.availableCount}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* SALE TYPE & INPUTS SECTION */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                        {/* Sale Type Selector (نوع البيع: جملة / تجزئة / موزع) */}
                        <div>
                            <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                                نوع البيع
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleSaleTypeChange('retail')}
                                    className={`py-2 px-3 rounded-xl text-xs font-black transition border ${
                                        saleType === 'retail'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    تجزئة ({activeCatObj?.retailPrice || 0} ريال يمني)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSaleTypeChange('wholesale')}
                                    className={`py-2 px-3 rounded-xl text-xs font-black transition border ${
                                        saleType === 'wholesale'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    جملة ({activeCatObj?.wholesalePrice || 0} ريال يمني)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSaleTypeChange('distributor')}
                                    className={`py-2 px-3 rounded-xl text-xs font-black transition border ${
                                        saleType === 'distributor'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    موزع {selectedDistributorForAdding ? `(${selectedDistributorForAdding.commission}%)` : ''}
                                </button>
                            </div>
                        </div>

                        {/* Distributor Selector in Addition Stage */}
                        {saleType === 'distributor' && (
                            <div className="mt-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-indigo-100 dark:border-indigo-950 space-y-2 animate-in slide-in-from-top-1 duration-150">
                                <label className="block text-xs font-black text-indigo-600 dark:text-indigo-400">
                                    اختر الموزع للبيع
                                </label>
                                <select
                                    value={selectedDistributorForAdding?.id || ''}
                                    onChange={(e) => {
                                        const dist = distributors.find(d => d.id === e.target.value);
                                        if (dist) {
                                            handleSelectDistributorForAdding(dist);
                                        }
                                    }}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-indigo-600"
                                >
                                    <option value="" disabled>-- اختر موزعاً من القائمة --</option>
                                    {distributors.map((dist, distIdx) => (
                                        <option key={`${dist.id || 'dist'}-${distIdx}`} value={dist.id}>
                                            {dist.name} (عمولة: %{dist.commission || 0})
                                        </option>
                                    ))}
                                </select>
                                {selectedDistributorForAdding && (
                                    <div className="p-2 bg-indigo-50/50 dark:bg-indigo-950/40 rounded-xl flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                                        <span>الموزع المحدد: <strong className="text-slate-950 dark:text-white">{selectedDistributorForAdding.name}</strong></span>
                                        <span>نسبة العمولة: <strong className="text-slate-950 dark:text-white">% {selectedDistributorForAdding.commission || 0}</strong></span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Price, Quantity & Add Button Row (حقول السعر والكمية وزر الإضافة بجانب بعض لتوفير المساحة) */}
                        <div className="grid grid-cols-12 gap-2.5 items-end">
                            <div className="col-span-4">
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5 text-center">
                                    سعر الكرت
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
                                            handleSelectCategory(selectedCategoryName, saleType);
                                        }
                                    }}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-indigo-600 text-center"
                                />
                            </div>

                            <div className="col-span-4">
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5 text-center">
                                    كمية الكروت
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
                                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 transition h-[38px] whitespace-nowrap"
                                >
                                    <Plus size={16} />
                                    <span>إضافة (+)</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ITEMS TABLE (جدول الأصناف المضافة اسفل الشاشة) */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200">
                                جدول الأصناف والفئات المضافة للفاتورة ({cartItems.length})
                            </h3>
                        </div>

                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                            <div className="overflow-x-auto max-h-48">
                                <table className="w-full text-right text-xs">
                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black sticky top-0 border-b border-slate-200 dark:border-slate-700">
                                        <tr>
                                            <th className="p-3">اسم الفئة</th>
                                            <th className="p-3">نوع البيع</th>
                                            <th className="p-3">السعر</th>
                                            <th className="p-3">الكمية</th>
                                            <th className="p-3">الإجمالي</th>
                                            <th className="p-3 text-center">إجراء</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                                        {cartItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="p-6 text-center text-slate-400 font-bold">
                                                    لم يتم إضافة أي كروت للفاتورة بعد. اختر فئة واضغط زر "إضافة".
                                                </td>
                                            </tr>
                                        ) : (
                                            cartItems.map((item, idx) => (
                                                <tr key={`${item.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                    <td className="p-3 font-black text-slate-900 dark:text-white">{item.categoryName}</td>
                                                    <td className="p-3">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                                            item.saleType === 'wholesale' 
                                                                ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300' 
                                                                : item.saleType === 'distributor'
                                                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                                : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                                        }`}>
                                                            {item.saleType === 'wholesale' ? 'جملة' : item.saleType === 'distributor' ? 'موزع' : 'تجزئة'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3">{item.unitPrice} ريال يمني</td>
                                                    <td className="p-3 font-black text-indigo-600 dark:text-indigo-400">{item.quantity} كارت</td>
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
                                <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-black">
                                    <span className="text-slate-600 dark:text-slate-300">
                                        عدد الكروت في الفاتورة: <strong className="text-indigo-600 dark:text-indigo-400">{totalCardsQty} كارت</strong>
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-600 dark:text-slate-400">إجمالي الأصناف:</span>
                                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{invoiceTotal} ريال يمني</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* BOTTOM ACTION BUTTON: "بيع" ZAR */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={() => {
                            if (cartItems.length === 0) {
                                alert('يرجى إضافة كروت إلى الجدول أولاً قبل الضغط على بيع');
                                return;
                            }
                            if (selectedDistributorForAdding) {
                                setSelectedDistributorId(selectedDistributorForAdding.id);
                                setDistributorSearch(selectedDistributorForAdding.name);
                                setCommissionPercent(selectedDistributorForAdding.commission || 0);
                                setPaymentType('credit'); // Default to credit (آجل) for distributor sales
                            }
                            setShowPaymentModal(true);
                        }}
                        disabled={cartItems.length === 0}
                        className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:pointer-events-none"
                    >
                        <ShoppingBag size={20} />
                        <span>بيع (إتمام وتسديد الفاتورة) - الإجمالي: {invoiceTotal} ريال يمني</span>
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

            {/* CHECKOUT PAYMENT MODAL (نافذة الدفع للمبيعات - اختيار العميل من جدول الموزعين) */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-50 bg-black/20  flex items-center justify-center p-4 animate-in fade-in duration-200 dir-rtl" dir="rtl">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 my-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 rounded-2xl">
                                    <CreditCard size={22} />
                                </div>
                                <div>
                                    <h3 className="font-black text-lg text-slate-900 dark:text-white">
                                        نافذة الدفع والتسديد
                                    </h3>
                                    <p className="text-xs font-bold text-slate-400">
                                        اخْتَر العميل/الموزع وطريقة الدفع لإتمام الفاتورة
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
                            {/* 1. طريقة الدفع فوقهم بالأعلى */}
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                                    طريقة الدفع
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentType('cash')}
                                        className={`py-2.5 px-3 rounded-xl text-xs font-black transition border ${
                                            paymentType === 'cash'
                                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        💵 نقدي (كاش)
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
                                        💳 آجل (دين على الموزع)
                                    </button>
                                </div>
                            </div>

                            {/* 2. اسم العميل وتحته حقل الملاحظات */}
                            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
                                        اختيار العميل / الموزع {paymentType === 'credit' && <span className="text-rose-500">* (مطلوب للآجل)</span>}
                                    </label>
                                    <SearchableSelect
                                        value={selectedDistributorId || ''}
                                        onChange={(distId) => {
                                            if (distId === '') {
                                                setSelectedDistributorId('');
                                                setDistributorSearch('');
                                                setCommissionPercent(0);
                                            } else {
                                                const dist = distributors.find(d => d.id === distId);
                                                if (dist) {
                                                    handleSelectDistributor(dist);
                                                }
                                            }
                                        }}
                                        placeholder="-- بدون موزع (عميل نقدي عام) --"
                                        options={distributors.map(dist => ({ 
                                            id: dist.id, 
                                            label: dist.name, 
                                            subLabel: dist.phone ? `${dist.phone} - عمولة: %${dist.commission || 0}` : `عمولة: %${dist.commission || 0}` 
                                        }))}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const now = new Date();
                                            const month = new Date().getMonth() + 1;
                                            const year = new Date().getFullYear();
                                            const cardsName = `سجل مبيعات يومية كروت لشهر ${month} ${year}`;
                                            const generalName = `مبيعات يومية لشهر ${month} ${year}`;
                                            const dist = distributors.find(d => d.name === cardsName) || distributors.find(d => d.name === generalName);
                                            if (dist) {
                                                handleSelectDistributor(dist);
                                            } else {
                                                alert('لم يتم العثور على عميل مبيعات الشهر الحالي في النظام. يرجى الانتظار قليلاً أو إعادة تحميل الصفحة.');
                                            }
                                        }}
                                        className="text-[10px] font-bold text-amber-600 hover:text-amber-800 underline underline-offset-4 decoration-amber-300 transition-colors w-max mt-1"
                                    >
                                        + إدراج عميل مبيعات الشهر الحالي تلقائياً
                                    </button>
                                </div>

                                {/* حقل الملاحظات تحت اسم العميل */}
                                <div>
                                    <label className="block text-xs font-black mb-1.5 text-slate-700 dark:text-slate-300">
                                        ملاحظات عملية البيع (تظهر على الفاتورة)
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder="أدخل أي ملاحظات على العملية..."
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-600 transition resize-none"
                                    />
                                </div>
                            </div>

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

                            {/* 3. السعر والعمولة/الخصم والإجمالي في نفس السطر (Row Layout) */}
                            <div className="bg-emerald-50/70 dark:bg-emerald-950/40 p-3 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 space-y-2">
                                <div className="grid grid-cols-3 gap-2 items-center text-center">
                                    {/* الإجمالي قبل الخصم */}
                                    <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">الإجمالي ({totalCardsQty} كارت)</span>
                                        <span className="text-xs font-black text-slate-900 dark:text-white truncate" dir="ltr">
                                            {invoiceTotal} ريال يمني
                                        </span>
                                    </div>

                                    {/* الخصم / العمولة */}
                                    <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col justify-center">
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5">عمولة الموزع (%)</span>
                                        {saleType !== 'distributor' ? (
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="any"
                                                value={commissionPercent}
                                                onChange={(e) => setCommissionPercent(parseFloat(e.target.value) || 0)}
                                                className="w-14 mx-auto bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-center text-xs font-black text-amber-600 outline-none p-0.5"
                                            />
                                        ) : (
                                            <span className="text-xs font-black text-amber-600">{commissionPercent}%</span>
                                        )}
                                    </div>

                                    {/* صافي المطلوب */}
                                    <div className="bg-emerald-600 text-white p-2 rounded-xl flex flex-col justify-center shadow-sm">
                                        <span className="text-[10px] font-bold text-emerald-100 mb-0.5">الصافي المطلوب</span>
                                        <span className="text-xs font-black truncate" dir="ltr">
                                            {netTotal.toFixed(2)} ريال يمني
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleConfirmCheckout}
                                    disabled={saving}
                                    className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
                                >
                                    <CheckCircle2 size={18} />
                                    <span>{saving ? 'جاري الحفظ والإنهاء...' : 'تأكيد وإتمام البيع وطباعة الفاتورة'}</span>
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
            {/* NEGATIVE STOCK WARNING MODAL (إشعار البيع بالسالب في منتصف الشاشة مدعوم بالأيقونات) */}
            {negativeStockWarning?.isOpen && (
                <div className="fixed inset-0 z-[60] bg-black/20  flex items-center justify-center p-4 animate-in fade-in duration-200 dir-rtl" dir="rtl">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-900/50 space-y-5 my-auto text-center">
                        <div className="w-16 h-16 rounded-3xl bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto border-2 border-rose-200 dark:border-rose-800 shadow-lg shadow-rose-600/10">
                            <AlertTriangle size={34} />
                        </div>

                        <div className="space-y-2">
                            <h3 className="font-black text-lg text-slate-900 dark:text-white">
                                تنبيه: الكمية المطلوبة غير متوفرة!
                            </h3>
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                                الرصيد المتاح حالياً لفئة <strong className="text-indigo-600 dark:text-indigo-400">{negativeStockWarning.categoryName}</strong> هو <strong className="text-rose-600 dark:text-rose-400">{negativeStockWarning.availableStock} كارت</strong>.
                                <br />
                                أنت تحاول إضافة <strong className="text-slate-900 dark:text-white">{negativeStockWarning.requestedQty} كارت</strong> للبيع.
                            </p>
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 rounded-2xl text-[11px] font-black text-amber-700 dark:text-amber-300">
                                هل ترغب في الاستمرار والبيع بالسالب لخصم الكمية من رصيد المخزون؟
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={handleConfirmNegativeStock}
                                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 transition"
                            >
                                <AlertTriangle size={16} />
                                <span>نعم، البيع بالسالب</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setNegativeStockWarning(null)}
                                className="px-5 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-2xl transition"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
