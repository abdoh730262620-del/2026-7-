import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
    try {
        const email = 'dawned@local.app';
        const pass = '123456';
        let uid = '';
        try {
            const res = await signInWithEmailAndPassword(auth, email, pass);
            uid = res.user.uid;
            console.log(`Signed in user in auth with uid ${uid}`);
        } catch (e) {
            console.error("Login failed, user might not exist or wrong password");
            process.exit(1);
        }

        await setDoc(doc(db, 'users', uid), {
            email: email,
            name: 'dawned',
            role: 'salesman',
            isActive: true,
            permissions: {
                sales: true,
                purchases: false,
                edit: false,
                add: true,
                delete: false,
                backup: false
            },
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
        console.log("Successfully created dawned in database");
    } catch(e) {
        console.error("Error creating user info: ", e);
    }
    process.exit(0);
}

run();
