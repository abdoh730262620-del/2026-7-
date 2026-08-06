import { collection, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';

export const logUserAction = async (action: string, details: string) => {
    const appUser = useAuthStore.getState().appUser;
    const user = useAuthStore.getState().user;
    if (!user) return;

    const tenantId = appUser?.tenantId || 'single_store';

    try {
        await addDoc(collection(db, 'logs'), {
            date: Date.now(),
            action,
            details,
            userId: user.uid,
            userName: appUser?.name || user.email || 'مجهول',
            tenantId
        });
    } catch (error) {
        console.error("Failed to log action:", error);
    }
};
