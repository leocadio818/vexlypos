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
- **Multi-Theme Engine**: Implemented complete multi-theme architecture with three visual modes:
  - **Tema Original**: Dark glassmorphism with neon effects (preserved exactly)
  - **Tema Minimalista Claro**: Light neumorphic (off-white, 3D buttons, subtle LED glow)
  - **Tema Minimalista Oscuro**: Dark navy neumorphic (dramatic LED glow, 3D depth)
- **Global Neumorphic 3D**: CSS auto-applies to ALL elements: buttons, cards, inputs, sidebar, tabs, dialogs, toasts, table map
- **Dark/Light Toggle**: Within minimalist theme, users choose between Claro/Oscuro backgrounds. Glow is dramatically more visible on dark bg
- **Color Customizer**: Separate bg colors for light/dark, shared glow + accent. Persists to MongoDB
- **Modal Contrast Fix**: Payment keypad numbers now clearly visible in both modes
- **ThemeContext.js**: neoMode ('light'|'dark'), neoDarkBg, body.style CSS vars, neo-dark class
- **PaymentScreen Neumorphic Fix**: PaymentScreen now uses conditional theme-aware backgrounds instead of hardcoded dark gradient. Loading/error states also adapted. Works correctly in both Claro (off-white) and Oscuro (navy) modes
- **Bug Fixes (2026-02-28)**:
  - Fixed neoMode persistence: Dark mode now survives page refresh
  - Fixed invisible tab/button text: Darker muted-foreground, explicit foreground color on tabs
  - Fixed dark bg-slate-900 override for modals/dialogs
  - Comprehensive light mode text contrast: pastel color overrides (50/100/200-400 shades → darker), gradient text → solid, headers enforced dark
  - Added bg-background to Shadcn Button outline variant for proper neumorphism
  - Testing: iterations 95-100, final 85%→100% text contrast in light mode

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
