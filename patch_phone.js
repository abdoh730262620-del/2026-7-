const fs = require('fs');
let content = fs.readFileSync('src/pages/CardsManagement.tsx', 'utf8');
content = content.replace(
    'if (!distNameInput.trim()) return;',
    'if (!distNameInput.trim()) return;\n        if (!distPhoneInput.trim()) {\n            alert("يرجى إدخال رقم هاتف الموزع");\n            return;\n        }'
);
fs.writeFileSync('src/pages/CardsManagement.tsx', content);
