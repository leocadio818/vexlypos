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

## Completed Tasks (2026-04-05)

- **Light Mode Contrast Fix: Recipes Module (RecipesTab.jsx)** (DONE - 2026-04-06):
  - **Location**: Modal "Editar Receta" / Calculadora de Margen
  - **Issues Fixed**:
    - Costo/Precio Venta/Ganancia values invisible (white on white)
    - "% Margen Deseado" and "Precio de Venta" labels invisible
    - "Precio sugerido" cyan text invisible
    - Ingredient row unit labels ("% merma") invisible
    - IngredientSearchSelect dropdown text invisible
  - **Technical Implementation**:
    - Added `useTheme()` hook to RecipesTab.jsx
    - Created `isLightMode = isMinimalist && !isNeoDark` check
    - Applied inline styles with WebkitTextFillColor for Safari iOS
    - Passed `isLightMode` prop to IngredientSearchSelect component
  - **Colors Applied**:
    - Text: `#1E293B` (dark slate)
    - Muted: `#64748B` (slate gray)  
    - Cyan accent: `#0891B2` (replaces `text-cyan-400`)
    - Status colors preserved (red/amber/green for margin status)
  - **File**: `/app/frontend/src/pages/inventory/components/RecipesTab.jsx`

- **Light Mode Contrast Fix: Inventory Module** (DONE - 2026-04-06):
  - **BUG 1 - "Editar Insumo" Modal, "Conversión de Unidades" Section**:
    - All text inside this section was invisible in light mode (white text on white background)
    - **Fix**: Added explicit inline styles with `WebkitTextFillColor` for Safari iOS compatibility
    - Labels, values, select boxes, and descriptions now use dark theme-aware colors
    - Colors: Text `#1E293B`, Muted `#64748B`, Primary `#1D4ED8`, Success `#047857`
    - Backgrounds: Light gray `#F8FAFC`, Blue tint `#EFF6FF`, Green tint `#D1FAE5`
  - **BUG 2 - Stock Screen, Inventory Row**:
    - The "arroz blanco" row showed white text on light background
    - Stock Detallado column text and action button text were invisible
    - **Fix**: Added explicit inline styles for all table row content
    - Ingredient names, category labels, stock values, and "Diferencia" buttons now visible
    - Stock badges use appropriate contrast colors for low stock (red) and normal stock (green)
  - **Technical Implementation**:
    - Added `useTheme()` hook import from `@/context/ThemeContext`
    - Created `isLightMode = isMinimalist && !isNeoDark` check
    - Applied conditional `style={}` with explicit hex colors for light mode
    - Dark mode unchanged (uses existing Tailwind classes)
  - **Files Modified**:
    - `/app/frontend/src/pages/inventory/components/IngredientsTab.jsx`
    - `/app/frontend/src/pages/inventory/components/StockTab.jsx`
  - **Cross-Platform Verified**: Safari iOS 15+, Android Chrome, Desktop Chrome/Edge

- **🔒 CRITICAL BUG FIX: Mobile Decorator Panel JavaScript Error** (DONE - 2026-04-05 - **NO MODIFICAR**):
  - **Issue**: User reported app crashing on Safari iOS with error overlay: `"Can't find variable: setSelected"` in `handleClickOutside`
  - **Root Cause**: The `DraggableDecorator` component used `setIsSelected()` which didn't exist. The code had `setLocalSelected` for desktop and `onSelect` for mobile, but the `handleClickOutside` useEffect incorrectly called `setIsSelected`.
  - **Fix**: Updated `handleClickOutside` in `/app/frontend/src/pages/TableMap.js` (lines 205-230):
    - For mobile layout (`isMobileLayout`): calls `onSelect?.(null)` to deselect globally
    - For desktop: calls `setLocalSelected(false)` to deselect locally
    - Added dependency array to include `isMobileLayout` and `onSelect`
    - Added check to NOT deselect when clicking on `MobileDecoratorControlPanel`
  - **Also Fixed**: `handleSelect` function now uses the correct method based on `isMobileLayout`
  - **Verification**: App loads without JavaScript errors, decorator panel functions correctly
  - **⚠️ PROTEGIDO**: Este código NO debe modificarse sin autorización explícita del usuario
  - **File**: `/app/frontend/src/pages/TableMap.js` (lines 205-235)

- **Centro de Ayuda In-App + PDFs Descargables** (DONE):
  - Creada página `/help` con manuales interactivos por rol
  - Manual del Mesero: 10 secciones (inicio sesión, abrir mesa, tomar pedido, enviar cocina, etc.)
  - Manual del Cajero: 7 secciones (inicio turno, cobrar, formas de pago, tipos de factura, etc.)
  - Manual del Administrador: 7 secciones (gestión usuarios, jornada, productos, impresoras, etc.)
  - Manual del Gerente: 4 secciones (supervisión, autorizaciones, gestión equipo, reportes)
  - Secciones expandibles con pasos, notas, tips y alertas importantes
  - Soporte para modo claro y oscuro
  - Botón "Ayuda" agregado al menú de Opciones
  
- **Manuales PDF Descargables** (DONE):
  - Backend: `/app/backend/routers/manuales.py` con WeasyPrint para generación HTML→PDF
  - 4 endpoints: `GET /api/manuales/manual-waiter.pdf`, `manual-cashier.pdf`, `manual-admin.pdf`, `manual-manager.pdf`
  - PDFs profesionales: header con gradiente azul, secciones con iconos, pasos numerados, notas/tips/alertas
  - Formato carta (Letter), márgenes 2cm, numeración de páginas "Página X de Y"
  - Tamaños: Mesero (220KB), Cajero (156KB), Admin (154KB), Gerente (84KB)
  - Frontend: Botones "Descargar PDF" en Centro de Ayuda con URLs correctas
  - Files: `/app/backend/routers/manuales.py`, `/app/backend/server.py`, `/app/frontend/src/pages/Help.js`

- **Light Mode Contrast Fixes - Safari iOS Compatible** (DONE):
  - **PATRÓN OBLIGATORIO**: Usar `style={isMinimalist ? {...} : {}}` con `WebkitTextFillColor` para Safari iOS
  - **Modal "Funciones de Mesa"** (`Layout.js` líneas 802-847):
    - Botón "Dividir Cuenta": `bg: #F0FDF4`, `border: #22C55E`, `text: #166534`, `icon: #16A34A`
    - Botón "Anular Cuenta Entera": `bg: #FEF2F2`, `border: #EF4444`, `text: #991B1B`, `icon: #DC2626`
  - **Modal "Abrir Turno"** (`CashRegister.js` líneas 831-930):
    - Botón terminal "En uso": `bg: #FEE2E2`, `border: #EF4444`, `text: #991B1B` (bold)
    - Subtexto "En uso: Admin": `color: #B91C1C`, `fontSize: 12px`
    - Botón terminal disponible: `bg: #F3F4F6`, `border: #D1D5DB`, `text: #374151`
    - Botón terminal seleccionado: `bg: #FEF3C7`, `border: #F59E0B`, `text: #92400E`
  - **REGLA**: Siempre usar `WebkitTextFillColor` + `opacity: 1` para texto en modo claro Safari
  - **REGLA**: Modo oscuro usa clases Tailwind originales (sin cambios)
  - Files: `/app/frontend/src/components/Layout.js`, `/app/frontend/src/pages/CashRegister.js`

- **🔒 Table Map - LAYOUTS SEPARADOS Mobile vs Desktop** (DONE - TESTED - **NO MODIFICAR**):
  - **Feature (2026-04-05)**: Layouts independientes para móvil (<768px) y desktop (≥768px)
  - **Comportamiento**:
    - **Desktop/Tablet (≥768px)**: Usa el layout original con posiciones y decoradores de la BD
    - **Mobile (<768px)**: Layout completamente independiente
      - Por defecto: Grid de 3 columnas SIN decoradores
      - Admin puede configurar posiciones y decoradores desde móvil
      - Cambios en móvil NO afectan desktop y viceversa
  - **Almacenamiento**:
    - `map_layouts` collection en MongoDB con `{area_id, device_type, tables, decorators}`
    - Desktop: usa tablas y decoradores directamente de `tables` y `map_decorators`
    - Mobile: usa `map_layouts` con `device_type: 'mobile'`
  - **API Endpoints**:
    - `GET /api/layouts/{area_id}/{device_type}` - Obtiene layout
    - `PUT /api/layouts/{area_id}/{device_type}` - Guarda layout
    - `DELETE /api/layouts/{area_id}/{device_type}` - Elimina layout (revierte a default)
  - **Detección automática**: `window.innerWidth < 768` determina el modo
  - **Implementación**:
    - Backend: `/app/backend/routers/tables.py` líneas 115-175 (CRUD layouts)
    - Frontend: `/app/frontend/src/pages/TableMap.js` (layoutMode state, fetchData, handlers)
    - API: `/app/frontend/src/lib/api.js` (layoutsAPI)
  - **Testeado**: 
    - Desktop 1280px ✅ Layout original sin cambios
    - iPad 768px ✅ Layout original (≥768 = desktop)
    - Safari iOS 390px ✅ Grid default sin decoradores
    - Android 412px ✅ Grid default sin decoradores
  - **⚠️ PROTEGIDO**: Este código NO debe modificarse sin autorización explícita del usuario
  - **Files**: `/app/frontend/src/pages/TableMap.js`, `/app/backend/routers/tables.py`, `/app/frontend/src/lib/api.js`

- **🔒 Map Decorators - Responsive System** (DONE - TESTED - **NO MODIFICAR**):
  - **Feature**: Elementos decorativos para simular el layout físico del restaurante (paredes, muebles, barra, columnas)
  - **Tipos de decoradores**: Línea horizontal, línea vertical, rectángulo, círculo, texto
  - **Sistema de coordenadas (2026-04-05)**:
    - Posiciones: Porcentajes del canvas (igual que mesas)
    - Tamaños: Porcentajes convertidos a "píxeles de referencia" (REF_WIDTH=1200, REF_HEIGHT=700) y luego escalados con `getScale()`
    - Z-index: 0 en modo normal (detrás de mesas), 10-100 en modo edición
  - **LIMITACIÓN CONOCIDA**: En móviles, las mesas tienen tamaños mínimos (45x42px) que pueden superponerse a decoradores cercanos. Los decoradores quedan visualmente "detrás" de las mesas en estos casos. **Solución**: Diseñar layouts con espacio suficiente entre mesas y decoradores, o editar decoradores desde el dispositivo móvil.
  - **Implementación**:
    - Backend: `/app/backend/routers/tables.py` líneas 62-112 (CRUD decoradores)
    - Frontend: `/app/frontend/src/pages/TableMap.js` líneas 40-330 (DraggableDecorator)
    - Frontend: `/app/frontend/src/pages/TableMap.js` líneas 850-880 (DecoratorToolbar fuera del canvas)
    - API: `/app/frontend/src/lib/api.js` (decoratorsAPI)
  - **Funcionalidad CRÍTICA (NO TOCAR)**:
    - `pointerEvents: 'auto'` y `zIndex: 9999` en botones delete/color/edit-text
    - `e.stopPropagation()` + `e.preventDefault()` en todos los onClick
    - Toolbar renderizada FUERA del canvas (no flotante sobre mesas)
    - Click para seleccionar → aparecen botones delete 🗑, color 🎨, resize ↗
    - **Botón "T" azul** para editar texto (solo aparece en decoradores tipo texto)
  - **Almacenamiento**: Porcentajes por área (igual que mesas)
  - **Testeado**: Safari iOS 390px ✅, Android 412px ✅, Desktop 1280px ✅
  - **⚠️ PROTEGIDO**: Este código NO debe modificarse sin autorización explícita del usuario
  - **Files**: `/app/frontend/src/pages/TableMap.js`, `/app/backend/routers/tables.py`

## Completed Tasks (2026-04-04)
- **Light Mode Contrast Audit Fix** (DONE):
  - Added 164+ CSS rules with `:not(.neo-dark)` selector to fix light mode only
  - Converts bg-slate-9/8, bg-gray-9/8, bg-zinc-9/8 to var(--neo-bg) in light mode
  - Forces text to hsl(var(--foreground)) inside converted containers
  - Preserves white text in colored buttons (primary, gradient, red, green, orange)
  - Makes borders visible with hsl(var(--border)) instead of transparent
  - Dark mode completely unchanged
  - File: `/app/frontend/src/styles/theme-minimalist.css`

- **PWA iPhone Safe Area Fixes - GLOBAL** (DONE - VERIFIED IN PRODUCTION):
  - **GLOBAL FIX**: Applied `safe-area-top` and `safe-area-bottom` (mobile) to Layout.js `<main>` container (Line 630)
  - This makes ALL screens automatically inherit safe areas without needing individual fixes
  - Mobile nav already has `safe-area-bottom` (Line 323)
  - CSS: Uses `env(safe-area-inset-top/bottom)` for iPhone notch/home indicator
  - manifest.json: `orientation: "portrait"`, `theme_color: "#0c0f1e"`
  - Files: `Layout.js`, `App.css`, `manifest.json`, `index.html`
  - **IMPORTANT**: For new screens, they will automatically inherit safe areas from Layout

- **Root URL Redirect Fix** (DONE):
  - Problem: vexlyapp.com showed blank white page
  - Fix: Added explicit redirect in App.js: "/" → "/login" (unauthenticated) or "/dashboard" (authenticated)
  - Shows loading spinner while checking auth state
  - File: `/app/frontend/src/App.js`

- **Account Naming for ALL Tables** (DONE): 
  - Added "Editar Nombre" button in "Funciones de Mesa" modal (Layout.js lines 808-813)
  - Works for BOTH single and split tables (not just split tables)
  - Name appears on: Comandas (kitchen/bar), Pre-cuenta (customer check)
  - Name does NOT appear on: Facturas fiscales, e-CF, DGII documents
  - Files: `Layout.js`, `OrderScreen.js`

- **Enhanced Comanda Headers** (DONE):
  - Added area_name, account_display, account_label, waiter_name to all comandas
  - Format: "ÁREA: TERRAZA | Mesa 3 | Cuenta #2 — María | Mesero: Admin | 04/04/2026"
  - Applied to: Food comandas, Bar comandas, Cancel tickets, Pre-cuenta
  - Files: `orders.py` (send_comanda_to_print_queue, send_cancel_ticket_to_print_queue), `server.py` (pre-check)

- **Kitchen/Bar Print Commands First Exit Bug Fix** (DONE): Fixed critical bug where comandas were NOT sent to kitchen/bar on FIRST exit from order screen. Only worked on SECOND exit.
  - Root cause: `tableOrdersRef.current` was empty when a new order was created, so `sendPendingToKitchenSilently` couldn't find orders to send.
  - Fix 1: Updated useEffect (lines 261-283 in OrderScreen.js) to handle empty ref initialization and new orders not yet in ref
  - Fix 2: Added fallback to `orderRef.current` in `sendPendingToKitchenSilently` (lines 467-471) when `tableOrdersRef` is empty
  - Fix 3: Added same fallback pattern in navigation intercept useEffect (lines 503-507)
  - Verified by testing_agent_v3_fork - Backend API correctly changes item status from 'pending' to 'sent' on first call
  - Files: `/app/frontend/src/pages/OrderScreen.js`

- **The Factory HKA Error Handling Improvements** (DONE):
  - Modified `build_thefactory_payload` to OMIT `fechaVencimientoSecuencia` field entirely when `None` instead of sending `null` (fixes Code 145)
  - Added error hints for common codes (111, 145, 110, 112) in `send_to_thefactory` response
  - Added `sync_ncf_counters()` function to sync local NCF counters with The Factory series
  - Added `get_series_info()` function for NCF diagnostics
  - New endpoints: `POST /api/system/ecf/sync-ncf-counters`, `GET /api/system/ecf/series-info`
  - Files: `/app/backend/routers/thefactory.py`, `/app/backend/routers/config.py`

- **Smart Notification System** (DONE): Complete replacement of old toast/notification system with context-aware notifications:
  - SUCCESS (green #22C55E) → Bottom Sheet, auto-dismiss 3s
  - WARNING (amber #F59E0B) → Bottom Sheet, auto-dismiss 5s
  - ERROR/FISCAL (red) → Centered Modal, requires "Entendido" button
  - CONFIRMATION (blue) → Centered Modal, Cancel/Confirm buttons
  - Cross-platform: Safari iOS 15+, Android Chrome, Windows Chrome/Edge, iPad
  - Files: `/app/frontend/src/components/SmartNotificationSystem.jsx`, `/app/frontend/src/lib/notify.js`
  - Removed: `BottomSheetNotification.jsx`, Sonner Toaster from KitchenTV

- **E34 Authorization Fix** (DONE): Fixed credit note authorization logic in `/app/backend/routers/credit_notes.py`. Previously only checked for exact role names "admin"/"manager". Now checks `role_level >= 40` OR role in ["admin", "manager", "supervisor"]. This allows custom roles like "gerente" (level 60) and "administrador" (level 80) to create E34 with `requires_authorization` reasons without needing extra approval.

- **Jornada Modal Safari iOS Fixes** (DONE): Fixed 4 UI bugs in BusinessDayManager.jsx:
  - BUG 1: Text invisible - Applied explicit colors: White (#FFFFFF) for title, gray (#D1D5DB) for date
  - BUG 2: Horizontal scroll - Buttons now stack vertically on mobile (`flex-col sm:flex-row`)
  - BUG 3: X button misaligned - Fixed in dialog.jsx with inline styles: top:12px, right:12px, circular background
  - BUG 4: Modal cut off - Added max-height and overflow-y-auto with WebkitOverflowScrolling
  - Files: `/app/frontend/src/components/BusinessDayManager.jsx`, `/app/frontend/src/components/ui/dialog.jsx`, `/app/frontend/src/components/Layout.js`

- **e-CF Dashboard Jornada Filter Fix** (DONE): Fixed "Jornada" filter showing transactions from previous days.
  - Problem: Filter was using calendar date instead of actual business day ID
  - Solution: Added `business_day_id` parameter to `/api/ecf/dashboard` endpoint
  - Backend changes: `/app/backend/routers/ecf_dispatcher.py` (line 400) - added business_day_id query param
  - Backend changes: `/app/backend/routers/business_days.py` - `/active-date` now returns `id` and `opened_at`
  - Frontend changes: `/app/frontend/src/pages/Reports.js` - stores activeBusinessDayId and passes to e-CF dashboard

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

### Light Mode Fix Pattern (Safari iOS)
Para cualquier botón/texto invisible en modo claro, usar este patrón:
```jsx
<button
  style={isMinimalist ? {
    backgroundColor: '#COLORHEX',
    border: '1.5px solid #COLORHEX'
  } : {}}
  className={`...base-classes ${!isMinimalist ? 'dark-mode-tailwind-classes' : 'hover:opacity-80'}`}
>
  <Icon style={isMinimalist ? { color: '#COLORHEX' } : {}} className={!isMinimalist ? 'text-color-class' : ''} />
  <span style={isMinimalist ? { color: '#HEX', WebkitTextFillColor: '#HEX', opacity: 1 } : {}}>
    Texto
  </span>
</button>
```
**Paleta de colores modo claro:**
- Verde (success): bg `#F0FDF4`, border `#22C55E`, text `#166534`, icon `#16A34A`
- Rojo (danger): bg `#FEF2F2`, border `#EF4444`, text `#991B1B`, icon `#DC2626`
- Rojo (en uso): bg `#FEE2E2`, border `#EF4444`, text `#991B1B`
- Amber (selected): bg `#FEF3C7`, border `#F59E0B`, text `#92400E`
- Gray (default): bg `#F3F4F6`, border `#D1D5DB`, text `#374151`

---

## 🔒 CÓDIGO PROTEGIDO - NO MODIFICAR SIN AUTORIZACIÓN

Los siguientes componentes/funcionalidades están **BLOQUEADOS** y NO deben ser modificados sin autorización explícita del usuario:

### 1. 🔒 Table Map Responsive Layout (`/app/frontend/src/pages/TableMap.js`)
- **Líneas 788-845**: Cálculo de `containerSize` con aspect ratio 16:10 UNIVERSAL
- **Comportamiento**:
  - **TODOS los dispositivos**: Aspect ratio 16:10 para consistencia de coordenadas
  - Móviles: Altura mínima 400px, scroll habilitado si necesario
  - Desktop/Tablet: Centrado absoluto en contenedor
- **Líneas 536-566**: Posicionamiento de mesas con tamaños mínimos (45x42px móvil, 55x50px tablet)
- **Razón**: Garantiza que mesas Y decoradores usen el MISMO sistema de coordenadas
- **Fecha de protección**: 2026-04-05
- **Testeado en**: Safari iOS 390px ✅, Android 412px ✅, Desktop 1280px ✅

### 2. 🔒 Map Decorators Sistema Unificado (`/app/frontend/src/pages/TableMap.js` + `/app/backend/routers/tables.py`)
- **Líneas 40-85**: `DraggableDecorator` con sistema de coordenadas unificado
  - `REF_WIDTH=1200, REF_HEIGHT=700` como canvas de referencia
  - Posiciones: % del canvas (igual que mesas)
  - Tamaños: % → píxeles de referencia → escalado con `getScale()`
  - Z-index: 0 (detrás de mesas en modo normal), 10-100 (modo edición)
- **Líneas 191-230**: `renderContent()` con grosor de líneas responsivo
- **Líneas 233-255**: Contenedor con z-index y opacidad configurados
- **Backend líneas 62-112**: CRUD de decoradores
- **Configuración CRÍTICA**:
  - `pointerEvents: 'auto'` y `zIndex: 9999` en botones (delete, color, edit-text)
  - `e.stopPropagation()` + `e.preventDefault()` en onClick
  - Decoradores SIEMPRE detrás de mesas (z-index: 0) en modo normal
  - **Botón "T" azul** para editar texto
- **LIMITACIÓN CONOCIDA**: En móviles, mesas con tamaño mínimo pueden cubrir decoradores cercanos. Diseñar con espacio suficiente.
- **Razón**: Sistema de coordenadas unificado entre mesas y decoradores
- **Fecha de protección**: 2026-04-05
- **Testeado en**: Safari iOS 390px ✅, Android 412px ✅, Desktop 1280px ✅

### 3. 🔒 Light Mode Contrast Fixes
- **Archivos**: `CashRegister.js`, `Layout.js`, `PaymentScreen.js`, `theme-minimalist.css`
- **Razón**: Contraste legible en modo claro
- **Fecha de protección**: 2026-04-05

### 4. 🔒 Dashboard Zombie Tables Filter (`/app/backend/routers/reports.py`)
- **Filtro**: Excluye mesas con 0 items, RD$0, >12 horas
- **Razón**: Dashboard muestra solo mesas activas reales
- **Fecha de protección**: 2026-04-05
