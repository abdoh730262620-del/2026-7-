import { useBackupStore } from '../store/backupStore';
import { performBackup } from './backupService';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

let intervalId: any = null;
let changeUnsubscribers: (() => void)[] = [];
let debounceTimeout: any = null;

export function initAutoBackup() {
    // Subscribe to store changes so we update the logic
    useBackupStore.subscribe((state) => {
        applyBackupSettings(state.settings);
    });

    // Apply initially
    applyBackupSettings(useBackupStore.getState().settings);
}

function applyBackupSettings(settings: any) {
    // Clear existing
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    for (const unsub of changeUnsubscribers) {
        unsub();
    }
    changeUnsubscribers = [];

    if (!settings.autoBackupEnabled) {
        return;
    }

    if (settings.autoBackupInterval === 'on_change') {
        setupOnChangeBackups(settings);
    } else {
        setupIntervalBackups(settings);
    }
}

function setupIntervalBackups(settings: any) {
    let ms = 60 * 60 * 1000; // default 1 hour
    if (settings.autoBackupInterval === '5_min') {
        ms = 5 * 60 * 1000;
    } else if (settings.autoBackupInterval === 'daily') {
        ms = 24 * 60 * 60 * 1000;
    }

    intervalId = setInterval(async () => {
        console.log('[AutoBackup] Running interval backup...');
        await performBackup(settings.destinations, settings.targetEmail, settings.maxBackupsCount);
    }, ms);
}

function setupOnChangeBackups(settings: any) {
    const collectionsToWatch = ['sales', 'purchases', 'products', 'customers', 'cash'];
    
    for (const collName of collectionsToWatch) {
        const unsub = onSnapshot(collection(db, collName), (snapshot) => {
            // Check if there are actual actual changes from locals (not just initial pulls)
            // But to keep it simple, any snapshot with docChanges will trigger
            if (snapshot.docChanges().length > 0) {
                if (debounceTimeout) {
                    clearTimeout(debounceTimeout);
                }
                // Debounce by 1 minute to avoid spamming backups on bulk updates
                debounceTimeout = setTimeout(async () => {
                    console.log(`[AutoBackup] Running on-change backup due to ${collName}...`);
                    await performBackup(settings.destinations, settings.targetEmail, settings.maxBackupsCount);
                }, 60 * 1000);
            }
        });
        changeUnsubscribers.push(unsub);
    }
}
