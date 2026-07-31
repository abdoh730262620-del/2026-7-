import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# 1. Add CardPurchaseModal import
content = content.replace(
    "import CardSaleModal from '../components/CardSaleModal';",
    "import CardSaleModal from '../components/CardSaleModal';\nimport CardPurchaseModal from '../components/CardPurchaseModal';"
)

# 2. Add state for CardPurchaseModal
state_hook = """    const [isCardPurchaseModalOpen, setIsCardPurchaseModalOpen] = useState(false);"""
content = content.replace("    const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);", "    const [isVoucherModalOpen, setIsVoucherModalOpen] = useState(false);\n" + state_hook)

# 3. Add `add_stock` to sections
sections_target = """    const sections = [
        {
            id: 'purchases',"""
sections_replacement = """    const sections = [
        {
            id: 'add_stock',
            title: 'إضافة كروت',
            subtitle: 'تزويد ورصيد المخزون',
            icon: Plus,
            color: 'bg-indigo-600',
            lightBg: 'bg-indigo-50 dark:bg-indigo-950/60',
            textColor: 'text-indigo-600 dark:text-indigo-400',
            borderColor: 'border-indigo-100 dark:border-indigo-900/50',
            visible: getSecPermission('cards_stock', 'view')
        },
        {
            id: 'purchases',"""

content = content.replace(sections_target, sections_replacement)

# 4. In `activeSection === 'purchases'`, change the title back if we want, or just leave it.
content = content.replace("title: 'الموردين والمشتريات'", "title: 'المشتريات'")
content = content.replace("subtitle: 'شراء الكروت وحسابات الموردين'", "subtitle: 'حسابات الموردين وفواتير الشراء'")

# 5. Restore activeSection === 'add_stock' logic
# I will put it right before `activeSection === 'purchases'`
add_stock_view = """
            {/* SECTION 1: إضافة كروت (Add Stock) */}
            {activeSection === 'add_stock' && (
                <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between gap-3">
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">سجل إضافة رصيد الكروت</h2>
                        <div className="flex items-center gap-2">
                            {canAdd && (
                                <button
                                    onClick={() => setIsCardPurchaseModalOpen(true)}
                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-black text-xs rounded-2xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition"
                                >
                                    <Plus size={18} />
                                    <span>إضافة رصيد كروت جديد</span>
                                </button>
                            )}
                        </div>
                    </div>
                    
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-right text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-black border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                        <th className="p-4">الفئة</th>
                                        <th className="p-4">الكمية المضافة</th>
                                        <th className="p-4">الرصيد الكلي بعد الإضافة</th>
                                        <th className="p-4">التاريخ والوقت</th>
                                        <th className="p-4">المستخدم</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold text-slate-800 dark:text-slate-200">
                                    {stockLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400 font-bold">
                                                لا توجد عمليات إضافة رصيد سابقة.
                                            </td>
                                        </tr>
                                    ) : (
                                        stockLogs.map((log) => (
                                            <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                                <td className="p-4 font-black">{log.categoryName}</td>
                                                <td className="p-4 text-emerald-600 font-black">+{log.quantityAdded} كارت</td>
                                                <td className="p-4 text-indigo-600 font-black">{log.availableCountAfter} كارت</td>
                                                <td className="p-4 text-slate-500">{log.additionDate}</td>
                                                <td className="p-4 text-slate-500">{log.userName}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
"""

content = content.replace("{/* SECTION 1: الموردين والمشتريات (Purchases) */}", add_stock_view + "\n            {/* SECTION 1.5: الموردين والمشتريات (Purchases) */}")

# 6. Add CardPurchaseModal rendering at the end
purchase_modal_render = """
            <CardPurchaseModal
                isOpen={isCardPurchaseModalOpen}
                onClose={() => setIsCardPurchaseModalOpen(false)}
            />
"""
content = content.replace("        </div>\n    );\n}", purchase_modal_render + "        </div>\n    );\n}")

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
