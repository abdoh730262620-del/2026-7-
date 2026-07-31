import sys
import re

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

# Fix the broken state definition
broken_part = """    // Negative Stock Warning Modal State
            categoryName: string;
        requestedQty: number;
        availableStock: number;
        pendingItem?: CartItem;
    } | null>(null);"""

content = content.replace(broken_part, "")

# Line 883 is probably at the end. Let's see the end.
with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)
