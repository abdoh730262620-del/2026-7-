
export const SYNC_TIMESTAMP_KEY = 'last_successful_sync_timestamp';

export function updateLastSyncTime() {
    localStorage.setItem(SYNC_TIMESTAMP_KEY, Date.now().toString());
}

export function getLastSyncTime(): number {
    const stored = localStorage.getItem(SYNC_TIMESTAMP_KEY);
    return stored ? parseInt(stored, 10) : Date.now();
}

export function getDaysSinceLastSync(): number {
    const lastSync = getLastSyncTime();
    const diff = Date.now() - lastSync;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}
