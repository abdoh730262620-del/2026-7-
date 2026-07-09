import React, { useState, useEffect } from 'react';
import { getInvoiceHtml, printInvoice } from '../lib/printHelper';
import { Share, FileText, Download, Printer, X, MessageCircle } from 'lucide-react';
import { Share as CapacitorShare } from '@capacitor/share';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export const InvoicePreviewModal = ({ 
    invoice, 
    type, 
    items, 
    onClose 
}: { 
    invoice: any; 
    type: 'sale' | 'purchase' | 'quotation'; 
    items: any[]; 
    onClose: () => void; 
}) => {
    const [html, setHtml] = useState<string>('');
    const [isSharing, setIsSharing] = useState(false);

    useEffect(() => {
        const fetchHtml = async () => {
            const generatedHtml = await getInvoiceHtml(invoice, type, items, true);
            setHtml(generatedHtml);
        };
        fetchHtml();
    }, [invoice, type, items]);

    const handleShareHtml = async () => {
        try {
            setIsSharing(true);
            const fileName = `invoice_${invoice.invoiceNumber || new Date().getTime()}.html`;
            
            // Generate HTML string
            const fullHtml = await getInvoiceHtml(invoice, type, items, true);

            // Write to capacitor filesystem (Cache directory is usually easy to share from)
            const result = await Filesystem.writeFile({
                path: fileName,
                data: fullHtml,
                directory: Directory.Cache,
                encoding: Encoding.UTF8,
            });

            const uri = await Filesystem.getUri({
                directory: Directory.Cache,
                path: fileName,
            });

            await CapacitorShare.share({
                title: 'مشاركة الفاتورة',
                text: 'الرجاء الاطلاع على الفاتورة المرفقة',
                url: uri.uri, // Some apps prefer the url payload
                dialogTitle: 'مشاركة الفاتورة',
            });
        } catch (e: any) {
            console.error('Error sharing HTML:', e);
            
            // Fallback for web
            if (!e.message?.includes('implemented on web')) {
                alert('عذراً، فشلت عملية المشاركة: ' + e.message);
            } else {
                const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `invoice_${invoice.invoiceNumber}.html`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } finally {
            setIsSharing(false);
        }
    };

    const handleShareText = async () => {
        try {
            const itemsText = items.map((item, idx) => `${idx + 1}. ${item.name} (${item.cartQuantity || item.quantity || 1} × ${item.price} ر.س) = ${((item.cartQuantity || item.quantity || 1) * item.price).toLocaleString()} ر.س`).join('\n');
            let titleStr = '';
            if (type === 'sale') titleStr = `🧾 فاتورة مبيعات رقم #${invoice.invoiceNumber || invoice.id}`;
            else if (type === 'purchase') titleStr = `🧾 فاتورة مشتريات رقم #${invoice.invoiceNumber || invoice.id}`;
            else titleStr = `📄 عرض سعر رقم #${invoice.invoiceNumber || invoice.id}`;

            const dateStr = invoice.date ? new Date(invoice.date).toLocaleDateString('ar-EG') : new Date().toLocaleDateString('ar-EG');
            
            let text = `*${titleStr}*\n`;
            text += `*التاريخ:* ${dateStr}\n`;
            if (invoice.customerName) text += `*العميل:* ${invoice.customerName}\n`;
            else if (invoice.supplierName) text += `*المورد:* ${invoice.supplierName}\n`;
            text += `----------------------------------------\n`;
            text += `*الأصناف:*\n${itemsText}\n`;
            text += `----------------------------------------\n`;
            text += `*الإجمالي:* ${invoice.total?.toLocaleString() || '0'} ر.س\n`;
            text += `----------------------------------------\n`;
            text += `شكراً لتعاملكم معنا! 🌸`;

            // Try Capacitor Native share first if runs on native Android/iOS
            try {
                await CapacitorShare.share({
                    title: titleStr,
                    text: text,
                    dialogTitle: 'مشاركة الفاتورة',
                });
                return;
            } catch (err) {
                // If capacitor fails, try standard navigator.share
                if (navigator.share) {
                    await navigator.share({
                        title: titleStr,
                        text: text,
                    });
                    return;
                }
            }

            // Fallback for browsers: Copy to Clipboard and open WhatsApp
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(text);
                alert('تم نسخ تفاصيل الفاتورة كرسالة نصية للذاكرة! سيتم فتح واتساب الآن لتسهيل اللصق والمشاركة.');
            }
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        } catch (e: any) {
            console.error('Error sharing text:', e);
            alert('عذراً، فشلت عملية المشاركة: ' + e.message);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-3xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                
                <div className="bg-white dark:bg-slate-900 border-b border-gray-100 p-4 sm:p-5 flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-bold text-black dark:text-white text-lg">معاينة الفاتورة</h3>
                        <p className="text-xs text-black font-medium mt-1">
                            الفاتورة رقم #{invoice.invoiceNumber || '---'}
                        </p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex flex-col items-center justify-center bg-white hover:bg-gray-300 rounded-full text-black dark:text-gray-300 transition">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-auto bg-white dark:bg-slate-800 p-2 sm:p-6 flex justify-center w-full">
                    <div className="w-full bg-white shadow-sm overflow-hidden" style={{ minHeight: '100%', maxWidth: '800px', margin: '0 auto' }}>
                        {html ? (
                            <iframe 
                                srcDoc={html} 
                                title="Invoice Preview"
                                className="w-full h-full min-h-[500px]"
                                style={{ border: 0 }}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-400">
                                جاري التجهيز...
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 sm:p-5 bg-white border-t border-gray-100 shrink-0 flex flex-wrap gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 min-w-[120px] py-3 bg-white dark:bg-slate-800 text-black dark:text-gray-200 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 transition"
                    >
                        <X size={18} />
                        إغلاق المعاينة
                    </button>

                    <button 
                        onClick={handleShareHtml}
                        disabled={!html || isSharing}
                        className="flex-1 min-w-[120px] py-3 bg-white dark:bg-slate-800 text-indigo-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 transition disabled:opacity-50 border border-indigo-50"
                    >
                        <Share size={18} />
                        مشاركة كـ HTML
                    </button>

                    <button 
                        onClick={handleShareText}
                        className="flex-1 min-w-[120px] py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl font-bold flex justify-center items-center gap-2 transition shadow-md active:scale-95"
                    >
                        <MessageCircle size={18} />
                        مشاركة نصية (واتساب)
                    </button>
                    
                    <button 
                        onClick={() => printInvoice(invoice, type, items)}
                        className="flex-1 min-w-[120px] py-3 bg-white text-emerald-700 hover:bg-white rounded-xl font-bold flex justify-center items-center gap-2 transition disabled:opacity-50 border border-emerald-50"
                    >
                        <Printer size={18} />
                        طباعة الفاتورة
                    </button>
                </div>
            </div>
        </div>
    );
};
