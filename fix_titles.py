import re

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

content = content.replace("فاتورة بيع كروت", "فاتورة شراء كروت")
content = content.replace("selectedDistributor", "selectedSupplier")
content = content.replace("distributorName: selectedSupplier", "supplierName: selectedSupplier")
content = content.replace("type: 'cash_sale'", "type: 'cash_purchase'")

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)
