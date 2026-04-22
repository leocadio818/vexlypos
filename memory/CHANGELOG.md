# VexlyPOS — Changelog

## 2026-04 — Feature: Comparativo Happy Hour vs Fuera del Horario 📈
- **Nueva sección "Comparativo: Durante vs Fuera"** en el reporte A9 Analytics de Promociones. Responde la pregunta clave: "¿Happy Hour realmente incrementa mis ventas?".
- **Ventana analizada**: schedule de la promo ganadora (ej: L-V 4:00 PM - 7:00 PM). Se compara:
  - **Durante**: bills pagadas dentro de la ventana (día+hora del schedule)
  - **Fuera**: bills pagadas fuera de la ventana en el mismo período
- **4 métricas con delta %**: # Facturas, Ingreso, Ticket Promedio, Items / Factura. Indicador visual verde (↗ +X%) o rojo (↘ -X%).
- **Backend**: nueva función `_compute_promotion_comparative(bills, winner_promo)` en `reports.py`. Fetch del schedule de la promo ganadora, clasifica cada bill por su `paid_at` timestamp (weekday + hour range), calcula métricas y deltas porcentuales. Evita Infinity (no JSON-serializable) retornando None cuando denominador es 0. Skip para promos 24/7 (no hay ventana comparativa).
- **Frontend**: sección nueva con gradient naranja arriba de la tabla de desglose en `PromotionsAnalyticsReport.jsx`. Iconos TrendingUp/TrendingDown según signo del delta.
- **E2E verified**: test con 3 bills durante HH (L-M 4-7pm) + 1 bill fuera (mismos días pero 2pm): backend retornó deltas bills=+200%, revenue=+750%, ticket=+183%. Screenshot confirma UI completa con 4 KPI-cards comparativos.
- **Archivos modificados**: `/app/backend/routers/reports.py` (+120 líneas función `_compute_promotion_comparative` + integración en summary), `/app/frontend/src/pages/reports/PromotionsAnalyticsReport.jsx` (+60 líneas sección comparativo + imports ArrowRight/TrendingDown).


## 2026-04 — Feature: A9 Analytics de Promociones 📊
- **Nuevo reporte "Analytics de Promociones"** en la categoría "Ventas y Caja" del módulo Reportes.
- **KPIs**: Ventas con Promo (neto + count + %), Ahorro Entregado (total + prom/factura), Promo Ganadora (nombre + monto), Items Vendidos (+ count promos activas).
- **Desglose por promoción**: tabla con Facturas, Items, Bruto, Descuento, Neto, Ticket Prom., Desc. %. Ordenado por Neto descendente.
- **Top 20 productos** vendidos durante promociones con cantidad + bruto + descuento + neto.
- **Gráfico barras** de ventas netas vs descuentos por promoción.
- **Exports** PDF (WeasyPrint) y Excel (openpyxl) funcionando (200 OK validado por curl).
- **Backend**: endpoint `/api/reports/promotions-analytics` en `reports.py` + exports en `reports_xlsx.py` (`/xlsx/promotions-analytics/pdf|xlsx`). Cross bills × items.promotion_id, agrega por promotion_id + product_id, calcula winner/weakest, ahorro total y ticket prom.
- **Frontend**: `/app/frontend/src/pages/reports/PromotionsAnalyticsReport.jsx` + registrado en `reports/index.js` + cableado en `Reports.js` (import, endpoint map, switch case, entrada en sidebar categoría 'Ventas y Caja').
- **Validación E2E**: test bill con 2 items (PRESIDENTE 2u@240 + MICHELOB 3u@200) insertado directo en Mongo → endpoint retornó total_bills_with_promo=1, pct=100%, gross=$1,350, discount=$270, net=$1,080, winner='Happy Hour' ✅. Screenshot confirma UI completa con sidebar, 4 KPIs, tabla y empty state funcionando.
- **Archivos**: nuevos `PromotionsAnalyticsReport.jsx`; modificados `reports.py` (+150 líneas), `reports_xlsx.py` (+200 líneas PDF+Xlsx), `Reports.js`, `reports/index.js`.


## 2026-04 — Feature: Happy Hour / Promociones Automáticas ✨
- **Sistema completo de promociones programadas** por días de la semana + horario + fecha inicio/fin. Precios cambian automáticamente sin intervención manual.
- **Tipos de descuento**: Porcentaje (%), Monto Fijo (RD$), Precio Fijo, 2x1.
- **Alcance**: Todos los productos / Categoría(s) / Productos específicos. Con productos excluidos y filtro por áreas.
- **Permiso nuevo**: `manage_promotions`. Activo por default en admin, gerente, propietario. Inactivo en supervisor/cajero/mesero/cocina.
- **Backend**:
  - `/app/backend/services/promotion_engine.py` — Engine con caché en memoria 60s, timezone `America/Santo_Domingo`. Función `get_effective_price()` selecciona MEJOR descuento para el cliente si múltiples aplican.
  - `/app/backend/routers/promotions.py` — CRUD: GET /api/promotions (lista), GET /api/promotions/active (activas ahora), POST/PATCH/DELETE con validación de bounds (percentage 0-100, fixed_amount ≥ 0).
  - `/app/backend/routers/orders.py` — Integración en POST /orders/{id}/items: aplica precio efectivo + guarda `original_price`, `promotion_id`, `promotion_name`, `promotion_discount`, `promotion_discount_type` en el item. **Precio se congela al momento de agregar** — si Happy Hour termina después, cobra al precio descontado.
  - `/app/backend/routers/auth.py` — `manage_promotions` añadido a `ALL_PERMISSIONS`, `DEFAULT_PERMISSIONS.admin`, `CUSTOM_ROLE_DEFAULTS.gerente/propietario`.
- **Frontend**:
  - `/app/frontend/src/pages/settings/PromotionsTab.js` — UI completa con list (cards con día-pills, horario 12h, descuento, toggle/edit/delete) + form (pills días, time pickers, date pickers opcionales, multi-select categorías/productos/áreas, productos excluidos).
  - `/app/frontend/src/pages/settings/InventarioTab.js` — Nueva sub-pestaña "Promociones" (solo visible si permiso `manage_promotions`).
  - `/app/frontend/src/pages/UserConfig.js` — `manage_promotions` en `PERMISSION_CATEGORIES.configuracion` para edición desde UI.
  - `/app/frontend/src/pages/OrderScreen.js` — Banner gradient naranja "🔥 Happy Hour activo hasta las X:XX PM" cuando hay promos activas. Productos bajo promoción muestran precio tachado + precio descontado naranja + badge 🔥 top-left. Items en cart muestran "🔥 Happy Hour" en naranja + precio original tachado.
- **QA verificado** (testing_agent_v3_fork iteration_161): Backend 15/15 pytest ✅. Frontend 95% ✅ (fix aplicado: pl-6 al nombre de producto para evitar overlap del badge). Admin puede gestionar, cajero no (403). Order integration verificada: PRESIDENTE $300 → $240 con promotion_name='Happy Hour' correctamente guardado. Tip legal 10% se calcula sobre subtotal con descuento (automático, unit_price ya descontado).
- **Archivos creados**: `/app/backend/services/promotion_engine.py`, `/app/backend/routers/promotions.py`, `/app/frontend/src/pages/settings/PromotionsTab.js`, `/app/backend/tests/test_promotions.py`.


## 2026-02 — Bug Fix: Runtime Error "DialogDescription is not defined" 🐛
- **Síntoma**: Al navegar a `/user/new` o editar usuario existente, Uncaught runtime error `ReferenceError: DialogDescription is not defined`.
- **Root cause**: `DialogDescription` se usaba en JSX pero faltaba en el import statement de `UserConfig.js`.
- **Fix**: Agregado `DialogDescription` al import de `@/components/ui/dialog`.
- **Fix adicional detectado en pruebas**: Al cargar `/user/new`, el rol default era `waiter` pero `permissions={}` estaba vacío (UI mostraba switches OFF aunque rol seleccionado). Agregado `useEffect` que auto-pobla `user.permissions` con `ROLE_DEFAULTS[role]` cuando es nuevo usuario y los permisos están vacíos.
- **Validación visual (screenshots)**: Mesero→3/14 auto, Cajero→8/14 con toast "12 permisos", GERENTE→11/14 con toast "31 permisos", diálogo Crear Puesto abre sin errores con dropdown "Clonar Permisos desde".


## 2026-02 — Feature: Clonar Permisos al Crear Puesto ✨
- **Nueva funcionalidad**: Al crear un puesto custom, admin puede seleccionar "Clonar Permisos desde" un puesto existente (builtin o custom) como punto de partida.
- **Comportamiento**:
  - Dropdown muestra todos los puestos visibles con su count: `Gerente (31p · N60)`, `Cajero (12p · N30)`, etc.
  - Al seleccionar, los permisos se copian automáticamente al estado `newRolePermissions`.
  - Admin puede luego ajustar con los switches (agregar/quitar permisos específicos).
  - Toast confirma: "Clonados X permisos de [Rol]".
- **Uso típico**: crear "Bartender" clonando desde "Mesero" (3p base) + agregar split_bill, collect_payment manualmente. Ahorra ~20 clicks por nuevo rol.
- **Files**: `/app/frontend/src/pages/UserConfig.js` — Create Role Dialog extendido con `<select data-testid="clone-role-select">`.


## 2026-02 — Fix: Sistema de Puestos (Roles) y Permisos 🔧
- **Problema**: Al seleccionar un puesto, los permisos predefinidos NO se cargaban automáticamente. Custom roles (gerente/propietario) tenían `permissions={}` vacío. `ROLE_DEFAULTS` frontend y `DEFAULT_PERMISSIONS` backend desincronizados.
- **Fix aplicado**:
  - **Backend `auth.py`**: Reescrito `DEFAULT_PERMISSIONS` (admin 70p, kitchen 2p, waiter 3p, cashier 12p, supervisor 16p). Agregado `CUSTOM_ROLE_DEFAULTS` con plantillas para `gerente` (31p) y `propietario` (41p). `get_permissions()` ahora usa merge 3-capas: base False → DEFAULT/CUSTOM_ROLE_DEFAULTS → user override. `ALL_PERMISSIONS` extendido a 63 labels. `list_roles` enriquece custom roles con fallback CUSTOM_ROLE_DEFAULTS si `permissions` está vacío.
  - **Backend `server.py`**: `seed_custom_role_permissions()` ejecutado en startup (idempotente) para persistir permisos de gerente/propietario en MongoDB si están vacíos.
  - **Frontend `UserConfig.js`**: `ROLE_DEFAULTS` sincronizado con backend. `CUSTOM_ROLE_DEFAULTS` replicado. `handleSelectRole()` ahora carga correctamente permisos para builtin/custom/fallback con toast informativo (count de permisos). `getRoleDefaults()` y `permCount` badge ahora usan fallback CUSTOM_ROLE_DEFAULTS. Categoría nueva "Sistema & Auditoría" en `PERMISSION_CATEGORIES` (7 permisos admin-only) para que admin muestre 70p en UI.
  - **Diálogos Crear/Editar Puesto**: Agregada sección de permisos colapsable (6+1=7 categorías) con switches togglables. Botón "Plantilla" aplica CUSTOM_ROLE_DEFAULTS por code. POST/PUT `/api/roles` ahora persisten permisos personalizados. Botón edit del custom role cambiado a `<span role="button">` para eliminar warning de `<button>` anidado.
  - **Cleanup**: Eliminado `TestQA_Auto` role (test leftover).
- **QA verificado** (testing_agent_v3_fork iteration_160): 10/12 PASS + issues MEDIUM corregidos post-reporte. Admin 70p, Mesero 3p, Cajero 12p, Supervisor 16p, Cocina 2p, Gerente 31p, Propietario 41p. Al seleccionar puesto se cargan permisos automáticamente. Diálogos Crear/Editar muestran sección de permisos editable. Admin nivel 100 puede personalizar post-selección.
- **Files tocados**: `/app/backend/routers/auth.py`, `/app/backend/server.py`, `/app/frontend/src/pages/UserConfig.js`.


## 2026-04-19 — Bug Fix: E31 Rechazado por DGII (`IndicadorMontoGravado`) 🔒
- **Root cause**: DGII valida `IndicadorMontoGravado` como OBLIGATORIO para E31/E32/E34/E45 (error código 176 "El campo IndicadorMontoGravado del área IdDoc de la sección Encabezado no es válido" cuando está ausente).
- **Evidencia**: `ecf_logs` mostró respuesta EXACTA de Multiprod/DGII para T-1184 y T-1178 rechazadas.
- **XSD V1.0 oficial**: define `IndicadorMontoGravado` como `minOccurs="0"` pero DGII lo valida como requerido por reglas de negocio. Valor `0` = `PrecioUnitarioItem` SIN ITBIS incluido (como nuestro POS lo envía).
- **Fix aplicado** (`multiprod_service.py`):
  - Reinsertado `<IndicadorMontoGravado>0</IndicadorMontoGravado>` para E31/E32/E34/E45 en la posición XSD correcta (después de `FechaVencimientoSecuencia` + `IndicadorEnvioDiferido`, antes de `TipoIngresos`).
  - E44 (régimen especial exento) sigue SIN el campo (no permitido en su XSD).
- **Verificación end-to-end**:
  - Validación XSD local: OK para 5 tipos (E31, E32, E34, E44, E45).
  - Reenvío T-1184 → eNCF `E310000000201` → **Aceptado por DGII** (código 1).
  - Reenvío T-1178 → eNCF `E310000000202` → **Aceptado por DGII** (código 1).
- Testing: curl end-to-end + validación XSD + confirmación DGII "estado: aceptado".

## 2026-04-01 — Integration: The Factory HKA e-CF + Credential Self-Service
- **The Factory HKA**: Full e-CF integration (auth JWT, payload mapping, send, status check, anulación, audit logs)
- **e-CF Dispatcher**: Unified `/api/ecf/*` router dispatches to Alanube or The Factory based on system_config
- **Provider Selector**: Settings > Sistema with visual toggle + "Probar conexión" button
- **Credential Self-Service UI**: Business owners configure e-CF credentials from Settings (DB first, .env fallback)
- **NCF Counter**: Sequential tracking in MongoDB to prevent duplicates
- Key discovery: The Factory `itbiS1` = TAX RATE ("18"), NOT amount

## 2026-04-01 — Bug Fix: Mesa dividida se liberaba al pagar una cuenta
- **Root cause**: billing.py solo verificaba la orden pagada, no las demás órdenes de la mesa
- **Fix**: Ahora verifica si existen otras órdenes activas (`status: active/sent`) antes de liberar la mesa
- **Alcance**: Fix aplicado en billing.py (pago) + orders.py (3 rutas de cancelación)
- Testing: 7/7 backend + frontend verificado en Desktop, Mobile, Tablet

## 2026-03-31 — Fix: Contraste de textos en light theme
- **Account Selector**: Cambiados todos los text-white/XX a text-foreground/text-muted-foreground en cards de cuentas, totales, items, header
- **CashRegister (Caja/Turnos)**: Corregidos ~50+ instancias en header, Turno Activo, stat cards, movimientos, historial de turnos, y TODOS los diálogos (Abrir Turno, Cerrar Turno, Movimiento de Caja, Cierre de Día)
- Testing: 100% pass (desktop + mobile)

## 2026-03-31 — Refactoring: OrderScreen.js componentizado
- **AccountSelectorLobby.js**: Extraído (~120 líneas) — lobby de selección de cuentas divididas
- **SplitCheckView.js**: Extraído (~130 líneas) — vista de split check con drag/drop
- OrderScreen.js reducido en ~250 líneas
- Testing: 100% pass rate (UI + API)

## 2026-03-31 — Bug Fix: Auto-envío de órdenes pendientes a cocina
- **Bug**: Al navegar a "Mesas" desde OrderScreen, los items pendientes no se enviaban a cocina
- **Fix**: Sincronización de `tableOrdersRef.current` y reset de `alreadySentRef.current`
- Testing: 100% pass rate (login, mesas, orden, account selector, split check, pre-cuenta, facturar, mobile)

## 2026-03-29 — PWA + Mobile Optimization
- **PWA Instalable**: manifest.json, íconos 192/512/apple-touch, meta tags iOS/Android, Service Worker (cache estático)
- **Reports mobile**: Full-width, menú hamburguesa, horizontal scroll en tablas
- **Clientes page**: Compact header, botones iconos mobile
- **Bottom padding global**: pb-28 en TODAS las páginas scrollables
- **Inventory mobile**: 11 tabs responsive, Radix ScrollArea fix
- **Order screen mobile**: 2 columnas fijas, lupa búsqueda
- **Auto-send on exit**: handleLogoutWithComandas on both logo (desktop) + Salir button (mobile)
- **Sidebar Opciones**: Modal with Cocina/Caja/Reservas/Config/Cierre de Día
