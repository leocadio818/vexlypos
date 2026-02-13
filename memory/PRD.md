# MESA POS - Sistema de Punto de Venta para Restaurantes

## Descripción General
Sistema POS (Point of Sale) completo para restaurantes con características avanzadas de gestión de mesas, pedidos, pagos, inventario, y reportes. Diseñado con un estilo visual moderno "Glassmorphism" (Liquid Glass).

## Idioma de Usuario
**Español (República Dominicana)**

---

## Estado Actual del Proyecto

### ✅ Funcionalidades Completadas

#### Core del Sistema
- **Autenticación PIN**: Sistema de login con PIN numérico de 4-6 dígitos
- **Roles y Permisos**: Admin, Gerente, Propietario, Cajero, Mesero, Chef con permisos granulares
- **Diseño Responsivo**: Adaptación automática para móvil, tablet y escritorio

#### Gestión de Mesas
- **Mapa Interactivo**: Mesas arrastrables con estados visuales (libre, ocupada, facturada, reservada)
- **Áreas Configurables**: Terraza, Salón Principal, Bar, etc.
- **Cuentas Múltiples**: Soporte para múltiples cuentas por mesa

#### Pedidos
- **Categorías y Productos**: Grid configurable con colores personalizados
- **Modificadores Avanzados**: Sistema de modificadores con grupos, opciones con precios individuales, validación de requeridos
- **Visualización de Modificadores**: Precios individuales visibles en carrito y cocina
- **Envío a Cocina**: Items marcados por estado (pendiente, preparando, listo)
- **División de Cuentas**: Mover items entre cuentas

#### Pagos
- **Métodos Personalizables**: Efectivo, tarjeta (Visa/MC logos), transferencia, USD, EUR
- **Tasas de Cambio**: Configurables para monedas extranjeras
- **Propinas**: Cálculo automático con porcentajes predefinidos
- **ITBIS**: Impuesto dominicano calculado automáticamente

#### Cocina (KDS)
- **Pantalla de Cocina**: Vista de órdenes pendientes por canal
- **Pantalla TV**: Vista expandida para monitores de cocina
- **Estados de Items**: Pendiente → Preparando → Listo

#### Caja y Turnos
- **Apertura/Cierre de Turno**: Con conteo de efectivo
- **Historial de Turnos**: Registro completo de ventas por turno
- **Reportes por Email**: Envío de reporte de cierre

#### Reservaciones
- **Calendario**: Vista por fecha con slots de tiempo
- **Bloqueo de Mesas**: Mesas se marcan reservadas automáticamente

#### Inventario Maestro (NUEVO - Febrero 2026)
- **Insumos/Ingredientes**: CRUD completo con unidad de medida, categoría, stock mínimo y costo promedio
- **Almacenes**: Múltiples ubicaciones para gestionar stock separadamente
- **Proveedores**: Gestión de proveedores con contacto, teléfono, email, RNC
- **Recetas**: Vinculación de productos de venta con ingredientes, incluyendo % de merma
- **Stock por Almacén**: Niveles de inventario por ubicación con alertas de stock bajo
- **Transferencias**: Mover insumos entre almacenes con historial completo
- **Ajustes de Inventario**: Ajustes manuales con razón (conteo físico, merma, vencimiento, etc.)
- **Órdenes de Compra**: Ciclo completo (Borrador → Pendiente → Parcial → Recibida)
- **Conciliación de Precios**: Al recibir OC, comparar cantidad pedida vs recibida y actualizar costo promedio automáticamente
- **Historial de Movimientos**: Registro de todos los movimientos de stock (compras, transferencias, ajustes, mermas)
- **Alertas de Stock Bajo**: 
  - Banner visual en pantalla cuando hay items bajo mínimo
  - Envío de alertas por email a múltiples destinatarios
  - Configuración de emails destinatarios
  - Toggle para activar/desactivar alertas automáticas
  - Botón para verificar y enviar alerta manualmente
  - **Alertas programadas**: Scheduler con APScheduler para envío diario automático
  - Selector de hora configurable (ej: 08:00 AM)
  - Muestra próxima ejecución programada
- **Sistema de Explosión de Inventario (Sub-recetas)**:
  - Soporte para sub-recetas (ingredientes que se producen a partir de otros ingredientes)
  - Verificación recursiva de disponibilidad de stock
  - Explosión automática cuando no hay stock de sub-receta preparada
  - Descuento proporcional de ingredientes base
  - Actualización dinámica de costos de sub-recetas cuando cambian precios de ingredientes
  - Trazabilidad completa con `parent_product_id` y `parent_recipe_id` en movimientos
  - Tipos de movimiento: sale, explosion, purchase, transfer, adjustment
- **Tolerancia**: Liberación automática si no llegan

#### Dashboard
- **KPIs en Tiempo Real**: Ventas, efectivo, tarjeta, propinas
- **Gráfico de Ventas por Hora**: Visualización del flujo de ventas
- **Alertas de Inventario**: Productos bajo stock mínimo

### 🎨 Diseño Glassmorphism (NUEVO - Diciembre 2025)
- **Fondo con Gradiente**: Púrpura/azul con orbes animados
- **Efecto de Vidrio Esmerilado**: Backdrop blur en todos los paneles
- **Paleta de Colores Personalizable**: Accesible desde Configuración (solo admin/gerente/propietario)
- **Pantallas Aplicadas**: Login, Mapa de Mesas, Dashboard, Caja, Reservaciones, Pedidos, Configuración
- **Excluidas por Visibilidad**: Cocina y Pantalla TV (mantienen diseño original oscuro)

#### Opciones de Personalización (Paleta de Colores):
- 4 colores del gradiente (inicio, medio1, medio2, final)
- Color de acento (naranja por defecto)
- Opacidad del efecto glass (5-30%)
- Intensidad del blur (4-24px)
- 3 colores de orbes animados (formato rgba)

### 📡 Modo Offline
- **Service Worker**: Cache de datos críticos
- **IndexedDB**: Almacenamiento local de pedidos pendientes
- **Indicadores de Estado**: Icono WiFi con badge de pendientes
- **Sincronización**: Automática al recuperar conexión

### 🖥️ Paquete de Servidor Local
- **Docker Compose**: Configuración completa para despliegue on-premise
- **Scripts de Instalación**: Windows (.bat) y Linux/Mac (.sh)
- **Guía de Instalación**: `/app/local-server/GUIA_INSTALACION.md`

---

## Tareas Pendientes

### P1 - Alta Prioridad
- [ ] **Crear paquete ZIP descargable** del servidor local
- [ ] **Integración de impresora ESC/POS** física

### P2 - Media Prioridad
- [ ] **Reloj de empleados**: Check-in/out con reportes
- [ ] **Reportes DGII**: Generación de formatos 607, 608
- [ ] **Imágenes de productos**: Soporte para fotos/iconos en botones
- [ ] **Cache de imágenes offline**: Para menú sin conexión

### P3 - Baja Prioridad
- [ ] **Drag-and-drop**: Reordenar métodos de pago
- [ ] **Exportar auditoría**: Historial de movimientos de mesas a Excel/CSV
- [ ] **Duplicar productos**: Botón de duplicación rápida

---

## Arquitectura Técnica

### Backend
- **FastAPI**: Framework Python
- **MongoDB**: Base de datos
- **Endpoints**: `/api/*` con autenticación JWT

### Frontend
- **React**: Framework JavaScript
- **Shadcn/UI**: Componentes base
- **TailwindCSS**: Estilos
- **Recharts**: Gráficos

### Archivos Clave
```
/app
├── backend/
│   └── server.py              # API con endpoints de inventario
├── frontend/
│   ├── src/
│   │   ├── context/
│   │   │   ├── AuthContext.js   # Autenticación y estado global
│   │   │   └── ThemeContext.js  # Estado del tema Glassmorphism
│   │   ├── components/
│   │   │   ├── Layout.js        # Layout principal con glassmorphism
│   │   │   └── GlassUI.js       # Componentes glass reutilizables
│   │   ├── lib/
│   │   │   └── api.js           # APIs incluyendo inventario
│   │   ├── pages/
│   │   │   ├── InventoryManager.js  # NUEVO: Módulo de inventario maestro
│   │   │   ├── Login.js         # Login con glassmorphism
│   │   │   ├── TableMap.js      # Mapa de mesas
│   │   │   ├── OrderScreen.js   # Pantalla de pedidos
│   │   │   ├── PaymentScreen.js # Pantalla de cobro (glassmorphism)
│   │   │   ├── Dashboard.js     # Dashboard KPIs
│   │   │   ├── CashRegister.js  # Caja y turnos
│   │   │   ├── Reservations.js  # Reservaciones
│   │   │   ├── Settings.js      # Configuración (incluye Paleta)
│   │   │   ├── Kitchen.js       # KDS (sin glassmorphism)
│   │   │   └── KitchenTV.js     # TV Cocina (sin glassmorphism)
│   │   └── hooks/
│   │       ├── useDeviceDetect.js  # Detección de dispositivo
│   │       └── useOfflineSync.js   # Sincronización offline
│   └── package.json
└── local-server/                # Paquete de despliegue local
    ├── GUIA_INSTALACION.md
    └── docker-compose.yml
```

---

## Credenciales de Prueba
- **Admin**: PIN `0000`
- **Mesero Carlos**: PIN `1234`
- **Cajero Luis**: PIN `4321`
- **Chef Pedro**: PIN `9999`
- **María**: PIN `5678`

---

## Integraciones de Terceros
- **Resend**: Configurado para envío de emails (requiere API key del usuario)
- **Impresión**: Mocked (vista previa en pantalla, sin impresora física)

---

## Changelog Reciente

### Febrero 2026
- ✅ **Búsqueda inteligente de productos**: Barra de búsqueda en Configuración > Inventario > Productos
- ✅ **Módulo de Inventario Maestro**: Sistema completo de gestión de inventario:
  - CRUD de Insumos/Ingredientes con categorías y unidades
  - Gestión de Almacenes múltiples
  - Gestión de Proveedores con datos de contacto
  - Recetas vinculando productos con ingredientes + % merma
  - Stock por almacén con transferencias y ajustes
  - Órdenes de Compra con ciclo completo y conciliación de precios
  - Historial de movimientos de stock
  - Nueva página: `/inventory-manager` con 6 tabs

### Diciembre 2025
- ✅ Implementado diseño Glassmorphism en todo el sistema
- ✅ Creado panel de Paleta de Colores en Configuración
- ✅ Excluidas pantallas de Cocina del glassmorphism (visibilidad)
- ✅ APIs de tema: GET/PUT /api/theme-config, POST /api/theme-config/reset
- ✅ Verificación de roles para acceso a personalización de tema

### Anteriores
- ✅ Botones de pago personalizables con iconos de marca
- ✅ UI totalmente responsiva (móvil/tablet/escritorio)
- ✅ Modo offline con IndexedDB
- ✅ Paquete de servidor local con Docker
- ✅ Ocultación de Configuración para no-admins
