const fs = require('fs');

let code = fs.readFileSync('src/pages/NetworkCards.tsx', 'utf8');

code = code.replace(
    /<CardSaleModal\n\s+isOpen={!!saleModalCategory}/g,
    '<CardSaleModal\n                    prefetchedCategories={categories}\n                    isOpen={!!saleModalCategory}'
);

fs.writeFileSync('src/pages/NetworkCards.tsx', code);
console.log('patched NetworkCards.tsx');
