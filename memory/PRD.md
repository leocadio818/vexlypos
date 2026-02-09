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

### Phase 4 (Feb 2026)
- Sistema de permisos por rol con personalizacion por usuario
- Gestion de usuarios completa (crear, editar, eliminar, asignar permisos)
- Mesas con modo edicion protegido (solo usuarios autorizados mueven/redimensionan)
- Redimensionar mesas con slider (adaptable a PC/tablet/celular)
- Formas de pago CRUD (agregar, editar, eliminar)
- Reportes de inventario con costos y margenes de ganancia
- Reporte de rentabilidad por producto (ingreso vs costo de receta)
- Exportacion DGII formato 607 (ingresos) y 608 (gastos)
- Movimientos de inventario con log de auditorla
- Dashboard y reportes ocultos para roles no autorizados
- 48 endpoints backend probados al 100%

### Phase 5 (Feb 2026)
- 9 recetas con costos reales dominicanos (Bandera RD$50, Churrasco RD$90, Langosta RD$390, etc.)
- Tab "Costos y Margenes" en Inventario (precio venta vs costo receta = % margen)
- Tab "Movimientos" en Inventario (log de ajustes con usuario y razon)
- Endpoints ESC/POS para impresoras termicas (recibos y comandas en formato raw)
- Kitchen TV Display (/kitchen-tv) - pantalla completa negra para TV de cocina
  - Auto-refresh cada 4 segundos
  - Reloj en tiempo real
  - Indicadores de urgencia (amarillo >15min, rojo >25min con pulso)
  - Boton fullscreen
  - Click para avanzar estado de items
- Boton "PANTALLA TV" en pagina de cocina regular

### Phase 6 (Dec 2025)
- **Módulo Avanzado de Configuración de Productos** con interfaz de pestañas:
  - **Tab General**: Descripción del producto, descripción impresa (para tickets), categoría del menú, categoría de reporte, control de inventario
  - **Tab General - Estilo del Botón POS**: Selector de colores para fondo y texto del botón en pantalla de ventas con vista previa en tiempo real
  - **Tab Precios**: 5 niveles de precios (Precio A-E) con valores decimales para diferentes horarios/tipos de cliente
  - **Tab Receta**: Enlace al módulo de inventario para gestión de ingredientes
  - **Tab Modificadores**: Asignación de grupos de preguntas forzadas con configuración de selecciones mínimas/máximas y opción de múltiples selecciones
- Nuevos endpoints backend:
  - GET/POST/PUT /api/products con campos extendidos (printed_name, report_category_id, price_a-e, button_bg_color, button_text_color, modifier_assignments)
  - GET /api/products/{id} para obtener producto específico
  - CRUD completo /api/report-categories para categorías de reporte fiscal
  - CRUD /api/modifiers/{id} para gestión individual de grupos de modificadores
- **Reorganización del menú de Configuración**: 
  - Reducido de 14 tabs a 8 tabs principales
  - **Mesas**: Contiene sub-tabs "Mesas" y "Areas"
  - **Ventas**: Contiene sub-tabs "Formas de Pago", "Impuestos", "Anulaciones", "Tipos de Venta"
  - **Inventario**: Contiene sub-tabs "Productos", "Compras", "Stock"
- **Módulo Avanzado de Configuración de Empleados** (/user/:userId):
  - **Tab Informc.Empleado**: Datos personales completos (nombre, apellido, dirección, ciudad, estado, código postal, cédula/IMSS, teléfonos, email, fecha nacimiento), configuración POS (inicio/fin día, centro de ingresos, tarjeta #, referencia, PIN), foto del empleado, modo entrenamiento
  - **Tab Avanzado**: Interfase Sistema (Capacidad Restaurante, Orden Rápida, Host/Hostess, Repartidor, Modo Reparto, Solo Marca E/S), opciones adicionales
  - **Tab Empleador**: Config. Puesto (tabla con tarifa/hora y puesto primario), Selector de Puesto Labores
  - **Horarios**: Grid visual semanal (7 días × 24 horas) con estados (No Requerido, Requerido, No puede trabajar), horas preferidas, nivel de habilidad 1-10
- **Función Mover Mesa**: Permite mover una cuenta completa a otra mesa
  - Diálogo visual con todas las mesas organizadas por área
  - Mesas libres en verde, ocupadas en amarillo
  - Si la mesa destino está ocupada, pregunta si desea unir las cuentas
  - Al unir cuentas: todos los items de origen se mueven a destino, mesa origen queda libre
- **Sistema de División de Cuenta mejorado**: 
  - Modo visual con tabs de divisiones (Mesa #X División 1, División 2, etc.)
  - Selección de items tocándolos (se resaltan en rojo)
  - Botón "+ Nueva" para crear más divisiones
  - Mensaje "1 item(s) seleccionado(s)" con instrucciones
  - División vacía muestra botón "✓ Mover X item(s) aquí"
  - Total por división
  - Backend: POST /api/orders/{id}/move, POST /api/orders/{id}/split
- 100% de tests pasados (backend y frontend)

## Prioritized Backlog

### P0
- Integración con impresoras térmicas ESC/POS físicas (USB/Red)
- Verificar dominio en Resend para email real

### P1
- Sonido de notificación para nuevos pedidos en KDS
- Generación de reportes DGII (607, 608) desde frontend
- Multi-sucursal
- App móvil nativa
- Reservaciones avanzadas (reservar áreas completas)

### P2
- Refactorización: Dividir server.py en módulos separados
- Refactorización: Extraer tabs de Settings.js en componentes independientes

