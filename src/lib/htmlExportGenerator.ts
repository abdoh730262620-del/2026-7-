import { collection, getDocs, query, where, Timestamp, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

export async function executeExport(filters: { collections: string[], year: string, months: number[], tenantId: string }) {
    // Fetch data based on filters
    const dbData: Record<string, any[]> = {};
    
    const fetchCollection = async (collName: string, dateField: string = 'createdAt') => {
        try {
            let q = query(collection(db, collName), where('tenantId', '==', filters.tenantId));
            const snap = await getDocs(q);
            let docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Client side filtering for easier handling of various date types (Timestamp vs ISO string)
            docs = docs.filter(docData => {
                if (filters.year === 'all' && filters.months.length === 0) return true;
                
                const d = docData[dateField];
                if (!d) return true; // Include if no date field
                
                let date: Date;
                if (d.toDate) {
                    date = d.toDate();
                } else if (typeof d === 'string' || typeof d === 'number') {
                    date = new Date(d);
                } else {
                    return true;
                }

                const y = date.getFullYear().toString();
                const m = date.getMonth() + 1;

                if (filters.year !== 'all' && y !== filters.year) return false;
                if (filters.months.length > 0 && !filters.months.includes(m)) return false;

                return true;
            });
            
            dbData[collName] = docs;
        } catch (e) {
            console.error(`Failed to fetch ${collName}`, e);
            dbData[collName] = [];
        }
    };

    const tasks = [];
    if (filters.collections.includes('sales')) tasks.push(fetchCollection('sales'));
    if (filters.collections.includes('purchases')) tasks.push(fetchCollection('purchases'));
    if (filters.collections.includes('cash')) tasks.push(fetchCollection('cash', 'date'));
    if (filters.collections.includes('customers')) tasks.push(fetchCollection('customers'));
    if (filters.collections.includes('suppliers')) tasks.push(fetchCollection('suppliers'));
    if (filters.collections.includes('products')) tasks.push(fetchCollection('products'));
    if (filters.collections.includes('vouchers')) tasks.push(fetchCollection('vouchers', 'date'));

    await Promise.all(tasks);

    // Format data for HTML
    const generateTable = (title: string, headers: string[], rows: any[][]) => `
        <div class="card mb-4 section-card">
            <h2 class="card-header">${title}</h2>
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead class="table-dark">
                        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${rows.map(row => `<tr>${row.map(cell => `<td>${cell !== undefined && cell !== null ? cell : ''}</td>`).join('')}</tr>`).join('')}
                    </tbody>
                </table>
            </div>
            ${rows.length === 0 ? '<div class="p-3 text-center text-muted">لا توجد بيانات</div>' : ''}
        </div>
    `;

    const sections = [];

    // Summary Section
    let totalSales = 0, totalPurchases = 0, totalCashIn = 0, totalCashOut = 0;
    if (dbData['sales']) totalSales = dbData['sales'].reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    if (dbData['purchases']) totalPurchases = dbData['purchases'].reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    if (dbData['cash']) {
        dbData['cash'].forEach(c => {
            if (c.type === 'in') totalCashIn += Number(c.amount) || 0;
            else if (c.type === 'out') totalCashOut += Number(c.amount) || 0;
        });
    }

    const summaryHtml = `
        <div class="row mb-4">
            <div class="col-md-3"><div class="card text-white bg-primary mb-3"><div class="card-body"><h5 class="card-title">إجمالي المبيعات</h5><p class="card-text fs-4">${totalSales.toFixed(2)}</p></div></div></div>
            <div class="col-md-3"><div class="card text-white bg-success mb-3"><div class="card-body"><h5 class="card-title">إجمالي المشتريات</h5><p class="card-text fs-4">${totalPurchases.toFixed(2)}</p></div></div></div>
            <div class="col-md-3"><div class="card text-white bg-info mb-3"><div class="card-body"><h5 class="card-title">المقبوضات الصندوق</h5><p class="card-text fs-4">${totalCashIn.toFixed(2)}</p></div></div></div>
            <div class="col-md-3"><div class="card text-white bg-warning mb-3"><div class="card-body"><h5 class="card-title">المدفوعات الصندوق</h5><p class="card-text fs-4">${totalCashOut.toFixed(2)}</p></div></div></div>
        </div>
    `;
    sections.push({ title: 'الملخص الذكي', content: summaryHtml, id: 'summary' });

    // Format Dates
    const formatDate = (dateStr: any) => {
        if (!dateStr) return '';
        if (dateStr.toDate) return dateStr.toDate().toLocaleDateString('ar-SA');
        return new Date(dateStr).toLocaleDateString('ar-SA');
    };

    if (dbData['sales']) {
        sections.push({
            title: 'المبيعات التفصيلية', id: 'sales',
            content: generateTable('سجل المبيعات', 
                ['رقم الفاتورة', 'التاريخ', 'العميل', 'المبلغ الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'],
                dbData['sales'].map(s => [s.invoiceNumber, formatDate(s.createdAt), s.customerName || 'عميل نقدي', s.totalAmount, s.paidAmount, s.remainingAmount, s.status])
            )
        });
    }

    if (dbData['purchases']) {
        sections.push({
            title: 'المشتريات التفصيلية', id: 'purchases',
            content: generateTable('سجل المشتريات', 
                ['رقم الفاتورة', 'التاريخ', 'المورد', 'المبلغ الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'],
                dbData['purchases'].map(s => [s.invoiceNumber, formatDate(s.createdAt), s.supplierName, s.totalAmount, s.paidAmount, s.remainingAmount, s.status])
            )
        });
    }

    if (dbData['customers']) {
        sections.push({
            title: 'العملاء', id: 'customers',
            content: generateTable('سجل العملاء', 
                ['الاسم', 'الهاتف', 'الرصيد', 'تاريخ الإضافة'],
                dbData['customers'].map(c => [c.name, c.phone, c.balance, formatDate(c.createdAt)])
            )
        });
    }

    if (dbData['suppliers']) {
        sections.push({
            title: 'الموردين', id: 'suppliers',
            content: generateTable('سجل الموردين', 
                ['الاسم', 'الهاتف', 'الرصيد', 'تاريخ الإضافة'],
                dbData['suppliers'].map(c => [c.name, c.phone, c.balance, formatDate(c.createdAt)])
            )
        });
    }

    if (dbData['products']) {
        sections.push({
            title: 'المنتجات', id: 'products',
            content: generateTable('سجل المنتجات', 
                ['الباركود', 'الاسم', 'سعر البيع', 'الكمية', 'الوحدة'],
                dbData['products'].map(p => [p.barcode, p.name, p.price, p.stock, p.unit])
            )
        });
    }

    if (dbData['cash']) {
        sections.push({
            title: 'حركة الصندوق', id: 'cash',
            content: generateTable('سجل الصندوق', 
                ['رقم السند', 'التاريخ', 'النوع', 'المبلغ', 'البيان'],
                dbData['cash'].map(c => [c.voucherNumber || '', formatDate(c.date || c.createdAt), c.type === 'in' ? 'قبض' : 'صرف', c.amount, c.description || c.notes])
            )
        });
    }

    if (dbData['vouchers']) {
        sections.push({
            title: 'السندات', id: 'vouchers',
            content: generateTable('سجل السندات', 
                ['رقم السند', 'التاريخ', 'النوع', 'الكيان', 'المبلغ', 'البيان'],
                dbData['vouchers'].map(v => [v.voucherNumber, formatDate(v.date), v.type === 'receipt' ? 'قبض' : 'صرف', v.entityName, v.amount, v.description])
            )
        });
    }

    const htmlTemplate = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تصدير تقارير النظام - ${new Date().toLocaleDateString('ar-SA')}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.rtl.min.css" rel="stylesheet">
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa; }
        .sidebar { height: 100vh; position: fixed; right: 0; top: 0; width: 250px; background-color: #212529; color: white; padding-top: 20px; overflow-y: auto; }
        .sidebar a { color: #adb5bd; text-decoration: none; display: block; padding: 10px 20px; transition: 0.3s; }
        .sidebar a:hover, .sidebar a.active { background-color: #343a40; color: #fff; }
        .main-content { margin-right: 250px; padding: 30px; }
        @media (max-width: 768px) {
            .sidebar { position: relative; width: 100%; height: auto; }
            .main-content { margin-right: 0; }
        }
        .section-content { display: none; }
        .section-content.active { display: block; }
        .print-btn { position: fixed; bottom: 20px; left: 20px; z-index: 1000; }
        @media print {
            .sidebar, .print-btn { display: none !important; }
            .main-content { margin: 0 !important; padding: 0 !important; }
            .section-content { display: block !important; page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <h4 class="text-center mb-4">تقارير النظام</h4>
        ${sections.map((s, i) => `<a href="#" class="${i === 0 ? 'active' : ''}" onclick="showSection('${s.id}', this)">${s.title}</a>`).join('')}
    </div>

    <div class="main-content">
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h2>تصدير سجلات النظام</h2>
            <div class="text-muted">تاريخ التصدير: ${new Date().toLocaleString('ar-SA')}</div>
        </div>

        ${sections.map((s, i) => `
            <div id="${s.id}" class="section-content ${i === 0 ? 'active' : ''}">
                ${s.content}
            </div>
        `).join('')}
    </div>

    <button class="btn btn-primary btn-lg rounded-circle print-btn border-2 border-white shadow-lg" onclick="window.print()" title="طباعة">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-printer" viewBox="0 0 16 16">
          <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/>
          <path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z"/>
        </svg>
    </button>

    <script>
        function showSection(id, element) {
            document.querySelectorAll('.section-content').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.sidebar a').forEach(el => el.classList.remove('active'));
            document.getElementById(id).classList.add('active');
            element.classList.add('active');
        }
    </script>
</body>
</html>
    `;

    const idsToDelete: { collName: string, id: string }[] = [];
    Object.keys(dbData).forEach(collName => {
        dbData[collName].forEach(doc => {
            idsToDelete.push({ collName, id: doc.id });
        });
    });

    return { htmlTemplate, idsToDelete };
}

export async function generateHtmlExport(filters: { collections: string[], year: string, months: number[], tenantId: string }) {
    const res = await executeExport(filters);
    return res.htmlTemplate;
}

export async function deleteExportedData(idsToDelete: { collName: string, id: string }[]) {
    console.log("Attempting to delete documents:", idsToDelete);
    const deleteTasks = idsToDelete.map(async (item) => {
        try {
            console.log(`Deleting ${item.id} from ${item.collName}`);
            await deleteDoc(doc(db, item.collName, item.id));
            console.log(`Successfully deleted ${item.id} from ${item.collName}`);
        } catch (error) {
            console.error(`Error deleting ${item.id} from ${item.collName}:`, error);
            throw error; // Propagate the error so Promise.all will fail
        }
    });
    
    try {
        await Promise.all(deleteTasks);
        console.log("Deletion tasks completed.");
    } catch (error) {
        console.error("One or more deletions failed:", error);
        throw error;
    }
}
