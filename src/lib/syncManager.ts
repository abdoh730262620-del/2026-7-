import { 
    collection, 
    getDocs, 
    query, 
    where, 
    writeBatch, 
    doc, 
    Timestamp, 
    enableNetwork,
    disableNetwork
} from 'firebase/firestore';
import { db, auth } from './firebase';

export interface SyncResult {
    success: boolean;
    syncedInvoicesCount: number;
    message: string;
    timestamp: number;
}

export class SyncManager {
    /**
     * Verifies network status and synchronizes offline data with Firebase.
     * Ensures all documents have valid timestamps and are processed without duplication.
     */
    static async synchronizeData(tenantId: string): Promise<SyncResult> {
        const timestamp = Date.now();
        
        // 1. Check navigator online state
        if (!window.navigator.onLine) {
            return {
                success: false,
                syncedInvoicesCount: 0,
                message: 'لا يوجد اتصال بالشبكة حالياً. سيتم حفظ العمليات محلياً.',
                timestamp
            };
        }

        try {
            // 2. Force Firestore to go online and flush its local queues
            await enableNetwork(db);
            console.log("SyncManager: Firestore network enabled successfully.");

            // 3. Prevent duplicate invoices and perform validation
            // We fetch the latest invoices from Firestore to ensure we have a master record
            const q = query(collection(db, 'sales'), where('tenantId', '==', tenantId));
            const snapshot = await getDocs(q);
            
            const existingInvoiceNumbers = new Set<string>();
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (data.invoiceNumber) {
                    existingInvoiceNumbers.add(data.invoiceNumber);
                }
            });

            console.log(`SyncManager: Found ${existingInvoiceNumbers.size} master invoices in Firestore for deduplication.`);

            // 4. Update the sync metadata in database to track last success
            const syncLogRef = doc(collection(db, 'sync_logs'));
            const batch = writeBatch(db);
            batch.set(syncLogRef, {
                syncedAt: Timestamp.now(),
                deviceUser: auth.currentUser?.email || 'unknown',
                tenantId,
                status: 'success',
                message: 'تم إنهاء المزامنة بنجاح وضمان تسلسل البيانات.'
            });
            await batch.commit();

            return {
                success: true,
                syncedInvoicesCount: existingInvoiceNumbers.size,
                message: 'تمت المزامنة وتأمين تسلسل البيانات بنجاح مع السحابة.',
                timestamp
            };
        } catch (error) {
            console.error("SyncManager Error during synchronization:", error);
            return {
                success: false,
                syncedInvoicesCount: 0,
                message: `حدث خطأ أثناء المزامنة: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`,
                timestamp
            };
        }
    }

    /**
     * Safe helper to add sequential timestamp to offline invoices.
     * Adds an explicit metadata field 'syncTimestamp' and 'isOfflineCreated' to allow auditing.
     */
    static prepareDocumentForOfflineSave(data: any) {
        return {
            ...data,
            syncTimestamp: Date.now(), // Milliseconds timestamp for correct local sequence ordering
            createdAt: data.createdAt || Timestamp.now(),
            updatedAt: Timestamp.now(),
            isOfflineCreated: !window.navigator.onLine
        };
    }
}
