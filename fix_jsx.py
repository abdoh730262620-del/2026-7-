with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    if "نسبة عمولة المورد (%)" in line:
        skip = True
        # remove previous 2 lines if possible
        new_lines.pop()
        new_lines.pop()
        continue
    if skip and "className=\"w-full bg-slate-50" in line:
        continue
    if skip and "/>" in line:
        continue
    if skip and "</div>" in line:
        skip = False
        continue
    if skip:
        continue
    
    new_lines.append(line)

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.writelines(new_lines)

