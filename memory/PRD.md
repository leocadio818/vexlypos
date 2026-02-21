# PRD - POS Dominicana

## Original Problem Statement
Sistema POS de propósito general para República Dominicana con soporte completo para:
- Facturación fiscal (NCF, DGII)
- Sistema de impuestos dinámicos por producto
- Gestión de inventario con trazabilidad
- Clientes/Proveedores unificados
- Control de caja y turnos con arqueo
- Reportes fiscales dominicanos (Reporte Z)
- Ticket térmico 80mm compatible DGII

## Current Branch
`feature/analisis-dolibarr` - Rama de análisis e implementación Supabase

## What's Been Implemented

### 2025-02-18: Análisis Dolibarr ERP
- ✅ Análisis completo de 4 módulos Dolibarr
- ✅ Generación de 4 reportes markdown
- ✅ Generación de 4 esquemas JSON propuestos
- ✅ Script SQL consolidado `01_migracion_logica_erp.sql`

### 2025-02-20: Integración Supabase - Control de Caja
- ✅ **Backend**: Router `/api/pos-sessions` conectado a Supabase
- ✅ **Apertura de Caja**: Crear sesión con monto inicial
- ✅ **Integración de Ventas**: Al pagar factura, actualiza sesión en Supabase
- ✅ **Arqueo de Caja**: Modal con desglose de denominaciones RD
- ✅ **cash_breakdown JSONB**: Guarda desglose completo al cerrar

### 2025-02-20: Sistema de Impuestos Dinámicos
- ✅ **tax_config**: Configuración de impuestos (ITBIS, Propina, ISC, Exento)
- ✅ **product_taxes**: Asignación de impuestos por producto
- ✅ **Motor de Cálculo**: `/api/taxes/calculate` con cascada de impuestos
- ✅ **is_dine_in_only**: Propina solo para consumo en local
- ✅ **is_delivery**: Omite propina automáticamente para Para Llevar
- ✅ **Reporte Z Universal**: Desglose de impuestos recaudados

### 2025-02-20: Ticket Térmico 80mm DGII
- ✅ **ThermalTicket.js**: Componente React para ticket de impresora térmica
- ✅ **Encabezado Fiscal**: Nombre negocio, RNC, dirección, teléfono
- ✅ **Sección NCF**: Comprobante fiscal con tipo (B01, B02, B14, B15)
- ✅ **Desglose de Impuestos DGII**: ITBIS 18%, Propina Legal 10%
- ✅ **Lógica Para Llevar**: Propina se omite automáticamente
- ✅ **Fuente Monoespaciada**: Alineación de columnas para 80mm
- ✅ **Estados Especiales**: Marcadores COPIA y ANULADO
- ✅ **Página Demo**: /ticket-demo para configurar y probar tickets
- ✅ **Integración PaymentScreen**: Diálogo de impresión post-pago

### 2025-02-20: Configuración de Datos del Negocio para Ticket
- ✅ **Settings > Sistema**: Nueva sección "Datos del Negocio para Ticket"
- ✅ **Campos configurables**: Nombre comercial, razón social, RNC, dirección, teléfono, email
- ✅ **Campos fiscales**: Fecha vencimiento NCF, mensaje de agradecimiento, mensaje DGII
- ✅ **useBusinessConfig Hook**: Carga configuración del servidor en ThermalTicket.js
- ✅ **Persistencia MongoDB**: Datos guardados en /api/system/config
- ✅ **TicketDemo**: Indicador "Servidor" cuando usa config del backend
- ✅ **Vista Previa en Vivo**: Preview del ticket actualizado en tiempo real al editar datos

### 2025-02-20: UI Gestión de Impuestos y Módulo NCF
- ✅ **Settings > Impuestos**: CRUD completo para configuración de impuestos DGII
- ✅ **Settings > NCF**: Gestión de secuencias fiscales Serie B (B01-B17)
- ✅ **Backend NCF Router**: `/app/backend/routers/ncf.py` conectado a Supabase
- ✅ **Alertas NCF**: Barra de progreso visual (verde/amarillo/rojo por disponibilidad)
- ✅ **Dashboard Alertas**: Banner de alertas NCF en pantalla principal (Mapa de Mesas)
- ✅ **Validaciones**: < 50 = advertencia, < 10 = crítico, vencido = crítico

### 2025-02-20: Motor de Cálculo Fiscal Inteligente
- ✅ **Vínculo Venta-NCF**: Campo `default_ncf_type_id` en Tipos de Venta
- ✅ **Selector NCF en Settings**: Dropdown para asignar NCF por defecto (B01-B17) a cada Tipo de Venta
- ✅ **Badge NCF**: Etiqueta visual (B02 Factura de Consumo) en lista de Tipos de Venta
- ✅ **Toggle Tipo de Servicio**: Local / Llevar / Delivery en OrderScreen
- ✅ **Motor de Cálculo Inteligente**: Cruza impuestos del Tipo de Venta ∩ impuestos del Producto
- ✅ **Propina Condicional**: Solo aplica si is_dine_in_only=false Y producto no tiene exención
- ✅ **Mensaje informativo**: "*Propina omitida (solo aplica en local)" cuando se selecciona Para Llevar

### 2025-02-21: Sistema 100% Dinámico - Tipos de Venta Configurables
- ✅ **Perfiles de Venta**: 6 tipos configurados (Consumo Local, Para Llevar, Delivery, Crédito Fiscal, Exportación, Servicios)
- ✅ **Botones de Acceso Rápido**: Botones dinámicos en OrderScreen cargados desde DB
- ✅ **Tax Exemptions por Tipo**: Cada tipo tiene lista de impuestos exentos
- ✅ **Sin Hardcoding**: Todo se lee de tax_config y sale_types desde la DB
- ✅ **Sincronización Automática**: Refresco cada 30s para reflejar cambios del admin inmediatamente
- ✅ **CRUD Completo**: Crear, editar, eliminar tipos de venta desde Settings > Ventas > Tipos de Venta
- ✅ **NCF Dinámico por Tipo**: B02 para consumidor, B01 para crédito fiscal, B16 para exportación

## Key Features

### Ticket Térmico 80mm
Componente `ThermalTicket.js` con:
- Encabezado fiscal DGII compliant
- NCF con tipos (Crédito Fiscal, Consumidor Final, Gubernamental, Régimen Especial)
- Detalle de productos con modificadores
- Desglose de impuestos (ITBIS, Propina)
- TOTAL destacado en negro invertido
- Información de pago y cambio
- Código de barras NCF opcional
- Estilos CSS para impresión real a 80mm

### Arqueo de Caja (cash_breakdown)
```json
{
  "denominaciones": {
    "2000": {"label": "RD$ 2,000", "tipo": "billete", "cantidad": 1, "subtotal": 2000},
    "1000": {"label": "RD$ 1,000", "tipo": "billete", "cantidad": 1, "subtotal": 1000}
  },
  "total_declarado": 3000,
  "total_esperado": 3000,
  "diferencia": 0,
  "fecha_arqueo": "2025-02-20T21:15:00Z"
}
```

### Sistema de Impuestos Dinámicos
| Código | Nombre | Tasa | Solo Local |
|--------|--------|------|------------|
| ITBIS | ITBIS 18% | 18% | No |
| ITBIS_REDUCIDO | ITBIS 16% | 16% | No |
| PROPINA | Propina Legal 10% | 10% | ✅ Sí |
| ISC | Impuesto Selectivo | Variable | No |
| EXENTO | Exento de ITBIS | 0% | No |

### Cálculo de Impuestos
- **Consumo en local**: ITBIS + Propina (todos los impuestos)
- **Para Llevar (Delivery)**: Solo ITBIS (propina omitida automáticamente)

### Módulo NCF - Comprobantes Fiscales DGII
**Tipos de comprobantes (Serie B):**
| Código | Descripción |
|--------|-------------|
| B01 | Factura de Crédito Fiscal |
| B02 | Factura de Consumo (default) |
| B03 | Nota de Débito |
| B04 | Nota de Crédito |
| B11 | Comprobante de Compras |
| B12 | Registro Único de Ingresos |
| B13 | Gastos Menores |
| B14 | Regímenes Especiales |
| B15 | Comprobante Gubernamental |
| B16 | Exportaciones |
| B17 | Pagos al Exterior |

**Alertas de secuencias:**
- 🟢 OK: > 50 comprobantes restantes
- 🟡 Advertencia: < 50 restantes
- 🔴 Crítico: < 10 restantes o secuencia vencida

## Key API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pos-sessions/open` | POST | Abrir turno |
| `/api/pos-sessions/{id}/close` | PUT | Cerrar turno con cash_breakdown |
| `/api/taxes/config` | GET | Listar configuraciones de impuestos |
| `/api/taxes/products/assign` | POST | Asignar impuesto a producto |
| `/api/taxes/calculate` | POST | Calcular impuestos (con is_delivery) |
| `/api/taxes/report/summary` | GET | Reporte Z de impuestos |

## Files Created/Modified
- `/app/backend/routers/pos_sessions.py` - Router Supabase
- `/app/backend/routers/taxes.py` - NEW: Sistema de impuestos dinámicos
- `/app/backend/routers/billing.py` - Integración ventas con Supabase
- `/app/frontend/src/pages/CashRegister.js` - UI Arqueo de caja
- `/app/frontend/src/lib/api.js` - taxesAPI, posSessionsAPI
- `/app/frontend/src/components/ThermalTicket.js` - NEW: Componente ticket térmico
- `/app/frontend/src/pages/TicketDemo.js` - NEW: Página demo ticket
- `/app/frontend/src/styles/ticket-print.css` - Estilos impresión 80mm
- `/app/frontend/src/pages/PaymentScreen.js` - Diálogo impresión post-pago

## Prioritized Backlog

### P0 - Completado ✅
- [x] Apertura de caja con monto inicial
- [x] Integración ventas con sesión de caja
- [x] Arqueo de caja con desglose de denominaciones
- [x] Sistema de impuestos dinámicos por producto
- [x] Propina solo para consumo en local
- [x] Reporte Z con desglose de impuestos
- [x] Ticket térmico 80mm compatible DGII
- [x] Configuración de datos del negocio para ticket (personalización desde Settings)
- [x] **UI de Gestión de Impuestos** - CRUD completo en Settings > Impuestos
- [x] **Módulo NCF** - Gestión de secuencias fiscales DGII (Serie B) en Settings > NCF
- [x] **Motor de Cálculo Fiscal Inteligente** - Cruza impuestos Tipo de Venta ∩ Producto
- [x] **Vínculo Venta-NCF** - Selector de NCF por defecto en Tipos de Venta
- [x] **Toggle Para Llevar / Local / Delivery** - Recalcula impuestos automáticamente

### P0 - Pendiente
- [ ] Asignación de impuestos específicos a productos (UI en ProductConfig)
- [ ] Seguridad Fiscal: Bloquear NCF en facturas $0.00
- [ ] Flujo de Nota de Crédito B04 (reversión de factura)

### P1 - Alta Prioridad
- [ ] Audit Trail Security (solo Admin ve PINs)
- [ ] Employee Time Clock (entrada/salida)
- [ ] Generación reportes DGII (607, 608)

### P2 - Media Prioridad
- [ ] Reportes de caja por período
- [ ] Imágenes/iconos para botones de productos
- [ ] Print Agent como ejecutable .exe
- [ ] Cache de imágenes offline

### P3 - Baja Prioridad
- [ ] Exportar Audit Trail a Excel/CSV
- [ ] Duplicar producto feature
- [ ] Drag-and-drop reordenar métodos de pago

## Test Credentials
- Admin: PIN 10000
- Carlos: PIN 1234
- María: PIN 5678
- Luis (Cajero): PIN 4321
- Chef Pedro: PIN 9999
