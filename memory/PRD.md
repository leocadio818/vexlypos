# Mesa POS RD - PRD (Product Requirements Document)

## Problem Statement
Sistema POS para restaurante en Republica Dominicana con cumplimiento DGII. Funcionalidades: mapa de mesas arrastrables, comandas a cocina, modificadores de platillos, division de cuentas (50+), propinas, NCF, ITBIS 18%, razones de anulaciones configurables con retorno a inventario, teclado numerico de cantidad con fracciones, multiples estaciones, touchscreen, modo offline, responsive.

## Architecture
- **Frontend**: React 19 + Tailwind CSS + Shadcn UI
- **Backend**: FastAPI + Motor (async MongoDB)
- **Database**: MongoDB
- **Auth**: JWT + PIN numerico (hashlib SHA256)

## User Personas
1. **Mesero/Camarero** - Toma ordenes, gestiona mesas
2. **Cajero** - Facturacion, cobros, cierres de turno
3. **Chef/Cocina** - Visualiza comandas, cambia estados
4. **Administrador** - Configuracion, gestion completa

## What's Been Implemented (Feb 2026)
- PIN login con teclado numerico
- Mapa de mesas arrastrables con areas (Salon, Terraza, Bar, VIP)
- Gestion de ordenes con categorias y productos dominicanos
- Modificadores de platillos (Punto de coccion, Extras, Acompanantes, Sin...)
- Seleccion de cantidad manual con fracciones (0.25, 0.50, etc.)
- Envio de comandas a cocina
- Pantalla de cocina con flujo de estados (Pendiente→Preparando→Listo→Servido)
- Facturacion con ITBIS 18%, Propina Legal 10%, NCF (B01)
- Division de cuentas con etiquetas personalizadas
- Metodos de pago (Efectivo/Tarjeta)
- Apertura/cierre de turnos por estacion
- Razones de anulacion configurables (retorno a inventario si/no)
- Configuracion de areas, mesas, productos, razones
- Indicador de conexion online/offline
- Cola offline para operaciones sin internet
- Tema oscuro industrial con acentos naranja (Oswald + Manrope fonts)
- 29 productos dominicanos autenticos como seed data

## Prioritized Backlog

### P0 (Next Phase)
- Inventario completo: recetas, almacenes, stock real
- Proveedores y ordenes de compra
- Recibir ordenes de compra
- Alertas de inventario (pantalla + correo)

### P1
- Reportes de ventas (diario, semanal, mensual)
- Cierre de dia enviado por correo
- Cierre de turno impreso
- Impresoras termicas (comandas + recibos)
- Reportes de inventario

### P2
- Service Worker para modo offline completo
- Gestion de usuarios completa
- Multiples cajas/estaciones simultarias
- Historico de ventas y analytics
- Export a formatos DGII
