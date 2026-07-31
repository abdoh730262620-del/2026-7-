import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# 1. Update imports
content = content.replace(
    "import { CardCategory, CardDistributor, CardStockLog, CardSale, CardVoucher, CardCashboxEntry } from '../types/cardTypes';",
    "import { CardCategory, CardDistributor, CardStockLog, CardSale, CardVoucher, CardCashboxEntry, CardSupplier, CardPurchase, CardPurchaseVoucher } from '../types/cardTypes';"
)

content = content.replace(
    "ShoppingBag, UserPlus,",
    "ShoppingBag, UserPlus, Truck,"
)

# 2. Add States
states_to_add = """    const [suppliers, setSuppliers] = useState<CardSupplier[]>([]);
    const [purchases, setPurchases] = useState<CardPurchase[]>([]);
    const [purchaseVouchers, setPurchaseVouchers] = useState<CardPurchaseVoucher[]>([]);
    const [purchaseSubSection, setPurchaseSubSection] = useState<string | null>(null);
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
    const [supplierName, setSupplierName] = useState('');
    const [supplierPhone, setSupplierPhone] = useState('');
    const [supplierPreviousDebt, setSupplierPreviousDebt] = useState('');
    const [editingSupplier, setEditingSupplier] = useState<CardSupplier | null>(null);
    const [selectedSupplierForDetails, setSelectedSupplierForDetails] = useState<CardSupplier | null>(null);
    
    // Purchase Invoice States
    const [purchaseIsReturn, setPurchaseIsReturn] = useState(false);
    const [purchaseCategoryId, setPurchaseCategoryId] = useState('');
    const [purchaseQuantity, setPurchaseQuantity] = useState('');
    const [purchaseCostPrice, setPurchaseCostPrice] = useState('');
    const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
    const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<'credit' | 'cash'>('credit');
    
    // Purchase Voucher States
    const [isPurchaseVoucherModalOpen, setIsPurchaseVoucherModalOpen] = useState(false);
    const [purchaseVoucherType, setPurchaseVoucherType] = useState<'receipt' | 'payment'>('payment');
    const [purchaseVoucherSupplierId, setPurchaseVoucherSupplierId] = useState('');
    const [purchaseVoucherAmountInput, setPurchaseVoucherAmountInput] = useState('');
    const [purchaseVoucherNotesInput, setPurchaseVoucherNotesInput] = useState('');
"""

content = content.replace(
    "    const [distributors, setDistributors] = useState<CardDistributor[]>([]);",
    states_to_add + "\n    const [distributors, setDistributors] = useState<CardDistributor[]>([]);"
)

# 3. Fetch Data
fetch_target = """                const cashboxSnapshot = await getDocs(query(collection(db, 'card_cashbox'), where('tenantId', '==', tenantId)));
                const cashboxData = cashboxSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CardCashboxEntry));
                setCashboxEntries(cashboxData.sort((a, b) => (b.dateTime || '').localeCompare(a.dateTime || '')));"""

fetch_replacement = fetch_target + """

                const suppliersSnapshot = await getDocs(query(collection(db, 'card_suppliers'), where('tenantId', '==', tenantId)));
                setSuppliers(suppliersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as CardSupplier)));
                
                const purchasesSnapshot = await getDocs(query(collection(db, 'card_purchases'), where('tenantId', '==', tenantId)));
                setPurchases(purchasesSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as CardPurchase)));
                
                const purchVouchersSnapshot = await getDocs(query(collection(db, 'card_purchase_vouchers'), where('tenantId', '==', tenantId)));
                setPurchaseVouchers(purchVouchersSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as CardPurchaseVoucher)));
"""

content = content.replace(fetch_target, fetch_replacement)

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
