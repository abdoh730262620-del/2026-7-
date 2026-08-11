const fs = require('fs');
let code = fs.readFileSync('src/components/CardPurchasesSection.tsx', 'utf8');

if (!code.includes('onEditInvoice')) {
    code = code.replace(
        'onViewInvoice: (invoice: InvoicePdfInput) => void;',
        'onViewInvoice: (invoice: InvoicePdfInput) => void;\n    onEditInvoice?: (invoice: GroupedPurchaseInvoice) => void;\n    onCancelInvoice?: (invoice: GroupedPurchaseInvoice) => void;'
    );
    code = code.replace(
        'onViewInvoice,',
        'onViewInvoice,\n    onEditInvoice,\n    onCancelInvoice,'
    );
    
    // Add edit/cancel buttons next to the PDF button
    const buttonsRegex = /<button\s+onClick=\{\(\) => onViewInvoice\(createInvoiceObj\(inv\)\)\}.*?<\/button>/s;
    const replacement = `<button
                                            onClick={() => onViewInvoice(createInvoiceObj(inv))}
                                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1.5 shadow-md shadow-indigo-600/20 active:scale-95 transition"
                                        >
                                            <Eye size={13} />
                                            <span>عرض</span>
                                        </button>
                                        {onEditInvoice && inv.invoiceNumber && (
                                            <button
                                                onClick={() => onEditInvoice(inv)}
                                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1.5 shadow-md shadow-blue-600/20 active:scale-95 transition"
                                            >
                                                <span>تعديل</span>
                                            </button>
                                        )}
                                        {onCancelInvoice && inv.invoiceNumber && (
                                            <button
                                                onClick={() => onCancelInvoice(inv)}
                                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black inline-flex items-center gap-1.5 shadow-md shadow-rose-600/20 active:scale-95 transition"
                                            >
                                                <X size={13} />
                                                <span>إلغاء</span>
                                            </button>
                                        )}`;
                                        
    code = code.replace(buttonsRegex, replacement);
    
    // Also add filtering of cancelled invoices in groupPurchasesToInvoices
    code = code.replace(
        'purchases.forEach(purchase => {',
        "purchases.forEach(purchase => {\n            if (purchase.status === 'cancelled') return;"
    );
    
    fs.writeFileSync('src/components/CardPurchasesSection.tsx', code);
    console.log('patched CardPurchasesSection');
} else {
    console.log('already patched');
}
