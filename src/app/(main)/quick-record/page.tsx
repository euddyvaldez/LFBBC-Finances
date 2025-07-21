
'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { format, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/contexts/AppProvider';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useMemo, useState } from 'react';
import type { Movimiento } from '@/types';
import { Autocomplete } from '@/components/Autocomplete';

const DESCRIPTION_MAX_LENGTH = 500;

const quickRecordSchema = z.object({
  fecha: z.date({
    required_error: 'La fecha es requerida.',
  }),
  razonId: z.string().min(1, 'La razón es requerida.'),
  monto: z.coerce.number().positive('El monto debe ser un número positivo.'),
  integranteId: z.string().min(1, 'El integrante es requerido.'),
  movimiento: z.enum(['INGRESOS', 'GASTOS', 'INVERSION'], {
    required_error: 'El tipo de movimiento es requerido.',
  }),
  descripcion: z.string().max(DESCRIPTION_MAX_LENGTH, `La descripción no puede exceder los ${DESCRIPTION_MAX_LENGTH} caracteres.`).optional(),
});

export default function QuickRecordPage() {
  const { razones, integrantes, addFinancialRecord, loading, financialRecords, recordDates } = useAppContext();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof quickRecordSchema>>({
    resolver: zodResolver(quickRecordSchema),
    defaultValues: {
      fecha: new Date(),
      monto: '' as any,
      movimiento: 'INGRESOS',
      razonId: '',
      integranteId: '',
      descripcion: '',
    },
  });
  
  const watchedDescription = form.watch('descripcion');

  const quickRazones = useMemo(() => {
    return razones
      .filter((r) => r.isQuickReason)
      .sort((a, b) => {
        if (a.descripcion === 'MENSUALIDAD') return -1;
        if (b.descripcion === 'MENSUALIDAD') return 1;
        if (a.descripcion === 'SEMANAL') return -1;
        if (b.descripcion === 'SEMANAL') return 1;
        return a.descripcion.localeCompare(b.descripcion);
      });
  }, [razones]);

  const onSubmit = async (values: z.infer<typeof quickRecordSchema>) => {
    setIsSubmitting(true);
    try {
      const razonDesc = razones.find((r) => r.id === values.razonId)?.descripcion || '';
      await addFinancialRecord({
        ...values,
        fecha: format(values.fecha, 'dd/MM/yyyy'),
        descripcion: values.descripcion || razonDesc,
      });
      toast({
        title: 'Éxito',
        description: 'Registro rápido agregado correctamente.',
      });
      form.reset({
        ...form.getValues(),
        razonId: '',
        integranteId: '',
        monto: '' as any,
        movimiento: 'INGRESOS',
        descripcion: '',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'No se pudo agregar el registro.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const integranteOptions = useMemo(() => 
    integrantes.map(i => ({ value: i.id, label: i.nombre })), 
  [integrantes]);
  
  const uniqueDescriptionOptions = useMemo(() => {
    const descriptions = new Set(financialRecords.map(r => r.descripcion).filter(Boolean));
    return Array.from(descriptions).map(d => ({ value: d, label: d }));
  }, [financialRecords]);

  const disabledDates = (date: Date) => {
    return !recordDates.has(startOfDay(date).getTime());
  }

  return (
    <div className="space-y-6">
       <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl">Registro Rápido</CardTitle>
          <CardDescription>
            Agrega una transacción común de forma veloz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="fecha"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={'outline'}
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP', { locale: es })
                            ) : (
                              <span>Elige una fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date > new Date() || date < new Date('1900-01-01') || disabledDates(date)
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="razonId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razón</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una razón rápida" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {quickRazones.map((razon) => (
                          <SelectItem key={razon.id} value={razon.id}>
                            {razon.descripcion}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="monto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="0.00" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="integranteId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Integrante</FormLabel>
                     <Autocomplete
                        options={integranteOptions}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Selecciona un integrante"
                      />
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="descripcion"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Descripción (Opcional)</FormLabel>
                      <Autocomplete
                        options={uniqueDescriptionOptions}
                        value={field.value || ''}
                        onChange={field.onChange}
                        placeholder="Detalles del movimiento..."
                        allowCustomValue={true}
                      />
                     <div className="text-xs text-right text-muted-foreground mt-1">
                        {watchedDescription?.length || 0} / {DESCRIPTION_MAX_LENGTH}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="movimiento"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Movimiento</FormLabel>
                    <FormControl>
                        <div className='grid grid-cols-3 gap-2'>
                        {(['INGRESOS', 'GASTOS', 'INVERSION'] as Movimiento[]).map((mov) => (
                            <Button 
                                type="button"
                                key={mov}
                                variant={field.value === mov ? 'default' : 'outline'}
                                onClick={() => field.onChange(mov)}
                            >
                                {mov}
                            </Button>
                        ))}
                        </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting || loading}>
                {(isSubmitting || loading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Agregar Rápido
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
