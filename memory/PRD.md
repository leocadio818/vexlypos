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
**Architecture:**
- `fetchTheme` ONLY loads glass gradient props from API. NEVER overwrites `activeThemeMode`, `neoMode`, or `neoColors`
- State source of truth hierarchy: 1) `pos_user_ui_prefs` in localStorage → 2) `pos_theme_cache` in localStorage → 3) defaults
- `applyUserPreferences()` called on login — sets mode from MongoDB `ui_preferences` + writes to `pos_user_ui_prefs`
- `resetThemeOnLogout()` only removes `pos_user_ui_prefs` flag — keeps visual state for login screen
- `pos_theme_cache` auto-updates via useEffect on every state change
- CSS effect applies body classes (`theme-minimalist`, `neo-dark`) and CSS variables on `document.body.style`
- **Key files**: `ThemeContext.js`, `AuthContext.js`, `Layout.js`, `theme-minimalist.css`
- **DO NOT**: Add fetchTheme calls that set activeThemeMode/neoMode. DO NOT reset theme state on logout. DO NOT move CSS variable setting to document.documentElement (must be on body).

### 🔒 Provider Order (App.js)
**ThemeProvider wraps AuthProvider** (AuthProvider uses useTheme). DO NOT reverse.

### 🔒 Traceability Bridge (billing.py)
**MongoDB bill ↔ Supabase cash_movement cross-reference on every payment. DO NOT remove.**

## What's Been Implemented

### Multi-Theme System (COMPLETE)
- 3 Visual Modes: Original (dark glass), Minimalist Light, Minimalist Dark
- Global Neumorphic 3D on ALL elements (buttons, cards, inputs, tabs, dialogs)
- Dark/Light toggle within minimalist + customizable colors
- F5 persistence via localStorage cache + MongoDB per-user `ui_preferences`
- Comprehensive CSS text contrast: pastel overrides, gradient text fix, inline color overrides
- Pastel payment colors, configurable "Monto Exacto" color
- Category/Product buttons: solid colors, larger on tablet/PC, name-top/price-bottom
- Avatar popover: theme selector accessible to ALL roles (cajeros, meseros, admin)
- Clean modals: no backdrop blur, solid edges, all text readable

### P0 Traceability Bridge (COMPLETE)
- MongoDB `bills` → `supabase_transaction_id`, `supabase_movement_ref`
- Supabase `cash_movements.description` → `[BILL:{mongodb_bill_id}]`

### Dashboard (COMPLETE)
- Payment breakdown: Tarjeta, Transferencia, Propinas (Jornada data)
- Bug fix: "Ordenes Activas" excludes `closed` status

### Numeric Keypad (COMPLETE)
- `NumericKeypad.jsx` with modal popup, decimal support
- Replaced ALL `type="number"` inputs (except NcfTab RNC)

### User UI Preferences (COMPLETE)
- `PUT /api/users/me/ui-preferences` endpoint
- Login applies `ui_preferences` automatically via `applyUserPreferences`
- Avatar "Guardar como mi tema" saves to API + localStorage

## Credentials
- Admin PIN: 10000

## Next Tasks
- **P1**: Reloj de entrada/salida de empleados
- **P1**: Envío automático de facturas por email
- **P2**: DGII Report 608, Cache imágenes offline, Export Audit Trail
