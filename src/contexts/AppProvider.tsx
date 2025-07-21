
'use client';
import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import type { FinancialRecord, Integrante, Razon } from '@/types';
import * as api from '@/lib/data';
import { isFirebaseConfigured } from '@/lib/firebase';
import { parse, isValid, startOfDay } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/hooks/use-toast';

interface AppContextType {
  integrantes: Integrante[];
  razones: Razon[];
  financialRecords: FinancialRecord[];
  recordDates: Set<number>;
  loading: boolean;
  error: Error | null;
  syncWithCloud: () => Promise<void>;
  addFinancialRecord: (record: Omit<FinancialRecord, 'id' | 'userId'>) => Promise<void>;
  updateFinancialRecord: (id: string, record: Partial<Omit<FinancialRecord, 'id' | 'userId'>>) => Promise<void>;
  deleteFinancialRecord: (id: string) => Promise<void>;
  addIntegrante: (nombre: string, isProtected?: boolean) => Promise<void>;
  updateIntegrante: (id: string, nombre: string) => Promise<void>;
  deleteIntegrante: (id: string) => Promise<void>;
  addRazon: (descripcion: string, isQuickReason?: boolean, isProtected?: boolean) => Promise<void>;
  updateRazon: (id: string, updates: Partial<Omit<Razon, 'id' | 'userId'>>) => Promise<void>;
  deleteRazon: (id: string) => Promise<void>;
  importIntegrantes: (integrantes: Omit<Integrante, 'id'| 'userId'>[], mode: 'add' | 'replace', destination: 'local' | 'cloud') => Promise<void>;
  importRazones: (razones: Omit<Razon, 'id'| 'userId'>[], mode: 'add' | 'replace', destination: 'local' | 'cloud') => Promise<void>;
  importFinancialRecords: (records: Omit<FinancialRecord, 'id' | 'userId'>[], mode: 'add' | 'replace', destination: 'local' | 'cloud') => Promise<void>;
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
  const [pendingOps, setPendingOps] = useState<PendingOperation[]>(() => getFromLocalStorage('pendingOps', []));
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    // This effect ensures that on initial load, the state is read from localStorage and then we stop loading.
    setIntegrantes(getFromLocalStorage('integrantes', []));
    setRazones(getFromLocalStorage('razones', []));
    setFinancialRecords(getFromLocalStorage('financialRecords', []));
    setPendingOps(getFromLocalStorage('pendingOps', []));
    setLoading(false);
  }, []);

  useEffect(() => setToLocalStorage('integrantes', integrantes), [integrantes]);
  useEffect(() => setToLocalStorage('razones', razones), [razones]);
  useEffect(() => setToLocalStorage('financialRecords', financialRecords), [financialRecords]);
  useEffect(() => setToLocalStorage('pendingOps', pendingOps), [pendingOps]);

  const addPendingOp = (op: PendingOperation) => {
      setPendingOps(prev => [...prev, op]);
  }

  const syncWithCloud = async () => {
    if (!isFirebaseConfigured) {
      toast({
        variant: 'destructive',
        title: 'Error de Configuración',
        description: 'Firebase no está configurado. No se puede sincronizar.',
      });
      return;
    }
    setLoading(true);
    try {
      // 1. Push local changes to the cloud
      const opsToSync = [...pendingOps];
      if (opsToSync.length > 0) {
        console.log(`Enviando ${opsToSync.length} operaciones pendientes a la nube...`);
        for (const op of opsToSync) {
          // This assumes API functions handle the actual Firestore logic
          switch (op.type) {
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
        }
        // Clear pending operations after successful sync
        setPendingOps([]);
        console.log("Operaciones pendientes sincronizadas.");
      }

      // 2. Pull all data from the cloud and overwrite local storage
      console.log("Descargando datos actualizados de la nube...");
      const [cloudIntegrantes, cloudRazones, cloudRecords] = await Promise.all([
        api.getData('integrantes', DEFAULT_USER_ID) as Promise<Integrante[]>,
        api.getData('razones', DEFAULT_USER_ID) as Promise<Razon[]>,
        api.getData('financialRecords', DEFAULT_USER_ID) as Promise<FinancialRecord[]>,
      ]);
      
      setIntegrantes(cloudIntegrantes);
      setRazones(cloudRazones);
      setFinancialRecords(cloudRecords);

      console.log("Sincronización con la nube completada.");

    } catch (e) {
      const err = e instanceof Error ? e : new Error("Error desconocido durante la sincronización");
      console.error("Error de sincronización:", err);
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };


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

  // --- CRUD Functions now operate on local state first ---

  const addFinancialRecord = async (record: Omit<FinancialRecord, 'id' | 'userId'>) => {
    let monto = record.monto;
    if ((record.movimiento === 'GASTOS' || record.movimiento === 'INVERSION') && monto > 0) monto = -monto;
    if (record.movimiento === 'INGRESOS' && monto < 0) monto = Math.abs(monto);
    const finalRecord = { ...record, monto };

    const newRecord: FinancialRecord = { ...finalRecord, id: uuidv4(), userId: DEFAULT_USER_ID };
    setFinancialRecords(prev => [...prev, newRecord]);
    addPendingOp({ type: 'addFinancialRecord', payload: finalRecord });
  };
  
  const updateFinancialRecord = async (id: string, updates: Partial<Omit<FinancialRecord, 'id' | 'userId'>>) => {
      setFinancialRecords(prev => prev.map(r => r.id === id ? { ...r, ...updates, fecha: updates.fecha || r.fecha } : r));
      addPendingOp({ type: 'updateFinancialRecord', payload: { id, updates } });
  };

  const deleteFinancialRecord = async (id: string) => {
      setFinancialRecords(prev => prev.filter(r => r.id !== id));
      addPendingOp({ type: 'deleteFinancialRecord', payload: { id } });
  };
  
  const addIntegrante = async (nombre: string, isProtected = false) => {
    const newIntegrante: Integrante = { id: uuidv4(), nombre: nombre.toUpperCase(), isProtected, userId: DEFAULT_USER_ID };
    setIntegrantes(prev => [...prev, newIntegrante]);
    addPendingOp({ type: 'addIntegrante', payload: { nombre, isProtected } });
  };

  const updateIntegrante = async (id: string, nombre: string) => {
      setIntegrantes(prev => prev.map(i => i.id === id ? { ...i, nombre: nombre.toUpperCase() } : i));
      addPendingOp({ type: 'updateIntegrante', payload: { id, nombre } });
  };

  const deleteIntegrante = async (id: string) => {
      setIntegrantes(prev => prev.filter(i => i.id !== id));
      addPendingOp({ type: 'deleteIntegrante', payload: { id } });
  };

  const addRazon = async (descripcion: string, isQuickReason = false, isProtected = false) => {
      const newRazon: Razon = { id: uuidv4(), descripcion: descripcion.toUpperCase(), isQuickReason, isProtected, userId: DEFAULT_USER_ID };
      setRazones(prev => [...prev, newRazon]);
      addPendingOp({ type: 'addRazon', payload: { descripcion, isQuickReason, isProtected } });
  };

  const updateRazon = async (id: string, updates: Partial<Omit<Razon, 'id' | 'userId'>>) => {
      setRazones(prev => prev.map(r => r.id === id ? { ...r, ...updates, descripcion: (updates.descripcion || r.descripcion).toUpperCase() } : r));
      addPendingOp({ type: 'updateRazon', payload: { id, updates } });
  };
  
  const deleteRazon = async (id: string) => {
      setRazones(prev => prev.filter(r => r.id !== id));
      addPendingOp({ type: 'deleteRazon', payload: { id } });
  };

  const importIntegrantesLocal = async (integrantesToImport: Omit<Integrante, 'id' | 'userId'>[], mode: 'add' | 'replace') => {
      let finalIntegrantes = [...integrantes];
      if (mode === 'replace') {
          finalIntegrantes = finalIntegrantes.filter(i => i.isProtected);
      }

      const newIntegrantes = integrantesToImport.map(i => ({...i, nombre: i.nombre.toUpperCase(), id: uuidv4(), userId: DEFAULT_USER_ID }));
      
      if (mode === 'add') {
          const existingNames = new Set(finalIntegrantes.map(i => i.nombre.toLowerCase()));
          const toAdd = newIntegrantes.filter(i => !existingNames.has(i.nombre.toLowerCase()));
          finalIntegrantes.push(...toAdd);
      } else {
          finalIntegrantes.push(...newIntegrantes);
      }
      setIntegrantes(finalIntegrantes);
  };
  
  const importIntegrantes = async (integrantesToImport: Omit<Integrante, 'id' | 'userId'>[], mode: 'add' | 'replace', destination: 'local' | 'cloud') => {
    if (destination === 'local') {
      return importIntegrantesLocal(integrantesToImport, mode);
    }
    // Cloud
    if (!isFirebaseConfigured) {
      toast({variant: 'destructive', title: 'Error', description: 'Firebase no está configurado para importación en la nube.'});
      throw new Error("Firebase not configured for cloud import");
    }
    await api.importIntegrantes(integrantesToImport, mode, DEFAULT_USER_ID);
    await syncWithCloud(); // Refresh local data
  };

  const importRazonesLocal = async (razonesToImport: Omit<Razon, 'id' | 'userId'>[], mode: 'add' | 'replace') => {
      let finalRazones = [...razones];
      if (mode === 'replace') {
          finalRazones = finalRazones.filter(r => r.isProtected);
      }

      const newRazones = razonesToImport.map(r => ({...r, descripcion: r.descripcion.toUpperCase(), id: uuidv4(), userId: DEFAULT_USER_ID}));
      
      if (mode === 'add') {
          const existingDescriptions = new Set(finalRazones.map(r => r.descripcion.toLowerCase()));
          const toAdd = newRazones.filter(r => !existingDescriptions.has(r.descripcion.toLowerCase()));
          finalRazones.push(...toAdd);
      } else {
          finalRazones.push(...newRazones);
      }
      setRazones(finalRazones);
  };

  const importRazones = async (razonesToImport: Omit<Razon, 'id'| 'userId'>[], mode: 'add' | 'replace', destination: 'local' | 'cloud') => {
    if (destination === 'local') {
      return importRazonesLocal(razonesToImport, mode);
    }
    // Cloud
    if (!isFirebaseConfigured) {
      toast({variant: 'destructive', title: 'Error', description: 'Firebase no está configurado para importación en la nube.'});
      throw new Error("Firebase not configured for cloud import");
    }
    await api.importRazones(razonesToImport, mode, DEFAULT_USER_ID);
    await syncWithCloud(); // Refresh local data
  }

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
  
  const importFinancialRecords = async (records: Omit<FinancialRecord, 'id'| 'userId'>[], mode: 'add' | 'replace', destination: 'local' | 'cloud') => {
    if (destination === 'local') {
      return importFinancialRecordsLocal(records, mode);
    }
    // Cloud
    if (!isFirebaseConfigured) {
      toast({variant: 'destructive', title: 'Error', description: 'Firebase no está configurado para importación en la nube.'});
      throw new Error("Firebase not configured for cloud import");
    }
    await api.importFinancialRecords(records, mode, DEFAULT_USER_ID);
    await syncWithCloud(); // Refresh local data
  }

  const value: AppContextType = {
    integrantes,
    razones,
    financialRecords,
    recordDates,
    loading,
    error,
    syncWithCloud,
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
