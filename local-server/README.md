# 🍽️ MESA POS RD - Servidor Local

Sistema de Punto de Venta para Restaurantes - Versión para instalación local.

## 📋 Requisitos

- **Docker Desktop** (Windows/Mac) o **Docker Engine** (Linux)
- **4GB RAM** mínimo
- **20GB** de espacio en disco

## 🚀 Instalación Rápida

### Windows
1. Instala [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. Reinicia tu computadora
3. Abre Docker Desktop y espera que inicie
4. Doble clic en `instalar-windows.bat`

### Linux / Mac
```bash
chmod +x instalar-linux.sh
./instalar-linux.sh
```

## 🌐 Acceso

Una vez instalado, abre en tu navegador:

- **Desde el servidor**: http://localhost
- **Desde otros dispositivos**: http://[IP-DEL-SERVIDOR]

### PINs de Acceso

| Usuario | PIN | Rol |
|---------|-----|-----|
| Admin | 0000 | Administrador |
| Luis | 4321 | Cajero |
| Carlos | 1234 | Mesero |
| Chef Pedro | 9999 | Cocina |

## 📱 Dispositivos Móviles

1. Conecta el dispositivo al mismo WiFi
2. Abre el navegador
3. Ve a `http://[IP-DEL-SERVIDOR]`
4. Añade a pantalla de inicio para acceso rápido

## 🔧 Comandos Útiles

```bash
# Ver estado de servicios
docker-compose ps

# Ver logs en tiempo real
docker-compose logs -f

# Reiniciar todo
docker-compose restart

# Detener el sistema
docker-compose down

# Iniciar el sistema
docker-compose up -d
```

## 💾 Backups

- **Windows**: Ejecuta `backup.bat`
- **Linux/Mac**: Ejecuta `./backup.sh`

Los backups se guardan en la carpeta `backups/`

## 📖 Guía Completa

Ver `GUIA_INSTALACION.md` para instrucciones detalladas.

---

**Mesa POS RD** - Sistema POS 100% Local para Restaurantes
