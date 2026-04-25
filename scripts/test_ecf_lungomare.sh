#!/bin/bash
# ════════════════════════════════════════════════════════════════
# VexlyPOS — Test E2E e-CF (sin afectar nada real)
# ════════════════════════════════════════════════════════════════
# Lo que hace:
#   1. Login admin
#   2. Lee config actual (RNC, Multiprod endpoint)
#   3. Carga una secuencia NCF de prueba (alta para no chocar con DGII real)
#   4. Ejecuta test-multiprod: genera XML real, valida XSD + Megaplus,
#      envía a Multiprod sandbox, captura QR DGII y trackId
#   5. Reporta resultado paso a paso
#
# IMPORTANTE: No crea órdenes ni facturas reales. Solo dispara el
# endpoint test-multiprod que emite un e-CF de prueba aislado.
#
# Uso:
#   ./test_ecf_lungomare.sh
# ════════════════════════════════════════════════════════════════

# NOTE: Sin `set -e` para que un fallo de una validación no aborte el script entero.
# Manejamos errores explícitamente con `|| fail`.

TENANT_URL="https://lungomare.vexlyapp.com"
ADMIN_PIN="11338585"

# Colores
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; B='\033[0;34m'; BD='\033[1m'; N='\033[0m'
ok()   { echo -e "${G}✓${N} $1"; }
fail() { echo -e "${R}✗${N} $1"; exit 1; }
info() { echo -e "${B}→${N} $1"; }
warn() { echo -e "${Y}⚠${N} $1"; }
hdr()  { echo -e "\n${BD}$1${N}"; }

hdr "════════════════════════════════════════════════════════════"
echo -e "${BD}  TEST E2E e-CF — Lungomare (sin afectar nada real)${N}"
hdr "════════════════════════════════════════════════════════════"

# ── 1. LOGIN ─────────────────────────────────────────────────────
hdr "1️⃣  Login admin"
LOGIN=$(curl -s -X POST "$TENANT_URL/api/auth/login" \
  -H "Content-Type: application/json" -d "{\"pin\":\"$ADMIN_PIN\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token') or d.get('access_token') or '')" 2>/dev/null)
[ -z "$TOKEN" ] && fail "Login falló: $LOGIN"
ok "Token obtenido (admin)"

# ── 2. VERIFICAR CONFIG ─────────────────────────────────────────
hdr "2️⃣  Verificar configuración previa"
SC=$(curl -s "$TENANT_URL/api/system/config" -H "Authorization: Bearer $TOKEN")
echo "$SC" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'   RNC: {d.get(\"ticket_rnc\")}')
print(f'   Razón Social: {d.get(\"ticket_razon_social\")}')
print(f'   Provincia: {d.get(\"province\")}, Municipio: {d.get(\"municipality\")}')
print(f'   e-CF habilitado: {d.get(\"ecf_enabled\")}')
ok = all([d.get('ticket_rnc'), d.get('ticket_razon_social'), d.get('province')])
import sys
sys.exit(0 if ok else 1)
" || fail "Configuración incompleta. Ejecuta primero setup_tenant.sh"

EPC=$(curl -s "$TENANT_URL/api/ecf/config" -H "Authorization: Bearer $TOKEN")
echo "$EPC" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'   Provider: {d.get(\"provider\")}')
print(f'   Endpoint Multiprod configurado: {d.get(\"has_multiprod_endpoint\")}')
" || fail "Multiprod no configurado"

# ── 3. CARGAR SECUENCIA NCF DE PRUEBA (alta) ────────────────────
hdr "3️⃣  Cargar secuencia NCF de prueba (alta, para no chocar con DGII real)"

# Probamos crear una secuencia E32 muy alta — si Supabase la rechaza por duplicado, la skipeamos
SEQ_BODY='{
  "ncf_type_code": "E32",
  "serie": "E",
  "prefix": "E32",
  "current_number": 90000001,
  "range_start": 90000001,
  "range_end": 90000100,
  "expiration_date": "2028-12-31",
  "is_active": true,
  "notes": "Secuencia de PRUEBA — números altos para sandbox Multiprod"
}'

SEQ_RESP=$(curl -s -X POST "$TENANT_URL/api/ncf/sequences" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$SEQ_BODY")

if echo "$SEQ_RESP" | grep -q '"id"'; then
  SEQ_ID=$(echo "$SEQ_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
  ok "Secuencia E32 creada: $SEQ_ID (range 90000001-90000100)"
elif echo "$SEQ_RESP" | grep -qi "ya existe\|already exists"; then
  warn "Ya existe una secuencia E32 activa (no se duplica)"
elif echo "$SEQ_RESP" | grep -qi "supabase no disponible"; then
  warn "Supabase no disponible — saltando creación de secuencia (test-multiprod usa NCF random igual)"
else
  warn "Respuesta inesperada al crear secuencia: $(echo $SEQ_RESP | head -c 200)"
fi

# Listar secuencias actuales
SEQ_LIST=$(curl -s "$TENANT_URL/api/ncf/sequences" -H "Authorization: Bearer $TOKEN")
echo "$SEQ_LIST" | python3 -c "
import sys, json
try:
    docs = json.load(sys.stdin)
    if not isinstance(docs, list): docs = []
    e32 = [s for s in docs if s.get('ncf_type_code') == 'E32' or s.get('ncf_type_id') == 'E32']
    print(f'   Secuencias E32 activas: {len(e32)}')
    for s in e32[:3]:
        print(f'     • {s.get(\"prefix\") or s.get(\"sequence_prefix\")}: {s.get(\"current_number\")}-{s.get(\"range_end\") or s.get(\"end_number\")}, vence={s.get(\"expiration_date\") or s.get(\"valid_until\")}')
except Exception as e:
    print(f'   (no se pudieron listar: {e})')
"

# ── 4. EJECUTAR TEST E2E REAL ────────────────────────────────────
hdr "4️⃣  Ejecutar test e-CF E2E (XML → XSD → Megaplus → Multiprod → DGII)"
info "Esto tarda 5-30 segundos (depende de respuesta de DGII sandbox)"

# Captura body + http status. Timeout 120s para cold-start del backend.
TEST_FILE=$(mktemp)
HTTP_CODE=$(curl -s --max-time 120 -o "$TEST_FILE" -w "%{http_code}" \
  -X POST "$TENANT_URL/api/ecf/test-multiprod" \
  -H "Authorization: Bearer $TOKEN")
TEST=$(cat "$TEST_FILE")
rm -f "$TEST_FILE"

echo "   HTTP: $HTTP_CODE"
echo "   Body length: ${#TEST}"

if [ -z "$TEST" ] || [ "$HTTP_CODE" != "200" ]; then
  warn "Respuesta vacía o HTTP no-200. Reintentando una vez (cold start)..."
  sleep 3
  TEST_FILE=$(mktemp)
  HTTP_CODE=$(curl -s --max-time 120 -o "$TEST_FILE" -w "%{http_code}" \
    -X POST "$TENANT_URL/api/ecf/test-multiprod" \
    -H "Authorization: Bearer $TOKEN")
  TEST=$(cat "$TEST_FILE")
  rm -f "$TEST_FILE"
  echo "   Retry HTTP: $HTTP_CODE  body length: ${#TEST}"
fi

if [ -z "$TEST" ]; then
  fail "Multiprod test no respondió. Verifica conectividad y endpoint."
fi

echo "$TEST" > /tmp/_ecf_test_resp.json
python3 <<'PYEOF'
import sys, json
with open('/tmp/_ecf_test_resp.json') as f:
    raw = f.read()
try:
    d = json.loads(raw)
except Exception as e:
    print(f"   ❌ No se pudo parsear JSON: {e}")
    print(f"   Body recibido (primeros 500): {raw[:500]}")
    sys.exit(1)

print("\n   ─── Resultado global ───")
print(f"   ok: {d.get('ok')}")
print(f"   mensaje: {d.get('message', '')[:200]}")

results = d.get('results', {}) or {}

# Step 0 — XSD local
s0 = results.get('step0_local_validation') or {}
print("\n   ─── Paso 0: Validación XSD local ───")
print(f"   ok: {s0.get('ok')}")
print(f"   msg: {s0.get('message', '')[:150]}")

# Step 1 — Megaplus validator
s1 = results.get('step1_validator') or {}
print("\n   ─── Paso 1: Validador Megaplus ───")
print(f"   ok: {s1.get('ok')}")
print(f"   msg: {(s1.get('message') or '')[:200]}")

# Step 2 — Multiprod sandbox
s2 = results.get('step2_multiprod') or {}
print("\n   ─── Paso 2: Multiprod sandbox + DGII ───")
print(f"   ok: {s2.get('ok')}")
print(f"   estado: {s2.get('estado')}")
print(f"   trackId: {s2.get('trackId')}")
print(f"   eNCF emitido: {s2.get('encf')}")
print(f"   código DGII: {s2.get('codigo')}")
if s2.get('motivo'): print(f"   motivo: {s2.get('motivo')}")
qr = s2.get('qr')
if qr:
    print(f"\n   ✅ QR DGII oficial:")
    print(f"   {qr}")
    print(f"\n   👉 Copia esa URL en un navegador para verificar el comprobante en DGII")

diag = (s2.get('diagnostics') or {})
if diag:
    print(f"\n   ─── Diagnóstico HTTP ───")
    print(f"   HTTP {diag.get('http_status')} en {diag.get('response_time_ms')}ms")
    print(f"   Content-Type: {diag.get('headers', {}).get('Content-Type')}")
PYEOF

hdr "════════════════════════════════════════════════════════════"
ok "Test completo. Si el Paso 2 muestra estado=aceptado y QR, todo funciona ✅"
echo ""
echo "  Ahora puedes:"
echo "  • Copiar la URL del QR en un navegador → ver el comprobante en DGII testbed"
echo "  • Ir a la UI de Lungomare → Crear orden → Cobrar → ver e-CF en el ticket"
echo ""
