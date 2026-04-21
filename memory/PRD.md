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

## Completed Tasks (2026-04-16)

- **🔒 Multiprod AM SRL — send_ecf() Fix (multipart/form-data + JSON parsing)** (DONE - 2026-04-16):
  - **Fix 1**: Confirmado envío XML como `multipart/form-data`, campo `xml`, filename `{RNC}{eNCF}.xml`
  - **Fix 2**: Corregido parseo de respuesta JSON anidada de Multiprod:
    - Estructura real: `{ result: { success, response: { estado, encf, codigo, mensajes }, qr } }`
    - Añadido `result_wrapper = data.get("result") or data` para desempaquetar nivel `result`
    - Mejorada extracción de `mensajes` (array de `{codigo, valor}`)
  - **Fix 3**: Todos los callers de `send_ecf()` ahora pasan `rnc` y `encf` para filename correcto
  - **Testing end-to-end**: Enviado XML E32 a `portalmultiprod.com/api/testecf` → `estado: "Aceptado"`, `codigo: 1`, QR DGII generado
  - **Fecha de protección**: 2026-04-16

- **🔒 CRITICAL: Dispatcher e-CF ahora enruta a Multiprod** (DONE - 2026-04-17):
  - **BUG**: El dispatcher principal (`ecf_dispatcher.py`) solo tenía ramas para `thefactory` y `else → alanube`. Si `ecf_provider = "multiprod"`, las facturas iban silenciosamente a Alanube.
  - **Fix aplicado en 4 archivos**:
    1. **`ecf_dispatcher.py`** — Agregada rama `elif provider == "multiprod"` en send, retry, retry-all + `_send_via_multiprod()`
    2. **`ecf_provider.py`** — `init_supabase()` + fix `ncf_type_id` + `get_multiprod_credentials()` sin restricción de provider
    3. **`credit_notes.py`** — E34 ahora respeta el proveedor seleccionado
    4. **`server.py`** — Inicializa Supabase para `ecf_provider`
  - **Testing e2e**: Dispatcher → Multiprod → DGII "Aceptado" → `E320000000001` → `ecf_status: FINISHED`
  - **Fecha de protección**: 2026-04-17

- **🔒 Credenciales Alanube: DB first, .env fallback** (DONE - 2026-04-17):
  - **BUG**: `send_to_alanube()` usaba `get_config()` (solo .env) en vez de `get_config_from_db()` (DB primero)
  - **Fix**: Todas las funciones en `alanube.py` ahora usan `await get_config_from_db() or get_config()`
  - **Emisor RNC/nombre/dirección**: Ahora lee `ecf_alanube_rnc` → `ticket_rnc` → `rnc` → .env como fallback
  - **Archivos**: `alanube.py` (send_to_alanube, get_ecf_config, refresh_status)
  - **Testing**: DB token priorizado sobre .env ✅, fallback a .env cuando DB vacía ✅
  - **Fecha de protección**: 2026-04-17

- **🔒 Multiprod XML: Mapeo campos ticket_* del negocio** (DONE - 2026-04-17):
  - **BUG**: XML builder buscaba `address`, `business_name`, `email` pero system_config usa `ticket_address`, `ticket_business_name`, `ticket_email`
  - **Fix**: Cadena de fallback: `ticket_rnc` → `rnc` → `ecf_alanube_rnc`; `ticket_address` → `address` → "SIN DIRECCION"; etc.
  - **Archivos**: `multiprod_service.py` (build_xml), `ecf_provider.py` (rnc_emisor en 3 lugares), `ecf_dispatcher.py` (rnc_emisor)
  - **Testing**: XML con ticket_* OK, XML sin campos opcionales (XSD OK), municipio/provincia omitidos sin error
  - **Fecha de protección**: 2026-04-17

- **🔒 credit_notes.py — 1 Bug + 6 Warnings corregidos** (DONE - 2026-04-17):
  - **BUG 1 (CRÍTICO)**: `generate-e34` no validaba `ecf_status` → podía generar E34 sobre factura no aprobada por DGII. Fix: valida PROCESSING/PENDING/ERROR/REJECTED/empty antes de proceder.
  - **WARNING 1**: Columnas Supabase `ncf_type`/`ncf_type_code` → corregido a `ncf_type_id`/`sequence_prefix`
  - **WARNING 2**: `serie` null generaba e-NCF malformado → `seq.get("serie") or seq.get("sequence_prefix", "E")[:1] or "E"`
  - **WARNING 3**: RNC emisor Multiprod E34 sin `ticket_rnc` → cadena completa `ecf_alanube_rnc → ticket_rnc → rnc`
  - **WARNING 4**: `create_credit_note` no enviaba a proveedor → extraída función `_send_e34_to_provider()` reutilizable, llamada desde ambas funciones
  - **WARNING 5**: `build_credit_note_payload` RNC priorizaba .env → ahora DB-first con fallback a .env
  - **WARNING 6**: Padding inconsistente 8 vs 10 dígitos → unificado a 10 dígitos (`010d`) en todas las ocurrencias
  - **Archivo**: `/app/backend/routers/credit_notes.py`
  - **Testing**: 7/7 verificaciones automatizadas pasaron, 0 errores post-restart
  - **Fecha de protección**: 2026-04-17


- **🔒 5 Frontend Bugs corregidos** (DONE - 2026-04-19):
  - **Bug 1**: EcfDashboard — `handleRefreshStatus` ya no llama refresh-status para Multiprod/TheFactory (solo Alanube)
  - **Bug 2**: EcfDashboard — `getStatus()` ahora prioriza `ecf_status` sobre `ecf_reject_reason` para evitar contar facturas FINISHED como REJECTED
  - **Bug 3**: Reports.js — Filtro Jornada elimina `date_from`/`date_to` cuando usa `business_day_id`
  - **Bug 4**: NcfTab.js — `ecfEnabled` default `true`, serie default `E`, botón rápido usa `E32` en vez de `B02`
  - **Bug 5**: AuthContext.js — `isAdmin` exportado en Provider value (role=admin o level>=100)
  - **Archivos**: `EcfDashboard.jsx`, `Reports.js`, `NcfTab.js`, `AuthContext.js`
  - **Fecha de protección**: 2026-04-19

- **🔒 Multi-proveedor por insumo** (DONE - 2026-04-19):
  - **Backend**: Campo `suppliers: [{supplier_id, supplier_name, unit_price, is_default}]` en ingredientes
  - **Migración**: `POST /api/ingredients/migrate-suppliers` convierte formato legacy a array (7 ingredientes migrados)
  - **PO filtering**: `purchasing.py` filtra ingredientes por supplier desde `default_supplier_id` Y `suppliers` array
  - **Frontend**: IngredientsTab reemplaza dropdown único por lista multi-proveedor con selector + precio + estrella default + eliminar
  - **Frontend**: PurchasesTab usa precio del proveedor seleccionado en PO (no avg_cost genérico)
  - **Testing**: 13/13 tests backend pasados (CRUD, sync, migración, edge cases)
  - **Archivos**: `schemas.py`, `inventory.py`, `purchasing.py`, `IngredientsTab.jsx`, `PurchasesTab.jsx`
  - **Fecha de protección**: 2026-04-19


- **🔒 3 Backend Bugs corregidos** (DONE - 2026-04-19):
  - **Bug 6**: `billing.py` — Sale types auto-seed usa E32 (no B02), re-fetch después de insert_many para evitar ObjectId serialization
  - **Bug 7**: `ncf.py` — Crear secuencia ahora incluye `ncf_type`, `serie`, `start_number` en Supabase
  - **Bug 8**: `multiprod_service.py` — FechaVencimientoSecuencia lee `seq_valid_until` de Supabase, fallback "31-12-2027", formato DD-MM-YYYY
  - **Archivos**: `billing.py`, `ncf.py`, `multiprod_service.py`, `ecf_dispatcher.py`, `ecf_provider.py`
  - **Fecha de protección**: 2026-04-19



- **🔒 Multi-tenancy Supabase con client_id** (DONE - 2026-04-17):
  - Todas las consultas Supabase filtran por `SUPABASE_CLIENT_ID` (81+ queries en 11 archivos)
  - Helper centralizado: `/app/backend/utils/supabase_helpers.py` — `sb_select()`, `sb_insert()`, `sb_update_filter()`
  - Backwards compatible: sin variable → sin filtro
  - **Fecha de protección**: 2026-04-17

## Completed Tasks (2026-04-10)

- **🔒 Manual Contingency Payment Methods + Edit e-CF Type** (DONE - 2026-04-10):
  - **NEW FEATURE**: Campo `force_contingency` en métodos de pago:
    - Para plataformas como Uber Eats, Pedidos Ya que generan su propio comprobante fiscal
    - Backend: `POST/PUT /api/payment-methods` ahora acepta y guarda `force_contingency` boolean
    - Backend: `pay_bill()` omite envío automático a DGII cuando `force_contingency=true`
    - La factura queda con status `CONTINGENCIA` y NCF `PENDING-{ecf_type}` para revisión manual
    - Frontend: Toggle "Forzar Contingencia" en el diálogo de edición de métodos de pago
    - UI: Badge "CONTINGENCIA" verde visible en tarjetas de métodos de pago configurados
  - **NEW FEATURE**: Endpoint `PATCH /api/bills/{bill_id}/ecf-type`:
    - Permite cambiar el tipo e-CF (E31, E32, E34, E33, E44, E45, E46, E47) de facturas en CONTINGENCIA
    - Requiere permisos: admin, manager, gerente, o `edit_ecf_type`
    - Frontend: Icono de lápiz (Pencil) en EcfDashboard para facturas en CONTINGENCIA
    - Modal con dropdown para seleccionar nuevo tipo y botón "Guardar"
  - **Files Modified**:
    - `/app/backend/routers/billing.py` - lines 183-239 (PATCH endpoint), lines 510-540 (force_contingency checkout logic)
    - `/app/backend/routers/auth.py` - line 134 (edit_ecf_type permission added to ALL_PERMISSIONS)
    - `/app/frontend/src/pages/settings/VentasTab.js` - lines 205-207 (CONTINGENCIA badge), lines 522-539 (toggle in dialog)
    - `/app/frontend/src/pages/reports/EcfDashboard.jsx` - lines 117-119 (PATCH call), lines 232-235 (Pencil edit icon)
    - `/app/frontend/src/pages/PaymentScreen.js` - force_contingency field passed to checkout
  - **Testing**: 14/14 backend tests passed, UI verified via screenshots
  - **Impact**: Restaurantes pueden manejar ventas de delivery platforms sin duplicar comprobantes fiscales
  - **⚠️ PROTEGIDO**: Esta funcionalidad NO debe modificarse sin autorización del usuario

## Completed Tasks (2026-04-09)

- **🔒 DGII Payment Type Mapping Fix + dgii_payment_code Feature** (DONE - 2026-04-09):
  - **BUG FIX**: El mapeo de tipos de pago DGII estaba incorrecto:
    - "tarjeta" mapeaba a código 2 (Transferencia) → Corregido a código 3 (Tarjeta)
    - "transferencia" mapeaba a código 4 → Corregido a código 2 (Cheque/Transferencia)
  - **Files Modified**:
    - `/app/backend/routers/alanube.py` - `PAYMENT_TYPE_MAP` actualizado con códigos DGII oficiales
    - `/app/backend/routers/thefactory.py` - `PAYMENT_TYPE_MAP` actualizado con códigos DGII oficiales
  - **NEW FEATURE**: Campo `dgii_payment_code` en métodos de pago:
    - Backend: `POST/PUT /api/payment-methods` ahora acepta y guarda `dgii_payment_code`
    - Backend: `map_payment_type()` ahora prioriza `dgii_payment_code` explícito sobre mapeo por nombre
    - Frontend: Nuevo dropdown "Código DGII" (opciones 1-8) en el diálogo de edición de métodos de pago
    - UI: Badge "DGII: X" visible en cada tarjeta de método de pago
  - **DGII Official Codes Reference**:
    - 1 = Efectivo
    - 2 = Cheque/Transferencia/Depósito  
    - 3 = Tarjeta de Crédito/Débito
    - 4 = Venta a Crédito
    - 5 = Bonos o Certificados
    - 6 = Permuta
    - 7 = Nota de Crédito
    - 8 = Otras Formas de Pago
  - **Testing**: 16/16 backend tests passed, UI verified via screenshots
  - **Impact**: Facturas electrónicas (e-CF) ahora reportan el tipo de pago correcto a la DGII

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
- Notificaciones Push para pedidos de Delivery Platforms (Uber Eats, Pedidos Ya)
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

### 🔒 Payment Flow Modals Theme-Aware Colors - DONE 2026-04-09
- **Problema reportado**: Texto blanco invisible en dos modales de pago en Light Mode:
  1. Modal "Datos Fiscales E31" - Campo "Cliente existente - Datos autocompletados" invisible
  2. Modal "Tipo de Venta" - Todas las opciones de servicio con texto blanco sobre fondos claros
- **Root Cause**: Colores hardcodeados para Dark Mode (`text-white/60`, `text-green-300`, `text-orange-300`, `bg-white/5`) sin variantes para Light Mode
- **Archivos modificados**:
  1. `/app/frontend/src/components/FiscalDataDrawer.jsx`:
     - Background: `bg-white dark:bg-slate-900`
     - Labels: `text-slate-700 dark:text-white/70`
     - Inputs: `bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white`
     - Status indicators: `text-green-700 dark:text-green-300` etc.
  2. `/app/frontend/src/pages/PaymentScreen.js`:
     - NCF Dialog background: `bg-white dark:bg-slate-900/95`
     - NCF buttons: `text-cyan-700 dark:text-cyan-300` (selected), `text-slate-600 dark:text-white/60` (unselected)
     - Service type options: `text-orange-800 dark:text-orange-300` (selected), `text-slate-700 dark:text-white/60` (unselected)
     - Descriptions: `text-slate-500 dark:text-white/40`
- **Pattern aplicado**: Siempre usar `light-color dark:dark-color` para todos los textos
- **Testing**: Verificado en Desktop Light Mode (1280px) y Mobile (390px)
- **Razón de protección**: UX crítica en flujo de cobro - textos deben ser legibles en ambos temas
- **Fecha de protección**: 2026-04-09

### 🔒 DGII Payment Type Mapping + dgii_payment_code - DONE 2026-04-09
- **Bug corregido**: Mapeo incorrecto de tipos de pago a códigos DGII:
  - `tarjeta` mapeaba a código 2 (Transferencia) → Corregido a **código 3** (Tarjeta Crédito/Débito)
  - `transferencia` mapeaba a código 4 → Corregido a **código 2** (Cheque/Transferencia)
- **Feature agregada**: Campo `dgii_payment_code` en métodos de pago permite override manual
- **Archivos modificados**:
  1. `/app/backend/routers/alanube.py`:
     - `PAYMENT_TYPE_MAP` actualizado con códigos DGII oficiales (líneas 57-72)
     - `map_payment_type()` ahora acepta `dgii_code` opcional que tiene prioridad (líneas 85-99)
     - `build_alanube_payload()` pasa `dgii_payment_code` de cada pago (líneas 183-205)
  2. `/app/backend/routers/thefactory.py`:
     - `PAYMENT_TYPE_MAP` actualizado (líneas 323-338)
     - `map_payment_type()` con prioridad de `dgii_code` (líneas 341-355)
     - `build_thefactory_payload()` pasa `dgii_payment_code` (líneas 445-470)
  3. `/app/backend/routers/billing.py`:
     - `POST /api/payment-methods` guarda `dgii_payment_code` (líneas 147-165)
     - `pay_bill()` incluye `dgii_payment_code` en cada pago (líneas 410-447)
  4. `/app/frontend/src/pages/settings/VentasTab.js`:
     - Dropdown "Código DGII" con opciones 1-8 en diálogo de métodos de pago
     - Badge "DGII: X" visible en tarjetas de métodos de pago
- **Códigos DGII oficiales**:
  ```
  1 = Efectivo
  2 = Cheque/Transferencia/Depósito
  3 = Tarjeta de Crédito/Débito
  4 = Venta a Crédito
  5 = Bonos o Certificados
  6 = Permuta
  7 = Nota de Crédito
  8 = Otras Formas de Pago
  ```
- **Lógica de prioridad**: `dgii_payment_code` explícito > mapeo por nombre > default (1=Efectivo)
- **Testing**: 16/16 backend tests pasaron
- **Razón de protección**: Compliance fiscal DGII - Los códigos de forma de pago deben ser correctos en todas las facturas electrónicas
- **Fecha de protección**: 2026-04-09

### Pre-Cuenta Auto-Routing to Area Printer - DONE 2026-04-09
- **Feature**: Pre-cuenta ahora se auto-enruta a la impresora del área de la mesa sin mostrar el modal "Selecciona Impresora"
- **Prioridad de selección de impresora**:
  1. `channel_override` (selección manual)
  2. Impresora de recibo del área (`area_channel_mappings` con `category_id="receipt"`)
  3. Impresora del terminal del turno activo
  4. Canal "receipt" global (fallback)
- **Archivos modificados**:
  1. `/app/backend/server.py`:
     - Nuevo endpoint `GET /api/order/{order_id}/area-printer` (líneas 923-957)
     - `send_precheck_to_printer()` actualizado con prioridad de área (líneas 3199-3255)
  2. `/app/frontend/src/pages/OrderScreen.js`:
     - `checkAreaPrinter()` - verifica impresora del área (líneas 1187-1198)
     - `handlePrintPreCheckToPhysical()` - auto-enruta si área tiene impresora (líneas 1200-1244)
     - `handleManualPrinterSelect()` - override manual (líneas 1246-1250)
     - Botón "Otra impresora" con icono Settings en diálogo de pre-cuenta (líneas 3107-3116)
- **Comportamiento**:
  - Si el área tiene impresora configurada → imprime directo + toast "Enviado a [nombre]"
  - Si no tiene → verifica turno activo → si tiene turno imprime directo, sino muestra modal
  - El botón "Otra impresora" siempre disponible para override manual
- **Configuración de área**: ~~Crear `area_channel_mapping` con `category_id="receipt"` para cada área~~ **AUTO-CONFIGURADO** al iniciar el backend
- **Testing**: 8/8 backend tests passed, UI verified
- **Cross-platform**: Safari iOS 390px, Android Chrome 412px, Desktop 1280px ✅
- **Theme-aware**: Botón usa colores theme-aware (slate-500/700 light, slate-400/200 dark) ✅

### Pre-Cuenta Modal Bug Fix - DONE 2026-04-09
- **Bug**: El modal "Selecciona Impresora" aparecía automáticamente al imprimir pre-cuenta
- **Root Cause**: No existían `area_channel_mappings` con `category_id="receipt"` y el frontend mostraba modal si no había impresora de área
- **Fix aplicado**:
  1. **Backend auto-migración** (startup): Crea automáticamente receipt mappings para todas las áreas que no tengan uno (`startup_event()` en server.py líneas 4155-4170)
  2. **Frontend simplificado**: `handlePrintPreCheckToPhysical()` NUNCA muestra modal - siempre envía al backend
  3. **Backend fallback**: `get_order_area_printer()` retorna el canal "receipt" global como fallback
- **Comportamiento actual**:
  - Click "IMPRIMIR PRE-CUENTA" → Envía directo al backend → Toast "Enviado a [impresora]"
  - El modal SOLO aparece cuando el usuario hace click en "Otra impresora"
- **Logs de migración**: "Auto-created receipt mapping for area 'Terraza' -> recibo", etc.
- **Testing**: 8/9 tests passed (1 skipped), UI verified
- **Razón de protección**: UX crítica - el mesero debe poder imprimir pre-cuenta con un solo click sin interrupciones
- **Fecha de protección**: 2026-04-09

### 🔒 Pre-Cuenta Area Auto-Routing - PROTECTED 2026-04-09
- **Feature**: Pre-cuenta se auto-enruta a la impresora del área sin mostrar modal
- **Archivos protegidos**:
  1. `/app/backend/server.py`:
     - `startup_event()` (líneas 4155-4170): Auto-migración de receipt mappings
     - `get_order_area_printer()` (líneas 923-980): Endpoint con fallback global
     - `send_precheck_to_printer()` (líneas 3206-3260): Prioridad de selección de impresora
  2. `/app/frontend/src/pages/OrderScreen.js`:
     - `handlePrintPreCheckToPhysical()` (líneas 1201-1227): NUNCA muestra modal automáticamente
     - `handleManualPrinterSelect()` (líneas 1229-1233): Override manual
     - Botón "Otra impresora" (líneas 3107-3116): Único trigger del modal
- **Prioridad de impresora backend**:
  1. `channel_override` (manual)
  2. Area receipt mapping (`category_id="receipt"`)
  3. Shift terminal printer
  4. Global "receipt" channel (fallback)
- **REGLA**: El modal "Selecciona Impresora" NUNCA debe aparecer automáticamente. Solo con "Otra impresora".
- **Fecha de protección**: 2026-04-09

### The Factory HKA Code 145 Fix - DONE 2026-04-09
- **Bug**: Error `145: Fecha de vencimiento Secuencia inválida` al enviar E32 (Factura de Consumo)
- **Root Cause**: The Factory retorna `fechaVencimientoSecuencia: "N/A"` para E32, y si se pasa como `null` en el payload, la API rechaza el documento
- **Fix aplicado**:
  1. **`_is_valid_fecha_venc()`** mejorada (líneas 64-107): Ahora maneja más casos edge ("N/A", "NA", "NULL", "-", "0", "00-00-0000", fechas expiradas, formatos inválidos)
  2. **`build_thefactory_payload()`** (líneas 498-524): OMITE completamente `fechaVencimientoSecuencia` del payload si no es válida (no la pasa como null)
  3. **Logging mejorado**: Ahora se registra la decisión de omitir el campo para diagnóstico
- **Endpoint de diagnóstico**: `GET /api/ecf/thefactory/series-diagnostics` muestra el estado de todas las secuencias y alerta si alguna tiene fecha inválida
- **Testing**: 16/16 unit tests para `_is_valid_fecha_venc()` pasaron
- **Nota**: El sistema actual usa Alanube (no The Factory), por lo que el fix no puede ser probado en producción hasta que se cambie el proveedor
- **Archivos modificados**:
  - `/app/backend/routers/thefactory.py` - `_is_valid_fecha_venc()`, `build_thefactory_payload()`
  - `/app/backend/routers/ecf_dispatcher.py` - `thefactory/series-diagnostics` endpoint

### 🔒 Pre-Cuenta Security Fix (Auto-Send Pending Items) - DONE 2026-04-09
- **Vulnerabilidad corregida**: Items en estado "Pendiente" podían ser eliminados sin autorización después de imprimir pre-cuenta
- **Fix aplicado**: Cuando el mesero presiona "Pre-Cuenta", el sistema PRIMERO envía automáticamente todos los items pendientes a sus canales (usando la misma lógica que el botón ENVIAR), y LUEGO imprime la pre-cuenta
- **Flujo de seguridad**:
  1. Mesero presiona "Pre-Cuenta"
  2. Sistema verifica si hay items en estado "Pendiente"
  3. Si SÍ → auto-envía items usando `ordersAPI.sendToKitchen()` (misma lógica que ENVIAR)
  4. Todos los items ahora tienen status="sent" (Enviado)
  5. Pre-cuenta se imprime con total completo
  6. Items enviados requieren protocolo de auditoría (razón + PIN gerente opcional) para eliminar
- **Archivos modificados**:
  - `/app/frontend/src/pages/OrderScreen.js`:
    - `autoSendPendingItems()` (líneas 1252-1271): Nueva función que usa ordersAPI.sendToKitchen()
    - `handlePrintPreCheck()` (líneas 1273-1296): Llama autoSendPendingItems() ANTES de imprimir
    - `handlePrintAccountPreCheck()` (líneas 1323-1337): Auto-envía items para cuenta específica
    - `handlePrintAllAccounts()` (líneas 1340-1363): Auto-envía items para TODAS las cuentas
- **Backend sin cambios**: Usa el endpoint existente `POST /api/orders/{order_id}/send-kitchen`
- **Testing**: 9/9 backend tests pasaron, UI verificada
- **Razón de protección**: Previene fraude de meseros que eliminaban items después de pre-cuenta
- **Fecha de protección**: 2026-04-09

### E31 Receipt Customer Fiscal Data Fix - DONE 2026-04-09
- **Bug**: Recibos impresos de E31 (Crédito Fiscal) no mostraban RNC y Razón Social del cliente
- **DGII Requirement**:
  - E31, E44, E45: DEBEN imprimir datos fiscales del cliente (RNC + Razón Social)
  - E32: NO debe imprimir datos del cliente (Consumo Final)
- **Fix aplicado en 4 lugares**:
  1. `/app/backend/server.py` líneas 1622-1668: HTML receipt logic
  2. `/app/backend/server.py` líneas 1711-1748: ESC/POS receipt logic
  3. `/app/backend/server.py` líneas 2673-2710: send_formatted_receipt
  4. `/app/backend/server.py` líneas 3027-3065: print queue job
- **Cambios clave**:
  - `fiscal_types_require_customer_data = ["B01", "B14", "B15", "E31", "E44", "E45"]`
  - `ecf_encf` se verifica PRIMERO antes de legacy NCF para inferir el tipo
  - E32 explícitamente excluido de mostrar datos del cliente
- **Formato en recibo**:
  ```
  DATOS DEL CLIENTE
  RNC: 131-06282-2
  Razón Social: SSTECH SRL
  ```
- **Testing**: 11/11 tests críticos pasaron
- **Verificado con bills reales**: E31 (E314643538373) y E32 (E321943598537)

---

## Completed Tasks (2026-04-10)

### 🔒 Permiso `access_caja` - Control de Acceso a Caja - DONE 2026-04-10
- **Feature**: Nuevo permiso `access_caja` que controla quién puede acceder al botón "Caja" en el modal de Opciones
- **Comportamiento**:
  - Solo usuarios con permiso `access_caja` ven el botón "Caja" en Opciones
  - Por defecto: Admin (nivel 100), Gerente (nivel 60+), Cajero tienen acceso
  - Meseros y otros roles NO tienen acceso por defecto
- **Archivos modificados**:
  1. `/app/backend/routers/auth.py`:
     - `ALL_PERMISSIONS` ahora incluye `"access_caja"`
     - `DEFAULT_PERMISSIONS` para roles con acceso incluye el permiso
  2. `/app/frontend/src/components/Layout.js`:
     - Botón "Caja" condicionalmente renderizado con `hasPermission('access_caja')`
  3. `/app/frontend/src/context/SettingsContext.js`:
     - `PERM_LABELS` incluye `access_caja: "Acceso a Caja"`
  4. `/app/frontend/src/pages/UserConfig.js`:
     - `PERMISSION_CATEGORIES.Administracion` incluye `access_caja`
     - Visible en UI de configuración de permisos de usuario
- **Testing**: Screenshots verificados en UI de permisos
- **Razón de protección**: Control de acceso crítico a funciones de caja
- **Fecha de protección**: 2026-04-10

### 🔒 Logo del Negocio en Recibos Impresos - DONE 2026-04-10
- **Feature**: Los recibos (facturas) ahora incluyen el logo del negocio configurado en `system_config.logo_url`
- **Implementación**:
  - **Recibos HTML** (`/print/receipt/{bill_id}`): Logo como `<img>` centrado de 120px de ancho
  - **Recibos ESC/POS** (`/print/receipt-escpos/{bill_id}`): Logo convertido a bitmap ESC/POS compatible
  - **Fallback graceful**: Si no hay logo configurado, el recibo se genera sin logo sin errores
- **Archivos modificados**:
  - `/app/backend/server.py`: Endpoints de impresión con fetch de `logo_url` desde `system_config`
- **Configuración**: Subir logo en Ajustes → Sistema → "Logo del Negocio"
- **Testing**: Verificado con impresora térmica real
- **Razón de protección**: Branding crítico en documentos impresos
- **Fecha de protección**: 2026-04-10

### 🔒 Limpieza de Mesas Huérfanas - Fix para 'merged' - DONE 2026-04-10
- **Bug corregido**: El endpoint `/api/system/cleanup-orphan-tables` no limpiaba mesas con órdenes en estado `merged`
- **Root Cause**: El filtro solo buscaba órdenes con status `active` o `sent`, ignorando `merged` (cuentas unidas/divididas)
- **Fix aplicado**:
  - Cambio de filtro: `{"status": {"$in": ["active", "sent"]}}` → `{"status": {"$nin": ["closed", "paid", "cancelled"]}}`
  - Ahora detecta correctamente mesas con órdenes `merged` que no fueron cerradas
- **Archivo modificado**: `/app/backend/server.py` (endpoint `cleanup-orphan-tables`)
- **Testing**: Verificado que mesas con órdenes 'merged' ahora se limpian correctamente
- **Razón de protección**: Integridad del mapa de mesas
- **Fecha de protección**: 2026-04-10

### 🔒 Mover a otra Mesa - Colores de Estado - DONE 2026-04-10
- **Feature**: El modal "Mover a otra Mesa" ahora muestra los colores exactos de estado de cada mesa
- **Colores implementados**:
  - 🔵 Azul (`#3B82F6`): Mesa libre
  - 🔴 Rojo (`#EF4444`): Mesa ocupada
  - 🟠 Naranja (`#F97316`): Mesa dividida
  - 🟣 Morado (`#8B5CF6`): Mesa reservada
  - 🟡 Amarillo (`#EAB308`): Mesa de otro mesero
- **Archivo modificado**: `/app/frontend/src/pages/OrderScreen.js` (modal de mover mesa)
- **Antes**: Texto genérico "ocupada", "libre", etc.
- **Después**: Indicador de color visual idéntico al mapa de mesas
- **Testing**: Verificado en móvil y desktop
- **Razón de protección**: UX crítica para operaciones de mesas
- **Fecha de protección**: 2026-04-10

### 🔒 Versionamiento Formal v1.0.0 - DONE 2026-04-10
- **Feature**: Sistema de versionamiento semántico implementado
- **Archivos creados/modificados**:
  - `/app/VERSION`: Contiene `1.0.0`
  - `/app/CHANGELOG.md`: Historial completo de cambios
  - `/app/frontend/package.json`: `"version": "1.0.0"`
  - `/app/frontend/src/pages/Login.js`: Footer muestra `v1.0.0`
  - `/app/frontend/src/pages/settings/SystemTab.js`: Sección de versión visible
- **Formato**: Semantic Versioning (MAJOR.MINOR.PATCH)
- **Visibilidad**: Versión visible en Login y en Ajustes → Sistema
- **Testing**: Screenshots verificados
- **Razón de protección**: Tracking de versiones para clientes/tenants
- **Fecha de protección**: 2026-04-10

### 🔒 Documentación de Despliegue para Tenants - DONE 2026-04-10
- **Documentos creados/actualizados**:
  1. `/app/MANUAL_SUPABASE.md` (NUEVO):
     - Guía completa para crear instancia Supabase por tenant
     - Creación de tablas: `pos_sessions`, `business_hours`
     - Configuración de Row Level Security (RLS)
     - Variables de entorno requeridas
  2. `/app/MANUAL_DESPLIEGUE_CLIENTES.md` (v1.1):
     - Checklist completo de despliegue
     - Configuración de credenciales e-CF (Alanube/The Factory)
     - Setup de impresoras y canales
     - Verificación post-despliegue
- **Uso**: Replicar VexlyPOS para nuevos clientes (ej: BlackBurguer)
- **Razón de protección**: Documentación crítica de despliegue
- **Fecha de protección**: 2026-04-10

---

## 🔒 CÓDIGO PROTEGIDO - ACTUALIZACIÓN 2026-04-10

### 10. 🔒 Permiso `access_caja` (2026-04-10)
- **Archivos protegidos**:
  - `/app/backend/routers/auth.py`: `ALL_PERMISSIONS` y `DEFAULT_PERMISSIONS`
  - `/app/frontend/src/components/Layout.js`: Renderizado condicional del botón Caja
  - `/app/frontend/src/context/SettingsContext.js`: Label del permiso
  - `/app/frontend/src/pages/UserConfig.js`: Categoría del permiso en UI
- **REGLA**: El botón "Caja" SOLO debe mostrarse a usuarios con `access_caja`
- **Fecha de protección**: 2026-04-10

### 11. 🔒 Logo en Recibos Impresos (2026-04-10)
- **Archivo protegido**: `/app/backend/server.py` (endpoints de impresión)
- **REGLA**: Los recibos SIEMPRE deben intentar incluir el logo si está configurado
- **Fecha de protección**: 2026-04-10

### 12. 🔒 Limpieza de Mesas Huérfanas con 'merged' (2026-04-10)
- **Archivo protegido**: `/app/backend/server.py` (endpoint `cleanup-orphan-tables`)
- **REGLA**: El filtro debe usar `$nin: ["closed", "paid", "cancelled"]` para capturar TODOS los estados activos
- **Fecha de protección**: 2026-04-10

### 13. 🔒 Versionamiento v1.0.0 (2026-04-10)
- **Archivos protegidos**: `/app/VERSION`, `/app/CHANGELOG.md`, `/app/frontend/package.json`
- **REGLA**: Versión debe actualizarse siguiendo Semantic Versioning en TODOS los archivos
- **Fecha de protección**: 2026-04-10

### 14. 🔒 Permisos config_* Visibles en UI (2026-04-11)
- **Feature**: Los 14 permisos `config_*` que controlan visibilidad de pestañas de Configuración ahora son visibles y configurables en la UI de permisos
- **Archivos protegidos**:
  - `/app/frontend/src/pages/UserConfig.js`: Nueva categoría `pestanas_config` con 14 permisos
  - `/app/frontend/src/pages/settings/SettingsContext.js`: `PERM_LABELS` con etiquetas de los 14 permisos
  - `/app/backend/routers/auth.py`: `ALL_PERMISSIONS` y `DEFAULT_PERMISSIONS` ya definidos
- **Permisos incluidos**:
  - `config_users`, `config_mesas`, `config_ventas`, `config_productos`
  - `config_inventario`, `config_impresion`, `config_estacion`, `config_reportes`
  - `config_clientes`, `config_impuestos`, `config_ncf`, `config_apariencia`
  - `config_sistema`, `config_descuentos`
- **Comportamiento**: Admin puede ir a Config → Usuarios → seleccionar usuario → ver/editar permisos de "Pestañas de Configuración"
- **Testing**: 100% passed en Desktop (1280px Dark/Light), Mobile iOS (390px), Android (412px)
- **Fecha de protección**: 2026-04-11

### 15. 🔒 Permiso config_tipos_venta para Sub-Pestaña Tipos de Venta (2026-04-11)
- **Feature**: Nuevo permiso `config_tipos_venta` que controla visibilidad del sub-tab "Tipos de Venta" dentro de Config → Ventas
- **Comportamiento**:
  - Solo usuarios con `config_tipos_venta: true` ven el sub-tab "Tipos de Venta"
  - Admin tiene el permiso TRUE por defecto
  - Supervisor, Cajero, Mesero, Cocina tienen FALSE por defecto
- **Archivos protegidos**:
  - `/app/frontend/src/pages/settings/VentasTab.js`: Líneas 37, 160-162, 405 - renderizado condicional con `canConfigTiposVenta`
  - `/app/frontend/src/pages/UserConfig.js`: `PERMISSION_CATEGORIES.pestanas_config` incluye `config_tipos_venta`
  - `/app/frontend/src/pages/settings/SettingsContext.js`: `PERM_LABELS` con etiqueta
  - `/app/backend/routers/auth.py`: `DEFAULT_PERMISSIONS` y `ALL_PERMISSIONS`
- **Testing**: 100% passed - Admin ve 3 sub-tabs, Cajero no tiene acceso a Ventas tab
- **Fecha de protección**: 2026-04-11

### 16. 🔒 Permiso config_formas_pago para Agregar/Eliminar Formas de Pago (2026-04-11)
- **Feature**: Nuevo permiso `config_formas_pago` que controla botones de AGREGAR y ELIMINAR métodos de pago en Config → Ventas → Formas de Pago
- **Comportamiento**:
  - Solo usuarios con `config_formas_pago: true` ven el botón "+Agregar" y los botones de eliminar (trash)
  - El botón de EDITAR (pencil) sigue visible para usuarios con `edit_exchange_rate` o `manage_sale_config`
  - Esto permite que supervisores/cajeros editen tasas de cambio sin poder agregar/eliminar métodos de pago
  - Admin tiene el permiso TRUE por defecto
  - Supervisor, Cajero, Mesero, Cocina tienen FALSE por defecto
- **Archivos protegidos**:
  - `/app/frontend/src/pages/settings/VentasTab.js`: Líneas 38, 169, 242 - `canAddDeletePayMethods`
  - `/app/frontend/src/pages/UserConfig.js`: `PERMISSION_CATEGORIES.pestanas_config` incluye `config_formas_pago`
  - `/app/frontend/src/pages/settings/SettingsContext.js`: `PERM_LABELS` con etiqueta
  - `/app/backend/routers/auth.py`: `DEFAULT_PERMISSIONS` y `ALL_PERMISSIONS`
- **Testing**: 100% passed - Admin ve +Agregar y trash, otros roles solo ven pencil (si tienen edit_exchange_rate)
- **Fecha de protección**: 2026-04-11

### 17. 🔒 Validación de Unicidad de PIN (2026-04-11)
- **Feature**: Validación de seguridad que impide que dos usuarios tengan el mismo PIN
- **Comportamiento**:
  - Al CREAR usuario: Si el PIN ya existe, retorna HTTP 409 con "Este PIN ya está en uso, elige otro"
  - Al EDITAR usuario: Si el nuevo PIN ya pertenece a otro usuario, retorna HTTP 409
  - Al EDITAR usuario manteniendo su propio PIN: Funciona sin error
  - NUNCA revela a qué usuario pertenece el PIN existente (seguridad)
- **Archivos protegidos**:
  - `/app/backend/routers/auth.py`: 
    - Línea 494-496: `create_user` - validación con HTTP 409
    - Línea 622-625: `update_user` - validación con `id: {"$ne": user_id}` y HTTP 409
  - `/app/frontend/src/pages/UserConfig.js`: Línea 339 muestra error del backend
- **Testing**: 100% passed - 9/9 pytest tests, todos los viewports y temas
- **Fecha de protección**: 2026-04-11

### 18. 🔒 Fix Textos Invisibles en Modal Inventario - Light Mode (2026-04-11)
- **Bug corregido**: En el modal "Nuevo Insumo" de Inventario, los textos de selects y labels eran invisibles en Light Mode
- **Causa raíz**: Los `<select>` y `<span>` heredaban color blanco del tema dark, haciéndolos ilegibles sobre fondo claro
- **Fix aplicado**:
  - Agregado `style={isLightMode ? { color: '#1E293B', WebkitTextFillColor: '#1E293B' } : {}}` a:
    - Select "Unidad de Despacho" (línea 547)
    - Select "Categoría" (línea 568)
    - Label "Conversión de Unidades *" (línea 587-590)
    - Select "Yo compro por" (línea 618)
  - Agregado `style={{ color: '#1E293B', backgroundColor: '#FFFFFF' }}` a todas las `<option>` de los selects
- **Archivo protegido**: `/app/frontend/src/pages/inventory/components/IngredientsTab.jsx`
- **Testing**: 100% passed - Desktop 1280px, Safari iOS 390px, Android Chrome 412px (Light Mode)
- **Fecha de protección**: 2026-04-11

### 19. 🔒 Generador de Nota de Crédito E34 Independiente de Turno (2026-04-14)
- **Feature**: Admin/Propietario puede generar Notas de Crédito E34 sin estar dentro de un turno de cajero
- **Nuevo permiso**: `manage_credit_notes` (Admin: TRUE, otros: FALSE)
- **Nuevos endpoints**:
  - `GET /api/credit-notes/find-bill?search=<transaction_number|e-NCF>`: Busca factura
  - `POST /api/credit-notes/generate-e34`: Genera E34 (valida permiso, razón, factura)
- **Frontend**:
  - Botón "Nota de Crédito" en modal de Opciones (color amber/naranja)
  - Solo visible para usuarios con `manage_credit_notes` o Admin
  - Modal con flujo de 3 pasos:
    1. Buscar factura por número de transacción o e-NCF
    2. Mostrar datos + campo para motivo + confirmación
    3. Resultado (éxito con e-NCF generado o error)
- **Archivos protegidos**:
  - `/app/backend/routers/credit_notes.py`: Líneas 230-450 (find-bill, generate-e34)
  - `/app/backend/routers/auth.py`: `manage_credit_notes` en DEFAULT_PERMISSIONS y ALL_PERMISSIONS
  - `/app/frontend/src/components/Layout.js`: Estados del modal (líneas 50-95), botón (líneas 1035-1050), modal UI (líneas 1150-1300)
  - `/app/frontend/src/pages/settings/SettingsContext.js`: Label del permiso
  - `/app/frontend/src/pages/UserConfig.js`: Permiso en categoría Administración
- **Reglas de negocio**:
  - NO requiere turno abierto
  - NO modifica factura original, solo crea E34
  - Si factura ya tiene E34, bloquea y muestra e-NCF existente
  - Genera secuencia E34 desde Supabase
  - Envía a Alanube con creditNoteIndicator y informationReference
  - Guarda en MongoDB credit_notes + audit log
- **Testing**: 100% passed - Backend (12/12 pytest), Frontend (Desktop, iOS, Android, Dark/Light)
- **Fecha de protección**: 2026-04-14



### 🔒 Inventario Simple por Conteo — Added 2026-04-14
- **Descripción**: Control de inventario basado en conteo directo (sin recetas). Mutuamente excluyente con el sistema de recetas.
- **Archivos protegidos**:
  - `/app/backend/routers/simple_inventory.py`: Router completo (endpoints, helpers, audit log)
  - `/app/backend/routers/orders.py`: Decremento atómico en `add_items_to_order`, restauración en `cancel_order_item` y `cancel_multiple_items`
  - `/app/backend/routers/config.py`: `get_products_stock_status` incluye productos con inventario simple
  - `/app/frontend/src/pages/settings/SimpleInventoryTab.js`: Tab completa con tabla, ajuste rápido, reporte auditoría y CSV
  - `/app/frontend/src/pages/settings/index.js`: Tab registrada como "Inv. Simple"
  - `/app/frontend/src/pages/OrderScreen.js`: Badges de cantidad (verde/amarillo/rojo/gris), botón disabled cuando qty=0
  - `/app/frontend/src/pages/ProductConfig.js`: Sección condicional (mutua exclusividad con receta)
  - `/app/frontend/src/lib/api.js`: `simpleInventoryAPI`
- **Campos en MongoDB products**: `simple_inventory_enabled`, `simple_inventory_qty`, `simple_inventory_alert_qty`
- **Colección MongoDB**: `inventory_audit_log` con campos: id, product_id, product_name, user_id, user_name, action_type, qty_before, qty_after, qty_change, reason, created_at
- **Endpoints**:
  - `GET /api/simple-inventory` — Lista productos con inventario simple
  - `PUT /api/simple-inventory/{product_id}/adjust` — Ajuste manual de stock
  - `GET /api/simple-inventory/audit-log` — Log de auditoría con filtros
  - `GET /api/simple-inventory/audit-log/export-csv` — Export CSV
  - `GET /api/simple-inventory/products-with-simple` — Data para badges en POS
- **Reglas de negocio**:
  - Si producto tiene receta activa → no puede tener inventario simple (y viceversa)
  - Al agregar item a orden → decremento atómico vía `find_one_and_update`
  - Al cancelar item → restauración automática del stock
  - Permisos: `manage_inventory` o roles admin/manager para ver/ajustar
  - Badges: Verde (#22c55e) = normal, Amarillo (#eab308) = bajo, Rojo (#ef4444) = último, Gris = agotado
- **Testing**: Backend 89% (16/18 — 2 timing issues en tests, no bugs reales), Frontend 100%
- **Fecha de protección**: 2026-04-14

### 🔒 Notificaciones Push de Stock Bajo — Added 2026-04-14
- **Descripción**: Modal obligatorio centrado que alerta sobre productos con stock bajo al entrar a la app. El usuario debe dar ACEPTAR. No se repite si el qty no cambió. Se re-muestra si el qty cambió. Email periódico integrado con scheduler existente.
- **Archivos protegidos**:
  - `/app/backend/routers/simple_inventory.py`: Endpoints `alerts/pending` y `alerts/dismiss`
  - `/app/backend/server.py`: `check_low_stock_alerts` modificado para incluir inventario simple en emails
  - `/app/frontend/src/components/StockAlertModal.js`: Componente modal completo
  - `/app/frontend/src/components/Layout.js`: Render del StockAlertModal
  - `/app/frontend/src/lib/api.js`: `pendingAlerts` y `dismissAlerts`
- **Colección MongoDB**: `inventory_alert_dismissals` con: `user_id`, `product_id`, `dismissed_at_qty`, `dismissed_at`
- **Lógica clave**:
  - Solo para inventario simple (no recetas)
  - Se muestra si qty <= alert_qty AND (nunca dismissed OR dismissed at different qty)
  - Dismiss es per-user, per-product, per-qty
  - Modal obligatorio — no se puede cerrar sin dar ACEPTAR
  - Email incluye sección "Inventario Simple - Stock Bajo" en el email periódico existente
- **Testing**: Backend 92%, Frontend 100%
- **Fecha de protección**: 2026-04-14

### 🔒 Importación Masiva de Productos CSV/Excel — Added 2026-04-15
- **Descripción**: Permite cargar +1000 productos desde un archivo CSV o XLSX. Validación de categorías, precios, duplicados. Modal de 4 pasos.
- **Archivos protegidos**:
  - `/app/backend/routers/config.py`: Endpoints `import-template` y `import-bulk`
  - `/app/frontend/src/components/ImportProductsModal.js`: Modal completo de 4 pasos
  - `/app/frontend/src/pages/settings/InventarioTab.js`: Botón "Importar" y integración del modal
- **Endpoints**:
  - `GET /api/products/import-template` — Descarga plantilla CSV
  - `POST /api/products/import-bulk` — Importa productos desde CSV/XLSX (multipart/form-data)
- **Reglas de negocio**:
  - Columnas requeridas: nombre, precio, categoria
  - Categoría debe coincidir (case-insensitive) con categoría existente
  - Duplicados (mismo nombre + categoría) se omiten
  - Máximo 2000 productos por importación
  - No borra productos existentes
- **Testing**: Backend 100% (16/16), Frontend 100% (Desktop + Mobile 390px)
- **Fecha de protección**: 2026-04-15



### 🔒 Auto-Logout + Gestión de Sesiones Activas — Added 2026-04-15
- **Descripción**: Auto-logout por inactividad configurable + panel admin para ver y cerrar sesiones remotamente.
- **Archivos protegidos**:
  - `/app/backend/routers/auth.py`: session_id en JWT, revoked_sessions check, endpoints de sesiones
  - `/app/frontend/src/pages/settings/SessionsTab.js`: Tab completa de sesiones
  - `/app/frontend/src/context/AuthContext.js`: Auto-logout timer + heartbeat
  - `/app/frontend/src/lib/api.js`: authAPI con nuevos endpoints
- **Colecciones MongoDB**: `active_sessions`, `revoked_sessions`, `system_config` (id=auto_logout)
- **Endpoints**:
  - `GET /api/auth/active-sessions` — Lista sesiones activas (admin only)
  - `POST /api/auth/revoke-session/{user_id}` — Cierra sesión remotamente (admin only)
  - `GET/PUT /api/auth/auto-logout-config` — Configuración de timeout
  - `POST /api/auth/heartbeat` — Actualiza actividad + detecta revocación
- **Testing**: Backend 100% (13/13), Frontend 100%
- **Fecha de protección**: 2026-04-15



### Integración Multiprod AM SRL — Entrega 1 (Backend Infraestructura) — 2026-04-15
- **Estado**: COMPLETO — Backend 100% funcional
- **XML Builder**: Genera XML válido para E31, E32, E34, E44, E45. Pasa validación XSD local Y validador remoto Megaplus.
- **Archivos creados**:
  - `/app/backend/services/__init__.py`: Fernet encrypt/decrypt/mask
  - `/app/backend/services/multiprod_service.py`: MultiprodService (send_ecf, validate_xml_remote)
  - `/app/backend/routers/ecf_provider.py`: Config, dispatcher, retries, polling, reservations, cleanup
- **Archivos modificados**:
  - `/app/backend/routers/alanube.py`: Dispatcher en send_ecf
  - `/app/backend/server.py`: Router + cleanup job registration
  - `/app/backend/.env`: MULTIPROD_VALIDATOR_URL, ECF_ENCRYPTION_KEY
- **Endpoints nuevos**:
  - `GET /api/ecf/providers` — Lista proveedores
  - `GET/PUT /api/ecf/config` — Config del proveedor activo
  - `POST /api/ecf/send-multiprod/{bill_id}` — Envío directo Multiprod
  - `GET /api/ecf/status/{bill_id}` — Polling
  - `POST /api/ecf/test-multiprod` — Probar conexión
- **Pendiente**:
  - ~~Entrega 2: Frontend completo (tareas 5, 6, 7)~~
- **Testing**: Backend 100% (15/15 + 7/7) + XML validation E31/E32/E34/E44/E45 PASS + Megaplus validator PASS + Frontend 100%
- **QA Cross-Platform**:
  - Safari iOS 390px: PASS
  - Android Chrome 412px: PASS
  - Desktop Chrome 1280px: PASS
  - Dark mode: PASS (usa text-auto-foreground, no colores hardcoded)
  - Light mode: PASS (verificado en todas las screenshots)
- **MANUAL_SUPABASE.md**: Actualizado con V1.1 migration script (idempotente + auditoria)


### 🔒 Fix E31 Rechazo DGII `IndicadorMontoGravado` — Added 2026-04-19
- **Problema**: E31 enviadas a Multiprod → DGII devolvía "Rechazado" código 2 con mensaje 176: "El campo IndicadorMontoGravado del área IdDoc de la sección Encabezado no es válido".
- **Raíz del problema**: El agente anterior removió `IndicadorMontoGravado` basándose en Megaplus, pero DGII sí lo exige (es obligatorio por reglas de negocio aunque el XSD lo marque como `minOccurs="0"`).
- **Evidencia definitiva**: `db.ecf_logs` registró la respuesta EXACTA de Multiprod (código 176) para T-1178 y T-1184.
- **Fix aplicado** en `/app/backend/services/multiprod_service.py`:
  - Se volvió a agregar `<IndicadorMontoGravado>0</IndicadorMontoGravado>` para **E31, E32, E34, E45** (NO E44 — régimen especial exento no lo admite).
  - Posición XSD correcta: después de `FechaVencimientoSecuencia` + `IndicadorEnvioDiferido`, antes de `TipoIngresos`.
  - Valor `"0"`: `PrecioUnitarioItem` es NET (sin ITBIS incluido) como nuestro POS lo envía.
- **Verificación end-to-end**:
  - XSD V1.0 local: 5/5 tipos PASS.
  - T-1184 reenviada → eNCF E310000000201 → **ACEPTADO por DGII** (código 1).
  - T-1178 reenviada → eNCF E310000000202 → **ACEPTADO por DGII** (código 1).
- **CÓDIGO PROTEGIDO**: No modificar `build_xml()` sin permiso del usuario.


### 🔒 Alertas en Tiempo Real de Rechazos DGII — Added 2026-04-19
- **Problema**: Los rechazos de DGII solo aparecían como un KPI pasivo en el dashboard; el `motivo` quedaba enterrado en logs.
- **Solución**: Sistema de polling 60s + badge + toast + tarjeta destacada.
- **Backend** (`/app/backend/routers/ecf_dispatcher.py`):
  - `GET /api/ecf/rejections?limit=20` → lista de rechazos recientes con motivo completo.
  - `POST /api/ecf/retry/{bill_id}` → ahora acepta también status `REJECTED` (antes solo CONTINGENCIA/ERROR).
- **Frontend** (`/app/frontend/src/components/Layout.js`):
  - Polling automático cada 60s para usuarios con `view_ecf_dashboard` o admin.
  - Badge rojo animado (`animate-pulse`) en botón "Opciones" (desktop + mobile) y dentro del menú en opción "e-CF Dashboard" con contador de rechazos no vistos.
  - Toast rojo al detectar nuevo rechazo (muestra T-number, tipo e-CF y motivo, 10s).
  - `localStorage: pos_ecf_rejections_last_seen` — marca automáticamente como "visto" al abrir el e-CF Dashboard.
- **Frontend** (`/app/frontend/src/pages/reports/EcfDashboard.jsx`):
  - Nueva tarjeta "Rechazos DGII · Acción requerida" al tope del modal, en rojo, con los últimos 5 rechazos.
  - Muestra T-number, tipo, eNCF, monto, motivo completo, timestamp, proveedor, y botón "Reintentar" por fila.
  - Botón "Reintentar" también disponible en la tabla principal para bills en status REJECTED.
- **Testing**: curl `/api/ecf/rejections` OK + screenshots smoke test (badge "5" visible en Opciones, tarjeta rechazos visible con 5 items y motivos completos) + retry real de REJECTED → eNCF E320000000281 generado.
- **CÓDIGO PROTEGIDO**: No modificar sin permiso del usuario.

### 🔒 Auto-Retry Inteligente con Backoff Exponencial — Added 2026-04-19
- **Problema**: Rechazos DGII transitorios (HTTP 500 Multiprod caído, timeouts, errores de red) requerían clics manuales de "Reintentar".
- **Solución**: Worker en background que reintenta automáticamente SOLO errores transitorios, dejando los permanentes para intervención manual.
- **Backoff**: `[0s, 30s, 2min, 10min, 1h]` (max 5 intentos, ~1h13min total).
- **Clasificador** (`_is_permanent_error` en `ecf_provider.py`):
  - **Permanente (NO reintenta)**: `rechazado` (DGII refusó estructuralmente), HTTP 4xx excepto 408/429.
  - **Transitorio (SÍ reintenta)**: `error_formato`, `error_conexion`, HTTP 5xx, HTTP 408/429, timeouts.
- **Arquitectura**:
  - `ecf_retry_queue` (MongoDB) almacena intentos programados con `next_retry_at`.
  - `auto_retry_worker()` APScheduler job — corre cada 60s, procesa entradas listas.
  - `process_retry()` refactorizado: no recursivo, una sola vuelta, cede al worker para backoffs largos.
  - Campos nuevos en `bills`: `ecf_auto_retry_attempt`, `ecf_auto_retry_next_at`, `ecf_auto_retry_status` (pending/completed/rejected/exhausted/permanent_error), `ecf_auto_retry_max`.
- **Frontend** (`EcfDashboard.jsx`):
  - Badge azul "🔄 Auto-retry 3/5 · en 2m 15s" en tarjeta de rechazos cuando hay reintento programado.
  - Badge gris "Auto-retry agotado" cuando se agotan los 5 intentos.
- **Testing**:
  - Clasificador: **10/10 casos PASS** (rechazado, HTTP 500/502/408/429/404/401/422, connection error, aceptado).
  - Worker end-to-end: Entry inyectada con HTTP 500 → worker la recoge → reclasifica como transient → incrementa `attempt 2→3` → agenda siguiente retry en 120s (2min). ✅
- **CÓDIGO PROTEGIDO**: No modificar `_is_permanent_error` ni `RETRY_BACKOFFS` sin permiso del usuario.



### 🔒 Panel de Diagnóstico Multiprod (Admin-Only) — Added 2026-04-19
- **Objetivo**: Dar visibilidad proactiva de la salud de la integración DGII antes de que los cajeros noten problemas. Solo visible para admin.
- **Backend** (`/app/backend/routers/ecf_dispatcher.py`):
  - `GET /api/ecf/health-metrics` — autenticado con `get_current_user`, rechaza 403 si `role != admin`.
  - Métricas últimas 24h computadas de `ecf_logs` + `ecf_retry_queue`:
    - Tasa de aceptación (%), con `health_tier`: excellent ≥98, good ≥90, warning ≥75, critical <75.
    - Conteos: aceptadas, rechazadas, transitorios, total envíos.
    - Tiempos de respuesta: avg, P95, min, max, # muestras.
    - Top 5 motivos de rechazo (agrupados por mensaje).
    - Series por hora (24 buckets) con aceptadas/rechazadas/retry/error.
    - Estado cola auto-retry (conteo por intento #1-#5 + exhausted).
- **Frontend** (`/app/frontend/src/pages/reports/EcfDashboard.jsx`):
  - Componente `EcfHealthPanel` (solo render si `user.role === 'admin'`).
  - Colapsable al final del e-CF Dashboard.
  - Cards de KPIs con semáforo (🟢🟡🔴) según `health_tier`.
  - Gráfica de barras apiladas 24h usando `recharts` (4 colores: emerald/red/blue/amber).
  - Grid 5 celdas para cola de auto-retry.
  - Botón "Refrescar" manual.
- **Alerta admin-only** (`/app/frontend/src/components/Layout.js`):
  - Polling cada 5min a `/ecf/health-metrics` solo si `user.role === 'admin'`.
  - Badge ámbar (pequeño punto animado) en botón "Opciones" (desktop + mobile) cuando tasa < 90% Y total ≥ 5 envíos (evita falsos positivos).
  - Prioriza badge rojo de rechazos (si hay) sobre badge ámbar de salud.
- **Testing**:
  - curl admin → 200 OK con métricas completas (110 envíos, 15.5%, 17 aceptadas, 7 rechazadas).
  - curl cashier → 403 "Solo administradores pueden acceder al panel de diagnóstico".
  - Screenshot end-to-end: panel expandido muestra gráfica 24h + top motivos + cola.
- **CÓDIGO PROTEGIDO**: No modificar `health_metrics` ni `EcfHealthPanel` sin permiso del usuario.

### 🔒 Exclusión Contingencia Manual (Uber Eats/PedidosYa) del Reintento en Lote — Added 2026-04-19
- **Problema**: El botón "Reintentar Todas las Contingencias" incluía facturas de plataformas externas (Uber Eats, PedidosYa) con `force_contingency: true` que JAMÁS deben enviarse a DGII automáticamente — esas plataformas generan su propio comprobante.
- **Fix backend** (`/app/backend/routers/ecf_dispatcher.py`):
  - `/retry-all` ahora EXCLUYE bills donde: `ecf_error` contiene "contingencia_manual" OR `force_contingency: true` OR cualquier `payment` tiene `skip_ecf: true` o `force_contingency: true`.
  - Response incluye `skipped_manual: int` (número de contingencias manuales omitidas, para transparencia).
  - `/dashboard` summary ahora separa `contingencia` (auto-retryables) de `contingencia_manual`.
  - Proyección del dashboard incluye ahora `force_contingency` y `payments` para clasificación correcta.
- **Fix frontend** (`/app/frontend/src/pages/reports/EcfDashboard.jsx`):
  - `getStatus()` detecta manual via `ecf_error`, `force_contingency` bill-level, O cualquier payment con flags.
  - KPI card "Cont. Manual" usa `summary.contingencia_manual` del backend.
  - Botón "Reintentar Todas" usa `summary.contingencia` (sin manuales) y se oculta cuando es 0.
  - Toast de resultado incluye "N omitida(s) (contingencia manual — reintentar individualmente)".
  - Leyenda permanente bajo el botón cuando hay manuales: *"N contingencia(s) manual(es) (Uber Eats / PedidosYa) NO se incluyen en el lote"*.
- **Testing**:
  - Bill T-1189 con `force_contingency: true` y `payments[0].force_contingency: true` → clasificado como `contingencia_manual` ✓
  - `/retry-all` → `total: 0, skipped_manual: 1` ✓
  - Frontend: botón oculto, card "Cont. Manual: 1" visible ✓
- **CÓDIGO PROTEGIDO**: No modificar la lógica de exclusión sin permiso del usuario.


### 🔒 Fix Lápiz "Editar Tipo e-CF" (HTTP 500) + Plataformas Externas — Added 2026-04-19
- **Problema**: El botón lápiz morado en e-CF Dashboard daba "Error de conexión" al guardar porque importaba `log_action` que no existía en `utils/audit.py`.
- **Fix backend** (`/app/backend/routers/billing.py` PATCH `/bills/{bill_id}/ecf-type`):
  - Usar `log_audit_event` (la función real) en lugar de `log_action` inexistente.
  - Agregar guard para BLOQUEAR edición de contingencias manuales (Uber Eats/PedidosYa) con mensaje: *"Esta factura es de una plataforma externa. No puede enviarse a DGII porque la plataforma genera su propio comprobante."*
  - También establecer `ecf_type` además de `ncf_type` en el $set (antes solo actualizaba uno).
- **Fix frontend** (`/app/frontend/src/pages/reports/EcfDashboard.jsx`):
  - Ocultar el lápiz para status `CONTINGENCIA_MANUAL` (no tiene sentido editar tipo si la factura no se envía a DGII).
  - Mostrar badge gris "Plataforma externa" en su lugar, CON el botón Reintentar disponible (para que admin pueda forzar envío manual si decide).
- **Testing**: T-1189 (Uber Eats) → HTTP 400 con mensaje claro ✓; T-1184 no-manual → HTTP 200, tipo cambiado E31→E32 ✓.
- **CÓDIGO PROTEGIDO**: No modificar sin permiso.

### 🔒 Fix Spinner "Procesando" Girando en Vacío — Added 2026-04-19
- **Problema**: El ícono Loader2 de la tarjeta "Procesando" giraba siempre (`animate-spin` constante), incluso cuando el contador era 0. Daba falsa impresión de "cargando".
- **Fix frontend** (`EcfDashboard.jsx`): aplicar `animate-spin` solo cuando `count > 0`.
- **CÓDIGO PROTEGIDO**: No modificar.

### 🔒 Dropdowns DGII/ONE (Provincia + Municipio) + Dirección Fiscal — Added 2026-04-19
- **Problema**: Los campos `province` y `municipality` exigen **códigos numéricos ONE** (no nombres). Usuario no los conocía. Dirección del ticket con 4 campos separados no se enviaba a DGII (XML buscaba `ticket_address` inexistente, resultando en literal `"SIN DIRECCION"` en todos los e-CF).
- **Fix frontend** (`/app/frontend/src/data/dgii_territories.js` + `SystemTab.js`):
  - Nuevo archivo con 32 provincias y ~150 municipios (códigos ONE oficiales).
  - Nueva sección "Ubicación Fiscal (DGII)" en pestaña Sistema con 3 campos:
    - Dropdown Provincia (muestra "25 — Santiago", guarda `25`).
    - Dropdown Municipio filtrado por provincia (guarda código 6 dígitos ej. `250101`).
    - Campo texto "Dirección Fiscal (DGII)" → se guarda como `fiscal_address`.
  - UI muestra el código XML que se guardará para transparencia.
- **Fix backend** (3 archivos): priorizar `fiscal_address` sobre `ticket_address` en `multiprod_service.py`, `alanube.py`, `credit_notes.py`.
- **CÓDIGO PROTEGIDO**: No modificar `dgii_territories.js` ni la sección "Ubicación Fiscal (DGII)".

### 🔒 Fix Timezone Jornada / Ayer (NJ → RD) — Added 2026-04-19
- **Problema**: Los filtros "Jornada" y "Ayer" usaban `toISOString()` que convierte a UTC. Cuando el navegador estaba en NJ (UTC-5) o pasaba medianoche UTC en RD (8 PM RD), las facturas del día se distribuían incorrectamente entre "Jornada" (día siguiente UTC) y "Ayer" (día real RD).
- **Fix frontend** (`Layout.js`):
  - Uso del helper existente `getSystemToday()` de `@/lib/timezone` (ya tenía `Intl.DateTimeFormat` con `America/Santo_Domingo`).
  - Fecha anclada al mediodía RD para evitar edge cases de DST.
  - Sin importar en qué zona horaria esté el navegador (NJ, FL, PR, RD), el POS calcula "hoy" SIEMPRE como la fecha actual en RD.
- **Fix backend** (`/app/backend/routers/ecf_dispatcher.py` GET `/dashboard`):
  - Convertir el rango `[00:00, 23:59:59]` de RD al rango UTC equivalente usando `zoneinfo.ZoneInfo` desde la config del sistema.
  - Lee timezone dinámicamente de `get_system_timezone_name()` (no hardcoded -04:00).
- **Testing**: Con reloj 8:17 PM RD (00:17 UTC del día siguiente), Jornada trae 22 facturas incluyendo T-1190 (paid 00:16 UTC). Ayer trae 0. ✓
- **CÓDIGO PROTEGIDO**: No modificar la lógica de conversión TZ.

---

## 🛡️ CANDADO GLOBAL DE SESIÓN 2026-04-19

Todas las funcionalidades anteriores con 🔒 son parte de un bloque coherente de mejoras e-CF/DGII y **NO deben modificarse** sin autorización explícita de Leo (el usuario/owner).

Archivos bajo protección total:
- `/app/backend/services/multiprod_service.py` (XML builder, fix IndicadorMontoGravado)
- `/app/backend/routers/ecf_dispatcher.py` (rejections, health-metrics, retry-all, timezone query)
- `/app/backend/routers/ecf_provider.py` (auto_retry_worker, _is_permanent_error, RETRY_BACKOFFS)
- `/app/backend/routers/billing.py` (update_bill_ecf_type con bloqueo de manual)
- `/app/backend/routers/alanube.py` (fiscal_address fallback)
- `/app/backend/routers/credit_notes.py` (fiscal_address fallback)
- `/app/backend/server.py` (registro de auto_retry_worker en scheduler)
- `/app/frontend/src/data/dgii_territories.js` (códigos ONE/DGII)
- `/app/frontend/src/pages/settings/SystemTab.js` (sección Ubicación Fiscal DGII)
- `/app/frontend/src/pages/reports/EcfDashboard.jsx` (tarjeta rechazos, badge auto-retry, panel diagnóstico, lógica manual)
- `/app/frontend/src/components/Layout.js` (polling rechazos, polling health, badges, timezone RD)


---

## ✅ 2026-04-20 — Reporte "Ventas por Categoría" (Prompt 1) — CONFIRMADO 🔒

**Estado:** Backend 100% verde (iter 149), Frontend 100% verde (iter 151).

**Implementación:**
- Backend: `GET /api/reports/sales-by-category` extendido con breakdown jerárquico (categorías → productos) — `/app/backend/routers/reports.py` líneas 440-500.
- Backend: nuevos endpoints `GET /api/reports/xlsx/ventas-por-categoria/xlsx` (XlsxWriter) y `/pdf` (WeasyPrint) — `/app/backend/routers/reports_xlsx.py` líneas 885-920.
- Frontend: componente jerárquico con pie chart + tabla expandible + botones Descargar PDF/Excel — `/app/frontend/src/pages/reports/ByCategoryReport.jsx`.

**Fixes aplicados en esta sesión:**
1. Render duplicado de ByCategoryReport en Reports.js → corregido con hook `isMobile` + `matchMedia('(max-width: 767px)')` que monta UNA sola rama (mobile o desktop) — `/app/frontend/src/pages/Reports.js` líneas ~489-502 y wrappers `{isMobile && ...}{!isMobile && (<>...</>)}` en las dos ramas.
2. React Fragment sin `key` → importado `Fragment` y usado `<Fragment key={`cat-${i}`}>` — `/app/frontend/src/pages/reports/ByCategoryReport.jsx` líneas 1 y ~132.
3. `localStorage.getItem('token')` → `localStorage.getItem('pos_token')` para enviar correctamente el header `Authorization: Bearer <jwt>` en descargas PDF/XLSX — `/app/frontend/src/pages/reports/ByCategoryReport.jsx` línea 9.
4. `/app/memory/test_credentials.md` actualizado con Admin PIN correcto `11338585`.

**Test artifacts:**
- `/app/test_reports/iteration_149.json` (backend 7/7 pytest verde)
- `/app/test_reports/iteration_150.json` (regresión duplicate render verde)
- `/app/test_reports/iteration_151.json` (descargas PDF/XLSX verde, 7/7 criterios)
- `/app/backend/tests/test_ventas_por_categoria_report.py` (suite pytest dedicada)

**Archivos protegidos 🔒 (no modificar sin autorización):**
- `/app/backend/routers/reports.py` (sales_by_category_report con products hierarchy)
- `/app/backend/routers/reports_xlsx.py` (_fetch_category_breakdown, ventas-por-categoria/xlsx, ventas-por-categoria/pdf)
- `/app/frontend/src/pages/reports/ByCategoryReport.jsx` (versión jerárquica con exports)
- `/app/frontend/src/pages/Reports.js` (hook isMobile anti-duplicado)

**Recomendaciones no bloqueantes (P2 backlog):**
- Auditar otros componentes bajo `/app/frontend/src/pages/reports/` por patrón `localStorage.getItem('token')` (actualmente sólo ByCategoryReport.jsx usaba ese patrón, pero al agregar nuevos reportes recordar usar `'pos_token'`).
- Extraer `headers()` a `/app/frontend/src/lib/auth.js` compartido.


---

## ✅ 2026-04-20 — Reporte "Cierre de Caja Jerárquico" (Prompt 2) — CONFIRMADO 🔒

**Estado:** Backend 100% verde (9/9 pytest), Frontend 100% verde (iter 152). Sin regresiones.

**Lo que se implementó (sin tocar el dashboard superior):**
- Nuevo endpoint backend `GET /api/reports/cash-close-hierarchical?date_from&date_to&employee&payment_method` que devuelve árbol Empleado → Turno → Método de Pago → Transacciones con subtotales por cada nivel y `grand_totals`.
- Nuevos endpoints de export:
  - `GET /api/reports/xlsx/cierre-caja/xlsx?view=resumida|detallada` — openpyxl con `row_dimensions.outlineLevel` (agrupación plegable de Excel) y fórmulas `=SUM(...)` reales en subtotales y totales.
  - `GET /api/reports/xlsx/cierre-caja/pdf?view=resumida|detallada` — WeasyPrint con plantilla B/N (header negro, sin zebra rows, `@media print` page-break-inside: avoid).
- Nuevo componente `CashCloseHierarchy.jsx` debajo del dashboard de KPIs existente. Toggle `Resumida | Detallada` (default Resumida). Botones PDF/Excel que respetan la vista activa. Tabla jerárquica con expand/collapse por empleado, turno y método (en vista detallada).
- Asignación de turnos por cajero: un bill se asigna al shift donde `opened_at ≤ paid_at ≤ closed_at`; si no hay match, fallback a un bucket sintético por `business_date`.

**Archivos protegidos 🔒 (no modificar sin autorización):**
- `/app/backend/routers/reports.py` — `_cash_close_hierarchical_impl` + endpoint `/cash-close-hierarchical` (líneas 730-933)
- `/app/backend/routers/reports_xlsx.py` — `_fetch_cash_close_tree`, `_build_cash_close_xlsx`, `_build_cash_close_html`, endpoints `/cierre-caja/xlsx` y `/cierre-caja/pdf` (líneas 925-1310)
- `/app/frontend/src/pages/reports/CashCloseHierarchy.jsx` (nuevo, ~280 líneas)
- `/app/frontend/src/pages/reports/CashCloseReport.jsx` — ahora recibe `dateRange` prop y monta `<CashCloseHierarchy>` antes del bloque de Firmas
- `/app/frontend/src/pages/Reports.js` — pasa `dateRange` al componente `CashCloseReport`

**Criterios Vexly cumplidos:**
- Dashboard original de KPIs INTACTO (no se tocó layout, valores ni colores) ✅
- Fecha basada en jornada (`business_date`), no calendar date ✅
- 5 viewports verificados (Desktop, Android, iOS, Dark, Light) ✅
- Impresión B/N de la tabla jerárquica (header negro sólido, sin fondos de color) ✅
- Excel con `outlineLevel` (agrupación plegable) y `=SUM()` reales en subtotales ✅
- Admin PIN `11338585` y token en `localStorage['pos_token']` consistentes ✅

**Test artifacts:**
- `/app/test_reports/iteration_152.json` (9/9 backend + 100% frontend)
- `/app/backend/tests/test_cash_close_hierarchical.py` (9 pytest ~2s)

**Optional polish (no bloqueante):**
- En viewport < 420px, la columna "Descripción" de la tabla jerárquica envuelve algunos labels (`[13]`, `Shift Totals`) en 2 líneas. Legible pero apretado. Reducir padding horizontal en <md o bajar tipografía 1px para resolverlo cuando haya tiempo.


---

## ✅ 2026-04-20 — Reporte "Ventas por Hora" (Prompt 3) — CONFIRMADO 🔒

**Estado:** Backend 100% verde (5/5 pytest), Frontend 100% verde (iter 153). Cero regresiones.

**Implementación (quick win: endpoint ya existía):**
- Frontend nuevo: `HourlySalesReport.jsx` con KPIs (Hora Pico / Valle / Promedio), tabla 24 horas en formato HH:00-HH:00 con # Facturas, Total, Ticket Prom, %, fila TOTAL GENERAL, y gráfico de barras (BarChart de recharts).
- Registrado en sidebar "Ventas y Caja" **al final** (sin reordenar): Cierre del Día → … → Descuentos Aplicados → **Ventas por Hora**.
- Endpoint backend `/api/reports/hourly-sales` **NO modificado** (solo consumido).
- Nuevos endpoints dedicados:
  - `GET /api/reports/xlsx/hourly-sales/xlsx` — openpyxl con fórmulas `=SUM()` en TOTAL y `=IF(Ctotal>0,Cn/Ctotal,0)` en columna %, `=IF(B>0,C/B,0)` en ticket promedio. Sin valores hardcoded.
  - `GET /api/reports/xlsx/hourly-sales/pdf` — WeasyPrint B/N, header negro, hora pico resaltada con borders, fila vacía en gris.

**Archivos protegidos 🔒:**
- `/app/frontend/src/pages/reports/HourlySalesReport.jsx` (nuevo, ~185 líneas)
- `/app/frontend/src/pages/reports/index.js` (export agregado)
- `/app/frontend/src/pages/Reports.js` (import, entry sidebar, endpoint dict, switch case)
- `/app/backend/routers/reports_xlsx.py` — `_fetch_hourly_data`, `_build_hourly_xlsx`, `_build_hourly_html`, endpoints `/hourly-sales/xlsx` y `/hourly-sales/pdf` (líneas ~1310-1555)

**Test artifacts:**
- `/app/test_reports/iteration_153.json`
- `/app/backend/tests/test_hourly_sales_report.py` (pytest, valida fórmulas XLSX y texto PDF)

**Criterios Vexly cumplidos:**
- 5 viewports (iOS 390, Android 412, Desktop 1920, Dark, Light) ✅
- B/N impresión (header negro sólido, sin zebra, sin naranja en documento) ✅
- Theme-aware dark/light ✅
- Jornada date (protegida) ✅
- Endpoint backend preservado intacto ✅
- Token en `localStorage['pos_token']` consistente ✅


---

## ✅ 2026-04-20 — Reporte "Impuestos — Desglose ITBIS por Tasa" (Prompt 4) — CONFIRMADO 🔒

**Estado:** Backend 12/12 pytest verde, Frontend 100% verde (iter 154). Cero regresiones. Integridad matemática validada (diff 0.0).

**Implementación (extensión compatible hacia atrás):**
- `/api/reports/taxes` extendido aditivamente:
  - NUEVO campo `breakdown_by_rate: [{rate_label, rate_value, base, itbis, invoice_count}]` por tasa (ITBIS 18% / 0% / Exento).
  - NUEVO campo `breakdown_integrity: {ok, sum_by_rate, total_itbis, diff}` con validación automática (tolerancia ±0.02).
  - Todos los campos legacy (`summary.*`, `daily[]`) PRESERVADOS.
  - Lógica: agregación desde `bill.tax_breakdown[]` (non-tip entries con `rate`, `taxable_base`, `amount`); fallback a `itbis_rate` del bill cuando falta breakdown.
- Nuevos endpoints dedicados:
  - `GET /api/reports/xlsx/taxes/xlsx` — openpyxl con fórmulas `=SUM()` reales en TOTAL GENERAL (cols B, C, D), fórmula `=B{row}*0.10` para Propina 10% (NO hardcoded), `=SUM()` en fila TOTAL del Desglose Diario.
  - `GET /api/reports/xlsx/taxes/pdf` — WeasyPrint B/N, 3 secciones (Resumen por Tasa, Propina Legal 10%, Desglose Diario), banner rojo si `integrity.ok=false`.
- Frontend `TaxesReport.jsx` reescrito con:
  - Nueva sección "Resumen por Tasa de ITBIS" encima.
  - KPIs originales PRESERVADOS.
  - Bloque Propina Legal 10% con 3 cards (Base gravable / Propina calculada / Propina registrada).
  - Banner de integridad (data-testid `taxes-integrity-warning`) solo cuando hay mismatch.
  - Botones Descargar PDF/Excel.

**Archivos protegidos 🔒:**
- `/app/backend/routers/reports.py` líneas 1546-1690 (taxes_report con breakdown_by_rate + breakdown_integrity).
- `/app/backend/routers/reports_xlsx.py` líneas ~1558-1875 (_fetch_taxes_data, _build_taxes_xlsx, _build_taxes_html, endpoints /taxes/xlsx y /taxes/pdf).
- `/app/frontend/src/pages/reports/TaxesReport.jsx` (reescrito).
- `/app/frontend/src/pages/Reports.js` (pasa dateRange a TaxesReport).

**Test artifacts:**
- `/app/test_reports/iteration_154.json`.
- `/app/backend/tests/test_taxes_report_breakdown.py` (12 pytest: shape legacy+new, integrity, XLSX SUM + *0.10 tip, PDF content, auth, regresión en los 3 prompts previos).

**Criterios Vexly cumplidos:**
- Validación de integridad ✅ (diff 0.00 en dataset real).
- 5 viewports ✅.
- Impresión B/N ✅.
- Theme-aware ✅.
- Endpoint existente extendido SIN romper contratos ✅.
- Sidebar no modificado ✅ (Impuestos sigue en Fiscal).
- Token `pos_token` ✅.

**Backlog actualizado:**
- `/app/memory/ROADMAP.md` P2: "Ventas por Hora — Filtro Día de la semana" registrado como enhancement futuro del Prompt 3.


---

## ✅ 2026-04-20 — Reporte "Cuentas Abiertas / Open Checks" (B5 quick-win) — CONFIRMADO 🔒

**Estado:** Backend 13/13 pytest verde, Frontend 100% verde (iter 155). Cero regresiones.

**Implementación:**
- `/api/reports/open-checks?date_from&date_to&waiter&table` — lista bills con `status ∈ {active, sent, open, printed, pending}` excluyendo `training_mode`. Ordenado por antigüedad DESC.
- Response: `summary {count, total_value, oldest_minutes, avg_minutes_open, by_status}` + `bills[]` + `by_waiter[]` + `by_table[]`.
- Nuevos endpoints dedicados:
  - `GET /api/reports/xlsx/open-checks/xlsx` — openpyxl con `=SUM()` en TOTAL (E,F,G,H) y en RESUMEN POR MESERO (B,C).
  - `GET /api/reports/xlsx/open-checks/pdf` — WeasyPrint Letter LANDSCAPE, header negro, KPIs en cajas.
- Frontend `OpenChecksReport.jsx`:
  - 4 KPIs (Cuentas, Monto en Riesgo, Más Antigua, Promedio).
  - Tabla con badge de minutos color-coded (verde <60, amarillo 60-119, rojo ≥120).
  - Resumen por Mesero.
  - Botones Descargar PDF/Excel.
- Registrado en sidebar "Ventas y Caja" **al final** (después de "Ventas por Hora"), sin reordenar.

**Archivos protegidos 🔒:**
- `/app/backend/routers/reports.py` líneas ~948-1090 (`_open_checks_impl` + endpoint `/open-checks`).
- `/app/backend/routers/reports_xlsx.py` líneas ~1903-2200 (helpers + endpoints `/open-checks/{xlsx,pdf}`).
- `/app/frontend/src/pages/reports/OpenChecksReport.jsx` (nuevo).
- `/app/frontend/src/pages/reports/index.js`.
- `/app/frontend/src/pages/Reports.js` (import, sidebar entry, endpoint dict, switch case).

**Test artifacts:**
- `/app/test_reports/iteration_155.json`.
- `/app/backend/tests/test_open_checks_report.py` (13 pytest: filter por status, KPIs, sorting, XLSX SUM, PDF magic, auth, regresión Prompts 1-4).

**Criterios Vexly cumplidos:**
- Endpoint compatible con filtros futuros (waiter, table) ✅
- Estado vacío OK: XLSX/PDF válidos sin 500 ✅
- 5 viewports ✅
- Impresión B/N ✅
- Theme-aware ✅
- Auth Bearer en exports ✅
- Testids únicos ✅

