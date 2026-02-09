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

### Phase 7 (Feb 2026) - División de Cuentas Múltiples
- **Sistema de Múltiples Cuentas por Mesa (COMPLETADO)**:
  - Cada mesa puede tener múltiples órdenes/cuentas independientes
  - Nuevo endpoint: POST /api/orders/{id}/split-to-new - crea nueva orden moviendo items seleccionados
  - Nuevo endpoint: GET /api/tables/{tableId}/orders - obtiene todas las órdenes activas de una mesa
  - **Nuevo endpoint: POST /api/tables/{tableId}/orders/new - crea cuenta vacía directamente**
  - **Nuevo endpoint: DELETE /api/orders/{orderId}/empty - elimina cuenta vacía**
  - **Nuevo endpoint: POST /api/orders/{id}/merge/{targetId} - fusiona dos cuentas**
  - Estado de mesa "divided" cuando tiene más de una cuenta activa
  - Indicador visual en el mapa de mesas: patrón de rayas diagonales para mesas divididas
  - **UI mejorada con tabs de cuentas visibles en vista normal** (no solo en modo dividir)
  - **Botón "+ Nueva" para crear cuentas vacías sin entrar al modo dividir**
  - **Botón "X" para eliminar cuentas vacías** (solo aparece si la cuenta está vacía y hay más de una cuenta)
  - **Botón "Unir" azul para fusionar cuentas** (solo aparece cuando hay 2+ cuentas)
  - **Diálogo de fusión muestra cuentas destino con cantidad de items y total RD$**
  - **Ícono de impresora 🖨️ en cada tab de cuenta** para imprimir pre-cuenta individual (solo visible con 2+ cuentas)
  - Título dinámico muestra "Mesa X - Cuenta #Y" cuando hay múltiples cuentas
  - Navegación entre cuentas con un toque
  - Botón "CREAR NUEVA CUENTA" visible cuando hay items seleccionados en modo dividir
  - Validaciones: no permite fusionar consigo misma ni entre mesas diferentes
  - Fix crítico: Corregido error require_auth → get_current_user en endpoint split-to-new
- **Testing Exhaustivo**: 100% tests pasados (backend y frontend)

### Phase 8 (Feb 2026) - Mejoras UX y Seguridad
- **Control de Acceso a Mesas por Usuario**:
  - **Meseros** solo pueden acceder a mesas que ellos abrieron
  - **Cajeros** pueden acceder a cualquier mesa (necesitan cobrar)
  - **Supervisores, Gerentes, Admin** pueden acceder a todas las mesas
  - Nuevo permiso: `access_all_tables` en sistema de permisos
  - Nuevo rol: `supervisor` con permisos intermedios
  - Pantalla de "Acceso Denegado" con ícono de candado y nombre del mesero dueño
  - Botón "Volver a Mesas" para regresar fácilmente
- **Layout Mejorado de Pantalla de Órdenes**:
  - **Layout invertido**: Cuenta a la derecha, Menú a la izquierda
  - **Botones de acción fijos** en la parte inferior del panel (ENVIAR, FACTURAR, Mover, Dividir, Pre-Cuenta)
  - **Selector de columnas** para categorías y productos (2-6 columnas)
  - Configuración guardada en localStorage
- **Mejoras de UX**:
  - Toast notifications reducidos a 500ms
  - Botón "ENVIAR" simplificado (antes era "ENVIAR A COCINA")
  - Bug fix: Montos rápidos en pago ahora respetan el método de pago seleccionado
- **Mover Mesa con Múltiples Cuentas (Feb 9, 2026)**:
  - **Nuevo endpoint: POST /api/tables/{tableId}/move-all** - Mueve TODAS las órdenes de una mesa a otra
  - Al mover una mesa dividida, todas las cuentas se trasladan automáticamente
  - La mesa destino hereda el estado "divided" si recibe más de una cuenta
  - La mesa origen queda automáticamente libre
  - Validaciones: no permite mover a la misma mesa, verifica existencia de ambas mesas
  - Si la mesa destino tiene órdenes activas, retorna `needs_merge` para confirmación del usuario
  - Frontend actualizado para detectar mesas con múltiples cuentas y usar el nuevo endpoint
  - **Archivo de sonido para notificaciones de cocina creado**: `/public/sounds/notification.mp3`

## PINs de Acceso (Datos de Demo)
| Usuario | PIN | Rol |
|---------|-----|-----|
| Admin | 0000 | admin |
| Carlos | 1234 | waiter |
| Maria | 5678 | waiter |
| Luis (Cajero) | 4321 | cashier |
| Chef Pedro | 9999 | kitchen |

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

