const fs = require('fs');
let code = fs.readFileSync('src/pages/CardsManagement.tsx', 'utf8');

// Insert reverse logic
const reverseLogic = `
    const reverseCardInvoice = async (invoiceNumber: string, type: 'sale' | 'purchase') => {
        try {
            const collectionName = type === 'sale' ? 'card_sales' : 'card_purchases';
            const q = query(collection(db, collectionName), where('tenantId', '==', tenantId), where('invoiceNumber', '==', invoiceNumber));
            const snap = await getDocs(q);
            if (snap.empty) {
                alert('لم يتم العثور على الفاتورة لإلغائها.');
                return false;
            }

            const batch = writeBatch(db);
            const categoryUpdates: Record<string, number> = {};
            let partyId = '';
            let paymentType = '';
            let netTotal = 0;
            let paidAmount = 0; // If we ever supported partial payments, but card module usually pays full or credit

            snap.docs.forEach(d => {
                const docData = d.data();
                if (docData.status === 'cancelled') return;
                
                batch.update(d.ref, { status: 'cancelled' });
                
                const catId = docData.categoryId;
                if (catId) {
                    const qty = docData.quantity || 0;
                    // If sale, reversing adds stock. If purchase, reversing removes stock.
                    const qtyChange = type === 'sale' ? qty : -qty;
                    categoryUpdates[catId] = (categoryUpdates[catId] || 0) + qtyChange;
                }
                
                if (type === 'sale') {
                    partyId = docData.distributorId;
                } else {
                    partyId = docData.supplierId;
                }
                paymentType = docData.paymentType;
                netTotal += (docData.netTotal || docData.totalAmount || 0);
            });

            // Update stock
            for (const catId of Object.keys(categoryUpdates)) {
                if (categoryUpdates[catId] !== 0) {
                    batch.update(doc(db, 'card_categories', catId), {
                        availableCount: increment(categoryUpdates[catId])
                    });
                }
            }

            // Update party balance
            if (paymentType === 'credit' && partyId) {
                const partyCollection = type === 'sale' ? 'card_distributors' : 'card_suppliers';
                // Sale credit: dist balance goes UP. Reverse: goes DOWN.
                // Purchase credit: supplier balance goes UP. Reverse: goes DOWN.
                batch.update(doc(db, partyCollection, partyId), {
                    balance: increment(-netTotal)
                });
            }

            // Update cashbox for cash invoices
            if (paymentType === 'cash' && netTotal > 0) {
                const cashboxRef = doc(collection(db, 'card_cashbox'));
                batch.set(cashboxRef, {
                    tenantId,
                    type: type === 'sale' ? 'manual_out' : 'manual_in',
                    title: \`إلغاء فاتورة \${type === 'sale' ? 'مبيعات' : 'مشتريات'} #\${invoiceNumber}\`,
                    amount: netTotal,
                    isIncome: type === 'purchase', // reversing a sale expense, reversing a purchase income
                    date: new Date().toISOString().split('T')[0],
                    dateTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
                    userName: appUser?.name || 'النظام',
                    createdAt: Date.now()
                });
                
                const mainCashRef = doc(collection(db, 'cash'));
                batch.set(mainCashRef, {
                    date: Date.now(),
                    amount: netTotal,
                    type: type === 'sale' ? 'out' : 'in',
                    category: 'refund',
                    description: \`إلغاء فاتورة كروت \${type === 'sale' ? 'مبيعات' : 'مشتريات'} #\${invoiceNumber}\`,
                    tenantId,
                    createdAt: Date.now(),
                    userName: appUser?.name || 'النظام'
                });
            }

            await batch.commit();
            alert('تم إلغاء الفاتورة وعكس القيود والمخزون بنجاح.');
            return true;
        } catch (error) {
            console.error('Error reversing card invoice:', error);
            alert('حدث خطأ أثناء إلغاء الفاتورة.');
            return false;
        }
    };

    const handleCancelSaleInvoice = async (invoice: any) => {
        if (!window.confirm('هل أنت متأكد من إلغاء فاتورة المبيعات هذه؟ سيتم استرجاع الكروت للمخزون وخصم المبلغ من الموزع/الصندوق.')) return;
        await reverseCardInvoice(invoice.invoiceNumber, 'sale');
    };

    const handleCancelPurchaseInvoice = async (invoice: any) => {
        if (!window.confirm('هل أنت متأكد من إلغاء فاتورة المشتريات هذه؟ سيتم خصم الكروت من المخزون وخصم المبلغ من المورد/الصندوق.')) return;
        await reverseCardInvoice(invoice.invoiceNumber, 'purchase');
    };

    const [editingCardSale, setEditingCardSale] = useState<any>(null);
    const [editingCardPurchase, setEditingCardPurchase] = useState<any>(null);

    const handleEditSaleInvoice = async (invoice: any) => {
        if (!window.confirm('لتعديل الفاتورة يجب إلغاء الفاتورة الحالية وفتحها كمبيعة جديدة. هل توافق؟')) return;
        const success = await reverseCardInvoice(invoice.invoiceNumber, 'sale');
        if (success) {
            setEditingCardSale(invoice);
            setActiveSection('sale'); // Wait, card sale modal is controlled by state, not activeSection, let's just open the modal.
            setSaleModalOpen(true);
        }
    };

    const handleEditPurchaseInvoice = async (invoice: any) => {
        if (!window.confirm('لتعديل الفاتورة يجب إلغاء الفاتورة الحالية وفتحها كمشتريات جديدة. هل توافق؟')) return;
        const success = await reverseCardInvoice(invoice.invoiceNumber, 'purchase');
        if (success) {
            setEditingCardPurchase(invoice);
            setPurchaseModalOpen(true);
        }
    };
`;

code = code.replace(
    'const handleAddSale = () => {',
    `${reverseLogic}\n    const handleAddSale = () => {`
);

// add to CardSalesSection props
code = code.replace(
    '<CardSalesSection \n                                        sales={sales}\n                                        onViewInvoice={(invoice) => {\n                                            setActionModalInvoice(invoice);\n                                            setActionModalOpen(true);\n                                        }}\n                                        appUser={appUser}\n                                    />',
    `<CardSalesSection 
                                        sales={sales}
                                        onViewInvoice={(invoice) => {
                                            setActionModalInvoice(invoice);
                                            setActionModalOpen(true);
                                        }}
                                        onEditInvoice={handleEditSaleInvoice}
                                        onCancelInvoice={handleCancelSaleInvoice}
                                        appUser={appUser}
                                    />`
);

// add to CardPurchasesSection props
code = code.replace(
    '<CardPurchasesSection \n                                        purchases={purchases}\n                                        onViewInvoice={(invoice) => {\n                                            setActionModalInvoice(invoice);\n                                            setActionModalOpen(true);\n                                        }}\n                                        appUser={appUser}\n                                    />',
    `<CardPurchasesSection 
                                        purchases={purchases}
                                        onViewInvoice={(invoice) => {
                                            setActionModalInvoice(invoice);
                                            setActionModalOpen(true);
                                        }}
                                        onEditInvoice={handleEditPurchaseInvoice}
                                        onCancelInvoice={handleCancelPurchaseInvoice}
                                        appUser={appUser}
                                    />`
);

fs.writeFileSync('src/pages/CardsManagement.tsx', code);
console.log('patched CardsManagement.tsx');
