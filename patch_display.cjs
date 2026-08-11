const fs = require('fs');
let code = fs.readFileSync('src/components/CardPurchaseModal.tsx', 'utf8');

const regex = /\/\/ Available categories display list \(\w+.*?\n\s+const displayCategories = DEFAULT_DENOMINATIONS\.map\(denom => \{[\s\S]*?\}\);/m;
const replacement = `// Available categories display list (from default 8 network card sections + custom categories)
    const displayCategories = (() => {
        const processedNames = new Set<string>();
        const list = DEFAULT_DENOMINATIONS.map(denom => {
            processedNames.add(denom.name.trim());
            const matching = categories.filter(c => c.name.trim() === denom.name.trim() || c.linkedSection?.trim() === denom.name.trim());
            const totalStock = matching.reduce((sum, c) => sum + (c.availableCount || 0), 0);
            const mainCat = matching.find(c => c.name.trim() === denom.name.trim()) || matching[0];
            return {
                id: mainCat?.id,
                name: denom.name,
                retailPrice: mainCat?.retailPrice || denom.retailPrice,
                wholesalePrice: mainCat?.wholesalePrice || denom.wholesalePrice,
                availableCount: totalStock
            };
        });

        categories.forEach(cat => {
            const catName = cat.name?.trim();
            if (catName && !processedNames.has(catName)) {
                processedNames.add(catName);
                const matching = categories.filter(c => c.name.trim() === catName);
                const totalStock = matching.reduce((sum, c) => sum + (c.availableCount || 0), 0);
                list.push({
                    id: cat.id,
                    name: cat.name,
                    retailPrice: cat.retailPrice || 0,
                    wholesalePrice: cat.wholesalePrice || 0,
                    availableCount: totalStock
                });
            }
        });

        return list;
    })();`;

if(code.match(regex)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('src/components/CardPurchaseModal.tsx', code);
    console.log('patched CardPurchaseModal.tsx');
} else {
    console.error('regex not found');
}
