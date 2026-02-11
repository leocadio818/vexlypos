@echo off
REM =============================================
REM INSTALADOR MESA POS RD - SERVIDOR LOCAL
REM Para Windows 10/11
REM =============================================

echo.
echo ============================================
echo   MESA POS RD - Instalador de Servidor Local
echo ============================================
echo.

REM Verificar si Docker está instalado
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker no esta instalado.
    echo.
    echo Por favor instala Docker Desktop desde:
    echo https://www.docker.com/products/docker-desktop/
    echo.
    echo Despues de instalar, reinicia tu computadora y ejecuta este script nuevamente.
    pause
    exit /b 1
)

echo [OK] Docker detectado
echo.

REM Verificar si docker-compose está disponible
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker Compose no esta disponible.
    echo Por favor asegurate de tener Docker Desktop actualizado.
    pause
    exit /b 1
)

echo [OK] Docker Compose detectado
echo.

REM Crear archivo .env si no existe
if not exist .env (
    echo [INFO] Creando archivo de configuracion...
    copy .env.example .env
    echo.
    echo [IMPORTANTE] Edita el archivo .env con tu IP fija antes de continuar.
    echo.
    notepad .env
    pause
)

REM Obtener IP del archivo .env
for /f "tokens=2 delims==" %%a in ('findstr "SERVER_IP" .env') do set SERVER_IP=%%a

echo.
echo [INFO] IP del servidor: %SERVER_IP%
echo.

REM Construir e iniciar los contenedores
echo [INFO] Descargando e instalando componentes...
echo Esto puede tardar varios minutos la primera vez...
echo.

docker-compose pull
docker-compose build --no-cache
docker-compose up -d

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Hubo un problema al iniciar los servicios.
    echo Por favor revisa los logs con: docker-compose logs
    pause
    exit /b 1
)

echo.
echo ============================================
echo   INSTALACION COMPLETADA!
echo ============================================
echo.
echo Tu sistema POS esta listo en:
echo.
echo   http://%SERVER_IP%
echo.
echo Desde cualquier dispositivo en tu red WiFi,
echo abre un navegador y ve a esa direccion.
echo.
echo PINs de acceso por defecto:
echo   - Admin: 0000
echo   - Cajero: 4321
echo   - Mesero 1: 1234
echo   - Mesero 2: 5678
echo   - Cocina: 9999
echo.
echo ============================================
echo.
echo Comandos utiles:
echo   - Detener: docker-compose down
echo   - Reiniciar: docker-compose restart
echo   - Ver logs: docker-compose logs -f
echo   - Backup: backup.bat
echo.
pause
