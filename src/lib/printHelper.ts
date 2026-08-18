import { db } from './firebase';
import { doc, getDocFromServer } from 'firebase/firestore';
import { useSettingsStore } from '../store/settingsStore';

export const getInvoiceHtml = async (
    invoice: any, 
    type: 'sale' | 'purchase' | 'quotation' | 'card_sale' | 'card_purchase' | 'card_purchase_return' | 'card_sale_return', 
    items: any[], 
    omitButtons: boolean = false, 
    currency: string = 'ر.س',
    overridePaperSize?: 'A4' | 'Thermal80' | 'Thermal58'
) => {
    const settings = useSettingsStore.getState().settings;
    const activePaperSize = overridePaperSize || settings.printerPaperSize || 'A4';

    let title = 'فاتورة';
    let partyTitle = 'العميل / المورد';
    let partyName = invoice.customerName || invoice.supplierName || invoice.partyName || invoice.distributorName || '';
    let partyBalance = 0;
    let hasParty = false;

    if (type === 'sale') {
        title = 'فاتورة مبيعات';
        partyTitle = 'العميـل';
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
        partyTitle = 'المـورد';
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
        partyTitle = 'العميـل المستهدف';
    } else if (type === 'card_sale') {
        title = 'فاتورة مبيعات كروت شبكة';
        partyTitle = 'الموزع / العميل';
    } else if (type === 'card_purchase') {
        title = 'فاتورة مشتريات كروت شبكة';
        partyTitle = 'المـورد';
    } else if (type === 'card_purchase_return') {
        title = 'فاتورة مردودات مشتريات كروت';
        partyTitle = 'المـورد';
    } else if (type === 'card_sale_return') {
        title = 'فاتورة مردودات مبيعات كروت';
        partyTitle = 'الموزع / العميل';
    }

    if (!partyName) {
        partyName = 'نقدي / عام';
    }

    let sellerName = invoice.sellerName || invoice.createdByName || invoice.userName || invoice.staffName || invoice.user;
    if (!sellerName || typeof sellerName !== 'string' || sellerName.trim() === '' || (sellerName.length > 20 && !sellerName.includes(' ') && !sellerName.includes('@'))) {
        if (invoice.createdBy && typeof invoice.createdBy === 'string' && !invoice.createdBy.match(/^[a-zA-Z0-9]{15,}$/)) {
            sellerName = invoice.createdBy;
        } else {
            sellerName = 'المستخدم المسجّل';
        }
    }

    // Normalize date
    const rawDate = invoice.date || invoice.dateTime || invoice.createdAt || Date.now();
    let dateStr = '';
    try {
        const d = new Date(rawDate);
        if (isNaN(d.getTime())) {
            dateStr = String(rawDate);
        } else {
            dateStr = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        }
    } catch {
        dateStr = String(rawDate);
    }

    // Build items rows
    let itemsHtml = '';
    let grandTotal = 0;

    const safeItems = items && items.length > 0 ? items : (invoice.items || []);

    safeItems.forEach((item: any, index: number) => {
        const name = item.name || item.categoryName || 'صنف';
        const qty = parseFloat(item.quantity || item.cartQuantity || 1);
        const price = parseFloat(type === 'purchase' || type === 'card_purchase' ? (item.buyPrice || item.price || item.unitPrice || 0) : (item.price || item.unitPrice || item.buyPrice || 0));
        const lineTotal = item.totalAmount ? parseFloat(item.totalAmount) : (qty * price);
        grandTotal += lineTotal;

        if (activePaperSize === 'A4') {
            itemsHtml += `
                <tr style="border-bottom: 1px solid #f1f5f9; ${index % 2 === 1 ? 'background-color: #fafafa;' : ''}">
                    <td style="padding: 5px 8px; text-align: center; font-weight: 700; color: #64748b; font-size: 11.5px;">${index + 1}</td>
                    <td style="padding: 5px 8px; text-align: right; font-weight: 800; color: #0f172a; font-size: 12px;">${name}</td>
                    <td style="padding: 5px 8px; text-align: center; font-weight: 800; color: #059669; font-size: 12px;" dir="ltr">${qty.toLocaleString('en-US')}</td>
                    <td style="padding: 5px 8px; text-align: center; font-weight: 700; color: #475569; font-size: 12px;" dir="ltr">${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="padding: 5px 8px; text-align: left; font-weight: 900; color: #0f172a; font-size: 12px;" dir="ltr">${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
            `;
        } else {
            // Thermal Receipt Row
            itemsHtml += `
                <tr style="border-bottom: 1px dotted #cbd5e1;">
                    <td style="padding: 5px 2px; text-align: right; font-weight: 800; font-size: 11px;">${name}</td>
                    <td style="padding: 5px 2px; text-align: center; font-weight: 700; font-size: 11px;">${qty}</td>
                    <td style="padding: 5px 2px; text-align: center; font-size: 11px;">${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="padding: 5px 2px; text-align: left; font-weight: 800; font-size: 11px;">${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
            `;
        }
    });

    const finalInvoiceTotal = parseFloat(invoice.total || invoice.totalAmount || grandTotal || 0);

    let previousBalance = 0;
    let totalBalance = partyBalance;
    let balanceHtml = '';

    if (hasParty && type !== 'quotation') {
        let isCredit = invoice.paymentType === 'credit';
        let paidAmount = parseFloat(invoice.paidAmount || 0);
        let unpaidPortion = isCredit ? (finalInvoiceTotal - paidAmount) : 0;
        
        if (type === 'sale' || type === 'card_sale') {
            previousBalance = totalBalance - unpaidPortion;
        } else if (type === 'purchase' || type === 'card_purchase') {
            previousBalance = totalBalance + unpaidPortion;
        }

        balanceHtml = `
            <div style="font-size: 0.85em; border-top: 1px dashed #cbd5e1; padding-top: 8px; margin-top: 10px; color: #475569;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span>الرصيد السابق للمستفيد:</span>
                    <span dir="ltr" style="font-weight: 700;">${Math.abs(previousBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 1.05em; color: #0f172a;">
                    <span>إجمالي الرصيد (بعد الفاتورة):</span>
                    <span dir="ltr">${Math.abs(totalBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</span>
                </div>
            </div>
        `;
    }

    const textAlign = settings.headerTextAlignment === 'left' ? 'left' : settings.headerTextAlignment === 'center' ? 'center' : 'right';

    const paymentLabel = invoice.paymentType === 'cash' ? 'نقدي' : invoice.paymentType === 'card' ? 'بطاقة' : invoice.paymentType === 'bank' ? 'حوالة بنكية' : invoice.paymentType === 'cheque' ? 'شيك' : 'آجل';

    if (activePaperSize === 'A4') {
        return `
            <!DOCTYPE html>
            <html dir="rtl" lang="ar">
            <head>
                <meta charset="UTF-8">
                <title>${title} - #${invoice.invoiceNumber || ''}</title>
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');
                    * { box-sizing: border-box; }
                    html, body {
                        background-color: #ffffff;
                        margin: 0;
                        padding: 0;
                        width: 100%;
                        font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        color: #0f172a;
                        line-height: 1.25;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .a4-page { 
                        width: 100%;
                        max-width: 100%;
                        padding: 10px 14px; 
                        background: #ffffff; 
                        margin: 0 auto;
                        display: flex;
                        flex-direction: column;
                        justify-content: space-between;
                        box-sizing: border-box;
                    }
                    .header-table { 
                        width: 100%; 
                        border-collapse: collapse; 
                        margin-bottom: 6px; 
                        border-bottom: 1.5px solid #cbd5e1; 
                        padding-bottom: 4px; 
                    }
                    .invoice-badge { 
                        display: inline-block; 
                        padding: 2px 10px; 
                        background: #0f172a; 
                        color: #ffffff; 
                        border-radius: 4px; 
                        font-weight: 800; 
                        font-size: 11px; 
                    }
                    .details-grid { 
                        display: grid; 
                        grid-template-columns: repeat(2, 1fr); 
                        gap: 3px 10px; 
                        background: #f8fafc; 
                        border: 1px solid #e2e8f0; 
                        border-radius: 6px; 
                        padding: 4px 8px; 
                        margin-bottom: 6px; 
                        font-size: 11px; 
                    }
                    .details-item { 
                        display: flex; 
                        align-items: center; 
                        justify-content: space-between; 
                    }
                    .details-label { 
                        color: #64748b; 
                        font-weight: 700; 
                        font-size: 10.5px;
                    }
                    .details-val { 
                        font-weight: 800; 
                        color: #0f172a; 
                        font-size: 11px;
                    }
                    table.items-table { 
                        border-collapse: collapse; 
                        width: 100%; 
                        margin-bottom: 6px; 
                        font-size: 11px; 
                    }
                    table.items-table th { 
                        background-color: #f1f5f9; 
                        padding: 3.5px 6px; 
                        border-top: 1px solid #cbd5e1; 
                        border-bottom: 1.5px solid #94a3b8; 
                        font-weight: 800; 
                        color: #1e293b; 
                        font-size: 10.5px; 
                    }
                    table.items-table td { 
                        padding: 3px 6px; 
                        font-size: 11px; 
                        border-bottom: 1px solid #f1f5f9; 
                        line-height: 1.2;
                    }
                    .total-box { 
                        background: #f8fafc; 
                        border: 1px solid #cbd5e1; 
                        border-radius: 6px; 
                        padding: 6px 10px; 
                        margin-top: 4px; 
                    }
                    .total-row { 
                        display: flex; 
                        justify-content: space-between; 
                        align-items: center; 
                        font-size: 12px; 
                        font-weight: 900; 
                        color: #0f172a; 
                    }
                    .footer { 
                        text-align: center; 
                        font-size: 10px; 
                        color: #64748b; 
                        margin-top: 6px; 
                        border-top: 1px solid #e2e8f0; 
                        padding-top: 4px; 
                        font-weight: 600; 
                    }
                    @media print {
                        @page { size: A4 portrait; margin: 5mm 8mm; }
                        body { background: #ffffff !important; padding: 0 !important; }
                        .no-print { display: none !important; }
                        .a4-page { width: 100% !important; max-width: 100% !important; min-height: 285mm !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; }
                    }
                </style>
            </head>
            <body>
                <div class="a4-page">
                    <div>
                        <table class="header-table">
                            <tr>
                                <td style="text-align: ${textAlign}; vertical-align: middle;">
                                    ${settings.businessLogoUrl ? `<img src="${settings.businessLogoUrl}" alt="Logo" style="max-height: 40px; max-width: 110px; margin-bottom: 2px; object-fit: contain; vertical-align: middle;">` : ''}
                                    ${settings.businessName ? `<h2 style="margin: 0; font-size: 15px; font-weight: 900; color: #0f172a; display: inline-block; vertical-align: middle;">${settings.businessName}</h2>` : `<h2 style="margin: 0; font-size: 15px; font-weight: 900; color: #0f172a;">${title}</h2>`}
                                    ${settings.businessAddress ? `<span style="margin-right: 8px; font-size: 10px; color: #64748b; font-weight: 600;">| ${settings.businessAddress}</span>` : ''}
                                    ${settings.businessPhone ? `<span style="margin-right: 8px; font-size: 10px; color: #64748b; font-weight: 700;" dir="ltr">| هاتف: ${settings.businessPhone}</span>` : ''}
                                </td>
                                <td style="text-align: left; vertical-align: middle; white-space: nowrap;">
                                    <div class="invoice-badge">${title}</div>
                                    <span style="margin-right: 6px; font-size: 11px; color: #64748b; font-weight: 700;">رقم: <strong style="color: #2563eb; font-family: monospace; font-size: 12px;">#${invoice.invoiceNumber || '---'}</strong></span>
                                </td>
                            </tr>
                        </table>

                        <div class="details-grid">
                            <div class="details-item">
                                <span class="details-label">${partyTitle}:</span>
                                <span class="details-val">${partyName}</span>
                            </div>
                            <div class="details-item">
                                <span class="details-label">التاريخ والوقت:</span>
                                <span class="details-val" dir="ltr">${dateStr}</span>
                            </div>
                            <div class="details-item">
                                <span class="details-label">طريقة الدفع:</span>
                                <span class="details-val" style="color: #2563eb;">${paymentLabel}</span>
                            </div>
                            <div class="details-item">
                                <span class="details-label">الموظف المسؤول:</span>
                                <span class="details-val">${sellerName}</span>
                            </div>
                        </div>

                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th style="width: 6%; text-align: center;">#</th>
                                    <th style="width: 44%; text-align: right;">الصنف / المنتج</th>
                                    <th style="width: 15%; text-align: center;">الكمية</th>
                                    <th style="width: 15%; text-align: center;">السعر</th>
                                    <th style="width: 20%; text-align: left;">الإجمالي</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                        </table>

                        <div class="total-box">
                            <div class="total-row">
                                <span>الإجمالي الصافي:</span>
                                <span dir="ltr" style="color: #059669; font-size: 13px;">${finalInvoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style="font-size: 10px; color: #64748b; font-weight: 700;">${currency}</span></span>
                            </div>
                            ${invoice.paidAmount !== undefined && invoice.paymentType === 'credit' ? `
                                <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; color: #2563eb; font-weight: 800; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
                                    <span>المدفوع نقداً:</span>
                                    <span dir="ltr">${parseFloat(invoice.paidAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</span>
                                </div>
                            ` : ''}
                            ${balanceHtml}
                        </div>

                        ${(invoice.notes || invoice.note) ? `
                            <div style="margin-top: 6px; padding: 4px 8px; background: #fffbe0; border: 1px solid #fef08a; border-radius: 4px; font-size: 10px; color: #713f12;">
                                <strong>ملاحظات:</strong> ${invoice.notes || invoice.note}
                            </div>
                        ` : ''}
                    </div>

                    <div class="footer">
                        <p style="margin:0;">شكراً لتعاملكم معنا 🌸</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    }

    // Thermal Receipt Layout (Thermal80 or Thermal58)
    const is58 = activePaperSize === 'Thermal58';
    return `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>${title} - #${invoice.invoiceNumber || ''}</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800;900&display=swap');
                * { box-sizing: border-box; }
                body {
                    font-family: 'Tajawal', sans-serif;
                    color: #000000;
                    background: #ffffff;
                    margin: 0;
                    padding: 0;
                    font-size: ${is58 ? '10px' : '11px'};
                    line-height: 1.3;
                    -webkit-print-color-adjust: exact;
                }
                .container {
                    width: ${is58 ? '58mm' : '80mm'};
                    margin: 0 auto;
                    padding: ${is58 ? '2mm' : '4mm'};
                }
                .dashed { border-top: 1px dashed #000; margin: 6px 0; }
                table { width: 100%; border-collapse: collapse; font-size: inherit; margin: 6px 0; }
                th { border-bottom: 1px solid #000; padding: 4px 2px; text-align: center; font-weight: 800; }
                th:first-child { text-align: right; }
                th:last-child { text-align: left; }
                td { padding: 4px 2px; text-align: center; }
                td:first-child { text-align: right; font-weight: 800; }
                td:last-child { text-align: left; font-weight: 800; }
                @media print {
                    @page { margin: 0; }
                    body { padding: 0 !important; }
                    .no-print { display: none !important; }
                    .container { width: 100% !important; padding: 2mm !important; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div style="text-align: center;">
                    ${settings.businessLogoUrl ? `<img src="${settings.businessLogoUrl}" alt="Logo" style="max-height: 40px; max-width: 100px; margin-bottom: 4px; object-fit: contain;">` : ''}
                    <h2 style="margin: 0; font-size: ${is58 ? '12px' : '14px'}; font-weight: 900;">${settings.businessName || title}</h2>
                    ${settings.businessPhone ? `<p style="margin: 2px 0 0; font-size: 10px;" dir="ltr">${settings.businessPhone}</p>` : ''}
                </div>

                <div class="dashed"></div>

                <div style="text-align: center; font-weight: 900; font-size: ${is58 ? '11px' : '13px'};">
                    ${title}
                </div>
                <div style="text-align: center; font-family: monospace; font-size: 11px; margin-top: 2px;">
                    #${invoice.invoiceNumber || '---'}
                </div>

                <div class="dashed"></div>

                <div style="font-size: ${is58 ? '9px' : '10px'};">
                    <div style="display: flex; justify-content: space-between;">
                        <span>${partyTitle}:</span>
                        <strong>${partyName}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                        <span>التاريخ:</span>
                        <span dir="ltr">${dateStr}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                        <span>طريقة الدفع:</span>
                        <strong>${paymentLabel}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                        <span>الموظف:</span>
                        <strong>${sellerName}</strong>
                    </div>
                </div>

                <div class="dashed"></div>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 45%;">الصنف</th>
                            <th style="width: 18%;">الكمية</th>
                            <th style="width: 17%;">السعر</th>
                            <th style="width: 20%;">الإجمالي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>

                <div class="dashed"></div>

                <div style="display: flex; justify-content: space-between; font-size: ${is58 ? '12px' : '14px'}; font-weight: 900; margin: 4px 0;">
                    <span>الإجمالي:</span>
                    <span dir="ltr">${finalInvoiceTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}</span>
                </div>

                ${balanceHtml}

                ${(invoice.notes || invoice.note) ? `
                    <div style="margin-top: 6px; font-size: 9px; border: 1px dotted #000; padding: 4px; text-align: right;">
                        <strong>ملاحظات:</strong> ${invoice.notes || invoice.note}
                    </div>
                ` : ''}

                <div class="dashed"></div>
                <div style="text-align: center; font-size: 10px; font-weight: 700; margin-top: 6px;">
                    شكراً لزيارتكم 🌸
                </div>
            </div>
        </body>
        </html>
    `;
};

export const printInvoice = async (
    invoice: any, 
    type: 'sale' | 'purchase' | 'quotation' | 'card_sale' | 'card_purchase' | 'card_purchase_return' | 'card_sale_return', 
    items: any[], 
    currency: string = 'ر.س',
    overridePaperSize?: 'A4' | 'Thermal80' | 'Thermal58'
) => {
    const html = await getInvoiceHtml(invoice, type, items, true, currency, overridePaperSize);
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        
        setTimeout(() => {
            try {
                printWindow.focus();
                printWindow.print();
            } catch (e) {
                console.error("Print error: ", e);
            }
        }, 300);
    } else {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentWindow?.document;
        if (doc) {
            doc.open();
            doc.write(html);
            doc.close();
            setTimeout(() => {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
                setTimeout(() => document.body.removeChild(iframe), 1200);
            }, 300);
        }
    }
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
                .btn { padding: 12px 24px; background: #2563eb; color: white; border: none; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 700; box-shadow: 0 4px 6px -1px rgb(59 130 246 / 0.4); display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; }
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
