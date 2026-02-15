@echo off
REM ===============================================
REM MESA POS RD - Script de Preparación de Paquete Local
REM Copia los archivos del proyecto al paquete local
REM ===============================================

echo.
echo ======================================
echo   MESA POS RD - Preparar Paquete
echo ======================================
echo.

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..

echo Limpiando archivos anteriores...
if exist "%SCRIPT_DIR%backend\routers" rmdir /s /q "%SCRIPT_DIR%backend\routers"
if exist "%SCRIPT_DIR%backend\models" rmdir /s /q "%SCRIPT_DIR%backend\models"
if exist "%SCRIPT_DIR%backend\server.py" del /q "%SCRIPT_DIR%backend\server.py"
if exist "%SCRIPT_DIR%frontend\src" rmdir /s /q "%SCRIPT_DIR%frontend\src"
if exist "%SCRIPT_DIR%frontend\public" rmdir /s /q "%SCRIPT_DIR%frontend\public"

echo Copiando backend...
mkdir "%SCRIPT_DIR%backend\routers" 2>nul
mkdir "%SCRIPT_DIR%backend\models" 2>nul
copy "%PROJECT_ROOT%\backend\server.py" "%SCRIPT_DIR%backend\"
copy "%PROJECT_ROOT%\backend\requirements.txt" "%SCRIPT_DIR%backend\"
xcopy /s /e /y "%PROJECT_ROOT%\backend\routers\*" "%SCRIPT_DIR%backend\routers\"
xcopy /s /e /y "%PROJECT_ROOT%\backend\models\*" "%SCRIPT_DIR%backend\models\" 2>nul

echo Copiando frontend...
xcopy /s /e /y "%PROJECT_ROOT%\frontend\src" "%SCRIPT_DIR%frontend\src\"
xcopy /s /e /y "%PROJECT_ROOT%\frontend\public" "%SCRIPT_DIR%frontend\public\"
copy "%PROJECT_ROOT%\frontend\package.json" "%SCRIPT_DIR%frontend\"
copy "%PROJECT_ROOT%\frontend\yarn.lock" "%SCRIPT_DIR%frontend\" 2>nul

echo.
echo ======================================
echo   Paquete preparado exitosamente!
echo ======================================
echo.
echo Ubicacion: %SCRIPT_DIR%
echo.
echo Para construir y ejecutar:
echo   cd %SCRIPT_DIR%
echo   docker-compose up -d --build
echo.
pause
