import { useState, useRef } from 'react';
import { Upload, Download, FileSpreadsheet, CheckCircle, AlertTriangle, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { notify } from '@/lib/notify';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

export default function ImportProductsModal({ open, onClose, onComplete }) {
  const [step, setStep] = useState(1); // 1=select, 2=preview, 3=processing, 4=result
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setStep(1);
    setFile(null);
    setPreview([]);
    setTotalRows(0);
    setResult(null);
    setError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = (f) => {
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      notify.error('Formato no soportado. Use CSV o XLSX.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      notify.error('Archivo demasiado grande (max 5MB)');
      return;
    }
    setFile(f);
    setError('');

    // Read preview client-side for CSV
    if (name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split('\n').filter(l => l.trim());
        setTotalRows(Math.max(0, lines.length - 1));
        const rows = [];
        for (let i = 1; i < Math.min(6, lines.length); i++) {
          const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
          rows.push({ nombre: cols[0] || '', precio: cols[1] || '', categoria: cols[2] || '' });
        }
        setPreview(rows);
      };
      reader.readAsText(f);
    } else {
      setTotalRows(-1); // Unknown for Excel
      setPreview([]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch(`${API}/products/import-template`, { headers: hdrs() });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_productos.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      notify.error('Error descargando plantilla');
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setStep(3);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API}/products/import-bulk`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('pos_token')}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Error en la importacion');
        setStep(1);
        return;
      }
      setResult(data);
      setStep(4);
      if (data.created > 0 && onComplete) onComplete();
    } catch (err) {
      setError('Error de conexion');
      setStep(1);
    }
  };

  const handleExportErrors = () => {
    if (!result?.error_details?.length) return;
    const lines = ['Fila,Nombre,Error'];
    result.error_details.forEach(e => {
      lines.push(`${e.row},"${(e.nombre || '').replace(/"/g, '""')}","${(e.error || '').replace(/"/g, '""')}"`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'errores_importacion.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-hidden flex flex-col" data-testid="import-modal">
        <DialogHeader>
          <DialogTitle className="font-oswald flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-primary" />
            Importar Productos
          </DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 text-sm text-destructive flex items-start gap-2" data-testid="import-error">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1 — Select File */}
        {step === 1 && (
          <div className="space-y-4 flex-1 overflow-auto">
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all min-h-[120px] flex flex-col items-center justify-center gap-2 ${
                dragOver ? 'border-primary bg-primary/5' : file ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/40'
              }`}
              data-testid="drop-zone"
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={e => handleFile(e.target.files?.[0])}
                data-testid="file-input"
              />
              <Upload size={28} className={file ? 'text-primary' : 'text-muted-foreground'} />
              {file ? (
                <div>
                  <p className="font-medium text-auto-foreground text-sm">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {totalRows > 0 ? `${totalRows} filas detectadas` : 'Archivo seleccionado'}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="font-medium text-auto-foreground text-sm">Arrastra un archivo aqui</p>
                  <p className="text-xs text-muted-foreground">o haz clic para seleccionar (.csv, .xlsx)</p>
                </div>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="w-full" data-testid="download-template-btn">
              <Download size={14} className="mr-2" /> Descargar plantilla CSV
            </Button>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">Cancelar</Button>
              <Button onClick={() => file ? setStep(2) : notify.error('Selecciona un archivo')} className="flex-1" disabled={!file} data-testid="next-step-btn">
                Siguiente
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2 — Preview */}
        {step === 2 && (
          <div className="space-y-4 flex-1 overflow-auto">
            <div className="bg-muted/50 rounded-lg px-3 py-2">
              <p className="text-sm text-auto-foreground font-medium">
                {totalRows > 0 ? `${totalRows} productos detectados` : 'Archivo listo para importar'}
              </p>
              <p className="text-xs text-muted-foreground">{file?.name}</p>
            </div>

            {preview.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <p className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50">Vista previa (primeras {preview.length} filas)</p>
                <ScrollArea className="max-h-[180px]">
                  <table className="w-full text-xs" data-testid="preview-table">
                    <thead>
                      <tr className="bg-muted border-b border-border">
                        <th className="px-2 py-1.5 text-left text-auto-foreground font-semibold">Nombre</th>
                        <th className="px-2 py-1.5 text-left text-auto-foreground font-semibold">Precio</th>
                        <th className="px-2 py-1.5 text-left text-auto-foreground font-semibold">Categoria</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-2 py-1.5 text-auto-foreground">{r.nombre}</td>
                          <td className="px-2 py-1.5 text-auto-foreground">{r.precio}</td>
                          <td className="px-2 py-1.5 text-auto-foreground">{r.categoria}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Atras</Button>
              <Button onClick={handleImport} className="flex-1" data-testid="confirm-import-btn">
                Confirmar importacion
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3 — Processing */}
        {step === 3 && (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <Loader2 size={40} className="animate-spin text-primary" />
            <p className="text-sm text-auto-foreground font-medium">Importando productos...</p>
            <p className="text-xs text-muted-foreground">Esto puede tomar unos segundos</p>
          </div>
        )}

        {/* STEP 4 — Result */}
        {step === 4 && result && (
          <div className="space-y-4 flex-1 overflow-auto">
            {result.created > 0 && (
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2.5" data-testid="import-success">
                <CheckCircle size={18} className="text-safe-green shrink-0" />
                <span className="text-sm text-auto-foreground font-medium">{result.created} producto{result.created !== 1 ? 's' : ''} creado{result.created !== 1 ? 's' : ''} exitosamente</span>
              </div>
            )}
            {result.skipped > 0 && (
              <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2">
                <span className="text-sm text-auto-foreground">{result.skipped} producto{result.skipped !== 1 ? 's' : ''} omitido{result.skipped !== 1 ? 's' : ''} (ya existian)</span>
              </div>
            )}
            {result.errors > 0 && (
              <div className="space-y-2" data-testid="import-errors-section">
                <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
                  <AlertTriangle size={16} className="text-safe-red shrink-0" />
                  <span className="text-sm text-auto-foreground font-medium">{result.errors} error{result.errors !== 1 ? 'es' : ''} encontrado{result.errors !== 1 ? 's' : ''}</span>
                </div>
                <ScrollArea className="max-h-[200px]">
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs" data-testid="error-table">
                      <thead>
                        <tr className="bg-muted border-b border-border">
                          <th className="px-2 py-1.5 text-left text-auto-foreground font-semibold">Fila</th>
                          <th className="px-2 py-1.5 text-left text-auto-foreground font-semibold">Nombre</th>
                          <th className="px-2 py-1.5 text-left text-auto-foreground font-semibold">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.error_details.map((e, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="px-2 py-1.5 text-auto-muted">{e.row}</td>
                            <td className="px-2 py-1.5 text-auto-foreground font-medium">{e.nombre}</td>
                            <td className="px-2 py-1.5 text-safe-red">{e.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
                <Button variant="outline" size="sm" onClick={handleExportErrors} className="w-full" data-testid="export-errors-btn">
                  <Download size={14} className="mr-2" /> Descargar reporte de errores CSV
                </Button>
              </div>
            )}

            <Button onClick={handleClose} className="w-full" data-testid="close-import-btn">
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
