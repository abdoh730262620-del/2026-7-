import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
    try {
        const usersSnap = await getDocs(collection(db, 'users'));
        let dawoodUser: any = null;
        usersSnap.forEach(d => {
            const u = d.data();
            if (u.name === 'dawood') {
                dawoodUser = { id: d.id, ...u };
            }
        });

        if (!dawoodUser) {
            console.log("No 'dawood' user found");
            process.exit(1);
        }

        // Fetch card sales
        const cardSalesSnap = await getDocs(collection(db, 'card_sales'));
        const cardSales: any[] = [];
        cardSalesSnap.forEach(d => {
            cardSales.push({ id: d.id, ...d.data() });
        });

        const empCardSales = cardSales.filter(s => {
            return (s.userName && s.userName === dawoodUser.name) ||
                   (s.sellerName && s.sellerName === dawoodUser.name) ||
                   (s.createdByName && s.createdByName === dawoodUser.name) ||
                   (s.userName && s.userName === dawoodUser.email) ||
                   (s.sellerName && s.sellerName === dawoodUser.email) ||
                   (s.userId && s.userId === dawoodUser.id) ||
                   (s.createdBy && s.createdBy === dawoodUser.id);
        });

        console.log("Total Card Sales for Dawood:", empCardSales.length);

        // Analyze types
        const saleTypes = new Set();
        const paymentTypes = new Set();
        const paymentMethods = new Set();
        const statuses = new Set();

        empCardSales.forEach(s => {
            saleTypes.add(s.saleType);
            paymentTypes.add(s.paymentType);
            paymentMethods.add(s.paymentMethod);
            statuses.add(s.status);
        });

        console.log("Unique saleTypes:", Array.from(saleTypes));
        console.log("Unique paymentTypes:", Array.from(paymentTypes));
        console.log("Unique paymentMethods:", Array.from(paymentMethods));
        console.log("Unique statuses:", Array.from(statuses));

        // Group by combination
        const groups: Record<string, { count: number, totalAmount: number }> = {};
        empCardSales.forEach(s => {
            const key = `saleType:${s.saleType} | paymentType:${s.paymentType} | paymentMethod:${s.paymentMethod} | status:${s.status}`;
            if (!groups[key]) {
                groups[key] = { count: 0, totalAmount: 0 };
            }
            groups[key].count++;
            groups[key].totalAmount += (Number(s.totalAmount || s.totalPrice || s.amount) || 0);
        });

        console.log("\n--- GROUPED SALES ---");
        Object.entries(groups).forEach(([key, val]) => {
            console.log(`${key} => Count: ${val.count}, Sum: ${val.totalAmount}`);
        });

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

run();
