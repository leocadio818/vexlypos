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

### 🔒 Sidebar Permissions (LOCKED - 2026-03-17)
- Meseros: NO ven Reservas, NO ven Config
- Cajeros: NO ven Cocina
- Jornada button: visible para todos, clickeable SOLO para roles con `close_day` permission
- "Opciones" modal: oculto dentro de mesas (`/order/`), visible fuera
- "Funciones" modal: visible solo dentro de mesas, GLOBAL (mobile+desktop)

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

## Credentials
- Admin PIN: 10000
- OSCAR (Cajero): 1111
- Carlos Mesero: 100
- Scarlin (Gerente): 4321

## Branding & White-Label (2026-03-14)
- Login screen loads restaurant name + logo from `/api/system/branding`
- Logo cached in localStorage (`pos_branding`) for instant render
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

## PENDING — Print Agent Multi-Impresora (Próxima Sesión)
- Opción A: Un solo Print Agent, múltiples IPs por canal
- Config.txt con secciones por impresora

## PENDING — Integración de IA (Próxima Sesión)
- GPT-4o mini via Emergent Universal Key
- Asistente de Inventario, Análisis de Ventas, Sugerencias de Menú, Predicción de Demanda

## Next Tasks
- P1: Print Agent Multi-Impresora
- P1: Integración IA
- P1: Reporte de Horas Trabajadas
- P1: Envío Automático de Facturas por Email
- P2: DGII Report 608, Cache imágenes offline
- P3: Exportar Audit Trail a Excel/CSV
