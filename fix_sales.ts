import fs from 'fs';

let content = fs.readFileSync('src/pages/reports/SalesReport.tsx', 'utf-8');

// Container
content = content.replace(
    /<div className="flex flex-col md:flex-row h-full gap-4 md:overflow-hidden pb-20 md:pb-0">/g,
    '<div className="flex flex-col md:flex-row h-full md:overflow-hidden pb-20 md:pb-0 bg-white">'
);

// Desktop sidebar
content = content.replace(
    /<div className="hidden md:flex w-72 flex-shrink-0 bg-white rounded-2xl shadow-sm border border-gray-100 h-full overflow-y-auto custom-scrollbar flex-col p-3 space-y-1.5">/g,
    '<div className="hidden md:flex w-56 flex-shrink-0 bg-[#f8f9fa] border-l border-gray-200 h-full overflow-y-auto custom-scrollbar flex-col p-2 space-y-1">'
);

content = content.replace(
    /className={\`flex items-center justify-between p-3 rounded-lg text-sm font-bold transition-all \${isActivePrimary \? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}\`}/g,
    'className={`flex items-center justify-between p-2 rounded-lg text-xs font-bold transition-all ${isActivePrimary ? \'bg-white text-blue-700 shadow-sm\' : \'text-gray-700 hover:bg-gray-100\'}`}'
);

content = content.replace(
    /className={\`text-right text-\[13px\] p-2 rounded-lg transition-colors \${isSubActive \? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}\`}/g,
    'className={`text-right text-[11px] p-2 rounded-lg transition-colors ${isSubActive ? \'bg-blue-600 text-white font-bold shadow-sm\' : \'text-gray-600 hover:bg-white hover:text-gray-900\'}`}'
);

// Content Area
content = content.replace(
    /<div className="flex-1 flex flex-col min-w-0 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">/g,
    '<div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">'
);

// Header
content = content.replace(
    /<div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white z-10 sticky top-0">/g,
    '<div className="p-3 border-b border-gray-200 flex justify-between items-center gap-3 bg-white z-10 sticky top-0">'
);
content = content.replace(
    /<p className="text-xs text-gray-500 mt-1">تاريخ التقرير: من \{dateRange\.startDate\} إلى \{dateRange\.endDate\}<\/p>/g,
    ''
);
content = content.replace(
    /text-lg flex items-center gap-2/g,
    'text-sm flex items-center gap-2'
);
content = content.replace(
    /<div className="md:hidden flex flex-col gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 z-10 w-full mb-0 md:mb-3">/g,
    '<div className="md:hidden flex flex-col gap-2 p-3 bg-[#f8f9fa] border-b border-gray-200 z-10 w-full mb-0">'
);
content = content.replace(
    /<select[\s\S]*?className="w-full bg-\[#f8f9fa\] border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-2 focus:ring-blue-500\/20 focus:border-blue-500 block p-3 appearance-none font-bold outline-none transition-all"/g,
    '<select className="w-full bg-white border border-gray-200 text-gray-900 text-xs rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2 appearance-none font-bold outline-none transition-all"'
);
content = content.replace(
    /className={\`w-full py-3 px-4 rounded-xl text-xs font-bold transition-all border text-right/g,
    'className={`w-full py-2 px-3 rounded-lg text-[11px] font-bold transition-all border text-right'
);

// Mobile cards
content = content.replace(
    /<div className="md:hidden flex flex-col gap-4 p-4 bg-gray-50\/50">/g,
    '<div className="md:hidden flex flex-col gap-2 p-2 bg-gray-50">'
);
content = content.replace(
    /<div key=\{s\.id \|\| idx\} className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm space-y-4">/g,
    '<div key={s.id || idx} className="bg-white border border-gray-200 p-3 rounded-xl shadow-sm space-y-3">'
);

fs.writeFileSync('src/pages/reports/SalesReport.tsx', content);
