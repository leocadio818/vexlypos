# VexlyPOS — Changelog

## 2026-03-29 — PWA & Performance Optimization
- **PWA Instalable**: manifest.json, íconos 192/512/apple-touch, Service Worker con cache de assets estáticos + API responses
- **Offline Avanzado**: IndexedDB (idb) para cache de productos, categorías, mesas, config, clientes. Cola de sincronización con reintentos (hasta 5x). Auto-cache después de login. Sync automático al reconectar
- **React Query**: @tanstack/react-query v5 con staleTime 2min, gcTime 10min, refetchOnReconnect
- **Transiciones fluidas**: framer-motion AnimatePresence en Layout.js Outlet (0.15s fade+slide entre páginas)
- **ConnectionStatus**: Indicador flotante offline/syncing (rojo pulsante sin conexión, ámbar sincronizando)
- **Google Translate Protection**: translate="no", meta notranslate, clase notranslate en PinPad + PaymentScreen totals

## 2026-03-26 — Alanube e-CF + Email + Print Agent
- **Alanube e-CF Integration**: Full module (Mapeo + Timbrado + Logs). First electronic invoice sent to DGII sandbox successfully. Endpoints: /api/ecf/send, /api/ecf/status, /api/ecf/logs. E-CF button in post-payment dialog.
- **QR Code**: e-CF stamp URL printed on ticket (text) + QR image in email HTML (via api.qrserver.com)
- **Email Invoices (3 phases)**: Professional HTML template + Resend integration (facturas@vexlyapp.com) + customer search/create/manual email modal + auto-send toggle in Config + email sent confirmation modal
- **Post-payment redesigned**: 4 buttons grid (EMAIL, e-CF, REIMPRIMIR, VOLVER A MESAS)
- **Print Agent Multi-Printer**: format_commands support, modifier fix (string+dict), empty job skip, terminal→printer routing
- **Double comanda fix**: alreadySentRef prevents duplicate send on navigate/logout
- **Auto-send on exit**: handleLogoutWithComandas on both logo (desktop) + Salir button (mobile), detects /order/ route

## 2026-03-22 — Print Agent + Barcode + Permissions
- **Print Agent**: VexlyPOS_PrintAgent.py multi-printer, config.txt with PRINTER_[CHANNEL]=IP, test print button, /api/print/config endpoint
- **Terminal→Printer**: Config > Estación links each caja to print_channel. Backend resolves user→session→terminal→print_channel→IP
- **Printer selector for waiters**: Modal when user has no POS session, select printer manually
- **Barcode Scanner**: Field in ProductConfig, invisible keypress listener in OrderScreen, not-found modal, duplicate validation
- **Products inactive**: Switch in ProductConfig, Inactivos tab, audit log, API filter fix (config.py endpoint)
- **Permissions**: cash_movement_income/withdrawal, reprint_precuenta (skip PIN if has permission), can_access_table_orders reads DB not JWT, auto-authorize close_day

## 2026-03-19 — Sidebar + Contrast + Reports
- **Sidebar Opciones**: Modal with Cocina/Caja/Reservas/Config/Cierre de Día. Functions modal global (mobile+desktop)
- **Auto-contrast nuclear**: getContrastText() + data-contrast + CSS !important for categories/products
- **Cash Close Report**: 7 professional sections (header, KPIs, payment methods, fiscal, exceptions, bill detail, signatures)
- **Reservations**: created_by field + global date filters
- **Business date fix**: ALL reports filter by business_date, not paid_at
- **Cierre de Día intelligent**: force_close NEVER skips open orders, auto clock-out all attendance

## 2026-03-17 — Clock-In/Out + Branding
- **Clock-in flow**: useCallback handleSubmit, inline overlay modals (not Dialog portal), both themes
- **Branding white-label**: Logo login+sidebar from API, cached localStorage, VexlyPOS title, Emergent badge removed
- **PIN validation**: active users only, PIN_ALREADY_IN_USE code, api instance not axios
- **Navigation fix**: All <a href> replaced with <Link to> (8 files)
