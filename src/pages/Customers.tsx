import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, deleteDoc, where, writeBatch, increment, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { LocalCache } from '../lib/localCache';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { printInvoice, printReport } from '../lib/printHelper';
import { Plus, Search, UserCircle, Edit2, X, Upload, Trash2, Receipt, MoreVertical, Eye, RotateCcw, Ban, ArrowLeft, ArrowRight, UserPlus, RefreshCw, FileText, UserCheck, FileSearch, Mail } from 'lucide-react';
import { logUserAction } from '../lib/logger';
import * as XLSX from 'xlsx';
import ImportMapper from '../components/ImportMapper';
import { generateImportReportPdf } from '../lib/pdfHelper';

interface Customer {
    id: string;
    name: string;
    phone: string;
    address: string;
    balance: number;
    createdAt: number;
}

import { useNavigate } from 'react-router-dom';

export default function Customers() {
    const navigate = useNavigate();
    const { appUser } = useAuthStore();
    const { settings } = useSettingsStore();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [search, setSearch] = useState('');
    const [isActionModalOpen, setActionModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [viewMode, setViewMode] = useState<'menu' | 'list' | 'initial_balances' | 'receivables' | 'receivables_report' | 'credit_balances'>('menu');
    const [isBannerVisible, setIsBannerVisible] = useState(true);
    const [selectedOpeningBalanceCustomer, setSelectedOpeningBalanceCustomer] = useState<Customer | null>(null);
    const [mapperState, setMapperState] = useState<{ isOpen: boolean; headers: string[]; rows: any[] }>({
        isOpen: false,
        headers: [],
        rows: []
    });
    
    // Customer Details Modal State
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
    const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
    const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'credit' | 'cash'>('credit');
    const [settlementModal, setSettlementModal] = useState<{
        isOpen: boolean;
        invoice: any | null;
    }>({
        isOpen: false,
        invoice: null
    });
    const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
    const [customerImportReport, setCustomerImportReport] = useState<{
        isOpen: boolean;
        total: number;
        added: number;
        skipped: number;
        addedDetails: string[];
        skippedDetails: string[];
    } | null>(null);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

    const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 4000);
    };

    const renderModals = () => (
        <>
            {notification && (
                <div className={`fixed top-4 right-1/2 translate-x-1/2 z-[200] px-6 py-3 rounded-xl shadow-xl font-bold text-sm animate-in slide-in-from-top-4 ${notification.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}>
                    {notification.message}
                </div>
            )}
            {customerImportReport && customerImportReport.isOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-gray-100 dark:border-slate-800 text-right dir-rtl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-slate-800">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FileText className="text-blue-600" size={20} />
                                <span>تقرير استيراد العملاء وملخص التجاوزات</span>
                            </h3>
                            <button onClick={() => setCustomerImportReport(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-3 my-5">
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-center">
                                <div className="text-xs text-slate-500 dark:text-slate-400 font-bold">إجمالي المجموع</div>
                                <div className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">{customerImportReport.total}</div>
                            </div>
                            <div className="bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/30 text-center">
                                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">تمت إضافتهم</div>
                                <div className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{customerImportReport.added}</div>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-100 dark:border-blue-900/30 text-center">
                                <div className="text-xs text-blue-600 dark:text-blue-400 font-bold">تم تجاوزهم (مكرر)</div>
                                <div className="text-xl font-black text-blue-700 dark:text-blue-400 mt-1">{customerImportReport.skipped}</div>
                            </div>
                        </div>

                        <div className="space-y-4 max-h-60 overflow-y-auto pr-1">
                            {customerImportReport.skippedDetails.length > 0 && (
                                <div>
                                    <h4 className="font-bold text-blue-700 dark:text-blue-400 mb-2 text-xs">
                                        عملاء تم تجاوزهم لوجود الاسم مسبقاً ({customerImportReport.skippedDetails.length}):
                                    </h4>
                                    <ul className="bg-blue-50/60 dark:bg-blue-950/20 rounded-xl p-3 text-xs space-y-1 text-blue-900 dark:text-blue-300 border border-blue-100">
                                        {customerImportReport.skippedDetails.map((detail, idx) => (
                                            <li key={idx} className="list-disc list-inside">{detail}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {customerImportReport.addedDetails.length > 0 && (
                                <div>
                                    <h4 className="font-bold text-emerald-700 dark:text-emerald-400 mb-2 text-xs">
                                        عملاء تم استيرادهم بنجاح ({customerImportReport.addedDetails.length}):
                                    </h4>
                                    <ul className="bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl p-3 text-xs space-y-1 text-emerald-900 dark:text-emerald-300 border border-emerald-100">
                                        {customerImportReport.addedDetails.map((detail, idx) => (
                                            <li key={idx} className="list-disc list-inside">{detail}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
                            <button
                                onClick={async () => {
                                    if (!customerImportReport) return;
                                    setIsDownloadingPdf(true);
                                    try {
                                        const { download } = await generateImportReportPdf({
                                            title: 'تقرير استيراد العملاء وملخص التجاوزات',
                                            total: customerImportReport.total,
                                            added: customerImportReport.added,
                                            skipped: customerImportReport.skipped,
                                            addedDetails: customerImportReport.addedDetails,
                                            skippedDetails: customerImportReport.skippedDetails,
                                        });
                                        download();
                                    } catch (err) {
                                        console.error('PDF error', err);
                                        alert('حدث خطأ أثناء إنشاء ملف PDF');
                                    } finally {
                                        setIsDownloadingPdf(false);
                                    }
                                }}
                                disabled={isDownloadingPdf}
                                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold transition duration-200 flex items-center gap-2 text-sm shadow-sm cursor-pointer"
                            >
                                <FileText size={18} />
                                <span>{isDownloadingPdf ? 'جاري إنشاء PDF...' : 'تحميل التقرير PDF'}</span>
                            </button>

                            <button
                                onClick={() => setCustomerImportReport(null)}
                                className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition duration-200 text-sm cursor-pointer"
                            >
                                إغلاق التقرير
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ImportMapper 
                isOpen={mapperState.isOpen}
                onClose={() => setMapperState(prev => ({ ...prev, isOpen: false }))}
                onImport={processMappedImport}
                headers={mapperState.headers}
                rows={mapperState.rows}
                fields={[
                    { key: 'name', label: 'اسم العميل', required: true },
                    { key: 'phone', label: 'رقم الهاتف' },
                    { key: 'address', label: 'العنوان' },
                    { key: 'balance', label: 'الرصيد الافتتاحي' }
                ]}
            />

            {settlementModal.isOpen && settlementModal.invoice && selectedCustomer && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[200] animate-fade-in" onClick={() => setSettlementModal({ isOpen: false, invoice: null })}>
                    <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl border border-gray-100 flex flex-col gap-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} dir="rtl">
                        <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                            <h3 className="text-lg font-black text-black dark:text-white flex items-center gap-2">
                                <Receipt className="text-blue-600" size={20} />
                                خيارات سداد الفاتورة للعميل الدائن
                            </h3>
                            <button 
                                onClick={() => setSettlementModal({ isOpen: false, invoice: null })} 
                                className="text-gray-400 hover:text-gray-600 bg-white dark:bg-slate-900 hover:bg-white p-2 rounded-xl transition"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="bg-white border border-amber-100 rounded-2xl p-4 flex flex-col gap-2">
                            <div className="text-sm font-black text-amber-900">
                                تنبيه: العميل لديه رصيد دائن أو مسدد مسبقاً!
                            </div>
                            <div className="text-xs font-bold text-amber-800 leading-relaxed">
                                رصيد العميل الحالي في الحساب هو <span className="font-extrabold text-sm underline underline-offset-4 decoration-amber-500">({Math.abs(selectedCustomer.balance).toLocaleString()} ر.س) دائن</span>.
                                يرجى اختيار الطريقة التي ترغب بسداد فاتورة المبيعات برقم <span className="font-black">({settlementModal.invoice.invoiceNumber})</span> وقيمتها <span className="font-black">({parseFloat(settlementModal.invoice.total).toLocaleString()} ر.س)</span> بها:
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={async () => {
                                    const inv = settlementModal.invoice;
                                    const invoiceTotal = parseFloat(inv.total) || 0;
                                    const alreadyPaid = parseFloat(inv.paidAmount) || 0;
                                    const invoiceRemaining = invoiceTotal - alreadyPaid;
                                    const availableCredit = selectedCustomer.balance < 0 ? Math.abs(selectedCustomer.balance) : 0;

                                    if (availableCredit < invoiceRemaining) {
                                        const cashNeeded = (invoiceRemaining - availableCredit).toFixed(2);
                                        alert(`رصيد العميل المتوفر (${availableCredit.toFixed(2)} ر.س) لا يكفي لتسديد الفاتورة بالكامل.\nالمبلغ المتبقي المطلوب دفعه إضافياً: ${cashNeeded} ر.س.`);
                                        return;
                                    }

                                    setSettlementModal({ isOpen: false, invoice: null });
                                    try {
                                        const batch = writeBatch(db);
                                        const customerRef = doc(db, 'customers', selectedCustomer.id);
                                        const invoiceRef = doc(db, 'sales', inv.id);

                                        batch.update(invoiceRef, {
                                            status: 'paid',
                                            paidAmount: invoiceTotal
                                        });

                                        batch.update(customerRef, {
                                            balance: increment(invoiceRemaining)
                                        });

                                        const vNum = nextVNumForPayment === '...' ? '0' : nextVNumForPayment;
                                        const vRef = doc(collection(db, 'vouchers'));
                                        batch.set(vRef, {
                                            voucherNumber: vNum,
                                            date: Date.now(),
                                            amount: invoiceRemaining,
                                            type: 'receipt',
                                            partyId: selectedCustomer.id,
                                            partyType: 'customer',
                                            partyName: selectedCustomer.name,
                                            description: `تسوية جزء/كامل الفاتورة #${inv.invoiceNumber} خصماً من رصيد العميل الدائن مباشرة`,
                                            createdBy: appUser?.uid,
                                            tenantId: appUser?.tenantId || 'single_store',
                                            createdAt: Date.now()
                                        });

                                        batch.set(doc(collection(db, 'cash')), {
                                            voucherNumber: vNum,
                                            date: Date.now(),
                                            amount: invoiceRemaining,
                                            type: 'in',
                                            category: 'in_payment',
                                            description: `تسوية للفاتورة #${inv.invoiceNumber} (خصماً من الرصيد الدائن) - عميل: ${selectedCustomer.name}`,
                                            referenceId: vRef.id,
                                            createdBy: appUser?.uid,
                                            tenantId: appUser?.tenantId || 'single_store',
                                            createdAt: Date.now(),
                                            affectsCash: true
                                        });

                                        await batch.commit();

                                        await logUserAction('تسوية فاتورة من الرصيد', `تم تسوية الفاتورة ${inv.invoiceNumber} بقيمة ${invoiceRemaining} ر.س خصماً من رصيد دائن للعميل ${selectedCustomer.name}`);
                                        showNotification('تم تسوية الفاتورة بنجاح مقتطعةً من رصيد العميل الدائن.');
                                    } catch (e: any) {
                                        console.error(e);
                                        showNotification('فشل في تسوية الفاتورة من الرصيد الدائن', 'error');
                                    }
                                }}
                                className="flex flex-col gap-1 text-right p-4 rounded-2xl border border-emerald-100 hover:border-emerald-500 bg-white hover:bg-white transition group cursor-pointer"
                            >
                                <span className="font-black text-sm text-emerald-900 flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block group-hover:scale-125 transition"></span>
                                    الخيار الأول: تسوية الفاتورة واقتطاعها من الرصيد الدائن المتاح
                                </span>
                                <span className="text-xs text-emerald-800 font-bold leading-relaxed pr-4">
                                    سيتم خصم قيمة الفاتورة المتبقية بالكامل من رصيد دفعة العميل المتوفرة لدينا حالياً. سيتم تقليص قيمة رصيد العميل الدائن وتسجيل المبلغ في الصندوق لضمان اتساق الإيرادات.
                                </span>
                            </button>

                            <button 
                                onClick={() => {
                                    const inv = settlementModal.invoice;
                                    setSettlementModal({ isOpen: false, invoice: null });
                                    openPaymentModal(inv);
                                }}
                                className="flex flex-col gap-1 text-right p-4 rounded-2xl border border-gray-200 hover:border-blue-500 bg-white dark:bg-slate-800 hover:bg-white transition group cursor-pointer"
                            >
                                <span className="font-black text-sm text-blue-900 flex items-center gap-1.5">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 block group-hover:scale-125 transition"></span>
                                    الخيار الثاني: دفع نقدي يدوي بالكامل (كاش أو شبكة)
                                </span>
                                <span className="text-xs text-blue-800 font-bold leading-relaxed pr-4">
                                    سيقوم العميل بدفع قيمة الفاتورة بشكل فعلي ومستقل كاش. ستقوم بإدخال قيمة المبلغ للصندوق بإنشاء سند قبض كاش حقيقي، وسبقى رصيد العميل دائنً لك بالكامل دون استقطاع من الرصيد القديم لعدم استخدامه.
                                </span>
                            </button>
                        </div>

                        <button 
                            onClick={() => setSettlementModal({ isOpen: false, invoice: null })}
                            className="bg-white dark:bg-slate-800 hover:bg-white text-black dark:text-gray-200 font-bold py-2.5 rounded-xl transition text-sm text-center border border-gray-200 cursor-pointer"
                        >
                            إلغاء وتراجع
                        </button>
                    </div>
                </div>
            )}

            {isActionModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                <UserPlus className="text-blue-600" /> 
                                {editingCustomer ? 'تعديل عميل' : 'إضافة عميل جديد'}
                            </h2>
                            <button onClick={() => { setActionModalOpen(false); setEditingCustomer(null); setName(''); setPhone(''); setPhone(''); setAddress(''); setBalance('0'); }} className="text-gray-400 hover:text-gray-600 mr-auto">
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveCustomer} className="flex flex-col gap-3">
                            <div>
                                <label className="block text-sm font-semibold mb-1">اسم العميل *</label>
                                <input required value={name} onChange={e=>setName(e.target.value)} type="text" className="w-full border-2 border-gray-200 rounded-xl p-2.5 focus:outline-none focus:border-blue-500 font-semibold" placeholder="اسم العميل" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">رقم الهاتف *</label>
                                <input required value={phone} onChange={e=>setPhone(e.target.value)} type="tel" className="w-full border-2 border-gray-200 rounded-xl p-2.5 focus:outline-none focus:border-blue-500 font-semibold text-left" placeholder="05xxxxxxxx" dir="ltr" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1">العنوان (اختياري)</label>
                                <input value={address} onChange={e=>setAddress(e.target.value)} type="text" className="w-full border-2 border-gray-200 rounded-xl p-2.5 focus:outline-none focus:border-blue-500 font-semibold" placeholder="المدينة، الحي..." />
                            </div>
                            {!editingCustomer && (
                                <div>
                                    <label className="block text-sm font-semibold mb-1">الرصيد الافتتاحي (ر.س)</label>
                                    <input value={balance} onChange={e=>setBalance(e.target.value)} type="number" step="0.01" className="w-full border-2 border-gray-200 rounded-xl p-2.5 focus:outline-none focus:border-blue-500 font-bold text-left text-lg text-red-600" placeholder="0" dir="ltr"/>
                                    <p className="text-xs text-black mt-1">القيمة الموجبة تعني العميل مدين لنا، السالبة تعني دائن.</p>
                                </div>
                            )}
                            <button type="submit" className="w-full bg-white text-black font-bold py-3 mt-4 rounded-xl hover:bg-gray-300 transition text-lg border border-gray-300 shadow-sm">
                                {editingCustomer ? 'تحديث البيانات' : 'حفظ العميل'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {selectedCustomer && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]" onClick={() => { setSelectedCustomer(null); setActiveDropdownId(null); }}>
                    <div className="bg-white rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4 p-4 md:p-6 pb-0 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 border border-gray-200 rounded-full flex items-center justify-center shrink-0">
                                    <UserCircle size={28} />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-lg md:text-xl font-bold truncate text-text-main">{selectedCustomer.name}</h2>
                                    <p className="text-text-main/50 font-black text-sm mt-0.5" dir="ltr">{selectedCustomer.phone}</p>
                                </div>
                            </div>
                            <button onClick={() => { setSelectedCustomer(null); setActiveDropdownId(null); }} className="text-gray-400 hover:text-gray-600 bg-white dark:bg-slate-800 p-2 rounded-xl transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="px-4 md:px-6 mb-4 shrink-0 flex flex-col gap-3">
                            <div className="bg-bg-main border border-border-main p-4 rounded-xl flex justify-between items-center">
                                <span className="text-text-main/80 font-bold text-sm">الرصيد الفعلي الحالي</span>
                                <span className={`font-black text-xl flex items-baseline gap-4 ${selectedCustomer.balance > 0 ? 'text-red-600' : selectedCustomer.balance < 0 ? 'text-emerald-600' : 'text-text-main'}`}>
                                    <div className="flex flex-col items-end">
                                        <span dir="ltr">
                                            {Math.abs(selectedCustomer.balance).toLocaleString()} <span className="text-sm font-normal">ر.س</span>
                                        </span>
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-opacity-20 mt-1">
                                            {selectedCustomer.balance > 0 ? 'عليه (مدين)' : selectedCustomer.balance < 0 ? 'له (دائن)' : 'لا يوجد رصيد'}
                                        </span>
                                    </div>
                                    {selectedCustomer.balance > 0 && (
                                        <button onClick={() => openPaymentModal(null)} className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm self-center">
                                            سداد (قبض)
                                        </button>
                                    )}
                                    {selectedCustomer.balance < 0 && (
                                        <button onClick={() => openPaymentModal(null, true)} className="text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm self-center">
                                            صرف مستحقات للعميل
                                        </button>
                                    )}
                                </span>
                            </div>
                        </div>
                        
                        <div className="flex flex-col flex-1 overflow-hidden">
                            <div className="px-4 md:px-6 py-2 bg-white dark:bg-slate-900 border-y border-gray-100 shrink-0 flex items-center gap-4 border-b">
                                <button
                                    onClick={() => setInvoiceFilter('credit')}
                                    className={`text-sm font-bold pb-2 border-b-2 pt-2 transition-colors ${invoiceFilter === 'credit' ? 'border-blue-600 text-blue-600' : 'border-transparent text-black hover:text-gray-700'}`}
                                >
                                    الفواتير الآجل
                                </button>
                                <button
                                    onClick={() => setInvoiceFilter('cash')}
                                    className={`text-sm font-bold pb-2 border-b-2 pt-2 transition-colors ${invoiceFilter === 'cash' ? 'border-blue-600 text-blue-600' : 'border-transparent text-black hover:text-gray-700'}`}
                                >
                                    الفواتير النقدي
                                </button>
                                <button
                                    onClick={() => setInvoiceFilter('all')}
                                    className={`text-sm font-bold pb-2 border-b-2 pt-2 transition-colors ${invoiceFilter === 'all' ? 'border-blue-600 text-blue-600' : 'border-transparent text-black hover:text-gray-700'}`}
                                >
                                    كل الفواتير
                                </button>
                            </div>
                            <div className="p-4 md:px-6 overflow-y-auto flex flex-col gap-3 h-full">
                                {customerInvoices.filter(inv => invoiceFilter === 'all' || inv.paymentType === invoiceFilter).length === 0 ? (
                                    <div className="text-center py-8 text-black bg-white dark:bg-slate-900 rounded-xl border border-dashed border-gray-200 text-sm font-bold">
                                        لا توجد فواتير مطابقة
                                    </div>
                                ) : (
                                    customerInvoices.filter(inv => invoiceFilter === 'all' || inv.paymentType === invoiceFilter).map((invoice, idx) => {
                                        const isCredit = invoice.paymentType === 'credit';
                                        const isPaid = invoice.status === 'paid';
                                        const isCancelled = invoice.status === 'cancelled';
                                        const isReturned = invoice.status === 'returned';
                                        const invoiceTotal = parseFloat(invoice.total) || 0;
                                        const alreadyPaid = parseFloat(invoice.paidAmount) || 0;
                                        const invoiceRemaining = invoiceTotal - alreadyPaid;
                                        const isPartiallyPaid = alreadyPaid > 0 && !isPaid && !isCancelled && !isReturned;
                                        
                                        return (
                                            <div key={`cust-invoice-${invoice.id || idx}`} className="bg-white border text-sm border-gray-100 rounded-xl p-3 md:p-4 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                                                <div className="flex flex-col gap-1 w-full md:w-auto">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-text-main">{invoice.invoiceNumber}</span>
                                                        <div className="flex items-center gap-1">
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isCredit ? 'bg-white text-orange-600 border border-orange-100' : 'bg-white text-emerald-600 border border-emerald-100'}`}>
                                                                {isCredit ? 'آجل' : 'نقدي'}
                                                            </span>
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isPaid ? 'bg-white text-emerald-600 border border-emerald-100' : isCancelled ? 'bg-white text-red-600 border border-red-100' : isReturned ? 'bg-white dark:bg-slate-800 text-black dark:text-gray-300 border border-gray-200' : isPartiallyPaid ? 'bg-white dark:bg-slate-800 text-blue-600 border border-gray-200' : 'bg-white dark:bg-slate-800 text-blue-600 border border-gray-200'}`}>
                                                                {isPaid ? 'تم الدفع' : isCancelled ? 'ملغية' : isReturned ? 'مرتجعة' : isPartiallyPaid ? 'دفع جزئي' : 'نشطة'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <span className="text-text-main/50 text-xs font-semibold">{new Date(invoice.date).toLocaleString('ar-SA')}</span>
                                                    <div className="font-black text-blue-600 mt-1">
                                                        {invoiceTotal.toLocaleString()} ر.س
                                                        {isPartiallyPaid && (
                                                            <div className="text-[10px] font-bold text-black mt-0.5">
                                                                مدفوع: {alreadyPaid.toLocaleString()} | متبقي: {invoiceRemaining.toLocaleString()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 w-full md:w-auto justify-end relative">
                                                    {isCredit && !isPaid && !isCancelled && !isReturned && (
                                                        <button 
                                                            onClick={() => {
                                                                if (selectedCustomer && selectedCustomer.balance <= 0) {
                                                                    setSettlementModal({
                                                                        isOpen: true,
                                                                        invoice: invoice
                                                                    });
                                                                } else {
                                                                    openPaymentModal(invoice);
                                                                }
                                                            }} 
                                                            className="flex-1 md:flex-none text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                                                        >
                                                            <Receipt size={14} /> تسديد
                                                        </button>
                                                    )}
                                                    
                                                    <div className="relative">
                                                        <button 
                                                            onClick={() => setActiveDropdownId(activeDropdownId === invoice.id ? null : invoice.id)}
                                                            className="p-2 bg-white dark:bg-slate-900 border border-gray-200 text-black dark:text-gray-300 hover:bg-white rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                                                        >
                                                            <MoreVertical size={14} /> خيارات
                                                        </button>
                                                        
                                                        {activeDropdownId === invoice.id && (
                                                            <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[100]" onClick={(e) => { e.stopPropagation(); setActiveDropdownId(null); }}>
                                                                <div className="w-64 bg-white border border-gray-100 rounded-2xl shadow-2xl z-10 py-2 overflow-hidden animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                                                                    <div className="px-4 py-2 border-b mb-1 flex justify-between items-center">
                                                                        <span className="text-xs font-bold text-gray-400">خيارات الفاتورة</span>
                                                                        <button onClick={() => setActiveDropdownId(null)} className="text-gray-400"><X size={14} /></button>
                                                                    </div>
                                                                    <button onClick={() => { setActiveDropdownId(null); printInvoice(invoice, 'sale', invoice.items || []); }} className="text-right px-4 py-3 text-sm font-bold text-black dark:text-gray-200 hover:bg-white hover:text-blue-600 transition-colors flex items-center justify-start gap-3 w-full">
                                                                        <Eye size={18} /> عرض الفاتورة
                                                                    </button>
                                                                    <button onClick={() => { setActiveDropdownId(null); alert('لعمل تعديل، يرجى إلغاء الفاتورة الحالية وإنشاء فاتورة جديدة لتجنب مشاكل المخزون والمحاسبة.'); }} className="w-full text-right px-4 py-3 text-sm font-bold text-black dark:text-gray-200 hover:bg-white hover:text-orange-600 transition-colors flex items-center justify-start gap-3">
                                                                        <Edit2 size={18} /> تعديل الفاتورة
                                                                    </button>
                                                                    {(!isReturned && !isCancelled) && (
                                                                        <div className="border-t mt-1 pt-1">
                                                                            <button onClick={() => { setActiveDropdownId(null); handleReturnOrCancelInvoice(invoice, 'returned'); }} className="w-full text-right px-4 py-3 text-sm font-bold text-black dark:text-gray-200 hover:bg-white hover:text-purple-600 transition-colors flex items-center justify-start gap-3">
                                                                                <RotateCcw size={18} /> إرجاع الفاتورة
                                                                            </button>
                                                                            <button onClick={() => { setActiveDropdownId(null); handleReturnOrCancelInvoice(invoice, 'cancelled'); }} className="w-full text-right px-4 py-3 text-sm font-bold text-red-600 hover:bg-white transition-colors flex items-center justify-start gap-3">
                                                                                <Ban size={18} /> إلغاء الفاتورة
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isPaymentModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
                    <div className="bg-white rounded-2xl w-full max-w-sm flex flex-col shadow-xl">
                        <div className="flex justify-between items-center mb-4 p-5 pb-0">
                            <div className="flex flex-col">
                                <h2 className="text-lg font-bold">
                                    {paymentTargetInvoice ? `تسديد الفاتورة #${paymentTargetInvoice.invoiceNumber}` : isPayingCustomer ? 'تسديد مستحقات للعميل' : 'تسديد ديون العميل'}
                                </h2>
                                <span className="text-[10px] font-bold text-blue-600 bg-white dark:bg-slate-800 px-2 py-0.5 rounded w-fit mt-1">
                                    {isPayingCustomer ? 'سند صرف رقم:' : 'سند قبض رقم:'} #{nextVNumForPayment}
                                </span>
                            </div>
                            <button onClick={() => { setIsPaymentModalOpen(false); setPaymentAmount(''); setPaymentTargetInvoice(null); setIsPayingCustomer(false); }} className="text-gray-400 hover:text-gray-600 bg-white dark:bg-slate-800 p-1.5 rounded-xl transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handlePaymentSubmit} className="flex flex-col gap-4 p-5">
                            <div>
                                <label className="block text-sm font-semibold mb-1.5">المبلغ المراد {isPayingCustomer ? 'صرفه' : 'سداده'} (ر.س)</label>
                                <input 
                                    required 
                                    value={paymentAmount} 
                                    onChange={e => setPaymentAmount(e.target.value)} 
                                    type="number" 
                                    step="0.01"
                                    min="0.01"
                                    className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-black text-lg text-center" 
                                    dir="ltr"
                                />
                                {paymentTargetInvoice && (
                                    <p className="text-xs text-black mt-2 text-center font-bold">
                                        المبلغ المتبقي للفاتورة: {(parseFloat(paymentTargetInvoice.total) - parseFloat(paymentTargetInvoice.paidAmount || 0)).toLocaleString()} ر.س
                                    </p>
                                )}
                            </div>
                            
                            <div className={`p-3 rounded-lg text-xs font-semibold leading-relaxed ${isPayingCustomer ? 'bg-white text-red-800' : 'bg-white dark:bg-slate-800 text-blue-800'}`}>
                                {isPayingCustomer 
                                    ? 'سيتم خصم هذا المبلغ من الصندوق (سند صرف) وسيتم تقليل رصيد ديوننا للعميل.' 
                                    : 'سيتم إيداع هذا المبلغ في الصندوق (سند قبض) وسيتم خصمه من رصيد العميل. أي مبالغ إضافية ستظل في رصيد العميل دائنة له.'}
                            </div>
                            
                            {!isPayingCustomer && paymentTargetInvoice && selectedCustomer && (selectedCustomer.balance < (parseFloat(paymentTargetInvoice.total) - parseFloat(paymentTargetInvoice.paidAmount || 0))) && (
                                <div className="p-3 rounded-lg text-xs font-semibold leading-relaxed bg-white text-orange-800 border border-orange-200">
                                    تنبيه: المبلغ المتبقي لهذه الفاتورة أكبر من إجمالي دين العميل الفعلي الحالي ({Math.max(0, selectedCustomer.balance).toLocaleString()} ر.س). يرجى تعديل المبلغ ليتطابق مع ما تم دفعه فعلياً، أو تسوية الفاتورة إن كانت مسددة مسبقاً.
                                </div>
                            )}

                            <button type="submit" disabled={isProcessingPayment} className={`w-full text-white font-bold py-3 mt-2 rounded-xl transition flex items-center justify-center gap-2 ${isProcessingPayment ? 'bg-gray-400 cursor-not-allowed' : (isPayingCustomer ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700')}`}>
                                <Receipt size={18} /> {isProcessingPayment ? 'جاري المعالجة...' : 'تأكيد السداد'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {selectedOpeningBalanceCustomer && (
                <OpeningBalanceModal 
                    customer={selectedOpeningBalanceCustomer}
                    onClose={() => setSelectedOpeningBalanceCustomer(null)}
                />
            )}
        </>
    );

    const openCustomerDetails = (cust: Customer) => {
        setSelectedCustomer(cust);
        setInvoiceFilter('credit'); // default to credit when opening
    };

    useEffect(() => {
        (window as any).onHeaderBack = () => {
            if (viewMode !== 'menu') {
                setViewMode('menu');
                return true;
            }
            return false;
        };
        return () => {
            delete (window as any).onHeaderBack;
        };
    }, [viewMode]);

    useEffect(() => {
        if (!selectedCustomer) {
            setCustomerInvoices([]);
            return;
        }
        const tenantId = appUser?.tenantId || 'single_store';
        const q = query(collection(db, 'sales'), where('tenantId', '==', tenantId), where('customerId', '==', selectedCustomer.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() });
            });
            list.sort((a,b) => b.date - a.date);
            setCustomerInvoices(list);
        }, (error) => handleFirestoreError(error, OperationType.GET, 'sales'));
        return () => unsubscribe();
    }, [selectedCustomer]);
    
    // Payment Modal State
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isPayingCustomer, setIsPayingCustomer] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentTargetInvoice, setPaymentTargetInvoice] = useState<any | null>(null);
    const [nextVNumForPayment, setNextVNumForPayment] = useState('...');
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);

    useEffect(() => {
        if (!isPaymentModalOpen) return;
        const tenantId = appUser?.tenantId || 'single_store';
        const qNum = query(collection(db, 'vouchers'), where('tenantId', '==', tenantId), orderBy('voucherNumber', 'desc'), limit(1));
        const unsubscribe = onSnapshot(qNum, snap => {
            if (!snap.empty) {
                const maxNum = parseInt(snap.docs[0].data().voucherNumber) || 0;
                setNextVNumForPayment((maxNum + 1).toString());
            } else {
                setNextVNumForPayment('1');
            }
        });
        return () => unsubscribe();
    }, [isPaymentModalOpen]);

    const openPaymentModal = (invoice: any | null, payingCustomer: boolean = false) => {
        setPaymentTargetInvoice(invoice);
        setIsPayingCustomer(payingCustomer);
        setIsPaymentModalOpen(true);
        if (invoice) {
            setPaymentAmount((invoice.total - (invoice.paidAmount || 0)).toString());
        } else if (selectedCustomer && selectedCustomer.balance > 0 && !payingCustomer) {
            setPaymentAmount(Math.abs(selectedCustomer.balance).toString());
        } else if (selectedCustomer && selectedCustomer.balance < 0 && payingCustomer) {
            setPaymentAmount(Math.abs(selectedCustomer.balance).toString());
        } else {
            setPaymentAmount('');
        }
    };

    const handlePaymentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!appUser || !selectedCustomer || isProcessingPayment) return;
        
        let amount = parseFloat(paymentAmount);
        if (isNaN(amount) || amount <= 0) return alert("الرجاء إدخال مبلغ صحيح");

        setIsProcessingPayment(true);
        const now = Date.now();
        try {
            const batch = writeBatch(db);
            const vRef = doc(collection(db, 'vouchers'));
            const vNum = nextVNumForPayment === '...' ? '0' : nextVNumForPayment;
            
            if (isPayingCustomer) {
                // Record voucher (سند صرف)
                batch.set(vRef, {
                    voucherNumber: vNum,
                    date: now,
                    amount: amount,
                    type: 'payment',
                    partyId: selectedCustomer.id,
                    partyType: 'customer',
                    partyName: selectedCustomer.name,
                    description: `صرف مبالغ مستحقة للعميل`,
                    createdBy: appUser.uid,
                    createdAt: now
                });

                // Record cash payment (سند صرف)
                batch.set(doc(collection(db, 'cash')), {
                    voucherNumber: vNum,
                    date: now,
                    amount: amount,
                    type: 'out',
                    category: 'out_payment',
                    description: `سند صرف #${vNum} (صرف للعميل) - ${selectedCustomer.name}`,
                    referenceId: vRef.id,
                    createdBy: appUser.uid,
                    createdAt: now,
                    affectsCash: true
                });

                // Update customer balance (Add to balance to move negative towards zero)
                batch.update(doc(db, 'customers', selectedCustomer.id), {
                    balance: increment(amount)
                });

                console.log("Committing batch for Payment (صرف)...");
                const commitPromise = batch.commit();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), 10000));
                await Promise.race([commitPromise, timeoutPromise]);
                console.log("Batch committed successfully!");
                logUserAction('صرف للعميل', `تم صرف ${amount} ر.س للعميل ${selectedCustomer.name}`);
                
                setIsPaymentModalOpen(false);
                setPaymentAmount('');
                setPaymentTargetInvoice(null);
                setIsPayingCustomer(false);
                showNotification(`تم صرف مبلغ ${amount} ر.س للعميل وخصمه من الصندوق بنجاح.`);

            } else {
                // Get unpaid invoices
                let unpaidInvoices = customerInvoices.filter(inv => inv.paymentType === 'credit' && inv.status !== 'paid' && inv.status !== 'cancelled' && inv.status !== 'returned');
                
                let invoicesToProcess = [];
                if (paymentTargetInvoice) {
                    // Ensure target invoice is processed first
                    invoicesToProcess.push(paymentTargetInvoice);
                    unpaidInvoices = unpaidInvoices.filter(i => i.id !== paymentTargetInvoice.id);
                }
                
                // Add remaining oldest first
                unpaidInvoices.sort((a,b) => a.date - b.date);
                invoicesToProcess = [...invoicesToProcess, ...unpaidInvoices];

                let remainingPayment = amount;
                let fullyPaidCount = 0;
                let partiallyPaidCount = 0;
                let paidInvoiceNumbers: string[] = [];

                for (const inv of invoicesToProcess) {
                    if (remainingPayment <= 0) break;
                    
                    const invoiceTotal = parseFloat(inv.total) || 0;
                    const alreadyPaid = parseFloat(inv.paidAmount) || 0;
                    const invoiceRemaining = invoiceTotal - alreadyPaid;
                    
                    if (invoiceRemaining <= 0) continue;
                    
                    if (remainingPayment >= invoiceRemaining) {
                        batch.update(doc(db, 'sales', inv.id), { 
                            status: 'paid', 
                            paidAmount: invoiceTotal 
                        });
                        remainingPayment -= invoiceRemaining;
                        fullyPaidCount++;
                        paidInvoiceNumbers.push(inv.invoiceNumber);
                    } else {
                        batch.update(doc(db, 'sales', inv.id), { 
                            paidAmount: alreadyPaid + remainingPayment 
                        });
                        remainingPayment = 0;
                        partiallyPaidCount++;
                        paidInvoiceNumbers.push(inv.invoiceNumber + ' (جزئي)');
                    }
                }

                // Record voucher (سند قبض)
                const vNum = nextVNumForPayment === '...' ? '0' : nextVNumForPayment;
                batch.set(vRef, {
                    voucherNumber: vNum,
                    date: now,
                    amount: amount,
                    type: 'receipt',
                    partyId: selectedCustomer.id,
                    partyType: 'customer',
                    partyName: selectedCustomer.name,
                    description: `تسديد ديون العميل` + (paidInvoiceNumbers.length ? ` للفواتير: ${paidInvoiceNumbers.join(', ')}` : ''),
                    createdBy: appUser.uid,
                    createdAt: now
                });

                // Record cash receipt (سند قبض)
                batch.set(doc(collection(db, 'cash')), {
                    voucherNumber: vNum,
                    date: now,
                    amount: amount,
                    type: 'in',
                    category: 'in_payment',
                    description: `سند قبض #${vNum} (تسديد ديون) - عميل: ${selectedCustomer.name}` + (paidInvoiceNumbers.length ? ` للفواتير: ${paidInvoiceNumbers.join(', ')}` : ''),
                    referenceId: vRef.id,
                    createdBy: appUser.uid,
                    createdAt: now,
                    affectsCash: true
                });

                // Update customer balance (Subtract from balance)
                batch.update(doc(db, 'customers', selectedCustomer.id), {
                    balance: increment(-amount)
                });

                console.log("Committing batch for Receipt (قبض)...");
                const commitPromise = batch.commit();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), 10000));
                await Promise.race([commitPromise, timeoutPromise]);
                console.log("Batch committed successfully!");
                logUserAction('تسديد ديون', `تم سداد ${amount} ر.س للعميل ${selectedCustomer.name}`);
                
                setIsPaymentModalOpen(false);
                setPaymentAmount('');
                setPaymentTargetInvoice(null);
                
                if (remainingPayment > 0 && fullyPaidCount === 0 && partiallyPaidCount === 0) {
                    showNotification(`تم دفع مبلغ ${amount} ر.س وإضافته الدائن (رصيد العميل).`);
                } else if (remainingPayment > 0) {
                    showNotification(`تم سداد الفواتير! وتبقى مبلغ ${remainingPayment} ر.س تم إضافته الدائن (رصيد العميل).`);
                } else {
                    showNotification(`تم السداد بنجاح! تم إغلاق ${fullyPaidCount} فواتير وتسديد جزئي لـ ${partiallyPaidCount} فواتير.`);
                }
            }

        } catch (error: any) {
            console.error('Payment Error:', error);
            handleFirestoreError(error, OperationType.UPDATE, 'payment_processing');
            showNotification(`حدث خطأ أثناء السداد: ${error.message || 'يرجى التحقق من الصلاحيات'}`, 'error');
        } finally {
            setIsProcessingPayment(false);
        }
    };

    const handleReturnOrCancelInvoice = async (invoice: any, actionType: 'returned' | 'cancelled') => {
        if (!appUser || !selectedCustomer) return;
        if (confirm(`هل أنت متأكد من ${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} الفاتورة ${invoice.invoiceNumber} واستعادة المخزون؟`)) {
            try {
                const batch = writeBatch(db);
                batch.update(doc(db, 'sales', invoice.id), { status: actionType });
                
                (invoice.items || []).forEach((item: any) => {
                    if (item.productId) {
                        batch.set(doc(db, 'products', item.productId), {
                            quantity: increment(item.quantity)
                        }, { merge: true });
                    }
                });

                if (invoice.paymentType === 'cash' || invoice.status === 'paid' || parseFloat(invoice.paidAmount || 0) > 0) {
                    const amountToRefund = invoice.paymentType === 'cash' || invoice.status === 'paid' ? parseFloat(invoice.total) : parseFloat(invoice.paidAmount || 0);
                    batch.set(doc(collection(db, 'cash')), {
                        date: Date.now(),
                        amount: amountToRefund,
                        type: 'out',
                        category: 'refund',
                        description: `${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} فاتورة ${invoice.invoiceNumber} للعميل ${selectedCustomer.name}`,
                        referenceId: invoice.id,
                        createdBy: appUser.uid,
                        createdAt: Date.now()
                    });
                    // Also subtract from the customer's balance if it was completely paid or partially paid with cash? 
                    // No! If it was partially paid, we refund the paid money to the cash register (or customer credit??)
                    // If the invoice was on credit, and they paid some of it, they should get it back.
                    // Wait, if it is cancelled, we should reverse the original customer balance + total.
                    if (invoice.paymentType === 'credit') {
                        // Original it added to balance. So we reduce balance by total.
                         batch.update(doc(db, 'customers', selectedCustomer.id), {
                             balance: increment(-parseFloat(invoice.total))
                         });
                    }
                } else if (invoice.paymentType === 'credit') {
                    // Reduce balance by full amount since it wasn't paid.
                     batch.update(doc(db, 'customers', selectedCustomer.id), {
                         balance: increment(-parseFloat(invoice.total))
                     });
                }

                await batch.commit();
                await logUserAction(actionType === 'returned' ? 'إرجاع فاتورة' : 'إلغاء فاتورة', `تم ${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} الفاتورة ${invoice.invoiceNumber}`);
                alert(`تم ${actionType === 'returned' ? 'إرجاع' : 'إلغاء'} الفاتورة بنجاح.`);
            } catch (error) {
                handleFirestoreError(error, OperationType.UPDATE, 'sales');
                alert('حدث خطأ');
            }
        }
    };

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [balance, setBalance] = useState('');

    
    const loadData = async (force = false) => {
        if (!appUser) return;
        const tenantId = appUser?.tenantId || 'single_store';
        setIsRefreshing(true);
        try {
            const q = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
            const res = await LocalCache.fetchCollection('customers', tenantId, q, { forceRefresh: force });
            setCustomers(res.data as Customer[]);
            
            // Sync selectedCustomer
            setSelectedCustomer(prev => {
                if (!prev) return prev;
                const updated = (res.data as Customer[]).find(c => c.id === prev.id);
                return updated || prev;
            });
        } catch (err) {
            console.error('Failed to load customers data:', err);
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [appUser]);


    const filtered = useMemo(() => {
        return customers.filter(c => c.name.includes(search) || c.phone.includes(search));
    }, [customers, search]);

    const handleExportHtmlReport = () => {
        let html = `
        <html dir="rtl" lang="ar">
            <head>
                <meta charset="utf-8">
                <title>تقرير الأرصدة الافتتاحية للمبالغ النقدية للعملاء</title>
                <style>
                    body { font-family: 'Arial', sans-serif; padding: 20px; background-color: #f9fafb; direction: rtl; }
                    h2 { text-align: center; color: #1f2937; margin-bottom: 20px; font-size: 24px; font-weight: bold; }
                    table { width: 100%; border-collapse: collapse; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
                    th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: center; font-size: 14px; }
                    th { background-color: #f3f4f6; color: #374151; font-weight: bold; }
                    tr:nth-child(even) { background-color: #f9fafb; }
                    .debt { color: #dc2626; font-weight: bold; }
                    .credit { color: #16a34a; font-weight: bold; }
                    .gray { color: #6b7280; }
                </style>
            </head>
            <body>
                <h2>تقرير الأرصدة الافتتاحية والمبالغ النقدية للعملاء</h2>
                <table>
                    <thead>
                        <tr>
                            <th>م</th>
                            <th>بيانات العميل</th>
                            <th>له (دائن)</th>
                            <th>عليه (مدين)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.map((c, idx) => `
                            <tr>
                                <td class="gray">${idx + 1}</td>
                                <td>${c.name}</td>
                                <td class="credit">${c.balance < 0 ? Math.abs(c.balance).toFixed(2) : "0.00"}</td>
                                <td class="debt">${c.balance > 0 ? c.balance.toFixed(2) : "0.00"}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
        </html>
        `;
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `تقرير_أرصدة_العملاء_${new Date().toISOString().split('T')[0]}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const openEditModal = (cust: Customer) => {
        if (appUser?.role !== 'admin') {
            alert('خاصية التعديل متاحة للمديرين فقط');
            return;
        }
        setEditingCustomer(cust);
        setName(cust.name);
        setPhone(cust.phone);
        setAddress(cust.address || '');
        setBalance(cust.balance.toString());
        setActionModalOpen(true);
    };

    const handleDelete = async (cust: Customer) => {
        if (appUser?.role !== 'admin') {
            alert('خاصية الحذف متاحة للمديرين فقط');
            return;
        }

        // Lazy check on demand instead of real-time subscription of all sales
        const tenantId = appUser?.tenantId || 'single_store';
        try {
            const checkQuery = query(
                collection(db, 'sales'),
                where('tenantId', '==', tenantId),
                where('customerId', '==', cust.id),
                limit(1)
            );
            const checkSnap = await getDocs(checkQuery);
            if (!checkSnap.empty) {
                alert('لا يمكن حذف هذا العميل لوجود فواتير مرتبطة به.');
                return;
            }
        } catch (e) {
            console.warn('Failed to verify customer link status:', e);
        }

        if (confirm(`هل أنت متأكد من حذف العميل: ${cust.name}؟`)) {
            try {
                const deletePromise = deleteDoc(doc(db, 'customers', cust.id));
                await LocalCache.removeCachedItem('customers', appUser?.tenantId || 'single_store', cust.id);
                setCustomers(prev => prev.filter(c => c.id !== cust.id));
                if (selectedCustomer?.id === cust.id) setSelectedCustomer(null);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Network timeout')), 10000));
                await Promise.race([deletePromise, timeoutPromise]);
                await logUserAction('حذف عميل', `تم حذف العميل: ${cust.name}`);
            } catch (error) {
                handleFirestoreError(error, OperationType.DELETE, 'customers');
                alert('فشل في الحذف');
            }
        }
    };

    const handleSaveCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Check if name already exists (case-insensitive, trimmed)
            const nameTrimmed = name.trim().toLowerCase();
            if (customers.some(c => c.name.trim().toLowerCase() === nameTrimmed && (!editingCustomer || c.id !== editingCustomer.id))) {
                alert('عذراً، اسم العميل مسجل مسبقاً! يرجى عدم تكرار أسماء العملاء.');
                return;
            }

            // Check if phone already exists for a DIFFERENT customer
            const phoneTrimmed = phone.trim();
            if (phoneTrimmed !== '' && customers.some(c => c.phone && c.phone.trim() === phoneTrimmed && (!editingCustomer || c.id !== editingCustomer.id))) {
                alert('رقم الهاتف مسجل مسبقاً لعميل آخر.');
                return;
            }

            const tenantId = appUser?.tenantId || 'single_store';
            if (editingCustomer) {
                const payload = {
                    name: name.trim(),
                    phone,
                    address,
                    balance: parseFloat(balance) || 0,
                    updatedAt: Date.now()
                };
                await updateDoc(doc(db, 'customers', editingCustomer.id), payload);
                await LocalCache.updateCachedItem('customers', tenantId, { id: editingCustomer.id, ...payload });
                setCustomers(prev => prev.map(c => c.id === editingCustomer.id ? { ...c, ...payload } : c));
                await logUserAction('تعديل عميل', `تم تعديل بيانات العميل: ${name}`);
            } else {
                const payload = {
                    name: name.trim(),
                    phone,
                    address,
                    balance: parseFloat(balance) || 0,
                    tenantId,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                const docRef = await addDoc(collection(db, 'customers'), payload);
                const newCustomer = { id: docRef.id, ...payload };
                await LocalCache.updateCachedItem('customers', tenantId, newCustomer);
                setCustomers(prev => [newCustomer, ...prev]);
                await logUserAction('إضافة عميل', `تم إضافة العميل: ${name}`);
            }

            setActionModalOpen(false);
            setEditingCustomer(null);
            setName('');
            setPhone('');
            setAddress('');
            setBalance('0');
        } catch (error: any) {
            handleFirestoreError(error, OperationType.WRITE, 'customers');
            alert('Failed to save customer');
        }
    };

    const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const arrayBuffer = evt.target?.result as ArrayBuffer;
                const dataArray = new Uint8Array(arrayBuffer);
                const wb = XLSX.read(dataArray, { type: 'array' });
                if (!wb.SheetNames || wb.SheetNames.length === 0) {
                    alert("ملف الإكسل فارغ ولا يحتوي على صفحات بيانات");
                    return;
                }
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

                if (data && data.length > 0) {
                    const allKeys = new Set<string>();
                    data.forEach((row: any) => {
                        Object.keys(row).forEach(k => {
                            if (k && !k.startsWith('__EMPTY')) {
                                allKeys.add(k.trim());
                            }
                        });
                    });
                    const headers = Array.from(allKeys);
                    if (headers.length > 0) {
                        setMapperState({ isOpen: true, headers, rows: data });
                    } else {
                        alert("لم يتم العثور على عناوين أعمدة صالحة في ملف الإكسل");
                    }
                } else {
                    alert("الملف فارغ أو لا يحتوي على أسطر بيانات");
                }
            } catch (err: any) {
                console.error("Import error", err);
                alert("حدث خطأ أثناء قراءة الملف: " + (err?.message || "يرجى التأكد من اختيار ملف Excel صحيح"));
            } finally {
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const processMappedImport = async (mappedData: any[]) => {
        const tenantId = appUser?.tenantId || 'single_store';
        setMapperState(prev => ({ ...prev, isOpen: false }));
        setIsImporting(true);
        let imported = 0;
        let skipped = 0;
        const addedDetails: string[] = [];
        const skippedDetails: string[] = [];

        // Track existing customer names for duplicate checks
        const existingNamesSet = new Set(customers.map(c => c.name.trim().toLowerCase()));

        try {
            const batchSize = 500;
            let batch = writeBatch(db);
            let batchCount = 0;

            for (const row of mappedData) {
                try {
                    const custName = String(row.name || 'بدون اسم').trim();
                    if (!custName || custName === 'بدون اسم') {
                        continue;
                    }
                    const nameKey = custName.toLowerCase();

                    // Check if duplicate name exists
                    if (existingNamesSet.has(nameKey)) {
                        skipped++;
                        skippedDetails.push(`العميل "${custName}" (تم التجاوز: اسم العميل موجود مسبقاً في النظام)`);
                        continue;
                    }

                    const newCust = {
                        name: custName,
                        phone: String(row.phone || ''),
                        address: String(row.address || ''),
                        balance: parseFloat(row.balance) || 0,
                        tenantId,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    
                    const docRef = doc(collection(db, 'customers'));
                    batch.set(docRef, newCust);
                    existingNamesSet.add(nameKey);
                    imported++;
                    addedDetails.push(`العميل "${custName}" (الهاتف: ${row.phone || 'غير مدخل'})`);
                    batchCount++;

                    if (batchCount >= batchSize) {
                        await batch.commit();
                        batch = writeBatch(db);
                        batchCount = 0;
                    }
                } catch (err) {
                    console.error('Error importing row:', row, err);
                }
            }

            if (batchCount > 0) {
                await batch.commit();
            }

            await logUserAction('استيراد عملاء', `استيراد ${imported} عميل جديد وتجاوز ${skipped} مكرر`);

            setCustomerImportReport({
                isOpen: true,
                total: mappedData.length,
                added: imported,
                skipped,
                addedDetails,
                skippedDetails
            });
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء الحفظ");
        } finally {
            setIsImporting(false);
        }
    };

    if (viewMode === 'menu') {
        return (
            <div className="max-w-md mx-auto w-full h-full bg-[#FDFDFD] flex flex-col pt-4 overflow-hidden">
                <div className="flex items-center gap-4 px-4 mb-4" dir="rtl">
                    <h1 className="text-xl font-black text-text-main">إدارة العملاء</h1>
                </div>
                <div className="flex flex-col px-4 gap-2 mt-1 flex-1 overflow-auto pb-6" dir="rtl">
                    <button onClick={() => setActionModalOpen(true)} className="w-full bg-white border border-gray-200 shadow-sm rounded-xl py-3 px-4 flex items-center justify-between hover:bg-white transition active:scale-[0.98]">
                         <span className="text-black font-bold text-sm text-right">اضافة عميل جديد</span>
                         <Plus className="text-[#6EA84F]" size={24} strokeWidth={3} />
                    </button>

                    <button onClick={() => setViewMode('initial_balances')} className="w-full bg-white border border-gray-200 shadow-sm rounded-xl py-3 px-4 flex items-center justify-between hover:bg-white transition active:scale-[0.98]">
                         <span className="text-black font-bold text-sm text-right flex-1">الأرصدة الافتتاحيه والمبالغ النقدية للعملاء</span>
                         <div className="w-7 h-7 rounded-full bg-gray-500 text-white flex items-center justify-center p-1">
                             <RefreshCw size={16} />
                         </div>
                    </button>

                    <button onClick={() => setViewMode('receivables')} className="w-full bg-white border border-gray-200 shadow-sm rounded-xl py-3 px-4 flex items-center justify-between hover:bg-white transition active:scale-[0.98]">
                         <span className="text-black font-bold text-sm text-right flex-1">ذمم العملاء - المبالغ المتبقية عند العملاء من الفواتير الآجل</span>
                         <UserCheck size={24} className="text-orange-500" />
                    </button>

                    <button onClick={() => setViewMode('receivables_report')} className="w-full bg-white border border-gray-200 shadow-sm rounded-xl py-3 px-4 flex items-center justify-between hover:bg-white transition active:scale-[0.98]">
                         <span className="text-black font-bold text-sm text-right">ذمم العملاء - تقرير</span>
                         <FileText size={24} className="text-black dark:text-gray-200" />
                    </button>

                    <button onClick={() => setViewMode('credit_balances')} className="w-full bg-white border border-gray-200 shadow-sm rounded-xl py-3 px-4 flex items-center justify-between hover:bg-white transition active:scale-[0.98]">
                         <span className="text-black font-bold text-sm text-right">العملاء المتبقي لهم أرصدة - تقرير</span>
                         <FileText size={24} className="text-black dark:text-gray-200" />
                    </button>

                    <button onClick={() => setViewMode('list')} className="w-full bg-white border border-gray-200 shadow-sm rounded-xl py-3 px-4 flex items-center justify-between hover:bg-white transition active:scale-[0.98]">
                         <span className="text-black font-bold text-sm text-right">عرض العملاء</span>
                         <Search size={24} className="text-gray-400" />
                    </button>
                </div>
                
                {renderModals()}
            </div>
        );
    }
    if (viewMode === 'initial_balances') {
        return (
            <div className={`max-w-md mx-auto w-full h-full bg-[#FDFDFD] flex flex-col pt-2 overflow-hidden ${isBannerVisible ? 'pb-12' : ''}`} dir="rtl">
                <div className="flex items-center justify-between px-4 pb-2 shrink-0 border-b">
                    <div className="flex items-center gap-3">
                        <h1 className="text-base font-bold text-black dark:text-gray-100">إدارة العملاء - الأرصدة الافتتاحية</h1>
                    </div>
                </div>

                <div className="flex px-2 py-2 gap-2 border-b bg-white shrink-0">
                    <input 
                        type="text" 
                        placeholder="بحث" 
                        className="flex-1 bg-white border border-gray-300 p-2 text-sm text-right focus:outline-none"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        list="customers-opening-list"
                    />
                    <datalist id="customers-opening-list">
                        {customers.map((c, idx) => <option key={`opt-opening-${c.id || idx}`} value={c.name} />)}
                    </datalist>
                    <button 
                        onClick={handleExportHtmlReport}
                        className="bg-[#D9D9D9] hover:bg-[#c9c9c9] transition-colors text-black px-6 border border-gray-300 py-2 font-bold text-sm text-center cursor-pointer"
                    >
                        تقرير
                    </button>
                </div>

                <div className="flex bg-white dark:bg-slate-900 border-b p-2 shrink-0">
                    <div className="flex-1 text-right font-bold text-sm text-black dark:text-gray-100">بيانات العميل</div>
                    <div className="flex-1 text-center font-bold text-sm text-black dark:text-gray-100">له</div>
                    <div className="flex-1 text-left font-bold text-sm text-black dark:text-gray-100 pl-6">عليه</div>
                </div>

                <div className="flex-1 overflow-auto divide-y divide-gray-100">
                    {filtered.map((customer, idx) => (
                        <div 
                            key={`opening-${customer.id || idx}`} 
                            className="p-2 bg-white flex items-center justify-between cursor-pointer hover:bg-white transition"
                            onClick={() => setSelectedOpeningBalanceCustomer(customer)}
                        >
                            <div className="flex-1 text-right shrink-0 min-w-[120px]">
                                <div className="text-gray-400 text-xs font-bold leading-tight">{idx + 371}</div>
                                <div className="text-black font-bold text-sm truncate">{customer.name}</div>
                            </div>
                            <div className="flex-1 flex justify-center px-1">
                                <div className="bg-[#EEF7D9] border border-[#d6ebac] rounded-md py-2 w-full max-w-[100px] text-center font-bold text-black shadow-sm text-sm">
                                    {customer.balance < 0 ? Math.abs(customer.balance).toFixed(2) : "0.00"}
                                </div>
                            </div>
                            <div className="flex-1 flex justify-end px-1">
                                <div className="bg-[#F5D0CD] border border-[#eeb3b0] rounded-md py-2 w-full max-w-[100px] text-center font-bold text-black shadow-sm text-sm">
                                    {customer.balance > 0 ? customer.balance.toFixed(2) : "0.00"}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {isBannerVisible && (
                    <div 
                        className="bg-yellow-300 w-full max-w-md mx-auto p-4 text-center cursor-pointer border-t font-bold text-black text-sm absolute bottom-0 shrink-0"
                        onClick={() => setIsBannerVisible(false)}
                    >
                        <span className="text-red-600 ml-2">اخفاء</span>
                        انقر على اسم العميل المراد اضافه مبلغ له
                    </div>
                )}

                {selectedOpeningBalanceCustomer && (
                    <OpeningBalanceModal 
                        customer={selectedOpeningBalanceCustomer}
                        onClose={() => setSelectedOpeningBalanceCustomer(null)}
                    />
                )}
            </div>
        );
    }

    if (viewMode === 'credit_balances') {
        const creditCustomers = filtered.filter(c => c.balance < 0);
        return (
            <div className={`max-w-md mx-auto w-full h-full bg-[#FDFDFD] flex flex-col pt-2 overflow-hidden ${isBannerVisible ? 'pb-12' : ''}`} dir="rtl">
                <div className="flex items-center justify-between px-4 pb-2 shrink-0 border-b bg-white">
                    <div className="flex items-center gap-3">
                        <h1 className="text-base font-bold text-black dark:text-gray-100">إدارة العملاء - أرصدة ودائنية العملاء</h1>
                    </div>
                    <button 
                        onClick={() => {
                            const headers = ['اسم العميل', 'رقم الهاتف', 'الرصيد (له)'];
                            const rows = creditCustomers.map(c => [
                                c.name,
                                c.phone,
                                `${Math.abs(c.balance).toLocaleString()} ر.س`
                            ]);
                            printReport('تقرير مبالغ العملاء (دائن)', headers, rows);
                        }}
                        className="p-2 border rounded-md bg-white border-emerald-200 text-emerald-700 hover:bg-white transition shadow-sm ml-2"
                    >
                        <FileText size={18} />
                    </button>
                </div>

                <div className="flex px-2 py-2 gap-2 border-b bg-white shrink-0">
                    <input 
                        type="text" 
                        placeholder="بحث باسم العميل" 
                        className="flex-1 bg-white border border-gray-300 p-2 text-sm text-right focus:outline-none"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex bg-white dark:bg-slate-900 border-b p-2 shrink-0">
                    <div className="flex-1 text-right font-bold text-sm text-black dark:text-gray-100">بيانات العميل</div>
                    <div className="flex-1 text-center font-bold text-sm text-black dark:text-gray-100 px-6">المبلغ (له)</div>
                </div>

                <div className="flex-1 overflow-auto divide-y divide-gray-100 py-1">
                    {creditCustomers.map((customer, idx) => (
                        <div 
                            key={`credit-${customer.id || idx}`} 
                            className="p-2 bg-white flex items-center justify-between cursor-pointer hover:bg-white transition"
                            onClick={() => openCustomerDetails(customer)}
                        >
                            <div className="flex-1 text-right shrink-0 min-w-[120px]">
                                <div className="text-gray-400 text-xs font-bold leading-tight">{idx + 1}</div>
                                <div className="text-black font-bold text-sm truncate">{customer.name}</div>
                            </div>
                            <div className="flex-1 flex justify-center px-2">
                                <div className="bg-[#EEF7D9] border border-[#d6ebac] rounded-md py-2 w-full max-w-[140px] text-center font-bold text-black shadow-sm text-base">
                                    {Math.abs(customer.balance).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    ))}
                    {creditCustomers.length === 0 && (
                        <div className="p-8 text-center text-black font-bold">لا يوجد أرصدة دائنة حالياً</div>
                    )}
                </div>

                {isBannerVisible && (
                    <div 
                        className="bg-yellow-300 w-full max-w-md mx-auto p-4 text-center cursor-pointer border-t font-bold text-black text-sm absolute bottom-0 shrink-0"
                        onClick={() => setIsBannerVisible(false)}
                    >
                        <span className="text-red-600 ml-2">اخفاء</span>
                        هؤلاء العملاء لديهم مبالغ متبقية (دائن) في حساباتهم
                    </div>
                )}
                {renderModals()}
            </div>
        );
    }

    if (viewMode === 'receivables') {
        return (
            <div className={`max-w-md mx-auto w-full h-full bg-[#FDFDFD] flex flex-col pt-2 overflow-hidden ${isBannerVisible ? 'pb-12' : ''}`} dir="rtl">
                <div className="flex items-center justify-between px-4 pb-2 shrink-0 border-b bg-white">
                    <div className="flex items-center gap-3">
                        <h1 className="text-base font-bold text-black dark:text-gray-100">إدارة العملاء - ذمم العملاء</h1>
                    </div>
                </div>

                <div className="flex px-2 py-2 gap-2 border-b bg-white shrink-0">
                    <input 
                        type="text" 
                        placeholder="بحث باسم العميل" 
                        className="flex-1 bg-white border border-gray-300 p-2 text-sm text-right focus:outline-none"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <button 
                        onClick={() => setViewMode('receivables_report')}
                        className="bg-emerald-600 text-white px-6 border border-emerald-700 py-2 font-bold text-sm text-center rounded-lg shadow-sm hover:bg-emerald-700 transition"
                    >
                        تقرير
                    </button>
                </div>

                <div className="flex bg-white dark:bg-slate-900 border-b p-2 shrink-0">
                    <div className="flex-1 text-right font-bold text-sm text-black dark:text-gray-100">بيانات العميل</div>
                    <div className="flex-1 text-center font-bold text-sm text-black dark:text-gray-100 px-6">المبلغ الباقي</div>
                </div>

                <div className="flex-1 overflow-auto divide-y divide-gray-100 py-1">
                    {filtered.map((customer, idx) => {
                        const owedAmount = customer.balance > 0 ? customer.balance : 0;
                        return (
                        <div 
                            key={`owed-${customer.id || idx}`} 
                            className="p-2 bg-white flex items-center justify-between cursor-pointer hover:bg-white transition"
                            onClick={() => openCustomerDetails(customer)}
                        >
                            <div className="flex-1 text-right shrink-0 min-w-[120px]">
                                <div className="text-gray-400 text-xs font-bold leading-tight">{idx + 371}</div>
                                <div className="text-black font-bold text-sm truncate">{customer.name}</div>
                            </div>
                            <div className="flex-1 flex justify-center px-2">
                                <div className="bg-[#F5D0CD] border border-[#eeb3b0] rounded-md py-2 w-full max-w-[140px] text-center font-bold text-black shadow-sm text-base">
                                    {owedAmount.toFixed(2)}
                                </div>
                            </div>
                            <div className="w-12 flex justify-start pl-2">
                                <div className="w-8 h-6 bg-[#E1BE75] rounded flex items-center justify-center flex-col shrink-0 relative overflow-hidden shadow-sm border border-[#c4a159]">
                                    <div className="absolute border-b border-r border-[#c4a159] w-6 h-6 rotate-45 -top-3 bg-[#e8c67c]"></div>
                                </div>
                            </div>
                        </div>
                    )})}
                </div>

                {isBannerVisible && (
                    <div 
                        className="bg-yellow-300 w-full max-w-md mx-auto p-4 text-center cursor-pointer border-t font-bold text-black text-sm absolute bottom-0 shrink-0"
                        onClick={() => setIsBannerVisible(false)}
                    >
                        <span className="text-red-600 ml-2">اخفاء</span>
                        انقر على اسم العميل لتفاصيل اكثر
                    </div>
                )}
                {renderModals()}
            </div>
        );
    }

    if (viewMode === 'receivables_report') {
        return (
            <div className="max-w-4xl mx-auto w-full min-h-screen bg-[#FDFDFD] flex flex-col pt-4 overflow-hidden" dir="rtl">
                <div className="flex items-center justify-between px-4 pb-2 shrink-0 border-b">
                    <div className="flex items-center gap-3">
                        <h1 className="text-lg font-bold text-black dark:text-gray-100">إدارة العملاء - تقرير ذمم العملاء</h1>
                    </div>
                    <button 
                        onClick={() => {
                            const headers = ['اسم العميل', 'الرصيد الافتتاحي', 'النقد', 'الباقي من الفواتير الآجل', 'الاجمالي المستحق'];
                            const rows = filtered.map(c => {
                                const totalOwed = c.balance > 0 ? c.balance : 0;
                                return [
                                    c.name,
                                    '0.00 ر.س',
                                    '0.00 ر.س',
                                    `${totalOwed.toLocaleString()} ر.س`,
                                    `${totalOwed.toLocaleString()} ر.س`
                                ];
                            });
                            printReport('تقرير ذمم العملاء المستحقة', headers, rows);
                        }}
                        className="p-2 border rounded-md bg-white border-emerald-200 text-emerald-700 hover:bg-white transition shadow-sm"
                    >
                        <FileText size={20} />
                    </button>
                </div>

                <div className="flex-1 p-4 overflow-auto">
                    <div className="overflow-x-auto border border-gray-200 rounded-xl">
                        <table className="w-full text-right border-collapse bg-white">
                            <thead className="bg-[#D9D9D9] border-b border-gray-200">
                                <tr>
                                    <th className="p-3 border-l border-gray-200 text-sm font-bold text-black whitespace-nowrap">اسم العميل</th>
                                    <th className="p-3 border-l border-gray-200 text-sm font-bold text-black whitespace-nowrap">الرصيد الافتتاحي</th>
                                    <th className="p-3 border-l border-gray-200 text-sm font-bold text-black whitespace-nowrap">النقد</th>
                                    <th className="p-3 border-l border-gray-200 text-sm font-bold text-black whitespace-nowrap">الباقي من الفواتير الآجل</th>
                                    <th className="p-3 text-sm font-bold text-black whitespace-nowrap">الاجمالي المستحق</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((c, idx) => {
                                    const totalOwed = c.balance > 0 ? c.balance : 0;
                                    return (
                                    <tr key={`table-row-${c.id || idx}`} className="hover:bg-white border-b border-gray-200">
                                        <td className="p-3 border-l border-gray-200 font-bold text-sm text-black dark:text-gray-100 whitespace-nowrap">{c.name}</td>
                                        <td className="p-3 border-l border-gray-200 text-sm text-black dark:text-gray-300 whitespace-nowrap">{0} ر.س</td>
                                        <td className="p-3 border-l border-gray-200 text-sm text-black dark:text-gray-300 whitespace-nowrap">{0} ر.س</td>
                                        <td className="p-3 border-l border-gray-200 text-sm text-black dark:text-gray-300 whitespace-nowrap">{totalOwed.toLocaleString()} ر.س</td>
                                        <td className="p-3 text-sm font-bold text-red-600 whitespace-nowrap">{totalOwed.toLocaleString()} ر.س</td>
                                    </tr>
                                )})}
                            </tbody>
                        </table>
                    </div>
                </div>
                {renderModals()}
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-4 mb-4">
                <h1 className="text-lg md:text-2xl font-black text-text-main">إدارة العملاء</h1>
            </div>
            
            {renderModals()}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 md:mb-6">
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <input
                        type="file"
                        accept=".xlsx, .xls"
                        ref={fileInputRef}
                        className="hidden"
                        onChange={handleImportExcel}
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className="flex-1 md:flex-none bg-emerald-600 text-white px-5 py-2.5 rounded-2xl flex justify-center items-center gap-2 hover:bg-emerald-700 transition shadow-lg shadow-emerald-200 dark:shadow-none font-black text-sm"
                    >
                        <Upload size={18} /> {isImporting ? 'جاري الاستيراد' : 'استيراد إكسل'}
                    </button>
                    <button 
                        onClick={() => setActionModalOpen(true)}
                        className="flex-1 md:flex-none bg-blue-600 text-white px-5 py-2.5 rounded-2xl flex justify-center items-center gap-2 hover:bg-blue-700 transition shadow-lg shadow-blue-200 dark:shadow-none font-black text-sm"
                    >
                        <Plus size={18} /> إضافة عميل جديد
                    </button>
                </div>
            </div>

            <div className="bg-card-bg flex items-center gap-3 w-full h-12 px-4 rounded-xl border border-border-main focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all mb-4 shadow-sm cursor-text" onClick={(e) => {
                const input = e.currentTarget.querySelector('input');
                if (input) input.focus();
            }}>
                <Search size={20} className="text-gray-400 group-focus-within:text-blue-500 transition-colors shrink-0" />
                <input 
                    type="text" 
                    placeholder="ابحث بالاسم أو رقم الهاتف..." 
                    className="flex-1 h-full outline-none font-extrabold text-sm text-text-main placeholder:text-gray-400 bg-transparent"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                    <button onClick={(e) => { e.stopPropagation(); setSearch(''); }} className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer p-1 shrink-0">
                        <X size={18} />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                 {filtered.map((customer, idx) => (
                    <div key={`grid-card-${customer.id || idx}`} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm hover:shadow-md transition group">
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => openEditModal(customer)}>
                                <div className="w-10 h-10 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 border border-gray-200 rounded-full flex items-center justify-center shrink-0">
                                    <UserCircle size={22} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="font-bold text-sm text-text-main truncate hover:text-blue-600 transition-colors">{customer.name}</h3>
                                    <p className="text-text-main/50 font-semibold text-xs mt-0.5" dir="ltr">{customer.phone}</p>
                                </div>
                            </div>
                            
                            {appUser?.role === 'admin' && (
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={(e) => { e.stopPropagation(); openEditModal(customer); }} className="text-gray-400 hover:text-blue-600 transition p-1.5 bg-bg-main rounded-lg border border-border-main hover:bg-white" title="تعديل">
                                        <Edit2 size={14} />
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(customer); }} className="text-gray-400 hover:text-red-600 transition p-1.5 bg-bg-main rounded-lg border border-border-main hover:bg-white" title="حذف">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="bg-bg-main border border-border-main p-2 rounded-xl mt-2 cursor-pointer hover:bg-white transition-colors" onClick={() => openEditModal(customer)}>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-text-main/80 font-bold">الرصيد الفعلي</span>
                                <span className={`font-bold ${customer.balance > 0 ? 'text-emerald-600' : customer.balance < 0 ? 'text-red-600' : 'text-text-main'}`}>
                                    {customer.balance > 0 ? '+' : ''}{customer.balance.toLocaleString()} <span className="text-[10px] font-normal">ر.س</span>
                                </span>
                            </div>
                        </div>
                    </div>
                 ))}
                 {filtered.length === 0 && (
                     <div className="col-span-full text-center py-5 md:py-8 text-black bg-white rounded-xl border border-dashed border-gray-200 text-sm">
                         لا يوجد عملاء مطابقين للبحث
                     </div>
                 )}
            </div>

            {renderModals()}
        </div>
    );
}

function OpeningBalanceModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
    const { appUser } = useAuthStore();
    const [opType, setOpType] = useState<'له' | 'عليه'>('له');
    const [voucherNum, setVoucherNum] = useState('...');
    const [details, setDetails] = useState('');
    const [opDate, setOpDate] = useState(new Date().toISOString().split('T')[0]);
    const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'check'>('cash');
    const [amount, setAmount] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || 'single_store';

        // Load next voucher number from vouchers collection
        const qNum = query(collection(db, 'vouchers'), where('tenantId', '==', tenantId), orderBy('voucherNumber', 'desc'), limit(1));
        const unsubscribe = onSnapshot(qNum, snap => {
            if (!snap.empty) {
                const latestNum = parseInt(snap.docs[0].data().voucherNumber) || 0;
                setVoucherNum((latestNum + 1).toString());
            } else {
                setVoucherNum('1');
            }
        });
        return () => unsubscribe();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSaving) return;
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            alert('يرجى ادخال مبلغ صحيح');
            return;
        }

        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            const now = Date.now();
            
            // "له" (For him) decreases balance (we got money). "عليه" (Against him) increases balance (we gave money).
            const balanceChange = opType === 'عليه' ? numAmount : -numAmount;
            batch.update(doc(db, 'customers', customer.id), {
                balance: increment(balanceChange)
            });

            const vType = opType === 'له' ? 'receipt' : 'payment';
            const vNum = voucherNum === '...' ? '0' : voucherNum;

            const tenantId = appUser?.tenantId || 'single_store';
            
            // Create a voucher record for numbering consistency
            const vRef = doc(collection(db, 'vouchers'));
            batch.set(vRef, {
                voucherNumber: vNum,
                date: new Date(opDate).getTime(),
                amount: numAmount,
                type: vType,
                partyId: customer.id,
                partyType: 'customer',
                partyName: customer.name,
                description: details || 'تعديل مالي يدوي',
                createdBy: appUser?.uid,
                createdAt: new Date(opDate).getTime(),
                tenantId
            });

            // Update Cash Box
            const cashRef = doc(collection(db, 'cash'));
            batch.set(cashRef, {
                voucherNumber: vNum,
                date: new Date(opDate).getTime(),
                amount: numAmount,
                type: vType === 'receipt' ? 'in' : 'out', 
                category: vType === 'receipt' ? 'in_payment' : 'out_payment',
                description: `سند ${vType === 'receipt' ? 'قبض' : 'صرف'} #${vNum} (يدوي) - عميل: ${customer.name} - ${details || ''}`,
                referenceId: vRef.id,
                createdBy: appUser?.uid,
                createdAt: now,
                affectsCash: true,
                tenantId
            });

            await batch.commit();
            await logUserAction('سند مالي يدوي', `تم إضافة مبلغ ${numAmount} (${vType === 'receipt' ? 'قبض' : 'صرف'}) للعميل ${customer.name}`);
            onClose();
        } catch (error) {
            console.error(error);
            alert('حدث خطأ');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[90]" dir="rtl">
            <div className="bg-white rounded-3xl w-full max-w-sm flex flex-col animate-in zoom-in duration-200 shadow-2xl border border-gray-100 overflow-hidden">
                <div className="flex flex-col items-center pt-4 pb-2">
                    <h2 className="text-base font-bold text-black dark:text-gray-100">أضف مبلغ للعميل</h2>
                    <h3 className="text-xl font-bold text-red-600 mt-1">{customer.name}</h3>
                </div>

                <form onSubmit={handleSave} className="flex flex-col p-4 pt-0 gap-4">
                    <div className="flex bg-white dark:bg-slate-800 p-1 rounded-full border border-gray-200">
                        <button 
                            type="button"
                            onClick={() => setOpType('له')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full transition-all font-bold text-sm ${opType === 'له' ? 'bg-white shadow-md text-black' : 'text-gray-400'}`}
                        >
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${opType === 'له' ? 'border-gray-800' : 'border-gray-300'}`}>
                                {opType === 'له' && <div className="w-2 h-2 bg-gray-800 rounded-full"></div>}
                            </div>
                            <span>له</span>
                        </button>
                        <button 
                            type="button"
                            onClick={() => setOpType('عليه')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full transition-all font-bold text-sm ${opType === 'عليه' ? 'bg-white shadow-md text-black' : 'text-gray-400'}`}
                        >
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${opType === 'عليه' ? 'border-gray-800' : 'border-gray-300'}`}>
                                {opType === 'عليه' && <div className="w-2 h-2 bg-gray-800 rounded-full"></div>}
                            </div>
                            <span>عليه</span>
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="min-w-[70px] font-bold text-xs text-black dark:text-gray-300">رقم السند</label>
                        <div className="flex-1 bg-white dark:bg-slate-900 border border-gray-200 rounded-xl p-2 text-center font-bold text-lg text-black">
                            {voucherNum}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="relative">
                             <input 
                                value={details}
                                onChange={e => setDetails(e.target.value)}
                                type="text"
                                placeholder="البيان : تفاصيل السند"
                                className="w-full border-2 border-gray-200 rounded-xl p-3 text-right pr-4 font-bold text-black dark:text-gray-200 bg-white placeholder-gray-400 focus:border-blue-500 outline-none text-sm"
                             />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-2 px-3 shadow-sm">
                         <label className="min-w-[70px] font-bold text-xs text-black dark:text-gray-200">التاريخ</label>
                         <input 
                            value={opDate}
                            onChange={e => setOpDate(e.target.value)}
                            type="date"
                            className="flex-1 bg-white dark:bg-slate-800 rounded-lg py-1.5 px-3 text-center font-bold text-black dark:text-gray-100 appearance-none border-none outline-none text-sm"
                         />
                    </div>

                    <div className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm flex flex-col gap-2">
                         <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-xs text-black dark:text-gray-200">طريقة الدفع</span>
                            <div className="flex gap-3">
                                <label className="flex items-center gap-1 cursor-pointer group">
                                    <span className={`text-xs font-bold transition ${payMethod === 'cash' ? 'text-black dark:text-white' : 'text-gray-400'}`}>نقداً</span>
                                    <input type="radio" checked={payMethod === 'cash'} onChange={() => setPayMethod('cash')} className="hidden" />
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${payMethod === 'cash' ? 'border-emerald-500 bg-white' : 'border-gray-200 group-hover:border-gray-300'}`}>
                                        {payMethod === 'cash' && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>}
                                    </div>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer group">
                                    <span className={`text-xs font-bold transition ${payMethod === 'card' ? 'text-black dark:text-white' : 'text-gray-400'}`}>بطاقه</span>
                                    <input type="radio" checked={payMethod === 'card'} onChange={() => setPayMethod('card')} className="hidden" />
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${payMethod === 'card' ? 'border-emerald-500 bg-white' : 'border-gray-200 group-hover:border-gray-300'}`}>
                                        {payMethod === 'card' && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>}
                                    </div>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer group">
                                    <span className={`text-xs font-bold transition ${payMethod === 'check' ? 'text-black dark:text-white' : 'text-gray-400'}`}>شيك</span>
                                    <input type="radio" checked={payMethod === 'check'} onChange={() => setPayMethod('check')} className="hidden" />
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${payMethod === 'check' ? 'border-emerald-500 bg-white' : 'border-gray-200 group-hover:border-gray-300'}`}>
                                        {payMethod === 'check' && <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>}
                                    </div>
                                </label>
                            </div>
                         </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 mt-1">
                        <span className="font-bold text-black dark:text-gray-100 text-base">المبلغ</span>
                        <input 
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            type="number"
                            className="bg-[#EEF7D9] border border-[#d6ebac] rounded-xl py-3 flex-1 text-center font-black text-red-600 text-2xl shadow-sm"
                        />
                    </div>

                    <div className="flex items-center justify-center gap-8 mt-4 mb-2">
                        <button 
                            type="submit" 
                            disabled={isSaving}
                            className={`font-black text-red-500 hover:text-red-700 transition text-base ${isSaving ? 'opacity-50' : ''}`}
                        >
                            اضافه المبلغ
                        </button>
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="font-black text-gray-400 hover:text-gray-600 transition text-base"
                        >
                            تراجع
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
