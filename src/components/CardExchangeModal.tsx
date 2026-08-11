import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Printer, Download, Share2, MessageCircle, CheckCircle2, AlertTriangle, FileText, Smartphone } from 'lucide-react';
import { collection, doc, runTransaction, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';
import { CardCategory } from '../types/cardTypes';
import SearchableSelect from './SearchableSelect';
import { Share as CapacitorShare } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface CardExchangeModalProps {
    isOpen: boolean;
    onClose: () => void;
    categories: CardCategory[];
    onSuccess?: () => void;
}

export default function CardExchangeModal({ isOpen, onClose, categories, onSuccess }: CardExchangeModalProps) {
    const { appUser, hasPermission } = useAuthStore();
    const settings = useSettingsStore(state => state.settings);
    const { registerModal, unregisterModal } = useUIStore();

    useEffect(() => {
        if (isOpen) {
            registerModal('card-exchange');
        } else {
            unregisterModal('card-exchange');
        }
        return () => unregisterModal('card-exchange');
    }, [isOpen, registerModal, unregisterModal]);

    const tenantId = 'single_store';
    const staffName = appUser?.name || appUser?.email || 'المستخدم';

    // Form inputs
    const [sourceCategoryId, setSourceCategoryId] = useState<string>(''); // Category to ADD (Receive)
    const [sourceQty, setSourceQty] = useState<string>('1'); // Quantity to ADD
    const [targetCategoryId, setTargetCategoryId] = useState<string>(''); // Category to SUBTRACT (Give)
    const [notes, setNotes] = useState<string>('');

    // Processed calculations
    const [computedTargetQty, setComputedTargetQty] = useState<number>(0);
    const [remainderValue, setRemainderValue] = useState<number>(0);
    const [totalExchangeValue, setTotalExchangeValue] = useState<number>(0);

    // Flow state: 'form' | 'receipt'
    const [flowStep, setFlowStep] = useState<'form' | 'receipt'>('form');
    const [savedExchangeId, setSavedExchangeId] = useState<string>('');
    const [savedExchangeDoc, setSavedExchangeDoc] = useState<any>(null);
    const [saving, setSaving] = useState<boolean>(false);
    const [isSharing, setIsSharing] = useState<boolean>(false);

    const sourceCat = categories.find(c => c.id === sourceCategoryId);
    const targetCat = categories.find(c => c.id === targetCategoryId);

    // Calculate details in real-time
    useEffect(() => {
        const sQty = parseInt(sourceQty) || 0;
        if (!sourceCat || !targetCat || sQty <= 0) {
            setTotalExchangeValue(0);
            setComputedTargetQty(0);
            setRemainderValue(0);
            return;
        }

        const sourcePrice = sourceCat.retailPrice || 0;
        const targetPrice = targetCat.retailPrice || 0;

        const totalVal = sQty * sourcePrice;
        setTotalExchangeValue(totalVal);

        if (targetPrice > 0) {
            const rawTargetQty = totalVal / targetPrice;
            const floorTargetQty = Math.floor(rawTargetQty);
            setComputedTargetQty(floorTargetQty);
            
            // Remainder/difference in money
            const remainder = totalVal - (floorTargetQty * targetPrice);
            setRemainderValue(remainder);
        } else {
            setComputedTargetQty(0);
            setRemainderValue(0);
        }
    }, [sourceCategoryId, sourceQty, targetCategoryId, sourceCat, targetCat]);

    if (!isOpen) return null;

    // Save transaction
    const handleSaveExchange = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const canAddExchange = appUser?.role === 'admin' || 
            !appUser?.permissions || 
            !('cards_exchanges' in appUser.permissions) || 
            hasPermission('cards_exchanges', 'add');
            
        if (!canAddExchange) {
            alert('عذراً، ليس لديك صلاحية لإجراء عمليات استبدال الكروت.');
            return;
        }

        const sQty = parseInt(sourceQty) || 0;
        if (!sourceCategoryId || !targetCategoryId || sQty <= 0) {
            alert('الرجاء تعبئة كافة الحقول المطلوبة بشكل صحيح.');
            return;
        }

        if (sourceCategoryId === targetCategoryId) {
            alert('عذراً، لا يمكن استبدال الكروت من نفس الفئة.');
            return;
        }

        if (computedTargetQty <= 0) {
            alert('الكمية الناتجة للاستبدال يجب أن تكون أكبر من الصفر.');
            return;
        }

        // Warning about insufficient stock of the target category
        if (targetCat && (targetCat.availableCount || 0) < computedTargetQty) {
            const confirmProceed = window.confirm(
                `تحذير: رصيد الفئة المستبدل منها "${targetCat.name}" الحالي (${targetCat.availableCount || 0}) أقل من الكمية المطلوبة للسحب (${computedTargetQty}). هل تريد الاستمرار على أي حال؟`
            );
            if (!confirmProceed) return;
        }

        setSaving(true);

        try {
            const exchangeId = 'EXCH' + Date.now().toString().slice(-8);
            const dateObj = new Date();
            const dateStr = dateObj.toISOString().split('T')[0];
            const timeStr = dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            const timestamp = Date.now();

            await runTransaction(db, async (transaction) => {
                // Read current categories to ensure data consistency
                const sourceRef = doc(db, 'card_categories', sourceCategoryId);
                const targetRef = doc(db, 'card_categories', targetCategoryId);

                const sourceSnap = await transaction.get(sourceRef);
                const targetSnap = await transaction.get(targetRef);

                if (!sourceSnap.exists() || !targetSnap.exists()) {
                    throw new Error('إحدى فئات الكروت المحددة لم تعد موجودة.');
                }

                const sourceData = sourceSnap.data();
                const targetData = targetSnap.data();

                const newSourceStock = (sourceData.availableCount || 0) + sQty;
                const newTargetStock = (targetData.availableCount || 0) - computedTargetQty;

                // 1. Update stocks in categories
                transaction.update(sourceRef, {
                    availableCount: newSourceStock,
                    updatedAt: timestamp
                });

                transaction.update(targetRef, {
                    availableCount: newTargetStock,
                    updatedAt: timestamp
                });

                // 2. Add stock logs for Category A (Add stock)
                const logSourceRef = doc(collection(db, 'card_stock_logs'));
                transaction.set(logSourceRef, {
                    tenantId,
                    categoryId: sourceCategoryId,
                    categoryName: sourceData.name,
                    quantityAdded: sQty,
                    userName: staffName,
                    additionDate: `${dateStr} ${timeStr}`,
                    availableCountAfter: newSourceStock,
                    createdAt: timestamp,
                    notes: `استبدال كروت (سند #${exchangeId})`
                });

                // 3. Add stock logs for Category B (Subtract stock)
                const logTargetRef = doc(collection(db, 'card_stock_logs'));
                transaction.set(logTargetRef, {
                    tenantId,
                    categoryId: targetCategoryId,
                    categoryName: targetData.name,
                    quantityAdded: -computedTargetQty,
                    userName: staffName,
                    additionDate: `${dateStr} ${timeStr}`,
                    availableCountAfter: newTargetStock,
                    createdAt: timestamp,
                    notes: `استبدال كروت (سند #${exchangeId})`
                });

                // 4. Save exchange document
                const exchangeRef = doc(collection(db, 'card_exchanges'));
                const exchangeDocPayload = {
                    tenantId,
                    exchangeId,
                    date: timestamp,
                    exchangeDate: `${dateStr} ${timeStr}`,
                    sourceCategoryId,
                    sourceCategoryName: sourceData.name,
                    sourceQuantity: sQty,
                    sourcePrice: sourceData.retailPrice || 0,
                    targetCategoryId,
                    targetCategoryName: targetData.name,
                    targetQuantity: computedTargetQty,
                    targetPrice: targetData.retailPrice || 0,
                    totalValue: totalExchangeValue,
                    remainderValue,
                    userName: staffName,
                    notes: notes || ''
                };
                transaction.set(exchangeRef, exchangeDocPayload);

                // Set state inside transaction context to show on Screen 2
                setSavedExchangeDoc(exchangeDocPayload);
            });

            setSavedExchangeId(exchangeId);
            setFlowStep('receipt');
            if (onSuccess) onSuccess();
        } catch (error) {
            console.error('Error saving card exchange:', error);
            handleFirestoreError(error, OperationType.WRITE, 'card_exchanges');
        } finally {
            setSaving(false);
        }
    };

    // Printing function
    const handlePrintReceipt = () => {
        if (!savedExchangeDoc) return;
        
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.width = '0px';
        iframe.style.height = '0px';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const docStream = iframe.contentWindow?.document;
        if (docStream) {
            const paperSize = settings.printerPaperSize || 'A4';
            const htmlContent = getExchangeReceiptHtml(savedExchangeDoc, paperSize);
            docStream.write(htmlContent);
            docStream.close();

            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(() => document.body.removeChild(iframe), 1200);
            }, 300);
        }
    };

    // Share / PDF generation
    const handleShareReceiptPdf = async () => {
        if (!savedExchangeDoc) return;

        try {
            setIsSharing(true);
            const fileName = `exchange_${savedExchangeDoc.exchangeId}.pdf`;
            const paperSize = settings.printerPaperSize || 'A4';
            const fullHtml = getExchangeReceiptHtml(savedExchangeDoc, paperSize);

            // Create temporary rendering div
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '0';
            
            const widthPx = paperSize === 'A4' ? 800 : paperSize === 'Thermal80' ? 380 : 280;
            tempDiv.style.width = `${widthPx}px`;
            tempDiv.style.backgroundColor = '#ffffff';
            tempDiv.style.padding = '15px';
            tempDiv.style.margin = '0';
            
            tempDiv.innerHTML = fullHtml;
            document.body.appendChild(tempDiv);
            
            // Allow images to load
            await new Promise((resolve) => setTimeout(resolve, 400));
            
            const canvas = await html2canvas(tempDiv, {
                scale: 1.5,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
            });
            
            document.body.removeChild(tempDiv);
            
            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            let docPdf;
            
            if (paperSize === 'A4') {
                const pdfWidth = 210;
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                docPdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: [pdfWidth, pdfHeight < 297 ? 297 : pdfHeight],
                });
                docPdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            } else {
                const pdfWidth = paperSize === 'Thermal80' ? 80 : 58;
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                docPdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: [pdfWidth, pdfHeight],
                });
                docPdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            }
            
            const pdfBlob = docPdf.output('blob');
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

            // Try Capacitor Share
            try {
                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve, reject) => {
                    reader.onloadend = () => {
                        const dataUrl = reader.result as string;
                        const base64 = dataUrl.split(',')[1];
                        resolve(base64);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(pdfBlob);
                });

                const base64 = await base64Promise;
                await Filesystem.writeFile({
                    path: fileName,
                    data: base64,
                    directory: Directory.Cache,
                });

                const uri = await Filesystem.getUri({
                    directory: Directory.Cache,
                    path: fileName,
                });

                await CapacitorShare.share({
                    title: 'مشاركة سند استبدال كروت',
                    text: `سند استبدال كروت رقم ${savedExchangeDoc.exchangeId}`,
                    url: uri.uri,
                    dialogTitle: 'مشاركة السند PDF',
                });
                return;
            } catch (capErr) {
                // Browser share fallback
                if (navigator.share) {
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: 'مشاركة سند الاستبدال PDF',
                            text: `مرفق سند استبدال كروت رقم ${savedExchangeDoc.exchangeId}`,
                        });
                        return;
                    }
                }
            }

            // Web download fallback
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            alert('تم تنزيل سند الاستبدال PDF بنجاح. يمكنك الآن مشاركته وإرساله يدوياً.');
        } catch (err: any) {
            console.error('Error generating/sharing exchange PDF:', err);
            alert('فشل توليد أو مشاركة ملف PDF: ' + err.message);
        } finally {
            setIsSharing(false);
        }
    };

    // Render receipt html
    const getExchangeReceiptHtml = (data: any, paperSize: string) => {
        const logoUrl = settings.businessLogoUrl || '';
        const name = settings.businessName || 'المتجر الرقمي';
        const phone = settings.businessPhone || '';
        const address = settings.businessAddress || '';
        const isThermal = paperSize === 'Thermal80' || paperSize === 'Thermal58';
        const resolvedUser = data.userName || data.staffName || appUser?.name || appUser?.email || 'المستخدم';

        return `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: 'system-ui', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        margin: 0;
                        padding: ${isThermal ? '10px 5px' : '20px'};
                        color: #1e293b;
                        background-color: #ffffff;
                        font-size: ${isThermal ? '11px' : '14px'};
                        line-height: 1.4;
                    }
                    .header {
                        text-align: center;
                        border-bottom: 2px dashed #cbd5e1;
                        padding-bottom: 15px;
                        margin-bottom: 15px;
                    }
                    .logo {
                        max-height: 60px;
                        max-width: 120px;
                        margin-bottom: 8px;
                        object-fit: contain;
                    }
                    .title {
                        font-size: ${isThermal ? '15px' : '20px'};
                        font-weight: 900;
                        margin: 5px 0;
                        color: #0f172a;
                    }
                    .meta-info {
                        margin-bottom: 15px;
                    }
                    .meta-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 4px;
                    }
                    .meta-label {
                        color: #64748b;
                        font-weight: bold;
                    }
                    .meta-value {
                        font-weight: 800;
                        color: #0f172a;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 15px 0;
                    }
                    th {
                        background-color: #f1f5f9;
                        color: #475569;
                        font-weight: 900;
                        text-align: right;
                        padding: 8px 5px;
                        border-bottom: 2px solid #cbd5e1;
                    }
                    td {
                        padding: 8px 5px;
                        border-bottom: 1px solid #e2e8f0;
                    }
                    .total-section {
                        border-top: 2px dashed #cbd5e1;
                        padding-top: 10px;
                        margin-top: 15px;
                    }
                    .total-row {
                        display: flex;
                        justify-content: space-between;
                        font-weight: bold;
                        margin-bottom: 5px;
                    }
                    .total-value-grand {
                        font-size: ${isThermal ? '14px' : '18px'};
                        font-weight: 900;
                        color: #4f46e5;
                    }
                    .footer-text {
                        text-align: center;
                        margin-top: 30px;
                        color: #94a3b8;
                        font-size: ${isThermal ? '9px' : '12px'};
                        border-top: 1px solid #f1f5f9;
                        padding-top: 10px;
                    }
                    .badge-in {
                        color: #059669;
                        background-color: #ecfdf5;
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-weight: 800;
                    }
                    .badge-out {
                        color: #dc2626;
                        background-color: #fef2f2;
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-weight: 800;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="Logo">` : ''}
                    <div style="font-weight: 900; font-size: ${isThermal ? '13px' : '16px'}; color: #475569;">${name}</div>
                    <div class="title">سند استبدال كروت مالي</div>
                    ${phone ? `<div style="font-size: 11px; color: #64748b;" dir="ltr">${phone}</div>` : ''}
                    ${address ? `<div style="font-size: 11px; color: #64748b;">${address}</div>` : ''}
                </div>

                <div class="meta-info">
                    <div class="meta-row">
                        <span class="meta-label">رقم السند:</span>
                        <span class="meta-value">#${data.exchangeId}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">التاريخ والوقت:</span>
                        <span class="meta-value">${data.exchangeDate}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">اسم المستخدم:</span>
                        <span class="meta-value">${resolvedUser}</span>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>نوع العملية</th>
                            <th>فئة الكارت</th>
                            <th style="text-align: center;">الكمية</th>
                            <th style="text-align: left;">القيمة</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><span class="badge-in">وارد (إضافة)</span></td>
                            <td><b>${data.sourceCategoryName}</b></td>
                            <td style="text-align: center; color: #059669;">+${data.sourceQuantity}</td>
                            <td style="text-align: left;">${(data.sourceQuantity * data.sourcePrice).toLocaleString('en-US', { minimumFractionDigits: 2 })} ريال يمني</td>
                        </tr>
                        <tr>
                            <td><span class="badge-out">صادر (سحب)</span></td>
                            <td><b>${data.targetCategoryName}</b></td>
                            <td style="text-align: center; color: #dc2626;">-${data.targetQuantity}</td>
                            <td style="text-align: left;">${(data.targetQuantity * data.targetPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })} ريال يمني</td>
                        </tr>
                    </tbody>
                </table>

                <div class="total-section">
                    <div class="total-row">
                        <span>إجمالي قيمة الكروت الواردة:</span>
                        <span dir="ltr">${data.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} ريال يمني</span>
                    </div>
                    <div class="total-row">
                        <span>إجمالي قيمة الكروت الصادرة:</span>
                        <span dir="ltr">${(data.targetQuantity * data.targetPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })} ريال يمني</span>
                    </div>
                    <div class="total-row" style="border-top: 1px dotted #cbd5e1; padding-top: 5px; margin-top: 5px;">
                        <span>الفارق النقدي المتبقي (كسر):</span>
                        <span dir="ltr" style="font-weight: 900; color: #b45309;">${data.remainderValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} ريال يمني</span>
                    </div>
                    <div class="total-row" style="font-size: 1.1em; margin-top: 8px;">
                        <span>القيمة الصافية للحركة:</span>
                        <span dir="ltr" class="total-value-grand">${data.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} ريال يمني</span>
                    </div>
                </div>

                ${data.notes ? `
                    <div style="margin-top: 15px; padding: 8px; background-color: #f8fafc; border-radius: 8px; border-right: 3px solid #64748b;">
                        <span style="font-weight: bold; color: #475569; display: block; margin-bottom: 3px;">ملاحظات:</span>
                        <span style="color: #334155;">${data.notes}</span>
                    </div>
                ` : ''}

                <div class="footer-text">
                    سند إلكتروني موثق من نظام المبيعات والمخازن. شكراً لتعاملكم معنا.
                </div>
            </body>
            </html>
        `;
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-fade-in" dir="rtl">
            <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] animate-in zoom-in duration-150">
                
                {/* Header */}
                <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5 py-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                            <RefreshCw size={20} className={saving ? "animate-spin" : ""} />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900 dark:text-white text-sm sm:text-base">استبدال كروت المخزون</h3>
                            <p className="text-[10px] font-bold text-slate-400">نقل متبادل وتعديل الأرصدة تلقائياً مع حساب الفارق</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {flowStep === 'receipt' && (
                            <>
                                <button
                                    type="button"
                                    onClick={handlePrintReceipt}
                                    title="طباعة السند"
                                    className="w-8 h-8 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition active:scale-95"
                                >
                                    <Printer size={16} />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleShareReceiptPdf}
                                    disabled={isSharing}
                                    title="مشاركة السند (واتساب)"
                                    className="w-8 h-8 rounded-lg bg-green-50 hover:bg-green-100 dark:bg-green-950/60 dark:hover:bg-green-900/60 text-green-600 dark:text-green-400 flex items-center justify-center transition active:scale-95 disabled:opacity-50"
                                >
                                    <MessageCircle size={16} />
                                </button>
                            </>
                        )}
                        <button 
                            type="button"
                            onClick={onClose} 
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition active:scale-95"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {flowStep === 'form' ? (
                    <form onSubmit={handleSaveExchange} className="flex-1 overflow-auto p-5 space-y-4">
                        
                        {/* 1. Receive Category (The one we WANT to ADD stock) */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
                                الفئة المطلوب زيادتها (الواردة إلى المخزن) <span className="text-red-500">*</span>
                            </label>
                            <SearchableSelect
                                placeholder="اختر الفئة التي تشتي تزودها..."
                                options={categories.map(c => ({ id: c.id, label: `${c.name} - (السعر: ${c.retailPrice} ريال يمني) - متوفر: ${c.availableCount}` }))}
                                value={sourceCategoryId}
                                onChange={setSourceCategoryId}
                                required
                            />
                        </div>

                        {/* 2. Source Quantity */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
                                العدد المطلوب إضافته <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                min="1"
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                                value={sourceQty}
                                onChange={e => setSourceQty(e.target.value)}
                                placeholder="أدخل العدد حبات..."
                                required
                            />
                        </div>

                        {/* 3. Give Category (The one we WANT to SUBTRACT stock) */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-black text-slate-700 dark:text-slate-300">
                                الفئة المستبدل منها (التي ستنقص من المخزن) <span className="text-red-500">*</span>
                            </label>
                            <SearchableSelect
                                placeholder="اختر الفئة التي سيتم الخصم منها..."
                                options={categories.map(c => ({ id: c.id, label: `${c.name} - (السعر: ${c.retailPrice} ريال يمني) - متوفر: ${c.availableCount}` }))}
                                value={targetCategoryId}
                                onChange={setTargetCategoryId}
                                required
                            />
                        </div>

                        {/* Math & Visual Breakdown */}
                        {sourceCat && targetCat && (
                            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 space-y-3 font-bold animate-in fade-in duration-200 text-xs text-slate-700 dark:text-slate-300">
                                <h4 className="text-slate-900 dark:text-white font-black border-b border-slate-200 dark:border-slate-700 pb-1.5 mb-1 text-xs">ملخص حساب الفارق المالي</h4>
                                
                                <div className="flex justify-between">
                                    <span>سعر الفئة الأولى (التجزئة):</span>
                                    <span>{sourceCat.retailPrice} ريال</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>سعر الفئة المستبدل بها (التجزئة):</span>
                                    <span>{targetCat.retailPrice} ريال</span>
                                </div>
                                <div className="flex justify-between border-t border-dashed border-slate-200 dark:border-slate-700 pt-1.5">
                                    <span>إجمالي القيمة التقديرية للاستبدال:</span>
                                    <span className="text-indigo-600 dark:text-indigo-400 font-black">{totalExchangeValue.toLocaleString()} ريال</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>الكمية الناتجة (التي سيتم خصمها تلقائياً):</span>
                                    <span className="text-rose-600 dark:text-rose-400 font-black">{computedTargetQty} حبة</span>
                                </div>
                                {remainderValue > 0 && (
                                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                                        <span>الفارق النقدي المتبقي (كسور):</span>
                                        <span>{remainderValue.toLocaleString()} ريال</span>
                                    </div>
                                )}

                                <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-3 space-y-1.5 text-[11px]">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span>الفئة وارد <b>{sourceCat.name}</b>: {sourceCat.availableCount} ← <span className="text-emerald-600 font-black">{sourceCat.availableCount + (parseInt(sourceQty) || 0)} كارت</span></span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-rose-500" />
                                        <span>الفئة صادر <b>{targetCat.name}</b>: {targetCat.availableCount} ← <span className="text-rose-600 font-black">{targetCat.availableCount - computedTargetQty} كارت</span></span>
                                    </div>
                                </div>

                                {targetCat.availableCount < computedTargetQty && (
                                    <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 p-2.5 rounded-xl flex items-start gap-2 border border-amber-200 dark:border-amber-900/40 text-[10px] mt-2">
                                        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                                        <span>تحذير: رصيد الفئة صادر ({targetCat.availableCount}) غير كافٍ. سيصبح رصيدها سالباً بعد التثبيت.</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Notes input */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-black text-slate-700 dark:text-slate-300">ملاحظات إضافية</label>
                            <textarea
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none h-16"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="سبب الاستبدال أو اسم المستفيد..."
                            />
                        </div>

                        {/* Action buttons */}
                        <div className="pt-3 flex gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black text-xs rounded-xl transition active:scale-95"
                            >
                                إلغاء
                            </button>
                            <button
                                type="submit"
                                disabled={saving || !sourceCategoryId || !targetCategoryId || computedTargetQty <= 0}
                                className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 active:scale-95 text-white font-black text-xs rounded-xl shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 transition"
                            >
                                <CheckCircle2 size={16} />
                                <span>{saving ? "جاري الحفظ والتعديل..." : "تأكيد واستبدال الكروت"}</span>
                            </button>
                        </div>
                    </form>
                ) : (
                    /* Receipt Screen */
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="p-4 flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 flex flex-col items-center gap-3">
                            
                            {/* Compact Success Banner Card */}
                            <div className="flex items-center text-right gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 w-full shadow-sm shrink-0">
                                <div className="w-9 h-9 shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                                    <CheckCircle2 size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-black text-slate-900 dark:text-white text-xs">تم تنفيذ عملية الاستبدال بنجاح!</h4>
                                    <p className="text-[10px] font-bold text-slate-400 truncate mt-0.5">سند رقم #{savedExchangeId} • بواسطة {savedExchangeDoc?.userName || staffName} • تم تعديل أرصدة الفئات وحفظ العملية</p>
                                </div>
                            </div>

                            {/* Ticket Preview Iframe Container - Expanded to take up full available space */}
                            <div className="w-full flex-1 min-h-[380px] bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col">
                                {savedExchangeDoc && (
                                    <iframe
                                        srcDoc={getExchangeReceiptHtml(savedExchangeDoc, settings.printerPaperSize || 'Thermal80')}
                                        title="Exchange Receipt Preview"
                                        className="w-full flex-1 border-none min-h-[380px]"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
