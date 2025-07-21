
'use client';
import { useAppContext } from '@/contexts/AppProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Download, Loader2, Pencil, Save, Trash2, Upload, X, Zap, Cloud, HardDrive } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Razon } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { isFirebaseConfigured } from '@/lib/firebase';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export default function ReasonsPage() {
  const { razones, addRazon, updateRazon, deleteRazon, financialRecords, loading, importRazones, importRazonesLocal } = useAppContext();
  const { toast } = useToast();

  const [newRazonDesc, setNewRazonDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDesc, setEditingDesc] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('alpha-asc');

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDestination, setImportDestination] = useState<'local' | 'cloud'>(isFirebaseConfigured ? 'cloud' : 'local');
  const [importMode, setImportMode] = useState<'add' | 'replace'>('add');
  const importFileInputRef = useRef<HTMLInputElement>(null);


  const handleAdd = async () => {
    if (!newRazonDesc.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'La descripción no puede estar vacía.' });
      return;
    }
    if (razones.some(r => r.descripcion.toLowerCase() === newRazonDesc.trim().toLowerCase())) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ya existe una razón con esta descripción.' });
      return;
    }
    try {
      await addRazon(newRazonDesc, false, false);
      toast({ title: 'Éxito', description: 'Razón agregada.' });
      setNewRazonDesc('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo agregar la razón.' });
    }
  };
  
  const handleEdit = (razon: typeof razones[0]) => {
    setEditingId(razon.id);
    setEditingDesc(razon.descripcion);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingDesc('');
  };
  
  const handleSave = async (id: string) => {
    if (!editingDesc.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'La descripción no puede estar vacía.' });
      return;
    }
    if (razones.some(r => r.id !== id && r.descripcion.toLowerCase() === editingDesc.trim().toLowerCase())) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ya existe otra razón con esta descripción.' });
      return;
    }
    try {
      await updateRazon(id, { descripcion: editingDesc });
      toast({ title: 'Éxito', description: 'Razón actualizada.' });
      handleCancelEdit();
    } catch (error) {
       const message = error instanceof Error ? error.message : 'No se pudo actualizar la razón.';
       toast({ variant: 'destructive', title: 'Error', description: message });
    }
  };

  const handleDelete = async (id: string) => {
    const isUsed = financialRecords.some(r => r.razonId === id);
    if (isUsed) {
        toast({ variant: 'destructive', title: 'Acción denegada', description: 'No se puede eliminar una razón que tiene registros financieros asociados.' });
        return;
    }
    try {
        await deleteRazon(id);
        toast({ title: 'Éxito', description: 'Razón eliminada.' });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo eliminar la razón.';
        toast({ variant: 'destructive', title: 'Error', description: message });
    }
  };

  const handleToggleQuickReason = async (razon: typeof razones[0]) => {
    try {
      await updateRazon(razon.id, { isQuickReason: !razon.isQuickReason });
      toast({ title: 'Éxito', description: `'${razon.descripcion}' ${!razon.isQuickReason ? 'ahora es una razón rápida.' : 'ya no es una razón rápida.'}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar la razón.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    }
  };

  const exportToCSV = () => {
    const headers = ['descripcion', 'isQuickReason', 'isProtected'];
    const rows = filteredAndSortedRazones.map(r => [
      `"${r.descripcion.replace(/"/g, '""')}"`,
      !!r.isQuickReason,
      !!r.isProtected,
    ].join(','));
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "razones.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Éxito', description: 'Razones exportadas a CSV.' });
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
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const descIndex = headers.indexOf('descripcion');
        const quickIndex = headers.indexOf('isquickreason');
        const protectedIndex = headers.indexOf('isprotected');


        if (descIndex === -1) {
          throw new Error('La columna "descripcion" no fue encontrada en el CSV.');
        }

        const newRazones: Omit<Razon, 'id' | 'userId'>[] = [];
        const existingDescriptions = new Set(razones.map(r => r.descripcion.toLowerCase()));

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          const descripcion = values[descIndex]?.replace(/"/g, '').trim();
          
          if (descripcion) {
            const isQuickReason = quickIndex !== -1 ? (values[quickIndex]?.trim().toLowerCase() === 'true') : false;
            const isProtected = protectedIndex !== -1 ? (values[protectedIndex]?.trim().toLowerCase() === 'true') : false;

            const item = { descripcion, isQuickReason, isProtected };

            if (importMode === 'add' && !existingDescriptions.has(descripcion.toLowerCase())) {
                newRazones.push(item);
            } else if (importMode === 'replace') {
                newRazones.push(item);
            }
          }
        }
        
        if (newRazones.length > 0) {
          if (importDestination === 'cloud') {
              await importRazones(newRazones, importMode);
          } else {
              await importRazonesLocal(newRazones, importMode);
          }
          toast({ title: 'Éxito', description: `${newRazones.length} nuevas razones importadas en modo "${importMode}".` });
        } else {
          toast({ title: 'Información', description: 'No se encontraron nuevas razones para importar o no hay cambios.' });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Un error desconocido ocurrió.';
        toast({ variant: 'destructive', title: 'Error de importación', description: `No se pudo procesar el archivo CSV. ${message}` });
      } finally {
        setImportFile(null);
        if(importFileInputRef.current) importFileInputRef.current.value = '';
        setIsImportDialogOpen(false);
      }
    };
    reader.readAsText(importFile);
  };
  
  const filteredAndSortedRazones = useMemo(() => {
    return razones
      .filter(r => r.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        if (a.isProtected && !b.isProtected) return -1;
        if (!a.isProtected && b.isProtected) return 1;
        switch (sortOrder) {
          case 'alpha-asc': return a.descripcion.localeCompare(b.descripcion);
          case 'alpha-desc': return b.descripcion.localeCompare(a.descripcion);
          case 'id-asc': return a.id.localeCompare(b.id);
          case 'id-desc': return b.id.localeCompare(a.id);
          default: return 0;
        }
      });
  }, [razones, searchTerm, sortOrder]);


  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-10rem)]">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Añadir Nueva Razón</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Descripción de la nueva razón"
            value={newRazonDesc}
            onChange={(e) => setNewRazonDesc(e.target.value)}
            onKeyUp={(e) => e.key === 'Enter' && handleAdd()}
            className="w-full"
          />
          <Button onClick={handleAdd}>Agregar Razón</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Razones</CardTitle>
          <CardDescription>Busca, edita y gestiona las razones de los movimientos.</CardDescription>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4">
            <div className="flex flex-col gap-2 flex-1">
                <Input
                    placeholder="Buscar razón..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full"
                />
                <Select value={sortOrder} onValueChange={setSortOrder}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder="Ordenar por..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="alpha-asc">Alfabético (A-Z)</SelectItem>
                        <SelectItem value="alpha-desc">Alfabético (Z-A)</SelectItem>
                        <SelectItem value="id-asc">ID (Ascendente)</SelectItem>
                        <SelectItem value="id-desc">ID (Descendente)</SelectItem>
                    </SelectContent>
                </Select>
            </div>
             <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
                <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                  <DialogTrigger asChild>
                      <Button variant="outline" className="w-full"><Upload className="mr-2 h-4 w-4"/>Importar</Button>
                  </DialogTrigger>
                  <DialogContent>
                      <DialogHeader>
                          <DialogTitle>Importar Razones desde CSV</DialogTitle>
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
                                      <RadioGroupItem value="cloud" id="cloud" className="peer sr-only" disabled={!isFirebaseConfigured} />
                                      <Label htmlFor="cloud" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
                                          <Cloud className="mb-3 h-6 w-6" />
                                          Nube
                                      </Label>
                                  </div>
                              </RadioGroup>
                              {!isFirebaseConfigured && <p className="text-xs text-destructive mt-2">La importación a la nube está deshabilitada porque Firebase no está configurado.</p>}
                          </div>
                          <div>
                             <Label>Modo de Importación</Label>
                             <Select value={importMode} onValueChange={(v) => setImportMode(v as 'add' | 'replace')}>
                                 <SelectTrigger className="mt-2">
                                     <SelectValue />
                                 </SelectTrigger>
                                 <SelectContent>
                                     <SelectItem value="add">Agregar a existentes</SelectItem>
                                     <SelectItem value="replace">Reemplazar todo (no protegidos)</SelectItem>
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
          <TooltipProvider>
            <ul className="space-y-2">
              {filteredAndSortedRazones.map((razon) => (
                <li key={razon.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button type="button" size="icon" variant="ghost" onClick={() => handleToggleQuickReason(razon)} disabled={razon.isProtected}>
                                <Zap className={cn('h-5 w-5', razon.isQuickReason ? 'text-primary fill-primary' : 'text-muted-foreground', razon.isProtected && 'opacity-50 cursor-not-allowed')}/>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{razon.isProtected ? 'No se puede modificar una razón protegida' : 'Marcar como Razón Rápida'}</p>
                        </TooltipContent>
                    </Tooltip>
                    {editingId === razon.id ? (
                      <Input value={editingDesc} onChange={(e) => setEditingDesc(e.target.value)} className="flex-1"/>
                    ) : (
                      <span className={cn("font-medium truncate", razon.isProtected && "text-muted-foreground")}>{razon.descripcion}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {editingId === razon.id ? (
                      <>
                        <Button type="button" size="icon" variant="ghost" className="text-green-500 hover:text-green-600" onClick={() => handleSave(razon.id)}><Save className="h-4 w-4"/></Button>
                        <Button type="button" size="icon" variant="ghost" className="text-red-500 hover:text-red-600" onClick={handleCancelEdit}><X className="h-4 w-4"/></Button>
                      </>
                    ) : (
                      <>
                        <Button type="button" size="icon" variant="ghost" onClick={() => handleEdit(razon)} disabled={razon.isProtected}><Pencil className="h-4 w-4"/></Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button type="button" size="icon" variant="ghost" className="text-destructive" disabled={razon.isProtected}><Trash2 className="h-4 w-4"/></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará permanentemente la razón "{razon.descripcion}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(razon.id)}>Sí, eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </TooltipProvider>
        </CardContent>
      </Card>
    </div>
  );
}
