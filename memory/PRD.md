# Mesa POS RD - PRD

## Original Problem Statement
Full-stack POS (Point of Sale) application for restaurants in Dominican Republic. React frontend + FastAPI backend + dual-database architecture (MongoDB for operations, Supabase for financial data).

## Architecture (FROZEN BY DIRECTIVE)
- **Supabase (PostgreSQL)**: Exclusive engine for financial/fiscal data (NCF, shifts, cash movements, fiscal audits)
- **MongoDB**: Exclusive engine for operational data (products, modifiers, tables, users, inventory, orders, theme config)
- This "Polyglot Persistence" architecture is permanently frozen by user directive

## What's Been Implemented

### Multi-Theme System (COMPLETE - 2026-03-01)
- **3 Visual Modes**: Original (dark glass), Minimalist Light (off-white neumorphic), Minimalist Dark (navy neumorphic)
- **Global Neumorphic 3D**: Buttons, cards, inputs, sidebar, tabs, dialogs — ALL have 3D depth + LED glow
- **Dark/Light Toggle**: Claro/Oscuro within minimalist, with customizable colors (bg, glow, accent)
- **Persistence**: localStorage cache for instant F5 apply (no FOUC) + MongoDB backend save
- **Text Contrast**: Comprehensive CSS overrides for ALL pastel colors, gradient text, inline colors, opacity variants
- **Pastel Payment Colors**: Soft mint/sky/peach/lavender palette, editable from Settings, NO brand SVGs
- **Configurable "Monto Exacto"**: Color picker in Settings > Ventas
- **Category/Product Buttons**: Solid colors (A0 opacity), larger on tablet/PC, name-top/price-bottom layout
- **"Categorias" Back Button**: Large tactile orange button with arrow
- **Clean Modals**: No backdrop blur, solid edges, all text readable

### P0 Traceability Bridge (COMPLETE - 2026-03-01)
- Bidirectional cross-reference between MongoDB and Supabase on every payment
- MongoDB `bills` → `supabase_transaction_id`, `supabase_movement_ref`
- Supabase `cash_movements.description` → `[BILL:{mongodb_bill_id}]` parseable format

### Dashboard Enhancements (COMPLETE - 2026-03-01)
- Payment breakdown cards: Tarjeta, Transferencia, Propinas (Jornada data)
- Bug fix: "Ordenes Activas" now excludes `closed` status orders

### Numeric Keypad (COMPLETE - 2026-03-01)
- Reusable `NumericKeypad.jsx` component with modal popup, decimal support
- Replaced ALL `type="number"` inputs across 14+ files (except NcfTab RNC fields)

### Previous Session Work
- Shift/Day Closure Logic, Mixed Payment Bug Fix
- Dashboard & Cash Register UI, UTC to Local Time correction
- Payment Screen fixes, Discount reporting, Modifier cleanup
- Architecture Resolution: Polyglot Persistence frozen

## Key Files
```
/app/frontend/src/
├── context/ThemeContext.js         # Multi-theme + localStorage persistence
├── styles/theme-minimalist.css    # ALL neumorphic CSS + contrast fixes
├── components/
│   ├── Layout.js                  # Conditional theme bg (dark/light aware)
│   ├── NumericKeypad.jsx          # Reusable numeric input component
│   └── GlassUI.js
├── pages/
│   ├── Login.js                   # Dual-theme login (glass vs neumorphic)
│   ├── Dashboard.js               # Payment breakdown + fixed active orders
│   ├── PaymentScreen.js           # Pastel buttons, configurable exact amount
│   ├── OrderScreen.js             # Larger buttons, back button, theme-aware
│   └── settings/
│       ├── ThemeTab.js            # Apariencia: theme toggle + color pickers
│       ├── VentasTab.js           # Exact amount color + numeric keypad
│       └── index.js
```

## Credentials
- Admin PIN: 10000
- Cajero PIN: 4321

## Next Tasks
- **P1**: Reloj de entrada/salida de empleados
- **P1**: Envío automático de facturas por email
- **P2**: DGII Report 608, Cache imágenes offline, Export Audit Trail
