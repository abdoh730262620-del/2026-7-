import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

target1 = """                                            title: `مشتريات كروت (${sale.categoryName}) - عدد ${sale.quantity} (${isCredit ? 'آجل' : 'نقدي'})`,
                                            credit: isCredit ? (sale.totalAmount || 0) : 0, // Credit increases what we owe them if credit
                                            ref: sale.id.slice(-6).toUpperCase(),"""

replacement1 = """                                            title: `مشتريات كروت (${sale.categoryName}) - عدد ${sale.quantity} (${isCredit ? 'آجل' : 'نقدي'})`,
                                            debit: 0,
                                            credit: isCredit ? (sale.totalAmount || 0) : 0, // Credit increases what we owe them if credit
                                            ref: sale.id.slice(-6).toUpperCase(),"""

content = content.replace(target1, replacement1)

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
