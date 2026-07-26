import React, { useRef, useState } from 'react';
import { X, Database, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import ImportMapper from './ImportMapper';
import { restoreFromBackupData, BackupData } from '../lib/backupService';
import { useSettingsStore } from '../store/settingsStore';
import { useProgressStore } from '../store/progressStore';
import { collection, addDoc, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';

interface DataOperationsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function DataOperationsModal({ isOpen, onClose }: DataOperationsModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const zipInputRef = useRef<HTMLInputElement>(null);
    const { settings } = useSettingsStore();
    const { start, update, finish, show } = useProgressStore();
    const isProcessing = show;

    // Mapping state
    const [mapperState, setMapperState] = useState<{ isOpen: boolean; headers: string[]; rows: any[] }>({
        isOpen: false,
        headers: [],
        rows: []
    });

    const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
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
        reader.readAsBinaryString(file);
    };

    const processMappedImport = async (mappedData: any[]) => {
        const appUser = useAuthStore.getState().appUser;
        const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');

        setMapperState(prev => ({ ...prev, isOpen: false }));
        start(mappedData.length, "جاري استيراد المنتجات...");
        let imported = 0;
        let skipped = 0;

        try {
            // Fetch existing products to check for duplicates
            const existingNames = new Set<string>();
            const existingBarcodes = new Set<string>();
            const prodSnapshot = await getDocs(query(collection(db, 'products'), where('tenantId', '==', tenantId)));
            prodSnapshot.forEach(doc => {
                existingNames.add(doc.data().name.toLowerCase());
                if(doc.data().barcode) existingBarcodes.add(String(doc.data().barcode).toLowerCase());
            });

            const batchSize = 500;
            let batch = writeBatch(db);
            let batchCount = 0;

            for (let i = 0; i < mappedData.length; i++) {
                const row = mappedData[i];
                try {
                    const name = String(row.name || 'بدون اسم');
                    const barcode = String(row.barcode || '');
                    
                    if (existingNames.has(name.toLowerCase()) || (barcode && existingBarcodes.has(barcode.toLowerCase()))) {
                        skipped++;
                        continue;
                    }

                    const newProd = {
                        name: name,
                        barcode: barcode || Math.random().toString().substring(2, 10),
                        price: parseFloat(row.price) || 0,
                        cost: parseFloat(row.cost) || 0,
                        quantity: parseInt(row.quantity) || 0,
                        category: String(row.category || 'General'),
                        lowStockAlert: 5,
                        tenantId,
                        createdAt: Date.now()
                    };

                    const docRef = doc(collection(db, 'products'));
                    batch.set(docRef, newProd);

                    existingNames.add(name.toLowerCase());
                    if (newProd.barcode) existingBarcodes.add(newProd.barcode.toLowerCase());
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
                update(i + 1);
            }

            if (batchCount > 0) {
                await batch.commit();
            }

            alert(`تم استيراد ${imported} منتج بنجاح. وتم تجاوز ${skipped} منتج متكرر.`);
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء الحفظ");
        } finally {
            finish();
        }
    };

    const handleRestoreZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        start(1, "جاري استعادة البيانات...");
        try {
            const zip = new JSZip();
            const contents = await zip.loadAsync(file);
            
            const jsonFile = Object.values(contents.files).find(f => f.name.endsWith('.json'));
            
            if (!jsonFile) {
                alert("لم يتم العثور على ملف نسخ احتياطي (JSON) داخل الملف المضغوط");
                return;
            }

            const jsonStr = await jsonFile.async('string');
            const data = JSON.parse(jsonStr) as BackupData;
            
            update(0.5);
            const ok = await restoreFromBackupData(data);
            if (ok) {
                alert("تمت استعادة البيانات بنجاح!");
                window.location.reload();
            } else {
                alert("فشلت عملية الاستعادة");
            }
        } catch (err) {
            console.error("Zip restore failed", err);
            alert("حدث خطأ أثناء فك أو معالجة الملف المضغوط");
        } finally {
            finish();
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
                    onClick={onClose}
                    dir="rtl"
                >
                    <motion.div
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.95 }}
                        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-black text-text-main">الاستعادة والاسترداد</h2>
                            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20} /></button>
                        </div>
                        
                        <div className="space-y-4">
                            <input type="file" className="hidden" ref={fileInputRef} accept=".xlsx, .xls" onChange={handleImportExcel} />
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isProcessing}
                                className="w-full bg-emerald-50 dark:bg-emerald-950 p-4 rounded-xl flex items-center gap-4 hover:border-emerald-300 border border-transparent transition"
                            >
                                <Database className="text-emerald-600" size={24} />
                                <div className="text-right">
                                    <h3 className="font-bold text-emerald-900 dark:text-emerald-100">استيراد منتجات من ملف Excel</h3>
                                    <p className="text-xs text-emerald-700 dark:text-emerald-300">مطابقة تلقائية (باركود، اسم، سعر، تكلفة، كمية)</p>
                                </div>
                            </button>
                            
                            <input type="file" className="hidden" ref={zipInputRef} accept=".zip" onChange={handleRestoreZip} />
                            <button 
                                onClick={() => zipInputRef.current?.click()}
                                disabled={isProcessing}
                                className="w-full bg-blue-50 dark:bg-blue-950 p-4 rounded-xl flex items-center gap-4 hover:border-blue-300 border border-transparent transition"
                            >
                                <Archive className="text-blue-600" size={24} />
                                <div className="text-right">
                                    <h3 className="font-bold text-blue-900 dark:text-blue-100">استعادة بيانات من ملف مضغوط (ZIP)</h3>
                                    <p className="text-xs text-blue-700 dark:text-blue-300">استعادة كاملة لقاعدة البيانات من أرشيف</p>
                                </div>
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
            
            {mapperState.isOpen && (
               <ImportMapper 
                   isOpen={mapperState.isOpen}
                   onClose={() => setMapperState(prev => ({...prev, isOpen: false}))}
                   onImport={processMappedImport}
                   headers={mapperState.headers}
                   rows={mapperState.rows}
                   fields={[
                       { key: 'barcode', label: 'رقم المنتج (الباركود)', required: true },
                       { key: 'name', label: 'اسم المنتج', required: true },
                       { key: 'price', label: 'سعر البيع', required: true },
                       { key: 'cost', label: 'سعر الشراء (التكلفة)', required: true },
                       { key: 'quantity', label: 'الكمية' },
                       { key: 'category', label: 'التصنيف' },
                       ...(settings.isExpiryTrackingEnabled ? [{ key: 'expiryDate', label: 'تاريخ الانتهاء' }] : [])
                   ]}
               />
            )}
        </AnimatePresence>
    );
}
