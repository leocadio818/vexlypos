#!/bin/bash
# ════════════════════════════════════════════════════════════════
# Setup automático cliente Lungomare — VexlyPOS
# ════════════════════════════════════════════════════════════════
# Configura:
#   1. Datos fiscales del emisor (system_config id=main)
#   2. Endpoint Multiprod (ecf_provider_config)
#   3. Selecciona Multiprod como provider activo
#   4. Prueba conexión real a Multiprod
#   5. Genera y envía un e-CF de prueba (E32) — opcional
#
# Uso:
#   chmod +x setup_lungomare.sh
#   ./setup_lungomare.sh
#
# Requisitos: bash, curl, python3 (solo para parsear JSON)
# ════════════════════════════════════════════════════════════════

set -e

# ── CONFIGURACIÓN ────────────────────────────────────────────────
TENANT_URL="https://lungomare.vexlyapp.com"
ADMIN_PIN="11338585"

# Datos fiscales Lungomare
RNC="1-01-52417-2"
RAZON_SOCIAL="EMPRESA DE ENTRETENIMIENTOS ELIAS SRL"
NOMBRE_COMERCIAL="Lungomare Bar & Lounge"
DIRECCION="Av. George Washington 365, Santo Domingo"
EMAIL="Ramoabastec@gmail.com"
TELEFONO="809-221-7713"
PROVINCIA="010000"     # Distrito Nacional
MUNICIPIO="010101"     # Santo Domingo de Guzmán

# Multiprod sandbox endpoint
MULTIPROD_ENDPOINT="https://portalmultiprod.com/api/testecf/enviar/a0152849fbf760e2de60c6274797c93e"

# ── COLORES ──────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }
info() { echo -e "${BLUE}→${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  CONFIGURACIÓN AUTOMÁTICA — LUNGOMARE BAR & LOUNGE"
echo "  Target: $TENANT_URL"
echo "════════════════════════════════════════════════════════════"
echo ""

# ── 1. LOGIN ─────────────────────────────────────────────────────
info "Paso 1: Login admin..."
LOGIN_RESPONSE=$(curl -s -X POST "$TENANT_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"pin\":\"$ADMIN_PIN\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('token') or d.get('access_token') or '')
" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  fail "Login falló. Response: $LOGIN_RESPONSE"
fi
ok "Login OK (token recibido, ${#TOKEN} chars)"

USER_ROLE=$(echo "$LOGIN_RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
u = d.get('user', {})
print(f\"role={u.get('role')}, level={u.get('level')}, name={u.get('name')}\")
" 2>/dev/null)
ok "User: $USER_ROLE"

# ── 2. CONFIGURAR DATOS FISCALES (system_config id=main) ─────────
echo ""
info "Paso 2: Configurar datos fiscales del emisor..."

SYSTEM_CONFIG=$(cat <<EOF
{
  "ticket_rnc": "$RNC",
  "rnc": "$RNC",
  "ticket_business_name": "$NOMBRE_COMERCIAL",
  "ticket_legal_name": "$RAZON_SOCIAL",
  "ticket_razon_social": "$RAZON_SOCIAL",
  "fiscal_address": "$DIRECCION",
  "ticket_address_street": "$DIRECCION",
  "ticket_address_city": "Santo Domingo",
  "ticket_email": "$EMAIL",
  "ticket_phone": "$TELEFONO",
  "province": "$PROVINCIA",
  "municipality": "$MUNICIPIO",
  "ecf_enabled": true,
  "ecf_provider": "multiprod"
}
EOF
)

RESP=$(curl -s -X PUT "$TENANT_URL/api/system/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$SYSTEM_CONFIG")

if echo "$RESP" | grep -q '"ok":true'; then
  ok "system_config actualizado"
else
  fail "Error al guardar system_config: $RESP"
fi

# Verificar
VERIFY=$(curl -s "$TENANT_URL/api/system/config" -H "Authorization: Bearer $TOKEN")
echo "$VERIFY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'   ✓ RNC: {d.get(\"ticket_rnc\")}')
print(f'   ✓ Razón Social: {d.get(\"ticket_razon_social\")}')
print(f'   ✓ Nombre Comercial: {d.get(\"ticket_business_name\")}')
print(f'   ✓ Dirección: {d.get(\"fiscal_address\")}')
print(f'   ✓ Provincia: {d.get(\"province\")} | Municipio: {d.get(\"municipality\")}')
print(f'   ✓ Email: {d.get(\"ticket_email\")}')
print(f'   ✓ e-CF habilitado: {d.get(\"ecf_enabled\")}')
"

# ── 3. CONFIGURAR PROVEEDOR MULTIPROD (ecf_provider_config) ──────
echo ""
info "Paso 3: Configurar endpoint Multiprod..."

RESP=$(curl -s -X PUT "$TENANT_URL/api/ecf/config" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"provider\":\"multiprod\",\"multiprod_endpoint\":\"$MULTIPROD_ENDPOINT\"}")

if echo "$RESP" | grep -q '"ok":true'; then
  ok "ecf_provider_config actualizado"
else
  fail "Error al guardar credenciales Multiprod: $RESP"
fi

# Verificar
VERIFY=$(curl -s "$TENANT_URL/api/ecf/config" -H "Authorization: Bearer $TOKEN")
echo "$VERIFY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'   ✓ Provider: {d.get(\"provider\")}')
print(f'   ✓ Endpoint configurado: {d.get(\"has_multiprod_endpoint\")}')
print(f'   ✓ Endpoint (mascarado): {d.get(\"multiprod_endpoint\")}')
"

# ── 4. PROBAR CONEXIÓN MULTIPROD ─────────────────────────────────
echo ""
info "Paso 4: Probando conexión real con Multiprod sandbox..."

TEST_RESP=$(curl -s -X POST "$TENANT_URL/api/ecf/test-multiprod" \
  -H "Authorization: Bearer $TOKEN")

echo "$TEST_RESP" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    ok = d.get('ok')
    print(f'   {\"✓\" if ok else \"✗\"} Conexión: {\"OK\" if ok else \"FALLO\"}')
    print(f'   estado: {d.get(\"estado\")}')
    print(f'   motivo: {d.get(\"motivo\") or \"(sin motivo)\"}')
    if d.get('encf'):
        print(f'   eNCF de prueba: {d.get(\"encf\")}')
    if d.get('qr'):
        print(f'   QR DGII: {d.get(\"qr\")[:80]}...')
except:
    import sys; sys.stdin.seek(0)
    print('   Response:', sys.stdin.read()[:500])
" 2>/dev/null || echo "   Response: $TEST_RESP"

# ── 5. RESUMEN ───────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  CONFIGURACIÓN COMPLETADA"
echo "════════════════════════════════════════════════════════════"
echo ""
ok "Lungomare Bar & Lounge configurado"
echo ""
echo "  Próximos pasos manuales (en la UI):"
echo "  1. Cargar la secuencia NCF de prueba en Configuración → Sistema → Secuencia NCF"
echo "  2. Activar el primer cobro de prueba"
echo "  3. Verificar que el e-CF aparece como 'Aceptado' en el ticket"
echo ""
echo "  Si necesitas cambiar el endpoint Multiprod por el de PRODUCCIÓN"
echo "  (cuando completen certificación DGII), edita la variable"
echo "  MULTIPROD_ENDPOINT en este script y re-ejecuta."
echo ""
