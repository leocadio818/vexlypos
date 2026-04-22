import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Trophy, Heart, TrendingUp } from 'lucide-react';
import { formatMoney } from '@/lib/api';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const TABS = [
  { id: 30, label: '30 días' },
  { id: 90, label: '90 días' },
  { id: 3650, label: 'Siempre' },
];

export default function TopLoyaltyCustomers() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    axios.get(`${API}/loyalty/top-customers?days=${days}&limit=10`, { headers: headers() })
      .then(r => { if (alive) setRows(r.data?.items || []); })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [days]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ earned: acc.earned + (r.points_earned || 0), redeemed: acc.redeemed + (r.points_redeemed || 0), spent: acc.spent + (r.total_spent || 0) }),
    { earned: 0, redeemed: 0, spent: 0 }
  ), [rows]);

  return (
    <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4" data-testid="top-loyalty-customers">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-amber-400" />
          <h3 className="font-oswald text-sm font-bold uppercase tracking-wider text-white/50">Top Clientes Fieles</h3>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setDays(t.id)}
              data-testid={`top-loyalty-tab-${t.id}`}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${days === t.id ? 'bg-amber-500/30 text-amber-200 border border-amber-400/40' : 'text-white/60 hover:bg-white/10'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-lg p-2">
          <p className="text-[10px] text-white/60">Ganados</p>
          <p className="font-oswald text-lg font-bold text-emerald-300" data-testid="top-loyalty-earned">{totals.earned}</p>
        </div>
        <div className="bg-purple-500/10 border border-purple-400/20 rounded-lg p-2">
          <p className="text-[10px] text-white/60">Canjeados</p>
          <p className="font-oswald text-lg font-bold text-purple-300" data-testid="top-loyalty-redeemed">{totals.redeemed}</p>
        </div>
        <div className="bg-cyan-500/10 border border-cyan-400/20 rounded-lg p-2">
          <p className="text-[10px] text-white/60">Gastado</p>
          <p className="font-oswald text-base font-bold text-cyan-300" data-testid="top-loyalty-spent">{formatMoney(totals.spent)}</p>
        </div>
      </div>

      {/* Rows */}
      {loading ? (
        <div className="text-center py-6"><div className="inline-block animate-spin h-5 w-5 border-2 border-amber-400 border-t-transparent rounded-full" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-6 text-white/40 text-sm">
          <Heart size={24} className="mx-auto mb-2 opacity-30" />
          Sin actividad de fidelidad en este período
        </div>
      ) : (
        <div className="space-y-1 max-h-[280px] overflow-y-auto pr-1">
          {rows.map((r, i) => (
            <div
              key={r.customer_id}
              className="flex items-center gap-2 py-2 px-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all"
              data-testid={`top-loyalty-row-${i}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                r.rank === 1 ? 'bg-amber-400/30 text-amber-200 border border-amber-400/40' :
                r.rank === 2 ? 'bg-slate-300/20 text-slate-200 border border-slate-300/30' :
                r.rank === 3 ? 'bg-orange-600/30 text-orange-200 border border-orange-500/40' :
                'bg-white/10 text-white/60'
              }`}>{r.rank}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate" data-testid={`top-loyalty-name-${i}`}>{r.name}</p>
                <p className="text-[10px] text-white/50">
                  {r.visits} {r.visits === 1 ? 'visita' : 'visitas'} · {formatMoney(r.total_spent)} · {r.current_points} pts actuales
                </p>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 text-xs font-bold text-emerald-300">
                  <TrendingUp size={10} />+{r.points_earned}
                </div>
                {r.points_redeemed > 0 && (
                  <p className="text-[10px] text-purple-300">−{r.points_redeemed}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
