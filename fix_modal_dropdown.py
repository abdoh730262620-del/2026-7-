import re

with open('src/components/CardPurchaseModal.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { CardCategory, CardSupplier } from '../types/cardTypes';", "import { CardCategory, CardSupplier } from '../types/cardTypes';\nimport SearchableSelect from './SearchableSelect';")

custom_dropdown = """                                <div className="relative">
                                    <div 
                                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 text-xs font-black text-slate-900 dark:text-white flex justify-between items-center cursor-pointer"
                                        onClick={() => setShowSupplierDropdown(!showSupplierDropdown)}
                                    >
                                        <span>{selectedSupplierId ? suppliers.find(s => s.id === selectedSupplierId)?.name : '-- بدون مورد (مورد نقدي عام) --'}</span>
                                        <Search size={16} className="text-slate-400" />
                                    </div>
                                    {showSupplierDropdown && (
                                        <div className="absolute z-10 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden max-h-60 flex flex-col">
                                            <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                                                <input 
                                                    type="text" 
                                                    placeholder="ابحث عن مورد..."
                                                    value={supplierSearch}
                                                    onChange={e => setSupplierSearch(e.target.value)}
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                                                />
                                            </div>
                                            <div className="overflow-y-auto p-2">
                                                <div 
                                                    className="p-3 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer text-slate-600"
                                                    onClick={() => {
                                                        setSelectedSupplierId('');
                                                        setShowSupplierDropdown(false);
                                                    }}
                                                >
                                                    -- بدون مورد (مورد نقدي عام) --
                                                </div>
                                                {suppliers.filter(s => s.name.includes(supplierSearch) || (s.phone && s.phone.includes(supplierSearch))).map(dist => (
                                                    <div 
                                                        key={dist.id}
                                                        className="p-3 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer flex justify-between items-center"
                                                        onClick={() => {
                                                            setSelectedSupplierId(dist.id);
                                                            // handleSelectDistributor(dist); // Not needed, just setting ID is enough
                                                            setShowSupplierDropdown(false);
                                                        }}
                                                    >
                                                        <span className="text-slate-900 dark:text-white">{dist.name}</span>
                                                        {dist.phone && <span className="text-slate-400">{dist.phone}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>"""

searchable = """                                <SearchableSelect
                                    value={selectedSupplierId || ''}
                                    onChange={setSelectedSupplierId}
                                    placeholder="-- بدون مورد (مورد نقدي عام) --"
                                    options={suppliers.map(dist => ({ id: dist.id, label: dist.name, subLabel: dist.phone }))}
                                />"""
if custom_dropdown in content:
    content = content.replace(custom_dropdown, searchable)
else:
    print("Could not find dropdown block in CardPurchaseModal")

with open('src/components/CardPurchaseModal.tsx', 'w') as f:
    f.write(content)
