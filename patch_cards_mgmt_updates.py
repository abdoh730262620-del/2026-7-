with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# 1. Add selectedPurchaseMonth state after selectedMonth
old_month_state = "const [selectedMonth, setSelectedMonth] = useState(currentMonthDefault);"
new_month_state = """const [selectedMonth, setSelectedMonth] = useState(currentMonthDefault);
    const [selectedPurchaseMonth, setSelectedPurchaseMonth] = useState(currentMonthDefault);"""

if old_month_state in content:
    content = content.replace(old_month_state, new_month_state, 1)

# 2. Update onHeaderBack effect
old_back_effect = """        (window as any).onHeaderBack = () => {
            if (activeSection === 'distributors' && selectedDistributorForDetails !== null) {
                setSelectedDistributorForDetails(null);
                return true;
            }
            if (activeSection === 'distributors' && distributorSubSection !== null) {
                setDistributorSubSection(null);
                return true;
            }
            if (activeSection !== null) {
                setActiveSection(null);
                return true; // handled
            }
            return false; // not handled, will go to home
        };
        return () => {
            if ((window as any).onHeaderBack) {
                delete (window as any).onHeaderBack;
            }
        };
    }, [activeSection, distributorSubSection, selectedDistributorForDetails]);"""

new_back_effect = """        (window as any).onHeaderBack = () => {
            if (activeSection === 'distributors' && selectedDistributorForDetails !== null) {
                setSelectedDistributorForDetails(null);
                return true;
            }
            if (activeSection === 'distributors' && distributorSubSection !== null) {
                setDistributorSubSection(null);
                return true;
            }
            if (activeSection === 'purchases' && selectedSupplierForDetails !== null) {
                setSelectedSupplierForDetails(null);
                return true;
            }
            if (activeSection === 'purchases' && purchaseSubSection !== null) {
                setPurchaseSubSection(null);
                return true;
            }
            if (activeSection !== null) {
                setActiveSection(null);
                return true; // handled
            }
            return false; // not handled, will go to home
        };
        return () => {
            if ((window as any).onHeaderBack) {
                delete (window as any).onHeaderBack;
            }
        };
    }, [activeSection, distributorSubSection, selectedDistributorForDetails, purchaseSubSection, selectedSupplierForDetails]);"""

if old_back_effect in content:
    content = content.replace(old_back_effect, new_back_effect, 1)

# 3. Add monthly_purchases section into sections array
old_section_monthly_sales = """        {
            id: 'monthly_sales',
            title: 'المبيعات الشهرية',
            subtitle: 'تقارير شهري وتصدير PDF',
            icon: TrendingUp,
            color: 'bg-emerald-600',
            lightBg: 'bg-emerald-50 dark:bg-emerald-950/60',
            textColor: 'text-emerald-600 dark:text-emerald-400',
            borderColor: 'border-emerald-100 dark:border-emerald-900/50',
            visible: getSecPermission('cards_sales_report', 'view')
        },"""

new_section_monthly_sales_and_purchases = """        {
            id: 'monthly_sales',
            title: 'المبيعات الشهرية',
            subtitle: 'تقارير شهري وتصدير PDF',
            icon: TrendingUp,
            color: 'bg-emerald-600',
            lightBg: 'bg-emerald-50 dark:bg-emerald-950/60',
            textColor: 'text-emerald-600 dark:text-emerald-400',
            borderColor: 'border-emerald-100 dark:border-emerald-900/50',
            visible: getSecPermission('cards_sales_report', 'view')
        },
        {
            id: 'monthly_purchases',
            title: 'المشتريات الشهرية',
            subtitle: 'تقارير المشتريات الشهرية وتصدير PDF',
            icon: FileText,
            color: 'bg-indigo-600',
            lightBg: 'bg-indigo-50 dark:bg-indigo-950/60',
            textColor: 'text-indigo-600 dark:text-indigo-400',
            borderColor: 'border-indigo-100 dark:border-indigo-900/50',
            visible: getSecPermission('cards_stock', 'view')
        },"""

if old_section_monthly_sales in content:
    content = content.replace(old_section_monthly_sales, new_section_monthly_sales_and_purchases, 1)

# 4. Update click handler for supplier 'add' section
old_supp_click = """                                                if (sec.id === 'add') {
                                                    setEditingSupplier(null);
                                                    setDistNameInput('');
                                                    setDistPhoneInput('');
                                                    setDistCommissionInput('');
                                                    setDistPreviousDebtInput('');
                                                    setDistDateInput(new Date().toISOString().split('T')[0]);
                                                }"""

new_supp_click = """                                                if (sec.id === 'add') {
                                                    setEditingSupplier(null);
                                                    setSupplierName('');
                                                    setSupplierPhone('');
                                                    setSupplierPreviousDebt('');
                                                }"""

if old_supp_click in content:
    content = content.replace(old_supp_click, new_supp_click, 1)

# 5. Fix supplier 'add' form (remove commission, make phone numeric only)
old_supp_form = """                    {purchaseSubSection === 'add' && (
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-xl mx-auto animate-in zoom-in-95 duration-200">
                            <h3 className="text-base font-black text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2 w-full text-center">
                                <Plus className="text-blue-600 dark:text-blue-400" size={20} />
                                <span>إضافة مورد جديد للمنظومة</span>
                            </h3>
                            <form onSubmit={async (e) => {
                                await handleSaveSupplier(e);
                                setPurchaseSubSection('accounts'); // navigate to accounts on save
                            }} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">اسم المورد</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="اسم المورد الكامل"
                                        value={distNameInput}
                                        onChange={(e) => setDistNameInput(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">رقم الهاتف <span className="text-rose-500">*</span></label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="05xxxxxxx"
                                            value={distPhoneInput}
                                            onChange={(e) => setDistPhoneInput(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">نسبة العمولة (%)</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            placeholder="5"
                                            value={distCommissionInput}
                                            onChange={(e) => setDistCommissionInput(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">تاريخ التسجيل</label>
                                        <input
                                            type="date"
                                            value={distDateInput}
                                            onChange={(e) => setDistDateInput(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">الدين السابق (ر.س)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={distPreviousDebtInput}
                                            onChange={(e) => setDistPreviousDebtInput(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-blue-600/20 active:scale-95 transition"
                                >
                                    حفظ بيانات المورد الجديد
                                </button>
                            </form>
                        </div>
                    )}"""

new_supp_form = """                    {purchaseSubSection === 'add' && (
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-xl mx-auto animate-in zoom-in-95 duration-200">
                            <h3 className="text-base font-black text-slate-900 dark:text-white mb-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2 w-full text-center">
                                <Plus className="text-blue-600 dark:text-blue-400" size={20} />
                                <span>إضافة مورد جديد للمنظومة</span>
                            </h3>
                            <form onSubmit={async (e) => {
                                await handleSaveSupplier(e);
                                setPurchaseSubSection('accounts'); // navigate to accounts on save
                            }} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">اسم المورد</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="اسم المورد الكامل"
                                        value={supplierName}
                                        onChange={(e) => setSupplierName(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">رقم الهاتف <span className="text-rose-500">*</span></label>
                                    <input
                                        type="tel"
                                        inputMode="numeric"
                                        required
                                        placeholder="05xxxxxxx"
                                        value={supplierPhone}
                                        onChange={(e) => setSupplierPhone(e.target.value.replace(/\\D/g, ''))}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-1 text-center w-full">الدين السابق (ر.س)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={supplierPreviousDebt}
                                        onChange={(e) => setSupplierPreviousDebt(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-blue-600 text-slate-900 dark:text-white text-center"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-blue-600/20 active:scale-95 transition"
                                >
                                    حفظ بيانات المورد الجديد
                                </button>
                            </form>
                        </div>
                    )}"""

if old_supp_form in content:
    content = content.replace(old_supp_form, new_supp_form, 1)

# Also update supplier modal phone input to restrict to digits
old_modal_phone = """                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">رقم الهاتف</label>
                                <input
                                    type="tel"
                                    value={supplierPhone}
                                    onChange={(e) => setSupplierPhone(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>"""

new_modal_phone = """                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">رقم الهاتف</label>
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    value={supplierPhone}
                                    onChange={(e) => setSupplierPhone(e.target.value.replace(/\\D/g, ''))}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>"""

if old_modal_phone in content:
    content = content.replace(old_modal_phone, new_modal_phone, 1)

# 6. Add monthly_purchases view section right after monthly_sales view section
sales_section_end = """                            <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm mt-6">
                                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white mb-4 sm:mb-5 flex items-center gap-2">
                                    <TrendingUp className="text-orange-500" size={20} />
                                    <span>أكثر الموزعين سحباً هذا الشهر</span>
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {topDistributors.map((d, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-900/60 text-orange-600 dark:text-orange-400 flex items-center justify-center font-black text-sm border border-orange-200 dark:border-orange-800/50 shadow-sm">
                                                    #{idx + 1}
                                                </div>
                                                <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{d.name}</span>
                                            </div>
                                            <div className="text-left">
                                                <span className="block text-sm font-black text-slate-900 dark:text-white">{d.qty} كارت</span>
                                                <span className="block text-xs font-bold text-slate-500 dark:text-slate-400">{d.net.toLocaleString()} ريال</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                </div>
            )}"""

monthly_purchases_section_block = sales_section_end + """

            {/* SECTION 4.5: المشتريات الشهرية (Monthly Purchases Report) */}
            {activeSection === 'monthly_purchases' && (() => {
                const filteredMonthPurchases = purchases.filter(p => p.month === selectedPurchaseMonth);
                const totalMonthPurchasesCashQty = filteredMonthPurchases.filter(p => p.paymentType === 'cash').reduce((sum, p) => sum + p.quantity, 0);
                const totalMonthPurchasesCreditQty = filteredMonthPurchases.filter(p => p.paymentType === 'credit').reduce((sum, p) => sum + p.quantity, 0);
                const totalMonthPurchasesCashNet = filteredMonthPurchases.filter(p => p.paymentType === 'cash').reduce((sum, p) => sum + p.netTotal, 0);
                const totalMonthPurchasesCreditNet = filteredMonthPurchases.filter(p => p.paymentType === 'credit').reduce((sum, p) => sum + p.netTotal, 0);

                const purchaseCatMap = new Map<string, { categoryName: string; cashQty: number; creditQty: number; totalQty: number; cashNetTotal: number; creditNetTotal: number; totalNet: number }>();
                filteredMonthPurchases.forEach(p => {
                    const catName = p.categoryName || 'غير معروف';
                    if (!purchaseCatMap.has(catName)) {
                        purchaseCatMap.set(catName, { categoryName: catName, cashQty: 0, creditQty: 0, totalQty: 0, cashNetTotal: 0, creditNetTotal: 0, totalNet: 0 });
                    }
                    const item = purchaseCatMap.get(catName)!;
                    item.totalQty += p.quantity;
                    item.totalNet += p.netTotal;
                    if (p.paymentType === 'cash') {
                        item.cashQty += p.quantity;
                        item.cashNetTotal += p.netTotal;
                    } else {
                        item.creditQty += p.quantity;
                        item.creditNetTotal += p.netTotal;
                    }
                });
                const monthlyCategoryPurchaseReport = Array.from(purchaseCatMap.values());

                const handleExportMonthlyPurchasesPDF = () => {
                    const title = `تقرير المشتريات الشهرية لكروت الشبكة - شهر ${selectedPurchaseMonth}`;
                    const headers = ['فئة الكروت', 'الكروت النقدية', 'الكروت الآجلة', 'إجمالي العدد', 'مجموع النقدية', 'مجموع الآجلة', 'الصافي الإجمالي'];
                    const data = monthlyCategoryPurchaseReport.map(r => [
                        r.categoryName,
                        `${r.cashQty}`,
                        `${r.creditQty}`,
                        `${r.totalQty}`,
                        `${r.cashNetTotal.toFixed(2)} ريال`,
                        `${r.creditNetTotal.toFixed(2)} ريال`,
                        `${r.totalNet.toFixed(2)} ريال`
                    ]);
                    printReport(title, headers, data);
                };

                return (
                    <div className="space-y-6 animate-in fade-in duration-200">
                        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
                            <h2 className="text-lg font-black text-slate-900 dark:text-white">تقرير المشتريات الشهرية لكروت الشبكة</h2>
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700">
                                    <Calendar size={16} className="text-slate-400" />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">الشهر:</span>
                                    <input
                                        type="month"
                                        value={selectedPurchaseMonth}
                                        onChange={(e) => setSelectedPurchaseMonth(e.target.value)}
                                        className="bg-transparent text-xs font-black text-slate-900 dark:text-white outline-none"
                                    />
                                </div>
                                <button
                                    onClick={handleExportMonthlyPurchasesPDF}
                                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-2xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition"
                                >
                                    <Printer size={16} />
                                    <span>تصدير PDF</span>
                                </button>
                            </div>
                        </div>

                        {/* Summary cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                                <span className="text-[10px] font-black text-slate-400">عدد كروت المشتريات النقدية</span>
                                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{totalMonthPurchasesCashQty} كارت</div>
                            </div>
                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                                <span className="text-[10px] font-black text-slate-400">عدد كروت المشتريات الآجلة</span>
                                <div className="text-lg font-black text-amber-600 dark:text-amber-400">{totalMonthPurchasesCreditQty} كارت</div>
                            </div>
                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                                <span className="text-[10px] font-black text-slate-400">مشتريات نقدية مسددة</span>
                                <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">{totalMonthPurchasesCashNet.toFixed(2)} ريال</div>
                            </div>
                            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                                <span className="text-[10px] font-black text-slate-400">مشتريات أجل مستحقة للموردين</span>
                                <div className="text-lg font-black text-amber-600 dark:text-amber-400">{totalMonthPurchasesCreditNet.toFixed(2)} ريال</div>
                            </div>
                        </div>

                        {/* Report Table */}
                        <div className="bg-transparent md:bg-white md:dark:bg-slate-900 md:rounded-3xl md:border md:border-slate-200 md:dark:border-slate-800 md:overflow-hidden md:shadow-sm">
                            {/* Mobile View: Cards */}
                            <div className="block md:hidden space-y-4">
                                {monthlyCategoryPurchaseReport.length === 0 ? (
                                    <div className="bg-white dark:bg-slate-900 p-8 text-center text-slate-400 font-bold rounded-2xl border border-slate-200 dark:border-slate-800">
                                        لا توجد مشتريات مسجلة في هذا الشهر حتى الآن.
                                    </div>
                                ) : (
                                    monthlyCategoryPurchaseReport.map((r) => (
                                        <div key={r.categoryName} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                                            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                                                <span className="font-black text-slate-900 dark:text-white text-sm">{r.categoryName}</span>
                                                <span className="text-[10px] font-black bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-lg">
                                                    إجمالي العدد: {r.totalQty} كارت
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                    <span className="text-slate-400 font-bold">كروت نقدية</span>
                                                    <span className="text-emerald-600 font-black">{r.cashQty}</span>
                                                </div>
                                                <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                    <span className="text-slate-400 font-bold">كروت آجلة</span>
                                                    <span className="text-amber-600 font-black">{r.creditQty}</span>
                                                </div>
                                                <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                    <span className="text-slate-400 font-bold">مجموع النقدي</span>
                                                    <span className="text-emerald-600 font-black">{r.cashNetTotal.toFixed(2)} ر.س</span>
                                                </div>
                                                <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 p-2 rounded-xl">
                                                    <span className="text-slate-400 font-bold">مجموع الآجل</span>
                                                    <span className="text-amber-600 font-black">{r.creditNetTotal.toFixed(2)} ر.س</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                                                <span className="text-xs font-bold text-slate-500">الصافي الإجمالي</span>
                                                <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{r.totalNet.toFixed(2)} ريال</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Desktop View: Table */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-right text-xs">
                                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                                        <tr>
                                            <th className="p-4">فئة الكروت</th>
                                            <th className="p-4 text-center">الكروت النقدية</th>
                                            <th className="p-4 text-center">الكروت الآجلة</th>
                                            <th className="p-4 text-center">إجمالي العدد</th>
                                            <th className="p-4 text-left">مجموع النقدية</th>
                                            <th className="p-4 text-left">مجموع الآجلة</th>
                                            <th className="p-4 text-left">الصافي الإجمالي</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                                        {monthlyCategoryPurchaseReport.map((r) => (
                                            <tr key={r.categoryName} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                <td className="p-4 font-black">{r.categoryName}</td>
                                                <td className="p-4 text-center text-emerald-600 font-black">{r.cashQty}</td>
                                                <td className="p-4 text-center text-amber-600 font-black">{r.creditQty}</td>
                                                <td className="p-4 text-center font-black">{r.totalQty}</td>
                                                <td className="p-4 text-left text-emerald-600 font-black">{r.cashNetTotal.toFixed(2)} ريال</td>
                                                <td className="p-4 text-left text-amber-600 font-black">{r.creditNetTotal.toFixed(2)} ريال</td>
                                                <td className="p-4 text-left text-indigo-600 font-black">{r.totalNet.toFixed(2)} ريال</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Top Suppliers Report */}
                        {(() => {
                            const monthSuppPurchases = purchases.filter(p => p.month === selectedPurchaseMonth);
                            if (monthSuppPurchases.length === 0) return null;
                            
                            const suppMap = new Map<string, { name: string, qty: number, net: number }>();
                            monthSuppPurchases.forEach(p => {
                                const name = p.supplierName || 'مورد نقدي';
                                if (!suppMap.has(name)) {
                                    suppMap.set(name, { name, qty: 0, net: 0 });
                                }
                                const entry = suppMap.get(name)!;
                                entry.qty += p.quantity;
                                entry.net += p.netTotal;
                            });

                            const topSuppliers = Array.from(suppMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);

                            return (
                                <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm mt-6">
                                    <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white mb-4 sm:mb-5 flex items-center gap-2">
                                        <Truck className="text-indigo-500" size={20} />
                                        <span>أكثر الموردين توريداً هذا الشهر</span>
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {topSuppliers.map((d, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 hover:-translate-y-1 hover:shadow-md transition-all duration-300">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-sm border border-indigo-200 dark:border-indigo-800/50 shadow-sm">
                                                        #{idx + 1}
                                                    </div>
                                                    <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">{d.name}</span>
                                                </div>
                                                <div className="text-left">
                                                    <span className="block text-sm font-black text-slate-900 dark:text-white">{d.qty} كارت</span>
                                                    <span className="block text-xs font-bold text-slate-500 dark:text-slate-400">{d.net.toLocaleString()} ريال</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

                    </div>
                );
            })()}"""

if sales_section_end in content:
    content = content.replace(sales_section_end, monthly_purchases_section_block, 1)
    print("Successfully patched CardsManagement.tsx")
else:
    print("Could not find sales_section_end anchor")

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
