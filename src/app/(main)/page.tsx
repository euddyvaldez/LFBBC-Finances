
'use client';

import { useAppContext } from '@/contexts/AppProvider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Loader2, ArrowRight, Zap, PieChart, Users, BookCopy, BarChart3, Repeat, TrendingUp, Cloud, AlertCircle } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getCitas } from '@/lib/data';
import type { Cita } from '@/types';
import Link from 'next/link';
import { format, startOfMonth, endOfMonth, isWithinInterval, parse, isValid, getDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { isFirebaseConfigured } from '@/lib/firebase';

const parseDate = (dateStr: string) => parse(dateStr, 'dd/MM/yyyy', new Date());

export default function DashboardPage() {
  const { financialRecords, loading, razones, integrantes, syncWithCloud } = useAppContext();
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [currentCitaIndex, setCurrentCitaIndex] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const handleSync = async () => {
    if (!isFirebaseConfigured) {
        toast({
            variant: 'destructive',
            title: 'Error de Configuración',
            description: 'Firebase no está configurado. No se puede sincronizar.',
        });
        return;
    }
    setIsSyncing(true);
    try {
        await syncWithCloud();
        toast({
            title: 'Sincronización Completa',
            description: 'Tus datos locales se han sincronizado con la nube.',
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Ocurrió un error desconocido.';
        toast({
            variant: 'destructive',
            title: 'Error de Sincronización',
            description: message,
        });
    } finally {
        setIsSyncing(false);
    }
  };


  useEffect(() => {
    const fetchCitas = async () => {
      const fetchedCitas = await getCitas();
      setCitas(fetchedCitas);
      if (fetchedCitas.length > 0) {
        setCurrentCitaIndex(Math.floor(Math.random() * fetchedCitas.length));
      }
    };
    fetchCitas();
  }, []);

  useEffect(() => {
    if (citas.length === 0) return;
    
    const timer = setInterval(() => {
      setCurrentCitaIndex((prevIndex) => (prevIndex + 1) % citas.length);
    }, 20000);

    return () => clearInterval(timer);
  }, [citas.length]);

  const { 
    balance, 
    monthlyIncome, 
    monthlyExpenses, 
    recentRecords, 
    dailyAverageIncome, 
    dailyAverageExpenses,
    uniqueIntegrantesCount,
    monthlyRecordsCount,
    averageDailyMembers,
    averageDailyRecords,
    top5Reasons,
  } = useMemo(() => {
    const validRecords = financialRecords.filter(r => r.fecha && isValid(parseDate(r.fecha)));

    const balance = validRecords.reduce((acc, record) => acc + (record.monto || 0), 0);
    
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const monthlyRecords = validRecords.filter(r => isWithinInterval(parseDate(r.fecha), { start: monthStart, end: monthEnd }));
    
    const monthlyIncome = monthlyRecords
        .filter(r => r.movimiento === 'INGRESOS')
        .reduce((acc, r) => acc + (r.monto || 0), 0);
        
    const monthlyExpenses = monthlyRecords
        .filter(r => r.movimiento === 'GASTOS')
        .reduce((acc, r) => acc + (r.monto || 0), 0);

    const recentRecords = [...validRecords]
      .sort((a, b) => parseDate(b.fecha).getTime() - parseDate(a.fecha).getTime())
      .slice(0, 5);

    const uniqueIntegrantesInMonth = new Set(monthlyRecords.map(r => r.integranteId));
    
    const activeDaysInMonth = new Set(monthlyRecords.map(r => parseDate(r.fecha).getDate()));
    const numberOfActiveDays = activeDaysInMonth.size;

    const dailyAverageIncome = numberOfActiveDays > 0 ? monthlyIncome / numberOfActiveDays : 0;
    const dailyAverageExpenses = numberOfActiveDays > 0 ? Math.abs(monthlyExpenses) / numberOfActiveDays : 0;
    
    const monthlyRecordsCount = monthlyRecords.length;
    const averageDailyRecords = numberOfActiveDays > 0 ? monthlyRecordsCount / numberOfActiveDays : 0;
    
    // --- Logic for averageDailyMembers on Thursdays ---
    const thursdayRecords = monthlyRecords.filter(r => getDay(parseDate(r.fecha)) === 4);
    
    let averageDailyMembers = 0;
    if (thursdayRecords.length > 0) {
      const uniqueMembersOnThursdays = new Set(thursdayRecords.map(r => r.integranteId));
      const activeThursdays = new Set(thursdayRecords.map(r => parseDate(r.fecha).getDate()));
      const numberOfActiveThursdays = activeThursdays.size;

      if (numberOfActiveThursdays > 0) {
        averageDailyMembers = uniqueMembersOnThursdays.size / numberOfActiveThursdays;
      }
    }
    // --- End of new logic ---

    // --- Top 5 Reasons Logic ---
    const reasonCounts = monthlyRecords.reduce((acc, record) => {
        const razonId = record.razonId;
        if(razonId) {
            acc[razonId] = (acc[razonId] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    const sortedReasons = Object.keys(reasonCounts).sort((a, b) => reasonCounts[b] - reasonCounts[a]).slice(0, 5);

    const top5Reasons = sortedReasons.map(razonId => {
        const razonInfo = razones.find(r => r.id === razonId);
        const recordsForReason = monthlyRecords.filter(r => r.razonId === razonId);
        
        const totals = recordsForReason.reduce((acc, record) => {
            const monto = record.monto || 0;
            if (record.movimiento === 'INGRESOS') acc.ingresos += monto;
            if (record.movimiento === 'GASTOS') acc.gastos += Math.abs(monto);
            if (record.movimiento === 'INVERSION') acc.inversion += Math.abs(monto);
            return acc;
        }, { ingresos: 0, gastos: 0, inversion: 0 });

        return {
            id: razonId,
            descripcion: razonInfo?.descripcion || 'Razón Desconocida',
            count: reasonCounts[razonId],
            ...totals
        };
    });
    // --- End of Top 5 Reasons ---

    return { 
        balance, 
        monthlyIncome, 
        monthlyExpenses: Math.abs(monthlyExpenses), 
        recentRecords, 
        dailyAverageIncome, 
        dailyAverageExpenses,
        uniqueIntegrantesCount: uniqueIntegrantesInMonth.size,
        monthlyRecordsCount: monthlyRecords.length,
        averageDailyMembers,
        averageDailyRecords,
        top5Reasons
    };
  }, [financialRecords, razones, integrantes]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const getIntegranteName = (id: string) => integrantes.find((i) => i.id === id)?.nombre || 'N/A';
  const getRazonDesc = (id: string) => razones.find((r) => r.id === id)?.descripcion || 'N/A';

  if (loading && !isSyncing) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Inicio</h1>
        <Button onClick={handleSync} disabled={isSyncing || !isFirebaseConfigured} className="w-full sm:w-auto">
            {isSyncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
                <Cloud className="mr-2 h-4 w-4" />
            )}
            {isSyncing ? 'Sincronizando...' : 'Sincronizar con la Nube'}
        </Button>
      </div>
      
      {!isFirebaseConfigured && (
          <Card className="bg-yellow-50 border-yellow-300 dark:bg-yellow-950 dark:border-yellow-800">
              <CardContent className="p-4 flex items-center gap-4">
                  <AlertCircle className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                  <div>
                      <p className="font-bold text-yellow-800 dark:text-yellow-200">Modo Local Activado</p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          Firebase no está configurado. Todos los datos se guardan solo en este dispositivo.
                      </p>
                  </div>
              </CardContent>
          </Card>
      )}

      <div className="grid gap-4 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Main Balance Card */}
        <Card className="lg:col-span-2 shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl md:text-2xl font-semibold text-muted-foreground">
              Balance General
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 md:space-y-6 text-center">
            {balanceVisible ? (
              <p className={cn('text-4xl md:text-5xl font-bold tracking-tighter', balance >= 0 ? 'text-green-500' : 'text-red-500')}>
                {formatCurrency(balance)}
              </p>
            ) : (
               <p className="text-3xl md:text-4xl font-bold text-muted-foreground tracking-widest animate-pulse">
                -- OCULTO --
              </p>
            )}
            <Button variant="ghost" onClick={() => setBalanceVisible(!balanceVisible)}>
              {balanceVisible ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
              {balanceVisible ? 'Ocultar' : 'Mostrar'} Balance
            </Button>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="space-y-4">
            <Card className="h-full flex flex-col justify-center">
                <CardHeader>
                    <CardTitle>Accesos Directos</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                     <Link href="/quick-record" passHref>
                        <Button className="w-full justify-start"><Zap className="mr-2"/>Registro Rápido</Button>
                     </Link>
                     <Link href="/financial-panel" passHref>
                        <Button className="w-full justify-start"><PieChart className="mr-2"/>Panel Financiero</Button>
                     </Link>
                </CardContent>
            </Card>
        </div>

        {/* Monthly Summary */}
        <Card>
            <CardHeader>
                <CardTitle>Resumen del Mes</CardTitle>
                <CardDescription>{format(new Date(), 'MMMM yyyy', { locale: es })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Ingresos</span>
                    <span className="font-bold text-green-500">{formatCurrency(monthlyIncome)}</span>
                </div>
                 <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Gastos</span>
                    <span className="font-bold text-red-500">{formatCurrency(monthlyExpenses)}</span>
                </div>
                <div className="flex justify-between items-center text-xs pt-2 border-t mt-2">
                    <span className="text-muted-foreground">Prom. Ingreso Diario</span>
                    <span className="font-medium text-green-500/80">{formatCurrency(dailyAverageIncome)}</span>
                </div>
                 <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Prom. Gasto Diario</span>
                    <span className="font-medium text-red-500/80">{formatCurrency(dailyAverageExpenses)}</span>
                </div>
                <div className="flex justify-between items-center text-xs pt-2 border-t mt-2">
                    <span className="flex items-center gap-1 text-muted-foreground"><BookCopy className="h-3 w-3" /> Cant. de Registros</span>
                    <span className="font-medium">{monthlyRecordsCount}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground"><Users className="h-3 w-3" /> Integrantes Activos</span>
                    <span className="font-medium">{uniqueIntegrantesCount}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground"><Repeat className="h-3 w-3" /> Prom. Registros/Día</span>
                    <span className="font-medium">{averageDailyRecords.toFixed(2)}</span>
                </div>
                 <div className="flex justify-between items-center text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground"><BarChart3 className="h-3 w-3" /> Prom. Integrantes/Día</span>
                    <span className="font-medium">{averageDailyMembers.toFixed(2)}</span>
                </div>
            </CardContent>
        </Card>

        {/* Recent Records */}
        <Card>
            <CardHeader>
                <CardTitle>Registros Recientes</CardTitle>
                <CardDescription>Las últimas 5 transacciones.</CardDescription>
            </CardHeader>
            <CardContent>
                {recentRecords.length > 0 ? (
                    <ul className="space-y-3">
                        {recentRecords.map((record) => {
                           const recordDate = parseDate(record.fecha);
                           const formattedDate = isValid(recordDate) ? format(recordDate, 'dd MMM yyyy', { locale: es }) : 'Fecha inválida';
                           const monto = typeof record.monto === 'number' ? record.monto : 0;
                           return (
                           <li key={record.id} className="flex justify-between items-center">
                               <div>
                                   <p className="font-medium text-sm">{getIntegranteName(record.integranteId)}</p>
                                   <p className="text-xs text-muted-foreground">{getRazonDesc(record.razonId)} - {formattedDate}</p>
                               </div>
                               <span className={cn('font-mono font-semibold text-sm', monto >= 0 ? 'text-green-500' : 'text-red-500')}>
                                   {formatCurrency(monto)}
                               </span>
                           </li>
                        )})}
                    </ul>
                ) : (
                     <p className="text-center text-muted-foreground py-4">No hay registros recientes.</p>
                )}
                 <Button variant="link" asChild className="p-0 h-auto mt-4">
                    <Link href="/records">Ver todos los registros <ArrowRight className="ml-1 h-4 w-4"/></Link>
                </Button>
            </CardContent>
        </Card>

        {/* Top 5 Reasons */}
        <Card>
            <CardHeader>
                <CardTitle>Top 5 Razones del Mes</CardTitle>
                <CardDescription>Las razones más frecuentes.</CardDescription>
            </CardHeader>
            <CardContent>
                {top5Reasons.length > 0 ? (
                    <ul className="space-y-4">
                       {top5Reasons.map((reason) => (
                           <li key={reason.id}>
                               <div className="flex justify-between items-start">
                                   <p className="font-medium text-sm flex-1 pr-2">{reason.descripcion}</p>
                                   <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">{reason.count} {reason.count === 1 ? 'vez' : 'veces'}</span>
                               </div>
                               <div className="text-xs text-muted-foreground mt-1 space-x-2">
                                   {reason.ingresos > 0 && <span className="text-green-500">I: {formatCurrency(reason.ingresos)}</span>}
                                   {reason.gastos > 0 && <span className="text-red-500">G: {formatCurrency(reason.gastos)}</span>}
                                   {reason.inversion > 0 && <span className="text-amber-500">N: {formatCurrency(reason.inversion)}</span>}
                               </div>
                           </li>
                       ))}
                    </ul>
                ) : (
                    <p className="text-center text-muted-foreground py-4">No hay datos de razones para este mes.</p>
                )}
                 <Button variant="link" asChild className="p-0 h-auto mt-4">
                    <Link href="/reasons">Ver todas las razones <ArrowRight className="ml-1 h-4 w-4"/></Link>
                </Button>
            </CardContent>
        </Card>

      </div>

      <Card className="w-full shadow-md">
        <CardContent className="p-6">
            {citas.length > 0 ? (
                 <blockquote className="text-center italic">
                    <p className="text-base md:text-lg">"{citas[currentCitaIndex].texto}"</p>
                    <footer className="mt-2 text-sm text-muted-foreground">- {citas[currentCitaIndex].autor}</footer>
                </blockquote>
            ) : (
                <div className="text-center text-muted-foreground">Cargando cita...</div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
