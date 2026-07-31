import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# Let's fix the calls in the Purchases section (between SECTION 1 and SECTION 2)
start_idx = content.find("{/* SECTION 1: الموردين والمشتريات (Purchases) */}")
end_idx = content.find("{/* SECTION 2: فئات الكروت (Card Categories) */}")

purchases_section = content[start_idx:end_idx]

purchases_section = purchases_section.replace("setIsVoucherModalOpen", "setIsPurchaseVoucherModalOpen")
purchases_section = purchases_section.replace("setVoucherType", "setPurchaseVoucherType")
purchases_section = purchases_section.replace("setVoucherSupplierId", "setPurchaseVoucherSupplierId")
purchases_section = purchases_section.replace("isVoucherModalOpen", "isPurchaseVoucherModalOpen")
purchases_section = purchases_section.replace("voucherType", "purchaseVoucherType")

new_content = content[:start_idx] + purchases_section + content[end_idx:]

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(new_content)
