import React, { useEffect } from 'react';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';

export const MonthlyCustomerSync: React.FC = () => {
    const { appUser } = useAuthStore();

    useEffect(() => {
        const syncMonthlyCustomer = async () => {
            if (!appUser) return;

            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();
            const customerName = `مبيعات يومية لشهر ${month} ${year}`;
            
            const tenantId = appUser.tenantId || (appUser.role === 'admin' ? appUser.uid : 'admin_initial');

            try {
                // Check if this customer already exists for this tenant
                const q = query(
                    collection(db, 'customers'),
                    where('tenantId', '==', tenantId),
                    where('name', '==', customerName)
                );

                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    // Create the customer
                    await addDoc(collection(db, 'customers'), {
                        name: customerName,
                        phone: '',
                        address: `تلقائي - ${month}/${year}`,
                        balance: 0,
                        tenantId,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        isMonthlySalesCustomer: true, // Tag it for internal use if needed
                        month,
                        year
                    });
                    console.log(`[Sync] Created monthly customer: ${customerName}`);
                }

                // Check if this customer already exists as a distributor for network cards
                const qDist = query(
                    collection(db, 'card_distributors'),
                    where('tenantId', '==', tenantId),
                    where('name', '==', customerName)
                );

                const querySnapshotDist = await getDocs(qDist);

                if (querySnapshotDist.empty) {
                    // Create the distributor
                    await addDoc(collection(db, 'card_distributors'), {
                        name: customerName,
                        phone: '',
                        commission: 0,
                        balance: 0,
                        date: now.toISOString().split('T')[0],
                        tenantId,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        isMonthlySalesCustomer: true,
                        month,
                        year
                    });
                    console.log(`[Sync] Created monthly distributor: ${customerName}`);
                }
            } catch (error) {
                console.error('[Sync] Error syncing monthly customer:', error);
            }
        };

        syncMonthlyCustomer();
    }, [appUser]);

    return null; // This component doesn't render anything
};
