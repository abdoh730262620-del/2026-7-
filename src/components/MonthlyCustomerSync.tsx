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
            const generalCustomerName = `مبيعات يومية لشهر ${month} ${year}`;
            const cardsCustomerName = `سجل مبيعات يومية كروت لشهر ${month} ${year}`;
            
            const tenantId = appUser.tenantId || 'single_store';

            try {
                // Check if general monthly customer exists
                const qGeneral = query(
                    collection(db, 'customers'),
                    where('tenantId', '==', tenantId),
                    where('name', '==', generalCustomerName)
                );

                const snapGeneral = await getDocs(qGeneral);

                if (snapGeneral.empty) {
                    await addDoc(collection(db, 'customers'), {
                        name: generalCustomerName,
                        phone: '',
                        address: `تلقائي - ${month}/${year}`,
                        balance: 0,
                        tenantId,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        isMonthlySalesCustomer: true,
                        month,
                        year
                    });
                    console.log(`[Sync] Created general monthly customer: ${generalCustomerName}`);
                }

                // Check if cards monthly sales distributor/customer exists
                const qCardsDist = query(
                    collection(db, 'card_distributors'),
                    where('tenantId', '==', tenantId),
                    where('name', '==', cardsCustomerName)
                );

                const snapCardsDist = await getDocs(qCardsDist);

                if (snapCardsDist.empty) {
                    await addDoc(collection(db, 'card_distributors'), {
                        name: cardsCustomerName,
                        phone: '',
                        commission: 0,
                        balance: 0,
                        date: now.toISOString().split('T')[0],
                        tenantId,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        isMonthlySalesCustomer: true,
                        isCardMonthlySalesCustomer: true,
                        month,
                        year
                    });
                    console.log(`[Sync] Created cards monthly distributor: ${cardsCustomerName}`);
                }
            } catch (error) {
                console.error('[Sync] Error syncing monthly customer:', error);
            }
        };

        syncMonthlyCustomer();
    }, [appUser]);

    return null; // This component doesn't render anything
};
