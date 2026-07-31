import sys

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if "const [ // setCommissionPercent] = useState<number>(0);" in line:
        continue
    if "const commissionPercent = 0;" not in line and "commissionPercent" in line:
        # replace any remaining bad jsx
        line = line.replace("{false && (", " ")
        line = line.replace("{'>'}", " ")
    
    new_lines.append(line)

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.writelines(new_lines)
