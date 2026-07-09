import { db } from './firebase';
import { doc, getDocFromServer } from 'firebase/firestore';
import { useSettingsStore } from '../store/settingsStore';

export const getInvoiceHtml = async (invoice: any, type: 'sale' | 'purchase' | 'quotation', items: any[], omitButtons: boolean = false) => {
    const settings = useSettingsStore.getState().settings;

    let title = 'فاتورة';
    let partyName = invoice.customerName || invoice.supplierName || '';
    let partyBalance = 0;
    let hasParty = false;

    if (type === 'sale') {
        title = 'فاتورة مبيعات';
        const cid = invoice.customerId;
        if (cid) {
             try {
                 const docSnap = await getDocFromServer(doc(db, 'customers', cid));
                 if (docSnap.exists()) {
                     partyBalance = docSnap.data().balance || 0;
                     if (!partyName) partyName = docSnap.data().name;
                     hasParty = true;
                 }
             } catch(e) {}
        }
    } else if (type === 'purchase') {
        title = 'فاتورة مشتريات';
        const sid = invoice.supplierId;
        if (sid) {
             try {
                 const docSnap = await getDocFromServer(doc(db, 'suppliers', sid));
                 if (docSnap.exists()) {
                     partyBalance = docSnap.data().balance || 0;
                     if (!partyName) partyName = docSnap.data().name;
                     hasParty = true;
                 }
             } catch(e) {}
        }
    } else if (type === 'quotation') {
        title = 'عرض سعر';
    }
    
    // Build items rows
    let itemsHtml = '';
    items.forEach((item: any, index: number) => {
        const itemPrice = type === 'purchase' ? (item.buyPrice || item.price) : item.price;
        itemsHtml += `
            <tr>
                <td style="padding: 8px; border-bottom: 1px dashed #e2e8f0;">${index + 1}</td>
                <td style="padding: 8px; border-bottom: 1px dashed #e2e8f0; font-weight: bold;">${item.name}</td>
                <td style="padding: 8px; border-bottom: 1px dashed #e2e8f0; text-align: center;">${item.quantity || item.cartQuantity}</td>
                <td style="padding: 8px; border-bottom: 1px dashed #e2e8f0; text-align: center;">${itemPrice}</td>
                <td style="padding: 8px; border-bottom: 1px dashed #e2e8f0; text-align: center; font-weight: bold;">${itemPrice * (item.quantity || item.cartQuantity)}</td>
            </tr>
        `;
    });

    const d = new Date(invoice.date || invoice.createdAt || Date.now());
    const dateStr = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' + d.toLocaleTimeString('ar-EG');
    
    let previousBalance = 0;
    let totalBalance = partyBalance;
    let balanceHtml = '';

    if (hasParty && type !== 'quotation') {
        let isCredit = invoice.paymentType === 'credit';
        let invTotal = parseFloat(invoice.total || invoice.totalAmount || 0);
        let paidAmount = parseFloat(invoice.paidAmount || 0);
        let unpaidPortion = isCredit ? (invTotal - paidAmount) : 0;
        
        if (type === 'sale') {
            previousBalance = totalBalance - unpaidPortion;
        } else if (type === 'purchase') {
            previousBalance = totalBalance + unpaidPortion;
        }

        balanceHtml = `
            <div style="font-size: 0.85em; border-top: 1px dashed #cbd5e1; padding-top: 10px; margin-top: 15px; color: #475569;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                    <span>الرصيد السابق للمستفيد:</span>
                    <span dir="ltr">${Math.abs(previousBalance).toLocaleString()} <span style="font-size: 0.8em; color:#94a3b8;">${previousBalance !== 0 ? (type === 'sale' ? (previousBalance > 0 ? '(عليه)' : '(له)') : (previousBalance < 0 ? '(له)' : '(عليه)')) : ''}</span></span>
                </div>
                <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.1em; color: #0f172a;">
                    <span>إجمالي الرصيد (بعد الفاتورة):</span>
                    <span dir="ltr">${Math.abs(totalBalance).toLocaleString()} <span style="font-size: 0.8em; color:#94a3b8; font-weight: normal;">${totalBalance !== 0 ? (type === 'sale' ? (totalBalance > 0 ? '(عليه)' : '(له)') : (totalBalance < 0 ? '(له)' : '(عليه)')) : ''}</span></span>
                </div>
            </div>
        `;
    }

    const textAlign = settings.headerTextAlignment === 'left' ? 'left' : settings.headerTextAlignment === 'center' ? 'center' : 'right';

    const businessHtml = `
        <div style="margin-bottom: 20px;">
            <div style="text-align: center;">
                ${settings.businessLogoUrl ? `<img src="${settings.businessLogoUrl}" alt="Logo" style="max-height: 80px; max-width: 150px; margin-bottom: 10px; object-fit: contain;">` : ''}
            </div>
            <div style="text-align: ${textAlign};">
                ${settings.businessName ? `<h2 style="margin: 0; font-size: 18px; color: #1e293b;">${settings.businessName}</h2>` : `<h2 style="margin: 0; font-size: 18px; color: #1e293b;">${title}</h2>`}
                ${settings.businessAddress ? `<p style="margin: 3px 0 0; font-size: 12px; color: #64748b;">${settings.businessAddress}</p>` : ''}
                ${settings.businessPhone ? `<p style="margin: 3px 0 0; font-size: 12px; color: #64748b;" dir="ltr">${settings.businessPhone}</p>` : ''}
            </div>
        </div>
    `;

    const paperSizeCss = settings.printerPaperSize === 'Thermal80' 
        ? 'width: 80mm; margin: 0 auto; padding: 5px; font-size: 12px;'
        : settings.printerPaperSize === 'Thermal58'
        ? 'width: 58mm; margin: 0 auto; padding: 2px; font-size: 10px;'
        : 'max-width: 800px; margin: 0 auto; padding: 20px; font-size: 14px;'; // A4

    const actionButtons = omitButtons ? '' : `
        <div class="no-print" style="margin-top: 30px; display: flex; justify-content: center; gap: 15px;">
            <button class="btn" style="background: #10b981;" onclick="saveAsHtml()">
                <svg style="width:18px; height:18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                حفظ كـ HTML
            </button>
            <button class="btn" onclick="window.print()">
                <svg style="width:18px; height:18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                طباعة
            </button>
        </div>
    `;

    const scriptText = omitButtons ? '' : `
        <script>
            function saveAsHtml() {
                const htmlContent = document.documentElement.outerHTML;
                const fileName = 'فاتورة_${invoice.invoiceNumber || new Date().getTime()}.html';

                // Capacitor filesaver implementation for Android / mobile WebView
                const cap = window.Capacitor || (window.opener && window.opener.Capacitor);
                if (cap && cap.Plugins && cap.Plugins.Filesystem && cap.Plugins.Share) {
                    const Filesystem = cap.Plugins.Filesystem;
                    const Share = cap.Plugins.Share;

                    Filesystem.writeFile({
                        path: fileName,
                        data: htmlContent,
                        directory: 'CACHE',
                        encoding: 'utf8'
                    }).then(function() {
                        return Filesystem.getUri({
                            directory: 'CACHE',
                            path: fileName
                        });
                    }).then(function(uriResult) {
                        return Share.share({
                            title: 'تحميل الفاتورة',
                            text: 'هنا ملف الفاتورة بصيغة HTML بطلبكم',
                            url: uriResult.uri,
                            dialogTitle: 'حفظ وتحميل الفاتورة'
                        });
                    }).catch(function(err) {
                        alert('فشل حفظ الفاتورة على الجوال: ' + err.message);
                    });
                    return;
                }

                // Standard Web Fallback
                const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        </script>
    `;

    return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title} - ${invoice.invoiceNumber || ''}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
                body { font-family: 'Tajawal', Tahoma, Arial, sans-serif; color: #1e293b; background: #fff; margin:0; padding:0; line-height: 1.5; }
                .container { ${paperSizeCss} }
                .header { text-align: center; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
                .invoice-badge { display:inline-block; padding: 6px 16px; background: #f1f5f9; color: #0f172a; border-radius: 8px; font-weight: 800; font-size: 1.1em; margin-bottom: 8px; border: 1px solid #cbd5e1; }
                .invoice-details { margin-bottom: 20px; display: flex; justify-content: space-between; font-size: 0.95em; flex-wrap: wrap; gap: 15px; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; }
                .invoice-details p { margin: 6px 0; }
                .invoice-details strong { color: #475569; display: inline-block; width: 100px; }
                table { border-collapse: collapse; margin-bottom: 25px; width: 100%; font-size: 0.95em; }
                th { background-color: #f1f5f9; text-align: center; padding: 12px 8px; border-bottom: 2px solid #cbd5e1; border-top: 1px solid #e2e8f0; font-weight: 800; color: #334155; }
                th:nth-child(2) { text-align: right; }
                td { padding: 12px 8px; border-bottom: 1px solid #f1f5f9; text-align: center; }
                td:nth-child(2) { text-align: right; font-weight: 700; color: #0f172a; }
                .total-section { padding: 20px; border: 2px solid #e2e8f0; border-radius: 12px; margin-top: 20px; background: #fafafa; }
                .total-row { display: flex; justify-content: space-between; font-size: 1.4em; font-weight: 800; color: #0f172a; align-items: center; }
                .total-row span:last-child { color: #2563eb; }
                .total-currency { font-size: 0.5em; color: #64748b; font-weight: 500; margin-right: 4px; }
                .footer { text-align: center; font-size: 0.9em; color: #64748b; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-weight: 500; }
                @media print {
                    @page { margin: 0; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: ${settings.printerPaperSize === 'A4' ? '15mm' : '0'}; }
                    .no-print { display: none !important; }
                    .container { width: 100%; box-shadow: none; border: none; }
                }
                .btn { padding: 12px 24px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 700; box-shadow: 0 4px 6px -1px rgb(59 130 246 / 0.4); display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; }
                .btn:hover { background: #1d4ed8; transform: translateY(-1px); }
            </style>
        </head>
        <body>
            ${actionButtons.replace('margin-top: 30px;', 'margin-bottom: 20px; background: #f8fafc; padding: 15px; border-bottom: 1px solid #e2e8f0;')}
            <div class="container">
                <div class="header">
                    ${businessHtml}
                    <div class="invoice-badge">
                        ${title}
                    </div>
                    <div style="font-size:0.95em; color: #64748b; font-weight: 500;">المرجع: <strong style="color: #0f172a; font-family: monospace; font-size: 1.1em;">#${invoice.invoiceNumber || '---'}</strong></div>
                </div>
                
                <div class="invoice-details">
                    <div>
                        <p><strong>طـرف الفاتورة:</strong> <span style="font-weight: 700; color: #0f172a;">${partyName || 'نقدي / عام'}</span></p>
                        <p><strong>التاريـخ:</strong> ${dateStr}</p>
                    </div>
                    <div>
                        <p><strong>طريقة الدفع:</strong> <span style="padding: 2px 8px; background: #e0e7ff; color: #3730a3; border-radius: 4px; font-weight: 700; font-size: 0.9em;">${invoice.paymentType === 'cash' ? 'نقدي' : invoice.paymentType === 'card' ? 'بطاقة' : invoice.paymentType === 'bank' ? 'حوالة' : invoice.paymentType === 'cheque' ? 'شيك' : 'آجل'}</span></p>
                        <p><strong>الموظـف:</strong> ${invoice.sellerName || invoice.createdBy || 'النظام'}</p>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 5%;">#</th>
                            <th style="width: 45%;">الصنف</th>
                            <th>الكمية</th>
                            <th>السعر</th>
                            <th>الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="total-section">
                    <div class="total-row">
                        <span>الإجمالي الصافي</span>
                        <span dir="ltr">${(invoice.total || invoice.totalAmount).toLocaleString()} <span class="total-currency">ر.س</span></span>
                    </div>
                    
                    ${invoice.paidAmount !== undefined && invoice.paymentType === 'credit' ? `
                    <div style="display: flex; justify-content: space-between; margin-top: 15px; font-size: 1.1em; color: #16a34a; font-weight: 700; padding-top: 15px; border-top: 1px dashed #cbd5e1;">
                        <span>المدفوع نقداً:</span>
                        <span dir="ltr">${(invoice.paidAmount).toLocaleString()} ر.س</span>
                    </div>
                    ` : ''}
                    
                    ${balanceHtml}
                </div>

                <div class="footer">
                    <p>شكراً لتعاملكم معنا، ونتمنى لكم يوماً سعيداً</p>
                </div>
            </div>
            ${scriptText}
        </body>
        </html>
    `;
};

export const printInvoice = async (invoice: any, type: 'sale' | 'purchase' | 'quotation', items: any[]) => {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (!printWindow) return alert('يرجى السماح بالنوافذ المنبثقة (Pop-ups) للطباعة');
    
    // Show a temporary loading text
    printWindow.document.write('<html dir="rtl" lang="ar"><body><h2 style="font-family: sans-serif; text-align: center; margin-top: 50px;">جاري تجهيز الفاتورة...</h2></body></html>');
    
    const html = await getInvoiceHtml(invoice, type, items, false);

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
};

export const printReport = (title: string, tableHeaders: string[], tableRows: any[][]) => {
    const printWindow = window.open('', '', 'width=1000,height=800');
    if (!printWindow) return alert('يرجى السماح بالنوافذ المنبثقة (Pop-ups) للطباعة');

    const settings = useSettingsStore.getState().settings;

    const d = new Date();
    const dateStr = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) + ' ' + d.toLocaleTimeString('ar-EG');

    let headersHtml = '';
    tableHeaders.forEach(th => {
        headersHtml += `<th style="padding: 12px 8px; border-bottom: 2px solid #cbd5e1; background-color: #f1f5f9; color: #334155; font-weight: bold;">${th}</th>`;
    });

    let rowsHtml = '';
    tableRows.forEach((row, i) => {
        const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        rowsHtml += `<tr style="background-color: ${bg}; border-bottom: 1px dashed #e2e8f0;">`;
        row.forEach(cell => {
            rowsHtml += `<td style="padding: 10px 8px;">${cell}</td>`;
        });
        rowsHtml += `</tr>`;
    });

    const textAlign = settings.headerTextAlignment === 'left' ? 'left' : settings.headerTextAlignment === 'center' ? 'center' : 'right';

    const businessHtml = `
        <div style="margin-bottom: 20px;">
            <div style="text-align: center;">
                ${settings.businessLogoUrl ? `<img src="${settings.businessLogoUrl}" alt="Logo" style="max-height: 80px; max-width: 150px; margin-bottom: 10px; object-fit: contain;">` : ''}
            </div>
            <div style="text-align: ${textAlign}; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px;">
                ${settings.businessName ? `<h2 style="margin: 0; font-size: 18px; color: #1e293b;">${settings.businessName}</h2>` : `<h2 style="margin: 0; font-size: 18px; color: #1e293b;">${title}</h2>`}
                ${settings.businessAddress ? `<p style="margin: 3px 0 0; font-size: 12px; color: #64748b;">${settings.businessAddress}</p>` : ''}
                ${settings.businessPhone ? `<p style="margin: 3px 0 0; font-size: 12px; color: #64748b;" dir="ltr">${settings.businessPhone}</p>` : ''}
            </div>
        </div>
    `;

    const paperSizeCss = settings.printerPaperSize === 'Thermal80' 
        ? 'width: 80mm; margin: 0 auto; padding: 5px; font-size: 12px;'
        : settings.printerPaperSize === 'Thermal58'
        ? 'width: 58mm; margin: 0 auto; padding: 2px; font-size: 10px;'
        : 'max-width: 1000px; margin: 0 auto; padding: 20px; font-size: 14px;'; // A4/Landscape

    const html = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
                body { font-family: 'Tajawal', Tahoma, Arial, sans-serif; color: #0f172a; background: #fff; margin:0; padding:0; line-height: 1.5; }
                .container { ${paperSizeCss} }
                .header { margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; }
                .report-badge { display:inline-block; padding: 8px 24px; background: #f1f5f9; color: #0f172a; border-radius: 8px; font-weight: 800; font-size: 1.25em; border: 1px solid #cbd5e1; }
                .report-meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 0.95em; color: #475569; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; font-weight: 500; }
                table { border-collapse: collapse; margin-bottom: 25px; width: 100%; font-size: 0.95em; text-align: right; }
                th { background-color: #f1f5f9; padding: 14px 10px; border-bottom: 2px solid #cbd5e1; border-top: 1px solid #e2e8f0; font-weight: 800; color: #1e293b; }
                td { padding: 12px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
                td:first-child { font-weight: 700; color: #0f172a; }
                tr:nth-child(even) td { background-color: #fafafa; }
                .footer { text-align: center; font-size: 0.9em; color: #64748b; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-weight: 500;}
                @media print {
                    @page { margin: 0; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: ${settings.printerPaperSize === 'A4' ? '15mm' : '0'}; }
                    .no-print { display: none !important; }
                    .container { width: 100%; box-shadow: none; border: none; }
                }
                .btn { padding: 12px 24px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 700; box-shadow: 0 4px 6px -1px rgb(59 130 246 / 0.4); display: inline-flex; items-center; gap: 8px; transition: all 0.2s; }
                .btn:hover { background: #1d4ed8; transform: translateY(-1px); }
            </style>
        </head>
        <body>
            <div class="no-print" style="margin-bottom: 20px; display: flex; justify-content: center; gap: 15px; background: #f8fafc; padding: 15px; border-bottom: 1px solid #e2e8f0;">
                <button class="btn" style="background: #10b981;" onclick="saveAsHtml()">
                    <svg style="width:18px; height:18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    حفظ كـ HTML
                </button>
                <button class="btn" onclick="window.print()">
                    <svg style="width:18px; height:18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                    طباعة التقرير
                </button>
            </div>
            <div class="container">
                <div class="header">
                    ${businessHtml}
                    <div style="text-align: center; margin-top: 20px;">
                        <span class="report-badge">
                            ${title}
                        </span>
                    </div>
                </div>
                
                <div class="report-meta">
                    <span><strong>تاريخ التقرير:</strong> <span style="font-family: monospace; font-size: 1.1em; color: #0f172a;">${dateStr}</span></span>
                </div>

                <table>
                    <thead>
                        <tr>${headersHtml}</tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div class="footer">
                    <p>تقرير صادر من النظام الآلي</p>
                </div>
            </div>
            <script>
                function saveAsHtml() {
                    const htmlContent = document.documentElement.outerHTML;
                    const fileName = 'تقرير_${new Date().getTime()}.html';

                    // Capacitor filesaver implementation for Android / mobile WebView
                    const cap = window.Capacitor || (window.opener && window.opener.Capacitor);
                    if (cap && cap.Plugins && cap.Plugins.Filesystem && cap.Plugins.Share) {
                        const Filesystem = cap.Plugins.Filesystem;
                        const Share = cap.Plugins.Share;

                        Filesystem.writeFile({
                            path: fileName,
                            data: htmlContent,
                            directory: 'CACHE',
                            encoding: 'utf8'
                        }).then(function() {
                            return Filesystem.getUri({
                                directory: 'CACHE',
                                path: fileName
                            });
                        }).then(function(uriResult) {
                            return Share.share({
                                title: 'تحميل التقرير',
                                text: 'هنا ملف التقرير بصيغة HTML بطلبكم',
                                url: uriResult.uri,
                                dialogTitle: 'حفظ وتحميل التقرير'
                            });
                        }).catch(function(err) {
                            alert('فشل حفظ التقرير على الجوال: ' + err.message);
                        });
                        return;
                    }

                    // Standard Web Fallback
                    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.setAttribute('href', url);
                    link.setAttribute('download', fileName);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                }
            </script>
        </body>
        </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
};