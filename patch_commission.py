import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "const [saleIsReturn, setSaleIsReturn] = useState(false);",
    "const [saleIsReturn, setSaleIsReturn] = useState(false);\n    const [applyCommission, setApplyCommission] = useState(false);"
)

# Fix handleSaveSaleInvoice
handler_target = """        const unitPrice = cat.wholesalePrice || 0;
        const totalAmount = unitPrice * qty;
        const commissionAmount = (dist.commission / 100) * totalAmount;
        const netTotal = totalAmount - commissionAmount;"""

handler_replacement = """        const unitPrice = cat.wholesalePrice || 0;
        const totalAmount = unitPrice * qty;
        const commissionAmount = applyCommission ? (dist.commission / 100) * totalAmount : 0;
        const netTotal = totalAmount - commissionAmount;"""

content = content.replace(handler_target, handler_replacement)

# Fix UI
ui_target = """                                {saleCategoryId && saleDistributorId && saleQuantity && (() => {
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
                                })()}"""

ui_replacement = """                                {saleCategoryId && saleDistributorId && saleQuantity && (() => {
                                    const cat = categories.find(c => c.id === saleCategoryId);
                                    const dist = distributors.find(d => d.id === saleDistributorId);
                                    const qty = parseInt(saleQuantity) || 0;
                                    if (cat && dist && qty > 0) {
                                        const unitPrice = cat.wholesalePrice || 0;
                                        const total = unitPrice * qty;
                                        const comm = applyCommission ? (dist.commission / 100) * total : 0;
                                        const net = total - comm;
                                        return (
                                            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800/30 space-y-3">
                                                
                                                {/* Commission Toggle */}
                                                {dist.commission > 0 && (
                                                    <div className="flex items-center justify-between pb-3 border-b border-orange-200/50 dark:border-orange-800/50">
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                            تطبيق خصم العمولة الإضافي للموزع؟ ({dist.commission}%)
                                                        </span>
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input type="checkbox" checked={applyCommission} onChange={(e) => setApplyCommission(e.target.checked)} className="sr-only peer" />
                                                            <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-orange-500"></div>
                                                        </label>
                                                    </div>
                                                )}

                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-slate-500 dark:text-slate-400">الإجمالي {applyCommission ? '(قبل العمولة)' : ''}:</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">{total.toLocaleString()} د.ل</span>
                                                </div>
                                                
                                                {applyCommission && dist.commission > 0 && (
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className="text-slate-500 dark:text-slate-400">قيمة الخصم ({dist.commission}%):</span>
                                                        <span className="font-bold text-rose-600 dark:text-rose-400">- {comm.toLocaleString()} د.ل</span>
                                                    </div>
                                                )}

                                                <div className="pt-2 border-t border-orange-200/50 dark:border-orange-800/50 flex justify-between items-center">
                                                    <span className="font-black text-slate-800 dark:text-slate-200 text-sm">الصافي (يسجل على الموزع):</span>
                                                    <span className="font-black text-orange-600 dark:text-orange-400 text-sm">{net.toLocaleString()} د.ل</span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}"""

content = content.replace(ui_target, ui_replacement)

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)

