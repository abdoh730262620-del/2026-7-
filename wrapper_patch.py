import sys

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

orig_import = "import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';"
new_import = "import { collection, query, where, onSnapshot, doc, addDoc as firestoreAddDoc, updateDoc as firestoreUpdateDoc, deleteDoc as firestoreDeleteDoc } from 'firebase/firestore';"

wrappers = '''
// Helper functions for offline-safe writes
const safeWrite = async (promise: Promise<any>) => {
    if (!window.navigator.onLine) {
        promise.catch((e: any) => console.warn('Offline write deferred', e));
        return Promise.resolve();
    }
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(resolve, 800)) // 800ms timeout for UI responsiveness
    ]);
};

const addDoc = (ref: any, data: any) => safeWrite(firestoreAddDoc(ref, data));
const updateDoc = (ref: any, data: any) => safeWrite(firestoreUpdateDoc(ref, data));
const deleteDoc = (ref: any) => safeWrite(firestoreDeleteDoc(ref));
'''

content = content.replace(orig_import, new_import + '\n' + wrappers)

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)
