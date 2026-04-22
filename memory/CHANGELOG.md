# VexlyPOS — Changelog

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
