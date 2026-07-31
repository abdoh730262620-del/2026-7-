import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# Remove the commission span
content = content.replace("""                                                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full">
                                                    %{supp.commission || 0} عمولة
                                                </span>""", "")

# Remove setDistCommissionInput for supplier
content = content.replace("setDistCommissionInput(supp.commission ? supp.commission.toString() : '');", "")
# Also the other state setups for suppliers were wrong! (They used dist state vars)
content = content.replace("setDistNameInput(supp.name);", "setSupplierName(supp.name);")
content = content.replace("setDistPhoneInput(supp.phone || '');", "setSupplierPhone(supp.phone || '');")
content = content.replace("setDistPreviousDebtInput(supp.previousDebt ? supp.previousDebt.toString() : '');", "setSupplierPreviousDebt(supp.previousDebt ? supp.previousDebt.toString() : '');")
content = content.replace("setDistDateInput(supp.date || new Date().toISOString().split('T')[0]);", "")

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
