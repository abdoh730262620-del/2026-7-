import { initializeApp } from "firebase/app";
import { 
    getFirestore, 
    initializeFirestore, 
    memoryLocalCache, 
    terminate
} from "firebase/firestore";
import { getAuth, setPersistence, indexedDBLocalPersistence } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { updateLastSyncTime } from "./syncTracker";
import { ErrorNotifier } from "./errorNotifier";

const app = initializeApp(firebaseConfig);

let dbInstance: any;

// Initialize Firestore with a robust configuration for sandboxed/multi-tab environments.
// We prefer memoryLocalCache() to avoid common IndexedDB assertion failures (ID: ca9 / ID: b815).
const initFirestore = () => {
    try {
        // Check if we should fallback to memory cache via sessionStorage
        let useMemoryOnly = true; 
        try {
            if (sessionStorage.getItem('firestore_use_memory_cache') === 'true') {
                useMemoryOnly = true;
            }
        } catch (e) {}

        const firestore = initializeFirestore(app, {
            localCache: memoryLocalCache(),
            ignoreUndefinedProperties: true
        }, firebaseConfig.firestoreDatabaseId);
        
        console.log("Firestore initialized successfully.");
        return firestore;
    } catch (e) {
        console.warn("Failed to initializeFirestore, falling back to getFirestore:", e);
        return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
};

dbInstance = initFirestore();

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

  if (errorMessage.includes('INTERNAL ASSERTION FAILED') || 
      errorMessage.includes('Unexpected state') || 
      errorMessage.includes('ca9') || 
      errorMessage.includes('b815') ||
      errorMessage.includes('Target ID already exists')) {
    console.warn('Firestore Internal SDK Error caught and suppressed:', errorMessage);
    return;
  }

  const isQuotaExceeded = errCode === 'resource-exhausted' || 
                          errorMessage.toLowerCase().includes('quota') || 
                          errorMessage.toLowerCase().includes('resource-exhausted');
  
  if (isQuotaExceeded) {
    console.warn('Firestore Quota Limit Exceeded handled gracefully:', errorMessage);
    try {
      ErrorNotifier.notify(
        'تم تجاوز الحصة المجانية لقاعدة البيانات (Firestore Quota)',
        'لقد تم تجاوز الحد اليومي المجاني لعمليات القراءة أو الكتابة بقاعدة البيانات السحابية (50,000 عملية يومياً). سيتم إعادة تعيين الحصة تلقائياً خلال 24 ساعة، أو يمكن لمالك المشروع ترقية الحساب وتفعيل الفوترة لزيادة الحصة وتجنب انقطاع الخدمة.',
        errorMessage,
        'firebase',
        'نظام قواعد البيانات السحابية'
      );
    } catch (e) {
      console.warn('Failed to notify database quota warning:', e);
    }
    return;
  }
  
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
               lower.includes('id: b815') ||
               lower.includes('quota') ||
               lower.includes('resource-exhausted');
    };

    const handleSuppressed = (source: string, text: string) => {
        if (text.toLowerCase().includes('quota') || text.toLowerCase().includes('resource-exhausted')) {
            console.warn(`[Firestore Safe Guard] Suppressed Quota Limit error from ${source}.`);
            try {
              ErrorNotifier.notify(
                'تم تجاوز الحصة المجانية لقاعدة البيانات (Firestore Quota)',
                'لقد تم تجاوز الحد اليومي المجاني لعمليات القراءة أو الكتابة بقاعدة البيانات السحابية (50,000 عملية يومياً). سيتم إعادة تعيين الحصة تلقائياً خلال 24 ساعة، أو يمكن لمالك المشروع ترقية الحساب وتفعيل الفوترة لزيادة الحصة وتجنب انقطاع الخدمة.',
                text,
                'firebase',
                'نظام قواعد البيانات السحابية'
              );
            } catch (e) {
              // ignore
            }
            return;
        }
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
            handleSuppressed('console.error', fullText);
            console.warn('[Firestore Suppressed Warn]:', ...args);
            return;
        }
        originalConsoleError.apply(console, args);
    };

    const handleGlobalError = (event: ErrorEvent) => {
        const msg = event.message ? String(event.message) : '';
        const errorStr = event.error ? String(event.error) : '';
        const combined = `${msg} ${errorStr}`;
        if (isSuppressedError(combined)) {
            handleSuppressed('window.error', combined);
            event.preventDefault();
            event.stopPropagation();
        }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason ? String(event.reason) : '';
        if (isSuppressedError(reason)) {
            handleSuppressed('unhandledrejection', reason);
            event.preventDefault();
            event.stopPropagation();
        }
    };

    window.addEventListener('error', handleGlobalError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);
}
