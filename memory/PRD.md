# Mesa POS RD - PRD

## Original Problem Statement
Full-stack POS (Point of Sale) application for restaurants in Dominican Republic. React frontend + FastAPI backend + dual-database architecture (MongoDB for operations, Supabase for financial data).

## Architecture (FROZEN BY DIRECTIVE)
- **Supabase (PostgreSQL)**: Exclusive engine for financial/fiscal data (NCF, shifts, cash movements, fiscal audits)
- **MongoDB**: Exclusive engine for operational data (products, modifiers, tables, users, inventory, orders, theme config)
- This "Polyglot Persistence" architecture is permanently frozen by user directive

## 🔒 LOCKED SYSTEMS — DO NOT MODIFY WITHOUT EXPLICIT USER APPROVAL

### 🔒 Theme Persistence Engine (ThemeContext.js)
**Status: LOCKED — Working perfectly as of 2026-03-01**
- `fetchTheme` ONLY loads glass gradient props. NEVER overwrites `activeThemeMode`, `neoMode`, or `neoColors`
- State hierarchy: 1) `pos_user_ui_prefs` → 2) `pos_theme_cache` → 3) defaults
- `applyUserPreferences()` on login sets mode + writes to `pos_user_ui_prefs`
- `resetThemeOnLogout()` only removes `pos_user_ui_prefs` flag
- CSS variables set on `document.body.style` (NOT documentElement)
- **DO NOT**: Add fetchTheme calls that set activeThemeMode/neoMode. DO NOT reset theme state on logout.

### 🔒 Provider Order (App.js)
**ThemeProvider wraps AuthProvider** (AuthProvider uses useTheme). DO NOT reverse.

### 🔒 Traceability Bridge (billing.py)
**MongoDB bill ↔ Supabase cash_movement cross-reference on every payment. DO NOT remove.**

### 🔒 CashRegister Performance (CashRegister.js)
**Status: LOCKED — Optimized to 1.85s from 5s as of 2026-03-01**
- Eliminated redundant `check()` call (0.8s Supabase roundtrip)
- Group 1 parallel: `current()` + `history()` + `terminals()`
- Group 2 parallel: `sync-sales` + `movements()` + `salesBreakdown()`
- `terminalsInUse()` fire-and-forget (non-blocking)
- Refresh post-sync non-blocking
- **DO NOT**: Add sequential API calls. DO NOT re-add `check()`. Keep all groups parallel.

## What's Been Implemented

### Multi-Theme System (COMPLETE)
- 3 Visual Modes: Original (dark glass), Minimalist Light, Minimalist Dark
- Global Neumorphic 3D on ALL elements
- Dark/Light toggle + customizable colors + pastel payment palette
- F5 persistence via localStorage + MongoDB per-user `ui_preferences`
- Avatar popover theme selector for ALL roles
- Comprehensive text contrast (pastel overrides, gradient text, inline colors, opacity)
- Clean modals (no backdrop blur, solid edges)
- Configurable "Monto Exacto" color in Settings > Ventas

### Custom UI Components (COMPLETE)
- **NumericKeypad.jsx**: Modal numeric input with decimal, replaces all type="number"
- **DateTimePicker.jsx**: NeoDatePicker (calendar with month/year quick select) + NeoTimePicker (12h/24h)
- **12H/24H Format**: Configurable in Settings > Sistema, auto-applied to pickers + tickets + comandas
- All components touchscreen-optimized (large buttons, py-3, rounded-xl)

### P0 Traceability Bridge (COMPLETE)
- MongoDB `bills` → `supabase_transaction_id`, `supabase_movement_ref`
- Supabase `cash_movements.description` → `[BILL:{mongodb_bill_id}]`

### Dashboard (COMPLETE)
- Payment breakdown: Tarjeta, Transferencia, Propinas
- Bug fix: "Ordenes Activas" excludes `closed` status
- Category buttons solid colors, larger on tablet/PC, name-top/price-bottom
- "Categorias" back button large and tactile

### Reservations (COMPLETE)
- Bug fixes: date/time field mapping, edit hour persistence
- Report: KPIs, by day/hour/status charts, top customers, detail table with Mesas/Area/Notas
- Wide modal (95vw), large table selector buttons, timing config visible

### Performance (COMPLETE)
- CashRegister: 5s → 1.85s via API parallelization

## Credentials
- Admin PIN: 10000

## Next Tasks
- **P1**: Reloj de entrada/salida de empleados
- **P1**: Envío automático de facturas por email
- **P2**: DGII Report 608, Cache imágenes offline, Export Audit Trail

### Mobile Responsive Fixes (COMPLETE - 2026-03-01)
- Reservations card: `min-w-0` + `shrink-0` + `flex-wrap` — buttons never clip on mobile
- DateTimePicker: `w-[calc(100vw-32px)]` responsive popover
- TimePicker: `max-w-[400px]` large touchscreen buttons `py-3 text-base`
- Calendar: month/year quick picker, `max-w-[360px]`
- Exchange rate badges: clean style with method colors (no bg-white/30 dark blobs)

### 🔒 Performance Optimization (LOCKED - 2026-03-12)
- **React.lazy + Suspense**: ALL 20 pages lazy-loaded with PageSkeleton fallback
- **Code splitting**: Each page = separate chunk, downloaded on first visit, cached by browser
- **PageSkeleton.jsx**: Animated pulse skeleton (header + KPI cards + content + table)
- **cache.js**: useSWRCache hook — stale-while-revalidate pattern, 5min staleTime
- **Layout persistent**: Sidebar/ThemeProvider/AuthProvider NEVER re-mount on navigation
- **Login stays eager**: Not lazy-loaded for instant initial render
- **DO NOT**: Convert back to static imports. DO NOT remove Suspense wrappers. DO NOT add heavy sync operations to sidebar NavLinks.

### Business Day "Midnight Bug" Fix (2026-03-12)
- Dashboard filters by ACTIVE business_day.opened_at, NOT calendar date
- Shows "JORNADA ACTIVA: date" instead of "EN VIVO: today"
- If jornada crosses midnight, data persists until Cierre Z

### Transaction Numbers (T-1001+)
- Sequential from 1001, assigned at order creation (first product)
- Printed on comandas, visible in OrderScreen header, Dashboard, CashRegister movements
- Separate from NCF (fiscal) — operational use only

### 🔒 Zero Native Date/Time Inputs (LOCKED - 2026-03-12)
- ALL date/time inputs replaced with NeoDatePicker/NeoTimePicker across entire system
- 0 remaining `type="date"` or `type="time"` inputs
- Files covered: Reports.js, AuditTab.jsx, PurchasesTab.jsx, UserConfig.js, BusinessDayManager.jsx, Reservations.js, DescuentosTab.js, NcfTab.js, InventoryManager.js
- DO NOT add native date/time inputs. Always use NeoDatePicker/NeoTimePicker from DateTimePicker.jsx

### 🔒 PinPad Hybrid System (LOCKED - 2026-03-12)
- ALL 7 PinPads use `forceKeypad` — always show on-screen numpad
- Physical keyboard works simultaneously: 0-9, Backspace, Delete, Enter
- Visual feedback: button highlights 150ms when physical key pressed
- Enter = auto-submit (onSubmit)
- NO `<input>` fields for PIN authorization anywhere in the system
- UserConfig PIN setup is the ONLY exception (text input for config, not auth)
- DO NOT: Remove forceKeypad. DO NOT add input fields for auth PINs. DO NOT remove keydown listener.

### 🔒 Business Day (Jornada) Filtering (LOCKED - 2026-03-12)
- ALL reports filter by active business_day.opened_at, NOT calendar date
- Dashboard, void-audit-logs, sales, by-payment, by-waiter — all use jornada
- Date pickers initialize with `/api/business-days/active-date`
- void_audit_logs now include `business_date` field
- Midnight bug permanently fixed
- DO NOT: Use datetime.utcnow() or new Date() for report defaults. Always use active business date.

### Bug Fix: PIN Change Validation & Security (2026-03-14)
- **Root cause**: `Layout.js` used `axios` directly (not imported) instead of the `api` instance from `@/lib/api`
- Backend `PUT /api/users/me/pin` returns `PIN_ALREADY_IN_USE` code (not user-facing message)
- Frontend catches the code and displays: "Esta clave ya está en uso" (no info leak)
- Query checks ACTIVE users only, EXCEPT current user (`$ne: currentUserId`)
- User CAN re-set their own current PIN or any old PIN (as long as no other ACTIVE user has it)
- Inactive users' PINs are freed up immediately upon deactivation
- Real network errors show "Error de conexión"

### 🔒 Zero Native `<a href>` for Internal Navigation (LOCKED - 2026-03-14)
- ALL internal links use React Router `<Link to>`, NEVER `<a href>`
- `<a href>` causes full page reload → loses SPA auth state → redirects to login
- ONLY exception: `Kitchen.js` uses `<a href="/kitchen-tv" target="_blank">` (intentional new tab)
- Files fixed: ReportsTab.js, CustomersTab.js, InventoryManager.js, InventarioTab.js, UsersTab.js (x2)
- DO NOT: Add `<a href="/...">` for internal routes. ALWAYS use `<Link to>` from react-router-dom.

### Branding & White-Label (2026-03-14)
- Login screen loads restaurant name + logo from `/api/system/branding` (public endpoint, no auth)
- Logo uploaded via `POST /api/system/upload-logo` → stored in `/uploads/logo/`
- Logo size on login: `w-32 h-32` (128px) for visibility
- Fallback: first 3 letters of restaurant name if no logo uploaded
- Config > Sistema has logo upload section (below restaurant name)
- Tab title: "VexlyPOS" (set in index.html)
- "Made with Emergent" badge: REMOVED (approved by Emergent support - Jen)
- Demo PINs section: REMOVED from both Neumorphic and Glass login versions

### 🔒 Employee Attendance / Clock-In Flow (LOCKED - 2026-03-17)
- Login flow: authenticate FIRST → check attendance → show modal or navigate
- `useCallback` for handleSubmit (React 19 stale closure fix)
- Modals are INLINE overlays (`fixed z-[9999]`), NOT shadcn Dialog (portal gets hidden by glass backdrop-blur)
- Both Neumorphic AND Glass returns have their own copy of the modals
- Keyboard listener uses `[handleSubmit]` dependency array
- No turno activo → Modal "Bienvenido! ¿Deseas marcar entrada?" → "Marcar Entrada" / "No"
- "No" → clears token + `window.location.href = '/login'` (cannot enter system without clock-in)
- "Marcar Entrada" → clock-in API → "Entrada Registrada!" modal → navigate to dashboard
- Con turno activo → navigate directo (no modal)
- Cajeros: auto clock-out en Cierre Z (CashRegister.js)
- Meseros: botón "Marcar Salida" dentro del popover del usuario (Layout.js), NO en sidebar
- Backend: `POST /api/attendance/check-status` (no modifica nada, solo verifica)
- Múltiples turnos por día: si turno mañana es COMPLETED, turno tarde = nuevo ACTIVE
- DO NOT: Use Dialog component for login modals. DO NOT remove useCallback. DO NOT put clock-in check BEFORE login.

### 🔒 Sidebar Permissions (LOCKED - 2026-03-17)
- Meseros: NO ven Reservas (`manage_reservations: false`), NO ven Config (0 config perms)
- Cajeros: NO ven Cocina (`!isCashier` filter)
- Jornada button: visible para todos, clickeable SOLO para Admin + roles con `close_day` permission
- "Marcar Salida": dentro del popover del usuario, solo visible para no-cajeros

### 🔒 Auto-Contrast System for Category/Product Cards (LOCKED - 2026-03-17)
- `getContrastText(hex)` function in OrderScreen.js — WCAG luminance algorithm
- Returns `#FFFFFF` (white) for dark backgrounds, `#1E293B` (dark) for light backgrounds
- Applied via `data-contrast="light|dark"` attribute on card buttons
- CSS in `index.css` uses `!important` — IMPOSSIBLE to override by any theme:
  - `[data-contrast="light"] * { color: #FFFFFF !important; }`
  - `[data-contrast="dark"] * { color: #1E293B !important; }`
  - `[data-contrast="light"] { text-shadow: 0 1px 2px rgba(0,0,0,0.3); }`
- Badge counters use `[data-badge]` with `!important` background + backdrop-blur
- AUTO_PALETTE: 12 curated colors auto-assigned to categories without custom color
- Works identically in Glass, Neumorphic Light, and Neumorphic Dark themes
- DO NOT: Use inline `style={{ color }}` for card text. ALWAYS use data-contrast attribute.
- DO NOT: Remove the `!important` rules from index.css.

### Branding Enhancements (2026-03-17)
- Sidebar logo: shows real restaurant logo from `pos_branding` localStorage (Layout.js)
- Branding cached in localStorage (`pos_branding`) for instant render on refresh (no flash)
- Business Day button: larger (`w-12 h-14`), bolder date text (`text-[10px] font-bold`)
- Category color picker: 18 preset colors + custom picker + text color picker + live preview
- "Buscar Cliente" modal: wider (`max-w-2xl`) for better spacing
- Category edit modal: scrollable (`max-h-[90vh] overflow-y-auto`)

### Reservations: "Registrado por" + Global Filters (2026-03-17)
- `created_by` field saved on every new reservation (user name from session)
- Backend `POST /reservations` stores `created_by: input.get("created_by", "")`
- Report detail table shows "Registrado por" column
- Existing reservations without `created_by` were backfilled with "Admin"
- Report now uses GLOBAL date filters (Jornada, Ayer, Esta Semana, etc.) — NOT its own period buttons
- Backend `GET /reports/reservations` accepts `date_from` + `date_to` parameters
- ReservationsReport.jsx receives `data` prop like all other reports (no more self-managed fetch)
- DO NOT: Re-add internal period buttons. DO NOT: Make reservations a "self-managed" report.

### Table Movements Audit (2026-03-17)
- `POST /orders/{id}/move` now logs to `table_movements` collection (single + merge)
- Endpoint `GET /reports/table-movements` supports `date_from` + `date_to` range filter
- Both simple moves and merges are logged with user, source/target table, type
- Import: `from routers.tables import log_table_movement` in orders.py

### PDF/Export Cleanup — Professional Reports (2026-03-17)
- HIDDEN_COLUMNS expanded: all UUIDs (order_id, item_id, waiter_id, bill_id, etc.), void_type, required_manager_auth, business_date
- COLUMN_TRANSLATIONS expanded: 40+ Spanish translations for all report fields
- ISO timestamps auto-formatted to `dd/mm/yyyy hh:mm` in exports
- Booleans formatted as `Sí/No`
- DO NOT: Show UUIDs or internal IDs in any PDF/Excel/Print export

### 🔒 Cash Close Report — Professional Redesign (LOCKED - 2026-03-17)
- Backend `GET /reports/cash-close` now returns: bills_detail, cashiers, voids summary, discounts summary, net_sales
- Frontend `CashCloseReport.jsx` — 7 professional sections:
  1. Header: Fecha, Cajero(s), Total Facturas
  2. KPI Cards: Total Ventas, Efectivo, Tarjeta, Venta Neta
  3. Ingresos por Forma de Pago: tabla con tipo, transacciones, propinas, total
  4. Resumen Fiscal: Subtotal, ITBIS, Propina Legal, Descuentos, Total Neto
  5. Auditoría de Excepciones: Anulaciones (count + monto) + Descuentos (count + monto)
  6. Detalle de Facturas: Hora, Trans#, Mesa, Mesero, Cajero, Método, Subtotal, ITBIS, Propina, Total
  7. Firmas: Espacio para Firma Cajero + Firma Supervisor
- DO NOT: Remove any section. DO NOT: Show UUIDs in the bill detail table.
### PENDIENTE — Print Agent Multi-Impresora (Próxima Sesión)
- Implementar Opción A: Un solo Print Agent que maneja TODAS las impresoras por IP de red
- Config.txt con secciones por impresora: [cocina] IP=x.x.x.x CANAL=cocina
- El agente recibe trabajos y los enruta a la impresora correcta según el canal de impresión
- Los Canales de Impresión ya existen en Config > Impresión
- Cada categoría ya se asigna a un canal
- Falta: backend envíe el canal en el job de impresión + agente lea el canal y envíe a la IP correcta

