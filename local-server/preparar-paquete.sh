#!/bin/bash
# ===============================================
# MESA POS RD - Script de Preparación de Paquete Local
# Copia los archivos del proyecto al paquete local
# ===============================================

echo "📦 Preparando paquete de servidor local..."
echo ""

# Directorio base
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOCAL_SERVER="$SCRIPT_DIR"

# Limpiar directorios anteriores (excepto Dockerfiles y configs)
echo "🧹 Limpiando archivos anteriores..."
rm -rf "$LOCAL_SERVER/backend/routers" 2>/dev/null
rm -rf "$LOCAL_SERVER/backend/models" 2>/dev/null
rm -f "$LOCAL_SERVER/backend/server.py" 2>/dev/null

rm -rf "$LOCAL_SERVER/frontend/src" 2>/dev/null
rm -rf "$LOCAL_SERVER/frontend/public" 2>/dev/null

# Copiar Backend
echo "📋 Copiando backend..."
mkdir -p "$LOCAL_SERVER/backend/routers"
mkdir -p "$LOCAL_SERVER/backend/models"

cp "$PROJECT_ROOT/backend/server.py" "$LOCAL_SERVER/backend/"
cp "$PROJECT_ROOT/backend/requirements.txt" "$LOCAL_SERVER/backend/"
cp -r "$PROJECT_ROOT/backend/routers/"* "$LOCAL_SERVER/backend/routers/"
cp -r "$PROJECT_ROOT/backend/models/"* "$LOCAL_SERVER/backend/models/" 2>/dev/null || true

# Copiar Frontend
echo "📋 Copiando frontend..."
cp -r "$PROJECT_ROOT/frontend/src" "$LOCAL_SERVER/frontend/"
cp -r "$PROJECT_ROOT/frontend/public" "$LOCAL_SERVER/frontend/"
cp "$PROJECT_ROOT/frontend/package.json" "$LOCAL_SERVER/frontend/"
cp "$PROJECT_ROOT/frontend/yarn.lock" "$LOCAL_SERVER/frontend/" 2>/dev/null || true

# Crear .env de ejemplo para el backend
echo "📝 Creando archivo .env de ejemplo..."
cat > "$LOCAL_SERVER/backend/.env.example" << 'EOF'
# Configuración de Base de Datos
MONGO_URL=mongodb://mongodb:27017
DB_NAME=pos_db

# Seguridad - CAMBIAR EN PRODUCCIÓN
JWT_SECRET=tu_clave_secreta_cambiar_en_produccion_minimo_32_caracteres

# Email (opcional - dejar vacío si no se usa)
RESEND_API_KEY=
SENDER_EMAIL=

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost,http://127.0.0.1
EOF

echo ""
echo "✅ Paquete preparado exitosamente!"
echo ""
echo "📁 Ubicación: $LOCAL_SERVER"
echo ""
echo "Para construir y ejecutar:"
echo "  cd $LOCAL_SERVER"
echo "  docker-compose up -d --build"
echo ""
