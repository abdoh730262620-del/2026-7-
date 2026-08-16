const { readFileSync, writeFileSync } = require('fs');
let content = readFileSync('src/components/CardSaleModal.tsx', 'utf8');

content = content.replace(
    /const itemTotal = item.quantity \* item.unitPrice;\n\s*const itemProportion = invoiceTotal > 0 \? \(itemTotal \/ invoiceTotal\) : 0;\n\s*const itemDiscount = discountAmount \* itemProportion;\n\s*const itemCommission = commissionPercent > 0 \? \(itemTotal \* commissionPercent\) \/ 100 : 0;\n\s*const itemNetTotal = itemTotal - itemDiscount - itemCommission;/g,
    `const itemCommission = commissionPercent > 0 ? (item.totalAmount * commissionPercent) / 100 : 0;
                    const itemNetTotal = item.totalAmount - itemCommission;`
);
writeFileSync('src/components/CardSaleModal.tsx', content);
