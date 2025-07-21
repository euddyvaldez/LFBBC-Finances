
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, where, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { FinancialRecord, Integrante, Razon, Cita, Movimiento } from '@/types';

// Citas (Static Data)
const CitasData: Cita[] = [
    { texto: "Cuida de los pequeños gastos; un pequeño agujero hunde un barco.", autor: "Benjamin Franklin" },
    { texto: "La inversión en conocimiento paga el mejor interés.", autor: "Benjamin Franklin" },
    { texto: "No ahorres lo que te queda después de gastar, gasta lo que te queda después de ahorrar.", autor: "Warren Buffett" },
    { texto: "El riesgo viene de no saber lo que estás haciendo.", autor: "Warren Buffett" },
    { texto: "El dinero no es más que una herramienta. Te llevará a donde desees, pero no te reemplazará como conductor.", autor: "Ayn Rand" }
];

type PendingOperation = 
  | { type: 'add', collection: string, payload: any }
  | { type: 'update', collection: string, payload: { id: string, updates: any } }
  | { type: 'delete', collection: string, payload: { id: string } };


// --- API Functions ---

export const getChangesSince = async (timestamp: number | null, userId: string) => {
    const collections = ['integrantes', 'razones', 'financialRecords'];
    const results: { [key: string]: any[] } = {
        integrantes: [],
        razones: [],
        financialRecords: [],
    };

    for (const coll of collections) {
        let q = query(collection(db, coll), where("userId", "==", userId));
        if (timestamp) {
            q = query(q, where("updatedAt", ">", timestamp));
        }
        const snapshot = await getDocs(q);
        results[coll] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    return results as {
        integrantes: Integrante[],
        razones: Razon[],
        financialRecords: FinancialRecord[],
    };
};

export const batchProcess = async (operations: PendingOperation[]) => {
    const batch = writeBatch(db);

    for (const op of operations) {
        const docRef = op.type === 'add'
            ? doc(collection(db, op.collection))
            : doc(db, op.collection, op.payload.id);

        switch (op.type) {
            case 'add':
                batch.set(docRef, op.payload);
                break;
            case 'update':
                batch.update(docRef, op.payload.updates);
                break;
            case 'delete':
                // Soft delete by marking as deleted
                batch.update(docRef, { isDeleted: true, updatedAt: new Date().getTime() });
                break;
        }
    }
    await batch.commit();
};


// Generic data fetcher - Used for initial load if needed
export const getData = async (collectionName: string, userId: string) => {
    if (!userId) throw new Error("User ID is required");
    const q = query(collection(db, collectionName), where("userId", "==", userId), where("isDeleted", "==", false));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};


// Citas (static data)
export const getCitas = async (): Promise<Cita[]> => {
    return CitasData;
}
