# POS Restaurant System - Dominican Republic

## Original Problem Statement
Full-stack POS application for DR restaurants. React + FastAPI + MongoDB. Multi-tenant, RBAC, printer integration, DGII compliance.

## Architecture
- Frontend: React + TailwindCSS + Shadcn/UI + React Query + Framer Motion (PWA)
- Backend: FastAPI + MongoDB
- External: Supabase, Alanube (e-CF), The Factory HKA (e-CF), Resend (emails)

## e-CF Provider Architecture
- **Dispatcher pattern**: `/api/ecf/*` routes through `ecf_dispatcher.py` which reads `system_config.ecf_provider` and routes to either Alanube or The Factory HKA
- **Alanube**: `/app/backend/routers/alanube.py` (unchanged, uses Bearer token)
- **The Factory HKA**: `/app/backend/routers/thefactory.py` (new, uses JWT auth with user/password/rnc)
- **Dispatcher**: `/app/backend/routers/ecf_dispatcher.py` (unified API layer)
- **NCF Counter**: `ecf_ncf_counters` MongoDB collection tracks sequential NCFs per provider/tipo
- **CRITICAL**: The Factory `itbiS1` field expects TAX RATE ("18"), NOT amount. Amount goes in `totalITBIS1`
- **Provider selector**: Settings > Sistema tab with toggle between Alanube and The Factory HKA

## Completed Tasks (2026-04-04)
- **Smart Notification System** (DONE): Complete replacement of old toast/notification system with context-aware notifications:
  - SUCCESS (green #22C55E) → Bottom Sheet, auto-dismiss 3s
  - WARNING (amber #F59E0B) → Bottom Sheet, auto-dismiss 5s
  - ERROR/FISCAL (red) → Centered Modal, requires "Entendido" button
  - CONFIRMATION (blue) → Centered Modal, Cancel/Confirm buttons
  - Cross-platform: Safari iOS 15+, Android Chrome, Windows Chrome/Edge, iPad
  - Files: `/app/frontend/src/components/SmartNotificationSystem.jsx`, `/app/frontend/src/lib/notify.js`
  - Removed: `BottomSheetNotification.jsx`, Sonner Toaster from KitchenTV

## Completed Tasks (2026-04-03)
- **Dashboard Edit Mode UI/UX Bug Fix + Safari iOS Compat** (DONE): Fixed two P0 bugs with full cross-browser support. (1) Buttons: Safari-safe inline styles with `WebkitAppearance:none`, `WebkitTextFillColor`, explicit `backgroundColor`, `opacity:1`, `minHeight:48px` touch targets. (2) Long-press: Safari-safe implementation using `window` scroll listener with `capture:true` (Safari doesn't fire touchmove/container scroll during momentum scroll), tolerance 15px, 900ms duration, `touchAction:'pan-y'`, new touchstart cancels any pending timer. Verified on vexlyapp.com production.
- **Dashboard Anulaciones Label Format Fix** (DONE): Replaced confusing "2x" multiplier format with clear "[Razón] [N] anulaciones RD$ X,XXX.00" three-column layout. Singular/plural handled.
- **CashRegister Re-imprimir Button Safari iOS Fix** (DONE): Floating reprint bar was hidden behind bottom nav bar on Safari iOS (47px overlap). Added `viewport-fit=cover` to index.html, created `.float-above-nav` and `.scroll-clear-nav` CSS classes with `env(safe-area-inset-bottom)` calculations and responsive desktop fallbacks. Nav bar height (71px) + safe-area (34px on notched iPhones) properly accounted for.
- **The Factory HKA Code 145 Fix** (DONE): Fixed `fechaVencimientoSecuencia` validation in `thefactory.py`. Added `_is_valid_fecha_venc()` helper to detect "N/A", null, empty, and invalid date formats. E32 (Consumo) now sends `null` instead of "N/A" which caused Code 145 rejection. E31 with valid dates continues working. Updated `ecf_dispatcher.py` to propagate `None` defaults.
- **.gitignore Cleanup** (DONE): Removed duplicate `*.env` blocks, added `memory/test_credentials.md` to gitignore.
- **Dashboard Turnos Abiertos Bug Fix** (DONE): Dashboard was querying empty MongoDB `shifts` collection instead of Supabase `pos_sessions` table (same source as Caja/Turnos). Fixed `reports.py` to query Supabase with fallback to MongoDB. Now correctly shows open shift count.
- **Dashboard Blank Card Fix** (DONE): Payment breakdown had 3 cards in grid-cols-2, leaving Propinas alone with empty space. Added 4th "Facturas" card (bills_count) and changed grid to cols-4. Also fixed operations grid from cols-5 to cols-6 for even distribution of 6 cards.
- **Drag-and-Drop Card Reorganization** (DONE): Full editable grid system using @dnd-kit. Long press (900ms) for admin/owner only. Shake animation, drag handles, hide buttons, Restaurar layout original. Persisted to localStorage (vexly_layout_{screen}_{section}_{user_id}). Applied to Dashboard (4 sections), CashRegister (stats), Customers (loyalty), AnulacionesReport (summary).

## Completed Tasks (2026-04-02)
- **Service Worker Cache Fix** (DONE): Fixed sw.js to properly cache app shell on install (v4: cache-first strategy, skipWaiting/clients.claim inside waitUntil chain). All static assets and JS/CSS bundles cached on fetch.
- **localStorage Data Cache** (DONE): tablesAPI.list() saves to `vexly_mesas`, ordersAPI.getTableOrders() merges per-table into `vexly_orders`. Offline fallback reads from these keys.
- **OrderScreen Offline Fallback** (DONE): Removed unreliable `navigator.onLine` checks. Now uses `!err.response` (axios network error detection) in api.js catches. `fetchOrder()` uses `loadFromCache()` helper on ANY catch. All `sendPendingToKitchenSilently` and `fetchOrder` calls wrapped in try/catch to prevent blocked navigation. Split bill `applyOrders` correctly filters by table_id and selects account by activeOrderId.
- **TableMap Offline Fallback** (DONE): fetchData() falls back to `vexly_mesas` and `vexly_areas` from localStorage on ANY error. Areas cached on successful fetch. Back navigation always reaches `navigate('/tables')`.
- **fetchAll() Offline Cache** (DONE): Replaced `Promise.all` with individual try/catch per API. On success, caches to localStorage (`vexly_categories`, `vexly_products`, `vexly_modifiers`, `vexly_cancellation_reasons`). On failure, reads from localStorage. Business day check (`vexly_business_day_current`) also cached. Menu/catalog data now survives offline.
- **Mover Artículo Feature** (DONE): New multi-step flow in Funciones de Mesa for moving items between accounts/tables. Step 1: select items with checkboxes (only pending/sent). Step 2: choose destination (Esta Mesa tab for same-table accounts, Otra Mesa tab for other tables). Step 3: confirm via bottom sheet. Supports partial quantities (e.g., move 1 of 2). Backend: `/api/orders/{id}/move-items` updated with `quantities` param.
- **Funciones de Mesa Cleanup** (DONE): Removed disabled "Reimprimir" and "Descuento" buttons. Reorganized 5 buttons in clean 2-column grid + full-width Anular.

## Completed Tasks (2026-04-01)
- **The Factory HKA Integration** (DONE): Full e-CF integration with auth, payload mapping, send, status check, anulación, logs.
- **e-CF Provider Dispatcher** (DONE): Unified router that dispatches to Alanube or The Factory based on system_config.ecf_provider.
- **Frontend Provider Selector** (DONE): Settings > Sistema tab with visual toggle buttons.
- **NCF Tracking** (DONE): Sequential NCF counter in MongoDB.
- **e-CF Credentials Self-Service UI** (DONE): Business owners can configure credentials from Settings > Sistema.
- **Divided Table Status Bug Fix** (DONE): Fixed table marking as "free" when one account is paid on divided table.

## Completed Tasks (2026-03-31)
- Refactoring OrderScreen.js → AccountSelectorLobby.js + SplitCheckView.js
- Bug fix auto-send kitchen orders on navigation
- Light Theme contrast fixes (text-white → text-foreground)

## Completed Tasks (2026-03-29)
- Reports mobile redesign, Clientes page fix, Bottom padding global
- Inventory mobile, Order screen mobile, Bug fix verifyManagerPin

## Backlog

### P0
- Módulo Contable RD (Fase 1: Cuentas por Pagar/Cobrar, Fase 2: Asientos automáticos, Fase 3: Estados financieros + DGII 606/607/608, Fase 4: Conciliación bancaria)

### P1
- Reporte de Horas Trabajadas
- Manuales de Usuario PDF
- Integración IA (GPT-4o mini)
- CRM

### P2
- Reporte DGII 608, Caché imágenes, Print Agent Installer
- `test_credentials.md` not in .gitignore

### P3
- Exportar Audit Trail, Modo Offline (PAUSED)

## REGLAS OBLIGATORIAS DEL PROYECTO (NO NEGOCIABLES)

### Compatibilidad de Dispositivos
- TODO debe funcionar en TODOS los dispositivos: Android, iPhone, iPad, Tablet, PC, Laptop
- Sistemas operativos: Android e iOS obligatorio
- Navegadores: Chrome, Safari (iOS), Samsung Internet
- Responsive: Mobile (< 768px), Tablet (768-1024px), Desktop (> 1024px)
- NO se acepta que algo funcione en desktop y falle en móvil o viceversa

### Testing Obligatorio
- SIEMPRE hacer flujo de pruebas completo antes de entregar cualquier cambio
- Verificar que el cambio fue aplicado correctamente en el flujo real
- Probar el escenario afectado end-to-end, no solo el punto del cambio
- NO SE ACEPTAN ERRORES — cada entrega debe estar probada y funcionando
- Si es un bug fix: reproducir el bug primero, aplicar fix, verificar que el bug no existe más

### Reglas Técnicas
- Respond in Spanish
- DO NOT implement offline ordering/syncing
- Use `notranslate` class on numbers
- Never hardcode `text-white` — use theme variables (`text-foreground`, `text-muted-foreground`)
- Radix ScrollArea fix: `[&_[data-radix-scroll-area-viewport]>div]:!block`
- Mobile detection: `device?.isMobile` from useAuth() (width < 768px)
- The Factory HKA sandbox: shared environment, NCFs get consumed by other users. Start counters at 100+
