
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
  addFinancialRecord: (record: Omit<FinancialRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateFinancialRecord: (id: string, record: Partial<Omit<FinancialRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  deleteFinancialRecord: (id: string) => Promise<void>;
  addIntegrante: (nombre: string, isProtected?: boolean) => Promise<void>;
  updateIntegrante: (id: string, nombre: string) => Promise<void>;
  deleteIntegrante: (id: string) => Promise<void>;
  addRazon: (descripcion: string, isQuickReason?: boolean, isProtected?: boolean) => Promise<void>;
  updateRazon: (id: string, updates: Partial<Omit<Razon, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  deleteRazon: (id: string) => Promise<void>;
  importRazonesLocal: (razones: Omit<Razon, 'id'| 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => Promise<void>;
  importIntegrantesLocal: (integrantes: Omit<Integrante, 'id'| 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => Promise<void>;
  importFinancialRecordsLocal: (records: Omit<FinancialRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => Promise<void>;
}

type PendingOperation = 
  | { type: 'add', collection: 'financialRecords', payload: FinancialRecord }
  | { type: 'update', collection: 'financialRecords', payload: { id: string, updates: Partial<FinancialRecord> } }
  | { type: 'delete', collection: 'financialRecords', payload: { id: string } }
  | { type: 'add', collection: 'integrantes', payload: Integrante }
  | { type: 'update', collection: 'integrantes', payload: { id: string, updates: Partial<Integrante> } }
  | { type: 'delete', collection: 'integrantes', payload: { id: string } }
  | { type: 'add', collection: 'razones', payload: Razon }
  | { type: 'update', collection: 'razones', payload: { id: string, updates: Partial<Razon> } }
  | { type: 'delete', collection: 'razones', payload: { id: string } };

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
            title: 'Firebase no configurado',
            description: 'No se puede sincronizar. Por favor, configura tus credenciales de Firebase.',
        });
        return;
    }
    setLoading(true);
    try {
        const lastSyncTimestamp = getFromLocalStorage<number | null>('lastSyncTimestamp', null);
        
        // 1. PUSH local changes to cloud
        const opsToSync = [...pendingOps];
        if (opsToSync.length > 0) {
            console.log(`Enviando ${opsToSync.length} operaciones pendientes a la nube...`);
            await api.batchProcess(opsToSync);
            setPendingOps([]);
            console.log("Operaciones pendientes sincronizadas.");
        }

        // 2. PULL changes from cloud
        console.log("Descargando cambios desde la nube...");
        const {
            integrantes: cloudIntegrantes,
            razones: cloudRazones,
            financialRecords: cloudRecords,
        } = await api.getChangesSince(lastSyncTimestamp, DEFAULT_USER_ID);
        
        // 3. MERGE cloud changes into local state
        setIntegrantes(prev => mergeData(prev, cloudIntegrantes));
        setRazones(prev => mergeData(prev, cloudRazones));
        setFinancialRecords(prev => mergeData(prev, cloudRecords));
        
        console.log("Fusión de datos completada.");

        // 4. Update sync timestamp
        setToLocalStorage('lastSyncTimestamp', new Date().getTime());

        toast({
          title: 'Sincronización Completa',
          description: 'Tus datos locales están actualizados.',
        });

    } catch (e) {
      const err = e instanceof Error ? e : new Error("Error desconocido durante la sincronización");
      console.error("Error de sincronización:", err);
      setError(err);
      toast({
          variant: 'destructive',
          title: 'Error de Sincronización',
          description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const mergeData = <T extends { id: string; updatedAt?: number; isDeleted?: boolean }>(
    localData: T[],
    cloudChanges: T[]
  ): T[] => {
      const localDataMap = new Map(localData.map(item => [item.id, item]));

      cloudChanges.forEach(cloudItem => {
          localDataMap.set(cloudItem.id, cloudItem);
      });
      
      return Array.from(localDataMap.values()).filter(item => !item.isDeleted);
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

  // --- CRUD Functions ---

  const addFinancialRecord = async (record: Omit<FinancialRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
    let monto = record.monto;
    if ((record.movimiento === 'GASTOS' || record.movimiento === 'INVERSION') && monto > 0) monto = -monto;
    if (record.movimiento === 'INGRESOS' && monto < 0) monto = Math.abs(monto);
    
    const now = new Date().getTime();
    const newRecord: FinancialRecord = { 
        ...record, 
        monto,
        id: uuidv4(), 
        userId: DEFAULT_USER_ID,
        createdAt: now,
        updatedAt: now,
    };
    
    setFinancialRecords(prev => [...prev, newRecord]);
    addPendingOp({ type: 'add', collection: 'financialRecords', payload: newRecord });
  };
  
  const updateFinancialRecord = async (id: string, updates: Partial<Omit<FinancialRecord, 'id' | 'userId'>>) => {
      const now = new Date().getTime();
      const finalUpdates = {...updates, updatedAt: now };
      setFinancialRecords(prev => prev.map(r => r.id === id ? { ...r, ...finalUpdates, fecha: updates.fecha || r.fecha } : r));
      addPendingOp({ type: 'update', collection: 'financialRecords', payload: { id, updates: finalUpdates } });
  };

  const deleteFinancialRecord = async (id: string) => {
      setFinancialRecords(prev => prev.filter(r => r.id !== id));
      addPendingOp({ type: 'delete', collection: 'financialRecords', payload: { id } });
  };
  
  const addIntegrante = async (nombre: string, isProtected = false) => {
    const now = new Date().getTime();
    const newIntegrante: Integrante = { 
        id: uuidv4(), 
        nombre: nombre.toUpperCase(), 
        isProtected, 
        userId: DEFAULT_USER_ID,
        createdAt: now,
        updatedAt: now,
    };
    setIntegrantes(prev => [...prev, newIntegrante]);
    addPendingOp({ type: 'add', collection: 'integrantes', payload: newIntegrante });
  };

  const updateIntegrante = async (id: string, nombre: string) => {
      const updates = { nombre: nombre.toUpperCase(), updatedAt: new Date().getTime() };
      setIntegrantes(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
      addPendingOp({ type: 'update', collection: 'integrantes', payload: { id, updates } });
  };

  const deleteIntegrante = async (id: string) => {
      setIntegrantes(prev => prev.filter(i => i.id !== id));
      addPendingOp({ type: 'delete', collection: 'integrantes', payload: { id } });
  };

  const addRazon = async (descripcion: string, isQuickReason = false, isProtected = false) => {
      const now = new Date().getTime();
      const newRazon: Razon = { 
          id: uuidv4(), 
          descripcion: descripcion.toUpperCase(), 
          isQuickReason, 
          isProtected, 
          userId: DEFAULT_USER_ID,
          createdAt: now,
          updatedAt: now,
      };
      setRazones(prev => [...prev, newRazon]);
      addPendingOp({ type: 'add', collection: 'razones', payload: newRazon });
  };

  const updateRazon = async (id: string, updates: Partial<Omit<Razon, 'id' | 'userId'>>) => {
      const now = new Date().getTime();
      const finalUpdates: Partial<Razon> = { 
          ...updates,
          updatedAt: now,
          descripcion: (updates.descripcion || '').toUpperCase()
      };
      if (updates.descripcion) {
        finalUpdates.descripcion = updates.descripcion.toUpperCase();
      }

      setRazones(prev => prev.map(r => r.id === id ? { ...r, ...finalUpdates } as Razon : r));
      addPendingOp({ type: 'update', collection: 'razones', payload: { id, updates: finalUpdates } });
  };
  
  const deleteRazon = async (id: string) => {
      setRazones(prev => prev.filter(r => r.id !== id));
      addPendingOp({ type: 'delete', collection: 'razones', payload: { id } });
  };

  const importIntegrantesLocal = async (integrantesToImport: Omit<Integrante, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => {
      let finalIntegrantes = [...integrantes];
      if (mode === 'replace') {
          finalIntegrantes = finalIntegrantes.filter(i => i.isProtected);
      }

      const now = new Date().getTime();
      const newIntegrantes = integrantesToImport.map(i => ({
        ...i, 
        nombre: i.nombre.toUpperCase(), 
        id: uuidv4(), 
        userId: DEFAULT_USER_ID,
        createdAt: now,
        updatedAt: now,
      }));
      
      if (mode === 'add') {
          const existingNames = new Set(finalIntegrantes.map(i => i.nombre.toLowerCase()));
          const toAdd = newIntegrantes.filter(i => !existingNames.has(i.nombre.toLowerCase()));
          finalIntegrantes.push(...toAdd);
      } else {
          finalIntegrantes.push(...newIntegrantes);
      }
      setIntegrantes(finalIntegrantes);
  };
  
  const importRazonesLocal = async (razonesToImport: Omit<Razon, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => {
      let finalRazones = [...razones];
      if (mode === 'replace') {
          finalRazones = finalRazones.filter(r => r.isProtected);
      }
      
      const now = new Date().getTime();
      const newRazones = razonesToImport.map(r => ({
          ...r, 
          descripcion: r.descripcion.toUpperCase(), 
          id: uuidv4(), 
          userId: DEFAULT_USER_ID,
          createdAt: now,
          updatedAt: now,
        }));
      
      if (mode === 'add') {
          const existingDescriptions = new Set(finalRazones.map(r => r.descripcion.toLowerCase()));
          const toAdd = newRazones.filter(r => !existingDescriptions.has(r.descripcion.toLowerCase()));
          finalRazones.push(...toAdd);
      } else {
          finalRazones.push(...newRazones);
      }
      setRazones(finalRazones);
  };

   const importFinancialRecordsLocal = async (records: Omit<FinancialRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>[], mode: 'add' | 'replace') => {
      let finalRecords = [...financialRecords];
      if (mode === 'replace') {
          finalRecords = [];
      }
      
      const now = new Date().getTime();
      const recordsWithIds = records.map(r => ({ 
          ...r, 
          id: uuidv4(), 
          userId: DEFAULT_USER_ID,
          createdAt: now,
          updatedAt: now,
      }));

      if (mode === 'add') {
          finalRecords.push(...recordsWithIds);
      } else {
          finalRecords = recordsWithIds;
      }
      setFinancialRecords(finalRecords);
  };

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
    importIntegrantesLocal,
    importRazonesLocal,
    importFinancialRecordsLocal,
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
