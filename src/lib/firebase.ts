import { initializeApp } from "firebase/app";
import { 
    getFirestore, 
    initializeFirestore, 
    memoryLocalCache, 
    persistentLocalCache, 
    persistentMultipleTabManager,
    CACHE_SIZE_UNLIMITED,
    onSnapshotsInSync
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { updateLastSyncTime } from "./syncTracker";

const app = initializeApp(firebaseConfig);

let dbInstance;

// We use persistence by default to satisfy the "local database" requirement.
// If persistence fails (e.g. in some iframe environments), we fall back to memory.
try {
    dbInstance = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
            cacheSizeBytes: CACHE_SIZE_UNLIMITED
        })
    }, firebaseConfig.firestoreDatabaseId);
    console.log("Firestore initialized with persistent local cache (Offline Support enabled).");

    // Global listener to track when snapshots are in sync with server
    onSnapshotsInSync(dbInstance, () => {
        if (window.navigator.onLine) {
            updateLastSyncTime();
        }
    });
} catch (e) {
    console.warn("Failed to initialize Firestore with persistent cache, falling back to memory cache:", e);
    try {
        dbInstance = initializeFirestore(app, {
            localCache: memoryLocalCache()
        }, firebaseConfig.firestoreDatabaseId);
    } catch (fallbackError) {
        console.error("Firestore initialization critical failure:", fallbackError);
        dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
}

export const db = dbInstance;
export const auth = getAuth(app);

// Error handling helper
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}
