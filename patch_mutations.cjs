const fs = require('fs');

function patchCustomers() {
    let content = fs.readFileSync('src/pages/Customers.tsx', 'utf8');
    
    // Patch updateDoc
    content = content.replace(
        /await updateDoc\(doc\(db, 'customers', editingCustomer\.id\), \{(.*?)\}\);/s,
        `const payload = {$1};
                await updateDoc(doc(db, 'customers', editingCustomer.id), payload);
                await LocalCache.updateCachedItem('customers', tenantId, { id: editingCustomer.id, ...payload });
                setCustomers(prev => prev.map(c => c.id === editingCustomer.id ? { ...c, ...payload } : c));`
    );
    
    // Patch addDoc
    content = content.replace(
        /await addDoc\(collection\(db, 'customers'\), \{(.*?)\}\);/s,
        `const payload = {$1};
                const docRef = await addDoc(collection(db, 'customers'), payload);
                const newCustomer = { id: docRef.id, ...payload };
                await LocalCache.updateCachedItem('customers', tenantId, newCustomer);
                setCustomers(prev => [newCustomer, ...prev]);`
    );
    
    // Patch deleteDoc
    content = content.replace(
        /const deletePromise = deleteDoc\(doc\(db, 'customers', cust\.id\)\);/s,
        `const deletePromise = deleteDoc(doc(db, 'customers', cust.id));
                await LocalCache.removeCachedItem('customers', appUser?.tenantId || 'single_store', cust.id);
                setCustomers(prev => prev.filter(c => c.id !== cust.id));
                if (selectedCustomer?.id === cust.id) setSelectedCustomer(null);`
    );
    
    fs.writeFileSync('src/pages/Customers.tsx', content);
}

function patchSuppliers() {
    let content = fs.readFileSync('src/pages/Suppliers.tsx', 'utf8');
    
    content = content.replace(
        /await updateDoc\(doc\(db, 'suppliers', editingSupplier\.id\), \{(.*?)\}\);/s,
        `const payload = {$1};
                await updateDoc(doc(db, 'suppliers', editingSupplier.id), payload);
                await LocalCache.updateCachedItem('suppliers', tenantId, { id: editingSupplier.id, ...payload });
                setSuppliers(prev => prev.map(s => s.id === editingSupplier.id ? { ...s, ...payload } : s));`
    );
    
    content = content.replace(
        /await addDoc\(collection\(db, 'suppliers'\), \{(.*?)\}\);/s,
        `const payload = {$1};
                const docRef = await addDoc(collection(db, 'suppliers'), payload);
                const newSupplier = { id: docRef.id, ...payload };
                await LocalCache.updateCachedItem('suppliers', tenantId, newSupplier);
                setSuppliers(prev => [newSupplier, ...prev]);`
    );
    
    content = content.replace(
        /const deletePromise = deleteDoc\(doc\(db, 'suppliers', supp\.id\)\);/s,
        `const deletePromise = deleteDoc(doc(db, 'suppliers', supp.id));
                await LocalCache.removeCachedItem('suppliers', appUser?.tenantId || 'single_store', supp.id);
                setSuppliers(prev => prev.filter(s => s.id !== supp.id));
                if (selectedSupplier?.id === supp.id) setSelectedSupplier(null);`
    );
    
    fs.writeFileSync('src/pages/Suppliers.tsx', content);
}

patchCustomers();
patchSuppliers();
console.log('Patched customers and suppliers');
