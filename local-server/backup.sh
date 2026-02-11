#!/bin/bash
# =============================================
# BACKUP DE BASE DE DATOS - MESA POS RD
# =============================================

set -e

echo ""
echo "============================================"
echo "  BACKUP DE BASE DE DATOS"
echo "============================================"
echo ""

# Crear carpeta de backups
mkdir -p backups

# Fecha actual
FECHA=$(date +%Y%m%d_%H%M%S)

# Nombre del archivo
ARCHIVO="backups/pos_backup_${FECHA}.gz"

echo "[INFO] Creando backup..."
docker exec pos_mongodb mongodump --db=pos_db --archive=/backups/pos_backup_${FECHA}.gz --gzip

if [ $? -eq 0 ]; then
    echo ""
    echo "[OK] Backup creado: $ARCHIVO"
    echo ""
    
    # Eliminar backups antiguos (más de 30 días)
    find backups -name "*.gz" -type f -mtime +30 -delete
    echo "[INFO] Backups antiguos eliminados (más de 30 días)"
else
    echo "[ERROR] No se pudo crear el backup"
    exit 1
fi

echo ""
