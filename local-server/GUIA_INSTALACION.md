# 🍽️ MESA POS RD - Guía de Instalación Local

## Requisitos del Sistema

### Hardware Mínimo
- **Procesador**: Intel Core i3 o AMD Ryzen 3 (o superior)
- **RAM**: 4GB (recomendado 8GB)
- **Disco**: 20GB libres (SSD recomendado)
- **Red**: Puerto Ethernet o WiFi estable

### Software
- **Windows 10/11** o **Ubuntu 20.04+**
- **Docker Desktop** (Windows) o **Docker Engine** (Linux)

---

## 📋 Instalación Paso a Paso

### Windows

#### 1. Instalar Docker Desktop
1. Descarga Docker Desktop: https://www.docker.com/products/docker-desktop/
2. Ejecuta el instalador
3. **Reinicia tu computadora** después de instalar
4. Abre Docker Desktop y espera a que inicie

#### 2. Configurar IP Fija
1. Ve a **Panel de Control > Redes e Internet > Centro de redes**
2. Clic en tu conexión activa > **Propiedades**
3. Selecciona **Protocolo de Internet versión 4 (TCP/IPv4)** > **Propiedades**
4. Selecciona **"Usar la siguiente dirección IP"**
5. Configura:
   - IP: `192.168.1.100` (o la que prefieras)
   - Máscara: `255.255.255.0`
   - Puerta de enlace: `192.168.1.1` (tu router)
   - DNS: `8.8.8.8`

#### 3. Instalar Mesa POS
1. Descarga los archivos del servidor
2. Abre el archivo `.env` y cambia `SERVER_IP=192.168.1.100` a tu IP
3. Ejecuta `instalar-windows.bat` como Administrador
4. Espera a que complete la instalación (5-15 minutos)

---

### Linux (Ubuntu/Debian)

#### 1. Configurar IP Fija
```bash
# Editar configuración de red
sudo nano /etc/netplan/01-netcfg.yaml
```

Contenido:
```yaml
network:
  version: 2
  ethernets:
    eth0:  # o el nombre de tu interfaz
      dhcp4: no
      addresses:
        - 192.168.1.100/24
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

Aplicar:
```bash
sudo netplan apply
```

#### 2. Instalar Mesa POS
```bash
# Dar permisos de ejecución
chmod +x instalar-linux.sh backup.sh

# Ejecutar instalador
sudo ./instalar-linux.sh
```

---

## 🌐 Acceder al Sistema

Una vez instalado, desde **cualquier dispositivo** en tu red WiFi:

1. Abre un navegador (Chrome, Safari, Firefox)
2. Ve a: `http://192.168.1.100` (o tu IP configurada)
3. Ingresa con los PINs:

| Usuario | PIN | Rol |
|---------|-----|-----|
| Admin | 0000 | Administrador |
| Luis | 4321 | Cajero |
| Carlos | 1234 | Mesero |
| Maria | 5678 | Mesero |
| Chef Pedro | 9999 | Cocina |

---

## 📱 Configurar Dispositivos

### Tablets/Celulares (Meseros)
1. Conectar al WiFi del restaurante
2. Abrir Chrome/Safari
3. Ir a `http://192.168.1.100`
4. **Agregar a pantalla de inicio** (opcional pero recomendado):
   - Chrome: Menú > "Añadir a pantalla de inicio"
   - Safari: Compartir > "Añadir a inicio"

### Pantalla de Cocina (KDS)
1. Conectar tablet/monitor a la red WiFi
2. Abrir `http://192.168.1.100`
3. Ingresar con PIN `9999` (Cocina)
4. La pantalla se actualizará automáticamente

### Caja Registradora
1. Igual que los demás dispositivos
2. PIN `4321` para cajero

---

## 🔧 Comandos Útiles

### Windows (PowerShell como Admin)
```batch
# Ver estado de los servicios
docker-compose ps

# Ver logs en tiempo real
docker-compose logs -f

# Reiniciar todo
docker-compose restart

# Detener el sistema
docker-compose down

# Iniciar el sistema
docker-compose up -d

# Crear backup manual
backup.bat
```

### Linux
```bash
# Ver estado
docker-compose ps

# Ver logs
docker-compose logs -f

# Reiniciar
docker-compose restart

# Detener
docker-compose down

# Iniciar
docker-compose up -d

# Backup manual
./backup.sh
```

---

## 💾 Backups Automáticos

### Windows - Programar Tarea
1. Abre "Programador de tareas"
2. Crear tarea básica > "Backup POS Diario"
3. Disparador: Diario, 3:00 AM
4. Acción: Iniciar programa > `C:\ruta\a\backup.bat`

### Linux - Cron Job
```bash
# Editar crontab
sudo crontab -e

# Agregar línea (backup diario a las 3 AM)
0 3 * * * /ruta/al/servidor/backup.sh
```

---

## ⚠️ Solución de Problemas

### El sistema no carga
1. Verifica que Docker esté corriendo
2. Ejecuta `docker-compose ps` para ver el estado
3. Si hay errores, ejecuta `docker-compose logs`

### Los dispositivos no se conectan
1. Verifica que todos estén en la misma red WiFi
2. Verifica la IP con `ipconfig` (Windows) o `ip addr` (Linux)
3. Verifica que el firewall permita el puerto 80

### La base de datos no inicia
1. Verifica espacio en disco
2. Ejecuta `docker-compose down` y luego `docker-compose up -d`

### Restaurar un backup
```bash
# Windows
docker exec pos_mongodb mongorestore --db=pos_db --archive=/backups/nombre_archivo.gz --gzip --drop

# Linux
docker exec pos_mongodb mongorestore --db=pos_db --archive=/backups/nombre_archivo.gz --gzip --drop
```

---

## 📞 Soporte

Si tienes problemas:
1. Toma captura de pantalla del error
2. Ejecuta `docker-compose logs > logs.txt`
3. Contacta al soporte con ambos archivos

---

## 🔒 Seguridad

### Cambiar contraseña JWT
Edita el archivo `.env` y cambia `JWT_SECRET` por una clave segura de al menos 32 caracteres.

### Firewall
Solo permite acceso desde tu red local:
```bash
# Linux UFW
sudo ufw allow from 192.168.1.0/24 to any port 80
sudo ufw enable
```

---

¡Listo! Tu sistema POS está funcionando de forma 100% local. 🎉
