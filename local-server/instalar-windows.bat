@echo off
REM ===============================================
REM MESA POS RD - Instalador para Windows
REM Sistema POS para Restaurantes
REM ===============================================

echo.
echo ========================================
echo    MESA POS RD - Instalador Windows
echo ========================================
echo.

REM Verificar si Docker está instalado
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Docker no esta instalado.
    echo.
    echo Por favor:
    echo 1. Descarga Docker Desktop desde https://docker.com
    echo 2. Instala y reinicia tu computadora
    echo 3. Abre Docker Desktop y espera a que inicie
    echo 4. Ejecuta este instalador nuevamente
    echo.
    pause
    exit /b 1
)

echo OK: Docker encontrado
echo.

REM Crear directorio de backups
if not exist "backups" mkdir backups

echo Construyendo contenedores...
echo (Esto puede tomar 5-15 minutos la primera vez)
echo.

REM Construir y levantar servicios
docker-compose build --no-cache
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Fallo al construir los contenedores
    echo Verifica que Docker Desktop este corriendo
    pause
    exit /b 1
)

docker-compose up -d
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Fallo al iniciar los contenedores
    pause
    exit /b 1
)

echo.
echo Esperando a que los servicios inicien...
timeout /t 15 /nobreak >nul

echo.
echo ========================================
echo    INSTALACION COMPLETADA
echo ========================================
echo.
echo Accede al sistema desde cualquier dispositivo:
echo.
echo    http://localhost
echo.
echo    O desde otros dispositivos en tu red:
echo    http://[TU-IP-LOCAL]
echo.
echo    Para ver tu IP, ejecuta: ipconfig
echo.
echo PINs de acceso:
echo    Admin:      0000
echo    Cajero:     4321
echo    Mesero:     1234
echo    Cocina:     9999
echo.
echo Comandos utiles (en PowerShell):
echo    Ver estado:    docker-compose ps
echo    Ver logs:      docker-compose logs -f
echo    Reiniciar:     docker-compose restart
echo    Detener:       docker-compose down
echo.
echo Backup manual: backup.bat
echo.
pause
