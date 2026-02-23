# MESA POS RD - Sistema de Punto de Venta

## Descripción General
Sistema POS completo para restaurantes/bares con soporte para impresión térmica automática, KDS (Kitchen Display System), y gestión de órdenes.

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

### Número de Transacción Interno (NUEVO - 2026-02-22)
- Cada documento impreso tiene un número secuencial interno: `Trans. #123`
- Aparece en: **Comandas**, **Pre-cuentas**, **Facturas finales**
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

### Control de Acceso por Roles (ACTUALIZADO - 2026-02-22)
- **PaymentScreen:** Solo accesible para `admin`, `cashier`, `manager`
- **Caja:** Solo visible para Cajeros y Administradores (no meseros)
- **Config:** Solo visible para Administradores
- Meseros que intenten acceder a /payment/* son redirigidos a /tables

## Completado (2026-02-22)
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
- [x] **Número de Transacción Interno** - Trans. #XXX en todos los tickets

## Pendiente
### P1 - Alta Prioridad
- [ ] Datos reales para tendencias de valoración
- [ ] Reportes DGII (607, 608)
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
- Admin: PIN 10000
- Carlos (Mesero): PIN 1234
- María (Mesera): PIN 5678
- Luis (Cajero): PIN 4321
- Chef Pedro: PIN 9999
