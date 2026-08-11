const fs = require('fs');
let code = fs.readFileSync('src/components/CardSaleModal.tsx', 'utf8');

code = code.replace(
    'onInvoiceCreated?: (invoice: InvoicePdfInput) => void;\n}',
    'onInvoiceCreated?: (invoice: InvoicePdfInput) => void;\n    editingInvoice?: any;\n}'
);

code = code.replace(
    'onInvoiceCreated,\n}) => {',
    'onInvoiceCreated,\n    editingInvoice,\n}) => {'
);

const prefillLogic = `
    // Pre-fill if editingInvoice is provided
    useEffect(() => {
        if (isOpen && editingInvoice) {
            setPaymentType(editingInvoice.paymentType || 'cash');
            if (editingInvoice.distributorId) {
                setSelectedDistributorId(editingInvoice.distributorId);
            }
            
            if (editingInvoice.items && Array.isArray(editingInvoice.items)) {
                const initialCart = editingInvoice.items.map((it: any) => ({
                    id: Math.random().toString(36).substr(2, 9),
                    categoryName: it.categoryName,
                    saleType: it.saleType || 'retail',
                    unitPrice: it.unitPrice || 0,
                    quantity: it.quantity || 1,
                    totalAmount: (it.unitPrice || 0) * (it.quantity || 1),
                    availableStock: 99999 // We don't have exactly this but it's for UI
                }));
                setCartItems(initialCart);
            }
        } else if (isOpen && !editingInvoice) {
            setCartItems([]);
            setPaymentType('cash');
            setSelectedDistributorId('');
        }
    }, [isOpen, editingInvoice]);
`;

code = code.replace(
    '// Load active card categories and distributors',
    `${prefillLogic}\n    // Load active card categories and distributors`
);

fs.writeFileSync('src/components/CardSaleModal.tsx', code);
console.log('patched CardSaleModal pre-fill');
