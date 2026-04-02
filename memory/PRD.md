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

## Completed Tasks (2026-04-02)
- **Service Worker Cache Fix** (DONE): Fixed sw.js to properly cache app shell on install (v4: cache-first strategy, skipWaiting/clients.claim inside waitUntil chain). All static assets and JS/CSS bundles cached on fetch.
- **localStorage Data Cache** (DONE): tablesAPI.list() saves to `vexly_mesas`, ordersAPI.getTableOrders() merges per-table into `vexly_orders`. Offline fallback reads from these keys.
- **OrderScreen Offline Fallback** (DONE): Removed unreliable `navigator.onLine` checks. Now uses `!err.response` (axios network error detection) in api.js catches. `fetchOrder()` uses `loadFromCache()` helper on ANY catch. All `sendPendingToKitchenSilently` and `fetchOrder` calls wrapped in try/catch to prevent blocked navigation. Split bill `applyOrders` correctly filters by table_id and selects account by activeOrderId.
- **TableMap Offline Fallback** (DONE): fetchData() falls back to `vexly_mesas` and `vexly_areas` from localStorage on ANY error. Areas cached on successful fetch. Back navigation always reaches `navigate('/tables')`.
- **fetchAll() Offline Cache** (DONE): Replaced `Promise.all` with individual try/catch per API. On success, caches to localStorage (`vexly_categories`, `vexly_products`, `vexly_modifiers`, `vexly_cancellation_reasons`). On failure, reads from localStorage. Business day check (`vexly_business_day_current`) also cached. Menu/catalog data now survives offline.
- **Bottom Sheet Notification System** (DONE): Replaced ALL sonner toasts with custom BottomSheetNotification component. Global `notify` emitter (`/lib/notify.js`). Error=red (manual dismiss), Success=green (3s), Warning=amber (4s), Info=blue (4s), Confirm=overlay+buttons. iOS safe area, keyboard Escape, touch-friendly. ~45 files updated.

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
- Bug: The Factory HKA `Fecha de vencimiento Secuencia inválida` (Code 145) for E32 - UNRESOLVED
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
