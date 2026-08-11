const fs = require('fs');
let code = fs.readFileSync('src/pages/CardsManagement.tsx', 'utf8');

const insertedStr = '<CardSaleModal\n                    prefetchedCategories={categories}\n                    prefetchedDistributors={distributors}\n                    isOpen={!!saleModalCategory || isCardSaleModalOpen}\n                    editingInvoice={editingCardSale}';

// Since the regex matched the empty string everywhere, it inserted this string between every character, except where it actually matched the left or right side of the OR.
// Wait, if it matched the empty string, the characters of the original file are just separated by `insertedStr`.
// Let's just split by `insertedStr` and join with empty string?
// But wait, the original file had ONE instance where we WANTED it to be replaced.
// And it also replaced the left side and right side of the OR.
// Let's first just do a global replace of `insertedStr` with empty string.
// That will leave the original file, BUT the original `<CardSaleModal\n  isOpen={!!saleModalCategory...` was matched by the left side, so it was replaced by `insertedStr`. When we remove `insertedStr`, that part will be DELETED completely!
// And the right side ` isCardSaleModalOpen}\n  editingInvoice={editingCardSale}` was also matched and replaced, so it will be DELETED completely!

// Let's just look at the file length.
console.log("Length before:", code.length);
code = code.split(insertedStr).join('');
console.log("Length after:", code.length);

fs.writeFileSync('src/pages/CardsManagement.tsx.clean', code);
