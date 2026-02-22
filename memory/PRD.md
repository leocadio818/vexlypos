# MESA POS RD - Sistema de Punto de Venta

## Descripción General
Sistema POS completo para restaurantes/bares con soporte para impresión térmica automática, KDS (Kitchen Display System), y gestión de órdenes.

## URLs del Sistema
- **App:** https://pos-printing-system.preview.emergentagent.com
- **API:** https://pos-printing-system.preview.emergentagent.com/api
- **Agente Python:** https://pos-printing-system.preview.emergentagent.com/api/download/print-agent?printer_name=RECIBO
- **Instalador Servicio:** https://pos-printing-system.preview.emergentagent.com/api/download/print-agent-installer?printer_name=RECIBO

## Arquitectura de Impresión (v2.1 - 2026-02-22)

### Flujo de Impresión
```
[Acción en App] → [Backend crea job en print_queue] → [Agente Local procesa] → [Impresora]
```

**IMPORTANTE:** El servidor en la nube NO puede alcanzar impresoras de red local. TODO va a la cola.

### Características del Agente v2.1
- **Auto-Reintento:** Si pierde conexión, espera 10s y reintenta automáticamente
- **Logging:** Escribe logs a `MesaPOS_PrintAgent.log`
- **Config Editable:** Archivo `config.txt` para cambiar URL sin reinstalar
- **Inicio Automático:** Tarea programada con Windows
- **Sin Ventana:** Corre silenciosamente en segundo plano

### Formato de Cantidades (IMPORTANTE)
- Cantidades SIN decimales innecesarios: `1 X` en lugar de `1.0 X`
- Cantidades CON decimales cuando aplica: `1.5 X PESCADO FRITO`
- Aplica a: Comandas, Pre-cuentas y Facturas

### Instalación del Agente
1. Descargar `Instalar_MesaPOS_PrintAgent.bat` desde el link del instalador
2. Clic derecho → "Ejecutar como administrador"
3. El instalador hace todo automático

### Cambiar URL (Producción)
Editar `C:\MesaPOS\config.txt`:
```
SERVER_URL=https://tu-url-de-produccion.com
PRINTER_NAME=RECIBO
```
Luego reiniciar:
```cmd
taskkill /f /im pythonw.exe
wscript C:\MesaPOS\RunAgent.vbs
```

### Canales Configurados
| Canal | Target | IP/Impresora |
|-------|--------|--------------|
| Cocina | USB | RECIBO |
| Bar | Network | 192.168.1.114 |
| Receipt | Network | 192.168.1.114 |
| Terraza | USB | TERRAZA |

## Endpoints de Impresión
- `POST /api/print/send-comanda/{order_id}` - Envía comanda a cola
- `POST /api/print/pre-check/{order_id}/send` - Envía pre-cuenta a cola
- `POST /api/print/receipt/{bill_id}/send` - Envía recibo a cola
- `GET /api/print-queue/pending` - Obtiene trabajos pendientes
- `POST /api/print-queue/{job_id}/complete` - Marca trabajo completado
- `GET /api/download/print-agent` - Descarga agente Python
- `GET /api/download/print-agent-installer` - Descarga instalador .bat

## Completado (2026-02-22)
- [x] Sistema de impresión con cola asíncrona
- [x] Agente local v2.1 para Windows (Python)
- [x] Auto-reintento de conexión (10s/30s)
- [x] Logging a archivo
- [x] Archivo config.txt editable para cambiar URL
- [x] Instalador automático con Tarea Programada de Windows
- [x] KDS con filtrado por canal
- [x] Formato 72mm para tickets térmicos
- [x] Comandas separadas por canal (cocina/bar)
- [x] Impresión automática de comandas al "Enviar a Cocina"
- [x] Formato de cantidad sin decimales innecesarios (1 X en vez de 1.0 X)

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
- Carlos (Cajero): PIN 1234
- María (Mesera): PIN 5678
- Luis (Cajero): PIN 4321
