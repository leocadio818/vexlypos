@echo off
REM ╔══════════════════════════════════════════════════════════════╗
REM ║     MESA POS - Instalador del Agente de Impresion           ║
REM ║     Este script instala y configura el agente               ║
REM ╚══════════════════════════════════════════════════════════════╝

echo.
echo ============================================================
echo     MESA POS - INSTALADOR DEL AGENTE DE IMPRESION
echo ============================================================
echo.

REM Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python no esta instalado.
    echo Por favor, descarga Python desde https://www.python.org/downloads/
    echo Asegurate de marcar "Add Python to PATH" durante la instalacion.
    pause
    exit /b 1
)

echo [OK] Python encontrado
echo.

REM Crear carpeta de instalacion
echo [1/5] Creando carpeta de instalacion...
if not exist "%USERPROFILE%\MesaPOS" mkdir "%USERPROFILE%\MesaPOS"

REM Instalar dependencias
echo [2/5] Instalando dependencias de Python...
echo      Esto puede tomar unos minutos...
pip install --quiet requests pystray Pillow plyer pywin32 python-escpos pyinstaller

if errorlevel 1 (
    echo [ERROR] Error instalando dependencias
    pause
    exit /b 1
)
echo [OK] Dependencias instaladas
echo.

REM Copiar script
echo [3/5] Copiando agente de impresion...
copy /Y "%~dp0print_agent_pro.py" "%USERPROFILE%\MesaPOS\print_agent_pro.py" >nul
echo [OK] Agente copiado
echo.

REM Crear ejecutable
echo [4/5] Creando ejecutable (.exe)...
echo      Esto puede tomar varios minutos...
cd "%USERPROFILE%\MesaPOS"
pyinstaller --onefile --windowed --name="MesaPOS-PrintAgent" print_agent_pro.py >nul 2>&1

if exist "%USERPROFILE%\MesaPOS\dist\MesaPOS-PrintAgent.exe" (
    echo [OK] Ejecutable creado exitosamente
    copy /Y "%USERPROFILE%\MesaPOS\dist\MesaPOS-PrintAgent.exe" "%USERPROFILE%\MesaPOS\MesaPOS-PrintAgent.exe" >nul
) else (
    echo [!] No se pudo crear el ejecutable
    echo     El agente funcionara con Python directamente
)
echo.

REM Crear acceso directo en el escritorio
echo [5/5] Creando acceso directo en el escritorio...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%USERPROFILE%\Desktop\Mesa POS Print Agent.lnk'); $Shortcut.TargetPath = '%USERPROFILE%\MesaPOS\MesaPOS-PrintAgent.exe'; $Shortcut.WorkingDirectory = '%USERPROFILE%\MesaPOS'; $Shortcut.Description = 'Agente de Impresion Mesa POS'; $Shortcut.Save()"
echo [OK] Acceso directo creado
echo.

REM Crear archivo de configuracion inicial
echo Creando configuracion inicial...
if not exist "%USERPROFILE%\MesaPOS\config.json" (
    echo {> "%USERPROFILE%\MesaPOS\config.json"
    echo   "api_url": "https://discount-ui-build.preview.emergentagent.com/api",>> "%USERPROFILE%\MesaPOS\config.json"
    echo   "poll_interval": 3,>> "%USERPROFILE%\MesaPOS\config.json"
    echo   "printers": {>> "%USERPROFILE%\MesaPOS\config.json"
    echo     "kitchen": "",>> "%USERPROFILE%\MesaPOS\config.json"
    echo     "bar": "",>> "%USERPROFILE%\MesaPOS\config.json"
    echo     "receipt": "Caja">> "%USERPROFILE%\MesaPOS\config.json"
    echo   },>> "%USERPROFILE%\MesaPOS\config.json"
    echo   "auto_start": true,>> "%USERPROFILE%\MesaPOS\config.json"
    echo   "show_notifications": true>> "%USERPROFILE%\MesaPOS\config.json"
    echo }>> "%USERPROFILE%\MesaPOS\config.json"
)
echo [OK] Configuracion creada
echo.

REM Limpiar archivos temporales
echo Limpiando archivos temporales...
if exist "%USERPROFILE%\MesaPOS\build" rmdir /s /q "%USERPROFILE%\MesaPOS\build" >nul 2>&1
if exist "%USERPROFILE%\MesaPOS\dist" rmdir /s /q "%USERPROFILE%\MesaPOS\dist" >nul 2>&1
if exist "%USERPROFILE%\MesaPOS\MesaPOS-PrintAgent.spec" del "%USERPROFILE%\MesaPOS\MesaPOS-PrintAgent.spec" >nul 2>&1
echo [OK] Limpieza completada
echo.

echo ============================================================
echo     INSTALACION COMPLETADA EXITOSAMENTE!
echo ============================================================
echo.
echo Ubicacion del agente:
echo   %USERPROFILE%\MesaPOS\MesaPOS-PrintAgent.exe
echo.
echo Configuracion de impresoras:
echo   %USERPROFILE%\MesaPOS\config.json
echo.
echo Para configurar tus impresoras:
echo   1. Abre el archivo config.json
echo   2. Cambia "Caja" por el nombre de tu impresora de recibos
echo   3. Agrega el nombre de tu impresora de cocina si tienes una
echo.
echo Para iniciar el agente:
echo   - Doble clic en "Mesa POS Print Agent" en el escritorio
echo   - O ejecuta: %USERPROFILE%\MesaPOS\MesaPOS-PrintAgent.exe
echo.
echo El agente aparecera como un icono en la bandeja del sistema
echo (junto al reloj de Windows)
echo.
echo Colores del icono:
echo   VERDE  = Conectado y listo
echo   AMARILLO = Imprimiendo
echo   ROJO   = Error (revisa la impresora)
echo.
pause
