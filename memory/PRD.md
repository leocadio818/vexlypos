# PRD - POS Dominicana

## Original Problem Statement
Sistema POS para República Dominicana con soporte completo para:
- Facturación fiscal (NCF, DGII)
- Gestión de inventario con trazabilidad
- Clientes/Proveedores unificados
- Control de caja y turnos
- Reportes fiscales dominicanos

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
- ✅ **Integración de Ventas**: Al pagar factura, actualiza `cash_sales`/`card_sales` en Supabase
- ✅ **Movimientos de Caja**: Registro automático en `cash_movements` por cada venta
- ✅ **Arqueo de Caja**: Modal con desglose de denominaciones (billetes y monedas RD)
- ✅ **Cierre de Turno**: Cálculo de diferencia (esperado vs contado)

## Key Features

### Apertura de Caja
- Selección de terminal (Caja 1, Caja 2, Barra, Terraza, VIP)
- Monto inicial de apertura
- Movimiento automático tipo "opening" en cash_movements

### Integración de Ventas con Sesión
- Al pagar factura (`/bills/{id}/pay`), se actualiza automáticamente:
  - `cash_sales` o `card_sales` según método de pago
  - `total_invoices` incrementado
  - Nuevo registro en `cash_movements` tipo "sale"

### Arqueo de Caja (Cierre)
- Desglose de denominaciones:
  - Billetes: RD$ 2000, 1000, 500, 200, 100, 50
  - Monedas: RD$ 25, 10, 5, 1
- Cálculo automático de Total Contado
- Comparación con Efectivo Esperado
- Indicador visual de diferencia (verde/amarillo/rojo)
- Campo de notas para explicar diferencias

## Supabase Connection
```
URL: https://zxrziualssnmvltbzdcd.supabase.co
Key: sb_publishable_hWJwHftCQhmE2PRmWLoEgQ_DIFucqHZ
```

## Key API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pos-sessions/open` | POST | Abrir turno |
| `/api/pos-sessions/current` | GET | Sesión actual |
| `/api/pos-sessions/{id}/close` | PUT | Cerrar turno |
| `/api/pos-sessions/{id}/movements` | POST | Agregar movimiento |
| `/api/bills/{id}/pay` | POST | Pagar factura (actualiza sesión Supabase) |

## Files Modified
- `/app/backend/routers/pos_sessions.py` - Router Supabase
- `/app/backend/routers/billing.py` - Integración ventas con Supabase
- `/app/backend/server.py` - Include routers + init_supabase
- `/app/frontend/src/pages/CashRegister.js` - UI Arqueo de caja

## Prioritized Backlog

### P0 - Completado ✅
- [x] Apertura de caja con monto inicial
- [x] Integración ventas con sesión de caja
- [x] Arqueo de caja con desglose de denominaciones
- [x] Cierre de turno con cálculo de diferencia

### P1 - Alta Prioridad
- [ ] Audit Trail Security (solo Admin ve PINs)
- [ ] Employee Time Clock (entrada/salida)
- [ ] Generación reportes DGII (607, 608)

### P2 - Media Prioridad
- [ ] Reportes de caja por período
- [ ] Imágenes/iconos para botones de productos
- [ ] Print Agent como ejecutable .exe

### P3 - Baja Prioridad
- [ ] Exportar Audit Trail a Excel/CSV
- [ ] Duplicar producto feature

## Test Credentials
- Luis (Cajero): PIN 4321
- Admin: PIN 1234
