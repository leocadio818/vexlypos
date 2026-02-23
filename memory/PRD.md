# MESA POS RD - Sistema de Punto de Venta

## Descripción General
Sistema POS completo para restaurantes/bares con soporte para impresión térmica automática, KDS (Kitchen Display System), gestión de órdenes, y cumplimiento fiscal DGII (República Dominicana).

## URLs del Sistema
- **App:** https://drawer-continue-bug.preview.emergentagent.com
- **API:** https://drawer-continue-bug.preview.emergentagent.com/api
- **Agente Python:** https://drawer-continue-bug.preview.emergentagent.com/api/download/print-agent?printer_name=RECIBO
- **Instalador Servicio:** https://drawer-continue-bug.preview.emergentagent.com/api/download/print-agent-installer?printer_name=RECIBO

## Arquitectura de Impresión (v2.1)

### Flujo de Impresión
```
[Acción en App] → [Backend crea job en print_queue] → [Agente Local procesa] → [Impresora]
```

### Características del Agente v2.1
- **Auto-Reintento:** Si pierde conexión, espera 10s y reintenta automáticamente
- **Logging:** Escribe logs a `MesaPOS_PrintAgent.log`
- **Config Editable:** Archivo `config.txt` para cambiar URL sin reinstalar
- **Inicio Automático:** Tarea programada con Windows
- **Sin Ventana:** Corre silenciosamente en segundo plano

### Formato de Cantidades
- Cantidades SIN decimales innecesarios: `1 X` en lugar de `1.0 X`
- Cantidades CON decimales cuando aplica: `1.5 X PESCADO FRITO`

### Cuentas Divididas en Tickets
- Pre-cuenta y Factura muestran: `Mesa: X - Cuenta #Y`
- Si tiene etiqueta: `Mesa: X - Cta #Y` + `Cliente: Nombre`

### Número de Transacción Interno
- Cada documento impreso tiene un número secuencial interno
- **Comandas:** "ORDEN #XXXX" (grande, bold, arriba del ticket)
- **Facturas:** "Transacción: #XXXX" (debajo del nombre del cajero)
- Generado atómicamente con MongoDB (`counters` collection)
- Independiente del NCF fiscal - solo para control interno
- Útil para tracking de cocina y auditoría interna

## Mapa de Mesas

### Sillas Visuales
- Cada mesa muestra **sillas/asientos** como semicírculos pegados al borde
- Las sillas representan la **capacidad** de la mesa
- **Se escalan** automáticamente con el tamaño de la mesa
- **Se mueven** junto con la mesa al arrastrar
- Mesas redondas: sillas distribuidas en círculo
- Mesas cuadradas/rectangulares: sillas arriba y abajo

### Indicadores de Mesa
- **Azul:** Mesa libre
- **Rojo:** Mis mesas (ocupadas por mí)
- **Amarillo:** Mesas de otros usuarios
- **Verde:** Por facturar
- **Naranja:** Mesa dividida (múltiples cuentas)
- **Morado:** Reservada

## División de Cuentas

### Funcionalidad
- Botón **"+Nueva"** crea nueva cuenta con modal para etiqueta opcional
- **"Editar Cuenta"** permite seleccionar items y moverlos a nueva cuenta
- Modal responsive para poner **etiqueta/nombre** a cada cuenta (ej: "Juan", "María")
- Etiqueta aparece en pre-cuenta y factura final

### Endpoints
- `POST /api/tables/{table_id}/new-account` - Crear cuenta vacía con label
- `POST /api/orders/{order_id}/split` - Dividir items a nueva cuenta con label

## Navegación y Permisos

### Logo RD (Logout)
- Al hacer clic en el logo "RD", envía comandas pendientes automáticamente y cierra sesión
- Botón de logout antiguo eliminado para ahorrar espacio

### Control de Acceso por Roles
- **PaymentScreen:** Solo accesible para `admin`, `cashier`, `manager`
- **Caja:** Solo visible para Cajeros y Administradores (no meseros)
- **Config:** Solo visible para Administradores
- **B04 (Notas de Crédito):** Solo Admin puede generar
- Meseros que intenten acceder a /payment/* son redirigidos a /tables

## Notas de Crédito B04 (NUEVO - 2026-02-23)

### Descripción
Sistema completo para anulación de facturas cerradas (Post-Venta) cumpliendo regulaciones DGII.

### Flujo de Trabajo
1. Admin navega a **Caja → Botón "B04"**
2. Ingresa número de transacción interno de la factura a anular
3. Verifica PIN de administrador (autenticación adicional)
4. Sistema busca y muestra la factura original
5. Admin selecciona **razón de anulación** (Error facturación, devolución, etc.)
6. Sistema genera **NCF B04** vinculado al NCF original
7. Factura original cambia de `paid` a `reversed`
8. Se imprime recibo de Nota de Crédito

### Características Técnicas
- **NCF B04:** Prefijo "B04" para notas de crédito fiscales
- **`ncf_afectado`:** Referencia al NCF de factura original
- **Estado `reversed`:** Facturas anuladas quedan marcadas
- **Auditoría:** Log completo de cada anulación
- **Razones DGII:** 6 razones pre-configuradas según normativa

### Endpoints Clave
- `POST /api/credit-notes/search-by-transaction` - Buscar factura por #Trans
- `POST /api/credit-notes` - Crear nota de crédito B04
- `GET /api/credit-notes/report-607-data` - Datos formato DGII 607
- `GET /api/credit-notes/reports/summary` - Resumen por período

### Integración Reporte 607
Las notas de crédito aparecen en el 607 con:
- `tipo_ingreso: "04"` (Nota de Crédito)
- `ncf_modificado:` NCF de factura afectada
- Montos negativos (crédito)

## Completado (2026-02-23)
- [x] Sistema de impresión con cola asíncrona
- [x] Agente local v2.1 con auto-reintento y config.txt
- [x] Instalador automático con Tarea Programada
- [x] Comandas automáticas al "Enviar a Cocina"
- [x] Formato cantidad sin decimales innecesarios
- [x] División de cuentas con etiquetas/nombres
- [x] Pre-cuenta y factura con "Mesa X - Cuenta #Y"
- [x] Logo RD como botón de logout con envío de comandas
- [x] Botón Caja oculto para meseros
- [x] **Sillas visuales en mapa de mesas** (escalables, móviles)
- [x] Eliminado ícono de "otros usuarios" (solo color amarillo)
- [x] **Restricción PaymentScreen** - Solo admin/cashier/manager
- [x] **Número de Transacción Interno** - ORDEN #XXXX en comandas, Transacción: #XXXX en facturas
- [x] **UI/UX Overhaul** - Toasts eliminados, modal glassmorphism para funciones de mesa
- [x] **Notas de Crédito B04** - Flujo completo de post-venta con cumplimiento DGII
- [x] **Reporte 607 para B04** - Datos formateados para declaración fiscal
- [x] **Motor de Pagos Múltiples** - Soporte para múltiples formas de pago en una transacción
- [x] **Multimoneda en Pre-cuenta** - Equivalentes USD/EUR con tasas configuradas
- [x] **Lógica de Cambio Multimoneda** - Recibido en moneda original, cambio siempre en RD$
- [x] **Menú Funciones Glassmorphism** - Modal con fondo desenfocado y botones píldora
- [x] **Lógica Dual de Anulación** - Cuenta abierta (cancela sin fiscal) vs cerrada (B04 redirect)
- [x] **Búsqueda Inteligente en Caja** - Filtrar movimientos por NCF, # orden, monto, descripción
- [x] **Re-impresión desde Movimientos** - Botón flotante para reimprimir factura seleccionada
- [x] **Copias Configurables por Impresora** - Campo "Copias" (1-5) en configuración de cada canal
- [x] **Búsqueda por # Orden Global** - Historial de Facturas y Caja permiten buscar por número de transacción
- [x] **Datos Reales Valuation-Trends** - Endpoint usa movimientos de stock y órdenes para calcular valores históricos
- [x] **Imágenes/Iconos en Productos** - Nueva sección en configuración de productos con URL de imagen y 12 iconos predefinidos
- [x] **Captura de Datos Fiscales (B01/B14/B15)** - Drawer para capturar RNC/Cédula con validación flexible y búsqueda de clientes
- [x] **Sistema de Jornada de Trabajo** - Fecha contable independiente del calendario civil (Business Day)
- [x] **Reportes X y Z** - Cierre de turno y día con desglose completo
- [x] **Sincronización Reportes por Jornada** - Filtro de jornada en página de Reports
- [x] **Auditoría - Solo Admin ve PINs** - Restricción de visibilidad de PINs por rol

## Auditoría - Restricción de PINs (NUEVO - 2026-02-23)

### Descripción
Solo los administradores pueden ver y editar los PINs de otros usuarios. Medida de seguridad para proteger credenciales.

### Reglas de Acceso
| Usuario | Su propio PIN | PINs de otros |
|---------|---------------|---------------|
| **Admin** | ✅ Ver/Editar | ✅ Ver/Editar |
| **Manager** | ✅ Ver/Editar | ❌ Solo asteriscos |
| **Cajero** | ✅ Ver/Editar | ❌ Solo asteriscos |
| **Mesero** | ✅ Ver/Editar | ❌ Solo asteriscos |

### Características UI
1. **Campo PIN restringido**: Muestra `••••••••` y mensaje "(Contacte al administrador)"
2. **Badge "Solo Admin"**: Con ícono de candado junto al label
3. **Botón ojo**: Solo visible para Admin, permite mostrar/ocultar PIN
4. **Validación backend**: No permite guardar PIN si no tiene permiso

## Sincronización de Reportes por Jornada (NUEVO - 2026-02-23)

### Descripción
La página de Reportes ahora incluye un filtro por Jornada de Trabajo que permite filtrar todos los datos por fecha contable.

### Características
1. **Dropdown de Jornada**: Selector con las últimas 30 jornadas
   - Opción "Por Fecha Civil" para usar fechas normales
   - Lista de jornadas con referencia y estado (abierta/cerrada)
   
2. **Auto-actualización de Fechas**: Al seleccionar una jornada, los filtros de fecha se actualizan automáticamente a la `business_date` de esa jornada

3. **Indicadores Visuales**:
   - Ícono de sol amarillo junto al dropdown
   - Badge amber mostrando "Jornada: YYYY-MM-DD"
   - Botón cyan para ver Reporte Z directamente

4. **Acceso Rápido a Reporte Z**: Botón FileText que abre el modal del Reporte Z de la jornada seleccionada

### Ubicación
Barra superior de la página `/reports`, a la derecha del botón "Actualizar"

## Reportes X y Z (NUEVO - 2026-02-23)

### Descripción
Reportes de cierre con desglose detallado de ventas, formas de pago, y cuadre de caja.

### Reporte Z (Cierre de Día)
Incluye:
- **Resumen de Ventas**: Subtotal, ITBIS, Propina Legal, Total
- **Desglose por Forma de Pago**: Efectivo, Tarjeta, Transferencia, Dólar, Euro
- **Ventas por Categoría**: Desglose por categoría de producto
- **Notas de Crédito (B04)**: Lista de NC aplicadas con NCF, monto, razón
- **Anulaciones**: Lista de facturas anuladas con razón
- **Cuadre de Caja**: Fondo Inicial + Ventas Efectivo + Depósitos - Retiros = **Total a Entregar**

### Reporte X (Cierre de Turno)
Similar al Z pero filtrado por sesión específica del cajero.

### Endpoints API
- `GET /api/business-days/current/report-z` - Reporte Z de jornada actual
- `GET /api/business-days/{dayId}/report-z` - Reporte Z por ID
- `GET /api/business-days/session/{sessionId}/report-x` - Reporte X de turno

### UI
- Botón "Reporte Z" en el diálogo de gestión de jornada
- Modal con secciones expandibles
- Botón "Imprimir" para impresión del reporte

## Sistema de Jornada de Trabajo (NUEVO - 2026-02-23)

### Descripción
Sistema de fecha contable (Business Date) independiente del calendario civil. La fecha de negocio se establece al "Abrir Día" y permanece fija hasta el "Cierre de Día" manual.

### Reglas del Sistema
1. **Fecha de Negocio**: NO cambia automáticamente a medianoche
2. **Ticket a las 2:00 AM del día 24**: Se registra con fecha del día 23 si la jornada no ha cerrado
3. **Doble Marcación de Tiempo**:
   - `created_at`: Timestamp real (auditoría)
   - `business_date`: Fecha contable (reportes 607)

### Flujo de Operación
```
Apertura de Día → Apertura de Turno → Ventas → Cierre de Turno (X) → Cierre de Día (Z)
```

### Autorización
- **Quién puede abrir/cerrar**: Cualquier cajero
- **Requiere**: PIN de Gerente o Administrador para autorizar
- **Bloqueo**: Sin jornada abierta, NO se pueden procesar pagos

### Indicador Visual
- **Sidebar**: Icono de sol verde (abierta) o luna roja pulsante (sin jornada)
- **PaymentScreen**: Pantalla de bloqueo "JORNADA NO ABIERTA" si no hay jornada activa

### Endpoints API
- `GET /api/business-days/check` - Verifica estado actual
- `GET /api/business-days/current` - Obtiene jornada activa con stats
- `POST /api/business-days/authorize` - Verifica PIN de autorización
- `POST /api/business-days/open` - Abre nueva jornada
- `POST /api/business-days/close` - Cierra jornada (incluye stats)
- `GET /api/business-days/history` - Historial de jornadas

### Datos de Jornada
- Referencia única: `JORNADA-YYYY-NNNNN`
- Totales: ventas, efectivo, tarjeta, transferencias, facturas
- B04 aplicados, anulaciones
- Apertura/cierre con timestamp y usuario responsable

### Descripción
Drawer que aparece al seleccionar tipos fiscales B01 (Crédito Fiscal), B14 (Gubernamental), o B15 (Régimen Especial) durante el proceso de pago.

### Características
1. **Validación de RNC/Cédula**
   - RNC (9 dígitos): Validación de estructura básica (no verifica dígito verificador por compatibilidad con RNCs antiguos)
   - Cédula (11 dígitos): Valida con algoritmo Luhn, pero permite continuar con advertencia si falla
   - Formato automático: 131-09801-7 (RNC) o 001-1234567-8 (Cédula)

2. **Búsqueda de Clientes**
   - Botón "Buscar" consulta la base de datos por RNC exacto
   - Si el cliente existe: Autocompleta Razón Social y Email
   - Si es nuevo: Permite entrada manual y guarda el cliente al completar la transacción

3. **Campos del Drawer**
   - RNC/Cédula (obligatorio)
   - Razón Social (obligatorio)
   - Email (opcional - para envío de factura digital)

4. **Estados de Validación**
   - Verde: Validación exitosa
   - Ámbar: Validación con advertencia (permitido continuar)
   - Rojo: Formato inválido (no permite continuar)

### Endpoints Usados
- `GET /api/customers?rnc=XXXXX` - Busca cliente por RNC
- `POST /api/customers` - Crea nuevo cliente con RNC
- `POST /api/bills/{id}/pay` - Procesa pago con datos fiscales (fiscal_id, razon_social, customer_email)

## Búsqueda y Re-impresión de Facturas (NUEVO - 2026-02-23)

### Descripción
Sistema de búsqueda inteligente en la pantalla de Caja con capacidad de seleccionar y reimprimir facturas pasadas.

### Características
1. **Barra de Búsqueda Inteligente**
   - Ubicación: Sección "MOVIMIENTOS DEL TURNO" en Caja/Turnos
   - Placeholder: "Buscar por NCF, monto, descripción..."
   - Filtros disponibles: NCF (ej: B01), monto, descripción del pago, método de pago
   - Botón X para limpiar búsqueda

2. **Selección de Movimiento**
   - Click en movimiento resalta con borde naranja y punto pulsante
   - Click de nuevo deselecciona

3. **Botón Flotante de Re-impresión**
   - Aparece en la parte inferior al seleccionar un movimiento de tipo venta
   - Muestra: descripción, monto, referencia NCF
   - Botón "Re-imprimir" envía factura a cola de impresión
   - Botón "X" para cerrar

### Endpoints Usados
- `GET /api/bills?ncf={ncf}` - Buscar factura por NCF
- `POST /api/print/receipt/{bill_id}/send` - Enviar factura a cola de impresión

## Copias Configurables por Canal (NUEVO - 2026-02-23)

### Descripción
Permite configurar el número de copias a imprimir para cada canal de impresión (Cocina, Bar, Recibo, etc).

### Ubicación
Configuración → Impresión → Configurar Impresora USB/Red

### Características
- Campo numérico "Copias:" junto al nombre de impresora Windows
- Rango: 1 a 5 copias
- Valor por defecto: 1
- Badge visual muestra "X copias" cuando > 1

### Funcionamiento Técnico
1. **Backend**: Campo `copies` en colección `print_channels`
2. **API**: `PUT /api/print-channels/{id}` guarda el valor
3. **Print Queue**: Cada job incluye `copies` en su payload
4. **Print Agent v2.1**: Loop de impresión según `copies`:
   ```python
   for copy_num in range(1, copies + 1):
       print_raw(printer, raw_data)
       time.sleep(0.5)  # Pausa entre copias
   ```

### Nota Importante
Después de modificar las copias, el usuario debe **reinstalar el agente de impresión** desde:
`/api/download/print-agent-installer?printer_name=NOMBRE_IMPRESORA`

## Motor de Pagos Múltiples (NUEVO - 2026-02-23)

### Descripción
Sistema mejorado de procesamiento de pagos que soporta múltiples formas de pago por transacción y conversión automática de monedas.

### Características

#### Pagos Múltiples en Factura Final
- Si hay más de una forma de pago, se listan todas individualmente:
  ```
  FORMAS DE PAGO
  Efectivo RD$:        RD$ 2,000.00
  Tarjeta (Visa):      RD$ 3,000.00
  ```

#### Multimoneda en Pre-cuenta
- Debajo del Total Estimado, muestra conversiones automáticas:
  ```
  TOTAL ESTIMADO        RD$ 5,000.00
  ----------------------------------
  Equiv US$         78.12 (Tasa:64.00)
  Equiv €           71.43 (Tasa:70.00)
  ```

#### Lógica de Cambio con Moneda Extranjera
- Si el cliente paga en USD/EUR, el ticket muestra:
  ```
  Recibido (USD):       US$ 100.00
  Total a Cobrar:       RD$ 5,000.00
  CAMBIO (RD$):         RD$ 1,400.00
  ```
- **Nota:** El cambio siempre se da en RD$ (pesos dominicanos)

### Modelo de Datos
```python
class PaymentEntry:
    payment_method_id: str
    payment_method_name: str
    amount: float           # Monto en moneda original
    amount_dop: float       # Monto convertido a DOP
    currency: str           # "DOP", "USD", "EUR"
    exchange_rate: float    # Tasa de cambio
    brand_icon: str         # Ícono (visa, mastercard, etc.)
```

### Tasas de Cambio Configuradas
- USD Dólar: 64.00
- EUR Euro: 70.00
- Las tasas se configuran en Configuración → Métodos de Pago

### Formato de Impresion por Estado

#### Codificacion Compatible (ASCII)
Para evitar caracteres raros en impresoras termicas:
- Sin acentos: `Dolar` (no Dólar), `Transaccion` (no Transacción)
- Sin simbolos especiales: `EUR` (no €)
- Lineas simples: `=` o `-` (no ═)
- Ancho maximo: 42 caracteres (72mm)

#### Pre-cuenta (Estado Pendiente)
```
TOTAL ESTIMADO          RD$ 5,000.00
------------------------------------------
Dolar                        US$ 78.12
Euro                         EUR 71.43
------------------------------------------
La propina es voluntaria
Este NO es un comprobante fiscal
```

#### Factura Final (Estado Pagado)
```
Cajero:                            Admin
Transaccion:                       #1025
------------------------------------------
==========================================
              TOTAL A PAGAR
             RD$ 5,000.00
==========================================
Recibido Efectivo:          RD$ 2,000.00
Recibido Dolar:               US$ 50.00
CAMBIO:                        RD$ 200.00
------------------------------------------
```

## Menú Funciones de Mesa - Lógica Dual de Anulación (NUEVO - 2026-02-23)

### Descripción
El botón "Anular Cuenta Entera" en el menú de Funciones ahora actúa como un **acceso directo inteligente** que detecta el estado de la cuenta:

### UI Glassmorphism
- Modal con fondo desenfocado (`backdrop-blur-xl bg-slate-900/80`)
- Overlay de gradiente azul/púrpura
- Botones tipo **píldora** (`rounded-full`) organizados en cuadrícula
- Cada botón con icono y texto claro
- Colores contextuales: azul (mover), verde (dividir), rojo (anular)

### Lógica Dual de Anulación
1. **Cuenta ABIERTA** (sin factura NCF):
   - Cancela los items sin generar registros fiscales
   - Muestra diálogo de razones de cancelación
   - Requiere PIN de gerente
   - La mesa queda libre

2. **Cuenta CERRADA** (con factura NCF pagada):
   - Detecta automáticamente que existe un bill pagado
   - Muestra diálogo informativo con:
     - Número de Transacción
     - NCF de la factura
     - Total
     - Fecha de pago
   - Botón "Ir a Crear B04" navega a Caja
   - Pre-llena el número de transacción en el modal B04

### Flujo Técnico
```
[Usuario clic "Anular Cuenta"] 
    → [billsAPI.list({order_id})]
    → ¿Existe bill con status="paid"?
        → SÍ: Mostrar b04RedirectDialog
              → Navegar a /cash-register?openB04=true
              → sessionStorage.setItem('pendingB04Transaction', transNum)
        → NO: Mostrar cancelDialog con razones
              → Cancelar items sin fiscal
```

## Pendiente
### P1 - Alta Prioridad
- [ ] Reporte DGII 608 (pendiente confirmación del usuario)
- [ ] Reloj de entrada/salida empleados
- [ ] Envío automático de facturas por email (requiere integración con servicio de email)

### P2 - Media Prioridad
- [ ] Compilar agente como .exe (PyInstaller)
- [ ] Cache offline de imágenes

### P3 - Baja Prioridad
- [ ] Drag-and-drop métodos de pago
- [ ] Exportar auditoría Excel/CSV
- [ ] Duplicar productos

## Credenciales de Prueba
- **Admin:** PIN 10000 (puede crear B04)
- **Carlos (Mesero):** PIN 1234
- **María (Mesera):** PIN 5678
- **Luis (Cajero):** PIN 4321
- **Chef Pedro:** PIN 9999
