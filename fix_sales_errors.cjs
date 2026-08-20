const fs = require('fs');
let content = fs.readFileSync('src/pages/Sales.tsx', 'utf8');

if (!content.includes('import { RefreshCw')) {
    content = content.replace("import { Plus", "import { Plus, RefreshCw");
}

fs.writeFileSync('src/pages/Sales.tsx', content);
