import fs from 'fs';

// --- Sales.tsx ---
let salesContent = fs.readFileSync('src/pages/Sales.tsx', 'utf-8');
const salesModal = `
            {activeDropdownId && (() => {
                const invoice = invoices.find(inv => inv.id === activeDropdownId);
                if (!invoice) return null;
                const dateObj = new Date(invoice.date || invoice.createdAt || 0);
                return (
                    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setActiveDropdownId(null)}>
                        <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                            <div className="bg-gray-50 border-b border-gray-100 p-5 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-gray-900 text-lg leading-none mb-1">فاتورة مبيعات #{invoice.invoiceNumber}</h3>
                                    <p className="text-xs text-gray-500 font-bold">{dateObj.toLocaleDateString('ar-EG')} - {dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                                <button onClick={() => setActiveDropdownId(null)} className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition">
                                    <span className="font-bold text-sm">✕</span>
                                </button>
                            </div>
                            <div className="p-5 grid grid-cols-2 gap-3 bg-white">
                                {settings.isWhatsAppEnabled && (
                                    <button 
                                        onClick={() => {
                                            setActiveDropdownId(null);
                                            const text = \`فاتورة مبيعات #\${invoice.invoiceNumber}\\nالتاريخ: \${dateObj.toLocaleDateString('ar-EG')}\\nالإجمالي: \${invoice.total} ر.س\\nشكراً لتعاملكم معنا.\`;
                                            window.open(\`https://wa.me/?text=\${encodeURIComponent(text)}\`, '_blank');
                                        }}
                                        className="col-span-2 py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-emerald-100 transition"
                                    >
                                        <MessageCircle size={18} /> إرسال عبر واتساب
                                    </button>
                                )}
                                <button onClick={() => { setActiveDropdownId(null); printInvoice(invoice, 'sale', invoice.items); }} className="col-span-2 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-blue-100 transition">
                                    <Printer size={18} /> عرض الفاتورة للطباعة
                                </button>
                                
                                {invoice.status !== 'cancelled' && invoice.status !== 'returned' && (
                                    <>
                                        <button onClick={() => { setActiveDropdownId(null); handleEditInvoice(invoice); }} className="col-span-2 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-indigo-100 transition">
                                            <Plus size={18} /> تعديل الفاتورة
                                        </button>
                                        <button onClick={() => { setActiveDropdownId(null); handleReturnOrCancelInvoice(invoice, 'returned'); }} className="py-3 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-orange-100 transition">
                                            <Minus size={18} /> استرجاع
                                        </button>
                                        <button onClick={() => { setActiveDropdownId(null); handleReturnOrCancelInvoice(invoice, 'cancelled'); }} className="py-3 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-red-100 transition">
                                            <Trash2 size={18} /> إلغاء
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {confirmDialog.isOpen && (`;
salesContent = salesContent.replace('{confirmDialog.isOpen && (', salesModal);
fs.writeFileSync('src/pages/Sales.tsx', salesContent);

// --- Purchases.tsx ---
let purchasesContent = fs.readFileSync('src/pages/Purchases.tsx', 'utf-8');
const purchasesModal = `
            {activeDropdownId && (() => {
                const invoice = invoices.find(inv => inv.id === activeDropdownId);
                if (!invoice) return null;
                const dateObj = new Date(invoice.date || invoice.createdAt || 0);
                return (
                    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setActiveDropdownId(null)}>
                        <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                            <div className="bg-gray-50 border-b border-gray-100 p-5 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-gray-900 text-lg leading-none mb-1">فاتورة مشتريات #{invoice.invoiceNumber}</h3>
                                    <p className="text-xs text-gray-500 font-bold">{dateObj.toLocaleDateString('ar-EG')} - {dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                                <button onClick={() => setActiveDropdownId(null)} className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition">
                                    <span className="font-bold text-sm">✕</span>
                                </button>
                            </div>
                            <div className="p-5 grid grid-cols-2 gap-3 bg-white">
                                <button onClick={() => { setActiveDropdownId(null); printInvoice(invoice, 'purchase', invoice.items); }} className="col-span-2 py-3 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-purple-100 transition">
                                    <Printer size={18} /> عرض الفاتورة للطباعة
                                </button>
                                
                                {invoice.status !== 'cancelled' && invoice.status !== 'returned' && (
                                    <>
                                        <button onClick={() => { setActiveDropdownId(null); handleEditInvoice(invoice); }} className="col-span-2 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-indigo-100 transition">
                                            <Plus size={18} /> تعديل الفاتورة
                                        </button>
                                        <button onClick={() => { setActiveDropdownId(null); handleReturnOrCancelInvoice(invoice, 'returned'); }} className="py-3 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-orange-100 transition">
                                            <Minus size={18} /> استرجاع
                                        </button>
                                        <button onClick={() => { setActiveDropdownId(null); handleReturnOrCancelInvoice(invoice, 'cancelled'); }} className="py-3 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-red-100 transition">
                                            <Trash2 size={18} /> إلغاء
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {confirmDialog.isOpen && (`;
purchasesContent = purchasesContent.replace('{confirmDialog.isOpen && (', purchasesModal);
fs.writeFileSync('src/pages/Purchases.tsx', purchasesContent);

// --- Quotations.tsx ---
let quotationsContent = fs.readFileSync('src/pages/Quotations.tsx', 'utf-8');
const quotationsModal = `
            {activeDropdownId && (() => {
                const q = quotations.find(quo => quo.id === activeDropdownId);
                if (!q) return null;
                const dateObj = new Date(q.date || q.createdAt || 0);
                return (
                    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setActiveDropdownId(null)}>
                        <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                            <div className="bg-gray-50 border-b border-gray-100 p-5 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-gray-900 text-lg leading-none mb-1">عرض سعر #{q.quotationNumber}</h3>
                                    <p className="text-xs text-gray-500 font-bold">{dateObj.toLocaleDateString('ar-EG')} - {dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                                <button onClick={() => setActiveDropdownId(null)} className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded-full text-gray-600 transition">
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
                                        className="col-span-2 py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-emerald-100 transition"
                                    >
                                        <MessageCircle size={18} /> إرسال عبر واتساب
                                    </button>
                                )}
                                <button onClick={() => { setActiveDropdownId(null); printInvoice(q, 'quotation', q.items); }} className="col-span-2 py-3 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-blue-100 transition">
                                    <Printer size={18} /> عرض للطباعة
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
                                    className="col-span-2 py-3 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-xl font-bold flex justify-center items-center gap-2 border border-orange-100 transition"
                                >
                                    <ShoppingCart size={18} /> تحويل إلى فاتورة مبيعات
                                </button>
                                
                            </div>
                        </div>
                    </div>
                );
            })()}

            {isSaving && (`;
const qTerminator = `        </div>
    );
}`;
quotationsContent = quotationsContent.replace(qTerminator, quotationsModal + `\n${qTerminator}`);
fs.writeFileSync('src/pages/Quotations.tsx', quotationsContent);
