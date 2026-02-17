#!/usr/bin/env python3
"""
MESA POS RD - Agente de Impresión Profesional
==============================================
Agente con icono en bandeja del sistema, notificaciones nativas
y soporte para impresoras Windows por nombre.

Para compilar a .exe:
    pyinstaller --onefile --noconsole --icon=printer_icon.ico print_agent_pro.py

Requisitos:
    pip install requests pystray Pillow plyer pywin32
"""

import os
import sys
import time
import json
import threading
import requests
from datetime import datetime
from io import BytesIO
import ctypes

# Windows printer support
try:
    import win32print
    import win32ui
    from PIL import Image, ImageDraw
    import pystray
    from pystray import MenuItem as item
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False

# Notifications
try:
    from plyer import notification
    PLYER_AVAILABLE = True
except ImportError:
    PLYER_AVAILABLE = False

# ============ CONFIGURACIÓN ============
# Cambiar esta URL a la de tu servidor POS
SERVER_URL = "https://payment-redesign-4.preview.emergentagent.com"

# Nombre de la impresora en Windows (como aparece en "Dispositivos e impresoras")
DEFAULT_PRINTER = "Caja"

# Intervalo de polling en segundos
POLL_INTERVAL = 3

# ============ ESTADO GLOBAL ============
class AgentState:
    def __init__(self):
        self.running = True
        self.status = "starting"  # starting, connected, error, printing
        self.printer_name = DEFAULT_PRINTER
        self.server_url = SERVER_URL
        self.last_error = ""
        self.jobs_printed = 0
        self.icon = None
        
state = AgentState()

# ============ ICONOS ============
def create_icon_image(color):
    """Crea un icono simple con el color indicado (semáforo)"""
    size = 64
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    
    # Círculo de fondo
    draw.ellipse([4, 4, size-4, size-4], fill=color, outline='white')
    
    # Dibujar una impresora simple
    # Cuerpo
    draw.rectangle([16, 24, 48, 44], fill='white', outline='black')
    # Papel arriba
    draw.rectangle([20, 12, 44, 26], fill='white', outline='black')
    # Bandeja abajo
    draw.rectangle([18, 42, 46, 52], fill='white', outline='black')
    
    return image

ICON_GREEN = None
ICON_YELLOW = None  
ICON_RED = None

def init_icons():
    global ICON_GREEN, ICON_YELLOW, ICON_RED
    ICON_GREEN = create_icon_image('#22C55E')   # Verde - Conectado
    ICON_YELLOW = create_icon_image('#EAB308')  # Amarillo - Imprimiendo
    ICON_RED = create_icon_image('#EF4444')     # Rojo - Error

# ============ NOTIFICACIONES ============
def show_notification(title, message, timeout=5):
    """Muestra una notificación nativa de Windows"""
    if PLYER_AVAILABLE:
        try:
            notification.notify(
                title=title,
                message=message,
                app_name="Mesa POS - Impresión",
                timeout=timeout
            )
        except Exception as e:
            print(f"Error en notificación: {e}")

# ============ IMPRESIÓN WINDOWS ============
def get_windows_printers():
    """Obtiene lista de impresoras instaladas en Windows"""
    if not WIN32_AVAILABLE:
        return []
    try:
        printers = []
        for p in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS):
            printers.append(p[2])  # Nombre de la impresora
        return printers
    except Exception as e:
        print(f"Error obteniendo impresoras: {e}")
        return []

def check_printer_exists(printer_name):
    """Verifica si la impresora existe"""
    printers = get_windows_printers()
    return printer_name in printers

def print_raw_to_windows(printer_name, data):
    """Envía datos RAW a una impresora Windows por nombre"""
    if not WIN32_AVAILABLE:
        raise Exception("pywin32 no disponible")
    
    try:
        # Abrir la impresora
        hprinter = win32print.OpenPrinter(printer_name)
        try:
            # Iniciar documento
            job_info = ("Mesa POS Print Job", None, "RAW")
            win32print.StartDocPrinter(hprinter, 1, job_info)
            try:
                win32print.StartPagePrinter(hprinter)
                # Enviar datos
                if isinstance(data, str):
                    data = data.encode('cp437', errors='replace')
                win32print.WritePrinter(hprinter, data)
                win32print.EndPagePrinter(hprinter)
            finally:
                win32print.EndDocPrinter(hprinter)
        finally:
            win32print.ClosePrinter(hprinter)
        return True
    except Exception as e:
        raise Exception(f"Error imprimiendo: {str(e)}")

def build_escpos_data(commands):
    """Construye datos ESC/POS desde los comandos"""
    ESC = b'\x1b'
    GS = b'\x1d'
    
    data = bytearray()
    
    # Inicializar impresora
    data.extend(ESC + b'@')
    
    for cmd in commands:
        cmd_type = cmd.get("type", "")
        text = cmd.get("text", "")
        
        if cmd_type == "center":
            data.extend(ESC + b'a\x01')  # Centrar
            if cmd.get("bold"):
                data.extend(ESC + b'E\x01')
            if cmd.get("size") == "large":
                data.extend(GS + b'!\x11')  # Doble alto y ancho
            data.extend(text.encode('cp437', errors='replace'))
            data.extend(b'\n')
            data.extend(ESC + b'E\x00')  # Quitar bold
            data.extend(GS + b'!\x00')   # Tamaño normal
            
        elif cmd_type == "left":
            data.extend(ESC + b'a\x00')  # Izquierda
            if cmd.get("bold"):
                data.extend(ESC + b'E\x01')
            if cmd.get("size") == "large":
                data.extend(GS + b'!\x11')
            data.extend(text.encode('cp437', errors='replace'))
            data.extend(b'\n')
            data.extend(ESC + b'E\x00')
            data.extend(GS + b'!\x00')
            
        elif cmd_type == "right":
            data.extend(ESC + b'a\x02')  # Derecha
            data.extend(text.encode('cp437', errors='replace'))
            data.extend(b'\n')
            
        elif cmd_type == "columns":
            data.extend(ESC + b'a\x00')  # Izquierda
            left = cmd.get("left", "")
            right = cmd.get("right", "")
            width = 48
            spaces = max(1, width - len(left) - len(right))
            line = left + " " * spaces + right
            if cmd.get("bold"):
                data.extend(ESC + b'E\x01')
            data.extend(line.encode('cp437', errors='replace'))
            data.extend(b'\n')
            data.extend(ESC + b'E\x00')
            
        elif cmd_type == "divider":
            data.extend(b'-' * 48)
            data.extend(b'\n')
            
        elif cmd_type == "feed":
            lines = cmd.get("lines", 1)
            data.extend(b'\n' * lines)
            
        elif cmd_type == "cut":
            data.extend(GS + b'V\x00')  # Corte total
    
    return bytes(data)

# ============ COMUNICACIÓN CON SERVIDOR ============
def check_server_connection():
    """Verifica conexión con el servidor"""
    try:
        response = requests.get(f"{state.server_url}/api", timeout=5)
        return response.status_code == 200
    except:
        return False

def get_pending_jobs():
    """Obtiene trabajos pendientes del servidor"""
    try:
        response = requests.get(
            f"{state.server_url}/api/print-queue/pending",
            params={"printer": state.printer_name},
            timeout=10
        )
        if response.status_code == 200:
            return response.json()
        return []
    except Exception as e:
        state.last_error = str(e)
        return []

def mark_job_complete(job_id, success=True):
    """Marca un trabajo como completado"""
    try:
        requests.post(
            f"{state.server_url}/api/print-queue/{job_id}/complete",
            json={"success": success},
            timeout=5
        )
    except:
        pass

# ============ LOOP PRINCIPAL ============
def update_icon_status():
    """Actualiza el icono según el estado"""
    if state.icon:
        if state.status == "error":
            state.icon.icon = ICON_RED
        elif state.status == "printing":
            state.icon.icon = ICON_YELLOW
        else:
            state.icon.icon = ICON_GREEN

def print_worker():
    """Worker que procesa la cola de impresión"""
    processed_jobs = set()
    
    # Verificar impresora al inicio
    if not check_printer_exists(state.printer_name):
        state.status = "error"
        state.last_error = f"Impresora '{state.printer_name}' no encontrada"
        show_notification(
            "Error de Impresora",
            f"No se encontró la impresora '{state.printer_name}'.\n"
            f"Impresoras disponibles: {', '.join(get_windows_printers())}"
        )
        update_icon_status()
    else:
        state.status = "connected"
        show_notification(
            "Mesa POS - Agente Activo",
            f"Conectado a impresora: {state.printer_name}"
        )
        update_icon_status()
    
    while state.running:
        try:
            # Verificar conexión con servidor
            if not check_server_connection():
                if state.status != "error":
                    state.status = "error"
                    state.last_error = "Sin conexión al servidor"
                    update_icon_status()
                time.sleep(POLL_INTERVAL)
                continue
            
            # Obtener trabajos pendientes
            jobs = get_pending_jobs()
            
            if state.status == "error" and state.last_error == "Sin conexión al servidor":
                state.status = "connected"
                update_icon_status()
            
            for job in jobs:
                job_id = job.get("id", "")
                
                # Evitar procesar duplicados
                if job_id in processed_jobs:
                    continue
                
                # Verificar si es para nuestra impresora
                job_printer = job.get("printer_name", DEFAULT_PRINTER)
                if job_printer != state.printer_name:
                    continue
                
                print(f"Procesando trabajo: {job_id[:8]}...")
                state.status = "printing"
                update_icon_status()
                
                try:
                    commands = job.get("commands", [])
                    if commands:
                        # Construir datos ESC/POS
                        raw_data = build_escpos_data(commands)
                        
                        # Enviar a impresora Windows
                        print_raw_to_windows(state.printer_name, raw_data)
                        
                        state.jobs_printed += 1
                        print(f"  ✓ Impreso correctamente")
                        mark_job_complete(job_id, True)
                    
                    processed_jobs.add(job_id)
                    
                except Exception as e:
                    print(f"  ✗ Error: {e}")
                    state.last_error = str(e)
                    state.status = "error"
                    update_icon_status()
                    
                    show_notification(
                        "Error de Impresión",
                        f"No se pudo imprimir: {str(e)[:100]}"
                    )
                    
                    mark_job_complete(job_id, False)
                    processed_jobs.add(job_id)
                
                finally:
                    if state.status == "printing":
                        state.status = "connected"
                        update_icon_status()
            
            # Limpiar trabajos procesados antiguos (mantener últimos 100)
            if len(processed_jobs) > 100:
                processed_jobs = set(list(processed_jobs)[-50:])
            
            time.sleep(POLL_INTERVAL)
            
        except Exception as e:
            print(f"Error en worker: {e}")
            time.sleep(POLL_INTERVAL)

# ============ MENÚ DE BANDEJA ============
def on_quit(icon, item):
    """Salir de la aplicación"""
    state.running = False
    icon.stop()

def on_test_print(icon, item):
    """Imprimir página de prueba"""
    try:
        test_commands = [
            {"type": "center", "text": "================================", "bold": False},
            {"type": "center", "text": "MESA POS RD", "bold": True, "size": "large"},
            {"type": "center", "text": "================================", "bold": False},
            {"type": "feed", "lines": 1},
            {"type": "center", "text": "PRUEBA DE IMPRESION", "bold": True},
            {"type": "feed", "lines": 1},
            {"type": "left", "text": f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M')}"},
            {"type": "left", "text": f"Impresora: {state.printer_name}"},
            {"type": "left", "text": f"Servidor: {state.server_url}"},
            {"type": "feed", "lines": 1},
            {"type": "center", "text": "Si puedes leer esto,"},
            {"type": "center", "text": "todo funciona correctamente!"},
            {"type": "feed", "lines": 2},
            {"type": "cut"}
        ]
        
        raw_data = build_escpos_data(test_commands)
        print_raw_to_windows(state.printer_name, raw_data)
        
        show_notification(
            "Prueba Exitosa",
            "Se imprimió la página de prueba correctamente."
        )
    except Exception as e:
        show_notification(
            "Error en Prueba",
            f"No se pudo imprimir: {str(e)[:100]}"
        )

def on_show_status(icon, item):
    """Mostrar estado actual"""
    printers = get_windows_printers()
    msg = f"Estado: {state.status}\n"
    msg += f"Impresora: {state.printer_name}\n"
    msg += f"Trabajos impresos: {state.jobs_printed}\n"
    if state.last_error:
        msg += f"Último error: {state.last_error[:50]}"
    
    show_notification("Estado del Agente", msg, timeout=10)

def on_show_printers(icon, item):
    """Mostrar impresoras disponibles"""
    printers = get_windows_printers()
    if printers:
        msg = "Impresoras instaladas:\n" + "\n".join(f"• {p}" for p in printers[:5])
    else:
        msg = "No se encontraron impresoras"
    show_notification("Impresoras", msg, timeout=10)

def create_menu():
    """Crea el menú de la bandeja del sistema"""
    return pystray.Menu(
        item('Estado', on_show_status),
        item('Imprimir Prueba', on_test_print),
        item('Ver Impresoras', on_show_printers),
        pystray.Menu.SEPARATOR,
        item('Salir', on_quit)
    )

# ============ MAIN ============
def main():
    if not WIN32_AVAILABLE:
        print("ERROR: Este programa requiere Windows y las siguientes librerías:")
        print("  pip install pywin32 pystray Pillow plyer requests")
        input("Presiona Enter para salir...")
        sys.exit(1)
    
    print("Mesa POS RD - Agente de Impresión")
    print("=" * 40)
    print(f"Servidor: {state.server_url}")
    print(f"Impresora: {state.printer_name}")
    print(f"Impresoras disponibles: {get_windows_printers()}")
    print("=" * 40)
    
    # Inicializar iconos
    init_icons()
    
    # Iniciar worker en hilo separado
    worker_thread = threading.Thread(target=print_worker, daemon=True)
    worker_thread.start()
    
    # Crear icono en bandeja del sistema
    state.icon = pystray.Icon(
        "mesa_pos_print",
        ICON_GREEN,
        "Mesa POS - Impresión",
        menu=create_menu()
    )
    
    # Ejecutar (esto bloquea hasta que se cierre)
    state.icon.run()

if __name__ == "__main__":
    main()
