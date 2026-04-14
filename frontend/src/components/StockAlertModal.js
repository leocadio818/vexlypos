import { useState, useEffect } from 'react';
import { simpleInventoryAPI } from '@/lib/api';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StockAlertModal() {
  const [alerts, setAlerts] = useState([]);
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const checkAlerts = async () => {
      try {
        const res = await simpleInventoryAPI.pendingAlerts();
        const data = res.data || [];
        if (data.length > 0) {
          setAlerts(data);
          setVisible(true);
        }
      } catch {}
    };
    // Small delay to not block initial load
    const timer = setTimeout(checkAlerts, 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      const ids = alerts.map(a => a.id);
      await simpleInventoryAPI.dismissAlerts(ids);
    } catch {}
    setVisible(false);
    setDismissing(false);
  };

  if (!visible || alerts.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm" data-testid="stock-alert-modal-overlay">
      <div
        className="bg-card border-2 border-yellow-500/50 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-300"
        data-testid="stock-alert-modal"
      >
        {/* Header */}
        <div className="bg-yellow-500/10 border-b border-yellow-500/30 px-5 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle size={22} className="text-yellow-500" />
          </div>
          <div>
            <h2 className="font-oswald font-bold text-lg text-foreground" data-testid="stock-alert-title">
              Alerta de Stock Bajo
            </h2>
            <p className="text-xs text-muted-foreground">
              {alerts.length} producto{alerts.length > 1 ? 's' : ''} con inventario bajo
            </p>
          </div>
        </div>

        {/* Product list */}
        <div className="px-5 py-3 max-h-[50vh] overflow-y-auto">
          {alerts.map(product => {
            const qty = product.simple_inventory_qty || 0;
            const badgeColor = qty <= 1 ? '#ef4444' : '#eab308';
            return (
              <div
                key={product.id}
                className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0"
                data-testid={`stock-alert-item-${product.id}`}
              >
                <span className="font-medium text-sm text-foreground">{product.name}</span>
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: badgeColor }}
                >
                  {qty} {qty === 1 ? 'unidad' : 'unidades'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border bg-muted/30">
          <Button
            onClick={handleDismiss}
            disabled={dismissing}
            className="w-full h-12 font-oswald font-bold text-base tracking-wider"
            data-testid="stock-alert-accept-btn"
          >
            {dismissing ? 'PROCESANDO...' : 'ACEPTAR'}
          </Button>
        </div>
      </div>
    </div>
  );
}
