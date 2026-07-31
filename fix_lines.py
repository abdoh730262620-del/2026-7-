with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if "categoryName: string;" in line and "requestedQty: number;" in lines[i+1]:
        # skip this and next 4 lines
        continue
    if "requestedQty: number;" in line and "categoryName: string;" in lines[i-1]:
        continue
    if "availableStock: number;" in line and "categoryName: string;" in lines[i-2]:
        continue
    if "pendingItem?: CartItem;" in line and "categoryName: string;" in lines[i-3]:
        continue
    if "} | null>(null);" in line and "categoryName: string;" in lines[i-4]:
        continue
    new_lines.append(line)

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.writelines(new_lines)

