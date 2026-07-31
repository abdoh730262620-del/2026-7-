import re

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

# I will just replace `supp.commission` with `0`
content = content.replace("supp.commission", "0")
content = content.replace("dist.commission", "0")
content = content.replace("setCommissionPercent(0 || 0)", "")
content = content.replace("setCommissionPercent(supp?.commission || 0)", "")

# Let's fix the callable Number error.
# The code was likely: setCommissionPercent(Number(supp.commission))
# So now it's setCommissionPercent(Number(0))
content = content.replace("setCommissionPercent(Number(0))", "")
content = content.replace("setCommissionPercent(Number(0 || 0))", "")
content = content.replace("setCommissionPercent(Number(supp?.commission || 0))", "")

# The line 244, 289 might refer to `commissionPercent` as a variable.
# Since I removed its state definition, I should re-add `const commissionPercent = 0;` locally, or globally inside the component.
# Wait, I removed `const [commissionPercent, setCommissionPercent] = useState<number>(0);`? No, I might not have.
# Let's just restore `const commissionPercent = 0;` and remove the state setter entirely if it exists.

content = content.replace("const [commissionPercent, setCommissionPercent] = useState<number>(0);", "const commissionPercent = 0;")
content = content.replace("setCommissionPercent", "// setCommissionPercent")

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)
