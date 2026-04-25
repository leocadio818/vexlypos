# 📋 Mensajes Listos para Copiar/Pegar a Agentes de Clientes

> Copia el bloque correcto según el caso, **reemplaza solo los datos del cliente** (lo que está entre `<<< >>>`), y pégalo en el chat del agente del cliente.

---

## 🎯 ESCENARIO A — Cliente que YA TIENE proyecto Emergent + dominio + deploy

> Caso típico: cliente existente que viste hoy. Tiene `https://CLIENTE.vexlyapp.com` activo. Solo falta configurar datos fiscales + Multiprod.

### Mensaje para el agente del cliente:

```
Hola, necesito que configures este tenant para emisión de e-CF DGII.

PASO 1 — Asegúrate que el código del repo esté actualizado:

git fetch origin
git reset --hard origin/main
sudo supervisorctl restart backend frontend
sleep 30


PASO 2 — Corre este comando exacto (es UN SOLO comando, todo junto):

/app/scripts/setup_tenant.sh \
  --tenant https://<<<SUBDOMINIO>>>.vexlyapp.com \
  --pin 11338585 \
  --rnc "<<<RNC_CON_GUIONES>>>" \
  --razon-social "<<<RAZON_SOCIAL_LEGAL_SRL>>>" \
  --nombre-comercial "<<<NOMBRE_COMERCIAL>>>" \
  --direccion "<<<DIRECCION_FISCAL_COMPLETA>>>" \
  --email "<<<EMAIL>>>" \
  --telefono "<<<TELEFONO>>>" \
  --provincia <<<CODIGO_PROVINCIA_6_DIGITOS>>> \
  --municipio <<<CODIGO_MUNICIPIO_6_DIGITOS>>> \
  --multiprod-url "<<<URL_SANDBOX_DE_MULTIPROD>>>"


PASO 3 — Cuando termine, dime el resultado completo del comando para verificar.
```

### Ejemplo real con Lungomare lleno:

```
PASO 2:
/app/scripts/setup_tenant.sh \
  --tenant https://lungomare.vexlyapp.com \
  --pin 11338585 \
  --rnc "1-01-52417-2" \
  --razon-social "EMPRESA DE ENTRETENIMIENTOS ELIAS SRL" \
  --nombre-comercial "Lungomare Bar & Lounge" \
  --direccion "Av. George Washington 365, Santo Domingo" \
  --email "Ramoabastec@gmail.com" \
  --telefono "809-221-7713" \
  --provincia 010000 \
  --municipio 010101 \
  --multiprod-url "https://portalmultiprod.com/api/testecf/enviar/a0152849fbf760e2de60c6274797c93e"
```

### Después del setup, cargar secuencias DGII:

```
PASO 4 — Carga las secuencias NCF según la carta DGII del cliente.

Crea este archivo /tmp/load_seqs.sh con este contenido y córrelo:

#!/bin/bash
TENANT="https://<<<SUBDOMINIO>>>.vexlyapp.com"
TOKEN=$(curl -s -X POST "$TENANT/api/auth/login" -H "Content-Type: application/json" -d '{"pin":"11338585"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

# Por cada tipo aprobado por DGII
# Ajusta los rangos según la carta DGII del cliente

# E32 Consumo (sin vencimiento real, usar 2099-12-31)
curl -s -X POST "$TENANT/api/ncf/sequences" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "ncf_type_code": "E32",
  "serie": "E", "prefix": "E32",
  "current_number": 1,
  "range_start": 1, "range_end": <<<E32_HASTA>>>,
  "expiration_date": "2099-12-31",
  "is_active": true
}'

# E31 Crédito Fiscal (vence según carta DGII)
curl -s -X POST "$TENANT/api/ncf/sequences" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "ncf_type_code": "E31",
  "serie": "E", "prefix": "E31",
  "current_number": 1,
  "range_start": 1, "range_end": <<<E31_HASTA>>>,
  "expiration_date": "<<<FECHA_VENC_E31>>>",
  "is_active": true
}'

# Repetir para E34, E45 según corresponda
```

---

## 🎯 ESCENARIO B — Cliente NUEVECITO (no tiene proyecto Emergent aún)

> Caso típico: cliente nuevo desde cero. Aún no existe `CLIENTE.vexlyapp.com`.

### Pasos para TI primero (en Emergent dashboard, NO en chat del agente):

```
1. Ir a Emergent → New Project
2. Fork del repo VexlyPOS
3. Asignar dominio: CLIENTE.vexlyapp.com
4. Hacer deploy inicial
5. Esperar que app esté UP (verificar https://CLIENTE.vexlyapp.com/api/health responde {"ok":true})
6. Login admin (PIN 11338585) — verificar que entra a la UI
```

### Después, en el chat del agente recién creado:

```
Hola, este es un tenant nuevo. Configúralo así:

PASO 1 — Asegúrate del código:
git fetch origin
git reset --hard origin/main
sudo supervisorctl restart backend frontend
sleep 30

PASO 2 — Configurar datos fiscales y Multiprod:
[mismo comando setup_tenant.sh del Escenario A con los datos del cliente]

PASO 3 — Cargar secuencias NCF según carta DGII:
[mismo procedimiento del Escenario A]
```

---

## 🎯 ESCENARIO C — Pasar cualquier cliente de SANDBOX a PRODUCCIÓN real

> Cuando Multiprod te dé la URL productiva (la sandbox sin "test" en el path).

### Mensaje para el agente del cliente:

```
Hola, vamos a pasar este tenant a PRODUCCIÓN REAL DGII.

ANTES DE EJECUTAR: confirma que el cliente NO está facturando ahora mismo.

Corre este comando exacto:

/app/scripts/production_switch.sh \
  --config /app/scripts/clientes/<<<CLIENTE>>>.env \
  --prod-url "<<<URL_PRODUCCION_SIN_LA_PALABRA_TEST>>>"

⚠️ IMPORTANTE: Si el archivo /app/scripts/clientes/<<<CLIENTE>>>.env NO existe en este pod, primero créalo con:

cat > /app/scripts/clientes/<<<CLIENTE>>>.env <<EOF
TENANT_URL=https://<<<SUBDOMINIO>>>.vexlyapp.com
ADMIN_PIN=11338585
RNC="<<<RNC>>>"
RAZON_SOCIAL="<<<RAZON_SOCIAL>>>"
NOMBRE_COMERCIAL="<<<NOMBRE_COMERCIAL>>>"
DIRECCION="<<<DIRECCION>>>"
EMAIL="<<<EMAIL>>>"
TELEFONO="<<<TELEFONO>>>"
PROVINCIA=<<<PROVINCIA>>>
MUNICIPIO=<<<MUNICIPIO>>>
MULTIPROD_ENDPOINT=<<<URL_SANDBOX_ACTUAL>>>
MULTIPROD_TOKEN=
EOF

Cuando el script te pida confirmación, escribe SI en mayúsculas y enter.

Después dime el resultado completo.
```

### Ejemplo real con Lungomare:

```
/app/scripts/production_switch.sh \
  --config /app/scripts/clientes/lungomare.env \
  --prod-url "https://portalmultiprod.com/api/ecf/enviar/a0152849fbf760e2de60c6274797c93e"
```

---

## 📋 Tabla rápida de códigos Provincia/Municipio (los más comunes)

| Provincia | Cód. Provincia | Municipio principal | Cód. Municipio |
|---|---|---|---|
| Distrito Nacional | `010000` | Santo Domingo de Guzmán | `010101` |
| Santiago | `250000` | Santiago de los Caballeros | `250101` |
| Santo Domingo | `320000` | Santo Domingo Este | `320101` |
| La Vega | `130000` | Concepción de La Vega | `130101` |
| San Cristóbal | `210000` | San Cristóbal | `210101` |
| La Romana | `120000` | La Romana | `120101` |
| La Altagracia (Higüey) | `110000` | Higüey | `110101` |
| Puerto Plata | `180000` | San Felipe Puerto Plata | `180101` |
| San Pedro de Macorís | `230000` | San Pedro de Macorís | `230101` |
| Espaillat (Moca) | `090000` | Moca | `090101` |
| Duarte (SFM) | `060000` | San Francisco de Macorís | `060101` |
| Peravia (Baní) | `170000` | Baní | `170101` |

---

## ✅ Checklist post-instalación (le pides al agente que verifique)

```
Después de configurar, verifica esto y dime el resultado:

1. curl -s "https://<<<SUBDOMINIO>>>.vexlyapp.com/api/health"
   → debe decir {"ok":true}

2. Login con PIN 11338585 → verifica que sale "name: Admin, role: admin"

3. /app/scripts/setup_tenant.sh termina con "Conexión: OK"

4. GET /api/ncf/sequences → muestra las secuencias activas

5. (Opcional) /app/scripts/test_ecf_lungomare.sh adaptado al cliente
   → debe responder estado: aceptado con QR DGII
```

---

## 🆘 Si algo falla

1. **HTTP 403 "Solo admin puede..."** → el PIN no es admin. Usar `11338585`.
2. **"Login falló"** → verificar URL del tenant. ¿Es correcto el subdominio?
3. **"DGII Rechazado: Fecha vencimiento inválida"** → cambiar `expiration_date` por la que la carta DGII dice exactamente.
4. **Ticket sin QR** → el repo no está actualizado. Volver a hacer `git fetch && reset --hard`.

---

**Versión**: 2026-04-25
