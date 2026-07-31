import re

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

content = content.replace("import CardPurchaseModal from '../components/CardPurchaseModal';", "import CardPurchaseModal from '../components/CardPurchaseModal';\nimport SearchableSelect from '../components/SearchableSelect';")

# Replace supplier select
old_supp_select = """                                        <select
                                            required
                                            value={purchaseSupplierId}
                                            onChange={(e) => setPurchaseSupplierId(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-orange-500 text-slate-900 dark:text-white"
                                        >
                                            <option value="">اختر المورد...</option>
                                            {suppliers.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>"""
new_supp_select = """                                        <SearchableSelect
                                            required
                                            value={purchaseSupplierId}
                                            onChange={setPurchaseSupplierId}
                                            placeholder="اختر المورد..."
                                            options={suppliers.map(d => ({ id: d.id, label: d.name, subLabel: d.phone }))}
                                        />"""
content = content.replace(old_supp_select, new_supp_select)

old_cat_select = """                                        <select
                                            required
                                            value={purchaseCategoryId}
                                            onChange={(e) => setPurchaseCategoryId(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-orange-500 text-slate-900 dark:text-white"
                                        >
                                            <option value="">اختر الفئة...</option>
                                            {categories.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} - متوفر: {c.availableCount} كارت
                                                </option>
                                            ))}
                                        </select>"""
new_cat_select = """                                        <SearchableSelect
                                            required
                                            value={purchaseCategoryId}
                                            onChange={setPurchaseCategoryId}
                                            placeholder="اختر الفئة..."
                                            options={categories.map(c => ({ id: c.id, label: c.name, subLabel: `متوفر: ${c.availableCount}` }))}
                                        />"""
content = content.replace(old_cat_select, new_cat_select)


# In sales
old_sale_supp_select = """                                        <select
                                            required
                                            value={saleDistributorId}
                                            onChange={(e) => setSaleDistributorId(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-bold outline-none focus:border-orange-500 text-slate-900 dark:text-white"
                                        >
                                            <option value="">اختر الموزع...</option>
                                            {distributors.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>"""
new_sale_supp_select = """                                        <SearchableSelect
                                            required
                                            value={saleDistributorId}
                                            onChange={setSaleDistributorId}
                                            placeholder="اختر الموزع..."
                                            options={distributors.map(d => ({ id: d.id, label: d.name, subLabel: d.phone }))}
                                        />"""
content = content.replace(old_sale_supp_select, new_sale_supp_select)

old_sale_cat_select = """                                        <select
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
                                        </select>"""
content = content.replace(old_sale_cat_select, new_cat_select.replace("purchaseCategoryId", "saleCategoryId").replace("setPurchaseCategoryId", "setSaleCategoryId"))

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)

