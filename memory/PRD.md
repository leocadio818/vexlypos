# POS Restaurant System - Dominican Republic

## Original Problem Statement
Full-stack POS (Point of Sale) application for restaurants in the Dominican Republic. React frontend + FastAPI backend + dual-database architecture (MongoDB for operations, Supabase for financials). Multi-tenant deployment, role-based access control, hardware integration (printers via Python agent), and DGII tax compliance (NCF + e-CF via Alanube).

## Architecture
- **Frontend**: React + TailwindCSS + Shadcn/UI + React Query + Framer Motion (PWA)
- **Backend**: FastAPI + MongoDB
- **External**: Supabase (financials), Alanube (e-CF), Resend (emails)

## What's Been Implemented
- Full POS with table management, orders, kitchen display, cashier
- Role-based access (Admin, Gerente, Cajero, Mesero) with PIN login
- Complete Inventory system (11 tabs): Insumos, Producción, Almacenes, Proveedores, Recetas, Stock, Compras, Valorización, Auditoría, Config, Asistente
- E-CF/DGII electronic billing via Alanube (sandbox)
- Resend email integration for alerts
- PWA with manifest, service worker, React Query caching
- Google Translate protection (notranslate classes)
- Framer Motion page transitions
- Mobile-responsive inventory module (ALL 11 tabs verified with scroll testing)
- Time Clock module for employee hours
- Multi-theme UI system
- Mobile-optimized order screen (2 fixed columns, no column selector on phones)

## Completed Tasks (Recent)
- [2026-03-29] Mobile order screen: Fixed 2 columns on mobile, hidden column selector (Col: 2,3,4,5) on phones only. Tablet/desktop keeps the selector. File: OrderScreen.js
- [2026-03-29] Fixed bottom nav bar overlapping inventory content + horizontal overflow fix
- [2026-03-29] Mobile responsive layouts for all 11 inventory tabs

## Backlog (Prioritized)

### P1
- Reporte de Horas Trabajadas: Dashboard for managers to view/approve Time Clock hours
- Módulo Contable RD (Phased):
  - Fase 1: Cuentas por Pagar/Cobrar
  - Fase 2: Asientos automáticos desde ventas/compras
  - Fase 3: Estados financieros + reportes DGII completos
  - Fase 4: Conciliación bancaria
- Manuales de Usuario: PDF manuals per role
- Integración IA (GPT-4o mini): Inventory assistant, sales analysis, menu suggestions
- CRM: Customer loyalty, segmentation, communication

### P2
- Reporte DGII 608 (NCF Anulados)
- Caché de imágenes offline
- Print Agent Installer update (.bat with qrcode + Pillow)

### P3
- Exportar Audit Trail (Excel/CSV)
- Modo Offline Completo (PAUSED - navigator.onLine unreliable)

## Important Notes
- DO NOT implement offline ordering/syncing
- All new UI with numbers must use `notranslate` class
- Respond in Spanish to user
- Radix ScrollArea fix: `[&_[data-radix-scroll-area-viewport]>div]:!block` prevents horizontal overflow
- Mobile detection: `device?.isMobile` from `useAuth()` context (width < 768px)
