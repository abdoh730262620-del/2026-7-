import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

handlers_to_add = """
    // ----------------------------------------------------
    // Suppliers & Purchases Handlers
    // ----------------------------------------------------
    const handleSaveSupplier = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supplierName.trim()) {
            alert('يرجى إدخال اسم المورد');
            return;
        }

        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const pDebt = parseFloat(supplierPreviousDebt) || 0;
            
            if (editingSupplier) {
                // Update
                const diffDebt = pDebt - (editingSupplier.previousDebt || 0);
                await updateDoc(doc(db, 'card_suppliers', editingSupplier.id), {
                    name: supplierName.trim(),
                    phone: supplierPhone.trim(),
                    previousDebt: pDebt,
                    balance: editingSupplier.balance + diffDebt,
                    updatedAt: Date.now()
                });
                alert('تم تحديث المورد بنجاح');
            } else {
                // Create
                await addDoc(collection(db, 'card_suppliers'), {
                    tenantId,
                    name: supplierName.trim(),
                    phone: supplierPhone.trim(),
                    previousDebt: pDebt,
                    balance: pDebt,
                    date: dateStr,
                    createdAt: Date.now()
                });
                alert('تمت إضافة المورد بنجاح');
            }
            setIsSupplierModalOpen(false);
            setSupplierName('');
            setSupplierPhone('');
            setSupplierPreviousDebt('');
            setEditingSupplier(null);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'card_suppliers');
        }
    };

    const handleDeleteSupplier = async (id: string, name: string) => {
        if (!window.confirm(`هل أنت متأكد من حذف المورد "${name}"؟`)) return;
        try {
            await deleteDoc(doc(db, 'card_suppliers', id));
            alert('تم الحذف بنجاح');
        } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, 'card_suppliers');
        }
    };

    const handleSavePurchaseInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!purchaseSupplierId || !purchaseCategoryId) {
            alert('يرجى اختيار المورد والفئة');
            return;
        }
        const qty = parseInt(purchaseQuantity) || 0;
        if (qty <= 0) {
            alert('يرجى إدخال كمية صحيحة');
            return;
        }
        const unitCost = parseFloat(purchaseCostPrice) || 0;
        if (unitCost < 0) {
            alert('يرجى إدخال سعر تكلفة صحيح');
            return;
        }

        const cat = categories.find(c => c.id === purchaseCategoryId);
        const supp = suppliers.find(d => d.id === purchaseSupplierId);
        if (!cat || !supp) return;

        if (purchaseIsReturn && cat.availableCount < qty) {
            alert(`لا يمكن إرجاع كروت للمورد أكثر من المتوفر في المخزون. المتاح: ${cat.availableCount}`);
            return;
        }

        const totalAmount = unitCost * qty; 
        const isCash = purchasePaymentMethod === 'cash';

        try {
            const dateStr = new Date().toISOString().split('T')[0];
            const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            
            // 1. Add Purchase record
            await addDoc(collection(db, 'card_purchases'), {
                tenantId,
                categoryId: cat.id,
                categoryName: cat.name,
                quantity: purchaseIsReturn ? -qty : qty,
                purchaseType: 'supplier',
                paymentType: purchasePaymentMethod,
                supplierId: supp.id,
                supplierName: supp.name,
                unitPrice: unitCost,
                totalAmount: purchaseIsReturn ? -totalAmount : totalAmount,
                month: dateStr.substring(0, 7),
                date: dateStr,
                dateTime: `${dateStr} ${timeStr}`,
                userName: appUser?.name || appUser?.email || 'المدير'
            });

            // 2. Update stock
            const newStock = purchaseIsReturn ? cat.availableCount - qty : cat.availableCount + qty;
            await updateDoc(doc(db, 'card_categories', cat.id), {
                availableCount: newStock,
                updatedAt: Date.now()
            });

            // 3. Update supplier debt (balance) OR Cashbox
            if (isCash) {
                // Cash transaction: we pay from cashbox
                await addDoc(collection(db, 'card_cashbox'), {
                    tenantId,
                    type: purchaseIsReturn ? 'supplier_return_cash' : 'supplier_purchase_cash',
                    title: purchaseIsReturn 
                        ? `مسترد نقدي من المورد: ${supp.name} (مرتجع)`
                        : `مدفوع نقدي للمورد: ${supp.name} (مشتريات)`,
                    amount: totalAmount,
                    isIncome: purchaseIsReturn, // return = we get money back
                    referenceId: '',
                    date: dateStr,
                    dateTime: `${dateStr} ${timeStr}`,
                    userName: appUser?.name || appUser?.email || 'المدير',
                    createdAt: Date.now()
                });
            } else {
                // Credit transaction: update supplier balance
                const newBalance = purchaseIsReturn ? supp.balance - totalAmount : supp.balance + totalAmount;
                await updateDoc(doc(db, 'card_suppliers', supp.id), {
                    balance: newBalance,
                    updatedAt: Date.now()
                });
            }

            // 4. Record stock log
            await addDoc(collection(db, 'card_stock_logs'), {
                tenantId,
                categoryId: cat.id,
                categoryName: cat.name,
                quantityAdded: purchaseIsReturn ? -qty : qty,
                userName: appUser?.name || appUser?.email || 'المدير',
                additionDate: `${dateStr} ${timeStr}`,
                availableCountAfter: newStock
            });
            
            alert(purchaseIsReturn ? 'تم إرجاع الكروت للمورد وتحديث الحساب بنجاح' : 'تم إضافة فاتورة المشتريات وتزويد الرصيد بنجاح');
            setPurchaseQuantity('');
            setPurchaseCostPrice('');
            setPurchaseCategoryId('');
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'card_purchases');
        }
    };

    const handleSavePurchaseVoucher = async (e: React.FormEvent) => {
        e.preventDefault();
        const amount = parseFloat(purchaseVoucherAmountInput);
        if (!amount || amount <= 0 || !purchaseVoucherSupplierId) {
            alert('يرجى إدخال مبلغ صحيح واختيار مورد');
            return;
        }

        const supp = suppliers.find(d => d.id === purchaseVoucherSupplierId);
        if (!supp) return;

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const voucherNo = `V-SUPP-${Date.now().toString().slice(-6)}`;
        const staffName = appUser?.name || appUser?.email || 'المدير';

        try {
            await addDoc(collection(db, 'card_purchase_vouchers'), {
                tenantId,
                type: purchaseVoucherType,
                voucherNumber: voucherNo,
                supplierId: supp.id,
                supplierName: supp.name,
                amount,
                notes: purchaseVoucherNotesInput.trim(),
                date: dateStr,
                dateTime: `${dateStr} ${timeStr}`,
                userName: staffName,
                createdAt: Date.now()
            });

            // Update Supplier balance
            // If Payment (صرف للمورد) -> reduces our debt to them
            // If Receipt (قبض من المورد) -> increases our debt to them (they gave us money, or it's a refund that we keep as credit)
            // Wait, standard balance: Positive = we owe them.
            // Payment to them decreases what we owe.
            // Receipt from them increases what we owe (or offsets debt).
            const currentBalance = supp.balance || 0;
            const newBalance = purchaseVoucherType === 'payment' ? currentBalance - amount : currentBalance + amount;

            await updateDoc(doc(db, 'card_suppliers', supp.id), {
                balance: newBalance,
                updatedAt: Date.now()
            });

            // Update Cashbox
            // Payment = Expense from cashbox
            // Receipt = Income to cashbox
            await addDoc(collection(db, 'card_cashbox'), {
                tenantId,
                type: 'supplier_payment',
                title: purchaseVoucherType === 'payment' 
                    ? `سند صرف للمورد (سداد): ${supp.name} (${voucherNo})`
                    : `سند قبض من المورد (استرداد): ${supp.name} (${voucherNo})`,
                amount,
                isIncome: purchaseVoucherType === 'receipt',
                referenceId: voucherNo,
                date: dateStr,
                dateTime: `${dateStr} ${timeStr}`,
                userName: staffName,
                createdAt: Date.now()
            });

            setIsPurchaseVoucherModalOpen(false);
            setPurchaseVoucherSupplierId('');
            setPurchaseVoucherAmountInput('');
            setPurchaseVoucherNotesInput('');
            alert(`تم حفظ ${purchaseVoucherType === 'payment' ? 'سند الصرف' : 'سند القبض'} بنجاح وتحديث حساب المورد.`);
        } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'card_purchase_vouchers');
        }
    };

"""

content = content.replace(
    "    // ----------------------------------------------------\n    // Manual Cashbox Operations",
    handlers_to_add + "    // ----------------------------------------------------\n    // Manual Cashbox Operations"
)

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
