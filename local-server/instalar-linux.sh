#!/bin/bash
# =============================================
# INSTALADOR MESA POS RD - SERVIDOR LOCAL
# Para Ubuntu/Debian Linux
# =============================================

set -e

echo ""
echo "============================================"
echo "  MESA POS RD - Instalador de Servidor Local"
echo "============================================"
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar si se ejecuta como root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}[ERROR] Este script debe ejecutarse como root (sudo)${NC}"
    echo "Ejecuta: sudo ./instalar-linux.sh"
    exit 1
fi

# Verificar si Docker está instalado
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}[INFO] Docker no encontrado. Instalando...${NC}"
    
    # Instalar Docker
    apt-get update
    apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
    
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    systemctl enable docker
    systemctl start docker
    
    echo -e "${GREEN}[OK] Docker instalado correctamente${NC}"
else
    echo -e "${GREEN}[OK] Docker detectado${NC}"
fi

# Verificar Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}[INFO] Instalando Docker Compose...${NC}"
    apt-get install -y docker-compose-plugin
fi
echo -e "${GREEN}[OK] Docker Compose disponible${NC}"

# Crear archivo .env si no existe
if [ ! -f .env ]; then
    echo -e "${YELLOW}[INFO] Creando archivo de configuración...${NC}"
    cp .env.example .env
    
    # Detectar IP automáticamente
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    sed -i "s/SERVER_IP=.*/SERVER_IP=$LOCAL_IP/" .env
    
    echo ""
    echo -e "${YELLOW}[IMPORTANTE] Se detectó tu IP: $LOCAL_IP${NC}"
    echo "Si necesitas cambiarla, edita el archivo .env"
    echo ""
fi

# Leer IP del archivo .env
SERVER_IP=$(grep "SERVER_IP" .env | cut -d '=' -f2)

echo ""
echo -e "${YELLOW}[INFO] IP del servidor: $SERVER_IP${NC}"
echo ""

# Construir e iniciar
echo -e "${YELLOW}[INFO] Descargando e instalando componentes...${NC}"
echo "Esto puede tardar varios minutos la primera vez..."
echo ""

docker-compose pull || docker compose pull
docker-compose build --no-cache || docker compose build --no-cache
docker-compose up -d || docker compose up -d

# Esperar a que los servicios estén listos
echo ""
echo -e "${YELLOW}[INFO] Esperando a que los servicios inicien...${NC}"
sleep 10

# Verificar que todo esté corriendo
if docker-compose ps | grep -q "Up" || docker compose ps | grep -q "Up"; then
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  INSTALACIÓN COMPLETADA!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo "Tu sistema POS está listo en:"
    echo ""
    echo -e "  ${GREEN}http://$SERVER_IP${NC}"
    echo ""
    echo "Desde cualquier dispositivo en tu red WiFi,"
    echo "abre un navegador y ve a esa dirección."
    echo ""
    echo "PINs de acceso por defecto:"
    echo "  - Admin: 0000"
    echo "  - Cajero: 4321"
    echo "  - Mesero 1: 1234"
    echo "  - Mesero 2: 5678"
    echo "  - Cocina: 9999"
    echo ""
    echo "============================================"
    echo ""
    echo "Comandos útiles:"
    echo "  - Detener: docker-compose down"
    echo "  - Reiniciar: docker-compose restart"
    echo "  - Ver logs: docker-compose logs -f"
    echo "  - Backup: ./backup.sh"
    echo ""
    
    # Crear servicio systemd para auto-inicio
    cat > /etc/systemd/system/pos-server.service << EOF
[Unit]
Description=Mesa POS RD Server
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable pos-server.service
    
    echo -e "${GREEN}[OK] Configurado para iniciar automáticamente al encender${NC}"
    echo ""
else
    echo -e "${RED}[ERROR] Hubo un problema al iniciar los servicios${NC}"
    echo "Revisa los logs con: docker-compose logs"
    exit 1
fi
