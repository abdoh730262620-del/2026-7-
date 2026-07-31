import re

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

# I will find the commission input div and remove it
commission_div = """                            <div className="mb-4">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    نسبة عمولة المورد (%)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.1"
                                    value=0
                                    onChange={(e) => setCommissionPercent(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-600"
                                />
                            </div>"""
content = content.replace(commission_div, "")

# Also, there's a calculation summary that uses commissionAmount
summary_target = """                                {false && (
                                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                                        <span>قيمة العمولة (0%):</span>
                                        <span dir="ltr">- {commissionAmount.toFixed(2)}</span>
                                    </div>
                                )}"""
content = content.replace(summary_target, "")

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)
