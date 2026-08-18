import { initializeApp } from "firebase/app";
import { 
    getFirestore, 
    initializeFirestore, 
    memoryLocalCache, 
    persistentLocalCache, 
    persistentMultipleTabManager,
    CACHE_SIZE_UNLIMITED,
    onSnapshotsInSync,
    disableNetwork,
    enableNetwork,
    terminate
} from "firebase/firestore";
import { getAuth, setPersistence, indexedDBLocalPersistence } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { updateLastSyncTime } from "./syncTracker";
import { ErrorNotifier } from "./errorNotifier";

const app = initializeApp(firebaseConfig);

let dbInstance: any;

function setupNetworkSync(dbRef: any) {
    if (!dbRef) return;

    const handleNetworkChange = () => {
        if (window.navigator.onLine) {
            console.log("App is online. Enabling Firestore network...");
            enableNetwork(dbRef).catch(err => console.warn("Failed to enable Firestore network:", err));
        } else {
            console.log("App is offline. Disabling Firestore network...");
            disableNetwork(dbRef).catch(err => console.warn("Failed to disable Firestore network:", err));
        }
    };

    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    // Initial check on startup
    if (!window.navigator.onLine) {
        console.log("App is initially offline. Disabling Firestore network...");
        disableNetwork(dbRef).catch(err => console.warn("Failed to initially disable Firestore network:", err));
    }
}

// We use persistence by default to satisfy the "local database" requirement.
// We prefer persistentLocalCache without the multiple tab manager because multiple tab coordination (Web Locks/IndexedDB locks)
// is highly unstable and throws internal assertion failures (e.g., ID: ca9 / ID: b815) in sandboxed or partitioned browser environments.
let isIframe = false;
if (typeof window !== 'undefined') {
    try {
        isIframe = window.self !== window.top;
    } catch (e) {
        isIframe = true;
    }
}
const useMemoryCache = isIframe || (typeof window !== 'undefined' && sessionStorage.getItem('firestore_use_memory_cache') === 'true');

if (useMemoryCache) {
    if (isIframe) {
        console.log("Firestore initializing with memoryLocalCache because the application is running inside a sandboxed iframe.");
    } else {
        console.log("Firestore initializing with memoryLocalCache due to previous persistent cache assertion.");
    }
    try {
        dbInstance = initializeFirestore(app, {
            localCache: memoryLocalCache()
        }, firebaseConfig.firestoreDatabaseId);
    } catch (e) {
        dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
    setupNetworkSync(dbInstance);
} else {
    try {
        dbInstance = initializeFirestore(app, {
            localCache: persistentLocalCache({
                cacheSizeBytes: CACHE_SIZE_UNLIMITED
            }),
            experimentalForceLongPolling: false
        }, firebaseConfig.firestoreDatabaseId);
        console.log("Firestore initialized with stable persistent local cache.");
        setupNetworkSync(dbInstance);
    } catch (e) {
        console.warn("Failed to initialize Firestore with persistent cache, falling back to memoryLocalCache:", e);
        try {
            dbInstance = initializeFirestore(app, {
                localCache: memoryLocalCache()
            }, firebaseConfig.firestoreDatabaseId);
            setupNetworkSync(dbInstance);
        } catch (fallbackError) {
            console.error("Firestore initialization fallback failure:", fallbackError);
            dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
        }
    }
}

export const db = dbInstance;
export const auth = getAuth(app);

// Set persistence to indexedDBLocalPersistence to avoid session conflicts in multi-tab/iframe environments
setPersistence(auth, indexedDBLocalPersistence).catch(err => {
    console.error("Auth persistence setup failed:", err);
});

// Graceful cache clear helper using native browser indexedDB deletion
export async function clearFirestoreCache() {
  try {
    console.log("Clearing Firestore local cache...");
    if (dbInstance) {
      await terminate(dbInstance);
    }
    
    // Natively find and delete any IndexedDB databases matching 'firestore'
    if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
      const dbs = await window.indexedDB.databases();
      for (const database of dbs) {
        if (database.name && database.name.toLowerCase().includes('firestore')) {
          console.log("Deleting IndexedDB database:", database.name);
          window.indexedDB.deleteDatabase(database.name);
        }
      }
    } else if (window.indexedDB) {
      // Fallback: delete common database names if databases() is not available
      const commonDbNames = [
        `firestore/[DEFAULT]/${firebaseConfig.projectId}/main`,
        `firestore/[DEFAULT]/${firebaseConfig.projectId}`
      ];
      for (const name of commonDbNames) {
        window.indexedDB.deleteDatabase(name);
      }
    }
    console.log("Firestore local cache cleared successfully.");
  } catch (err) {
    console.warn("Failed to clear Firestore cache:", err);
  }
}

// Error handling helper
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code;
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: (auth.currentUser as any)?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  // If the error indicates a network offline state or unavailable service,
  // we do not throw an exception. We log it gracefully so Firestore can continue offline.
  if (errCode === 'unavailable' || errorMessage.includes('unavailable') || errorMessage.includes('Could not reach Cloud Firestore backend')) {
    console.warn('Firestore is running in Offline Mode (Network Unavailable): ', JSON.stringify(errInfo));
    return; // Silent failover - let Firestore use local persistent cache
  }

  // Gracefully handle "Target ID already exists" errors to avoid crashing the app
  if (errCode === 'already-exists' || errorMessage.includes('already-exists') || errorMessage.includes('Target ID already exists')) {
    console.warn('Firestore Target ID conflict handled gracefully (ignored to prevent crash): ', JSON.stringify(errInfo));
    return; // Silent failover / ignore target conflict so the SyncEngine can auto-recover
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  try {
    ErrorNotifier.notify(
      'خطأ في قاعدة البيانات (Firestore)',
      `حدث خطأ أثناء تنفيذ عملية (${operationType}) على ${path || 'المجموعة'}.`,
      errorMessage,
      'firebase',
      'قاعدة البيانات السحابية'
    );
  } catch (e) {
    console.warn('Failed to notify error notifier:', e);
  }
}

// Global Exception Interceptors to capture and silence internal Firestore errors in iframe environments
if (typeof window !== 'undefined') {
    const isSuppressedError = (str: string) => {
        const lower = str.toLowerCase();
        return lower.includes('already-exists') || 
               lower.includes('target id already exists') || 
               lower.includes('unexpected state') ||
               lower.includes('internal assertion failed') ||
               lower.includes('id: ca9') ||
               lower.includes('id: b815');
    };

    const handleSuppressed = (source: string) => {
        console.warn(`[Firestore Safe Guard] Suppressed internal assertion conflict from ${source}. Switching fallback to memory cache.`);
        try {
            sessionStorage.setItem('firestore_use_memory_cache', 'true');
        } catch (e) {
            // ignore storage quota errors
        }
    };

    const originalConsoleError = console.error;
    console.error = function (...args: any[]) {
        const fullText = args.map(a => typeof a === 'object' ? (a?.message || a?.stack || String(a)) : String(a)).join(' ');
        if (isSuppressedError(fullText)) {
            handleSuppressed('console.error');
            console.warn('[Firestore Internal Assertion Warn]:', ...args);
            return;
        }
        originalConsoleError.apply(console, args);
    };

    const handleGlobalError = (event: ErrorEvent) => {
        const msg = event.message ? String(event.message) : '';
        const errorStr = event.error ? String(event.error) : '';
        if (isSuppressedError(msg) || isSuppressedError(errorStr)) {
            handleSuppressed('window.error');
            event.preventDefault();
            event.stopPropagation();
        }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason ? String(event.reason) : '';
        if (isSuppressedError(reason)) {
            handleSuppressed('unhandledrejection');
            event.preventDefault();
            event.stopPropagation();
        }
    };

    window.addEventListener('error', handleGlobalError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);
}
