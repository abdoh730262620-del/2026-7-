import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
    try {
        console.log("Fetching card_cashbox documents...");
        const snap = await getDocs(collection(db, 'card_cashbox'));
        console.log(`Total card_cashbox documents: ${snap.size}`);
        
        let count = 0;
        snap.forEach(d => {
            const data = d.data();
            // Let's print the structure of some card_cashbox documents
            if (count < 25) {
                console.log(`Doc ID: ${d.id}, Type: ${data.type}, Amount: ${data.amount}, EmpName: ${data.employeeName}, EmpId: ${data.employeeId}, Notes: ${data.notes}, Date: ${new Date(data.date || data.createdAt)}`);
            }
            count++;
        });

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

run();
