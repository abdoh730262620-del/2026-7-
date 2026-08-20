const fs = require('fs');
let content = fs.readFileSync('src/pages/Sales.tsx', 'utf8');

if (!content.includes('import { RefreshCw')) {
    content = content.replace("import { Plus", "import { Plus, RefreshCw");
}

const functionToExtract = `        const loadInitialData = async (force = false) => {
            setIsRefreshing(true);
            try {
                const qProducts = query(collection(db, 'products'), where('tenantId', '==', tenantId));
                const pRes = await LocalCache.fetchCollection('products', tenantId, qProducts, { forceRefresh: force });
                setProducts(pRes.data as Product[]);

                const qCardCategories = query(collection(db, 'card_categories'), where('tenantId', '==', tenantId));
                const cRes = await LocalCache.fetchCollection('card_categories', tenantId, qCardCategories, { forceRefresh: force });
                setCardCategories(cRes.data);

                const qCustomers = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
                const custRes = await LocalCache.fetchCollection('customers', tenantId, qCustomers, { forceRefresh: force });
                setCustomers(custRes.data as Customer[]);
            } catch (err) {
                console.error("Failed to load initial data for sales:", err);
            } finally {
                setIsRefreshing(false);
            }
        };`;

const extractedFunction = `    const loadInitialData = async (force = false) => {
        if (!appUser) return;
        const tenantId = appUser.tenantId || 'single_store';
        setIsRefreshing(true);
        try {
            const qProducts = query(collection(db, 'products'), where('tenantId', '==', tenantId));
            const pRes = await LocalCache.fetchCollection('products', tenantId, qProducts, { forceRefresh: force });
            setProducts(pRes.data as Product[]);

            const qCardCategories = query(collection(db, 'card_categories'), where('tenantId', '==', tenantId));
            const cRes = await LocalCache.fetchCollection('card_categories', tenantId, qCardCategories, { forceRefresh: force });
            setCardCategories(cRes.data);

            const qCustomers = query(collection(db, 'customers'), where('tenantId', '==', tenantId));
            const custRes = await LocalCache.fetchCollection('customers', tenantId, qCustomers, { forceRefresh: force });
            setCustomers(custRes.data as Customer[]);
        } catch (err) {
            console.error("Failed to load initial data for sales:", err);
        } finally {
            setIsRefreshing(false);
        }
    };`;

content = content.replace(functionToExtract, "");
content = content.replace("const handleSync = async () => {", extractedFunction + "\n\n    const handleSync = async () => {");

fs.writeFileSync('src/pages/Sales.tsx', content);
