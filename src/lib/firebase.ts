import { initializeApp } from "firebase/app";
import { 
    getFirestore, 
    initializeFirestore, 
    memoryLocalCache, 
    persistentLocalCache, 
    persistentSingleTabManager,
    CACHE_SIZE_UNLIMITED,
    onSnapshotsInSync,
    disableNetwork,
    enableNetwork,
    terminate
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { updateLastSyncTime } from "./syncTracker";
import { ErrorNotifier } from "./errorNotifier";

const app = initializeApp(firebaseConfig);

let dbInstance: any;

function setupNetworkSync(dbRef: any) {
    if (!dbRef) return;

    try {
        // Global listener to track when snapshots are in sync with server
        onSnapshotsInSync(dbRef, () => {
            if (window.navigator.onLine) {
                updateLastSyncTime();
            }
        });
    } catch (e) {
        console.warn("onSnapshotsInSync listener setup failed:", e);
    }

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
// If persistence fails (e.g. in some iframe environments), we fall back to memory.
try {
    dbInstance = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentSingleTabManager({ forceOwningTab: true } as any),
            cacheSizeBytes: CACHE_SIZE_UNLIMITED
        }),
        experimentalForceLongPolling: true
    }, firebaseConfig.firestoreDatabaseId);
    console.log("Firestore initialized with persistent single tab local cache (forceOwningTab: true) and experimentalForceLongPolling.");
    setupNetworkSync(dbInstance);
} catch (e) {
    console.warn("Failed to initialize Firestore with persistent cache, trying fallback with experimentalForceLongPolling:", e);
    try {
        dbInstance = initializeFirestore(app, {
            experimentalForceLongPolling: true
        }, firebaseConfig.firestoreDatabaseId);
        setupNetworkSync(dbInstance);
    } catch (fallbackError) {
        console.error("Firestore initialization fallback failure:", fallbackError);
        dbInstance = getFirestore(app);
    }
}

export const db = dbInstance;
export const auth = getAuth(app);

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
  ErrorNotifier.notify(
    'خطأ في قاعدة البيانات (Firestore)',
    `حدث خطأ أثناء تنفيذ عملية (${operationType}) على ${path || 'المجموعة'}.`,
    errorMessage,
    'firebase',
    'قاعدة البيانات السحابية'
  );
  throw new Error(JSON.stringify(errInfo));
}

// Global Exception Interceptors to capture and silence "Target ID already exists" errors in iframe environments
if (typeof window !== 'undefined') {
    const isTargetIdConflict = (str: string) => {
        return str.includes('already-exists') || 
               str.includes('Target ID already exists') || 
               str.includes('code=already-exists') || 
               str.includes('Uncaught Error: {"error":"Target ID already exists:');
    };

    const handleGlobalError = (event: ErrorEvent) => {
        const msg = event.message ? String(event.message) : '';
        const errorStr = event.error ? String(event.error) : '';
        if (isTargetIdConflict(msg) || isTargetIdConflict(errorStr)) {
            console.warn('Caught and suppressed persistent Firestore Target ID conflict in global error handler to prevent application crash.');
            event.preventDefault();
            event.stopPropagation();
        }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason ? String(event.reason) : '';
        if (isTargetIdConflict(reason)) {
            console.warn('Caught and suppressed persistent Firestore Target ID conflict in global unhandled rejection handler to prevent application crash.');
            event.preventDefault();
            event.stopPropagation();
        }
    };

    window.addEventListener('error', handleGlobalError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);
}
