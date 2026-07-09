import fs from 'fs';

for (const file of ['src/pages/Sales.tsx', 'src/pages/Purchases.tsx', 'src/pages/Quotations.tsx']) {
    let content = fs.readFileSync(file, 'utf-8');
    content = content.replace('{confirmDialog.isOpen && (', '');
    content = content.replace('{isSaving && (', '');
    fs.writeFileSync(file, content);
}
