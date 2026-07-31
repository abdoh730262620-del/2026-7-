import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Plus, Trash2, CheckCircle2, User, Phone, Search, CreditCard, DollarSign, Wifi, AlertTriangle } from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { CardCategory, CardSupplier } from '../types/cardTypes';
import SearchableSelect from './SearchableSelect';
import { printReport } from '../lib/printHelper';

interface CardPurchaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    categoryName?: string;
    onSuccess?: () => void;
}

interface CartItem {
    id: string;
    categoryId?: string;
    categoryName: string;
    purchaseType: 'retail' | 'wholesale' | 'distributor';
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

export default function CardPurchaseModal({ isOpen, onClose, categoryName, onSuccess }: CardPurchaseModalProps) {
    const { appUser } = useAuthStore();
    const tenantId = 'single_store';
    const staffName = appUser?.name || appUser?.email || 'المستخدم الحياتي';

    const [categories, setCategories] = useState<CardCategory[]>([]);
    const [suppliers, setSuppliers] = useState<CardSupplier[]>([]);

    // Selected category & row inputs
    const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
    const [purchaseType, setPurchaseType] = useState<'retail' | 'wholesale' | 'distributor'>('retail');
    const [selectedSupplierForAdding, setSelectedSupplierForAdding] = useState<CardSupplier | null>(null);
    const [unitPrice, setUnitPrice] = useState<number>(0);
    const [quantity, setQuantity] = useState<string>('1');

    // Cart items
    const [cartItems, setCartItems] = useState<CartItem[]>([]);

    // Payment Drawer / Modal
    const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
    const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
    const [supplierSearch, setSupplierSearch] = useState<string>('');
    const [showSupplierDropdown, setShowSupplierDropdown] = useState<boolean>(false);
    const [autoUpdateCostPrice, setAutoUpdateCostPrice] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);

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

        const qCat = query(collection(db, 'card_categories'), where('tenantId', '==', tenantId));
        const unsubCat = onSnapshot(qCat, (snap) => {
            const list: CardCategory[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardCategory));
            setCategories(list);
        });

        const qDist = query(collection(db, 'card_suppliers'), where('tenantId', '==', tenantId));
        const unsubDist = onSnapshot(qDist, (snap) => {
            const list: CardSupplier[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardSupplier));
            setSuppliers(list);
        });

        return () => {
            unsubCat();
            unsubDist();
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
            handleSelectCategory(initial, purchaseType);
        }
    }, [isOpen, categoryName, categories.length]);

    // When selecting a category square or changing sale type
    const handleSelectCategory = (catName: string, type: 'retail' | 'wholesale' | 'distributor', customDist?: CardSupplier | null) => {
        setSelectedCategoryName(catName);
        const cat = displayCategories.find(c => c.name.trim() === catName.trim());
        if (cat) {
            if (type === 'wholesale' && cat.wholesalePrice > 0) {
                setUnitPrice(cat.wholesalePrice);
            } else if (type === 'distributor') {
                const distObj = customDist !== undefined ? customDist : selectedSupplierForAdding;
                if (distObj) {
                    const commission = distObj?.name ? 0 : 0 || 0;
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
        setPurchaseType(type);
        if (selectedCategoryName) {
            handleSelectCategory(selectedCategoryName, type);
        }
    };

    const handleSelectDistributorForAdding = (dist: CardSupplier) => {
        setSelectedSupplierForAdding(dist);
        setSelectedSupplierId(dist.id);
        setSupplierSearch(dist.name);
        ;
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
            purchaseType,
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
    const handleSelectDistributor = (dist: CardSupplier) => {
        setSelectedSupplierId(dist.id);
        setSupplierSearch(dist.name);
        ;
        setShowSupplierDropdown(false);
    };

    const filteredDistributors = suppliers.filter(d => 
        d.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
        (d.phone && d.phone.includes(supplierSearch))
    );

    // Totals calculations
    const invoiceTotal = cartItems.reduce((sum, item) => sum + item.totalAmount, 0);
    const totalCardsQty = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const commissionAmount = invoiceTotal * (0 / 100);
    const netTotal = invoiceTotal - commissionAmount;

    // Execute Sales Transaction
    const handleConfirmCheckout = async () => {
        if (cartItems.length === 0) {
            alert('السلة فارغة، يرجى إضافة كروت للجدول أولاً.');
            return;
        }

        if (paymentType === 'credit' && !selectedSupplierId) {
            alert('في حالة الشراء الآجل، يجب اختيار المورد / المورد.');
            return;
        }

        setSaving(true);
        const selectedSupplier = suppliers.find(d => d.id === selectedSupplierId);
        const now = new Date();
        const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

        try {
            // Group cart items by category to update stock accurately
            for (const item of cartItems) {
                // 1. Update Category Available Count & Cost Price
                const catDoc = categories.find(c => c.name.trim() === item.categoryName.trim() || c.linkedSection?.trim() === item.categoryName.trim());
                let newStock = item.quantity;
                if (catDoc) {
                    newStock = (catDoc.availableCount || 0) + item.quantity;
                    const catUpdate: any = {
                        availableCount: newStock,
                        updatedAt: Date.now()
                    };
                    if (autoUpdateCostPrice && item.unitPrice > 0) {
                        catUpdate.wholesalePrice = item.unitPrice;
                        catUpdate.costPrice = item.unitPrice;
                    }
                    await updateDoc(doc(db, 'card_categories', catDoc.id), catUpdate);
                } else {
                    // Create category doc if missing
                    const newCatRef = await addDoc(collection(db, 'card_categories'), {
                        tenantId,
                        name: item.categoryName,
                        wholesalePrice: item.purchaseType === 'wholesale' ? item.unitPrice : 0,
                        retailPrice: item.purchaseType === 'retail' ? item.unitPrice : 0,
                        availableCount: item.quantity,
                        createdAt: Date.now()
                    });
                    newStock = item.quantity;
                }

                // Add stock log
                await addDoc(collection(db, 'card_stock_logs'), {
                    tenantId,
                    categoryId: catDoc ? catDoc.id : '',
                    categoryName: item.categoryName,
                    quantityAdded: item.quantity,
                    userName: staffName,
                    additionDate: `${dateStr} ${timeStr}`,
                    availableCountAfter: newStock
                });

                // Calculate item proportional commission and net total
                const itemCommission = item.totalAmount * (0 / 100);
                const itemNetTotal = item.totalAmount - itemCommission;

                // 2. Add Card Sale record linked to user
                await addDoc(collection(db, 'card_purchases'), {
                    tenantId,
                    categoryName: item.categoryName,
                    quantity: item.quantity,
                    purchaseType: item.purchaseType,
                    paymentType,
                    distributorId: selectedSupplierId || '',
                    supplierName: selectedSupplier ? selectedSupplier.name : 'مورد نقدي',
                    unitPrice: item.unitPrice,
                    
                    commissionAmount: itemCommission,
                    totalAmount: item.totalAmount,
                    netTotal: itemNetTotal,
                    month: yearMonth,
                    date: dateStr,
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: staffName,
                    createdAt: Date.now()
                });
            }

            // 3. Add to Sales Cashbox if Cash
            if (paymentType === 'cash') {
                await addDoc(collection(db, 'card_cashbox'), {
                    tenantId,
                    type: 'cash_purchase',
                    title: `فاتورة شراء كروت نقدية (${totalCardsQty} كارت) - المورد: ${selectedSupplier ? selectedSupplier.name : 'نقدي'}`,
                    amount: netTotal,
                    isIncome: false,
                    date: dateStr,
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: staffName,
                    createdAt: Date.now()
                });
            }

            // 4. Update Distributor Debt Balance if Credit
            if (paymentType === 'credit' && selectedSupplier) {
                const currentBalance = selectedSupplier.balance || 0;
                await updateDoc(doc(db, 'card_suppliers', selectedSupplier.id), {
                    balance: currentBalance + netTotal,
                    updatedAt: Date.now()
                });
            }

            // Receipt Printing Option
            const printChoice = window.confirm('تم حفظ إتمام عملية الشراء بنجاح!\nهل ترغب بطباعة فاتورة الشراء الرسمية؟');
            if (printChoice) {
                const reportData = cartItems.map(item => [
                    item.categoryName,
                    item.purchaseType === 'wholesale' ? 'جملة' : item.purchaseType === 'distributor' ? 'مورد' : 'تجزئة',
                    `${item.unitPrice} ريال`,
                    `${item.quantity} كارت`,
                    `${item.totalAmount} ريال`
                ]);
                reportData.push([
                    'إجمالي الفاتورة',
                    '--',
                    '--',
                    `${totalCardsQty} كارت`,
                    `${invoiceTotal} ريال`
                ]);
                if (false) {
                    reportData.push([
                        `الخصم / العمولة (%$0)`,
                        '--',
                        '--',
                        '--',
                        `-${commissionAmount.toFixed(2)} ريال`
                    ]);
                    reportData.push([
                        'الصافي النهائي المستحق',
                        '--',
                        '--',
                        '--',
                        `${netTotal.toFixed(2)} ريال`
                    ]);
                }

                printReport(
                    `فاتورة شراء كروت - ${selectedSupplier ? selectedSupplier.name : 'مورد نقدي'}`,
                    ['فئة الكارت', 'نوع الشراء', 'السعر', 'الكمية', 'الإجمالي'],
                    reportData
                );
            }

            setSaving(false);
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            console.error('Error saving card sale:', error);
            handleFirestoreError(error, OperationType.WRITE, 'card_purchases');
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-stretch justify-center p-0 animate-in fade-in duration-200 dir-rtl overflow-hidden" dir="rtl">
            <div className="bg-white dark:bg-slate-900 w-full h-full max-w-5xl p-3 sm:p-5 shadow-2xl flex flex-col justify-between overflow-hidden space-y-3">
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
                            {displayCategories.map((cat) => {
                                const isSelected = selectedCategoryName.trim() === cat.name.trim();
                                return (
                                    <button
                                        key={cat.name}
                                        type="button"
                                        onClick={() => handleSelectCategory(cat.name, purchaseType)}
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
                        {/* Sale Type Selector (نوع الشراء: جملة / تجزئة / مورد) */}
                        <div>
                            <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                                نوع الشراء
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleSaleTypeChange('retail')}
                                    className={`py-2 px-3 rounded-xl text-xs font-black transition border ${
                                        purchaseType === 'retail'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    تجزئة ({activeCatObj?.retailPrice || 0} ريال)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSaleTypeChange('wholesale')}
                                    className={`py-2 px-3 rounded-xl text-xs font-black transition border ${
                                        purchaseType === 'wholesale'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    جملة ({activeCatObj?.wholesalePrice || 0} ريال)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSaleTypeChange('distributor')}
                                    className={`py-2 px-3 rounded-xl text-xs font-black transition border ${
                                        purchaseType === 'distributor'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    مورد {selectedSupplierForAdding ? `(${selectedSupplierForAdding?.name ? 0 : 0}%)` : ''}
                                </button>
                            </div>
                        </div>

                        {/* Distributor Selector in Addition Stage */}
                        {purchaseType === 'distributor' && (
                            <div className="mt-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-indigo-100 dark:border-indigo-950 space-y-2 animate-in slide-in-from-top-1 duration-150">
                                <label className="block text-xs font-black text-indigo-600 dark:text-indigo-400">
                                    اختر المورد للبيع
                                </label>
                                <select
                                    value={selectedSupplierForAdding?.id || ''}
                                    onChange={(e) => {
                                        const dist = suppliers.find(d => d.id === e.target.value);
                                        if (dist) {
                                            handleSelectDistributorForAdding(dist);
                                        }
                                    }}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-indigo-600"
                                >
                                    <option value="" disabled>-- اختر مورداً من القائمة --</option>
                                    {suppliers.map(dist => (
                                        <option key={dist.id} value={dist.id}>
                                            {dist.name} (عمولة: %{0 || 0})
                                        </option>
                                    ))}
                                </select>
                                {selectedSupplierForAdding && (
                                    <div className="p-2 bg-indigo-50/50 dark:bg-indigo-950/40 rounded-xl flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
                                        <span>المورد المحدد: <strong className="text-slate-950 dark:text-white">{selectedSupplierForAdding.name}</strong></span>
                                        <span>نسبة العمولة: <strong className="text-slate-950 dark:text-white">% {selectedSupplierForAdding?.name ? 0 : 0 || 0}</strong></span>
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
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
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
                                            <th className="p-3">نوع الشراء</th>
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
                                            cartItems.map((item) => (
                                                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                    <td className="p-3 font-black text-slate-900 dark:text-white">{item.categoryName}</td>
                                                    <td className="p-3">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                                            item.purchaseType === 'wholesale' 
                                                                ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300' 
                                                                : item.purchaseType === 'distributor'
                                                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                                : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                                        }`}>
                                                            {item.purchaseType === 'wholesale' ? 'جملة' : item.purchaseType === 'distributor' ? 'مورد' : 'تجزئة'}
                                                        </span>
                                                    </td>
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
                                        عدد الكروت في الفاتورة: <strong className="text-indigo-600 dark:text-indigo-400">{totalCardsQty} كارت</strong>
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-slate-600 dark:text-slate-400">إجمالي الأصناف:</span>
                                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{invoiceTotal} ريال</span>
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
                            if (selectedSupplierForAdding) {
                                setSelectedSupplierId(selectedSupplierForAdding.id);
                                setSupplierSearch(selectedSupplierForAdding.name);
                                // setCommissionPercent(selectedSupplierForAdding?.name ? 0 : 0 || 0);
                                setPaymentType('credit'); // Default to credit (آجل) for distributor sales
                            }
                            setShowPaymentModal(true);
                        }}
                        disabled={cartItems.length === 0}
                        className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-sm rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:pointer-events-none"
                    >
                        <ShoppingBag size={20} />
                        <span>بيع (إتمام وتسديد الفاتورة) - الإجمالي: {invoiceTotal} ريال</span>
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

            {/* CHECKOUT PAYMENT MODAL (نافذة الدفع للمشتريات - اختيار المورد من جدول الموردين) */}
            {showPaymentModal && (
                <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 dir-rtl" dir="rtl">
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
                                        اخْتَر المورد/المورد وطريقة الدفع لإتمام الفاتورة
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

                        <div className="space-y-4">
                            {/* Payment Method (طريقة الدفع) */}
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
                                        نقدي (كاش)
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
                                        أجل (دين على المورد)
                                    </button>
                                </div>
                            </div>

                            {/* Customer / Distributor Dropdown (حقل المورد يأخذ من جدول الموردين) */}
                            <div>
                                <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1.5">
                                    اختيار المورد / المورد {paymentType === 'credit' && <span className="text-rose-500">* (مطلوب للآجل)</span>}
                                </label>
                                <SearchableSelect
                                    value={selectedSupplierId || ''}
                                    onChange={setSelectedSupplierId}
                                    placeholder="-- بدون مورد (مورد نقدي عام) --"
                                    options={suppliers.map(dist => ({ id: dist.id, label: dist.name, subLabel: dist.phone }))}
                                />
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
                                    تحديث سعر التكلفة/الجملة للفئة تلقائياً بناءً على سعر الشراء الجديد
                                </span>
                            </label>

                            {/* Commission % Field */}

                            {/* Summary Calculation Box */}
                            <div className="bg-emerald-50/70 dark:bg-emerald-950/40 p-4 rounded-2xl space-y-2 border border-emerald-100 dark:border-emerald-900/40 text-xs font-bold">
                                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                                    <span>إجمالي الفاتورة ({totalCardsQty} كارت):</span>
                                    <span>{invoiceTotal} ريال</span>
                                </div>
                                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                                    <span>خصم عمولة المورد (0%):</span>
                                    <span>- {commissionAmount.toFixed(2)} ريال</span>
                                </div>
                                <div className="flex justify-between text-slate-900 dark:text-white text-sm font-black pt-2 border-t border-emerald-200/60 dark:border-emerald-900/60">
                                    <span>صافي المبلغ المطلوب تسديده:</span>
                                    <span className="text-emerald-600 dark:text-emerald-400">{netTotal.toFixed(2)} ريال</span>
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
                                    <span>{saving ? 'جاري الحفظ والإنهاء...' : 'تأكيد وإتمام الشراء وطباعة الفاتورة'}</span>
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
            {/* NEGATIVE STOCK WARNING MODAL (إشعار الشراء بالسالب في منتصف الشاشة مدعوم بالأيقونات) */}
            {negativeStockWarning?.isOpen && (
                <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 dir-rtl" dir="rtl">
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
                                هل ترغب في الاستمرار والشراء بالسالب لخصم الكمية من رصيد المخزون؟
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={handleConfirmNegativeStock}
                                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 transition"
                            >
                                <AlertTriangle size={16} />
                                <span>نعم، الشراء بالسالب</span>
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
