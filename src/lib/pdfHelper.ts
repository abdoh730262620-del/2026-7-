import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useSettingsStore } from '../store/settingsStore';

export interface InvoicePdfItem {
    categoryName: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
}

export interface InvoicePdfInput {
    id: string;
    invoiceNumber: string;
    type: 'sale' | 'purchase';
    categoryName?: string;
    quantity?: number;
    unitPrice?: number;
    totalAmount: number;
    paymentType: string;
    partyName: string; // distributor or supplier
    dateTime: string;
    userName: string;
    items?: InvoicePdfItem[];
}

export const generateInvoicePdf = async (
    invoice: InvoicePdfInput
): Promise<{ blob: Blob; filename: string; dataUrl: string }> => {
    const settings = useSettingsStore.getState().settings;
    const title = invoice.type === 'sale' ? 'فاتورة مبيعات كروت' : 'فاتورة مشتريات كروت';
    const partyLabel = invoice.type === 'sale' ? 'الموزع' : 'المورد';
    const filename = `${invoice.type}_invoice_${invoice.invoiceNumber}.pdf`;

    // Create a temporary container
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '0';
    tempDiv.style.width = '380px'; // standard 80mm thermal receipt width in pixels
    tempDiv.style.backgroundColor = '#ffffff';
    tempDiv.style.padding = '24px';
    tempDiv.style.color = '#1e293b';
    tempDiv.style.direction = 'rtl';
    tempDiv.style.fontFamily = "'Tajawal', Tahoma, Arial, sans-serif";

    const textAlign = settings?.headerTextAlignment === 'left' ? 'left' : settings?.headerTextAlignment === 'center' ? 'center' : 'right';

    // Style and populate HTML
    tempDiv.innerHTML = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
            * { box-sizing: border-box; }
            .pdf-container { font-family: 'Tajawal', sans-serif; line-height: 1.5; font-size: 13px; }
            .pdf-header { text-align: center; margin-bottom: 20px; border-bottom: 2px dashed #e2e8f0; padding-bottom: 15px; }
            .pdf-logo { max-height: 70px; max-width: 140px; margin-bottom: 10px; object-fit: contain; display: block; margin-left: auto; margin-right: auto; }
            .pdf-business-name { margin: 0; font-size: 16px; font-weight: 800; color: #0f172a; text-align: ${textAlign}; }
            .pdf-business-info { margin: 3px 0 0; font-size: 11px; color: #64748b; text-align: ${textAlign}; }
            .pdf-badge { display: inline-block; padding: 5px 14px; background-color: #f1f5f9; color: #0f172a; border-radius: 8px; font-weight: 800; font-size: 14px; margin-top: 10px; border: 1px solid #cbd5e1; }
            .pdf-ref { font-size: 12px; color: #64748b; margin-top: 8px; font-weight: 500; }
            .pdf-details { margin-bottom: 15px; font-size: 11px; background-color: #f8fafc; padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; }
            .pdf-details p { margin: 5px 0; display: flex; justify-content: space-between; }
            .pdf-details strong { color: #475569; }
            .pdf-details span { font-weight: 700; color: #0f172a; }
            .pdf-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; }
            .pdf-table th { background-color: #f1f5f9; padding: 10px 6px; border-bottom: 2px solid #cbd5e1; font-weight: 800; color: #334155; text-align: center; }
            .pdf-table th:first-child { text-align: right; }
            .pdf-table td { padding: 10px 6px; border-bottom: 1px dashed #e2e8f0; text-align: center; }
            .pdf-table td:first-child { text-align: right; font-weight: 700; color: #0f172a; }
            .pdf-total-section { padding: 12px; border: 2px solid #e2e8f0; border-radius: 12px; background-color: #fcfcfc; margin-top: 15px; }
            .pdf-total-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; color: #0f172a; }
            .pdf-total-row span:last-child { color: #2563eb; }
            .pdf-footer { text-align: center; font-size: 11px; color: #64748b; margin-top: 25px; border-top: 1px dashed #cbd5e1; padding-top: 12px; font-weight: 500; }
        </style>
        <div class="pdf-container">
            <div class="pdf-header">
                ${settings?.businessLogoUrl ? `<img src="${settings.businessLogoUrl}" class="pdf-logo" alt="Logo">` : ''}
                <h2 class="pdf-business-name">${settings?.businessName || title}</h2>
                ${settings?.businessAddress ? `<p class="pdf-business-info">${settings.businessAddress}</p>` : ''}
                ${settings?.businessPhone ? `<p class="pdf-business-info" dir="ltr">${settings.businessPhone}</p>` : ''}
                <div class="pdf-badge">${title}</div>
                <div class="pdf-ref">رقم الفاتورة: <strong style="color: #0f172a; font-family: monospace;">#${invoice.invoiceNumber}</strong></div>
            </div>

            <div class="pdf-details">
                <p><strong>طريقة الدفع:</strong> <span>${invoice.paymentType === 'cash' ? 'نقدي' : 'آجل'}</span></p>
                <p><strong>${partyLabel}:</strong> <span>${invoice.partyName || 'نقدي / عام'}</span></p>
                <p><strong>التاريخ والوقت:</strong> <span>${invoice.dateTime}</span></p>
                <p><strong>المستخدم:</strong> <span>${invoice.userName || 'المدير'}</span></p>
            </div>

            <table class="pdf-table">
                <thead>
                    <tr>
                        <th style="width: 50%;">الصنف</th>
                        <th style="width: 20%;">الكمية</th>
                        <th style="width: 30%;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoice.items && invoice.items.length > 0 
                        ? invoice.items.map(item => `
                            <tr>
                                <td>كروت فئة: ${item.categoryName}</td>
                                <td>${Math.abs(item.quantity)}</td>
                                <td>${Math.abs(item.totalAmount).toFixed(2)} ر.س</td>
                            </tr>
                        `).join('')
                        : `
                            <tr>
                                <td>كروت فئة: ${invoice.categoryName || ''}</td>
                                <td>${Math.abs(invoice.quantity || 0)}</td>
                                <td>${Math.abs(invoice.totalAmount).toFixed(2)} ر.س</td>
                            </tr>
                        `
                    }
                </tbody>
            </table>

            <div class="pdf-total-section">
                <div class="pdf-total-row">
                    <span>الإجمالي الصافي</span>
                    <span dir="ltr">${Math.abs(invoice.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س</span>
                </div>
            </div>

            <div class="pdf-footer">
                <p>شكراً لتعاملكم معنا، ونتمنى لكم يوماً سعيداً</p>
            </div>
        </div>
    `;

    document.body.appendChild(tempDiv);

    // Wait for images to load if any
    const images = tempDiv.getElementsByTagName('img');
    if (images.length > 0) {
        await Promise.all(
            Array.from(images).map(
                (img) =>
                    new Promise<void>((resolve) => {
                        if (img.complete) {
                            resolve();
                        } else {
                            img.onload = () => resolve();
                            img.onerror = () => resolve();
                        }
                    })
            )
        );
    }

    // Give a short delay to ensure font/layout updates are settled
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Convert the HTML element to a canvas
    const canvas = await html2canvas(tempDiv, {
        scale: 2, // higher quality
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
    });

    // Remove temporary div
    document.body.removeChild(tempDiv);

    // Generate jsPDF
    const imgData = canvas.toDataURL('image/png');
    
    // Create standard portrait PDF
    const pdfWidth = 80; // mm
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfWidth, pdfHeight],
    });

    doc.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

    const blob = doc.output('blob');
    const dataUrl = doc.output('dataurlstring');

    return {
        blob,
        filename,
        dataUrl,
    };
};
