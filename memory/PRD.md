# PRD - POS Dominicana

## Original Problem Statement
Sistema POS para República Dominicana con soporte completo para:
- Facturación fiscal (NCF, DGII)
- Gestión de inventario con trazabilidad
- Clientes/Proveedores unificados
- Control de caja y turnos
- Reportes fiscales dominicanos

## Current Branch
`feature/analisis-dolibarr` - Rama de análisis aislada

## What's Been Implemented

### 2025-02-18: Análisis Dolibarr ERP
- ✅ Análisis completo de 4 módulos Dolibarr:
  - Facturación Fiscal (NCF, estados, impuestos)
  - Inventario/Stock (movimientos, auditoría, lotes)
  - Terceros/Clientes (tipos entidad, RNC/Cédula, niveles precio)
  - POS y Caja (sesiones, fondo caja, movimientos no-venta)
- ✅ Generación de 4 reportes markdown de análisis
- ✅ Generación de 4 esquemas JSON propuestos
- ✅ **Script SQL consolidado** `01_migracion_logica_erp.sql` (1,069 líneas)
  - Compatible PostgreSQL/Supabase
  - RLS habilitado en todas las tablas
  - Foreign keys definidas
  - Índices optimizados
  - Datos seed para catálogos

## Artifacts Generated
- `/app/_referencia_dolibarr/ANALISIS_FACTURACION_FISCAL.md`
- `/app/_referencia_dolibarr/esquema_facturacion_propuesto.json`
- `/app/_referencia_dolibarr/ANALISIS_INVENTARIO_STOCK.md`
- `/app/_referencia_dolibarr/esquema_inventario_propuesto.json`
- `/app/_referencia_dolibarr/ANALISIS_TERCEROS_CLIENTES.md`
- `/app/_referencia_dolibarr/esquema_terceros_propuesto.json`
- `/app/_referencia_dolibarr/ANALISIS_POS_CAJA.md`
- `/app/_referencia_dolibarr/esquema_pos_caja_propuesto.json`
- `/app/_referencia_dolibarr/01_migracion_logica_erp.sql` ⭐ NEW

## Prioritized Backlog

### P0 - Crítico
- [ ] Ejecutar script SQL en Supabase (validar creación)
- [ ] Definir políticas RLS según roles

### P1 - Alta Prioridad
- [ ] Volver a rama `main` para implementación
- [ ] Audit Trail Security (solo Admin ve PINs)
- [ ] Employee Time Clock (entrada/salida)
- [ ] Generación reportes DGII (607, 608)

### P2 - Media Prioridad
- [ ] Imágenes/iconos para botones de productos
- [ ] Cache de imágenes offline
- [ ] Print Agent como ejecutable .exe

### P3 - Baja Prioridad
- [ ] Drag-and-drop reordenamiento métodos de pago
- [ ] Exportar Audit Trail a Excel/CSV
- [ ] Duplicar producto feature

## Technical Stack
- Frontend: React
- Backend: FastAPI
- Database: Supabase (PostgreSQL)
- Branch actual: `feature/analisis-dolibarr`

## Known Issues
- Print Agent es script Python, no ejecutable .exe (limitación del entorno)
