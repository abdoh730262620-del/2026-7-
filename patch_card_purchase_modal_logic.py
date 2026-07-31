with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

old_stock_update = """                if (catDoc) {
                    await updateDoc(doc(db, 'card_categories', catDoc.id), {
                        availableCount: catDoc.availableCount - item.quantity,
                        updatedAt: Date.now()
                    });
                } else {
                    // Create category doc if missing
                    await addDoc(collection(db, 'card_categories'), {
                        tenantId,
                        name: item.categoryName,
                        wholesalePrice: item.purchaseType === 'wholesale' ? item.unitPrice : 0,
                        retailPrice: item.purchaseType === 'retail' ? item.unitPrice : 0,
                        availableCount: 0,
                        createdAt: Date.now()
                    });
                }"""

new_stock_update = """                let newStock = item.quantity;
                if (catDoc) {
                    newStock = (catDoc.availableCount || 0) + item.quantity;
                    await updateDoc(doc(db, 'card_categories', catDoc.id), {
                        availableCount: newStock,
                        updatedAt: Date.now()
                    });
                } else {
                    // Create category doc if missing
                    const newCatRef = await addDoc(collection(db, 'card_categories'), {
                        tenantId,
                        name: item.categoryName,
                        wholesalePrice: item.purchaseType === 'wholesale' ? item.unitPrice : 0,
                        retailPrice: item.purchaseType === 'retail' ? item.unitPrice : 0,
                        availableCount: item.quantity,
                        createdAt: Date.now()
                    });
                    newStock = item.quantity;
                }

                // Add stock log
                await addDoc(collection(db, 'card_stock_logs'), {
                    tenantId,
                    categoryId: catDoc ? catDoc.id : '',
                    categoryName: item.categoryName,
                    quantityAdded: item.quantity,
                    userName: staffName,
                    additionDate: `${dateStr} ${timeStr}`,
                    availableCountAfter: newStock
                });"""

if old_stock_update in content:
    content = content.replace(old_stock_update, new_stock_update)
    print("Successfully replaced stock update logic")
else:
    print("Could not find old stock update block")

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)
