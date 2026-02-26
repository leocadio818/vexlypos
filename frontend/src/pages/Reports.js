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
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  CartesianGrid, Legend
} from 'recharts';
import axios from 'axios';
import ReportXZ from '@/components/ReportXZ';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('pos_token')}` });

const COLORS = ['#FF6600', '#E53935', '#1E88E5', '#43A047', '#FFB300', '#E91E63', '#8E24AA', '#00BCD4', '#FF5722', '#607D8B'];

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
      { id: 'system-audit', name: 'Auditoría General del Sistema', description: 'Historial de actividades' },
    ]
  },
];

// Sparkline mini chart component
const Sparkline = ({ data, color = '#FF6600', height = 24 }) => {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  return (
    <svg width="60" height={height} className="inline-block ml-2">
      <polyline
        points={data.map((v, i) => `${i * (60 / (data.length - 1))},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

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

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="font-semibold">{payload[0]?.payload?.name || payload[0]?.payload?.category || payload[0]?.payload?.date}</p>
        <p className="font-oswald text-primary">{formatMoney(payload[0]?.value)}</p>
      </div>
    );
  };

  // Render specific report content
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

    // Render based on report type
    switch (selectedReport) {
      case 'daily-close':
        return renderDailySalesReport();
      case 'cash-close':
        return renderCashCloseReport();
      case 'by-category':
        return renderByCategoryReport();
      case 'top-products':
        return renderTopProductsReport();
      case 'by-type':
        return renderByTypeReport();
      case 'payment-methods':
        return renderPaymentMethodsReport();
      case 'void-audit':
        return renderVoidAuditReport();
      case 'inventory-levels':
        return renderInventoryLevelsReport();
      case 'transfers':
        return renderTransfersReport();
      case 'differences':
        return renderDifferencesReport();
      case 'waste':
        return renderWasteReport();
      case 'purchase-orders':
        return renderPurchaseOrdersReport();
      case 'by-supplier':
        return renderBySupplierReport();
      case 'taxes':
        return renderTaxesReport();
      case 'profit-loss':
        return renderProfitLossReport();
      case 'table-movements':
        return renderTableMovementsReport();
      case 'by-waiter':
        return renderByWaiterReport();
      case 'system-audit':
        return renderSystemAuditReport();
      case 'recipes':
        return renderRecipesReport();
      default:
        return <pre className="text-xs overflow-auto">{JSON.stringify(reportData, null, 2)}</pre>;
    }
  };

  // Report renderers
  const renderDailySalesReport = () => {
    const data = reportData;
    const sparkData = sparklineData.map(d => d.total);
    const trend = sparkData.length > 1 ? ((sparkData[sparkData.length - 1] - sparkData[0]) / (sparkData[0] || 1) * 100) : 0;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-emerald-400 uppercase tracking-wider">Total Ventas</p>
            <p className="font-oswald text-2xl font-bold text-emerald-400">{formatMoney(data.total_sales)}</p>
            <div className="flex items-center justify-center gap-1 text-[10px] mt-1">
              <Sparkline data={sparkData} color="#10b981" />
              {trend > 0 ? <ArrowUpRight size={12} className="text-green-400" /> : trend < 0 ? <ArrowDownRight size={12} className="text-red-400" /> : <Minus size={12} />}
              <span className={trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-muted-foreground'}>{Math.abs(trend).toFixed(1)}%</span>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Facturas</p>
            <p className="font-oswald text-2xl font-bold">{data.total_bills}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">ITBIS 18%</p>
            <p className="font-oswald text-xl font-bold text-blue-400">{formatMoney(data.total_itbis)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Propinas</p>
            <p className="font-oswald text-xl font-bold text-yellow-400">{formatMoney(data.total_tips)}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Efectivo</p>
            <p className="font-oswald text-xl font-bold text-green-400">{formatMoney(data.cash_sales)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Tarjeta</p>
            <p className="font-oswald text-xl font-bold text-purple-400">{formatMoney(data.card_sales)}</p>
          </div>
        </div>
        
        {/* Hourly chart */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Tendencia 7 días</h4>
          {sparklineData.length > 0 && (
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={sparklineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="day_name" tick={{ fontSize: 10, fill: '#666' }} />
                <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="total" stroke="#FF6600" fill="#FF6600" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    );
  };

  const renderCashCloseReport = () => {
    const data = reportData;
    if (!data?.summary) return null;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-emerald-400 uppercase">Total Ventas</p>
            <p className="font-oswald text-2xl font-bold text-emerald-400">{formatMoney(data.summary.total_sales)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Efectivo</p>
            <p className="font-oswald text-xl font-bold text-green-400">{formatMoney(data.summary.cash_total)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Tarjetas/Otros</p>
            <p className="font-oswald text-xl font-bold text-purple-400">{formatMoney(data.summary.card_total)}</p>
          </div>
        </div>
        
        {data.by_payment_method?.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Desglose por Forma de Pago</h4>
            <div className="space-y-2">
              {data.by_payment_method.map((pm, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                  <div className="flex items-center gap-2">
                    <Badge variant={pm.is_cash ? 'default' : 'secondary'} className="text-[10px]">
                      {pm.is_cash ? 'Efectivo' : 'Electrónico'}
                    </Badge>
                    <span className="font-medium text-sm">{pm.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">{pm.count} transacciones</span>
                    <span className="font-oswald text-primary font-bold">{formatMoney(pm.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderByCategoryReport = () => {
    const data = Array.isArray(reportData) ? reportData : [];
    if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-12">Sin datos para este período</p>;
    
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Distribución por Categoría</h4>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie 
                data={data} 
                dataKey="total" 
                nameKey="category" 
                cx="50%" 
                cy="50%" 
                outerRadius={90} 
                label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Ranking de Categorías</h4>
          <div className="space-y-2">
            {data.map((cat, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="font-medium text-sm">{cat.category}</span>
                </div>
                <span className="font-oswald text-primary font-bold">{formatMoney(cat.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderTopProductsReport = () => {
    const data = reportData?.products || [];
    
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Mostrar Top:</span>
          {[10, 20, 30].map(n => (
            <Button 
              key={n}
              size="sm" 
              variant={topLimit === n ? 'default' : 'outline'}
              onClick={() => { setTopLimit(n); loadReport('top-products'); }}
              className="h-7 px-3 text-xs"
            >
              {n}
            </Button>
          ))}
        </div>
        
        {data.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Top Productos</h4>
              <ResponsiveContainer width="100%" height={Math.min(data.length * 35, 400)}>
                <BarChart data={data.slice(0, 10)} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 9, fill: '#999' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" fill="#FF6600" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="bg-card border border-border rounded-xl p-4 overflow-auto max-h-[450px]">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Detalle con Tendencia</h4>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-1">#</th>
                    <th className="text-left py-2">Producto</th>
                    <th className="text-right py-2">Cant.</th>
                    <th className="text-right py-2">Total</th>
                    <th className="text-right py-2">Tendencia</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-2 px-1 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 font-medium truncate max-w-[120px]">{p.name}</td>
                      <td className="py-2 text-right text-muted-foreground">{p.quantity}</td>
                      <td className="py-2 text-right font-oswald text-primary">{formatMoney(p.total)}</td>
                      <td className="py-2 text-right">
                        <Sparkline data={p.sparkline || []} color="#FF6600" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-12">Sin datos para este período</p>
        )}
      </div>
    );
  };

  const renderByTypeReport = () => {
    const data = reportData?.types || [];
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.slice(0, 4).map((t, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase truncate">{t.name}</p>
              <p className="font-oswald text-xl font-bold text-primary">{formatMoney(t.total)}</p>
              <p className="text-[10px] text-muted-foreground">{t.count} transacciones</p>
            </div>
          ))}
        </div>
        
        {data.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#666' }} />
                <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" fill="#FF6600" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  };

  const renderPaymentMethodsReport = () => {
    const data = reportData?.methods || [];
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Distribución</h4>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie 
                  data={data} 
                  dataKey="total" 
                  nameKey="name" 
                  cx="50%" 
                  cy="50%" 
                  outerRadius={70}
                  innerRadius={40}
                  label={({ name, percentage }) => `${name} ${percentage}%`}
                >
                  {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Detalle con Tendencia</h4>
            <div className="space-y-2">
              {data.map((pm, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="font-medium text-sm">{pm.name}</span>
                    <Sparkline data={pm.sparkline || []} color={COLORS[i % COLORS.length]} />
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <Badge variant="outline" className="text-[9px]">{pm.percentage}%</Badge>
                    <span className="font-oswald text-primary font-bold">{formatMoney(pm.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderVoidAuditReport = () => {
    const data = reportData;
    if (!data?.summary) return null;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-red-400 uppercase">Total Anulado</p>
            <p className="font-oswald text-2xl font-bold text-red-400">{formatMoney(data.summary.total_voided)}</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-green-400 uppercase">Recuperado</p>
            <p className="font-oswald text-xl font-bold text-green-400">{formatMoney(data.summary.total_recovered)}</p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-amber-400 uppercase">Pérdida Neta</p>
            <p className="font-oswald text-xl font-bold text-amber-400">{formatMoney(data.summary.total_loss)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total Anulaciones</p>
            <p className="font-oswald text-2xl font-bold">{data.summary.total_count}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* By Reason */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Razón</h4>
            {data.by_reason?.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.by_reason.slice(0, 6)} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#666' }} />
                  <YAxis dataKey="reason" type="category" width={100} tick={{ fontSize: 9, fill: '#999' }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#E53935" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
            )}
          </div>
          
          {/* By Authorizer */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Autorizadores</h4>
            {data.by_authorizer?.length > 0 ? (
              <div className="space-y-2">
                {data.by_authorizer.map((auth, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-muted-foreground" />
                      <span className="font-medium text-sm">{auth.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary">{auth.count} anulaciones</Badge>
                      <span className="font-oswald text-red-400">{formatMoney(auth.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sin autorizaciones registradas</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderInventoryLevelsReport = () => {
    const data = Array.isArray(reportData) ? reportData : [];
    
    return (
      <div className="space-y-4">
        {data.map((wh, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-primary" />
                <h4 className="text-sm font-semibold">{wh.warehouse_name}</h4>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {wh.low_stock_count > 0 && (
                  <Badge variant="destructive">{wh.low_stock_count} bajo stock</Badge>
                )}
                <span className="font-oswald text-primary">Valor: {formatMoney(wh.total_value)}</span>
              </div>
            </div>
            
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2">Insumo</th>
                    <th className="text-right py-2">Stock</th>
                    <th className="text-right py-2">Mínimo</th>
                    <th className="text-right py-2">Valor</th>
                    <th className="text-center py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {wh.items?.slice(0, 20).map((item, j) => (
                    <tr key={j} className={`border-b border-border/30 ${item.is_low ? 'bg-red-500/5' : ''}`}>
                      <td className="py-2">{item.name}</td>
                      <td className="py-2 text-right font-mono">{item.current_stock} {item.unit}</td>
                      <td className="py-2 text-right text-muted-foreground">{item.min_stock}</td>
                      <td className="py-2 text-right font-oswald">{formatMoney(item.value)}</td>
                      <td className="py-2 text-center">
                        {item.is_low ? (
                          <Badge variant="destructive" className="text-[9px]">Bajo</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[9px]">OK</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">Sin datos de inventario</p>
        )}
      </div>
    );
  };

  const renderTransfersReport = () => {
    const data = reportData?.transfers || [];
    
    return (
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Transferencias Recientes</h4>
          {data.length > 0 ? (
            <div className="space-y-2">
              {data.slice(0, 20).map((t, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50">
                  <div className="flex items-center gap-3">
                    <Clock size={14} className="text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{t.from_warehouse} → {t.to_warehouse}</p>
                      <p className="text-[10px] text-muted-foreground">{t.created_at?.split('T')[0]} por {t.user_name}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{t.items?.length || 0} items</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sin transferencias en el período</p>
          )}
        </div>
      </div>
    );
  };

  const renderDifferencesReport = () => {
    const data = reportData;
    if (!data?.summary) return null;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total Diferencias</p>
            <p className="font-oswald text-2xl font-bold">{data.summary.total_count}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-red-400 uppercase">Faltantes</p>
            <p className="font-oswald text-xl font-bold text-red-400">{formatMoney(data.summary.total_shortage)}</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-green-400 uppercase">Sobrantes</p>
            <p className="font-oswald text-xl font-bold text-green-400">{formatMoney(data.summary.total_surplus)}</p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-amber-400 uppercase">Pérdida Neta</p>
            <p className="font-oswald text-xl font-bold text-amber-400">{formatMoney(data.summary.net_value)}</p>
          </div>
        </div>
        
        {data.by_reason?.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Razón</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.by_reason}>
                <XAxis dataKey="reason" tick={{ fontSize: 10, fill: '#666' }} />
                <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill="#FF6600" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  };

  const renderWasteReport = () => {
    const data = reportData;
    if (!data?.summary) return null;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-red-400 uppercase">Valor Total Mermas</p>
            <p className="font-oswald text-2xl font-bold text-red-400">{formatMoney(data.summary.total_waste_value)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total Movimientos</p>
            <p className="font-oswald text-2xl font-bold">{data.summary.total_movements}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.by_ingredient?.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Insumo</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {data.by_ingredient.map((ing, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/50">
                    <span className="text-sm">{ing.name}</span>
                    <span className="font-oswald text-red-400">{formatMoney(ing.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {data.by_reason?.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Razón</h4>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.by_reason} dataKey="value" nameKey="reason" cx="50%" cy="50%" outerRadius={70}>
                    {data.by_reason.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderPurchaseOrdersReport = () => {
    const data = reportData;
    if (!data?.summary) return null;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-purple-500/20 to-violet-600/10 border border-purple-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-purple-400 uppercase">Total Compras</p>
            <p className="font-oswald text-2xl font-bold text-purple-400">{formatMoney(data.summary.total_value)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Total Órdenes</p>
            <p className="font-oswald text-2xl font-bold">{data.summary.total_orders}</p>
          </div>
        </div>
        
        {data.by_supplier?.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Por Proveedor</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.by_supplier.slice(0, 8)} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 9, fill: '#999' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" fill="#8E24AA" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  };

  const renderBySupplierReport = () => {
    const data = reportData;
    if (!data?.suppliers) return null;
    
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-purple-500/20 to-violet-600/10 border border-purple-500/30 rounded-xl p-4 text-center">
          <p className="text-[10px] text-purple-400 uppercase">Total Gastado en Período</p>
          <p className="font-oswald text-3xl font-bold text-purple-400">{formatMoney(data.total)}</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Distribución</h4>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={data.suppliers.slice(0, 8)} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                  {data.suppliers.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-4 overflow-auto max-h-[280px]">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Detalle</h4>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left py-2">Proveedor</th>
                  <th className="text-right py-2">Órdenes</th>
                  <th className="text-right py-2">%</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.suppliers.map((s, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-2 font-medium">{s.name}</td>
                    <td className="py-2 text-right text-muted-foreground">{s.orders}</td>
                    <td className="py-2 text-right">
                      <Badge variant="outline" className="text-[9px]">{s.percentage}%</Badge>
                    </td>
                    <td className="py-2 text-right font-oswald text-primary">{formatMoney(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderTaxesReport = () => {
    const data = reportData;
    if (!data?.summary) return null;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Subtotal</p>
            <p className="font-oswald text-xl font-bold">{formatMoney(data.summary.total_subtotal)}</p>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-blue-400 uppercase">ITBIS 18%</p>
            <p className="font-oswald text-xl font-bold text-blue-400">{formatMoney(data.summary.total_itbis)}</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-yellow-400 uppercase">Propina Legal 10%</p>
            <p className="font-oswald text-xl font-bold text-yellow-400">{formatMoney(data.summary.total_tips)}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-emerald-400 uppercase">Total Recaudado</p>
            <p className="font-oswald text-xl font-bold text-emerald-400">{formatMoney(data.summary.total_sales)}</p>
          </div>
        </div>
        
        {data.daily?.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Desglose Diario</h4>
            <div className="overflow-x-auto max-h-60">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border">
                    <th className="text-left py-2">Fecha</th>
                    <th className="text-right py-2">Subtotal</th>
                    <th className="text-right py-2">ITBIS</th>
                    <th className="text-right py-2">Propinas</th>
                    <th className="text-right py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.daily.map((d, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-2 font-mono">{d.date}</td>
                      <td className="py-2 text-right">{formatMoney(d.subtotal)}</td>
                      <td className="py-2 text-right text-blue-400">{formatMoney(d.itbis)}</td>
                      <td className="py-2 text-right text-yellow-400">{formatMoney(d.tips)}</td>
                      <td className="py-2 text-right font-oswald text-primary">{formatMoney(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderProfitLossReport = () => {
    const data = reportData;
    if (!data?.revenue) return null;
    
    const isProfit = data.profit?.gross_profit >= 0;
    
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/10 border border-emerald-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-emerald-400 uppercase">Ingresos Netos</p>
            <p className="font-oswald text-2xl font-bold text-emerald-400">{formatMoney(data.revenue.net_revenue)}</p>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-red-400 uppercase">Costo de Ventas</p>
            <p className="font-oswald text-xl font-bold text-red-400">{formatMoney(data.costs.cost_of_goods_sold)}</p>
          </div>
          <div className={`${isProfit ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'} border rounded-xl p-4 text-center`}>
            <p className={`text-[10px] ${isProfit ? 'text-green-400' : 'text-red-400'} uppercase`}>Ganancia Bruta</p>
            <p className={`font-oswald text-2xl font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>{formatMoney(data.profit.gross_profit)}</p>
          </div>
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-primary uppercase">Margen Bruto</p>
            <p className="font-oswald text-2xl font-bold text-primary">{data.profit.gross_margin_pct}%</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Ingresos</h4>
            <div className="space-y-2">
              <div className="flex justify-between p-2 bg-background rounded">
                <span className="text-sm">Ventas Brutas</span>
                <span className="font-oswald">{formatMoney(data.revenue.gross_sales)}</span>
              </div>
              <div className="flex justify-between p-2 bg-background rounded text-muted-foreground">
                <span className="text-sm">(-) Propinas</span>
                <span className="font-oswald">{formatMoney(data.revenue.tips_collected)}</span>
              </div>
              <div className="flex justify-between p-2 bg-background rounded text-muted-foreground">
                <span className="text-sm">(-) Impuestos</span>
                <span className="font-oswald">{formatMoney(data.revenue.tax_collected)}</span>
              </div>
              <div className="flex justify-between p-2 bg-emerald-500/10 rounded border border-emerald-500/30">
                <span className="text-sm font-semibold text-emerald-400">Ingresos Netos</span>
                <span className="font-oswald font-bold text-emerald-400">{formatMoney(data.revenue.net_revenue)}</span>
              </div>
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Costos</h4>
            <div className="space-y-2">
              <div className="flex justify-between p-2 bg-background rounded">
                <span className="text-sm">Costo de Ventas</span>
                <span className="font-oswald text-red-400">{formatMoney(data.costs.cost_of_goods_sold)}</span>
              </div>
              <div className="flex justify-between p-2 bg-background rounded">
                <span className="text-sm">Compras del Período</span>
                <span className="font-oswald">{formatMoney(data.costs.purchases)}</span>
              </div>
              <div className="flex justify-between p-2 bg-background rounded">
                <span className="text-sm">Mermas</span>
                <span className="font-oswald text-amber-400">{formatMoney(data.costs.waste_loss)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTableMovementsReport = () => {
    const data = Array.isArray(reportData) ? reportData : [];
    
    return (
      <div className="space-y-4">
        {data.length > 0 ? (
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Historial de Movimientos</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2">Hora</th>
                    <th className="text-left py-2">Usuario</th>
                    <th className="text-left py-2">Origen</th>
                    <th className="text-left py-2">Destino</th>
                    <th className="text-left py-2">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((m, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-2 font-mono">
                        <Clock size={10} className="inline mr-1" />
                        {m.created_at?.split('T')[1]?.slice(0, 5) || '--:--'}
                      </td>
                      <td className="py-2">
                        <span className="font-medium">{m.user_name}</span>
                        <Badge variant="outline" className="ml-1 text-[8px]">{m.user_role}</Badge>
                      </td>
                      <td className="py-2">
                        <Badge variant="secondary">Mesa {m.source_table_number}</Badge>
                      </td>
                      <td className="py-2">
                        <Badge className="bg-primary/20 text-primary">Mesa {m.target_table_number}</Badge>
                      </td>
                      <td className="py-2">
                        {m.merged ? (
                          <Badge className="bg-yellow-500/20 text-yellow-400">Unión</Badge>
                        ) : (
                          <Badge className="bg-blue-500/20 text-blue-400">Movimiento</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-12">Sin movimientos en el período</p>
        )}
      </div>
    );
  };

  const renderByWaiterReport = () => {
    const data = Array.isArray(reportData) ? reportData : [];
    
    return (
      <div className="space-y-4">
        {data.length > 0 ? (
          <>
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Ventas por Mesero</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#666' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#666' }} tickFormatter={v => `${(v/1000).toFixed(0)}K`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" fill="#FF6600" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Detalle</h4>
              <div className="space-y-2">
                {data.map((w, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-background border border-border/50">
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-muted-foreground" />
                      <span className="font-semibold">{w.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <Badge variant="outline">{w.bills} facturas</Badge>
                      <span className="text-yellow-400">Propinas: {formatMoney(w.tips)}</span>
                      <span className="font-oswald text-primary font-bold">{formatMoney(w.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-12">Sin datos para el período</p>
        )}
      </div>
    );
  };

  const renderSystemAuditReport = () => {
    const data = reportData;
    if (!data?.summary) return null;
    
    const typeColors = {
      'Anulacion': 'text-red-400 bg-red-500/10 border-red-500/30',
      'Ajuste de Stock': 'text-blue-400 bg-blue-500/10 border-blue-500/30',
      'Merma': 'text-orange-400 bg-orange-500/10 border-orange-500/30',
      'Entrada por Transferencia': 'text-green-400 bg-green-500/10 border-green-500/30',
      'Salida por Transferencia': 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
      'Orden de Compra': 'text-purple-400 bg-purple-500/10 border-purple-500/30',
      'Diferencia Inventario': 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      'Apertura de Turno': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      'Cierre de Turno': 'text-slate-400 bg-slate-500/10 border-slate-500/30',
      'Usuario Creado': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
      'Usuario Editado': 'text-sky-400 bg-sky-500/10 border-sky-500/30',
      'Usuario Eliminado': 'text-rose-400 bg-rose-500/10 border-rose-500/30',
      'Puesto Creado': 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
      'Puesto Editado': 'text-violet-400 bg-violet-500/10 border-violet-500/30',
      'Puesto Eliminado': 'text-pink-400 bg-pink-500/10 border-pink-500/30',
      'Nota de Credito': 'text-red-300 bg-red-500/10 border-red-500/30',
      'Exencion de Impuesto': 'text-yellow-300 bg-yellow-500/10 border-yellow-500/30',
      'Movimiento de Ingrediente': 'text-teal-400 bg-teal-500/10 border-teal-500/30',
    };
    
    // Collect all available event types for filter
    const availableTypes = data.available_event_types || data.by_type?.map(t => t.type) || [];
    
    return (
      <div className="space-y-4">
        {/* Filter by event type */}
        <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-muted-foreground uppercase">Filtrar por evento:</span>
          <select
            value={auditEventFilter}
            onChange={e => { setAuditEventFilter(e.target.value); loadReport('system-audit'); }}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:border-primary/50 focus:outline-none min-w-[200px]"
            data-testid="audit-event-filter"
          >
            <option value="Todos">Todos los eventos</option>
            {availableTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {auditEventFilter !== 'Todos' && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAuditEventFilter('Todos'); loadReport('system-audit'); }}>
              Limpiar filtro
            </Button>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/30 rounded-xl p-4 text-center">
            <p className="text-[10px] text-amber-400 uppercase">Total Actividades</p>
            <p className="font-oswald text-3xl font-bold text-amber-400">{data.summary.total_activities}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase">Valor Total Involucrado</p>
            <p className="font-oswald text-xl font-bold">{formatMoney(data.summary.total_value)}</p>
          </div>
        </div>
        
        {/* Activity breakdown by type */}
        {data.by_type?.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Resumen por Tipo de Actividad</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {data.by_type.map((t, i) => {
                const colorClass = typeColors[t.type] || 'text-muted-foreground bg-muted/10 border-border';
                return (
                  <button
                    key={i}
                    onClick={() => { setAuditEventFilter(t.type); loadReport('system-audit'); }}
                    className={`flex items-center justify-between p-2 rounded-lg border transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${colorClass}`}
                  >
                    <span className="text-sm font-medium truncate">{t.type}</span>
                    <Badge variant="secondary">{t.count}</Badge>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Activity log */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">
            Historial de Actividades {auditEventFilter !== 'Todos' && `(${auditEventFilter})`}
          </h4>
          {data.activities?.length > 0 ? (
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-1">Hora</th>
                    <th className="text-left py-2">Tipo</th>
                    <th className="text-left py-2">Descripcion</th>
                    <th className="text-left py-2">Usuario</th>
                    <th className="text-left py-2">Autorizado por</th>
                    <th className="text-right py-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.activities.map((act, i) => {
                    const colorClass = typeColors[act.type] || 'text-muted-foreground bg-muted/10 border-border';
                    return (
                      <tr key={i} className="border-b border-border/30 hover:bg-background/50">
                        <td className="py-2 px-1 font-mono text-muted-foreground whitespace-nowrap">
                          <Clock size={10} className="inline mr-1" />
                          {act.timestamp?.split('T')[0]} {act.timestamp?.split('T')[1]?.slice(0, 5) || ''}
                        </td>
                        <td className="py-2">
                          <Badge variant="outline" className={`text-[9px] whitespace-nowrap ${colorClass}`}>
                            {act.type}
                          </Badge>
                        </td>
                        <td className="py-2 max-w-[250px] truncate" title={act.description}>
                          {act.description}
                        </td>
                        <td className="py-2 font-medium">{act.user}</td>
                        <td className="py-2 text-muted-foreground">{act.authorizer}</td>
                        <td className="py-2 text-right font-oswald">
                          {act.value > 0 ? formatMoney(act.value) : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sin actividades en el periodo</p>
          )}
        </div>
      </div>
    );
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
              onClick={() => {
                const range = preset.value();
                setDateRange(range);
                if (selectedReport) loadReport(selectedReport);
              }}
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
                if (day && selectedReport) {
                  setTimeout(() => loadReport(selectedReport), 100);
                }
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
