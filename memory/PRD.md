# Mesa POS RD - PRD

## Original Problem Statement
Full-stack POS (Point of Sale) application for restaurants in Dominican Republic. React frontend + FastAPI backend + dual-database architecture (MongoDB for operations, Supabase for financial data).

## Architecture (FROZEN BY DIRECTIVE)
- **Supabase (PostgreSQL)**: Exclusive engine for financial/fiscal data (NCF, shifts, cash movements, fiscal audits)
- **MongoDB**: Exclusive engine for operational data (products, modifiers, tables, users, inventory, orders, theme config)
- This "Polyglot Persistence" architecture is permanently frozen by user directive

## Core Requirements
- Shift management (Cierre X / Cierre Z) with business validation
- Multi-payment method support (cash, card, transfer, USD, EUR)
- Tax handling (ITBIS, Propina Legal) with manual overrides
- NCF fiscal invoice management
- Discount application and reporting
- Kitchen display system
- Inventory management with recipes
- Comprehensive reporting system
- Multi-theme visual system (Original Glass + Minimalist Neumorphic)

## What's Been Implemented

### Completed (Previous Sessions)
- Shift/Day Closure Logic with correct validation rules
- Mixed Payment Bug Fix (proper distribution in billing.py)
- Dashboard & Cash Register UI with all payment methods + discounts
- UTC to Local Time correction across all prints
- Real-time Report Filtering
- Payment Screen fixes (tax override, visual feedback)
- Discount totals in Cierre X/Z reports
- Backend endpoint GET /api/reports/discounts
- Discount Report Frontend (DiscountsReport.jsx)
- Modifier Routes Cleanup (removed duplicates from server.py)
- Architecture Resolution: Polyglot Persistence frozen by user directive

### Completed (2026-02-28 - Current Session)
- **Multi-Theme Engine**: Implemented complete multi-theme architecture with two isolated themes:
  - **Tema Original**: Dark glassmorphism with neon effects (preserved exactly as-was)
  - **Tema Minimalista**: Light neumorphic with 3D buttons, off-white backgrounds, LED glow panels
- **ThemeContext.js**: Extended with `activeThemeMode`, `neoColors`, dynamic CSS variable injection, body class management
- **Apariencia Tab**: New unified appearance panel in Settings replacing "Paleta":
  - Theme mode toggle (Original vs Minimalist) with visual preview cards
  - Color pickers for neo: bg, glow, and accent colors (only shown in minimalist mode)
  - Glass presets shown in original mode
  - Live preview of neumorphic buttons
  - Save/restore functionality
- **Neumorphic CSS** (`theme-minimalist.css`): Isolated CSS with Shadcn variable overrides, shadow utilities, text contrast fixes, auto-apply patterns
- **Login.js**: Conditional rendering - glass PIN pad or neumorphic 3D PIN pad
- **Layout.js**: Conditional sidebar styling via `useGlassStyle` variable
- **Persistence**: Theme saved to MongoDB via existing `/api/theme-config` endpoint
- **Testing**: 11/11 frontend test scenarios passed (100% success rate)

## File Structure
```
/app
├── backend/
│   ├── models/
│   ├── routers/
│   │   ├── billing.py, config.py, pos_sessions.py
│   │   ├── reports.py, orders.py, business_days.py
│   │   └── ... (auth, kitchen, inventory, etc.)
│   ├── server.py
│   └── utils/
└── frontend/src/
    ├── context/ThemeContext.js          # Multi-theme provider
    ├── styles/theme-minimalist.css     # Neumorphic CSS (NEW)
    ├── components/
    │   ├── Layout.js                   # Conditional theme sidebar
    │   └── GlassUI.js
    ├── pages/
    │   ├── Login.js                    # Dual-theme login
    │   ├── settings/
    │   │   ├── ThemeTab.js             # Appearance tab (REWRITTEN)
    │   │   └── index.js               # Tab renamed to Apariencia
    │   ├── reports/DiscountsReport.jsx
    │   └── ... (Dashboard, CashRegister, etc.)
    └── index.css                       # Imports theme-minimalist.css
```

## Prioritized Backlog

### P0 - Mandatory Architecture
- Implement Traceability Bridge between MongoDB and Supabase (cross-reference IDs on payment)

### P1 - Upcoming
- Implement employee time clock (Reloj de entrada/salida)
- Implement automatic sending of invoices via email

### P2 - Future
- DGII Report 608 (NCF Anulados)
- Cache product images for offline access
- Compile print_agent_pro.py into standalone Windows executable
- Export Audit Trail to Excel/CSV

## Credentials
- Admin PIN: 10000
- Cajero (Luis) PIN: 4321

## 3rd Party Integrations
- MongoDB
- Supabase (PostgreSQL)
- rnc.megaplus.com.do (RNC validation)
