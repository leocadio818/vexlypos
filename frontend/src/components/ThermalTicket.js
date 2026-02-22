/**
 * ThermalTicket Component
 * Ticket térmico 80mm compatible con DGII (República Dominicana)
 * Incluye: Encabezado fiscal, RNC, NCF, desglose de impuestos
 * 
 * La configuración del negocio se carga desde /api/system/config
 * y se puede editar en Settings > Sistema > Datos del Negocio para Ticket
 */
import { forwardRef, useState, useEffect } from 'react';
import '../styles/ticket-print.css';

// Configuración por defecto (fallback si no hay config en BD)
const DEFAULT_BUSINESS_CONFIG = {
  name: 'ALONZO CIGAR',
  legal_name: 'ALONZO CIGAR SRL',
  rnc: '1-31-75577-1',
  address_street: 'C/ Las Flores #12',
  address_building: '',
  address_sector: 'Jarabacoa',
  address_city: 'La Vega, Rep. Dominicana',
  phone: '809-301-3858',
  email: '',
  ncf_expiry: '31/12/2026',
  footer_msg1: 'Gracias por su visita!',
  footer_msg2: 'Conserve este documento para fines de DGII',
  footer_msg3: '',
  footer_msg4: ''
};

/**
 * Hook para cargar la configuración del negocio desde el backend
 */
export const useBusinessConfig = () => {
  const [config, setConfig] = useState(DEFAULT_BUSINESS_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const API_BASE = process.env.REACT_APP_BACKEND_URL;
        const token = localStorage.getItem('pos_token');
        const response = await fetch(`${API_BASE}/api/system/config`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          // Mapear campos del sistema a la estructura del ticket
          setConfig({
            name: data.ticket_business_name || data.restaurant_name || DEFAULT_BUSINESS_CONFIG.name,
            legal_name: data.ticket_legal_name || DEFAULT_BUSINESS_CONFIG.legal_name,
            rnc: data.ticket_rnc || data.rnc || DEFAULT_BUSINESS_CONFIG.rnc,
            address_street: data.ticket_address_street || data.ticket_address || DEFAULT_BUSINESS_CONFIG.address_street,
            address_building: data.ticket_address_building || '',
            address_sector: data.ticket_address_sector || DEFAULT_BUSINESS_CONFIG.address_sector,
            address_city: data.ticket_address_city || data.ticket_city || data.ticket_address2 || DEFAULT_BUSINESS_CONFIG.address_city,
            phone: data.ticket_phone || DEFAULT_BUSINESS_CONFIG.phone,
            email: data.ticket_email || DEFAULT_BUSINESS_CONFIG.email,
            ncf_expiry: data.ticket_ncf_expiry || DEFAULT_BUSINESS_CONFIG.ncf_expiry,
            footer_msg1: data.ticket_footer_msg1 || data.ticket_footer_message || data.ticket_thank_you || DEFAULT_BUSINESS_CONFIG.footer_msg1,
            footer_msg2: data.ticket_footer_msg2 || data.ticket_dgii_message || DEFAULT_BUSINESS_CONFIG.footer_msg2,
            footer_msg3: data.ticket_footer_msg3 || '',
            footer_msg4: data.ticket_footer_msg4 || ''
          });
        }
      } catch (err) {
        console.warn('Error loading business config, using defaults:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  return { config, loading };
};

// Helper para formatear moneda
const formatMoney = (amount) => {
  const num = parseFloat(amount) || 0;
  return num.toLocaleString('es-DO', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

// Helper para formatear fecha
const formatDateTime = (isoString) => {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('es-DO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Helper para obtener tipo de NCF
const getNCFType = (ncf) => {
  if (!ncf) return 'Comprobante Fiscal';
  const prefix = ncf.substring(0, 3).toUpperCase();
  const types = {
    'B01': 'Crédito Fiscal',
    'B02': 'Consumidor Final',
    'B14': 'Gubernamental',
    'B15': 'Régimen Especial',
    'B04': 'Nota de Débito',
    'B03': 'Nota de Crédito'
  };
  return types[prefix] || 'Comprobante Fiscal';
};

/**
 * Componente principal del ticket térmico
 * @param {Object} bill - Datos de la factura
 * @param {Object} config - Configuración del negocio (opcional, si no se pasa se usa el default)
 * @param {boolean} isCopy - Si es una copia del ticket
 * @param {boolean} isVoid - Si la factura está anulada
 */
const ThermalTicket = forwardRef(({ 
  bill, 
  config = DEFAULT_BUSINESS_CONFIG, 
  isCopy = false, 
  isVoid = false,
  showBarcode = false 
}, ref) => {
  if (!bill) return null;

  // Determinar el tipo de servicio para mostrar
  const serviceType = bill.sale_type_name || (
    bill.sale_type === 'dine_in' ? 'Para comer aquí' :
    bill.sale_type === 'takeout' ? 'Para llevar' :
    bill.sale_type === 'delivery' ? 'Delivery' : ''
  );

  // Construir clases del contenedor
  const containerClasses = [
    'ticket-container',
    isVoid && 'ticket-void',
    isCopy && 'ticket-copy'
  ].filter(Boolean).join(' ');

  return (
    <div ref={ref} className={containerClasses}>
      {/* ═══════════════════════════════════════════════════════════════
          ENCABEZADO DEL NEGOCIO
      ═══════════════════════════════════════════════════════════════ */}
      <div className="ticket-header">
        <div className="ticket-business-name">{config.name}</div>
        <div className="ticket-rnc">RNC: {config.rnc}</div>
        {config.address_street && <div className="ticket-address">{config.address_street}{config.address_building ? `, ${config.address_building}` : ''}</div>}
        {config.address_sector && <div className="ticket-address">{config.address_sector}{config.address_city ? `, ${config.address_city}` : ''}</div>}
        {!config.address_sector && config.address_city && <div className="ticket-address">{config.address_city}</div>}
        <div className="ticket-phone">Tel: {config.phone}</div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          COMPROBANTE FISCAL (NCF)
      ═══════════════════════════════════════════════════════════════ */}
      <div className="ticket-ncf-section">
        <div className="ticket-ncf-label">COMPROBANTE FISCAL</div>
        <div className="ticket-ncf-number">{bill.ncf || 'N/A'}</div>
        <div className="ticket-ncf-type">{getNCFType(bill.ncf)}</div>
        <div className="ticket-ncf-expiry">Válido hasta: {config.ncf_expiry}</div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          INFORMACIÓN DEL DOCUMENTO
      ═══════════════════════════════════════════════════════════════ */}
      <div className="ticket-info">
        <div className="ticket-info-row">
          <span className="ticket-info-label">Fecha:</span>
          <span className="ticket-info-value">{formatDateTime(bill.paid_at || bill.created_at)}</span>
        </div>
        <div className="ticket-info-row">
          <span className="ticket-info-label">Cajero:</span>
          <span className="ticket-info-value">{bill.cashier_name || '-'}</span>
        </div>
        {bill.table_number && (
          <div className="ticket-info-row">
            <span className="ticket-info-label">Mesa:</span>
            <span className="ticket-info-value">{bill.table_number}</span>
          </div>
        )}
        {serviceType && (
          <div className="ticket-info-row">
            <span className="ticket-info-label">Servicio:</span>
            <span className="ticket-info-value">{serviceType}</span>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          DATOS DEL CLIENTE (si aplica)
      ═══════════════════════════════════════════════════════════════ */}
      {bill.customer_name && (
        <div className="ticket-customer">
          <div className="ticket-customer-label">CLIENTE:</div>
          <div className="ticket-customer-name">{bill.customer_name}</div>
          {bill.customer_rnc && (
            <div className="ticket-customer-rnc">RNC/Cédula: {bill.customer_rnc}</div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          DETALLE DE PRODUCTOS
      ═══════════════════════════════════════════════════════════════ */}
      <div className="ticket-items">
        <div className="ticket-items-header">
          <span>CANT  DESCRIPCIÓN</span>
          <span>IMPORTE</span>
        </div>
        
        {bill.items?.map((item, index) => (
          <div key={index} className="ticket-item">
            <div className="ticket-item-name">
              {item.product_name}
            </div>
            <div className="ticket-item-details">
              <span className="ticket-item-qty">{item.quantity}x</span>
              <span className="ticket-item-price">{formatMoney(item.unit_price)}</span>
              <span className="ticket-item-total">{formatMoney(item.total)}</span>
            </div>
            {/* Modificadores del producto */}
            {item.modifiers && item.modifiers.length > 0 && (
              <div className="ticket-item-modifiers">
                {item.modifiers.map((mod, mi) => (
                  <div key={mi} className="ticket-item-modifier">
                    + {mod.name} {mod.price > 0 ? `(${formatMoney(mod.price)})` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="ticket-separator" />

      {/* ═══════════════════════════════════════════════════════════════
          SUBTOTALES
      ═══════════════════════════════════════════════════════════════ */}
      <div className="ticket-subtotals">
        <div className="ticket-subtotal-row">
          <span className="ticket-subtotal-label">Subtotal:</span>
          <span className="ticket-subtotal-value">{formatMoney(bill.subtotal)}</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          DESGLOSE DE IMPUESTOS (DGII)
      ═══════════════════════════════════════════════════════════════ */}
      <div className="ticket-taxes">
        <div className="ticket-taxes-title">DESGLOSE DE IMPUESTOS</div>
        
        {/* ITBIS */}
        {(bill.itbis > 0 || bill.itbis_rate) && (
          <div className="ticket-tax-row">
            <span className="ticket-tax-label">
              ITBIS <span className="ticket-tax-rate">({bill.itbis_rate || 18}%)</span>
            </span>
            <span className="ticket-tax-value">{formatMoney(bill.itbis)}</span>
          </div>
        )}
        
        {/* Propina Legal */}
        {bill.propina_legal > 0 && (
          <div className="ticket-tax-row">
            <span className="ticket-tax-label">
              PROPINA LEY <span className="ticket-tax-rate">({bill.propina_percentage || 10}%)</span>
            </span>
            <span className="ticket-tax-value">{formatMoney(bill.propina_legal)}</span>
          </div>
        )}
        
        {/* Otros impuestos del tax_breakdown */}
        {bill.tax_breakdown?.filter(t => 
          !['ITBIS', 'itbis', 'PROPINA', 'propina'].some(k => 
            t.tax_id?.toLowerCase().includes(k.toLowerCase()) || 
            t.description?.toLowerCase().includes(k.toLowerCase())
          )
        ).map((tax, i) => (
          <div key={i} className="ticket-tax-row">
            <span className="ticket-tax-label">
              {tax.description} <span className="ticket-tax-rate">({tax.rate}%)</span>
            </span>
            <span className="ticket-tax-value">{formatMoney(tax.amount)}</span>
          </div>
        ))}
        
        {/* Total impuestos */}
        <div className="ticket-tax-total">
          <span>Total Impuestos:</span>
          <span>{formatMoney((bill.itbis || 0) + (bill.propina_legal || 0))}</span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TOTAL GENERAL
      ═══════════════════════════════════════════════════════════════ */}
      <div className="ticket-total">
        <div className="ticket-total-label">TOTAL A PAGAR</div>
        <div className="ticket-total-amount">
          <span className="ticket-total-currency">RD$ </span>
          {formatMoney(bill.total)}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          INFORMACIÓN DE PAGO
      ═══════════════════════════════════════════════════════════════ */}
      {bill.status === 'paid' && (
        <div className="ticket-payment">
          <div className="ticket-payment-row">
            <span className="ticket-payment-method">
              Pagado con: {bill.payment_method_name || bill.payment_method || 'Efectivo'}
            </span>
          </div>
          {bill.amount_received && bill.amount_received > bill.total && (
            <>
              <div className="ticket-payment-row">
                <span>Recibido:</span>
                <span className="ticket-payment-amount">{formatMoney(bill.amount_received)}</span>
              </div>
              <div className="ticket-change">
                CAMBIO: RD$ {formatMoney(bill.amount_received - bill.total)}
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PUNTOS DE FIDELIDAD (si aplica)
      ═══════════════════════════════════════════════════════════════ */}
      {bill.points_earned > 0 && (
        <div className="text-center mb-2" style={{ fontSize: '10px', background: '#f0f0f0', padding: '2mm', borderRadius: '2px' }}>
          <strong>+{bill.points_earned} puntos</strong> acumulados
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CÓDIGO DE BARRAS (opcional)
      ═══════════════════════════════════════════════════════════════ */}
      {showBarcode && bill.ncf && (
        <div className="ticket-barcode">
          *{bill.ncf}*
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          PIE DE PÁGINA
      ═══════════════════════════════════════════════════════════════ */}
      <div className="ticket-footer">
        <div className="ticket-footer-message">
          {config.footer_message}
        </div>
        <div className="ticket-footer-dgii">
          {config.dgii_message}
        </div>
      </div>
    </div>
  );
});

ThermalTicket.displayName = 'ThermalTicket';

export default ThermalTicket;

/**
 * Función utilitaria para imprimir el ticket
 * Abre una ventana de impresión con el contenido del ticket
 */
export const printTicket = (ticketRef) => {
  if (!ticketRef?.current) return;
  
  const printWindow = window.open('', '_blank', 'width=320,height=600');
  if (!printWindow) {
    alert('Por favor permita ventanas emergentes para imprimir');
    return;
  }

  const ticketHTML = ticketRef.current.outerHTML;
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ticket de Venta</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
        <style>
          /* Reset */
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          @page {
            size: 80mm auto;
            margin: 0;
          }
          
          body {
            width: 80mm;
            margin: 0 auto;
            padding: 0;
            font-family: 'Roboto Mono', 'Courier New', Courier, monospace;
            background: #fff;
          }
          
          /* Contenedor principal */
          .ticket-container {
            width: 80mm;
            max-width: 80mm;
            font-family: 'Roboto Mono', 'Courier New', Courier, monospace;
            font-size: 12px;
            line-height: 1.3;
            color: #000;
            background: #fff;
            padding: 3mm;
          }
          
          /* Encabezado */
          .ticket-header {
            text-align: center;
            border-bottom: 1px dashed #000;
            padding-bottom: 3mm;
            margin-bottom: 3mm;
          }
          .ticket-business-name { font-size: 14px; font-weight: bold; margin-bottom: 1mm; }
          .ticket-rnc { font-size: 11px; font-weight: bold; margin-bottom: 1mm; }
          .ticket-address { font-size: 10px; color: #333; margin-bottom: 1mm; }
          .ticket-phone { font-size: 10px; }
          
          /* NCF */
          .ticket-ncf-section {
            background: #f5f5f5;
            border: 1px solid #000;
            padding: 2mm;
            margin-bottom: 3mm;
            text-align: center;
          }
          .ticket-ncf-label { font-size: 10px; font-weight: bold; margin-bottom: 1mm; }
          .ticket-ncf-number { font-size: 14px; font-weight: bold; letter-spacing: 1px; }
          .ticket-ncf-type { font-size: 10px; margin-top: 1mm; }
          .ticket-ncf-expiry { font-size: 9px; color: #666; margin-top: 1mm; }
          
          /* Info */
          .ticket-info {
            border-bottom: 1px dashed #000;
            padding-bottom: 2mm;
            margin-bottom: 3mm;
          }
          .ticket-info-row {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            margin-bottom: 1mm;
          }
          .ticket-info-label { color: #666; }
          .ticket-info-value { font-weight: bold; }
          
          /* Cliente */
          .ticket-customer {
            border-bottom: 1px dashed #000;
            padding-bottom: 2mm;
            margin-bottom: 3mm;
          }
          .ticket-customer-label { font-size: 9px; color: #666; }
          .ticket-customer-name { font-size: 11px; font-weight: bold; }
          .ticket-customer-rnc { font-size: 10px; }
          
          /* Items */
          .ticket-items { margin-bottom: 3mm; }
          .ticket-items-header {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            font-weight: bold;
            border-bottom: 1px solid #000;
            padding-bottom: 1mm;
            margin-bottom: 2mm;
          }
          .ticket-item { margin-bottom: 2mm; font-size: 11px; }
          .ticket-item-name { font-weight: bold; }
          .ticket-item-details {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #444;
          }
          .ticket-item-qty { min-width: 8mm; }
          .ticket-item-price { text-align: right; min-width: 18mm; }
          .ticket-item-total { text-align: right; min-width: 20mm; font-weight: bold; }
          .ticket-item-modifiers { font-size: 9px; color: #666; padding-left: 3mm; }
          
          /* Separador */
          .ticket-separator { border-top: 1px dashed #000; margin: 2mm 0; }
          
          /* Subtotales */
          .ticket-subtotals { margin-bottom: 2mm; }
          .ticket-subtotal-row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin-bottom: 1mm;
          }
          .ticket-subtotal-label { color: #444; }
          .ticket-subtotal-value {
            text-align: right;
            min-width: 22mm;
            font-family: 'Roboto Mono', monospace;
          }
          
          /* Impuestos */
          .ticket-taxes {
            background: #fafafa;
            border: 1px solid #ddd;
            padding: 2mm;
            margin-bottom: 2mm;
          }
          .ticket-taxes-title {
            font-size: 10px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 2mm;
            text-transform: uppercase;
          }
          .ticket-tax-row {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            margin-bottom: 1mm;
          }
          .ticket-tax-label { color: #333; }
          .ticket-tax-rate { color: #666; font-size: 9px; }
          .ticket-tax-value {
            text-align: right;
            min-width: 20mm;
            font-family: 'Roboto Mono', monospace;
            font-weight: bold;
          }
          .ticket-tax-total {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            font-weight: bold;
            border-top: 1px solid #ccc;
            padding-top: 1mm;
            margin-top: 1mm;
          }
          
          /* Total */
          .ticket-total {
            background: #000;
            color: #fff;
            padding: 3mm;
            margin-bottom: 3mm;
            text-align: center;
          }
          .ticket-total-label { font-size: 12px; margin-bottom: 1mm; }
          .ticket-total-amount { font-size: 22px; font-weight: bold; letter-spacing: 1px; }
          .ticket-total-currency { font-size: 12px; }
          
          /* Pago */
          .ticket-payment {
            border-bottom: 1px dashed #000;
            padding-bottom: 2mm;
            margin-bottom: 3mm;
          }
          .ticket-payment-row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin-bottom: 1mm;
          }
          .ticket-payment-method { font-weight: bold; }
          .ticket-payment-amount { font-family: 'Roboto Mono', monospace; }
          .ticket-change {
            font-size: 12px;
            font-weight: bold;
            background: #f0f0f0;
            padding: 2mm;
            text-align: center;
            margin-top: 2mm;
          }
          
          /* Footer */
          .ticket-footer {
            text-align: center;
            font-size: 10px;
            padding-top: 2mm;
            border-top: 1px dashed #000;
          }
          .ticket-footer-message { margin-bottom: 2mm; }
          .ticket-footer-dgii { font-size: 9px; color: #666; margin-top: 2mm; }
          
          /* Barcode */
          .ticket-barcode {
            text-align: center;
            margin: 3mm 0;
            font-family: 'Libre Barcode 39', monospace;
            font-size: 28px;
          }
          
          /* Estados especiales */
          .ticket-void {
            border: 2px solid #f00;
            background: #fff0f0;
          }
          .ticket-void::before {
            content: '*** ANULADO ***';
            display: block;
            text-align: center;
            font-size: 14px;
            font-weight: bold;
            color: #f00;
            padding: 2mm;
          }
          .ticket-copy { border: 1px dashed #999; }
          .ticket-copy::before {
            content: '--- COPIA ---';
            display: block;
            text-align: center;
            font-size: 11px;
            color: #666;
            padding: 2mm;
          }
          
          @media print {
            html, body { width: 80mm; margin: 0; padding: 0; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        ${ticketHTML}
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `);
  
  printWindow.document.close();
};

/**
 * Componente de vista previa para el ticket
 * Muestra el ticket en una ventana modal o panel
 */
export const TicketPreview = ({ bill, config, onPrint, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white p-3 border-b flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Vista Previa del Ticket</h3>
          <div className="flex gap-2">
            <button 
              onClick={onPrint}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
            >
              Imprimir
            </button>
            <button 
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium text-sm"
            >
              Cerrar
            </button>
          </div>
        </div>
        <div className="p-4 bg-gray-100">
          <ThermalTicket bill={bill} config={config} />
        </div>
      </div>
    </div>
  );
};
