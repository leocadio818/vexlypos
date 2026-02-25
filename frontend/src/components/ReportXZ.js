import React, { useState, useEffect, useCallback } from 'react';
import api, { businessDaysAPI } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { FileText, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function ReportXZ({ 
  type = "Z", 
  dayId, 
  sessionId,
  open = false,
  onClose 
}) {
  const { user } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [printing, setPrinting] = useState(false);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let res;
      if (type === "X" && sessionId) {
        res = await businessDaysAPI.reportX(sessionId);
      } else if (type === "Z" && dayId) {
        res = await businessDaysAPI.reportZ(dayId);
      }
      if (res?.data) setReport(res.data);
      else setError('No se pudo obtener el reporte');
    } catch (err) {
      setError(err.response?.data?.detail || 'Error cargando reporte');
    } finally {
      setLoading(false);
    }
  }, [type, dayId, sessionId]);

  useEffect(() => {
    if (open && (sessionId || dayId)) fetchReport();
  }, [open, fetchReport, sessionId, dayId]);

  const handleSelect = async (mode) => {
    if (!report) return;
    setPrinting(true);
    try {
      await api.post('/print/report-shift', {
        report: report,
        detailed: mode === 'detailed',
        type: type
      });
      toast.success('Reporte enviado a imprimir');
      onClose?.();
    } catch (err) {
      toast.error('Error al imprimir', {
        description: err.response?.data?.detail || 'Verifica la impresora'
      });
    } finally {
      setPrinting(false);
    }
  };

  const handleClose = () => {
    onClose?.();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-sm p-0" data-testid="report-mode-dialog">
        <div className="p-6 text-center">
          {loading ? (
            <div className="py-8">
              <RefreshCw className="animate-spin text-cyan-400 mx-auto" size={32} />
              <p className="text-white/50 text-sm mt-3">Preparando reporte...</p>
            </div>
          ) : error ? (
            <div className="py-8">
              <AlertTriangle className="text-red-400 mx-auto mb-3" size={36} />
              <p className="text-white/70 text-sm">{error}</p>
              <Button onClick={fetchReport} className="mt-3" variant="outline" size="sm">Reintentar</Button>
            </div>
          ) : printing ? (
            <div className="py-8">
              <RefreshCw className="animate-spin text-cyan-400 mx-auto" size={32} />
              <p className="text-white/50 text-sm mt-3">Imprimiendo...</p>
            </div>
          ) : (
            <>
              <FileText className="text-cyan-400 mx-auto mb-4" size={36} />
              <p className="font-oswald font-bold text-white text-lg mb-1">
                Reporte Detallado?
              </p>
              <p className="text-white/50 text-sm mb-6">
                {report?.session?.opened_by || user?.name}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleSelect('detailed')}
                  data-testid="report-mode-detailed"
                  className="flex-1 h-14 rounded-xl bg-cyan-500/20 border border-cyan-500/30 hover:bg-cyan-500/30 text-cyan-300 font-oswald font-bold text-lg transition-all active:scale-95"
                >
                  SI
                </button>
                <button
                  onClick={() => handleSelect('summary')}
                  data-testid="report-mode-summary"
                  className="flex-1 h-14 rounded-xl bg-amber-500/20 border border-amber-500/30 hover:bg-amber-500/30 text-amber-300 font-oswald font-bold text-lg transition-all active:scale-95"
                >
                  NO
                </button>
                <button
                  onClick={handleClose}
                  data-testid="report-mode-cancel"
                  className="flex-1 h-14 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white/70 font-oswald font-bold text-lg transition-all active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
