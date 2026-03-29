import { useAuth } from '@/context/AuthContext';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function ConnectionStatus() {
  const { isOnline, offline } = useAuth();
  const { isSyncing, pendingCount } = offline || {};

  // Don't show anything when online and no pending sync
  if (isOnline && (!pendingCount || pendingCount === 0)) return null;

  return (
    <div
      className={`fixed bottom-4 left-4 z-[9998] flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium shadow-lg transition-all duration-300 ${
        isOnline
          ? 'bg-amber-500/90 text-white'
          : 'bg-red-500/90 text-white animate-pulse'
      }`}
      data-testid="connection-status"
    >
      {isOnline ? (
        <>
          {isSyncing ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Wifi size={14} />
          )}
          <span>Sincronizando {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</span>
        </>
      ) : (
        <>
          <WifiOff size={14} />
          <span>Sin conexion — Modo offline</span>
          {pendingCount > 0 && (
            <span className="bg-white/20 px-1.5 py-0.5 rounded-md">{pendingCount}</span>
          )}
        </>
      )}
    </div>
  );
}
