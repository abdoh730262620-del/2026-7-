const fs = require('fs');
let code = fs.readFileSync('src/pages/CardsManagement.tsx', 'utf8');

const messyString = code.substring(code.indexOf('{(saleModalCategory || isCardSaleModalOpen) && ('), code.indexOf('<CardInvoiceActionModal'));
console.log(messyString);
