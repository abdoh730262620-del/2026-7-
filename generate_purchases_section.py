import re

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# Find the start of SECTION 3: الموزعين
start_idx = content.find("{/* SECTION 3: الموزعين (Distributors) */}")
# Find the end of SECTION 3
end_idx = content.find("{/* SECTION 4: المبيعات الشهرية", start_idx)

distributors_section = content[start_idx:end_idx]

# Perform replacements
# Carefully replace terms
purchases_section = distributors_section.replace("{/* SECTION 3: الموزعين (Distributors) */}", "{/* SECTION 1: الموردين والمشتريات (Purchases) */}")
purchases_section = purchases_section.replace("activeSection === 'distributors'", "activeSection === 'purchases'")
purchases_section = purchases_section.replace("distributorSubSection", "purchaseSubSection")
purchases_section = purchases_section.replace("إدارة وحسابات الموزعين", "إدارة وحسابات الموردين")
purchases_section = purchases_section.replace("تتبع كشوفات الحسابات والعمولات والديون السابقة للعملاء والمناديب", "تتبع كشوفات الحسابات والديون السابقة للموردين وفواتير الشراء")
purchases_section = purchases_section.replace("distSections", "suppSections")
purchases_section = purchases_section.replace("حسابات الموزعين", "حسابات الموردين")
purchases_section = purchases_section.replace("عرض وتعديل الموزعين", "عرض وتعديل الموردين")
purchases_section = purchases_section.replace("إدارة وتحديث بيانات الموزعين والعمولات والمناديب", "إدارة وتحديث بيانات الموردين")
purchases_section = purchases_section.replace("فواتير ومردودات", "فواتير ومردودات المشتريات")
purchases_section = purchases_section.replace("إصدار فواتير مبيعات للموزعين أو استرجاع كروت", "إصدار فواتير مشتريات من الموردين أو استرجاع كروت")
purchases_section = purchases_section.replace("إضافة موزع جديد", "إضافة مورد جديد")
purchases_section = purchases_section.replace("selectedDistributorForDetails", "selectedSupplierForDetails")
purchases_section = purchases_section.replace("Distributors Accounts", "Suppliers Accounts")
purchases_section = purchases_section.replace("const dist = selectedSupplierForDetails;", "const supp = selectedSupplierForDetails;")

# ledger replacements
purchases_section = purchases_section.replace("const distSales = sales.filter(s => s.distributorId === dist.id);", "const suppPurchases = purchases.filter(s => s.supplierId === supp.id);")
purchases_section = purchases_section.replace("distSales.forEach(sale => {", "suppPurchases.forEach(sale => {")
purchases_section = purchases_section.replace("sale.categoryName", "sale.categoryName")
purchases_section = purchases_section.replace("مبيعات كروت", "مشتريات كروت")
# debit/credit logic for purchases
purchases_section = purchases_section.replace("debit: isCredit ? (sale.netTotal || 0) : 0, // Debit increases what they owe us if credit", "credit: isCredit ? (sale.totalAmount || 0) : 0, // Credit increases what we owe them if credit")
purchases_section = purchases_section.replace("sale.netTotal", "sale.totalAmount")

purchases_section = purchases_section.replace("const distVouchers = vouchers.filter(v => v.distributorId === dist.id);", "const suppVouchers = purchaseVouchers.filter(v => v.supplierId === supp.id);")
purchases_section = purchases_section.replace("distVouchers.forEach(v => {", "suppVouchers.forEach(v => {")
purchases_section = purchases_section.replace("مستلم من الموزع", "مسترد من المورد")
purchases_section = purchases_section.replace("مصروف للموزع", "مسدد للمورد")
# debit/credit logic for vouchers
purchases_section = purchases_section.replace("debit: isReceipt ? 0 : v.amount, // Payment to them increases what they owe us", "debit: isReceipt ? 0 : v.amount, // Payment to them decreases what we owe them")
purchases_section = purchases_section.replace("credit: isReceipt ? v.amount : 0, // Receipt from them reduces what they owe us", "credit: isReceipt ? v.amount : 0, // Receipt from them increases what we owe them")


# Totals
purchases_section = purchases_section.replace("const totalSalesCredit = distSales.filter(s => s.paymentType === 'credit').reduce((acc, s) => acc + (s.netTotal || 0), 0);", "const totalPurchasesCredit = suppPurchases.filter(s => s.paymentType === 'credit').reduce((acc, s) => acc + (s.totalAmount || 0), 0);")
purchases_section = purchases_section.replace("const totalSalesCash = distSales.filter(s => s.paymentType === 'cash').reduce((acc, s) => acc + (s.netTotal || 0), 0);", "const totalPurchasesCash = suppPurchases.filter(s => s.paymentType === 'cash').reduce((acc, s) => acc + (s.totalAmount || 0), 0);")
purchases_section = purchases_section.replace("totalSalesCredit", "totalPurchasesCredit")
purchases_section = purchases_section.replace("totalSalesCash", "totalPurchasesCash")
purchases_section = purchases_section.replace("إجمالي المبيعات", "إجمالي المشتريات")

purchases_section = purchases_section.replace("setPurchaseSubSection(null); setSelectedSupplierForDetails(null)", "setPurchaseSubSection(null); setSelectedSupplierForDetails(null)")

# Fix the rest of variables
purchases_section = purchases_section.replace("distributors", "suppliers")
purchases_section = purchases_section.replace("distributor", "supplier")
purchases_section = purchases_section.replace("Distributor", "Supplier")
purchases_section = purchases_section.replace("dist.", "supp.")
purchases_section = purchases_section.replace("الموزع", "المورد")
purchases_section = purchases_section.replace("موزع", "مورد")

# Sales & Returns section
purchases_section = purchases_section.replace("إصدار فاتورة مبيعات / مرتجع لمورد", "إصدار فاتورة مشتريات / استرجاع لمورد")
purchases_section = purchases_section.replace("saleIsReturn", "purchaseIsReturn")
purchases_section = purchases_section.replace("setSaleIsReturn", "setPurchaseIsReturn")
purchases_section = purchases_section.replace("saleCategoryId", "purchaseCategoryId")
purchases_section = purchases_section.replace("setSaleCategoryId", "setPurchaseCategoryId")
purchases_section = purchases_section.replace("saleSupplierId", "purchaseSupplierId")
purchases_section = purchases_section.replace("setSaleSupplierId", "setPurchaseSupplierId")
purchases_section = purchases_section.replace("saleQuantity", "purchaseQuantity")
purchases_section = purchases_section.replace("setSaleQuantity", "setPurchaseQuantity")
purchases_section = purchases_section.replace("salePaymentMethod", "purchasePaymentMethod")
purchases_section = purchases_section.replace("setSalePaymentMethod", "setPurchasePaymentMethod")
purchases_section = purchases_section.replace("handleSaveSaleInvoice", "handleSavePurchaseInvoice")

# The purchase cost price field
cost_price_html = """
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">سعر التكلفة للكرت <span className="text-rose-500">*</span></label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        required
                                        value={purchaseCostPrice}
                                        onChange={(e) => setPurchaseCostPrice(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                        placeholder="مثال: 95"
                                    />
                                </div>
"""
purchases_section = purchases_section.replace("                                </div>\n\n                                {/* Payment Method Toggle */}", cost_price_html + "\n                                </div>\n\n                                {/* Payment Method Toggle */}")
purchases_section = purchases_section.replace("const unitPrice = cat.wholesalePrice || 0;", "const unitPrice = parseFloat(purchaseCostPrice) || 0;")

# Modals replacement for add
purchases_section = purchases_section.replace("setIsSupplierModalOpen", "setIsSupplierModalOpen")
purchases_section = purchases_section.replace("handleSaveSupplier", "handleSaveSupplier")

# Replace the whole add_stock section in the original file
add_stock_start = content.find("{/* SECTION 1: إضافة كروت (Add Stock) */}")
add_stock_end = content.find("{/* SECTION 2: فئات الكروت (Card Categories) */}")

new_content = content[:add_stock_start] + purchases_section + "\n            " + content[add_stock_end:]

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(new_content)

print("Generated purchases section successfully!")
