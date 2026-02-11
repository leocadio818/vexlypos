@echo off
REM =============================================
REM BACKUP DE BASE DE DATOS - MESA POS RD
REM =============================================

echo.
echo ============================================
echo   BACKUP DE BASE DE DATOS
echo ============================================
echo.

REM Crear carpeta de backups si no existe
if not exist backups mkdir backups

REM Obtener fecha actual
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "fecha=%dt:~0,8%_%dt:~8,6%"

REM Nombre del archivo
set "archivo=backups\pos_backup_%fecha%.gz"

echo [INFO] Creando backup...
docker exec pos_mongodb mongodump --db=pos_db --archive=/backups/pos_backup_%fecha%.gz --gzip

if %errorlevel% neq 0 (
    echo [ERROR] No se pudo crear el backup.
    pause
    exit /b 1
)

echo.
echo [OK] Backup creado: %archivo%
echo.

REM Eliminar backups antiguos (más de 30 días)
forfiles /p backups /m *.gz /d -30 /c "cmd /c del @path" 2>nul

echo [INFO] Backups antiguos eliminados (mas de 30 dias)
echo.
pause
