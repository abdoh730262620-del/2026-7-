import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
    try {
        const email = 'habob19940@gmail.com';
        const pass = 'abdohali1994';
        const res = await createUserWithEmailAndPassword(auth, email, pass);
        const uid = res.user.uid;
        console.log(`Created user in auth with uid ${uid}`);

        await setDoc(doc(db, 'users', uid), {
            email: email,
            name: 'abdohali',
            role: 'admin',
            isActive: true,
            permissions: {
                sales: true,
                purchases: true,
                edit: true,
                add: true,
                delete: true,
                backup: true
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        console.log("Successfully created abdohali in database");
    } catch(e) {
        console.error("Error creating user: ", e);
    }
    process.exit(0);
}

run();
