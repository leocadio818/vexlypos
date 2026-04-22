import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSettings, PERM_LABELS } from './SettingsContext';
import { Users, Search, X, Plus, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const ROLE_LABELS = { admin: 'Admin', waiter: 'Mesero', cashier: 'Cajero', supervisor: 'Supervisor', kitchen: 'Cocina' };

export default function UsersTab() {
  const { users } = useSettings();
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Filter users based on search, role, and active status
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      // Active filter: hide inactive unless toggle is on
      if (!showInactive && u.active === false) return false;
      
      // Search filter
      if (userSearch) {
        const searchLower = userSearch.toLowerCase();
        const nameMatch = (u.name || '').toLowerCase().includes(searchLower);
        const lastNameMatch = (u.last_name || '').toLowerCase().includes(searchLower);
        const posNameMatch = (u.pos_name || '').toLowerCase().includes(searchLower);
        if (!nameMatch && !lastNameMatch && !posNameMatch) return false;
      }
      
      // Role filter
      if (userRoleFilter && u.role !== userRoleFilter) return false;
      
      return true;
    });
  }, [users, userSearch, userRoleFilter, showInactive]);

  const activeUsersCount = users.filter(u => u.active !== false).length;
  const inactiveUsersCount = users.filter(u => u.active === false).length;

  return (
    <div>
      {/* Search and Filter Section */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Search Bar */}
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nombre o usuario..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-background border border-border text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              data-testid="user-search-input"
            />
            {userSearch && (
              <button
                onClick={() => setUserSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
          
          {/* Role Filter Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setUserRoleFilter('')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                userRoleFilter === '' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              data-testid="filter-all"
            >
              Todos
            </button>
            <button
              onClick={() => setUserRoleFilter('admin')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                userRoleFilter === 'admin' 
                  ? 'bg-red-500 text-white' 
                  : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
              }`}
              data-testid="filter-admin"
            >
              Admin
            </button>
            <button
              onClick={() => setUserRoleFilter('waiter')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                userRoleFilter === 'waiter' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
              }`}
              data-testid="filter-waiter"
            >
              Mesero
            </button>
            <button
              onClick={() => setUserRoleFilter('cashier')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                userRoleFilter === 'cashier' 
                  ? 'bg-green-500 text-white' 
                  : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
              }`}
              data-testid="filter-cashier"
            >
              Cajero
            </button>
            <button
              onClick={() => setUserRoleFilter('kitchen')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                userRoleFilter === 'kitchen' 
                  ? 'bg-orange-500 text-white' 
                  : 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20'
              }`}
              data-testid="filter-kitchen"
            >
              Cocina
            </button>
            
            {/* Show Inactive Toggle */}
            {inactiveUsersCount > 0 && (
              <button
                onClick={() => setShowInactive(!showInactive)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  showInactive 
                    ? 'bg-red-500 text-white' 
                    : 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                }`}
                data-testid="filter-inactive"
              >
                {showInactive ? `Ocultar Inactivos (${inactiveUsersCount})` : `Mostrar Inactivos (${inactiveUsersCount})`}
              </button>
            )}
          </div>
          
          {/* Add User Button */}
          <div className="sm:ml-auto">
            <Link to="/user/new"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold active:scale-95 transition-transform" data-testid="add-user-btn">
              <Plus size={14} /> Nuevo Empleado
            </Link>
          </div>
        </div>
        
        {/* Active filters info */}
        {(userSearch || userRoleFilter) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Mostrando {filteredUsers.length} de {activeUsersCount} usuarios</span>
            {(userSearch || userRoleFilter) && (
              <button 
                onClick={() => { setUserSearch(''); setUserRoleFilter(''); }}
                className="text-primary hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>
      
      {/* Users List */}
      {filteredUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users size={48} className="text-muted-foreground/30 mb-4" />
          <h3 className="font-oswald text-lg font-bold text-muted-foreground mb-2">
            No se encontraron usuarios
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {userSearch 
              ? `No hay usuarios con "${userSearch}"` 
              : userRoleFilter 
                ? `No hay usuarios con rol "${userRoleFilter}"` 
                : 'No hay usuarios activos'}
          </p>
          <button
            onClick={() => { setUserSearch(''); setUserRoleFilter(''); }}
            className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map(user => (
            <Link key={user.id} to={`/user/${user.id}`} 
              className={`flex items-center justify-between p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors cursor-pointer ${user.active === false ? 'opacity-50' : ''}`} data-testid={`user-${user.id}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold font-oswald ${
                  user.active === false ? 'bg-muted text-muted-foreground' :
                  user.role === 'admin' ? 'bg-red-500/20 text-red-500' :
                  user.role === 'waiter' ? 'bg-blue-500/20 text-blue-500' :
                  user.role === 'cashier' ? 'bg-green-500/20 text-green-500' :
                  user.role === 'kitchen' ? 'bg-orange-500/20 text-orange-500' :
                  'bg-primary/20 text-primary'
                }`}>
                  {user.name?.[0]}{user.last_name?.[0] || ''}
                </div>
                <div>
                  <span className="font-semibold">{user.name} {user.last_name || ''}</span>
                  <Badge variant="secondary" className={`ml-2 text-[11px] ${
                    user.role === 'admin' ? 'bg-red-500/10 text-red-500' :
                    user.role === 'waiter' ? 'bg-blue-500/10 text-blue-500' :
                    user.role === 'cashier' ? 'bg-green-500/10 text-green-500' :
                    user.role === 'kitchen' ? 'bg-orange-500/10 text-orange-500' : ''
                  }`}>{ROLE_LABELS[user.role] || user.role}</Badge>
                  {user.active === false && <Badge className="ml-1 text-[11px] bg-red-500/20 text-red-500 border-red-500/30">INACTIVO</Badge>}
                  {user.training_mode && <Badge variant="outline" className="ml-1 text-[11px] border-yellow-500 text-yellow-400">Entrenamiento</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {user.positions?.length > 0 && (
                  <span className="text-xs text-muted-foreground">{user.positions.length} puesto(s)</span>
                )}
                <Pencil size={14} className="text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Admin utility: onboarding tours panel with per-tour status, NEW badges & reset */}
      <ToursAdminPanel />
    </div>
  );
}

function ToursAdminPanel() {
  const [tick, setTick] = useState(0);
  const [mod, setMod] = useState(null);
  useEffect(() => {
    import('@/lib/tours').then(m => setMod(m));
  }, []);
  if (!mod) return null;
  const { TOURS, getTourProgress, getCompletedVersion, isTourNew, resetTour, resetAllTours } = mod;

  const entries = Object.entries(TOURS);
  const newCount = entries.filter(([k]) => isTourNew(k)).length;

  return (
    <div className="mt-8 pt-4 border-t border-border/50" data-testid="tours-admin-panel">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-2">
            Tours de Onboarding
            {newCount > 0 && (
              <span className="bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full" data-testid="tours-new-count">
                {newCount} NUEVO{newCount > 1 ? 'S' : ''}
              </span>
            )}
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Cada tour se muestra una sola vez al usuario. Resetéalos al asignar el POS a un empleado nuevo.
          </p>
        </div>
        <button
          onClick={() => { resetAllTours(); setTick(t => t + 1); alert('Todos los tours reiniciados para este dispositivo.'); }}
          className="px-3 py-1.5 rounded-md border border-border hover:bg-muted text-xs font-bold"
          data-testid="reset-all-tours-btn"
        >
          Reiniciar todos
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {entries.map(([key, tour]) => {
          const progress = getTourProgress(key);
          const completedV = getCompletedVersion(key);
          const done = progress === 'done';
          const inProgress = !done && !!progress;
          const isNew = isTourNew(key);
          const status = done ? 'Completado' : inProgress ? `En progreso (paso ${progress})` : 'Pendiente';
          const statusColor = done ? 'text-green-600 dark:text-green-400' : inProgress ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
          return (
            <div key={key} className="border border-border rounded-lg p-3 bg-card" data-testid={`tour-row-${key}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-sm truncate flex-1">{tour.name}</span>
                {isNew && (
                  <span className="bg-orange-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded" data-testid={`tour-new-badge-${key}`}>
                    NUEVO
                  </span>
                )}
                <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded font-mono">v{tour.version || 1}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className={statusColor}>
                  {status}{completedV > 0 ? ` · v${completedV} vista` : ''}
                </span>
                <button
                  onClick={() => { resetTour(key); setTick(t => t + 1); }}
                  className="text-primary hover:underline font-semibold"
                  data-testid={`reset-tour-${key}`}
                >
                  Reiniciar
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Lanzado: {tour.releasedOn || '—'} · {tour.steps.length} paso{tour.steps.length > 1 ? 's' : ''}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
