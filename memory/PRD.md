# POS Restaurant System - Dominican Republic

## Original Problem Statement
Full-stack POS application for DR restaurants. React + FastAPI + MongoDB. Multi-tenant, RBAC, printer integration, DGII compliance.

## Architecture
- Frontend: React + TailwindCSS + Shadcn/UI + React Query + Framer Motion (PWA)
- Backend: FastAPI + MongoDB
- External: Supabase, Alanube (e-CF), The Factory HKA (e-CF), Resend (emails)

## e-CF Provider Architecture (NEW)
- **Dispatcher pattern**: `/api/ecf/*` routes through `ecf_dispatcher.py` which reads `system_config.ecf_provider` and routes to either Alanube or The Factory HKA
- **Alanube**: `/app/backend/routers/alanube.py` (unchanged, uses Bearer token)
- **The Factory HKA**: `/app/backend/routers/thefactory.py` (new, uses JWT auth with user/password/rnc)
- **Dispatcher**: `/app/backend/routers/ecf_dispatcher.py` (unified API layer)
- **NCF Counter**: `ecf_ncf_counters` MongoDB collection tracks sequential NCFs per provider/tipo
- **CRITICAL**: The Factory `itbiS1` field expects TAX RATE ("18"), NOT amount. Amount goes in `totalITBIS1`
- **Provider selector**: Settings > Sistema tab with toggle between Alanube and The Factory HKA

## Completed Tasks (Recent - 2026-04-01)
- **The Factory HKA Integration** (DONE): Full e-CF integration with auth, payload mapping, send, status check, anulación, logs. Successfully tested in sandbox with real invoices.
- **e-CF Provider Dispatcher** (DONE): Unified router that dispatches to Alanube or The Factory based on system_config.ecf_provider. Auto-retry scheduler supports both providers.
- **Frontend Provider Selector** (DONE): Settings > Sistema tab with visual toggle buttons for Alanube vs The Factory HKA, plus "Probar conexión" button.
- **NCF Tracking** (DONE): Sequential NCF counter in MongoDB to prevent duplicates across shared sandbox environments.
- **e-CF Credentials Self-Service UI** (DONE): Business owners can configure e-CF provider credentials directly from Settings > Sistema without needing a developer. System reads DB first, falls back to .env. Passwords are masked in the UI and API responses. Supports Alanube (token+RNC) and The Factory (user+password+RNC+company). Includes Sandbox/Production environment toggle.

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

### P3
- Exportar Audit Trail, Modo Offline (PAUSED)

## Comparación Proveedores e-CF: Alanube vs The Factory HKA

### Autenticación
- **Alanube**: Token fijo (Bearer JWT de larga duración). Se copia del portal una vez.
- **The Factory**: Login con usuario + clave + RNC → Token temporal que EXPIRA (requiere renovación automática).

### Complejidad del JSON
- **Alanube**: Más simple. Campos claros en inglés (`invoiceType`, `totalAmount`, `paymentForms`).
- **The Factory**: Más complejo. Nombres español/camelCase inconsistente. `itbiS1` espera TASA ("18"), NO el monto — esto NO está documentado claramente.

### Documentación
- **Alanube**: Portal web limpio con ejemplos claros y SDK.
- **The Factory**: Wiki básica con un solo ejemplo (todo exento). No hay ejemplo con ITBIS. Manual PDF es de Ecuador, no RD.

### NCF (Secuencias)
- **Alanube**: Gestiona NCFs automáticamente. Sin contadores manuales.
- **The Factory**: El desarrollador debe generar y trackear NCFs secuenciales manualmente (creamos contador en MongoDB).

### Sandbox
- **Alanube**: Sandbox aislado por cuenta.
- **The Factory**: Sandbox COMPARTIDO — otros usuarios consumen tus NCFs. Tuvimos que saltar al NCF #100 porque 1-99 ya estaban usados.

### Status DGII
- **Alanube**: Webhooks + GET. Incluye `legalStatus`, `governmentResponse`, `stampUrl`, `pdfUrl`.
- **The Factory**: Solo POST consulta. Código numérico (0=pendiente, 1=aceptado, 2=rechazado). Sin webhooks.

### Errores
- **Alanube**: Mensajes descriptivos en español.
- **The Factory**: Códigos numéricos genéricos ("0102 - El campo no cumple con el formato correcto") sin especificar qué formato espera.

### QR / Estampa Fiscal
- **Alanube**: URL del sello fiscal (`stampUrl`) + PDF descargable.
- **The Factory**: Solo `codigoSeguridad` + `xmlBase64`. Sin URL de sello ni PDF directo.

### Anulación
- **Alanube**: Endpoint simple.
- **The Factory**: Estructura anidada compleja (`Encabezado > DetallesAnulacion > TablaSecuenciasAnuladas`).

### VEREDICTO
- **Alanube es significativamente más fácil y seguro de configurar** (configuración 1 token, NCFs automáticos, sandbox aislado, documentación clara, errores descriptivos).
- **The Factory funciona bien una vez configurado**, pero la integración fue ~5x más difícil por documentación pobre y sandbox compartido.
- **Ambos están integrados** — se cambia entre proveedores con un click en Settings > Sistema.

## Important Notes
- DO NOT implement offline ordering/syncing
- Use `notranslate` class on numbers
- Respond in Spanish
- Radix ScrollArea fix: `[&_[data-radix-scroll-area-viewport]>div]:!block`
- Mobile detection: `device?.isMobile` from useAuth() (width < 768px)
- The Factory HKA sandbox: shared environment, NCFs get consumed by other users. Start counters at 100+
