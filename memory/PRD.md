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

### Phase 3 (Feb 2026)
- Dashboard ejecutivo en tiempo real (KPIs: ventas, ITBIS, ocupacion, alertas)
- Grafico de ventas por hora (AreaChart)
- Fidelidad integrada en facturacion (puntos automaticos al pagar con cliente seleccionado)
- Resend API key configurada para envio de correos
- Dashboard como pagina principal despues del login
- 36 endpoints backend probados al 100%

## Prioritized Backlog

### P0 (Pendiente)
- Verificar dominio en Resend para envio real de correos (https://resend.com/domains)
- Impresoras ESC/POS fisicas (USB + red)

### P1
- Reportes de inventario (movimientos, mermas)
- Export formatos DGII (607, 608)
- Multi-sucursal

### P2
- Service Worker para modo offline completo
- Gestion de turnos de cocina
- App movil nativa
