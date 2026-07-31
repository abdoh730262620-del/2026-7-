with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

import re

# Remove any remaining commission references
content = re.sub(r'supp\.commission', '0', content)
content = re.sub(r'dist\.commission', '0', content)
content = re.sub(r'supp\?\.commission', '0', content)
content = re.sub(r'commissionPercent', '0', content)
content = re.sub(r'const 0 = 0;', '', content)

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)

