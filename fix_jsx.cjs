const fs = require('fs');
let content = fs.readFileSync('src/pages/Sales.tsx', 'utf8');

const invalidBlock = `{!isSalesFocusMode && (
                  
<div className="flex bg-bg-main rounded-xl p-0.5 border border-border-main shadow-sm w-max self-start shrink-0">`;
if (content.includes(invalidBlock)) {
    content = content.replace(invalidBlock, `{!isSalesFocusMode && (
                <div className="flex justify-between items-center w-full gap-2 shrink-0">
<div className="flex bg-bg-main rounded-xl p-0.5 border border-border-main shadow-sm w-max self-start shrink-0">`);
    content = content.replace("جاري التحديث...' : 'تحديث البيانات'}\n</button>", "جاري التحديث...' : 'تحديث البيانات'}\n</button>\n</div>");
}
fs.writeFileSync('src/pages/Sales.tsx', content);
