import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# Fix the 'add' section state resets
target = """                                                if (sec.id === 'add') {
                                                    setEditingSupplier(null);
                                                    setDistNameInput('');
                                                    setDistPhoneInput('');
                                                    setDistCommissionInput('');
                                                    setDistPreviousDebtInput('');
                                                    setDistDateInput(new Date().toISOString().split('T')[0]);
                                                    setIsSupplierModalOpen(true);
                                                } else {"""

replacement = """                                                if (sec.id === 'add') {
                                                    setEditingSupplier(null);
                                                    setSupplierName('');
                                                    setSupplierPhone('');
                                                    setSupplierPreviousDebt('');
                                                    setIsSupplierModalOpen(true);
                                                } else {"""

content = content.replace(target, replacement)
content = content.replace("وتعيين نسبة العمولة له ورصيد البداية", "وتعيين رصيد البداية")

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
