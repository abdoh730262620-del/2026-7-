with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

content = content.replace("p.netTotal", "p.totalAmount")
content = content.replace("cashNetTotal", "cashAmountTotal")
content = content.replace("creditNetTotal", "creditAmountTotal")
content = content.replace("totalNet", "totalAmount")

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)

print("Fixed netTotal to totalAmount in CardsManagement.tsx")
