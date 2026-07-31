import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

sales_ui = """
                    {/* Sub-Section 4: Sales & Returns */}
                    {distributorSubSection === 'sales' && (
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm max-w-2xl mx-auto animate-in zoom-in-95 duration-200 text-right" dir="rtl">
                            <h3 className="text-base font-black text-slate-900 dark:text-white mb-6 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-center gap-2 w-full text-center">
                                <FileText className="text-orange-600 dark:text-orange-400" size={20} />
                                <span>إصدار فاتورة مبيعات / مرتجع لموزع</span>
                            </h3>

                            {/* Type Toggle */}
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl mb-6 relative w-full sm:w-2/3 mx-auto">
                                <button
                                    onClick={() => setSaleIsReturn(false)}
                                    className={`flex-1 py-2 text-xs font-black rounded-xl transition-all z-10 flex items-center justify-center gap-2 ${!saleIsReturn ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                >
                                    فاتورة مبيعات
                                </button>
                                <button
                                    onClick={() => setSaleIsReturn(true)}
                                    className={`flex-1 py-2 text-xs font-black rounded-xl transition-all z-10 flex items-center justify-center gap-2 ${saleIsReturn ? 'text-white' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                                >
                                    فاتورة مرتجع
                                </button>
                                <div
                                    className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-slate-900 dark:bg-slate-700 rounded-xl transition-all duration-300 shadow-md"
                                    style={{ right: !saleIsReturn ? '4px' : 'calc(50%)' }}
                                />
                            </div>

                            <form onSubmit={handleSaveSaleInvoice} className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">الموزع <span className="text-rose-500">*</span></label>
                                        <select
                                            required
                                            value={saleDistributorId}
                                            onChange={(e) => setSaleDistributorId(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-orange-500 text-slate-900 dark:text-white"
                                        >
                                            <option value="">اختر الموزع...</option>
                                            {distributors.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">الفئة (نوع الكروت) <span className="text-rose-500">*</span></label>
                                        <select
                                            required
                                            value={saleCategoryId}
                                            onChange={(e) => setSaleCategoryId(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-orange-500 text-slate-900 dark:text-white"
                                        >
                                            <option value="">اختر الفئة...</option>
                                            {categories.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} - متوفر: {c.availableCount} كارت
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">الكمية <span className="text-rose-500">*</span></label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        placeholder="عدد الكروت..."
                                        value={saleQuantity}
                                        onChange={(e) => setSaleQuantity(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-orange-500 text-slate-900 dark:text-white"
                                    />
                                </div>

                                {saleCategoryId && saleDistributorId && saleQuantity && (() => {
                                    const cat = categories.find(c => c.id === saleCategoryId);
                                    const dist = distributors.find(d => d.id === saleDistributorId);
                                    const qty = parseInt(saleQuantity) || 0;
                                    if (cat && dist && qty > 0) {
                                        const unitPrice = cat.wholesalePrice || 0;
                                        const total = unitPrice * qty;
                                        const comm = (dist.commission / 100) * total;
                                        const net = total - comm;
                                        return (
                                            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800/30 space-y-2">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-slate-500 dark:text-slate-400">الإجمالي (قبل العمولة):</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">{total.toLocaleString()} د.ل</span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-slate-500 dark:text-slate-400">قيمة العمولة ({dist.commission}%):</span>
                                                    <span className="font-bold text-rose-600 dark:text-rose-400">- {comm.toLocaleString()} د.ل</span>
                                                </div>
                                                <div className="pt-2 border-t border-orange-200/50 dark:border-orange-800/50 flex justify-between items-center">
                                                    <span className="font-black text-slate-800 dark:text-slate-200 text-sm">الصافي (يسجل على الموزع):</span>
                                                    <span className="font-black text-orange-600 dark:text-orange-400 text-sm">{net.toLocaleString()} د.ل</span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <button
                                        type="submit"
                                        className={`w-full py-3.5 rounded-2xl font-black text-white text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 ${
                                            saleIsReturn 
                                            ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30' 
                                            : 'bg-orange-600 hover:bg-orange-700 shadow-orange-600/30'
                                        }`}
                                    >
                                        <CheckCircle2 size={18} />
                                        <span>{saleIsReturn ? 'تأكيد المرتجع' : 'تأكيد الفاتورة وخصم المخزون'}</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
"""

content = content.replace("{/* Sub-Section 3: Add Distributor */}", sales_ui + "\n                    {/* Sub-Section 3: Add Distributor */}")

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
