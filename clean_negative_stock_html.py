import re
with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

# I will find the handleConfirmNegativeStock handler and remove it
handler = """    const handleConfirmNegativeStock = () => {
        if (negativeStockWarning?.pendingItem) {
            setCartItems([...cartItems, negativeStockWarning.pendingItem]);
        }
        setNegativeStockWarning(null);
        resetRow();
    };"""
content = content.replace(handler, "")

# And remove the lingering HTML for it. Let's just remove the whole <div> related to it.
import sys
html_part_start = content.find("{/* Payment Modal */}")
if html_part_start != -1:
    # Everything after Payment Modal except the last </div>
    pass

