
import { Timestamp } from 'firebase/firestore';

export type Movimiento = 'INGRESOS' | 'GASTOS' | 'INVERSION';

interface BaseEntity {
  id: string;
  userId: string;
  createdAt: Timestamp | number; // Support both server and client timestamps
  updatedAt: Timestamp | number; // Support both server and client timestamps
  isDeleted?: boolean;
}

export interface Razon extends BaseEntity {
  descripcion: string;
  isQuickReason: boolean;
  isProtected?: boolean;
}

export interface Integrante extends BaseEntity {
  nombre: string;
  isProtected?: boolean;
}

export interface FinancialRecord extends BaseEntity {
  fecha: string; // 'dd/MM/yyyy'
  integranteId: string;
  razonId: string;
  movimiento: Movimiento;
  monto: number;
  descripcion: string;
}

export interface Cita {
  texto: string;
  autor: string;
}
