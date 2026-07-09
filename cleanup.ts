import fs from 'fs';

let content = fs.readFileSync('src/pages/Sales.tsx', 'utf-8');

// Header
content = content.replace(
    /<th className="p-3 font-bold uppercase text-\[9px\] tracking-widest text-text-main\/60 border-b border-border-main">التاريخ<\/th>/g,
    ''
);
content = content.replace(
    /<th className="p-3 font-bold uppercase text-\[9px\] tracking-widest text-text-main\/60 border-b border-border-main text-center hidden md:table-cell">الإجراءات<\/th>/g,
    ''
);

// Row start
content = content.replace(
    /<tr className="hover:bg-bg-main transition-colors group cursor-pointer" onClick={\(\) => setActiveDropdownId\(activeDropdownId === invoice\.id \? null : invoice\.id\)}>/g,
    '<tr className="hover:bg-bg-main transition-colors group cursor-pointer" onClick={() => setActiveDropdownId(invoice.id)}>'
);

// Body cells Date + Customer
const dateCustRegex = /<td className="p-3">\s*<div className="flex flex-col">\s*<span className="font-bold text-text-main">\{dateObj\.toLocaleDateString\('ar-EG'\)\}<\/span>\s*<span className="text-\[9px\] font-bold text-text-main\/30 uppercase leading-none mt-0\.5">\{dateObj\.toLocaleTimeString\('ar-EG', \{ hour: '2-digit', minute: '2-digit' \}\)\}<\/span>\s*<\/div>\s*<\/td>\s*<td className="p-3 font-bold text-text-main">\{custName\}<\/td>/g;
content = content.replace(dateCustRegex, `<td className="p-3">
    <div className="flex flex-col">
        <span className="font-bold text-text-main">{custName}</span>
        <span className="text-[9px] font-bold text-text-main/40 uppercase leading-none mt-1">{dateObj.toLocaleDateString('ar-EG')} - {dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
</td>`);

// Remove hidden md:table-cell td and the inner tr
const tdDesktopRegex = /<td className="p-3 hidden md:table-cell">[\s\S]*?<\/td>/g;
content = content.replace(tdDesktopRegex, '');

const trMobileRegex = /\{activeDropdownId === invoice\.id && \([\s\S]*?<\/React\.Fragment>/g;
content = content.replace(trMobileRegex, '</React.Fragment>');

fs.writeFileSync('src/pages/Sales.tsx', content);

// Purchases
let pContent = fs.readFileSync('src/pages/Purchases.tsx', 'utf-8');
pContent = pContent.replace(
    /<th className="p-3 font-bold uppercase text-\[9px\] tracking-widest text-text-main\/60 border-b border-border-main">التاريخ<\/th>/g,
    ''
);
pContent = pContent.replace(
    /<th className="p-3 font-bold uppercase text-\[9px\] tracking-widest text-text-main\/60 border-b border-border-main text-center hidden md:table-cell">الإجراءات<\/th>/g,
    ''
);
pContent = pContent.replace(
    /<tr className="hover:bg-bg-main transition-colors group cursor-pointer" onClick={\(\) => setActiveDropdownId\(activeDropdownId === invoice\.id \? null : invoice\.id\)}>/g,
    '<tr className="hover:bg-bg-main transition-colors group cursor-pointer" onClick={() => setActiveDropdownId(invoice.id)}>'
);
const pDateCustRegex = /<td className="p-3">\s*<div className="flex flex-col">\s*<span className="font-bold text-text-main">\{dateObj\.toLocaleDateString\('ar-EG'\)\}<\/span>\s*<span className="text-\[9px\] font-bold text-text-main\/30 uppercase leading-none mt-0\.5">\{dateObj\.toLocaleTimeString\('ar-EG', \{ hour: '2-digit', minute: '2-digit' \}\)\}<\/span>\s*<\/div>\s*<\/td>\s*<td className="p-3 font-bold text-text-main">\{supplierName\}<\/td>/g;
pContent = pContent.replace(pDateCustRegex, `<td className="p-3">
    <div className="flex flex-col">
        <span className="font-bold text-text-main">{supplierName}</span>
        <span className="text-[9px] font-bold text-text-main/40 uppercase leading-none mt-1">{dateObj.toLocaleDateString('ar-EG')} - {dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
</td>`);
pContent = pContent.replace(tdDesktopRegex, '');
pContent = pContent.replace(trMobileRegex, '</React.Fragment>');
fs.writeFileSync('src/pages/Purchases.tsx', pContent);

// Quotations
let qContent = fs.readFileSync('src/pages/Quotations.tsx', 'utf-8');
qContent = qContent.replace(
    /<th className="p-3 font-bold uppercase text-\[9px\] tracking-widest text-text-main\/60 border-b border-border-main">التاريخ<\/th>/g,
    ''
);
qContent = qContent.replace(
    /<th className="p-3 font-bold uppercase text-\[9px\] tracking-widest text-text-main\/60 border-b border-border-main text-center hidden md:table-cell">الإجراءات<\/th>/g,
    ''
);
qContent = qContent.replace(
    /<tr className="hover:bg-bg-main transition-colors group cursor-pointer" onClick={\(\) => setActiveDropdownId\(activeDropdownId === q\.id \? null : q\.id\)}>/g,
    '<tr className="hover:bg-bg-main transition-colors group cursor-pointer" onClick={() => setActiveDropdownId(q.id)}>'
);
const qDateCustRegex = /<td className="p-3">\s*<div className="flex flex-col">\s*<span className="font-bold text-text-main">\{dateObj\.toLocaleDateString\('ar-EG'\)\}<\/span>\s*<span className="text-\[9px\] font-bold text-text-main\/30 uppercase leading-none mt-0\.5">\{dateObj\.toLocaleTimeString\('ar-EG', \{ hour: '2-digit', minute: '2-digit' \}\)\}<\/span>\s*<\/div>\s*<\/td>\s*<td className="p-3 font-bold text-text-main">\{custName\}<\/td>/g;
qContent = qContent.replace(qDateCustRegex, `<td className="p-3">
    <div className="flex flex-col">
        <span className="font-bold text-text-main">{custName}</span>
        <span className="text-[9px] font-bold text-text-main/40 uppercase leading-none mt-1">{dateObj.toLocaleDateString('ar-EG')} - {dateObj.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
</td>`);
qContent = qContent.replace(tdDesktopRegex, '');
const qTrMobileRegex = /\{activeDropdownId === q\.id && \([\s\S]*?<\/React\.Fragment>/g;
qContent = qContent.replace(qTrMobileRegex, '</React.Fragment>');
fs.writeFileSync('src/pages/Quotations.tsx', qContent);

