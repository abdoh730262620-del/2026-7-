import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, getDocs, doc, addDoc, orderBy, limit, where, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useInvoiceStore } from '../store/invoiceStore';
import { useSettingsStore } from '../store/settingsStore';
import { logUserAction } from '../lib/logger';
import { FileSignature, Plus, Minus, Trash2, Search, FileText, Printer, CheckCircle2, ShoppingCart, MessageCircle, Globe, Users, ArrowLeft, X, GripVertical } from 'lucide-react';
import { printInvoice } from '../lib/printHelper';
import SearchableSelect from '../components/SearchableSelect';
import { InvoicePreviewModal } from '../components/InvoicePreviewModal';
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
    phone?: string;
}

interface Quotation {
    id: string;
    quotationNumber: string;
    date: number;
    customerId: string;
    items: any[];
    total: number;
    createdBy: string;
    createdAt?: number;
    status: 'draft' | 'converted';
    discountPercent?: number;
}

import { useNavigate } from 'react-router-dom';

export default function Quotations() {
    const navigate = useNavigate();
    const { appUser, hasPermission } = useAuthStore();
    const { settings } = useSettingsStore();

    const canView = hasPermission('quotations', 'view');
    const canAdd = hasPermission('quotations', 'add');
    const canEdit = hasPermission('quotations', 'edit');
    const canDelete = hasPermission('quotations', 'delete');
    const { 
        quotationsCart: cart, setQuotationsCart: setCart, 
        quotationsCustomerName: customerSearchName, setQuotationsCustomerName: setCustomerSearchName, 
        quotationsDiscountPercent: discountPercent, setQuotationsDiscountPercent: setDiscountPercent,
        quotationsSearch: search, setQuotationsSearch: setSearch,
        quotationsActiveTab: activeTab, setQuotationsActiveTab: setActiveTab,
        clearQuotations 
    } = useInvoiceStore();
    
    const [products, setProducts] = useState<Product[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [searchQuotation, setSearchQuotation] = useState('');
    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
    const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
    const [editingItem, setEditingItem] = useState<{
        id: string;
        name: string;
        barcode: string;
        price: number | string;
        cartQuantity: number | string;
        stock: number;
    } | null>(null);

    const inputPrevValue = useRef<string>('');
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit'>('cash');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || 'single_store';

        const qProducts = query(collection(db, 'products'), where('tenantId', '==', tenantId));
        const unsubProducts = onSnapshot(qProducts, (snapshot) => {
            const list: Product[] = [];
            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Product));
            setProducts(list);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'products'));

        const loadCustomers = () => {
            const qCustomers = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
            const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
                const list: Customer[] = [];
                snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Customer));
                setCustomers(list);
            }, (error) => handleFirestoreError(error, OperationType.GET, 'customers'));
            return unsubCustomers;
        };
        const unsubCustomers = loadCustomers();

        return () => {
            unsubProducts();
            unsubCustomers();
        };
    }, [appUser]);

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || 'single_store';
        const q = query(collection(db, 'quotations'), where('tenantId', '==', tenantId), orderBy('createdAt', 'desc'), limit(50));
        return onSnapshot(q, (snapshot) => {
            const list: Quotation[] = [];
            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() } as Quotation));
            setQuotations(list);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'quotations'));
    }, [appUser]);

    const filteredProducts = products.filter(p => p.name.includes(search) || p.barcode.includes(search));
    const filteredCustomersList = customers.filter(c => c.name.includes(customerSearchName));
    const filteredQuotations = quotations.filter(q => {
        const cust = customers.find(c => c.id === q.customerId);
        return (cust?.name || 'نقدي').includes(searchQuotation) || q.quotationNumber.includes(searchQuotation);
    });

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) return prev.map(item => item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item);
            return [...prev, { ...product, cartQuantity: 1 }];
        });
        setSearch('');
        setIsDropdownOpen(false);
    };

    const handleUpdateCartItem = (id: string, newQty: number, newPrice: number) => {
        if (newQty <= 0) {
            setCart(prev => prev.filter(item => item.id !== id));
            setEditingItem(null);
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
    const discountAmount = (subtotal * discountPercent) / 100;
    const afterDiscount = subtotal - discountAmount;
    const vatAmount = settings.isVatEnabled ? (afterDiscount * settings.vatPercentage / 100) : 0;
    const total = afterDiscount + vatAmount;

    const handleSaveQuotation = async () => {
        if (!canAdd) {
            alert('ليس لديك صلاحية لإضافة عروض أسعار.');
            return;
        }
        if (cart.length === 0 || !appUser) return;
        setIsSaving(true);
        try {
            const tenantId = appUser.tenantId || 'single_store';

            const existingNums = quotations
                .map(q => parseInt((q.quotationNumber || '').replace(/\D/g, '')))
                .filter(n => !isNaN(n) && n < 10000000000);
            const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 1000;
            const qNum = "Q-" + String(maxNum + 1).padStart(5, '0');
            
            let finalCustomerId = customers.find(c => c.name === customerSearchName)?.id || null;

            await addDoc(collection(db, 'quotations'), {
                quotationNumber: qNum,
                date: Date.now(),
                customerId: finalCustomerId,
                customerName: customerSearchName || 'نقدي',
                items: cart.map(i => ({ productId: i.id, name: i.name, price: i.price, quantity: i.quantity })),
                subtotal, discountPercent, discountAmount,
                vatPercentage: settings.isVatEnabled ? settings.vatPercentage : 0,
                vatAmount, total,
                paymentType: paymentMethod,
                notes: notes.trim(),
                createdBy: appUser.uid,
                createdByName: appUser.name || appUser.email || 'المستخدم',
                sellerName: appUser.name || appUser.email || 'المستخدم',
                userName: appUser.name || appUser.email || 'المستخدم',
                createdAt: Date.now(),
                status: 'draft',
                tenantId
            });

            await logUserAction('عرض سعر', `إنشاء عرض سعر برقم ${qNum}`);
            alert('تم حفظ عرض السعر بنجاح');
            clearQuotations();
            setNotes('');
            setIsSaveModalOpen(false);
            setActiveTab('list');
        } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, 'quotations');
        } finally {
            setIsSaving(false);
        }
    };

    const handleShareWhatsApp = (quo: Quotation) => {
        const text = `عرض سعر رقم: ${quo.quotationNumber}\nالتاريخ: ${new Date(quo.date).toLocaleDateString('ar-EG')}\nالإجمالي: ${quo.total} ر.س\nشكراً لتعاملكم معنا.`;
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    const handleSelectProduct = (product: Product) => {
        // Force blur immediately to hide keyboard on mobile
        const input = document.getElementById('quotations-product-search-input');
        if (input) (input as HTMLInputElement).blur();
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        addToCart(product);
        setSearch('');
        setIsDropdownOpen(false);
    };

    if (!canView) {
        return <div className="p-5 md:p-8 text-center text-red-600 font-bold text-base md:text-xl">ليس لديك صلاحية للوصول إلى صفحة عروض الأسعار</div>;
    }

    return (
        <div className="flex flex-col gap-3 h-full min-h-0 text-xs overflow-hidden" dir="rtl">
            {/* Tabs */}
            <div className="flex bg-bg-main rounded-xl p-0.5 border border-border-main shadow-sm w-max self-start shrink-0">
                <button 
                    onClick={() => setActiveTab('list')}
                    className={`px-4 md:px-6 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 text-xs md:text-sm ${activeTab === 'list' ? 'bg-orange-600 text-white shadow-md' : 'text-text-main/50 hover:text-orange-600 hover:bg-white'}`}
                >
                    <FileText size={16} />
                    عروض الأسعار
                </button>
                <button 
                    onClick={() => setActiveTab('add')}
                    className={`px-4 md:px-6 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 text-xs md:text-sm ${activeTab === 'add' ? 'bg-orange-600 text-white shadow-md' : 'text-text-main/50 hover:text-orange-600 hover:bg-white'}`}
                >
                    <Plus size={16} />
                    عرض جديد
                </button>
            </div>

            {activeTab === 'list' && (
                <div className="flex-1 bg-card-bg rounded-xl shadow-sm border border-border-main flex flex-col overflow-hidden min-h-0">
                    <div className="p-3 border-b border-border-main bg-bg-main/50 shrink-0">
                        <div className="relative w-full md:w-80">
                            <Search className="absolute right-3 top-2.5 text-text-main/20" size={16} />
                            <input 
                                type="text"
                                placeholder="بحث برقم العرض أو اسم العميل..."
                                className="w-full bg-card-bg border border-border-main pr-9 pl-3 py-2 rounded-xl font-bold outline-none focus:border-orange-500 shadow-sm text-[11px]"
                                value={searchQuotation}
                                onChange={e => setSearchQuotation(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-x-auto min-h-0 bg-card-bg">
                        <table className="w-full text-right whitespace-nowrap text-[10px] md:text-xs">
                            <thead className="bg-bg-main sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main">رقم العرض</th>
                                    
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main">العميل</th>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main text-center">الإجمالي</th>
                                    <th className="p-3 font-bold uppercase text-[9px] tracking-widest text-text-main/60 border-b border-border-main text-center">الحالة</th>
                                    
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-main">
                                {filteredQuotations.map((q, qIndex) => (
                                    <React.Fragment key={q.id}>
                                    <tr className="hover:bg-bg-main transition-colors group cursor-pointer" onClick={() => setActiveDropdownId(q.id)}>
                                        <td className="p-3 font-bold text-orange-600">#{q.quotationNumber}</td>
                                        <td className="p-3">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-text-main">{new Date(q.date).toLocaleDateString('ar-EG')}</span>
                                                <span className="text-[9px] font-bold text-text-main/30 uppercase leading-none mt-0.5">{new Date(q.date).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </td>
                                        <td className="p-3 font-bold text-text-main">
                                            {(q as any).customerName || 'عميل نقدي'}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className="font-bold text-blue-700">{q.total.toLocaleString()} <small className="text-[8px] opacity-50">ر.س</small></span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${q.status === 'converted' ? 'bg-white text-emerald-700' : 'bg-white dark:bg-slate-700 text-blue-700'}`}>
                                                {q.status === 'converted' ? 'محول' : 'نشط'}
                                            </span>
                                        </td>
                                        
                                    </tr>
                                    </React.Fragment>
                                ))}
                                {filteredQuotations.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-10 text-center text-text-main/20 font-bold italic">لا توجد عروض أسعار بتلك المواصفات</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'add' && (
                <div className="flex-1 flex flex-col gap-4 min-h-0">
                    <div className="flex-1 bg-card-bg rounded-xl shadow-sm border border-border-main flex flex-col relative overflow-visible min-h-0">
                        <div className="p-3 border-b border-border-main bg-white dark:bg-slate-800 shrink-0 rounded-t-xl relative z-[60]">
                            <div className="flex flex-col md:flex-row gap-3 items-center">
                                <div className="relative flex-1 w-full z-20">
                                    <div className="bg-card-bg flex items-center gap-3 w-full h-12 px-4 rounded-xl border border-border-main focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-100 transition-all relative z-20 shadow-sm cursor-text" onClick={(e) => {
                                        const input = e.currentTarget.querySelector('input');
                                        if (input) input.focus();
                                    }}>
                                        <Search size={20} className="text-gray-400 group-focus-within:text-orange-500 transition-colors shrink-0" />
                                        <input 
                                            type="text" 
                                            placeholder="ابحث عن منتج بالاسم أو الباركود..." 
                                            className="flex-1 h-full outline-none font-extrabold text-sm text-text-main placeholder:text-gray-400 bg-transparent"
                                            value={search}
                                            onChange={e => { setSearch(e.target.value); setIsDropdownOpen(e.target.value.length > 0); }}
                                            onFocus={() => { if(search.length > 0) setIsDropdownOpen(true); }}
                                            onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                                            id="quotations-product-search-input"
                                        />
                                        {search && (
                                            <button onClick={(e) => { e.stopPropagation(); setSearch(''); }} className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer p-1 shrink-0">
                                                <X size={18} />
                                            </button>
                                        )}
                                    </div>
                                    
                                    <AnimatePresence>
                                        {isDropdownOpen && search.length > 0 && !isSaveModalOpen && (
                                            <motion.div 
                                                initial={{ opacity: 0, y: 5 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 5 }}
                                                className="absolute top-full right-0 left-0 mt-1 z-[150] bg-white dark:bg-slate-900 border border-border-main rounded-xl shadow-2xl max-h-[60vh] md:max-h-[70vh] overflow-y-auto p-0.5 flex flex-col gap-0 w-full"
                                            >
                                                {filteredProducts.map(p => (
                                                    <button 
                                                        key={p.id} 
                                                        type="button"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => handleSelectProduct(p)} 
                                                        className="w-full text-right p-1.5 hover:bg-white bg-card-bg rounded-lg shadow-sm border-b border-border-main/30 last:border-0 flex justify-between items-center transition-all hover:scale-[1.01] active:scale-[0.99] group"
                                                    >
                                                        <div className="flex flex-col text-right">
                                                            <span className="font-extrabold text-text-main text-[11px] group-hover:text-orange-600 transition-colors leading-tight">{p.name}</span>
                                                            <span className="text-[8px] font-bold text-text-main/50 uppercase tracking-tight bg-bg-main w-max px-1 rounded-md mt-0.5">{p.barcode || 'بدون باركود'}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-0">
                                                            <span className="font-black text-blue-600 text-[11px]">{p.price} <small className="text-[8px] font-bold opacity-75">ر.س</small></span>
                                                            <span className={`text-[8px] font-bold px-1 py-0.5 rounded-md ${p.quantity > 0 ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/25' : 'text-red-700 bg-red-50 dark:bg-red-950/25'}`}>
                                                                {p.quantity > 0 ? `المخزون: ${p.quantity}` : 'نفذت'}
                                                            </span>
                                                        </div>
                                                    </button>
                                                ))}
                                                {filteredProducts.length === 0 && (
                                                    <div className="p-10 text-center text-xs font-bold text-text-main/40 italic flex flex-col items-center gap-4">
                                                        <Search size={36} className="opacity-20" />
                                                        لا توجد منتجات مطابقة للبحث
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto bg-bg-main min-h-0 modern-scrollbar p-2 flex flex-col gap-2 relative z-10 rounded-b-xl">
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
                                    className={`bg-card-bg p-2 rounded-lg shadow-sm border ${draggedIndex === index ? 'opacity-40 border-orange-500 ring-2 ring-orange-300' : 'border-border-main'} flex items-center justify-between gap-1.5 group hover:border-orange-400 transition-all`}
                                >
                                    <div className="text-slate-400 hover:text-orange-600 cursor-grab active:cursor-grabbing p-1 shrink-0" title="اسحب لإعادة ترتيب منتجات عرض السعر">
                                        <GripVertical size={14} />
                                    </div>
                                    <div 
                                        onClick={() => setEditingItem({
                                            id: item.id,
                                            name: item.name,
                                            barcode: item.barcode,
                                            price: item.price || 0,
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
                                            <span className="font-bold text-blue-600 text-[11px]">{item.price || 0} <span className="text-[8px] font-normal text-gray-400">ر.س</span></span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 flex-row">
                                        <div className="flex items-center gap-1.5 bg-bg-main rounded-lg p-0.5 border border-border-main">
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setCart(cart.map(i => i.id === item.id ? {...i, cartQuantity: i.cartQuantity + 1} : i)); }} className="p-1 bg-white shadow-sm text-blue-600 hover:bg-blue-600 hover:text-white rounded-md transition-all"><Plus size={10} /></button>
                                            <span className="font-bold w-4 text-center text-[10px] text-text-main">{item.cartQuantity}</span>
                                            <button type="button" onClick={(e) => { e.stopPropagation(); setCart(cart.map(i => i.id === item.id && i.cartQuantity > 1 ? {...i, cartQuantity: i.cartQuantity - 1} : i)); }} className="p-1 bg-white shadow-sm text-red-600 hover:bg-red-600 hover:text-white rounded-md transition-all"><Minus size={10} /></button>
                                        </div>
                                        <div className="flex flex-col items-center px-1 justify-center">
                                            <span className="text-[9px] text-gray-400 font-bold">المجموع</span>
                                            <span className="font-bold text-blue-700 text-[11px]">{((item.price || 0) * item.cartQuantity).toLocaleString()} <span className="text-[8px] font-normal text-gray-400">ر.س</span></span>
                                        </div>
                                        <button type="button" onClick={(e) => { e.stopPropagation(); setCart(cart.filter(i => i.id !== item.id)); }} className="text-red-400 hover:text-red-600 p-1.5 bg-white hover:bg-white rounded-lg transition-all"><Trash2 size={12} /></button>
                                    </div>
                                </div>
                            ))}
                            {cart.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-text-main/30 gap-3 min-h-[250px]">
                                    <ShoppingCart size={48} className="opacity-20" />
                                    <span className="font-bold text-sm italic">لا توجد منتجات في العرض</span>
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
                                    <span className="text-sm sm:text-base font-black text-orange-600">{cart.reduce((s, i) => s + i.cartQuantity, 0)}</span>
                                </div>
                                <div className="h-6 w-px bg-gray-200 dark:bg-slate-700 shrink-0"></div>
                                <div className="flex flex-col text-right shrink-0">
                                    <span className="text-text-main/50 text-[10px] sm:text-[11px] font-bold whitespace-nowrap">الإجمالي</span>
                                    <span className="text-sm sm:text-lg font-black text-orange-600 whitespace-nowrap">{total.toLocaleString()} <small className="text-[10px] font-normal opacity-75">ر.س</small></span>
                                </div>
                            </div>

                            <button 
                                type="button"
                                onClick={() => {
                                    setIsDropdownOpen(false);
                                    setIsSaveModalOpen(true);
                                }}
                                disabled={cart.length === 0 || isSaving}
                                className="shrink-0 px-5 sm:px-7 py-3 sm:py-3.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-black rounded-xl transition-all shadow-md active:scale-95 text-xs sm:text-base flex justify-center items-center gap-2 whitespace-nowrap"
                            >
                                {isSaving ? "جاري الحفظ..." : "حفظ عرض السعر"} <CheckCircle2 size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeDropdownId && (() => {
                const q = quotations.find(quo => quo.id === activeDropdownId);
                if (!q) return null;
                const dateObj = new Date(q.date || q.createdAt || 0);
                return (
                    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setActiveDropdownId(null)}>
                        <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                            <div className="bg-white dark:bg-slate-900 border-b border-gray-100 p-5 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-black dark:text-white text-lg leading-none mb-1">عرض سعر #{q.quotationNumber}</h3>
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
                                            handleShareWhatsApp(q);
                                        }}
                                        className="col-span-2 py-3 bg-white text-emerald-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 border border-emerald-100 transition"
                                    >
                                        <MessageCircle size={18} /> إرسال عبر واتساب
                                    </button>
                                )}
                                <button onClick={() => { setActiveDropdownId(null); setPreviewInvoiceId(q.id); }} className="col-span-2 py-3 bg-white dark:bg-slate-800 text-blue-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 border border-gray-200 transition">
                                    <FileText size={18} /> معاينة ومشاركة
                                </button>
                                
                                <button 
                                    onClick={() => {
                                        setActiveDropdownId(null);
                                        // Wait wait... we need setCart and setCustomerSearchName inside Quotations, they exist?
                                        setCart(q.items.map(i => ({
                                            id: i.productId,
                                            name: i.name,
                                            price: i.price,
                                            cartQuantity: i.quantity,
                                            barcode: '',
                                            quantity: 0
                                        })));
                                        setCustomerSearchName((q as any).customerName || '');
                                        setDiscountPercent(q.discountPercent || 0);
                                        navigate('/sales');
                                    }}
                                    className="col-span-2 py-3 bg-white text-orange-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 border border-orange-100 transition"
                                >
                                    <ShoppingCart size={18} /> تحويل إلى فاتورة مبيعات
                                </button>
                                
                            </div>
                        </div>
                    </div>
                );
            })()}

            {isSaveModalOpen && (
                <div className="fixed inset-0 z-[210] bg-black/65 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsSaveModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 text-right" dir="rtl" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="border-b border-gray-100 dark:border-slate-800 p-5 flex justify-between items-center bg-gray-50 dark:bg-slate-900/60">
                            <h3 className="font-extrabold text-black dark:text-white text-base">تفاصيل وحفظ عرض السعر</h3>
                            <button onClick={() => setIsSaveModalOpen(false)} className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full text-gray-700 dark:text-gray-300 transition">
                                <span className="font-bold text-xs">✕</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4 md:p-6 overflow-y-auto max-h-[75vh] space-y-4">
                            {/* 1. طريقة الدفع فوقهم بالأعلى */}
                            <div>
                                <label className="block text-xs font-black mb-1.5 text-black dark:text-gray-200">طريقة الدفع (المتوقعة)</label>
                                <div className="flex gap-2">
                                    <button 
                                        type="button"
                                        onClick={() => setPaymentMethod('cash')}
                                        className={`flex-1 py-2.5 rounded-xl border font-bold transition ${paymentMethod === 'cash' ? 'bg-orange-600 text-white border-orange-600 shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-black dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:bg-slate-100'}`}
                                    >
                                        💵 نقدي
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setPaymentMethod('credit')}
                                        className={`flex-1 py-2.5 rounded-xl border font-bold transition ${paymentMethod === 'credit' ? 'bg-orange-600 text-white border-orange-600 shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-black dark:text-gray-300 border-gray-200 dark:border-slate-700 hover:bg-slate-100'}`}
                                    >
                                        💳 آجل
                                    </button>
                                </div>
                            </div>

                            {/* 2. اسم العميل وتحته حقل الملاحظات */}
                            <div className="space-y-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-gray-200 dark:border-slate-800">
                                <div>
                                    <label className="block text-xs font-black mb-1.5 text-slate-700 dark:text-slate-300">
                                        اسم العميل <span className="text-rose-500">*</span>
                                    </label>
                                    <SearchableSelect
                                        options={customers.map(c => c.name)}
                                        placeholder="نقدي أو ابحث عن اسم العميل..."
                                        value={customerSearchName}
                                        onChange={setCustomerSearchName}
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const now = new Date();
                                            const name = `مبيعات يومية لشهر ${now.getMonth() + 1} ${now.getFullYear()}`;
                                            setCustomerSearchName(name);
                                        }}
                                        className="text-[10px] font-bold text-orange-600 hover:text-orange-800 underline underline-offset-4 decoration-orange-300 transition-colors w-max mt-1"
                                    >
                                        + إدراج عميل مبيعات الشهر الحالي تلقائياً
                                    </button>
                                </div>

                                {/* حقل الملاحظات تحت اسم العميل */}
                                <div>
                                    <label className="block text-xs font-black mb-1.5 text-slate-700 dark:text-slate-300">
                                        ملاحظات عرض السعر (تظهر على العرض المطبوع)
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder="أدخل أي ملاحظات أو شروط تود إظهارها على عرض السعر..."
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition resize-none"
                                    />
                                </div>
                            </div>

                            {/* 3. السعر والخصم والإجمالي في نفس السطر (Row Layout) */}
                            <div className="p-3.5 space-y-3">
                                <p className="text-[11px] font-black text-orange-900 dark:text-orange-300 border-b border-orange-100 dark:border-slate-700 pb-1.5">
                                    الملخص المالي للعرض
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
                                                onChange={e => {
                                                    const val = Math.min(100, Math.max(0, Number(e.target.value)));
                                                    setDiscountPercent(isNaN(val) ? 0 : val);
                                                }}
                                                placeholder="0"
                                                className="w-12 bg-slate-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded text-center text-xs font-black text-rose-600 outline-none p-0.5"
                                            />
                                            <span className="text-[10px] font-bold text-slate-400">%</span>
                                        </div>
                                    </div>

                                    {/* الإجمالي الصافي */}
                                    <div className="bg-orange-600 text-white p-2.5 rounded-xl flex flex-col justify-center shadow-sm">
                                        <span className="text-[10px] font-bold text-orange-100 mb-1">الإجمالي الصافي</span>
                                        <span className="text-xs font-black truncate" dir="ltr">
                                            {total.toLocaleString()} ر.س
                                        </span>
                                    </div>
                                </div>

                                {(discountAmount > 0 || settings.isVatEnabled) && (
                                    <div className="flex flex-wrap items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400 pt-1 border-t border-orange-100/60 dark:border-slate-700 px-1 gap-2">
                                        {discountAmount > 0 && (
                                            <span>خصم: <strong className="text-rose-600">-{discountAmount.toLocaleString()} ر.س</strong></span>
                                        )}
                                        {settings.isVatEnabled && (
                                            <span>ضريبة ({settings.vatPercentage}%): <strong className="text-orange-700 dark:text-orange-300">+{vatAmount.toLocaleString()} ر.س</strong></span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className="p-5 border-t border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/40 flex gap-3">
                            <button 
                                type="button"
                                onClick={() => setIsSaveModalOpen(false)}
                                className="flex-1 py-3 border border-gray-200 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-300 font-extrabold rounded-xl transition text-xs"
                            >
                                إلغاء
                            </button>
                            <button 
                                type="button"
                                onClick={async () => {
                                    setIsSaveModalOpen(false);
                                    await handleSaveQuotation();
                                }}
                                disabled={isSaving}
                                className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-extrabold rounded-xl transition flex justify-center items-center gap-2 shadow-lg shadow-orange-100 dark:shadow-none text-xs"
                            >
                                {isSaving ? "جاري الحفظ..." : "حفظ وتأكيد"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {previewInvoiceId && (() => {
                const quotation = quotations.find(q => q.id === previewInvoiceId);
                if (quotation) {
                    return (
                        <InvoicePreviewModal
                            invoice={quotation}
                            type="quotation"
                            items={quotation.items || []}
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
                                <h3 className="text-base font-black text-black dark:text-white">تعديل الصنف (عرض سعر)</h3>
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
                                        onClick={() => setEditingItem(prev => prev ? { ...prev, cartQuantity: Number(prev.cartQuantity) + 1 } : null)} 
                                        className="p-2.5 bg-blue-50 dark:bg-slate-800 hover:bg-blue-600 dark:hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white rounded-lg transition-all"
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

                            {/* Price Input */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-black text-gray-500 dark:text-gray-400">سعر البيع المقترح (ر.س)</label>
                                <div className="flex items-center bg-white dark:bg-slate-850 px-3 py-1 rounded-xl border border-gray-200 dark:border-slate-800 shadow-xs">
                                    <input 
                                        type="number" 
                                        step="0.1"
                                        className="w-full font-black text-base text-black dark:text-white bg-transparent outline-none border-none py-1.5 text-center"
                                        value={editingItem.price}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setEditingItem(prev => prev ? { ...prev, price: val } : null);
                                        }}
                                        onFocus={(e) => {
                                            inputPrevValue.current = editingItem.price.toString();
                                            setEditingItem(prev => prev ? { ...prev, price: '' } : null);
                                        }}
                                        onBlur={(e) => {
                                            if (editingItem.price === '') {
                                                setEditingItem(prev => prev ? { ...prev, price: inputPrevValue.current } : null);
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Item Total Display */}
                            <div className="flex justify-between items-center bg-blue-50/50 dark:bg-slate-800/30 p-3 rounded-xl border border-blue-100/50 dark:border-slate-700 text-sm mt-1">
                                <span className="font-bold text-gray-500 dark:text-gray-400">إجمالي الصنف:</span>
                                <span className="font-black text-blue-600 dark:text-blue-400 text-base">
                                    {(Number(editingItem.price) * Number(editingItem.cartQuantity)).toLocaleString()} <small className="text-xs font-normal">ر.س</small>
                                </span>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-4 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex gap-2 shrink-0">
                            <button 
                                type="button"
                                onClick={() => handleUpdateCartItem(editingItem.id, Number(editingItem.cartQuantity), Number(editingItem.price))} 
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all"
                            >
                                حفظ التعديلات
                            </button>
                            <button 
                                type="button"
                                onClick={() => {
                                    setCart(prev => prev.filter(i => i.id !== editingItem.id));
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
