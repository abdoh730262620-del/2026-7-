import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, writeBatch, doc, getDocs, query, limit, getDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { DatabaseZap, ShieldAlert, Key, X, ChevronRight, Trash2, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react';

export default function DemoData() {
    const { appUser } = useAuthStore();
    const [password, setPassword] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [progress, setProgress] = useState<string>('');
    const [deleteProgress, setDeleteProgress] = useState<string>('');
    const [deletePercentage, setDeletePercentage] = useState<number>(0);
    const [deleteSuccessMessage, setDeleteSuccessMessage] = useState<string>('');
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);

    const handleDeleteClick = () => {
        if (!deletePassword) {
            alert('يرجى إدخال كلمة المرور للتأكيد');
            return;
        }
        setShowConfirmDelete(true);
    };

    const startDeletionProcess = async () => {
        setShowConfirmDelete(false);
        setIsDeleting(true);
        setDeleteProgress('جاري التحقق من الصلاحيات...');
        setDeletePercentage(5);
        setDeleteSuccessMessage('');
        try {
            if (!appUser?.uid) throw new Error('لا توجد جلسة مستخدم مفعلة');
            
            const userDocSnapshot = await getDoc(doc(db, 'users', appUser.uid));
            const liveUserData = userDocSnapshot.exists() ? userDocSnapshot.data() : null;
            const correctPassword = liveUserData?.password || appUser.password || 'admin';
            
            if (deletePassword !== correctPassword && deletePassword !== 'admin') {
                alert('كلمة المرور غير صحيحة. الرجاء إدخال كلمة مرور الحساب أو كلمة admin');
                setIsDeleting(false);
                setDeleteProgress('');
                setDeletePercentage(0);
                return;
            }

            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
            const collectionsToClear = [
                'customers', 'suppliers', 'products', 'sales', 'purchases', 
                'cash', 'vouchers', 'quotations', 'expenses', 'logs',
                'inventoryLogs', 'loyalty_logs', 'adjustments', 'expense_accounts'
            ];
            let batch = writeBatch(db);
            let operations = 0;

            const commitBatchIfFull = async (force = false) => {
                if (operations > 0 && (force || operations >= 480)) {
                    await batch.commit();
                    batch = writeBatch(db);
                    operations = 0;
                }
            };

            for (let i = 0; i < collectionsToClear.length; i++) {
                const collName = collectionsToClear[i];
                setDeleteProgress(`جاري حذف بيانات ${collName}...`);
                setDeletePercentage(10 + Math.round((i / collectionsToClear.length) * 80));
                
                let hasMore = true;
                while (hasMore) {
                    const snap = await getDocs(query(collection(db, collName), where('tenantId', '==', tenantId), limit(480)));
                    if (snap.empty) {
                        break;
                    }
                    for (const d of snap.docs) {
                        batch.delete(d.ref);
                        operations++;
                        await commitBatchIfFull();
                    }
                    
                    if (operations > 0) {
                        await commitBatchIfFull(true);
                        await new Promise(resolve => setTimeout(resolve, 50)); // Yield
                    }
                }
            }
            
            setDeletePercentage(95);
            setDeleteProgress('إنهاء عمليات الحذف...');
            await commitBatchIfFull(true);
            
            setDeletePercentage(100);
            setDeleteProgress('تم مسح البيانات بنجاح!');
            setDeletePassword('');
            setDeleteSuccessMessage('تمت عملية حذف كافة البيانات والتفريغ بنجاح لتكون قاعدة البيانات جديدة كلياً.');
            
            setTimeout(() => {
                setDeleteSuccessMessage('');
                setDeleteProgress('');
                setDeletePercentage(0);
            }, 6000);

        } catch (error: any) {
            console.error('Delete data error:', error);
            alert(`حدث خطأ أثناء (${deleteProgress}): ` + error.message);
            setDeleteProgress('');
            setDeletePercentage(0);
        } finally {
            setIsDeleting(false);
        }
    };


    const handleGenerateDemoData = async () => {
        if (!password) {
            alert('يرجى إدخال كلمة سر المدير للتأكيد');
            return;
        }
        
        setIsGenerating(true);
        setProgress('جاري التحقق من الصلاحيات...');
        try {
            if (!appUser?.uid) throw new Error('لا توجد جلسة مستخدم مفعلة');
            
            const userDocSnapshot = await getDoc(doc(db, 'users', appUser.uid));
            const liveUserData = userDocSnapshot.exists() ? userDocSnapshot.data() : null;
            const correctPassword = liveUserData?.password || appUser.password || 'admin';
            
            if (password !== correctPassword && password !== 'admin') {
                alert('كلمة المرور غير صحيحة. الرجاء إدخال كلمة مرور الحساب أو كلمة admin');
                setIsGenerating(false);
                setProgress('');
                return;
            }

            const tenantId = appUser?.tenantId || (appUser?.role === 'admin' ? appUser?.uid : 'admin_initial');
            const now = Date.now();
            let batch = writeBatch(db);
            let operations = 0;

            const commitBatchIfFull = async (force = false) => {
                if (operations > 0 && (force || operations >= 480)) {
                    await batch.commit();
                    batch = writeBatch(db);
                    operations = 0;
                }
            };

            // Memory structures
            const customers: any[] = [];
            const suppliers: any[] = [];
            const products: any[] = [];
            const allSales: any[] = [];
            const allPurchases: any[] = [];
            const allCash: any[] = [];
            const allVouchers: any[] = [];

            // 1. Generate Customers
            setProgress('جاري إنشاء مقود العملاء المبدئي...');
            for (let i = 1; i <= 10; i++) {
                const cRef = doc(collection(db, 'customers'));
                customers.push({
                    id: cRef.id,
                    ref: cRef,
                    name: `عميل الشركة الذهبية ${i}`,
                    phone: `0500000${i.toString().padStart(2, '0')}`,
                    address: `منطقة ${i}`,
                    balance: 0,
                    createdAt: Math.floor(now - Math.random() * 30 * 86400000)
                });
            }

            // 2. Generate Suppliers
            setProgress('جاري إنشاء الموردين...');
            for (let i = 1; i <= 10; i++) {
                const sRef = doc(collection(db, 'suppliers'));
                suppliers.push({
                    id: sRef.id,
                    ref: sRef,
                    name: `مورد المصنع الشامل ${i}`,
                    phone: `0550000${i.toString().padStart(2, '0')}`,
                    address: `المنطقة الصناعية ${i}`,
                    balance: 0,
                    createdAt: Math.floor(now - Math.random() * 30 * 86400000)
                });
            }

            // 3. Generate Products
            setProgress('جاري إضافة المنتجات...');
            for (let i = 1; i <= 20; i++) {
                const pRef = doc(collection(db, 'products'));
                const cost = Math.floor(Math.random() * 50) + 10;
                const price = Math.floor(cost * 1.5);
                const pData = {
                    id: pRef.id,
                    ref: pRef,
                    name: `منتج تجريبي فاخر ${i}`,
                    barcode: `1000${i.toString().padStart(3, '0')}`,
                    price,
                    cost,
                    quantity: Math.floor(Math.random() * 100) + 50,
                    category: 'مواد عامة',
                    lowStockAlert: 10,
                    createdAt: Math.floor(now - Math.random() * 30 * 86400000)
                };
                products.push(pData);
                batch.set(pRef, {
                    name: pData.name,
                    barcode: pData.barcode,
                    price: pData.price,
                    cost: pData.cost,
                    quantity: pData.quantity,
                    category: pData.category,
                    lowStockAlert: pData.lowStockAlert,
                    createdAt: pData.createdAt,
                    tenantId
                });
                operations++;
            }
            await commitBatchIfFull(true);

            // 4. Generate Sales
            setProgress('جاري إضافة المبيعات وربط الصندوق...');
            for (let i = 1; i <= 25; i++) {
                const saleRef = doc(collection(db, 'sales'));
                const c = customers[Math.floor(Math.random() * customers.length)];
                const paymentType = Math.random() > 0.4 ? 'credit' : 'cash';
                const sDate = now - Math.random() * 20 * 86400000;
                
                let total = 0;
                const itemsCount = Math.floor(Math.random() * 3) + 1;
                const items = [];
                for(let j=0; j<itemsCount; j++) {
                    const p = products[Math.floor(Math.random() * products.length)];
                    const qty = Math.floor(Math.random() * 5) + 1;
                    total += p.price * qty;
                    items.push({ productId: p.id, name: p.name, price: p.price, quantity: qty });
                }

                if (paymentType === 'credit') {
                    c.balance += total;
                } else {
                    const cashRef = doc(collection(db, 'cash'));
                    const cashDoc = {
                        date: sDate, amount: total, type: 'in', category: 'مبيعات نقدية',
                        description: `مبيعات نقدية فاتورة رقم S-DEMO-${i}`, createdBy: appUser.uid, createdAt: sDate,
                        tenantId
                    };
                    batch.set(cashRef, cashDoc);
                    allCash.push(cashDoc);
                    operations++;
                }

                const sDoc = {
                    id: saleRef.id, ref: saleRef,
                    invoiceNumber: `S-DEMO-${i}`, date: sDate, customerId: c.id, items,
                    subtotal: total, discountPercent: 0, discountAmount: 0,
                    total, paymentType, status: 'active', createdBy: appUser.uid, createdAt: sDate,
                    paidAmount: 0,
                    tenantId
                };
                allSales.push(sDoc);
                batch.set(saleRef, sDoc);
                operations++;
            }
            await commitBatchIfFull(true);

            // 5. Generate Purchases
            setProgress('جاري إضافة المشتريات وربط الصندوق...');
            for (let i = 1; i <= 15; i++) {
                const purRef = doc(collection(db, 'purchases'));
                const s = suppliers[Math.floor(Math.random() * suppliers.length)];
                const paymentType = Math.random() > 0.3 ? 'credit' : 'cash';
                const pDate = now - Math.random() * 20 * 86400000;
                
                let total = 0;
                const itemsCount = Math.floor(Math.random() * 3) + 1;
                const items = [];
                for(let j=0; j<itemsCount; j++) {
                    const p = products[Math.floor(Math.random() * products.length)];
                    const qty = Math.floor(Math.random() * 20) + 5;
                    total += p.cost * qty;
                    items.push({ productId: p.id, name: p.name, price: p.cost, quantity: qty });
                }

                if (paymentType === 'credit') {
                    s.balance += total; // we owe supplier
                } else {
                    const cashRef = doc(collection(db, 'cash'));
                    const cashDoc = {
                        date: pDate, amount: total, type: 'out', category: 'مشتريات نقدية',
                        description: `مشتريات نقدية فاتورة رقم P-DEMO-${i}`, createdBy: appUser.uid, createdAt: pDate,
                        tenantId
                    };
                    batch.set(cashRef, cashDoc);
                    allCash.push(cashDoc);
                    operations++;
                }

                const pDoc = {
                    id: purRef.id, ref: purRef,
                    invoiceNumber: `P-DEMO-${i}`, date: pDate, supplierId: s.id, items, total,
                    paymentType, status: 'active', createdBy: appUser.uid, createdAt: pDate,
                    paidAmount: 0,
                    tenantId
                };
                allPurchases.push(pDoc);
                batch.set(purRef, pDoc);
                operations++;
            }
            await commitBatchIfFull(true);

            // 6. Generate Vouchers (Receipts from customers, Payments to suppliers)
            setProgress('جاري إنشاء السندات وربط الأرصدة...');
            // Customers paying us
            for (let i = 0; i < 15; i++) {
                const c = customers[Math.floor(Math.random() * customers.length)];
                const vDate = now - Math.random() * 10 * 86400000;
                let amount = Math.floor(Math.random() * 1500) + 100;
                
                // Auto-allocate this amount to unpaid credit sales for this customer
                const unpaidSales = allSales.filter(s => s.customerId === c.id && s.paymentType === 'credit' && s.status !== 'paid');
                unpaidSales.sort((a,b) => a.date - b.date);
                let remainingPayment = amount;
                const paidInvoiceNumbers = [];

                for (const sale of unpaidSales) {
                    if (remainingPayment <= 0) break;
                    const invoiceTotal = parseFloat(sale.total) || 0;
                    const alreadyPaid = parseFloat(sale.paidAmount) || 0;
                    const invoiceRemaining = invoiceTotal - alreadyPaid;
                    if (invoiceRemaining <= 0) continue;

                    if (remainingPayment >= invoiceRemaining) {
                        sale.status = 'paid';
                        sale.paidAmount = invoiceTotal;
                        remainingPayment -= invoiceRemaining;
                        paidInvoiceNumbers.push(sale.invoiceNumber);
                    } else {
                        sale.paidAmount = alreadyPaid + remainingPayment;
                        remainingPayment = 0;
                        paidInvoiceNumbers.push(sale.invoiceNumber + ' (جزئي)');
                    }
                    batch.update(sale.ref, { status: sale.status, paidAmount: sale.paidAmount });
                    operations++;
                }

                const invoiceDetails = paidInvoiceNumbers.length ? ` (تسديد فواتير: ${paidInvoiceNumbers.join(', ')})` : '';
                const finalDescription = `سداد دفعة من الحساب${invoiceDetails}`;

                const vRef = doc(collection(db, 'vouchers'));
                const vDoc = {
                    date: vDate, amount, type: 'receipt', partyId: c.id, partyType: 'customer', partyName: c.name,
                    description: finalDescription, createdBy: appUser.uid, createdAt: vDate,
                    tenantId
                };
                batch.set(vRef, vDoc);
                allVouchers.push(vDoc);
                operations++;
                
                // Receipt from customer -> increases cash, decreases how much customer owes us
                c.balance -= amount;
                const cashRef = doc(collection(db, 'cash'));
                const cashDoc = {
                    date: vDate, amount, type: 'in', category: 'قبض من عميل',
                    description: `سند قبض رقم ${vRef.id.substring(0,6)}`, createdBy: appUser.uid, createdAt: vDate,
                    tenantId
                };
                batch.set(cashRef, cashDoc);
                allCash.push(cashDoc);
                operations++;
            }
            
            // Us paying suppliers
            for (let i = 0; i < 15; i++) {
                const s = suppliers[Math.floor(Math.random() * suppliers.length)];
                const vDate = now - Math.random() * 10 * 86400000;
                // Sometimes we overpay, resulting in negative balance
                const amount = Math.floor(Math.random() * 2000) + 100;
                
                // Auto-allocate this amount to unpaid credit purchases for this supplier
                const unpaidPurchases = allPurchases.filter(p => p.supplierId === s.id && p.paymentType === 'credit' && p.status !== 'paid');
                unpaidPurchases.sort((a,b) => a.date - b.date);
                let remainingPayment = amount;
                const paidInvoiceNumbers = [];

                for (const pur of unpaidPurchases) {
                    if (remainingPayment <= 0) break;
                    const invoiceTotal = parseFloat(pur.total) || 0;
                    const alreadyPaid = parseFloat(pur.paidAmount) || 0;
                    const invoiceRemaining = invoiceTotal - alreadyPaid;
                    if (invoiceRemaining <= 0) continue;

                    if (remainingPayment >= invoiceRemaining) {
                        pur.status = 'paid';
                        pur.paidAmount = invoiceTotal;
                        remainingPayment -= invoiceRemaining;
                        paidInvoiceNumbers.push(pur.invoiceNumber);
                    } else {
                        pur.paidAmount = alreadyPaid + remainingPayment;
                        remainingPayment = 0;
                        paidInvoiceNumbers.push(pur.invoiceNumber + ' (جزئي)');
                    }
                    batch.update(pur.ref, { status: pur.status, paidAmount: pur.paidAmount });
                    operations++;
                }

                const invoiceDetails = paidInvoiceNumbers.length ? ` (تسديد فواتير: ${paidInvoiceNumbers.join(', ')})` : '';
                const finalDescription = `دفعة لمورد${invoiceDetails}`;

                const vRef = doc(collection(db, 'vouchers'));
                const vDoc = {
                    date: vDate, amount, type: 'payment', partyId: s.id, partyType: 'supplier', partyName: s.name,
                    description: finalDescription, createdBy: appUser.uid, createdAt: vDate,
                    tenantId
                };
                batch.set(vRef, vDoc);
                allVouchers.push(vDoc);
                operations++;
                
                // Payment to supplier -> decreases cash, decreases how much we owe supplier
                s.balance -= amount;
                const cashRef = doc(collection(db, 'cash'));
                const cashDoc = {
                    date: vDate, amount, type: 'out', category: 'صرف لمورد',
                    description: `سند صرف رقم ${vRef.id.substring(0,6)}`, createdBy: appUser.uid, createdAt: vDate,
                    tenantId
                };
                batch.set(cashRef, cashDoc);
                allCash.push(cashDoc);
                operations++;
            }
            await commitBatchIfFull(true);
            
            // 7. General Expenses
            setProgress('جاري إضافة المصروفات العامة...');
            for (let i = 0; i < 10; i++) {
                const eDate = now - Math.random() * 30 * 86400000;
                const amount = Math.floor(Math.random() * 500) + 50;
                const cashRef = doc(collection(db, 'cash'));
                const cashDoc = {
                    date: eDate, amount, type: 'out', category: 'expense',
                    description: `مصروفات نثرية وإدارية`, createdBy: appUser.uid, createdAt: eDate,
                    tenantId
                };
                batch.set(cashRef, cashDoc);
                allCash.push(cashDoc);
                operations++;
            }

            // 8. Update Final Balances for Customers and Suppliers
            setProgress('جاري تحديث الأرصدة النهائية...');
            for (const c of customers) {
                batch.set(c.ref, {
                    name: c.name, phone: c.phone, address: c.address, balance: c.balance,
                    createdAt: c.createdAt, updatedAt: now,
                    tenantId
                });
                operations++;
            }
            for (const s of suppliers) {
                batch.set(s.ref, {
                    name: s.name, phone: s.phone, address: s.address, balance: s.balance,
                    createdAt: s.createdAt, updatedAt: now,
                    tenantId
                });
                operations++;
            }
            await commitBatchIfFull(true);

            setProgress('تم الانتهاء.');
            setPassword('');
            alert('تم توليد البيانات التجريبية بنجاح! سيتم الآن عرض التقرير.');
            
            printReport(allSales, allPurchases, allCash, allVouchers, customers, suppliers);

        } catch (error: any) {
            console.error('Demo data error:', error);
            alert(`حدث خطأ أثناء (${progress}): ` + error.message);
        } finally {
            setIsGenerating(false);
            setProgress('');
        }
    };

    const printReport = (sales: any[], purchases: any[], cash: any[], vouchers: any[], customers: any[], suppliers: any[]) => {
        const cashIn = cash.filter(c => c.type === 'in').reduce((sum, c) => sum + c.amount, 0);
        const cashOut = cash.filter(c => c.type === 'out').reduce((sum, c) => sum + c.amount, 0);
        const netCash = cashIn - cashOut;

        const html = `
            <html dir="rtl" lang="ar">
            <head>
                <title>تقرير توليد البيانات التجريبية</title>
                <style>
                    body { font-family: 'Arial', sans-serif; padding: 20px; color: #333; line-height: 1.6; }
                    h1, h2 { color: #553C9A; text-align: center; border-bottom: 2px solid #553C9A; padding-bottom: 10px; }
                    .summary { display: flex; justify-content: space-around; background: #f3f4f6; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
                    .summary-box { text-align: center; }
                    .summary-box span { display: block; font-size: 24px; font-weight: bold; color: #4CAF50; }
                    .summary-box.red span { color: #F44336; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
                    th { background-color: #553C9A; color: white; }
                    tr:nth-child(even) { background-color: #f9f9f9; }
                    .negative { color: red; font-weight: bold; }
                    .positive { color: green; font-weight: bold; }
                    @media print { button { display: none; } }
                </style>
            </head>
            <body>
                <button onclick="window.print()" style="padding: 10px 20px; background: #553C9A; color: white; border: none; border-radius: 5px; cursor: pointer; float: left;">طباعة التقرير (PDF)</button>
                <h1>تقرير النظام لعمليات البيانات التجريبية</h1>
                <p style="text-align:center;">التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
                
                <div class="summary">
                    <div class="summary-box">إجمالي المقبوضات (صندوق)<span>${cashIn.toFixed(2)} ر.س</span></div>
                    <div class="summary-box red">إجمالي المدفوعات (صندوق)<span>${cashOut.toFixed(2)} ر.س</span></div>
                    <div class="summary-box">الرصيد الفعلي للصندوق<br><span style="color: ${netCash >= 0 ? '#4CAF50' : '#F44336'}">${netCash.toFixed(2)} ر.س</span></div>
                </div>

                <h2>أرصدة العملاء الناتجة</h2>
                <table>
                    <tr><th>اسم العميل</th><th>رصيد العميل (بالموجب = مطلوب دفعه, بالسالب = رصيد دائن)</th></tr>
                    ${customers.map(c => `<tr><td>${c.name}</td><td class="${c.balance >= 0 ? 'positive' : 'negative'}">${c.balance.toFixed(2)}</td></tr>`).join('')}
                </table>

                <h2>أرصدة الموردين الناتجة</h2>
                <table>
                    <tr><th>اسم المورد</th><th>رصيد المورد (بالموجب = مطلوب دفعه منا, بالسالب = رصيد مدين)</th></tr>
                    ${suppliers.map(s => `<tr><td>${s.name}</td><td class="${s.balance >= 0 ? 'negative' : 'positive'}">${s.balance.toFixed(2)}</td></tr>`).join('')}
                </table>

                <h2>حركات الصندوق (ملخص)</h2>
                <table>
                    <tr><th>التاريخ</th><th>التصنيف</th><th>البيان</th><th>نوع الحركة</th><th>المبلغ</th></tr>
                    ${cash.slice(0, 30).map(c => `<tr>
                        <td>${new Date(c.date).toLocaleDateString('ar-EG')}</td>
                        <td>${c.category}</td>
                        <td>${c.description}</td>
                        <td class="${c.type === 'in' ? 'positive' : 'negative'}">${c.type === 'in' ? 'مقبوضات (in)' : 'مدفوعات (out)'}</td>
                        <td>${c.amount.toFixed(2)}</td>
                    </tr>`).join('')}
                    ${cash.length > 30 ? `<tr><td colspan="5" style="text-align:center;">... عرض أول 30 حركة فقط ...</td></tr>` : ''}
                </table>
                <p style="font-size: 12px; text-align: center; color: #777;">* هذا التقرير يوضح أثر البيانات التجريبية على الحسابات والصندوق.</p>
            </body>
            </html>
        `;
        const printWindow = window.open('', '', 'width=800,height=600');
        if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
        }
    };

    if (appUser?.role !== 'admin') {
         return <div className="p-5 md:p-8 text-center text-red-600 font-bold text-base md:text-xl">ليس لديك صلاحية للوصول إلى هذه الصفحة</div>;
    }

    return (
        <div className="pb-8 pt-2 px-2 max-w-2xl mx-auto bg-transparent min-h-screen text-black dark:text-gray-100" dir="rtl">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
                    <div className="w-10 h-10 bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-100 dark:border-cyan-900/20 rounded-xl flex items-center justify-center">
                        <DatabaseZap size={20} className="stroke-[2.5]" />
                    </div>
                    <div className="mr-1">
                        <h2 className="text-lg md:text-xl font-bold text-black dark:text-white leading-tight">إعدادات النظام (توليد بيانات تجريبية)</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">توليد بيانات وهمية وتفعيل الاختبار أو تصفير النظام بالكامل</p>
                    </div>
                </div>
            </div>

            {/* Generate Records Card */}
            <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 mt-3 flex flex-col gap-4">
                <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-3 text-amber-800 dark:text-amber-400 flex gap-3 items-start">
                    <ShieldAlert size={20} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-bold mb-1">تنبيه هام</h3>
                        <p className="text-xs leading-relaxed mb-1 font-medium">سيتم إضافة بيانات وهمية (عملاء، موردين فواتير) للتجربة.</p>
                        <p className="text-xs font-bold text-red-600 dark:text-red-400">سيصعب حذفها لاحقاً وتختلط ببياناتك إلا عبر زر الأرشفة أو الحذف اليدوي.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-black dark:text-gray-200 text-xs font-bold mb-1.5 flex items-center gap-1.5">
                            <Key size={14} className="text-amber-500" /> كلمة مرور المدير للتأكيد
                        </label>
                        <input 
                            type="password"
                            placeholder="أدخل كلمة المرور أو كلمة admin"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full text-left p-2.5 text-sm rounded-xl border border-gray-200 dark:border-slate-850 bg-white dark:bg-slate-900 text-black dark:text-white focus:border-cyan-500 outline-none transition-colors"
                            dir="ltr"
                        />
                    </div>

                    {progress && (
                        <div className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/25 p-2.5 rounded-xl text-center">
                            {progress}
                        </div>
                    )}

                    <button 
                        type="button"
                        onClick={handleGenerateDemoData}
                        disabled={isGenerating || !password}
                        className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-200 dark:disabled:bg-slate-800 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition flex justify-center items-center gap-2 text-sm cursor-pointer"
                    >
                        {isGenerating ? 'جاري توليد البيانات...' : <><DatabaseZap size={18}/> توليد مئات السجلات الوهمية</>}
                    </button>
                </div>
            </div>

            {/* Zero Out System Card */}
            <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 mt-4 flex flex-col gap-4">
                <div className="bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-3 text-red-800 dark:text-red-400 flex gap-3 items-start">
                    <AlertTriangle size={20} className="shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
                    <div>
                        <h3 className="text-sm font-bold mb-1 text-red-700 dark:text-red-400">حذف كافة البيانات وتصفير النظام</h3>
                        <p className="text-xs leading-relaxed mb-w font-medium">هذا الإجراء سيقوم بحذف كافة السجلات (المبيعات، المشتريات، المنتجات، العملاء، الموردين، والصندوق) نهائياً من قاعدة البيانات السحابية.</p>
                        <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-1">سيتم الاحتفاظ فقط بحسابات المستخدمين وإعدادات الفواتير.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-black dark:text-gray-200 text-xs font-bold mb-1.5 flex items-center gap-1.5">
                            <Key size={14} className="text-red-500" /> كلمة مرور المدير للتأكيد
                        </label>
                        <input 
                            type="password"
                            placeholder="أدخل كلمة المرور أو كلمة admin"
                            value={deletePassword}
                            onChange={e => setDeletePassword(e.target.value)}
                            className="w-full text-left p-2.5 text-sm rounded-xl border border-red-200 dark:border-red-900/20 bg-white dark:bg-slate-900 text-black dark:text-white focus:border-red-500 outline-none transition-colors"
                            dir="ltr"
                        />
                    </div>

                    {deleteProgress && (
                        <div className="space-y-2">
                            <div className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20 p-2.5 rounded-xl border border-red-100 dark:border-red-900/25 text-center">
                                {deleteProgress}
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2.5 dark:bg-slate-800 overflow-hidden">
                                <div className="bg-red-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${deletePercentage}%` }}></div>
                             </div>
                        </div>
                    )}

                    {deleteSuccessMessage && (
                        <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 p-3 rounded-xl text-center flex items-center justify-center gap-2 shadow-inner">
                            <CheckCircle size={18} className="text-emerald-600 dark:text-emerald-400 animate-pulse" />
                            {deleteSuccessMessage}
                        </div>
                    )}

                    <button 
                        type="button"
                        onClick={handleDeleteClick}
                        disabled={isDeleting || !deletePassword}
                        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-200 dark:disabled:bg-slate-800 disabled:cursor-not-allowed text-white font-bold py-2.5 rounded-xl transition flex justify-center items-center gap-2 text-sm cursor-pointer"
                    >
                        {isDeleting ? 'جاري الحذف وتصفير الجدول...' : <><Trash2 size={18}/> مسح كافة البيانات نهائياً</>}
                    </button>
                </div>
            </div>

            {showConfirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" dir="rtl">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-100 dark:border-slate-800">
                        <div className="p-6">
                            <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
                                <AlertTriangle size={24} />
                            </div>
                            <h2 className="text-xl font-bold text-center mb-2 text-black dark:text-white">تحذير خطير جداً</h2>
                            <p className="text-gray-600 dark:text-gray-400 text-center text-sm leading-relaxed mb-6">
                                سيتم حذف كافة بيانات التطبيق (المنتجات، العملاء، الموردين، المبيعات، المشتريات، والمصروفات) نهائياً. 
                                <br/><br/>
                                <span className="font-bold text-red-600 dark:text-red-400">لا يمكن التراجع عن هذا الإجراء إطلاقاً. هل أنت متأكد من رغبتك في الاستمرار؟</span>
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowConfirmDelete(false)}
                                    className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-slate-850 text-black dark:text-gray-200 font-bold hover:bg-gray-50 dark:hover:bg-slate-800 transition text-sm cursor-pointer"
                                >
                                    إلغاء الأمر
                                </button>
                                <button
                                    onClick={startDeletionProcess}
                                    className="flex-1 py-2.5 bg-red-600 text-white font-bold hover:bg-red-700 transition rounded-xl text-sm cursor-pointer"
                                >
                                    نعم، احذف كافة البيانات
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
