# MESA POS RD - Sistema de Punto de Venta

## Descripción General
Sistema POS completo para restaurantes/bares con soporte para impresión térmica automática, KDS (Kitchen Display System), y gestión de órdenes.

## Arquitectura de Impresión (ACTUALIZADO 2026-02-22)

### Flujo de Impresión
```
[Acción en App] → [Backend crea job en print_queue] → [Agente Local procesa] → [Impresora]
```

**IMPORTANTE:** El servidor en la nube NO puede alcanzar impresoras de red local. TODO va a la cola.

### Tipos de Trabajos
| Tipo | Campo Datos | Canal |
|------|-------------|-------|
| `comanda` | `data` (objeto) | kitchen/bar |
| `pre-check` | `commands` (array) | receipt |
| `receipt` | `commands` (array) | receipt |

### Canales Configurados
- **Cocina:** USB, impresora "RECIBO"
- **Bar:** Network, IP 192.168.1.114
- **Receipt:** Network, IP 192.168.1.114
- **Terraza:** USB, impresora "TERRAZA"

## URLs
- **App:** https://pos-printing-system.preview.emergentagent.com
- **API:** https://pos-printing-system.preview.emergentagent.com/api
- **Agente:** https://pos-printing-system.preview.emergentagent.com/api/download/print-agent

## Endpoints de Impresión
- `POST /api/print/send-comanda/{order_id}` - Envía comanda a cola
- `POST /api/print/pre-check/{order_id}/send` - Envía pre-cuenta a cola
- `POST /api/print/receipt/{bill_id}/send` - Envía recibo a cola
- `GET /api/print-queue/pending` - Obtiene trabajos pendientes
- `POST /api/print-queue/{job_id}/complete` - Marca trabajo completado

## Completado
- [x] Sistema de impresión con cola asíncrona
- [x] Agente local para Windows (Python)
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
- [ ] Compilar agente como .exe
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
