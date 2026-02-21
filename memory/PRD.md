# PRD - POS Dominicana (TPV Dominicano)

## Original Problem Statement
Sistema POS de propósito general para República Dominicana con soporte completo para:
- Facturación fiscal (NCF, DGII)
- Sistema de impuestos dinámicos por producto
- Gestión de inventario con trazabilidad
- Clientes/Proveedores unificados
- Control de caja y turnos con arqueo
- Reportes fiscales dominicanos (Reporte Z)
- Ticket térmico 80mm compatible DGII

## Tech Stack
- **Frontend:** React 18 + TailwindCSS + Shadcn/UI
- **Backend:** FastAPI (Python)
- **Databases:** 
  - MongoDB (datos legacy, productos, usuarios)
  - Supabase/PostgreSQL (datos fiscales, POS sessions, impuestos, NCF)
- **Preview URL:** https://pos-fiscal-dr-1.preview.emergentagent.com

## Test Credentials
| Usuario | PIN | Rol |
|---------|-----|-----|
| Admin | 10000 | admin |
| Carlos | 1234 | waiter |
| María | 5678 | waiter |
| Luis | 4321 | cashier |
| Chef Pedro | 9999 | kitchen |

---

## ✅ COMPLETED FEATURES

### 2025-02-18: Análisis Dolibarr ERP
- ✅ Análisis completo de 4 módulos Dolibarr
- ✅ Generación de 4 reportes markdown
- ✅ Generación de 4 esquemas JSON propuestos
- ✅ Script SQL consolidado `01_migracion_logica_erp.sql`

### 2025-02-20: Integración Supabase - Control de Caja
- ✅ **Backend**: Router `/api/pos-sessions` conectado a Supabase
- ✅ **Apertura de Caja**: Crear sesión con monto inicial
- ✅ **Integración de Ventas**: Al pagar factura, actualiza sesión en Supabase
- ✅ **Arqueo de Caja**: Modal con desglose de denominaciones RD
- ✅ **cash_breakdown JSONB**: Guarda desglose completo al cerrar

### 2025-02-20: Sistema de Impuestos Dinámicos
- ✅ **tax_config**: Configuración de impuestos (ITBIS, Propina, ISC, Exento)
- ✅ **product_taxes**: Asignación de impuestos por producto
- ✅ **Motor de Cálculo**: `/api/taxes/calculate` con cascada de impuestos
- ✅ **is_dine_in_only**: Propina solo para consumo en local
- ✅ **is_delivery**: Omite propina automáticamente para Para Llevar
- ✅ **Reporte Z Universal**: Desglose de impuestos recaudados

### 2025-02-20: Ticket Térmico 80mm DGII
- ✅ **ThermalTicket.js**: Componente React para ticket de impresora térmica
- ✅ **Encabezado Fiscal**: Nombre negocio, RNC, dirección, teléfono
- ✅ **Sección NCF**: Comprobante fiscal con tipo (B01, B02, B14, B15)
- ✅ **Desglose de Impuestos DGII**: ITBIS 18%, Propina Legal 10%
- ✅ **Lógica Para Llevar**: Propina se omite automáticamente
- ✅ **Fuente Monoespaciada**: Alineación de columnas para 80mm
- ✅ **Estados Especiales**: Marcadores COPIA y ANULADO
- ✅ **Página Demo**: /ticket-demo para configurar y probar tickets
- ✅ **Integración PaymentScreen**: Diálogo de impresión post-pago

### 2025-02-20: Configuración de Datos del Negocio para Ticket
- ✅ **Settings > Sistema**: Nueva sección "Datos del Negocio para Ticket"
- ✅ **Campos configurables**: Nombre comercial, razón social, RNC, dirección, teléfono, email
- ✅ **Campos fiscales**: Fecha vencimiento NCF, mensaje de agradecimiento, mensaje DGII
- ✅ **useBusinessConfig Hook**: Carga configuración del servidor en ThermalTicket.js
- ✅ **Persistencia MongoDB**: Datos guardados en /api/system/config
- ✅ **TicketDemo**: Indicador "Servidor" cuando usa config del backend
- ✅ **Vista Previa en Vivo**: Preview del ticket actualizado en tiempo real al editar datos

### 2025-02-20: UI Gestión de Impuestos y Módulo NCF
- ✅ **Settings > Impuestos**: CRUD completo para configuración de impuestos DGII
- ✅ **Settings > NCF**: Gestión de secuencias fiscales Serie B (B01-B17)
- ✅ **Backend NCF Router**: `/app/backend/routers/ncf.py` conectado a Supabase
- ✅ **Alertas NCF**: Barra de progreso visual (verde/amarillo/rojo por disponibilidad)
- ✅ **Dashboard Alertas**: Banner de alertas NCF en pantalla principal (Mapa de Mesas)
- ✅ **Validaciones**: < 50 = advertencia, < 10 = crítico, vencido = crítico

### 2025-02-21: Motor de Cálculo Fiscal Inteligente
- ✅ **Vínculo Venta-NCF**: Campo `default_ncf_type_id` en Tipos de Venta
- ✅ **Selector NCF en Settings**: Dropdown para asignar NCF por defecto (B01-B17) a cada Tipo de Venta
- ✅ **Badge NCF**: Etiqueta visual (B02 Factura de Consumo) en lista de Tipos de Venta
- ✅ **Motor de Cálculo Inteligente**: Cruza impuestos del Tipo de Venta ∩ impuestos del Producto
- ✅ **Propina Condicional**: Solo aplica si is_dine_in_only=false Y producto no tiene exención

### 2025-02-21: Sistema 100% Dinámico - Tipos de Venta Configurables
- ✅ **Perfiles de Venta**: 8+ tipos configurados (Consumo Local, Para Llevar, Delivery, Crédito Fiscal, Gubernamental, Régimen Especial, etc.)
- ✅ **CRUD Completo**: Crear, editar, eliminar tipos de venta desde Settings > Ventas > Tipos de Venta
- ✅ **Tax Exemptions por Tipo**: Cada tipo tiene lista de impuestos "no aplica" configurable
- ✅ **Sin Hardcoding**: Todo se lee de tax_config y sale_types desde la DB
- ✅ **NCF Dinámico por Tipo**: B02 para consumidor, B01 para crédito fiscal, B14/B15 para gubernamental/especial, B16 para exportación
- ✅ **Filtrado en PaymentScreen**: Solo muestra Tipos de Venta relevantes al NCF seleccionado
- ✅ **UI Consistente**: Terminología "No Aplica" en lugar de "Exento" para evitar confusión fiscal
- ✅ **Badge en lista**: Muestra "X no aplica(n)" para cada tipo de venta

### 2025-02-21: Sistema de Alertas NCF Dinámico
- ✅ **Campos configurables**: `alert_threshold` y `alert_interval` en secuencias NCF
- ✅ **Backend actualizado**: `/api/ncf/sequences` y `/api/ncf/generate-for-sale` devuelven info de alertas
- ✅ **UI de configuración**: Sección "Configuración de Alertas" en modal de edición NCF
- ✅ **Modal de alerta**: En PaymentScreen, muestra modal dinámico al cumplir condiciones de alerta
- ✅ **Visualización**: Badge de configuración de alerta visible en tarjeta de secuencia NCF
- ✅ **Almacenamiento híbrido**: Configuración en MongoDB (`ncf_sequence_config`)

---

## 🔧 Key Features Documentation

### Ticket Térmico 80mm
Componente `ThermalTicket.js` con:
- Encabezado fiscal DGII compliant
- NCF con tipos (Crédito Fiscal, Consumidor Final, Gubernamental, Régimen Especial)
- Detalle de productos con modificadores
- Desglose de impuestos (ITBIS, Propina)
- TOTAL destacado en negro invertido
- Información de pago y cambio
- Código de barras NCF opcional
- Estilos CSS para impresión real a 80mm

### Arqueo de Caja (cash_breakdown)
```json
{
  "denominaciones": {
    "2000": {"label": "RD$ 2,000", "tipo": "billete", "cantidad": 1, "subtotal": 2000},
    "1000": {"label": "RD$ 1,000", "tipo": "billete", "cantidad": 1, "subtotal": 1000}
  },
  "total_declarado": 3000,
  "total_esperado": 3000,
  "diferencia": 0,
  "fecha_arqueo": "2025-02-20T21:15:00Z"
}
```

### Motor de Inteligencia Fiscal (Implementado 2025-02-21)
Sistema avanzado de cálculo de impuestos con jerarquía:
- **Fórmula**: `Impuesto Aplicado = (Impuesto en Tipo de Venta) AND (Impuesto en Producto o Categoría)`
- **Herencia de Categoría**: Productos sin configuración heredan impuestos de su categoría
- **Exención Gubernamental**: Tipos "Gubernamental" o "Régimen Especial" anulan ITBIS automáticamente
- **Propina Selectiva**: Propina Legal se aplica solo a productos que lo permiten
- **Actualización en Tiempo Real**: PaymentScreen recalcula al cambiar Tipo de Venta

Endpoint: `POST /api/taxes/calculate-cart`
```json
{
  "items": [{"product_id": "...", "product_name": "...", "quantity": 1, "unit_price": 100}],
  "sale_type_id": "uuid-del-tipo-de-venta"
}
```

### Secuencias NCF Vinculadas a Tipos de Venta (Implementado 2025-02-21)
- Campo `authorized_sale_types` en `ncf_sequences` (array de IDs de tipos de venta)
- Descuento automático al confirmar pago vía `POST /api/ncf/generate-for-sale`
- Validación de disponibilidad y bloqueo si secuencia agotada
- Selector múltiple en UI de Settings → NCF

### Sistema de Impuestos Dinámicos
| Código | Nombre | Tasa | Solo Local |
|--------|--------|------|------------|
| ITBIS | ITBIS 18% | 18% | No |
| ITBIS_REDUCIDO | ITBIS 16% | 16% | No |
| PROPINA | Propina Legal 10% | 10% | ✅ Sí |
| ISC | Impuesto Selectivo | Variable | No |
| EXENTO | Exento de ITBIS | 0% | No |

### Motor de Cálculo Inteligente
El sistema aplica impuestos basándose en la intersección:
- **Impuestos del Tipo de Venta**: Definidos en `sale_types.tax_exemptions`
- **Impuestos del Producto**: Definidos en `products.tax_exemptions`
- Un impuesto solo aplica si NO está en ninguna de las dos listas de exenciones

### Módulo NCF - Comprobantes Fiscales DGII
**Tipos de comprobantes (Serie B):**
| Código | Descripción |
|--------|-------------|
| B01 | Factura de Crédito Fiscal |
| B02 | Factura de Consumo (default) |
| B03 | Nota de Débito |
| B04 | Nota de Crédito |
| B11 | Comprobante de Compras |
| B12 | Registro Único de Ingresos |
| B13 | Gastos Menores |
| B14 | Regímenes Especiales |
| B15 | Comprobante Gubernamental |
| B16 | Exportaciones |
| B17 | Pagos al Exterior |

**Alertas de secuencias:**
- 🟢 OK: > 50 comprobantes restantes
- 🟡 Advertencia: < 50 restantes
- 🔴 Crítico: < 10 restantes o secuencia vencida

**Sistema de Alertas Dinámico (Implementado 2025-02-21):**
- `alert_threshold`: Número de NCF restantes para iniciar alertas
- `alert_interval`: Frecuencia de alertas (cada N ventas)
- Modal de alerta en checkout cuando se cumplan las condiciones
- Configuración guardada en MongoDB (`ncf_sequence_config`)
- Campos visibles en UI de Settings → NCF al editar secuencia

---

## 📁 Key Files

### Backend
| Archivo | Descripción |
|---------|-------------|
| `/app/backend/server.py` | Servidor FastAPI principal |
| `/app/backend/routers/pos.py` | CRUD de sale_types, NCF |
| `/app/backend/routers/pos_sessions.py` | Sesiones de caja (Supabase) |
| `/app/backend/routers/taxes.py` | Sistema de impuestos dinámicos |
| `/app/backend/routers/billing.py` | Facturación |
| `/app/backend/routers/ncf.py` | Gestión NCF |

### Frontend
| Archivo | Descripción |
|---------|-------------|
| `/app/frontend/src/pages/Settings.js` | Configuración (MONOLITO ~2000+ líneas) |
| `/app/frontend/src/pages/OrderScreen.js` | Pantalla de pedidos con cálculo de impuestos |
| `/app/frontend/src/pages/PaymentScreen.js` | Pantalla de pago con selección de NCF y Tipo de Venta |
| `/app/frontend/src/components/ThermalTicket.js` | Ticket térmico 80mm |
| `/app/frontend/src/pages/TicketDemo.js` | Demo de ticket |
| `/app/frontend/src/lib/api.js` | APIs (taxesAPI, posSessionsAPI, etc.) |

---

## 🔌 Key API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pos-sessions/open` | POST | Abrir turno |
| `/api/pos-sessions/{id}/close` | PUT | Cerrar turno con cash_breakdown |
| `/api/pos/sale-types` | GET | Listar tipos de venta |
| `/api/pos/sale-types` | POST | Crear tipo de venta |
| `/api/pos/sale-types/{id}` | PUT | Actualizar tipo de venta |
| `/api/taxes/config` | GET | Listar configuraciones de impuestos |
| `/api/taxes/products/assign` | POST | Asignar impuesto a producto |
| `/api/taxes/calculate` | POST | Calcular impuestos |
| `/api/taxes/report/summary` | GET | Reporte Z de impuestos |
| `/api/ncf/sequences` | GET | Listar secuencias NCF |
| `/api/ncf/sequences/{id}` | PUT | Actualizar secuencia NCF |
| `/api/credit-notes` | GET | Listar notas de crédito |
| `/api/credit-notes` | POST | Crear nota de crédito B04 |
| `/api/credit-notes/return-reasons` | GET | Motivos de devolución |
| `/api/credit-notes/reports/summary` | GET | Resumen de reversiones |

---

## 📋 PRIORITIZED BACKLOG

### P0 - Pendiente (Alta Prioridad)
- [x] ~~**Seguridad Fiscal**: Bloquear NCF en facturas $0.00~~ ✅ COMPLETADO 2025-02-21
- [x] ~~**Flujo de Nota de Crédito B04**: Reversión de factura con nota de crédito~~ ✅ COMPLETADO 2025-02-21
- [x] ~~**Sistema de Alertas NCF Dinámico**: Modal de alerta configurable por secuencia NCF~~ ✅ COMPLETADO 2025-02-21
- [ ] **UI Asignación de Impuestos a Productos**: Checkboxes en ProductConfig

### P1 - Alta Prioridad
- [ ] Audit Trail Security (solo Admin ve PINs)
- [ ] Employee Time Clock (entrada/salida de empleados)
- [ ] Generación reportes DGII (607, 608)

### P2 - Media Prioridad
- [x] ~~**REFACTORIZAR Settings.js**~~ ✅ COMPLETADO 2025-02-21
- [ ] Reportes de caja por período
- [ ] Imágenes/iconos para botones de productos
- [ ] Print Agent como ejecutable .exe (cross-compilation)
- [ ] Cache de imágenes offline

### P3 - Baja Prioridad
- [ ] Exportar Audit Trail a Excel/CSV
- [ ] Duplicar producto feature
- [ ] Drag-and-drop reordenar métodos de pago

---

## 🗄️ Database Schema (Key Tables)

### Supabase/PostgreSQL
```sql
-- sale_types
CREATE TABLE sale_types (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  code VARCHAR,
  tax_exemptions TEXT[], -- Array de IDs de impuestos que NO aplican
  default_ncf_type_id VARCHAR -- FK a ncf_types (B01, B02, etc.)
);

-- tax_config
CREATE TABLE tax_config (
  id UUID PRIMARY KEY,
  code VARCHAR UNIQUE,
  name VARCHAR NOT NULL,
  rate DECIMAL,
  is_dine_in_only BOOLEAN DEFAULT FALSE
);

-- ncf_sequences
CREATE TABLE ncf_sequences (
  id UUID PRIMARY KEY,
  type_code VARCHAR, -- B01, B02, etc.
  description VARCHAR,
  current_number INTEGER,
  start_number INTEGER,
  end_number INTEGER,
  expiration_date DATE,
  is_active BOOLEAN
);
```

### MongoDB
```javascript
// products collection
{
  _id: ObjectId,
  name: String,
  price: Number,
  category_id: ObjectId,
  tax_exemptions: [String], // Array de IDs de impuestos exentos
  // ...
}
```

---

## 🚨 Technical Debt

1. **Settings.js Monolith**: Este archivo tiene ~2000+ líneas y maneja todas las pestañas de configuración. Debe dividirse en componentes separados:
   - `SystemSettings.js`
   - `TaxSettings.js`
   - `NcfSettings.js`
   - `SalesSettings.js`
   - `UserSettings.js`

2. **Print Agent**: Actualmente es un script Python, debería ser un ejecutable .exe para Windows.

---

### 2025-02-21: Botón "Impuesto" - Ajuste Fiscal con RBAC y Auditoría
- ✅ **Botón Discreto**: "Impuesto" en área de totales del checkout (sin términos como "Exención")
- ✅ **Control de Acceso RBAC**: Permiso `can_manage_tax_override` en Admin (cajero/mesero no)
- ✅ **Autorización PIN**: Si el usuario no tiene permiso, requiere PIN de Admin
- ✅ **Control Granular**: Checkboxes individuales para cada impuesto (ITBIS 18%, Propina 10%, etc.)
- ✅ **Recálculo Dinámico**: Total se actualiza instantáneamente al desmarcar impuestos
- ✅ **Referencia Obligatoria**: Campo "Referencia/Documento" aparece al quitar cualquier impuesto
- ✅ **Auditoría Silenciosa**: Log en `tax_override_audit` con quién autorizó, qué impuestos se quitaron, y documento de respaldo
- ✅ **Endpoint Backend**: `POST /api/tax-override/authorize` y `GET /api/tax-override/check-permission`

### 2025-02-21: Motor de Inteligencia Fiscal y NCF Automático
- ✅ **Motor de Inteligencia Fiscal**: Endpoint `/api/taxes/calculate-cart` con jerarquía Producto/Categoría
- ✅ **Herencia de Impuestos**: Productos heredan de Categoría si no tienen config propia
- ✅ **Exención Gubernamental**: Tipos "Gubernamental"/"Régimen Especial" anulan ITBIS automáticamente
- ✅ **Propina Selectiva**: Propina Legal solo sobre productos que lo permiten
- ✅ **Actualización en Tiempo Real**: PaymentScreen recalcula al cambiar Tipo de Venta
- ✅ **Switches en Categorías**: Settings > Inventario > Categorías muestra impuestos aplicables
- ✅ **NCF Vinculado a Tipos de Venta**: Campo `authorized_sale_types` en secuencias NCF
- ✅ **Generación NCF Automática**: `POST /api/ncf/generate-for-sale` busca secuencia por tipo de venta
- ✅ **Descuento Automático**: Contador de secuencia incrementa al confirmar pago
- ✅ **Validación de Agotamiento**: Bloquea ventas si secuencia NCF está agotada
- ✅ **Selector Múltiple NCF**: Settings > NCF muestra tipos de venta autorizados

### 2025-02-21: P0 Seguridad Fiscal y Flujo de Reversión B04
- ✅ **Validación $0.00**: Backend bloquea pagos con valor cero en `/api/bills/{id}/pay`
- ✅ **Mensaje DGII**: "No se puede procesar pago con valor $0.00. La DGII no permite asignar NCF"
- ✅ **Router Notas de Crédito**: `/app/backend/routers/credit_notes.py` nuevo módulo completo
- ✅ **Motivos de Devolución**: 6 razones configurables (Error de Facturación, Devolución, Anulación, etc.)
- ✅ **Generación NCF B04**: Secuencia automática con fallback MongoDB/Supabase
- ✅ **Reversión Total/Parcial**: Soporte para ambos tipos de reversión
- ✅ **Actualización de Inventario**: Reversión del stock cuando `affects_inventory=true`
- ✅ **Audit Trail**: Log completo de cada nota de crédito generada
- ✅ **Frontend**: Nueva página `/reports/facturas` con historial de facturas
- ✅ **UI Reversar**: Diálogo completo con advertencia DGII, tipos de reversión, motivos
- ✅ **Badges**: Facturas reversadas muestran "Reversada" y NCF de nota de crédito
- ✅ **Integración Reportes**: Link a historial desde Reportes > Fiscal

### 2025-02-21: Corrección Etiquetas Propina en PaymentScreen
- ✅ **Bug Fix**: Corregida lógica de visualización de propina en el diálogo de Tipo de Venta
- ✅ **Antes**: Todas las opciones mostraban "Sin propina de ley" incorrectamente
- ✅ **Después**: Ahora muestra correctamente:
  - "Con propina de ley" (verde) para tipos que SÍ tienen propina (Consumo Local, Delivery, etc.)
  - "Sin propina de ley" (ámbar) para tipos que NO tienen propina (Consumo Llevar, Régimen Especial)
- ✅ **Root cause**: El filtro `t.active` no encontraba los impuestos porque el campo era `is_active`

### 2025-02-21: Refactorización de Settings.js
- ✅ **P2 Completado**: Archivo monolito de 4115 líneas dividido en 12 componentes modulares
- ✅ **Arquitectura**:
  ```
  /frontend/src/pages/settings/
  ├── index.js              (Componente principal)
  ├── SettingsContext.js    (Estado compartido)
  ├── UsersTab.js           (Gestión de usuarios)
  ├── MesasTab.js           (Áreas y mesas)
  ├── VentasTab.js          (Pagos, anulaciones, tipos de venta)
  ├── InventarioTab.js      (Categorías, productos, stock)
  ├── ChannelsTab.js        (Canales de impresión)
  ├── StationTab.js         (Config de estación)
  ├── ReportsTab.js         (Link a reportes)
  ├── CustomersTab.js       (Link a clientes)
  ├── TaxesTab.js           (Impuestos DGII)
  ├── NcfTab.js             (Secuencias NCF)
  ├── SystemTab.js          (Sistema y datos del ticket)
  └── ThemeTab.js           (Personalización visual)
  ```
- ✅ **Beneficios**: Mejor mantenibilidad, carga más rápida, menos conflictos

## 📅 Last Updated
2025-02-21 - Botón "Impuesto" con ajuste fiscal granular y auditoría
