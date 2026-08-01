import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Printer, Share2, X, CheckCircle2, Loader2 } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share as CapacitorShare } from '@capacitor/share';
import { generateInvoicePdf, InvoicePdfInput } from '../lib/pdfHelper';

interface CardInvoiceActionModalProps {
    isOpen: boolean;
    invoice: InvoicePdfInput | null;
    onClose: () => void;
}

export const CardInvoiceActionModal: React.FC<CardInvoiceActionModalProps> = ({
    isOpen,
    invoice,
    onClose,
}) => {
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen || !invoice) return null;

    const getBlob = async (): Promise<{ blob: Blob; filename: string }> => {
        const { blob, filename } = await generateInvoicePdf(invoice);
        return { blob, filename };
    };

    const handlePrint = async () => {
        try {
            setIsLoading(true);
            const { blob, filename } = await getBlob();
            
            // Create a file URL and open it in a new window/tab for printing/viewing
            const fileURL = URL.createObjectURL(blob);
            
            // For standard browsers, opening the PDF in a new tab allows printing natively
            const printWindow = window.open(fileURL, '_blank');
            if (!printWindow) {
                // If blocked by popup-blocker, fallback to direct download
                const link = document.createElement('a');
                link.href = fileURL;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error: any) {
            console.error('Error printing PDF:', error);
            alert('حدث خطأ أثناء محاولة الطباعة: ' + (error.message || error));
        } finally {
            setIsLoading(false);
        }
    };

    const handleShare = async () => {
        try {
            setIsLoading(true);
            const { blob, filename } = await getBlob();

            // Check if Capacitor/Native filesystem and sharing is available
            const win = window as any;
            const cap = win.Capacitor || (win.opener && win.opener.Capacitor);
            if (cap && cap.Plugins && cap.Plugins.Filesystem && cap.Plugins.Share) {
                // Convert Blob to Base64 for Capacitor
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = async () => {
                    try {
                        const base64data = reader.result as string;
                        const base64Content = base64data.split(',')[1];

                        // Write file to cache
                        await Filesystem.writeFile({
                            path: filename,
                            data: base64Content,
                            directory: Directory.Cache,
                        });

                        // Get sharing URI
                        const uri = await Filesystem.getUri({
                            directory: Directory.Cache,
                            path: filename,
                        });

                        // Trigger native mobile share dialog (shows WhatsApp, Telegram, etc.)
                        await CapacitorShare.share({
                            title: 'مشاركة الفاتورة',
                            text: `فاتورة كروت رقم #${invoice.invoiceNumber}`,
                            url: uri.uri,
                            dialogTitle: 'مشاركة الفاتورة كـ PDF',
                        });
                    } catch (err: any) {
                        alert('فشل مشاركة الملف على الجوال: ' + err.message);
                    }
                };
            } else {
                // Standard browser share or download fallback
                const file = new File([blob], filename, { type: 'application/pdf' });
                
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'مشاركة الفاتورة',
                        text: `فاتورة كروت رقم #${invoice.invoiceNumber}`,
                    });
                } else {
                    // Fallback to downloading the PDF file
                    const fileURL = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = fileURL;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    alert('تم تحميل ملف PDF بنجاح. يمكنك مشاركته يدوياً.');
                }
            }
        } catch (error: any) {
            console.error('Error sharing PDF:', error);
            alert('حدث خطأ أثناء محاولة المشاركة: ' + (error.message || error));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
                {/* Backdrop overlay */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0"
                    onClick={onClose}
                />

                {/* Modal box */}
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    transition={{ type: "spring", duration: 0.4 }}
                    className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100 dark:border-slate-800 text-center z-10 overflow-hidden"
                >
                    {/* Corner Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 left-4 p-2 rounded-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition"
                    >
                        <X size={18} />
                    </button>

                    {/* Success Icon */}
                    <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-500 dark:text-emerald-400 flex items-center justify-center mb-5 border border-emerald-100 dark:border-emerald-900/40">
                        <CheckCircle2 size={36} className="animate-bounce" />
                    </div>

                    {/* Header */}
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-1">
                        تم حفظ الفاتورة بنجاح!
                    </h3>
                    
                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-4">
                        رقم الفاتورة: <span className="font-mono text-indigo-600 dark:text-indigo-400 font-black">#{invoice.invoiceNumber}</span>
                    </p>

                    {/* Invoice Preview Card */}
                    <div className="my-5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-right text-xs">
                        <div className="flex justify-between items-center pb-2 mb-2 border-b border-dashed border-slate-200 dark:border-slate-700">
                            <span className="font-black text-slate-700 dark:text-slate-300">معاينة تفاصيل الفاتورة</span>
                            <span className="text-[10px] text-slate-400 font-bold font-mono" dir="ltr">{invoice.dateTime}</span>
                        </div>
                        
                        <div className="space-y-1.5 text-slate-600 dark:text-slate-300 font-medium">
                            <div className="flex justify-between">
                                <span>نوع الحركة:</span>
                                <span className="font-bold text-slate-950 dark:text-white">
                                    {invoice.type === 'sale' ? 'بيع كروت للموزع' : 'شراء كروت من المورد'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span>{invoice.type === 'sale' ? 'الموزع:' : 'المورد:'}</span>
                                <span className="font-bold text-slate-950 dark:text-white">{invoice.partyName || 'نقدي / عام'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>طريقة الدفع:</span>
                                <span className="font-bold text-slate-950 dark:text-white">
                                    {invoice.paymentType === 'cash' ? 'نقدي' : 'آجل'}
                                </span>
                            </div>
                            {invoice.userName && (
                                <div className="flex justify-between">
                                    <span>المستخدم:</span>
                                    <span className="font-bold text-slate-950 dark:text-white">{invoice.userName}</span>
                                </div>
                            )}
                        </div>

                        {/* Items Table / Detail */}
                        <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-700">
                            <div className="flex justify-between text-[11px] font-black text-slate-400 mb-1">
                                <span>الصنف فئة الكرت</span>
                                <div className="flex gap-8">
                                    <span>الكمية</span>
                                    <span>الإجمالي</span>
                                </div>
                            </div>
                            <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                                {invoice.items && invoice.items.length > 0 ? (
                                    invoice.items.map((item, idx) => (
                                        <div key={idx} className="flex justify-between font-bold text-slate-900 dark:text-slate-100 py-1.5 bg-white dark:bg-slate-800/80 px-2 rounded-lg border border-slate-100 dark:border-slate-800 text-[11px]">
                                            <span>فئة: {item.categoryName}</span>
                                            <div className="flex gap-10">
                                                <span className="font-mono">{Math.abs(item.quantity)}</span>
                                                <span className="font-mono text-indigo-600 dark:text-indigo-400">{Math.abs(item.totalAmount).toFixed(2)} ر.س</span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100 py-1.5 bg-white dark:bg-slate-800/80 px-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                        <span>فئة: {invoice.categoryName}</span>
                                        <div className="flex gap-10">
                                            <span className="font-mono">{Math.abs(invoice.quantity || 0)}</span>
                                            <span className="font-mono text-indigo-600 dark:text-indigo-400">{Math.abs(invoice.totalAmount).toFixed(2)} ر.س</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Total Section */}
                        <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <span className="font-black text-slate-700 dark:text-slate-300 text-sm">الإجمالي الصافي:</span>
                            <span className="font-black text-base text-emerald-600 dark:text-emerald-400 font-mono" dir="ltr">
                                {Math.abs(invoice.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                            </span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-3">
                        <button
                            onClick={handlePrint}
                            disabled={isLoading}
                            className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-indigo-600/20 active:scale-95 transition duration-150"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Printer className="w-5 h-5" />
                            )}
                            <span>طباعة الفاتورة (PDF)</span>
                        </button>

                        <button
                            onClick={handleShare}
                            disabled={isLoading}
                            className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-emerald-600/20 active:scale-95 transition duration-150"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <Share2 className="w-5 h-5" />
                            )}
                            <span>مشاركة الفاتورة (PDF)</span>
                        </button>

                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="w-full py-3.5 px-6 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-black rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition duration-150"
                        >
                            <span>إنهاء</span>
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
