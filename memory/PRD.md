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

### 2025-02-20: Integración Supabase - Apertura de Caja
- ✅ **Backend**: Nuevo router `/api/pos-sessions` con Supabase
  - `GET /check` - Verificar sesión activa del usuario
  - `GET /current` - Obtener sesión actual completa
  - `POST /open` - Abrir nuevo turno con monto inicial
  - `PUT /{id}/close` - Cerrar turno con declaración de efectivo
  - `POST /{id}/movements` - Agregar movimientos de caja
  - `GET /{id}/movements` - Listar movimientos del turno
  - `GET /history` - Historial de turnos cerrados
- ✅ **Frontend**: Página de Caja actualizada (`CashRegister.js`)
  - UI para abrir/cerrar turnos
  - Panel de estadísticas en tiempo real
  - Registro de movimientos de caja
  - Historial de turnos
  - Badge "Supabase" indicando conexión
- ✅ **Supabase**: Tablas conectadas
  - `pos_sessions` - Sesiones/turnos de caja
  - `cash_movements` - Movimientos de efectivo

## Supabase Connection
```
URL: https://zxrziualssnmvltbzdcd.supabase.co
Key: sb_publishable_hWJwHftCQhmE2PRmWLoEgQ_DIFucqHZ
```

## Key API Endpoints (Supabase Integration)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pos-sessions/health` | GET | Health check Supabase |
| `/api/pos-sessions/check` | GET | Verificar sesión activa |
| `/api/pos-sessions/current` | GET | Sesión actual completa |
| `/api/pos-sessions/open` | POST | Abrir turno |
| `/api/pos-sessions/{id}/close` | PUT | Cerrar turno |
| `/api/pos-sessions/{id}/movements` | POST | Agregar movimiento |
| `/api/pos-sessions/{id}/movements` | GET | Listar movimientos |
| `/api/pos-sessions/history` | GET | Historial de turnos |

## Files Modified/Created
- `/app/backend/routers/pos_sessions.py` - NEW: Router Supabase
- `/app/backend/server.py` - Updated: Include pos_sessions router
- `/app/backend/.env` - Updated: SUPABASE_URL, SUPABASE_ANON_KEY
- `/app/frontend/src/lib/api.js` - Updated: posSessionsAPI
- `/app/frontend/src/pages/CashRegister.js` - REWRITTEN: UI Supabase

## SQL Scripts Generated
- `/app/_referencia_dolibarr/01_migracion_logica_erp.sql` - Migración completa
- `/app/_referencia_dolibarr/02_politicas_rls.sql` - Políticas RLS
- `/app/_referencia_dolibarr/03_alter_tables_completar.sql` - ALTER TABLE adicionales

## Prioritized Backlog

### P0 - Crítico (Completado)
- [x] Conectar backend a Supabase
- [x] Implementar apertura de caja
- [x] Registrar movimiento de apertura
- [x] UI de gestión de turnos

### P1 - Alta Prioridad
- [ ] Integrar ventas con sesión de caja activa
- [ ] Cierre de caja con desglose de denominaciones
- [ ] Audit Trail Security (solo Admin ve PINs)
- [ ] Employee Time Clock (entrada/salida)
- [ ] Generación reportes DGII (607, 608)

### P2 - Media Prioridad
- [ ] Reportes de caja por período
- [ ] Imágenes/iconos para botones de productos
- [ ] Cache de imágenes offline
- [ ] Print Agent como ejecutable .exe

### P3 - Baja Prioridad
- [ ] Drag-and-drop reordenamiento métodos de pago
- [ ] Exportar Audit Trail a Excel/CSV
- [ ] Duplicar producto feature

## Technical Stack
- Frontend: React + Shadcn UI
- Backend: FastAPI + MongoDB (legacy) + Supabase (new)
- Database: 
  - MongoDB: Usuarios, productos, mesas, órdenes (legacy)
  - Supabase: Sesiones de caja, movimientos (new)

## Test Credentials
- Luis (Cajero): PIN 4321
- Admin: PIN 1234
