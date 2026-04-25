# 🚀 VexlyPOS — Guía Operativa para Instalación de Clientes

> Manual de campo para el equipo VexlyPOS. Diseñado para tener TODO lo que necesitas en un solo lugar mientras instalas un cliente.

---

## 📋 Índice rápido

1. [Antes de salir a la instalación](#antes-de-salir-a-la-instalación)
2. [Paso a paso: instalación nueva (sandbox)](#instalación-nueva-sandbox)
3. [Paso a paso: pasar de sandbox a producción real](#sandbox--producción)
4. [Comandos rápidos para emergencias](#comandos-rápidos)
5. [Troubleshooting común](#troubleshooting)
6. [Datos de Lungomare (referencia)](#lungomare-referencia)

---

## Antes de salir a la instalación

Lleva contigo:

- [ ] **Laptop con acceso a internet** (necesitas correr scripts contra el tenant del cliente)
- [ ] **Tu PIN admin** (`11338585` para tenants tuyos)
- [ ] **Datos fiscales del cliente**:
  - RNC (con o sin guiones)
  - Razón Social legal (la del XML, formal)
  - Nombre Comercial (DBA, el que dice el rótulo)
  - Dirección fiscal completa
  - Email
  - Teléfono
  - Provincia y Municipio (códigos 6 dígitos — ver tabla abajo)
- [ ] **Carta de aprobación DGII** del cliente (lista los rangos NCF y vencimientos oficiales)
- [ ] **Credenciales Multiprod** del cliente:
  - URL sandbox (con `/testecf/`)
  - URL producción (con `/ecf/` sin "test") — pedirla a Multiprod si no la tienes aún

---

## Instalación nueva (sandbox)

### Paso 1 — Crear archivo de configuración del cliente

```bash
# 1A. Copia la plantilla
cp /app/scripts/clientes/_template.env /app/scripts/clientes/CLIENTE.env

# 1B. Edita con los datos del cliente
nano /app/scripts/clientes/CLIENTE.env
```

Contenido a llenar:

```env
TENANT_URL=https://CLIENTE.vexlyapp.com
ADMIN_PIN=11338585

RNC="X-XX-XXXXX-X"
RAZON_SOCIAL="RAZÓN SOCIAL LEGAL SRL"
NOMBRE_COMERCIAL="Nombre Comercial"
DIRECCION="Calle, Sector, Ciudad"
EMAIL="contacto@cliente.com"
TELEFONO="809-000-0000"

PROVINCIA=010000   # ver tabla
MUNICIPIO=010101   # ver tabla

# URL sandbox que dio Multiprod
MULTIPROD_ENDPOINT=https://portalmultiprod.com/api/testecf/enviar/TOKEN_DEL_CLIENTE
MULTIPROD_TOKEN=
```

### Paso 2 — Verificar (sin guardar)

```bash
/app/scripts/setup_tenant.sh --config /app/scripts/clientes/CLIENTE.env --dry-run
```

Te muestra qué cambiaría. Si todo se ve correcto, procede.

### Paso 3 — Aplicar configuración

```bash
/app/scripts/setup_tenant.sh --config /app/scripts/clientes/CLIENTE.env
```

Output esperado:
```
✓ Login OK
✓ system_config actualizado
✓ ecf_provider_config actualizado
✓ Conexión Multiprod OK
```

### Paso 4 — Cargar secuencias NCF DGII

⚠️ El script `load_lungomare_sequences.sh` está hardcoded para Lungomare. Para otros clientes:

```bash
# Copiar y adaptar
cp /app/scripts/load_lungomare_sequences.sh /app/scripts/load_CLIENTE_sequences.sh
nano /app/scripts/load_CLIENTE_sequences.sh
```

Cambia las líneas:
- `TENANT_URL="https://CLIENTE.vexlyapp.com"`
- En cada `upsert_seq` los rangos del cliente según su carta DGII

Para SANDBOX usar **fechas legacy** que el testbed tiene registradas (las que tu carta DGII NO dice — depende del cliente, en Lungomare fue `2028-12-31`). Si DGII rechaza con código 145 ("Fecha vencimiento inválida"), prueba con `2027-12-31` o `2028-12-31`.

```bash
/app/scripts/load_CLIENTE_sequences.sh
```

### Paso 5 — Test E2E

```bash
# Adapta TENANT_URL del script
nano /app/scripts/test_ecf_lungomare.sh   # cambia URL → tu cliente
/app/scripts/test_ecf_lungomare.sh
```

Si ves `estado: aceptado` y QR DGII → cliente listo.

### Paso 6 — Probar en UI

1. Abrir `https://CLIENTE.vexlyapp.com` con PIN admin
2. POS → crear orden → Cobrar Consumo → Pagar
3. **Ticket debe imprimir QR escaneable**
4. Escanear QR con celular → debe abrir verificación DGII y decir **Estado: Aceptado**

---

## Sandbox → Producción

Cuando Multiprod entregue la URL productiva del cliente (sin `/testecf/`):

### Paso único — Production Switch

```bash
/app/scripts/production_switch.sh \
  --config /app/scripts/clientes/CLIENTE.env \
  --prod-url "https://portalmultiprod.com/api/ecf/enviar/TOKEN_PRODUCCION_CLIENTE"
```

El script hace los 3 pasos en uno:
1. Cambia URL Multiprod a producción
2. E31 y E45 `valid_until` → `2027-12-31` (fecha oficial DGII)
3. Resetea contadores E31=1, E32=1, E34=1, E45=1

Te pide confirmar con `SI` antes de aplicar.

### Validación post-switch

1. **Cobro interno de prueba** con el RNC del propio negocio (no cobrar a un cliente real todavía)
2. Escanear QR del ticket → URL debe decir `ecf.dgii.gov.do/ecf/` (sin "test")
3. Confirmar en el portal DGII real del contribuyente que el e-CF aparece

---

## Comandos rápidos

### Verificar estado de un cliente
```bash
TENANT="https://CLIENTE.vexlyapp.com"
TOKEN=$(curl -s -X POST "$TENANT/api/auth/login" -H "Content-Type: application/json" -d '{"pin":"11338585"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

# Datos fiscales
curl -s "$TENANT/api/system/config" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Provider y endpoint
curl -s "$TENANT/api/ecf/config" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Secuencias
curl -s "$TENANT/api/ncf/sequences" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Salud del sistema (Super Admin)
curl -s "$TENANT/api/system/health-check" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Últimos logs e-CF
curl -s "$TENANT/api/ecf/logs?limit=5" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### Resetear el contador de una secuencia
```bash
# Listar secuencias para conseguir el ID
curl -s "$TENANT/api/ncf/sequences" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# PUT para cambiar current_number
curl -s -X PUT "$TENANT/api/ncf/sequences/SEQ_ID_AQUI" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"current_number": 1}'
```

### Forzar sincronización de datos del negocio
Si los datos del negocio se ven raros en el ticket:
```bash
/app/scripts/setup_tenant.sh --config /app/scripts/clientes/CLIENTE.env
```

---

## Troubleshooting

### 🔴 "DGII Rechazado: La combinación e-NCF y código de seguridad ya han sido utilizados"
**Causa**: ese eNCF ya fue enviado antes a DGII (testbed o producción).
**Fix**: saltar el contador a un número más alto:
```bash
# Ej: saltar E32 a 200
curl -s -X PUT "$TENANT/api/ncf/sequences/SEQ_ID" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"current_number": 200}'
```

### 🔴 "Fecha de vencimiento de secuencia inválida" (código 145)
**Causa**: la fecha en el sistema NO coincide con la que DGII tiene registrada.
**Fix sandbox**: probar `2028-12-31`. **Fix producción**: usar la fecha oficial de la carta DGII (normalmente `2027-12-31`).

### 🔴 "RNC del emisor no configurado"
**Causa**: el cliente no tiene `ticket_rnc` en la BD.
**Fix**: re-correr `setup_tenant.sh` con su `.env`.

### 🔴 Ticket sale sin QR
**Causa**: backend desactualizado (sin el fix `server.py:3417`).
**Fix**: en el agente del cliente correr:
```bash
git fetch origin
git reset --hard origin/main
sudo supervisorctl restart backend frontend
```

### 🔴 Conexión Multiprod falla
**Causa probable**: URL incorrecta o token expirado.
**Fix**: verificar URL con Multiprod. Probar manualmente:
```bash
curl -X POST "MULTIPROD_URL_AQUI" -d "test=1"
```
Si responde 200 con JSON, está vivo.

### 🔴 "Solo admin puede configurar el proveedor e-CF" (HTTP 403)
**Causa**: el usuario que corre el script no tiene `role="admin"` exacto.
**Fix**: usar el PIN del admin maestro (`11338585` para tus tenants).

### 🔴 Cliente dice "los reportes 606/607 no aparecen en mi cuenta DGII"
**Verifica**: que el QR del ticket diga `ecf.dgii.gov.do/ecf/` (sin "test"). Si dice `/testecf/`, todavía está en sandbox.
**Fix**: correr `production_switch.sh`.

---

## Códigos Provincia/Municipio (los más comunes)

| Provincia | Código | Municipio principal | Código municipio |
|---|---|---|---|
| Distrito Nacional | `010000` | Santo Domingo de Guzmán | `010101` |
| Santiago | `250000` | Santiago de los Caballeros | `250101` |
| Santo Domingo | `320000` | Santo Domingo Este | `320101` |
| Santo Domingo (Norte) | `320000` | Santo Domingo Norte | `320401` |
| La Vega | `130000` | Concepción de La Vega | `130101` |
| San Cristóbal | `210000` | San Cristóbal | `210101` |
| La Romana | `120000` | La Romana | `120101` |
| La Altagracia (Higüey) | `110000` | Higüey | `110101` |
| Puerto Plata | `180000` | San Felipe de Puerto Plata | `180101` |
| San Pedro de Macorís | `230000` | San Pedro de Macorís | `230101` |
| Espaillat (Moca) | `090000` | Moca | `090101` |
| Duarte (SFM) | `060000` | San Francisco de Macorís | `060101` |
| Hermanas Mirabal | `190000` | Salcedo | `190101` |
| Peravia (Baní) | `170000` | Baní | `170101` |
| Monte Plata | `290000` | Monte Plata | `290101` |
| Hato Mayor | `300000` | Hato Mayor del Rey | `300101` |

> Lista completa en `/app/frontend/src/data/dgii_territories.js`

---

## Lungomare (referencia)

Si necesitas comparar contra una instalación funcionando:

| Campo | Valor |
|---|---|
| URL | `https://lungomare.vexlyapp.com` |
| RNC | `1-01-52417-2` (`101524172` clean) |
| Razón Social | `EMPRESA DE ENTRETENIMIENTOS ELIAS SRL` |
| Nombre Comercial | `Lungomare Bar & Lounge` |
| Dirección | `Av. George Washington 365, Santo Domingo` |
| Provincia | `010000` Distrito Nacional |
| Municipio | `010101` Santo Domingo de Guzmán |
| Email | `Ramoabastec@gmail.com` |
| Teléfono | `809-221-7713` |
| Multiprod sandbox | `https://portalmultiprod.com/api/testecf/enviar/a0152849fbf760e2de60c6274797c93e` |
| Secuencias DGII activas | E31 (1-100), E32 (1-10000), E34 (1-4000), E45 (1-30) |
| Vencimientos sandbox | E31/E45: `2028-12-31`, E32/E34: sin vencer |
| Vencimientos producción (cuando pasen) | E31/E45: `2027-12-31`, E32/E34: sin vencer |

---

## 🩺 Widget Salud del Sistema

En la UI: **Configuración → Salud** (solo Super Admin).

Te muestra en tiempo real:
- 🟢 MongoDB (latencia ms)
- 🟢 Print Agent (último heartbeat)
- 🟢 e-CF (último NCF emitido)
- 🟢 Órdenes activas / sin facturar
- 🟢 Errores recientes (24h)
- 🟢 Build version

Útil para monitorear remotamente al cliente sin SSH.

---

## ✅ Checklist de instalación

Antes de declarar al cliente "listo":

- [ ] Login admin funciona
- [ ] Datos del negocio aparecen en ticket (NO "ALONZO CIGAR" ni placeholder)
- [ ] Cobro Consumo emite e-CF E32 con QR
- [ ] QR del ticket es escaneable y abre verificación DGII
- [ ] Estado en DGII testbed: "Aceptado"
- [ ] Cobro Crédito Fiscal con cliente RNC emite E31 con QR
- [ ] Razón Social del comprador aparece en verificación DGII
- [ ] Print Agent imprime tickets físicos sin errores
- [ ] Widget Salud no muestra alertas rojas

---

## 📞 Si algo falla durante la instalación

1. Revisa el Widget Salud del Sistema (Configuración → Salud)
2. Revisa logs: `GET /api/ecf/logs?limit=10` con tu token
3. Captura el error y el `result.motivo`
4. Si es bloqueante, fuerza Contingencia Manual en el POS para no detener el negocio

---

**Versión del documento**: 2026-04-25
**Última actualización**: después del exitoso e-CF E310000000004 verificado en DGII
