const { readFileSync, writeFileSync } = require('fs');

const pPath = 'src/components/CardPurchaseModal.tsx';
let pContent = readFileSync(pPath, 'utf8');

const startBlock = "            await runTransaction(db, async (transaction) => {";
const endBlock = "            // Trigger action modal with full compiled invoice";

let pStart = pContent.indexOf(startBlock);
let pEnd = pContent.indexOf(endBlock);

if (pStart === -1 || pEnd === -1) {
    console.error("Could not find block in PurchaseModal");
    process.exit(1);
}

const replacementCode = `            await runTransaction(db, async (transaction) => {
                // --- PHASE 1: COMPUTE DELTAS AND COLLECT OLD DATA ---
                let oldInvoiceTotal = 0;
                let oldPaymentType = '';
                let oldSupplierId = '';
                const oldItems = [];
                const oldDocsToDelete = [];
                let oldCreatedAt = Date.now();
                
                if (editingInvoice && editingInvoice.docIds) {
                    for (const docId of editingInvoice.docIds) {
                        const oldDocRef = doc(db, 'card_purchases', docId);
                        const oldDocSnap = await transaction.get(oldDocRef);
                        if (oldDocSnap.exists() && oldDocSnap.data().status !== 'cancelled') {
                            const data = oldDocSnap.data();
                            oldDocsToDelete.push(oldDocRef);
                            oldItems.push(data);
                            oldInvoiceTotal += (data.totalAmount || 0);
                            oldPaymentType = data.paymentType;
                            oldSupplierId = data.supplierId || '';
                            if (data.createdAt) oldCreatedAt = data.createdAt;
                        }
                    }
                }

                const newItemsWithCats = cartItems.map(item => {
                    const catDoc = categories.find(c => c.name.trim() === item.categoryName.trim() || c.linkedSection?.trim() === item.categoryName.trim());
                    // Generate a temp ID for new categories to track them
                    const catId = catDoc ? catDoc.id : ('new_' + item.categoryName.trim());
                    return { ...item, catId, isNewCat: !catDoc };
                });

                const stockDeltas = {};
                for (const old of oldItems) {
                    if (old.categoryId) {
                        stockDeltas[old.categoryId] = (stockDeltas[old.categoryId] || 0) - (old.quantity || 0);
                    }
                }
                
                if (invoiceStatus === 'completed') {
                    for (const item of newItemsWithCats) {
                        stockDeltas[item.catId] = (stockDeltas[item.catId] || 0) + (item.quantity || 0);
                    }
                }

                const supplierDeltas = {};
                if (oldPaymentType === 'credit' && oldSupplierId) {
                    supplierDeltas[oldSupplierId] = (supplierDeltas[oldSupplierId] || 0) - oldInvoiceTotal;
                }
                if (invoiceStatus === 'completed' && paymentType === 'credit' && selectedSupplierId) {
                    supplierDeltas[selectedSupplierId] = (supplierDeltas[selectedSupplierId] || 0) + invoiceTotal;
                }

                let netCashboxOutflow = 0;
                if (oldPaymentType === 'cash') netCashboxOutflow -= oldInvoiceTotal;
                if (invoiceStatus === 'completed' && paymentType === 'cash') netCashboxOutflow += invoiceTotal;

                // --- PHASE 2: ALL READS ---
                const categorySnaps = {};
                for (const item of newItemsWithCats) {
                    if (!item.isNewCat) {
                        const ref = doc(db, 'card_categories', item.catId);
                        if (!categorySnaps[item.catId]) categorySnaps[item.catId] = { ref, snap: await transaction.get(ref) };
                    }
                }
                for (const catId of Object.keys(stockDeltas)) {
                    if (!catId.startsWith('new_') && stockDeltas[catId] !== 0 && !categorySnaps[catId]) {
                        const ref = doc(db, 'card_categories', catId);
                        categorySnaps[catId] = { ref, snap: await transaction.get(ref) };
                    }
                }

                const supplierSnaps = {};
                for (const suppId of Object.keys(supplierDeltas)) {
                    if (supplierDeltas[suppId] !== 0) {
                        const ref = doc(db, 'card_suppliers', suppId);
                        supplierSnaps[suppId] = { ref, snap: await transaction.get(ref) };
                    }
                }

                // --- PHASE 3: ALL WRITES ---
                // 1. Delete old docs
                for (const ref of oldDocsToDelete) transaction.delete(ref);

                // 2. Map new categories to their actual Firestore IDs before saving
                const newCatRefs = {};
                if (invoiceStatus === 'completed') {
                    for (const item of newItemsWithCats) {
                        if (item.isNewCat && !newCatRefs[item.catId]) {
                            const newCatRef = doc(collection(db, 'card_categories'));
                            transaction.set(newCatRef, {
                                tenantId,
                                name: item.categoryName,
                                wholesalePrice: item.unitPrice,
                                retailPrice: item.unitPrice * 1.05,
                                availableCount: item.quantity,
                                createdAt: Date.now()
                            });
                            newCatRefs[item.catId] = newCatRef.id;

                            const stockLogRef = doc(collection(db, 'card_stock_logs'));
                            transaction.set(stockLogRef, {
                                tenantId,
                                categoryId: newCatRef.id,
                                categoryName: item.categoryName,
                                quantityAdded: item.quantity,
                                userName: staffName,
                                additionDate: \`\${dateStr} \${timeStr}\`,
                                availableCountAfter: item.quantity,
                                notes: \`إنشاء صنف جديد - فاتورة مشتريات #\${nextInvoiceNumber}\`,
                                createdAt: Date.now()
                            });
                        }
                    }
                }

                // 3. Create new purchase docs
                for (const item of newItemsWithCats) {
                    const finalCatId = item.isNewCat ? newCatRefs[item.catId] : item.catId;
                    const purchaseRef = doc(collection(db, 'card_purchases'));
                    transaction.set(purchaseRef, {
                        tenantId,
                        categoryId: finalCatId || '',
                        categoryName: item.categoryName,
                        quantity: item.quantity,
                        purchaseType: 'supplier',
                        paymentType,
                        supplierId: selectedSupplierId || '',
                        supplierName: selectedSupplier ? selectedSupplier.name : 'مورد نقدي عام',
                        unitPrice: item.unitPrice,
                        totalAmount: item.totalAmount,
                        month: yearMonth,
                        date: dateStr,
                        dateTime: \`\${dateStr} \${timeStr}\`,
                        userName: staffName,
                        sellerName: staffName,
                        createdByName: staffName,
                        invoiceNumber: nextInvoiceNumber,
                        status: invoiceStatus,
                        notes: notes.trim(),
                        createdAt: oldDocsToDelete.length > 0 ? oldCreatedAt : Date.now()
                    });
                }

                // 4. Update existing categories stock
                if (invoiceStatus === 'completed') {
                    for (const catId of Object.keys(stockDeltas)) {
                        if (catId.startsWith('new_')) continue; // Handled above
                        
                        const delta = stockDeltas[catId];
                        if (delta !== 0 && categorySnaps[catId] && categorySnaps[catId].snap.exists()) {
                            const catRef = categorySnaps[catId].ref;
                            const catData = categorySnaps[catId].snap.data();
                            const currentStock = catData.availableCount || 0;
                            const newStock = currentStock + delta;
                            
                            const catUpdate = { availableCount: newStock, updatedAt: Date.now() };
                            const matchingItem = newItemsWithCats.find(i => i.catId === catId);
                            if (matchingItem && autoUpdateCostPrice && matchingItem.unitPrice > 0) {
                                catUpdate.wholesalePrice = matchingItem.unitPrice;
                            }
                            transaction.update(catRef, catUpdate);

                            const stockLogRef = doc(collection(db, 'card_stock_logs'));
                            transaction.set(stockLogRef, {
                                tenantId,
                                categoryId: catId,
                                categoryName: catData.name || 'فئة كروت',
                                quantityAdded: delta,
                                userName: staffName,
                                additionDate: \`\${dateStr} \${timeStr}\`,
                                availableCountAfter: newStock,
                                notes: oldDocsToDelete.length > 0 ? \`تسوية كمية (تعديل فاتورة مشتريات #\${nextInvoiceNumber})\` : \`فاتورة مشتريات #\${nextInvoiceNumber}\`,
                                createdAt: Date.now()
                            });
                        }
                    }

                    // 5. Update supplier balances
                    for (const suppId of Object.keys(supplierDeltas)) {
                        const delta = supplierDeltas[suppId];
                        if (delta !== 0 && supplierSnaps[suppId] && supplierSnaps[suppId].snap.exists()) {
                            const suppRef = supplierSnaps[suppId].ref;
                            const currentBalance = supplierSnaps[suppId].snap.data().balance || 0;
                            transaction.update(suppRef, {
                                balance: currentBalance + delta,
                                updatedAt: Date.now()
                            });
                        }
                    }

                    // 6. Apply cashbox diff
                    if (netCashboxOutflow !== 0) {
                        const cashboxRef = doc(collection(db, 'card_cashbox'));
                        const isIncome = netCashboxOutflow < 0; 
                        const absAmount = Math.abs(netCashboxOutflow);
                        
                        transaction.set(cashboxRef, {
                            tenantId,
                            type: isIncome ? 'manual_in' : 'supplier_purchase_cash',
                            title: oldDocsToDelete.length > 0 ? \`تسوية تعديل فاتورة مشتريات #\${nextInvoiceNumber} (فارق السعر)\` : \`فاتورة شراء كروت نقدية (\${totalCardsQty} كارت)\`,
                            amount: absAmount,
                            isIncome: isIncome,
                            date: dateStr,
                            dateTime: \`\${dateStr} \${timeStr}\`,
                            userName: staffName,
                            createdAt: Date.now()
                        });
                    }

                    // 7. Notification
                    if (oldDocsToDelete.length === 0) {
                        const notifRef = doc(collection(db, 'notifications'));
                        transaction.set(notifRef, {
                            tenantId,
                            type: 'invoice_created',
                            invoiceType: 'card_purchase',
                            invoiceNumber: String(nextInvoiceNumber),
                            amount: invoiceTotal,
                            createdById: appUser?.uid || '',
                            createdByName: staffName,
                            createdByRole: appUser?.role || 'user',
                            recipientRole: 'admin',
                            createdAt: Date.now(),
                            read: false,
                            title: \`🧾 فاتورة شراء كروت جديدة #\${nextInvoiceNumber}\`,
                            body: \`قام المستخدم (\${staffName}) بإنشاء فاتورة شراء كروت بمبلغ \${invoiceTotal.toLocaleString('ar-SA')} ريال يمني\`
                        });
                    }
                }
            });
`;

writeFileSync(pPath, pContent.slice(0, pStart) + replacementCode + pContent.slice(pEnd));
console.log("Purchase replaced successfully");

