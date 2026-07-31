import sys

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { CardCategory, CardDistributor }", "import { CardCategory, CardSupplier }")
content = content.replace("CardSaleModal", "CardPurchaseModal")
content = content.replace("CardDistributor", "CardSupplier")
content = content.replace("distributors", "suppliers")
content = content.replace("setDistributors", "setSuppliers")
content = content.replace("card_distributors", "card_suppliers")
content = content.replace("card_sales", "card_purchases")

content = content.replace("saleType", "purchaseType")
content = content.replace("setSaleType", "setPurchaseType")
content = content.replace("selectedDistributorForAdding", "selectedSupplierForAdding")
content = content.replace("setSelectedDistributorForAdding", "setSelectedSupplierForAdding")
content = content.replace("selectedDistributorId", "selectedSupplierId")
content = content.replace("setSelectedDistributorId", "setSelectedSupplierId")
content = content.replace("distributorSearch", "supplierSearch")
content = content.replace("setDistributorSearch", "setSupplierSearch")
content = content.replace("showDistributorDropdown", "showSupplierDropdown")
content = content.replace("setShowDistributorDropdown", "setShowSupplierDropdown")
content = content.replace("hasDistributorItems", "hasSupplierItems")

content = content.replace("نافذة بيع الكروت", "نافذة شراء الكروت")
content = content.replace("إضافة للسلة", "إضافة للمشتريات")
content = content.replace("إتمام البيع", "إتمام الشراء")
content = content.replace("البيع", "الشراء")
content = content.replace("الموزع", "المورد")
content = content.replace("موزع", "مورد")
content = content.replace("الموزعين", "الموردين")
content = content.replace("عميل", "مورد")
content = content.replace("العميل", "المورد")
content = content.replace("مبيعات كروت", "مشتريات كروت")

# Replace negative stock warning logic safely (we can just leave it there but make it never trigger for purchases since we are adding stock, not removing)
# Actually, the logic in handleAddToCart says:
# const stockDiff = mainCat.availableCount - parsedQty;
# if (stockDiff < 0) { ... setNegativeStockWarning ... }
# In purchases, we INCREASE stock, so stockDiff should be something else. Or we can just bypass it.
content = content.replace("const stockDiff = mainCat.availableCount - parsedQty;\n\n        if (stockDiff < 0) {", "const stockDiff = mainCat.availableCount - parsedQty;\n\n        if (false) { // No negative stock check for purchases")

# When finalizing purchase:
content = content.replace("availableCount: Math.max(0, cat.availableCount - item.quantity),", "availableCount: cat.availableCount + item.quantity,")
content = content.replace("quantityAdded: -item.quantity,", "quantityAdded: item.quantity,")
content = content.replace("availableCountAfter: Math.max(0, cat.availableCount - item.quantity)", "availableCountAfter: cat.availableCount + item.quantity")

# Cashbox Income
content = content.replace("isIncome: true,", "isIncome: false,")
content = content.replace("isIncome: false, // For credit, no cash enters cashbox", "isIncome: false,")
content = content.replace("sale_cash", "purchase_cash")
content = content.replace("sale_credit", "purchase_credit")
content = content.replace("مبيعات", "مشتريات")

# Supplier Debt Update
# Supplier balance: positive = we owe them.
content = content.replace("const newBalance = supp.balance + (totalAmount - commissionAmount);", "const newBalance = (supp.balance || 0) + totalAmount;")

# Record purchase invoice
# In `CardSaleModal.tsx` it says:
# supplierId: selectedSupplierId || null,
# supplierName: supp?.name || null,
# Wait, initially it was:
# distributorId: selectedDistributorId || null,
# distributorName: dist?.name || null,

# Since I replaced distributor with supplier globally:
# supplierId: selectedSupplierId || null,
# supplierName: supp?.name || null,
content = content.replace("netTotal: item.totalAmount - commissionAmount,", "")
content = content.replace("commissionAmount,", "")
content = content.replace("commissionPercent,", "")

# UI adjustments
content = content.replace("طريقة الدفع للمورد", "طريقة دفع المشتريات")
content = content.replace("إجمالي المشتريات المستحق", "إجمالي قيمة المشتريات")
content = content.replace("استلام وتسجيل", "دفع وتسجيل")

# Remove sale type selector and force 'supplier' type and cost price
# I'll just change the default purchaseType to 'supplier' and remove the buttons UI for it.
content = content.replace("useState<'retail' | 'wholesale' | 'supplier'>('retail')", "useState<'supplier'>('supplier')")

# Wait, `foundDefault?.retailPrice` might be used for unit price. Let's just use wholesale price as default cost.
content = content.replace("setUnitPrice(foundDefault?.retailPrice || 0)", "setUnitPrice(foundDefault?.wholesalePrice || 0)")

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)

