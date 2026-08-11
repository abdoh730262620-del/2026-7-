const fs = require('fs');

function patchSaleModal() {
    let code = fs.readFileSync('src/components/CardSaleModal.tsx', 'utf8');
    
    // Add props
    code = code.replace(
        'editingInvoice?: any;',
        'editingInvoice?: any;\n    prefetchedCategories?: CardCategory[];\n    prefetchedDistributors?: CardDistributor[];'
    );
    
    code = code.replace(
        'export default function CardSaleModal({ isOpen, onClose, categoryName, onSuccess, onInvoiceCreated, editingInvoice }: CardSaleModalProps) {',
        'export default function CardSaleModal({ isOpen, onClose, categoryName, onSuccess, onInvoiceCreated, editingInvoice, prefetchedCategories, prefetchedDistributors }: CardSaleModalProps) {'
    );

    // Replace useEffect
    const effectRegex = /useEffect\(\(\) => \{\s+if \(\!isOpen\) return;\s+const qCat = query\(collection.*?unsubDist\(\);\s+\};\s+\}, \[isOpen\]\);/s;
    
    const newEffect = `useEffect(() => {
        if (!isOpen) return;

        let unsubCat = () => {};
        let unsubDist = () => {};

        if (!prefetchedCategories) {
            const qCat = query(collection(db, 'card_categories'), where('tenantId', '==', tenantId));
            unsubCat = onSnapshot(qCat, (snap) => {
                const list: CardCategory[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardCategory));
                setCategories(list);
            });
        }

        if (!prefetchedDistributors) {
            const qDist = query(collection(db, 'card_distributors'), where('tenantId', '==', tenantId));
            unsubDist = onSnapshot(qDist, (snap) => {
                const list: CardDistributor[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardDistributor));
                setDistributors(list);
            });
        }

        return () => {
            unsubCat();
            unsubDist();
        };
    }, [isOpen]);

    useEffect(() => {
        if (prefetchedCategories) setCategories(prefetchedCategories);
    }, [prefetchedCategories]);

    useEffect(() => {
        if (prefetchedDistributors) setDistributors(prefetchedDistributors);
    }, [prefetchedDistributors]);`;

    code = code.replace(effectRegex, newEffect);
    fs.writeFileSync('src/components/CardSaleModal.tsx', code);
}

function patchPurchaseModal() {
    let code = fs.readFileSync('src/components/CardPurchaseModal.tsx', 'utf8');
    
    // Add props
    code = code.replace(
        'editingInvoice?: any;',
        'editingInvoice?: any;\n    prefetchedCategories?: CardCategory[];\n    prefetchedSuppliers?: CardSupplier[];'
    );
    
    code = code.replace(
        'export default function CardPurchaseModal({ isOpen, onClose, categoryName, onSuccess, onInvoiceCreated, editingInvoice }: CardPurchaseModalProps) {',
        'export default function CardPurchaseModal({ isOpen, onClose, categoryName, onSuccess, onInvoiceCreated, editingInvoice, prefetchedCategories, prefetchedSuppliers }: CardPurchaseModalProps) {'
    );

    // Replace useEffect
    const effectRegex = /useEffect\(\(\) => \{\s+if \(\!isOpen\) return;\s+const qCat = query\(collection.*?unsubSupp\(\);\s+\};\s+\}, \[isOpen\]\);/s;
    
    const newEffect = `useEffect(() => {
        if (!isOpen) return;

        let unsubCat = () => {};
        let unsubSupp = () => {};

        if (!prefetchedCategories) {
            const qCat = query(collection(db, 'card_categories'), where('tenantId', '==', tenantId));
            unsubCat = onSnapshot(qCat, (snap) => {
                const list: CardCategory[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardCategory));
                setCategories(list);
            });
        }

        if (!prefetchedSuppliers) {
            const qSupp = query(collection(db, 'card_suppliers'), where('tenantId', '==', tenantId));
            unsubSupp = onSnapshot(qSupp, (snap) => {
                const list: CardSupplier[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as CardSupplier));
                setSuppliers(list);
            });
        }

        return () => {
            unsubCat();
            unsubSupp();
        };
    }, [isOpen]);

    useEffect(() => {
        if (prefetchedCategories) setCategories(prefetchedCategories);
    }, [prefetchedCategories]);

    useEffect(() => {
        if (prefetchedSuppliers) setSuppliers(prefetchedSuppliers);
    }, [prefetchedSuppliers]);`;

    code = code.replace(effectRegex, newEffect);
    fs.writeFileSync('src/components/CardPurchaseModal.tsx', code);
}

function patchCardsManagement() {
    let code = fs.readFileSync('src/pages/CardsManagement.tsx', 'utf8');
    
    code = code.replace(
        /<CardPurchaseModal\n\s+isOpen={isCardPurchaseModalOpen}\n\s+editingInvoice={editingCardPurchase}/g,
        '<CardPurchaseModal\n                prefetchedCategories={categories}\n                prefetchedSuppliers={suppliers}\n                isOpen={isCardPurchaseModalOpen}\n                editingInvoice={editingCardPurchase}'
    );

    code = code.replace(
        /<CardSaleModal\n\s+isOpen={!!saleModalCategory || isCardSaleModalOpen}\n\s+editingInvoice={editingCardSale}/g,
        '<CardSaleModal\n                    prefetchedCategories={categories}\n                    prefetchedDistributors={distributors}\n                    isOpen={!!saleModalCategory || isCardSaleModalOpen}\n                    editingInvoice={editingCardSale}'
    );

    fs.writeFileSync('src/pages/CardsManagement.tsx', code);
}

patchSaleModal();
patchPurchaseModal();
patchCardsManagement();
console.log('patched');
