import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, where, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { Plus, Search, Truck, Edit2, X, Upload, Trash2, ArrowLeft } from 'lucide-react';
import { logUserAction } from '../lib/logger';
import * as XLSX from 'xlsx';
import ImportMapper from '../components/ImportMapper';

interface Supplier {
    id: string;
    name: string;
    phone: string;
    address: string;
    balance: number;
    createdAt: number;
}

import { useNavigate } from 'react-router-dom';

export default function Suppliers() {
    const navigate = useNavigate();
    const { appUser } = useAuthStore();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [linkedSupplierIds, setLinkedSupplierIds] = useState<Set<string>>(new Set());
    const [search, setSearch] = useState('');
    const [isActionModalOpen, setActionModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [mapperState, setMapperState] = useState<{ isOpen: boolean; headers: string[]; rows: any[] }>({
        isOpen: false,
        headers: [],
        rows: []
    });
    
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [balance, setBalance] = useState('');

    useEffect(() => {
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
        
        const qPurchases = query(collection(db, 'purchases'), where('tenantId', '==', tenantId));
        const unsubscribePurchases = onSnapshot(qPurchases, (snapshot) => {
            const ids = new Set<string>();
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.supplierId) ids.add(data.supplierId);
            });
            setLinkedSupplierIds(ids);
        });

        const q = query(collection(db, 'suppliers'), where('tenantId', '==', tenantId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Supplier[] = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() } as Supplier);
            });
            setSuppliers(list);
        }, (error) => {
             handleFirestoreError(error, OperationType.GET, 'suppliers');
        });
        return () => {
            unsubscribe();
            unsubscribePurchases();
        };
    }, [appUser]);

    const filtered = useMemo(() => {
        return suppliers.filter(s => s.name.includes(search) || s.phone.includes(search));
    }, [suppliers, search]);

    const openEditModal = (supp: Supplier) => {
        if (appUser?.role !== 'admin') {
            alert('خاصية التعديل متاحة للمديرين فقط');
            return;
        }
        setEditingSupplier(supp);
        setName(supp.name);
        setPhone(supp.phone);
        setAddress(supp.address || '');
        setBalance(supp.balance.toString());
        setActionModalOpen(true);
    };

    const handleDelete = async (supp: Supplier) => {
        if (appUser?.role !== 'admin') {
            alert('خاصية الحذف متاحة للمديرين فقط');
            return;
        }
        if (linkedSupplierIds.has(supp.id)) {
            alert('لا يمكن حذف هذا المورد لوجود فواتير مرتبطة به.');
            return;
        }
        if (confirm(`هل أنت متأكد من حذف المورد: ${supp.name}؟`)) {
            try {
                const deletePromise = deleteDoc(doc(db, 'suppliers', supp.id));
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), 10000));
                await Promise.race([deletePromise, timeoutPromise]);
                await logUserAction('حذف مورد', `تم حذف المورد: ${supp.name}`);
            } catch (error) {
                handleFirestoreError(error, OperationType.DELETE, 'suppliers');
                alert('فشل في الحذف');
            }
        }
    };

    const handleSaveSupplier = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
            if (editingSupplier) {
                await updateDoc(doc(db, 'suppliers', editingSupplier.id), {
                    name,
                    phone,
                    address,
                    balance: parseFloat(balance) || 0,
                    updatedAt: Date.now()
                });
                await logUserAction('تعديل مورد', `تم تعديل بيانات المورد: ${name}`);
            } else {
                await addDoc(collection(db, 'suppliers'), {
                    name,
                    phone,
                    address,
                    balance: parseFloat(balance) || 0,
                    tenantId,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                });
                await logUserAction('إضافة مورد', `تم إضافة المورد: ${name}`);
            }

            setActionModalOpen(false);
            setEditingSupplier(null);
            setName('');
            setPhone('');
            setAddress('');
            setBalance('0');
        } catch (error: any) {
            handleFirestoreError(error, OperationType.WRITE, 'suppliers');
            alert('Failed to save supplier');
        }
    };

    const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const arrayBuffer = evt.target?.result as ArrayBuffer;
                const dataArray = new Uint8Array(arrayBuffer);
                const wb = XLSX.read(dataArray, { type: 'array' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length > 0) {
                    const headers = Object.keys(data[0] as any);
                    setMapperState({ isOpen: true, headers, rows: data });
                } else {
                    alert("الملف فارغ");
                }
            } catch (err) {
                console.error("Import error", err);
                alert("حدث خطأ أثناء قراءة الملف");
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const processMappedImport = async (mappedData: any[]) => {
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
        setMapperState(prev => ({ ...prev, isOpen: false }));
        setIsImporting(true);
        let imported = 0;
        try {
            const batchSize = 500;
            let batch = writeBatch(db);
            let batchCount = 0;

            for (const row of mappedData) {
                try {
                    const newSupp = {
                        name: String(row.name || 'بدون اسم'),
                        phone: String(row.phone || ''),
                        address: String(row.address || ''),
                        balance: parseFloat(row.balance) || 0,
                        tenantId,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    
                    const docRef = doc(collection(db, 'suppliers'));
                    batch.set(docRef, newSupp);
                    imported++;
                    batchCount++;

                    if (batchCount >= batchSize) {
                        await batch.commit();
                        batch = writeBatch(db);
                        batchCount = 0;
                    }
                } catch (err) {
                    console.error('Error importing row:', row, err);
                }
            }

            if (batchCount > 0) {
                await batch.commit();
            }

            await logUserAction('استيراد موردين', `استيراد ${imported} مورد من ملف إكسل`);
            alert(`تم استيراد ${imported} مورد بنجاح`);
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء الحفظ");
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div dir="rtl">
            <div className="flex items-center gap-4 mb-4">
                <h1 className="text-lg md:text-2xl font-black text-text-main">إدارة الموردين</h1>
            </div>
            <ImportMapper 
                isOpen={mapperState.isOpen}
                onClose={() => setMapperState(prev => ({ ...prev, isOpen: false }))}
                onImport={processMappedImport}
                headers={mapperState.headers}
                rows={mapperState.rows}
                fields={[
                    { key: 'name', label: 'اسم المورد / الشركة', required: true },
                    { key: 'phone', label: 'رقم الهاتف' },
                    { key: 'address', label: 'العنوان' },
                    { key: 'balance', label: 'الرصيد الافتتاحي' }
                ]}
            />
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-2">
                <div className="flex items-center gap-4">
                </div>
                <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleImportExcel}
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className="flex-1 md:flex-none bg-emerald-600 text-white px-4 py-2 rounded-xl flex justify-center items-center gap-1.5 hover:bg-emerald-700 transition shadow-sm font-black text-xs"
                    >
                        <Upload size={14} /> {isImporting ? 'جاري الاستيراد' : 'استيراد إكسل'}
                    </button>
                    <button 
                        onClick={() => setActionModalOpen(true)}
                        className="flex-1 md:flex-none bg-purple-600 text-white px-4 py-2 rounded-xl flex justify-center items-center gap-1.5 hover:bg-purple-700 transition shadow-sm font-black text-xs"
                    >
                        <Plus size={14} /> إضافة مورد جديد
                    </button>
                </div>
            </div>

            <div className="bg-card-bg flex items-center gap-3 w-full h-12 px-4 rounded-xl border border-border-main focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-100 transition-all mb-3 shadow-sm cursor-text" onClick={(e) => {
                const input = e.currentTarget.querySelector('input');
                if (input) input.focus();
            }}>
                <Search size={20} className="text-gray-400 group-focus-within:text-purple-500 transition-colors shrink-0" />
                <input 
                    type="text" 
                    placeholder="ابحث بالاسم أو رقم الهاتف..." 
                    className="flex-1 h-full outline-none font-extrabold text-sm text-text-main placeholder:text-gray-400 bg-transparent"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                    <button onClick={(e) => { e.stopPropagation(); setSearch(''); }} className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer p-1 shrink-0">
                        <X size={18} />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 md:gap-3">
                 {filtered.map(supplier => (
                    <div key={supplier.id} className="bg-white rounded-xl p-2.5 border border-gray-100 shadow-sm hover:shadow-md transition group">
                        <div className="flex items-start justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                                <div className="w-9 h-9 bg-gradient-to-br from-purple-50 to-pink-50 text-purple-600 border border-purple-100 rounded-full flex items-center justify-center shrink-0">
                                    <Truck size={16} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-extrabold text-sm text-text-main truncate">{supplier.name}</h3>
                                    <p className="text-text-main/50 font-bold text-[11px] mt-0.5" dir="ltr">{supplier.phone}</p>
                                </div>
                            </div>
                            
                            {appUser?.role === 'admin' && (
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={() => openEditModal(supplier)} className="text-gray-400 hover:text-purple-600 transition p-1.5 bg-bg-main rounded-lg border border-border-main hover:bg-white" title="تعديل">
                                        <Edit2 size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="bg-bg-main border border-border-main p-2 rounded-xl mt-2">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-text-main/60 font-bold">الرصيد الفعلي للمورد</span>
                                <span className={`font-extrabold text-sm ${supplier.balance > 0 ? 'text-emerald-600' : supplier.balance < 0 ? 'text-red-600' : 'text-text-main'}`}>
                                    {supplier.balance > 0 ? '+' : ''}{supplier.balance.toLocaleString()} <span className="text-[10px] font-normal">ر.س</span>
                                </span>
                            </div>
                        </div>
                    </div>
                 ))}
                 {filtered.length === 0 && (
                     <div className="col-span-full text-center py-5 md:py-8 text-black bg-white rounded-xl border border-dashed border-gray-200 text-sm">
                         لا يوجد موردين مطابقين للبحث
                     </div>
                 )}
            </div>

            {isActionModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-4 md:mb-6 p-4 md:p-6 pb-0 shrink-0">
                            <h2 className="text-base md:text-xl font-bold">إضافة مورد جديد</h2>
                            <button onClick={() => setActionModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveSupplier} className="flex flex-col gap-4 p-4 md:p-6 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-semibold mb-1">اسم المورد / الشركة</label>
                                <input required value={name} onChange={e=>setName(e.target.value)} type="text" className="w-full border rounded-xl p-3 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">رقم الهاتف</label>
                                <input required value={phone} onChange={e=>setPhone(e.target.value)} type="tel" className="w-full border rounded-xl p-3 text-left font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" dir="ltr"/>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">العنوان</label>
                                <input value={address} onChange={e=>setAddress(e.target.value)} type="text" className="w-full border rounded-xl p-3 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">رصيد باديء (لنا / علينا)</label>
                                <input value={balance} onChange={e=>setBalance(e.target.value)} type="number" className="w-full border rounded-xl p-3 text-left font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" dir="ltr"/>
                                <p className="text-xs text-gray-400 mt-1">القيمة الموجبة: لنا أموال لديه، القيمة السالبة: ديون علينا له.</p>
                            </div>
                            <button type="submit" className="w-full bg-purple-600 text-white font-bold py-3 mt-4 rounded-xl hover:bg-purple-700 transition-colors">
                                حفظ المورد
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
