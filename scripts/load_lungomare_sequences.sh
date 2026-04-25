#!/bin/bash
# ════════════════════════════════════════════════════════════════
# Cargar las 4 secuencias NCF oficiales aprobadas por DGII
# para Lungomare (RNC 101524172)
#
# Si ya existen secuencias previas, las ACTUALIZA con el rango oficial.
# ════════════════════════════════════════════════════════════════

TENANT_URL="https://lungomare.vexlyapp.com"
ADMIN_PIN="11338585"

G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; B='\033[0;34m'; BD='\033[1m'; N='\033[0m'
ok()   { echo -e "${G}✓${N} $1"; }
fail() { echo -e "${R}✗${N} $1"; }
info() { echo -e "${B}→${N} $1"; }
warn() { echo -e "${Y}⚠${N} $1"; }
hdr()  { echo -e "\n${BD}$1${N}"; }

# ── 1. Login ─────────────────────────────────────────────────────
info "Login..."
TOKEN=$(curl -s -X POST "$TENANT_URL/api/auth/login" \
  -H "Content-Type: application/json" -d "{\"pin\":\"$ADMIN_PIN\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
[ -z "$TOKEN" ] && { fail "Login falló"; exit 1; }
ok "Token obtenido"

# ── 2. Listar secuencias actuales ───────────────────────────────
hdr "Secuencias actuales en Lungomare"
curl -s "$TENANT_URL/api/ncf/sequences" -H "Authorization: Bearer $TOKEN" > /tmp/_seq_current.json
python3 <<'PYEOF'
import json
with open('/tmp/_seq_current.json') as f:
    docs = json.load(f)
if not isinstance(docs, list):
    print(f"   Error parseando: {docs}")
    raise SystemExit(1)
print(f"   Total: {len(docs)} secuencias")
for s in docs:
    t = s.get('ncf_type_code') or s.get('ncf_type_id')
    cur = s.get('current_number')
    end = s.get('end_number') or s.get('range_end')
    venc = s.get('valid_until') or s.get('expiration_date') or 'N/A'
    print(f"   • {t}: id={s.get('id')[:8]}... rango={cur}-{end} vence={venc} active={s.get('is_active')}")

# Save mapping {ncf_type: id} for later UPDATE
mapping = {}
for s in docs:
    t = s.get('ncf_type_code') or s.get('ncf_type_id')
    if t and s.get('id'):
        mapping[t] = s.get('id')
with open('/tmp/_seq_mapping.json', 'w') as f:
    json.dump(mapping, f)
PYEOF

# ── 3. Actualizar (o crear) cada secuencia oficial ──────────────
hdr "Actualizando secuencias con rangos oficiales DGII"

upsert_seq() {
  local TYPE=$1
  local START=$2
  local END=$3
  local EXPIRY=$4
  local DESC=$5

  # Buscar id existente
  EXISTING_ID=$(python3 -c "
import json
m = json.load(open('/tmp/_seq_mapping.json'))
print(m.get('$TYPE', ''))
")

  if [ -n "$EXISTING_ID" ]; then
    # PUT — actualizar
    BODY="{
      \"current_number\": $START,
      \"range_end\": $END,
      \"expiration_date\": \"$EXPIRY\",
      \"is_active\": true,
      \"notes\": \"$DESC\"
    }"
    RESP=$(curl -s -X PUT "$TENANT_URL/api/ncf/sequences/$EXISTING_ID" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$BODY")
    if echo "$RESP" | grep -q '"id"\|"ok"\|"updated"'; then
      ok "$TYPE actualizada: $START-$END (vence $EXPIRY)"
    else
      fail "$TYPE error PUT: $RESP"
    fi
  else
    # POST — crear
    BODY="{
      \"ncf_type_code\": \"$TYPE\",
      \"serie\": \"E\",
      \"prefix\": \"$TYPE\",
      \"current_number\": $START,
      \"range_start\": $START,
      \"range_end\": $END,
      \"expiration_date\": \"$EXPIRY\",
      \"is_active\": true,
      \"notes\": \"$DESC\"
    }"
    RESP=$(curl -s -X POST "$TENANT_URL/api/ncf/sequences" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$BODY")
    if echo "$RESP" | grep -q '"id"'; then
      ok "$TYPE creada: $START-$END (vence $EXPIRY)"
    else
      fail "$TYPE error POST: $RESP"
    fi
  fi
}

# E32 = 10000 sin vencimiento real (placeholder 2099-12-31)
upsert_seq "E32" 1 10000 "2099-12-31" "Factura Consumo Electrónica DGII Aprobada Aut 6005157726"
# E31 = 100, vence 2027-12-31
upsert_seq "E31" 1 100 "2027-12-31" "Factura Crédito Fiscal Electrónico DGII Aprobada Aut 6005157483"
# E34 = 4000 sin vencimiento real
upsert_seq "E34" 1 4000 "2099-12-31" "Nota de Crédito Electrónica DGII Aprobada Aut 6005157605"
# E45 = 30, vence 2027-12-31
upsert_seq "E45" 1 30 "2027-12-31" "Gubernamental Electrónico DGII Aprobada Aut 6005157539"

# ── 4. Verificar ─────────────────────────────────────────────────
hdr "Verificación final"
curl -s "$TENANT_URL/api/ncf/sequences" -H "Authorization: Bearer $TOKEN" > /tmp/_seq_final.json
python3 <<'PYEOF'
import json
docs = json.load(open('/tmp/_seq_final.json'))
if not isinstance(docs, list):
    print(f"   Error: {docs}")
    raise SystemExit(1)
print(f"   Total secuencias: {len(docs)}")
for s in sorted(docs, key=lambda x: x.get('ncf_type_code') or x.get('ncf_type_id') or ''):
    t = s.get('ncf_type_code') or s.get('ncf_type_id')
    cur = s.get('current_number')
    end = s.get('end_number') or s.get('range_end')
    venc = s.get('valid_until') or s.get('expiration_date') or 'N/A'
    rem = s.get('remaining', '?')
    active = s.get('is_active')
    star = '✓' if active else '✗'
    print(f"   {star} {t}: {cur}-{end} ({rem} disponibles), vence {venc}")
PYEOF

hdr "════════════════════════════════════════════════════════════"
ok "Secuencias DGII oficiales cargadas en Lungomare"
echo ""
echo "  Próximo paso:"
echo "  • Correr ./test_ecf_lungomare.sh — debe salir 'Aceptado' código 1"
echo "  • O en la UI → Crear orden → Cobrar → emitir e-CF"
echo ""
