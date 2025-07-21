
'use client';

import { useAppContext } from '@/contexts/AppProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Download, Loader2, Pencil, Save, Trash2, Upload, X, Cloud, HardDrive } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Integrante } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { isFirebaseConfigured } from '@/lib/firebase';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export default function MembersPage() {
  const { integrantes, addIntegrante, updateIntegrante, deleteIntegrante, financialRecords, loading, importIntegrantes, importIntegrantesLocal } = useAppContext();
  const { toast } = useToast();

  const [newIntegranteName, setNewIntegranteName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('alpha-asc');
  
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDestination, setImportDestination] = useState<'local' | 'cloud'>(isFirebaseConfigured ? 'cloud' : 'local');
  const [importMode, setImportMode] = useState<'add' | 'replace'>('add');
  const importFileInputRef = useRef<HTMLInputElement>(null);


  const handleAdd = async () => {
    if (!newIntegranteName.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'El nombre no puede estar vacío.' });
      return;
    }
    if (integrantes.some(i => i.nombre.toLowerCase() === newIntegranteName.trim().toLowerCase())) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ya existe un integrante con este nombre.' });
      return;
    }
    try {
      await addIntegrante(newIntegranteName);
      toast({ title: 'Éxito', description: 'Integrante agregado.' });
      setNewIntegranteName('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo agregar el integrante.' });
    }
  };
  
  const handleEdit = (integrante: typeof integrantes[0]) => {
    setEditingId(integrante.id);
    setEditingName(integrante.nombre);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };
  
  const handleSave = async (id: string) => {
    if (!editingName.trim()) {
        toast({ variant: 'destructive', title: 'Error', description: 'El nombre no puede estar vacío.' });
        return;
    }
    if (integrantes.some(i => i.id !== id && i.nombre.toLowerCase() === editingName.trim().toLowerCase())) {
        toast({ variant: 'destructive', title: 'Error', description: 'Ya existe otro integrante con este nombre.' });
        return;
    }
    try {
      await updateIntegrante(id, editingName);
      toast({ title: 'Éxito', description: 'Integrante actualizado.' });
      handleCancelEdit();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el integrante.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    }
  };

  const handleDelete = async (id: string) => {
    const isUsed = financialRecords.some(r => r.integranteId === id);
    if (isUsed) {
        toast({ variant: 'destructive', title: 'Acción denegada', description: 'No se puede eliminar un integrante que tiene registros financieros asociados.' });
        return;
    }
    try {
        await deleteIntegrante(id);
        toast({ title: 'Éxito', description: 'Integrante eliminado.' });
    } catch (error) {
       const message = error instanceof Error ? error.message : 'No se pudo eliminar el integrante.';
       toast({ variant: 'destructive', title: 'Error', description: message });
    }
  };

  const exportToCSV = () => {
    const headers = ['nombre', 'isProtected'];
    const rows = filteredAndSortedIntegrantes.map(i => [
      `"${i.nombre.replace(/"/g, '""')}"`,
      !!i.isProtected
    ].join(','));
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "integrantes.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Éxito', description: 'Integrantes exportados a CSV.' });
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
        const nombreIndex = headers.indexOf('nombre');
        const isProtectedIndex = headers.indexOf('isprotected');

        if (nombreIndex === -1) {
          throw new Error('La columna "nombre" no fue encontrada en el CSV.');
        }

        const newIntegrantes: Omit<Integrante, 'id' | 'userId'>[] = [];
        const existingNames = new Set(integrantes.map(i => i.nombre.toLowerCase()));

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          const nombre = values[nombreIndex]?.replace(/"/g, '').trim();

          if (nombre) {
            const isProtected = isProtectedIndex !== -1 ? values[isProtectedIndex]?.trim().toLowerCase() === 'true' : false;
            
            const item = { nombre, isProtected };
            
            if(importMode === 'add') {
                if (!existingNames.has(nombre.toLowerCase())) {
                    newIntegrantes.push(item);
                }
            } else { // replace mode
                newIntegrantes.push(item);
            }
          }
        }
        
        if (newIntegrantes.length > 0) {
          if (importDestination === 'cloud') {
              await importIntegrantes(newIntegrantes, importMode);
          } else {
              await importIntegrantesLocal(newIntegrantes, importMode);
          }
          toast({ title: 'Éxito', description: `Importación completa. ${newIntegrantes.length} registros afectados.` });
        } else {
          toast({ title: 'Información', description: 'No se encontraron nuevos integrantes para importar o no hay cambios.' });
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

  const filteredAndSortedIntegrantes = useMemo(() => {
    return integrantes
      .filter(i => i.nombre.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => {
        switch (sortOrder) {
          case 'alpha-asc': return a.nombre.localeCompare(b.nombre);
          case 'alpha-desc': return b.nombre.localeCompare(a.nombre);
          case 'id-asc': return a.id.localeCompare(b.id);
          case 'id-desc': return b.id.localeCompare(a.id);
          default: return 0;
        }
      });
  }, [integrantes, searchTerm, sortOrder]);


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
          <CardTitle>Añadir Nuevo Integrante</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Nombre del nuevo integrante"
            value={newIntegranteName}
            onChange={(e) => setNewIntegranteName(e.target.value)}
            onKeyUp={(e) => e.key === 'Enter' && handleAdd()}
            className="w-full"
          />
          <Button onClick={handleAdd}>Agregar Integrante</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Integrantes</CardTitle>
          <CardDescription>Busca, edita y elimina integrantes del equipo.</CardDescription>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4">
            <div className="flex flex-col gap-2 flex-1">
                <Input
                    placeholder="Buscar integrante..."
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
                          <DialogTitle>Importar Integrantes desde CSV</DialogTitle>
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
                          </div>

                          <div>
                             <Label>Modo de Importación</Label>
                             <Select value={importMode} onValueChange={(v) => setImportMode(v as 'add' | 'replace')}>
                                 <SelectTrigger className="mt-2">
                                     <SelectValue />
                                 </SelectTrigger>
                                 <SelectContent>
                                     <SelectItem value="add">Agregar a existentes</SelectItem>
                                     <SelectItem value="replace">Reemplazar existentes (no protegidos)</SelectItem>
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
          <ul className="space-y-2">
            {filteredAndSortedIntegrantes.map((integrante) => (
              <li key={integrante.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                {editingId === integrante.id ? (
                  <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="flex-1 mr-2"/>
                ) : (
                  <span className="font-medium">{integrante.nombre}</span>
                )}
                <div className="flex items-center gap-2">
                  {editingId === integrante.id ? (
                    <>
                      <Button size="icon" variant="ghost" className="text-green-500 hover:text-green-600" onClick={() => handleSave(integrante.id)}><Save className="h-4 w-4"/></Button>
                      <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-600" onClick={handleCancelEdit}><X className="h-4 w-4"/></Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(integrante)}><Pencil className="h-4 w-4"/></Button>
                      
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" disabled={integrante.isProtected} className="disabled:opacity-50 disabled:cursor-not-allowed text-destructive"><Trash2 className="h-4 w-4"/></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                                <AlertDialogDescription>
                                Esta acción no se puede deshacer. Se eliminará permanentemente al integrante "{integrante.nombre}".
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(integrante.id)}>Sí, eliminar</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
