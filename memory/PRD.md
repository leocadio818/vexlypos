# POS Restaurant System - Dominican Republic

## Original Problem Statement
Full-stack POS application for DR restaurants. React + FastAPI + MongoDB. Multi-tenant, RBAC, printer integration, DGII compliance.

## Architecture
- Frontend: React + TailwindCSS + Shadcn/UI + React Query + Framer Motion (PWA)
- Backend: FastAPI + MongoDB
- External: Supabase, Alanube (e-CF), Resend (emails)

## Completed Tasks (Recent - 2026-03-29)
- **Reports mobile redesign**: Full-width menu replaces sidebar on mobile. Full-width report content with ☰ button to return to menu. All report types tested (Cierre, Mesero, Categoría)
- **Clientes page fix**: Compact header, icon-only buttons on mobile, customer cards with visible edit/canjear buttons  
- **Bottom padding global**: `pb-28` on ALL scrollable pages (Settings, Reports, Dashboard, CashRegister, Customers, Kitchen, Reservations, InventoryManager, ProductConfig)
- **Inventory mobile**: All 11 tabs responsive with Radix ScrollArea `display:block` fix
- **Order screen**: 2 fixed columns on mobile, hidden column selector, product search button (lupa)

## Backlog

### P1
- Reporte de Horas Trabajadas
- Módulo Contable RD (Fase 1: Cuentas por Pagar/Cobrar)
- Manuales de Usuario PDF
- Integración IA (GPT-4o mini)
- CRM

### P2
- Reporte DGII 608, Caché imágenes, Print Agent Installer

### P3
- Exportar Audit Trail, Modo Offline (PAUSED)

## Important Notes
- DO NOT implement offline ordering/syncing
- Use `notranslate` class on numbers
- Respond in Spanish
- Radix ScrollArea fix: `[&_[data-radix-scroll-area-viewport]>div]:!block`
- Mobile detection: `device?.isMobile` from useAuth() (width < 768px)
