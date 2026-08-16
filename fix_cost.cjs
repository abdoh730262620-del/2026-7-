const { readFileSync, writeFileSync } = require('fs');
let content = readFileSync('src/components/CardPurchaseModal.tsx', 'utf8');

// I also noticed I used unitPrice inside the find for wholesale price, let me check it.
