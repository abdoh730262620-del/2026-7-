import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Printer, Share2, X, CheckCircle2, Loader2, FileText, ShoppingBag, TrendingUp, Eye, RotateCcw } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share as CapacitorShare } from '@capacitor/share';
import { generateInvoicePdf, InvoicePdfInput } from '../lib/pdfHelper';
import { InvoicePreviewModal } from './InvoicePreviewModal';

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
    const [showHtmlPreview, setShowHtmlPreview] = useState(false);

    if (!isOpen || !invoice) return null;

    const isReturn = !!(invoice.isReturn || invoice.type === 'purchase_return' || invoice.type === 'sale_return');
    const isSale = invoice.type === 'sale' || invoice.type === 'sale_return';

    const getBlob = async (): Promise<{ blob: Blob; filename: string }> => {
        const { blob, filename } = await generateInvoicePdf(invoice);
        return { blob, filename };
    };

    const handlePrint = async () => {
        try {
            setIsLoading(true);
            const { blob, filename } = await getBlob();
            const fileURL = URL.createObjectURL(blob);
            
            const printWindow = window.open(fileURL, '_blank');
            if (!printWindow) {
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

            const win = window as any;
            const cap = win.Capacitor || (win.opener && win.opener.Capacitor);
            if (cap && cap.Plugins && cap.Plugins.Filesystem && cap.Plugins.Share) {
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = async () => {
                    try {
                        const base64data = reader.result as string;
                        const base64Content = base64data.split(',')[1];

                        await Filesystem.writeFile({
                            path: filename,
                            data: base64Content,
                            directory: Directory.Cache,
                        });

                        const uri = await Filesystem.getUri({
                            directory: Directory.Cache,
                            path: filename,
                        });

                        await CapacitorShare.share({
                            title: 'مشاركة الفاتورة',
                            text: `${isReturn ? 'فاتورة مردودات كروت' : 'فاتورة كروت'} رقم #${invoice.invoiceNumber}`,
                            url: uri.uri,
                            dialogTitle: 'مشاركة الفاتورة كـ PDF',
                        });
                    } catch (err: any) {
                        alert('فشل مشاركة الملف على الجوال: ' + err.message);
                    }
                };
            } else {
                const file = new File([blob], filename, { type: 'application/pdf' });
                
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'مشاركة الفاتورة',
                        text: `${isReturn ? 'فاتورة مردودات كروت' : 'فاتورة كروت'} رقم #${invoice.invoiceNumber}`,
                    });
                } else {
                    const fileURL = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = fileURL;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    alert('تم تحميل ملف PDF بنجاح.');
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
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 15 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 15 }}
                    transition={{ type: "spring", duration: 0.3 }}
                    className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-100 dark:border-slate-800 text-right z-10 overflow-hidden max-h-[90vh] flex flex-col"
                >
                    {/* Top Header Bar */}
                    <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                                isReturn
                                    ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50'
                                    : isSale 
                                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' 
                                        : 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                            }`}>
                                {isReturn ? <RotateCcw size={20} /> : isSale ? <TrendingUp size={20} /> : <ShoppingBag size={20} />}
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 dark:text-white mb-1">
                                    {isReturn
                                        ? (isSale ? 'فاتورة مردودات مبيعات كروت' : 'فاتورة مردودات مشتريات كروت')
                                        : (isSale ? 'فاتورة مبيعات كروت' : 'فاتورة مشتريات كروت')}
                                </h3>
                                <div className="flex items-center flex-wrap gap-1.5 text-[10px] font-bold">
                                    <span className="font-mono text-indigo-600 dark:text-indigo-400 text-[11px]">
                                        #{invoice.invoiceNumber}
                                    </span>
                                    {isReturn && (
                                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-black">
                                            مرتجع
                                        </span>
                                    )}
                                    <span className={`px-2 py-0.5 rounded-full ${
                                        invoice.paymentType === 'cash' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    }`}>
                                        {invoice.paymentType === 'cash' ? 'نقدي' : 'آجل'}
                                    </span>
                                    {invoice.userName && (
                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            {invoice.userName}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition shrink-0"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="space-y-4 overflow-y-auto pr-1 pl-1 flex-1">
                        
                        {invoice.status === 'cancelled' && (
                            <div className="bg-rose-50 dark:bg-rose-950/30 p-4 rounded-2xl border border-rose-200 dark:border-rose-900/50 flex flex-col gap-3">
                                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                                    <X className="w-5 h-5" />
                                    <h4 className="font-black text-sm">تم إلغاء هذه الفاتورة</h4>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-rose-800 dark:text-rose-300">
                                    <div>
                                        <span className="block text-[10px] opacity-70 mb-1">ألغيت بواسطة</span>
                                        <strong className="font-bold">{invoice.cancelledBy || 'النظام'}</strong>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] opacity-70 mb-1">تاريخ الإلغاء</span>
                                        <strong className="font-bold font-mono">
                                            {invoice.cancelledAt ? new Date(invoice.cancelledAt).toLocaleString('en-GB') : 'غير متوفر'}
                                        </strong>
                                    </div>
                                    <div className="sm:col-span-2 bg-white/50 dark:bg-black/20 p-3 rounded-xl mt-1">
                                        <span className="block text-[10px] opacity-70 mb-1.5 font-bold">بيان الحركة العكسية (تفاصيل الإلغاء)</span>
                                        <ul className="list-disc list-inside space-y-1 font-medium">
                                            <li>تم إرجاع الكروت الموضحة أدناه إلى المخزون (فئات الكروت).</li>
                                            {invoice.paymentType === 'cash' ? (
                                                <li>
                                                    {isSale 
                                                        ? `تم إرجاع المبلغ النقدي (${Math.abs(invoice.totalAmount).toFixed(2)} ريال) وخصمه من الصندوق.` 
                                                        : `تم استرداد المبلغ النقدي (${Math.abs(invoice.totalAmount).toFixed(2)} ريال) وإضافته إلى الصندوق.`
                                                    }
                                                </li>
                                            ) : (
                                                <li>
                                                    {isSale
                                                        ? `تم إرجاع الكروت وخصم قيمتها (${Math.abs(invoice.totalAmount).toFixed(2)} ريال) من حساب العميل/الموزع: ${invoice.partyName || 'نقدي / عام'}.`
                                                        : `تم إرجاع الكروت وخصم قيمتها (${Math.abs(invoice.totalAmount).toFixed(2)} ريال) من حساب المورد: ${invoice.partyName || 'نقدي / عام'}.`
                                                    }
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Invoice Metadata Box */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                            <div>
                                <span className="block text-[10px] text-slate-400 font-bold">{isSale ? 'الموزع / العميل' : 'المورد'}</span>
                                <strong className="font-black text-slate-900 dark:text-white">{invoice.partyName || 'نقدي / عام'}</strong>
                            </div>
                            <div className="text-left">
                                <span className="block text-[10px] text-slate-400 font-bold">التاريخ والوقت</span>
                                <span className="font-mono text-slate-700 dark:text-slate-300 font-bold">{invoice.dateTime}</span>
                            </div>
                        </div>

                        {/* Structured Items Table */}
                        <div>
                            <h4 className="text-xs font-black text-slate-700 dark:text-slate-300 mb-2">بنود الفاتورة والكميات</h4>
                            <div className="bg-white dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <table className="w-full text-right text-xs">
                                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-400 font-black text-[11px] border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                            <th className="p-3">الفئة / الصنف</th>
                                            <th className="p-3 text-center">الكمية</th>
                                            <th className="p-3 text-center">سعر الوحدة</th>
                                            <th className="p-3 text-left">الإجمالي</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {invoice.items && invoice.items.length > 0 ? (
                                            invoice.items.map((item, idx) => (
                                                <tr key={idx} className="font-bold text-slate-800 dark:text-slate-200">
                                                    <td className="p-3 font-black text-slate-900 dark:text-white">{item.categoryName}</td>
                                                    <td className="p-3 text-center font-mono font-black text-emerald-600">{Math.abs(item.quantity)} كارت</td>
                                                    <td className="p-3 text-center font-mono text-slate-500">{item.unitPrice.toFixed(2)} ريال يمني</td>
                                                    <td className="p-3 text-left font-mono font-black text-slate-950 dark:text-white">{Math.abs(item.totalAmount).toFixed(2)} ريال يمني</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr className="font-bold text-slate-800 dark:text-slate-200">
                                                <td className="p-3 font-black text-slate-900 dark:text-white">{invoice.categoryName || 'كروت فئة'}</td>
                                                <td className="p-3 text-center font-mono font-black text-emerald-600">{Math.abs(invoice.quantity || 0)} كارت</td>
                                                <td className="p-3 text-center font-mono text-slate-500">-</td>
                                                <td className="p-3 text-left font-mono font-black text-slate-950 dark:text-white">{Math.abs(invoice.totalAmount).toFixed(2)} ريال يمني</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Total Summary */}
                        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-4 rounded-2xl flex items-center justify-between shadow-xs">
                            <span className="text-xs font-black text-emerald-900 dark:text-emerald-300">الإجمالي الصافي للفاتورة:</span>
                            <span className="text-base font-black font-mono text-emerald-700 dark:text-emerald-400" dir="ltr">
                                {Math.abs(invoice.totalAmount).toFixed(2)} ريال يمني
                            </span>
                        </div>
                    </div>

                    {/* Footer Actions: Print and Share Icon Buttons + Close */}
                    <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
                        <button
                            onClick={handlePrint}
                            disabled={isLoading}
                            className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 active:scale-95 transition text-xs"
                        >
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                            <span>طباعة PDF</span>
                        </button>

                        <button
                            onClick={handleShare}
                            disabled={isLoading}
                            className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95 transition text-xs"
                        >
                            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
                            <span>مشاركة PDF</span>
                        </button>

                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="py-3 px-5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-black rounded-2xl active:scale-95 transition text-xs"
                        >
                            إغلاق
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
