import React, { useRef, useState } from 'react';
import { X, Database, Archive, FileText, Download } from 'lucide-react';
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
import { logUserAction } from '../lib/logger';
import { generateImportReportPdf } from '../lib/pdfHelper';

interface DataOperationsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface ImportReport {
    isOpen: boolean;
    total: number;
    added: number;
    skipped: number;
    updated: number;
    addedDetails: string[];
    skippedDetails: string[];
    updatedDetails: string[];
}

export default function DataOperationsModal({ isOpen, onClose }: DataOperationsModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const zipInputRef = useRef<HTMLInputElement>(null);
    const { settings } = useSettingsStore();
    const { start, update, finish, show } = useProgressStore();
    const isProcessing = show;

    // Report state
    const [report, setReport] = useState<ImportReport | null>(null);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

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
                const arrayBuffer = evt.target?.result as ArrayBuffer;
                const dataArray = new Uint8Array(arrayBuffer);
                const wb = XLSX.read(dataArray, { type: 'array' });
                if (!wb.SheetNames || wb.SheetNames.length === 0) {
                    alert("ملف الإكسل فارغ ولا يحتوي على صفحات بيانات");
                    return;
                }
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
                
                if (data && data.length > 0) {
                    const allKeys = new Set<string>();
                    data.forEach((row: any) => {
                        Object.keys(row).forEach(k => {
                            if (k && !k.startsWith('__EMPTY')) {
                                allKeys.add(k.trim());
                            }
                        });
                    });
                    const headers = Array.from(allKeys);
                    if (headers.length > 0) {
                        setMapperState({ isOpen: true, headers, rows: data });
                    } else {
                        alert("لم يتم العثور على عناوين أعمدة صالحة في ملف الإكسل");
                    }
                } else {
                    alert("الملف فارغ أو لا يحتوي على أسطر بيانات");
                }
            } catch (err: any) {
                console.error("Import error", err);
                alert("حدث خطأ أثناء قراءة الملف: " + (err?.message || "يرجى التأكد من اختيار ملف Excel صحيح"));
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const processMappedImport = async (mappedData: any[]) => {
        const appUser = useAuthStore.getState().appUser;
        const tenantId = appUser?.tenantId || 'single_store';

        setMapperState(prev => ({ ...prev, isOpen: false }));
        start(mappedData.length, "جاري استيراد المنتجات...");
        
        let addedCount = 0;
        let skippedCount = 0;
        let updatedCount = 0;

        const addedDetails: string[] = [];
        const skippedDetails: string[] = [];
        const updatedDetails: string[] = [];

        try {
            // Fetch existing products to check for duplicates by Name and Barcode
            const existingProductsMap = new Map<string, { id: string; name: string; price: number; quantity: number; cost: number; barcode: string; category: string }>();
            const existingProductsByBarcode = new Map<string, { id: string; name: string; price: number; quantity: number; cost: number; barcode: string; category: string }>();
            
            const prodSnapshot = await getDocs(query(collection(db, 'products'), where('tenantId', '==', tenantId)));
            prodSnapshot.forEach(docSnap => {
                const data = docSnap.data();
                const nameKey = String(data.name || '').toLowerCase().trim();
                const barcodeKey = String(data.barcode || '').trim();
                
                const productObj = {
                    id: docSnap.id,
                    name: String(data.name || ''),
                    price: parseFloat(data.price) || 0,
                    quantity: parseInt(data.quantity) || 0,
                    cost: parseFloat(data.cost) || 0,
                    barcode: barcodeKey,
                    category: String(data.category || 'General')
                };

                if (nameKey) {
                    existingProductsMap.set(nameKey, productObj);
                }
                if (barcodeKey) {
                    existingProductsByBarcode.set(barcodeKey, productObj);
                }
            });

            const batchSize = 500;
            let batch = writeBatch(db);
            let batchCount = 0;

            for (let i = 0; i < mappedData.length; i++) {
                const row = mappedData[i];
                try {
                    const name = String(row.name || 'بدون اسم').trim();
                    const barcode = String(row.barcode || '').trim();
                    const price = parseFloat(row.price) || 0;
                    const cost = parseFloat(row.cost) || 0;
                    const quantity = parseInt(row.quantity) || 0;
                    const category = String(row.category || 'General');

                    const nameKey = name.toLowerCase();
                    const barcodeKey = barcode;
                    
                    // Match by barcode first if available, then by name
                    const existingByBarcode = barcodeKey ? existingProductsByBarcode.get(barcodeKey) : null;
                    const existingByName = existingProductsMap.get(nameKey);
                    const existing = existingByBarcode || existingByName;

                    if (existing) {
                        // Product already exists with same name or barcode: skip/bypass without error or duplication
                        skippedCount++;
                        skippedDetails.push(`المنتج "${name}" (تم التجاوز: اسم المنتج أو الباركود موجود مسبقاً في النظام)`);
                    } else {
                        // Brand new product
                        const newProd = {
                            name: name,
                            barcode: barcode || Math.random().toString().substring(2, 10),
                            price,
                            cost,
                            quantity,
                            category,
                            lowStockAlert: 5,
                            tenantId,
                            createdAt: Date.now()
                        };

                        const docRef = doc(collection(db, 'products'));
                        batch.set(docRef, newProd);

                        addedDetails.push(`المنتج "${name}" (السعر: ${price} ر.س | الكمية: ${quantity})`);

                        // Update local maps to prevent duplication within the same Excel sheet
                        const newProdObj = {
                            id: docRef.id,
                            name,
                            price,
                            quantity,
                            cost,
                            barcode: newProd.barcode,
                            category
                        };
                        existingProductsMap.set(nameKey, newProdObj);
                        if (newProd.barcode) {
                            existingProductsByBarcode.set(newProd.barcode, newProdObj);
                        }

                        addedCount++;
                        batchCount++;
                    }

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

            // Log import action
            await logUserAction('استيراد منتجات', `استيراد ${addedCount} جديد، تحديث ${updatedCount}، تجاوز ${skippedCount} مكرر متطابق`);

            // Save results to report state to show beautiful report UI
            setReport({
                isOpen: true,
                total: mappedData.length,
                added: addedCount,
                skipped: skippedCount,
                updated: updatedCount,
                addedDetails,
                skippedDetails,
                updatedDetails
            });

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
            
            {report && report.isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/65 z-[60] flex items-center justify-center p-4 backdrop-blur-sm"
                    dir="rtl"
                >
                    <motion.div
                        initial={{ scale: 0.95 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0.95 }}
                        className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh]"
                    >
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100 dark:border-slate-800">
                            <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <Database className="text-emerald-600" size={24} />
                                تقرير استيراد المنتجات
                            </h2>
                            <button 
                                onClick={() => setReport(null)} 
                                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"
                            >
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        {/* Summary Grid */}
                        <div className="grid grid-cols-4 gap-3 mb-6">
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl text-center">
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">إجمالي السجلات</div>
                                <div className="text-xl font-bold text-gray-800 dark:text-white mt-1">{report.total}</div>
                            </div>
                            <div className="bg-emerald-50 dark:bg-emerald-950/30 p-3 rounded-xl text-center">
                                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">المنتجات المضافة</div>
                                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{report.added}</div>
                            </div>
                            <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl text-center">
                                <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">المنتجات المحدثة</div>
                                <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{report.updated}</div>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-xl text-center">
                                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">تم تجاوزها (تطابق)</div>
                                <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">{report.skipped}</div>
                            </div>
                        </div>

                        {/* Details Lists with scrolling */}
                        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                            {report.updatedDetails.length > 0 && (
                                <div>
                                    <h4 className="font-bold text-amber-700 dark:text-amber-400 mb-2 text-sm flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                        المنتجات المحدثة ({report.updatedDetails.length}):
                                    </h4>
                                    <ul className="bg-amber-50/50 dark:bg-amber-950/10 rounded-xl p-3 text-xs space-y-1.5 text-amber-900 dark:text-amber-300 border border-amber-100/50 dark:border-amber-950/30 max-h-48 overflow-y-auto">
                                        {report.updatedDetails.map((detail, idx) => (
                                            <li key={idx} className="list-disc list-inside">{detail}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {report.addedDetails.length > 0 && (
                                <div>
                                    <h4 className="font-bold text-emerald-700 dark:text-emerald-400 mb-2 text-sm flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                        المنتجات الجديدة المضافة ({report.addedDetails.length}):
                                    </h4>
                                    <ul className="bg-emerald-50/50 dark:bg-emerald-950/10 rounded-xl p-3 text-xs space-y-1.5 text-emerald-900 dark:text-emerald-300 border border-emerald-100/50 dark:border-emerald-950/30 max-h-48 overflow-y-auto">
                                        {report.addedDetails.map((detail, idx) => (
                                            <li key={idx} className="list-disc list-inside">{detail}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {report.skippedDetails.length > 0 && (
                                <div>
                                    <h4 className="font-bold text-blue-700 dark:text-blue-400 mb-2 text-sm flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                        منتجات تم تجاوزها لتطابقها التام ({report.skippedDetails.length}):
                                    </h4>
                                    <ul className="bg-blue-50/50 dark:bg-blue-950/10 rounded-xl p-3 text-xs space-y-1.5 text-blue-900 dark:text-blue-300 border border-blue-100/50 dark:border-blue-950/30 max-h-48 overflow-y-auto">
                                        {report.skippedDetails.map((detail, idx) => (
                                            <li key={idx} className="list-disc list-inside">{detail}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
                            <button
                                onClick={async () => {
                                    if (!report) return;
                                    setIsDownloadingPdf(true);
                                    try {
                                        const { download } = await generateImportReportPdf({
                                            title: 'تقرير استيراد المنتجات وملخص التجاوزات',
                                            total: report.total,
                                            added: report.added,
                                            skipped: report.skipped,
                                            updated: report.updated,
                                            addedDetails: report.addedDetails,
                                            skippedDetails: report.skippedDetails,
                                            updatedDetails: report.updatedDetails
                                        });
                                        download();
                                    } catch (err) {
                                        console.error('PDF error', err);
                                        alert('حدث خطأ أثناء إنشاء ملف PDF');
                                    } finally {
                                        setIsDownloadingPdf(false);
                                    }
                                }}
                                disabled={isDownloadingPdf}
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition duration-200 flex items-center gap-2 text-sm shadow-sm cursor-pointer"
                            >
                                <FileText size={18} />
                                <span>{isDownloadingPdf ? 'جاري إنشاء PDF...' : 'تحميل التقرير PDF'}</span>
                            </button>

                            <button
                                onClick={() => setReport(null)}
                                className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition duration-200 text-sm cursor-pointer"
                            >
                                إغلاق التقرير
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
                       { key: 'barcode', label: 'رقم المنتج (الباركود)' },
                       { key: 'name', label: 'اسم المنتج', required: true },
                       { key: 'price', label: 'سعر البيع', required: true },
                       { key: 'cost', label: 'سعر الشراء (التكلفة)' },
                       { key: 'quantity', label: 'الكمية' },
                       { key: 'category', label: 'التصنيف' },
                       ...(settings.isExpiryTrackingEnabled ? [{ key: 'expiryDate', label: 'تاريخ الانتهاء' }] : [])
                   ]}
               />
            )}
        </AnimatePresence>
    );
}
