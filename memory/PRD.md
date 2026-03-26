# VexlyPOS — PRD

## Original Problem Statement
Full-stack POS (Point of Sale) application for restaurants in Dominican Republic. React frontend + FastAPI backend + dual-database architecture (MongoDB for operations, Supabase for financial data).

## Architecture (FROZEN BY DIRECTIVE)
- **Supabase (PostgreSQL)**: Exclusive engine for financial/fiscal data (NCF, shifts, cash movements, fiscal audits)
- **MongoDB**: Exclusive engine for operational data (products, modifiers, tables, users, inventory, orders, theme config)
- This "Polyglot Persistence" architecture is permanently frozen by user directive

## 🔒 LOCKED SYSTEMS — DO NOT MODIFY WITHOUT EXPLICIT USER APPROVAL

### 🔒 Theme Persistence Engine (ThemeContext.js)
**Status: LOCKED — Working perfectly as of 2026-03-01**

### 🔒 Provider Order (App.js)
**ThemeProvider wraps AuthProvider** (AuthProvider uses useTheme). DO NOT reverse.

### 🔒 Traceability Bridge (billing.py)
**MongoDB bill ↔ Supabase cash_movement cross-reference on every payment. DO NOT remove.**

### 🔒 CashRegister Performance (CashRegister.js)
**Status: LOCKED — Optimized to 1.85s from 5s as of 2026-03-01**

### 🔒 Performance Optimization (LOCKED - 2026-03-12)
- **React.lazy + Suspense**: ALL 20 pages lazy-loaded with PageSkeleton fallback

### 🔒 Zero Native `<a href>` for Internal Navigation (LOCKED - 2026-03-14)
- ALL internal links use React Router `<Link to>`, NEVER `<a href>`
- ONLY exception: `Kitchen.js` uses `<a href="/kitchen-tv" target="_blank">`

### 🔒 PinPad Hybrid System (LOCKED - 2026-03-12)
- ALL PinPads use `forceKeypad` — always show on-screen numpad

### 🔒 Business Day (Jornada) Filtering (LOCKED - 2026-03-12)
- ALL reports filter by `business_date`, NOT `paid_at` or calendar date

### 🔒 Zero Native Date/Time Inputs (LOCKED - 2026-03-12)

### 🔒 REGLA: Nunca agregar permisos default sin autorización del usuario (LOCKED)
- TODOS los permisos nuevos se crean SIN defaults (false para todos los roles)
- El dueño del negocio decide a quién asignarlos desde Config > Usuarios

### 🔒 Employee Attendance / Clock-In Flow (LOCKED - 2026-03-17)
- Login flow: authenticate FIRST → check attendance → show modal or navigate
- `useCallback` for handleSubmit (React 19 stale closure fix)
- Modals are INLINE overlays (`fixed z-[9999]`), NOT shadcn Dialog (portal gets hidden by glass backdrop-blur)
- Both Neumorphic AND Glass returns have their own copy of the modals
- "No" → clears token + `window.location.href = '/login'`
- Cajeros: auto clock-out en Cierre Z
- Meseros: botón "Marcar Salida" dentro del popover del usuario
- DO NOT: Use Dialog component for login modals. DO NOT remove useCallback.

### 🔒 Sidebar & Navigation (LOCKED - 2026-03-19)
- navItems: only Panel + Mesas in sidebar
- **"Opciones" modal**: Cocina, Caja, Reservas, Config, Cierre de Día — hidden inside mesas (`/order/`)
- **"Funciones" modal**: GLOBAL (mobile+desktop) — visible only inside mesas (`/order/`)
- **Business Day Dialog**: GLOBAL (moved out of desktop sidebar block)
- Meseros: NO ven Reservas, NO ven Config
- Cajeros: NO ven Cocina
- Jornada button: visible para todos, clickeable SOLO para roles con `close_day` permission

### 🔒 Auto-Contrast System for Category/Product Cards (LOCKED - 2026-03-17)
- `getContrastText(hex)` function — WCAG luminance algorithm
- Applied via `data-contrast="light|dark"` attribute
- CSS in `index.css` uses `!important` — IMPOSSIBLE to override by any theme
- Badge counters use `[data-badge]` with `!important` background

### 🔒 Permissions from DB, Not JWT (LOCKED - 2026-03-19)
- `can_access_table_orders` is ASYNC — reads permissions from MongoDB, NOT JWT token
- JWT token does NOT carry permissions
- Auto-authorization: if user has `close_day`, skips PIN for Cierre de Día (`authorizer_pin='self'`)
- `get_authorizer_by_pin` accepts `current_user` parameter for self-auth

### 🔒 Cierre de Día — Intelligent Validation (LOCKED - 2026-03-19)
- **Mesas/cuentas abiertas → SIEMPRE bloquea** (force_close NO las salta)
- **Turnos POS sin mesas → force_close los cierra** automáticamente
- **Auto clock-out de TODOS los registros de asistencia** al cerrar día
- Status "sent" included in open orders check (not just "active")
- After close: ALL users see "Bienvenido" modal on next login
- DO NOT: Allow force_close to skip open orders/tables validation

## Credentials
- Admin PIN: 10000
- OSCAR (Cajero): 1111
- Carlos Mesero: 100
- Scarlin (Gerente): 4321

## Branding & White-Label (2026-03-14)
- Login screen loads restaurant name + logo from `/api/system/branding`
- Logo cached in localStorage (`pos_branding`) for instant render
- Sidebar logo shows real restaurant logo from localStorage
- Tab title: "VexlyPOS"
- "Made with Emergent" badge: REMOVED

## Cash Close Report — Professional (LOCKED - 2026-03-17)
- 7 sections: Header, KPIs, Payment Methods, Fiscal Summary, Exceptions, Bill Detail, Signatures

## Reservations: "Registrado por" + Global Filters (2026-03-17)
- `created_by` field saved on every new reservation
- Report uses GLOBAL date filters, NOT internal period buttons

## Table Movements Audit (2026-03-17)
- `POST /orders/{id}/move` logs to `table_movements` collection

## PDF/Export Cleanup (2026-03-17)
- HIDDEN_COLUMNS: all UUIDs, void_type, required_manager_auth, business_date, waiter_id, etc.
- 40+ Spanish translations for all report fields
- ISO timestamps auto-formatted to readable dates

## Cash Movement Permissions (2026-03-19)
- `cash_movement_income` + `cash_movement_withdrawal` — no defaults
- Button "Movimiento" only visible if user has at least one permission
- Depósito and Caja Chica REMOVED from modal

## Reprint Permissions (2026-03-19)
- `reprint_precuenta` — if user has it, reprint directly without manager PIN
- `reprint_receipt` — for reprinting paid invoices

## Business Date Filtering Fix (2026-03-18)
- ALL reports filter by `business_date` field, NOT `paid_at`
- Fallback: `b.get("business_date", b.get("paid_at", "")[:10])`

## UI Improvements (2026-03-19)
- text-[10px] → text-xs across ALL 56 files (bigger labels globally)
- Dialog X button: `right-2 top-2 z-10` (no overlap with content)
- Mesero name visible in OrderScreen header: "Mesa 1 | T-1013 Mesero: Admin"
- Access Denied screen works on mobile (inline div, not inside hidden desktop panel)
- Category color picker: 18 presets + custom + text color + live preview
- Category edit modal: scrollable `max-h-[90vh]`
- "Buscar Cliente" modal: wider `max-w-2xl`
### 🔒 Barcode Scanner System (LOCKED - 2026-03-21)
- Products have `barcode` field (string) — set in ProductConfig.js
- Backend: `GET /products/by-barcode/{code}` endpoint for lookup
- OrderScreen.js: invisible `keypress` listener detects rapid typing (< 100ms between chars) + Enter
- If barcode found → `handleProductClick(product)` immediately (no modal)
- If barcode NOT found → centered modal with code + "Producto No Encontrado"
- Ignores input when INPUT/TEXTAREA/SELECT is focused (no interference with forms)
- Buffer resets after 100ms of no input (distinguishes scanner from human typing)
- Works simultaneously with touch — if scanner breaks, touch still works
- DO NOT: Change the 100ms threshold. DO NOT: Add success modal (product adds instantly).

- BusinessDay dialog: `max-h-[90vh] overflow-y-auto` for mobile

### 🔒 Print Agent Multi-Impresora & Printing System (LOCKED - 2026-03-22)
- **VexlyPOS_PrintAgent.py**: Agente multi-impresora, soporta `commands` array + `data` dict + test print + copias + skip jobs vacíos
- **Modifiers**: Maneja strings ("Frio") y dicts ({"name": "Frio"}) — DO NOT assume dict only
- **Terminal → Impresora**: Cada caja vinculada a un print_channel. Backend resuelve: user → session → terminal → print_channel → IP
- **Supabase lookup**: Usa `create_client()` directo, NO importar `supabase_client` de pos_sessions (no se exporta)
- **Pre-cuenta routing**: Si user tiene sesión POS → imprime en su caja. Si NO tiene → modal selector de impresora
- **Selector de impresora**: Cierra dialog pre-cuenta ANTES de abrir selector (evita z-index issues)
- **Auto-send comandas**: `handleLogoutWithComandas` en TODOS los botones de salida (logo + Salir móvil)
- **Dentro de mesa**: detecta ruta `/order/{tableId}` y envía órdenes de ESA mesa
- **Endpoints protegidos**: `send_precheck_to_printer` y `send_receipt_to_printer` requieren `Depends(get_current_user)`
- **channel_override**: Pre-cuenta acepta `?channel_override=` para selección manual de impresora
- **config.txt**: `PRINTER_[CANAL]=IP` — canal en mayúscula, código en sistema en minúscula, deben coincidir
- **DO NOT**: Modificar VexlyPOS_PrintAgent.py, format_comanda, format_commands, format_receipt, format_precheck, format_test
- **DO NOT**: Cambiar endpoints de impresión (print/pre-check/send, print/receipt/send, print/send-comanda, print/queue, print/config)
- **DO NOT**: Alterar la lógica de resolución terminal → print_channel en server.py
- **DO NOT**: Tocar la función send_comanda_to_print_queue en orders.py

## PENDING — Integración de IA (Próxima Sesión)
- GPT-4o mini via Emergent Universal Key
- Asistente de Inventario, Análisis de Ventas, Sugerencias de Menú, Predicción de Demanda
- Requiere: usuario agregue saldo en Perfil > Universal Key > Add Balance

## FUTURO — CRM (Customer Relationship Management)
- Perfil completo del cliente (historial compras, frecuencia, ticket promedio)
- Sistema de puntos/fidelización (acumula puntos, canjea descuentos)
- Segmentación (VIP, frecuentes, inactivos, nuevos)
- Comunicación (ofertas por email/WhatsApp via Resend)
- Cumpleaños/Aniversarios (alertas automáticas)
- Encuestas de satisfacción (QR en factura)
- Dashboard CRM (retención, frecuencia, métricas)
- Base ya existe: clientes, reservaciones, historial de compras, top clientes
## FUTURO — Módulo Contable (Contabilidad RD - DGII)
- **Fase 1**: Cuentas por Pagar/Cobrar (facturas proveedores, crédito clientes, vencimientos)
- **Fase 2**: Asientos automáticos (cada venta/compra/pago genera asiento contable)
- **Fase 3**: Estados financieros + reportes DGII (Balance General, Estado de Resultados, 608, 609, IT-1)
- **Fase 4**: Conciliación bancaria (comparar banco vs sistema)
- Catálogo de cuentas estándar RD (Activos, Pasivos, Capital, Ingresos, Gastos)
- Retenciones ISR, ITBIS, retenciones 30% proveedores informales
- Cierre fiscal mensual y anual con ajustes
- Base ya existe: ITBIS, Propina Legal, NCF, Reportes 606/607, Cierres de caja

## FUTURO — Manuales de Usuario (cuando el proyecto esté completo)
- Manual del Mesero: login, entrada, mesas, pedidos, modificadores, cocina, pre-cuenta, transferir, salida
- Manual del Cajero: + turno/caja, cobrar, formas de pago, NCF, reimprimir, movimientos, cierre Z
- Manual del Gerente: + jornada, reportes, autorizar anulaciones, descuentos, acceso total mesas
- Manual del Administrador: + config sistema, usuarios, permisos, productos, impresoras, estaciones, impuestos
- Manual de Instalación (IT): deploy, dominio, print agent, impresoras, red
- Formato: PDF con capturas de pantalla reales, paso a paso numerado, lenguaje simple


## Next Tasks
## FUTURO — Integración e-CF con Alanube (Facturación Electrónica DGII)
- **Score actual: 65% Ready** — estructura de facturación sólida, falta adaptación e-CF
- **Auditoría completa realizada: 2026-03-24**
- **Ya tiene**: RNC emisor, NCF B01-B15, ITBIS 18%, Propina 10%, tax_breakdown, exenciones, fiscal_id, pagos múltiples, monedas
- **Fase 1**: Completar datos emisor (dirección, teléfono) + mapear métodos de pago a códigos DGII (01=Efectivo, 02=Cheque, 03=Tarjeta, 04=Transferencia)
- **Fase 2**: Soporte ITBIS múltiples tasas (18%, 16%, 0%) + separar montos gravados vs exentos por tasa + indicador de facturación por item
- **Fase 3**: Crear cuenta Alanube + integrar API (envío e-CF) + guardar e_ncf + trackId en factura + certificado digital
  - Módulo de Mapeo: función que convierte factura MongoDB → JSON formato Alanube (Diccionario de Datos)
  - Módulo de Timbrado: recibe respuesta de Alanube (e-NCF, código QR, URL QR, trackId) → guarda en factura
  - Módulo de Logs: registro de cada intento (enviado, aprobado, rechazado, timeout) → soporte técnico
  - Llamadas a Alanube son async (no bloquean al cajero) — FastAPI ventaja nativa
- **Fase 4**: Webhook receptor para confirmación de Alanube + lógica de reintentos/timeout + manejo de rechazos DGII
- Requiere: cuenta Alanube (alanube.co) + certificado digital de la empresa
- **Switch dual**: Config > Sistema > "Modo e-CF: Activado/Desactivado" — cada cliente decide si usa e-CF o NCF local. POS funciona en ambos modos simultáneamente

## FUTURO — PWA (Progressive Web App)
- Ícono personalizado VexlyPOS en Home Screen
- Splash screen con logo y marca al abrir
- Pantalla completa sin barra de Safari
- Funcionamiento offline básico (cache de menú, productos)
- manifest.json + service worker

- P1: Print Agent Multi-Impresora
### PENDIENTE — Envío de Facturas por Email (LISTO PARA IMPLEMENTAR)
- Resend API Key configurada en backend/.env: `RESEND_API_KEY=re_9oVHosHY_...`
- Dominio `vexlyapp.com` VERIFICADO en Resend (DKIM + SPF + DMARC)
- From: `facturas@vexlyapp.com`
- Implementar: endpoint enviar factura + template HTML + campo email en clientes + opción en Config > Sistema

- P1: Integración IA (GPT-4o mini)
- P1: Reporte de Horas Trabajadas
- P1: Envío Automático de Facturas por Email
- P2: DGII Report 608, Cache imágenes offline
- P3: Exportar Audit Trail a Excel/CSV
