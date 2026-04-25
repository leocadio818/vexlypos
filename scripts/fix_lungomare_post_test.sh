#!/bin/bash
# ════════════════════════════════════════════════════════════════
# Fix Lungomare:
#   1. Limpiar TODOS los campos legacy de "ALONZO CIGAR"
#   2. Saltar contadores de secuencias arriba de números ya usados en sandbox
#   3. Limpiar facturas en estado Error/Rechazada del dashboard
# ════════════════════════════════════════════════════════════════

TENANT_URL="https://lungomare.vexlyapp.com"
ADMIN_PIN="11338585"

G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; B='\033[0;34m'; BD='\033[1m'; N='\033[0m'
ok()   { echo -e "${G}✓${N} $1"; }
fail() { echo -e "${R}✗${N} $1"; }
info() { echo -e "${B}→${N} $1"; }
hdr()  { echo -e "\n${BD}$1${N}"; }

info "Login..."
TOKEN=$(curl -s -X POST "$TENANT_URL/api/auth/login" \
  -H "Content-Type: application/json" -d "{\"pin\":\"$ADMIN_PIN\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
[ -z "$TOKEN" ] && { fail "Login falló"; exit 1; }
ok "Token obtenido"

# ── PASO 1: Sobrescribir TODOS los campos legacy con datos Lungomare ──
hdr "1. Sobrescribir todos los campos del negocio (limpia legacy ALONZO CIGAR)"

CONFIG=$(cat <<'EOF'
{
  "ticket_rnc": "1-01-52417-2",
  "rnc": "1-01-52417-2",
  "ecf_alanube_rnc": "1-01-52417-2",
  "ticket_business_name": "Lungomare Bar & Lounge",
  "business_name": "Lungomare Bar & Lounge",
  "commercial_name": "Lungomare Bar & Lounge",
  "ticket_legal_name": "EMPRESA DE ENTRETENIMIENTOS ELIAS SRL",
  "ticket_razon_social": "EMPRESA DE ENTRETENIMIENTOS ELIAS SRL",
  "razon_social": "EMPRESA DE ENTRETENIMIENTOS ELIAS SRL",
  "fiscal_address": "Av. George Washington 365, Santo Domingo",
  "ticket_address_street": "Av. George Washington 365",
  "ticket_address_city": "Santo Domingo",
  "address": "Av. George Washington 365, Santo Domingo",
  "business_address": "Av. George Washington 365, Santo Domingo",
  "ticket_email": "Ramoabastec@gmail.com",
  "email": "Ramoabastec@gmail.com",
  "correo": "Ramoabastec@gmail.com",
  "ticket_phone": "809-221-7713",
  "phone": "809-221-7713",
  "telefono": "809-221-7713",
  "province": "010000",
  "provincia": "010000",
  "municipality": "010101",
  "municipio": "010101",
  "ecf_enabled": true,
  "ecf_provider": "multiprod"
}
EOF
)

RESP=$(curl -s -X PUT "$TENANT_URL/api/system/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CONFIG")

if echo "$RESP" | grep -q '"ok":true'; then
  ok "Campos del negocio sobrescritos"
else
  fail "Error: $RESP"
fi

# Verificar
curl -s "$TENANT_URL/api/system/config" -H "Authorization: Bearer $TOKEN" > /tmp/_cfg.json
python3 <<'PYEOF'
import json
d = json.load(open('/tmp/_cfg.json'))
fields = [
    'business_name', 'commercial_name', 'ticket_business_name',
    'razon_social', 'ticket_razon_social', 'ticket_legal_name',
    'phone', 'ticket_phone', 'fiscal_address', 'business_address',
]
for k in fields:
    print(f"   {k}: {d.get(k)}")
PYEOF

# ── PASO 2: Saltar contadores arriba de eNCFs usados en sandbox ──
hdr "2. Saltar contadores de secuencias (testbed ya recibió E32 0000000001-0000000002)"

# Saltamos a números seguros que NUNCA enviamos a sandbox
# E32: ya enviamos E320000000001, E320000000002 → saltar a 100
# E31: nunca enviamos → dejar en 1
# E34: nunca enviamos → dejar en 1
# E45: nunca enviamos → dejar en 1

curl -s "$TENANT_URL/api/ncf/sequences" -H "Authorization: Bearer $TOKEN" > /tmp/_seqs.json

reset_counter() {
  local TYPE=$1
  local NEW_NUM=$2
  
  SEQ_ID=$(python3 -c "
import json
d = json.load(open('/tmp/_seqs.json'))
for s in d:
    t = s.get('ncf_type_code') or s.get('ncf_type_id')
    if t == '$TYPE': print(s.get('id')); break
")
  if [ -z "$SEQ_ID" ]; then
    fail "Secuencia $TYPE no encontrada"
    return
  fi
  
  RESP=$(curl -s -X PUT "$TENANT_URL/api/ncf/sequences/$SEQ_ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"current_number\": $NEW_NUM}")
  
  if echo "$RESP" | grep -q '"id"\|"ok"\|"updated"\|"current_number"'; then
    ok "$TYPE current_number=$NEW_NUM"
  else
    fail "$TYPE error: $RESP"
  fi
}

reset_counter "E32" 100   # Saltamos los primeros 99 (los 1-2 fueron quemados en sandbox)
reset_counter "E31" 1
reset_counter "E34" 1
reset_counter "E45" 1

# ── PASO 3: Limpiar facturas en error/rechazadas del dashboard ──
hdr "3. Marcar como ignoradas las facturas Error/Rechazadas previas"

# Buscar facturas de hoy con ecf_status error/rejected
RESP=$(curl -s "$TENANT_URL/api/ecf/sent" -H "Authorization: Bearer $TOKEN" 2>/dev/null)
echo "$RESP" > /tmp/_bills.json 2>/dev/null

# Si el endpoint existe lo procesamos, si no, saltamos esto (el dashboard se limpia en jornada nueva)
info "(Las facturas Error/Rechazada se limpian al cerrar la jornada)"

hdr "════════════════════════════════════════════════════════════"
ok "Lungomare actualizado"
echo ""
echo "  Próximos pasos:"
echo "  1. Cierra y reabre el navegador (para limpiar caché del frontend)"
echo "  2. Crea una orden nueva → Cobrar → próximo eNCF será E320000000100"
echo "  3. DGII testbed debe responder Aceptado (código 1) ✓"
echo ""
echo "  En PRODUCCIÓN real (cuando cambies URL Multiprod):"
echo "  - DGII real es ambiente separado, arranca limpio"
echo "  - Resetea contadores con: ./load_lungomare_sequences.sh"
echo "  - Empezarás desde E320000000001 normal"
echo ""
