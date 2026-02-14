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
  - **Módulo de Margen de Ganancia Dinámico (NUEVO - Febrero 2026)**:
    - Calculadora de Margen integrada en el diálogo de Editar/Nueva Receta
    - Indicador de margen en vivo junto al precio de venta
    - **Cálculo bidireccional**:
      - Si el usuario ingresa % de margen → sistema sugiere precio de venta
      - Si el usuario ingresa precio → sistema calcula margen actual en tiempo real
    - **Alertas visuales con código de colores**:
      - 🔴 Rojo (Crítico): Margen < 15%
      - 🟡 Amarillo (Advertencia): Margen < 30%
      - 🟢 Verde (Saludable): Margen ≥ 30%
    - Botón "Usar precio recomendado" para aplicar precio sugerido con 1 click
    - Badge de margen visible en la lista de recetas
    - Borde de color en cada receta según estado del margen
- **Stock por Almacén**: Niveles de inventario por ubicación con alertas de stock bajo
- **Transferencias**: Mover insumos entre almacenes con historial completo
- **Ajustes de Inventario**: Ajustes manuales con razón (conteo físico, merma, vencimiento, etc.)
- **Órdenes de Compra**: Ciclo completo (Borrador → Pendiente → Parcial → Recibida)
- **Conciliación de Precios**: Al recibir OC, comparar cantidad pedida vs recibida y actualizar costo promedio automáticamente
- **Historial de Movimientos**: Registro de todos los movimientos de stock (compras, transferencias, ajustes, mermas)
- **Lógica de Conversión Universal (NUEVO - Febrero 2026)**:
  - Insumo único en el sistema con tres niveles de medida obligatorios:
    - Unidad de Compra: presentación del proveedor (Caja, Saco, Paca)
    - Unidad de Despacho (Base): medida mínima de consumo (Onza, Gramo, Unidad)
    - Factor de Conversión: multiplicador que conecta ambas (1 Caja = 283.2 Onzas)
  - Relación Multiplexada: un insumo puede vincularse a múltiples productos de venta con diferentes consumos
    - Producto A (Botella): descuenta X unidades de despacho
    - Producto B (Trago): descuenta Y unidades de despacho
    - Producto C (Coctel): descuenta Z unidades de despacho
  - Cálculo de Costo Dinámico: (Costo Compra ÷ Factor) × Cantidad en Receta × (1 + Merma%)
  - Botón de calculadora verde en cada ingrediente para ver análisis completo
  - Diálogo "Análisis de Conversión Universal" con:
    - Visualización del flujo de conversión (Compra → Factor → Despacho)
    - Lista de "Productos Vinculados" con costos calculados
    - "Impacto Total" sumando costos de todas las recetas
    - Fórmula de costo explicada con ejemplo
  - Endpoint `/api/ingredients/{id}/conversion-analysis` para consultas
- **Gestión de Unidades de Medida (NUEVO - Febrero 2026)**:
  - Panel "Gestionar Unidades" en pestaña Insumos
  - CRUD de unidades personalizadas (nombre, abreviatura, categoría)
  - Propagación automática: al renombrar una unidad, se actualiza en todos los insumos vinculados
  - Bloqueo de eliminación si la unidad está en uso
  - Prevención de duplicados por nombre o abreviatura
  - Aviso visual de impacto al editar unidades
  - Colección `unit_definitions` para almacenar unidades personalizadas
  - Colección `unit_audit_logs` para trazabilidad de cambios
- **Calculadora de Factor de Conversión (NUEVO - Febrero 2026)**:
  - Campos configurables: Unidad de Compra, Cantidad de Compra, Equivalencia en Despacho
  - Cálculo automático del Factor de Conversión (dispatch_qty / purchase_qty)
  - Preview en tiempo real del Costo por Unidad de Despacho (avg_cost / factor)
  - Edición libre del factor permitida para ajustes finos
  - Historial de auditoría: registra quién cambió qué campo y cuándo
  - Aviso de impacto: muestra cuántas recetas se verán afectadas por cambios
  - Colección `ingredient_audit_logs` para trazabilidad completa
  - Endpoint `/api/ingredients/{id}/affected-recipes` para consultar recetas vinculadas
  - Endpoint `/api/ingredients/{id}/audit-logs` para historial de cambios
- **Stock Multinivel & Diferencias (NUEVO - Febrero 2026)**:
  - Pestaña "Stock" renombrada a "Stock Multinivel & Diferencias"
  - Tabla con columna "Stock Detallado" mostrando desglose en cascada:
    - Ejemplo: 18 lb > 0.35 lb (18 unidades de compra + residuo en unidades de despacho)
    - Relación de conversión visible: "1 lb = 1 lb" o "1 caja = 12 botella"
  - Cálculo en cascada universal: funciona con cualquier jerarquía (Cajas > Botellas > Oz, Sacos > Libras > Onzas)
  - Botón "Diferencia" en cada fila para registrar ajustes de conteo físico
  - Diálogo "Registrar Diferencia de Inventario":
    - Selector de tipo: Faltante (rojo) o Sobrante (verde)
    - Entrada de cantidad en cualquier unidad (Compra o Despacho)
    - Cálculo automático del valor monetario: cantidad × costo_unitario_despacho
    - Selector de razón: Conteo físico, Error de registro, Producto dañado, Vencimiento, Pérdida desconocida, etc.
    - Campo de observaciones
    - Registro de quién autoriza (nombre del administrador)
  - Colección `stock_difference_logs` para auditoría completa
  - Endpoint GET `/api/stock/multilevel` con desglose calculado
  - Endpoint POST `/api/stock/difference` con conversión automática
  - Endpoint GET `/api/stock/differences` con estadísticas agregadas
- **Historial de Auditoría de Insumos (NUEVO - Febrero 2026)**:
  - Nueva pestaña "Auditoría" en Inventario Maestro con estilo Keep Money (Dorado y Oscuro)
  - Tabla cronológica de cambios con columnas: Fecha/Hora, Usuario, Insumo, Campo Editado, Valor Anterior (rojo), Valor Nuevo (verde)
  - Tarjetas de estadísticas: Total de Cambios, Insumos Afectados, Tipos de Campo
  - Filtros de búsqueda: Nombre del Insumo (búsqueda parcial), Fecha Inicio/Fin, Campo Editado
  - Botón "Exportar Historial" genera archivo Excel con datos y resumen
  - Endpoint `/api/ingredients/audit-logs/all` con filtros opcionales
- **Valorización de Inventario (NUEVO - Febrero 2026)**:
  - Nueva pestaña "Valorización" en Inventario Maestro con estilo esmeralda financiero
  - Cálculo de valor: Stock Actual × Costo Unitario por cada insumo
  - Tarjeta destacada con Valor Total del Inventario en tiempo real
  - Desglose por Categoría con valores, porcentajes y barras de progreso
  - Desglose por Almacén con valores, porcentajes y barras de progreso
  - Filtros por Almacén y Categoría con botón "Aplicar Filtros"
  - Indicador de Stock Muerto en rojo (alto valor >RD$1000, <10% movimiento en 30 días)
  - Tabla detallada con columnas: Insumo, Categoría, Almacén, Stock, Costo Unit., Valor Stock, Mov. 30d
  - Badges visuales: "Stock Muerto" (rojo), "Stock Bajo" (ámbar)
  - Exportar a Excel con 4 hojas: Valorización, Resumen, Por Categoría, Tendencias
  - Endpoint `/api/reports/inventory-valuation` con filtros warehouse_id y category
  - **Gráficos de Tendencias (NUEVO - Febrero 2026)**:
    - Gráfico de Línea: Evolución del valor del inventario día a día (Recharts)
    - Gráfico de Pastel: Distribución porcentual por categoría con colores distintivos
    - Filtro de período: 7 días, 30 días, Año Fiscal completo
    - Selector de año fiscal (2024, 2025, 2026)
    - Indicador de tendencia: % de cambio vs período anterior (sube/baja/estable)
    - Tooltip interactivo con valores formateados en RD$
    - Endpoint `/api/reports/valuation-trends` con params `period` y `year`
- **Alertas de Stock Bajo**: 
  - Banner visual en pantalla cuando hay items bajo mínimo
  - Envío de alertas por email a múltiples destinatarios
  - Configuración de emails destinatarios
  - Toggle para activar/desactivar alertas automáticas
  - Botón para verificar y enviar alerta manualmente
  - **Alertas programadas**: Scheduler con APScheduler para envío diario automático
  - Selector de hora configurable (ej: 08:00 AM)
  - Muestra próxima ejecución programada
- **Sistema de Control de Costos y Asistente de Compras Inteligente (NUEVO - Febrero 2026)**:
  - Nueva pestaña "Asistente" en Inventario Maestro con tema cian
  - **Tres vistas integradas**:
    - **Sugerencias de Compra**: Tabla de items a reordenar basada en consumo y stock mínimo
    - **Alertas de Precio**: Detección automática de aumentos >5% en precios de compra
    - **Análisis de Márgenes**: Recálculo de costos y márgenes de todas las recetas
  - **Funcionalidades de Sugerencias**:
    - Filtros por Proveedor y Almacén de destino
    - Toggle "Incluir OK" para ver todos los items o solo los de stock bajo
    - Cards de resumen: Agotados, Stock Bajo, Sugerencias, Total Estimado
    - Checkboxes para selección múltiple de items
    - Botones "Seleccionar Todo" y "Deseleccionar"
    - Cálculo automático de cantidad sugerida (14 días de supply o 2x mínimo)
    - Redondeo inteligente a unidades de compra
    - Columnas: Días de stock, Cantidad sugerida, Precio unitario, Total estimado
    - Botón "Historial" para ver evolución de precios por ingrediente
  - **Generación de Órdenes de Compra (1-click)**:
    - Botón "Generar OC" crea PO automáticamente con items seleccionados
    - **Agrupación automática por proveedor**: Si se seleccionan items de múltiples proveedores, genera una OC separada para cada uno
    - **Indicador visual de proveedores**: Badge que muestra "X proveedores = X OCs" antes de generar
    - Estado inicial "draft" para revisión antes de enviar
    - Toast de éxito muestra resumen de OCs creadas
    - Items sin proveedor asignado son ignorados con aviso
  - **Sistema de Alertas de Precio**:
    - Comparación automática del último precio vs precio anterior
    - Alerta visual cuando aumento >5%
    - Muestra: precio anterior, precio nuevo, % de cambio
    - Indicador de recetas afectadas
    - Registro en auditoría con campo "source: purchase_order"
  - **Análisis de Márgenes**:
    - Botón "Recalcular Márgenes" ejecuta análisis completo
    - Cálculo: Costo unitario de receta vs precio de venta
    - Clasificación: Crítico (<15%), Advertencia (<30%), OK (≥30%)
    - Cards de resumen: Críticos, Advertencia, OK, Margen Promedio
    - Lista de productos con márgenes problemáticos
    - Precio sugerido para restaurar margen objetivo
  - **Historial de Precios**:
    - Diálogo con estadísticas: Precio min/max/promedio
    - Indicador de tendencia (subiendo/bajando/estable)
    - Tabla de compras históricas con fecha, proveedor, cantidad, precio
  - **Proveedor Predeterminado**:
    - Nuevo campo en diálogo de edición de ingredientes
    - Selector con todos los proveedores activos
    - Usado por el Asistente para filtrar y generar POs
    - Helper text explicando uso
  - **Endpoints nuevos**:
    - GET `/api/purchasing/suggestions`: Sugerencias de compra con filtros
    - GET `/api/purchasing/price-alerts`: Alertas de incrementos de precio
    - POST `/api/purchasing/recalculate-recipe-margins`: Análisis de márgenes
    - GET `/api/ingredients/{id}/price-history`: Historial de precios con estadísticas
    - POST `/api/purchasing/generate-po`: Generar PO desde sugerencias
  - **Mejoras al endpoint de recepción de PO**:
    - Detección automática de aumentos de precio al recibir
    - Respuesta incluye array `price_alerts` si hay aumentos
    - Registro en auditoría de cambios de costo
    - Actualización de `dispatch_unit_cost` con el nuevo avg_cost
- **Sistema de Explosión de Inventario (Sub-recetas)**:
  - Soporte para sub-recetas (ingredientes que se producen a partir de otros ingredientes)
  - Verificación recursiva de disponibilidad de stock
  - Explosión automática cuando no hay stock de sub-receta preparada
  - Descuento proporcional de ingredientes base
  - Actualización dinámica de costos de sub-recetas cuando cambian precios de ingredientes
  - Trazabilidad completa con `parent_product_id` y `parent_recipe_id` en movimientos
  - Tipos de movimiento: sale, explosion, purchase, transfer, adjustment
- **Producción de Sub-recetas (Batch)**:
  - Botón "Producir" en ingredientes tipo sub-receta
  - Diálogo para seleccionar cantidad y almacén
  - Verificación de disponibilidad antes de producir
  - Cálculo automático de costo de producción
  - Consumo de ingredientes base y generación de stock de sub-receta
  - Registro de producción con notas (ej: número de lote)
  - Historial de producciones
- **Dashboard de Producción**:
  - Tab dedicado "Producción" en Inventario Maestro
  - Sección "PRODUCCIÓN URGENTE" con items bajo stock mínimo (fondo rojo)
  - Sección "STOCK ADECUADO" con items OK (fondo verde)
  - Cantidad sugerida a producir (calculado automáticamente)
  - Costo aproximado de producción
  - Botón "Producir Ahora" para acción rápida
  - Historial de producciones recientes con fecha, cantidad, costo y notas
- **Tolerancia**: Liberación automática si no llegan
- **Control de Stock en Ventas (NUEVO - Febrero 2026)**:
  - Toggle "Permitir Venta sin Stock" en Configuración > Inventario > Config
  - Cuando está desactivado, productos sin stock muestran badge "Agotado" y botón deshabilitado
  - Selector de "Almacén Principal" para definir origen del stock
  - Toggle "Mostrar Alertas de Stock Bajo" para indicadores visuales
  - Endpoint `/api/inventory/products-stock` para consultar estado de stock de todos los productos
  - **Deducción de inventario al ENVIAR A COCINA** (no al pagar)
- **Sistema de Anulaciones con Control de Inventario (NUEVO - Febrero 2026)**:
  - Catálogo de razones de anulación con toggle "Retorna a Inventario"
  - **Si retorna** (ej: "Error de digitación"): Los insumos vuelven al stock
  - **Si no retorna / Merma** (ej: "Plato quemado"): Se registra como pérdida sin devolver stock
  - Diálogo VoidReasonModal mejorado con:
    - Selector de razón con badges visuales (Retorna verde / Merma rojo)
    - Toggle manual "¿Devolver a Inventario?" que se auto-ajusta según razón
    - Campo de comentarios opcional para auditoría
  - Soporta anulación de item individual, múltiples items o cuenta completa
  - Auditoría completa en colección `void_audit_logs` con:
    - ID de orden/item, usuario, razón, timestamp
    - Flag `restored_to_inventory` para trazabilidad
    - Comentarios adicionales
  - Movimientos de stock registrados como `void_restoration` o `waste`
- **Reporte de Anulaciones (NUEVO - Febrero 2026)**:
  - Nueva página `/reports/anulaciones` con análisis completo
  - Resumen ejecutivo: Total Anulado, Recuperado, Pérdida/Merma, Tasa de Recuperación
  - Ranking de Razones con gráfico de barras (Recharts)
  - Distribución por Razón con gráfico circular (Pie Chart)
  - Auditoría por Usuario: tabla con anulaciones, valores, y % de pérdida
  - Filtros temporales: Hoy, Semana, Mes
  - Exportación a Excel (xlsx) con múltiples hojas
  - Endpoint `/api/void-audit-logs/report` con agregaciones
- **Autorización Jerárquica para Anulaciones (NUEVO - Febrero 2026)**:
  - Campo `requires_manager_auth` en razones de anulación
  - Razones que requieren auth: Botella no abierta, Plato mal preparado, Cliente se fue, Botella/bebida abierta, Comida rechazada
  - Razones sin auth: Error de digitación, Plato no preparado
  - Teclado numérico para ingreso de PIN de gerente
  - Endpoint `/api/auth/verify-manager` para validar PIN
  - Registro de `authorized_by_id` y `authorized_by_name` en auditoría
  - Badge visual "Auth" en razones que requieren autorización

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

### 🔄 Consolidación de UI de Inventario (Febrero 2026)
- **Eliminado**: Sistema de inventario antiguo (`/inventory` y `Inventory.js`)
- **Unificado**: Solo existe "Inventario Maestro" (`/inventory-manager` y `InventoryManager.js`)
- **Redirección**: `/inventory` redirige automáticamente a `/inventory-manager`
- **Enlaces actualizados**: 
  - ProductConfig → `/inventory-manager?tab=recipes`
  - Settings → `/inventory-manager` y `/inventory-manager?tab=purchases`

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

### P0 - En Progreso
- [x] **Refactorización Backend Fase 2** (Completado 14 Feb 2026) ✅
- [x] **Refactorización Frontend - Fase 1** (Completado 14 Feb 2026) ✅
  - Extraído `AssistantTab.jsx` (~613 líneas) del monolito
  - `InventoryManager.js` reducido de 4503 a 3873 líneas (-14%)
- [x] **Refactorización Frontend - Fase 2** (Completado 14 Feb 2026) ✅
  - Extraído `IngredientsTab.jsx` (~737 líneas) del monolito
- [x] **Refactorización Frontend - Fase 3** (Completado 14 Feb 2026) ✅
  - Extraído `ProductionTab.jsx`, `WarehousesTab.jsx`, `SuppliersTab.jsx` del monolito
  - Extraído `RecipesTab.jsx`, `StockTab.jsx` del monolito
  - `InventoryManager.js` reducido de 3191 a 2096 líneas
- [x] **Refactorización Frontend - Fase 4 (FINAL)** (Completado 14 Feb 2026) ✅
  - Extraído `PurchasesTab.jsx` (~364 líneas) - Órdenes de compra
  - Extraído `ValuationTab.jsx` (~268 líneas) - Valorización de inventario
  - Extraído `AuditTab.jsx` (~233 líneas) - Historial de auditoría
  - `InventoryManager.js` reducido de 2096 a **1040 líneas** (-50%)
  - **TOTAL REDUCCIÓN**: de 4503 a 1040 líneas (**-77%**)
  - **10 componentes extraídos** en `/frontend/src/pages/inventory/components/`
- [x] **Bug Crítico: Generación de OC Multi-Proveedor** (Corregido 14 Feb 2026) ✅
  - **Problema**: El botón "Generar OC" en Asistente de Compras fallaba al seleccionar items de diferentes proveedores
  - **Causa raíz**: La función `get_purchase_suggestions` usaba parámetros `Query()` de FastAPI que no funcionaban cuando se llamaba internamente
  - **Solución**: 
    1. Creada función interna `_get_purchase_suggestions_internal()` sin decoradores Query
    2. El endpoint REST ahora llama a la función interna
    3. La función `generate_po_from_suggestions` también usa la función interna
  - **Nuevo comportamiento**: Al seleccionar items de múltiples proveedores, el sistema automáticamente:
    - Agrupa los items por proveedor
    - Genera una Orden de Compra separada para cada proveedor
    - Muestra toast de éxito con resumen de OCs creadas
    - Redirige al tab "Compras" para ver las nuevas órdenes

### P1 - Alta Prioridad
- [x] **Sistema de Control de Costos y Asistente de Compras** (Febrero 2026) ✅
- [ ] **Completar Refactorización Backend**: Migrar módulos restantes (Reports, Customers, Config) de `server.py` a routers dedicados
- [ ] **Crear paquete ZIP descargable** del servidor local
- [ ] **Integración de impresora ESC/POS** física
- [ ] **Verificar bug "Auto-envío a cocina"** (no funciona al primer intento)

### P2 - Media Prioridad
- [ ] **Reloj de empleados**: Check-in/out con reportes
- [ ] **Reportes DGII**: Generación de formatos 607, 608
- [ ] **Imágenes de productos**: Soporte para fotos/iconos en botones
- [ ] **Cache de imágenes offline**: Para menú sin conexión
- [ ] **Verificar scroll en pantalla de pago móvil**

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
- **Arquitectura Modular (NUEVO - Febrero 2026)**:
  - `/routers/auth.py`: Autenticación, usuarios, roles
  - `/routers/inventory.py`: Ingredientes, stock, almacenes, unidades
  - `/routers/recipes.py`: Recetas por producto
  - `/routers/purchasing.py`: Proveedores, OCs, asistente de compras
  - `/models/schemas.py`: Modelos Pydantic centralizados
  - `/models/database.py`: Conexión MongoDB centralizada

### Frontend
- **React**: Framework JavaScript
- **Shadcn/UI**: Componentes base
- **TailwindCSS**: Estilos
- **Recharts**: Gráficos

### Archivos Clave
```
/app
├── backend/
│   ├── server.py              # API principal (~4200 líneas)
│   ├── routers/
│   │   ├── auth.py            # Autenticación y usuarios
│   │   ├── inventory.py       # Inventario completo (~1400 líneas)
│   │   ├── recipes.py         # Recetas (~70 líneas)
│   │   ├── purchasing.py      # Compras (~600 líneas)
│   │   └── reports.py         # Reportes (pendiente)
│   ├── models/
│   │   ├── database.py        # Conexión MongoDB
│   │   └── schemas.py         # Modelos Pydantic
│   └── utils/
│       └── helpers.py         # Funciones utilitarias
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
│   │   │   ├── InventoryManager.js  # Módulo de inventario maestro (~2823 líneas)
│   │   │   ├── inventory/
│   │   │   │   ├── constants.js     # Constantes compartidas
│   │   │   │   └── components/
│   │   │   │       ├── AssistantTab.jsx    # Tab Asistente (~614 líneas)
│   │   │   │       ├── IngredientsTab.jsx  # Tab Insumos (~737 líneas)
│   │   │   │       └── ProductionTab.jsx   # Tab Producción (~401 líneas)
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
- ✅ **Sistema de Control de Costos y Asistente de Compras Inteligente**
- ✅ **Verificación de Lógica de Insumo Universal** con caso de prueba completo
- ✅ **REFACTORIZACIÓN DEL BACKEND - Fase 2** (14 Feb 2026):
  - **Estructura modular**: `server.py` reducido de ~6200 a ~4200 líneas (-32%)
  - **Router de Inventario** (`/routers/inventory.py` - ~1400 líneas):
    - Ingredientes CRUD con auditoría de cambios
    - Definiciones de unidades con propagación
    - Stock multinivel con desglose visual
    - Movimientos de stock y transferencias
    - Diferencias de inventario con conversión automática
    - Sistema de explosión de recetas
    - Producción de sub-recetas (batch)
    - Almacenes CRUD
  - **Router de Recetas** (`/routers/recipes.py` - ~70 líneas):
    - CRUD de recetas por producto
    - Vinculación con ingredientes
  - **Router de Purchasing** (`/routers/purchasing.py` - ~600 líneas):
    - Proveedores CRUD
    - Órdenes de compra con ciclo completo
    - Asistente de compras inteligente
    - Historial de precios y alertas
    - Análisis de márgenes
  - **Centralización de modelos** en `/models/schemas.py`
  - **Conexión de DB** en `/models/database.py`
  - **24/24 tests pasados** en la verificación
- ✅ **REFACTORIZACIÓN DEL FRONTEND - Fase 1** (14 Feb 2026):
  - Extraído `AssistantTab.jsx` (~613 líneas) como componente independiente
  - `InventoryManager.js` reducido de 4503 a 3873 líneas (-14%)
  - Nueva estructura `/pages/inventory/` para componentes modulares
  - Archivo de constantes compartidas `constants.js`
- ✅ **REFACTORIZACIÓN DEL FRONTEND - Fase 2** (14 Feb 2026):
  - Extraído `IngredientsTab.jsx` (~736 líneas) como componente independiente
  - `InventoryManager.js` reducido de ~3873 a ~3191 líneas (-18% adicional)
  - El tab "Insumos" ahora es un componente modular con:
    - CRUD de ingredientes
    - Gestión de unidades personalizadas
    - Búsqueda y filtros por categoría
    - Diálogos de creación/edición
    - Panel de gestión de unidades
  - Props limpios pasados desde el padre: ingredients, suppliers, customUnits, getTotalStock, onRefreshAll, onOpenProduction, onLoadConversionAnalysis
  - **16/16 tests pasados** en la verificación frontend
- ✅ **REFACTORIZACIÓN DEL FRONTEND - Fase 3** (14 Feb 2026):
  - Extraído `ProductionTab.jsx` (~401 líneas) como componente independiente
  - `InventoryManager.js` reducido de ~3191 a ~2823 líneas (-12% adicional)
  - El tab "Producción" ahora es un componente modular con:
    - Dashboard de producción con secciones urgente/OK
    - Diálogo de producción de sub-recetas
    - Verificación de disponibilidad de ingredientes
    - Historial de producción
  - Modificado `IngredientsTab` para usar `onNavigateToProduction` en lugar de abrir el diálogo
  - Props limpios: ingredients, warehouses, getTotalStock, onRefreshAll
  - **16/16 tests pasados** en la verificación frontend
  - **Reducción total acumulada**: de 4503 a 2823 líneas (-37%)

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
