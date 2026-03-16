@echo off
chcp 65001 > nul
title VexlyPOS - Instalador del Agente de Impresion
color 0A

echo.
echo ========================================================
echo       VEXLYPOS - INSTALADOR DEL AGENTE DE IMPRESION
echo ========================================================
echo.

:: Verificar permisos de administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Este script necesita permisos de ADMINISTRADOR
    echo.
    echo Haz clic derecho en este archivo y selecciona
    echo "Ejecutar como administrador"
    echo.
    pause
    exit /b 1
)

echo [OK] Ejecutando como Administrador
echo.

:: Configuracion
set INSTALL_DIR=C:\VexlyPOS
set PRINTER_NAME=RECIBO
set SERVER_URL=https://vexlyapp.com
set TASK_NAME=VexlyPOS_PrintAgent

:: Crear directorio
echo [1/6] Creando directorio...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
echo       Directorio: %INSTALL_DIR%
echo.

:: Encontrar Python
echo [2/6] Buscando Python...
where python >nul 2>&1
if %errorLevel% neq 0 (
    echo       [ERROR] Python no encontrado en PATH!
    echo.
    echo       Instala Python desde: https://www.python.org/downloads/
    echo       IMPORTANTE: Marca "Add Python to PATH" durante instalacion
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%i in ('where python') do set PYTHON_PATH=%%i
echo       [OK] Python: %PYTHON_PATH%
echo.

:: Instalar dependencias
echo [3/6] Instalando dependencias...
python -m pip install requests pywin32 --quiet --disable-pip-version-check
if %errorLevel% neq 0 (
    echo       [ERROR] No se pudieron instalar las dependencias
    pause
    exit /b 1
)
echo       [OK] requests y pywin32 instalados
echo.

:: Descargar agente
echo [4/6] Descargando agente de impresion...
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SERVER_URL%/api/download/print-agent?printer_name=%PRINTER_NAME%' -OutFile '%INSTALL_DIR%\VexlyPOS_PrintAgent.py' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"
if not exist "%INSTALL_DIR%\VexlyPOS_PrintAgent.py" (
    echo       [ERROR] No se pudo descargar el agente
    echo       Verifica tu conexion a internet
    pause
    exit /b 1
)
echo       [OK] Agente descargado
echo.

:: Crear archivo de configuracion
echo [5/6] Creando archivo de configuracion...
echo # VexlyPOS - Configuracion del Agente de Impresion > "%INSTALL_DIR%\config.txt"
echo # Puedes editar este archivo para cambiar la configuracion >> "%INSTALL_DIR%\config.txt"
echo # El agente leera estos valores al iniciar >> "%INSTALL_DIR%\config.txt"
echo. >> "%INSTALL_DIR%\config.txt"
echo SERVER_URL=%SERVER_URL% >> "%INSTALL_DIR%\config.txt"
echo PRINTER_NAME=%PRINTER_NAME% >> "%INSTALL_DIR%\config.txt"
echo POLL_INTERVAL=3 >> "%INSTALL_DIR%\config.txt"
echo NETWORK_PORT=9100 >> "%INSTALL_DIR%\config.txt"
echo       [OK] config.txt creado
echo.

:: Crear script de inicio
echo [6/6] Configurando inicio automatico...

:: Matar proceso anterior si existe
taskkill /f /im pythonw.exe >nul 2>&1

:: Crear archivo VBS para ejecutar sin ventana
echo Set WshShell = CreateObject("WScript.Shell") > "%INSTALL_DIR%\RunAgent.vbs"
echo WshShell.Run "pythonw ""%INSTALL_DIR%\VexlyPOS_PrintAgent.py""", 0, False >> "%INSTALL_DIR%\RunAgent.vbs"

:: Eliminar tarea anterior si existe
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Crear tarea programada que inicie con Windows
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe "%INSTALL_DIR%\RunAgent.vbs"" /sc onlogon /rl highest /f >nul 2>&1
if %errorLevel% neq 0 (
    echo       [WARN] No se pudo crear tarea programada
    echo       Puedes agregar manualmente a Inicio
) else (
    echo       [OK] Tarea programada creada
)

:: Iniciar el agente ahora
echo.
echo Iniciando agente...
start "" wscript.exe "%INSTALL_DIR%\RunAgent.vbs"

echo.
echo ========================================================
echo           INSTALACION COMPLETADA EXITOSAMENTE
echo ========================================================
echo.
echo El agente esta corriendo en segundo plano.
echo Se iniciara automaticamente cuando enciendas la PC.
echo.
echo Archivos instalados en: %INSTALL_DIR%
echo   - VexlyPOS_PrintAgent.py (agente)
echo   - config.txt (EDITABLE - para cambiar URL)
echo   - VexlyPOS_PrintAgent.log (logs)
echo   - RunAgent.vbs (iniciador)
echo.
echo ========================================================
echo   PARA CAMBIAR DE SERVIDOR O CLIENTE:
echo   Solo edita C:\VexlyPOS\config.txt y cambia SERVER_URL
echo   Luego reinicia el agente con:
echo   taskkill /f /im pythonw.exe
echo   wscript C:\VexlyPOS\RunAgent.vbs
echo ========================================================
echo.
echo Para ver los logs:
echo   type %INSTALL_DIR%\VexlyPOS_PrintAgent.log
echo.
pause
