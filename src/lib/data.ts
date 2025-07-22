
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, writeBatch, query, where, Timestamp } from 'firebase/firestore';
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


// --- API Functions for Real-time model ---

const addEntity = async (collectionName: string, data: any, userId: string) => {
    if (!db) throw new Error("Firestore no está inicializado.");
    const now = Timestamp.now();
    await addDoc(collection(db, collectionName), {
        ...data,
        userId,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
    });
};

const updateEntity = async (collectionName: string, id: string, data: any) => {
    if (!db) throw new Error("Firestore no está inicializado.");
    const docRef = doc(db, collectionName, id);
    await updateDoc(docRef, {
        ...data,
        updatedAt: Timestamp.now(),
    });
};

const deleteEntity = async (collectionName: string, id: string) => {
    if (!db) throw new Error("Firestore no está inicializado.");
    // Soft delete
    await updateEntity(collectionName, id, { isDeleted: true });
};

// Financial Records
export const addFinancialRecord = (data: Omit<FinancialRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, userId: string) => addEntity('financialRecords', data, userId);
export const updateFinancialRecord = (id: string, data: Partial<FinancialRecord>) => updateEntity('financialRecords', id, data);
export const deleteFinancialRecord = (id: string) => deleteEntity('financialRecords', id);

// Integrantes
export const addIntegrante = (data: Omit<Integrante, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, userId: string) => addEntity('integrantes', { ...data, nombre: data.nombre.toUpperCase() }, userId);
export const updateIntegrante = (id:string, data: Partial<Integrante>) => updateEntity('integrantes', id, { ...data, nombre: data.nombre?.toUpperCase() });
export const deleteIntegrante = (id: string) => deleteEntity('integrantes', id);

// Razones
export const addRazon = (data: Omit<Razon, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, userId: string) => addEntity('razones', { ...data, descripcion: data.descripcion.toUpperCase() }, userId);
export const updateRazon = (id: string, data: Partial<Razon>) => updateEntity('razones', id, { ...data, descripcion: data.descripcion?.toUpperCase() });
export const deleteRazon = (id: string) => deleteEntity('razones', id);


// Import logic
export const importData = async <T extends { isProtected?: boolean }>(
    collectionName: string,
    itemsToImport: any[],
    existingItems: T[],
    getUniqueKey: (item: any) => string,
    mode: 'add' | 'replace',
    userId: string
) => {
    if (!db) throw new Error("Firestore no está inicializado.");
    const batch = writeBatch(db);

    if (mode === 'replace') {
        existingItems.forEach(item => {
            if (!item.isProtected) {
                const docRef = doc(db, collectionName, (item as any).id);
                batch.update(docRef, { isDeleted: true, updatedAt: Timestamp.now() });
            }
        });
    }

    const itemsToAdd = (mode === 'add')
        ? itemsToImport.filter(item => 
            !existingItems.some(existing => getUniqueKey(existing).toLowerCase() === getUniqueKey(item).toLowerCase())
          )
        : itemsToImport;
        
    itemsToAdd.forEach(item => {
        const docRef = doc(collection(db, collectionName));
        const now = Timestamp.now();
        batch.set(docRef, { 
            ...item, 
            userId,
            createdAt: now,
            updatedAt: now,
            isDeleted: false
        });
    });

    await batch.commit();
};


// Citas (static data)
export const getCitas = async (): Promise<Cita[]> => {
    return CitasData;
}
