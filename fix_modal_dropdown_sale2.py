import re

with open('src/components/CardSaleModal.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { CardCategory, CardDistributor } from '../types/cardTypes';", "import { CardCategory, CardDistributor } from '../types/cardTypes';\nimport SearchableSelect from './SearchableSelect';")

old_select = """                                <select
                                    value={selectedDistributorId || ''}
                                    onChange={(e) => {
                                        const distId = e.target.value;
                                        if (distId === '') {
                                            setSelectedDistributorId('');
                                            setDistributorSearch('');
                                            setCommissionPercent(0);
                                        } else {
                                            const dist = distributors.find(d => d.id === distId);
                                            if (dist) {
                                                handleSelectDistributor(dist);
                                            }
                                        }
                                    }}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-black text-slate-900 dark:text-white outline-none focus:border-emerald-600 cursor-pointer"
                                >
                                    <option value="">-- بدون موزع (عميل نقدي عام) --</option>
                                    {distributors.map(dist => (
                                        <option key={dist.id} value={dist.id}>
                                            {dist.name} {dist.phone ? `(${dist.phone})` : ''} - (عمولة: %{dist.commission || 0})
                                        </option>
                                    ))}
                                </select>"""

searchable = """                                <SearchableSelect
                                    value={selectedDistributorId || ''}
                                    onChange={(distId) => {
                                        if (distId === '') {
                                            setSelectedDistributorId('');
                                            setDistributorSearch('');
                                            setCommissionPercent(0);
                                        } else {
                                            const dist = distributors.find(d => d.id === distId);
                                            if (dist) {
                                                handleSelectDistributor(dist);
                                            }
                                        }
                                    }}
                                    placeholder="-- بدون موزع (عميل نقدي عام) --"
                                    options={distributors.map(dist => ({ 
                                        id: dist.id, 
                                        label: dist.name, 
                                        subLabel: dist.phone ? `${dist.phone} - عمولة: %${dist.commission || 0}` : `عمولة: %${dist.commission || 0}` 
                                    }))}
                                />"""

if old_select in content:
    content = content.replace(old_select, searchable)
else:
    print("Could not find dropdown block in CardSaleModal")

with open('src/components/CardSaleModal.tsx', 'w') as f:
    f.write(content)
