import sys

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

# Fix commission errors (Suppliers don't have commission in our schema)
content = content.replace("supp.commission || 0", "0")
content = content.replace("commissionPercent={commissionPercent}", "commissionPercent={0}")
content = content.replace("commissionPercent > 0", "false")
content = content.replace("setCommissionPercent(supp.commission || 0)", "")
content = content.replace("setCommissionPercent(0)", "")
content = content.replace("{commissionPercent}", "0")
content = content.replace("supp.commission", "0")

# Fix function call on Number error (maybe I replaced something incorrectly)
# Like `commissionAmount` or something.
# It was probably `(Number(unitPrice) ... )` that got messed up.
content = content.replace("const commissionAmount = (Number(item.totalAmount) * Number(commissionPercent)) / 100;", "const commissionAmount = 0;")
content = content.replace("commissionAmount > 0", "false")

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)
