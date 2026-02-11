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
- **Modificadores**: Sistema de modificadores con grupos y opciones
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
│   └── server.py              # API monolítica (necesita refactoring)
├── frontend/
│   ├── src/
│   │   ├── context/
│   │   │   ├── AuthContext.js   # Autenticación y estado global
│   │   │   └── ThemeContext.js  # Estado del tema Glassmorphism
│   │   ├── components/
│   │   │   ├── Layout.js        # Layout principal con glassmorphism
│   │   │   └── GlassUI.js       # Componentes glass reutilizables
│   │   ├── pages/
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
