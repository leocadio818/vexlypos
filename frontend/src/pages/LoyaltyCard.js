import { useEffect, useState, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Gift, Printer, Mail, Phone, MapPin, Sparkles, Clock } from 'lucide-react';

const API_BASE = process.env.REACT_APP_BACKEND_URL;

function formatMoney(n) {
  return `RD$ ${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso.slice(0, 10); }
}

export default function LoyaltyCard() {
  const { customerId } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get('token') || '';
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const publicUrl = useMemo(() => `${window.location.origin}/loyalty-card/${customerId}?token=${token}`, [customerId, token]);
  const qrSrc = useMemo(() => `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(publicUrl)}`, [publicUrl]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/loyalty/public-card/${customerId}?token=${encodeURIComponent(token)}`);
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          if (alive) setErr(j.detail || 'No se pudo cargar la tarjeta');
          return;
        }
        const j = await r.json();
        if (alive) setData(j);
      } catch {
        if (alive) setErr('Error de conexión');
      }
    })();
    return () => { alive = false; };
  }, [customerId, token]);

  const handlePrint = () => window.print();

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="max-w-sm text-center bg-slate-800/80 backdrop-blur rounded-3xl p-8 border border-purple-500/20" data-testid="loyalty-card-error">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <Gift size={32} className="text-red-400" />
          </div>
          <p className="text-white text-lg font-bold mb-2">Tarjeta no disponible</p>
          <p className="text-slate-400 text-sm">{err}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin h-8 w-8 border-2 border-purple-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 sm:p-6 print:bg-white print:p-0" data-testid="loyalty-card-page">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-card { box-shadow: none !important; border: 1px solid #cbd5e1 !important; }
        }
      `}</style>

      <div className="max-w-md mx-auto">
        {/* Card */}
        <div
          className="print-card relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-pink-500 p-6 sm:p-8 shadow-2xl print:shadow-none"
          data-testid="loyalty-card-main"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -mr-20 -mt-20 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-40 h-40 bg-cyan-400/20 rounded-full -ml-16 -mb-16 blur-2xl" />

          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10px] tracking-[3px] text-white/80 font-bold">TARJETA DE FIDELIDAD</p>
                <p className="text-xl sm:text-2xl font-bold text-white mt-1" data-testid="loyalty-card-business">{data.business?.name}</p>
              </div>
              <Sparkles size={28} className="text-white/90" />
            </div>

            <div className="mb-5">
              <p className="text-[11px] text-white/70">Titular</p>
              <p className="text-lg sm:text-xl font-bold text-white truncate" data-testid="loyalty-card-name">{data.name}</p>
            </div>

            <div className="bg-black/30 backdrop-blur rounded-2xl p-4 sm:p-5 border border-white/10">
              <p className="text-[10px] tracking-[2px] text-white/70 font-bold">SALDO DE PUNTOS</p>
              <p className="text-4xl sm:text-5xl font-extrabold text-white mt-1" data-testid="loyalty-card-points">{data.points}</p>
              <p className="text-xs sm:text-sm text-white/80 mt-1" data-testid="loyalty-card-rd-equivalent">≈ {formatMoney(data.rd_equivalent)}</p>
              <p className="text-[10px] text-white/60 mt-2">1 pt = {formatMoney(data.point_value_rd)} · mín canje {data.min_redemption} pts</p>
            </div>

            <div className="mt-5 flex items-center justify-center">
              <div className="bg-white rounded-xl p-2.5 shadow-md">
                <img src={qrSrc} alt="QR" width={160} height={160} className="block" data-testid="loyalty-card-qr" />
              </div>
            </div>
            <p className="text-[11px] text-white/80 text-center mt-2">Presenta este QR en caja para acumular o canjear</p>
          </div>
        </div>

        {/* Last visits */}
        {data.last_visits && data.last_visits.length > 0 && (
          <div className="mt-4 bg-slate-800/60 backdrop-blur rounded-2xl p-4 border border-slate-700/50 print:bg-white print:border-slate-300" data-testid="loyalty-card-visits">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-purple-300 print:text-slate-600" />
              <p className="text-xs font-bold text-purple-300 print:text-slate-600 tracking-wide uppercase">Últimas visitas</p>
            </div>
            <div className="space-y-2">
              {data.last_visits.map((v, i) => (
                <div key={i} className="flex items-center justify-between text-sm text-white/90 print:text-slate-700 border-b border-white/5 print:border-slate-200 pb-2 last:border-0 last:pb-0" data-testid={`loyalty-card-visit-${i}`}>
                  <div>
                    <p className="font-bold">T-{v.transaction_number}</p>
                    <p className="text-[11px] text-white/60 print:text-slate-500">{formatDate(v.paid_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatMoney(v.total)}</p>
                    <p className="text-[11px] text-emerald-300 print:text-emerald-700">
                      +{v.points_earned || 0} pts{(v.points_redeemed || 0) > 0 ? ` · −${v.points_redeemed}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Business info */}
        <div className="mt-4 bg-slate-800/60 backdrop-blur rounded-2xl p-4 border border-slate-700/50 print:bg-white print:border-slate-300 text-sm text-white/80 print:text-slate-700">
          {data.business?.address && (
            <div className="flex items-center gap-2 mb-1"><MapPin size={14} /> {data.business.address}</div>
          )}
          {data.business?.phone && (
            <div className="flex items-center gap-2"><Phone size={14} /> {data.business.phone}</div>
          )}
        </div>

        {/* Actions (hidden on print) */}
        <div className="no-print mt-5 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handlePrint}
            className="flex-1 h-12 rounded-xl bg-white text-slate-900 font-bold flex items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-95"
            data-testid="loyalty-card-print-btn"
          >
            <Printer size={18} /> Imprimir
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(publicUrl);
              alert('URL copiada al portapapeles');
            }}
            className="flex-1 h-12 rounded-xl bg-slate-800/80 border border-white/10 text-white font-bold flex items-center justify-center gap-2 hover:bg-slate-700 transition-all active:scale-95"
            data-testid="loyalty-card-copy-btn"
          >
            <Mail size={18} /> Copiar enlace
          </button>
        </div>
      </div>
    </div>
  );
}
