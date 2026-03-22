@echo off
chcp 65001 > nul
title VexlyPOS - Instalador del Agente de Impresion Multi-Impresora
color 0A

echo.
echo ========================================================
echo   VEXLYPOS - AGENTE DE IMPRESION MULTI-IMPRESORA
echo ========================================================
echo.

:: Verificar permisos de administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Este script necesita permisos de ADMINISTRADOR
    echo Haz clic derecho y selecciona "Ejecutar como administrador"
    pause
    exit /b 1
)

echo [OK] Ejecutando como Administrador
echo.

:: Configuracion
set INSTALL_DIR=C:\VexlyPOS
set SERVER_URL=https://vexlyapp.com
set TASK_NAME=VexlyPOS_PrintAgent

:: Crear directorio
echo [1/5] Creando directorio...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
echo       Directorio: %INSTALL_DIR%
echo.

:: Encontrar Python
echo [2/5] Buscando Python...
where python >nul 2>&1
if %errorLevel% neq 0 (
    echo       [ERROR] Python no encontrado!
    echo       Instala Python desde: https://www.python.org/downloads/
    echo       IMPORTANTE: Marca "Add Python to PATH"
    pause
    exit /b 1
)
for /f "delims=" %%i in ('where python') do set PYTHON_PATH=%%i
echo       [OK] Python: %PYTHON_PATH%
echo.

:: Instalar dependencias
echo [3/5] Instalando dependencias...
python -m pip install requests --quiet --disable-pip-version-check
echo       [OK] requests instalado
echo.

:: Crear archivo de configuracion
echo [4/5] Creando archivo de configuracion...
echo # VexlyPOS - Configuracion del Agente Multi-Impresora > "%INSTALL_DIR%\config.txt"
echo # ================================================== >> "%INSTALL_DIR%\config.txt"
echo # >> "%INSTALL_DIR%\config.txt"
echo # URL del servidor (cambiar por tu dominio) >> "%INSTALL_DIR%\config.txt"
echo SERVER_URL=%SERVER_URL% >> "%INSTALL_DIR%\config.txt"
echo. >> "%INSTALL_DIR%\config.txt"
echo # Intervalo de polling en segundos >> "%INSTALL_DIR%\config.txt"
echo POLL_INTERVAL=3 >> "%INSTALL_DIR%\config.txt"
echo. >> "%INSTALL_DIR%\config.txt"
echo # Puerto de red para impresoras ESC/POS >> "%INSTALL_DIR%\config.txt"
echo NETWORK_PORT=9100 >> "%INSTALL_DIR%\config.txt"
echo. >> "%INSTALL_DIR%\config.txt"
echo # ================================================== >> "%INSTALL_DIR%\config.txt"
echo # IMPRESORAS (opcional - sobreescribe config del servidor) >> "%INSTALL_DIR%\config.txt"
echo # Formato: PRINTER_[CANAL]=IP >> "%INSTALL_DIR%\config.txt"
echo # El canal debe coincidir con el codigo en Config ^> Impresion >> "%INSTALL_DIR%\config.txt"
echo # ================================================== >> "%INSTALL_DIR%\config.txt"
echo # Descomenta y ajusta las IPs de tus impresoras: >> "%INSTALL_DIR%\config.txt"
echo # PRINTER_RECEIPT=192.168.1.114 >> "%INSTALL_DIR%\config.txt"
echo # PRINTER_KITCHEN=192.168.1.117 >> "%INSTALL_DIR%\config.txt"
echo # PRINTER_BAR=192.168.1.116 >> "%INSTALL_DIR%\config.txt"
echo       [OK] config.txt creado
echo.

:: Copiar agente
echo [5/5] Configurando agente...

:: Matar proceso anterior si existe
taskkill /f /im pythonw.exe >nul 2>&1

:: Descargar el agente del servidor
powershell -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SERVER_URL%/api/download/print-agent?printer_name=multi' -OutFile '%INSTALL_DIR%\VexlyPOS_PrintAgent.py' -UseBasicParsing } catch { Write-Host 'No se pudo descargar, copiando local...' }"

:: Si no se descargo, buscar archivo local
if not exist "%INSTALL_DIR%\VexlyPOS_PrintAgent.py" (
    if exist "%~dp0VexlyPOS_PrintAgent.py" (
        copy "%~dp0VexlyPOS_PrintAgent.py" "%INSTALL_DIR%\VexlyPOS_PrintAgent.py" >nul
        echo       [OK] Agente copiado desde directorio local
    ) else (
        echo       [ERROR] No se encontro el agente
        pause
        exit /b 1
    )
)

:: Crear archivo VBS para ejecutar sin ventana
echo Set WshShell = CreateObject("WScript.Shell") > "%INSTALL_DIR%\RunAgent.vbs"
echo WshShell.Run "pythonw ""%INSTALL_DIR%\VexlyPOS_PrintAgent.py""", 0, False >> "%INSTALL_DIR%\RunAgent.vbs"

:: Eliminar tarea anterior si existe
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

:: Crear tarea programada que inicie con Windows
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe "%INSTALL_DIR%\RunAgent.vbs"" /sc onlogon /rl highest /f >nul 2>&1
if %errorLevel% neq 0 (
    echo       [WARN] No se pudo crear tarea programada
) else (
    echo       [OK] Tarea programada creada (inicia con Windows)
)

:: Iniciar el agente ahora
echo.
echo Iniciando agente...
start "" wscript.exe "%INSTALL_DIR%\RunAgent.vbs"

echo.
echo ========================================================
echo       INSTALACION COMPLETADA EXITOSAMENTE
echo ========================================================
echo.
echo El agente esta corriendo en segundo plano.
echo Se iniciara automaticamente al encender la PC.
echo.
echo ARCHIVOS:
echo   %INSTALL_DIR%\VexlyPOS_PrintAgent.py  (agente)
echo   %INSTALL_DIR%\config.txt              (configuracion)
echo   %INSTALL_DIR%\VexlyPOS_PrintAgent.log (logs)
echo.
echo ========================================================
echo   CONFIGURACION DE IMPRESORAS:
echo.
echo   OPCION 1: Desde el sistema web
echo     Config ^> Impresion ^> Canales ^> IP Address
echo     (El agente la lee automaticamente del servidor)
echo.
echo   OPCION 2: Desde config.txt
echo     Editar %INSTALL_DIR%\config.txt
echo     Agregar: PRINTER_COCINA=192.168.1.117
echo.
echo   Luego reiniciar el agente:
echo     taskkill /f /im pythonw.exe
echo     wscript %INSTALL_DIR%\RunAgent.vbs
echo ========================================================
echo.
pause
