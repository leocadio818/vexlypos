# POS Restaurant System - Dominican Republic

## Original Problem Statement
Full-stack POS application for DR restaurants. React + FastAPI + MongoDB. Multi-tenant, RBAC, printer integration, DGII compliance.

## 🔒 PERMANENT ARCHITECTURAL RULES - NEVER MODIFY

### Business Date Rule (Locked Forever)

**This rule applies to EVERY file, module, and future feature in this system FOREVER.**

1. **JORNADA DATE (Fiscal/Business Date)**
   - ALWAYS taken from the active `business_day` document in MongoDB
   - NEVER from system clock or `datetime.now()`
   - Used for: ALL reports, ALL filters, ALL groupings, ALL audit logs, ALL dashboard numbers, ALL shift reports, inventory movements

2. **PRINT TIMESTAMP (Clock Time)**
   - ALWAYS the real system clock time
   - Used ONLY for: printed documents (facturas, comandas, receipts)

3. **These are TWO SEPARATE concepts that must NEVER be mixed or confused**

4. **ANY future change** that touches date logic, report filters, audit logs, or dashboard totals **MUST respect this rule without exception**

5. **If a future fix seems to require changing this logic — STOP and ask the user first before touching anything**

**Files with protected business date logic:**
- `/app/backend/utils/timezone.py` - `get_jornada_date()`, `get_jornada_date_with_fallback()`
- `/app/backend/utils/audit.py` - `jornada_date` field in all audit logs
- `/app/backend/routers/reports.py` - `in_date_range()` helper, system-audit endpoint
- `/app/backend/routers/billing.py` - `business_date` assignment in pay endpoint
- `/app/backend/routers/auth.py` - Auto-open jornada with local TZ date

**Look for comment:** `# 🔒 DO NOT MODIFY - Business date rule`

---

### e-NCF Display Rule (Locked Forever) — Added 2026-04-09

**This rule applies to EVERY file, module, and future feature in this system FOREVER.**

1. **ecf_encf (E31, E32, E34 format) — THE VISIBLE NUMBER**
   - ALWAYS the number shown to users in:
     - All screens and UI
     - All reports (including Discounts Report, Audit logs, etc.)
     - All audit logs (system-audit, bill payments, etc.)
     - All printed documents (receipts, tickets, facturas)
     - Any other visible output
   - This is the official DGII fiscal document number

2. **ncf (B01 format) — INTERNAL DATABASE REFERENCE ONLY**
   - NEVER shown to users anywhere
   - NEVER shown in reports
   - NEVER shown in audit logs
   - Used ONLY internally for MongoDB record linking
   - This is the internal sequence counter, not for display

3. **Pattern to use when displaying invoice numbers:**
   ```python
   # 🔒 DO NOT MODIFY - e-NCF display rule
   display_ncf = bill.get("ecf_encf") or bill.get("ncf", "-")
   ```

4. **ANY future feature or fix that displays an invoice number MUST use ecf_encf — never ncf**

5. **If a future fix seems to require showing ncf/B01 anywhere visible — STOP and ask the user first before implementing**

**Files with protected e-NCF display logic:**
- `/app/backend/routers/billing.py` - `audit_ncf` in log_bill_paid
- `/app/backend/routers/reports.py` - `display_ncf` in discounts report
- `/app/backend/server.py` - `bill_number` in receipt printing

**Look for comment:** `# 🔒 DO NOT MODIFY - e-NCF display rule`

---

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

## Completed Tasks (2026-04-07)

- **🔒 Area-Based Print Channel Routing - BUG FIX** (DONE - 2026-04-07):
  - **BUG**: "Error guardando asignaciones" al intentar guardar configuración de impresión por área
  - **Root Cause**: El endpoint `/api/auth/me` estaba mal configurado. El decorador `@router.get("/auth/me")` existía pero NO tenía función asociada (la función `get_me()` estaba definida más abajo sin decorador). Esto causaba error 422 cuando la app verificaba la sesión.
  - **Fix Applied**: Asocié la función `get_me()` directamente al decorador del endpoint en `/app/backend/routers/auth.py` (líneas 296-307)
  - **Resultado**: Flujo completo probado (Login → Config → Impresión → Por Área → Guardar) - Toast verde "Asignaciones por área guardadas" aparece correctamente
  - **⚠️ PROTEGIDO**: Esta funcionalidad está BLOQUEADA - ver sección CÓDIGO PROTEGIDO

- **🔒 Modal "Turno de Caja Requerido" - Light Mode Fix** (DONE - 2026-04-07):
  - **BUG**: Texto invisible (blanco sobre fondo claro) en el warning box del modal en modo Minimalist
  - **Archivo**: `/app/frontend/src/components/Layout.js` (líneas 657-737)
  - **Fix Applied**: Estilos condicionales con `isMinimalist && !isNeoDark` usando colores oscuros legibles:
    - Modal fondo: `bg-white`
    - Textos: `#1E293B` (títulos), `#64748B` (descripciones)
    - Warning box: Fondo `#FEF2F2`, texto `#991B1B`
  - **Modo oscuro**: Sin cambios
  - **⚠️ PROTEGIDO**: Este fix está BLOQUEADO - ver sección CÓDIGO PROTEGIDO

- **🔒 Clear Service Worker Cache on Logout** (DONE - 2026-04-07):
  - **Feature**: Limpia todos los caches del Service Worker al cerrar sesión
  - **Archivo**: `/app/frontend/src/context/AuthContext.js` (líneas 245-252)
  - **Propósito**: Asegura datos frescos del servidor en cada nuevo login
  - **Compatibilidad**: Safari iOS 15+, Android Chrome, Windows Chrome/Edge, iPad Safari
  - **⚠️ PROTEGIDO**: Esta feature está BLOQUEADA - ver sección CÓDIGO PROTEGIDO

- **🔒 Marketing Email to Customers** (DONE - 2026-04-07):
  - **Feature**: Enviar emails de marketing a todos los clientes con email
  - **Backend**: `/app/backend/routers/email.py` (endpoints send-marketing, preview)
  - **Frontend**: `/app/frontend/src/pages/Customers.js` (botón Email + modal)
  - **Template**: HTML profesional con logo, productos destacados, footer
  - **Verificado**: Desktop ✅, Móvil ✅, Light/Dark mode ✅, Envío real ✅
  - **⚠️ PROTEGIDO**: Esta feature está BLOQUEADA - ver sección CÓDIGO PROTEGIDO

- **🔒 Modal Jornada - Light Mode Visibility Fix** (DONE - 2026-04-07):
  - **Bugs corregidos**: Tarjetas de stats invisibles, iconos invisibles, botón historial invisible
  - **Archivo**: `/app/frontend/src/components/BusinessDayManager.jsx`
  - **Fix**: Bordes en tarjetas + `stroke` explícito en iconos Lucide para Safari
  - **Verificado**: 4 iconos de stats visibles, botón historial visible, modo oscuro sin cambios
  - **⚠️ PROTEGIDO**: Este fix está BLOQUEADO - ver sección CÓDIGO PROTEGIDO

## Completed Tasks (2026-04-05)

- **Area-Based Print Channel Routing** (DONE - 2026-04-06):
  - **Feature**: Admins can now configure which printer receives comandas based on the AREA where the table is located, not just the product category
  - **Routing Priority**:
    1. Product-specific `print_channels[]` (highest priority, existing)
    2. Area's configured channel for that category (NEW)
    3. Global `category_channels` fallback (lowest priority, existing)
  - **Backend Changes**:
    - New collection `area_channel_mappings` in MongoDB
    - New endpoints in `/app/backend/server.py`:
      - `GET /api/area-channel-mappings` - List all mappings
      - `GET /api/area-channel-mappings/{area_id}` - Get mappings for specific area
      - `POST /api/area-channel-mappings` - Create single mapping
      - `PUT /api/area-channel-mappings/bulk` - Bulk update mappings
      - `DELETE /api/area-channel-mappings/{area_id}/{category_id}` - Delete specific mapping
      - `DELETE /api/area-channel-mappings/area/{area_id}` - Delete all area mappings
    - Modified routing logic in `/app/backend/routers/orders.py` (lines 1226-1260)
  - **Frontend Changes**:
    - New "Por Área" tab in Ajustes → Impresión (`PrinterSettings.jsx`)
    - Shows all areas with configurable channel dropdowns per category
    - "Usar global" option to fall back to global category channel
    - Explanation card showing routing priority
  - **Backward Compatibility**: Areas without configuration use global channels
  - **Files Modified**:
    - `/app/backend/server.py` - New CRUD endpoints
    - `/app/backend/routers/orders.py` - Routing logic
    - `/app/frontend/src/pages/settings/PrinterSettings.jsx` - Admin UI

- **🔒 Shift/Day Closing Flow Fixes** (DONE - 2026-04-06 - **NO MODIFICAR**):
  - **BUG 1 - "Cierre de Turno" White Screen on Safari iOS**:
    - Added CSS fixes in `theme-minimalist.css` for Safari iOS dialog rendering
    - Uses `-webkit-transform`, `-webkit-backface-visibility`, and `transform-style: preserve-3d`
    - Forces correct backdrop rendering on Safari iOS
  - **BUG 2 - "Cierre de Día" allowed without closing active shifts**:
    - Added new backend endpoint `GET /api/pos-sessions/open-shifts` to check for ALL open shifts
    - Added frontend validation `handleOpenCloseDayDialog()` that checks for open shifts before allowing Cierre Z
    - Added warning dialog showing which shifts are still open with message "Debes cerrar el turno activo antes de cerrar el día"
  - **Files Modified**:
    - `/app/backend/routers/pos_sessions.py` - New endpoint for checking open shifts (lines 708-732)
    - `/app/frontend/src/lib/api.js` - Added `openShifts()` API call
    - `/app/frontend/src/pages/CashRegister.js` - Added validation and warning dialog
    - `/app/frontend/src/styles/theme-minimalist.css` - Safari iOS dialog fixes (lines 870-895)
  - **⚠️ PROTEGIDO**: Este código NO debe modificarse sin autorización explícita del usuario

- **🔒 Light Mode Contrast Fix: Recipes Module (RecipesTab.jsx + CSS)** (DONE - 2026-04-06 - **NO MODIFICAR**):
  - **Location**: Modal "Editar Receta" / Calculadora de Margen
  - **Issues Fixed**:
    - Título "Calculadora de Margen" invisible (blanco sobre fondo claro)
    - Costo/Precio Venta/Ganancia values invisible
    - "% Margen Deseado" and "Precio de Venta" labels invisible
    - "Precio sugerido" cyan text invisible
    - Ingredient row unit labels ("% merma") invisible
    - IngredientSearchSelect dropdown text invisible
  - **Technical Implementation**:
    - Added CSS rules in `/app/frontend/src/styles/theme-minimalist.css` (lines 815-870)
    - Uses `!important` to override aggressive theme-minimalist styles
    - Targets `[data-testid="margin-calculator"]` and `[data-testid^="recipe-ingredient-"]`
  - **Colors Applied**:
    - Title/Headers: `#1e293b` (dark slate)
    - Input text: `#1e293b`
    - Labels/Muted: `#64748b` (slate gray)
    - Cyan accent: `#0891b2`
  - **Files Modified**:
    - `/app/frontend/src/styles/theme-minimalist.css` (CSS rules for light mode)
    - `/app/frontend/src/pages/inventory/components/RecipesTab.jsx` (data-testid attributes)
  - **⚠️ PROTEGIDO**: Este código NO debe modificarse sin autorización explícita del usuario

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

### 5. 🔒 Impresión por Área - Area-Based Print Channel Routing (2026-04-07)
- **Archivos Backend**:
  - `/app/backend/server.py` (líneas 830-900): Endpoints CRUD para `area_channel_mappings`
    - `GET /api/area-channel-mappings` - Lista todas las asignaciones
    - `PUT /api/area-channel-mappings/bulk` - Actualización masiva
  - `/app/backend/routers/orders.py` (líneas 1226-1260): Lógica de enrutamiento de impresión
  - `/app/backend/routers/auth.py` (líneas 296-307): Endpoint `/auth/me` corregido
- **Archivos Frontend**:
  - `/app/frontend/src/pages/settings/ChannelsTab.js`: UI completa con tabs "Canales" y "Por Área"
- **Funcionalidad**:
  - Configura qué impresora recibe las comandas según el **área** de la mesa
  - **Prioridad de enrutamiento**:
    1. Canal específico del producto (más alta)
    2. Canal del área para esa categoría (NUEVO)
    3. Canal global de la categoría (más baja)
  - Dropdown "Usar global" para usar el canal global de la categoría
  - Badge "X personalizadas" muestra cuántas categorías tienen canal específico por área
- **Compatibilidad**: Safari iOS ✅, Android Chrome ✅, Desktop ✅
- **Razón de protección**: Funcionalidad compleja de enrutamiento de impresión probada y validada
- **Fecha de protección**: 2026-04-07

### 6. 🔒 Modal "Turno de Caja Requerido" - Light Mode Fix (2026-04-07)
- **Archivo**: `/app/frontend/src/components/Layout.js` (líneas 657-737)
- **Bug corregido**: Texto invisible (blanco sobre fondo claro) en modo Minimalist (Light Mode)
- **Elementos corregidos**:
  - Fondo modal: `bg-white` en modo claro
  - Título: `#1E293B` (slate oscuro)
  - Descripción: `#64748B` (gris)
  - Warning box: Fondo `#FEF2F2`, borde `#FECACA`, texto `#991B1B`
  - Info box: Fondo `#F8FAFC`, borde `#E2E8F0`, texto `#64748B`
  - Botón "Cerrar Sesión": `border-slate-300 text-slate-700`
- **Patrón usado**: `isMinimalist && !isNeoDark` con `style={{}}` + `WebkitTextFillColor` para Safari iOS
- **Modo oscuro**: Sin cambios, mantiene estilos originales (`bg-slate-900`, `text-white`, etc.)
- **Razón de protección**: Fix crítico de accesibilidad en modo claro
- **Fecha de protección**: 2026-04-07

### 7. 🔒 Clear Service Worker Cache on Logout (2026-04-07)
- **Archivo**: `/app/frontend/src/context/AuthContext.js` (líneas 245-252)
- **Funcionalidad**: Limpia todos los caches del Service Worker cuando el usuario cierra sesión
- **Código**:
  ```javascript
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
  }
  ```
- **Momento de ejecución**: ANTES de eliminar el token y redirigir al login
- **Compatibilidad**: Safari iOS 15+, Android Chrome, Windows Chrome/Edge, iPad Safari
- **Propósito**: Asegura que cada login inicie con datos frescos del servidor, no datos cacheados obsoletos
- **Razón de protección**: Feature crítica para evitar datos stale después de logout
- **Fecha de protección**: 2026-04-07

### 8. 🔒 Marketing Email to Customers (2026-04-07)
- **Archivos Backend** (`/app/backend/routers/email.py`):
  - `POST /api/email/send-marketing` - Envía email a todos los clientes con email válido
  - `POST /api/email/send-marketing/preview` - Vista previa del email sin enviar
  - `build_marketing_html()` - Template HTML profesional con branding
- **Archivos Frontend** (`/app/frontend/src/pages/Customers.js`):
  - Botón "Email" en header (solo admin)
  - Modal completo con campos Asunto, Mensaje, Productos opcionales
  - Vista previa en iframe
  - Confirmación antes de enviar
- **Funcionalidad**:
  - Envía emails marketing a clientes con email registrado
  - Template profesional: Header naranja con logo, productos destacados, footer con unsubscribe
  - Usa Resend existente (facturas@vexlyapp.com)
  - Soporte para lista de productos con precios
- **Compatibilidad**: Safari iOS 15+, Android Chrome, Windows Chrome/Edge, iPad Safari
- **Modo claro/oscuro**: Soportado con estilos condicionales `isLightMode`
- **Razón de protección**: Feature de marketing completa y probada
- **Fecha de protección**: 2026-04-07

### 9. 🔒 Modal Jornada - Light Mode Visibility Fix (2026-04-07)
- **Archivo**: `/app/frontend/src/components/BusinessDayManager.jsx`
- **Bugs corregidos**:
  1. **Tarjetas de stats invisibles**: Agregado `border border-{color}-200 shadow-sm` a los fondos
  2. **Iconos de stats invisibles**: Agregado `stroke: colors.stat{X}` a cada icono (TrendingUp, Banknote, CreditCard, FileText)
  3. **Botón de historial invisible**: Agregado `borderWidth: '2px'`, `borderColor: '#6B7280'`, `backgroundColor: '#F3F4F6'`, y `stroke: colors.historyBtn` al icono History
- **Colores de iconos en modo claro**:
  - Ventas: `#166534` (Green 800)
  - Efectivo: `#065F46` (Emerald 800)
  - Tarjeta: `#1E40AF` (Blue 800)
  - Facturas: `#0E7490` (Cyan 700)
  - Historial: `#1F2937` (Gray 800)
- **Modo oscuro**: Sin cambios, mantiene estilos originales
- **Razón de protección**: Fix crítico de visibilidad en modo claro
- **Fecha de protección**: 2026-04-07

## Completed Tasks (2026-04-08)

- **🔒 LOCKED: Remove Delete Button from Custom Roles** (DONE - 2026-04-09):
  - **Change**: Removed the delete (trash) button from all custom role cards in "Seleccionar Puesto" section
  - **Reason**: Deleting a role could affect users who have that role assigned, causing data integrity issues
  - **File protected**: `/app/frontend/src/pages/UserConfig.js`
  - **What stays**: Edit (pencil) button, "+ Crear Puesto" button
  - **What removed**: Trash button, axios.delete call for roles
  - **Protection marker**: `🔒 DO NOT MODIFY - Role delete protection`
  - **Cross-platform**: Safari iOS 15+, Android Chrome, Desktop Chrome/Edge, iPad Safari
  - **Fecha de protección**: 2026-04-09

- **🔒 CRITICAL: Jornada Date vs Calendar Date Architecture** (DONE - 2026-04-08):
  - **Problem**: System was mixing fiscal/business date (jornada) with calendar/clock date
  - **Business Rule Implemented**:
    - **Jornada Date**: Used for ALL reports, filters, groupings, audit logs, dashboard
    - **Print Timestamp**: Used ONLY for printed documents (facturas, receipts)
  - **Changes**:
    - Added `get_jornada_date()` and `get_jornada_date_with_fallback()` helpers to `/app/backend/utils/timezone.py`
    - Modified `/app/backend/utils/audit.py` to include `jornada_date` field in all audit logs
    - Updated `/app/backend/routers/reports.py` system-audit endpoint to filter by `jornada_date`
    - Uses helper `in_date_range()` that prioritizes jornada_date over created_at
  - **Testing verified**:
    - Desktop (1920px): Dashboard shows "JORNADA ACTIVA: 2026-04-07" ✅
    - Mobile Safari iOS (390px): Jornada badge visible ✅
    - Desktop Light mode (1280px): All elements visible ✅
    - Events from 01:38 AM Apr 8 correctly belong to jornada Apr 7 ✅
  - **Cross-platform**: Safari iOS 15+, Android Chrome, Desktop Chrome/Edge
  - **Fecha de protección**: 2026-04-08

- **🔒 Bug Fix: Timezone - Business Date One Day Ahead** (DONE - 2026-04-08):
  - **Bug**: El sistema mostraba "miércoles 8 de abril" cuando era martes 7 de abril
  - **Causa raíz**: En `auth.py`, al auto-abrir la jornada durante el login, usaba `datetime.now(timezone.utc)` para calcular `business_date` en lugar de usar la zona horaria local de República Dominicana
  - **Solución**: 
    - Modificado `/app/backend/routers/auth.py` para usar `ZoneInfo("America/Santo_Domingo")` al calcular `business_date`
    - Corregido el `business_date` de la jornada activa de 2026-04-08 a 2026-04-07
  - **Testing**: Screenshot confirmó "JORNADA ACTIVA: 2026-04-07" en Dashboard
  - **Fecha de protección**: 2026-04-08

- **🔒 Bug Fix: Table Map Status for Merged Orders** (DONE - 2026-04-08):
  - **Bug**: Mesas 3 y 5 aparecían en azul (libre) aunque tenían órdenes abiertas
  - **Causa raíz**: El filtro de órdenes solo buscaba `status: ["active", "sent"]` pero ignoraba `status: "merged"` (cuentas divididas)
  - **Solución**: Cambiar filtro a `status: {"$nin": ["closed", "paid", "cancelled"]}` para capturar TODAS las órdenes no cerradas
  - **Archivo modificado**: `/app/backend/routers/tables.py` línea 178
  - **Testing**: Screenshot confirmó:
    - Mesa 1: Naranja (dividida) ✅
    - Mesa 2: Naranja (dividida) ✅
    - Mesa 3: Rojo (occupied) ✅
    - Mesa 5: Rojo (occupied) ✅
  - **Fecha de protección**: 2026-04-08

- **🔒 Bug Fix: Table Map Status Colors** (DONE - 2026-04-08):
  - **Bug**: El mapa de mesas mostraba todas las mesas en azul/libre aunque había órdenes activas
  - **Causa raíz**: El endpoint `/api/tables` dependía del campo `table.status` almacenado en DB, el cual podía desincronizarse de las órdenes reales
  - **Solución**: Modificado `/api/tables` para calcular el status dinámicamente basado en órdenes activas (`status: active|sent`)
  - **Archivo modificado**: `/app/backend/routers/tables.py` (función `list_tables`)
  - **Comportamiento actual**:
    - Mesa sin órdenes activas → `status: free` (azul)
    - Mesa con 1 orden activa → `status: occupied` (rojo si es mi mesa, amarillo si es de otro)
    - Mesa con 2+ órdenes activas → `status: divided` (naranja)
    - Mesa con reservación activa → `status: reserved` (morado)
  - **Testing**: Screenshot confirmó colores correctos (Mesa 1 en rojo con orden activa)
  - **Razón de protección**: Fix crítico de UX para operación del restaurante
  - **Fecha de protección**: 2026-04-08

- **🔒 Sistema de Auditoría General Completo** (DONE - 2026-04-08):
  - **Feature**: Sistema de auditoría centralizado para tracking de todas las acciones críticas del sistema
  - **Bug Fixed**: Eventos no aparecían en reporte debido a:
    1. `auth.py` importaba `db` de `models/database.py` en lugar de usar `set_db()` patrón
    2. `config.py` tenía endpoint duplicado de productos sin auditoría
  - **Archivos creados/modificados**:
    - `/app/backend/utils/audit.py` (NUEVO) - Función central `log_audit_event()` y helpers
    - `/app/backend/routers/auth.py` - Cambiado a patrón set_db, logging de login/logout
    - `/app/backend/routers/config.py` - Agregado audit logging a productos
    - `/app/backend/routers/billing.py` - Logging de pagos y descuentos
    - `/app/backend/routers/business_days.py` - Logging de apertura/cierre de jornada
    - `/app/backend/server.py` - Logging de turnos y cambios de config, auth_set_db()
    - `/app/backend/routers/reports.py` - Consolidación de system_audit_logs
    - `/app/frontend/src/pages/settings/SettingsContext.js` - Label del permiso
  - **Eventos registrados**:
    - LOGIN / LOGIN_FAILED / LOGOUT
    - SHIFT_OPENED / SHIFT_CLOSED
    - BUSINESS_DAY_OPENED / BUSINESS_DAY_CLOSED
    - BILL_PAID / DISCOUNT_APPLIED
    - PRICE_CHANGED / CONFIG_CHANGED
  - **Permisos**: 
    - `view_audit_complete` agregado a Admin y Supervisor
    - Label: "Ver Auditoría Completa del Sistema"
  - **Testing**: Verificado con curl y screenshot - 118 actividades visibles
  - **Razón de protección**: Sistema de auditoría crítico para compliance y trazabilidad
  - **Fecha de protección**: 2026-04-08

### 🔒 e-CF Dashboard Text Contrast Fix (Light Mode) - DONE 2026-04-09
- **Problema**: Etiquetas "Aprobadas" y "Rechazadas" invisibles en modo claro (Light Mode) debido a reglas CSS del tema que forzaban `color: white !important` en elementos `.text-xs` dentro de contenedores con clases `bg-green-5*` y `bg-red-5*`.
- **Root Cause**: Regla CSS en `/app/frontend/src/styles/theme-minimalist.css` línea ~650 que aplicaba color blanco a todo texto pequeño dentro de fondos coloreados, sin distinguir entre fondos sólidos y fondos con opacidad.
- **Fix aplicado**: 
  - Modificada regla CSS para excluir fondos con opacidad baja (`/10`, `/20`, `/30`)
  - Regla original: `[class*="bg-green-5"] .text-xs { color: white !important; }`
  - Regla corregida: `[class*="bg-green-5"]:not([class*="/10"]):not([class*="/20"]):not([class*="/30"]) .text-xs { color: white !important; }`
- **Archivos modificados**:
  - `/app/frontend/src/styles/theme-minimalist.css` (líneas 344-346 y 648-651)
  - `/app/frontend/src/pages/reports/EcfDashboard.jsx` (estilos de texto)
- **Testing**: Verificado en Desktop Light Mode y Mobile (390px) - todas las etiquetas ahora visibles con color `rgb(27, 34, 50)`
- **Fecha de fix**: 2026-04-09

### 🔒 AUTO-CONTRAST SYSTEM & DOCUMENTATION - DONE 2026-04-09
- **Request**: Implement automatic contrast detection globally and document fix technique
- **Implementation**:
  1. **Auto-Contrast CSS Utilities**: Added `[data-auto-contrast]` attribute system that automatically detects background luminance and adjusts text color
  2. **Safe Color Utilities**: Added `.text-safe-green`, `.text-safe-red`, `.text-safe-blue`, `.text-safe-amber` classes that work on both light and dark backgrounds
  3. **Comprehensive CSS Refactoring**: Updated ALL rules with `color: white !important` to use `:not([class*="/"])` exclusion for opacity-based backgrounds
  4. **Extensive Documentation**: Added 150+ lines of developer documentation at top and bottom of `theme-minimalist.css`
  
- **Root Cause Documentation** (added to CSS):
  ```
  PROBLEM: [class*="bg-green-5"] matches BOTH bg-green-500 (solid) AND bg-green-500/10 (opacity)
  SOLUTION: Use :not([class*="/"]) to exclude ANY opacity variant from white text rules
  ```

- **Developer Rules Documented**:
  - ❌ NEVER use `color: white !important` without excluding opacity variants
  - ✅ ALWAYS use theme CSS variables: `hsl(var(--foreground))`
  - ✅ ALWAYS test both Light Mode AND Dark Mode before committing
  - ✅ For stat cards: use `text-slate-800 dark:text-green-100` pattern

- **Testing Checklist Verified**:
  - ✅ Safari iOS 15+ (390px) - Light Mode
  - ✅ Android Chrome (412px) - Light Mode
  - ✅ iPad Safari (768px) - Light Mode
  - ✅ Desktop Chrome (1280px) - Light Mode
  - ✅ Desktop Dark Mode (neo-dark)
  - ✅ Mobile Dark Mode
  
- **Platform Support Confirmed**:
  - iOS 15+, Android 9+, Chrome 90+
  - Touch targets: 48×48px minimum (verified)
  - Font readability: 12px minimum (verified)

- **Files Modified**:
  - `/app/frontend/src/styles/theme-minimalist.css` (major refactoring + documentation)
  
- **Future Prevention**: Comprehensive documentation ensures any developer or agent can understand and avoid reintroducing this bug

### 🔒 e-CF Dashboard Filter Buttons - Theme-Aware Styles - DONE 2026-04-09
- **Problema**: Botones de filtro (Ayer, Semana, Mes, Personalizado) aparecían oscuros/invisibles cuando el sistema estaba en Dark Mode
- **Root Cause**: Usaban clases genéricas `bg-muted text-muted-foreground` que no se adaptaban correctamente al contexto del modal
- **Fix aplicado en** `/app/frontend/src/components/Layout.js` (líneas 753-780):
  ```jsx
  // Botones inactivos - theme-aware
  className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
  
  // Inputs de fecha - theme-aware
  className="bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200"
  
  // Botón Filtrar - theme-aware
  className="text-emerald-600 dark:text-emerald-400"
  ```
- **Testing**: Verificado en Desktop Light/Dark Mode y Mobile iOS (390px)
- **Razón de protección**: Consistencia visual crítica del e-CF Dashboard en todos los temas
- **Fecha de protección**: 2026-04-09

### 🔒 e-NCF Display Priority Over Internal NCF (B01→E31/E32/E34) - DONE 2026-04-09
- **Problema reportado**: El sistema mostraba el número de secuencia interno "B0100000032" en los logs de auditoría en lugar del número e-NCF fiscal "E312391385525"
- **Root Cause**: El código usaba `bill.get("ncf")` (secuencia interna B01) en lugar de `bill.get("ecf_encf")` (número e-NCF real)
- **Archivos modificados**:
  1. `/app/backend/routers/billing.py` (línea 683):
     ```python
     # ANTES: ncf=bill.get("ncf", "")
     # DESPUÉS: 
     audit_ncf = bill.get("ecf_encf") or bill.get("ncf", "")
     ```
  2. `/app/backend/routers/reports.py` (líneas 2149-2162):
     ```python
     # Prefer e-NCF over internal NCF for discounts report
     display_ncf = b.get("ecf_encf") or b.get("ncf", "-")
     ```
  3. `/app/backend/server.py` (línea 1478):
     ```python
     # Receipt printing now uses e-NCF first
     "bill_number": bill.get("ecf_encf") or bill.get("ncf") or bill.get("number") or bill.get("id", "")[:8]
     ```
- **Regla permanente**: 
  - `ecf_encf` = Número e-NCF fiscal oficial (E31, E32, E34) — USAR SIEMPRE para display
  - `ncf` = Secuencia interna de control (B01, B02) — NUNCA mostrar al usuario
- **Razón de protección**: Compliance fiscal DGII - El número visible debe ser siempre el e-NCF oficial
- **Fecha de protección**: 2026-04-09

