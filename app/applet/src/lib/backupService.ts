export interface StoredBackup {
    id: string;
    filename: string;
    date: number;
    type: 'auto' | 'manual';
    data: Blob;
}

const DB_NAME = 'App_Backups_DB';
const STORE_NAME = 'backups';
const MAX_AUTO_BACKUPS = 7;

export async function initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveBackup(blob: Blob, type: 'auto' | 'manual', filename: string): Promise<void> {
    const db = await initDB();
    const backup: StoredBackup = {
        id: Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9),
        filename,
        date: Date.now(),
        type,
        data: blob
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(backup);

        tx.oncomplete = async () => {
            if (type === 'auto') {
                await cleanupAutoBackups();
            }
            resolve();
        };
        tx.onerror = () => reject(tx.error);
    });
}

export async function getBackups(): Promise<Omit<StoredBackup, 'data'>[]> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // Sort by date descending
            const backups = request.result.sort((a, b) => b.date - a.date);
            // exclude 'data' blob so we don't blow up memory for the list
            resolve(backups.map(b => ({
                id: b.id,
                filename: b.filename,
                date: b.date,
                type: b.type
            })));
        };
        request.onerror = () => reject(request.error);
    });
}

export async function getBackupData(id: string): Promise<Blob | null> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => {
            resolve(request.result ? request.result.data : null);
        };
        request.onerror = () => reject(request.error);
    });
}

export async function deleteBackup(id: string): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function cleanupAutoBackups(): Promise<void> {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const all = request.result;
            const autoBackups = all.filter(b => b.type === 'auto').sort((a, b) => b.date - a.date);
            
            if (autoBackups.length > MAX_AUTO_BACKUPS) {
                const toDelete = autoBackups.slice(MAX_AUTO_BACKUPS);
                const deleteTx = db.transaction(STORE_NAME, 'readwrite');
                const delStore = deleteTx.objectStore(STORE_NAME);
                toDelete.forEach(b => delStore.delete(b.id));
                deleteTx.oncomplete = () => resolve();
                deleteTx.onerror = () => reject(deleteTx.error);
            } else {
                resolve();
            }
        };
        request.onerror = () => reject(request.error);
    });
}
