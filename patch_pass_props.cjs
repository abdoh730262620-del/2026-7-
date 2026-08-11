const fs = require('fs');
let code = fs.readFileSync('src/pages/CardsManagement.tsx', 'utf8');

// passing editingCardSale to CardSaleModal
code = code.replace(
    '<CardSaleModal\n                    isOpen={saleModalOpen}\n                    onClose={() => setSaleModalOpen(false)}\n                    onSuccess={() => {\n                        setSaleModalOpen(false);\n                        toastService.success(\'تمت إضافة المبيعات بنجاح\');\n                    }}\n                    onInvoiceCreated={(invoice) => {\n                        setActionModalInvoice(invoice);\n                        setActionModalOpen(true);\n                    }}\n                />',
    `<CardSaleModal
                    isOpen={saleModalOpen}
                    editingInvoice={editingCardSale}
                    onClose={() => { setSaleModalOpen(false); setEditingCardSale(null); }}
                    onSuccess={() => {
                        setSaleModalOpen(false);
                        setEditingCardSale(null);
                        toastService.success('تمت إضافة المبيعات بنجاح');
                    }}
                    onInvoiceCreated={(invoice) => {
                        setActionModalInvoice(invoice);
                        setActionModalOpen(true);
                    }}
                />`
);

// passing editingCardPurchase to CardPurchaseModal
code = code.replace(
    '<CardPurchaseModal\n                    isOpen={purchaseModalOpen}\n                    onClose={() => setPurchaseModalOpen(false)}\n                    onSuccess={() => {\n                        setPurchaseModalOpen(false);\n                        toastService.success(\'تمت عملية الشراء بنجاح\');\n                    }}\n                    onInvoiceCreated={(invoice) => {\n                        setActionModalInvoice(invoice);\n                        setActionModalOpen(true);\n                    }}\n                />',
    `<CardPurchaseModal
                    isOpen={purchaseModalOpen}
                    editingInvoice={editingCardPurchase}
                    onClose={() => { setPurchaseModalOpen(false); setEditingCardPurchase(null); }}
                    onSuccess={() => {
                        setPurchaseModalOpen(false);
                        setEditingCardPurchase(null);
                        toastService.success('تمت عملية الشراء بنجاح');
                    }}
                    onInvoiceCreated={(invoice) => {
                        setActionModalInvoice(invoice);
                        setActionModalOpen(true);
                    }}
                />`
);

fs.writeFileSync('src/pages/CardsManagement.tsx', code);
console.log('patched passing props');
