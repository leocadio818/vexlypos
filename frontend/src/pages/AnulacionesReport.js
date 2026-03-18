import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, RotateCcw, Ban, Download, Calendar, User, FileText, DollarSign } from 'lucide-react';
import * as XLSX from 'xlsx';

const API_BASE = process.env.REACT_APP_BACKEND_URL;
const hdrs = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const formatMoney = (v) => `RD$ ${Number(v || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const COLORS = ['#f97316', '#ef4444', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function AnulacionesReport() {
  const [period, setPeriod] = useState('month');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/void-audit-logs/report?period=${period}`, { headers: hdrs() });
      const data = await res.json();
      setReportData(data);
    } catch (e) {
      toast.error('Error cargando reporte');
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const exportToExcel = () => {
    if (!reportData?.logs?.length) {
      toast.error('No hay datos para exportar');
      return;
    }

    // Prepare data for Excel
    const excelData = reportData.logs.map(log => ({
      'Fecha': new Date(log.created_at).toLocaleString('es-DO'),
      'Orden ID': log.order_id,
      'Producto': log.product_name || (log.items_cancelled || []).map(i => i.product_name).join(', '),
      'Cantidad': log.quantity || (log.items_cancelled || []).reduce((s, i) => s + i.quantity, 0),
      'Valor (RD$)': log.total_value || (log.unit_price * log.quantity) || 0,
      'Razón': log.reason,
      'Retornó Inventario': log.restored_to_inventory ? 'Sí' : 'No',
      'Solicitado Por': log.requested_by_name || log.user_name,
      'Autorizado Por': log.authorized_by_name || 'N/A',
      'Comentarios': log.comments || ''
    }));

    // Add summary sheet
    const summaryData = [
      { 'Métrica': 'Total Anulado', 'Valor': formatMoney(reportData.summary.total_voided) },
      { 'Métrica': 'Recuperado (Inventario)', 'Valor': formatMoney(reportData.summary.recovered_value) },
      { 'Métrica': 'Pérdida/Merma', 'Valor': formatMoney(reportData.summary.loss_value) },
      { 'Métrica': 'Total Anulaciones', 'Valor': reportData.summary.total_count },
    ];

    const wb = XLSX.utils.book_new();
    
    // Details sheet
    const ws1 = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Detalle Anulaciones');
    
    // Summary sheet
    const ws2 = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen');

    // Reasons sheet
    const reasonsData = reportData.reason_ranking.map(r => ({
      'Razón': r.reason,
      'Cantidad': r.count,
      'Porcentaje': `${((r.count / reportData.summary.total_count) * 100).toFixed(1)}%`
    }));
    const ws3 = XLSX.utils.json_to_sheet(reasonsData);
    XLSX.utils.book_append_sheet(wb, ws3, 'Por Razón');

    // Users sheet
    const usersData = reportData.user_audit.map(u => ({
      'Usuario': u.user_name,
      'Cantidad Anulaciones': u.count,
      'Valor Total': formatMoney(u.total_value),
      'Recuperado': formatMoney(u.recovered),
      'Pérdida': formatMoney(u.loss)
    }));
    const ws4 = XLSX.utils.json_to_sheet(usersData);
    XLSX.utils.book_append_sheet(wb, ws4, 'Por Usuario');

    // Download
    XLSX.writeFile(wb, `Reporte_Anulaciones_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Reporte exportado a Excel');
  };

  const getPeriodLabel = () => {
    switch (period) {
      case 'day': return 'Hoy';
      case 'week': return 'Última Semana';
      case 'month': return 'Último Mes';
      default: return 'Personalizado';
    }
  };

  // Prepare pie chart data for reasons
  const pieData = (reportData?.reason_ranking || []).map((r, idx) => ({
    name: r.reason,
    value: r.count,
    color: COLORS[idx % COLORS.length]
  }));

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-oswald text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="text-destructive" /> Reporte de Anulaciones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Análisis de anulaciones y mermas</p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {/* Period Filters */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {['day', 'week', 'month'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  period === p 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-card hover:bg-muted'
                }`}
                data-testid={`filter-${p}`}
              >
                {p === 'day' ? 'Hoy' : p === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
          
          {/* Export Button */}
          <Button onClick={exportToExcel} variant="outline" className="font-oswald" data-testid="export-excel-btn">
            <Download size={16} className="mr-2" /> Exportar Excel
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : reportData ? (
        <>
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-testid="summary-cards">
            {/* Total Voided */}
            <div className="p-5 rounded-xl bg-card border-2 border-border hover:border-destructive/30 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-lg bg-destructive/10">
                  <TrendingDown className="text-destructive" size={20} />
                </div>
                <span className="text-xs font-semibold text-muted-foreground uppercase">Total Anulado</span>
              </div>
              <p className="font-oswald text-2xl font-bold text-destructive">{formatMoney(reportData.summary.total_voided)}</p>
              <p className="text-xs text-muted-foreground mt-1">{reportData.summary.total_count} anulaciones - {getPeriodLabel()}</p>
            </div>

            {/* Recovered */}
            <div className="p-5 rounded-xl bg-card border-2 border-border hover:border-green-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <RotateCcw className="text-green-500" size={20} />
                </div>
                <span className="text-xs font-semibold text-muted-foreground uppercase">Recuperado</span>
              </div>
              <p className="font-oswald text-2xl font-bold text-green-500">{formatMoney(reportData.summary.recovered_value)}</p>
              <p className="text-xs text-muted-foreground mt-1">Devuelto a inventario</p>
            </div>

            {/* Loss */}
            <div className="p-5 rounded-xl bg-card border-2 border-border hover:border-red-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <Ban className="text-red-500" size={20} />
                </div>
                <span className="text-xs font-semibold text-muted-foreground uppercase">Pérdida/Merma</span>
              </div>
              <p className="font-oswald text-2xl font-bold text-red-500">{formatMoney(reportData.summary.loss_value)}</p>
              <p className="text-xs text-muted-foreground mt-1">Sin recuperar</p>
            </div>

            {/* Recovery Rate */}
            <div className="p-5 rounded-xl bg-card border-2 border-border">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="text-primary" size={20} />
                </div>
                <span className="text-xs font-semibold text-muted-foreground uppercase">Tasa Recuperación</span>
              </div>
              <p className="font-oswald text-2xl font-bold text-primary">
                {reportData.summary.total_voided > 0 
                  ? `${((reportData.summary.recovered_value / reportData.summary.total_voided) * 100).toFixed(1)}%`
                  : '0%'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Del valor anulado</p>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Reason Ranking - Bar Chart */}
            <div className="p-5 rounded-xl bg-card border-2 border-border">
              <h3 className="font-oswald text-base font-bold mb-4 flex items-center gap-2">
                <Calendar size={18} className="text-primary" /> Ranking de Razones
              </h3>
              {reportData.reason_ranking.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={reportData.reason_ranking} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis type="number" stroke="#888" fontSize={11} />
                    <YAxis dataKey="reason" type="category" stroke="#888" fontSize={11} width={95} />
                    <Tooltip 
                      contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px' }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="count" fill="#f97316" radius={[0, 4, 4, 0]} name="Cantidad" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                  No hay datos disponibles
                </div>
              )}
            </div>

            {/* Reason Distribution - Pie Chart */}
            <div className="p-5 rounded-xl bg-card border-2 border-border">
              <h3 className="font-oswald text-base font-bold mb-4 flex items-center gap-2">
                <DollarSign size={18} className="text-primary" /> Distribución por Razón
              </h3>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px' }}
                    />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                  No hay datos disponibles
                </div>
              )}
            </div>
          </div>

          {/* User Audit Table */}
          <div className="p-5 rounded-xl bg-card border-2 border-border">
            <h3 className="font-oswald text-base font-bold mb-4 flex items-center gap-2">
              <User size={18} className="text-primary" /> Auditoría por Usuario
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="user-audit-table">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-muted-foreground">Usuario</th>
                    <th className="text-center py-3 px-4 font-semibold text-muted-foreground">Anulaciones</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Valor Total</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Recuperado</th>
                    <th className="text-right py-3 px-4 font-semibold text-muted-foreground">Pérdida</th>
                    <th className="text-center py-3 px-4 font-semibold text-muted-foreground">% Pérdida</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.user_audit.length > 0 ? reportData.user_audit.map((user, idx) => (
                    <tr key={user.user_id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-medium">{user.user_name}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant="outline" className={user.count > 10 ? 'bg-red-500/10 text-red-500' : ''}>
                          {user.count}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-oswald">{formatMoney(user.total_value)}</td>
                      <td className="py-3 px-4 text-right font-oswald text-green-500">{formatMoney(user.recovered)}</td>
                      <td className="py-3 px-4 text-right font-oswald text-red-500">{formatMoney(user.loss)}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`font-oswald ${(user.loss / user.total_value) > 0.5 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {user.total_value > 0 ? `${((user.loss / user.total_value) * 100).toFixed(0)}%` : '0%'}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No hay anulaciones en este período
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Logs Detail */}
          <div className="p-5 rounded-xl bg-card border-2 border-border">
            <h3 className="font-oswald text-base font-bold mb-4">Últimas Anulaciones</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {reportData.logs.length > 0 ? reportData.logs.slice(0, 20).map(log => (
                <div key={log.id} className="p-3 rounded-lg bg-background border border-border hover:border-primary/30 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">
                          {log.product_name || (log.items_cancelled || []).map(i => i.product_name).join(', ')}
                        </span>
                        {log.restored_to_inventory ? (
                          <Badge variant="outline" className="text-[11px] bg-green-500/10 text-green-500 border-green-500/30 shrink-0">
                            <RotateCcw size={10} className="mr-1" /> Retornado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px] bg-red-500/10 text-red-500 border-red-500/30 shrink-0">
                            <Ban size={10} className="mr-1" /> Merma
                          </Badge>
                        )}
                        {log.authorized_by_name && (
                          <Badge variant="outline" className="text-[11px] bg-blue-500/10 text-blue-500 border-blue-500/30 shrink-0">
                            Auth: {log.authorized_by_name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {log.reason} • Por: {log.requested_by_name || log.user_name} • {new Date(log.created_at).toLocaleString('es-DO')}
                      </p>
                      {log.comments && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5 italic">"{log.comments}"</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-oswald font-bold text-destructive">
                        {formatMoney(log.total_value || (log.unit_price * log.quantity))}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        x{log.quantity || (log.items_cancelled || []).reduce((s, i) => s + i.quantity, 0)}
                      </p>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No hay anulaciones en este período
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
