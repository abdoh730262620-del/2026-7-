import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
    try {
        console.log("Fetching cards_distributors...");
        const dists = await getDocs(collection(db, 'cards_distributors'));
        dists.forEach(d => {
            console.log(`Distributor ID: ${d.id}, Name: ${d.data().name}, Balance: ${d.data().balance}, Phone: ${d.data().phone}`);
        });

        console.log("\nFetching cards_sellers...");
        const sellers = await getDocs(collection(db, 'cards_sellers'));
        sellers.forEach(d => {
            console.log(`Seller ID: ${d.id}, Name: ${d.data().name}, Balance: ${d.data().balance}`);
        });

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

run();
