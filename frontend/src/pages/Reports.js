import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatMoney, businessDaysAPI } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, TrendingUp, Calendar, Mail, Users, ArrowRightLeft, 
  Table2, Clock, ChevronDown, ChevronRight, FileText, Download,
  Printer, Send, DollarSign, Package, ShoppingCart, AlertTriangle,
  Percent, Receipt, Building2, ArrowUpRight, ArrowDownRight, Minus,
  Filter, RefreshCw, X, Loader2, FileSpreadsheet, File, Sun
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import ReportXZ from '@/components/ReportXZ';
import {
  DailySalesReport, CashCloseReport, ByCategoryReport, TopProductsReport,
  ByTypeReport, PaymentMethodsReport, VoidAuditReport, InventoryLevelsReport,
  TransfersReport, DifferencesReport, WasteReport, PurchaseOrdersReport,
  BySupplierReport, TaxesReport, ProfitLossReport, TableMovementsReport,
  ByWaiterReport, RecipesReport, StockAdjustmentsReport, SystemAuditReport,
  DiscountsReport
} from './reports';
import ReservationsReport from './reports/ReservationsReport';
import { COLORS } from './reports/reportUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

// Report categories configuration - Reorganized for better navigation
const REPORT_CATEGORIES = [
  {
    id: 'sales',
    name: 'Ventas y Caja',
    icon: DollarSign,
    color: 'from-emerald-500 to-green-600',
    bgColor: 'bg-emerald-500/10',
    reports: [
      { id: 'daily-close', name: 'Cierre del Día', description: 'Resumen completo de ventas diarias' },
      { id: 'cash-close', name: 'Cierre de Caja', description: 'Desglose por formas de pago' },
      { id: 'top-products', name: 'Top 10/20/30 Más Vendidos', description: 'Productos más vendidos con selector' },
      { id: 'by-waiter', name: 'Ventas por Mesero', description: 'Rendimiento del personal de servicio' },
      { id: 'by-category', name: 'Ventas por Categoría', description: 'Distribución de ventas por categoría' },
      { id: 'payment-methods', name: 'Formas de Pago', description: 'Desglose detallado por método de pago' },
      { id: 'void-audit', name: 'Auditoría de Anulaciones', description: 'Anulaciones con nombre del autorizador' },
      { id: 'discounts', name: 'Descuentos Aplicados', description: 'Detalle de descuentos aplicados a facturas' },
    ]
  },
  {
    id: 'inventory',
    name: 'Inventario, Almacén y Compras',
    icon: Package,
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-blue-500/10',
    reports: [
      { id: 'inventory-levels', name: 'Niveles por Almacén', description: 'Stock actual por ubicación' },
      { id: 'transfers', name: 'Transferencias entre Almacenes', description: 'Historial de movimientos' },
      { id: 'differences', name: 'Diferencias de Inventario', description: 'Faltantes y sobrantes' },
      { id: 'waste', name: 'Mermas', description: 'Pérdidas y desperdicios' },
      { id: 'recipes', name: 'Recetas', description: 'Análisis de costos de recetas' },
      { id: 'purchase-orders', name: 'Órdenes de Compras', description: 'Historial y estado de compras' },
      { id: 'stock-adjustments', name: 'Ajustes de Stock', description: 'Historial de ajustes manuales de inventario' },
    ]
  },
  {
    id: 'fiscal',
    name: 'Fiscal',
    icon: Receipt,
    color: 'from-red-500 to-rose-600',
    bgColor: 'bg-red-500/10',
    reports: [
      { id: 'taxes', name: 'Impuestos (ITBIS y Propina)', description: 'Recaudación fiscal para declaraciones' },
      { id: 'by-supplier', name: 'Gastos por Proveedor', description: 'Desglose para reportes 606/607' },
      { id: 'bill-history', name: 'Historial de Facturas', description: 'Facturas pagadas y notas de crédito (B04)', link: '/reports/facturas' },
    ]
  },
  {
    id: 'audit',
    name: 'Auditoría y Operaciones',
    icon: AlertTriangle,
    color: 'from-amber-500 to-orange-600',
    bgColor: 'bg-amber-500/10',
    reports: [
      { id: 'profit-loss', name: 'Ganancias y Pérdidas', description: 'Estado de resultados' },
      { id: 'table-movements', name: 'Movimientos de Mesas', description: 'Trazabilidad de usuario' },
      { id: 'reservations', name: 'Reservaciones', description: 'Análisis de reservas, no-shows y clientes frecuentes' },
      { id: 'system-audit', name: 'Auditoría General del Sistema', description: 'Historial de actividades' },
    ]
  },
];

// Business info for letterhead (updated dynamically from settings)
let BUSINESS_INFO = {
  name: 'Mesa POS RD',
  rnc: '000-000000-0',
  address: '',
  phone: ''
};

// Columns to hide in exports (technical IDs)
const HIDDEN_COLUMNS = [
  'warehouse_id', 'supplier_id', 'ingredient_id', 'id', 'reference_id',
  '_id', 'user_id', 'product_id', 'category_id', 'sparkline'
];

// Column name translations for cleaner display
const COLUMN_TRANSLATIONS = {
  'warehouse_name': 'Almacén',
  'name': 'Nombre',
  'current_stock': 'Stock Actual',
  'min_stock': 'Stock Mínimo',
  'total_value': 'Valor Total',
  'value': 'Valor',
  'unit': 'Unidad',
  'is_low': 'Bajo Stock',
  'avg_cost': 'Costo Promedio',
  'items': 'Productos',
  'quantity': 'Cantidad',
  'total': 'Total',
  'count': 'Cantidad',
  'percentage': 'Porcentaje',
  'reason': 'Razón',
  'from_warehouse': 'Origen',
  'to_warehouse': 'Destino',
  'created_at': 'Fecha',
  'user_name': 'Usuario',
  'orders': 'Órdenes',
  'rnc': 'RNC',
  'contact': 'Contacto',
  'date': 'Fecha',
  'subtotal': 'Subtotal',
  'itbis': 'ITBIS',
  'tips': 'Propinas'
};

// Format value for export (handles objects, arrays, currency, booleans)
const formatExportValue = (value, key) => {
  if (value === null || value === undefined) return '-';
  
  // Handle arrays (like items list)
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    // If array contains objects with ingredient_name or name
    if (typeof value[0] === 'object') {
      return value.map(item => {
        if (item.ingredient_name) return `${item.ingredient_name} (${item.quantity || 1})`;
        if (item.name) return item.name;
        if (item.product_name) return item.product_name;
        return JSON.stringify(item);
      }).join(', ');
    }
    return value.join(', ');
  }
  
  // Handle objects
  if (typeof value === 'object') {
    if (value.name) return value.name;
    if (value.ingredient_name) return value.ingredient_name;
    return '-';
  }
  
  // Handle booleans
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }
  
  // Handle currency values
  if (typeof value === 'number') {
    const currencyKeys = ['total', 'value', 'price', 'cost', 'subtotal', 'itbis', 'tips', 'total_value', 'avg_cost'];
    if (currencyKeys.some(k => key.toLowerCase().includes(k))) {
      return `RD$ ${value.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    // Format percentages
    if (key.toLowerCase().includes('percent') || key.toLowerCase().includes('margin')) {
      return `${value.toFixed(1)}%`;
    }
    return value.toLocaleString('es-DO');
  }
  
  return value;
};

// Filter out hidden columns and translate headers
const processDataForExport = (data) => {
  if (!Array.isArray(data) || data.length === 0) return { headers: [], rows: [] };
  
  // Get visible headers (exclude hidden columns)
  const allHeaders = Object.keys(data[0]);
  const visibleHeaders = allHeaders.filter(h => !HIDDEN_COLUMNS.includes(h.toLowerCase()));
  
  // Translate headers
  const translatedHeaders = visibleHeaders.map(h => 
    COLUMN_TRANSLATIONS[h.toLowerCase()] || h.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  );
  
  // Process rows
  const rows = data.map(row => 
    visibleHeaders.map(h => formatExportValue(row[h], h))
  );
  
  return { headers: translatedHeaders, rows, originalHeaders: visibleHeaders };
};

// Export utility functions
const exportToPDF = async (reportId, data, dateRange, businessName = BUSINESS_INFO.name) => {
  const printWindow = window.open('', '_blank');
  const htmlContent = generatePDFHTML(reportId, data, dateRange, businessName);
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 500);
};

const generatePDFHTML = (reportId, data, dateRange, businessName) => {
  const reportName = REPORT_CATEGORIES.flatMap(c => c.reports).find(r => r.id === reportId)?.name || 'Reporte';
  const dateStr = dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from} al ${dateRange.to}`;
  const generatedDate = new Date().toLocaleString('es-DO');
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${reportName} - ${businessName}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; font-size: 11px; }
        .letterhead { border-bottom: 3px solid #FF6600; padding-bottom: 15px; margin-bottom: 20px; }
        .letterhead-main { display: flex; justify-content: space-between; align-items: flex-start; }
        .letterhead h1 { color: #FF6600; margin: 0; font-size: 28px; font-weight: bold; }
        .letterhead .rnc { color: #333; font-size: 12px; margin-top: 4px; font-weight: 600; }
        .letterhead .report-info { text-align: right; }
        .letterhead .report-title { color: #333; font-size: 16px; font-weight: bold; margin-bottom: 5px; }
        .letterhead .report-date { color: #666; font-size: 11px; }
        .letterhead .generated { color: #999; font-size: 10px; margin-top: 3px; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background: #FF6600; color: white; padding: 8px 10px; text-align: left; font-size: 10px; font-weight: bold; }
        td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 10px; }
        tr:nth-child(even) { background: #fafafa; }
        tr:hover { background: #fff8f0; }
        .total-row { background: #fff8f0 !important; font-weight: bold; }
        .summary-box { background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #eee; }
        .summary-grid { display: flex; flex-wrap: wrap; gap: 20px; }
        .summary-item { min-width: 120px; }
        .summary-label { color: #666; font-size: 10px; text-transform: uppercase; }
        .summary-value { font-size: 18px; font-weight: bold; color: #FF6600; }
        .currency { font-family: 'Courier New', monospace; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 9px; color: #999; text-align: center; }
        @media print {
          body { margin: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="letterhead">
        <div class="letterhead-main">
          <div>
            <h1>${businessName}</h1>
            <div class="rnc">RNC: ${BUSINESS_INFO.rnc}</div>
          </div>
          <div class="report-info">
            <div class="report-title">${reportName}</div>
            <div class="report-date">Período: ${dateStr}</div>
            <div class="generated">Generado: ${generatedDate}</div>
          </div>
        </div>
      </div>
      ${generateReportContent(reportId, data)}
      <div class="footer">
        Documento generado automáticamente por ${businessName} | ${generatedDate} | Válido para auditoría interna
      </div>
    </body>
    </html>
  `;
};

const generateReportContent = (reportId, data) => {
  if (!data) return '<p>No hay datos disponibles</p>';
  
  let html = '';
  
  // Generate summary section if present
  if (data.summary) {
    html += '<div class="summary-box"><div class="summary-grid">';
    Object.entries(data.summary).forEach(([key, value]) => {
      // Skip technical fields
      if (HIDDEN_COLUMNS.includes(key.toLowerCase())) return;
      
      const label = COLUMN_TRANSLATIONS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const formattedValue = formatExportValue(value, key);
      html += `<div class="summary-item"><div class="summary-label">${label}</div><div class="summary-value">${formattedValue}</div></div>`;
    });
    html += '</div></div>';
  }
  
  // Find the main data array
  const dataArrays = ['products', 'suppliers', 'methods', 'by_reason', 'by_user', 'by_authorizer', 
                      'daily', 'logs', 'items', 'transfers', 'by_ingredient', 'by_supplier', 'by_status'];
  
  for (const arrayName of dataArrays) {
    if (data[arrayName] && Array.isArray(data[arrayName]) && data[arrayName].length > 0) {
      const { headers, rows } = processDataForExport(data[arrayName]);
      if (headers.length > 0) {
        const sectionTitle = COLUMN_TRANSLATIONS[arrayName] || arrayName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        html += `<h3 style="color: #333; margin-top: 20px; font-size: 13px;">${sectionTitle}</h3>`;
        html += '<table><thead><tr>';
        headers.forEach(h => { html += `<th>${h}</th>`; });
        html += '</tr></thead><tbody>';
        rows.forEach(row => {
          html += '<tr>';
          row.forEach(val => { html += `<td>${val}</td>`; });
          html += '</tr>';
        });
        html += '</tbody></table>';
      }
    }
  }
  
  // Handle direct array data
  if (Array.isArray(data) && data.length > 0) {
    const { headers, rows } = processDataForExport(data);
    if (headers.length > 0) {
      html += '<table><thead><tr>';
      headers.forEach(h => { html += `<th>${h}</th>`; });
      html += '</tr></thead><tbody>';
      rows.forEach(row => {
        html += '<tr>';
        row.forEach(val => { html += `<td>${val}</td>`; });
        html += '</tr>';
      });
      html += '</tbody></table>';
    }
  }
  
  return html || '<p>No hay datos para el período seleccionado</p>';
};

const exportToExcel = async (reportId, data, dateRange) => {
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const reportName = REPORT_CATEGORIES.flatMap(c => c.reports).find(r => r.id === reportId)?.name || 'Reporte';
    const dateStr = dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from} al ${dateRange.to}`;
    
    // Prepare data for Excel with letterhead
    let sheetData = [];
    
    // Add letterhead
    sheetData.push([BUSINESS_INFO.name]);
    sheetData.push([`RNC: ${BUSINESS_INFO.rnc}`]);
    sheetData.push([]);
    sheetData.push([reportName]);
    sheetData.push([`Período: ${dateStr}`]);
    sheetData.push([`Generado: ${new Date().toLocaleString('es-DO')}`]);
    sheetData.push([]);
    
    // Add summary if present
    if (data.summary) {
      sheetData.push(['RESUMEN']);
      Object.entries(data.summary).forEach(([key, value]) => {
        if (HIDDEN_COLUMNS.includes(key.toLowerCase())) return;
        const label = COLUMN_TRANSLATIONS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        sheetData.push([label, formatExportValue(value, key)]);
      });
      sheetData.push([]);
    }
    
    // Find and add main data arrays
    const dataArrays = ['products', 'suppliers', 'methods', 'by_reason', 'by_user', 'by_authorizer', 
                        'daily', 'logs', 'items', 'transfers', 'by_ingredient', 'by_supplier', 'by_status'];
    
    for (const arrayName of dataArrays) {
      if (data[arrayName] && Array.isArray(data[arrayName]) && data[arrayName].length > 0) {
        const { headers, rows } = processDataForExport(data[arrayName]);
        if (headers.length > 0) {
          const sectionTitle = COLUMN_TRANSLATIONS[arrayName] || arrayName.replace(/_/g, ' ').toUpperCase();
          sheetData.push([sectionTitle]);
          sheetData.push(headers);
          rows.forEach(row => sheetData.push(row));
          sheetData.push([]);
        }
      }
    }
    
    // Handle direct array data
    if (Array.isArray(data) && data.length > 0) {
      const { headers, rows } = processDataForExport(data);
      if (headers.length > 0) {
        sheetData.push(headers);
        rows.forEach(row => sheetData.push(row));
      }
    }
    
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    
    // Set column widths
    ws['!cols'] = Array(10).fill({ wch: 18 });
    
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    
    const fileName = `${reportName.replace(/\s+/g, '_')}_${dateRange.from}_${dateRange.to}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success('Excel exportado correctamente');
  } catch (error) {
    console.error('Export error:', error);
    toast.error('Error al exportar Excel');
  }
};

export default function Reports() {
  const navigate = useNavigate();
  
  // State
  const [dateRange, setDateRange] = useState({
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10)
  });
  const [expandedCategories, setExpandedCategories] = useState(['sales']);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sending, setSending] = useState(false);
  const [topLimit, setTopLimit] = useState(10);
  const [sparklineData, setSparklineData] = useState([]);
  const [businessConfig, setBusinessConfig] = useState({ name: 'Mesa POS RD', rnc: '000-000000-0' });
  
  // Business Day (Jornada) filter state
  const [businessDays, setBusinessDays] = useState([]);
  const [selectedBusinessDay, setSelectedBusinessDay] = useState(null);
  const [loadingBusinessDays, setLoadingBusinessDays] = useState(false);
  const [reportZOpen, setReportZOpen] = useState(false);
  const [reportZDayId, setReportZDayId] = useState(null);
  const [auditEventFilter, setAuditEventFilter] = useState('Todos');
  
  // Quick date presets
  const datePresets = [
    { label: 'Hoy', value: () => {
      const today = new Date().toISOString().slice(0, 10);
      return { from: today, to: today };
    }},
    { label: 'Ayer', value: () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      return { from: yesterday, to: yesterday };
    }},
    { label: 'Esta Semana', value: () => {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      return { from: monday.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
    }},
    { label: 'Este Mes', value: () => {
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: firstDay.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
    }},
  ];

  // Fetch business config and sparkline data on load
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch sparklines
        const sparkRes = await axios.get(`${API}/reports/daily-sparklines`, { 
          params: { days: 7 }, 
          headers: headers() 
        });
        setSparklineData(sparkRes.data);
        
        // Fetch business config from system/config
        const configRes = await axios.get(`${API}/system/config`, { headers: headers() });
        if (configRes.data) {
          const businessName = configRes.data.restaurant_name || 'Mesa POS RD';
          const rnc = configRes.data.rnc || '000-000000-0';
          setBusinessConfig({ name: businessName, rnc: rnc });
          // Update the global BUSINESS_INFO for export functions
          BUSINESS_INFO.name = businessName;
          BUSINESS_INFO.rnc = rnc;
        }
        
        // Fetch business days (jornadas) for filter
        setLoadingBusinessDays(true);
        const daysRes = await businessDaysAPI.history({ limit: 30 });
        setBusinessDays(daysRes.data || []);
        setLoadingBusinessDays(false);
      } catch (err) {
        console.log('Error fetching initial data');
        setLoadingBusinessDays(false);
      }
    };
    fetchInitialData();
  }, []);
  
  // Auto-recargar reporte cuando cambia el rango de fechas
  useEffect(() => {
    if (selectedReport) {
      loadReport(selectedReport);
    }
  }, [dateRange]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // When selecting a business day, update the date range
  const handleSelectBusinessDay = (day) => {
    if (day) {
      setSelectedBusinessDay(day);
      setDateRange({
        from: day.business_date,
        to: day.business_date
      });
    } else {
      setSelectedBusinessDay(null);
    }
  };

  // Load report data
  const loadReport = useCallback(async (reportId) => {
    setLoading(true);
    setSelectedReport(reportId);
    
    const endpoints = {
      'daily-close': '/reports/daily-sales',
      'cash-close': '/reports/cash-close',
      'by-category': '/reports/sales-by-category',
      'top-products': '/reports/top-products-extended',
      'by-type': '/reports/sales-by-type',
      'payment-methods': '/reports/payment-methods-breakdown',
      'void-audit': '/reports/void-audit',
      'inventory-levels': '/reports/inventory-by-warehouse',
      'transfers': '/reports/transfers',
      'differences': '/reports/inventory-differences',
      'waste': '/reports/waste-report',
      'recipes': '/reports/inventory-valuation',
      'purchase-orders': '/reports/purchase-orders',
      'by-supplier': '/reports/by-supplier',
      'taxes': '/reports/taxes',
      'profit-loss': '/reports/profit-loss',
      'table-movements': '/reports/table-movements',
      'by-waiter': '/reports/sales-by-waiter',
      'system-audit': '/reports/system-audit',
      'stock-adjustments': '/reports/stock-adjustments',
      'discounts': '/reports/discounts',
    };
    
    const endpoint = endpoints[reportId];
    if (!endpoint) {
      setLoading(false);
      toast.error('Reporte no disponible');
      return;
    }
    
    try {
      const params = {
        date: dateRange.from,
        date_from: dateRange.from,
        date_to: dateRange.to,
      };
      if (reportId === 'top-products') {
        params.limit = topLimit;
      }
      if (reportId === 'system-audit' && auditEventFilter && auditEventFilter !== 'Todos') {
        params.event_type = auditEventFilter;
      }
      
      const res = await axios.get(`${API}${endpoint}`, { 
        params, 
        headers: headers() 
      });
      setReportData(res.data);
    } catch (error) {
      toast.error('Error al cargar reporte');
      setReportData(null);
    }
    setLoading(false);
  }, [dateRange, topLimit, auditEventFilter]);

  // Toggle category expansion
  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Send report by email
  const sendReportByEmail = async () => {
    if (!emailTo) {
      toast.error('Ingresa un correo electrónico');
      return;
    }
    setSending(true);
    try {
      await axios.post(`${API}/email/daily-close`, {
        to: emailTo,
        date: dateRange.from
      }, { headers: headers() });
      toast.success('Reporte enviado por correo');
    } catch {
      toast.error('Error al enviar correo');
    }
    setSending(false);
  };

  // Print report
  const printReport = () => {
    if (!selectedReport || !reportData) {
      toast.error('Selecciona un reporte primero');
      return;
    }
    exportToPDF(selectedReport, reportData, dateRange);
  };

  // ═══════════════════════════════════════════════════════════════
  // Render report content using extracted components
  // ═══════════════════════════════════════════════════════════════
  const renderReportContent = () => {
    if (!selectedReport) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <FileText size={48} className="mb-4 opacity-50" />
          <p className="text-sm">Selecciona un reporte de la lista izquierda</p>
        </div>
      );
    }
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      );
    }
    if (!reportData) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <AlertTriangle size={48} className="mb-4 opacity-50" />
          <p className="text-sm">No hay datos disponibles</p>
        </div>
      );
    }

    switch (selectedReport) {
      case 'daily-close':
        return <DailySalesReport data={reportData} sparklineData={sparklineData} />;
      case 'cash-close':
        return <CashCloseReport data={reportData} />;
      case 'by-category':
        return <ByCategoryReport data={reportData} />;
      case 'top-products':
        return <TopProductsReport data={reportData} topLimit={topLimit} onChangeLimit={(n) => { setTopLimit(n); loadReport('top-products'); }} />;
      case 'by-type':
        return <ByTypeReport data={reportData} />;
      case 'payment-methods':
        return <PaymentMethodsReport data={reportData} />;
      case 'void-audit':
        return <VoidAuditReport data={reportData} />;
      case 'inventory-levels':
        return <InventoryLevelsReport data={reportData} />;
      case 'transfers':
        return <TransfersReport data={reportData} />;
      case 'differences':
        return <DifferencesReport data={reportData} />;
      case 'waste':
        return <WasteReport data={reportData} />;
      case 'purchase-orders':
        return <PurchaseOrdersReport data={reportData} />;
      case 'by-supplier':
        return <BySupplierReport data={reportData} />;
      case 'taxes':
        return <TaxesReport data={reportData} />;
      case 'profit-loss':
        return <ProfitLossReport data={reportData} />;
      case 'table-movements':
        return <TableMovementsReport data={reportData} />;
      case 'by-waiter':
        return <ByWaiterReport data={reportData} />;
      case 'recipes':
        return <RecipesReport data={reportData} />;
      case 'stock-adjustments':
        return <StockAdjustmentsReport data={reportData} />;
      case 'system-audit':
        return <SystemAuditReport data={reportData} auditEventFilter={auditEventFilter} onFilterChange={setAuditEventFilter} onReload={() => loadReport('system-audit')} />;
      case 'discounts':
        return <DiscountsReport data={reportData} />;
      default:
        return <pre className="text-xs overflow-auto">{JSON.stringify(reportData, null, 2)}</pre>;
    }
  };

  return (
    <div className="h-full flex flex-col" data-testid="reports-page">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3 bg-card/50">
        <div className="flex items-center gap-2">
          <BarChart3 size={22} className="text-primary" />
          <h1 className="font-oswald text-xl font-bold tracking-wide">REPORTES</h1>
        </div>
        
        {/* Global Date Range */}
        <div className="flex items-center gap-2 flex-wrap">
          {datePresets.map((preset, i) => (
            <Button 
              key={i}
              size="sm" 
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setDateRange(preset.value())}
            >
              {preset.label}
            </Button>
          ))}
          <div className="flex items-center gap-1">
            <Calendar size={14} className="text-muted-foreground" />
            <input 
              type="date" 
              value={dateRange.from} 
              onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="bg-card border border-border rounded-lg px-2 py-1 text-xs font-mono w-32"
              data-testid="date-from"
            />
            <span className="text-muted-foreground text-xs">al</span>
            <input 
              type="date" 
              value={dateRange.to} 
              onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="bg-card border border-border rounded-lg px-2 py-1 text-xs font-mono w-32"
              data-testid="date-to"
            />
          </div>
          <Button 
            size="sm" 
            variant="outline" 
            className="h-7"
            onClick={() => selectedReport && loadReport(selectedReport)}
          >
            <RefreshCw size={12} className="mr-1" /> Actualizar
          </Button>
          
          {/* Business Day (Jornada) Filter */}
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
            <Sun size={14} className="text-amber-400" />
            <select
              value={selectedBusinessDay?.id || ''}
              onChange={(e) => {
                const day = businessDays.find(d => d.id === e.target.value);
                handleSelectBusinessDay(day);
              }}
              className="bg-card border border-border rounded-lg px-2 py-1 text-xs w-48"
              data-testid="business-day-filter"
            >
              <option value="">Por Fecha Civil</option>
              {loadingBusinessDays ? (
                <option disabled>Cargando...</option>
              ) : (
                businessDays.map(day => (
                  <option key={day.id} value={day.id}>
                    {day.ref} ({day.business_date}) {day.status === 'open' ? '🟢' : ''}
                  </option>
                ))
              )}
            </select>
            {selectedBusinessDay && (
              <>
                <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">
                  Jornada: {selectedBusinessDay.business_date}
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    setReportZDayId(selectedBusinessDay.id);
                    setReportZOpen(true);
                  }}
                  title="Ver Reporte Z"
                >
                  <FileText size={12} className="text-cyan-400" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Report Categories */}
        <div className="w-72 border-r border-border bg-card/30 overflow-y-auto">
          <div className="p-3">
            {REPORT_CATEGORIES.map(category => (
              <div key={category.id} className="mb-2">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg transition-all ${expandedCategories.includes(category.id) ? category.bgColor : 'hover:bg-card'}`}
                  data-testid={`category-${category.id}`}
                >
                  {expandedCategories.includes(category.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <div className={`p-1.5 rounded-md bg-gradient-to-br ${category.color}`}>
                    <category.icon size={14} className="text-white" />
                  </div>
                  <span className="text-sm font-semibold flex-1 text-left">{category.name}</span>
                </button>
                
                {/* Reports List */}
                {expandedCategories.includes(category.id) && (
                  <div className="ml-6 mt-1 space-y-1">
                    {category.reports.map(report => (
                      <button
                        key={report.id}
                        onClick={() => report.link ? navigate(report.link) : loadReport(report.id)}
                        className={`w-full text-left p-2 rounded-lg text-xs transition-all ${selectedReport === report.id ? 'bg-primary/20 border border-primary/40 text-primary' : 'hover:bg-card text-muted-foreground hover:text-foreground'}`}
                        data-testid={`report-${report.id}`}
                      >
                        <p className="font-medium">{report.name}</p>
                        <p className="text-[10px] opacity-70 mt-0.5">{report.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Report Actions Bar */}
          {selectedReport && (
            <div className="px-4 py-2 border-b border-border bg-card/50 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="font-oswald text-sm font-bold uppercase">
                  {REPORT_CATEGORIES.flatMap(c => c.reports).find(r => r.id === selectedReport)?.name}
                </h2>
                {loading && <Loader2 size={14} className="animate-spin text-primary" />}
              </div>
              
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 text-xs"
                  onClick={() => exportToExcel(selectedReport, reportData, dateRange)}
                  disabled={!reportData}
                  data-testid="export-excel-btn"
                >
                  <FileSpreadsheet size={12} className="mr-1" /> Excel
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 text-xs"
                  onClick={printReport}
                  disabled={!reportData}
                  data-testid="export-pdf-btn"
                >
                  <File size={12} className="mr-1" /> PDF
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 text-xs"
                  onClick={() => window.print()}
                  disabled={!reportData}
                  data-testid="print-btn"
                >
                  <Printer size={12} className="mr-1" /> Imprimir
                </Button>
                <div className="flex items-center gap-1 ml-2">
                  <input 
                    type="email" 
                    value={emailTo} 
                    onChange={e => setEmailTo(e.target.value)}
                    placeholder="correo@email.com"
                    className="bg-background border border-border rounded-lg px-2 py-1 text-xs w-40"
                    data-testid="email-input"
                  />
                  <Button 
                    size="sm" 
                    variant="default" 
                    className="h-7 text-xs"
                    onClick={sendReportByEmail}
                    disabled={sending || !reportData}
                    data-testid="send-email-btn"
                  >
                    {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Report Content */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="max-w-5xl mx-auto">
              {renderReportContent()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Report Z Dialog */}
      <ReportXZ
        type="Z"
        dayId={reportZDayId}
        open={reportZOpen}
        onClose={() => {
          setReportZOpen(false);
          setReportZDayId(null);
        }}
      />
    </div>
  );
}
