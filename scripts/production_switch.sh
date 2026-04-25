#!/bin/bash
# ════════════════════════════════════════════════════════════════
# VexlyPOS — Production Switch
# Convierte un tenant de SANDBOX → PRODUCCIÓN real DGII
# ════════════════════════════════════════════════════════════════
#
# Hace 3 cosas en orden:
#   1. Cambia el endpoint Multiprod (de /testecf/ a /ecf/)
#   2. Cambia E31 y E45 valid_until a fecha oficial DGII
#   3. Resetea contadores de TODAS las secuencias a 1
#      (DGII producción es ambiente separado, arranca limpio)
#
# Uso:
#   ./production_switch.sh --config clientes/CLIENTE.env --prod-url "URL_PRODUCCION"
#
# Ejemplo:
#   ./production_switch.sh \
#     --config /app/scripts/clientes/lungomare.env \
#     --prod-url "https://portalmultiprod.com/api/ecf/enviar/TOKEN_PRODUCCION"
#
# IMPORTANTE: el cliente NO debe estar facturando mientras corres este script.
# ════════════════════════════════════════════════════════════════

CONFIG_FILE=""
PROD_URL=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --config)   CONFIG_FILE="$2"; shift 2 ;;
    --prod-url) PROD_URL="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true; shift ;;
    *) echo "Flag desconocido: $1"; exit 1 ;;
  esac
done

G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; B='\033[0;34m'; BD='\033[1m'; N='\033[0m'
ok()   { echo -e "${G}✓${N} $1"; }
fail() { echo -e "${R}✗${N} $1"; exit 1; }
info() { echo -e "${B}→${N} $1"; }
warn() { echo -e "${Y}⚠${N} $1"; }
hdr()  { echo -e "\n${BD}$1${N}"; }

# Validaciones
if [ -z "$CONFIG_FILE" ] || [ -z "$PROD_URL" ]; then
  fail "Uso: ./production_switch.sh --config CLIENTE.env --prod-url URL_PRODUCCION"
fi
if [ ! -f "$CONFIG_FILE" ]; then
  fail "Config no encontrado: $CONFIG_FILE"
fi
# shellcheck disable=SC1090
source "$CONFIG_FILE"
if [ -z "$TENANT_URL" ] || [ -z "$ADMIN_PIN" ]; then
  fail "El config debe tener TENANT_URL y ADMIN_PIN"
fi
if [[ "$PROD_URL" == *"/testecf/"* ]]; then
  fail "URL de producción contiene '/testecf/'. ¿Estás seguro? Usa la URL sin 'test'."
fi
if [[ "$PROD_URL" != *"/ecf/"* ]]; then
  warn "URL no contiene '/ecf/'. Verifica que sea la productiva real."
fi

hdr "════════════════════════════════════════════════════════════"
echo -e "${BD}  PRODUCTION SWITCH — $TENANT_URL${N}"
hdr "════════════════════════════════════════════════════════════"
echo ""
echo "  ENDPOINT actual (sandbox):   $MULTIPROD_ENDPOINT"
echo "  ENDPOINT nuevo (producción): $PROD_URL"
echo ""
echo "  Cambios que se aplicarán:"
echo "    1. URL Multiprod → producción"
echo "    2. E31 y E45 valid_until → 2027-12-31 (fecha oficial DGII)"
echo "    3. Resetear contadores: E31=1, E32=1, E34=1, E45=1"
echo ""

if $DRY_RUN; then
  warn "DRY-RUN — no se aplicó nada."
  exit 0
fi

read -p "  ¿Confirmar y aplicar? (escribir 'SI' en mayúsculas): " CONFIRM
if [ "$CONFIRM" != "SI" ]; then
  fail "Cancelado"
fi

# ── Login ────────────────────────────────────────────────────────
info "Login admin..."
TOKEN=$(curl -s -X POST "$TENANT_URL/api/auth/login" \
  -H "Content-Type: application/json" -d "{\"pin\":\"$ADMIN_PIN\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
[ -z "$TOKEN" ] && fail "Login falló"
ok "Token obtenido"

# ── Paso 1: Cambiar endpoint Multiprod ──────────────────────────
hdr "1. Cambiar endpoint Multiprod a producción"
RESP=$(curl -s -X PUT "$TENANT_URL/api/ecf/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"provider\":\"multiprod\",\"multiprod_endpoint\":\"$PROD_URL\"}")
if echo "$RESP" | grep -q '"ok":true'; then
  ok "Endpoint actualizado"
else
  fail "Error: $RESP"
fi

# ── Paso 2: Actualizar E31 y E45 valid_until ────────────────────
hdr "2. Cambiar E31 y E45 valid_until a 2027-12-31 (fecha oficial DGII)"
curl -s "$TENANT_URL/api/ncf/sequences" -H "Authorization: Bearer $TOKEN" > /tmp/_seqs.json

for TYPE in E31 E45; do
  SEQ_ID=$(python3 -c "
import json
d = json.load(open('/tmp/_seqs.json'))
for s in d:
    if (s.get('ncf_type_code') or s.get('ncf_type_id')) == '$TYPE':
        print(s.get('id')); break
")
  if [ -n "$SEQ_ID" ]; then
    RESP=$(curl -s -X PUT "$TENANT_URL/api/ncf/sequences/$SEQ_ID" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"expiration_date": "2027-12-31"}')
    if echo "$RESP" | grep -q '2027-12-31'; then
      ok "$TYPE → vence 2027-12-31"
    else
      fail "$TYPE: $RESP"
    fi
  else
    warn "$TYPE no encontrada"
  fi
done

# ── Paso 3: Resetear contadores a 1 ─────────────────────────────
hdr "3. Resetear contadores a 1 (producción DGII arranca limpia)"

for TYPE in E31 E32 E34 E45; do
  SEQ_ID=$(python3 -c "
import json
d = json.load(open('/tmp/_seqs.json'))
for s in d:
    if (s.get('ncf_type_code') or s.get('ncf_type_id')) == '$TYPE':
        print(s.get('id')); break
")
  if [ -n "$SEQ_ID" ]; then
    RESP=$(curl -s -X PUT "$TENANT_URL/api/ncf/sequences/$SEQ_ID" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"current_number": 1}')
    if echo "$RESP" | grep -q '"current_number":1'; then
      ok "$TYPE current_number → 1"
    else
      warn "$TYPE: $RESP"
    fi
  fi
done

# ── Verificación final ──────────────────────────────────────────
hdr "Verificación final"
curl -s "$TENANT_URL/api/ncf/sequences" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
docs = json.load(sys.stdin)
for s in sorted(docs, key=lambda x: x.get('ncf_type_code') or x.get('ncf_type_id') or ''):
    if not s.get('is_active'): continue
    t = s.get('ncf_type_code') or s.get('ncf_type_id')
    print(f'   {t}: current={s.get(\"current_number\")}, vence={s.get(\"valid_until\")}')
"

curl -s "$TENANT_URL/api/ecf/config" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'   Provider: {d.get(\"provider\")}')
print(f'   Endpoint: {d.get(\"multiprod_endpoint\")}')
print(f'   Endpoint configurado: {d.get(\"has_multiprod_endpoint\")}')
"

hdr "════════════════════════════════════════════════════════════"
ok "Cliente convertido a PRODUCCIÓN real"
echo ""
warn "IMPORTANTE: El próximo cobro irá a DGII REAL y generará obligación fiscal."
echo ""
echo "  Antes de facturar al primer cliente real:"
echo "  1. Hacer un cobro de prueba INTERNO con el RNC del propio negocio"
echo "  2. Verificar que el QR ahora dice ecf.dgii.gov.do/ecf/ (sin 'test')"
echo "  3. Confirmar que se ve en el portal DGII oficial del contribuyente"
echo ""
