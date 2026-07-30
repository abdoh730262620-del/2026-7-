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
    enableNetwork
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { updateLastSyncTime } from "./syncTracker";
import { ErrorNotifier } from "./errorNotifier";

const app = initializeApp(firebaseConfig);

let dbInstance;

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
            tabManager: persistentMultipleTabManager(),
            cacheSizeBytes: CACHE_SIZE_UNLIMITED
        })
    }, firebaseConfig.firestoreDatabaseId);
    console.log("Firestore initialized with persistent local cache (Offline Support enabled).");
    setupNetworkSync(dbInstance);
} catch (e) {
    console.warn("Failed to initialize Firestore with persistent cache, falling back to memory cache:", e);
    try {
        dbInstance = initializeFirestore(app, {
            localCache: memoryLocalCache()
        }, firebaseConfig.firestoreDatabaseId);
        setupNetworkSync(dbInstance);
    } catch (fallbackError) {
        console.error("Firestore initialization critical failure:", fallbackError);
        dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
        setupNetworkSync(dbInstance);
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
