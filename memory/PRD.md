# Mesa POS RD - PRD (Product Requirements Document)

## Problem Statement
Sistema POS para restaurante en Republica Dominicana con cumplimiento DGII. Funcionalidades completas incluyendo inventario, proveedores, reportes, fidelidad de clientes, impresion virtual y envio de correos.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn UI + Recharts
- **Backend**: FastAPI + Motor (async MongoDB) + Resend (email)
- **Database**: MongoDB
- **Auth**: JWT + PIN numerico

## What's Been Implemented

### Phase 1 (Feb 2026)
- PIN login con teclado numerico
- Mapa de mesas arrastrables con areas
- Gestion de ordenes con categorias, modificadores, cantidad fraccionada
- Pantalla de cocina con flujo de estados
- Facturacion DGII (ITBIS 18%, Propina, NCF B01)
- Division de cuentas con etiquetas
- Razones de anulacion configurables con retorno a inventario
- Turnos de caja por estacion
- Indicador online/offline + cola de sincronizacion
- Tema oscuro industrial

### Phase 2 (Feb 2026)
- Inventario completo: stock, almacenes, recetas, alertas
- Proveedores: CRUD + ordenes de compra + recepcion de mercancia
- Reportes: ventas diarias, por categoria (pie chart), top productos (bar chart), por mesero
- Clientes & Fidelidad: registro, puntos por consumo, canjeo de puntos
- Email (Resend): cierre de turno, cierre diario por correo
- Impresion virtual: recibos y comandas con vista previa + print CSS
- 31 endpoints backend probados al 100%

## Prioritized Backlog

### P0 (Pendiente)
- Configurar RESEND_API_KEY para envio real de correos
- Integrar fidelidad con facturacion (acumular puntos al pagar)

### P1
- Impresoras ESC/POS (USB y red) - raw printing
- Reportes de inventario (movimientos, mermas)
- Dashboard ejecutivo con KPIs en tiempo real

### P2
- Service Worker para modo offline completo
- Export formatos DGII (607, 608)
- Multi-sucursal
- Gestion de turnos de cocina
