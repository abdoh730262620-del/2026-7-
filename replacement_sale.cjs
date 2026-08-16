const { readFileSync, writeFileSync } = require('fs');

const pPath = 'src/components/CardSaleModal.tsx';
let pContent = readFileSync(pPath, 'utf8');

const startBlock = "            await runTransaction(db, async (transaction) => {";
const endBlock = "            // Trigger action modal with full compiled invoice";

let pStart = pContent.indexOf(startBlock);
let pEnd = pContent.indexOf(endBlock);

if (pStart === -1 || pEnd === -1) {
    console.error("Could not find block in SaleModal");
    process.exit(1);
}

const replacementCode = `            await runTransaction(db, async (transaction) => {
                // --- PHASE 1: COMPUTE DELTAS AND COLLECT OLD DATA ---
                let oldInvoiceTotal = 0;
                let oldPaymentType = '';
                let oldDistributorId = '';
                const oldItems = [];
                const oldDocsToDelete = [];
                let oldCreatedAt = Date.now();
                
                if (editingInvoice && editingInvoice.docIds) {
                    for (const docId of editingInvoice.docIds) {
                        const oldDocRef = doc(db, 'card_sales', docId);
                        const oldDocSnap = await transaction.get(oldDocRef);
                        if (oldDocSnap.exists() && oldDocSnap.data().status !== 'cancelled') {
                            const data = oldDocSnap.data();
                            oldDocsToDelete.push(oldDocRef);
                            oldItems.push(data);
                            oldInvoiceTotal += (data.netTotal || data.totalAmount || 0);
                            oldPaymentType = data.paymentType;
                            oldDistributorId = data.distributorId || '';
                            if (data.createdAt) oldCreatedAt = data.createdAt;
                        }
                    }
                }

                const newItemsWithCats = cartItems.map(item => {
                    const catDoc = categories.find(c => c.name.trim() === item.categoryName.trim() || c.linkedSection?.trim() === item.categoryName.trim());
                    const catId = catDoc ? catDoc.id : ('new_' + item.categoryName.trim());
                    return { ...item, catId, isNewCat: !catDoc };
                });

                const stockDeltas = {};
                // When we cancel/delete a sale, stock GOES UP
                for (const old of oldItems) {
                    if (old.categoryId) {
                        stockDeltas[old.categoryId] = (stockDeltas[old.categoryId] || 0) + (old.quantity || 0);
                    }
                }
                
                // When we add a new sale, stock GOES DOWN
                if (invoiceStatus === 'completed') {
                    for (const item of newItemsWithCats) {
                        stockDeltas[item.catId] = (stockDeltas[item.catId] || 0) - (item.quantity || 0);
                    }
                }

                const distributorDeltas = {};
                // If old was credit, cancelling it means the distributor owes LESS (subtract oldInvoiceTotal)
                if (oldPaymentType === 'credit' && oldDistributorId) {
                    distributorDeltas[oldDistributorId] = (distributorDeltas[oldDistributorId] || 0) - oldInvoiceTotal;
                }
                // If new is credit, new sale means the distributor owes MORE (add netTotal)
                if (invoiceStatus === 'completed' && paymentType === 'credit' && selectedDistributorId) {
                    distributorDeltas[selectedDistributorId] = (distributorDeltas[selectedDistributorId] || 0) + netTotal;
                }

                let netCashboxInflow = 0;
                // Old cash sale cancelled = cash goes OUT
                if (oldPaymentType === 'cash') netCashboxInflow -= oldInvoiceTotal;
                // New cash sale = cash goes IN
                if (invoiceStatus === 'completed' && paymentType === 'cash') netCashboxInflow += netTotal;

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

                const distributorSnaps = {};
                for (const distId of Object.keys(distributorDeltas)) {
                    if (distributorDeltas[distId] !== 0) {
                        const ref = doc(db, 'card_distributors', distId);
                        distributorSnaps[distId] = { ref, snap: await transaction.get(ref) };
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
                                wholesalePrice: item.saleType === 'wholesale' ? item.unitPrice : 0,
                                retailPrice: item.saleType === 'retail' ? item.unitPrice : 0,
                                availableCount: 0, // Gets updated by stock delta below
                                createdAt: Date.now()
                            });
                            newCatRefs[item.catId] = newCatRef.id;
                        }
                    }
                }

                // 3. Create new sale docs
                for (const item of newItemsWithCats) {
                    const finalCatId = item.isNewCat ? newCatRefs[item.catId] : item.catId;
                    
                    const itemTotal = item.quantity * item.unitPrice;
                    const itemProportion = invoiceTotal > 0 ? (itemTotal / invoiceTotal) : 0;
                    const itemDiscount = discountAmount * itemProportion;
                    const itemCommission = commissionPercent > 0 ? (itemTotal * commissionPercent) / 100 : 0;
                    const itemNetTotal = itemTotal - itemDiscount - itemCommission;

                    const saleRef = doc(collection(db, 'card_sales'));
                    transaction.set(saleRef, {
                        tenantId,
                        categoryId: finalCatId || '',
                        categoryName: item.categoryName,
                        quantity: item.quantity,
                        saleType: item.saleType,
                        paymentType,
                        distributorId: selectedDistributorId || '',
                        distributorName: selectedDistributor ? selectedDistributor.name : 'عميل نقدي',
                        unitPrice: item.unitPrice,
                        commissionPercent,
                        commissionAmount: itemCommission,
                        totalAmount: item.totalAmount,
                        netTotal: itemNetTotal,
                        month: yearMonth,
                        monthNum: now.getMonth() + 1,
                        yearNum: now.getFullYear(),
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
                        const delta = stockDeltas[catId];
                        
                        let finalCatId = catId;
                        let catData = { name: 'فئة كروت', availableCount: 0 };
                        let catRef;
                        let isNew = false;
                        
                        if (catId.startsWith('new_')) {
                            finalCatId = newCatRefs[catId];
                            catRef = doc(db, 'card_categories', finalCatId);
                            catData.name = catId.replace('new_', '');
                            isNew = true;
                        } else {
                            if (categorySnaps[catId] && categorySnaps[catId].snap.exists()) {
                                catRef = categorySnaps[catId].ref;
                                catData = categorySnaps[catId].snap.data();
                            } else {
                                continue;
                            }
                        }
                        
                        if (delta !== 0) {
                            const currentStock = catData.availableCount || 0;
                            const newStock = currentStock + delta; // Note: delta is negative for sales, so this correctly reduces stock.
                            
                            // We only update if it's an existing category. For new categories, we just set the availableCount when creating it, but wait, we initialized it to 0 above! So we SHOULD update it here.
                            transaction.update(catRef, {
                                availableCount: newStock,
                                updatedAt: Date.now()
                            });

                            const stockLogRef = doc(collection(db, 'card_stock_logs'));
                            transaction.set(stockLogRef, {
                                tenantId,
                                categoryId: finalCatId,
                                categoryName: catData.name,
                                quantityAdded: delta, // Will be negative for sales
                                userName: staffName,
                                additionDate: \`\${dateStr} \${timeStr}\`,
                                availableCountAfter: newStock,
                                notes: oldDocsToDelete.length > 0 ? \`تسوية مبيعات (تعديل فاتورة #\${nextInvoiceNumber})\` : \`فاتورة مبيعات كروت #\${nextInvoiceNumber}\`,
                                createdAt: Date.now()
                            });
                        }
                    }

                    // 5. Update distributor balances
                    for (const distId of Object.keys(distributorDeltas)) {
                        const delta = distributorDeltas[distId];
                        if (delta !== 0 && distributorSnaps[distId] && distributorSnaps[distId].snap.exists()) {
                            const suppRef = distributorSnaps[distId].ref;
                            const currentBalance = distributorSnaps[distId].snap.data().balance || 0;
                            transaction.update(suppRef, {
                                balance: currentBalance + delta,
                                updatedAt: Date.now()
                            });
                        }
                    }

                    // 6. Apply cashbox diff
                    if (netCashboxInflow !== 0) {
                        const cashboxRef = doc(collection(db, 'card_cashbox'));
                        const isIncome = netCashboxInflow > 0; 
                        const absAmount = Math.abs(netCashboxInflow);
                        
                        transaction.set(cashboxRef, {
                            tenantId,
                            type: isIncome ? 'cash_sale' : 'manual_out',
                            title: oldDocsToDelete.length > 0 ? \`تسوية تعديل فاتورة مبيعات #\${nextInvoiceNumber} (فارق السعر)\` : \`فاتورة بيع كروت نقدية (\${totalCardsQty} كارت)\`,
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
                            invoiceType: 'card_sale',
                            invoiceNumber: String(nextInvoiceNumber),
                            amount: netTotal,
                            createdById: appUser?.uid || '',
                            createdByName: staffName,
                            createdByRole: appUser?.role || 'user',
                            recipientRole: 'admin',
                            createdAt: Date.now(),
                            read: false,
                            title: \`🧾 فاتورة مبيعات كروت جديدة #\${nextInvoiceNumber}\`,
                            body: \`قام المستخدم (\${staffName}) بإنشاء فاتورة مبيعات بمبلغ \${netTotal.toLocaleString('ar-SA')} ريال يمني\`
                        });
                    }
                }
            });
`;

writeFileSync(pPath, pContent.slice(0, pStart) + replacementCode + pContent.slice(pEnd));
console.log("Sale replaced successfully");
