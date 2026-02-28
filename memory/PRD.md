# Mesa POS RD - PRD

## Original Problem Statement
Full-stack POS (Point of Sale) application for restaurants in Dominican Republic. React frontend + FastAPI backend + MongoDB.

## Core Requirements
- Shift management (Cierre X / Cierre Z) with business validation
- Multi-payment method support (cash, card, transfer, USD, EUR)
- Tax handling (ITBIS, Propina Legal) with manual overrides
- NCF fiscal invoice management
- Discount application and reporting
- Kitchen display system
- Inventory management with recipes
- Comprehensive reporting system

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

### Completed (2026-02-28 - Current Session)
- **Discount Report Frontend**: Created `DiscountsReport.jsx` component with formatted table showing Fecha, NCF, Mesa, Mesero, Descuento (badge), Subtotal, Monto Descuento, Total Final. Added summary cards for total discounts and count. Integrated into Reports.js switch statement.

## Architecture
```
/app
├── backend/
│   ├── models/models.py
│   ├── routers/
│   │   ├── billing.py, business_days.py, orders.py
│   │   ├── reports.py, pos_sessions.py
│   ├── utils/printer.py, timezone.py
│   ├── print_agent_pro.py
│   └── server.py
└── frontend/src/
    ├── pages/
    │   ├── Reports.js
    │   ├── reports/DiscountsReport.jsx (NEW)
    │   ├── CashRegister.js, Dashboard.js, PaymentScreen.js
    └── components/, api/
```

## Prioritized Backlog

### P1 - Upcoming
- Implement employee time clock (Reloj de entrada/salida)
- Implement automatic sending of invoices via email

### P2 - Future
- DGII Report 608 (NCF Anulados)
- Cache product images for offline access
- Compile print_agent_pro.py into standalone Windows executable
- Export Audit Trail to Excel/CSV

### P3 - Refactoring
- Remove dead Supabase code
- Consolidate Modifier API logic (server.py + config.py)

## Credentials
- Admin PIN: 10000
- Cajero (Luis/Oscar) PIN: 4321

## 3rd Party Integrations
- MongoDB
- rnc.megaplus.com.do (RNC validation)
