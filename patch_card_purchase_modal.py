import sys

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

# Imports
content = content.replace("import { CardCategory, CardDistributor }", "import { CardCategory, CardSupplier }")

# Component name
content = content.replace("CardSaleModal", "CardPurchaseModal")
content = content.replace("CardSaleModalProps", "CardPurchaseModalProps")

# State & Variables
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

# Text replacements
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

# Remove negative stock warning
import re
content = re.sub(r'const \[negativeStockWarning, setNegativeStockWarning\][^;]*;', '', content)
content = re.sub(r'\{/\* Negative Stock Warning Modal \*/\}.*?(\{\/\* Payment Modal \*/\})', r'\1', content, flags=re.DOTALL)
content = content.replace("if (negativeStockWarning) return null;", "")

# Add to cart logic modification
# In Sales: it checks for negative stock.
# In Purchase: no such check needed.
target_add_cart = """        const stockDiff = mainCat.availableCount - parsedQty;

        if (stockDiff < 0) {
            setNegativeStockWarning({
                isOpen: true,
                categoryName: selectedCategoryName,
                requestedQty: parsedQty,
                availableStock: mainCat.availableCount,
                pendingItem: newItem
            });
            return;
        }"""
content = content.replace(target_add_cart, "")

target_add_cart2 = """    const confirmAddWithNegativeStock = () => {
        if (negativeStockWarning?.pendingItem) {
            setCartItems([...cartItems, negativeStockWarning.pendingItem]);
        }
        setNegativeStockWarning(null);
        resetRow();
    };"""
content = content.replace(target_add_cart2, "")

# Remove retail/wholesale radio buttons since purchase doesn't need them
# Actually, purchase uses a unified cost price
target_sale_type_ui = """                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">نوع البيع</label>
                                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                                        <button
                                            type="button"
                                            onClick={() => setPurchaseType('retail')}
                                            className={`flex-1 text-xs font-black py-2 rounded-lg transition-all ${
                                                purchaseType === 'retail' 
                                                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                                            }`}
                                        >
                                            تجزئة
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPurchaseType('wholesale')}
                                            className={`flex-1 text-xs font-black py-2 rounded-lg transition-all ${
                                                purchaseType === 'wholesale' 
                                                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm' 
                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                                            }`}
                                        >
                                            جملة
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPurchaseType('supplier')}
                                            className={`flex-1 text-xs font-black py-2 rounded-lg transition-all ${
                                                purchaseType === 'supplier' 
                                                ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm' 
                                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                                            }`}
                                        >
                                            مورد
                                        </button>
                                    </div>
                                </div>"""

# Replace it with just the supplier selection logic if we need to track supplier per item? 
# Usually purchase has ONE supplier for the whole invoice. The user wants "same design as selling cards".
# In selling cards, payment modal asks for distributor if it's 'distributor' saleType.
# Let's just remove the sale type selector and fix unit price to "سعر التكلفة" (Cost Price).
content = content.replace(target_sale_type_ui, "")

# Fix useEffect for price updating
content = content.replace("""        if (purchaseType === 'retail') {
            setUnitPrice(foundDefault?.retailPrice || 0);
            setSelectedSupplierForAdding(null);
        } else if (purchaseType === 'wholesale') {
            setUnitPrice(foundDefault?.wholesalePrice || 0);
            setSelectedSupplierForAdding(null);
        } else {
            setUnitPrice(foundDefault?.wholesalePrice || 0);
        }""", """        setUnitPrice(foundDefault?.wholesalePrice || 0);""")

content = content.replace("نوع الشراء", "نوع الشراء") # If it's used elsewhere

# Finalizing the invoice (Checkout)
# Stock update: New Stock = old + qty (NOT - qty)
content = content.replace("availableCount: Math.max(0, cat.availableCount - item.quantity),", "availableCount: cat.availableCount + item.quantity,")

# Record Stock Logs
content = content.replace("""                    quantityAdded: -item.quantity, // Negative for sale""", """                    quantityAdded: item.quantity,""")
content = content.replace("""                    availableCountAfter: Math.max(0, cat.availableCount - item.quantity)""", """                    availableCountAfter: cat.availableCount + item.quantity""")

# Cashbox Income
content = content.replace("isIncome: true,", "isIncome: false,")
content = content.replace("isIncome: false, // For credit, no cash enters cashbox", "isIncome: false,")
content = content.replace("sale_cash", "purchase_cash")
content = content.replace("sale_credit", "purchase_credit")
content = content.replace("مبيعات", "مشتريات")

# Supplier Debt Update
# Supplier balance: positive = we owe them.
# If we buy on credit, we owe them more -> balance + totalAmount.
content = content.replace("const newBalance = supp.balance + (totalAmount - commissionAmount);", "const newBalance = supp.balance + totalAmount;")

# Record purchase invoice
target_addDoc = """                await addDoc(collection(db, 'card_purchases'), {
                    tenantId,
                    categoryName: item.categoryName,
                    categoryId: item.categoryId || '',
                    quantity: item.quantity,
                    purchaseType: item.purchaseType,
                    paymentType,
                    supplierId: selectedSupplierId || null,
                    supplierName: supp?.name || null,
                    unitPrice: item.unitPrice,
                    commissionPercent,
                    commissionAmount,
                    totalAmount: item.totalAmount,
                    netTotal: item.totalAmount - commissionAmount,
                    month: dateStr.substring(0, 7),
                    date: dateStr,
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: staffName
                });"""
replacement_addDoc = """                await addDoc(collection(db, 'card_purchases'), {
                    tenantId,
                    categoryName: item.categoryName,
                    categoryId: item.categoryId || '',
                    quantity: item.quantity,
                    purchaseType: 'supplier',
                    paymentType,
                    supplierId: selectedSupplierId || null,
                    supplierName: supp?.name || null,
                    unitPrice: item.unitPrice,
                    totalAmount: item.totalAmount,
                    month: dateStr.substring(0, 7),
                    date: dateStr,
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: staffName
                });"""
content = content.replace(target_addDoc, replacement_addDoc)

# Supplier dropdown logic in payment modal
content = content.replace("""                            {hasDistributorItems && (""", """                            {true && (""")
content = content.replace("""!hasDistributorItems""", "false")
content = content.replace("""const hasDistributorItems = cartItems.some(i => i.purchaseType === 'supplier');""", "")

# Fix UI text for payment modal
content = content.replace("طريقة الدفع للمورد", "طريقة دفع المشتريات")
content = content.replace("إجمالي المشتريات المستحق", "إجمالي قيمة المشتريات")
content = content.replace("استلام وتسجيل", "دفع وتسجيل")
content = content.replace("تسجيل المشتريات الآجلة", "تسجيل المشتريات الآجلة")

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)
