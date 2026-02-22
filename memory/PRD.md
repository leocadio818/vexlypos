# MESA POS RD - Sistema de Punto de Venta

## Descripción General
Sistema POS completo para restaurantes/bares con soporte para impresión térmica automática, KDS (Kitchen Display System), y gestión de órdenes.

## URLs del Sistema
- **App:** https://pos-printing-system.preview.emergentagent.com
- **API:** https://pos-printing-system.preview.emergentagent.com/api
- **Agente Python:** https://pos-printing-system.preview.emergentagent.com/api/download/print-agent?printer_name=Caja
- **Instalador Servicio:** https://pos-printing-system.preview.emergentagent.com/api/download/print-agent-installer?printer_name=Caja

## Arquitectura de Impresión (v2.0 - 2026-02-22)

### Flujo de Impresión
```
[Acción en App] → [Backend crea job en print_queue] → [Agente Local procesa] → [Impresora]
```

**IMPORTANTE:** El servidor en la nube NO puede alcanzar impresoras de red local. TODO va a la cola.

### Características del Agente v2.0
- **Auto-Reintento:** Si pierde conexión, espera 10s y reintenta automáticamente
- **Logging:** Escribe logs a `MesaPOS_PrintAgent.log` en el mismo directorio
- **Servicio Windows:** Se puede instalar como servicio para inicio automático
- **Sin Ventana:** Corre silenciosamente en segundo plano

### Instalación como Servicio
1. Descargar `Instalar_MesaPOS_PrintAgent.bat`
2. Ejecutar como Administrador
3. El servicio se iniciará automáticamente con Windows

### Comandos del Servicio
```cmd
sc query MesaPOS_PrintAgent          # Ver estado
net stop MesaPOS_PrintAgent          # Detener
net start MesaPOS_PrintAgent         # Iniciar
C:\nssm\nssm.exe remove MesaPOS_PrintAgent confirm  # Eliminar
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

## Completado
- [x] Sistema de impresión con cola asíncrona
- [x] Agente local v2.0 para Windows (Python)
- [x] Auto-reintento de conexión (10s/30s)
- [x] Logging a archivo
- [x] Instalador automático como servicio Windows
- [x] KDS con filtrado por canal
- [x] Formato 72mm para tickets térmicos
- [x] Comandas separadas por canal (cocina/bar)

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
