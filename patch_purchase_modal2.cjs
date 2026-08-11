const fs = require('fs');
let code = fs.readFileSync('src/components/CardPurchaseModal.tsx', 'utf8');

const prefillLogic = `
    // Pre-fill if editingInvoice is provided
    useEffect(() => {
        if (isOpen && editingInvoice) {
            setPaymentType(editingInvoice.paymentType || 'cash');
            if (editingInvoice.supplierId) {
                setSelectedSupplierId(editingInvoice.supplierId);
            }
            
            if (editingInvoice.items && Array.isArray(editingInvoice.items)) {
                const initialCart = editingInvoice.items.map((it: any) => ({
                    id: Math.random().toString(36).substr(2, 9),
                    categoryName: it.categoryName,
                    unitPrice: it.unitPrice || 0,
                    quantity: it.quantity || 1,
                    totalAmount: (it.unitPrice || 0) * (it.quantity || 1),
                    availableStock: 99999
                }));
                setCartItems(initialCart);
            }
        } else if (isOpen && !editingInvoice) {
            setCartItems([]);
            setPaymentType('cash');
            setSelectedSupplierId('');
        }
    }, [isOpen, editingInvoice]);
`;

code = code.replace(
    'const [saving, setSaving] = useState<boolean>(false);',
    `const [saving, setSaving] = useState<boolean>(false);\n${prefillLogic}`
);

fs.writeFileSync('src/components/CardPurchaseModal.tsx', code);
console.log('patched CardPurchaseModal pre-fill');
