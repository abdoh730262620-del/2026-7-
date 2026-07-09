import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, increment, getDocs, orderBy, limit, where, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useInvoiceStore, CartItem } from '../store/invoiceStore';
import { logUserAction } from '../lib/logger';
import { Truck, Plus, Minus, Trash2, Search, FileText, Printer, ShoppingCart, MoreVertical, ArrowLeft, X } from 'lucide-react';
import { printInvoice } from '../lib/printHelper';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
import SearchableSelect from '../components/SearchableSelect';
import ReturnInvoiceModal from '../components/ReturnInvoiceModal';

interface PurchaseInvoice {
    id: string;
    invoiceNumber: string;
    date: number;
    supplierId: string;
    items: any[];
    total: number;
    paymentType: string;
    createdBy: string;
    createdAt?: number;
    status?: string;
}

interface Product {
    id: string;
    name: string;
    barcode: string;
    price: number;
    cost: number;
    quantity: number;
}

interface Supplier {
    id: string;
    name: string;
}

import { useNavigate } from 'react-router-dom';

export default function Purchases() {
    const navigate = useNavigate();
    const { appUser, hasPermission } = useAuthStore();
    const { settings } = useSettingsStore();
    
    const canAdd = hasPermission('purchases', 'add');
    const canEdit = hasPermission('purchases', 'edit');
    const canDelete = hasPermission('purchases', 'delete');
    const canReturn = hasPermission('purchases', 'return');
    const canView = hasPermission('purchases', 'view');
    const { 
        purchasesCart: cart, setPurchasesCart: setCart, 
        purchasesPaymentMethod: paymentMethod, setPurchasesPaymentMethod: setPaymentMethod, 
        purchasesSupplierName: supplierSearchName, setPurchasesSupplierName: setSupplierSearchName, 
        purchasesDiscountPercent: discountPercent, setPurchasesDiscountPercent: setDiscountPercent,
        purchasesSearch: search, setPurchasesSearch: setSearch,
        purchasesActiveTab: activeTab, setPurchasesActiveTab: setActiveTab,
        purchasesEditingInvoice: editingInvoice, setPurchasesEditingInvoice: setEditingInvoice,
        clearPurchases 
    } = useInvoiceStore();
    
    const [products, setProducts] = useState<Product[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
    const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);

    const [isNewPartyModalOpen, setIsNewPartyModalOpen] = useState(false);
    const [newPartyPhone, setNewPartyPhone] = useState('');
    const [newPartyAddress, setNewPartyAddress] = useState('');
    const [newPartyBalance, setNewPartyBalance] = useState('');
    const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
    const [searchInvoice, setSearchInvoice] = useState('');
    const [isAddProductOpen, setIsAddProductOpen] = useState(false);
    const [newProdName, setNewProdName] = useState('');
    const [newProdBarcode, setNewProdBarcode] = useState('');
    const [newProdCost, setNewProdCost] = useState<number>(0);

    const _reverseInvoice = async (invoice: any, actionType: 'returned' | 'cancelled', providedBatch?: any) => {
        const batch = providedBatch || writeBatch(db);
        batch.update(doc(db, 'purchases', invoice.id), { status: actionType });
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
        
        (invoice.items || []).forEach((item: any) => {
            if (item.productId) {
                batch.set(doc(db, 'products', item.productId), {
                    quantity: increment(-item.quantity)
                }, { merge: true });
            }
        });

        if (invoice.paymentType === 'cash' || invoice.status === 'paid' || parseFloat(invoice.paidAmount || 0) > 0) {
            const amountToRefund = invoice.paymentType === 'cash' || invoice.status === 'paid' ? parseFloat(invoice.total) : parseFloat(invoice.paidAmount || 0);
            batch.set(doc(collection(db, 'cash')), {
                date: Date.now(),
                amount: amountToRefund,
                type: 'in',
                category: 'refund',
                description: `${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} فاتورة مشتريات ${invoice.invoiceNumber} للمورد ${invoice.supplierName || suppliers.find(s => s.id === invoice.supplierId)?.name || invoice.supplierId}`,
                referenceId: invoice.id,
                createdBy: appUser?.uid || 'system',
                tenantId,
                createdAt: Date.now()
            });
            if (invoice.paymentType === 'credit' && invoice.supplierId) {
                 batch.update(doc(db, 'suppliers', invoice.supplierId), {
                     balance: increment(parseFloat(invoice.total))
                 });
            }
        } else if (invoice.paymentType === 'credit' && invoice.supplierId) {
             batch.update(doc(db, 'suppliers', invoice.supplierId), {
                 balance: increment(parseFloat(invoice.total))
             });
        }
        
        if (!providedBatch) {
            await batch.commit();
            await logUserAction(actionType === 'returned' ? 'إرجاع فاتورة مشتريات' : 'إلغاء فاتورة مشتريات', `تم ${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} الفاتورة ${invoice.invoiceNumber}`);
        }
    };

    const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void, onCancel?: () => void}>({isOpen: false, message: '', onConfirm: () => {}});
    const [alertDialog, setAlertDialog] = useState<{isOpen: boolean, message: string}>({isOpen: false, message: ''});
    const [returnModalState, setReturnModalState] = useState<{isOpen: boolean, invoice: any | null}>({isOpen: false, invoice: null});

    const handlePartialReturn = async (invoice: any, returnedItems: any[]) => {
        setReturnModalState({ isOpen: false, invoice: null });
        if (!canReturn) {
            setAlertDialog({ isOpen: true, message: 'ليس لديك صلاحية إرجاع فواتير المشتريات.' });
            return;
        }

        try {
            const batch = writeBatch(db);
            const now = Date.now();
            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

            let refundValue = 0;
            const updatedItems = [...invoice.items];

            returnedItems.forEach(retItem => {
                const itemIndex = updatedItems.findIndex(i => i.productId === retItem.productId);
                if (itemIndex > -1) {
                    updatedItems[itemIndex] = {
                        ...updatedItems[itemIndex],
                        quantity: updatedItems[itemIndex].quantity - retItem.returnedQuantity
                    };
                }
                
                const grossValue = parseFloat(retItem.price) * retItem.returnedQuantity;
                const itemDiscount = (grossValue * (invoice.discountPercent || 0)) / 100;
                refundValue += (grossValue - itemDiscount);

                if (retItem.productId) {
                    batch.set(doc(db, 'products', retItem.productId), {
                        quantity: increment(-retItem.returnedQuantity) // reduce stock since we are returning purchase
                    }, { merge: true });
                }
            });

            const finalItems = updatedItems.filter(i => i.quantity > 0);
            const newTotal = finalItems.reduce((acc, curr) => acc + (parseFloat(curr.price) * curr.quantity), 0);
            const newDiscount = (newTotal * (invoice.discountPercent || 0)) / 100;
            const newFinalTotal = newTotal - newDiscount;

            let newPaidAmount = parseFloat(invoice.paidAmount || invoice.total);
            if (invoice.paymentType === 'cash' || invoice.status === 'paid') {
                 batch.set(doc(collection(db, 'cash')), {
                    date: now,
                    amount: refundValue,
                    type: 'in', // returning money to us from the supplier
                    category: 'refund',
                    description: `استرجاع جزئي لفاتورة مشتريات ${invoice.invoiceNumber}`,
                    referenceId: invoice.id,
                    createdBy: appUser?.uid || 'system',
                    tenantId,
                    createdAt: now
                 });
                 newPaidAmount -= refundValue; 
            } else if (invoice.paymentType === 'credit') {
                 if (invoice.supplierId) {
                     batch.update(doc(db, 'suppliers', invoice.supplierId), {
                         balance: increment(refundValue) // We owe them less money (balance goes up/closer to 0) or refund cash
                     });
                 }
            }

            const isFullReturn = finalItems.length === 0;

            if (isFullReturn) {
                 batch.update(doc(db, 'purchases', invoice.id), {
                     status: 'returned'
                 });
            } else {
                 batch.update(doc(db, 'purchases', invoice.id), {
                     items: finalItems,
                     total: newFinalTotal,
                     paidAmount: newPaidAmount,
                     status: (invoice.paymentType === 'credit' && newPaidAmount >= newFinalTotal) ? 'paid' : (invoice.paymentType === 'cash' ? 'paid' : 'credit')
                 });
            }

            await batch.commit();
            await logUserAction('استرجاع جزئي لفاتورة مشتريات', `تم استرجاع جزئي بقيمة ${refundValue} للفاتورة ${invoice.invoiceNumber}`);
            setAlertDialog({ isOpen: true, message: 'تم استرجاع المشتريات جزئياً وتحديث المخزون المعني.' });
        } catch (error: any) {
            setAlertDialog({ isOpen: true, message: error.message || 'حدث خطأ' });
        }
    };

    const handleReturnOrCancelInvoice = async (invoice: any, actionType: 'returned' | 'cancelled') => {
        if (actionType === 'cancelled' && !canDelete) {
            setAlertDialog({ isOpen: true, message: 'ليس لديك صلاحية إلغاء فواتير المشتريات.' });
            return;
        }
        if (actionType === 'returned' && !canReturn) {
            setAlertDialog({ isOpen: true, message: 'ليس لديك صلاحية إرجاع فواتير المشتريات.' });
            return;
        }
        if (!appUser) return;
        setConfirmDialog({
            isOpen: true,
            message: `هل أنت متأكد من ${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} الفاتورة ${invoice.invoiceNumber} وخصم المخزون؟`,
            onConfirm: async () => {
                setConfirmDialog(p => ({ ...p, isOpen: false }));
                try {
                    await _reverseInvoice(invoice, actionType);
                    setAlertDialog({ isOpen: true, message: `تم ${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} الفاتورة بنجاح.` });
                } catch (error: any) {
                    setAlertDialog({ isOpen: true, message: error.message || 'حدث خطأ' });
                    handleFirestoreError(error, OperationType.UPDATE, 'purchases');
                }
            }
        });
    };

    const handleEditInvoice = async (invoice: any) => {
        if (!canEdit) {
            setAlertDialog({ isOpen: true, message: 'ليس لديك صلاحية تعديل فواتير المشتريات.' });
            return;
        }
        setConfirmDialog({
            isOpen: true,
            message: 'هذا سيؤدي إلى استبدال سلة المشتريات الحالية بالفاتورة المحددة لتعديلها. هل توافق؟',
            onConfirm: async () => {
                setConfirmDialog(p => ({ ...p, isOpen: false }));
                try {
                    setEditingInvoice(invoice);
                    
                    // Set everything into Cart
                    setCart(invoice.items.map((i: any) => ({
                        id: i.productId,
                        name: i.name,
                        price: i.price,
                        cost: i.cost || i.price,
                        cartQuantity: i.quantity,
                        barcode: i.barcode || ''
                    })));
                    setDiscountPercent(invoice.discountPercent || 0);
                    setPaymentMethod(invoice.paymentType);
                    const supp = suppliers.find(s => s.id === invoice.supplierId);
                    if (supp) {
                        setSupplierSearchName(supp.name);
                    } else {
                        setSupplierSearchName(invoice.supplierName || '');
                    }
                    setActiveTab('add');
                } catch (error: any) {
                    setAlertDialog({ isOpen: true, message: error.message || 'حدث خطأ أثناء تحميل الفاتورة للتعديل.' });
                }
            }
        });
    };

    useEffect(() => {
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

        // Load products
        const qProducts = query(collection(db, 'products'), where('tenantId', '==', tenantId));
        const unsubProducts = onSnapshot(qProducts, (snapshot) => {
            const list: Product[] = [];
            snapshot.forEach(docObj => {
                list.push({ id: docObj.id, ...docObj.data() } as Product);
            });
            setProducts(list);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

        // Load suppliers
        const qSuppliers = query(collection(db, 'suppliers'), where('tenantId', '==', tenantId));
        const unsubSuppliers = onSnapshot(qSuppliers, (snapshot) => {
            const list: Supplier[] = [];
            snapshot.forEach(docObj => {
                list.push({ id: docObj.id, name: docObj.data().name } as Supplier);
            });
            setSuppliers(list);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'suppliers'));

        // Load invoices
        const qInvoices = query(collection(db, 'purchases'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'), limit(100));
        const unsubInvoices = onSnapshot(qInvoices, (snapshot) => {
             const list: PurchaseInvoice[] = [];
             snapshot.forEach(docObj => {
                 list.push({ id: docObj.id, ...docObj.data() } as PurchaseInvoice);
             });
             setInvoices(list);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'purchases'));

        return () => {
            unsubProducts();
            unsubSuppliers();
            unsubInvoices();
        };
    }, [appUser]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => p.name.includes(search) || p.barcode.includes(search));
    }, [products, search]);

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item);
            }
            return [...prev, { ...product, cartQuantity: 1, buyPrice: product.cost }];
        });
    };

    const updateCartQuantity = (id: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQ = item.cartQuantity + delta;
                if (newQ <= 0) return item;
                return { ...item, cartQuantity: newQ };
            }
            return item;
        }));
    };
    
    const updateCartPrice = (id: string, price: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, buyPrice: price };
            }
            return item;
        }));
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id));
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
        setIsDropdownOpen(e.target.value.length > 0);
    };

    const handleSelectProduct = (product: Product) => {
        addToCart(product);
        setSearch('');
        setIsDropdownOpen(false);
    };

    const subtotal = cart.reduce((sum, item) => sum + ((item.buyPrice || 0) * item.cartQuantity), 0);
    const totalItems = cart.reduce((sum, item) => sum + item.cartQuantity, 0);
    const discountAmount = (subtotal * discountPercent) / 100;
    const total = subtotal - discountAmount;

    const handleAddProduct = async () => {
        if (!newProdName) return alert('يرجى كتابة اسم المنتج');
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
        try {
            const newDoc = await addDoc(collection(db, 'products'), {
                name: newProdName,
                barcode: newProdBarcode,
                price: newProdCost * 1.5, // default markup 50%
                cost: newProdCost,
                quantity: 0,
                category: 'مشتريات جديدة',
                tenantId,
                createdAt: Date.now()
            });
            setIsAddProductOpen(false);
            setSearch('');
            addToCart({
                id: newDoc.id,
                name: newProdName,
                barcode: newProdBarcode,
                price: newProdCost * 1.5,
                cost: newProdCost,
                quantity: 0
            });
        } catch (error) {
            console.error(error);
            alert("خطأ في إضافة المنتج");
        }
    };

    const handleCheckout = async () => {
        if (cart.length === 0 || !appUser) return;
        if (!supplierSearchName.trim()) {
            alert("يرجى إدخال المورد لإتمام العملية.");
            return;
        }

        let finalSupplierId: string | null = null;
        const existingSupplier = suppliers.find(s => s.name.toLowerCase() === supplierSearchName.trim().toLowerCase());
        if (existingSupplier) {
            finalSupplierId = existingSupplier.id;
        } else {
            setIsNewPartyModalOpen(true);
            return;
        }

        await processCheckout(finalSupplierId);
    };

    const processCheckout = async (supplierId: string | null) => {
        setIsCheckingOut(true);
        let invoiceNum = '';
        if (!editingInvoice) {
            const existingNums = invoices
                .map(i => parseInt(i.invoiceNumber.replace(/\D/g, '')))
                .filter(n => !isNaN(n) && n < 10000000000); // Filter out old timestamps
            const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 1000;
            invoiceNum = String(maxNum + 1).padStart(5, '0');
        } else {
            invoiceNum = editingInvoice.invoiceNumber;
        }
        try {
            const batch = writeBatch(db);
            const now = Date.now();
            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
            
            if (editingInvoice) {
                await _reverseInvoice(editingInvoice, 'cancelled', batch);
            }

            let finalSupplierId = supplierId;

            if (!finalSupplierId && supplierSearchName.trim() !== '') {
                const suppRef = doc(collection(db, 'suppliers'));
                batch.set(suppRef, {
                    name: supplierSearchName.trim(),
                    phone: newPartyPhone,
                    address: newPartyAddress,
                    balance: parseFloat(newPartyBalance) || 0,
                    createdAt: now,
                    updatedAt: now,
                    tenantId
                });
                finalSupplierId = suppRef.id;
            }

            // 1. Create Purchase Invoice
            const purchaseRef = editingInvoice ? doc(db, 'purchases', editingInvoice.id) : doc(collection(db, 'purchases'));
            batch.set(purchaseRef, {
                invoiceNumber: invoiceNum,
                date: now,
                supplierId: finalSupplierId,
                items: cart.map(item => ({
                    productId: item.id,
                    name: item.name,
                    price: item.buyPrice || 0,
                    quantity: item.cartQuantity
                })),
                subtotal: subtotal,
                discountPercent: discountPercent,
                discountAmount: discountAmount,
                total: total,
                paymentType: paymentMethod,
                status: 'active',
                createdBy: appUser?.uid,
                createdAt: now,
                tenantId
            });

            // 2. Update Inventory (Add to stock)
            for (const item of cart) {
                const pRef = doc(db, 'products', item.id);
                batch.update(pRef, {
                    quantity: increment(item.cartQuantity)
                });

                const invLogRef = doc(collection(db, 'inventoryLogs'));
                batch.set(invLogRef, {
                    date: now,
                    productId: item.id,
                    changeAmount: item.cartQuantity,
                    reason: `Purchase ${invoiceNum}`,
                    referenceId: purchaseRef.id,
                    createdBy: appUser?.uid,
                    createdAt: now,
                    tenantId
                });
            }

            // 3. Financial Routing
            if (paymentMethod === 'cash' && (settings.cashIncludePurchases !== false)) {
                const cashRef = doc(collection(db, 'cash'));
                batch.set(cashRef, {
                    date: now,
                    amount: total,
                    type: 'out',
                    category: 'purchase',
                    description: `Cash Purchase ${invoiceNum}`,
                    referenceId: purchaseRef.id,
                    createdBy: appUser?.uid,
                    createdAt: now,
                    tenantId
                });
            } else if (finalSupplierId) {
                const supplierRef = doc(db, 'suppliers', finalSupplierId);
                batch.update(supplierRef, {
                    balance: increment(-total)
                });
            }
            
            // Background optimistic commit
            batch.commit().catch(e => console.error("purchases sync error:", e));

            logUserAction('عملية شراء', `إتمام عملية شراء برقم ${invoiceNum} بقيمة ${total} ر.س. طريقة الدفع: ${paymentMethod}`).catch(() => {});
            const clearAndClose = () => {
                setCart([]);
                setIsCheckoutModalOpen(false);
                setIsNewPartyModalOpen(false);
                setNewPartyPhone('');
                setNewPartyAddress('');
                setNewPartyBalance('0');
                setSupplierSearchName('');
                setActiveTab('list');
            };

            setConfirmDialog({
                isOpen: true,
                message: "تم تسجيل المشتريات بنجاح! هل تريد معاينة ومشاركة الفاتورة؟",
                onConfirm: () => {
                    setConfirmDialog(p => ({ ...p, isOpen: false }));
                    setPreviewInvoiceId(purchaseRef.id);
                    clearAndClose();
                },
                onCancel: () => {
                    setConfirmDialog(p => ({ ...p, isOpen: false }));
                    clearAndClose();
                }
            });
        } catch (error: any) {
             console.error("Purchase failed", error);
             setAlertDialog({ isOpen: true, message: error.message || 'فشلت عملية الشراء' });
             handleFirestoreError(error, OperationType.WRITE, 'purchase-transaction');
        } finally {
            setIsCheckingOut(false);
        }
    };

    const filteredInvoices = useMemo(() => {
        const lowerSearchInvoice = searchInvoice.toLowerCase();
        
        // Build a lookup map of supplierId -> lowercase name for performance
        const supplierMap = new Map<string, string>();
        suppliers.forEach(s => {
            if (s.id) supplierMap.set(s.id, (s.name || '').toLowerCase());
        });

        return invoices.filter(inv => {
            const suppName = supplierMap.get(inv.supplierId) || '';
            return suppName.includes(lowerSearchInvoice) || 
                   (inv.invoiceNumber || '').toLowerCase().includes(lowerSearchInvoice);
        });
    }, [invoices, suppliers, searchInvoice]);

    if (!canView) {
        return <div className="p-5 md:p-8 text-center text-red-600 font-bold text-base md:text-xl">ليس لديك صلاحية للوصول إلى صفحة المشتريات</div>;
    }

    return (
        <div className="flex flex-col gap-3 h-full min-h-0 text-xs overflow-hidden" dir="rtl">
            {/* Tabs */}
            <div className="flex bg-bg-main rounded-xl p-0.5 border border-border-main shadow-sm w-max self-start shrink-0">
                <button 
                    onClick={() => setActiveTab('list')}
                    className={`px-4 md:px-6 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 text-xs md:text-sm ${activeTab === 'list' ? 'bg-purple-600 text-white shadow-md' : 'text-text-main/50 hover:text-purple-600 hover:bg-white'}`}
                >
                    <FileText size={16} />
                    سجل المشتريات
                </button>
                <button 
                    onClick={() => setActiveTab('add')}
                    className={`px-4 md:px-6 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 text-xs md:text-sm ${activeTab === 'add' ? 'bg-purple-600 text-white shadow-md' : 'text-text-main/50 hover:text-purple-600 hover:bg-white'}`}
                >
                    <Plus size={16} />
                    فاتورة مشتريات
                </button>
            </div>

            {activeTab === 'list' && (
                <div className="flex-1 bg-card-bg rounded-xl shadow-sm border border-border-main flex flex-col overflow-hidden min-h-0">
                    <div className="p-3 border-b border-border-main flex flex-col md:flex-row gap-3 justify-between items-center bg-bg-main shrink-0">
                        <div className="relative w-full md:w-80 group">
                            <Search className="absolute right-3 top-2.5 text-gray-400 group-focus-within:text-purple-600 transition-colors" size={16} />
                            <input 
                                type="text"
                                placeholder="بحث برقم الفاتورة أو اسم المورد..."
                                className="w-full bg-card-bg border border-border-main rounded-xl pr-9 pl-3 py-2 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-50 transition-all font-bold text-text-main text-[11px]"
                                value={searchInvoice}
                                onChange={(e) => setSearchInvoice(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto md:overflow-x-auto min-h-0 bg-card-bg">
                        <table className="w-full text-right whitespace-nowrap text-[10px] md:text-xs">
                            <thead className="bg-bg-main sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main">رقم الفاتورة</th>
                                    
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main">المورد</th>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main text-center">الأصناف</th>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main text-center">الإجمالي</th>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main text-center">طريقة الدفع</th>
                                    
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-main">
                                {filteredInvoices.map((invoice, invIndex) => {
                                    const supplierName = suppliers.find(s => s.id === invoice.supplierId)?.name || 'غير معروف';
                                    const dateObj = new Date(invoice.date || invoice.createdAt || 0);
                                    return (
                                        <React.Fragment key={invoice.id}>
                                        <tr className="hover:bg-bg-main transition-colors group cursor-pointer" onClick={() => setActiveDropdownId(invoice.id)}>
                                            <td className="p-3 font-bold text-purple-700">#{invoice.invoiceNumber}</td>
                                            <td className="p-3">
    <div className="flex flex-col">
        <span className="font-bold text-text-main">{supplierName}</span>
        <span className="text-[9px] font-bold text-text-main/40 uppercase leading-none mt-1">{dateObj.toLocaleDateString('ar-EG')} - {dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
</td>
                                            <td className="p-3 text-center">
                                                <span className="bg-bg-main px-2 py-0.5 rounded-lg text-[9px] font-bold text-text-main border border-border-main group-hover:bg-card-bg transition-colors">{invoice.items?.length || 0}</span>
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className="font-bold text-blue-600">{invoice.total?.toLocaleString()} <small className="text-[8px] opacity-50">ر.س</small></span>
                                            </td>
                                            <td className="p-3 text-center">
                                                <div className="flex flex-col gap-1 items-center justify-center">
                                                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${invoice.paymentType === 'cash' ? 'bg-white text-emerald-700' : 'bg-white text-orange-700'}`}>
                                                        {invoice.paymentType === 'cash' ? 'نقدي' : 'آجل'}
                                                    </span>
                                                    {invoice.status === 'cancelled' && <span className="text-[9px] font-bold text-red-600 bg-white px-2 py-0.5 rounded-lg">ملغية</span>}
                                                    {invoice.status === 'returned' && <span className="text-[9px] font-bold text-black dark:text-gray-300 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-lg">مرتجعة</span>}
                                                </div>
                                            </td>
                                            
                                        </tr>
                                        </React.Fragment>
                                    )
                                })}
                                {filteredInvoices.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-10 text-center text-text-main/20 font-bold italic">لا توجد فواتير بتلك المواصفات</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>


                    </div>
                </div>
            )}

            {activeTab === 'add' && (
                <div className="bg-card-bg rounded-xl shadow-sm border border-border-main flex flex-col relative flex-1 min-h-0 overflow-visible">
                    {editingInvoice && (
                        <div className="bg-white border-b border-yellow-200 p-3 flex justify-between items-center shrink-0">
                            <span className="text-yellow-800 font-bold text-sm">
                                وضع التعديل الفاتورة رقم: {editingInvoice.invoiceNumber}
                            </span>
                            <button 
                                onClick={() => {
                                    clearPurchases();
                                    setActiveTab('list');
                                }}
                                className="text-yellow-700 hover:text-yellow-900 bg-white hover:bg-white px-3 py-1.5 rounded-lg text-xs font-bold transition"
                            >
                                إلغاء التعديل
                            </button>
                        </div>
                    )}
                    <div className="p-3 border-b border-border-main bg-white shrink-0 rounded-t-xl relative z-30">
                        <div className="relative w-full z-20">
                            <div className="bg-card-bg flex items-center gap-3 w-full h-12 px-4 rounded-xl border border-border-main focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100 transition-all relative z-20 shadow-sm cursor-text" onClick={(e) => {
                                const input = e.currentTarget.querySelector('input');
                                if (input) input.focus();
                            }}>
                                <Search size={20} className="text-gray-400 group-focus-within:text-purple-500 transition-colors shrink-0" />
                                <input 
                                    type="text" 
                                    placeholder="ابحث عن منتج..." 
                                    className="flex-1 h-full outline-none font-extrabold text-sm text-text-main placeholder:text-gray-400 bg-transparent"
                                    value={search}
                                    onChange={handleSearchChange}
                                    onFocus={() => { if(search.length > 0) setIsDropdownOpen(true); }}
                                    onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                                />
                                {search && (
                                    <button onClick={(e) => { e.stopPropagation(); setSearch(''); }} className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer p-1 shrink-0">
                                        <X size={18} />
                                    </button>
                                )}
                            </div>

                            <AnimatePresence>
                                {isDropdownOpen && search.length > 0 && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 5 }}
                                        className="absolute top-full right-0 left-0 mt-2 z-[100] bg-white dark:bg-slate-900 border border-border-main rounded-xl shadow-2xl max-h-80 md:max-h-96 overflow-y-auto p-2 flex flex-col gap-2 w-full"
                                    >
                                        {filteredProducts.map(p => (
                                            <button 
                                                key={p.id} 
                                                type="button"
                                                onClick={() => handleSelectProduct(p)}
                                                className="w-full text-right p-3 bg-card-bg hover:bg-white rounded-xl shadow-sm border border-border-main flex justify-between items-center transition-all hover:scale-[1.01] active:scale-[0.99] group"
                                            >
                                                <div className="flex flex-col text-right">
                                                    <span className="font-extrabold text-text-main text-sm group-hover:text-purple-600 transition-colors">{p.name}</span>
                                                    <span className="text-[10px] font-bold text-text-main/50 uppercase tracking-tight bg-bg-main w-max px-1.5 py-0.5 rounded-md mt-1">{p.barcode || 'بدون باركود'}</span>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="font-black text-purple-700 text-sm">{p.cost || p.price} <small className="text-[9px] font-bold opacity-75">ر.س</small></span>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/25 text-purple-700">
                                                        المخزون الحالي: {p.quantity}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                        {filteredProducts.length === 0 && (
                                            <div className="p-10 text-center text-text-main/40 font-bold flex flex-col items-center gap-4 italic w-full">
                                                <div className="flex flex-col items-center gap-2">
                                                    <Search size={36} className="opacity-20" />
                                                    <span className="text-xs">لا توجد منتجات مطابقة</span>
                                                </div>
                                                {search && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            setNewProdName(search);
                                                            setIsAddProductOpen(true);
                                                            setSearch('');
                                                        }}
                                                        className="bg-white text-purple-700 px-5 py-2.5 rounded-xl transition-all flex gap-2 items-center font-bold text-xs border border-purple-200 hover:bg-white hover:text-purple-800 shadow-sm"
                                                    >
                                                        <Plus size={14} /> إضافة كمنتج جديد
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto bg-bg-main min-h-0 modern-scrollbar p-2 flex flex-col gap-2 relative z-10">
                        {cart.map(item => (
                                    <div key={item.id} className="bg-card-bg p-2 rounded-lg shadow-sm border border-border-main flex items-center justify-between gap-1.5 group">
                                        <div className="flex flex-col overflow-hidden min-w-0">
                                            <span className="font-bold text-text-main text-[11px] truncate">{item.name}</span>
                                            <span className="text-[9px] font-bold text-text-main/40 uppercase tracking-widest bg-bg-main w-max px-1 rounded-sm mt-0.5">{item.barcode}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="flex flex-col items-center px-1">
                                                <input 
                                                    type="number" 
                                                    value={item.buyPrice || 0} 
                                                    onChange={e => updateCartPrice(item.id, Number(e.target.value))}
                                                    className="border border-border-main rounded-md p-0.5 w-14 text-center focus:border-purple-500 bg-white block text-[11px] font-bold text-text-main transition-all outline-none"
                                                    min="0"
                                                />
                                            </div>
                                            <div className="flex items-center gap-1.5 bg-bg-main rounded-lg p-0.5 border border-border-main">
                                                <button onClick={() => updateCartQuantity(item.id, 1)} className="p-1 bg-white shadow-sm text-purple-600 hover:bg-purple-600 hover:text-white rounded-md transition-all"><Plus size={10} /></button>
                                                <span className="font-bold w-4 text-center text-[10px] text-text-main">{item.cartQuantity}</span>
                                                <button onClick={() => updateCartQuantity(item.id, -1)} className="p-1 bg-white shadow-sm text-red-600 hover:bg-red-600 hover:text-white rounded-md transition-all"><Minus size={10} /></button>
                                            </div>
                                            <div className="flex flex-col items-center px-1">
                                                <span className="font-bold text-purple-700 text-[11px]">{(item.buyPrice || 0) * item.cartQuantity}</span>
                                            </div>
                                            <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 p-1 bg-white hover:bg-white rounded-lg transition-all"><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                ))}
                                {cart.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-text-main/30 gap-3">
                                        <ShoppingCart size={48} className="opacity-20" />
                                        <span className="font-bold text-sm italic">السلة فارغة</span>
                                    </div>
                                )}
                    </div>

                    <div className="sticky bottom-0 left-0 right-0 z-40 p-4 border-t border-border-main bg-white dark:bg-slate-900 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] rounded-b-xl">
                        <div className="flex justify-between items-center w-full md:w-auto gap-5 md:gap-8">
                            <div className="flex flex-col text-right">
                                <span className="text-text-main/40 text-[8px] font-bold uppercase tracking-widest leading-none">كمية التوريد</span>
                                <span className="text-lg font-bold text-text-main">{totalItems}</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-text-main/40 text-[8px] font-bold uppercase tracking-widest leading-none">إجمالي القيمة</span>
                                <span className="text-base md:text-xl font-bold text-purple-700">{subtotal.toLocaleString()} <small className="text-[10px] font-normal opacity-50">ر.س</small></span>
                            </div>
                        </div>

                        <button 
                            onClick={() => setIsCheckoutModalOpen(true)}
                            disabled={cart.length === 0}
                            className="w-full md:w-48 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95 text-sm flex justify-center items-center gap-2"
                        >
                            تأكيد التوريد <Truck size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Checkout Modal */}
            {isCheckoutModalOpen && !isNewPartyModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
                        <div className="p-5 border-b border-gray-100 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                            <h2 className="text-base md:text-xl font-bold text-black dark:text-white">إتمام عملية الشراء</h2>
                            <button onClick={() => setIsCheckoutModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                                <span className="font-bold text-lg px-2">X</span>
                            </button>
                        </div>
                        <div className="p-4 md:p-6 overflow-y-auto flex-1">
                            <div className="flex flex-col gap-3 mb-4 md:mb-6 bg-white p-4 rounded-xl">
                                <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-purple-100">
                                    <label className="text-black dark:text-gray-200 font-semibold text-sm">الخصم (%)</label>
                                    <input 
                                        type="number" 
                                        className="w-20 border-none outline-none font-bold text-center bg-white rounded p-1"
                                        min="0"
                                        max="100"
                                        value={discountPercent || ''}
                                        onChange={e => setDiscountPercent(Number(e.target.value) || 0)}
                                    />
                                </div>
                                {discountPercent > 0 && (
                                    <div className="flex justify-between items-center text-red-500 font-semibold text-sm">
                                        <span>قيمة الخصم:</span>
                                        <span>- {discountAmount} ر.س</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center mt-2 pt-3 border-t border-purple-200 text-lg font-black text-purple-800">
                                    <span>الإجمالي المطلوب:</span>
                                    <span className="text-lg md:text-2xl text-purple-600">{total} ر.س</span>
                                </div>
                            </div>

                            <div className="mb-4 md:mb-6">
                                <label className="block text-sm font-semibold mb-2 text-black dark:text-gray-200">طريقة الدفع</label>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setPaymentMethod('cash')}
                                        className={`flex-1 py-3 rounded-xl border font-bold transition ${paymentMethod === 'cash' ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white dark:bg-slate-900 text-black dark:text-gray-300 border-gray-200 hover:bg-white'}`}
                                    >
                                        نقدي
                                    </button>
                                    <button 
                                        onClick={() => setPaymentMethod('credit')}
                                        className={`flex-1 py-3 rounded-xl border font-bold transition ${paymentMethod === 'credit' ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white dark:bg-slate-900 text-black dark:text-gray-300 border-gray-200 hover:bg-white'}`}
                                    >
                                        آجل
                                    </button>
                                </div>
                            </div>

                            <div className="mb-2">
                                <label className="block text-sm font-semibold mb-2 text-black dark:text-gray-200">
                                    المورد (مطلوب - سيتم إضافته للمسجلين تلقائياً إذا كان جديداً)
                                </label>
                                <SearchableSelect
                                    options={suppliers.map(s => s.name)}
                                    placeholder="ابحث عن مورد أو اكتب اسماً جديداً..."
                                    value={supplierSearchName}
                                    onChange={setSupplierSearchName}
                                />
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-100 bg-white dark:bg-slate-900">
                            <button 
                                onClick={handleCheckout}
                                disabled={isCheckingOut}
                                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-bold py-4 rounded-xl transition shadow-sm text-lg"
                            >
                                {isCheckingOut ? 'جاري التنفيذ...' : 'حفظ وإدخال المخزون'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Product Modal */}
            {isAddProductOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-4 md:p-6">
                        <h2 className="text-base md:text-xl font-bold mb-4">إضافة منتج سريع</h2>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm text-black dark:text-gray-300 mb-1">اسم المنتج</label>
                                <input type="text" className="w-full border p-2 rounded-lg" value={newProdName} onChange={e => setNewProdName(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm text-black dark:text-gray-300 mb-1">الباركود (اختياري)</label>
                                <input type="text" className="w-full border p-2 rounded-lg text-left" dir="ltr" value={newProdBarcode} onChange={e => setNewProdBarcode(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-sm text-black dark:text-gray-300 mb-1">سعر الشراء (التكلفة المتوقعة)</label>
                                <input type="number" className="w-full border p-2 rounded-lg text-left" dir="ltr" value={newProdCost} onChange={e => setNewProdCost(Number(e.target.value))} />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-4 md:mt-6">
                            <button onClick={() => setIsAddProductOpen(false)} className="flex-1 py-2 border rounded-xl hover:bg-white text-black dark:text-gray-300 font-bold">إلغاء</button>
                            <button onClick={handleAddProduct} className="flex-1 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-bold">إضافة للفاتورة</button>
                        </div>
                    </div>
                </div>
            )}

            {/* New Supplier Modal */}
            {isNewPartyModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
                         <div className="p-5 border-b border-gray-100 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                            <h2 className="text-base md:text-xl font-bold text-black dark:text-white">إضافة مورد جديد</h2>
                            <button onClick={() => setIsNewPartyModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                                <span className="font-bold text-lg px-2">X</span>
                            </button>
                        </div>
                        <div className="p-4 md:p-6 overflow-y-auto space-y-4">
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-black dark:text-gray-200">اسم المورد (المدخل)</label>
                                <input 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white dark:bg-slate-900 text-black" 
                                    value={supplierSearchName} 
                                    readOnly 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-black dark:text-gray-200">رقم الهاتف</label>
                                <input 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-purple-500" 
                                    value={newPartyPhone} 
                                    onChange={e => setNewPartyPhone(e.target.value)} 
                                    placeholder="05XXXXXXXX"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-black dark:text-gray-200">العنوان</label>
                                <input 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-purple-500" 
                                    value={newPartyAddress} 
                                    onChange={e => setNewPartyAddress(e.target.value)} 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-black dark:text-gray-200">الرصيد الافتتاحي (له أو عليه)</label>
                                <input 
                                    type="number"
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-purple-500" 
                                    value={newPartyBalance} 
                                    onChange={e => setNewPartyBalance(e.target.value)} 
                                />
                                <p className="text-xs text-black mt-1">سالب = المورد يطالبنا، موجب = نحن نطالبه</p>
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-100 bg-white dark:bg-slate-900 flex gap-3">
                            <button 
                                onClick={() => processCheckout(null)}
                                disabled={isCheckingOut}
                                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold py-3 rounded-xl transition shadow-sm text-sm"
                            >
                                {isCheckingOut ? 'جاري التنفيذ...' : 'حفظ وإتمام الشراء'}
                            </button>
                            <button 
                                onClick={() => setIsNewPartyModalOpen(false)}
                                className="px-4 py-3 bg-white hover:bg-gray-300 text-black dark:text-gray-100 font-bold rounded-xl transition text-sm"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {activeDropdownId && (() => {
                const invoice = invoices.find(inv => inv.id === activeDropdownId);
                if (!invoice) return null;
                const dateObj = new Date(invoice.date || invoice.createdAt || 0);
                return (
                    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setActiveDropdownId(null)}>
                        <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                            <div className="bg-white dark:bg-slate-900 border-b border-gray-100 p-5 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-black dark:text-white text-lg leading-none mb-1">فاتورة مشتريات #{invoice.invoiceNumber}</h3>
                                    <p className="text-xs text-black font-bold">{dateObj.toLocaleDateString('ar-EG')} - {dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                                <button onClick={() => setActiveDropdownId(null)} className="w-8 h-8 flex items-center justify-center bg-white hover:bg-gray-300 rounded-full text-black dark:text-gray-300 transition">
                                    <span className="font-bold text-sm">✕</span>
                                </button>
                            </div>
                            <div className="p-5 grid grid-cols-2 gap-3 bg-white">
                                <button onClick={() => { setActiveDropdownId(null); setPreviewInvoiceId(invoice.id); }} className="col-span-2 py-3 bg-white text-purple-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 border border-purple-100 transition">
                                    <FileText size={18} /> معاينة الفاتورة ومشاركتها
                                </button>
                                
                                {invoice.status !== 'cancelled' && invoice.status !== 'returned' && (
                                    <>
                                        <button onClick={() => { setActiveDropdownId(null); handleEditInvoice(invoice); }} className="col-span-2 py-3 bg-white dark:bg-slate-800 text-indigo-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 border border-gray-200 transition">
                                            <Plus size={18} /> تعديل الفاتورة
                                        </button>
                                        <button onClick={() => { setActiveDropdownId(null); setReturnModalState({ isOpen: true, invoice }); }} className="py-3 bg-white text-orange-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 border border-orange-100 transition">
                                            <Minus size={18} /> استرجاع
                                        </button>
                                        <button onClick={() => { setActiveDropdownId(null); handleReturnOrCancelInvoice(invoice, 'cancelled'); }} className="py-3 bg-white text-red-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 border border-red-100 transition">
                                            <Trash2 size={18} /> إلغاء
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            <ReturnInvoiceModal
                isOpen={returnModalState.isOpen}
                onClose={() => setReturnModalState({ isOpen: false, invoice: null })}
                invoice={returnModalState.invoice}
                onConfirmFullReturn={() => {
                    setReturnModalState({ isOpen: false, invoice: null });
                    handleReturnOrCancelInvoice(returnModalState.invoice, 'returned');
                }}
                onConfirmPartialReturn={(returnedItems) => {
                    handlePartialReturn(returnModalState.invoice, returnedItems);
                }}
                type="purchases"
            />

            {confirmDialog.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                        <h3 className="text-lg font-bold text-black dark:text-white mb-2">تأكيد الإجراء</h3>
                        <p className="text-black dark:text-gray-300 mb-6">{confirmDialog.message}</p>
                        <div className="flex gap-3">
                            <button onClick={confirmDialog.onConfirm} className="flex-1 bg-black text-white py-2.5 rounded-lg font-bold">تأكيد</button>
                            <button onClick={() => setConfirmDialog(p => ({ ...p, isOpen: false }))} className="flex-1 bg-white dark:bg-slate-800 text-black dark:text-gray-100 py-2.5 rounded-lg font-bold">إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
            
            {alertDialog.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                        <h3 className="text-lg font-bold text-black dark:text-white mb-2">تنبيه</h3>
                        <p className="text-black dark:text-gray-300 mb-6">{alertDialog.message}</p>
                        <button onClick={() => setAlertDialog(p => ({ ...p, isOpen: false }))} className="w-full bg-purple-600 text-white py-2.5 rounded-lg font-bold">حسناً</button>
                    </div>
                </div>
            )}

            {previewInvoiceId && (() => {
                const invoice = invoices.find(inv => inv.id === previewInvoiceId);
                if (invoice) {
                    return (
                        <InvoicePreviewModal
                            invoice={invoice}
                            type="purchase"
                            items={invoice.items || []}
                            onClose={() => setPreviewInvoiceId(null)}
                        />
                    );
                }
                return null;
            })()}
        </div>
    );
}
