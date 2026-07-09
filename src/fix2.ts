import * as fs from 'fs';

const p = 'src/pages/Customers.tsx';
let txt = fs.readFileSync(p, 'utf-8');

txt = txt.replace(/description: \`صرف مبالغ مستحقة للعميل\`,(\s+)createdBy: appUser\.uid(\s+)\}\);/g, "description: `صرف مبالغ مستحقة للعميل`,\n                    createdBy: appUser.uid,\n                    createdAt: now\n                });");

txt = txt.replace(/createdBy: appUser\.uid(\s+)\}\);\s+\/\/ Record cash receipt \(سند قبض\)/g, "createdBy: appUser.uid,\n                    createdAt: now\n                });\n\n                // Record cash receipt (سند قبض)");

txt = txt.replace(/description: details \|\| 'تعديل مالي يدوي',(\s+)createdBy: appUser\?\.uid/g, "description: details || 'تعديل مالي يدوي',\n                createdBy: appUser?.uid,\n                createdAt: new Date(opDate).getTime()");


fs.writeFileSync(p, txt);
