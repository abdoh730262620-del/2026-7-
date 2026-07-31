import re

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

# Just replace `value=0` with `value={0}` for now so it compiles.
content = content.replace("value=0", "value={0}")

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)
