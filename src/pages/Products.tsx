import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, getDocs, addDoc, updateDoc, doc, Timestamp, onSnapshot, setDoc, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { Plus, Search, Edit2, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { logUserAction } from '../lib/logger';
import { useNavigate } from 'react-router-dom';

interface Product {
    id: string;
    name: string;
    barcode: string;
    price: number;
    cost: number;
    quantity: number;
    category: string;
    lowStockAlert?: number;
    expiryDate?: string; // YYYY-MM-DD
    createdAt: number;
}

export default function Products() {
    const navigate = useNavigate();
    const { appUser } = useAuthStore();
    const { settings } = useSettingsStore();
    const [viewMode, setViewMode] = useState<'menu' | 'list'>('menu');
    const [products, setProducts] = useState<Product[]>([]);
    const [linkedProductIds, setLinkedProductIds] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [isActionModalOpen, setActionModalOpen] = useState(false);
    const [isCategoryModalOpen, setCategoryModalOpen] = useState(false);
    const [isDetailsModalOpen, setDetailsModalOpen] = useState(false);
    const [selectedProductForDetails, setSelectedProductForDetails] = useState<Product | null>(null);
    
    // Category form
    const [categoryNum, setCategoryNum] = useState('');
    const [categoryName, setCategoryName] = useState('');
    const [categories, setCategories] = useState<{ id: string; num: string; name: string }[]>([]);

    const [isPriceAdjustModalOpen, setPriceAdjustModalOpen] = useState(false);
    const [isAdjustingPrices, setIsAdjustingPrices] = useState(false);
    const [priceAdjustType, setPriceAdjustType] = useState<'single' | 'all'>('single');
    const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<Product | null>(null);
    const [adjustPercentage, setAdjustPercentage] = useState('');
    const [adjustMode, setAdjustMode] = useState<'increase' | 'decrease'>('increase');
    const [adjustProgress, setAdjustProgress] = useState(0);

    // Bulk action state
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
    const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
    const [bulkCategory, setBulkCategory] = useState('General');
    const [bulkActionType, setBulkActionType] = useState<'category' | 'price_fixed' | 'price_percent'>('category');
    const [bulkPriceValue, setBulkPriceValue] = useState('');
    const [bulkPriceChangeType, setBulkPriceChangeType] = useState<'increase' | 'decrease'>('increase');
    const [bulkPricePercent, setBulkPricePercent] = useState('');
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);


    
    // Form state
    const [name, setName] = useState('');
    const [barcode, setBarcode] = useState('');
    const [price, setPrice] = useState('');
    const [cost, setCost] = useState('');
    const [quantity, setQuantity] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('General');

    useEffect(() => {
        (window as any).onHeaderBack = () => {
            if (viewMode !== 'menu') {
                setViewMode('menu');
                return true;
            }
            return false;
        };
        return () => {
            delete (window as any).onHeaderBack;
        };
    }, [viewMode]);

    useEffect(() => {
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

        const fetchLinkedProducts = () => {
            const ids = new Set<string>();
            const addIdsFromItems = (snapshot: any) => {
                snapshot.docs.forEach((doc: any) => {
                    const data = doc.data();
                    if (data.items && Array.isArray(data.items)) {
                        data.items.forEach((item: any) => {
                            if (item.productId) ids.add(item.productId);
                        });
                    }
                });
            };
            
            const qSales = query(collection(db, 'sales'), where('tenantId', '==', tenantId));
            const unsubSales = onSnapshot(qSales, (snap) => {
                addIdsFromItems(snap);
                setLinkedProductIds(new Set(ids));
            });

            const qPurchases = query(collection(db, 'purchases'), where('tenantId', '==', tenantId));
            const unsubPurchases = onSnapshot(qPurchases, (snap) => {
                addIdsFromItems(snap);
                setLinkedProductIds(new Set(ids));
            });

            return () => {
                unsubSales();
                unsubPurchases();
            };
        };
        const cleanupLinked = fetchLinkedProducts();

        const q = query(collection(db, 'products'), where('tenantId', '==', tenantId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Product[] = [];
            snapshot.forEach(docObj => {
                const r = docObj.data();
                list.push({ id: docObj.id, ...r } as Product);
            });
            setProducts(list);
        }, (error) => {
             handleFirestoreError(error, OperationType.GET, 'products');
        });

        const qCat = query(collection(db, 'categories'), where('tenantId', '==', tenantId));
        const unsubscribeCat = onSnapshot(qCat, (snapshot) => {
            const list: { id: string; num: string; name: string }[] = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() } as { id: string; num: string; name: string });
            });
            setCategories(list);
        });

        return () => {
            unsubscribe();
            unsubscribeCat();
            cleanupLinked();
        };
    }, [appUser]);

    const filtered = useMemo(() => {
        const lowerSearch = search.toLowerCase();
        return products.filter(p => 
            (p.name || '').toLowerCase().includes(lowerSearch) || 
            (p.barcode || '').includes(lowerSearch)
        );
    }, [products, search]);

    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const openEditModal = (product: Product) => {
        setEditingProduct(product);
        setName(product.name);
        setBarcode(product.barcode);
        setPrice(product.price.toString());
        setCost(product.cost.toString());
        setQuantity(product.quantity.toString());
        setSelectedCategory(product.category || 'General');
        setExpiryDate(product.expiryDate || '');
        setLowStockAlert(product.lowStockAlert?.toString() || '5');
        setActionModalOpen(true);
    };

    const openAddModal = () => {
        setEditingProduct(null);
        setName('');
        setBarcode('');
        setPrice('0');
        setCost('0');
        setQuantity('0');
        setSelectedCategory('General');
        setExpiryDate('');
        setLowStockAlert('5');
        setActionModalOpen(true);
    };

    const [lowStockAlert, setLowStockAlert] = useState('5');

    const handleSaveCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            let nextNum = '1';
            if (categories.length > 0) {
                const nums = categories.map(c => parseInt(c.num) || 0);
                const max = Math.max(...nums);
                nextNum = (max + 1).toString();
            }

            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
            await addDoc(collection(db, 'categories'), {
                num: nextNum,
                name: categoryName,
                tenantId,
                createdAt: Date.now()
            });
            await logUserAction('إضافة تصنيف', `تم إضافة تصنيف: ${categoryName} برقم: ${nextNum}`);
            setCategoryNum('');
            setCategoryName('');
            setCategoryModalOpen(false);
        } catch (error: any) {
            console.error('Failed to save category', error);
            handleFirestoreError(error, OperationType.CREATE, 'categories');
            alert('فشل حفظ التصنيف');
        }
    };

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
            const productId = editingProduct ? editingProduct.id : Math.random().toString(36).substring(2);
            const productPayload = {
                id: productId,
                name,
                barcode,
                price: parseFloat(price) || 0,
                cost: parseFloat(cost) || 0,
                quantity: parseInt(quantity) || 0,
                category: selectedCategory,
                expiryDate: settings.isExpiryTrackingEnabled ? expiryDate : null,
                lowStockAlert: parseInt(lowStockAlert) || 5,
                tenantId,
                createdAt: editingProduct ? (editingProduct.createdAt || Date.now()) : Date.now(),
                updatedAt: Date.now()
            };

            if (editingProduct) {
                await updateDoc(doc(db, 'products', editingProduct.id), productPayload);
                await logUserAction('تعديل منتج', `تم تعديل منتج: ${name}`);
            } else {
                await setDoc(doc(db, 'products', productId), productPayload);
                await logUserAction('إضافة منتج', `تمت إضافة منتج جديد: ${name} (باركود: ${barcode})`);
            }
            setActionModalOpen(false);
        } catch (error: any) {
            handleFirestoreError(error, editingProduct ? OperationType.UPDATE : OperationType.CREATE, 'products');
            alert('Failed to save product');
        }
    };

    const handleBulkUpdate = async () => {
        if (selectedProductIds.length === 0) return;
        setIsBulkUpdating(true);
        try {
            const selectedProducts = products.filter(p => selectedProductIds.includes(p.id));
            
            const chunkSize = 10;
            let processed = 0;
            
            for (let i = 0; i < selectedProducts.length; i += chunkSize) {
                const chunk = selectedProducts.slice(i, i + chunkSize);
                await Promise.all(chunk.map(async (p) => {
                    let updatedFields: any = {};
                    if (bulkActionType === 'category') {
                        updatedFields.category = bulkCategory;
                    } else if (bulkActionType === 'price_fixed') {
                        const priceVal = parseFloat(bulkPriceValue);
                        if (!isNaN(priceVal)) {
                            updatedFields.price = priceVal;
                        }
                    } else if (bulkActionType === 'price_percent') {
                        const percent = parseFloat(bulkPricePercent);
                        if (!isNaN(percent) && percent > 0) {
                            const multiplier = bulkPriceChangeType === 'increase' ? (1 + percent / 100) : (1 - percent / 100);
                            updatedFields.price = Math.round(p.price * multiplier * 100) / 100;
                        }
                    }

                    if (Object.keys(updatedFields).length === 0) return;

                    updatedFields.updatedAt = Date.now();

                    await updateDoc(doc(db, 'products', p.id), updatedFields);
                }));
            }

            await logUserAction('تعديل جماعي للمنتجات', `تم تعديل ${selectedProductIds.length} منتج بنسبة أو قيمة أو تصنيف`);
            alert('تم تحديث المنتجات المحددة بنجاح');
            setSelectedProductIds([]);
            setIsBulkEditModalOpen(false);
        } catch (err) {
            console.error(err);
            alert('فشل في التعديل الجماعي');
        } finally {
            setIsBulkUpdating(false);
        }
    };



    return (
        <div className="max-w-md mx-auto w-full h-screen max-h-screen bg-[#FDFDFD] flex flex-col pt-4 overflow-hidden" dir="rtl">
            {viewMode === 'menu' ? (
                <>
                    <div className="flex flex-col px-4 gap-4 mt-4 flex-1">
                        <button 
                            onClick={openAddModal}
                            className="w-full bg-white border border-gray-100 shadow-sm rounded-xl py-4 px-6 flex items-center justify-between hover:bg-white transition active:scale-[0.98]"
                        >
                            <span className="text-black font-bold text-lg">اضافة منتج جديد</span>
                            <Plus className="text-[#6EA84F]" size={32} strokeWidth={3} />
                        </button>

                        <button 
                            onClick={() => setViewMode('list')}
                            className="w-full bg-white border border-gray-100 shadow-sm rounded-xl py-4 px-6 flex items-center justify-between hover:bg-white transition active:scale-[0.98]"
                        >
                            <span className="text-black font-bold text-lg">عرض المنتجات</span>
                            <Search className="text-gray-400" size={32} strokeWidth={3} />
                        </button>

                        <button 
                            onClick={() => setCategoryModalOpen(true)}
                            className="w-full bg-white border border-gray-100 shadow-sm rounded-xl py-4 px-6 flex items-center justify-between hover:bg-white transition active:scale-[0.98]"
                        >
                            <span className="text-black font-bold text-lg">اضافة تصنيف جديد</span>
                            <Plus className="text-[#6EA84F]" size={32} strokeWidth={3} />
                        </button>

                        <button 
                            onClick={() => {
                                setPriceAdjustType('all');
                                setSelectedProductForAdjust(null);
                                setPriceAdjustModalOpen(true);
                            }}
                            className="w-full bg-white border border-gray-100 shadow-sm rounded-xl py-4 px-6 flex items-center justify-between hover:bg-white transition active:scale-[0.98]"
                        >
                            <span className="text-black font-bold text-lg">تعديل اسعار المنتجات</span>
                            <div className="flex flex-col items-center justify-center">
                                <ArrowRight size={20} className="text-black dark:text-gray-300 -mb-1" />
                                <ArrowLeft size={20} className="text-black dark:text-gray-300 -mt-1" />
                            </div>
                        </button>

                    </div>
                </>
            ) : (
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="p-2 flex flex-col gap-2 shrink-0 bg-[#FDFDFD]">
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg md:text-xl font-black text-text-main">قائمة المنتجات</h1>
                        </div>

                        <div className="relative w-full z-20">
                            <div className="bg-card-bg flex items-center gap-3 w-full h-12 px-4 rounded-xl border border-border-main focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all relative z-20 shadow-sm cursor-text" onClick={(e) => {
                                const input = e.currentTarget.querySelector('input');
                                if (input) input.focus();
                            }}>
                                <Search size={20} className="text-gray-400 group-focus-within:text-blue-500 transition-colors shrink-0" />
                                <input 
                                    type="text" 
                                    placeholder="ابحث بالاسم أو الباركود..." 
                                    className="flex-1 h-full outline-none font-extrabold text-sm text-text-main placeholder:text-gray-400 bg-transparent"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setShowSuggestions(true);
                                    }}
                                    onFocus={() => setShowSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                />
                                {search && (
                                    <button onClick={(e) => { e.stopPropagation(); setSearch(''); }} className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer p-1 shrink-0">
                                        <X size={18} />
                                    </button>
                                )}
                            </div>

                            {/* Autocomplete Suggestions */}
                            {showSuggestions && search.trim().length > 0 && filtered.length > 0 && (
                                <div className="absolute top-full right-0 left-0 mt-1 bg-card-bg border border-border-main rounded-xl shadow-xl overflow-hidden max-h-48 z-30 flex flex-col">
                                    <div className="overflow-y-auto no-scrollbar flex-1">
                                        {filtered.slice(0, 10).map((product, i) => (
                                            <div 
                                                key={`suggestion-${product.id || i}`}
                                                className="p-3 border-b border-border-main last:border-0 hover:bg-bg-main cursor-pointer flex justify-between items-center transition-colors"
                                                onMouseDown={(e) => {
                                                    // use onMouseDown to fire before input onBlur
                                                    e.preventDefault();
                                                    setSearch(product.name);
                                                    setShowSuggestions(false);
                                                }}
                                            >
                                                <span className="font-bold text-xs text-text-main truncate">{product.name}</span>
                                                {product.barcode && <span className="text-[10px] text-gray-500 font-bold shrink-0">{product.barcode}</span>}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="p-1.5 bg-bg-main border-t border-border-main text-center shrink-0">
                                        <span className="text-[9px] font-black text-gray-500">تم العثور على {filtered.length} نتيجة</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col min-h-0 justify-between">
                        <div className="bg-card-bg rounded-xl shadow-sm border border-border-main overflow-hidden flex-1 overflow-y-auto">
                        {/* Mobile View */}
                        <div className="md:hidden flex flex-col divide-y divide-border-main">
                            {filtered.map((product, idx) => {
                                const isSelected = selectedProductIds.includes(product.id);
                                return (
                                    <div 
                                        key={`${product.id}-${idx}`} 
                                        className={`p-2.5 flex justify-between items-center transition cursor-pointer ${isSelected ? 'bg-blue-50/55 dark:bg-blue-950/20' : 'hover:bg-bg-main'}`} 
                                        onClick={() => {
                                            if (isSelected) {
                                                setIsBulkEditModalOpen(true);
                                            } else {
                                                setSelectedProductForDetails(product);
                                                setDetailsModalOpen(true);
                                            }
                                        }}
                                    >
                                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                            <div 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedProductIds(prev => 
                                                        isSelected ? prev.filter(id => id !== product.id) : [...prev, product.id]
                                                    );
                                                }}
                                                className="shrink-0 flex items-center justify-center p-1"
                                            >
                                                <input 
                                                    type="checkbox" 
                                                    checked={isSelected}
                                                    onChange={() => {}} // Handled by parent div onClick
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </div>
                                            <div className="flex flex-col flex-1 min-w-0 pr-1">
                                                <span className="font-black text-xs text-text-main truncate">{product.name}</span>
                                                <span className="text-[9px] text-gray-400 font-black mt-0.5 uppercase tracking-wider">{product.barcode} | {product.category === 'General' ? 'عام' : product.category}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="flex flex-col items-end gap-0.5">
                                                <span className="text-xs font-black text-text-main">{product.price.toLocaleString()} ر.س</span>
                                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${product.quantity <= (product.lowStockAlert || 5) ? 'bg-white text-red-700' : 'bg-bg-main text-text-main border border-border-main'}`}>
                                                    {product.quantity}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {filtered.length === 0 && (
                                <div className="p-8 text-center text-text-main/50 font-black text-xs">لا توجد منتجات مطابقة</div>
                            )}
                        </div>

                        {/* Desktop View */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-right whitespace-nowrap text-xs">
                                <thead className="bg-bg-main border-b border-border-main">
                                    <tr>
                                        <th className="px-3 py-2.5 font-black text-text-main text-[10px] text-center w-12">
                                            <input 
                                                type="checkbox" 
                                                checked={filtered.length > 0 && filtered.every(p => selectedProductIds.includes(p.id))}
                                                onChange={(e) => {
                                                    const checked = e.target.checked;
                                                    if (checked) {
                                                        const toAdd = filtered.map(p => p.id);
                                                        setSelectedProductIds(prev => Array.from(new Set([...prev, ...toAdd])));
                                                    } else {
                                                        const toRemove = filtered.map(p => p.id);
                                                        setSelectedProductIds(prev => prev.filter(id => !toRemove.includes(id)));
                                                    }
                                                }}
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                        </th>
                                        <th className="px-3 py-2.5 font-black text-text-main text-[10px] text-center w-24 uppercase tracking-wider">الباركود</th>
                                        <th className="px-3 py-2.5 font-black text-text-main text-[10px] uppercase tracking-wider">المنتج</th>
                                        <th className="px-3 py-2.5 font-black text-text-main text-[10px] text-center uppercase tracking-wider">التصنيف</th>
                                        <th className="px-3 py-2.5 font-black text-text-main text-[10px] text-center uppercase tracking-wider">الكمية</th>
                                        {settings.isExpiryTrackingEnabled && (
                                            <th className="px-3 py-2.5 font-black text-text-main text-[10px] text-center uppercase tracking-wider">الانتهاء</th>
                                        )}
                                        <th className="px-3 py-2.5 font-black text-text-main text-[10px] text-center uppercase tracking-wider">التكلفة</th>
                                        <th className="px-3 py-2.5 font-black text-text-main text-[10px] text-center uppercase tracking-wider">البيع</th>
                                        <th className="px-3 py-2.5 font-black text-text-main text-[10px] text-center uppercase tracking-wider"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-main">
                                    {filtered.map((product, idx) => {
                                        const isSelected = selectedProductIds.includes(product.id);
                                        return (
                                            <tr 
                                                key={`${product.id}-${idx}`} 
                                                className={`transition-colors group cursor-pointer ${isSelected ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-bg-main'}`} 
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setIsBulkEditModalOpen(true);
                                                    } else {
                                                        setSelectedProductForDetails(product);
                                                        setDetailsModalOpen(true);
                                                    }
                                                }}
                                            >
                                                <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isSelected}
                                                        onChange={(e) => {
                                                            const checked = e.target.checked;
                                                            setSelectedProductIds(prev => 
                                                                checked ? [...prev, product.id] : prev.filter(id => id !== product.id)
                                                            );
                                                        }}
                                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-3 py-2 font-black text-[10px] text-gray-400 text-center">{product.barcode}</td>
                                                <td className="px-3 py-2 font-black text-text-main">{product.name}</td>
                                                <td className="px-3 py-2 text-center text-[10px] text-black font-bold">{product.category === 'General' ? 'عام' : product.category}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${product.quantity <= (product.lowStockAlert || 5) ? 'bg-white text-red-700' : 'bg-white text-emerald-700'}`}>
                                                        {product.quantity}
                                                    </span>
                                                </td>
                                                {settings.isExpiryTrackingEnabled && (
                                                    <td className="px-3 py-2 text-center">
                                                        <span className={`text-[9px] font-black ${product.expiryDate && new Date(product.expiryDate) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) ? 'text-red-600' : 'text-black'}`}>
                                                            {product.expiryDate || '-'}
                                                        </span>
                                                    </td>
                                                )}
                                                <td className="px-3 py-2 text-center text-[10px] font-black text-black">{product.cost.toLocaleString()}</td>
                                                <td className="px-3 py-2 text-center font-black text-blue-700">
                                                    {product.price.toLocaleString()}
                                                </td>
                                                <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-center">
                                                        <button onClick={() => openEditModal(product)} className="text-gray-400 hover:text-blue-600 p-1 rounded-lg transition-all">
                                                            <Edit2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        </div>

                        {/* Sticky Bulk Action Panel */}
                        {selectedProductIds.length > 0 && (
                            <div className="bg-blue-600 text-white p-3 pr-4 flex justify-between items-center shrink-0 z-40 sticky bottom-0 border-t border-blue-700 rounded-xl mt-2 shadow-lg">
                                <div className="flex items-center gap-2">
                                    <span className="font-extrabold text-xs">تم تحديد {selectedProductIds.length} منتج</span>
                                    <button 
                                        onClick={() => setSelectedProductIds([])}
                                        className="text-blue-200 hover:text-white text-[10px] font-bold underline cursor-pointer pr-1"
                                    >
                                        إلغاء
                                    </button>
                                </div>
                                <button 
                                    onClick={() => setIsBulkEditModalOpen(true)}
                                    className="bg-white text-blue-600 font-extrabold text-xs px-4 py-1.5 rounded-xl shadow hover:bg-blue-50 active:scale-95 transition-all cursor-pointer"
                                >
                                    تغيير التصنيف / السعر
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}



            {isActionModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-4 md:mb-6 p-4 md:p-6 pb-0 shrink-0">
                            <h2 className="text-base md:text-xl font-bold">{editingProduct ? 'تعديل منتج' : 'إضافة منتج جديد'}</h2>
                            <button onClick={() => setActionModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveProduct} className="flex flex-col gap-4 p-4 md:p-6 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-semibold mb-1">اسم المنتج</label>
                                <input required value={name} onChange={e=>setName(e.target.value)} type="text" className="w-full border rounded-xl p-3 bg-white" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">الباركود</label>
                                <input required value={barcode} onChange={e=>setBarcode(e.target.value)} type="text" className="w-full border rounded-xl p-3 bg-white text-left" dir="ltr" />
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm font-semibold mb-1">سعر الشراء (التكلفة)</label>
                                    <input required value={cost} onChange={e=>setCost(e.target.value)} type="number" step="0.01" className="w-full border rounded-xl p-3 bg-white text-left" dir="ltr" />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-semibold mb-1">سعر البيع</label>
                                    <input required value={price} onChange={e=>setPrice(e.target.value)} type="number" step="0.01" className="w-full border rounded-xl p-3 bg-white text-left" dir="ltr" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">التصنيف</label>
                                <select 
                                    value={selectedCategory} 
                                    onChange={e=>setSelectedCategory(e.target.value)} 
                                    className="w-full border rounded-xl p-3 bg-white text-right"
                                >
                                    <option value="General">عام (بدون تصنيف)</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.name}>{c.num ? `${c.num} - ` : ''}{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm font-semibold mb-1">الكمية {(editingProduct ? '' : 'الافتتاحية')}</label>
                                    <input required value={quantity} onChange={e=>setQuantity(e.target.value)} type="number" className="w-full border rounded-xl p-3 bg-white text-left" dir="ltr" />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-semibold mb-1 text-red-600">تنبيه المخزون المنخفض</label>
                                    <input required value={lowStockAlert} onChange={e=>setLowStockAlert(e.target.value)} type="number" className="w-full border rounded-xl p-3 bg-white text-left border-red-200 focus:border-red-500" dir="ltr" />
                                </div>
                            </div>
                            {settings.isExpiryTrackingEnabled && (
                                <div>
                                    <label className="block text-sm font-semibold mb-1">تاريخ انتهاء الصلاحية</label>
                                    <input value={expiryDate} onChange={e=>setExpiryDate(e.target.value)} type="date" className="w-full border rounded-xl p-3 bg-white" />
                                </div>
                            )}
                            <button type="submit" className={`w-full text-white font-bold py-3 mt-4 rounded-xl ${editingProduct ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                {editingProduct ? 'حفظ التعديلات' : 'حفظ المنتج'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
            {isCategoryModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]" dir="rtl">
                    <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-xl max-h-[80vh]">
                        <div className="flex justify-between items-center mb-4 p-4 md:p-6 pb-0 shrink-0">
                            <h2 className="text-xl font-bold">إضافة تصنيف جديد</h2>
                            <button onClick={() => setCategoryModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 pt-2">
                            <form onSubmit={handleSaveCategory} className="flex flex-col gap-4 mb-8">
                                <div>
                                    <label className="block text-sm font-semibold mb-1 text-black dark:text-gray-200">اسم التصنيف الجديد</label>
                                    <input required value={categoryName} onChange={e=>setCategoryName(e.target.value)} type="text" className="w-full border border-gray-200 rounded-xl p-3 bg-white dark:bg-slate-900 focus:bg-white focus:border-blue-500 outline-none transition-all font-bold" placeholder="مثال: إلكترونيات" />
                                </div>
                                <button type="submit" className="w-full bg-[#6EA84F] hover:bg-green-700 text-white font-bold py-3 rounded-xl transition shadow-lg active:scale-95 shadow-green-100 flex items-center justify-center gap-2">
                                    <Plus size={20} />
                                    حفظ التصنيف
                                </button>
                            </form>

                            <div className="border-t border-gray-100 pt-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">التصنيفات الحالية ({categories.length})</h3>
                                </div>
                                <div className="space-y-2">
                                    {categories.sort((a, b) => parseInt(a.num) - parseInt(b.num)).map((c, idx) => (
                                        <div key={`${c.id || 'cat'}-${idx}`} className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-900/50 rounded-xl border border-gray-100 group hover:bg-white hover:border-gray-200 transition-all">
                                            <div className="flex items-center gap-3">
                                                <span className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-[10px] font-black text-gray-400 border border-gray-100 shadow-sm">{c.num}</span>
                                                <span className="font-bold text-sm text-black dark:text-gray-200 group-hover:text-blue-600 transition-colors">{c.name}</span>
                                            </div>
                                        </div>
                                    ))}
                                    {categories.length === 0 && (
                                        <div className="text-center py-6 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-gray-200">
                                            <p className="text-[10px] text-gray-400 font-bold">لا توجد تصنيفات مضافة بعد</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isDetailsModalOpen && selectedProductForDetails && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[80]" dir="rtl">
                    <div className="bg-white rounded-2xl w-full max-w-md flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white dark:bg-slate-900/50">
                            <h2 className="text-xl font-black text-text-main">تفاصيل المنتج</h2>
                            <button onClick={() => setDetailsModalOpen(false)} className="text-gray-400 hover:text-gray-600 bg-white p-2 rounded-xl border border-gray-100 transition-all">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[80vh]">
                            <div className="flex flex-col gap-1">
                                <span className="text-2xl font-black text-text-main">{selectedProductForDetails.name}</span>
                                <span className="text-sm font-bold text-black font-mono tracking-wider">{selectedProductForDetails.barcode}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl flex flex-col gap-1 border border-gray-200">
                                    <span className="text-xs font-bold text-blue-600">سعر البيع</span>
                                    <span className="text-xl font-black text-blue-900">{selectedProductForDetails.price.toLocaleString()} ر.س</span>
                                </div>
                                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl flex flex-col gap-1 border border-gray-100">
                                    <span className="text-xs font-bold text-black">التكلفة</span>
                                    <span className="text-xl font-black text-black dark:text-gray-200">{selectedProductForDetails.cost.toLocaleString()} ر.س</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-gray-400">الكمية المتوفرة</span>
                                        <span className={`text-lg font-black ${selectedProductForDetails.quantity <= (selectedProductForDetails.lowStockAlert || 5) ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {selectedProductForDetails.quantity} قطعة
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <span className="text-xs font-bold text-gray-400">تنبيه المخزون</span>
                                        <span className="text-sm font-black text-black dark:text-gray-200">{selectedProductForDetails.lowStockAlert || 5}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl shadow-sm">
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-gray-400">التصنيف</span>
                                        <span className="text-sm font-black text-black dark:text-gray-200">{selectedProductForDetails.category === 'General' ? 'عام' : selectedProductForDetails.category}</span>
                                    </div>
                                    {settings.isExpiryTrackingEnabled && selectedProductForDetails.expiryDate && (
                                        <div className="flex flex-col items-end">
                                            <span className="text-xs font-bold text-gray-400 text-red-500">تاريخ الانتهاء</span>
                                            <span className="text-sm font-black text-red-600">{selectedProductForDetails.expiryDate}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-white dark:bg-slate-900 border-t border-gray-100 flex gap-3">
                            <button 
                                onClick={() => {
                                    setDetailsModalOpen(false);
                                    openEditModal(selectedProductForDetails);
                                }}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl transition shadow-lg shadow-blue-100 flex items-center justify-center gap-2 active:scale-95"
                            >
                                <Edit2 size={20} />
                                تعديل المنتج
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isPriceAdjustModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]" dir="rtl">
                    <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-xl">
                        <div className="flex justify-between items-center mb-4 p-5 pb-0">
                            <h2 className="text-xl font-bold">تعديل أسعار المنتجات</h2>
                            <button onClick={() => setPriceAdjustModalOpen(false)} className="text-gray-400 hover:text-gray-600 bg-white dark:bg-slate-800 p-1.5 rounded-xl transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-5 flex flex-col gap-5">
                            <div className="flex bg-white dark:bg-slate-800 p-1 rounded-xl">
                                <button 
                                    onClick={() => setPriceAdjustType('single')}
                                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition ${priceAdjustType === 'single' ? 'bg-white shadow text-blue-600' : 'text-black'}`}
                                >
                                    منتج واحد
                                </button>
                                <button 
                                    onClick={() => setPriceAdjustType('all')}
                                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition ${priceAdjustType === 'all' ? 'bg-white shadow text-blue-600' : 'text-black'}`}
                                >
                                    الكل
                                </button>
                            </div>

                            {priceAdjustType === 'single' && (
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-bold text-black dark:text-gray-200">اختر المنتج</label>
                                    <select 
                                        className="w-full border rounded-xl p-3 bg-white font-bold"
                                        value={selectedProductForAdjust?.id || ''}
                                        onChange={(e) => {
                                            const prod = products.find(p => p.id === e.target.value);
                                            setSelectedProductForAdjust(prod || null);
                                        }}
                                    >
                                        <option value="">— اختر منتجاً —</option>
                                        {products.map(p => (
                                            <option key={p.id} value={p.id}>{p.name} ({p.price} ر.س)</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setAdjustMode('increase')}
                                    className={`flex-1 py-3 rounded-xl font-bold border-2 transition ${adjustMode === 'increase' ? 'border-[#6EA84F] bg-white text-[#6EA84F]' : 'border-gray-100 text-gray-400'}`}
                                >
                                    زيادة (+)
                                </button>
                                <button 
                                    onClick={() => setAdjustMode('decrease')}
                                    className={`flex-1 py-3 rounded-xl font-bold border-2 transition ${adjustMode === 'decrease' ? 'border-red-500 bg-white text-red-500' : 'border-gray-100 text-gray-400'}`}
                                >
                                    نقصان (-)
                                </button>
                            </div>

                            <div>
                                <label className="block text-sm font-bold mb-2">النسبة المئوية (%)</label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        placeholder="مثال: 10" 
                                        className="w-full border rounded-xl p-3 bg-white text-center font-black text-xl"
                                        value={adjustPercentage}
                                        onChange={e => setAdjustPercentage(e.target.value)}
                                    />
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400">%</span>
                                </div>
                            </div>

                            {isAdjustingPrices && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex justify-between text-[10px] font-black text-blue-600">
                                        <span>جاري تحديث البيانات...</span>
                                        <span>{adjustProgress}%</span>
                                    </div>
                                    <div className="w-full bg-white dark:bg-slate-800 h-2 rounded-full overflow-hidden border border-gray-200">
                                        <div 
                                            className="h-full bg-blue-600 transition-all duration-300 ease-out" 
                                            style={{ width: `${adjustProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            <button 
                                disabled={isAdjustingPrices}
                                onClick={async () => {
                                    const perc = parseFloat(adjustPercentage);
                                    if (isNaN(perc) || perc <= 0) return alert('يرجى إدخال نسبة صحيحة');
                                    
                                    const multiplier = adjustMode === 'increase' ? (1 + perc/100) : (1 - perc/100);
                                    
                                    setIsAdjustingPrices(true);
                                    setAdjustProgress(0);
                                    try {
                                        if (priceAdjustType === 'single') {
                                            if (!selectedProductForAdjust) {
                                                setIsAdjustingPrices(false);
                                                return alert('يرجى اختيار منتج');
                                            }
                                            const newPrice = Math.round(selectedProductForAdjust.price * multiplier * 100) / 100;
                                            await updateDoc(doc(db, 'products', selectedProductForAdjust.id), { price: newPrice });
                                            setAdjustProgress(100);
                                            await logUserAction('تعديل سعر المنتج', `تم تعديل سعر ${selectedProductForAdjust.name} بنسبة ${perc}% ${adjustMode === 'increase' ? 'زيادة' : 'نقصان'}`);
                                        } else {
                                            // Confirm via custom UI check instead of native alert/confirm to be safe in iframes
                                            const count = products.length;
                                            if (count === 0) {
                                                setIsAdjustingPrices(false);
                                                return alert('لا توجد منتجات لتحديثها');
                                            }

                                            // Using chunks to avoid Firestore limits and keep UI responsive
                                            const chunkSize = 10;
                                            let processed = 0;
                                            
                                            for (let i = 0; i < products.length; i += chunkSize) {
                                                const chunk = products.slice(i, i + chunkSize);
                                                await Promise.all(chunk.map(p => {
                                                    const newPrice = Math.round(p.price * multiplier * 100) / 100;
                                                    return updateDoc(doc(db, 'products', p.id), { price: newPrice });
                                                }));
                                                processed += chunk.length;
                                                setAdjustProgress(Math.floor((processed / count) * 100));
                                            }
                                            
                                            await logUserAction('تعديل أسعار الكل', `تم تعديل أسعار ${count} منتج بنسبة ${perc}% ${adjustMode === 'increase' ? 'زيادة' : 'نقصان'}`);
                                        }
                                        alert('تم تحديث الأسعار بنجاح');
                                        setPriceAdjustModalOpen(false);
                                        setAdjustPercentage('');
                                    } catch (err) {
                                        console.error(err);
                                        alert('فشل في تحديث الأسعار');
                                    } finally {
                                        setIsAdjustingPrices(false);
                                    }
                                }}
                                className={`w-full text-white font-black py-4 rounded-xl transition shadow-lg active:scale-95 flex items-center justify-center gap-2 ${isAdjustingPrices ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}`}
                            >
                                {isAdjustingPrices ? 'جاري التحديث...' : 'تحديث الأسعار الآن'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isBulkEditModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[90]" dir="rtl">
                    <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white dark:bg-slate-900/50">
                            <h2 className="text-lg font-black text-text-main">تعديل جماعي ({selectedProductIds.length} منتج)</h2>
                            <button onClick={() => setIsBulkEditModalOpen(false)} className="text-gray-400 hover:text-gray-600 bg-white p-1.5 rounded-xl border border-gray-100 transition-all">
                                <X size={18} />
                            </button>
                        </div>
                        
                        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
                            <div>
                                <label className="block text-xs font-black text-gray-400 mb-2">نوع التعديل الجماعي</label>
                                <div className="grid grid-cols-3 gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
                                    <button 
                                        type="button" 
                                        onClick={() => setBulkActionType('category')}
                                        className={`py-2 px-1 rounded-lg text-[10px] font-black transition-all ${bulkActionType === 'category' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-100/50'}`}
                                    >
                                        تغيير التصنيف
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setBulkActionType('price_fixed')}
                                        className={`py-2 px-1 rounded-lg text-[10px] font-black transition-all ${bulkActionType === 'price_fixed' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-100/50'}`}
                                    >
                                        سعر ثابت
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setBulkActionType('price_percent')}
                                        className={`py-2 px-1 rounded-lg text-[10px] font-black transition-all ${bulkActionType === 'price_percent' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:bg-gray-100/50'}`}
                                    >
                                        نسبة مئوية
                                    </button>
                                </div>
                            </div>

                            {bulkActionType === 'category' && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-gray-500">اختر التصنيف الجديد للمنتجات المحددة</label>
                                    <select 
                                        value={bulkCategory} 
                                        onChange={e => setBulkCategory(e.target.value)} 
                                        className="w-full border rounded-xl p-3 bg-white text-right font-bold text-xs"
                                    >
                                        <option value="General">عام (بدون تصنيف)</option>
                                        {categories.map(c => (
                                            <option key={c.id} value={c.name}>{c.num ? `${c.num} - ` : ''}{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {bulkActionType === 'price_fixed' && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-gray-500">سعر البيع الجديد (ر.س)</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        className="w-full border rounded-xl p-3 bg-white text-center font-black text-xl" 
                                        placeholder="مثال: 15.50" 
                                        value={bulkPriceValue}
                                        onChange={e => setBulkPriceValue(e.target.value)}
                                        dir="ltr"
                                    />
                                </div>
                            )}

                            {bulkActionType === 'price_percent' && (
                                <div className="flex flex-col gap-3">
                                    <div className="flex gap-2">
                                        <button 
                                            type="button"
                                            onClick={() => setBulkPriceChangeType('increase')}
                                            className={`flex-1 py-2.5 rounded-xl font-bold border-2 text-xs transition ${bulkPriceChangeType === 'increase' ? 'border-[#6EA84F] bg-green-50/20 text-[#6EA84F]' : 'border-gray-100 text-gray-400'}`}
                                        >
                                            زيادة (+)
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setBulkPriceChangeType('decrease')}
                                            className={`flex-1 py-2.5 rounded-xl font-bold border-2 text-xs transition ${bulkPriceChangeType === 'decrease' ? 'border-red-500 bg-red-50/20 text-red-500' : 'border-gray-100 text-gray-400'}`}
                                        >
                                            نقصان (-)
                                        </button>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1.5">النسبة المئوية (%)</label>
                                        <div className="relative">
                                            <input 
                                                type="number" 
                                                placeholder="مثال: 10" 
                                                className="w-full border rounded-xl p-3 bg-white text-center font-black text-xl"
                                                value={bulkPricePercent}
                                                onChange={e => setBulkPricePercent(e.target.value)}
                                            />
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400">%</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-2">
                            <button 
                                type="button"
                                onClick={() => setIsBulkEditModalOpen(false)}
                                className="flex-1 bg-white hover:bg-gray-100 text-gray-600 font-bold py-3 rounded-xl border border-gray-200 text-xs transition-colors"
                            >
                                إلغاء
                            </button>
                            <button 
                                type="button"
                                disabled={isBulkUpdating}
                                onClick={handleBulkUpdate}
                                className={`flex-1 text-white font-black py-3 rounded-xl text-xs transition shadow-md active:scale-95 ${isBulkUpdating ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}`}
                            >
                                {isBulkUpdating ? 'جاري الحفظ...' : 'تطبيق التعديلات'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
