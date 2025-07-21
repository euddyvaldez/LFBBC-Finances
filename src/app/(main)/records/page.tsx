
'use client';
import { useAppContext } from '@/contexts/AppProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState, useMemo, useRef, useEffect } from 'react';
import { format, parse, isValid, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Download, Loader2, Upload, Tag, User, Calendar as CalendarIcon, Pencil, Trash2, ChevronLeft, ChevronRight, Cloud, HardDrive } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { FinancialRecord, Movimiento } from '@/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Autocomplete } from '@/components/Autocomplete';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthProvider';
import { Label } from '@/components/ui/label';
import { isFirebaseConfigured } from '@/lib/firebase';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const DESCRIPTION_MAX_LENGTH = 500;

const recordSchema = z.object({
  id: z.string().optional(),
  fecha: z.date({ required_error: 'La fecha es requerida.' }),
  integranteId: z.string().min(1, 'El integrante es requerido.'),
  razonId: z.string().min(1, 'La razón es requerida.'),
  movimiento: z.enum(['INGRESOS', 'GASTOS', 'INVERSION'], { required_error: 'El movimiento es requerido.' }),
  monto: z.coerce.number().positive('El monto debe ser un número positivo.'),
  descripcion: z.string().max(DESCRIPTION_MAX_LENGTH, `La descripción no puede exceder los ${DESCRIPTION_MAX_LENGTH} caracteres.`).optional(),
});

type RecordFormData = z.infer<typeof recordSchema>;

const parseDate = (dateStr: string) => parse(dateStr, 'dd/MM/yyyy', new Date());

const RecordsForm = ({ record, onFinished }: { record?: FinancialRecord, onFinished?: () => void }) => {
  const { razones, integrantes, addFinancialRecord, updateFinancialRecord, financialRecords, recordDates } = useAppContext();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RecordFormData>({
    resolver: zodResolver(recordSchema),
  });

  const watchedDescription = form.watch('descripcion');

  useEffect(() => {
    if (record) {
      const parsedDate = record.fecha ? parseDate(record.fecha) : new Date();
      form.reset({
        ...record,
        fecha: isValid(parsedDate) ? parsedDate : new Date(),
        monto: Math.abs(record.monto), // Always show positive amount in form
      });
    } else {
       form.reset({
        fecha: new Date(),
        movimiento: 'INGRESOS',
        descripcion: '',
        monto: '' as any,
        integranteId: '',
        razonId: '',
      });
    }
  }, [record, form]);

  const onSubmit = async (values: RecordFormData) => {
    setIsSubmitting(true);
    try {
      const recordData = {
        ...values,
        fecha: format(values.fecha, 'dd/MM/yyyy'),
        descripcion: values.descripcion || '',
      };
      
      if(record?.id) {
        await updateFinancialRecord(record.id, recordData);
        toast({ title: 'Éxito', description: 'Registro actualizado correctamente.' });
      } else {
        await addFinancialRecord(recordData);
        toast({ title: 'Éxito', description: 'Registro agregado correctamente.' });
        form.reset({
            ...form.getValues(),
            integranteId: '',
            razonId: '',
            monto: '' as any,
            descripcion: ''
        });
      }
      onFinished?.();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: `No se pudo ${record?.id ? 'actualizar' : 'agregar'} el registro.` });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const uniqueDescriptionOptions = useMemo(() => {
    const descriptions = new Set(financialRecords.map(r => r.descripcion).filter(Boolean));
    return Array.from(descriptions).map(d => ({ value: d, label: d }));
  }, [financialRecords]);

  const integranteOptions = useMemo(() => 
    integrantes.map(i => ({ value: i.id, label: i.nombre })), 
  [integrantes]);

  const razonOptions = useMemo(() =>
    razones.map(r => ({ value: r.id, label: r.descripcion })),
  [razones]);

  const title = record?.id ? 'Editar Registro' : 'Añadir Nuevo Registro';

  const disabledDates = (date: Date) => {
    if (record) return false; // Allow any date when editing
    return !recordDates.has(startOfDay(date).getTime());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="fecha" render={({ field }) => (
                    <FormItem className="flex flex-col"><FormLabel>Fecha</FormLabel>
                        <Popover><PopoverTrigger asChild>
                            <FormControl><Button variant={'outline'} className={cn('w-full justify-start text-left font-normal',!field.value && 'text-muted-foreground')}>
                                {field.value ? format(field.value, 'PPP', { locale: es }) : <span>Elige una fecha</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button>
                            </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar 
                                mode="single" 
                                selected={field.value} 
                                onSelect={field.onChange}
                                disabled={(date) => date > new Date() || date < new Date('1900-01-01')}
                                initialFocus />
                        </PopoverContent>
                        </Popover><FormMessage />
                    </FormItem>)} />
                
                <FormField control={form.control} name="integranteId" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Integrante</FormLabel>
                    <Autocomplete
                      options={integranteOptions}
                      value={field.value}
                      onChange={(value) => form.setValue('integranteId', value, { shouldValidate: true })}
                      placeholder="Busca o selecciona un integrante"
                    />
                    <FormMessage />
                  </FormItem>)} />

                <FormField control={form.control} name="razonId" render={({ field }) => (
                   <FormItem className="flex flex-col">
                    <FormLabel>Razón</FormLabel>
                    <Autocomplete
                      options={razonOptions}
                      value={field.value}
                      onChange={(value) => form.setValue('razonId', value, { shouldValidate: true })}
                      placeholder="Busca o selecciona una razón"
                    />
                    <FormMessage />
                  </FormItem>)} />

                <FormField control={form.control} name="monto" render={({ field }) => (
                    <FormItem><FormLabel>Monto</FormLabel><FormControl><Input type="number" placeholder="0.00" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                
                <FormField
                  control={form.control}
                  name="descripcion"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Descripción (Opcional)</FormLabel>
                        <Autocomplete
                          options={uniqueDescriptionOptions}
                          value={field.value || ''}
                          onChange={(value) => field.onChange(value)}
                          placeholder="Detalles del movimiento..."
                          allowCustomValue={true}
                        />
                      <div className="text-xs text-right text-muted-foreground mt-1">
                        {(watchedDescription || '')?.length} / {DESCRIPTION_MAX_LENGTH}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField control={form.control} name="movimiento" render={({ field }) => (
                    <FormItem className="md:col-span-2"><FormLabel>Movimiento</FormLabel>
                        <div className="grid grid-cols-3 gap-2">
                        {(['INGRESOS', 'GASTOS', 'INVERSION'] as Movimiento[]).map((mov) => (
                            <Button type="button" key={mov} variant={field.value === mov ? 'default' : 'outline'} onClick={() => field.onChange(mov)}>{mov}</Button>
                        ))}</div><FormMessage />
                    </FormItem>)} />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {record?.id ? 'Guardar Cambios' : 'Agregar Registro'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

const EditRecordDialog = ({ record }: { record: FinancialRecord }) => {
    const [open, setOpen] = useState(false);
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="icon" variant="ghost"><Pencil className="h-4 w-4" /></Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[625px]">
                <RecordsForm record={record} onFinished={() => setOpen(false)} />
            </DialogContent>
        </Dialog>
    );
};

const DeleteRecordAlert = ({ recordId, recordDesc }: { recordId: string; recordDesc: string; }) => {
    const { deleteFinancialRecord } = useAppContext();
    const { toast } = useToast();

    const handleDelete = async () => {
        try {
            await deleteFinancialRecord(recordId);
            toast({ title: "Éxito", description: "Registro eliminado." });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar el registro.' });
        }
    };
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4"/></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta acción no se puede deshacer. Se eliminará permanentemente el registro: "{recordDesc}".
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Sí, eliminar</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

const RecordCard = ({ record, getIntegranteName, getRazonDesc }: { record: FinancialRecord; getIntegranteName: (id: string) => string; getRazonDesc: (id: string) => string }) => {
    const movimientoColors: { [key in Movimiento]: string } = {
        'INGRESOS': 'border-l-green-500',
        'GASTOS': 'border-l-red-500',
        'INVERSION': 'border-l-amber-500'
    };
    
    const recordDate = record.fecha ? parseDate(record.fecha) : null;
    const formattedDate = recordDate && isValid(recordDate) ? format(recordDate, 'dd MMMM yyyy', { locale: es }) : 'Fecha inválida';
    const monto = typeof record.monto === 'number' ? record.monto : 0;


    return (
        <Card className={cn("mb-3 overflow-hidden", movimientoColors[record.movimiento], 'border-l-4')}>
            <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <p className="font-semibold text-lg flex-1 pr-2">{record.descripcion || <span className="italic text-muted-foreground">Sin descripción</span>}</p>
                     <div className="flex items-center">
                        <EditRecordDialog record={record} />
                        <DeleteRecordAlert recordId={record.id} recordDesc={record.descripcion || `Registro del ${formattedDate}`} />
                    </div>
                </div>
                 <div className={cn('font-mono font-bold text-lg', monto >= 0 ? 'text-green-500' : 'text-red-500')}>
                    {monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                </div>
                <div className="text-sm text-muted-foreground space-y-2">
                    <div className="flex items-center gap-2"><Tag className="w-4 h-4" /> <span>{getRazonDesc(record.razonId)} ({record.movimiento})</span></div>
                    <div className="flex items-center gap-2"><User className="w-4 h-4" /> <span>{getIntegranteName(record.integranteId)}</span></div>
                    <div className="flex items-center gap-2"><CalendarIcon className="w-4 h-4" /> <span>{formattedDate}</span></div>
                </div>
            </CardContent>
        </Card>
    );
};

const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(currentField.trim());
            currentField = '';
        } else {
            currentField += char;
        }
    }
    result.push(currentField.trim());
    return result.map(field => field.startsWith('"') && field.endsWith('"') ? field.slice(1, -1) : field);
}


const RecordsTable = ({ records }: { records: FinancialRecord[] }) => {
  const { integrantes, razones, importFinancialRecords, importFinancialRecordsLocal } = useAppContext();
  const { toast } = useToast();
  const [filter, setFilter] = useState('');
  const [filterField, setFilterField] = useState('descripcion');

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDestination, setImportDestination] = useState<'local' | 'cloud'>(isFirebaseConfigured ? 'cloud' : 'local');
  const [importMode, setImportMode] = useState<'add' | 'replace'>('add');
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

  const getIntegranteName = (id: string) => integrantes.find((i) => i.id === id)?.nombre || 'N/A';
  const getRazonDesc = (id: string) => razones.find((r) => r.id === id)?.descripcion || 'N/A';
  
  const filteredRecords = useMemo(() => {
    const sortedRecords = [...records].sort((a, b) => {
        const dateA = a.fecha ? parseDate(a.fecha).getTime() : 0;
        const dateB = b.fecha ? parseDate(b.fecha).getTime() : 0;
        if (isNaN(dateA) || isNaN(dateB)) return 0;
        return dateB - dateA;
    });

    if (!filter) return sortedRecords;
    return sortedRecords.filter((record) => {
      let fieldValue = '';
      switch (filterField) {
        case 'descripcion': fieldValue = record.descripcion; break;
        case 'integrante': fieldValue = getIntegranteName(record.integranteId); break;
        case 'razon': fieldValue = getRazonDesc(record.razonId); break;
        case 'fecha': fieldValue = record.fecha; break;
        default: fieldValue = record.descripcion;
      }
      return fieldValue.toLowerCase().includes(filter.toLowerCase());
    });
  }, [filter, filterField, records, integrantes, razones]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, filterField, recordsPerPage]);

  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * recordsPerPage;
    return filteredRecords.slice(startIndex, startIndex + recordsPerPage);
  }, [currentPage, recordsPerPage, filteredRecords]);

  const totalPages = Math.ceil(filteredRecords.length / recordsPerPage);

  const exportToCSV = () => {
    const headers = ['fecha', 'integranteNombre', 'movimiento', 'razonDescripcion', 'descripcion', 'monto'];
    const rows = filteredRecords.map(r => [
      r.fecha,
      `"${getIntegranteName(r.integranteId).replace(/"/g, '""')}"`,
      r.movimiento,
      `"${getRazonDesc(r.razonId).replace(/"/g, '""')}"`,
      `"${r.descripcion.replace(/"/g, '""')}"`,
      r.monto
    ].join(','));
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "registros_financieros.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Éxito', description: 'Registros exportados a CSV.' });
  };
  
  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  const processImport = () => {
    if (!importFile) {
        toast({ variant: 'destructive', title: 'Error', description: 'Por favor, selecciona un archivo.' });
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target?.result;
        if (typeof text !== 'string') {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo leer el archivo.' });
            return;
        }
        try {
            const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
            const headers = parseCsvLine(lines[0]).map(h => h.trim());
            
            const requiredHeaders = ['fecha', 'integranteNombre', 'movimiento', 'razonDescripcion', 'descripcion', 'monto'];
            const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
            if (missingHeaders.length > 0) {
              throw new Error(`Faltan las siguientes columnas en el CSV: ${missingHeaders.join(', ')}`);
            }
            
            const recordsToImport: Omit<FinancialRecord, 'id' | 'userId'>[] = [];
            const errors: string[] = [];

            const integranteMap = new Map(integrantes.map(i => [i.nombre.toLowerCase(), i.id]));
            const razonMap = new Map(razones.map(r => [r.descripcion.toLowerCase(), r.id]));

            for (let i = 1; i < lines.length; i++) {
                const values = parseCsvLine(lines[i]);
                if (values.length !== headers.length) {
                    errors.push(`Línea ${i + 1}: El número de columnas (${values.length}) no coincide con el de las cabeceras (${headers.length}).`);
                    continue;
                }
                const row = headers.reduce((obj, header, index) => {
                    obj[header] = values[index];
                    return obj;
                }, {} as {[key: string]: string});

                if (row.descripcion && row.descripcion.length > DESCRIPTION_MAX_LENGTH) {
                    errors.push(`Línea ${i + 1}: La descripción excede los ${DESCRIPTION_MAX_LENGTH} caracteres.`);
                    continue;
                }

                const integranteId = integranteMap.get(row.integranteNombre?.toLowerCase());
                const razonId = razonMap.get(row.razonDescripcion?.toLowerCase());
                
                if (!integranteId) { errors.push(`Línea ${i + 1}: No se encontró el integrante "${row.integranteNombre}".`); continue; }
                if (!razonId) { errors.push(`Línea ${i + 1}: No se encontró la razón "${row.razonDescripcion}".`); continue; }
                
                recordsToImport.push({
                    fecha: row.fecha,
                    integranteId: integranteId,
                    razonId: razonId,
                    movimiento: row.movimiento as Movimiento,
                    descripcion: row.descripcion,
                    monto: parseFloat(row.monto)
                });
            }
            
            if (errors.length > 0) {
              throw new Error(errors.join(' '));
            }

            if (recordsToImport.length > 0) {
                if (importDestination === 'cloud') {
                    await importFinancialRecords(recordsToImport, importMode);
                } else {
                    await importFinancialRecordsLocal(recordsToImport, importMode);
                }
                toast({ title: 'Éxito', description: `${recordsToImport.length} registros importados en modo "${importMode}".` });
            } else {
                toast({ title: 'Información', description: 'No se encontraron nuevos registros para importar.' });
            }

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Un error desconocido ocurrió.';
            toast({ variant: 'destructive', title: 'Error de importación', description: `No se pudo procesar el archivo CSV. ${message}`, duration: 8000 });
        } finally {
            setImportFile(null);
            if (importFileInputRef.current) importFileInputRef.current.value = '';
            setIsImportDialogOpen(false);
        }
    };
    reader.readAsText(importFile);
  };
  
  const PaginationControls = () => (
    <div className="flex items-center justify-between mt-4">
        <div className='flex items-center gap-2'>
            <span className="text-sm text-muted-foreground">Filas por página</span>
            <Select value={String(recordsPerPage)} onValueChange={(v) => setRecordsPerPage(Number(v))}>
                <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                    {[10, 20, 50, 100].map(v => <SelectItem key={v} value={String(v)}>{v}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
        <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Página {currentPage} de {totalPages}</span>
            <div className='flex items-center gap-2'>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}><ChevronLeft /></Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}><ChevronRight /></Button>
            </div>
        </div>
    </div>
  );


  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Historial de Registros</CardTitle>
          <CardDescription>Consulta y filtra todos los movimientos financieros.</CardDescription>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4">
             <div className="flex flex-col sm:flex-row gap-2 flex-1">
                <Select value={filterField} onValueChange={setFilterField}>
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Filtrar por..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="descripcion">Descripción</SelectItem>
                    <SelectItem value="integrante">Integrante</SelectItem>
                    <SelectItem value="razon">Razón</SelectItem>
                    <SelectItem value="fecha">Fecha (dd/MM/yyyy)</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Buscar..." value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
              <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className="w-full"><Upload className="mr-2 h-4 w-4"/>Importar</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Importar Registros desde CSV</DialogTitle>
                        <DialogDescription>
                            Selecciona el archivo, el destino y el modo de importación.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="grid w-full max-w-sm items-center gap-1.5">
                            <Label htmlFor="csv-file">Archivo CSV</Label>
                            <Input id="csv-file" type="file" accept=".csv" onChange={handleFileSelected} ref={importFileInputRef} />
                            {importFile && <p className="text-sm text-muted-foreground">Archivo seleccionado: {importFile.name}</p>}
                        </div>

                        <div>
                            <Label>Destino de Importación</Label>
                            <RadioGroup value={importDestination} onValueChange={(v) => setImportDestination(v as 'local' | 'cloud')} className="mt-2 grid grid-cols-2 gap-4">
                                <div>
                                    <RadioGroupItem value="local" id="local" className="peer sr-only" />
                                    <Label htmlFor="local" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                        <HardDrive className="mb-3 h-6 w-6" />
                                        Local
                                    </Label>
                                </div>
                                <div>
                                    <RadioGroupItem value="cloud" id="cloud" className="peer sr-only" />
                                    <Label htmlFor="cloud" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                                        <Cloud className="mb-3 h-6 w-6" />
                                        Nube
                                    </Label>
                                </div>
                            </RadioGroup>
                        </div>

                        <div>
                           <Label>Modo de Importación</Label>
                           <Select value={importMode} onValueChange={(v) => setImportMode(v as 'add' | 'replace')}>
                               <SelectTrigger className="mt-2">
                                   <SelectValue />
                               </SelectTrigger>
                               <SelectContent>
                                   <SelectItem value="add">Agregar a existentes</SelectItem>
                                   <SelectItem value="replace">Reemplazar existentes</SelectItem>
                               </SelectContent>
                           </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={processImport} disabled={!importFile}>Importar</Button>
                    </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button onClick={exportToCSV} variant="outline" className="w-full"><Download className="mr-2 h-4 w-4"/>Exportar</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
            <PaginationControls />
            {/* Mobile View: Cards */}
            <div className="md:hidden mt-4">
              {paginatedRecords.length > 0 ? (
                  paginatedRecords.map((record) => (
                      <RecordCard key={record.id} record={record} getIntegranteName={getIntegranteName} getRazonDesc={getRazonDesc} />
                  ))
              ) : (
                  <div className="text-center py-8 text-muted-foreground">No hay registros que mostrar.</div>
              )}
            </div>

            {/* Desktop View: Table */}
            <div className="hidden md:block mt-4">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Integrante</TableHead>
                            <TableHead>Movimiento</TableHead>
                            <TableHead>Razón</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {paginatedRecords.length > 0 ? (
                            paginatedRecords.map((record) => {
                                const recordDate = record.fecha ? parseDate(record.fecha) : null;
                                const formattedDate = recordDate && isValid(recordDate) ? format(recordDate, 'dd MMM yyyy', { locale: es }) : 'Fecha inválida';
                                const monto = typeof record.monto === 'number' ? record.monto : 0;
                                return (
                                <TableRow key={record.id}>
                                    <TableCell className="whitespace-nowrap">{formattedDate}</TableCell>
                                    <TableCell>{getIntegranteName(record.integranteId)}</TableCell>
                                    <TableCell>{record.movimiento}</TableCell>
                                    <TableCell>{getRazonDesc(record.razonId)}</TableCell>
                                    <TableCell>{record.descripcion || '-'}</TableCell>
                                    <TableCell className={cn('text-right font-mono', monto >= 0 ? 'text-green-500' : 'text-red-500')}>
                                    {monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end items-center">
                                            <EditRecordDialog record={record} />
                                            <DeleteRecordAlert recordId={record.id} recordDesc={record.descripcion || `Registro del ${formattedDate}`} />
                                        </div>
                                    </TableCell>
                                </TableRow>
                                );
                            })
                        ) : (
                            <TableRow><TableCell colSpan={7} className="text-center">No hay registros que mostrar.</TableCell></TableRow>
                        )}
                        </TableBody>
                    </Table>
                </div>
            </div>
             <PaginationControls />
        </CardContent>
      </Card>
    </>
  );
};


export default function RecordsPage() {
    const { financialRecords, loading } = useAppContext();
    const { loading: authLoading } = useAuth();

    if (loading || authLoading) {
        return (
          <div className="flex justify-center items-center h-[calc(100vh-10rem)]">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
          </div>
        );
      }
    return (
        <div className="space-y-6">
            <RecordsForm />
            <RecordsTable records={financialRecords} />
        </div>
    );
}
