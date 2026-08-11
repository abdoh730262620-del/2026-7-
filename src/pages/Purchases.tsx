import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, onSnapshot, addDoc, doc, updateDoc, increment, getDocs, orderBy, limit, where, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useInvoiceStore, CartItem } from '../store/invoiceStore';
import { logUserAction } from '../lib/logger';
import { Truck, Plus, Minus, Trash2, Search, FileText, Printer, ShoppingCart, MoreVertical, ArrowLeft, X, RefreshCw, GripVertical, CheckCircle2, RotateCcw } from 'lucide-react';
import { printInvoice } from '../lib/printHelper';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
import SearchableSelect from '../components/SearchableSelect';
import ReturnInvoiceModal from '../components/ReturnInvoiceModal';

interface PurchaseInvoice {
    id: string;
    invoiceNumber: string;
    date: number;
    supplierId: string;
    supplierName?: string;
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
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
    const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
    const [editingItem, setEditingItem] = useState<{
        id: string;
        name: string;
        barcode: string;
        buyPrice: number | string;
        cartQuantity: number | string;
        stock: number;
    } | null>(null);

    const inputPrevValue = useRef<string>('');

    const [isNewPartyModalOpen, setIsNewPartyModalOpen] = useState(false);
    const [newPartyPhone, setNewPartyPhone] = useState('');
    const [newPartyAddress, setNewPartyAddress] = useState('');
    const [newPartyBalance, setNewPartyBalance] = useState('');
    const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
    const [searchInvoice, setSearchInvoice] = useState('');
    const [showCancelledOnly, setShowCancelledOnly] = useState(false);
    const [autoUpdateCostPrice, setAutoUpdateCostPrice] = useState<boolean>(true);
    const [isAddProductOpen, setIsAddProductOpen] = useState(false);
    const [newProdName, setNewProdName] = useState('');
    const [newProdBarcode, setNewProdBarcode] = useState('');
    const [newProdCost, setNewProdCost] = useState<number>(0);
    const [notes, setNotes] = useState('');

    const _reverseInvoice = async (invoice: any, actionType: 'returned' | 'cancelled', providedBatch?: any) => {
        const batch = providedBatch || writeBatch(db);
        batch.update(doc(db, 'purchases', invoice.id), { status: actionType });
        const tenantId = appUser?.tenantId || 'single_store';
        
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
            const tenantId = appUser?.tenantId || 'single_store';

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

    const handleCancelEdit = () => {
        let hasChanges = false;
        if (editingInvoice) {
            const originalCart = editingInvoice.items || [];
            if (originalCart.length !== cart.length) {
                hasChanges = true;
            } else {
                for (let i = 0; i < cart.length; i++) {
                    const originalItem = originalCart.find((it: any) => it.productId === cart[i].id);
                    if (!originalItem || originalItem.quantity !== cart[i].cartQuantity || originalItem.cost !== cart[i].cost) {
                        hasChanges = true;
                        break;
                    }
                }
            }
            if (editingInvoice.discountPercent !== discountPercent) hasChanges = true;
            if (editingInvoice.paymentType !== paymentMethod) hasChanges = true;
        }

        if (hasChanges) {
            setConfirmDialog({
                isOpen: true,
                message: 'لقد قمت بإجراء تغييرات. هل أنت متأكد من إلغاء التعديل والخروج دون حفظ؟',
                onConfirm: () => {
                    setConfirmDialog(p => ({ ...p, isOpen: false }));
                    clearPurchases();
                    setDiscountPercent(0);
                    setNotes('');
                    setEditingInvoice(null);
                    setActiveTab('list');
                }
            });
        } else {
            clearPurchases();
            setDiscountPercent(0);
            setNotes('');
            setEditingInvoice(null);
            setActiveTab('list');
        }
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
        const tenantId = appUser?.tenantId || 'single_store';

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

    const handleUpdateCartItem = (id: string, newQty: number, newPrice: number) => {
        if (newQty <= 0) {
            removeFromCart(id);
            setEditingItem(null);
            return;
        }

        setCart(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, cartQuantity: newQty, buyPrice: newPrice };
            }
            return item;
        }));

        setEditingItem(null);
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
        setIsDropdownOpen(e.target.value.length > 0);
    };

    const handleSelectProduct = (product: Product) => {
        // Force blur immediately to hide keyboard on mobile
        const input = document.getElementById('purchases-product-search-input');
        if (input) (input as HTMLInputElement).blur();
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

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
        
        const existingProd = products.find(p => 
            p.name.trim().toLowerCase() === newProdName.trim().toLowerCase() || 
            (newProdBarcode && newProdBarcode.trim() !== '' && p.barcode && p.barcode.trim() === newProdBarcode.trim())
        );
        if (existingProd) {
            alert('عذراً، يوجد منتج بنفس هذا الاسم أو الباركود مسجل مسبقاً في النظام!');
            return;
        }

        const tenantId = appUser?.tenantId || 'single_store';
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
        if (isCheckingOut) return;
        if (cart.length === 0 || !appUser) return;
        if (!supplierSearchName.trim()) {
            alert("يرجى إدخال المورد لإتمام العملية.");
            return;
        }

        let finalSupplierId: string | null = null;
        const existingSupplier = suppliers.find(s => s.name.trim().toLowerCase() === supplierSearchName.trim().toLowerCase());
        if (existingSupplier) {
            finalSupplierId = existingSupplier.id;
        } else if (editingInvoice && editingInvoice.supplierId) {
            finalSupplierId = editingInvoice.supplierId;
        } else {
            setIsNewPartyModalOpen(true);
            return;
        }

        await processCheckout(finalSupplierId);
    };

    const processCheckout = async (supplierId: string | null) => {
        if (isCheckingOut) return;
        setIsCheckingOut(true);
        // Close payment modals immediately to prevent repeated clicks and remove the window right away
        setIsCheckoutModalOpen(false);
        setIsNewPartyModalOpen(false);

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
            const tenantId = appUser?.tenantId || 'single_store';
            
            if (editingInvoice && editingInvoice.status !== 'cancelled' && editingInvoice.status !== 'returned') {
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
                supplierName: supplierSearchName.trim() || 'مورد عام',
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
                sellerName: appUser?.name || appUser?.email || 'المستخدم',
                createdByName: appUser?.name || appUser?.email || 'المستخدم',
                userName: appUser?.name || appUser?.email || 'المستخدم',
                createdAt: now,
                tenantId,
                notes: notes.trim()
            });

            // 2. Update Inventory (Add to stock and update cost price if option enabled)
            for (const item of cart) {
                const pRef = doc(db, 'products', item.id);
                const updateData: any = {
                    quantity: increment(item.cartQuantity)
                };
                if (autoUpdateCostPrice && item.buyPrice > 0) {
                    updateData.cost = item.buyPrice;
                }
                batch.update(pRef, updateData);

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

            // Manager Invoice Notification
            const notifRef = doc(collection(db, 'notifications'));
            batch.set(notifRef, {
                tenantId,
                type: 'invoice_created',
                invoiceType: 'purchase',
                invoiceNumber: String(invoiceNum),
                invoiceId: purchaseRef.id,
                amount: total,
                createdById: appUser?.uid || '',
                createdByName: appUser?.name || appUser?.email || 'مستخدم النظام',
                createdByRole: appUser?.role || 'user',
                recipientRole: 'admin',
                createdAt: now,
                read: false,
                title: `🧾 فاتورة مشتريات جديدة #${invoiceNum}`,
                body: `قام المستخدم (${appUser?.name || appUser?.email || 'المستخدم'}) بإنشاء فاتورة مشتريات بمبلغ ${total.toLocaleString('ar-SA')} ر.س`
            });
            
            await batch.commit();

            logUserAction('عملية شراء', `إتمام عملية شراء برقم ${invoiceNum} بقيمة ${total} ر.س. طريقة الدفع: ${paymentMethod}`).catch(() => {});
            
            setCart([]);
            setNotes('');
            setNewPartyPhone('');
            setNewPartyAddress('');
            setNewPartyBalance('0');
            setSupplierSearchName('');
            setEditingInvoice(null);
            setActiveTab('list');

            setConfirmDialog({
                isOpen: true,
                message: "تم تسجيل المشتريات بنجاح! هل تريد معاينة ومشاركة الفاتورة؟",
                onConfirm: () => {
                    setConfirmDialog(p => ({ ...p, isOpen: false }));
                    setPreviewInvoiceId(purchaseRef.id);
                },
                onCancel: () => {
                    setConfirmDialog(p => ({ ...p, isOpen: false }));
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
            const suppName = supplierMap.get(inv.supplierId) || (inv.supplierName || '').toLowerCase();
            const matchSearch = suppName.includes(lowerSearchInvoice) || 
                                (inv.invoiceNumber || '').toLowerCase().includes(lowerSearchInvoice);
            if (!matchSearch) return false;

            if (showCancelledOnly) {
                return inv.status === 'cancelled';
            } else {
                if (inv.status === 'cancelled') return false;
            }

            return true;
        });
    }, [invoices, suppliers, searchInvoice, showCancelledOnly]);

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
                        <div className="flex flex-col md:flex-row gap-3 items-center w-full">
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

                            <label className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl text-[11px] font-bold transition border ${showCancelledOnly ? 'bg-red-50 text-red-700 border-red-300 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300' : 'bg-white text-black dark:text-gray-200 border-border-main hover:bg-white'}`}>
                                <input 
                                    type="checkbox" 
                                    className="rounded text-red-600"
                                    checked={showCancelledOnly}
                                    onChange={e => setShowCancelledOnly(e.target.checked)}
                                />
                                <span>عرض الفواتير الملغاة</span>
                                <span className={`px-2 py-0.5 text-[10px] rounded-full font-black ${showCancelledOnly ? 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-100' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300'}`}>
                                    {invoices.filter(i => i.status === 'cancelled').length}
                                </span>
                            </label>
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
                                onClick={handleCancelEdit}
                                className="text-yellow-700 hover:text-yellow-900 bg-white hover:bg-white px-3 py-1.5 rounded-lg text-xs font-bold transition"
                            >
                                إلغاء التعديل
                            </button>
                        </div>
                    )}
                    <div className="p-3 border-b border-border-main bg-white shrink-0 rounded-t-xl relative z-[60]">
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
                                    id="purchases-product-search-input"
                                />
                                {search && (
                                    <button onClick={(e) => { e.stopPropagation(); setSearch(''); }} className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer p-1 shrink-0">
                                        <X size={18} />
                                    </button>
                                )}
                            </div>

                            <AnimatePresence>
                                {isDropdownOpen && search.length > 0 && !isCheckoutModalOpen && !isNewPartyModalOpen && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 5 }}
                                        className="absolute top-full right-0 left-0 mt-1 z-[150] bg-white dark:bg-slate-900 border border-border-main rounded-xl shadow-2xl max-h-[60vh] md:max-h-[70vh] overflow-y-auto p-1 flex flex-col gap-1 w-full"
                                    >
                                        {filteredProducts.map((p, idx) => (
                                            <button 
                                                key={`${p.id || 'prod'}-${idx}`} 
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => handleSelectProduct(p)}
                                                className="w-full text-right p-1.5 bg-card-bg hover:bg-white rounded-lg shadow-sm border-b border-border-main/30 last:border-0 flex justify-between items-center transition-all hover:scale-[1.01] active:scale-[0.99] group"
                                            >
                                                <div className="flex flex-col text-right">
                                                    <span className="font-extrabold text-text-main text-[11px] group-hover:text-purple-600 transition-colors leading-tight">{p.name}</span>
                                                    <span className="text-[8px] font-bold text-text-main/50 uppercase tracking-tight bg-bg-main w-max px-1 rounded-md mt-0.5">{p.barcode || 'بدون باركود'}</span>
                                                </div>
                                                <div className="flex flex-col items-end gap-0">
                                                    <span className="font-black text-purple-700 text-[11px]">{p.cost || p.price} <small className="text-[8px] font-bold opacity-75">ر.س</small></span>
                                                    <span className="text-[8px] font-bold px-1 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/25 text-purple-700">
                                                        المخزون: {p.quantity}
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
                        {cart.map((item, index) => (
                            <div 
                                key={item.id}
                                draggable
                                onDragStart={(e) => {
                                    setDraggedIndex(index);
                                    e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    if (draggedIndex === null || draggedIndex === index) return;
                                    const newCart = [...cart];
                                    const [movedItem] = newCart.splice(draggedIndex, 1);
                                    newCart.splice(index, 0, movedItem);
                                    setCart(newCart);
                                    setDraggedIndex(null);
                                }}
                                className={`bg-card-bg p-2 rounded-lg shadow-sm border ${draggedIndex === index ? 'opacity-40 border-purple-500 ring-2 ring-purple-300' : 'border-border-main'} flex items-center justify-between gap-1.5 group hover:border-purple-400 transition-all`}
                            >
                                <div className="text-slate-400 hover:text-purple-600 cursor-grab active:cursor-grabbing p-1 shrink-0" title="اسحب لإعادة ترتيب منتجات التوريد">
                                    <GripVertical size={14} />
                                </div>
                                <div 
                                    onClick={() => setEditingItem({
                                        id: item.id,
                                        name: item.name,
                                        barcode: item.barcode,
                                        buyPrice: item.buyPrice || 0,
                                        cartQuantity: item.cartQuantity,
                                        stock: item.quantity || 0
                                    })}
                                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                                    title="تعديل السعر والكمية"
                                >
                                    <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                                        <span className="font-bold text-text-main text-[11px] truncate group-hover:text-purple-600 transition-colors">{item.name}</span>
                                        <span className="text-[9px] font-bold text-text-main/40 uppercase tracking-widest bg-bg-main w-max px-1 rounded-sm mt-0.5">{item.barcode}</span>
                                    </div>
                                    <div className="flex flex-col items-end px-1 justify-center shrink-0">
                                        <span className="text-[9px] text-gray-400 font-bold">السعر</span>
                                        <span className="font-bold text-purple-600 text-[11px]">{item.buyPrice || 0} <span className="text-[8px] font-normal text-gray-400">ر.س</span></span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <div className="flex items-center gap-1.5 bg-bg-main rounded-lg p-0.5 border border-border-main">
                                        <button onClick={(e) => { e.stopPropagation(); updateCartQuantity(item.id, 1); }} className="p-1 bg-white shadow-sm text-purple-600 hover:bg-purple-600 hover:text-white rounded-md transition-all"><Plus size={10} /></button>
                                        <span className="font-bold w-4 text-center text-[10px] text-text-main">{item.cartQuantity}</span>
                                        <button onClick={(e) => { e.stopPropagation(); updateCartQuantity(item.id, -1); }} className="p-1 bg-white shadow-sm text-red-600 hover:bg-red-600 hover:text-white rounded-md transition-all"><Minus size={10} /></button>
                                    </div>
                                    <div className="flex flex-col items-center px-1 justify-center">
                                        <span className="text-[9px] text-gray-400 font-bold">المجموع</span>
                                        <span className="font-bold text-purple-700 text-[11px]">{((item.buyPrice || 0) * item.cartQuantity).toLocaleString()} <span className="text-[8px] font-normal text-gray-400">ر.س</span></span>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }} className="text-red-400 hover:text-red-600 p-1.5 bg-white hover:bg-white rounded-lg transition-all"><Trash2 size={12} /></button>
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

                    <div className="sticky bottom-0 left-0 right-0 z-40 p-3 sm:p-4 border-t border-border-main bg-white dark:bg-slate-900 flex flex-row items-center justify-between gap-2.5 sm:gap-3 shrink-0 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] rounded-b-xl">
                        <div className="flex items-center gap-3 sm:gap-5 bg-slate-50 dark:bg-slate-800/60 p-2 sm:p-2.5 px-3 sm:px-4 rounded-xl border border-gray-100 dark:border-slate-800 shrink min-w-0 overflow-x-auto">
                            <div className="flex flex-col text-right shrink-0">
                                <span className="text-text-main/50 text-[10px] sm:text-[11px] font-bold whitespace-nowrap">الأصناف</span>
                                <span className="text-sm sm:text-base font-extrabold text-text-main">{cart.length}</span>
                            </div>
                            <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 shrink-0"></div>
                            <div className="flex flex-col text-right shrink-0">
                                <span className="text-text-main/50 text-[10px] sm:text-[11px] font-bold whitespace-nowrap">إجمالي الكمية</span>
                                <span className="text-sm sm:text-base font-black text-purple-600">{totalItems}</span>
                            </div>
                            <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 shrink-0"></div>
                            <div className="flex flex-col text-right shrink-0">
                                <span className="text-text-main/50 text-[10px] sm:text-[11px] font-bold whitespace-nowrap">الإجمالي</span>
                                <span className="text-sm sm:text-lg font-black text-purple-700 whitespace-nowrap">{subtotal.toLocaleString()} <small className="text-[10px] font-normal opacity-75">ر.س</small></span>
                            </div>
                        </div>

                        <button 
                            onClick={() => {
                                setIsDropdownOpen(false);
                                setIsCheckoutModalOpen(true);
                            }}
                            disabled={cart.length === 0}
                            className="shrink-0 px-5 sm:px-7 py-3 sm:py-3.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white font-black rounded-xl transition-all shadow-md active:scale-95 text-xs sm:text-base flex justify-center items-center gap-2 whitespace-nowrap"
                        >
                            تأكيد التوريد <Truck size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Checkout Modal */}
            {isCheckoutModalOpen && !isNewPartyModalOpen && (
                <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
                        <div className="p-5 border-b border-gray-100 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                            <h2 className="text-base md:text-xl font-bold text-black dark:text-white">إتمام عملية الشراء</h2>
                            <button onClick={() => setIsCheckoutModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                                <span className="font-bold text-lg px-2">X</span>
                            </button>
                        </div>
                        <div className="p-4 md:p-6 overflow-y-auto flex-1 text-sm bg-white dark:bg-slate-900 space-y-4">
                            {/* 1. طريقة الدفع فوقهم بالأعلى */}
                            <div>
                                <label className="block text-xs font-black mb-1.5 text-black dark:text-gray-200">طريقة الدفع</label>
                                <div className="flex gap-2">
                                    <button 
                                        type="button"
                                        onClick={() => setPaymentMethod('cash')}
                                        className={`flex-1 py-2.5 rounded-xl border font-bold transition ${paymentMethod === 'cash' ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-black dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:bg-slate-100'}`}
                                    >
                                        💵 نقدي
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setPaymentMethod('credit')}
                                        className={`flex-1 py-2.5 rounded-xl border font-bold transition ${paymentMethod === 'credit' ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-black dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:bg-slate-100'}`}
                                    >
                                        💳 آجل
                                    </button>
                                </div>
                            </div>

                            {/* 2. اسم المورد وتحته حقل الملاحظات */}
                            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-gray-200 dark:border-slate-800">
                                <div>
                                    <label className="block text-xs font-black mb-1.5 text-slate-700 dark:text-slate-300">
                                        المورد <span className="text-rose-500">*</span>
                                    </label>
                                    <SearchableSelect
                                        options={suppliers.map(s => s.name)}
                                        placeholder="ابحث عن مورد أو اكتب اسماً جديداً..."
                                        value={supplierSearchName}
                                        onChange={setSupplierSearchName}
                                    />
                                    <p className="text-[10px] text-slate-400 font-bold px-1 mt-1">سيتم إضافة المورد للمسجلين تلقائياً إذا كان جديداً</p>
                                </div>

                                {/* حقل الملاحظات تحت اسم المورد */}
                                <div>
                                    <label className="block text-xs font-black mb-1.5 text-slate-700 dark:text-slate-300">
                                        ملاحظات الفاتورة (تظهر على الفاتورة المطبوعة)
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder="أدخل أي ملاحظات أو شروط تود إظهارها على الفاتورة..."
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition resize-none"
                                    />
                                </div>
                            </div>

                            {/* 3. السعر والخصم والإجمالي في نفس السطر (Row Layout) */}
                            <div className="p-3.5 space-y-3">
                                <p className="text-[11px] font-black text-purple-900 dark:text-purple-300 border-b border-purple-100 dark:border-slate-700 pb-1.5">
                                    الملخص المالي للفاتورة
                                </p>

                                <div className="grid grid-cols-3 gap-2 items-center text-center">
                                    {/* السعر قبل الخصم */}
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 flex flex-col justify-center shadow-2xs">
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">السعر (قبل الخصم)</span>
                                        <span className="text-xs font-black text-slate-900 dark:text-white truncate" dir="ltr">
                                            {subtotal.toLocaleString()}
                                        </span>
                                    </div>

                                    {/* الخصم % */}
                                    <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-gray-200 dark:border-slate-700 flex flex-col justify-center shadow-2xs">
                                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">الخصم (%)</span>
                                        <div className="flex items-center justify-center gap-1">
                                            <input 
                                                type="number" 
                                                min="0"
                                                max="100"
                                                value={discountPercent || ''}
                                                onChange={e => setDiscountPercent(Number(e.target.value) || 0)}
                                                placeholder="0"
                                                className="w-12 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded text-center text-xs font-black text-rose-600 outline-none p-0.5"
                                            />
                                            <span className="text-[10px] font-bold text-slate-400">%</span>
                                        </div>
                                    </div>

                                    {/* الإجمالي الصافي */}
                                    <div className="bg-purple-600 text-white p-2.5 rounded-xl flex flex-col justify-center shadow-sm">
                                        <span className="text-[10px] font-bold text-purple-100 mb-1">الإجمالي الصافي</span>
                                        <span className="text-xs font-black truncate" dir="ltr">
                                            {total.toLocaleString()} ر.س
                                        </span>
                                    </div>
                                </div>

                                {discountAmount > 0 && (
                                    <div className="flex justify-between items-center text-[11px] font-bold text-slate-600 dark:text-slate-400 pt-1 border-t border-purple-100/60 dark:border-slate-700 px-1">
                                        <span>قيمة الخصم:</span>
                                        <strong className="text-rose-600">-{discountAmount.toLocaleString()} ر.س</strong>
                                    </div>
                                )}
                            </div>

                            {/* تحديث سعر التكلفة تلقائياً */}
                            <div className="p-3 bg-purple-50/70 dark:bg-purple-950/40 rounded-xl border border-purple-100 dark:border-purple-900/50 flex items-center justify-between cursor-pointer" onClick={() => setAutoUpdateCostPrice(!autoUpdateCostPrice)}>
                                <div className="flex items-center gap-2">
                                    <RefreshCw size={16} className="text-purple-600 dark:text-purple-400 shrink-0" />
                                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                        تحديث سعر التكلفة تلقائياً بناءً على الشراء الجديد
                                    </span>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={autoUpdateCostPrice} 
                                    onChange={e => setAutoUpdateCostPrice(e.target.checked)}
                                    className="w-4 h-4 text-purple-600 accent-purple-600 rounded cursor-pointer shrink-0"
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
                                
                                {invoice.status === 'cancelled' && (
                                    <button onClick={() => { setActiveDropdownId(null); handleEditInvoice(invoice); }} className="col-span-2 py-3 bg-white text-blue-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 border border-blue-100 transition">
                                        <RotateCcw size={18} /> استعادة الفاتورة (تعديل)
                                    </button>
                                )}
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

            {editingItem && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={() => setEditingItem(null)}>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden border border-gray-100 dark:border-slate-800 text-right" dir="rtl" onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
                            <div className="flex flex-col">
                                <h3 className="text-base font-black text-black dark:text-white">تعديل الصنف (شراء)</h3>
                                <span className="text-[10px] font-bold text-gray-400 mt-0.5">{editingItem.name}</span>
                            </div>
                            <button 
                                onClick={() => setEditingItem(null)} 
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5 flex flex-col gap-4 bg-gray-50/50 dark:bg-slate-900/50 text-right">
                            {/* Barcode and stock info */}
                            <div className="grid grid-cols-2 gap-2 text-xs bg-white dark:bg-slate-850 p-3 rounded-xl border border-gray-100 dark:border-slate-800 shadow-xs">
                                <div className="flex flex-col">
                                    <span className="text-gray-400 font-bold">الباركود</span>
                                    <span className="font-mono font-bold text-black dark:text-white mt-0.5">{editingItem.barcode}</span>
                                </div>
                                <div className="flex flex-col items-start text-left">
                                    <span className="text-gray-400 font-bold">المخزون الحالي</span>
                                    <span className="font-bold text-black dark:text-white mt-0.5">{editingItem.stock}</span>
                                </div>
                            </div>

                            {/* Quantity Input */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-black text-gray-500 dark:text-gray-400">الكمية</label>
                                <div className="flex items-center gap-2 bg-white dark:bg-slate-850 p-1 rounded-xl border border-gray-200 dark:border-slate-800 shadow-xs">
                                    <button 
                                        type="button"
                                        onClick={() => setEditingItem(prev => prev ? { ...prev, cartQuantity: Number(prev.cartQuantity) + 1 } : null)} 
                                        className="p-2.5 bg-purple-50 dark:bg-slate-800 hover:bg-purple-600 dark:hover:bg-purple-600 text-purple-600 dark:text-purple-400 hover:text-white rounded-lg transition-all"
                                    >
                                        <Plus size={14} />
                                    </button>
                                    <input 
                                        type="number" 
                                        step="0.1"
                                        className="flex-1 text-center font-black text-base text-black dark:text-white bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={editingItem.cartQuantity}
                                        min="0"
                                        onChange={e => {
                                            const val = e.target.value;
                                            setEditingItem(prev => prev ? { ...prev, cartQuantity: val } : null);
                                        }}
                                        onFocus={(e) => {
                                            inputPrevValue.current = editingItem.cartQuantity.toString();
                                            setEditingItem(prev => prev ? { ...prev, cartQuantity: '' } : null);
                                        }}
                                        onBlur={(e) => {
                                            if (editingItem.cartQuantity === '') {
                                                setEditingItem(prev => prev ? { ...prev, cartQuantity: inputPrevValue.current } : null);
                                            }
                                        }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setEditingItem(prev => prev ? { ...prev, cartQuantity: Number(prev.cartQuantity) - 1 <= 0 ? 1 : Number(prev.cartQuantity) - 1 } : null)} 
                                        className="p-2.5 bg-red-50 dark:bg-slate-800 hover:bg-red-600 dark:hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white rounded-lg transition-all"
                                    >
                                        <Minus size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Buy Price Input */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-black text-gray-500 dark:text-gray-400">سعر الشراء (ر.س)</label>
                                <div className="flex items-center bg-white dark:bg-slate-850 px-3 py-1 rounded-xl border border-gray-200 dark:border-slate-800 shadow-xs">
                                    <input 
                                        type="number" 
                                        step="0.1"
                                        className="w-full font-black text-base text-black dark:text-white bg-transparent outline-none border-none py-1.5 text-center"
                                        value={editingItem.buyPrice}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setEditingItem(prev => prev ? { ...prev, buyPrice: val } : null);
                                        }}
                                        onFocus={(e) => {
                                            inputPrevValue.current = editingItem.buyPrice.toString();
                                            setEditingItem(prev => prev ? { ...prev, buyPrice: '' } : null);
                                        }}
                                        onBlur={(e) => {
                                            if (editingItem.buyPrice === '') {
                                                setEditingItem(prev => prev ? { ...prev, buyPrice: inputPrevValue.current } : null);
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Item Total Display */}
                            <div className="flex justify-between items-center bg-purple-50/50 dark:bg-slate-800/30 p-3 rounded-xl border border-purple-100/50 dark:border-slate-700 text-sm mt-1">
                                <span className="font-bold text-gray-500 dark:text-gray-400">إجمالي الصنف:</span>
                                <span className="font-black text-purple-600 dark:text-purple-400 text-base">
                                    {(Number(editingItem.buyPrice) * Number(editingItem.cartQuantity)).toLocaleString()} <small className="text-xs font-normal">ر.س</small>
                                </span>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-2 shrink-0">
                            <button 
                                type="button"
                                onClick={() => handleUpdateCartItem(editingItem.id, Number(editingItem.cartQuantity), Number(editingItem.buyPrice))} 
                                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2.5 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                            >
                                حفظ التعديلات
                            </button>
                            <button 
                                type="button"
                                onClick={() => {
                                    removeFromCart(editingItem.id);
                                    setEditingItem(null);
                                }} 
                                className="px-4 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-1.5"
                                title="حذف من السلة"
                            >
                                <Trash2 size={16} />
                                <span className="hidden sm:inline">حذف</span>
                            </button>
                            <button 
                                type="button"
                                onClick={() => setEditingItem(null)} 
                                className="px-4 bg-gray-100 hover:bg-gray-200 dark:bg-slate-850 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-bold text-sm transition-all"
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
