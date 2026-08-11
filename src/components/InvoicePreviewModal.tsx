import React, { useState, useEffect } from 'react';
import { getInvoiceHtml, printInvoice } from '../lib/printHelper';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { Download, Printer, X, MessageCircle, FileText, Smartphone } from 'lucide-react';
import { Share as CapacitorShare } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export const InvoicePreviewModal = ({ 
    invoice, 
    type, 
    items, 
    onClose,
    currency
}: { 
    invoice: any; 
    type: 'sale' | 'purchase' | 'quotation' | 'card_sale' | 'card_purchase'; 
    items: any[]; 
    onClose: () => void; 
    currency?: string;
}) => {
    const settings = useSettingsStore(state => state.settings);
    const appUser = useAuthStore(state => state.appUser);
    
    const [paperSize, setPaperSize] = useState<'A4' | 'Thermal80' | 'Thermal58'>(
        settings.printerPaperSize || 'A4'
    );
    const [html, setHtml] = useState<string>('');
    const [isSharing, setIsSharing] = useState(false);

    // If active currency is dollar '$' or undefined, default to 'ر.س' as requested
    let activeCurrency = currency || settings.currencySymbol || 'ر.س';
    if (activeCurrency === '$') {
        activeCurrency = 'ر.س';
    }

    // Resolve seller/employee name correctly
    let resolvedSellerName = invoice.sellerName || invoice.createdByName || invoice.userName || invoice.staffName || invoice.user;
    if (
        !resolvedSellerName || 
        resolvedSellerName === 'المستخدم المسجّل' || 
        (resolvedSellerName.length > 20 && !resolvedSellerName.includes(' ') && !resolvedSellerName.includes('@'))
    ) {
        resolvedSellerName = appUser?.name || appUser?.email || 'المستخدم';
    }

    const invoiceWithSeller = {
        ...invoice,
        sellerName: resolvedSellerName,
        createdByName: resolvedSellerName,
        userName: resolvedSellerName,
    };

    useEffect(() => {
        const fetchHtml = async () => {
            const generatedHtml = await getInvoiceHtml(invoiceWithSeller, type, items, true, activeCurrency, paperSize);
            setHtml(generatedHtml);
        };
        fetchHtml();
    }, [invoice, type, items, paperSize, activeCurrency, resolvedSellerName]);

    const handleDownloadHtml = async () => {
        try {
            const fileName = `invoice_${invoice.invoiceNumber || Date.now()}.html`;
            const fullHtml = await getInvoiceHtml(invoiceWithSeller, type, items, true, activeCurrency, paperSize);

            const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e: any) {
            console.error('Error downloading HTML:', e);
            alert('عذراً، تعذر تحميل ملف HTML: ' + e.message);
        }
    };

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result as string;
                const base64 = dataUrl.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    const generatePdfBlob = async (): Promise<{ blob: Blob; filename: string }> => {
        const fileName = `invoice_${invoice.invoiceNumber || Date.now()}.pdf`;
        const fullHtml = await getInvoiceHtml(invoiceWithSeller, type, items, true, activeCurrency, paperSize);
        
        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '0';
        
        const widthPx = paperSize === 'A4' ? 800 : paperSize === 'Thermal80' ? 380 : 280;
        tempDiv.style.width = `${widthPx}px`;
        tempDiv.style.backgroundColor = '#ffffff';
        tempDiv.style.padding = '0';
        tempDiv.style.margin = '0';
        
        tempDiv.innerHTML = fullHtml;
        document.body.appendChild(tempDiv);
        
        const images = tempDiv.getElementsByTagName('img');
        if (images.length > 0) {
            await Promise.all(
                Array.from(images).map(
                    (img) =>
                        new Promise<void>((resolve) => {
                            if (img.complete) resolve();
                            else {
                                img.onload = () => resolve();
                                img.onerror = () => resolve();
                            }
                        })
                )
            );
        }
        
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const canvas = await html2canvas(tempDiv, {
            scale: 1.5,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
        });
        
        document.body.removeChild(tempDiv);
        
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        
        let doc;
        if (paperSize === 'A4') {
            const pdfWidth = 210;
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [pdfWidth, pdfHeight < 297 ? 297 : pdfHeight],
            });
            doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        } else {
            const pdfWidth = paperSize === 'Thermal80' ? 80 : 58;
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [pdfWidth, pdfHeight],
            });
            doc.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        }
        
        return {
            blob: doc.output('blob'),
            filename: fileName,
        };
    };

    const handleSharePdf = async () => {
        try {
            setIsSharing(true);
            const { blob, filename } = await generatePdfBlob();
            const file = new File([blob], filename, { type: 'application/pdf' });

            // Try Capacitor Share for Android / iOS
            try {
                const base64 = await blobToBase64(blob);
                await Filesystem.writeFile({
                    path: filename,
                    data: base64,
                    directory: Directory.Cache,
                });

                const uri = await Filesystem.getUri({
                    directory: Directory.Cache,
                    path: filename,
                });

                await CapacitorShare.share({
                    title: 'مشاركة الفاتورة PDF',
                    text: 'الرجاء الاطلاع على الفاتورة المرفقة',
                    url: uri.uri,
                    dialogTitle: 'مشاركة الفاتورة PDF',
                });
                return;
            } catch (capErr) {
                // Browser share fallback
                if (navigator.share) {
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: 'مشاركة الفاتورة PDF',
                            text: 'الفاتورة المرفقة',
                        });
                        return;
                    }
                }
            }

            // Web download fallback if share is not supported
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            alert('تم تحميل الفاتورة كملف PDF بنجاح. يمكنك الآن مشاركتها وإرسالها يدوياً عبر واتساب.');
        } catch (e: any) {
            console.error('Error sharing PDF:', e);
            alert('عذراً، فشلت عملية مشاركة ملف PDF: ' + e.message);
        } finally {
            setIsSharing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-1 sm:p-3" onClick={onClose} dir="rtl">
            <div 
                className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl w-full max-w-4xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-150" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header Toolbar */}
                <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 py-2.5 sm:px-5 sm:py-3 flex flex-wrap items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                            <FileText size={18} />
                        </div>
                        <div>
                            <h3 className="font-black text-slate-900 dark:text-white text-xs sm:text-sm leading-tight">معاينة الفاتورة</h3>
                            <p className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                                #{invoice.invoiceNumber || '---'}
                            </p>
                        </div>
                    </div>

                    {/* Paper Size Switcher Tabs */}
                    <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        <button
                            type="button"
                            onClick={() => setPaperSize('A4')}
                            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition ${
                                paperSize === 'A4'
                                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-black'
                                    : 'hover:text-slate-900 dark:hover:text-white'
                             }`}
                        >
                            <FileText size={13} />
                            <span>A4</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaperSize('Thermal80')}
                            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition ${
                                paperSize === 'Thermal80'
                                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-black'
                                    : 'hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <Smartphone size={13} />
                            <span>حراري 80mm</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaperSize('Thermal58')}
                            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition ${
                                paperSize === 'Thermal58'
                                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm font-black'
                                    : 'hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <Smartphone size={13} />
                            <span>حراري 58mm</span>
                        </button>
                    </div>
                </div>
                
                {/* Scrollable Preview Area */}
                <div className="flex-1 overflow-auto bg-slate-300/80 dark:bg-slate-950 p-2 sm:p-4 flex justify-center items-start w-full">
                    <div 
                        className={`transition-all duration-200 flex justify-center ${
                            paperSize === 'A4' ? 'w-auto min-w-[820px]' : 'w-full max-w-[340px]'
                        }`} 
                    >
                        {html ? (
                            <iframe 
                                srcDoc={html} 
                                title="Invoice Preview"
                                className={`border-0 rounded-xl transition-all shadow-xl ${
                                    paperSize === 'A4' ? 'w-[820px] h-[1160px]' : 'w-full h-[550px]'
                                }`}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-[400px] text-slate-400 font-bold text-xs bg-white rounded-xl">
                                جاري تجهيز الفاتورة...
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom Action Icon Buttons */}
                <div className="p-2.5 sm:p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0 flex flex-wrap items-center gap-2">
                    {/* Print Button */}
                    <button 
                        onClick={() => printInvoice(invoiceWithSeller, type, items, activeCurrency, paperSize)}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition"
                        title="طباعة الفاتورة"
                    >
                        <Printer size={16} />
                        <span>طباعة</span>
                    </button>

                    {/* WhatsApp Share Button */}
                    <button 
                        onClick={handleSharePdf}
                        disabled={isSharing}
                        className="px-3.5 py-2 bg-green-600 hover:bg-green-700 active:scale-95 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                        title="مشاركة عبر واتساب كملف PDF"
                    >
                        <MessageCircle size={16} />
                        <span>{isSharing ? 'جاري التحضير...' : 'واتساب'}</span>
                    </button>

                    {/* Download HTML Button */}
                    <button 
                        onClick={handleDownloadHtml}
                        className="px-3.5 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white active:scale-95 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition"
                        title="تحميل كملف HTML"
                    >
                        <Download size={16} />
                        <span>تحميل</span>
                    </button>

                    {/* Close Button */}
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95"
                    >
                        <X size={16} />
                        <span>إغلاق</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
