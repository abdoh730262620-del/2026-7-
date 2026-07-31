import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# 1. Update distributorSubSection state type
content = content.replace(
    "const [distributorSubSection, setDistributorSubSection] = useState<'accounts' | 'list' | 'add' | null>(null);",
    "const [distributorSubSection, setDistributorSubSection] = useState<'accounts' | 'list' | 'add' | 'sales' | null>(null);\n    const [saleDistributorId, setSaleDistributorId] = useState('');\n    const [saleCategoryId, setSaleCategoryId] = useState('');\n    const [saleQuantity, setSaleQuantity] = useState('');\n    const [saleIsReturn, setSaleIsReturn] = useState(false);"
)

# 2. Add handleSaveSaleInvoice
handler = """
    const handleSaveSaleInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!saleDistributorId || !saleCategoryId) {
            alert('يرجى اختيار الموزع والفئة');
            return;
        }
        const qty = parseInt(saleQuantity) || 0;
        if (qty <= 0) {
            alert('يرجى إدخال كمية صحيحة');
            return;
        }

        const cat = categories.find(c => c.id === saleCategoryId);
        const dist = distributors.find(d => d.id === saleDistributorId);
        if (!cat || !dist) return;

        if (!saleIsReturn && cat.availableCount < qty) {
            alert(`الكمية المطلوبة غير متوفرة. المتاح: ${cat.availableCount}`);
            return;
        }

        const unitPrice = cat.wholesalePrice || 0;
        const totalAmount = unitPrice * qty;
        const commissionAmount = (dist.commission / 100) * totalAmount;
        const netTotal = totalAmount - commissionAmount;

        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            
            // 1. Add Sale record
            await addDoc(collection(db, 'card_sales'), {
                tenantId,
                categoryName: cat.name,
                quantity: saleIsReturn ? -qty : qty,
                saleType: 'distributor',
                paymentType: 'credit',
                distributorId: dist.id,
                distributorName: dist.name,
                unitPrice,
                commissionPercent: dist.commission,
                commissionAmount: saleIsReturn ? -commissionAmount : commissionAmount,
                totalAmount: saleIsReturn ? -totalAmount : totalAmount,
                netTotal: saleIsReturn ? -netTotal : netTotal,
                month: dateStr.substring(0, 7),
                date: dateStr,
                dateTime: `${dateStr} ${timeStr}`,
                userName: appUser?.name || appUser?.email || 'المدير'
            });

            // 2. Update stock
            const newStock = saleIsReturn ? cat.availableCount + qty : cat.availableCount - qty;
            await updateDoc(doc(db, 'card_categories', cat.id), {
                availableCount: newStock,
                updatedAt: Date.now()
            });

            // 3. Update distributor debt (balance)
            const newBalance = saleIsReturn ? dist.balance - netTotal : dist.balance + netTotal;
            await updateDoc(doc(db, 'card_distributors', dist.id), {
                balance: newBalance,
                updatedAt: Date.now()
            });

            // 4. Record stock log
            await addDoc(collection(db, 'card_stock_logs'), {
                tenantId,
                categoryId: cat.id,
                categoryName: cat.name,
                quantityAdded: saleIsReturn ? qty : -qty,
                userName: appUser?.name || appUser?.email || 'المدير',
                additionDate: `${dateStr} ${timeStr}`,
                availableCountAfter: newStock
            });
            
            alert(saleIsReturn ? 'تم إرجاع الكروت وتحديث حساب الموزع بنجاح' : 'تم إصدار الفاتورة وخصم الكروت بنجاح');
            setSaleQuantity('');
            setSaleCategoryId('');
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'card_sales');
        }
    };
"""

content = content.replace("// ----------------------------------------------------\n    // Cashbox Operations", handler + "\n    // ----------------------------------------------------\n    // Cashbox Operations")

# 3. Add to distSections Menu
menu_addition = """                            ...(canAdd ? [{
                                id: 'sales',
                                title: 'فواتير ومردودات',
                                subtitle: 'إصدار فواتير مبيعات للموزعين أو استرجاع كروت',
                                icon: FileText,
                                lightBg: 'bg-orange-50 dark:bg-orange-950/60',
                                textColor: 'text-orange-600 dark:text-orange-400',
                                borderColor: 'border-orange-100 dark:border-orange-900/50'
                            }] : []),"""

content = content.replace("                            ...(canAdd ? [{", menu_addition + "\n                            ...(canAdd ? [{")

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
