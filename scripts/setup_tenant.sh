#!/bin/bash
# ════════════════════════════════════════════════════════════════
# VexlyPOS — Setup Tenant (cliente nuevo)
# Configura datos fiscales + endpoint Multiprod en cualquier tenant
# ════════════════════════════════════════════════════════════════
#
# USO 1: Con archivo de configuración (recomendado)
#   ./setup_tenant.sh --config clientes/lungomare.env
#
# USO 2: Con flags CLI
#   ./setup_tenant.sh \
#     --tenant https://lungomare.vexlyapp.com \
#     --pin 11338585 \
#     --rnc "1-01-52417-2" \
#     --razon-social "EMPRESA DE ENTRETENIMIENTOS ELIAS SRL" \
#     --nombre-comercial "Lungomare Bar & Lounge" \
#     --direccion "Av. George Washington 365, Santo Domingo" \
#     --email "Ramoabastec@gmail.com" \
#     --telefono "809-221-7713" \
#     --provincia "010000" \
#     --municipio "010101" \
#     --multiprod-url "https://portalmultiprod.com/api/testecf/enviar/XXX" \
#     [--multiprod-token "TOKEN_OPCIONAL"]
#     [--no-test]    # Saltar prueba de conexión
#     [--dry-run]    # No guarda, solo muestra lo que haría
#
# ARCHIVO .env EJEMPLO:
#   TENANT_URL=https://lungomare.vexlyapp.com
#   ADMIN_PIN=11338585
#   RNC=1-01-52417-2
#   RAZON_SOCIAL="EMPRESA DE ENTRETENIMIENTOS ELIAS SRL"
#   NOMBRE_COMERCIAL="Lungomare Bar & Lounge"
#   DIRECCION="Av. George Washington 365, Santo Domingo"
#   EMAIL="Ramoabastec@gmail.com"
#   TELEFONO="809-221-7713"
#   PROVINCIA=010000
#   MUNICIPIO=010101
#   MULTIPROD_ENDPOINT=https://portalmultiprod.com/api/testecf/enviar/a0152849fbf...
#   MULTIPROD_TOKEN=  # opcional, vacío si va embebido en la URL
# ════════════════════════════════════════════════════════════════

set -e

# ── Defaults ─────────────────────────────────────────────────────
TENANT_URL=""
ADMIN_PIN=""
RNC=""
RAZON_SOCIAL=""
NOMBRE_COMERCIAL=""
DIRECCION=""
EMAIL=""
TELEFONO=""
PROVINCIA=""
MUNICIPIO=""
MULTIPROD_ENDPOINT=""
MULTIPROD_TOKEN=""
CONFIG_FILE=""
SKIP_TEST=false
DRY_RUN=false

# ── Colores ──────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
info() { echo -e "${BLUE}→${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
hdr()  { echo -e "\n${BOLD}$1${NC}"; }

# ── Parse flags ──────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --config)           CONFIG_FILE="$2"; shift 2 ;;
    --tenant)           TENANT_URL="$2"; shift 2 ;;
    --pin)              ADMIN_PIN="$2"; shift 2 ;;
    --rnc)              RNC="$2"; shift 2 ;;
    --razon-social)     RAZON_SOCIAL="$2"; shift 2 ;;
    --nombre-comercial) NOMBRE_COMERCIAL="$2"; shift 2 ;;
    --direccion)        DIRECCION="$2"; shift 2 ;;
    --email)            EMAIL="$2"; shift 2 ;;
    --telefono)         TELEFONO="$2"; shift 2 ;;
    --provincia)        PROVINCIA="$2"; shift 2 ;;
    --municipio)        MUNICIPIO="$2"; shift 2 ;;
    --multiprod-url)    MULTIPROD_ENDPOINT="$2"; shift 2 ;;
    --multiprod-token)  MULTIPROD_TOKEN="$2"; shift 2 ;;
    --no-test)          SKIP_TEST=true; shift ;;
    --dry-run)          DRY_RUN=true; shift ;;
    -h|--help)
      grep -E '^#' "$0" | head -45 | sed 's/^# \?//'
      exit 0 ;;
    *) fail "Flag desconocido: $1 (usa --help)" ;;
  esac
done

# ── Cargar config file si se pasó ────────────────────────────────
if [ -n "$CONFIG_FILE" ]; then
  if [ ! -f "$CONFIG_FILE" ]; then
    fail "Config file no encontrado: $CONFIG_FILE"
  fi
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  ok "Config cargada desde: $CONFIG_FILE"
fi

# ── Validar campos obligatorios ──────────────────────────────────
missing=()
[ -z "$TENANT_URL" ]         && missing+=("TENANT_URL/--tenant")
[ -z "$ADMIN_PIN" ]          && missing+=("ADMIN_PIN/--pin")
[ -z "$RNC" ]                && missing+=("RNC/--rnc")
[ -z "$RAZON_SOCIAL" ]       && missing+=("RAZON_SOCIAL/--razon-social")
[ -z "$DIRECCION" ]          && missing+=("DIRECCION/--direccion")
[ -z "$PROVINCIA" ]          && missing+=("PROVINCIA/--provincia")
[ -z "$MUNICIPIO" ]          && missing+=("MUNICIPIO/--municipio")
[ -z "$MULTIPROD_ENDPOINT" ] && missing+=("MULTIPROD_ENDPOINT/--multiprod-url")

if [ ${#missing[@]} -gt 0 ]; then
  echo -e "${RED}✗ Faltan campos obligatorios:${NC}"
  for m in "${missing[@]}"; do echo "   - $m"; done
  exit 1
fi

# Defaults opcionales
[ -z "$NOMBRE_COMERCIAL" ] && NOMBRE_COMERCIAL="$RAZON_SOCIAL"

# Validar formato Provincia/Municipio (6 dígitos)
if [[ ! "$PROVINCIA" =~ ^[0-9]{6}$ ]]; then
  warn "Provincia '$PROVINCIA' no tiene 6 dígitos, auto-rellenando..."
  PROVINCIA=$(printf "%-6s" "$PROVINCIA" | tr ' ' '0' | cut -c1-6)
fi
if [[ ! "$MUNICIPIO" =~ ^[0-9]{6}$ ]]; then
  warn "Municipio '$MUNICIPIO' no tiene 6 dígitos, auto-rellenando..."
  MUNICIPIO=$(printf "%-6s" "$MUNICIPIO" | tr ' ' '0' | cut -c1-6)
fi

# ── Resumen antes de ejecutar ────────────────────────────────────
hdr "════════════════════════════════════════════════════════════"
echo -e "${BOLD}  VEXLYPOS — SETUP TENANT${NC}"
hdr "════════════════════════════════════════════════════════════"
cat <<EOF

  Tenant:            $TENANT_URL
  RNC:               $RNC
  Razón Social:      $RAZON_SOCIAL
  Nombre Comercial:  $NOMBRE_COMERCIAL
  Dirección:         $DIRECCION
  Email:             ${EMAIL:-(no especificado)}
  Teléfono:          ${TELEFONO:-(no especificado)}
  Provincia:         $PROVINCIA
  Municipio:         $MUNICIPIO
  Multiprod URL:     ${MULTIPROD_ENDPOINT:0:60}...
  Multiprod Token:   ${MULTIPROD_TOKEN:+[PROVISTO]}
  Skip test:         $SKIP_TEST
  Dry run:           $DRY_RUN
EOF

if $DRY_RUN; then
  warn "\nDRY-RUN activado — no se guardó nada. Ejecuta sin --dry-run para aplicar."
  exit 0
fi

# ── 1. LOGIN ─────────────────────────────────────────────────────
hdr "PASO 1 — Login admin"
LOGIN_RESPONSE=$(curl -s --max-time 15 -X POST "$TENANT_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"$ADMIN_PIN\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "
import sys, json
try: d = json.load(sys.stdin); print(d.get('token') or d.get('access_token') or '')
except: pass
" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  fail "Login falló. Response: $LOGIN_RESPONSE"
fi
ok "Login OK"

USER_INFO=$(echo "$LOGIN_RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin); u = d.get('user', {})
    print(f\"role={u.get('role')}, name={u.get('name')}, is_super_admin={u.get('is_super_admin')}\")
except: print('(user info no parseable)')
" 2>/dev/null)
ok "User: $USER_INFO"

if ! echo "$USER_INFO" | grep -q "role=admin"; then
  warn "El usuario NO tiene role=admin — algunas operaciones pueden fallar"
fi

# ── 2. SYSTEM CONFIG ─────────────────────────────────────────────
hdr "PASO 2 — Datos fiscales del emisor"

SYSTEM_CONFIG=$(python3 <<PYEOF
import json
print(json.dumps({
    "ticket_rnc": "$RNC",
    "rnc": "$RNC",
    "ticket_business_name": "$NOMBRE_COMERCIAL",
    "ticket_legal_name": "$RAZON_SOCIAL",
    "ticket_razon_social": "$RAZON_SOCIAL",
    "fiscal_address": "$DIRECCION",
    "ticket_address_street": "$DIRECCION",
    "ticket_email": "$EMAIL",
    "ticket_phone": "$TELEFONO",
    "province": "$PROVINCIA",
    "municipality": "$MUNICIPIO",
    "ecf_enabled": True,
    "ecf_provider": "multiprod",
}))
PYEOF
)

RESP=$(curl -s --max-time 15 -X PUT "$TENANT_URL/api/system/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$SYSTEM_CONFIG")

if echo "$RESP" | grep -q '"ok":true'; then
  ok "system_config actualizado"
else
  fail "Error al guardar system_config: $RESP"
fi

# Verificar persistencia
VERIFY=$(curl -s --max-time 15 "$TENANT_URL/api/system/config" -H "Authorization: Bearer $TOKEN")
echo "$VERIFY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
checks = [
    ('RNC', d.get('ticket_rnc'), '$RNC'),
    ('Razón Social', d.get('ticket_razon_social'), '$RAZON_SOCIAL'),
    ('Dirección', d.get('fiscal_address'), '$DIRECCION'),
    ('Provincia', d.get('province'), '$PROVINCIA'),
    ('Municipio', d.get('municipality'), '$MUNICIPIO'),
]
for label, got, expected in checks:
    match = '✓' if got == expected else '✗'
    print(f'   {match} {label}: {got}')
"

# ── 3. ECF PROVIDER CONFIG ───────────────────────────────────────
hdr "PASO 3 — Endpoint Multiprod"

PROVIDER_BODY="{\"provider\":\"multiprod\",\"multiprod_endpoint\":\"$MULTIPROD_ENDPOINT\""
if [ -n "$MULTIPROD_TOKEN" ]; then
  PROVIDER_BODY="$PROVIDER_BODY,\"multiprod_token\":\"$MULTIPROD_TOKEN\""
fi
PROVIDER_BODY="$PROVIDER_BODY}"

RESP=$(curl -s --max-time 15 -X PUT "$TENANT_URL/api/ecf/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PROVIDER_BODY")

if echo "$RESP" | grep -q '"ok":true'; then
  ok "ecf_provider_config actualizado"
else
  fail "Error al guardar Multiprod: $RESP"
fi

VERIFY=$(curl -s --max-time 15 "$TENANT_URL/api/ecf/config" -H "Authorization: Bearer $TOKEN")
echo "$VERIFY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'   ✓ Provider activo: {d.get(\"provider\")}')
print(f'   ✓ Endpoint guardado: {d.get(\"has_multiprod_endpoint\")}')
if d.get('has_multiprod_token'): print(f'   ✓ Token guardado: True')
"

# ── 4. TEST MULTIPROD (opcional) ─────────────────────────────────
if ! $SKIP_TEST; then
  hdr "PASO 4 — Probar conexión real Multiprod"
  TEST_RESP=$(curl -s --max-time 30 -X POST "$TENANT_URL/api/ecf/test-multiprod" \
    -H "Authorization: Bearer $TOKEN")
  echo "$TEST_RESP" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(f'   ok: {d.get(\"ok\")}')
    print(f'   estado: {d.get(\"estado\")}')
    if d.get('motivo'): print(f'   motivo: {d.get(\"motivo\")}')
    if d.get('encf'): print(f'   eNCF prueba: {d.get(\"encf\")}')
    if d.get('qr'): print(f'   QR DGII: {d.get(\"qr\")[:90]}...')
except Exception as e:
    print(f'   Response: {sys.stdin.read()[:300]}')
" 2>/dev/null || echo "   Response: $TEST_RESP"
else
  warn "Test de conexión saltado (--no-test)"
fi

# ── 5. RESUMEN ───────────────────────────────────────────────────
hdr "════════════════════════════════════════════════════════════"
ok "Tenant configurado: $TENANT_URL"
echo ""
echo "  Siguientes pasos manuales en UI:"
echo "  1. Cargar secuencia NCF (Configuración → Sistema → Secuencia NCF)"
echo "     - Tipo e-CF (E31/E32/E34/E44/E45)"
echo "     - Rango NCF asignado por DGII"
echo "     - Fecha de vencimiento (YYYY-MM-DD)"
echo "  2. Realizar primer cobro de prueba"
echo "  3. Verificar que el e-CF sale 'Aceptado' en el ticket"
echo ""
echo "  Cuando pase a producción real (no sandbox), reemplaza MULTIPROD_ENDPOINT"
echo "  en el .env y re-ejecuta este script."
echo ""
