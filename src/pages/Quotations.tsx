import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, getDocs, doc, addDoc, orderBy, limit, where, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useInvoiceStore } from '../store/invoiceStore';
import { useSettingsStore } from '../store/settingsStore';
import { logUserAction } from '../lib/logger';
import { FileSignature, Plus, Minus, Trash2, Search, FileText, Printer, CheckCircle2, ShoppingCart, MessageCircle, Globe, Users, ArrowLeft, X } from 'lucide-react';
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
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [searchQuotation, setSearchQuotation] = useState('');
    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
    const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

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
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');
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
            const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

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
                createdBy: appUser.uid,
                createdAt: Date.now(),
                status: 'draft',
                tenantId
            });

            await logUserAction('عرض سعر', `إنشاء عرض سعر برقم ${qNum}`);
            alert('تم حفظ عرض السعر بنجاح');
            clearQuotations();
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
                        <div className="p-3 border-b border-border-main bg-white dark:bg-slate-800 shrink-0 rounded-t-xl relative z-30">
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
                                                        onClick={() => { addToCart(p); setSearch(''); setIsDropdownOpen(false); }} 
                                                        className="w-full text-right p-3 hover:bg-white bg-card-bg rounded-xl shadow-sm border border-border-main flex justify-between items-center transition-all hover:scale-[1.01] active:scale-[0.99] group"
                                                    >
                                                        <div className="flex flex-col text-right">
                                                            <span className="font-extrabold text-text-main text-sm group-hover:text-orange-600 transition-colors">{p.name}</span>
                                                            <span className="text-[10px] font-bold text-text-main/50 uppercase tracking-tight bg-bg-main w-max px-1.5 py-0.5 rounded-md mt-1">{p.barcode || 'بدون باركود'}</span>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className="font-black text-blue-600 text-sm">{p.price} <small className="text-[9px] font-bold opacity-75">ر.س</small></span>
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${p.quantity > 0 ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/25' : 'text-red-700 bg-red-50 dark:bg-red-950/25'}`}>
                                                                {p.quantity > 0 ? `المخزون الحالي: ${p.quantity}` : 'نفذت الكمية'}
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
                            {cart.map(item => (
                                <div key={item.id} className="bg-card-bg p-2 rounded-lg shadow-sm border border-border-main flex items-center justify-between gap-1.5 group">
                                    <div className="flex flex-col overflow-hidden min-w-0">
                                        <span className="font-bold text-text-main text-[11px] truncate">{item.name}</span>
                                        <span className="text-[9px] font-bold text-text-main/40 uppercase tracking-widest bg-bg-main w-max px-1 rounded-sm mt-0.5">{item.barcode}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 flex-row">
                                        <div className="flex flex-col items-center px-1">
                                            <span className="font-bold text-blue-600 text-[11px]">{item.price} <small className="text-[8px] opacity-70">ر.س</small></span>
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-bg-main rounded-lg p-0.5 border border-border-main">
                                            <button type="button" onClick={() => setCart(cart.map(i => i.id === item.id ? {...i, cartQuantity: i.cartQuantity + 1} : i))} className="p-1 bg-white shadow-sm text-blue-600 hover:bg-blue-600 hover:text-white rounded-md transition-all"><Plus size={10} /></button>
                                            <span className="font-bold w-4 text-center text-[10px] text-text-main">{item.cartQuantity}</span>
                                            <button type="button" onClick={() => setCart(cart.map(i => i.id === item.id && i.cartQuantity > 1 ? {...i, cartQuantity: i.cartQuantity - 1} : i))} className="p-1 bg-white shadow-sm text-red-600 hover:bg-red-600 hover:text-white rounded-md transition-all"><Minus size={10} /></button>
                                        </div>
                                        <div className="flex flex-col items-center px-1">
                                            <span className="font-bold text-blue-700 text-[11px]">{(item.price * item.cartQuantity).toLocaleString()}</span>
                                        </div>
                                        <button type="button" onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-red-400 hover:text-red-600 p-1.5 bg-white hover:bg-white rounded-lg transition-all"><Trash2 size={12} /></button>
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

                        <div className="sticky bottom-0 left-0 right-0 z-40 p-4 border-t border-border-main bg-white dark:bg-slate-900 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0 shadow-[0_-6px_20px_rgba(0,0,0,0.06)] rounded-b-xl">
                            <div className="flex justify-between items-center w-full md:w-auto gap-5 md:gap-8">
                                <div className="flex flex-col text-right">
                                    <span className="text-text-main/40 text-[8px] font-bold uppercase tracking-widest leading-none">عدد الأصناف</span>
                                    <span className="text-lg font-bold text-text-main">{cart.length}</span>
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="text-text-main/40 text-[8px] font-bold uppercase tracking-widest leading-none">إجمالي القيمة</span>
                                    <span className="text-base md:text-xl font-bold text-orange-600">{total.toLocaleString()} <small className="text-[10px] font-normal opacity-50">ر.س</small></span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <button 
                                    type="button"
                                    onClick={() => clearQuotations()}
                                    className="px-4 py-3 text-red-500 hover:text-white border border-red-200 hover:bg-red-600 rounded-xl transition-all font-bold text-xs"
                                >
                                    مسح السلة
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setIsSaveModalOpen(true)}
                                    disabled={cart.length === 0 || isSaving}
                                    className="flex-1 md:w-48 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95 text-sm flex justify-center items-center gap-2"
                                >
                                    {isSaving ? "جاري الحفظ..." : "حفظ عرض السعر"} <CheckCircle2 size={16} />
                                </button>
                            </div>
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
                <div className="fixed inset-0 z-[110] bg-black/65 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsSaveModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 text-right" dir="rtl" onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="border-b border-gray-100 dark:border-slate-800 p-5 flex justify-between items-center bg-gray-50 dark:bg-slate-900/60">
                            <h3 className="font-extrabold text-black dark:text-white text-base">تفاصيل وحفظ عرض السعر</h3>
                            <button onClick={() => setIsSaveModalOpen(false)} className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full text-gray-700 dark:text-gray-300 transition">
                                <span className="font-bold text-xs">✕</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-5">
                            {/* Customer Identifier */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                    اسم العميل <span className="text-red-500">*</span>
                                </label>
                                <SearchableSelect
                                    options={customers.map(c => c.name)}
                                    placeholder="نقدي أو اسم العميل..."
                                    value={customerSearchName}
                                    onChange={setCustomerSearchName}
                                    inputClassName="text-black dark:text-black font-extrabold text-sm"
                                />
                            </div>

                            {/* Discount Percentage */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                                    هل ترغب في تطبيق خصم؟ (نسبة مئوية %)
                                </label>
                                <div className="relative">
                                    <input 
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="1"
                                        placeholder="0"
                                        className="w-full p-3 pr-4 pl-10 text-sm font-extrabold border-2 border-gray-200 dark:border-slate-700 rounded-xl outline-none text-black bg-white focus:border-orange-500 transition"
                                        value={discountPercent || ''}
                                        onChange={e => {
                                            const val = Math.min(100, Math.max(0, Number(e.target.value)));
                                            setDiscountPercent(isNaN(val) ? 0 : val);
                                        }}
                                    />
                                    <span className="absolute left-3.5 top-3.5 text-gray-500 font-black text-xs">%</span>
                                </div>
                            </div>

                            {/* Financial Summary */}
                            <div className="bg-orange-50/50 dark:bg-slate-800/40 p-4 rounded-2xl border border-orange-100/50 dark:border-slate-800 space-y-2.5">
                                <div className="flex justify-between items-center text-xs font-bold text-gray-600 dark:text-gray-400">
                                    <span>المجموع قبل الخصم:</span>
                                    <span className="text-black dark:text-white font-extrabold">{subtotal.toLocaleString()} ر.س</span>
                                </div>

                                {discountAmount > 0 && (
                                    <div className="flex justify-between items-center text-xs font-bold text-red-600">
                                        <span>قيمة الخصم ({discountPercent}%):</span>
                                        <span className="font-extrabold">-{discountAmount.toLocaleString()} ر.س</span>
                                    </div>
                                )}

                                {settings.isVatEnabled && (
                                    <div className="flex justify-between items-center text-xs font-bold text-gray-600 dark:text-gray-400">
                                        <span>ضريبة القيمة المضافة ({settings.vatPercentage}%):</span>
                                        <span className="text-black dark:text-white font-extrabold">{vatAmount.toLocaleString()} ر.س</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center border-t border-gray-200 dark:border-slate-700 pt-3 text-sm">
                                    <span className="font-extrabold text-gray-900 dark:text-gray-200">الإجمالي النهائي:</span>
                                    <span className="font-black text-orange-600 text-lg tracking-tight">
                                        {total.toLocaleString()} <small className="text-[10px] font-bold">ر.س</small>
                                    </span>
                                </div>
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
        </div>
    );
}
