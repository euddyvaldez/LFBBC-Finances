
'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import type { FinancialRecord, Integrante, Razon } from '@/types';
import * as api from '@/lib/data';
import { onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { useAuth } from './AuthProvider';
import { parse, isValid, startOfDay } from 'date-fns';

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
  addIntegrante: (nombre: string, isProtected?: boolean) => Promise<void>;
  importIntegrantes: (integrantes: Omit<Integrante, 'id'| 'userId'>[], mode: 'add' | 'replace') => Promise<void>;
  updateIntegrante: (id: string, nombre: string) => Promise<void>;
  deleteIntegrante: (id: string) => Promise<void>;
  addRazon: (descripcion: string, isQuickReason?: boolean, isProtected?: boolean) => Promise<void>;
  importRazones: (razones: Omit<Razon, 'id'| 'userId'>[], mode: 'add' | 'replace') => Promise<void>;
  updateRazon: (id: string, updates: Partial<Omit<Razon, 'id' | 'userId'>>) => Promise<void>;
  deleteRazon: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const parseDate = (dateStr: string) => parse(dateStr, 'dd/MM/yyyy', new Date());

// Since auth is removed, we use a default user ID for all operations.
const DEFAULT_USER_ID = 'default-user';

export function AppProvider({ children }: { children: ReactNode }) {
  const [integrantes, setIntegrantes] = useState<Integrante[]>([]);
  const [razones, setRazones] = useState<Razon[]>([]);
  const [financialRecords, setFinancialRecords] = useState<FinancialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIntegrantes([]);
      setRazones([]);
      setFinancialRecords([]);
      setLoading(false);
      console.error("Firebase is not configured. Data operations will not work.");
      return;
    };

    setLoading(true);

    const createQuery = (collectionName: string) => query(collection(db, collectionName), where("userId", "==", DEFAULT_USER_ID));

    const unsubscribers = [
      onSnapshot(createQuery('integrantes'), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Integrante));
        setIntegrantes(data);
      }, (err) => {
        setError(err);
        console.error("Error fetching integrantes:", err);
      }),
      onSnapshot(createQuery('razones'), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Razon));
        setRazones(data);
      }, (err) => {
        setError(err);
        console.error("Error fetching razones:", err);
      }),
      onSnapshot(createQuery('financialRecords'), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FinancialRecord));
        setFinancialRecords(data);
        setLoading(false);
      }, (err) => {
        setError(err);
        setLoading(false);
        console.error("Error fetching financial records:", err);
      })
    ];

    // Seed initial data if it doesn't exist for the default user
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


    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
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

  const addFinancialRecordDefaultUser = (record: Omit<FinancialRecord, 'id' | 'userId'>) => {
    return api.addFinancialRecord(record, DEFAULT_USER_ID);
  }
  const importFinancialRecordsDefaultUser = (records: Omit<FinancialRecord, 'id' | 'userId'>[], mode: 'add' | 'replace') => {
    return api.importFinancialRecords(records, mode, DEFAULT_USER_ID);
  };
  const addIntegranteDefaultUser = (nombre: string, isProtected?: boolean) => {
     return api.addIntegrante(nombre, isProtected, DEFAULT_USER_ID);
  }
   const importIntegrantesDefaultUser = (integrantes: Omit<Integrante, 'id' | 'userId'>[], mode: 'add' | 'replace') => {
    return api.importIntegrantes(integrantes, mode, DEFAULT_USER_ID);
  };
   const addRazonDefaultUser = (descripcion: string, isQuickReason?: boolean, isProtected?: boolean) => {
    return api.addRazon(descripcion, isQuickReason, isProtected, DEFAULT_USER_ID);
  }
  const importRazonesDefaultUser = (razones: Omit<Razon, 'id' | 'userId'>[], mode: 'add' | 'replace') => {
    return api.importRazones(razones, mode, DEFAULT_USER_ID);
  };


  const value: AppContextType = {
    integrantes,
    razones,
    financialRecords,
    recordDates,
    loading,
    error,
    addFinancialRecord: addFinancialRecordDefaultUser,
    updateFinancialRecord: api.updateFinancialRecord,
    deleteFinancialRecord: api.deleteFinancialRecord,
    importFinancialRecords: importFinancialRecordsDefaultUser,
    addIntegrante: addIntegranteDefaultUser,
    importIntegrantes: importIntegrantesDefaultUser,
    updateIntegrante: api.updateIntegrante,
    deleteIntegrante: api.deleteIntegrante,
    addRazon: addRazonDefaultUser,
    importRazones: importRazonesDefaultUser,
    updateRazon: api.updateRazon,
    deleteRazon: api.deleteRazon,
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
