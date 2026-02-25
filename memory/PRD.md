# MESA POS RD - Sistema de Punto de Venta

## Descripción General
Sistema POS completo para restaurantes/bares con soporte para impresión térmica automática, KDS (Kitchen Display System), gestión de órdenes, y cumplimiento fiscal DGII (República Dominicana).

## URLs del Sistema
- **App:** https://pos-training-hub.preview.emergentagent.com
- **API:** https://pos-training-hub.preview.emergentagent.com/api
- **Agente Python:** https://pos-training-hub.preview.emergentagent.com/api/download/print-agent?printer_name=RECIBO
- **Instalador Servicio:** https://pos-training-hub.preview.emergentagent.com/api/download/print-agent-installer?printer_name=RECIBO

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
- [x] **Validación RNC en Tiempo Real** - Consulta API DGII tercero para auto-llenar datos del contribuyente
- [x] **Indicador Estado Contribuyente** - Badge visual (ACTIVO/SUSPENDIDO/INACTIVO) en captura fiscal
- [x] **Fix Impresión Datos Fiscales** - Datos del cliente (RNC/Razón Social) ahora aparecen en facturas B01/B14/B15
- [x] **Anular Cuenta → Mesa Libre** - Al anular todos los items de una cuenta abierta, la mesa vuelve a estado disponible
- [x] **Modal Modificadores Touch-Friendly** - Botones más grandes y espaciados para pantallas táctiles
- [x] **Drawer Fiscal Fullscreen Móvil** - El drawer de datos fiscales ahora ocupa toda la pantalla en móvil
- [x] **Fix IndexedDB Safari** - Manejo de errores cuando IndexedDB no está disponible (modo privado)
- [x] **Cajero Requiere Turno Abierto** - Los cajeros deben abrir turno de caja obligatoriamente antes de usar el sistema
- [x] **Bloqueo de Terminales en Uso** - Al abrir turno, los terminales ya ocupados se muestran deshabilitados
- [x] **CRUD Terminales** - Gestión completa de terminales/cajas en Configuración > Estación
- [x] **Protección Eliminación Terminal en Uso** - No permite eliminar terminal con turno activo (retorna error 400)
- [x] **Bloqueo Cierre Turno con Mesas Abiertas** - El cajero no puede cerrar turno si tiene cuentas/órdenes abiertas. Muestra diálogo dedicado con las mesas pendientes
- [x] **Conteo Ciego de Caja** - El "Efectivo Esperado" se oculta del cajero durante el arqueo (solo visible para admin). La comparación Esperado vs Declarado aparece solo en el reporte X impreso
- [x] **Datos de Cuadre en MongoDB** - Al cerrar turno se guardan los datos de reconciliación (declarado, esperado, diferencia) en colección `session_reconciliations`
- [x] **Historial con Diferencia** - El historial de turnos muestra la diferencia de caja para sesiones cerradas

## Completado (2026-02-25)
- [x] **Bug Fix: Admin No Podía Abrir Turno** - Error UUID en Supabase al enviar terminal_id de MongoDB. Corregido enviando terminal_id=None
- [x] **Turno Obligatorio para Admin y Cajero** - La restricción de turno ahora aplica a roles admin y cashier (waiter y kitchen exentos)
- [x] **Cierre de Día (Z) en Caja** - Botón CIERRE Z disponible para admin (sin turno activo) en la pantalla de Caja. Valida que no haya turnos ni mesas abiertas antes de cerrar
- [x] **Validación de Mesas Abiertas en Cierre de Día** - El cierre de día no procede si hay órdenes activas/pendientes
- [x] **Re-imprimir Reporte X** - Botón de impresora en cada turno cerrado del historial. Abre el componente ReportXZ

## Bloqueo de Terminales en Uso (2026-02-24)

### Problema
Cuando múltiples cajeros trabajan simultáneamente, no había control para evitar que dos cajeros abrieran turno en la misma caja/terminal.

### Solución
1. **Endpoints nuevos:**
   - `GET /api/pos-sessions/terminals` - Retorna terminales con estado `in_use` y `in_use_by`
   - `GET /api/pos-sessions/terminals/in-use` - Retorna mapa de terminales ocupados

2. **Frontend (CashRegister.js):**
   - Terminales en uso se muestran en **rojo** con texto "En uso: [nombre]"
   - No se puede hacer clic en terminales ocupados (`disabled`)
   - Mensaje: "Las estaciones en rojo ya tienen un turno activo"
   - Validación antes de abrir turno

### Archivos Modificados
- `/app/backend/routers/pos_sessions.py`: Endpoints de terminales
- `/app/frontend/src/pages/CashRegister.js`: UI de selección de terminal
- `/app/frontend/src/lib/api.js`: Método `terminalsInUse()`

## Control de Turno Obligatorio para Cajeros (2026-02-24)

### Problema
Los cajeros podían usar el sistema sin abrir turno de caja, lo que impedía el control de efectivo.

### Solución
Diálogo **BLOQUEANTE y PERMANENTE** que aparece en TODAS las páginas hasta que el cajero abra turno.

### Lógica
```javascript
const isCashierRole = user?.role === 'cashier';
const isOnCashRegisterPage = location.pathname === '/cash-register';
const cashierNeedsShift = isCashierRole && !cashierShift && !cashierShiftLoading && !isOnCashRegisterPage;
```

- Si `cashierNeedsShift` es true → Diálogo bloqueante aparece
- Excepción: No bloquear en `/cash-register` para permitir abrir turno
- Polling cada 5 segundos para detectar cuando abre turno

### Archivos Modificados
- `/app/frontend/src/components/Layout.js`: Diálogo bloqueante
- `/app/frontend/src/components/ui/dialog.jsx`: Prop `hideCloseButton`

## Drawer Fiscal Fullscreen para Móvil (2026-02-24)

### Problema
En móvil, el drawer de "Datos Fiscales" solo subía hasta la mitad de la pantalla, cortando los botones "Cancelar" y "Continuar".

### Solución
Hacer el drawer **fullscreen** (`h-[100vh]`) con estructura flex:
- Header fijo arriba con título
- Contenido scrolleable en el medio
- Footer fijo abajo con botones siempre visibles

### Implementación
```jsx
<DrawerContent className="bg-slate-900 border-t border-white/10 h-[100vh] rounded-t-none">
  <div className="w-full h-full flex flex-col">
    {/* Header fijo */}
    <DrawerHeader className="flex-shrink-0 border-b border-white/10">...</DrawerHeader>
    
    {/* Contenido scrolleable */}
    <div className="flex-1 overflow-y-auto px-5 py-4">...</div>
    
    {/* Footer fijo con botones */}
    <DrawerFooter className="flex-shrink-0 border-t border-white/10">...</DrawerFooter>
  </div>
</DrawerContent>
```

### Archivo Modificado
- `/app/frontend/src/components/FiscalDataDrawer.jsx`

## Fix IndexedDB para Safari Modo Privado (2026-02-24)

### Problema
Error "Can't find variable: indexedDB" en Safari/Chrome modo privado porque IndexedDB no está disponible.

### Solución
Agregar verificación de disponibilidad antes de usar IndexedDB:
```javascript
function isIndexedDBAvailable() {
  try {
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}
```

Todas las funciones ahora verifican `if (!db) return defaultValue;` para manejar el caso cuando IndexedDB no está disponible.

### Archivo Modificado
- `/app/frontend/src/lib/offlineDB.js`

## Modal Modificadores Touch-Friendly (2026-02-24)

### Cambios
| Elemento | Antes | Después |
|----------|-------|---------|
| Ancho modal | `max-w-md` | `max-w-lg` |
| Botones +/- | `h-8 w-8` | `h-12 w-12` |
| Botones modificadores | `p-1.5` | `p-3 min-h-[60px]` |
| Botón AGREGAR | `h-11` | `h-14` |

### Archivo Modificado
- `/app/frontend/src/pages/OrderScreen.js`

## Fix DEFINITIVO: Datos Fiscales en Factura Impresa (2026-02-23)

### Problema Original
Los datos fiscales del cliente (RNC/Cédula y Razón Social) NO aparecían en las facturas impresas para transacciones fiscales (B01, B14, B15).

### Diagnóstico Completo
**Error #1:** El campo `ncf_type` estaba vacío/None en bills existentes.
**Error #2 (CRÍTICO):** El frontend usa `/api/print/receipt/{bill_id}/send` (línea 2077) pero el fix inicial se aplicó al endpoint incorrecto `/api/print/send-receipt/{bill_id}`.

### Lección Aprendida - IMPORTANTE
⚠️ **Hay MÚLTIPLES endpoints de impresión en server.py:**
- `/api/print/receipt/{bill_id}` (GET) - Retorna HTML para preview
- `/api/print/receipt-escpos/{bill_id}` (GET) - Retorna comandos ESC/POS para preview
- `/api/print/send-receipt/{bill_id}` (POST) - Endpoint alternativo
- `/api/print/receipt/{bill_id}/send` (POST) - **EL QUE USA EL FRONTEND** ← Línea 2077

**Siempre verificar con grep qué endpoint usa el frontend antes de modificar:**
```bash
grep -rn "print.*receipt" /app/frontend/src --include="*.js" --include="*.jsx"
```

### Solución Definitiva Aplicada
Se agregó la sección "DATOS DEL CLIENTE" en el endpoint correcto `/api/print/receipt/{bill_id}/send` (línea 2077):

```python
# ─── DATOS FISCALES DEL CLIENTE (B01, B14, B15) ───
ncf_type = bill.get("ncf_type", "")
ncf_str = bill.get("ncf", "")
if not ncf_type and ncf_str:
    if ncf_str.startswith("B01"):
        ncf_type = "B01"
    elif ncf_str.startswith("B14"):
        ncf_type = "B14"
    elif ncf_str.startswith("B15"):
        ncf_type = "B15"

if ncf_type in ["B01", "B14", "B15"] and (bill.get("fiscal_id") or bill.get("razon_social")):
    commands.append({"type": "text", "text": "DATOS DEL CLIENTE", "align": "left", "bold": True})
    commands.append({"type": "text", "text": f"{fiscal_id_type}: {fiscal_id}", "align": "left"})
    commands.append({"type": "text", "text": f"Razon Social: {razon_social}", "align": "left"})
    commands.append({"type": "divider"})
```

### Archivos Modificados
- `/app/backend/server.py`: 
  - Línea ~2110-2135: Endpoint `/api/print/receipt/{bill_id}/send` (EL PRINCIPAL)
  - Línea ~1207-1230: Endpoint `/api/print/receipt/{bill_id}` (HTML preview)
  - Línea ~1264-1285: Endpoint `/api/print/receipt-escpos/{bill_id}` (ESC/POS preview)
  - Línea ~1775-1845: Endpoint `/api/print/send-receipt/{bill_id}` (alternativo)

### Verificación Exitosa
```
DATOS DEL CLIENTE
RNC: 131062822
Razon Social: SSTECH SRL
```
✅ Aparece correctamente en ticket impreso físico

### Flujo de Impresión Documentado
```
[Frontend PaymentScreen.js] 
    → POST /api/print/receipt/{bill_id}/send
    → Crea job en MongoDB print_queue con commands[]
    → Agente local (print_agent_pro.py) consulta /api/print-queue/pending
    → Agente ejecuta build_escpos_data(commands)
    → Impresora térmica recibe datos ESC/POS
```

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

## Anular Cuenta Completa → Mesa Libre (NUEVO - 2026-02-24)

### Descripción
Cuando se anulan TODOS los items de una cuenta/orden abierta (no pagada), la mesa vuelve automáticamente a estado "libre" (disponible) para poder usarse nuevamente.

### Flujo
```
Mesa ocupada + Orden abierta → Anular TODOS los items → Mesa libre
```

### Implementación
Se agregó lógica en 3 endpoints de `/app/backend/routers/orders.py`:

1. **Single Item Cancel** (líneas ~367-389):
   - `POST /api/orders/{order_id}/cancel-item/{item_id}`
   - Después de cancelar, verifica si era el último item activo

2. **Express Void** (líneas ~430-451):
   - `POST /api/orders/{order_id}/cancel-items` con `express_void=true`
   - Para items pendientes (no enviados a cocina)

3. **Bulk Cancel con Auditoría** (líneas ~544-566):
   - `POST /api/orders/{order_id}/cancel-items` con razón y posible autorización gerencial

### Lógica Común
```python
# Después de cualquier anulación:
updated_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
all_items = updated_order.get("items", [])
active_items = [i for i in all_items if i.get("status") != "cancelled"]

if len(active_items) == 0 and len(all_items) > 0:
    # Todos cancelados → marcar orden y liberar mesa
    await db.orders.update_one(
        {"id": order_id}, 
        {"$set": {"status": "cancelled", "cancelled_at": now_iso()}}
    )
    table_id = updated_order.get("table_id")
    if table_id:
        await db.tables.update_one(
            {"id": table_id},
            {"$set": {"status": "free", "active_order_id": None}}
        )
```

### Pruebas (100% pasaron)
- ✅ Express void de todos los items → mesa libre
- ✅ Anulación parcial NO libera mesa
- ✅ Cancelar único item cuando es el último → mesa libre
- ✅ Bulk cancel con auditoría → mesa libre
- ✅ Agregar items después, luego anular todos → mesa libre

### Archivo de Tests
`/app/backend/tests/test_void_releases_table.py`

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

## Bugs Corregidos

### Reportes X/Z mostraban $0.00 en ventas (2026-02-25) [P0]
**Bug:** Los reportes X (cierre de turno) y Z (cierre de día) mostraban $0.00 en todas las cifras de ventas a pesar de tener facturas pagadas.

**Causas identificadas:**
1. Facturas antiguas (166 de 193) no tenían los campos `business_date` ni `paid_by_id` (solo `cashier_id`)
2. Reporte X buscaba `opened_by_id` en sesiones Supabase (el campo correcto es `opened_by`)
3. No existía lógica de fallback para facturas sin los nuevos campos
4. `business_date` se obtenía de la jornada ACTUAL en vez de la jornada de la sesión
5. `calculate_day_stats` usaba filtros rígidos sin alternativas

**Solución en `/app/backend/routers/business_days.py`:**
- Filtrado multi-estrategia con fallbacks: business_date → business_day_id → rango de tiempo
- Matching de usuario robusto: `$or` con `paid_by_id` Y `cashier_id`
- Obtención correcta de `business_date` desde la jornada activa durante la sesión
- Mismo patrón aplicado a `generate_x_report`, `generate_z_report_internal` y `calculate_day_stats`

**Verificación:** Testing agent confirmó 100% (6/6 tests pasados). Datos reales: X Report Admin $1,696.40, X Report Luis $782.76, Z Report $11,849.09 de 25 facturas.

### FiscalDataDrawer - Error al crear cliente nuevo (2026-02-23)
**Bug:** Al hacer clic en "Continuar" en el drawer de datos fiscales (B01, B14, B15) con un cliente nuevo, se producía un error HTTP 422.

**Causa:** El frontend enviaba `null` para los campos `phone` y `email` al crear un nuevo cliente, pero el backend esperaba strings (vacíos o con contenido).

**Solución:** En `/app/frontend/src/components/FiscalDataDrawer.jsx`, líneas 247-248:
- Cambiado `email: email.trim() || null` → `email: email.trim() || ''`
- Cambiado `phone: null` → `phone: ''`

**Verificación:** Testing agent confirmó 100% de tests pasados (backend y frontend).

### Logout RD - No enviaba comandas pendientes (2026-02-23)
**Bug:** Al hacer clic en el logo "RD" para salir (logout), las comandas pendientes NO se enviaban a los canales de impresión (cocina), a diferencia de los botones "Enviar" y "Mesas".

**Causas identificadas:**
1. Se usaba `api.orders.sendToKitchen()` que no existía (debía ser `ordersAPI.sendToKitchen()`)
2. Se filtraba por `user?.user_id` pero el campo correcto es `user?.id`
3. La llamada a `ordersAPI.list({ status: 'active' })` excluía órdenes con status `sent` que también pueden tener items pendientes

**Solución:** En `/app/frontend/src/components/Layout.js`:
- Importar `ordersAPI` desde `@/lib/api`
- Usar `user?.id` en lugar de `user?.user_id`
- Remover filtro de status en la llamada API (`ordersAPI.list()` sin parámetros)

**Verificación:** Logs de consola confirman `Logout: Comanda enviada para orden {id}` y los items cambian de status `pending` a `sent`.

### Mejora: Validación RNC contra DGII (2026-02-23)
**Feature:** Al ingresar un RNC válido (9 dígitos) en el FiscalDataDrawer, el sistema consulta automáticamente la DGII (via Megaplus API) para autocompletar la Razón Social.

**Beneficios:**
- Reduce tiempo de captura de datos fiscales
- Reduce errores de tipeo en nombres de empresas
- Muestra estado del contribuyente con badges de colores:
  - 🟢 **ACTIVO** - Badge verde, sin alertas
  - 🟡 **SUSPENDIDO** - Badge amarillo con alerta de verificación
  - 🔴 **INACTIVO** - Badge rojo con advertencia de no facturar con crédito fiscal

**Implementación:**
- Nuevo endpoint: `GET /api/dgii/validate-rnc/{rnc}` en `/app/backend/routers/dgii.py`
- Cache en memoria para consultas repetidas
- Timeout de 3 segundos para no bloquear el flujo
- Auto-búsqueda con debounce de 300ms cuando el RNC es válido

**Tiempos de respuesta:**
- Cache hit: ~0.2 segundos
- Nueva consulta: ~1-2 segundos


### Rediseno Gestion de Empleados (2026-02-25)
**Problema:** Gestion de empleados con 3 pestanas confusas. Sistemas desconectados "Rol" vs "Puesto": Carlos mostraba "Cajero" en una pestana y "Mesero" en otra.

**Solucion:** Rediseno completo a pantalla unica unificada (UserConfig.js reescrito):
- Columna izq: Datos empleado (nombre, PIN, foto, contacto, empleo colapsable)
- Columna der: Selector de Puesto (pills) + Grid de Permisos (toggles por categoria)
- Permisos por defecto se cargan al seleccionar puesto
- Permisos individuales personalizables sin cambiar de puesto (marcados "especial" en naranja)
- Creacion de puestos personalizados, Boton "Restablecer", Switch Modo Entrenamiento
- Bug fix: campo `code` agregado a roles builtin en backend API
- Filtrado de roles custom duplicados, Etiquetas en espanol

**Verificacion:** Testing agent 100% (12/12 backend, 13/13 frontend).

### Reportes X/Z mostraban $0.00 en ventas (2026-02-25) [P0 - CORREGIDO]
**Bug:** Reportes X/Z mostraban $0.00 porque filtros buscaban campos inexistentes en facturas antiguas.
**Solucion:** Filtrado multi-estrategia con fallbacks en business_days.py.
**Verificacion:** Testing agent 100% (6/6 tests).

### Modo Entrenamiento - Fase 2 (2026-02-25) [COMPLETADO]
**Funcionalidad:** Switch en perfil del empleado que activa modo entrenamiento:
- Ordenes marcadas con `training_mode: true`
- Facturas reciben NCF "ENTRENAMIENTO" en vez de NCF fiscal real (no consume secuencia)
- Pagos NO incrementan totales de jornada ni sesion POS
- Reportes X/Z excluyen facturas de entrenamiento (`training_mode: {$ne: True}`)
- Comandas y recibos impresos incluyen header "*** ENTRENAMIENTO *** NO ES VENTA REAL"
- Banner persistente amber en el frontend: "MODO ENTRENAMIENTO — Las transacciones NO se registran como ventas reales"
- Al desactivar switch, el usuario opera normalmente; registros de entrenamiento quedan ocultos de reportes
- Training mode verificado desde JWT + DB (soporta cambio en caliente)

**Dashboard de Entrenamiento:**
- Endpoint `GET /api/users/{user_id}/training-stats` con estadisticas completas
- Seccion colapsable en perfil del empleado: ordenes, cobros, items, monto practicado
- Timeline con fecha inicio y ultima actividad
- Lista de actividad reciente (ultimas 10 transacciones de entrenamiento)
- Solo visible si el empleado tiene modo entrenamiento activo o tiene historial

**Verificacion:** Testing agent 100% (14/14 backend, 8/8 frontend) para modo entrenamiento.
Testing agent 100% (9/9 backend, 10/10 frontend) para dashboard de entrenamiento.




---

## Pendiente
### P1 - Alta Prioridad
- [ ] Reloj de entrada/salida empleados
- [ ] Envio automatico de facturas por email (requiere integracion con servicio de email)

### P2 - Media Prioridad
- [ ] Reporte DGII 608
- [ ] Compilar agente como .exe (PyInstaller)
- [ ] Cache offline de imagenes

### P3 - Baja Prioridad
- [ ] Drag-and-drop metodos de pago
- [ ] Exportar auditoria Excel/CSV
- [ ] Duplicar productos

## Credenciales de Prueba
- **Admin:** PIN 10000 (puede crear B04)
- **Carlos (Mesero):** PIN 1234
- **María (Mesera):** PIN 5678
- **Luis (Cajero):** PIN 4321
- **Chef Pedro:** PIN 9999
