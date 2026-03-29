# VexlyPOS — PRD

## Original Problem Statement
Full-stack POS (Point of Sale) application for restaurants in Dominican Republic. React frontend + FastAPI backend + dual-database architecture (MongoDB for operations, Supabase for financial data).

## Architecture (FROZEN BY DIRECTIVE)
- **Supabase (PostgreSQL)**: Exclusive engine for financial/fiscal data (NCF, shifts, cash movements, fiscal audits)
- **MongoDB**: Exclusive engine for operational data (products, modifiers, tables, users, inventory, orders, theme config)
- **IMPORTANT**: Production and Preview use DIFFERENT MongoDB databases. Data fixes must be applied to BOTH.

## 🔒 LOCKED SYSTEMS

### 🔒 Theme Persistence Engine (ThemeContext.js) — LOCKED
### 🔒 Provider Order (App.js) — ThemeProvider wraps AuthProvider — LOCKED
### 🔒 Traceability Bridge (billing.py) — MongoDB↔Supabase cross-reference — LOCKED
### 🔒 CashRegister Performance — Optimized 1.85s — LOCKED
### 🔒 React.lazy + Suspense — All 20 pages lazy-loaded — LOCKED
### 🔒 Zero Native `<a href>` — Always use `<Link to>` — LOCKED
### 🔒 PinPad Hybrid System — forceKeypad always — LOCKED
### 🔒 Business Day Filtering — ALL reports use business_date not paid_at — LOCKED
### 🔒 Zero Native Date/Time Inputs — LOCKED
### 🔒 Never add default permissions without user authorization — LOCKED
### 🔒 Asistencia Nocturna — NO auto-cierre a medianoche (LOCKED)
- Restaurantes/bares/discotecas cruzan medianoche frecuentemente
- Un turno ACTIVE permanece abierto hasta: salida manual del empleado O Cierre de Día por admin
- PROHIBIDO implementar auto-corte a las 12:00 AM
- Si usuario tiene POS session abierta → check-status retorna clocked_in=true + auto clock-in para hoy

### 🔒 Employee Attendance / Clock-In Flow — useCallback, inline overlays z-[9999] — LOCKED
### 🔒 Sidebar & Navigation — Opciones/Funciones modals, permissions — LOCKED
### 🔒 Auto-Contrast System — data-contrast + CSS !important — LOCKED
### 🔒 Permissions from DB not JWT — can_access_table_orders async — LOCKED
### 🔒 Cierre de Día — force_close NEVER skips open orders, auto clock-out — LOCKED
### 🔒 Barcode Scanner System — keypress listener 100ms threshold — LOCKED

### 🔒 Print Agent Multi-Impresora & Printing System (LOCKED - 2026-03-28)
- VexlyPOS_PrintAgent.py: format_commands + format_test + format_comanda + format_receipt + QR code
- Modifiers: handles strings AND dicts
- Terminal→Impresora routing via Supabase session lookup (create_client direct, NOT import)
- Printer selector for waiters without POS session
- **ANTI-DUPLICATE NUCLEAR (LOCKED)**:
  - Backend send-kitchen: ATOMIC update per item (`items.$.status: "pending"` → "sent") — if already "sent", `modified_count=0` → skips → no duplicate job
  - Backend print queue: ATOMIC claim (`find_one_and_update` status "pending"→"claimed") — only 1 agent processes each job
  - Multiple callers (OrderScreen, Layout, AuthContext) can call sendToKitchen simultaneously — backend guarantees idempotency
- DO NOT: Remove atomic claims from print queue endpoints
- DO NOT: Remove atomic item status check from send-kitchen
- DO NOT: Add new print calls without verifying they don't duplicate
- DO NOT: Modify VexlyPOS_PrintAgent.py, format_comanda, format_commands, format_receipt, format_precheck, format_test
- DO NOT: Change endpoints: print/pre-check/send, print/receipt/send, print/send-comanda, print/queue, print/config, print-queue/pending
- DO NOT: Alter terminal→print_channel resolution in server.py

### 🔒 e-CF Alanube Integration (LOCKED - 2026-03-28)
- **Modules**: Mapeo (bill→JSON), Timbrado (save response), Logs (every attempt)
- **Endpoints**: /api/ecf/send, /api/ecf/status, /api/ecf/logs, /api/ecf/config
- **Flow**: Config switch ecf_enabled → billing skips local NCF (saves PENDING-E32) → PaymentScreen sends e-CF to Alanube FIRST → then prints ticket with e-NCF + QR
- **Invoice types**: E32→/invoices, E31→/fiscal-invoices, E33→/debit-notes, E34→/credit-notes, E44→/special-regime, E45→/government
- **Ticket header**: ecf_encf exists → "Factura de Consumo Electronico" + e-NCF. No ecf → "COMPROBANTE FISCAL" + NCF local
- **ECF_LABELS**: E31=Credito Fiscal Electronico, E32=Factura de Consumo Electronico, E33=Nota de Debito Electronica, E34=Nota de Credito Electronica
- **Random e-NCF**: Uses random.randint(1B-9.9B) to avoid sandbox collisions
- **ecf_type field**: Saved in CreateBillInput AND PayBillInput AND bill document
- **NCF dropdown fix**: VentasTab uses value={n.id} NOT value={n.code} (Supabase ncf_types_config has id not code)
- **ECF_TO_NCF mapping**: E31→B01, E32→B02, E44→B15, E45→B14 (for sale type matching)
- **Payment screen e-CF buttons**: E32 Consumidor Final, E31 Crédito Fiscal, E44 Régimen Especial, E45 Gubernamental (E33/E34 NOT shown — those are for accountants)
- **Sandbox**: token in .env, RNC 132109122, shared sandbox (numbers can collide)
- **DO NOT**: Show E33/E34 in payment screen. DO NOT use n.code for dropdown values.

## Credentials
- Admin PIN Preview: 10000
- Admin PIN Production: 1000
- OSCAR (Cajero): 1111
- Carlos Mesero: 100
- Scarlin (Gerente): 4321

## Email System (Resend)
- API Key in .env, domain vexlyapp.com VERIFIED
- From: facturas@vexlyapp.com
- Template: Professional HTML with QR code for e-CF
- Post-payment: EMAIL button → search customer/create/manual email modal
- Auto-send toggle in Config > Sistema
- email_override parameter for manual email entry
- Modal confirmation (not toast) for email sent/error

## Post-Payment Flow
- 4 buttons grid: EMAIL, e-CF (only if ecf NOT enabled), REIMPRIMIR, VOLVER A MESAS
- When ecf_enabled: e-CF sent automatically → ticket prints with e-NCF+QR → 3 buttons only
- REIMPRIMIR → reprint ticket (not duplicate — first print is automatic at payment)

## Selective Cleanup (Config > Sistema)
- Panel with checkboxes: bills, orders, business_days, pos_sessions, attendance, reservations, print_queue, audit_logs, ncf_reset, stock_movements
- Users, products, categories, config NEVER deleted
- Endpoint: POST /api/system/selective-cleanup
- Separate from "RESETEAR SISTEMA" (nuclear option)

## Customer Management
- Edit button (pencil) on each customer card in Customers page
- Auto-search local DB when RNC/Cédula validated in fiscal drawer
- Auto-save new customer on Continuar
- Customers page: scrollable list, back button to Config

## NCF/e-CF Configuration (NcfTab)
- When ecf_enabled: shows E-series types (E31-E47), hides B-series sequences
- When ecf_disabled: shows B-series types, hides E-series
- E-types added to Supabase ncf_types_config (E31-E47, 10 types)
- Delete sequence fix: removed updated_at (column doesn't exist in Supabase)

## CRITICAL DATA NOTE
- Production and Preview have DIFFERENT databases
- When fixing data (sale_types, bills, etc.), must fix BOTH
- Production API: https://vexlyapp.com/api
- Preview API: https://dominicanpos.preview.emergentagent.com/api

## PENDING Tasks
- Print Agent Multi-Impresora: Installer needs qrcode+Pillow
- Integración IA (GPT-4o mini) — Emergent Universal Key
- Reporte de Horas Trabajadas
- CRM (fidelización, segmentación, comunicación)
- Módulo Contable RD (4 fases)
- PWA + Optimización rendimiento
- Manuales de usuario por puesto
- The Factory evaluation (alternative to Alanube)
- DGII Report 608, Cache imágenes, Audit Trail export

## COMPLETED (Latest)
- 2026-03-29: Google Translate Protection (translate="no", meta notranslate, clase notranslate en PinPad + PaymentScreen totals)
