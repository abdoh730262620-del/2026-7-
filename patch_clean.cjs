const fs = require('fs');
let code = fs.readFileSync('src/pages/CardsManagement.tsx.clean', 'utf8');

const searchStr = `            {/* SALE MODAL */}
            {(saleModalCategory || isCardSaleModalOpen) && (
                || isCardSaleModalOpen}
                    editingInvoice={editingCardSale}
                    onClose={() => { setSaleModalCategory(null); setIsCardSaleModalOpen(false); setEditingCardSale(null); }}
                    categoryName={saleModalCategory || undefined}
                    onInvoiceCreated={(invoice) => {
                        setActionModalInvoice(invoice);
                        setActionModalOpen(true);
                    }}
                />
            )}`;

const replaceStr = `            {/* SALE MODAL */}
            {(saleModalCategory || isCardSaleModalOpen) && (
                <CardSaleModal
                    prefetchedCategories={categories}
                    prefetchedDistributors={distributors}
                    isOpen={!!saleModalCategory || isCardSaleModalOpen}
                    editingInvoice={editingCardSale}
                    onClose={() => { setSaleModalCategory(null); setIsCardSaleModalOpen(false); setEditingCardSale(null); }}
                    categoryName={saleModalCategory || undefined}
                    onInvoiceCreated={(invoice) => {
                        setActionModalInvoice(invoice);
                        setActionModalOpen(true);
                    }}
                />
            )}`;

code = code.replace(searchStr, replaceStr);

fs.writeFileSync('src/pages/CardsManagement.tsx', code);
