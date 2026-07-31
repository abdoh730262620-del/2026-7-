import sys
import re

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# 1. Add Truck icon
content = content.replace(
    "import { Plus, Minus, Search, Trash2, Edit, Save, X, FileText, Calendar, DollarSign, Receipt, Printer, CheckCircle2, ShoppingBag, UserPlus, FileSpreadsheet, List, ArrowDownCircle, ArrowUpCircle, Layers, Users, Building, TrendingUp, Wallet, UserCheck, Shield } from 'lucide-react';",
    "import { Plus, Minus, Search, Trash2, Edit, Save, X, FileText, Calendar, DollarSign, Receipt, Printer, CheckCircle2, ShoppingBag, UserPlus, FileSpreadsheet, List, ArrowDownCircle, ArrowUpCircle, Layers, Users, Building, TrendingUp, Wallet, UserCheck, Shield, Truck } from 'lucide-react';"
)

# 2. setSupplierSubSection
content = content.replace("setSupplierSubSection", "setPurchaseSubSection")

# 3. Inside the map for purchases
# The issue is that the mapping variables inside the JSX loops might still be using old names.
# For example, mapping over suppliers to show them uses `supp` in JSX but maybe we missed something.
# Let's just fix specific line contexts.

content = content.replace("distSales.", "suppPurchases.")
content = content.replace("distVouchers.", "suppVouchers.")

content = content.replace("const dist = suppliers.find", "const supp = suppliers.find")
content = content.replace("handleShareClick(dist, ", "handleShareClick(supp, ")
content = content.replace("const titleReport = `كشف حساب المورد: ${dist.name}`;", "const titleReport = `كشف حساب المورد: ${supp.name}`;")
content = content.replace("dist.date, '--', 'رصيد أول المدة', '--', '--', `${initialDebt.toFixed(2)} ريال`", "supp.date, '--', 'رصيد أول المدة', '--', '--', `${initialDebt.toFixed(2)} ريال`")
content = content.replace("dist.name", "supp.name")
content = content.replace("dist.phone", "supp.phone")
content = content.replace("dist.balance", "supp.balance")
content = content.replace("dist.previousDebt", "supp.previousDebt")
content = content.replace("dist.id", "supp.id")
content = content.replace("dist.date", "supp.date")

# But wait, there might be REAL `dist` variables in the Distributors section!
# If I replace `dist.name` globally, it breaks the Distributors section!
