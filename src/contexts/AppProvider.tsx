
'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import type { FinancialRecord, Integrante, Razon, Movimiento } from '@/types';
import * as api from '@/lib/data';
import { onSnapshot, collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from './AuthProvider';
import { parse, isValid, startOfDay, format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';


interface AppContextType {
  integrantes: Integrante[];
  razones: Razon[];
  financialRecords: FinancialRecord[];
  recordDates: Set<number>;
  loading: boolean;
  error: Error | null;
  addFinancialRecord: (record: Omit<FinancialRecord, 'id' | 'userId'>) => Promise<void>;
  updateFinancialRecord: (id: string, record: Partial<Omit<FinancialRecord, 'id' | 'userId'>>) => Promise<void>;
  deleteFinancialRecord: (id: string) => Promise<void>;
  importFinancialRecords: (records: Omit<FinancialRecord, 'id' | 'userId'>[], mode: 'add' | 'replace') => Promise<void>;
  importFinancialRecordsLocal: (records: Omit<FinancialRecord, 'id' | 'userId'>[], mode: 'add' | 'replace') => Promise<void>;
  addIntegrante: (nombre: string, isProtected?: boolean) => Promise<void>;
  importIntegrantes: (integrantes: Omit<Integrante, 'id'| 'userId'>[], mode: 'add' | 'replace') => Promise<void>;
  importIntegrantesLocal: (integrantes: Omit<Integrante, 'id'| 'userId'>[], mode: 'add' | 'replace') => Promise<void>;
  updateIntegrante: (id: string, nombre: string) => Promise<void>;
  deleteIntegrante: (id: string) => Promise<void>;
  addRazon: (descripcion: string, isQuickReason?: boolean, isProtected?: boolean) => Promise<void>;
  importRazones: (razones: Omit<Razon, 'id'| 'userId'>[], mode: 'add' | 'replace') => Promise<void>;
  importRazonesLocal: (razones: Omit<Razon, 'id'| 'userId'>[], mode: 'add' | 'replace') => Promise<void>;
  updateRazon: (id: string, updates: Partial<Omit<Razon, 'id' | 'userId'>>) => Promise<void>;
  deleteRazon: (id: string) => Promise<void>;
}

type PendingOperation = 
  | { type: 'addFinancialRecord', payload: Omit<FinancialRecord, 'id' | 'userId'> }
  | { type: 'updateFinancialRecord', payload: { id: string, updates: Partial<Omit<FinancialRecord, 'id' | 'userId'>> } }
  | { type: 'deleteFinancialRecord', payload: { id: string } }
  | { type: 'addIntegrante', payload: { nombre: string, isProtected?: boolean } }
  | { type: 'updateIntegrante', payload: { id: string, nombre: string } }
  | { type: 'deleteIntegrante', payload: { id: string } }
  | { type: 'addRazon', payload: { descripcion: string, isQuickReason?: boolean, isProtected?: boolean } }
  | { type: 'updateRazon', payload: { id: string, updates: Partial<Omit<Razon, 'id' | 'userId'>> } }
  | { type: 'deleteRazon', payload: { id: string } };


const AppContext = createContext<AppContextType | undefined>(undefined);

const parseDate = (dateStr: string) => parse(dateStr, 'dd/MM/yyyy', new Date());

// Since auth is removed, we use a default user ID for all operations.
const DEFAULT_USER_ID = 'default-user';


const getFromLocalStorage = <T>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue;
    const storedValue = window.localStorage.getItem(key);
    try {
        return storedValue ? JSON.parse(storedValue) : defaultValue;
    } catch (error) {
        console.error(`Error parsing localStorage key "${key}":`, error);
        return defaultValue;
    }
};

const setToLocalStorage = <T>(key: string, value: T) => {
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(value));
    }
};


export function AppProvider({ children }: { children: ReactNode }) {
  const [integrantes, setIntegrantes] = useState<Integrante[]>(() => getFromLocalStorage('integrantes', []));
  const [razones, setRazones] = useState<Razon[]>(() => getFromLocalStorage('razones', []));
  const [financialRecords, setFinancialRecords] = useState<FinancialRecord[]>(() => getFromLocalStorage('financialRecords', []));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [pendingOps, setPendingOps] = useState<PendingOperation[]>(() => getFromLocalStorage('pendingOps', []));

  useEffect(() => setToLocalStorage('integrantes', integrantes), [integrantes]);
  useEffect(() => setToLocalStorage('razones', razones), [razones]);
  useEffect(() => setToLocalStorage('financialRecords', financialRecords), [financialRecords]);
  useEffect(() => setToLocalStorage('pendingOps', pendingOps), [pendingOps]);


  const addPendingOp = (op: PendingOperation) => {
      setPendingOps(prev => [...prev, op]);
  }

  useEffect(() => {
    if (!isFirebaseConfigured) {
        console.warn("Firebase is not configured. Running in offline mode.");
        setLoading(false);
        return;
    }

    setLoading(true);

    const syncPendingOperations = async () => {
        if (pendingOps.length === 0) return;
        console.log(`Syncing ${pendingOps.length} pending operations...`);
        
        let success = true;
        const remainingOps = [...pendingOps];
        
        while(remainingOps.length > 0) {
            const op = remainingOps.shift();
            if(!op) continue;
            try {
                switch(op.type) {
                    case 'addFinancialRecord': await api.addFinancialRecord(op.payload, DEFAULT_USER_ID); break;
                    case 'updateFinancialRecord': await api.updateFinancialRecord(op.payload.id, op.payload.updates); break;
                    case 'deleteFinancialRecord': await api.deleteFinancialRecord(op.payload.id); break;
                    case 'addIntegrante': await api.addIntegrante(op.payload.nombre, op.payload.isProtected, DEFAULT_USER_ID); break;
                    case 'updateIntegrante': await api.updateIntegrante(op.payload.id, op.payload.nombre); break;
                    case 'deleteIntegrante': await api.deleteIntegrante(op.payload.id); break;
                    case 'addRazon': await api.addRazon(op.payload.descripcion, op.payload.isProtected, op.payload.isQuickReason, DEFAULT_USER_ID); break;
                    case 'updateRazon': await api.updateRazon(op.payload.id, op.payload.updates); break;
                    case 'deleteRazon': await api.deleteRazon(op.payload.id); break;
                }
                 setPendingOps(currentOps => currentOps.filter(p => p !== op));
            } catch(e) {
                console.error("Failed to sync operation, will retry later:", op, e);
                success = false;
                break;
            }
        }

        if (success) {
            console.log("All pending operations synced successfully.");
        }
    };

    syncPendingOperations();

    const createQuery = (collectionName: string) => query(collection(db, collectionName), where("userId", "==", DEFAULT_USER_ID));

    const unsubscribers = [
      onSnapshot(createQuery('integrantes'), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Integrante));
        setIntegrantes(data);
      }, (err) => { setError(err); console.error("Error fetching integrantes:", err); }),
      
      onSnapshot(createQuery('razones'), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Razon));
        setRazones(data);
      }, (err) => { setError(err); console.error("Error fetching razones:", err); }),
      
      onSnapshot(createQuery('financialRecords'), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialRecord));
        setFinancialRecords(data);
        setLoading(false);
      }, (err) => { setError(err); setLoading(false); console.error("Error fetching financial records:", err); })
    ];

    const seedData = async () => {
        const q = query(collection(db, 'razones'), where("userId", "==", DEFAULT_USER_ID));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            console.log("No data found for default user, seeding initial data...");
            await Promise.all([
              api.addIntegrante("INVITADO", true, DEFAULT_USER_ID),
              api.addRazon("MENSUALIDAD", true, true, DEFAULT_USER_ID),
              api.addRazon("SEMANAL", true, true, DEFAULT_USER_ID)
            ]);
        }
    };
    seedData();

    return () => unsubscribers.forEach(unsub => unsub());
  }, []);

  const recordDates = useMemo(() => {
    const dates = new Set<number>();
    financialRecords.forEach(record => {
        if(record.fecha) {
            const date = parseDate(record.fecha);
            if (isValid(date)) {
                dates.add(startOfDay(date).getTime());
            }
        }
    });
    return dates;
  }, [financialRecords]);

  // --- Wrapped API Functions for Offline Support ---

  const addFinancialRecord = async (record: Omit<FinancialRecord, 'id' | 'userId'>) => {
    let monto = record.monto;
    if ((record.movimiento === 'GASTOS' || record.movimiento === 'INVERSION') && monto > 0) monto = -monto;
    if (record.movimiento === 'INGRESOS' && monto < 0) monto = Math.abs(monto);
    const finalRecord = { ...record, monto };

    if (isFirebaseConfigured) {
      return api.addFinancialRecord(finalRecord, DEFAULT_USER_ID);
    }
    const newRecord: FinancialRecord = { ...finalRecord, id: uuidv4(), userId: DEFAULT_USER_ID };
    setFinancialRecords(prev => [...prev, newRecord]);
    addPendingOp({ type: 'addFinancialRecord', payload: finalRecord });
  };
  
  const updateFinancialRecord = async (id: string, updates: Partial<Omit<FinancialRecord, 'id' | 'userId'>>) => {
      if (isFirebaseConfigured) {
          return api.updateFinancialRecord(id, updates);
      }
      setFinancialRecords(prev => prev.map(r => r.id === id ? { ...r, ...updates, fecha: updates.fecha || r.fecha } : r));
      addPendingOp({ type: 'updateFinancialRecord', payload: { id, updates } });
  };

  const deleteFinancialRecord = async (id: string) => {
      if (isFirebaseConfigured) {
          return api.deleteFinancialRecord(id);
      }
      setFinancialRecords(prev => prev.filter(r => r.id !== id));
      addPendingOp({ type: 'deleteFinancialRecord', payload: { id } });
  };
  
  const addIntegrante = async (nombre: string, isProtected = false) => {
    if (isFirebaseConfigured) {
      return api.addIntegrante(nombre, isProtected, DEFAULT_USER_ID);
    }
    const newIntegrante: Integrante = { id: uuidv4(), nombre: nombre.toUpperCase(), isProtected, userId: DEFAULT_USER_ID };
    setIntegrantes(prev => [...prev, newIntegrante]);
    addPendingOp({ type: 'addIntegrante', payload: { nombre, isProtected } });
  };

  const updateIntegrante = async (id: string, nombre: string) => {
      if (isFirebaseConfigured) {
          return api.updateIntegrante(id, nombre);
      }
      setIntegrantes(prev => prev.map(i => i.id === id ? { ...i, nombre: nombre.toUpperCase() } : i));
      addPendingOp({ type: 'updateIntegrante', payload: { id, nombre } });
  };

  const deleteIntegrante = async (id: string) => {
      if (isFirebaseConfigured) {
          return api.deleteIntegrante(id);
      }
      setIntegrantes(prev => prev.filter(i => i.id !== id));
      addPendingOp({ type: 'deleteIntegrante', payload: { id } });
  };

  const addRazon = async (descripcion: string, isQuickReason = false, isProtected = false) => {
      if (isFirebaseConfigured) {
        return api.addRazon(descripcion, isQuickReason, isProtected, DEFAULT_USER_ID);
      }
      const newRazon: Razon = { id: uuidv4(), descripcion: descripcion.toUpperCase(), isQuickReason, isProtected, userId: DEFAULT_USER_ID };
      setRazones(prev => [...prev, newRazon]);
      addPendingOp({ type: 'addRazon', payload: { descripcion, isQuickReason, isProtected } });
  };

  const updateRazon = async (id: string, updates: Partial<Omit<Razon, 'id' | 'userId'>>) => {
      if (isFirebaseConfigured) {
          return api.updateRazon(id, updates);
      }
      setRazones(prev => prev.map(r => r.id === id ? { ...r, ...updates, descripcion: (updates.descripcion || r.descripcion).toUpperCase() } : r));
      addPendingOp({ type: 'updateRazon', payload: { id, updates } });
  };
  
  const deleteRazon = async (id: string) => {
      if (isFirebaseConfigured) {
          return api.deleteRazon(id);
      }
      setRazones(prev => prev.filter(r => r.id !== id));
      addPendingOp({ type: 'deleteRazon', payload: { id } });
  };

  const importFinancialRecords = async (records: Omit<FinancialRecord, 'id' | 'userId'>[], mode: 'add' | 'replace') => {
      return api.importFinancialRecords(records, mode, DEFAULT_USER_ID);
  };
  
  const importFinancialRecordsLocal = async (records: Omit<FinancialRecord, 'id' | 'userId'>[], mode: 'add' | 'replace') => {
      let finalRecords = [...financialRecords];
      if (mode === 'replace') {
          finalRecords = [];
      }
      
      const recordsWithIds = records.map(r => ({ ...r, id: uuidv4(), userId: DEFAULT_USER_ID }));

      if (mode === 'add') {
          finalRecords.push(...recordsWithIds);
      } else {
          finalRecords = recordsWithIds;
      }
      setFinancialRecords(finalRecords);
  };

  const importIntegrantes = async (integrantesToImport: Omit<Integrante, 'id' | 'userId'>[], mode: 'add' | 'replace') => {
      return api.importIntegrantes(integrantesToImport, mode, DEFAULT_USER_ID);
  };

  const importIntegrantesLocal = async (integrantesToImport: Omit<Integrante, 'id' | 'userId'>[], mode: 'add' | 'replace') => {
      let finalIntegrantes = [...integrantes];
      if (mode === 'replace') {
          finalIntegrantes = finalIntegrantes.filter(i => i.isProtected);
      }

      const newIntegrantes = integrantesToImport.map(i => ({...i, nombre: i.nombre.toUpperCase(), id: uuidv4(), userId: DEFAULT_USER_ID }));
      
      if (mode === 'add') {
          finalIntegrantes.push(...newIntegrantes);
      } else {
          finalIntegrantes.push(...newIntegrantes);
      }
      setIntegrantes(finalIntegrantes);
  };

  const importRazones = async (razonesToImport: Omit<Razon, 'id' | 'userId'>[], mode: 'add' | 'replace') => {
      return api.importRazones(razonesToImport, mode, DEFAULT_USER_ID);
  };

  const importRazonesLocal = async (razonesToImport: Omit<Razon, 'id' | 'userId'>[], mode: 'add' | 'replace') => {
      let finalRazones = [...razones];
      if (mode === 'replace') {
          finalRazones = finalRazones.filter(r => r.isProtected);
      }

      const newRazones = razonesToImport.map(r => ({...r, descripcion: r.descripcion.toUpperCase(), id: uuidv4(), userId: DEFAULT_USER_ID}));
      
      if (mode === 'add') {
          finalRazones.push(...newRazones);
      } else {
          finalRazones.push(...newRazones);
      }
      setRazones(finalRazones);
  };

  const value: AppContextType = {
    integrantes,
    razones,
    financialRecords,
    recordDates,
    loading,
    error,
    addFinancialRecord,
    updateFinancialRecord,
    deleteFinancialRecord,
    importFinancialRecords,
    importFinancialRecordsLocal,
    addIntegrante,
    updateIntegrante,
    deleteIntegrante,
    importIntegrantes,
    importIntegrantesLocal,
    addRazon,
    updateRazon,
    deleteRazon,
    importRazones,
    importRazonesLocal,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
