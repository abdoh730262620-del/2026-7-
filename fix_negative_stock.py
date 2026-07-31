import re

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

# Just put the state back so it compiles. It's unused in purchase logic anyway since I removed the condition.
state_back = """
    const [negativeStockWarning, setNegativeStockWarning] = useState<{
        isOpen: boolean;
        categoryName: string;
        requestedQty: number;
        availableStock: number;
        pendingItem?: CartItem;
    } | null>(null);
"""
content = content.replace("    // Fetch Categories & Distributors", state_back + "\n    // Fetch Categories & Distributors")

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)
