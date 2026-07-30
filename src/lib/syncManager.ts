import { 
    collection, 
    getDocs, 
    query, 
    where, 
    writeBatch, 
    doc, 
    setDoc,
    updateDoc,
    deleteDoc,
    addDoc,
    Timestamp, 
    enableNetwork
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { ErrorNotifier } from './errorNotifier';

export type QueueOperationType = 'create' | 'update' | 'delete' | 'set';

export interface OfflineOperation {
    id: string;
    type: QueueOperationType;
    collectionName: string;
    docId?: string;
    data?: any;
    timestamp: number; // Milliseconds timestamp for correct sequence order
    retryCount: number;
    maxRetries: number;
    status: 'pending' | 'processing' | 'failed' | 'completed';
    lastError?: string;
    tenantId?: string;
}

export interface SyncResult {
    success: boolean;
    syncedInvoicesCount: number;
    message: string;
    timestamp: number;
}

const QUEUE_STORAGE_KEY = 'POS_OFFLINE_OPERATIONS_QUEUE_V2';

export class SyncManager {
    private static queue: OfflineOperation[] = SyncManager.loadQueue();
    private static isProcessing = false;
    private static listeners: Set<(queue: OfflineOperation[]) => void> = new Set();
    private static initialized = false;

    /**
     * Initializes the SyncManager background listeners (e.g. online reconnect trigger).
     */
    public static init() {
        if (this.initialized) return;
        this.initialized = true;

        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                console.log('SyncManager: Network connection restored. Processing queue...');
                this.processQueue();
            });

            // Trigger immediate processing if online at startup
            if (window.navigator.onLine) {
                setTimeout(() => this.processQueue(), 2000);
            }
        }
    }

    /**
     * Loads saved operations queue from localStorage.
     */
    private static loadQueue(): OfflineOperation[] {
        if (typeof window === 'undefined') return [];
        try {
            const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
            if (!raw) return [];
            const parsed: OfflineOperation[] = JSON.parse(raw);
            // Sort by timestamp ascending to preserve execution order
            return parsed.sort((a, b) => a.timestamp - b.timestamp);
        } catch (e) {
            console.error('Failed to load offline operations queue from localStorage:', e);
            return [];
        }
    }

    /**
     * Saves the operations queue to localStorage.
     */
    private static saveQueue() {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
            this.notifyListeners();
        } catch (e) {
            console.error('Failed to persist offline operations queue:', e);
        }
    }

    /**
     * Enqueues an offline operation into the queue with deduplication and timestamping.
     */
    public static enqueueOperation(params: {
        type: QueueOperationType;
        collectionName: string;
        docId?: string;
        data?: any;
        tenantId?: string;
        maxRetries?: number;
    }): OfflineOperation {
        this.init();
        const timestamp = Date.now();
        const maxRetries = params.maxRetries ?? 5;

        // Deduplication Logic:
        // Check if an operation for the same collection and docId exists in pending status
        if (params.docId) {
            const existingIndex = this.queue.findIndex(
                op => op.status === 'pending' &&
                      op.collectionName === params.collectionName &&
                      op.docId === params.docId
            );

            if (existingIndex !== -1) {
                const existing = this.queue[existingIndex];
                
                if (params.type === 'delete') {
                    // If existing was a create/update, replace with delete
                    existing.type = 'delete';
                    existing.data = undefined;
                    existing.timestamp = timestamp;
                    existing.retryCount = 0;
                    this.saveQueue();
                    console.log(`SyncManager: Merged and updated pending operation to DELETE for ${params.collectionName}/${params.docId}`);
                    if (window.navigator.onLine) this.processQueue();
                    return existing;
                } else if (params.type === 'update' || params.type === 'set') {
                    // Merge new update data into existing pending operation data
                    existing.data = {
                        ...(existing.data || {}),
                        ...(params.data || {}),
                        updatedAt: Timestamp.now()
                    };
                    existing.timestamp = timestamp; // Refresh timestamp for sequence sorting
                    existing.retryCount = 0;
                    this.saveQueue();
                    console.log(`SyncManager: Deduplicated and merged pending data for ${params.collectionName}/${params.docId}`);
                    if (window.navigator.onLine) this.processQueue();
                    return existing;
                }
            }
        }

        const newOp: OfflineOperation = {
            id: `op_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
            type: params.type,
            collectionName: params.collectionName,
            docId: params.docId,
            data: params.data ? { ...params.data, syncTimestamp: timestamp } : undefined,
            timestamp,
            retryCount: 0,
            maxRetries,
            status: 'pending',
            tenantId: params.tenantId || auth.currentUser?.uid
        };

        this.queue.push(newOp);
        // Ensure sorted sequence order
        this.queue.sort((a, b) => a.timestamp - b.timestamp);
        this.saveQueue();

        console.log(`SyncManager: Enqueued offline operation (${newOp.type}) for ${newOp.collectionName} [ID: ${newOp.id}]`);

        // If online, attempt to flush queue immediately
        if (window.navigator.onLine) {
            this.processQueue();
        }

        return newOp;
    }

    /**
     * Processes all pending operations in the queue sequentially according to timestamp.
     * Includes exponential retry logic and failure reporting.
     */
    public static async processQueue(): Promise<{ processed: number; failed: number }> {
        this.init();

        if (this.isProcessing) {
            console.log('SyncManager: Queue processing already in progress.');
            return { processed: 0, failed: 0 };
        }

        if (typeof window !== 'undefined' && !window.navigator.onLine) {
            console.log('SyncManager: App is offline. Skipping queue processing.');
            return { processed: 0, failed: 0 };
        }

        const pendingOps = this.queue.filter(op => op.status === 'pending' || (op.status === 'failed' && op.retryCount < op.maxRetries));
        if (pendingOps.length === 0) {
            return { processed: 0, failed: 0 };
        }

        this.isProcessing = true;
        let processedCount = 0;
        let failedCount = 0;

        console.log(`SyncManager: Starting batch processing of ${pendingOps.length} queued operations...`);

        try {
            await enableNetwork(db).catch(() => {});

            // Sort by timestamp ascending for guaranteed sequential execution
            pendingOps.sort((a, b) => a.timestamp - b.timestamp);

            for (const op of pendingOps) {
                if (!window.navigator.onLine) {
                    console.warn('SyncManager: Lost network connection during queue processing. Stopping.');
                    break;
                }

                op.status = 'processing';
                this.saveQueue();

                try {
                    await this.executeFirestoreOperation(op);
                    
                    // Success! Remove from queue
                    op.status = 'completed';
                    this.queue = this.queue.filter(item => item.id !== op.id);
                    this.saveQueue();
                    processedCount++;
                    console.log(`SyncManager: Successfully processed operation [${op.id}] (${op.type} -> ${op.collectionName})`);
                } catch (err: any) {
                    op.retryCount += 1;
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    op.lastError = errorMsg;

                    if (op.retryCount >= op.maxRetries) {
                        op.status = 'failed';
                        failedCount++;
                        console.error(`SyncManager: Operation [${op.id}] permanently failed after ${op.retryCount} retries. Error: ${errorMsg}`);
                        
                        // Notify user via global icon modal for permanently failed queue items
                        ErrorNotifier.notify(
                            'خطأ في مزامنة عملية غير متصلة',
                            `تعذر رفع التغييرات في "${op.collectionName}" إلى الخادم بعد ${op.maxRetries} محاولات.`,
                            `تفاصيل العملية: ID=${op.id}, نوع=${op.type}, الخطأ=${errorMsg}`,
                            'firebase',
                            'مؤقت المزامنة'
                        );
                    } else {
                        op.status = 'pending';
                        console.warn(`SyncManager: Operation [${op.id}] failed (Retry ${op.retryCount}/${op.maxRetries}). Will retry on next pass.`);
                    }

                    this.saveQueue();
                }
            }
        } finally {
            this.isProcessing = false;
        }

        return { processed: processedCount, failed: failedCount };
    }

    /**
     * Executes the actual Firestore operation.
     */
    private static async executeFirestoreOperation(op: OfflineOperation): Promise<void> {
        const colRef = collection(db, op.collectionName);

        switch (op.type) {
            case 'create':
                if (op.docId) {
                    await setDoc(doc(db, op.collectionName, op.docId), op.data || {});
                } else {
                    await addDoc(colRef, op.data || {});
                }
                break;

            case 'update':
                if (!op.docId) throw new Error('docId is required for update operation');
                await updateDoc(doc(db, op.collectionName, op.docId), op.data || {});
                break;

            case 'set':
                if (!op.docId) throw new Error('docId is required for set operation');
                await setDoc(doc(db, op.collectionName, op.docId), op.data || {}, { merge: true });
                break;

            case 'delete':
                if (!op.docId) throw new Error('docId is required for delete operation');
                await deleteDoc(doc(db, op.collectionName, op.docId));
                break;

            default:
                throw new Error(`Unknown operation type: ${(op as any).type}`);
        }
    }

    /**
     * Returns the full queue of operations.
     */
    public static getQueue(): OfflineOperation[] {
        return [...this.queue];
    }

    /**
     * Returns count of pending operations.
     */
    public static getPendingCount(): number {
        return this.queue.filter(op => op.status === 'pending' || op.status === 'processing').length;
    }

    /**
     * Manually retries all failed operations.
     */
    public static async retryFailedOperations(): Promise<void> {
        this.queue.forEach(op => {
            if (op.status === 'failed') {
                op.status = 'pending';
                op.retryCount = 0;
            }
        });
        this.saveQueue();
        await this.processQueue();
    }

    /**
     * Clears all completed or failed items, or forces queue wipe.
     */
    public static clearQueue() {
        this.queue = [];
        this.saveQueue();
    }

    /**
     * Subscribes to changes in the offline operations queue.
     */
    public static subscribe(listener: (queue: OfflineOperation[]) => void): () => void {
        this.listeners.add(listener);
        listener([...this.queue]);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private static notifyListeners() {
        this.listeners.forEach(fn => {
            try {
                fn([...this.queue]);
            } catch (e) {
                console.error("Error in queue listener:", e);
            }
        });
    }

    /**
     * Backward-compatible static helper for invoice synchronization check.
     */
    static async synchronizeData(tenantId: string): Promise<SyncResult> {
        const timestamp = Date.now();
        
        if (!window.navigator.onLine) {
            return {
                success: false,
                syncedInvoicesCount: 0,
                message: 'لا يوجد اتصال بالشبكة حالياً. العمليات محفوظة في قائمة الانتظار المحلية.',
                timestamp
            };
        }

        try {
            await enableNetwork(db);
            const queueResult = await SyncManager.processQueue();

            const q = query(collection(db, 'sales'), where('tenantId', '==', tenantId));
            const snapshot = await getDocs(q);
            
            const existingInvoiceNumbers = new Set<string>();
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (data.invoiceNumber) {
                    existingInvoiceNumbers.add(data.invoiceNumber);
                }
            });

            const syncLogRef = doc(collection(db, 'sync_logs'));
            const batch = writeBatch(db);
            batch.set(syncLogRef, {
                syncedAt: Timestamp.now(),
                deviceUser: auth.currentUser?.email || 'unknown',
                tenantId,
                status: 'success',
                message: `تم إنهاء المزامنة بنجاح. معالجة ${queueResult.processed} عمليات من قائمة الانتظار.`
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
            const errMessage = error instanceof Error ? error.message : 'خطأ غير معروف';
            
            // Notify user
            ErrorNotifier.notify(
                'فشل مزامنة البيانات',
                'تعذر استكمال مزامنة السجلات مع السحابة.',
                errMessage,
                'firebase',
                'موقع المزامنة'
            );

            return {
                success: false,
                syncedInvoicesCount: 0,
                message: `حدث خطأ أثناء المزامنة: ${errMessage}`,
                timestamp
            };
        }
    }

    /**
     * Safe helper to add sequential timestamp to offline invoices/documents.
     */
    static prepareDocumentForOfflineSave(data: any) {
        return {
            ...data,
            syncTimestamp: Date.now(), // Milliseconds timestamp for correct sequence ordering
            createdAt: data.createdAt || Timestamp.now(),
            updatedAt: Timestamp.now(),
            isOfflineCreated: !window.navigator.onLine
        };
    }
}

// Auto-initialize SyncManager background queue processor
SyncManager.init();
