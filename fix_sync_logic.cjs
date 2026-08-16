const fs = require('fs');
let content = fs.readFileSync('src/components/CardCashboxSyncModal.tsx', 'utf8');

const oldLogic = `                    const type = docObj.data().type;
                    if (type !== 'manual_in' && type !== 'manual_out') {`;

const newLogic = `                    const data = docObj.data();
                    const type = data.type;
                    const title = data.title || '';
                    
                    const isPureManual = (type === 'manual_in' || type === 'manual_out') && 
                                         !title.includes('فاتورة') && 
                                         !title.includes('تسوية تعديل') &&
                                         !title.includes('تسوية تلقائي') &&
                                         !title.includes('سند قبض') &&
                                         !title.includes('سند صرف');

                    if (!isPureManual) {`;

content = content.replace(oldLogic, newLogic);

fs.writeFileSync('src/components/CardCashboxSyncModal.tsx', content);
