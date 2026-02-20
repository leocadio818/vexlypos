# PRD - POS Dominicana

## Original Problem Statement
Sistema POS de propósito general para República Dominicana con soporte completo para:
- Facturación fiscal (NCF, DGII)
- Sistema de impuestos dinámicos por producto
- Gestión de inventario con trazabilidad
- Clientes/Proveedores unificados
- Control de caja y turnos con arqueo
- Reportes fiscales dominicanos (Reporte Z)

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

## Key Features

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

## Prioritized Backlog

### P0 - Completado ✅
- [x] Apertura de caja con monto inicial
- [x] Integración ventas con sesión de caja
- [x] Arqueo de caja con desglose de denominaciones
- [x] Sistema de impuestos dinámicos por producto
- [x] Propina solo para consumo en local
- [x] Reporte Z con desglose de impuestos

### P1 - Alta Prioridad
- [ ] UI para configurar impuestos en Settings
- [ ] UI para asignar impuestos a productos/categorías
- [ ] Checkbox "Para Llevar" en el carrito de compras
- [ ] Audit Trail Security (solo Admin ve PINs)
- [ ] Employee Time Clock (entrada/salida)

### P2 - Media Prioridad
- [ ] Reportes de caja por período
- [ ] Generación reportes DGII (607, 608)
- [ ] Imágenes/iconos para botones de productos
- [ ] Print Agent como ejecutable .exe

### P3 - Baja Prioridad
- [ ] Exportar Audit Trail a Excel/CSV
- [ ] Duplicar producto feature

## Test Credentials
- Luis (Cajero): PIN 4321
- Admin: PIN 1234
