import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# 1. Add payment method state
content = content.replace(
    "const [applyCommission, setApplyCommission] = useState(false);",
    "const [salePaymentMethod, setSalePaymentMethod] = useState<'credit' | 'cash'>('credit');"
)

# 2. Fix handleSaveSaleInvoice
handler_target = """    const handleSaveSaleInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!saleDistributorId || !saleCategoryId) {
            alert('يرجى اختيار الموزع والفئة');
            return;
        }
        const qty = parseInt(saleQuantity) || 0;
        if (qty <= 0) {
            alert('يرجى إدخال كمية صحيحة');
            return;
        }

        const cat = categories.find(c => c.id === saleCategoryId);
        const dist = distributors.find(d => d.id === saleDistributorId);
        if (!cat || !dist) return;

        if (!saleIsReturn && cat.availableCount < qty) {
            alert(`الكمية المطلوبة غير متوفرة. المتاح: ${cat.availableCount}`);
            return;
        }

        const unitPrice = cat.wholesalePrice || 0;
        const totalAmount = unitPrice * qty;
        const commissionAmount = applyCommission ? (dist.commission / 100) * totalAmount : 0;
        const netTotal = totalAmount - commissionAmount;

        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            
            // 1. Add Sale record
            await addDoc(collection(db, 'card_sales'), {
                tenantId,
                categoryName: cat.name,
                quantity: saleIsReturn ? -qty : qty,
                saleType: 'distributor',
                paymentType: 'credit',
                distributorId: dist.id,
                distributorName: dist.name,
                unitPrice,
                commissionPercent: dist.commission,
                commissionAmount: saleIsReturn ? -commissionAmount : commissionAmount,
                totalAmount: saleIsReturn ? -totalAmount : totalAmount,
                netTotal: saleIsReturn ? -netTotal : netTotal,"""

handler_replacement = """    const handleSaveSaleInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!saleDistributorId || !saleCategoryId) {
            alert('يرجى اختيار الموزع والفئة');
            return;
        }
        const qty = parseInt(saleQuantity) || 0;
        if (qty <= 0) {
            alert('يرجى إدخال كمية صحيحة');
            return;
        }

        const cat = categories.find(c => c.id === saleCategoryId);
        const dist = distributors.find(d => d.id === saleDistributorId);
        if (!cat || !dist) return;

        if (!saleIsReturn && cat.availableCount < qty) {
            alert(`الكمية المطلوبة غير متوفرة. المتاح: ${cat.availableCount}`);
            return;
        }

        const unitPrice = cat.wholesalePrice || 0;
        const netTotal = unitPrice * qty; // Wholesale price is already discounted
        const isCash = salePaymentMethod === 'cash';

        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            
            // 1. Add Sale record
            await addDoc(collection(db, 'card_sales'), {
                tenantId,
                categoryName: cat.name,
                quantity: saleIsReturn ? -qty : qty,
                saleType: 'distributor',
                paymentType: salePaymentMethod,
                distributorId: dist.id,
                distributorName: dist.name,
                unitPrice,
                commissionPercent: 0, // No second discount
                commissionAmount: 0,
                totalAmount: saleIsReturn ? -netTotal : netTotal,
                netTotal: saleIsReturn ? -netTotal : netTotal,"""

content = content.replace(handler_target, handler_replacement)

handler_bottom_target = """            // 3. Update distributor debt (balance)
            const newBalance = saleIsReturn ? dist.balance - netTotal : dist.balance + netTotal;
            await updateDoc(doc(db, 'card_distributors', dist.id), {
                balance: newBalance,
                updatedAt: Date.now()
            });"""

handler_bottom_replacement = """            // 3. Update distributor debt (balance) OR Cashbox
            if (isCash) {
                // If it's a cash transaction, we don't increase their debt. We put it in the cashbox.
                await addDoc(collection(db, 'card_cashbox'), {
                    tenantId,
                    type: saleIsReturn ? 'distributor_return_cash' : 'distributor_sale_cash',
                    title: saleIsReturn 
                        ? `مرتجع مبيعات نقدي من الموزع: ${dist.name}`
                        : `مبيعات نقدية للموزع: ${dist.name}`,
                    amount: netTotal,
                    isIncome: !saleIsReturn, // Sale = income, Return = expense
                    referenceId: '',
                    date: dateStr,
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: appUser?.name || appUser?.email || 'المدير',
                    createdAt: Date.now()
                });
            } else {
                const newBalance = saleIsReturn ? dist.balance - netTotal : dist.balance + netTotal;
                await updateDoc(doc(db, 'card_distributors', dist.id), {
                    balance: newBalance,
                    updatedAt: Date.now()
                });
            }"""

content = content.replace(handler_bottom_target, handler_bottom_replacement)


# 3. Fix UI (add payment method toggle and remove commission toggle)
ui_target = """                                {saleCategoryId && saleDistributorId && saleQuantity && (() => {
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

ui_replacement = """
                                {/* Payment Method Toggle */}
                                <div>
                                    <label className="block text-xs font-black text-slate-700 dark:text-slate-300 mb-2">طريقة الدفع والتسديد <span className="text-rose-500">*</span></label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSalePaymentMethod('cash')}
                                            className={`flex-1 py-3 text-xs font-black rounded-xl transition-all border flex items-center justify-center gap-2 ${salePaymentMethod === 'cash' ? 'bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-600/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                        >
                                            <Wallet size={16} />
                                            <span>مدفوع نقدي</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSalePaymentMethod('credit')}
                                            className={`flex-1 py-3 text-xs font-black rounded-xl transition-all border flex items-center justify-center gap-2 ${salePaymentMethod === 'credit' ? 'bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-600/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                                        >
                                            <Receipt size={16} />
                                            <span>تسجيل كدين (آجل)</span>
                                        </button>
                                    </div>
                                </div>

                                {saleCategoryId && saleDistributorId && saleQuantity && (() => {
                                    const cat = categories.find(c => c.id === saleCategoryId);
                                    const dist = distributors.find(d => d.id === saleDistributorId);
                                    const qty = parseInt(saleQuantity) || 0;
                                    if (cat && dist && qty > 0) {
                                        const unitPrice = cat.wholesalePrice || 0;
                                        const total = unitPrice * qty;
                                        return (
                                            <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-100 dark:border-orange-800/30 space-y-3">
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-slate-500 dark:text-slate-400">الإجمالي:</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">{total.toLocaleString()} د.ل</span>
                                                </div>
                                                <div className="pt-2 border-t border-orange-200/50 dark:border-orange-800/50 flex justify-between items-center">
                                                    <span className="font-black text-slate-800 dark:text-slate-200 text-sm">المبلغ المطلوب ({salePaymentMethod === 'cash' ? 'يضاف للصندوق' : 'يسجل كدين'}):</span>
                                                    <span className="font-black text-orange-600 dark:text-orange-400 text-sm">{total.toLocaleString()} د.ل</span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}"""

content = content.replace(ui_target, ui_replacement)

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)

