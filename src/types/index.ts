
export type Movimiento = 'INGRESOS' | 'GASTOS' | 'INVERSION';

interface BaseEntity {
  id: string;
  userId: string;
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
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
