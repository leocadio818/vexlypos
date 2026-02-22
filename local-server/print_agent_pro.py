#!/usr/bin/env python3
"""
MESA POS - Agente de Impresión Empresarial
==========================================
Ejecutable silencioso con icono en bandeja del sistema.
Compatible con impresoras térmicas 80mm ESC/POS.

Características:
- Icono de bandeja con semáforo de estado (Verde/Amarillo/Rojo)
- Notificaciones nativas de Windows
- Inicio automático con Windows
- Multi-impresora por canal (Cocina, Bar, Recibo)
- Manejo de errores con reportes al servidor

Requisitos:
    pip install requests pystray Pillow plyer pywin32 python-escpos

Para crear el .exe:
    pip install pyinstaller
    pyinstaller --onefile --windowed --icon=printer.ico --name="MesaPOS-PrintAgent" print_agent_pro.py
"""

import os
import sys
import time
import json
import threading
import logging
from datetime import datetime
from pathlib import Path

# Third-party imports
import requests
from PIL import Image, ImageDraw
import pystray
from pystray import MenuItem as item

# Windows-specific
try:
    from plyer import notification
    NOTIFICATIONS_AVAILABLE = True
except ImportError:
    NOTIFICATIONS_AVAILABLE = False

# ESC/POS printer
try:
    from escpos.printer import Win32Raw
    PRINTER_AVAILABLE = True
except ImportError:
    PRINTER_AVAILABLE = False

# ═══════════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════════

CONFIG_FILE = Path.home() / "MesaPOS" / "config.json"
LOG_FILE = Path.home() / "MesaPOS" / "agent.log"

DEFAULT_CONFIG = {
    "api_url": "https://pos-printing-system.preview.emergentagent.com/api",
    "poll_interval": 3,
    "printers": {
        "kitchen": "",
        "bar": "",
        "receipt": "Caja"
    },
    "auto_start": True,
    "show_notifications": True
}

# ═══════════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════════

def setup_logging():
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        handlers=[
            logging.FileHandler(LOG_FILE, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )
    return logging.getLogger("MesaPOS")

logger = setup_logging()

# ═══════════════════════════════════════════════════════════════════
# CONFIGURATION MANAGER
# ═══════════════════════════════════════════════════════════════════

class ConfigManager:
    def __init__(self):
        self.config = DEFAULT_CONFIG.copy()
        self.load()
    
    def load(self):
        try:
            if CONFIG_FILE.exists():
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    saved = json.load(f)
                    self.config.update(saved)
        except Exception as e:
            logger.error(f"Error loading config: {e}")
    
    def save(self):
        try:
            CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving config: {e}")
    
    def get(self, key, default=None):
        return self.config.get(key, default)
    
    def set(self, key, value):
        self.config[key] = value
        self.save()

# ═══════════════════════════════════════════════════════════════════
# SYSTEM TRAY ICON
# ═══════════════════════════════════════════════════════════════════

class StatusIcon:
    """Icono de bandeja del sistema con semáforo de estado"""
    
    COLORS = {
        'green': '#22c55e',   # Conectado y listo
        'yellow': '#eab308',  # Ocupado/buscando
        'red': '#ef4444',     # Error
        'gray': '#6b7280'     # Desconectado
    }
    
    def __init__(self):
        self.icon = None
        self.status = 'gray'
        self.status_text = "Iniciando..."
        self.jobs_processed = 0
        self.last_error = None
    
    def create_image(self, color):
        """Crea el icono del semáforo"""
        size = 64
        image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        
        # Fondo circular
        draw.ellipse([4, 4, size-4, size-4], fill=color, outline='white', width=2)
        
        # Símbolo de impresora simplificado
        printer_color = 'white'
        # Cuerpo
        draw.rectangle([18, 24, 46, 40], fill=printer_color)
        # Bandeja superior
        draw.rectangle([22, 18, 42, 24], fill=printer_color)
        # Papel
        draw.rectangle([24, 40, 40, 50], fill=printer_color)
        
        return image
    
    def set_status(self, status, text=""):
        """Actualiza el estado del icono"""
        self.status = status
        self.status_text = text
        if self.icon:
            color = self.COLORS.get(status, self.COLORS['gray'])
            self.icon.icon = self.create_image(color)
            self.icon.title = f"Mesa POS Print Agent\n{text}"
    
    def get_menu(self):
        """Menú del icono de bandeja"""
        return pystray.Menu(
            item(f'Estado: {self.status_text}', None, enabled=False),
            item(f'Trabajos procesados: {self.jobs_processed}', None, enabled=False),
            pystray.Menu.SEPARATOR,
            item('Abrir configuración', self.open_config),
            item('Ver logs', self.open_logs),
            pystray.Menu.SEPARATOR,
            item('Reiniciar agente', self.restart_agent),
            item('Salir', self.quit_agent)
        )
    
    def open_config(self, icon, item):
        os.startfile(str(CONFIG_FILE.parent))
    
    def open_logs(self, icon, item):
        if LOG_FILE.exists():
            os.startfile(str(LOG_FILE))
    
    def restart_agent(self, icon, item):
        logger.info("Reiniciando agente...")
        os.execv(sys.executable, ['python'] + sys.argv)
    
    def quit_agent(self, icon, item):
        logger.info("Cerrando agente...")
        icon.stop()
        sys.exit(0)
    
    def run(self, agent):
        """Inicia el icono de bandeja"""
        self.icon = pystray.Icon(
            "MesaPOS",
            self.create_image(self.COLORS['gray']),
            "Mesa POS Print Agent",
            menu=self.get_menu()
        )
        
        # Iniciar el agente en un hilo separado
        agent_thread = threading.Thread(target=agent.run, daemon=True)
        agent_thread.start()
        
        # Correr el icono (bloquea)
        self.icon.run()

# ═══════════════════════════════════════════════════════════════════
# NOTIFICATIONS
# ═══════════════════════════════════════════════════════════════════

class NotificationManager:
    """Maneja notificaciones nativas de Windows"""
    
    @staticmethod
    def show(title, message, timeout=5):
        if not NOTIFICATIONS_AVAILABLE:
            return
        try:
            notification.notify(
                title=title,
                message=message,
                app_name="Mesa POS Print Agent",
                timeout=timeout
            )
        except Exception as e:
            logger.error(f"Error showing notification: {e}")
    
    @staticmethod
    def error(message):
        NotificationManager.show("⚠️ Error de Impresión", message, timeout=10)
    
    @staticmethod
    def success(message):
        NotificationManager.show("✅ Mesa POS", message, timeout=3)
    
    @staticmethod
    def warning(message):
        NotificationManager.show("⚡ Advertencia", message, timeout=5)

# ═══════════════════════════════════════════════════════════════════
# PRINTER MANAGER
# ═══════════════════════════════════════════════════════════════════

class PrinterManager:
    """Gestiona las impresoras y el formateo de tickets"""
    
    def __init__(self, config):
        self.config = config
        self.printer_cache = {}
        self.errors = {}
    
    def get_printer(self, printer_name):
        """Obtiene una instancia de impresora"""
        if not PRINTER_AVAILABLE or not printer_name:
            return None
        
        # Cache de impresoras
        if printer_name in self.printer_cache:
            return self.printer_cache[printer_name]
        
        try:
            printer = Win32Raw(printer_name)
            self.printer_cache[printer_name] = printer
            self.errors.pop(printer_name, None)
            return printer
        except Exception as e:
            error_msg = str(e)
            if printer_name not in self.errors or self.errors[printer_name] != error_msg:
                self.errors[printer_name] = error_msg
                logger.error(f"Error conectando a '{printer_name}': {e}")
                NotificationManager.error(f"No se puede conectar a la impresora '{printer_name}'")
            return None
    
    def print_receipt(self, printer, data):
        """Imprime un recibo en formato 80mm"""
        try:
            # === ENCABEZADO ===
            printer.set(align='center', bold=True, double_width=True, double_height=True)
            printer.text(f"{data.get('business_name', 'RESTAURANTE')}\n")
            
            printer.set(double_width=False, double_height=False, bold=False)
            if data.get('business_address'):
                printer.text(f"{data.get('business_address')}\n")
            if data.get('rnc'):
                printer.text(f"RNC: {data.get('rnc')}\n")
            if data.get('phone'):
                printer.text(f"Tel: {data.get('phone')}\n")
            
            printer.text("=" * 42 + "\n")
            
            # === INFO FACTURA ===
            printer.set(align='left')
            if data.get('bill_number'):
                printer.text(f"Factura: {data.get('bill_number')}\n")
            printer.text(f"Fecha: {data.get('date', '')}\n")
            if data.get('table_number'):
                printer.text(f"Mesa: {data.get('table_number')}\n")
            if data.get('waiter_name'):
                printer.text(f"Mesero: {data.get('waiter_name')}\n")
            if data.get('cashier_name'):
                printer.text(f"Cajero: {data.get('cashier_name')}\n")
            
            printer.text("-" * 42 + "\n")
            
            # === ITEMS ===
            printer.set(bold=True)
            printer.text(f"{'CANT':<5}{'PRODUCTO':<25}{'TOTAL':>10}\n")
            printer.set(bold=False)
            printer.text("-" * 42 + "\n")
            
            for item in data.get("items", []):
                qty = item.get('quantity', 1)
                name = str(item.get('name', ''))[:24]
                total = item.get('total', 0)
                printer.text(f"{qty:<5}{name:<25}{total:>10.2f}\n")
            
            printer.text("-" * 42 + "\n")
            
            # === TOTALES ===
            printer.set(align='right')
            subtotal = data.get('subtotal', 0)
            itbis = data.get('itbis', 0)
            tip = data.get('tip', 0)
            discount = data.get('discount', 0)
            total = data.get('total', 0)
            
            printer.text(f"{'Subtotal:':<20}{subtotal:>20.2f}\n")
            if itbis > 0:
                printer.text(f"{'ITBIS 18%:':<20}{itbis:>20.2f}\n")
            if tip > 0:
                printer.text(f"{'Propina 10%:':<20}{tip:>20.2f}\n")
            if discount > 0:
                printer.text(f"{'Descuento:':<20}{-discount:>20.2f}\n")
            
            printer.text("=" * 42 + "\n")
            printer.set(bold=True, double_width=True, double_height=True)
            printer.text(f"TOTAL: RD$ {total:.2f}\n")
            
            # === PIE ===
            printer.set(double_width=False, double_height=False, bold=False, align='center')
            if data.get('payment_method'):
                printer.text(f"\nPago: {data.get('payment_method')}\n")
            
            printer.text("\n")
            printer.text(data.get('footer_text', 'Gracias por su visita!') + "\n")
            printer.text("\n\n\n")
            printer.cut()
            
            return True, None
        except Exception as e:
            return False, str(e)
    
    def print_comanda(self, printer, data):
        """Imprime una comanda de cocina/bar en formato 80mm"""
        try:
            # === ENCABEZADO GRANDE ===
            printer.set(align='center', bold=True, double_width=True, double_height=True)
            printer.text(f"*** {data.get('channel_name', 'COCINA')} ***\n")
            printer.text(f"MESA {data.get('table_number', '?')}\n")
            
            printer.set(double_width=False, double_height=False, bold=False)
            printer.text("=" * 42 + "\n")
            
            # === INFO ===
            printer.set(align='left')
            printer.text(f"Mesero: {data.get('waiter_name', '')}\n")
            printer.text(f"Hora: {data.get('date', '')[-8:]}\n")
            printer.text("-" * 42 + "\n")
            
            # === ITEMS GRANDES ===
            for item in data.get("items", []):
                qty = item.get('quantity', 1)
                name = item.get('name', '')
                
                printer.set(bold=True, double_width=True, double_height=True)
                printer.text(f"{qty}x {name}\n")
                
                printer.set(double_width=False, double_height=False, bold=False)
                for mod in item.get('modifiers', []):
                    if mod:
                        printer.text(f"   + {mod}\n")
                
                if item.get('notes'):
                    printer.set(bold=True)
                    printer.text(f"   NOTA: {item.get('notes')}\n")
                    printer.set(bold=False)
                
                printer.text("\n")
            
            printer.text("-" * 42 + "\n")
            printer.set(align='center')
            printer.text(f"Orden: {data.get('order_number', '')[:8]}\n")
            printer.text("\n\n\n")
            printer.cut()
            
            return True, None
        except Exception as e:
            return False, str(e)
    
    def print_test(self, printer, data):
        """Imprime una página de prueba"""
        try:
            printer.set(align='center', bold=True, double_width=True, double_height=True)
            printer.text(f"{data.get('business_name', 'MESA POS')}\n")
            
            printer.set(double_width=False, double_height=False, bold=False)
            printer.text("=" * 42 + "\n")
            printer.text("PRUEBA DE IMPRESION\n")
            printer.text("=" * 42 + "\n\n")
            
            printer.set(align='left')
            printer.text(f"Canal: {data.get('channel_name', '?')}\n")
            printer.text(f"Impresora: {data.get('printer_name', '?')}\n")
            printer.text(f"Fecha: {data.get('date', '')}\n\n")
            
            printer.set(align='center')
            printer.text("Si puedes leer esto,\n")
            printer.text("la impresora funciona!\n\n")
            printer.text("\n\n\n")
            printer.cut()
            
            return True, None
        except Exception as e:
            return False, str(e)

# ═══════════════════════════════════════════════════════════════════
# PRINT AGENT
# ═══════════════════════════════════════════════════════════════════

class PrintAgent:
    """Agente principal de impresión"""
    
    def __init__(self, config, status_icon):
        self.config = config
        self.status_icon = status_icon
        self.printer_manager = PrinterManager(config)
        self.running = True
        self.api_url = config.get('api_url')
        self.poll_interval = config.get('poll_interval', 3)
    
    def report_error(self, job_id, error_message):
        """Reporta un error al servidor"""
        try:
            requests.post(
                f"{self.api_url}/print/jobs/{job_id}/error",
                json={"error": error_message},
                timeout=5
            )
        except:
            pass
    
    def process_job(self, job):
        """Procesa un trabajo de impresión"""
        job_id = job.get("id", "?")
        job_type = job.get("type", "receipt")
        channel = job.get("channel", "receipt")
        data = job.get("data", {})
        
        # Obtener nombre de impresora
        printer_name = job.get("printer_name") or self.config.get('printers', {}).get(channel, "")
        
        if not printer_name:
            error = f"No hay impresora configurada para canal '{channel}'"
            logger.warning(error)
            NotificationManager.warning(error)
            return False, error
        
        # Obtener instancia de impresora
        printer = self.printer_manager.get_printer(printer_name)
        if not printer:
            error = f"No se puede conectar a '{printer_name}'"
            return False, error
        
        # Actualizar estado
        self.status_icon.set_status('yellow', f"Imprimiendo en {printer_name}...")
        
        # Imprimir según tipo
        if job_type == "receipt":
            success, error = self.printer_manager.print_receipt(printer, data)
        elif job_type == "comanda":
            success, error = self.printer_manager.print_comanda(printer, data)
        elif job_type == "test":
            success, error = self.printer_manager.print_test(printer, data)
        else:
            success, error = False, f"Tipo de trabajo desconocido: {job_type}"
        
        return success, error
    
    def delete_job(self, job_id):
        """Elimina un trabajo completado"""
        try:
            requests.delete(f"{self.api_url}/print/jobs/{job_id}", timeout=5)
            return True
        except Exception as e:
            logger.error(f"Error eliminando trabajo: {e}")
            return False
    
    def fetch_jobs(self):
        """Obtiene trabajos pendientes del servidor"""
        try:
            response = requests.get(f"{self.api_url}/print/queue", timeout=10)
            return response.json()
        except requests.exceptions.ConnectionError:
            return None
        except Exception as e:
            logger.error(f"Error obteniendo trabajos: {e}")
            return []
    
    def run(self):
        """Loop principal del agente"""
        logger.info("=" * 50)
        logger.info("MESA POS - Agente de Impresión Iniciado")
        logger.info(f"Servidor: {self.api_url}")
        logger.info(f"Intervalo: {self.poll_interval}s")
        logger.info("=" * 50)
        
        NotificationManager.success("Agente de impresión iniciado")
        
        consecutive_errors = 0
        
        while self.running:
            try:
                # Obtener trabajos
                jobs = self.fetch_jobs()
                
                if jobs is None:
                    # Error de conexión
                    consecutive_errors += 1
                    if consecutive_errors >= 3:
                        self.status_icon.set_status('red', "Sin conexión al servidor")
                        if consecutive_errors == 3:
                            NotificationManager.error("No se puede conectar al servidor Mesa POS")
                else:
                    consecutive_errors = 0
                    
                    if not jobs:
                        self.status_icon.set_status('green', "Listo - esperando trabajos")
                    
                    for job in jobs:
                        job_id = job.get('id', '?')
                        logger.info(f"Procesando trabajo: {job_id[:8]}...")
                        
                        success, error = self.process_job(job)
                        
                        if success:
                            self.delete_job(job_id)
                            self.status_icon.jobs_processed += 1
                            logger.info(f"Trabajo {job_id[:8]} completado")
                            self.status_icon.set_status('green', f"Listo - {self.status_icon.jobs_processed} trabajos procesados")
                        else:
                            logger.error(f"Error en trabajo {job_id[:8]}: {error}")
                            self.report_error(job_id, error)
                            self.status_icon.set_status('red', f"Error: {error[:30]}...")
                            NotificationManager.error(f"Error imprimiendo: {error}")
                            # Eliminar trabajo con error para no bloquearse
                            self.delete_job(job_id)
                
            except Exception as e:
                logger.error(f"Error en loop principal: {e}")
                self.status_icon.set_status('red', f"Error: {str(e)[:30]}...")
            
            time.sleep(self.poll_interval)
    
    def stop(self):
        self.running = False

# ═══════════════════════════════════════════════════════════════════
# AUTO-START WITH WINDOWS
# ═══════════════════════════════════════════════════════════════════

def setup_autostart():
    """Configura el inicio automático con Windows"""
    try:
        import winreg
        
        # Obtener ruta del ejecutable actual
        if getattr(sys, 'frozen', False):
            exe_path = sys.executable
        else:
            exe_path = f'pythonw "{os.path.abspath(__file__)}"'
        
        # Abrir clave de registro
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE
        )
        
        # Establecer valor
        winreg.SetValueEx(key, "MesaPOS-PrintAgent", 0, winreg.REG_SZ, exe_path)
        winreg.CloseKey(key)
        
        logger.info("Inicio automático configurado correctamente")
        return True
    except Exception as e:
        logger.error(f"Error configurando inicio automático: {e}")
        return False

def remove_autostart():
    """Elimina el inicio automático"""
    try:
        import winreg
        
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE
        )
        
        try:
            winreg.DeleteValue(key, "MesaPOS-PrintAgent")
        except FileNotFoundError:
            pass
        
        winreg.CloseKey(key)
        return True
    except Exception as e:
        logger.error(f"Error eliminando inicio automático: {e}")
        return False

# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

def main():
    # Cargar configuración
    config = ConfigManager()
    
    # Configurar inicio automático si está habilitado
    if config.get('auto_start', True):
        setup_autostart()
    
    # Crear componentes
    status_icon = StatusIcon()
    agent = PrintAgent(config, status_icon)
    
    # Iniciar (el icono de bandeja bloquea el hilo principal)
    try:
        status_icon.run(agent)
    except KeyboardInterrupt:
        logger.info("Agente detenido por el usuario")
    except Exception as e:
        logger.error(f"Error fatal: {e}")
        NotificationManager.error(f"Error fatal: {e}")

if __name__ == "__main__":
    main()
