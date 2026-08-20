import { collection, getDocs, query, DocumentData, Query } from 'firebase/firestore';
import { db } from './firebase';
import localforage from 'localforage';

export interface CacheMetadata {
    lastUpdated: number; // timestamp in ms
    version: number;
}

const CACHE_VERSION = 1;
// Default cache lifetime is 15 minutes (900,000 ms)
const DEFAULT_CACHE_LIFETIME = 15 * 60 * 1000;

export class LocalCache {
    /**
     * Load cached data for a specific collection and tenant
     */
    public static async get<T>(collectionName: string, tenantId: string): Promise<T[] | null> {
        const key = `pos_cache_${tenantId}_${collectionName}`;
        try {
            const raw = await localforage.getItem<string>(key);
            if (!raw) return null;
            return JSON.parse(raw) as T[];
        } catch (e) {
            console.error(`LocalCache: Failed to parse cache for ${collectionName}:`, e);
            return null;
        }
    }

    /**
     * Save data to cache for a specific collection and tenant
     */
    public static async set<T>(collectionName: string, tenantId: string, data: T[]): Promise<void> {
        const key = `pos_cache_${tenantId}_${collectionName}`;
        const metaKey = `${key}_meta`;

        try {
            await localforage.setItem(key, JSON.stringify(data));
            
            const metadata: CacheMetadata = {
                lastUpdated: Date.now(),
                version: CACHE_VERSION
            };
            await localforage.setItem(metaKey, JSON.stringify(metadata));
        } catch (e) {
            console.error(`LocalCache: Failed to save cache for ${collectionName}:`, e);
        }
    }

    /**
     * Get the cache metadata (like when it was last updated)
     */
    public static async getMetadata(collectionName: string, tenantId: string): Promise<CacheMetadata | null> {
        const key = `pos_cache_${tenantId}_${collectionName}_meta`;
        try {
            const raw = await localforage.getItem<string>(key);
            if (!raw) return null;
            return JSON.parse(raw) as CacheMetadata;
        } catch (e) {
            return null;
        }
    }

    /**
     * Determine if cache for collection is expired
     */
    public static async isExpired(collectionName: string, tenantId: string, lifetimeMs = DEFAULT_CACHE_LIFETIME): Promise<boolean> {
        const meta = await this.getMetadata(collectionName, tenantId);
        if (!meta) return true;
        return Date.now() - meta.lastUpdated > lifetimeMs;
    }

    /**
     * Clear cache for a specific tenant or all cache
     */
    public static async clear(tenantId?: string): Promise<void> {
        try {
            const keys = await localforage.keys();
            const prefix = tenantId ? `pos_cache_${tenantId}_` : 'pos_cache_';
            
            const keysToRemove = keys.filter(key => key.startsWith(prefix));
            await Promise.all(keysToRemove.map(key => localforage.removeItem(key)));
            
            console.log(`LocalCache: Cleared cache with prefix "${prefix}"`);
        } catch (e) {
            console.error('LocalCache: Failed to clear cache:', e);
        }
    }

    /**
     * Calculate total size of local cache in bytes
     */
    public static async getCacheSize(tenantId?: string): Promise<number> {
        try {
            const keys = await localforage.keys();
            const prefix = tenantId ? `pos_cache_${tenantId}_` : 'pos_cache_';
            let totalBytes = 0;
            
            const keysToMeasure = keys.filter(key => key.startsWith(prefix));
            
            // Fetch all items simultaneously and sum their string lengths
            const values = await Promise.all(keysToMeasure.map(key => localforage.getItem<string>(key)));
            values.forEach(val => {
                if (val) {
                    // Blob gives us the accurate byte size of the string
                    totalBytes += new Blob([val]).size;
                }
            });
            
            return totalBytes;
        } catch (e) {
            console.error('LocalCache: Failed to calculate cache size:', e);
            return 0;
        }
    }

    /**
     * Fetch collection data helper - checks cache first, falls back to Firestore
     */
    public static async fetchCollection<T>(
        collectionName: string,
        tenantId: string,
        firestoreQuery: Query<DocumentData>,
        options: { forceRefresh?: boolean; lifetimeMs?: number } = {}
    ): Promise<{ data: T[]; source: 'cache' | 'firestore'; lastUpdated: number }> {
        const force = options.forceRefresh ?? false;
        const expired = await this.isExpired(collectionName, tenantId, options.lifetimeMs);
        const cachedData = await this.get<T>(collectionName, tenantId);

        // Return cache if it is still valid and we are not forcing a refresh
        if (cachedData && !expired && !force) {
            const meta = await this.getMetadata(collectionName, tenantId);
            return {
                data: cachedData,
                source: 'cache',
                lastUpdated: meta?.lastUpdated || Date.now()
            };
        }

        // Otherwise fetch from firestore
        try {
            console.log(`LocalCache: Fetching "${collectionName}" from Firestore for tenant "${tenantId}"...`);
            const snapshot = await getDocs(firestoreQuery);
            const data: T[] = [];
            snapshot.forEach(docObj => {
                data.push({ id: docObj.id, ...docObj.data() } as any);
            });

            // Save to local cache
            await this.set(collectionName, tenantId, data);
            
            return {
                data,
                source: 'firestore',
                lastUpdated: Date.now()
            };
        } catch (error) {
            console.error(`LocalCache: Failed to fetch "${collectionName}" from firestore, returning cache fallback if available:`, error);
            if (cachedData) {
                const meta = await this.getMetadata(collectionName, tenantId);
                return {
                    data: cachedData,
                    source: 'cache',
                    lastUpdated: meta?.lastUpdated || Date.now()
                };
            }
            throw error;
        }
    }

    /**
     * Add or update an item in the local cache immediately (e.g. after local creation)
     * This avoids needing to reload the entire collection from Firestore!
     */
    public static async updateCachedItem<T extends { id: string }>(
        collectionName: string,
        tenantId: string,
        item: T
    ): Promise<void> {
        const cached = await this.get<T>(collectionName, tenantId) || [];
        const index = cached.findIndex(x => x.id === item.id);
        if (index !== -1) {
            cached[index] = { ...cached[index], ...item };
        } else {
            cached.unshift(item); // Add to the top of list
        }
        await this.set(collectionName, tenantId, cached);
    }

    /**
     * Delete an item from local cache immediately (e.g. after deletion)
     */
    public static async removeCachedItem<T extends { id: string }>(
        collectionName: string,
        tenantId: string,
        itemId: string
    ): Promise<void> {
        const cached = await this.get<T>(collectionName, tenantId);
        if (!cached) return;
        const filtered = cached.filter(x => x.id !== itemId);
        await this.set(collectionName, tenantId, filtered);
    }
}
