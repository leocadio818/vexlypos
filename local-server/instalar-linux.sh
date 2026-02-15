#!/bin/bash
# ===============================================
# MESA POS RD - Instalador para Linux/Mac
# Sistema POS para Restaurantes
# ===============================================

set -e

echo ""
echo "========================================"
echo "   MESA POS RD - Instalador Linux/Mac"
echo "========================================"
echo ""

# Verificar si Docker está instalado
if ! command -v docker &> /dev/null; then
    echo "❌ Docker no está instalado."
    echo ""
    echo "Para instalar Docker:"
    echo ""
    echo "Ubuntu/Debian:"
    echo "  curl -fsSL https://get.docker.com -o get-docker.sh"
    echo "  sudo sh get-docker.sh"
    echo ""
    echo "Mac:"
    echo "  Descarga Docker Desktop desde https://docker.com"
    echo ""
    exit 1
fi

# Verificar si Docker Compose está disponible
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose no está disponible."
    echo "Instala Docker Compose o actualiza Docker a una versión reciente."
    exit 1
fi

# Determinar comando de compose
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo "✅ Docker encontrado"
echo "✅ Docker Compose encontrado"
echo ""

# Obtener IP local
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0 2>/dev/null || echo "localhost")
echo "📍 IP Local detectada: $LOCAL_IP"
echo ""

# Preguntar si quiere usar IP específica
read -p "¿Usar esta IP? (Enter para sí, o escribe otra): " CUSTOM_IP
if [ -n "$CUSTOM_IP" ]; then
    LOCAL_IP=$CUSTOM_IP
fi

# Crear directorio de backups
mkdir -p backups

echo ""
echo "🔨 Construyendo contenedores..."
echo "   (Esto puede tomar 5-15 minutos la primera vez)"
echo ""

# Construir y levantar servicios
$COMPOSE_CMD build --no-cache
$COMPOSE_CMD up -d

echo ""
echo "⏳ Esperando a que los servicios inicien..."
sleep 10

# Verificar que los servicios estén corriendo
if $COMPOSE_CMD ps | grep -q "Up"; then
    echo ""
    echo "========================================"
    echo "   ✅ INSTALACIÓN COMPLETADA"
    echo "========================================"
    echo ""
    echo "🌐 Accede al sistema desde cualquier dispositivo:"
    echo ""
    echo "   http://$LOCAL_IP"
    echo ""
    echo "📱 PINs de acceso:"
    echo "   Admin:      0000"
    echo "   Cajero:     4321"
    echo "   Mesero:     1234"
    echo "   Cocina:     9999"
    echo ""
    echo "📂 Comandos útiles:"
    echo "   Ver estado:    $COMPOSE_CMD ps"
    echo "   Ver logs:      $COMPOSE_CMD logs -f"
    echo "   Reiniciar:     $COMPOSE_CMD restart"
    echo "   Detener:       $COMPOSE_CMD down"
    echo ""
    echo "💾 Backup manual: ./backup.sh"
    echo ""
else
    echo ""
    echo "❌ Error: Los servicios no iniciaron correctamente"
    echo "Ejecuta '$COMPOSE_CMD logs' para ver los errores"
    exit 1
fi
