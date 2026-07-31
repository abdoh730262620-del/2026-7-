import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# Generate supplier add/edit modal
supplier_modal = """
            {/* MODAL: Add/Edit Supplier */}
            {isSupplierModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="relative flex items-center justify-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-black text-slate-900 dark:text-white text-base text-center">
                                {editingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
                            </h3>
                            <button onClick={() => setIsSupplierModalOpen(false)} className="absolute left-0 text-slate-400 hover:text-slate-600 transition">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSaveSupplier} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">اسم المورد <span className="text-rose-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={supplierName}
                                    onChange={(e) => setSupplierName(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">رقم الهاتف</label>
                                <input
                                    type="tel"
                                    value={supplierPhone}
                                    onChange={(e) => setSupplierPhone(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            {!editingSupplier && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">الرصيد السابق (دين للمورد)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={supplierPreviousDebt}
                                        onChange={(e) => setSupplierPreviousDebt(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            )}
                            <button
                                type="submit"
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95 text-sm"
                            >
                                حفظ بيانات المورد
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: Purchase Voucher */}
            {isPurchaseVoucherModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="relative flex items-center justify-center border-b border-slate-100 dark:border-slate-800 pb-3">
                            <h3 className="font-black text-slate-900 dark:text-white text-base text-center">إنشاء سند للمورد</h3>
                            <button onClick={() => setIsPurchaseVoucherModalOpen(false)} className="absolute left-0 text-slate-400 hover:text-slate-600 transition">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSavePurchaseVoucher} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">نوع السند</label>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPurchaseVoucherType('payment')}
                                        className={`flex-1 py-2 text-xs font-black rounded-xl transition-all border ${purchaseVoucherType === 'payment' ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                    >
                                        صرف (سداد للمورد)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPurchaseVoucherType('receipt')}
                                        className={`flex-1 py-2 text-xs font-black rounded-xl transition-all border ${purchaseVoucherType === 'receipt' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                    >
                                        قبض (استرداد نقدية)
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">المورد <span className="text-rose-500">*</span></label>
                                <select
                                    required
                                    value={purchaseVoucherSupplierId}
                                    onChange={(e) => setPurchaseVoucherSupplierId(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="">-- اختر المورد --</option>
                                    {suppliers.map(d => (
                                        <option key={d.id} value={d.id}>{d.name} (الدين: {(d.balance || 0).toFixed(2)})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">المبلغ (ريال) <span className="text-rose-500">*</span></label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    required
                                    value={purchaseVoucherAmountInput}
                                    onChange={(e) => setPurchaseVoucherAmountInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-left"
                                    placeholder="0.00"
                                    dir="ltr"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">البيان / ملاحظات</label>
                                <input
                                    type="text"
                                    value={purchaseVoucherNotesInput}
                                    onChange={(e) => setPurchaseVoucherNotesInput(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="مثال: دفعة من الحساب"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-600/20 transition-all active:scale-95 text-sm"
                            >
                                حفظ السند
                            </button>
                        </form>
                    </div>
                </div>
            )}
"""

target = "            {/* MODAL: Distributor Voucher (سند قبض أو صرف) */}"
content = content.replace(target, supplier_modal + "\n" + target)

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
