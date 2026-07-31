import re

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

# Fix the regex mess I did above
# The problem was probably around negative stock warning removal
content = content.replace("""        const stockDiff = mainCat.availableCount - parsedQty;

        """, "")

# Let's just view line 65-80
