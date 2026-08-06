import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Plus, Trash2, CheckCircle2, User, Phone, Search, CreditCard, DollarSign, Wifi } from 'lucide-react';
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

export default function CardPurchaseModal({ isOpen, onClose, categoryName, onSuccess, onInvoiceCreated }: CardPurchaseModalProps) {
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

    // Fetch Categories & Suppliers
    useEffect(() => {
        if (!isOpen) return;

        const qCat = query(collection(db, 'card_categories'), where('tenantId', '==', tenantId));
        const unsubCat = onSnapshot(qCat, (snap) => {
            const list: CardCategory[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardCategory));
            setCategories(list);
        });

        const qSupp = query(collection(db, 'card_suppliers'), where('tenantId', '==', tenantId));
        const unsubSupp = onSnapshot(qSupp, (snap) => {
            const list: CardSupplier[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardSupplier));
            setSuppliers(list);
        });

        return () => {
            unsubCat();
            unsubSupp();
        };
    }, [isOpen]);

    // Available categories display list (from default 8 network card sections, linked with category stocks)
    const displayCategories = DEFAULT_DENOMINATIONS.map(denom => {
        const matching = categories.filter(c => c.name.trim() === denom.name.trim() || c.linkedSection?.trim() === denom.name.trim());
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

    // Execute Purchase Transaction
    const handleConfirmCheckout = async () => {
        if (cartItems.length === 0) {
            alert('السلة فارغة، يرجى إضافة كروت للجدول أولاً.');
            return;
        }

        if (paymentType === 'credit' && !selectedSupplierId) {
            alert('في حالة الشراء الآجل، يجب اختيار المورد.');
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

            await runTransaction(db, async (transaction) => {
                // 1. READ ALL CATEGORIES FIRST (only if completed)
                const categoryDocs = [];
                if (invoiceStatus === 'completed') {
                    for (const item of cartItems) {
                        const catDoc = categories.find(c => c.name.trim() === item.categoryName.trim() || c.linkedSection?.trim() === item.categoryName.trim());
                        if (catDoc) {
                            const catRef = doc(db, 'card_categories', catDoc.id);
                            const snap = await transaction.get(catRef);
                            categoryDocs.push({ item, ref: catRef, snap, exists: true });
                        } else {
                            categoryDocs.push({ item, ref: null, snap: null, exists: false });
                        }
                    }
                }

                let supplierRef = null;
                let supplierSnap = null;
                if (invoiceStatus === 'completed' && paymentType === 'credit' && selectedSupplierId) {
                    supplierRef = doc(db, 'card_suppliers', selectedSupplierId);
                    supplierSnap = await transaction.get(supplierRef);
                }

                // 2. ALL WRITES/UPDATES NEXT
                if (invoiceStatus === 'completed') {
                    for (const { item, ref, snap, exists } of categoryDocs) {
                        let currentCategoryId = item.categoryId || '';
                        let newStock = item.quantity;

                        if (exists && ref && snap && snap.exists()) {
                            const catData = snap.data();
                            newStock = (catData.availableCount || 0) + item.quantity;
                            currentCategoryId = snap.id;
                            const catUpdate: any = {
                                availableCount: newStock,
                                updatedAt: Date.now()
                            };
                            if (autoUpdateCostPrice && item.unitPrice > 0) {
                                catUpdate.wholesalePrice = item.unitPrice;
                            }
                            transaction.update(ref, catUpdate);
                        } else {
                            const newCatRef = doc(collection(db, 'card_categories'));
                            transaction.set(newCatRef, {
                                tenantId,
                                name: item.categoryName,
                                wholesalePrice: item.unitPrice,
                                retailPrice: item.unitPrice * 1.05,
                                availableCount: item.quantity,
                                createdAt: Date.now()
                            });
                            newStock = item.quantity;
                            currentCategoryId = newCatRef.id;
                        }

                        // Create stock log
                        const stockLogRef = doc(collection(db, 'card_stock_logs'));
                        transaction.set(stockLogRef, {
                            tenantId,
                            categoryId: currentCategoryId,
                            categoryName: item.categoryName,
                            quantityAdded: item.quantity,
                            userName: staffName,
                            additionDate: `${dateStr} ${timeStr}`,
                            availableCountAfter: newStock,
                            createdAt: Date.now()
                        });

                        // Add Card Purchase record
                        const purchaseRef = doc(collection(db, 'card_purchases'));
                        transaction.set(purchaseRef, {
                            tenantId,
                            categoryId: currentCategoryId,
                            categoryName: item.categoryName,
                            quantity: item.quantity,
                            purchaseType: 'supplier',
                            paymentType,
                            supplierId: selectedSupplierId || '',
                            supplierName: selectedSupplier ? selectedSupplier.name : 'مورد نقدي عام',
                            unitPrice: item.unitPrice,
                            totalAmount: item.totalAmount,
                            month: yearMonth,
                            date: dateStr,
                            dateTime: `${dateStr} ${timeStr}`,
                            userName: staffName,
                            invoiceNumber: nextInvoiceNumber,
                            status: invoiceStatus,
                            notes: notes.trim(),
                            createdAt: Date.now()
                        });
                    }

                    // Add to Cashbox and Cash Ledger if Cash
                    if (paymentType === 'cash') {
                        const cashboxRef = doc(collection(db, 'card_cashbox'));
                        transaction.set(cashboxRef, {
                            tenantId,
                            type: 'supplier_purchase_cash',
                            title: `فاتورة شراء كروت نقدية (${totalCardsQty} كارت) - المورد: ${selectedSupplier ? selectedSupplier.name : 'نقدي'}`,
                            amount: invoiceTotal,
                            isIncome: false,
                            date: dateStr,
                            dateTime: `${dateStr} ${timeStr}`,
                            userName: staffName,
                            createdAt: Date.now()
                        });

                        const mainCashRef = doc(collection(db, 'cash'));
                        transaction.set(mainCashRef, {
                            date: Date.now(),
                            amount: invoiceTotal,
                            type: 'out',
                            category: 'card_purchase',
                            description: `مشتريات كروت - ${selectedSupplier ? selectedSupplier.name : 'نقدي'} (${totalCardsQty} كارت)`,
                            referenceId: cashboxRef.id,
                            createdBy: appUser?.uid || 'unknown',
                            createdAt: Date.now(),
                            tenantId
                        });
                    }

                    // Update Supplier Balance if Credit
                    if (paymentType === 'credit' && supplierRef && supplierSnap && supplierSnap.exists()) {
                        const currentBalance = supplierSnap.data().balance || 0;
                        transaction.update(supplierRef, {
                            balance: currentBalance + invoiceTotal,
                            updatedAt: Date.now()
                        });
                    }

                    // Manager Invoice Notification
                    const notifRef = doc(collection(db, 'notifications'));
                    transaction.set(notifRef, {
                        tenantId,
                        type: 'invoice_created',
                        invoiceType: 'card_purchase',
                        invoiceNumber: String(nextInvoiceNumber),
                        amount: invoiceTotal,
                        createdById: appUser?.uid || '',
                        createdByName: staffName,
                        createdByRole: appUser?.role || 'user',
                        recipientRole: 'admin',
                        createdAt: Date.now(),
                        read: false,
                        title: `🧾 فاتورة شراء كروت جديدة #${nextInvoiceNumber}`,
                        body: `قام المستخدم (${staffName}) بإنشاء فاتورة شراء كروت بمبلغ ${invoiceTotal.toLocaleString('ar-SA')} ر.س`
                    });
                } else {
                    // For draft or cancelled, we only save the purchase records themselves
                    for (const item of cartItems) {
                        const purchaseRef = doc(collection(db, 'card_purchases'));
                        transaction.set(purchaseRef, {
                            tenantId,
                            categoryId: item.categoryId || '',
                            categoryName: item.categoryName,
                            quantity: item.quantity,
                            purchaseType: 'supplier',
                            paymentType,
                            supplierId: selectedSupplierId || '',
                            supplierName: selectedSupplier ? selectedSupplier.name : 'مورد نقدي عام',
                            unitPrice: item.unitPrice,
                            totalAmount: item.totalAmount,
                            month: yearMonth,
                            date: dateStr,
                            dateTime: `${dateStr} ${timeStr}`,
                            userName: staffName,
                            invoiceNumber: nextInvoiceNumber,
                            status: invoiceStatus,
                            notes: notes.trim(),
                            createdAt: Date.now()
                        });
                    }
                }
            });

            // Trigger action modal with full compiled invoice
            if (onInvoiceCreated) {
                onInvoiceCreated({
                    id: nextInvoiceNumber,
                    invoiceNumber: nextInvoiceNumber,
                    type: 'purchase',
                    totalAmount: invoiceTotal,
                    paymentType,
                    partyName: selectedSupplier ? selectedSupplier.name : 'مورد نقدي عام',
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: staffName,
                    notes: notes.trim(),
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
                                    شراء الكروت (تزويد رصيد المخزون)
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
                    {/* TOP SECTION: Categories Grid */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                اختر فئة الكارت لتزويدها بالرصيد
                            </label>
                            {activeCatObj && (
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                    الرصيد الحالي بالمخزن: <strong>{availableStock} كارت</strong>
                                </span>
                            )}
                        </div>
                        <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
                            {displayCategories.map((cat) => {
                                const isSelected = selectedCategoryName.trim() === cat.name.trim();
                                return (
                                    <button
                                        key={cat.name}
                                        type="button"
                                        onClick={() => handleSelectCategory(cat.name)}
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
                                        <span className={`text-[10px] font-black mt-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300`}>
                                            المخزون الحالي: {cat.availableCount}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* INPUTS SECTION */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-3">
                        <div className="grid grid-cols-12 gap-2.5 items-end">
                            <div className="col-span-4">
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5 text-center">
                                    سعر الشراء الفردي (ريال)
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
                                    الكمية المشتراة (عدد الكروت)
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
                                    <span>إضافة للفاتورة (+)</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ITEMS TABLE */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200">
                                كشف الأصناف المضافة لفاتورة الشراء ({cartItems.length})
                            </h3>
                        </div>

                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                            <div className="overflow-x-auto max-h-48">
                                <table className="w-full text-right text-xs">
                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black sticky top-0 border-b border-slate-200 dark:border-slate-700">
                                        <tr>
                                            <th className="p-3">اسم الفئة</th>
                                            <th className="p-3">سعر الشراء الموحد</th>
                                            <th className="p-3">الكمية</th>
                                            <th className="p-3">الإجمالي الفرعي</th>
                                            <th className="p-3 text-center">إجراء</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                                        {cartItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-6 text-center text-slate-400 font-bold">
                                                    لم يتم إضافة أي كروت للفاتورة بعد. اختر فئة واضغط زر "إضافة".
                                                </td>
                                            </tr>
                                        ) : (
                                            cartItems.map((item, idx) => (
                                                <tr key={`${item.id}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                    <td className="p-3 font-black text-slate-900 dark:text-white">{item.categoryName}</td>
                                                    <td className="p-3">{item.unitPrice} ريال</td>
                                                    <td className="p-3 font-black text-indigo-600 dark:text-indigo-400">{item.quantity} كارت</td>
                                                    <td className="p-3 font-black text-emerald-600 dark:text-emerald-400">{item.totalAmount} ريال</td>
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
                                        إجمالي عدد الكروت المضافة: <strong className="text-indigo-600 dark:text-indigo-400">{totalCardsQty} كارت</strong>
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-600 dark:text-slate-400">الإجمالي العام للفاتورة:</span>
                                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{invoiceTotal} ريال</span>
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
                        className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:pointer-events-none"
                    >
                        <ShoppingBag size={20} />
                        <span>إتمام وحفظ فاتورة الشراء - الإجمالي: {invoiceTotal} ريال</span>
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
                <div className="fixed inset-0 z-50 bg-black/20  flex items-center justify-center p-4 animate-in fade-in duration-200 dir-rtl" dir="rtl">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 my-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 rounded-2xl">
                                    <CreditCard size={22} />
                                </div>
                                <div>
                                    <h3 className="font-black text-lg text-slate-900 dark:text-white">
                                        تسديد وتأكيد فاتورة الشراء
                                    </h3>
                                    <p className="text-xs font-bold text-slate-400">
                                        اختر طريقة الدفع والمورد المستهدف لإتمام العملية
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
                                    طريقة تسديد الفاتورة
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
                                        💵 نقدي (خصم من الصندوق)
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
                                        💳 آجل (دين مسجل للمورد)
                                    </button>
                                </div>
                            </div>

                            {/* 2. اسم المورد وتحته حقل الملاحظات */}
                            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                                        اختيار المورد {paymentType === 'credit' && <span className="text-rose-500">* (مطلوب للشراء الآجل)</span>}
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
                                        ملاحظات عملية الشراء (تظهر على الفاتورة)
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder="أدخل أي ملاحظات على عملية الشراء..."
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-600 transition resize-none"
                                    />
                                </div>
                            </div>

                            {/* Auto Update Cost Price Option */}
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
                                    <div className="bg-emerald-600 text-white p-2 rounded-xl flex flex-col justify-center shadow-sm">
                                        <span className="text-[10px] font-bold text-emerald-100 mb-0.5">الإجمالي الصافي للمبلغ</span>
                                        <span className="text-xs font-black truncate" dir="ltr">
                                            {invoiceTotal} ريال
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
                                    <span>{saving ? 'جاري الحفظ والتسجيل...' : 'تأكيد وإتمام الشراء وطباعة الفاتورة'}</span>
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
