import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

top_distributors_ui = """
                    {/* Top Distributors Report */}
                    {(() => {
                        const monthDistSales = sales.filter(s => s.month === selectedMonth && s.saleType === 'distributor');
                        if (monthDistSales.length === 0) return null;
                        
                        const distMap = new Map<string, { name: string, qty: number, net: number }>();
                        monthDistSales.forEach(s => {
                            const name = s.distributorName || 'غير معروف';
                            if (!distMap.has(name)) {
                                distMap.set(name, { name, qty: 0, net: 0 });
                            }
                            const entry = distMap.get(name);
                            if (entry) {
                                entry.qty += s.quantity;
                                entry.net += s.netTotal;
                            }
                        });

                        const topDistributors = Array.from(distMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);

                        return (
                            <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm mt-6">
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
"""

target = """                        </div>
                    </div>
                </div>
            )}

            {/* SECTION 5: صندوق المبيعات (Sales Cashbox) */}"""

replacement = """                        </div>
                    </div>
""" + top_distributors_ui + """
                </div>
            )}

            {/* SECTION 5: صندوق المبيعات (Sales Cashbox) */}"""

content = content.replace(target, replacement)

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)

