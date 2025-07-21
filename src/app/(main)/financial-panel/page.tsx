
'use client';
import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/DatePicker';
import { useAppContext } from '@/contexts/AppProvider';
import { subMonths, format, parse, isValid, startOfYear, endOfYear, differenceInMonths, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { FinancialChart } from '@/components/FinancialChart';
import type { FinancialRecord } from '@/types';
import { Loader2 } from 'lucide-react';

type FilterMode = 'predefined' | 'custom';
type ViewType = 'yearly' | 'monthly' | 'daily';
type ChartType = 'line' | 'bar' | 'pie';

const parseDate = (dateStr: string) => parse(dateStr, 'dd/MM/yyyy', new Date());

export default function FinancialPanelPage() {
  const { financialRecords, loading } = useAppContext();
  const [filterMode, setFilterMode] = useState<FilterMode>('predefined');
  const [viewType, setViewType] = useState<ViewType>('yearly');
  const [customViewType, setCustomViewType] = useState<ViewType>('daily');
  const [chartType, setChartType] = useState<ChartType>('bar');
  
  const oldestRecordDate = useMemo(() => {
    if (financialRecords.length === 0) return new Date();
    const dates = financialRecords
      .map(r => r.fecha ? parseDate(r.fecha) : null)
      .filter(d => d && isValid(d)) as Date[];
    if (dates.length === 0) return new Date();
    return new Date(Math.min.apply(null, dates.map(d => d.getTime())));
  }, [financialRecords]);

  const newestRecordDate = useMemo(() => {
    if (financialRecords.length === 0) return new Date();
    const dates = financialRecords
      .map(r => r.fecha ? parseDate(r.fecha) : null)
      .filter(d => d && isValid(d)) as Date[];
    if (dates.length === 0) return new Date();
    return new Date(Math.max.apply(null, dates.map(d => d.getTime())));
  }, [financialRecords]);

  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(oldestRecordDate);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(newestRecordDate);
  
  const availableYears = useMemo(() => {
    if (financialRecords.length === 0) return [new Date().getFullYear()];
    const years = new Set(financialRecords.map(r => {
        const date = r.fecha ? parseDate(r.fecha) : null;
        return date && isValid(date) ? date.getFullYear() : null;
    }).filter(y => y !== null) as Set<number>);
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    return sortedYears.length > 0 ? sortedYears : [new Date().getFullYear()];
  }, [financialRecords]);

  const [selectedYear, setSelectedYear] = useState<string>(String(availableYears[0]));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(new Date().getMonth()));

  useEffect(() => {
    setSelectedYear(String(availableYears[0]));
  }, [availableYears]);

  useEffect(() => {
    setCustomStartDate(oldestRecordDate);
    setCustomEndDate(newestRecordDate);
  }, [oldestRecordDate, newestRecordDate]);
  
  const filteredRecords = useMemo(() => {
    let recordsToFilter = financialRecords.filter(r => {
        if (!r.fecha) return false;
        const date = parseDate(r.fecha);
        return isValid(date);
    });

    if (filterMode === 'predefined') {
      const year = parseInt(selectedYear, 10);
      const month = parseInt(selectedMonth, 10);
      
      let startDate: Date;
      let endDate: Date;

      switch (viewType) {
        case 'yearly':
          return recordsToFilter;
        
        case 'monthly':
            startDate = new Date(year, 0, 1);
            endDate = new Date(year, 11, 31, 23, 59, 59);
            break;
            
        case 'daily':
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 1, 0, 23, 59, 59);
            break;

        default:
            return [];
      }
      
      return recordsToFilter.filter(r => {
        const recordDate = parseDate(r.fecha);
        return recordDate >= startDate && recordDate <= endDate;
      });

    } else { // custom range
      if (!customStartDate || !customEndDate) return [];
      const startDate = customStartDate;
      const endDate = customEndDate;
      // Ensure start date is before end date
      const rangeStart = startOfDay(startDate < endDate ? startDate : endDate);
      const rangeEnd = new Date(endDate.setHours(23, 59, 59, 999));
      
      return recordsToFilter.filter(r => {
        const recordDate = parseDate(r.fecha);
        return recordDate >= rangeStart && recordDate <= rangeEnd;
      });
    }
  }, [financialRecords, filterMode, viewType, selectedYear, selectedMonth, customStartDate, customEndDate]);

  const summary = useMemo(() => {
    return filteredRecords.reduce(
      (acc, record) => {
        const monto = typeof record.monto === 'number' ? record.monto : 0;
        if (record.movimiento === 'INGRESOS') acc.ingresos += monto;
        if (record.movimiento === 'GASTOS') acc.gastos += Math.abs(monto);
        if (record.movimiento === 'INVERSION') acc.inversion += Math.abs(monto);
        return acc;
      },
      { ingresos: 0, gastos: 0, inversion: 0, balance: 0 }
    );
  }, [filteredRecords]);

  const balance = useMemo(() => {
      return filteredRecords.reduce((acc, record) => {
          const monto = typeof record.monto === 'number' ? record.monto : 0;
          return acc + monto;
      }, 0);
  }, [filteredRecords]);

  const chartData = useMemo(() => {
    const dataMap = new Map<string, { ingresos: number; gastos: number; inversion: number }>();
    
    let activeViewType: ViewType;
    if (filterMode === 'predefined') {
        activeViewType = viewType;
        if(viewType === 'yearly') {
            const allRecordsYears = new Set(financialRecords.map(r => {
                const date = r.fecha ? parseDate(r.fecha) : null;
                return date && isValid(date) ? date.getFullYear() : null;
            }).filter(Boolean));
            if (allRecordsYears.size === 1) {
                 activeViewType = 'monthly';
            }
        }
    } else {
        activeViewType = customViewType;
    }


    filteredRecords.forEach(record => {
      const recordDate = parseDate(record.fecha);
      if(!isValid(recordDate) || typeof record.monto !== 'number') return;

      let key = '';
      switch(activeViewType) {
        case 'yearly': key = format(recordDate, 'yyyy'); break;
        case 'monthly': key = format(recordDate, 'yyyy-MM'); break;
        case 'daily': key = format(recordDate, 'yyyy-MM-dd'); break;
      }
      
      if (!dataMap.has(key)) {
        dataMap.set(key, { ingresos: 0, gastos: 0, inversion: 0 });
      }
      
      const entry = dataMap.get(key)!;
      const monto = record.monto;
      if (record.movimiento === 'INGRESOS') entry.ingresos += monto;
      if (record.movimiento === 'GASTOS') entry.gastos += Math.abs(monto);
      if (record.movimiento === 'INVERSION') entry.inversion += Math.abs(monto);
    });
    
    const sortedEntries = Array.from(dataMap.entries()).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));

    return sortedEntries.map(([key, value]) => {
      let label = key;
      let keyFormat: string;
      switch(activeViewType) {
        case 'yearly': keyFormat = 'yyyy'; break;
        case 'monthly': keyFormat = 'yyyy-MM'; break;
        default: keyFormat = 'yyyy-MM-dd'; break;
      }

      const keyDate = parse(key, keyFormat, new Date());
      if(isValid(keyDate)) {
         switch(activeViewType) {
            case 'yearly': label = format(keyDate, 'yyyy'); break;
            case 'monthly': label = format(keyDate, 'MMM yyyy', { locale: es }); break;
            case 'daily': label = format(keyDate, 'd MMM yyyy', { locale: es }); break;
         }
      }
      return { name: label, ...value };
    });
  }, [filteredRecords, viewType, filterMode, customViewType, financialRecords]);


  const formatCurrency = (amount: number) => {
    if (isNaN(amount)) {
        return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(0);
    }
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Panel Financiero</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Ingresos del Período" value={formatCurrency(summary.ingresos)} color="text-green-500" />
        <SummaryCard title="Gastos del Período" value={formatCurrency(summary.gastos)} color="text-red-500" />
        <SummaryCard title="Inversión del Período" value={formatCurrency(summary.inversion)} color="text-amber-500" />
        <SummaryCard title="Balance del Período" value={formatCurrency(balance)} color={balance >= 0 ? "text-green-500" : "text-red-500"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Análisis Detallado</CardTitle>
          <CardDescription>Filtra y visualiza tus movimientos financieros.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            <div className='flex flex-col gap-4 w-full md:w-auto'>
                <div className="flex bg-muted p-1 rounded-lg w-full max-w-[320px]">
                  <Button variant={filterMode === 'predefined' ? 'default' : 'ghost'} onClick={() => setFilterMode('predefined')} className="flex-1 text-xs sm:text-sm">Predefinidos</Button>
                  <Button variant={filterMode === 'custom' ? 'default' : 'ghost'} onClick={() => setFilterMode('custom')} className="flex-1 text-xs sm:text-sm">Personalizado</Button>
                </div>
                
                {filterMode === 'predefined' ? (
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex bg-muted p-1 rounded-lg w-full max-w-[320px]">
                      <Button variant={viewType === 'daily' ? 'default' : 'ghost'} onClick={() => setViewType('daily')} className="flex-1 text-xs sm:text-sm">Diaria</Button>
                      <Button variant={viewType === 'monthly' ? 'default' : 'ghost'} onClick={() => setViewType('monthly')} className="flex-1 text-xs sm:text-sm">Mensual</Button>
                      <Button variant={viewType === 'yearly' ? 'default' : 'ghost'} onClick={() => setViewType('yearly')} className="flex-1 text-xs sm:text-sm">Anual</Button>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                        {viewType !== 'yearly' && (
                        <Select value={selectedYear} onValueChange={setSelectedYear}>
                            <SelectTrigger className="w-full sm:w-[120px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                            {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        )}
                        {viewType === 'daily' && (
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => (
                                <SelectItem key={i} value={String(i)}>
                                {format(new Date(2000, i, 1), 'MMMM', { locale: es })}
                                </SelectItem>
                            ))}
                            </SelectContent>
                        </Select>
                        )}
                    </div>
                </div>
                ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row gap-2">
                      <DatePicker date={customStartDate} setDate={setCustomStartDate} />
                      <DatePicker date={customEndDate} setDate={setCustomEndDate} />
                  </div>
                  <div className="flex bg-muted p-1 rounded-lg w-full max-w-[320px]">
                      <Button variant={customViewType === 'daily' ? 'default' : 'ghost'} onClick={() => setCustomViewType('daily')} className="flex-1 text-xs sm:text-sm">Diaria</Button>
                      <Button variant={customViewType === 'monthly' ? 'default' : 'ghost'} onClick={() => setCustomViewType('monthly')} className="flex-1 text-xs sm:text-sm">Mensual</Button>
                      <Button variant={customViewType === 'yearly' ? 'default' : 'ghost'} onClick={() => setCustomViewType('yearly')} className="flex-1 text-xs sm:text-sm">Anual</Button>
                  </div>
                </div>
                )}
            </div>
            
            <div className="flex justify-center bg-muted p-1 rounded-lg w-full max-w-[320px] md:w-auto">
                <Button variant={chartType === 'bar' ? 'default' : 'ghost'} onClick={() => setChartType('bar')} className="flex-1">Barra</Button>
                <Button variant={chartType === 'line' ? 'default' : 'ghost'} onClick={() => setChartType('line')} className="flex-1">Línea</Button>
                <Button variant={chartType === 'pie' ? 'default' : 'ghost'} onClick={() => setChartType('pie')} className="flex-1">Pastel</Button>
            </div>
          </div>

          <div>
            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : chartData.length > 0 ? (
                <FinancialChart chartType={chartType} data={chartData} />
            ) : (
                <div className="text-center text-muted-foreground p-8">No hay datos para el período y filtros seleccionados.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const SummaryCard = ({ title, value, color }: { title: string; value: string; color: string }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </CardContent>
  </Card>
);
