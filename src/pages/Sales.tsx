import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, getDocs, doc, increment, orderBy, limit, where, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useInvoiceStore, CartItem } from '../store/invoiceStore';
import { useSettingsStore } from '../store/settingsStore';
import { logUserAction } from '../lib/logger';
import { ShoppingCart, Plus, Minus, Trash2, Search, FileText, Printer, MessageCircle, Globe, Coins, MoreVertical, ArrowLeft, X, Camera } from 'lucide-react';
import { printInvoice } from '../lib/printHelper';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
import SearchableSelect from '../components/SearchableSelect';
import ReturnInvoiceModal from '../components/ReturnInvoiceModal';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { motion, AnimatePresence } from 'framer-motion';

interface Product {
    id: string;
    name: string;
    barcode: string;
    price: number;
    quantity: number;
}

interface Customer {
    id: string;
    name: string;
    points?: number;
    balance?: number;
}

interface SaleInvoice {
    id: string;
    invoiceNumber: string;
    date: number;
    customerId: string;
    items: any[];
    total: number;
    paymentType: string;
    createdBy: string;
    createdAt?: number;
    commissionPercent?: number;
    commissionAmount?: number;
    status?: string;
}

import { useNavigate } from 'react-router-dom';

export default function Sales() {
    const navigate = useNavigate();
    const { appUser, hasPermission } = useAuthStore();
    const { settings } = useSettingsStore();
    
    const canAdd = hasPermission('sales', 'add');
    const canEdit = hasPermission('sales', 'edit');
    const canDelete = hasPermission('sales', 'delete');
    const canReturn = hasPermission('sales', 'return');
    const canView = hasPermission('sales', 'view');
    const { 
        salesCart: cart, setSalesCart: setCart, 
        salesPaymentMethod: paymentMethod, setSalesPaymentMethod: setPaymentMethod, 
        salesCustomerName: customerSearchName, setSalesCustomerName: setCustomerSearchName, 
        salesDiscountPercent: discountPercent, setSalesDiscountPercent: setDiscountPercent,
        salesSearch: search, setSalesSearch: setSearch,
        salesActiveTab: activeTab, setSalesActiveTab: setActiveTab,
        salesEditingInvoice: editingInvoice, setSalesEditingInvoice: setEditingInvoice,
        clearSales 
    } = useInvoiceStore();
    
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const [isCheckingOut, setIsCheckingOut] = useState(false);
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<{
        id: string;
        name: string;
        barcode: string;
        price: number;
        cartQuantity: number;
        stock: number;
    } | null>(null);
    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
    const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);

    const [isNewPartyModalOpen, setIsNewPartyModalOpen] = useState(false);
    const [newPartyPhone, setNewPartyPhone] = useState('');
    const [newPartyAddress, setNewPartyAddress] = useState('');
    const [newPartyBalance, setNewPartyBalance] = useState('');

    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scanNotification, setScanNotification] = useState<string | null>(null);

    const handleBarcodeScanned = (scannedCode: string) => {
        const cleanCode = scannedCode.trim().toLowerCase();
        const matchedProduct = products.find(p => 
            (p.barcode || '').trim().toLowerCase() === cleanCode || 
            (p.id || '').trim().toLowerCase() === cleanCode
        );

        if (matchedProduct) {
            addToCart(matchedProduct);
            setScanNotification(`تمت إضافة "${matchedProduct.name}" إلى الفاتورة بنجاح`);
            setTimeout(() => setScanNotification(null), 3000);
        } else {
            setSearch(scannedCode);
            setIsDropdownOpen(true);
            setScanNotification(`لم يتم العثور على منتج بالباركود (${scannedCode}). تم وضع الرقم في البحث.`);
            setTimeout(() => setScanNotification(null), 4000);
        }
    };

    const _reverseInvoice = async (invoice: any, actionType: 'returned' | 'cancelled', providedBatch?: any) => {
        const batch = providedBatch || writeBatch(db);
        batch.update(doc(db, 'sales', invoice.id), { status: actionType });
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
        
        (invoice.items || []).forEach((item: any) => {
            if (item.productId) {
                batch.set(doc(db, 'products', item.productId), {
                    quantity: increment(item.quantity)
                }, { merge: true });
            }
        });

        if (invoice.paymentType === 'cash' || invoice.status === 'paid' || parseFloat(invoice.paidAmount || 0) > 0) {
            const amountToRefund = invoice.paymentType === 'cash' || invoice.status === 'paid' ? parseFloat(invoice.total) : parseFloat(invoice.paidAmount || 0);
            batch.set(doc(collection(db, 'cash')), {
                date: Date.now(),
                amount: amountToRefund,
                type: 'out',
                category: 'refund',
                description: `${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} فاتورة ${invoice.invoiceNumber} للعميل ${invoice.customerName || customers.find(c => c.id === invoice.customerId)?.name || invoice.customerId}`,
                referenceId: invoice.id,
                createdBy: appUser?.uid || 'system',
                tenantId,
                createdAt: Date.now()
            });
            if (invoice.paymentType === 'credit' && invoice.customerId) {
                 batch.update(doc(db, 'customers', invoice.customerId), {
                     balance: increment(-parseFloat(invoice.total))
                 });
            }
        } else if (invoice.paymentType === 'credit' && invoice.customerId) {
             batch.update(doc(db, 'customers', invoice.customerId), {
                 balance: increment(-parseFloat(invoice.total))
             });
        }
        
        if (!providedBatch) {
            await batch.commit();
            await logUserAction(actionType === 'returned' ? 'إرجاع فاتورة مبيعات' : 'إلغاء فاتورة مبيعات', `تم ${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} الفاتورة ${invoice.invoiceNumber}`);
        }
    };

    const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, message: string, onConfirm: () => void, onCancel?: () => void}>({isOpen: false, message: '', onConfirm: () => {}});
    const [alertDialog, setAlertDialog] = useState<{isOpen: boolean, message: string}>({isOpen: false, message: ''});
    const [returnModalState, setReturnModalState] = useState<{isOpen: boolean, invoice: any | null}>({isOpen: false, invoice: null});

    const handlePartialReturn = async (invoice: any, returnedItems: any[]) => {
        setReturnModalState({ isOpen: false, invoice: null });
        if (!canReturn) {
            setAlertDialog({ isOpen: true, message: 'ليس لديك صلاحية إرجاع فواتير المبيعات.' });
            return;
        }

        try {
            const batch = writeBatch(db);
            const now = Date.now();

            let refundValue = 0;
            const updatedItems = [...invoice.items];

            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
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
                        quantity: increment(retItem.returnedQuantity)
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
                    type: 'out',
                    category: 'refund',
                    description: `استرجاع جزئي لفاتورة مبيعات ${invoice.invoiceNumber}`,
                    referenceId: invoice.id,
                    createdBy: appUser?.uid || 'system',
                    tenantId,
                    createdAt: now
                 });
                 newPaidAmount -= refundValue; 
            } else if (invoice.paymentType === 'credit') {
                 if (invoice.customerId) {
                     batch.update(doc(db, 'customers', invoice.customerId), {
                         balance: increment(-refundValue)
                     });
                 }
            }

            const isFullReturn = finalItems.length === 0;

            if (isFullReturn) {
                 batch.update(doc(db, 'sales', invoice.id), {
                     status: 'returned'
                 });
            } else {
                 batch.update(doc(db, 'sales', invoice.id), {
                     items: finalItems,
                     total: newFinalTotal,
                     paidAmount: newPaidAmount,
                     status: (invoice.paymentType === 'credit' && newPaidAmount >= newFinalTotal) ? 'paid' : (invoice.paymentType === 'cash' ? 'paid' : 'credit')
                 });
            }

            await batch.commit();
            await logUserAction('استرجاع جزئي لفاتورة مبيعات', `تم استرجاع جزئي بقيمة ${refundValue} للفاتورة ${invoice.invoiceNumber}`);
            setAlertDialog({ isOpen: true, message: 'تم تنفيذ الاسترجاع الجزئي للفاتورة واستعادة المخزون المعني.' });
        } catch (error: any) {
            setAlertDialog({ isOpen: true, message: error.message || 'حدث خطأ' });
        }
    };

    const handleReturnOrCancelInvoice = async (invoice: any, actionType: 'returned' | 'cancelled') => {
        if (actionType === 'cancelled' && !canDelete) {
            setAlertDialog({ isOpen: true, message: 'ليس لديك صلاحية إلغاء فواتير المبيعات.' });
            return;
        }
        if (actionType === 'returned' && !canReturn) {
            setAlertDialog({ isOpen: true, message: 'ليس لديك صلاحية إرجاع فواتير المبيعات.' });
            return;
        }
        if (!appUser) return;
        setConfirmDialog({
            isOpen: true,
            message: `هل أنت متأكد من ${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} الفاتورة ${invoice.invoiceNumber} واستعادة المخزون؟`,
            onConfirm: async () => {
                setConfirmDialog(p => ({ ...p, isOpen: false }));
                try {
                    await _reverseInvoice(invoice, actionType);
                    setAlertDialog({ isOpen: true, message: `تم ${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} الفاتورة بنجاح.` });
                } catch (error: any) {
                    setAlertDialog({ isOpen: true, message: error.message || 'حدث خطأ' });
                    handleFirestoreError(error, OperationType.UPDATE, 'sales');
                }
            }
        });
    };

    const handleQuickSettle = async (invoice: any) => {
        setActiveDropdownId(null);
        if (!invoice.customerId) {
            setAlertDialog({ isOpen: true, message: 'لا يوجد عميل مرتبط بهذه الفاتورة.' });
            return;
        }
        const customer = customers.find(c => c.id === invoice.customerId);
        if (!customer) {
            setAlertDialog({ isOpen: true, message: 'لم يتم العثور على بيانات العميل.' });
            return;
        }

        const invoiceTotal = parseFloat(invoice.total) || 0;
        const alreadyPaid = parseFloat(invoice.paidAmount) || 0;
        const invoiceRemaining = invoiceTotal - alreadyPaid;

        setConfirmDialog({
            isOpen: true,
            message: `هل أنت متأكد من سداد الفاتورة رقم ${invoice.invoiceNumber} بقيمة ${invoiceRemaining.toFixed(2)} ر.س من رصيد العميل المتوفر؟`,
            onConfirm: async () => {
                setConfirmDialog(p => ({ ...p, isOpen: false }));
                try {
                    const batch = writeBatch(db);
                    const customerRef = doc(db, 'customers', customer.id);
                    const invoiceRef = doc(db, 'sales', invoice.id);
                    
                    const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

                    // Note: In offline mode, we rely on the locally known balance.
                    // increment() is atomic and will be applied correctly by Firestore server later.
                    
                    batch.update(invoiceRef, {
                        paidAmount: invoiceTotal,
                        status: 'paid'
                    });

                    batch.update(customerRef, {
                        balance: increment(invoiceRemaining)
                    });

                    const vRef = doc(collection(db, 'cash'));
                    const vNum = Math.floor(100000 + Math.random() * 900000).toString();
                    batch.set(vRef, {
                        voucherNumber: vNum,
                        date: Date.now(),
                        type: 'in',
                        amount: invoiceRemaining,
                        description: `سداد فاتورة مبيعات ${invoice.invoiceNumber} من رصيد العميل (تسوية سريعة)`,
                        partyId: customer.id,
                        referenceId: invoice.id,
                        createdBy: appUser?.uid,
                        tenantId,
                        createdAt: Date.now(),
                        affectsCash: true
                    });

                    await batch.commit();

                    await logUserAction('سداد سريع من الرصيد', `تم سداد الفاتورة ${invoice.invoiceNumber} بقيمة ${invoiceRemaining.toFixed(2)} ر.س خصماً من رصيد دائن للعميل ${customer.name}`);
                    setAlertDialog({ isOpen: true, message: 'تم تسوية الفاتورة بنجاح مقتطعةً من رصيد العميل الدائن.' });
                } catch (error: any) {
                    setAlertDialog({ isOpen: true, message: 'فشل في تسوية الفاتورة: ' + error.message });
                }
            }
        });
    };

    const handleEditInvoice = async (invoice: any) => {
        if (!canEdit) {
            setAlertDialog({ isOpen: true, message: 'ليس لديك صلاحية تعديل فواتير المبيعات.' });
            return;
        }
        setConfirmDialog({
            isOpen: true,
            message: 'هذا سيؤدي إلى استبدال سلة المبيعات الحالية بالفاتورة المحددة لتعديلها. هل توافق؟',
            onConfirm: async () => {
                setConfirmDialog(p => ({ ...p, isOpen: false }));
                try {
                    setEditingInvoice(invoice);
                    setCart(invoice.items.map((i: any) => ({
                        id: i.productId,
                        name: i.name,
                        price: i.price,
                        cartQuantity: i.quantity,
                        barcode: i.barcode || ''
                    })));
                    setDiscountPercent(invoice.discountPercent || 0);
                    setPaymentMethod(invoice.paymentType);
                    const cust = customers.find(c => c.id === invoice.customerId);
                    if (cust) {
                        setCustomerSearchName(cust.name);
                    } else {
                        setCustomerSearchName(invoice.customerName || '');
                    }
                    setActiveTab('add');
                } catch (error: any) {
                     setAlertDialog({ isOpen: true, message: error.message || 'حدث خطأ أثناء تحميل الفاتورة' });
                }
            }
        });
    };

    // List view state
    const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
    const [searchInvoice, setSearchInvoice] = useState('');
    const [showUnpaidOnly, setShowUnpaidOnly] = useState(false);

    useEffect(() => {
        let unsubProducts = () => {};
        let unsubCustomers = () => {};

        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

        // Load products
        const qProducts = query(collection(db, 'products'), where('tenantId', '==', tenantId));
        unsubProducts = onSnapshot(qProducts, (snapshot) => {
            const list: Product[] = [];
            snapshot.forEach(docObj => {
                const r = docObj.data();
                list.push({ id: docObj.id, ...r } as Product);
            });
            setProducts(list);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

        // Load customers
        const loadCustomers = () => {
            const qCustomers = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
            const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
                const list: Customer[] = [];
                snapshot.forEach(docObj => {
                    const r = docObj.data();
                    list.push({ 
                        id: docObj.id, 
                        name: r.name, 
                        points: r.points, 
                        balance: r.balance 
                    } as Customer);
                });
                setCustomers(list);
            }, (error) => {
                handleFirestoreError(error, OperationType.GET, 'customers');
            });
            return unsubCustomers;
        };
        unsubCustomers = loadCustomers();

        return () => {
            unsubProducts();
            unsubCustomers();
        };
    }, [appUser]);

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
        let qInvoices;
        if (appUser.role === 'admin') {
            qInvoices = query(collection(db, 'sales'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'), limit(100));
        } else {
            qInvoices = query(collection(db, 'sales'), where('tenantId', '==', tenantId), where('createdBy', '==', appUser.uid), orderBy('createdAt', 'desc'), limit(100));
        }
        const unsubInvoices = onSnapshot(qInvoices, (snapshot) => {
             const list = [];
             snapshot.forEach(docObj => {
                 const r = docObj.data();
                 list.push({ id: docObj.id, ...r });
             });
             setInvoices(list);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'sales'));
        return () => unsubInvoices();
    }, [appUser]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => p.name.includes(search) || p.barcode.includes(search));
    }, [products, search]);

    const filteredCustomersList = useMemo(() => {
        return customers.filter(c => c.name.includes(customerSearchName));
    }, [customers, customerSearchName]);

    const filteredInvoices = useMemo(() => {
        const lowerSearchInvoice = searchInvoice.toLowerCase();
        
        // Build a lookup map of customerId -> lowercase name to make filtering O(n) instead of O(n*m)
        const customerMap = new Map<string, string>();
        customers.forEach(c => {
            if (c.id) customerMap.set(c.id, (c.name || '').toLowerCase());
        });

        return invoices.filter(inv => {
            const custName = customerMap.get(inv.customerId) || '';
            const matchSearch = custName.includes(lowerSearchInvoice) || 
                                (inv.invoiceNumber || '').toLowerCase().includes(lowerSearchInvoice);
            
            if (showUnpaidOnly) {
                if (inv.paymentType !== 'credit') return false;
                if (inv.status === 'paid' || inv.status === 'cancelled' || inv.status === 'returned') return false;
                const total = parseFloat(inv.total as any) || 0;
                const paid = parseFloat((inv as any).paidAmount) || 0;
                if (paid >= total) return false;
            }

            return matchSearch;
        });
    }, [invoices, customers, searchInvoice, showUnpaidOnly]);


    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
        setIsDropdownOpen(e.target.value.length > 0);
    };

    const handleSelectProduct = (product: Product) => {
        addToCart(product);
        setSearch('');
        setIsDropdownOpen(false);
    };

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                const newQ = existing.cartQuantity + 1;
                if (!settings.allowNegativeStock && newQ > (product.quantity || 0)) {
                    alert(`الكمية المطلوبة تتجاوز المخزون المتاح (${product.quantity})`);
                    return prev;
                }
                return prev.map(item => item.id === product.id ? { ...item, cartQuantity: newQ } : item);
            }
            if (!settings.allowNegativeStock && product.quantity <= 0) {
                alert(`المنتج غير متوفر في المخزون`);
                return prev;
            }
            return [...prev, { ...product, cartQuantity: 1 }];
        });
    };

    const updateCartQuantity = (id: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQ = item.cartQuantity + delta;
                if (newQ <= 0) return item;
                if (!settings.allowNegativeStock && newQ > (item.quantity || 0)) {
                    alert(`الكمية المطلوبة تتجاوز المخزون المتاح (${item.quantity})`);
                    return item;
                }
                return { ...item, cartQuantity: newQ };
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

        const cartItem = cart.find(item => item.id === id);
        if (!cartItem) return;

        if (!settings.allowNegativeStock && newQty > (cartItem.quantity || 0)) {
            alert(`الكمية المطلوبة تتجاوز المخزون المتاح (${cartItem.quantity})`);
            return;
        }

        setCart(prev => prev.map(item => {
            if (item.id === id) {
                return { ...item, cartQuantity: newQty, price: newPrice };
            }
            return item;
        }));

        setEditingItem(null);
    };

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.cartQuantity), 0);
    const totalItems = cart.reduce((sum, item) => sum + item.cartQuantity, 0);
    const discountAmount = (subtotal * discountPercent) / 100;
    const afterDiscount = subtotal - discountAmount;
    
    const vatAmount = settings.isVatEnabled ? (afterDiscount * settings.vatPercentage / 100) : 0;
    const total = afterDiscount + vatAmount;

    const handleCheckout = async () => {
        if (!canAdd) {
            alert('ليس لديك صلاحية لإضافة مبيعات.');
            return;
        }
        if (cart.length === 0 || !appUser) return;
        if (paymentMethod === 'credit' && !customerSearchName.trim()) {
            alert("يرجى إدخال اسم العميل لإتمام البيع الآجل.");
            return;
        }

        let finalCustomerId: string | null = null;
        if (customerSearchName.trim() !== '') {
            const existingCust = customers.find(c => c.name.toLowerCase() === customerSearchName.trim().toLowerCase());
            if (existingCust) {
                finalCustomerId = existingCust.id;
            } else {
                // Customer not found and they entered a name. Open detailed modal.
                setIsNewPartyModalOpen(true);
                return;
            }
        }

        await processCheckout(finalCustomerId);
    };

    const processCheckout = async (customerId: string | null) => {
        setIsCheckingOut(true);
        let finalInvoiceNum = '';
        if (!editingInvoice) {
            const existingNums = invoices
                .map(i => parseInt(i.invoiceNumber.replace(/\D/g, '')))
                .filter(n => !isNaN(n) && n < 10000000000); // Filter out old timestamps
            const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 1000;
            finalInvoiceNum = String(maxNum + 1).padStart(5, '0');
        } else {
            finalInvoiceNum = editingInvoice.invoiceNumber;
        }
        try {
            const batch = writeBatch(db);
            const now = Date.now();
            
            if (editingInvoice) {
                await _reverseInvoice(editingInvoice, 'cancelled', batch);
            }

            let finalCustomerId = customerId;

            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

            // If we are in the flow where isNewPartyModalOpen is true, then customerId is null 
            // but we need to create the customer using the modal details.
            if (!finalCustomerId && customerSearchName.trim() !== '') {
                 const custRef = doc(collection(db, 'customers'));
                 batch.set(custRef, {
                     name: customerSearchName.trim(),
                     phone: newPartyPhone,
                     address: newPartyAddress,
                     balance: parseFloat(newPartyBalance) || 0,
                     tenantId,
                     createdAt: now,
                     updatedAt: now
                 });
                 finalCustomerId = custRef.id;
            }

            // 2. Create Sale Invoice
            const commissionPercent = settings.isCommissionEnabled ? settings.defaultCommissionPercent : 0;
            const commissionAmount = (total * commissionPercent) / 100;

            let invoicePaidAmount = 0;
            if (paymentMethod === 'credit' && finalCustomerId) {
                const customer = customers.find(c => c.id === finalCustomerId);
                // If customer is found and has a deposit/credit balance with us (balance < 0)
                if (customer && customer.balance && customer.balance < 0) {
                    const prepaidAmount = Math.abs(customer.balance);
                    invoicePaidAmount = Math.min(total, prepaidAmount);
                }
            }

            const saleRef = editingInvoice ? doc(db, 'sales', editingInvoice.id) : doc(collection(db, 'sales'));
            batch.set(saleRef, {
                invoiceNumber: finalInvoiceNum,
                date: now,
                customerId: finalCustomerId,
                items: cart.map(item => ({
                    productId: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.cartQuantity
                })),
                subtotal: subtotal,
                discountPercent: discountPercent,
                discountAmount: discountAmount,
                vatPercentage: settings.isVatEnabled ? settings.vatPercentage : 0,
                vatAmount: vatAmount,
                total: total,
                paymentType: paymentMethod,
                paidAmount: paymentMethod === 'cash' ? total : invoicePaidAmount,
                status: (paymentMethod === 'cash' || (paymentMethod === 'credit' && invoicePaidAmount >= total)) ? 'paid' : 'active',
                createdBy: appUser?.uid,
                tenantId,
                createdAt: now,
                commissionPercent,
                commissionAmount
            });

            // 5. Loyalty Points Logic
            if (finalCustomerId && settings.loyaltyPointsPerAmount > 0) {
                const canEarnPoints = paymentMethod === 'cash' || settings.includeCreditInLoyalty;
                if (canEarnPoints) {
                    const pointsEarned = Math.floor((total / 100) * settings.loyaltyPointsPerAmount);
                    if (pointsEarned > 0) {
                        const customerRef = doc(db, 'customers', finalCustomerId);
                        batch.update(customerRef, {
                            points: increment(pointsEarned)
                        });

                        const loyaltyLogRef = doc(collection(db, 'loyalty_logs'));
                        batch.set(loyaltyLogRef, {
                            customerId: finalCustomerId,
                            customerName: customerSearchName || 'عميل',
                            points: pointsEarned,
                            type: 'earn',
                            reason: `فاتورة مبيعات #${finalInvoiceNum}`,
                            tenantId,
                            timestamp: now
                        });
                    }
                }
            }

            // 3. Update Inventory & create logs
            for (const item of cart) {
                const pRef = doc(db, 'products', item.id);
                batch.update(pRef, {
                    quantity: increment(-item.cartQuantity)
                });

                const invLogRef = doc(collection(db, 'inventoryLogs'));
                batch.set(invLogRef, {
                    date: now,
                    productId: item.id,
                    changeAmount: -item.cartQuantity,
                    reason: `Sale ${finalInvoiceNum}`,
                    referenceId: saleRef.id,
                    createdBy: appUser?.uid,
                    tenantId,
                    createdAt: now
                });
            }

            // 4. Financial Routing
            if (paymentMethod === 'cash' && (settings.cashIncludeSales !== false)) {
                const cashRef = doc(collection(db, 'cash'));
                batch.set(cashRef, {
                    date: now,
                    amount: total,
                    type: 'in',
                    category: 'sale',
                    description: `Cash sale ${finalInvoiceNum}`,
                    referenceId: saleRef.id,
                    createdBy: appUser?.uid,
                    tenantId,
                    createdAt: now
                });
            } else if (paymentMethod === 'credit' && finalCustomerId) {
                const customerRef = doc(db, 'customers', finalCustomerId);
                batch.update(customerRef, {
                    balance: increment(total)
                });
            }
            
            batch.commit().catch(e => console.error("Sync error in background: ", e));
            logUserAction('عملية بيع', `إتمام عملية بيع برقم ${finalInvoiceNum} بقيمة ${total} ر.س. طريقة الدفع: ${paymentMethod}`).catch(() => {});
            
            const clearAndClose = () => {
                clearSales();
                setDiscountPercent(0);
                setIsCheckoutModalOpen(false);
                setIsNewPartyModalOpen(false);
                setNewPartyPhone('');
                setNewPartyAddress('');
                setNewPartyBalance('0');
                setActiveTab('list');
            };

            setConfirmDialog({
                isOpen: true,
                message: "تمت عملية البيع بنجاح! هل تريد معاينة ومشاركة الفاتورة؟",
                onConfirm: () => {
                    setConfirmDialog(p => ({ ...p, isOpen: false }));
                    setPreviewInvoiceId(saleRef.id);
                    clearAndClose();
                },
                onCancel: () => {
                    setConfirmDialog(p => ({ ...p, isOpen: false }));
                    clearAndClose();
                }
            });
        } catch (error: any) {
             console.error("Checkout failed", error);
             setAlertDialog({ isOpen: true, message: error.message || 'فشلت عملية البيع' });
             handleFirestoreError(error, OperationType.WRITE, 'checkout-transaction');
        } finally {
            setIsCheckingOut(false);
        }
    };

    if (!canView) {
        return <div className="p-5 md:p-8 text-center text-red-600 font-bold text-base md:text-xl">ليس لديك صلاحية للوصول إلى صفحة المبيعات</div>;
    }

    return (
        <div className="flex flex-col gap-3 h-full min-h-0 text-xs overflow-hidden" dir="rtl">
            {/* Tabs */}
            <div className="flex bg-bg-main rounded-xl p-0.5 border border-border-main shadow-sm w-max self-start shrink-0">
                <button 
                    onClick={() => setActiveTab('list')}
                    className={`px-4 md:px-6 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 text-xs md:text-sm ${activeTab === 'list' ? 'bg-blue-600 text-white shadow-md' : 'text-text-main/50 hover:text-blue-600 hover:bg-white'}`}
                >
                    <FileText size={16} />
                    سجل المبيعات
                </button>
                <button 
                    onClick={() => setActiveTab('add')}
                    className={`px-4 md:px-6 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 text-xs md:text-sm ${activeTab === 'add' ? 'bg-blue-600 text-white shadow-md' : 'text-text-main/50 hover:text-blue-600 hover:bg-white'}`}
                >
                    <Plus size={16} />
                    فاتورة مبيعات
                </button>
            </div>

            {activeTab === 'list' && (
                <div className="flex-1 bg-card-bg rounded-xl shadow-sm border border-border-main flex flex-col overflow-hidden min-h-0">
                    <div className="p-3 border-b border-border-main flex flex-col md:flex-row gap-3 justify-between items-center bg-bg-main shrink-0">
                        <div className="flex flex-col md:flex-row gap-3 items-center w-full">
                            <div className="relative w-full md:w-80 group">
                                <Search className="absolute right-3 top-2.5 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={16} />
                                <input 
                                    type="text"
                                    placeholder="بحث برقم الفاتورة أو اسم العميل..."
                                    className="w-full bg-card-bg border border-border-main rounded-xl pr-9 pl-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-gray-200 transition-all font-bold text-text-main text-[11px]"
                                    value={searchInvoice}
                                    onChange={(e) => setSearchInvoice(e.target.value)}
                                />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2 rounded-xl text-[11px] font-bold text-black dark:text-gray-200 hover:bg-white transition border border-border-main self-start md:self-auto">
                                <input 
                                    type="checkbox" 
                                    className="rounded text-blue-600"
                                    checked={showUnpaidOnly}
                                    onChange={e => setShowUnpaidOnly(e.target.checked)}
                                />
                                عرض الآجلة غير المسددة فقط
                            </label>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto md:overflow-x-auto min-h-0 bg-card-bg">
                        <table className="w-full text-right whitespace-nowrap text-[10px] md:text-xs">
                            <thead className="bg-bg-main sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main">رقم الفاتورة</th>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main">العميل</th>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main text-center">الأصناف</th>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main text-center">الإجمالي</th>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main text-center">طريقة الدفع</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-main">
                                {filteredInvoices.map((invoice, invIndex) => {
                                    const custName = customers.find(c => c.id === invoice.customerId)?.name || 'نقدي';
                                    const dateObj = new Date(invoice.date || invoice.createdAt || 0);
                                    return (
                                        <React.Fragment key={invoice.id}>
                                        <tr className="hover:bg-bg-main transition-colors group cursor-pointer" onClick={() => setActiveDropdownId(invoice.id)}>
                                            <td className="p-3 font-bold text-blue-600">#{invoice.invoiceNumber}</td>
                                            <td className="p-3">
    <div className="flex flex-col">
        <span className="font-bold text-text-main">{custName}</span>
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
                                    clearSales();
                                    setActiveTab('list');
                                }}
                                className="text-yellow-700 hover:text-yellow-900 bg-white hover:bg-white px-3 py-1.5 rounded-lg text-xs font-bold transition"
                            >
                                إلغاء التعديل
                            </button>
                        </div>
                    )}
                    <div className="p-3 border-b border-border-main bg-white dark:bg-slate-800 shrink-0 rounded-t-xl relative z-30">
                        <div className="relative w-full z-20">
                            <div className="bg-card-bg flex items-center gap-2 md:gap-3 w-full h-12 px-3 md:px-4 rounded-xl border border-border-main focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all relative z-20 shadow-sm cursor-text" onClick={(e) => {
                                const input = e.currentTarget.querySelector('input');
                                if (input) input.focus();
                            }}>
                                <Search size={20} className="text-gray-400 group-focus-within:text-blue-500 transition-colors shrink-0" />
                                <input 
                                    type="text" 
                                    placeholder="ابحث عن منتج بالاسم أو الباركود..." 
                                    className="flex-1 h-full outline-none font-extrabold text-xs md:text-sm text-text-main placeholder:text-gray-400 bg-transparent"
                                    value={search}
                                    onChange={handleSearchChange}
                                    onFocus={() => { if(search.length > 0) setIsDropdownOpen(true); }}
                                    onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                                    id="sales-product-search-input"
                                />
                                {search && (
                                    <button onClick={(e) => { e.stopPropagation(); setSearch(''); }} className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer p-1 shrink-0">
                                        <X size={18} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsScannerOpen(true);
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-extrabold transition shadow-sm text-xs shrink-0 cursor-pointer"
                                    title="مسح الباركود بالكاميرا"
                                >
                                    <Camera size={16} />
                                    <span className="hidden sm:inline">مسح بالكاميرا</span>
                                </button>
                            </div>

                            {/* Toast Notification for Barcode Scanning */}
                            <AnimatePresence>
                                {scanNotification && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        className="mt-2 p-2.5 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 rounded-xl font-bold text-xs text-right shadow-sm flex items-center justify-between"
                                    >
                                        <span>{scanNotification}</span>
                                        <button onClick={() => setScanNotification(null)} className="text-indigo-400 hover:text-indigo-600 p-0.5">
                                            <X size={14} />
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            
                            <AnimatePresence>
                                {isDropdownOpen && search.length > 0 && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 5 }}
                                        className="absolute top-full right-0 left-0 mt-2 z-[100] bg-white dark:bg-slate-900 border border-border-main rounded-xl shadow-2xl max-h-80 md:max-h-96 overflow-y-auto p-2 flex flex-col gap-2 w-full"
                                    >
                                        {filteredProducts.map((p, idx) => {
                                            const isOutOfStock = p.quantity <= 0;
                                            const disableAdding = isOutOfStock && !settings.allowNegativeStock;
                                            return (
                                                <button 
                                                    key={`${p.id || 'prod'}-${idx}`} 
                                                    disabled={disableAdding}
                                                    onClick={() => handleSelectProduct(p)}
                                                    className={`w-full text-right p-3 bg-card-bg hover:bg-white rounded-xl shadow-sm border border-border-main flex justify-between items-center transition-all group ${disableAdding ? 'opacity-40 cursor-not-allowed' : 'hover:scale-[1.01] active:scale-[0.99]'}`}
                                                >
                                                    <div className="flex flex-col text-right">
                                                        <span className="font-extrabold text-text-main text-sm group-hover:text-blue-600 transition-colors">{p.name}</span>
                                                        <span className="text-[10px] font-bold text-text-main/50 uppercase tracking-tight bg-bg-main w-max px-1.5 py-0.5 rounded-md mt-1">{p.barcode || 'بدون باركود'}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className="font-black text-blue-600 text-sm">{p.price} <small className="text-[9px] font-bold opacity-75">ر.س</small></span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${p.quantity > 0 ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/25' : 'text-rose-700 bg-rose-50 dark:bg-rose-950/25'}`}>
                                                            {p.quantity > 0 ? `المخزون الحالي: ${p.quantity}` : settings.allowNegativeStock ? `المخزون الحالي: ${p.quantity} (بالسالب)` : 'نفذ المخزون'}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                        {filteredProducts.length === 0 && (
                                            <div className="p-10 text-center text-xs font-bold text-text-main/40 italic flex flex-col items-center gap-3">
                                                <Search size={36} className="opacity-20" />
                                                لا توجد منتجات مطابقة للبحث
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto bg-bg-main min-h-0 modern-scrollbar p-2 flex flex-col gap-2 relative z-10">
                        {cart.map(item => (
                                    <div key={item.id} className="bg-card-bg p-2 rounded-lg shadow-sm border border-border-main flex items-center justify-between gap-1.5 group hover:border-blue-400 transition-all">
                                        <div 
                                            onClick={() => setEditingItem({
                                                id: item.id,
                                                name: item.name,
                                                barcode: item.barcode,
                                                price: item.price,
                                                cartQuantity: item.cartQuantity,
                                                stock: item.quantity || 0
                                            })}
                                            className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                                            title="تعديل السعر والكمية"
                                        >
                                            <div className="flex flex-col overflow-hidden min-w-0 flex-1">
                                                <span className="font-bold text-text-main text-[11px] truncate group-hover:text-blue-600 transition-colors">{item.name}</span>
                                                <span className="text-[9px] font-bold text-text-main/40 uppercase tracking-widest bg-bg-main w-max px-1 rounded-sm mt-0.5">{item.barcode}</span>
                                            </div>
                                            <div className="flex flex-col items-end px-1 justify-center shrink-0">
                                                <span className="text-[9px] text-gray-400 font-bold">السعر</span>
                                                <span className="font-bold text-blue-600 text-[11px]">{item.price} <span className="text-[8px] font-normal text-gray-400">ر.س</span></span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="flex items-center gap-1.5 bg-bg-main rounded-lg p-0.5 border border-border-main">
                                                <button onClick={(e) => { e.stopPropagation(); updateCartQuantity(item.id, 1); }} className="p-1 bg-white shadow-sm text-blue-600 hover:bg-blue-600 hover:text-white rounded-md transition-all"><Plus size={10} /></button>
                                                <span className="font-bold w-4 text-center text-[10px] text-text-main">{item.cartQuantity}</span>
                                                <button onClick={(e) => { e.stopPropagation(); updateCartQuantity(item.id, -1); }} className="p-1 bg-white shadow-sm text-red-600 hover:bg-red-600 hover:text-white rounded-md transition-all"><Minus size={10} /></button>
                                            </div>
                                            <div className="flex flex-col items-center px-1 justify-center">
                                                <span className="text-[9px] text-gray-400 font-bold">المجموع</span>
                                                <span className="font-bold text-blue-700 text-[11px]">{(item.price * item.cartQuantity).toLocaleString()} <span className="text-[8px] font-normal text-gray-400">ر.س</span></span>
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

                    <div className="sticky bottom-0 left-0 right-0 z-40 p-4 border-t border-border-main bg-white dark:bg-slate-900 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] rounded-b-xl">
                        <div className="flex justify-between items-center w-full md:w-auto gap-5 md:gap-8">
                            <div className="flex flex-col text-right">
                                <span className="text-text-main/40 text-[8px] font-bold uppercase tracking-widest leading-none">الأصناف</span>
                                <span className="text-lg font-bold text-text-main">{totalItems}</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-text-main/40 text-[8px] font-bold uppercase tracking-widest leading-none">الإجمالي</span>
                                <span className="text-base md:text-xl font-bold text-blue-600">{subtotal.toLocaleString()} <small className="text-[10px] font-normal opacity-50">ر.س</small></span>
                            </div>
                        </div>

                        <button 
                            onClick={() => setIsCheckoutModalOpen(true)}
                            disabled={cart.length === 0}
                            className="w-full md:w-48 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95 text-sm flex justify-center items-center gap-2"
                        >
                            دفع <ShoppingCart size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Checkout Modal */}
            {isCheckoutModalOpen && !isNewPartyModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
                        <div className="p-5 border-b border-gray-100 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                            <h2 className="text-base md:text-xl font-bold text-black dark:text-white">إتمام عملية البيع</h2>
                            <button onClick={() => setIsCheckoutModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                                <Trash2 size={20} className="hidden" /> {/* Using Trash2 as spacer since X wasn't imported initially, let's just make text button */}
                                <span className="font-bold text-lg px-2">X</span>
                            </button>
                        </div>
                        <div className="p-4 md:p-6 overflow-y-auto flex-1 text-sm bg-white">
                            <div className="flex flex-col gap-3 mb-4 md:mb-6 bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200">
                                <div className="flex justify-between items-center text-text-main font-bold">
                                    <span>الإجمالي قبل الخصم:</span>
                                    <span>{subtotal.toLocaleString()} ر.س</span>
                                </div>
                                <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-200">
                                    <label className="text-text-main font-black text-sm">الخصم (%)</label>
                                    <input 
                                        type="number" 
                                        className="w-20 border-none outline-none font-black text-center bg-white dark:bg-slate-900 rounded p-1 text-text-main"
                                        min="0"
                                        max="100"
                                        value={discountPercent || ''}
                                        onChange={e => setDiscountPercent(Number(e.target.value) || 0)}
                                    />
                                </div>
                                {discountPercent > 0 && (
                                    <div className="flex justify-between items-center text-red-600 font-black text-sm">
                                        <span>قيمة الخصم:</span>
                                        <span>- {discountAmount.toLocaleString()} ر.س</span>
                                    </div>
                                )}
                                
                                {settings.isVatEnabled && (
                                    <div className="flex justify-between items-center text-text-main font-bold text-sm bg-white py-1 px-2 rounded-md">
                                        <span>الضريبة ({settings.vatPercentage}%):</span>
                                        <span>+ {vatAmount.toLocaleString()} ر.س</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center mt-2 pt-3 border-t border-gray-200 text-lg font-black text-blue-800">
                                    <span>الإجمالي المطلوب:</span>
                                    <span>{total.toLocaleString()} ر.س</span>
                                </div>
                                {settings.isMultiCurrencyEnabled && (
                                    <div className="flex justify-between items-center text-emerald-700 font-black text-sm">
                                        <span>بالعملة الأخرى ({settings.exchangeRate} / 1):</span>
                                        <span>{(total * settings.exchangeRate).toLocaleString()}</span>
                                    </div>
                                )}
                            </div>

                            <div className="mb-4 md:mb-6">
                                <label className="block text-sm font-black mb-2 text-text-main">طريقة الدفع</label>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => setPaymentMethod('cash')}
                                        className={`flex-1 py-3 rounded-xl border font-black transition ${paymentMethod === 'cash' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white dark:bg-slate-900 text-text-main border-gray-200 hover:bg-white'}`}
                                    >
                                        نقدي
                                    </button>
                                    <button 
                                        onClick={() => setPaymentMethod('credit')}
                                        className={`flex-1 py-3 rounded-xl border font-black transition ${paymentMethod === 'credit' ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white dark:bg-slate-900 text-text-main border-gray-200 hover:bg-white'}`}
                                    >
                                        آجل
                                    </button>
                                </div>
                            </div>

                            <div className="mb-2 relative">
                                <label className="block text-sm font-black mb-2 text-text-main">
                                    العميل {paymentMethod === 'cash' ? '(اختياري)' : '(مطلوب - سيتم إضافته للمسجلين تلقائياً)'}
                                </label>
                                <SearchableSelect
                                    options={customers.map(c => c.name)}
                                    placeholder="ابحث عن عميل أو اكتب اسماً جديداً..."
                                    value={customerSearchName}
                                    onChange={setCustomerSearchName}
                                />
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-100 bg-white dark:bg-slate-900">
                            <button 
                                onClick={handleCheckout}
                                disabled={isCheckingOut}
                                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold py-4 rounded-xl transition shadow-sm text-lg"
                            >
                                {isCheckingOut ? 'جاري التنفيذ...' : 'تأكيد وحفظ'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* New Customer Modal */}
            {isNewPartyModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl flex flex-col overflow-hidden max-h-[90vh]">
                         <div className="p-5 border-b border-gray-100 bg-white dark:bg-slate-900 flex justify-between items-center shrink-0">
                            <h2 className="text-base md:text-xl font-bold text-black dark:text-white">إضافة عميل جديد</h2>
                            <button onClick={() => setIsNewPartyModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                                <span className="font-bold text-lg px-2">X</span>
                            </button>
                        </div>
                        <div className="p-4 md:p-6 overflow-y-auto space-y-4">
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-black dark:text-gray-200">اسم العميل (المدخل)</label>
                                <input 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none bg-white dark:bg-slate-900 text-black" 
                                    value={customerSearchName} 
                                    readOnly 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-black dark:text-gray-200">رقم الهاتف</label>
                                <input 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-blue-500" 
                                    value={newPartyPhone} 
                                    onChange={e => setNewPartyPhone(e.target.value)} 
                                    placeholder="05XXXXXXXX"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-black dark:text-gray-200">العنوان</label>
                                <input 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-blue-500" 
                                    value={newPartyAddress} 
                                    onChange={e => setNewPartyAddress(e.target.value)} 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-black dark:text-gray-200">الرصيد الافتتاحي (له أو عليه)</label>
                                <input 
                                    type="number"
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-blue-500" 
                                    value={newPartyBalance} 
                                    onChange={e => setNewPartyBalance(e.target.value)} 
                                />
                                <p className="text-xs text-black mt-1">موجب = نحن ندين له، سالب = هو يدين لنا</p>
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-100 bg-white dark:bg-slate-900 flex gap-3">
                            <button 
                                onClick={() => processCheckout(null)}
                                disabled={isCheckingOut}
                                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold py-3 rounded-xl transition shadow-sm text-sm"
                            >
                                {isCheckingOut ? 'جاري التنفيذ...' : 'حفظ وإتمام البيع'}
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
                                    <h3 className="font-bold text-black dark:text-white text-lg leading-none mb-1">فاتورة مبيعات #{invoice.invoiceNumber}</h3>
                                    <p className="text-xs text-black font-bold">{dateObj.toLocaleDateString('ar-EG')} - {dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                                <button onClick={() => setActiveDropdownId(null)} className="w-8 h-8 flex items-center justify-center bg-white hover:bg-gray-300 rounded-full text-black dark:text-gray-300 transition">
                                    <span className="font-bold text-sm">✕</span>
                                </button>
                            </div>
                            <div className="p-5 grid grid-cols-2 gap-3 bg-white">
                                {settings.isWhatsAppEnabled && (
                                    <button 
                                        onClick={() => {
                                            setActiveDropdownId(null);
                                            const text = `فاتورة مبيعات #${invoice.invoiceNumber}\nالتاريخ: ${dateObj.toLocaleDateString('ar-EG')}\nالإجمالي: ${invoice.total} ر.س\nشكراً لتعاملكم معنا.`;
                                            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                                        }}
                                        className="col-span-2 py-3 bg-white text-emerald-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 border border-emerald-100 transition"
                                    >
                                        <MessageCircle size={18} /> إرسال عبر واتساب
                                    </button>
                                )}
                                <button onClick={() => { setActiveDropdownId(null); setPreviewInvoiceId(invoice.id); }} className="col-span-2 py-3 bg-white dark:bg-slate-800 text-blue-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 border border-gray-200 transition">
                                    <FileText size={18} /> معاينة الفاتورة ومشاركتها
                                </button>
                                
                                {invoice.status !== 'cancelled' && invoice.status !== 'returned' && (
                                    <>
                                        {invoice.paymentType === 'credit' && invoice.status !== 'paid' && (parseFloat((invoice as any).paidAmount || 0) < parseFloat(invoice.total as any)) && (
                                            <button onClick={() => { setActiveDropdownId(null); handleQuickSettle(invoice); }} className="col-span-2 py-3 bg-white text-emerald-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 border border-emerald-100 transition">
                                                <Coins size={18} /> سداد سريع من الرصيد
                                            </button>
                                        )}
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
                type="sales"
            />

            {confirmDialog.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                        <h3 className="text-lg font-bold text-black dark:text-white mb-2">تأكيد الإجراء</h3>
                        <p className="text-black dark:text-gray-300 mb-6">{confirmDialog.message}</p>
                        <div className="flex gap-3">
                            <button onClick={confirmDialog.onConfirm} className="flex-1 bg-black text-white py-2.5 rounded-lg font-bold">تأكيد</button>
                            <button onClick={confirmDialog.onCancel || (() => setConfirmDialog(p => ({ ...p, isOpen: false })))} className="flex-1 bg-white dark:bg-slate-800 text-black dark:text-gray-100 py-2.5 rounded-lg font-bold">إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
            
            {alertDialog.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                        <h3 className="text-lg font-bold text-black dark:text-white mb-2">تنبيه</h3>
                        <p className="text-black dark:text-gray-300 mb-6">{alertDialog.message}</p>
                        <button onClick={() => setAlertDialog(p => ({ ...p, isOpen: false }))} className="w-full bg-black text-white py-2.5 rounded-lg font-bold">حسناً</button>
                    </div>
                </div>
            )}

            {previewInvoiceId && (() => {
                const invoice = invoices.find(inv => inv.id === previewInvoiceId);
                if (invoice) {
                    return (
                        <InvoicePreviewModal
                            invoice={invoice}
                            type="sale"
                            items={invoice.items || []}
                            onClose={() => setPreviewInvoiceId(null)}
                        />
                    );
                }
                return null;
            })()}

            {editingItem && (
                <div className="fixed inset-0 bg-black/60 z-[110] flex items-center justify-center p-4 backdrop-blur-xs">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden border border-gray-100 dark:border-slate-800 text-right" dir="rtl">
                        {/* Header */}
                        <div className="p-4 md:p-5 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
                            <div className="flex flex-col">
                                <h3 className="text-base font-black text-black dark:text-white">تعديل الصنف</h3>
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
                                    <span className="text-gray-400 font-bold">المخزون المتاح</span>
                                    <span className="font-bold text-black dark:text-white mt-0.5">{editingItem.stock}</span>
                                </div>
                            </div>

                            {/* Quantity Input */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-black text-gray-500 dark:text-gray-400">الكمية</label>
                                <div className="flex items-center gap-2 bg-white dark:bg-slate-850 p-1 rounded-xl border border-gray-200 dark:border-slate-800 shadow-xs">
                                    <button 
                                        type="button"
                                        onClick={() => setEditingItem(prev => prev ? { ...prev, cartQuantity: prev.cartQuantity + 1 } : null)} 
                                        className="p-2.5 bg-blue-50 dark:bg-slate-800 hover:bg-blue-600 dark:hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white rounded-lg transition-all"
                                    >
                                        <Plus size={14} />
                                    </button>
                                    <input 
                                        type="number" 
                                        className="flex-1 text-center font-black text-base text-black dark:text-white bg-transparent outline-none border-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        value={editingItem.cartQuantity}
                                        min="1"
                                        onChange={e => {
                                            const val = parseInt(e.target.value) || 0;
                                            setEditingItem(prev => prev ? { ...prev, cartQuantity: val } : null);
                                        }}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => setEditingItem(prev => prev ? { ...prev, cartQuantity: Math.max(1, prev.cartQuantity - 1) } : null)} 
                                        className="p-2.5 bg-red-50 dark:bg-slate-800 hover:bg-red-600 dark:hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white rounded-lg transition-all"
                                    >
                                        <Minus size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Price Input */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-black text-gray-500 dark:text-gray-400">سعر البيع (ر.س)</label>
                                <div className="flex items-center bg-white dark:bg-slate-850 px-3 py-1 rounded-xl border border-gray-200 dark:border-slate-800 shadow-xs">
                                    <input 
                                        type="number" 
                                        step="any"
                                        className="w-full font-black text-base text-black dark:text-white bg-transparent outline-none border-none py-1.5 text-right"
                                        value={editingItem.price === 0 ? '' : editingItem.price}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value) || 0;
                                            setEditingItem(prev => prev ? { ...prev, price: val } : null);
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Item Total Display */}
                            <div className="flex justify-between items-center bg-blue-50/50 dark:bg-slate-800/30 p-3 rounded-xl border border-blue-100/50 dark:border-slate-700 text-sm mt-1">
                                <span className="font-bold text-gray-500 dark:text-gray-400">إجمالي الصنف:</span>
                                <span className="font-black text-blue-600 dark:text-blue-400 text-base">
                                    {(editingItem.price * editingItem.cartQuantity).toLocaleString()} <small className="text-xs font-normal">ر.س</small>
                                </span>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-2 shrink-0">
                            <button 
                                type="button"
                                onClick={() => handleUpdateCartItem(editingItem.id, editingItem.cartQuantity, editingItem.price)} 
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
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

            {/* Barcode Camera Scanner Modal */}
            <BarcodeScannerModal
                isOpen={isScannerOpen}
                onClose={() => setIsScannerOpen(false)}
                onScan={handleBarcodeScanned}
                title="مسح باركود المنتج بالكاميرا"
                subtitle="قم بتوجيه الكاميرا إلى الباركود لإضافته فورياً للفاتورة"
            />
        </div>
    );
}
