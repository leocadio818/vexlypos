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
