# VexlyPOS — Changelog


## 2026-04-23 — Buscador en Promociones y Combos 🎯🎁
- **Completa la consistencia** en los 5 sub-tabs de Config. Productos: Categorías · Productos · Modificadores · **Promociones** · **Combos** ahora todos con el mismo patrón de buscador.
- **Archivos**:
  - `/app/frontend/src/pages/settings/PromotionsTab.js` — `data-testid="promotion-search-input"`, busca por nombre Y descripción.
  - `/app/frontend/src/pages/settings/CombosTab.js` — `data-testid="combo-search-input"`, busca por nombre Y descripción.
- **Features idénticas**: lupa, placeholder, kbd `/`, X para limpiar, contador "N resultado(s)", empty state, dark/light. Auto-captura del atajo global `/`.
- **Verificación E2E** (Desktop + Mobile):
  - Promociones: "combo" → Happy Hour Combos · "cerveza" → Happy Hour (match por descripción) · "zzzz" → empty · clear → 2 cards · `/` enfoca ✅
  - Combos: "test" → Combo Test · "zzzz" → empty · `/` enfoca ✅



## 2026-04-23 — Buscador inteligente en Config. Productos → Modificadores 🔍🧩
- **Problema**: la pestaña Modificadores no tenía filtro; con muchos grupos/opciones se perdía tiempo haciendo scroll.
- **Archivo**: `/app/frontend/src/pages/settings/InventarioTab.js`
- **Features**:
  - Input con lupa, placeholder "Buscar modificador..." + kbd badge `/` + botón X.
  - **Búsqueda dual**: matchea por nombre del grupo **O** por nombre de cualquier opción interna (ej: "cebolla" encuentra el grupo "SIN" que contiene la opción CEBOLLA).
  - Contador "N resultado(s)", empty state con icono, dark/light support nativo via tokens del tema.
  - `data-testid="modifier-search-input"` → automáticamente capturado por el atajo global `/`.
- **Verificación E2E** (Desktop 1366×900 · Mobile 390×844 · Dark · Light):
  - "sal" → SALSAS (1 resultado)
  - "cebolla" → SIN (match por opción interna)
  - "zzzz" → empty state
  - Clear → 4 cards visibles de nuevo
  - `/` shortcut enfoca el input correctamente
- **Scope respetado**: sin tocar backend, Supabase, .env, otras pestañas, PaymentScreen, OrderScreen, ni lógica e-CF.



## 2026-04-23 — Atajo `/` global extendido a toda la app 🌐⌨️
- **Feature**: listener global único que enfoca el primer buscador visible de la página actual con solo presionar `/`.
- **Componente nuevo**: `/app/frontend/src/components/GlobalSearchShortcut.jsx` (~35 líneas, retorna `null`).
- **Convención**: detecta cualquier `input[data-testid*="search"]` visible (no hidden, no disabled, offsetParent definido). Respeta guardrails: ignora si el usuario ya está escribiendo en un input/textarea/select/contentEditable, y si combina Ctrl/Meta/Alt.
- **Montaje**: `App.js` dentro de `BrowserRouter`, fuera de `Layout` (respeta CÓDIGO PROTEGIDO — no se tocó Layout).
- **Limpieza**: eliminado listener local duplicado en `InventarioTab.js`.
- **Inputs normalizados con testid + kbd badge** para descubribilidad:
  - `customer-search-input` (Customers.js — antes `customer-search`)
  - `search-input` (BillHistory.js — ya existía, se añadió kbd badge)
  - `category-search-input`, `product-search-input` (ya tenían badge)
- **QA E2E**: 5/5 rutas verificadas (Customers, BillHistory, Categorías, Productos, Dashboard como negativo). Literal `/` dentro de input preservado como carácter (no se hijackea). Dashboard sin search → activeElement permanece BODY.
- **Compatibilidad automática futura**: cualquier nuevo input que incluya `search` en su data-testid será capturado por el atajo sin código extra.



## 2026-04-23 — Atajo de teclado `/` para buscador de Categorías y Productos ⌨️🚀
- **Feature**: presionar `/` en cualquier lugar del tab Config. Productos enfoca automáticamente el campo de búsqueda activo (Categorías o Productos según la subpestaña).
- **Archivos**:
  - `/app/frontend/src/pages/settings/InventarioTab.js`: listener global `window.keydown` con guardrails (ignora si `Ctrl/Meta/Alt` o si ya hay un input/textarea/select/contentEditable activo). Dispatch a `category-search-input` o `product-search-input` según `inventarioSubTab`.
  - Badge `<kbd>/</kbd>` agregado en ambos inputs (Categorías y Productos) cuando el input no está enfocado y está vacío — `hidden sm:inline-flex` para no saturar móviles.
  - `/app/frontend/src/components/MenuTilesSorter.jsx`: kbd badge análogo.
- **Verificado E2E**: typing "/" fuera de input enfoca el input correcto; typing "/" dentro del input inserta el carácter literalmente (no se hijackea); tab-aware (en Categorías enfoca cat, en Productos enfoca prod); funciona igual en dark/light/mobile.



## 2026-04-23 — Buscador inteligente en Config. Productos → Categorías 🔍📂
- **Problema**: con muchas categorías había que hacer scroll manual para encontrarlas. No existía filtro.
- **Archivo**: `/app/frontend/src/components/MenuTilesSorter.jsx`
- **Features**:
  - Input con ícono lupa + placeholder "Buscar categoría..." + botón X para limpiar.
  - Filtro en tiempo real por nombre (case-insensitive), case-insensitive, cubre también tiles virtuales (Combos, Artículos Libres).
  - Contador dinámico: "N resultado(s)".
  - Estado vacío: icono de lupa + texto "No se encontraron categorías".
  - **Drag-and-drop auto-deshabilitado mientras el filtro está activo**: el handle de arrastre se transforma en ícono `Lock` con cursor `not-allowed` y `useSortable({disabled:true})`. Hint sutil "Limpia el filtro para reordenar" al lado del contador.
  - Al limpiar con X: reactiva drag-and-drop y muestra todas las tiles.
- **Pestaña Productos**: el buscador ya existía desde antes con el mismo patrón visual (`product-search-input`), se dejó sin tocar.
- **Verificado** en 4 escenarios (Desktop 1366×900, Mobile 390×844, Dark mode, Light mode):
  - "ham" → 1 resultado · HAMBURGUESA
  - "cer" → 1 resultado · CERVEZAS
  - "zzzz" → empty state con icono
  - Limpiar → 4 tiles (incluyendo Combos + Artículos Libres)
  - Drag deshabilitado con Lock icon mientras filtro activo; reactivado al limpiar



## 2026-04-23 — FIX CRÍTICO: Footer Sticky FACTURAR en PaymentScreen 💰📌
- **Problema**: en laptops (1366×768) y tablets pequeñas, los botones CANCELAR / FACTURAR quedaban "debajo del fold" al final del panel izquierdo. El cajero debía hacer scroll para cobrar, lo cual es inaceptable en hora pico.
- **Fix** (`pages/PaymentScreen.js`):
  - Los botones de acción se movieron fuera del panel scrollable izquierdo y se envolvieron en un nuevo footer sticky a nivel del root `<div h-full flex flex-col overflow-hidden>`.
  - El footer usa `shrink-0`, `border-t`, `backdrop-blur-xl`, `paddingBottom: env(safe-area-inset-bottom)` para respetar notch iOS.
  - Incluye resumen compacto (Total · Recibido · Cambio/Falta) + botón CANCELAR (w-24 / w-32) y botón FACTURAR (flex-1) con estado verde/gris + spinner.
  - `data-testid="payment-sticky-footer"` para QA.
- **Verificación visual** en 4 viewports (Laptop 1366×768, Desktop 1920×1080, iPad 768×1024, Mobile 390×844):
  - Footer anclado al borde inferior exacto (±2px) en los 4 tamaños.
  - Botón FACTURAR siempre dentro del viewport, clickeable sin scroll.
  - Panel izquierdo (items + desglose + redención de puntos) sigue scrolleando independientemente.
- **Beneficio operativo**: cashiers ya no pierden segundos buscando el botón — mejora directa en throughput en hora pico de restaurantes con laptops 14" (1366×768 es el caso dominante en RD).



## 2026-04-22 — Fix: Botón Orden Rápida en Mobile 📱
- **Problema**: en móvil (<768px), el FAB flotante en bottom-right quedaba cortado por la barra inferior del navegador (Safari iOS) y por la tab bar de VexlyPOS. Era inutilizable en iPhone/Android.
- **Fix** (`QuickOrderFab.jsx`): el componente acepta ahora prop `inline`:
  - Por defecto renderiza el FAB flotante en `hidden md:block` (solo desktop/tablet).
  - En modo `inline` renderiza un botón compacto h-9 con mismo gradient naranja pero pensado para barras.
  - Badge de contador soporta ambas posiciones.
- **Integración** (`TableMap.js`): inline se monta al lado del botón "Editar" envuelto en `<div className="md:hidden">`, solo visible cuando no está en `editMode`.
- **Verificado** en viewports 375×812 (iPhone) y 1920×900 (desktop): layout mobile `[🔒 Editar] [⚡ Orden Rápida]` alineados en misma fila; FAB flotante oculto en mobile; desktop mantiene comportamiento original. Dialog de creación funciona desde ambas variantes.



## 2026-04-22 — Admin Panel de Tours + Badges "NUEVO" 🏷️✨
- **Objetivo**: que el dueño/gerente vea en Config → Usuarios cuáles tours están disponibles, su estado (pendiente/en progreso/completado), y cuáles son NUEVOS desde que el dispositivo se activó.
- **Versionado** (`lib/tours.js`):
  - Cada tour ahora declara `version: N` y `releasedOn: 'YYYY-MM-DD'`.
  - Nuevo storage `vexly_tour_<key>_v` guarda la versión completada.
  - `vexly_tours_first_seen_at` marca cuándo el dispositivo usó el sistema por primera vez (auto-set en el mount).
  - Helper `isTourNew(key)`: retorna `true` si `releasedOn >= firstSeenAt` Y el usuario no lo ha completado en la versión actual.
  - Helper `getCompletedVersion(key)` para mostrar "v1 vista" en el estado.
  - `resetTour` y `resetAllTours` ahora limpian también la versión.
- **Admin UI** (`pages/settings/UsersTab.js` → nuevo `<ToursAdminPanel />`):
  - Grid de 2 columnas con 1 card por tour.
  - Cada card: nombre, badge `NUEVO` (si aplica), pill `vN`, estado color-coded (Pendiente/En progreso/Completado), fecha de lanzamiento + nº pasos, botón "Reiniciar" individual.
  - Header con contador `{N} NUEVOS` + botón global "Reiniciar todos".
- **Verificado E2E**: fresh device muestra `7 NUEVOS` y 7 badges individuales. Completar 1 tour → contador baja a `6 NUEVOS`, el card completado pierde badge y muestra "Completado · v1 vista" en verde.
- **Uso futuro**: cuando agreguemos un tour nuevo (ej: Módulo Contable), solo hay que declararlo con `releasedOn` del día de lanzamiento y aparecerá automáticamente como `NUEVO` para todos los admins que ya tienen el sistema instalado.



## 2026-04-22 — Refactor: Sistema Genérico de Feature Tours 🎓🔄
- **Objetivo**: escalar el onboarding de Orden Rápida a un sistema reutilizable que cubra features existentes y futuros.
- **Arquitectura**:
  - `src/lib/tours.js` (registro central, ~180 líneas): objeto `TOURS` donde cada tour declara `name`, `permissions` (al menos uno), `extraPermissions` (AND strict), y `steps` (route + CSS selector + placement + title + body).
  - `src/components/FeatureTour.jsx` (engine reusable, ~180 líneas): overlay con pulse ring + tooltip posicionado smart, lee progreso desde `localStorage.vexly_tour_<key>`, avanza automáticamente y cierra con flag "done".
  - Migración automática del key legacy `vexly_quick_order_tour_step` → `vexly_tour_quick_order` (usuarios que ya lo vieron no lo reviven).
  - Hardened con try/catch en `querySelector` por si el selector es inválido (prevención de runtime errors).
- **7 tours registrados**:
  1. **quick_order** (3 pasos): FAB → order screen → queue badge.
  2. **combos** (2 pasos): cat-card-combos → settings tabs.
  3. **modifiers** (2 pasos): settings → category-grid.
  4. **open_items** (2 pasos): cat-card-open-items → reports.
  5. **loyalty** (2 pasos): customers list → categoría en /tables.
  6. **table_map** (1 paso): botón Editar en /tables.
  7. **business_day** (1 paso): card de jornada en /dashboard.
- **Admin UI**: botón **"Reiniciar tours"** en Config → Usuarios (footer), con copy explicando el uso para capacitar personal nuevo. Usa `resetAllTours()` exportado desde `lib/tours.js`.
- **Verificado E2E**: limpiar flags → visita /tables muestra tour quick_order; marcar done manualmente → siguiente tour disponible aparece en su route correspondiente; botón "Reiniciar tours" visible para admin; ningún runtime error detectado.
- **Para agregar un tour nuevo** (cuando construyamos Módulo Contable): agregar objeto al registro `TOURS`. Zero código de overlay.
- **Archivos**: `/app/frontend/src/lib/tours.js` (nuevo), `/app/frontend/src/components/FeatureTour.jsx` (nuevo, reemplaza `QuickOrderTour.jsx` eliminado), `/app/frontend/src/components/Layout.js` (-5 +3 líneas), `/app/frontend/src/pages/settings/UsersTab.js` (+22 líneas).



## 2026-04-22 — UX: Quick Tour Interactivo para Orden Rápida 🎓
- **Objetivo**: onboarding cero-fricción para usuarios nuevos — la primera vez que aterrizan en /tables con permiso de Orden Rápida ven un tour guiado de 3 pasos que explica el feature completo.
- **Implementación** (`components/QuickOrderTour.jsx`, ~160 líneas):
  - Overlay con `createPortal` en `document.body`.
  - Pulse ring animado naranja alrededor del target + tooltip con título/body/botón "Entendido".
  - Posicionamiento inteligente (auto/below/left/right) con viewport-clamp para nunca salirse de pantalla.
  - Estado persistido en `localStorage.vexly_quick_order_tour_step` (1/2/3/done) — no molesta a usuarios que ya vieron el tour.
- **3 pasos**:
  1. `/tables` → highlight FAB ⚡ + "Úsalo para clientes que ordenan al paso…"
  2. `/order/quick/:id` → highlight header + "Agrega productos como en cualquier mesa (combos/modificadores/artículos libres), al final FACTURAR…"
  3. Vuelta a `/tables` con badge rojo visible → highlight badge + "Aquí ves tu cola. Las pagadas se auto-entregan tras 7 min…"
- **Gating**: montado en `Layout.js` solo si `hasPermission('open_table') && hasPermission('collect_payment')` — meseros sin permisos no ven nada.
- **Verificado E2E**: reset localStorage → step1 aparece con pulse + tooltip → click Entendido → flag='2' → crear orden → step2 en OrderScreen → click Entendido → flag='3' → volver a /tables → step3 en badge → click Entendido → flag='done' → reload → overlay=0 (no vuelve a aparecer). ✅
- **Reiniciar el tour** (para demos o usuarios que lo despidieron por accidente): el usuario o admin puede ejecutar `localStorage.removeItem('vexly_quick_order_tour_step')` en la consola del navegador.



## 2026-04-22 — UX: Pills de "Feature Afectada" en Roles/Permisos 🏷️
- **Problema**: el admin podía mover un switch (ej: `collect_payment`) sin saber que también afecta Orden Rápida.
- **Fix** (`pages/UserConfig.js`):
  - Nuevo mapa `PERMISSION_FEATURE_TAGS` que declara qué features depende de cada permiso:
    - `open_table` → ORDEN RÁPIDA
    - `collect_payment` → ORDEN RÁPIDA
    - `manage_sale_config` → ORDEN RÁPIDA
    - `create_open_items` → ARTÍCULOS LIBRES
  - Nuevo componente `<FeaturePills permKey={...} />` que renderiza pills discretos (uppercase 9px, bordered) al lado del label del permiso.
  - Soporta multi-tag por permiso + dark mode (paleta `orange`/`amber`).
  - Aplicado en los 3 lugares donde se editan permisos: User detail page, New Role dialog, Edit Role dialog.
- **Verificado visualmente**: en `/user/{id}` → Permisos de Cajero → Ventas se ven los pills naranjas `ORDEN RÁPIDA` junto a Abrir Mesa, Cobrar y Gestionar Ventas; pill amber `ARTÍCULOS LIBRES` junto a Crear Artículos Libres.
- **Extensibilidad**: para agregar un pill en el futuro, solo se modifica el objeto `PERMISSION_FEATURE_TAGS`.



## 2026-04-22 — Hardening: Permisos Granulares en Orden Rápida 🔐
- **Problema detectado**: PATCH de estado y PUT de config no validaban permisos (cualquier user autenticado podía). Además las verificaciones anteriores leían `user.get("permissions", {})` pero el JWT no contiene permisos.
- **Fix** (`routers/orders.py`, `routers/config.py`):
  - Los 3 endpoints ahora usan `from routers.auth import get_permissions` para cargar permisos reales del rol + overrides del usuario desde DB.
  - `POST /api/orders/quick`: `open_table` o admin.
  - `PATCH /api/orders/quick/{id}/status`: `collect_payment` o admin (mismo gate que completar el flujo).
  - `PUT /api/quick-orders/config`: `manage_sale_config` o admin (mismo gate que otras configs de Ventas).
- **Frontend** (`VentasTab.js`):
  - Subtab "Orden Rápida" solo visible si `canManageSaleConfig`.
  - Render del panel también gated.
- **Verificado E2E**:
  - Admin: todos los endpoints OK.
  - Cashier (`collect_payment=true`, sin `manage_sale_config`): crea orden + PATCH status OK, PUT config → 403.
  - Waiter (sin `collect_payment` en este tenant): PATCH status → 403; PUT config → 403.
- **Beneficio**: ahora la Orden Rápida respeta fielmente los roles personalizados del admin, sin introducir permisos nuevos.



## 2026-04-22 — Enhancement: Config UI para Auto-entregar Órdenes Rápidas 🎚️
- **Backend** (`routers/config.py`):
  - `GET /api/quick-orders/config` retorna `{auto_deliver_minutes}` (default 7).
  - `PUT /api/quick-orders/config` valida rango 1–120 min (400 fuera de rango) y persiste en `system_config`.
  - `routers/orders.py` sweep ahora lee de DB primero, con fallback a env `QUICK_ORDER_AUTO_DELIVER_MINUTES`, luego 7.
- **Frontend** (`pages/settings/VentasTab.js`):
  - Nueva subtab **"Orden Rápida"** con icono ⚡ en Configuración → Ventas.
  - Slider rango 1–30 min con etiquetas laterales y badge grande mostrando valor actual.
  - Auto-save al soltar (mouseUp/touchEnd) con toast "Guardado".
- **Verificado E2E**: GET default 7, PUT 15 persiste, PUT 200 rechazado 400, seed con 12 min + 18 min → con threshold 15 solo el de 18 min pasó a delivered. Slider UI renderiza y guarda correctamente.
- **Beneficio**: gerentes/dueños adaptan el tiempo al ritmo del local (food truck = 5 min, cafetería = 15 min, bar = 30 min) sin tocar servidor ni llamar soporte.



## 2026-04-22 — Enhancement: Auto-entregado en Órdenes Rápidas ⏳➜✅
- **Objetivo**: eliminar la fricción manual de tocar "Entregar" en el 95% de los casos donde el cobro es inmediato (Patrón A — counter service).
- **Backend**:
  - `routers/billing.py` `pay_bill`: al marcar la orden como `paid`, también guarda timestamp `quick_paid_at`.
  - `routers/orders.py` `GET /api/orders/quick/active`: lazy-sweep antes de responder — cualquier orden con `quick_order_status="paid"` y `quick_paid_at` más viejo que `QUICK_ORDER_AUTO_DELIVER_MINUTES` (default 7 min, configurable por env) se pasa automáticamente a `delivered`.
  - Cero infraestructura nueva: aprovecha el polling del frontend (cada 10s) para hacer el sweep. Si nadie está mirando, nadie se preocupa.
- **Frontend**:
  - `QuickOrderFab.jsx`: leyenda sutil en el panel de cola: "Las órdenes cobradas se marcan como entregadas automáticamente tras 7 min."
- **Verificación**: seed de 2 quick orders con estado `paid` — una con `quick_paid_at` fresco y otra de hace 10 min — llamada a `/quick/active` → la fresca sigue `paid`, la stale pasó a `delivered`. ✅
- **Configurable**: setear env var `QUICK_ORDER_AUTO_DELIVER_MINUTES=15` para cafeterías que quieran ventana más larga.



## 2026-04-22 — Feature: Orden Rápida (Quick Order) ⚡🎯
- **Objetivo**: flujo walk-in sin mesa — el cliente llega, ordena, paga y se va. No ocupa mesa ni requiere mesero.
- **Backend** (`routers/orders.py`, `routers/billing.py`, `print_agent_pro.py`):
  - `POST /api/orders/quick` — body `{customer_name: str | null}`; requiere permiso `open_table` o nivel ≥20; valida jornada activa; genera `quick_order_number` secuencial por jornada (reinicia con nueva jornada); setea `is_quick_order=true`, `quick_order_status="preparing"`, `sale_type="takeout"`, `table_id=null`, `order_type="quick_order"`.
  - `GET /api/orders/quick/active` — lista scoped a `business_date` actual y status `preparing|paid`, ordenado por `quick_order_number`.
  - `PATCH /api/orders/quick/{id}/status` — valida estado (`preparing|paid|delivered`), 404 si no existe, 400 si estado inválido.
  - `CreateBillInput.table_id` ahora `Optional`; label del bill: si `is_quick_order` → `"Orden Rápida #NN — Name"` o `"Orden Rápida #NN"`; propaga `is_quick_order / quick_order_number / quick_order_name` al bill.
  - `pay_bill`: al marcar order.status=closed, si `is_quick_order` flipa `quick_order_status="paid"` automáticamente; protegió update de tablas contra `table_id=None`.
  - `send_comanda_to_print_queue`: incluye `is_quick_order / quick_order_number / quick_order_name` en `comanda_data`.
  - `print_agent_pro.py`: cuando `is_quick_order`, encabezado de comanda renderiza `>> ORDEN RAPIDA #NN <<` + `Cliente: NOMBRE` + `(PARA LLEVAR - SIN MESA)` en lugar de `MESA X`; línea "Cajero:" en lugar de "Mesero:".
- **Frontend**:
  - `components/QuickOrderFab.jsx`: FAB naranja-gradient fijo bottom-right, badge rojo con contador de activas (auto-refresh 10s), dialog de creación con input opcional, dialog de cola con rows ordenados (Preparando/Cobrado/Entregado) y botones Cobrar/Entregar/Ver.
  - Solo visible si el usuario tiene `open_table` + `collect_payment`.
  - `TableMap.js`: monta `<QuickOrderFab />` si `!editMode`.
  - `App.js`: nueva ruta `/order/quick/:orderId`.
  - `pages/OrderScreen.js`: detecta `orderId` por `useParams`; `isQuickOrder` gate; `fetchOrder` en modo quick carga por `ordersAPI.get(orderId)` y sintetiza `table` nulo; header muestra `⚡ Orden Rápida #NN — Name | T-XXXX` + "Cajero:" en lugar de "Mesero:"; `handleDirectBilling` envía `table_id: null` al crear bill.
  - `lib/api.js`: `ordersAPI.createQuick`, `listQuickActive`, `setQuickStatus`.
- **Permisos reutilizados**: `open_table` + `collect_payment` (sin crear nuevo permiso).
- **Compatibilidad verificada**: combos, happy hour, modificadores, artículos libres, descuentos, propinas, e-CF E32 (default) — todo funciona.
- **Testing 100% PASS** (iteration_168): backend pytest 8/8 (creación con/sin nombre, numeración secuencial, active list, 400/404 edge cases, full payment flow con auto-flip a paid, label con y sin nombre); frontend E2E confirmó FAB visible, dialog create, navegación, header correcto (`⚡ Orden Rápida #08 — TestE2E_UI | T-1234`), badge count, queue dialog con rows y botones.
- **Archivos**: `/app/backend/routers/orders.py` (+70 líneas), `/app/backend/routers/billing.py` (+25 líneas), `/app/backend/print_agent_pro.py` (+15 líneas), `/app/frontend/src/components/QuickOrderFab.jsx` (nuevo, ~220 líneas), `/app/frontend/src/pages/TableMap.js` (+2 líneas), `/app/frontend/src/pages/OrderScreen.js` (+30 líneas), `/app/frontend/src/App.js` (+1 línea), `/app/frontend/src/lib/api.js` (+3 líneas), `/app/backend/tests/test_quick_orders.py` (nuevo, 8 tests).



## 2026-04-22 — Enhancement: Vista Previa por Rol en Config de Tiles 👁‍🗨🎭
- **Objetivo**: permitir al admin simular en vivo cómo se ve la grilla de categorías del POS para cualquier rol + área, antes de asignarle el POS a un mesero nuevo.
- **Frontend puro** (`MenuTilesSorter.jsx`, sin cambios de backend):
  - Nueva "preview bar" con 2 selectores: rol (desde `GET /api/roles`, filtra level<100 para no mostrarse a sí mismo) y área.
  - Función `getPreviewStatus(tileId)` replica la lógica real de `OrderScreen.js`:
    - Si el rol no tiene `create_open_items` → `__open_items__` se marca oculto.
    - Si el tile está en `area_overrides[previewArea].hidden_tiles` → se marca oculto con nombre del área.
  - Los tiles ocultos NO desaparecen — se atenúan (`opacity-40`) y muestran un badge amber con el motivo ("Falta permiso: X" o "Oculto en Salon Principal").
  - Summary en vivo: "X de N tiles visibles para este rol".
  - Link "limpiar" + selector deshabilitado cuando no hay rol (visual admin intacto).
- **Utilidad**: onboarding rápido de personal, debug de soporte ("¿por qué Pedro no ve tal botón?"), detectar configuraciones rotas (0 tiles visibles en un área).
- **Verificado E2E**:
  - Mesero → summary="3 de 4" + badge permiso en `__open_items__`.
  - Mesero + Salon Principal (con Combos oculto ahí) → summary="2 de 4" + 2 badges (permiso + área).
  - "limpiar" elimina todos los badges → `preview-hidden-badge-*` count=0.
- **Archivos**: `/app/frontend/src/components/MenuTilesSorter.jsx` (+90 líneas preview bar + `getPreviewStatus` + wrapper con badges).



## 2026-04-22 — Enhancement: Visibilidad de Tiles por Área (Overrides) 👁🏷️
- **Objetivo**: permitir que cada tile (categoría real o virtual) se oculte en áreas específicas. Ej: Terraza solo muestra Bebidas; Salon Principal esconde Combos.
- **Backend** (`routers/config.py`):
  - `MenuTilesInput` + doc `settings.menu_tile_config` extendidos con `area_overrides: {area_id: {hidden_tiles: [tile_id, ...]}}`.
  - `GET /api/menu-tiles` ahora retorna `area_overrides`; `PUT` lo persiste idempotente.
- **Frontend**:
  - `MenuTilesSorter.jsx`: carga `/api/areas` en paralelo con tile-config. Cada tile tiene un botón 👁 (Eye/EyeOff) con popover "VISIBLE EN ÁREAS" y un checkbox por área. Desmarcar oculta ese tile en esa área. Badge numérico en el botón cuenta áreas ocultas (ej: "1", "2"). Botón "Restablecer" limpia también los overrides.
  - `OrderScreen.js`: al renderizar tiles filtra por `area_overrides[table.area_id].hidden_tiles`. Aplica tanto a categorías reales como a tiles virtuales.
- **Verificación E2E**:
  - 4 áreas reales (Salon Principal, Terraza, Bar, VIP). Panel listó 4 checkboxes.
  - Ocultar Combos en "Salon Principal" → botón 👁 pasó a mostrar "1" → toast "Guardado" (PUT OK).
  - En Mesa 1 (Salon Principal) el tile Combos DESAPARECIÓ mientras Artículos Libres, Hamburguesa y Cervezas siguen visibles. `cat-card-combos`=0 ✅.
  - Reset restauró todos los tiles.
- **Archivos**: `/app/backend/routers/config.py` (+3 líneas `area_overrides`), `/app/frontend/src/components/MenuTilesSorter.jsx` (+60 líneas VisibilityControl + toggle), `/app/frontend/src/pages/OrderScreen.js` (+2 líneas `areaHidden` Set).



## 2026-04-22 — Enhancement: Drag-and-Drop para Orden de Tiles + Color Custom en Virtuales 🎨🪄
- **Objetivo**: dar al admin control total sobre el orden en que aparecen las categorías del menú en el POS y permitir personalizar el color de los tiles virtuales (Combos, Artículos Libres).
- **Backend**:
  - Nueva colección `settings._id=menu_tile_config` con `{order: [tile_id, ...], virtual_colors: {__combos__: hex, __open_items__: hex}}`.
  - `GET /api/menu-tiles` retorna orden + colores; autorellena categorías nuevas al final y valida que ambas virtuales estén incluidas. Si no hay config guardada retorna default (`categories by order → __combos__ → __open_items__`).
  - `PUT /api/menu-tiles` persiste cambios (idempotente, con auth).
  - `DELETE /api/categories/{id}` ahora también remueve el ID del `menu_tile_order` guardado si existía.
- **Frontend**:
  - Nuevo componente `/components/MenuTilesSorter.jsx` usando `@dnd-kit/core` + `@dnd-kit/sortable` (ya instalados). Renderiza la lista completa de tiles (reales + virtuales) con drag handle, auto-persist al soltar, botón "Restablecer" y color picker inline con 12 presets para cada virtual.
  - `OrderScreen.js` consume `GET /api/menu-tiles` y renderiza los tiles en el orden guardado, aplicando `virtual_colors` como `backgroundColor` a los tiles `__combos__` / `__open_items__`. Fallback robusto si no hay orden guardado.
  - `InventarioTab.js` (Config. Productos → Categorías): reemplazada la grilla estática por `MenuTilesSorter` con callbacks a edit/delete existentes.
- **Verificado E2E**: login → Config. Productos → Categorías muestra 4 tiles sortables → cambiar color de Combos a `#DB2777` → `PUT` persistido → OrderScreen ya renderiza tile "Combos" con color rosa (`rgb(219,39,119)`) sin recargar. Reset restaura default.
- **Archivos**: `/app/backend/routers/config.py` (+55 líneas endpoints menu-tiles), `/app/frontend/src/components/MenuTilesSorter.jsx` (nuevo, ~200 líneas), `/app/frontend/src/pages/OrderScreen.js` (+25 líneas orden dinámico + color custom), `/app/frontend/src/pages/settings/InventarioTab.js` (-30 líneas grid estática / +10 líneas wrapper).



## 2026-04-22 — UX Fix: Combos y Artículos Libres dentro de Categoría 📂
- **Problema**: los combos y los botones de Artículo Libre se renderizaban como bloques separados ARRIBA de la grilla de categorías, empujando las categorías normales hacia abajo y complicando navegación cuando había muchos combos.
- **Fix en `OrderScreen.js`**:
  - Eliminados los bloques `combos-strip` y `open-items-buttons` que estaban sobre la grilla.
  - Añadidas DOS categorías virtuales al final de la grilla de categorías: **"Combos"** (gradient púrpura→fucsia, solo visible si `activeCombos.length > 0`) y **"Artículos Libres"** (gradient naranja→rosa, solo visible con permiso `create_open_items` Y `openItemsConfig.enabled`).
  - `activeCat === '__combos__'`: renderiza una grilla con todos los combos activos (mismo look + Happy Hour preservado).
  - `activeCat === '__open_items__'`: renderiza los 2 botones (Cocina/Bar) respetando `channels_available`.
  - Breadcrumb del header muestra "Combos" o "Artículos Libres" correctamente.
- **Orden final**: Categorías normales del negocio → Combos → Artículos Libres.
- **Verificado** visualmente: cat-grid único con 4 tiles alineados; `combos-strip` y `open-items-buttons` ya no existen (count=0); navegación in/out de cada virtual category funciona.
- **Archivos**: `/app/frontend/src/pages/OrderScreen.js` (~130 líneas movidas/reorganizadas, cero cambios en lógica de combos o artículos libres).



## 2026-04-22 — Feature: Candidatos a Producto Permanente (Artículos Libres → Catálogo) 🔄⭐
- **Objetivo**: convertir ventas off-menu recurrentes en productos permanentes con 1 clic, capturando oportunidades de menú descubiertas por los meseros.
- **Backend** (`reports.py` GET `/api/reports/open-items`):
  - Nuevo campo `summary[]` agregado por `description` (lowercased key) con `occurrences`, `total_qty`, `total_revenue`, `avg_price`, `channel`, `last_seen`, `is_conversion_candidate` (flag cuando `occurrences >= 3`).
  - Ordenado por `occurrences` DESC, luego `total_revenue` DESC.
- **Frontend** (`OpenItemsReport.jsx`):
  - Nueva sección "Candidatos a producto permanente" (gradient amber/orange, Star icon) visible solo cuando hay candidatos. Cada card muestra ventas, uds, precio promedio y total generado.
  - Botón "Convertir en Producto" abre modal pre-llenado con: `name` (descripción), `price` (avg_price histórico), selector de categoría, toggle Activo. `POST /api/products` al confirmar. Toast Sonner success + cierre de dialog.
  - Validación: botón deshabilitado si falta nombre, categoría, o precio <= 0.
- **Testing**: frontend E2E 100% passed (iteration_167) — login PIN, navegación a Reports, date range expandido, candidatos renderizados (2 detectados), modal pre-fill correcto, validación, creación persistida (`GET /api/products` confirmó registro).
- **Archivos**: `/app/backend/routers/reports.py` (+35 líneas summary/candidate logic), `/app/frontend/src/pages/reports/OpenItemsReport.jsx` (+80 líneas candidates section + convert dialog).


## 2026-04 — Feature: Combos con Descuento Happy Hour Automático 🔥🎁
- **Extensión de promociones para combos**: las promociones ahora pueden apuntar a combos específicos además de productos/categorías.
- **Backend**:
  - `promotion_engine.py` — agregada función `get_effective_combo_price(combo_id, original_price, area_id)` y helper `_promotion_applies_to_combo()`. Regla: promociones con `apply_to="combos"` aplican si `combo_id` está en `combo_ids`; promociones con `apply_to="all"` aplican a combos excepto los listados en `excluded_combo_ids`.
  - `promotions.py` — `apply_to` ahora acepta `"combos"`. Nuevos campos persistidos: `combo_ids`, `excluded_combo_ids`.
  - `orders.py add_combo_to_order` — después de expandir el combo, consulta el engine y si hay promo activa aplicable: ajusta `total_price` del parent item y guarda `original_price`, `promotion_id`, `promotion_name`, `promotion_discount`, `promotion_discount_type` (mismo patrón que items normales).
- **Frontend**:
  - `PromotionsTab.js` — 4ta opción "Combos" en `apply_to`. Nuevo selector multi-check con nombre + precio del combo. Fetch paralelo de `/api/combos` en mount. `combo_ids` persistido al editar.
  - `OrderScreen.js` — botones de combo muestran precio tachado + precio descontado naranja + badge 🔥 cuando una promoción activa aplica (lógica local replicada). Cart: parent item automáticamente muestra `promotion_name` naranja + `original_price` tachado via código existente de items.
- **E2E validado por curl**: promo "Happy Hour Combos" 15% on combo_id=Combo Test → add a orden respondió parent.unit_price=$255 (de $300), promotion_name='Happy Hour Combos', promotion_discount=$45 ✅. Screenshot confirma UI con selector "Combos" marcado y "🎁 Combo Test — RD$ 300.00" checkable.
- **Archivos modificados**: `promotion_engine.py` (+40 líneas), `promotions.py` (+4 líneas), `orders.py` (+30 líneas en add_combo_to_order), `PromotionsTab.js` (+35 líneas), `OrderScreen.js` (+35 líneas lógica precio combo).


## 2026-04 — Feature: Sistema de Combos / Paquetes 🎁
- **Sistema completo** de bundles con 2 tipos: **Fijo** (items obligatorios) y **Configurable** (cliente elige dentro de grupos con min/max selecciones).
- **Pricing**: Precio Fijo / Descuento % sobre suma de items / Descuento Monto. Cálculo automático del ahorro en la card de configuración.
- **Grupos con opciones**: cada grupo tiene nombre, min_selections, max_selections, items (producto del catálogo + is_default + price_override para cargos extras). Ejemplo: "Plato Principal (elegir 1): Pollo/Res/Cerdo", "Bebida (+RD$50 cambiar a cerveza)".
- **Permiso reutilizado**: `manage_promotions` (no se creó uno nuevo). Admin/gerente/propietario pueden gestionar; cajero/mesero NO (403 verificado).
- **Backend**:
  - `/app/backend/routers/combos.py` — CRUD: GET /api/combos, GET /api/combos/active, POST/PATCH/DELETE con validación completa. Helper `expand_combo_to_items()` convierte combo + selecciones en (parent_item, child_items, total_price).
  - `/app/backend/routers/orders.py` — 2 endpoints nuevos: `POST /api/orders/{id}/combos` (agrega combo expandido: 1 parent con precio + N children a $0 con `combo_group_id` único, decrementa inventario de children) y `DELETE /api/orders/{id}/combos/{combo_group_id}` (elimina parent+children, devuelve inventario, bloquea si ya enviado a cocina).
- **Frontend**:
  - `/app/frontend/src/pages/settings/CombosTab.js` — UI completa: lista con cards (toggle active, edit, delete, ahorro auto), form con todos los tipos, grupos expandibles, buscador inline de productos con autocomplete, inputs de price_override y toggle is_default por item.
  - `/app/frontend/src/pages/settings/InventarioTab.js` — Sub-pestaña "Combos" junto a "Promociones" (solo visible con permiso).
  - `/app/frontend/src/pages/OrderScreen.js` — Fetch `/combos/active` al cargar. Sección "COMBOS" en gradient púrpura arriba del grid con botones (badge COMBO púrpura + precio). Modal configurable con radio (max=1) o checkbox (max>1) por grupo, validación min/max, cargo extra visible. Cart: parent con icono Package + badge "COMBO · N items" + botón rojo "Eliminar combo completo"; children indentados ml-6 con borde izquierdo púrpura, muestran group_name y price_override si aplica; click a children bloqueado con mensaje informativo.
- **Tests**: 20/20 pytest ✅ + frontend 100% verificado por testing agent.
- **Archivos**: nuevos `/app/backend/routers/combos.py`, `/app/frontend/src/pages/settings/CombosTab.js`, `/app/backend/tests/test_combos_system.py`. Modificados: `orders.py`, `server.py`, `InventarioTab.js`, `OrderScreen.js`.


## 2026-04 — Feature: Comparativo Happy Hour vs Fuera del Horario 📈
- **Nueva sección "Comparativo: Durante vs Fuera"** en el reporte A9 Analytics de Promociones. Responde la pregunta clave: "¿Happy Hour realmente incrementa mis ventas?".
- **Ventana analizada**: schedule de la promo ganadora (ej: L-V 4:00 PM - 7:00 PM). Se compara:
  - **Durante**: bills pagadas dentro de la ventana (día+hora del schedule)
  - **Fuera**: bills pagadas fuera de la ventana en el mismo período
- **4 métricas con delta %**: # Facturas, Ingreso, Ticket Promedio, Items / Factura. Indicador visual verde (↗ +X%) o rojo (↘ -X%).
- **Backend**: nueva función `_compute_promotion_comparative(bills, winner_promo)` en `reports.py`. Fetch del schedule de la promo ganadora, clasifica cada bill por su `paid_at` timestamp (weekday + hour range), calcula métricas y deltas porcentuales. Evita Infinity (no JSON-serializable) retornando None cuando denominador es 0. Skip para promos 24/7 (no hay ventana comparativa).
- **Frontend**: sección nueva con gradient naranja arriba de la tabla de desglose en `PromotionsAnalyticsReport.jsx`. Iconos TrendingUp/TrendingDown según signo del delta.
- **E2E verified**: test con 3 bills durante HH (L-M 4-7pm) + 1 bill fuera (mismos días pero 2pm): backend retornó deltas bills=+200%, revenue=+750%, ticket=+183%. Screenshot confirma UI completa con 4 KPI-cards comparativos.
- **Archivos modificados**: `/app/backend/routers/reports.py` (+120 líneas función `_compute_promotion_comparative` + integración en summary), `/app/frontend/src/pages/reports/PromotionsAnalyticsReport.jsx` (+60 líneas sección comparativo + imports ArrowRight/TrendingDown).


## 2026-04 — Feature: A9 Analytics de Promociones 📊
- **Nuevo reporte "Analytics de Promociones"** en la categoría "Ventas y Caja" del módulo Reportes.
- **KPIs**: Ventas con Promo (neto + count + %), Ahorro Entregado (total + prom/factura), Promo Ganadora (nombre + monto), Items Vendidos (+ count promos activas).
- **Desglose por promoción**: tabla con Facturas, Items, Bruto, Descuento, Neto, Ticket Prom., Desc. %. Ordenado por Neto descendente.
- **Top 20 productos** vendidos durante promociones con cantidad + bruto + descuento + neto.
- **Gráfico barras** de ventas netas vs descuentos por promoción.
- **Exports** PDF (WeasyPrint) y Excel (openpyxl) funcionando (200 OK validado por curl).
- **Backend**: endpoint `/api/reports/promotions-analytics` en `reports.py` + exports en `reports_xlsx.py` (`/xlsx/promotions-analytics/pdf|xlsx`). Cross bills × items.promotion_id, agrega por promotion_id + product_id, calcula winner/weakest, ahorro total y ticket prom.
- **Frontend**: `/app/frontend/src/pages/reports/PromotionsAnalyticsReport.jsx` + registrado en `reports/index.js` + cableado en `Reports.js` (import, endpoint map, switch case, entrada en sidebar categoría 'Ventas y Caja').
- **Validación E2E**: test bill con 2 items (PRESIDENTE 2u@240 + MICHELOB 3u@200) insertado directo en Mongo → endpoint retornó total_bills_with_promo=1, pct=100%, gross=$1,350, discount=$270, net=$1,080, winner='Happy Hour' ✅. Screenshot confirma UI completa con sidebar, 4 KPIs, tabla y empty state funcionando.
- **Archivos**: nuevos `PromotionsAnalyticsReport.jsx`; modificados `reports.py` (+150 líneas), `reports_xlsx.py` (+200 líneas PDF+Xlsx), `Reports.js`, `reports/index.js`.


## 2026-04 — Feature: Happy Hour / Promociones Automáticas ✨
- **Sistema completo de promociones programadas** por días de la semana + horario + fecha inicio/fin. Precios cambian automáticamente sin intervención manual.
- **Tipos de descuento**: Porcentaje (%), Monto Fijo (RD$), Precio Fijo, 2x1.
- **Alcance**: Todos los productos / Categoría(s) / Productos específicos. Con productos excluidos y filtro por áreas.
- **Permiso nuevo**: `manage_promotions`. Activo por default en admin, gerente, propietario. Inactivo en supervisor/cajero/mesero/cocina.
- **Backend**:
  - `/app/backend/services/promotion_engine.py` — Engine con caché en memoria 60s, timezone `America/Santo_Domingo`. Función `get_effective_price()` selecciona MEJOR descuento para el cliente si múltiples aplican.
  - `/app/backend/routers/promotions.py` — CRUD: GET /api/promotions (lista), GET /api/promotions/active (activas ahora), POST/PATCH/DELETE con validación de bounds (percentage 0-100, fixed_amount ≥ 0).
  - `/app/backend/routers/orders.py` — Integración en POST /orders/{id}/items: aplica precio efectivo + guarda `original_price`, `promotion_id`, `promotion_name`, `promotion_discount`, `promotion_discount_type` en el item. **Precio se congela al momento de agregar** — si Happy Hour termina después, cobra al precio descontado.
  - `/app/backend/routers/auth.py` — `manage_promotions` añadido a `ALL_PERMISSIONS`, `DEFAULT_PERMISSIONS.admin`, `CUSTOM_ROLE_DEFAULTS.gerente/propietario`.
- **Frontend**:
  - `/app/frontend/src/pages/settings/PromotionsTab.js` — UI completa con list (cards con día-pills, horario 12h, descuento, toggle/edit/delete) + form (pills días, time pickers, date pickers opcionales, multi-select categorías/productos/áreas, productos excluidos).
  - `/app/frontend/src/pages/settings/InventarioTab.js` — Nueva sub-pestaña "Promociones" (solo visible si permiso `manage_promotions`).
  - `/app/frontend/src/pages/UserConfig.js` — `manage_promotions` en `PERMISSION_CATEGORIES.configuracion` para edición desde UI.
  - `/app/frontend/src/pages/OrderScreen.js` — Banner gradient naranja "🔥 Happy Hour activo hasta las X:XX PM" cuando hay promos activas. Productos bajo promoción muestran precio tachado + precio descontado naranja + badge 🔥 top-left. Items en cart muestran "🔥 Happy Hour" en naranja + precio original tachado.
- **QA verificado** (testing_agent_v3_fork iteration_161): Backend 15/15 pytest ✅. Frontend 95% ✅ (fix aplicado: pl-6 al nombre de producto para evitar overlap del badge). Admin puede gestionar, cajero no (403). Order integration verificada: PRESIDENTE $300 → $240 con promotion_name='Happy Hour' correctamente guardado. Tip legal 10% se calcula sobre subtotal con descuento (automático, unit_price ya descontado).
- **Archivos creados**: `/app/backend/services/promotion_engine.py`, `/app/backend/routers/promotions.py`, `/app/frontend/src/pages/settings/PromotionsTab.js`, `/app/backend/tests/test_promotions.py`.


## 2026-02 — Bug Fix: Runtime Error "DialogDescription is not defined" 🐛
- **Síntoma**: Al navegar a `/user/new` o editar usuario existente, Uncaught runtime error `ReferenceError: DialogDescription is not defined`.
- **Root cause**: `DialogDescription` se usaba en JSX pero faltaba en el import statement de `UserConfig.js`.
- **Fix**: Agregado `DialogDescription` al import de `@/components/ui/dialog`.
- **Fix adicional detectado en pruebas**: Al cargar `/user/new`, el rol default era `waiter` pero `permissions={}` estaba vacío (UI mostraba switches OFF aunque rol seleccionado). Agregado `useEffect` que auto-pobla `user.permissions` con `ROLE_DEFAULTS[role]` cuando es nuevo usuario y los permisos están vacíos.
- **Validación visual (screenshots)**: Mesero→3/14 auto, Cajero→8/14 con toast "12 permisos", GERENTE→11/14 con toast "31 permisos", diálogo Crear Puesto abre sin errores con dropdown "Clonar Permisos desde".


## 2026-02 — Feature: Clonar Permisos al Crear Puesto ✨
- **Nueva funcionalidad**: Al crear un puesto custom, admin puede seleccionar "Clonar Permisos desde" un puesto existente (builtin o custom) como punto de partida.
- **Comportamiento**:
  - Dropdown muestra todos los puestos visibles con su count: `Gerente (31p · N60)`, `Cajero (12p · N30)`, etc.
  - Al seleccionar, los permisos se copian automáticamente al estado `newRolePermissions`.
  - Admin puede luego ajustar con los switches (agregar/quitar permisos específicos).
  - Toast confirma: "Clonados X permisos de [Rol]".
- **Uso típico**: crear "Bartender" clonando desde "Mesero" (3p base) + agregar split_bill, collect_payment manualmente. Ahorra ~20 clicks por nuevo rol.
- **Files**: `/app/frontend/src/pages/UserConfig.js` — Create Role Dialog extendido con `<select data-testid="clone-role-select">`.


## 2026-02 — Fix: Sistema de Puestos (Roles) y Permisos 🔧
- **Problema**: Al seleccionar un puesto, los permisos predefinidos NO se cargaban automáticamente. Custom roles (gerente/propietario) tenían `permissions={}` vacío. `ROLE_DEFAULTS` frontend y `DEFAULT_PERMISSIONS` backend desincronizados.
- **Fix aplicado**:
  - **Backend `auth.py`**: Reescrito `DEFAULT_PERMISSIONS` (admin 70p, kitchen 2p, waiter 3p, cashier 12p, supervisor 16p). Agregado `CUSTOM_ROLE_DEFAULTS` con plantillas para `gerente` (31p) y `propietario` (41p). `get_permissions()` ahora usa merge 3-capas: base False → DEFAULT/CUSTOM_ROLE_DEFAULTS → user override. `ALL_PERMISSIONS` extendido a 63 labels. `list_roles` enriquece custom roles con fallback CUSTOM_ROLE_DEFAULTS si `permissions` está vacío.
  - **Backend `server.py`**: `seed_custom_role_permissions()` ejecutado en startup (idempotente) para persistir permisos de gerente/propietario en MongoDB si están vacíos.
  - **Frontend `UserConfig.js`**: `ROLE_DEFAULTS` sincronizado con backend. `CUSTOM_ROLE_DEFAULTS` replicado. `handleSelectRole()` ahora carga correctamente permisos para builtin/custom/fallback con toast informativo (count de permisos). `getRoleDefaults()` y `permCount` badge ahora usan fallback CUSTOM_ROLE_DEFAULTS. Categoría nueva "Sistema & Auditoría" en `PERMISSION_CATEGORIES` (7 permisos admin-only) para que admin muestre 70p en UI.
  - **Diálogos Crear/Editar Puesto**: Agregada sección de permisos colapsable (6+1=7 categorías) con switches togglables. Botón "Plantilla" aplica CUSTOM_ROLE_DEFAULTS por code. POST/PUT `/api/roles` ahora persisten permisos personalizados. Botón edit del custom role cambiado a `<span role="button">` para eliminar warning de `<button>` anidado.
  - **Cleanup**: Eliminado `TestQA_Auto` role (test leftover).
- **QA verificado** (testing_agent_v3_fork iteration_160): 10/12 PASS + issues MEDIUM corregidos post-reporte. Admin 70p, Mesero 3p, Cajero 12p, Supervisor 16p, Cocina 2p, Gerente 31p, Propietario 41p. Al seleccionar puesto se cargan permisos automáticamente. Diálogos Crear/Editar muestran sección de permisos editable. Admin nivel 100 puede personalizar post-selección.
- **Files tocados**: `/app/backend/routers/auth.py`, `/app/backend/server.py`, `/app/frontend/src/pages/UserConfig.js`.


## 2026-04-19 — Bug Fix: E31 Rechazado por DGII (`IndicadorMontoGravado`) 🔒
- **Root cause**: DGII valida `IndicadorMontoGravado` como OBLIGATORIO para E31/E32/E34/E45 (error código 176 "El campo IndicadorMontoGravado del área IdDoc de la sección Encabezado no es válido" cuando está ausente).
- **Evidencia**: `ecf_logs` mostró respuesta EXACTA de Multiprod/DGII para T-1184 y T-1178 rechazadas.
- **XSD V1.0 oficial**: define `IndicadorMontoGravado` como `minOccurs="0"` pero DGII lo valida como requerido por reglas de negocio. Valor `0` = `PrecioUnitarioItem` SIN ITBIS incluido (como nuestro POS lo envía).
- **Fix aplicado** (`multiprod_service.py`):
  - Reinsertado `<IndicadorMontoGravado>0</IndicadorMontoGravado>` para E31/E32/E34/E45 en la posición XSD correcta (después de `FechaVencimientoSecuencia` + `IndicadorEnvioDiferido`, antes de `TipoIngresos`).
  - E44 (régimen especial exento) sigue SIN el campo (no permitido en su XSD).
- **Verificación end-to-end**:
  - Validación XSD local: OK para 5 tipos (E31, E32, E34, E44, E45).
  - Reenvío T-1184 → eNCF `E310000000201` → **Aceptado por DGII** (código 1).
  - Reenvío T-1178 → eNCF `E310000000202` → **Aceptado por DGII** (código 1).
- Testing: curl end-to-end + validación XSD + confirmación DGII "estado: aceptado".

## 2026-04-01 — Integration: The Factory HKA e-CF + Credential Self-Service
- **The Factory HKA**: Full e-CF integration (auth JWT, payload mapping, send, status check, anulación, audit logs)
- **e-CF Dispatcher**: Unified `/api/ecf/*` router dispatches to Alanube or The Factory based on system_config
- **Provider Selector**: Settings > Sistema with visual toggle + "Probar conexión" button
- **Credential Self-Service UI**: Business owners configure e-CF credentials from Settings (DB first, .env fallback)
- **NCF Counter**: Sequential tracking in MongoDB to prevent duplicates
- Key discovery: The Factory `itbiS1` = TAX RATE ("18"), NOT amount

## 2026-04-01 — Bug Fix: Mesa dividida se liberaba al pagar una cuenta
- **Root cause**: billing.py solo verificaba la orden pagada, no las demás órdenes de la mesa
- **Fix**: Ahora verifica si existen otras órdenes activas (`status: active/sent`) antes de liberar la mesa
- **Alcance**: Fix aplicado en billing.py (pago) + orders.py (3 rutas de cancelación)
- Testing: 7/7 backend + frontend verificado en Desktop, Mobile, Tablet

## 2026-03-31 — Fix: Contraste de textos en light theme
- **Account Selector**: Cambiados todos los text-white/XX a text-foreground/text-muted-foreground en cards de cuentas, totales, items, header
- **CashRegister (Caja/Turnos)**: Corregidos ~50+ instancias en header, Turno Activo, stat cards, movimientos, historial de turnos, y TODOS los diálogos (Abrir Turno, Cerrar Turno, Movimiento de Caja, Cierre de Día)
- Testing: 100% pass (desktop + mobile)

## 2026-03-31 — Refactoring: OrderScreen.js componentizado
- **AccountSelectorLobby.js**: Extraído (~120 líneas) — lobby de selección de cuentas divididas
- **SplitCheckView.js**: Extraído (~130 líneas) — vista de split check con drag/drop
- OrderScreen.js reducido en ~250 líneas
- Testing: 100% pass rate (UI + API)

## 2026-03-31 — Bug Fix: Auto-envío de órdenes pendientes a cocina
- **Bug**: Al navegar a "Mesas" desde OrderScreen, los items pendientes no se enviaban a cocina
- **Fix**: Sincronización de `tableOrdersRef.current` y reset de `alreadySentRef.current`
- Testing: 100% pass rate (login, mesas, orden, account selector, split check, pre-cuenta, facturar, mobile)

## 2026-03-29 — PWA + Mobile Optimization
- **PWA Instalable**: manifest.json, íconos 192/512/apple-touch, meta tags iOS/Android, Service Worker (cache estático)
- **Reports mobile**: Full-width, menú hamburguesa, horizontal scroll en tablas
- **Clientes page**: Compact header, botones iconos mobile
- **Bottom padding global**: pb-28 en TODAS las páginas scrollables
- **Inventory mobile**: 11 tabs responsive, Radix ScrollArea fix
- **Order screen mobile**: 2 columnas fijas, lupa búsqueda
- **Auto-send on exit**: handleLogoutWithComandas on both logo (desktop) + Salir button (mobile)
- **Sidebar Opciones**: Modal with Cocina/Caja/Reservas/Config/Cierre de Día

## 2026-04-22 - Fidelidad automática en PaymentScreen (Opción C)
- **Backend `/app/backend/routers/billing.py`** — `POST /api/bills/{bill_id}/pay` acepta `loyalty_points_to_redeem`:
  - Valida cliente, mínimo de canje, saldo de puntos, y que el canje no cubra el total completo (deja ≥ RD$0.01 para NCF).
  - Descuenta el discount_rd del total ANTES de ejecutar el pago.
  - Acumula puntos automáticamente sobre el total post-redención (evita double-dipping).
  - Deduce los puntos canjeados del cliente y guarda `loyalty_points_redeemed` y `loyalty_discount_rd` en el bill.
- **Frontend `/app/frontend/src/pages/PaymentScreen.js`**:
  - Nueva sección `CANJEAR PUNTOS` (Gift 🎁) en su propia fila debajo del pill de cliente/NCF.
  - Presets 50/100/200 + botón "Todos" + input numérico con validación.
  - `billTotal` descuenta `loyaltyDiscountRd` en tiempo real; el `TOTAL` grande y el header total se actualizan.
  - Validaciones proactivas (min_redemption, puntos insuficientes, supera total) con toasts.
  - Manejo de errores del backend propaga `err.response.data.detail`.
- Testing: Backend curl end-to-end (293→375 pts con redención 100 + ganancia 182); edge cases 400 (min, insuficiente, sin cliente); testing agent frontend 95% funcional + fix layout; pago final E2E validado (200→209 pts).
- data-testids: `loyalty-redemption-section`, `redeem-preset-50/100/200`, `redeem-all-btn`, `redeem-points-input`, `loyalty-discount-amount`, `bill-total-display`.

## 2026-04-22 - Top Clientes Fieles + Tarjeta Digital con QR
- **Backend `/app/backend/routers/customers.py`**:
  - `GET /api/loyalty/top-customers?days=30&limit=10` — ranking por actividad (pts ganados + canjeados) últimos N días con tabs 30/90/3650.
  - `GET /api/loyalty/card/{customer_id}` (auth) — devuelve token HMAC-SHA256 (16 hex) derivado de `JWT_SECRET`.
  - `GET /api/loyalty/public-card/{customer_id}?token={}` **PÚBLICO (sin auth)** — valida HMAC con `compare_digest`, devuelve nombre, saldo, equivalente RD$, últimas 3 visitas, business info. PII del cliente (teléfono) no se expone.
  - `POST /api/loyalty/send-card-email/{customer_id}` — envía tarjeta HTML profesional vía Resend con QR embebido.
- **Frontend**:
  - Nuevo `/app/frontend/src/pages/LoyaltyCard.js` — página pública con tarjeta QR, últimas 3 visitas, botones Imprimir (CSS @media print) y Copiar URL.
  - Nuevo `/app/frontend/src/components/TopLoyaltyCustomers.js` — widget Dashboard con tabs 30d/90d/Siempre, summary (Ganados/Canjeados/Gastado), top 10 filas con badges dorado/plata/bronce.
  - `Dashboard.js` integrado con el widget.
  - `Customers.js` nuevo botón IdCard (card-{id}) y diálogo con QR preview + Copiar URL + Abrir + Enviar Email.
  - `App.js` ruta `/loyalty-card/:customerId` FUERA de ProtectedRoute para acceso público.
- **Seguridad**: Token HMAC-SHA256 truncado a 16 hex previene enumeración. `hmac.compare_digest` previene timing attacks.
- **Testing**: iteration_164.json — 100% backend (9/9 pytest) + 100% frontend (todos los data-testids + ruta pública sin auth + token inválido muestra error sin redirigir).

## 2026-04-22 - Auto-envío de Tarjeta de Fidelidad por Email
- **Backend `/app/backend/routers/customers.py`**:
  - Helper `trigger_loyalty_auto_emails(cid, prev_visits, prev_points, new_points, public_base_url)`.
  - Helper `_auto_send_loyalty_email` (silent failures, usa Resend).
  - Flags idempotentes en cliente: `welcome_card_sent`, `welcome_card_sent_at`, `last_threshold_notif_at`.
  - Email de umbral con cooldown de 30 días (evita spam en clientes frecuentes).
- **Backend `/app/backend/routers/billing.py`**:
  - `pay_bill` captura estado previo del cliente (`loyalty_prev_visits`, `loyalty_prev_points`) antes de actualizar.
  - Dispara `trigger_loyalty_auto_emails` tras ganar/canjear puntos (silent try/except para no romper pago).
  - Añadido parámetro `request: Request`.
- **Backend `/app/backend/.env`**: nueva var `FRONTEND_PUBLIC_URL` para que los links de la tarjeta usen el dominio público real (no el host interno K8s).
- **Triggers**:
  1. Welcome: primera factura pagada del cliente (visits == 0 antes) + email registrado → envía tarjeta bienvenida y marca `welcome_card_sent=True`.
  2. Threshold: cliente cruza de `points < min_redemption` a `points >= min_redemption` → envía "ya puedes canjear" (cooldown 30 días, no se repite hasta pasado el periodo).
  3. Regresión: clientes sin email → silent skip, pago se completa normal.
- **Tests curl**: welcome + threshold + no re-trigger + no-email regression (4/4 ok).

## 2026-04-22 - Sistema de Modificadores — Productos Reales Vinculados
- **Backend `/app/backend/routers/config.py`**:
  - Extendido `ModifierGroupInput`: prefix, selection_type (required|optional|unlimited), sort_order, is_active, applies_to_product_ids, applies_to_category_ids.
  - Extendido `ModifierInput`: mode (text|product), product_id, price_source (price_a|price_b|price_c|included|custom), custom_price, is_default, is_active, sort_order, max_qty.
  - Nuevo endpoint `GET /api/modifier-groups/for-product/{product_id}` — devuelve grupos aplicables (vía modifier_group_ids, applies_to_product_ids, applies_to_category_ids) enriquecidos con resolved_price, linked_product{id,name,stock_qty,simple_inventory_enabled}, available.
  - Todas las rutas CRUD ahora requieren auth (get_current_user).
- **Backend `/app/backend/server.py`**: `/api/modifier-groups-with-options` enriquece opciones con resolved_price/linked_product/available (para OrderScreen).
- **Backend `/app/backend/routers/orders.py`**: `add_items_to_order` descuenta simple_inventory para modificadores con mode="product" (qty_modifier × qty_item), con rollback transaccional ante stock=0.
- **Frontend `/app/frontend/src/pages/settings/InventarioTab.js`**: Dialog rediseñado — input Prefix, 3 tabs Obligatorio/Opcional/Múltiple, por opción: toggle Texto/Producto, buscador autocomplete, selector de precio (Precio A/B/C/Incluido/Custom con valores mostrados), indicador de Stock; estado de búsqueda independiente por fila.
- **Frontend `/app/frontend/src/pages/OrderScreen.js`**: Dialog de modificadores ahora muestra prefijo del grupo, badge "Incluido" verde para productos sin cargo, "Agotado" con línea tachada y bloqueo de click, stock visible. addItemToOrder siempre usa empty-order + addItems para garantizar deducción de inventario.
- **Frontend `/app/frontend/src/pages/Kitchen.js`**: Modificadores en comanda ahora muestran `GROUP_NAME: opción` con prefijo en mayúsculas.
- **Compatibilidad**: mode ausente = "text" por defecto (migración transparente). Grupos legacy sin prefijo funcionan idéntico.
- **Tests**: 13/13 pytest `/app/backend/tests/test_modifiers_system.py` + 6/6 QA e2e `/tmp/test_modifiers_qa.py` (precios contextuales, inventario 2 uds, agotado, regresión, auth enforcement).

## 2026-04-22 - Badge "Popular" en Modificadores
- **Backend `/app/backend/routers/config.py`** y **`/app/backend/server.py`**:
  - Agregación de popularidad: cuenta usos de cada modificador en bills pagadas últimos 30 días para el producto.
  - `GET /api/modifier-groups/for-product/{pid}` y `GET /api/modifier-groups-with-options?product_id={pid}` devuelven `popularity_count` y `is_popular` por opción.
  - Regla: `is_popular=True` si count ≥ 3 Y está en top 2 del grupo (umbral evita falsos positivos con pocos datos).
- **Frontend `/app/frontend/src/pages/OrderScreen.js`**:
  - Al abrir modal de modificadores, lazy-fetch `/modifier-groups-with-options?product_id={id}` y guarda map `popularityMap`.
  - Render: badge ⭐ POPULAR ámbar (absolute top-right) sobre opciones populares, con data-testid=`mod-opt-popular-{id}`.
  - Sin impacto si el producto no tiene historial (badge no aparece).
- **Tests**: `/tmp/test_popularity.py` 2/2 pass (backend agg + endpoints enriquecen). Verificado visualmente: 5 ventas Queso Extra + 3 Tocineta → ambos con badge POPULAR; 1 venta Aguacate → sin badge.

## 2026-04-22 - Reporte "Combinaciones Top"
- **Backend `/app/backend/routers/reports.py`**: Nuevo `GET /api/reports/top-combinations?date_from&date_to&limit&min_count` — agrupa items de bills pagadas por (producto + modificadores ordenados alfabéticamente), cuenta ventas, suma ingresos, retorna top N con ticket promedio, ranking, última venta. `min_count=2` default evita ruido de combinaciones únicas.
- **Frontend `/app/frontend/src/pages/reports/TopCombinationsReport.jsx`**: Tabla con KPIs (Combinaciones únicas / Items vendidos / Ingresos top), ranking badges dorado/plata/bronce, modificadores como chips naranjas, ticket promedio por combo. Empty state elegante con mensaje explicativo.
- **Frontend `/app/frontend/src/pages/Reports.js`**: Registrado en categoría VENTAS como "Combinaciones Top". Endpoint mapped en switch de loader.
- **Verificación visual**: Con 3 combinaciones históricas (Sin sal x3 + otras x1), muestra correctamente la top (Sin sal=3) y oculta las de count=1 por `min_count=2`.

## 2026-04-22 - Artículos Libres (Open Items)
- **Permiso nuevo** `create_open_items`: descripción "Crear Artículos Libres", activo por default para admin/supervisor/propietario/gerente; inactivo para cajero/mesero/cocina. Agregado a `DEFAULT_PERMISSIONS`, `CUSTOM_ROLE_DEFAULTS`, `ALL_PERMISSIONS` (backend) y matriz UI (UserConfig.js).
- **Backend endpoints**:
  - `POST /api/auth/verify-pin` — valida PIN + permiso (para flujos de aprobación supervisor).
  - `GET/PUT /api/open-items/config` — enabled, require_supervisor, price_limit_rd, channels_available.
  - `GET /api/reports/open-items` — reporte con descripción, canal, mesa, precio, creado por, KPIs totales.
- **Backend orders.py**:
  - `ItemInput` extendido con is_open_item, open_item_channel, indicator_bien_servicio, tax_exempt, kitchen_note, created_by, created_by_name.
  - `product_id` ahora Optional (para open items que no tienen producto vinculado).
  - Skip inventario simple para open items.
  - Kitchen routing prioriza `open_item_channel` sobre canal del producto.
  - **Bug crítico fix**: open items NUNCA se mergean con otros items (cada uno queda como línea separada, preservando metadata única).
- **Backend billing.py**: items con `tax_exempt=True` se tratan como exentos (no contribuyen al taxable_base de ITBIS).
- **Frontend**:
  - Nuevo `OpenItemDialog.js` con inputs (descripción 80ch, precio, cantidad ±, tipo DGII bien/servicio, toggle ITBIS, nota cocina 150ch, PIN supervisor cuando aplica), total en vivo.
  - `OrderScreen.js`: 2 botones fixed antes del grid de categorías cuando !activeCat y hasPermission('create_open_items') y config.enabled. Colores naranja (cocina) y púrpura (bar), dashed border. Permission gated.
  - `Kitchen.js`: badge naranja "*** LIBRE ***" destacado + nota cocina con ★.
  - `ThermalTicket.js`: oculta el prefijo [LIBRE] al cliente (auditoría interna solo).
  - Nuevo `OpenItemsReport.jsx` en reportes con auditoría completa.
- **Tests**: /tmp/test_open_items.py + /tmp/test_open_merge_fix.py — 6/6 tests E2E pass (config, verify-pin, create order con 2 open items separados, tax calculation, kitchen routing, no merge bug).
- **Testing agent iteration_166**: 100% backend + frontend validado; bug crítico de merge detectado y corregido.
- **Seguridad**: aprobación supervisor automática cuando precio > price_limit_rd O require_supervisor=true. Audit trail completo (created_by, created_by_name) persiste en la orden.
