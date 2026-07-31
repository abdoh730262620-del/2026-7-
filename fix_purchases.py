import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# Add Truck
content = content.replace(
    "import { Plus, Minus, Search, Trash2, Edit, Save, X, FileText, Calendar, DollarSign, Receipt, Printer, CheckCircle2, ShoppingBag, UserPlus, FileSpreadsheet, List, ArrowDownCircle, ArrowUpCircle, Layers, Users, Building, TrendingUp, Wallet, UserCheck, Shield } from 'lucide-react';",
    "import { Plus, Minus, Search, Trash2, Edit, Save, X, FileText, Calendar, DollarSign, Receipt, Printer, CheckCircle2, ShoppingBag, UserPlus, FileSpreadsheet, List, ArrowDownCircle, ArrowUpCircle, Layers, Users, Building, TrendingUp, Wallet, UserCheck, Shield, Truck } from 'lucide-react';"
)

start_idx = content.find("{/* SECTION 1: الموردين والمشتريات (Purchases) */}")
end_idx = content.find("{/* SECTION 2: فئات الكروت (Card Categories) */}")

if start_idx != -1 and end_idx != -1:
    purchases_section = content[start_idx:end_idx]
    
    purchases_section = purchases_section.replace("setSupplierSubSection", "setPurchaseSubSection")
    purchases_section = purchases_section.replace("distSales.", "suppPurchases.")
    purchases_section = purchases_section.replace("distVouchers.", "suppVouchers.")
    
    # In purchases section, we mapped distributors -> suppliers, but left the variable names as `dist` in maps.
    purchases_section = purchases_section.replace("dist.name", "supp.name")
    purchases_section = purchases_section.replace("dist.phone", "supp.phone")
    purchases_section = purchases_section.replace("dist.balance", "supp.balance")
    purchases_section = purchases_section.replace("dist.previousDebt", "supp.previousDebt")
    purchases_section = purchases_section.replace("dist.id", "supp.id")
    purchases_section = purchases_section.replace("dist.date", "supp.date")
    purchases_section = purchases_section.replace("dist.commission", "supp.commission")
    
    # Also for maps:
    purchases_section = purchases_section.replace("suppliers.map(dist =>", "suppliers.map(supp =>")
    purchases_section = purchases_section.replace("suppliers.filter(dist =>", "suppliers.filter(supp =>")
    purchases_section = purchases_section.replace("(dist)", "(supp)")
    
    # For handleShareClick
    purchases_section = purchases_section.replace("handleShareClick(dist,", "handleShareClick(supp,")
    
    # Fix the duplicate property error
    # ts error: src/pages/CardsManagement.tsx(1218,45): error TS1117: An object literal cannot have multiple properties with the same name.
    # Looking for duplicate keys in object literals... "credit: " maybe?
    purchases_section = purchases_section.replace("credit: isCredit ? (sale.totalAmount || 0) : 0, // Credit increases what we owe them if credit\n                                            credit: 0,", "credit: isCredit ? (sale.totalAmount || 0) : 0, // Credit increases what we owe them if credit")

    new_content = content[:start_idx] + purchases_section + content[end_idx:]
    with open('src/pages/CardsManagement.tsx', 'w') as f:
        f.write(new_content)
