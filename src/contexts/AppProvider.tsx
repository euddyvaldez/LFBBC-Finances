
'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import type { FinancialRecord, Integrante, Razon } from '@/types';
import * as api from '@/lib/data';
import { isFirebaseConfigured, db } from '@/lib/firebase';
import { parse, isValid, startOfDay } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './AuthProvider';
import { onSnapshot, collection, query, where } from 'firebase/firestore';

interface AppContextType {
  integrantes: Integrante[];
  razones: Razon[];
  financialRecords: FinancialRecord[];
  recordDates: Set<number>;
  loading: boolean;
  error: Error | null;
  addFinancialRecord: (record: Omit<FinancialRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateFinancialRecord: (id: string, record: Partial<Omit<FinancialRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  deleteFinancialRecord: (id: string) => Promise<void>;
  addIntegrante: (nombre: string, isProtected?: boolean) => Promise<void>;
  updateIntegrante: (id: string, nombre: string) => Promise<void>;
  deleteIntegrante: (id: string) => Promise<void>;
  addRazon: (descripcion: string, isQuickReason?: boolean, isProtected?: boolean) => Promise<void>;
  updateRazon: (id: string, updates: Partial<Omit<Razon, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  deleteRazon: (id: string) => Promise<void>;
  importRazones: (razones: Omit<Razon, 'id'| 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => Promise<void>;
  importIntegrantes: (integrantes: Omit<Integrante, 'id'| 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => Promise<void>;
  importFinancialRecords: (records: Omit<FinancialRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const parseDate = (dateStr: string) => parse(dateStr, 'dd/MM/yyyy', new Date());

export function AppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [integrantes, setIntegrantes] = useState<Integrante[]>([]);
  const [razones, setRazones] = useState<Razon[]>([]);
  const [financialRecords, setFinancialRecords] = useState<FinancialRecord[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    if (!user || !db) {
        setLoading(false);
        return;
    }
    
    setLoading(true);

    const collections = {
        integrantes: setIntegrantes,
        razones: setRazones,
        financialRecords: setFinancialRecords,
    };
    
    const unsubs = Object.entries(collections).map(([collName, setter]) => {
        const q = query(collection(db, collName), where("userId", "==", user.uid));
        
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
            setter(data.filter(item => !item.isDeleted));
        }, (err) => {
            console.error(`Error escuchando a ${collName}:`, err);
            setError(err);
            toast({ variant: 'destructive', title: 'Error de conexión', description: `No se pudo obtener datos de ${collName}.` });
        });
    });

    setLoading(false);

    // Cleanup listeners on unmount
    return () => unsubs.forEach(unsub => unsub());

  }, [user, toast]);

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

  // --- CRUD Functions ---

  const addFinancialRecord = async (record: Omit<FinancialRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    if(!user) throw new Error("Usuario no autenticado.");
    let monto = record.monto;
    if ((record.movimiento === 'GASTOS' || record.movimiento === 'INVERSION') && monto > 0) monto = -monto;
    if (record.movimiento === 'INGRESOS' && monto < 0) monto = Math.abs(monto);
    
    await api.addFinancialRecord({ ...record, monto }, user.uid);
  };
  
  const updateFinancialRecord = async (id: string, updates: Partial<Omit<FinancialRecord, 'id' | 'userId'>>) => {
      await api.updateFinancialRecord(id, updates);
  };

  const deleteFinancialRecord = async (id: string) => {
      await api.deleteFinancialRecord(id);
  };
  
  const addIntegrante = async (nombre: string, isProtected = false) => {
    if(!user) throw new Error("Usuario no autenticado.");
    await api.addIntegrante({ nombre, isProtected }, user.uid);
  };

  const updateIntegrante = async (id: string, nombre: string) => {
      await api.updateIntegrante(id, { nombre });
  };

  const deleteIntegrante = async (id: string) => {
      await api.deleteIntegrante(id);
  };

  const addRazon = async (descripcion: string, isQuickReason = false, isProtected = false) => {
      if(!user) throw new Error("Usuario no autenticado.");
      await api.addRazon({ descripcion, isQuickReason, isProtected }, user.uid);
  };

  const updateRazon = async (id: string, updates: Partial<Omit<Razon, 'id' | 'userId'>>) => {
      await api.updateRazon(id, updates);
  };
  
  const deleteRazon = async (id: string) => {
      await api.deleteRazon(id);
  };

  const importIntegrantes = async (integrantesToImport: Omit<Integrante, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => {
      if(!user) throw new Error("Usuario no autenticado.");
      await api.importData(
          'integrantes',
          integrantesToImport,
          integrantes, // current data
          (item) => item.nombre,
          mode,
          user.uid
      );
  };
  
  const importRazones = async (razonesToImport: Omit<Razon, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => {
      if(!user) throw new Error("Usuario no autenticado.");
      await api.importData(
          'razones',
          razonesToImport,
          razones, // current data
          (item) => item.descripcion,
          mode,
          user.uid
      );
  };

   const importFinancialRecords = async (records: Omit<FinancialRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => {
      if(!user) throw new Error("Usuario no autenticado.");
      await api.importData(
          'financialRecords',
          records,
          financialRecords,
          // Financial records don't have a unique key for "add" mode check, so we rely on replace
          () => Math.random().toString(), 
          mode,
          user.uid
      );
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
    addIntegrante,
    updateIntegrante,
    deleteIntegrante,
    addRazon,
    updateRazon,
    deleteRazon,
    importIntegrantes,
    importRazones,
    importFinancialRecords,
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
