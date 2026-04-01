# VexlyPOS — Changelog

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
