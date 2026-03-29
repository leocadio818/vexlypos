import { useAuth } from '@/context/AuthContext';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

export default function ConnectionStatus() {
  const { isOnline, offline } = useAuth();
  const { isSyncing, pendingCount, isOfflineSession } = offline || {};

  // Show offline session banner
  if (isOfflineSession) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-[9998] flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white"
        data-testid="connection-status"
      >
        <WifiOff size={13} />
        <span>MODO OFFLINE — Los cambios se sincronizaran al reconectar</span>
        {pendingCount > 0 && (
          <span className="bg-white/25 px-2 py-0.5 rounded-full ml-1">{pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</span>
        )}
      </div>
    );
  }

  // Show when offline but not in offline session
  if (!isOnline) {
    return (
      <div
        className="fixed bottom-4 left-4 z-[9998] flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium shadow-lg bg-red-500/90 text-white animate-pulse"
        data-testid="connection-status"
      >
        <WifiOff size={14} />
        <span>Sin conexion</span>
      </div>
    );
  }

  // Show syncing indicator
  if (pendingCount > 0) {
    return (
      <div
        className="fixed bottom-4 left-4 z-[9998] flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium shadow-lg bg-amber-500/90 text-white"
        data-testid="connection-status"
      >
        {isSyncing ? (
          <RefreshCw size={14} className="animate-spin" />
        ) : (
          <Wifi size={14} />
        )}
        <span>Sincronizando {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</span>
      </div>
    );
  }

  return null;
}
