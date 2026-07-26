import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, getDocs, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { Printer, ChevronDown, ChevronLeft, FileSpreadsheet, List, CheckCircle, XCircle, Undo2, Ban } from 'lucide-react';
import { printReport, printInvoice } from '../../lib/printHelper';
import * as XLSX from 'xlsx';

type ReportCategory = 
    | 'sales' 
    | 'profits' 
    | 'invoices' 
    | 'discounts' 
    | 'credit_invoices' 
    | 'returned_invoices'
    | 'canceled_invoices'
    | 'quotations'
    | 'taxes_by_product'
    | 'taxes_by_customer';

type ReportSubCategory = string;

const REPORT_MENUS = [
    {
        id: 'sales',
        title: 'تقرير بالمبيعات',
        subs: ['لفترة', 'حسب الصنف', 'حسب التصنيف', 'لتصنيف', 'النقد', 'الاجل', 'بطاقه', 'شيك', 'الكل', 'حسب العميل', 'اكسل', 'اكسل مع المنتجات']
    },
    {
        id: 'profits',
        title: 'تقارير الارباح',
        subs: ['حسب الصنف', 'المبيعات والارباح إجمالي', 'حسب رقم الفاتورة', 'حسب العميل', 'لتصنيف']
    },
    {
        id: 'invoices',
        title: 'عرض فواتير المبيعات',
        subs: []
    },
    {
        id: 'discounts',
        title: 'تقرير بالخصومات',
        subs: ['حسب الصنف', 'حسب التصنيف', 'حسب العميل', 'حسب العميل - من شاشة الذمم', 'حسب رقم الفاتورة']
    },
    {
        id: 'credit_invoices',
        title: 'تقرير بالفواتير الآجل',
        subs: []
    },
    {
        id: 'returned_invoices',
        title: 'تقرير بالفواتير المرتجع مبيعات',
        subs: []
    },
    {
        id: 'canceled_invoices',
        title: 'تقرير بفواتير المبيعات التي تم الغائها',
        subs: []
    },
    {
        id: 'quotations',
        title: 'تقرير بعروض الاسعار',
        subs: []
    },
    {
        id: 'taxes_by_product',
        title: 'إجمالي الضرائب حسب الصنف',
        subs: []
    },
    {
        id: 'taxes_by_customer',
        title: 'إجمالي الضرائب حسب العميل',
        subs: []
    }
];

import { useAuthStore } from '../../store/authStore';

export default function SalesReport({ dateRange }: { dateRange: { startDate: string, endDate: string } }) {
    const { appUser } = useAuthStore();
    const [activeCategory, setActiveCategory] = useState<ReportCategory>('sales');
    const [activeSub, setActiveSub] = useState<ReportSubCategory>('لفترة');
    const [expandedMenu, setExpandedMenu] = useState<string>('sales');

    const [isMobileSubDropdownOpen, setIsMobileSubDropdownOpen] = useState(false);

    const [sales, setSales] = useState<any[]>([]);
    const [customers, setCustomers] = useState<Record<string, any>>({});
    const [products, setProducts] = useState<Record<string, any>>({});
    const [categories, setCategories] = useState<Record<string, any>>({});
    const [quotations, setQuotations] = useState<any[]>([]);

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

        const unsubCust = onSnapshot(query(collection(db, 'customers'), where('tenantId', '==', tenantId)), snap => {
            const custs: any = {};
            snap.forEach(doc => { custs[doc.id] = { id: doc.id, ...doc.data() }; });
            setCustomers(custs);
        }, err => handleFirestoreError(err, OperationType.GET, 'customers'));

        const unsubProd = onSnapshot(query(collection(db, 'products'), where('tenantId', '==', tenantId)), snap => {
            const prods: any = {};
            snap.forEach(doc => { prods[doc.id] = { id: doc.id, ...doc.data() }; });
            setProducts(prods);
        }, err => handleFirestoreError(err, OperationType.GET, 'products'));

        const unsubCat = onSnapshot(query(collection(db, 'categories'), where('tenantId', '==', tenantId)), snap => {
            const cats: any = {};
            snap.forEach(doc => { cats[doc.id] = { id: doc.id, ...doc.data() }; });
            setCategories(cats);
        }, err => handleFirestoreError(err, OperationType.GET, 'categories'));

        const unsubQuotes = onSnapshot(query(collection(db, 'quotations'), where('tenantId', '==', tenantId)), snap => {
            const q: any[] = [];
            snap.forEach(doc => { q.push({ id: doc.id, ...doc.data() }); });
            setQuotations(q);
        }, err => handleFirestoreError(err, OperationType.GET, 'quotations'));

        return () => { unsubCust(); unsubProd(); unsubCat(); unsubQuotes(); };
    }, [appUser]);

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

        const start = new Date(dateRange.startDate).getTime();
        const end = new Date(dateRange.endDate).getTime() + 86400000;

        const unsubSales = onSnapshot(query(collection(db, 'sales'), where('tenantId', '==', tenantId)), (snap) => {
            const s: any[] = [];
            snap.forEach(doc => {
                const data = doc.data();
                if (data.createdAt >= start && data.createdAt <= end) {
                    s.push({ id: doc.id, ...data });
                }
            });
            setSales(s.sort((a,b) => b.createdAt - a.createdAt));
        }, (error) => handleFirestoreError(error, OperationType.GET, 'sales'));
        return () => unsubSales();
    }, [dateRange, appUser]);

    const handleMenuClick = (cat: ReportCategory, subs: string[]) => {
        if (expandedMenu === cat) {
            setExpandedMenu('');
        } else {
            setExpandedMenu(cat);
            if (activeCategory !== cat) {
                setActiveCategory(cat);
                if (subs.length > 0) {
                    setActiveSub(subs[0]);
                } else {
                    setActiveSub('');
                }
            }
        }
    };

    const handleSubClick = (cat: ReportCategory, sub: string) => {
        setActiveCategory(cat);
        setActiveSub(sub);
    };

    const generateExcel = (data: any[], fileName: string) => {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Report");
        XLSX.writeFile(wb, `${fileName}.xlsx`);
    };

    // Filter and compute data based on activeCategory and activeSub
    const computedData = useMemo(() => {
        let items: any[] = [];
        let headers: string[] = [];
        let title = '';

        const validSales = sales.filter(s => s.status !== 'cancelled' && s.status !== 'returned');

        if (activeCategory === 'sales') {
            title = `تقرير المبيعات - ${activeSub}`;
            if (activeSub === 'اكسل' || activeSub === 'اكسل مع المنتجات') {
                return { items: validSales, headers: [], title, type: 'excel_ready' };
            }

            if (['النقد', 'الاجل', 'بطاقه', 'شيك'].includes(activeSub)) {
                let pType = activeSub === 'النقد' ? 'cash' : activeSub === 'الاجل' ? 'credit' : activeSub === 'بطاقه' ? 'card' : 'cheque';
                items = validSales.filter(s => s.paymentType === pType);
                headers = ['الفاتورة', 'التاريخ', 'العميل', 'المبلغ'];
            } else if (activeSub === 'الكل' || activeSub === 'لفترة') {
                items = validSales;
                headers = ['الفاتورة', 'التاريخ', 'العميل', 'طريقة الدفع', 'المبلغ'];
            } else if (activeSub === 'حسب العميل') {
                const grouped: Record<string, { customerId: string, count: number, sum: number, id: string }> = {};
                validSales.forEach(s => {
                    const cid = s.customerId || 'cash';
                    if (!grouped[cid]) grouped[cid] = { customerId: cid, count: 0, sum: 0, id: cid };
                    grouped[cid].count += 1;
                    grouped[cid].sum += (s.totalAmount || s.total || 0);
                });
                items = Object.values(grouped);
                headers = ['العميل', 'عدد الفواتير', 'إجمالي المبيعات'];
            } else if (activeSub === 'حسب الصنف' || activeSub === 'حسب التصنيف' || activeSub === 'لتصنيف') {
                const grouped: Record<string, { name: string, quantity: number, total: number, id: string }> = {};
                validSales.forEach(s => {
                    (s.items || []).forEach((it: any) => {
                        const name = it.name || products[it.id]?.name || 'غير معروف';
                        if (!grouped[name]) grouped[name] = { name, quantity: 0, total: 0, id: name };
                        grouped[name].quantity += (it.quantity || 0);
                        grouped[name].total += (it.price || 0) * (it.quantity || 0);
                    });
                });
                items = Object.values(grouped);
                headers = ['الصنف', 'الكمية المباعة', 'الإجمالي'];
            }
        } 
        else if (activeCategory === 'profits') {
            title = `تقرير الأرباح - ${activeSub}`;
            items = validSales;
            headers = ['المرجع', 'التكلفة', 'المبيعات', 'الربح'];
        }
        else if (activeCategory === 'invoices') {
            title = `عرض فواتير المبيعات`;
            items = validSales;
            headers = ['الفاتورة', 'التاريخ', 'العميل', 'النوع', 'المبلغ', 'عرض'];
        }
        else if (activeCategory === 'discounts') {
            title = `الخصومات - ${activeSub}`;
            items = validSales.filter(s => (s.discount || 0) > 0);
            headers = ['الفاتورة/المرجع', 'الإجمالي قبل الخصم', 'الخصم', 'الإجمالي بعد الخصم'];
        }
        else if (activeCategory === 'credit_invoices') {
            title = 'الفواتير الآجلة';
            items = sales.filter(s => s.paymentType === 'credit' && s.status !== 'cancelled');
            headers = ['الفاتورة', 'التاريخ', 'العميل', 'المبلغ', 'المدفوع', 'المتبقي'];
        }
        else if (activeCategory === 'returned_invoices') {
            title = 'فواتير مرتجع مبيعات';
            items = sales.filter(s => s.status === 'returned');
            headers = ['الفاتورة', 'التاريخ', 'العميل', 'المبلغ المسترجع'];
        }
        else if (activeCategory === 'canceled_invoices') {
            title = 'الفواتير الملغاة';
            items = sales.filter(s => s.status === 'cancelled');
            headers = ['الفاتورة', 'التاريخ', 'العميل', 'المبلغ'];
        }
        else if (activeCategory === 'quotations') {
            title = 'عروض الأسعار';
            items = quotations.filter(q => q.createdAt >= new Date(dateRange.startDate).getTime() && q.createdAt <= new Date(dateRange.endDate).getTime() + 86400000);
            headers = ['العرض', 'التاريخ', 'العميل', 'الإجمالي', 'الحالة'];
        }
        else if (activeCategory === 'taxes_by_product' || activeCategory === 'taxes_by_customer') {
            title = activeCategory === 'taxes_by_product' ? 'الضرائب حسب الصنف' : 'الضرائب حسب العميل';
            if (activeCategory === 'taxes_by_product') {
                const productTaxes: Record<string, { name: string, salesNoTax: number, tax: number, total: number, id: string }> = {};
                validSales.forEach(s => {
                    (s.items || []).forEach((it: any) => {
                        const name = it.name || products[it.id]?.name || 'غير معروف';
                        const total = (it.price || 0) * (it.quantity || 0);
                        const tax = total * 0.15; // Assuming standard 15% VAT
                        const noTax = total - tax;
                        if (!productTaxes[name]) productTaxes[name] = { name, salesNoTax: 0, tax: 0, total: 0, id: name };
                        productTaxes[name].salesNoTax += noTax;
                        productTaxes[name].tax += tax;
                        productTaxes[name].total += total;
                    });
                });
                items = Object.values(productTaxes);
                headers = ['الصنف', 'المبيعات دون ضريبة', 'الضريبة', 'الإجمالي'];
            } else {
                const customerTaxes: Record<string, { customerName: string, salesNoTax: number, tax: number, total: number, id: string }> = {};
                validSales.forEach(s => {
                    const cname = s.customerId ? customers[s.customerId]?.name || 'غير معروف' : 'نقدي/عام';
                    const total = s.totalAmount || s.total || 0;
                    const tax = s.taxAmount || 0;
                    const noTax = total - tax;
                    const cid = s.customerId || 'cash';
                    if (!customerTaxes[cid]) customerTaxes[cid] = { customerName: cname, salesNoTax: 0, tax: 0, total: 0, id: cid };
                    customerTaxes[cid].salesNoTax += noTax;
                    customerTaxes[cid].tax += tax;
                    customerTaxes[cid].total += total;
                });
                items = Object.values(customerTaxes);
                headers = ['العميل', 'المبيعات دون ضريبة', 'الضريبة', 'الإجمالي'];
            }
        }

        return { items, headers, title, type: 'standard' };
    }, [sales, quotations, activeCategory, activeSub, dateRange, customers, products]);

    const handleExportExcel = () => {
        let exportData: any[] = [];
        if (activeSub === 'اكسل') {
            exportData = computedData.items.map(s => ({
                'رقم الفاتورة': s.invoiceNumber,
                'التاريخ': new Date(s.createdAt).toLocaleDateString('ar-EG'),
                'العميل': s.customerId ? customers[s.customerId]?.name || 'غير معروف' : 'نقدي/عام',
                'طريقة الدفع': s.paymentType === 'cash' ? 'نقدي' : s.paymentType === 'credit' ? 'آجل' : s.paymentType === 'card' ? 'بطاقة' : s.paymentType === 'bank' ? 'حوالة' : 'غير محدد',
                'المبلغ الإجمالي': s.totalAmount || s.total || 0,
                'الخصم': s.discount || 0,
                'الضريبة': s.taxAmount || 0
            }));
        } else if (activeSub === 'اكسل مع المنتجات') {
            computedData.items.forEach(s => {
                const invNo = s.invoiceNumber;
                const cDate = new Date(s.createdAt).toLocaleDateString('ar-EG');
                const cName = s.customerId ? customers[s.customerId]?.name || 'غير معروف' : 'نقدي/عام';
                if (s.items && s.items.length) {
                    s.items.forEach((it: any) => {
                        exportData.push({
                            'رقم الفاتورة': invNo,
                            'التاريخ': cDate,
                            'العميل': cName,
                            'الصنف': it.name || products[it.id]?.name || 'غير معروف',
                            'الكمية': it.quantity,
                            'السعر': it.price,
                            'الإجمالي': it.quantity * it.price
                        });
                    });
                }
            });
        }
        generateExcel(exportData, `تقرير_المبيعات_${new Date().getTime()}`);
    };

    const getRowValue = (item: any, header: string, index: number) => {
        switch (header) {
            case 'الفاتورة':
            case 'المرجع':
            case 'الفاتورة/المرجع':
                return (
                    <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2.5 py-1 rounded-md border border-slate-200/60 dark:border-slate-700/60">
                        {item.invoiceNumber ? `#${item.invoiceNumber}` : `#${item.id?.substring(0, 6)}`}
                    </span>
                );
            case 'التاريخ':
                const ts = item.date || item.createdAt || 0;
                return (
                    <span className="text-gray-600 dark:text-gray-300">
                        {new Date(ts).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}
                    </span>
                );
            case 'العميل':
                const custName = item.customerId ? customers[item.customerId]?.name || 'غير معروف' : item.customerName || 'نقدي/عام';
                return <span className="font-bold text-gray-800 dark:text-gray-200">{custName}</span>;
            case 'طريقة الدفع':
                const payTypes: Record<string, { label: string, color: string }> = {
                    cash: { label: 'نقدي', color: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60' },
                    credit: { label: 'آجل', color: 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200/60' },
                    card: { label: 'بطاقة', color: 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border border-blue-200/60' },
                    cheque: { label: 'شيك', color: 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60' },
                    bank: { label: 'حوالة', color: 'bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 border border-purple-200/60' }
                };
                const pInfo = payTypes[item.paymentType || 'cash'] || { label: 'نقدي', color: 'bg-emerald-50 text-emerald-600 border border-emerald-200/60' };
                return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${pInfo.color}`}>{pInfo.label}</span>;
            case 'المبلغ':
            case 'المبيعات':
            case 'الإجمالي':
            case 'الإجمالي بعد الخصم':
                const val = item.totalAmount || item.total || item.sum || 0;
                return <span className="font-extrabold text-emerald-650 dark:text-emerald-400 text-sm">{(val || 0).toLocaleString()} ر.س</span>;
            case 'التكلفة':
                const totalCost = (item.items || []).reduce((acc: number, it: any) => acc + ((it.cost || products[it.id]?.cost || 0) * (it.quantity || 1)), 0);
                return <span className="text-gray-500 font-bold">{totalCost.toLocaleString()} ر.س</span>;
            case 'الربح':
                const itemSales = item.totalAmount || item.total || 0;
                const costOfSales = (item.items || []).reduce((acc: number, it: any) => acc + ((it.cost || products[it.id]?.cost || 0) * (it.quantity || 1)), 0);
                const profitTotal = itemSales - costOfSales;
                return (
                    <span className={`font-black text-sm ${profitTotal >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-655'}`}>
                        {profitTotal.toLocaleString()} ر.س
                    </span>
                );
            case 'النوع':
                return item.paymentType === 'cash' ? 'نقدي' : 'آجل';
            case 'عرض':
                return (
                    <button 
                        onClick={() => printInvoice(item, 'sale', item.items || [])} 
                        className="text-blue-600 hover:text-blue-700 font-black hover:underline cursor-pointer"
                    >
                        عرض الفاتورة
                    </button>
                );
            case 'الإجمالي قبل الخصم':
                const beforeDisc = (item.totalAmount || item.total || 0) + (item.discount || 0);
                return <span className="text-gray-500">{beforeDisc.toLocaleString()} ر.س</span>;
            case 'الخصم':
                return <span className="text-red-500 font-extrabold">{(item.discount || 0).toLocaleString()} ر.س</span>;
            case 'المدفوع':
                return <span className="text-blue-600 font-bold">{(item.paidAmount || 0).toLocaleString()} ر.س</span>;
            case 'المتبقي':
                const rem = (item.totalAmount || item.total || 0) - (item.paidAmount || 0);
                return <span className="text-red-650 font-black">{rem.toLocaleString()} ر.س</span>;
            case 'المبلغ المسترجع':
                return <span className="text-orange-600 font-extrabold">{(item.totalAmount || item.total || 0).toLocaleString()} ر.س</span>;
            case 'العرض':
                return (
                    <span className="font-mono text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-md border border-purple-200">
                        {`#${item.quotationNumber || item.id?.substring(0, 6)}`}
                    </span>
                );
            case 'الحالة':
                const isAcc = item.status === 'accepted';
                return (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${isAcc ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                        {isAcc ? 'مقبول' : item.status === 'rejected' ? 'مرفوض' : 'مسودة'}
                    </span>
                );
            case 'عدد الفواتير':
                return <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded font-black">{item.count || 1}</span>;
            case 'إجمالي المبيعات':
                return <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">{(item.sum || 0).toLocaleString()} ر.س</span>;
            case 'المبيعات دون ضريبة':
                return <span className="text-slate-600 dark:text-slate-400">{(item.salesNoTax || 0).toLocaleString()} ر.س</span>;
            case 'الضريبة':
                return <span className="text-purple-650 dark:text-purple-400 font-extrabold">{(item.taxAmount || item.tax || 0).toLocaleString()} :ر.س</span>;
            case 'الصنف':
                return <span className="font-bold text-gray-800 dark:text-gray-200">{item.name || 'غير معروف'}</span>;
            case 'الكمية المباعة':
                return <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-lg font-black text-xs">{item.quantity || 0}</span>;
            default:
                return String(item[header] || '');
        }
    };

    const renderTableContent = () => {
        const { items, headers, type } = computedData;

        if (type === 'excel_ready') {
            return (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                    <FileSpreadsheet size={48} className="text-green-650 mb-4" />
                    <h3 className="text-xl font-bold text-black dark:text-gray-100 mb-2">تصدير الفواتير إلى إكسل</h3>
                    <p className="text-black mb-6 max-w-md">يمكنك تصدير بيانات المبيعات للفترة المحددة مباشرة إلى ملف Excel للاحتفاظ بها أو مشاركتها.</p>
                    <button onClick={handleExportExcel} className="bg-green-650 text-white flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 transition">
                        <FileSpreadsheet size={20} />
                        تنزيل ملف الإكسل
                    </button>
                </div>
            );
        }

        if (items.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-full mb-4">
                        <XCircle className="text-slate-400 w-10 h-10" />
                    </div>
                    <h3 className="text-sm font-black text-text-main mb-1">لا توجد بيانات متاحة</h3>
                    <p className="text-slate-400 text-xs max-w-sm font-bold">لا يتوفر أي سجلات مبيعات في هذه الفترة لتصنيف التقرير المحدد.</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl overflow-hidden p-3 sm:p-4">
                <div className="flex justify-between items-center mb-3 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <span className="text-xs font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full">
                        عدد السجلات المكتشفة: {items.length}
                    </span>
                </div>

                <div className="flex-1 overflow-auto bg-card-bg rounded-xl border border-border-main scrollbar-thin">
                    <table className="w-full text-right text-xs">
                        <thead className="bg-[#f8f9fa] dark:bg-slate-950 text-text-main font-black sticky top-0 border-b border-border-main z-10">
                            <tr>
                                {headers.map((head, idx) => (
                                    <th key={idx} className="p-3 text-[11px] font-black text-text-main">
                                        {head}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {items.map((item, itemIdx) => (
                                <tr key={`sales-report-row-${item.id || itemIdx}-${itemIdx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/50 transition-colors">
                                    {headers.map((header, headIdx) => (
                                        <td key={headIdx} className="p-3 font-extrabold text-text-main align-middle whitespace-nowrap">
                                            {getRowValue(item, header, itemIdx)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col md:flex-row h-full md:overflow-hidden pb-20 md:pb-0 bg-white">
            {/* Mobile Select Menu */}
            <div className="md:hidden flex flex-col gap-2 p-3 bg-[#f8f9fa] border-b border-gray-200 z-10 w-full mb-0">
                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">نوع التقرير</label>
                    <div className="relative">
                        <select className="w-full bg-white border border-gray-200 text-black dark:text-white text-xs rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 block p-2 appearance-none font-bold outline-none transition-all"
                            value={activeCategory}
                            onChange={(e) => {
                                const catId = e.target.value as ReportCategory;
                                const cat = REPORT_MENUS.find(c => c.id === catId);
                                setActiveCategory(catId);
                                if (cat && cat.subs.length > 0) {
                                    setActiveSub(cat.subs[0]);
                                } else {
                                    setActiveSub('');
                                }
                                setIsMobileSubDropdownOpen(false);
                            }}
                        >
                            {REPORT_MENUS.map(m => (
                                <option key={m.id} value={m.id}>{m.title}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                    </div>
                </div>

                {REPORT_MENUS.find(m => m.id === activeCategory)?.subs.length ? (
                    <div className="flex flex-col gap-1.5 mt-1 relative">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">التصنيف</label>
                        <button 
                            onClick={() => setIsMobileSubDropdownOpen(!isMobileSubDropdownOpen)}
                            className="bg-white border border-gray-200 text-black dark:text-white text-xs rounded-lg p-2.5 font-bold w-full flex justify-between items-center shadow-sm"
                        >
                            <span className="text-blue-700">{activeSub || 'اختر التصنيف'}</span>
                            <ChevronDown size={14} className={`text-black transition-transform ${isMobileSubDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {isMobileSubDropdownOpen && (
                            <div className="absolute top-[60px] left-0 right-0 bg-white border border-gray-100 shadow-2xl rounded-xl z-50 max-h-56 overflow-y-auto flex flex-col p-1.5 divide-y divide-gray-50">
                                {REPORT_MENUS.find(m => m.id === activeCategory)?.subs.map(sub => (
                                    <button
                                        key={sub}
                                        onClick={() => { setActiveSub(sub); setIsMobileSubDropdownOpen(false); }}
                                        className={`w-full py-2.5 px-3 rounded-lg text-[11px] font-bold transition-all text-right flex justify-between items-center ${activeSub === sub ? 'bg-white dark:bg-slate-800 text-blue-700' : 'text-black dark:text-gray-300 hover:bg-white'}`}
                                    >
                                        <span>{sub}</span>
                                        {activeSub === sub && <CheckCircle size={14} className="text-blue-600" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Desktop Sidebar Menu */}
            <div className="hidden md:flex w-56 flex-shrink-0 bg-[#f8f9fa] border-l border-gray-200 h-full overflow-y-auto custom-scrollbar flex-col p-2 space-y-1">
                {REPORT_MENUS.map(menu => {
                    const isExpanded = expandedMenu === menu.id;
                    const isActivePrimary = activeCategory === menu.id;
                    return (
                        <div key={menu.id} className="flex flex-col">
                            <button
                                onClick={() => handleMenuClick(menu.id as ReportCategory, menu.subs)}
                                className={`flex items-center justify-between p-2 rounded-lg text-xs font-bold transition-all ${isActivePrimary ? 'bg-white text-blue-700 shadow-sm' : 'text-black dark:text-gray-200 hover:bg-white'}`}
                            >
                                <span className="flex items-center gap-2">
                                    {menu.id === 'sales' && <List size={16} />}
                                    {menu.title}
                                </span>
                                {menu.subs.length > 0 && (
                                    <ChevronLeft size={16} className={`transition-transform duration-300 ${isExpanded ? '-rotate-90' : ''}`} />
                                )}
                            </button>
                            
                            <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-[500px] opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                                <div className="flex flex-col pr-8 border-r-2 border-gray-100 mr-4 space-y-1 py-1">
                                    {menu.subs.map(sub => {
                                        const isSubActive = isActivePrimary && activeSub === sub;
                                        return (
                                            <button
                                                key={sub}
                                                onClick={() => handleSubClick(menu.id as ReportCategory, sub)}
                                                className={`text-right text-[11px] p-2 rounded-lg transition-colors ${isSubActive ? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-black dark:text-gray-300 hover:bg-white hover:text-gray-900'}`}
                                            >
                                                {sub}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
                <div className="p-1 px-3 border-b border-gray-100 flex justify-end items-center bg-[#f8f9fa] z-10 sticky top-0 shadow-sm">
                    {computedData.type !== 'excel_ready' && (
                        <button onClick={() => {
                            const rows = computedData.items.map((s, idx) => {
                                const row = [];
                                if (computedData.headers.includes('الفاتورة')) row.push('#' + (s.invoiceNumber || ''));
                                if (computedData.headers.includes('التاريخ')) row.push(new Date(s.createdAt).toLocaleString('ar-EG'));
                                if (computedData.headers.includes('العميل')) row.push(s.customerId ? customers[s.customerId]?.name || 'غير معروف' : 'نقدي/عام');
                                if (computedData.headers.includes('طريقة الدفع')) row.push(s.paymentType === 'cash' ? 'نقدي' : s.paymentType === 'credit' ? 'آجل' : s.paymentType === 'card' ? 'بطاقة' : s.paymentType === 'bank' ? 'حوالة' : 'شيك');
                                if (computedData.headers.includes('النوع')) row.push(s.paymentType === 'cash' ? 'نقدي' : 'آجل');
                                if (computedData.headers.includes('المبلغ')) row.push((s.totalAmount || s.total || 0).toLocaleString());
                                if (computedData.headers.includes('الصنف')) row.push('قريباً');
                                if (computedData.headers.includes('الكمية المباعة')) row.push('0');
                                if (computedData.headers.includes('الإجمالي') && !computedData.headers.includes('الفاتورة')) row.push('0');
                                if (computedData.headers.includes('المدفوع')) row.push((s.paidAmount || 0).toLocaleString());
                                if (computedData.headers.includes('المتبقي')) row.push(((s.totalAmount || s.total || 0) - (s.paidAmount || 0)).toLocaleString());
                                if (computedData.headers.includes('الإجمالي قبل الخصم')) row.push(((s.totalAmount || s.total || 0) + (s.discount || 0)).toLocaleString());
                                if (computedData.headers.includes('الخصم')) row.push(s.discount || 0);
                                if (computedData.headers.includes('الإجمالي بعد الخصم')) row.push((s.totalAmount || s.total || 0).toLocaleString());
                                if (computedData.headers.includes('الفاتورة/المرجع')) row.push('#' + (s.invoiceNumber || ''));
                                if (computedData.headers.includes('العرض')) row.push('#' + (s.quotationNumber || ''));
                                if (computedData.headers.includes('الحالة')) row.push(s.status === 'accepted' ? 'مقبول' : s.status === 'rejected' ? 'مرفوض' : 'مسودة');
                                if (computedData.headers.includes('المبلغ المسترجع')) row.push((s.totalAmount || s.total || 0).toLocaleString());
                                if (computedData.headers.includes('المرجع')) row.push('#' + (s.invoiceNumber || ''));
                                if (computedData.headers.includes('التكلفة')) row.push('قريباً');
                                if (computedData.headers.includes('المبيعات') && !computedData.headers.includes('المبلغ')) row.push((s.totalAmount || s.total || 0).toLocaleString());
                                if (computedData.headers.includes('الربح')) row.push('قريباً');
                                if (computedData.headers.includes('المبيعات دون ضريبة')) row.push(((s.totalAmount || s.total || 0) - (s.taxAmount || 0)).toLocaleString());
                                if (computedData.headers.includes('الضريبة')) row.push((s.taxAmount || 0).toLocaleString());
                                return row;
                            });
                            
                            // Remove columns that are actions
                            const filteredHeaders = computedData.headers.filter(h => h !== 'عرض');
                            printReport(computedData.title, filteredHeaders, rows);
                        }} className="justify-center flex items-center gap-1.5 bg-white dark:bg-slate-800 text-blue-700 hover:bg-white border border-gray-200 px-3 py-1 flex-shrink-0 rounded-md transition text-[10px] font-black shadow-sm">
                            <Printer size={14} /> طباعة القائمة
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-auto bg-white custom-scrollbar relative">
                    {renderTableContent()}
                </div>
            </div>
        </div>
    );
}
