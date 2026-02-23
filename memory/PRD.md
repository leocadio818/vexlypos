# MESA POS RD - Sistema de Punto de Venta

## Descripción General
Sistema POS completo para restaurantes/bares con soporte para impresión térmica automática, KDS (Kitchen Display System), gestión de órdenes, y cumplimiento fiscal DGII (República Dominicana).

## URLs del Sistema
- **App:** https://pos-b04-fiscal.preview.emergentagent.com
- **API:** https://pos-b04-fiscal.preview.emergentagent.com/api
- **Agente Python:** https://pos-b04-fiscal.preview.emergentagent.com/api/download/print-agent?printer_name=RECIBO
- **Instalador Servicio:** https://pos-b04-fiscal.preview.emergentagent.com/api/download/print-agent-installer?printer_name=RECIBO

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

## Pendiente
### P1 - Alta Prioridad
- [ ] Datos reales para tendencias de valoración
- [ ] Reporte DGII 608
- [ ] Auditoría - solo Admin ve PINs
- [ ] Reloj de entrada/salida empleados

### P2 - Media Prioridad
- [ ] Compilar agente como .exe (PyInstaller)
- [ ] Imágenes/iconos en productos
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
