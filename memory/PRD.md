# POS Dominicana - Product Requirements Document

## Original Problem Statement
Sistema POS (Point of Sale) para restaurantes en Republica Dominicana. Stack: React.js, FastAPI, MongoDB/Supabase, Tailwind CSS, Shadcn/UI.

## Strict Development Directive
All changes must be surgical and minimal. No refactoring or unnecessary modifications to core modules:
1. Motor de Inventario y Recetas
2. Fiscalidad y Cumplimiento (DGII)
3. Reloj de Negocio y Reportes de Cierre
4. Multimoneda y Pagos Mixtos
5. Motor de Impresion (ESC-POS 72mm)
6. Interfaz y Themes (UI/UX) - Liquid Glass

## Core Architecture
- **Frontend**: React.js + Tailwind CSS + Shadcn/UI (port 3000)
- **Backend**: FastAPI (port 8001, prefix /api)
- **Database**: MongoDB (primary) + Supabase (pos_sessions, legacy)
- **Printing**: Local print agent (print_agent_pro.py) using structured `data` payloads

## What's Been Implemented

### Session 1 (Previous forks):
- Full POS system: auth, inventory, recipes, orders, billing, kitchen, NCF/DGII compliance
- Multi-currency payments, tax engine, discount system
- Kitchen display, table management, customer loyalty
- Business day management (open/close with admin PIN)
- Report X (shift) and Report Z (day) generation

### Session 2 (Previous fork):
- Modifier Group CRUD (Edit/Delete)
- Login Screen Redesign (dark glassmorphism)
- Partial Item Void + Cancellation Ticket Printing
- Cash Register data sync fix (MongoDB resync endpoint)
- Blank print ticket fix (structured `data` vs raw `commands`)
- Mobile UI fixes (flex-wrap headers, floating keyboard)
- Product workflow fix (modifier dialog)

### Session 3 (Current - 2026-02-28):
- **P0 FIX: Shift/Day Closure Validation** - Implemented comprehensive blocking logic:
  - Cierre X (shift closure): Now checks ALL open orders (any user) and ALL other active sessions
  - Cierre Z (day closure): Combined validation checks into single response showing all blocking reasons
  - Detailed error messages identifying who/what is blocking (user names, table numbers, terminals)
  - Frontend: Updated error dialog to show all blocking reasons with pipe separator display
  - Files modified: `pos_sessions.py`, `business_days.py`, `CashRegister.js`
  - Testing: 100% pass rate (10/10 backend tests, frontend verified)

## Prioritized Backlog

### P1 (Next)
- Implement employee time clock (Reloj de entrada/salida)
- Implement automatic invoice sending via email

### P2
- DGII Report 608 (NCF Anulados)
- Cache product images for offline access
- Compile print_agent_pro.py into Windows executable

### P3
- Export Audit Trail to Excel/CSV

## Technical Debt
- Supabase dead code removal (identified as bug source, partially resolved)
- Consolidate modifier API from server.py + config.py into routers/modifiers.py

## Key Credentials
- Admin PIN: 10000
- Cajero (Luis) PIN: 4321

## Key API Endpoints (Modified)
- `PUT /api/pos-sessions/{session_id}/close` - Now validates ALL open orders + other active sessions
- `POST /api/business-days/close` - Combined validation with detailed blocking reasons
- `PUT /api/pos-sessions/{session_id}/sync-sales` - Resync session totals
- `PUT /api/orders/{order_id}/partial-void/{item_id}` - Partial item void
