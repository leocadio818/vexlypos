#!/usr/bin/env python3
"""
MESA POS RD - Agente de Impresión USB
=====================================
Este script corre en la computadora donde está conectada la impresora USB.
Recibe trabajos de impresión del servidor POS y los envía a la impresora.

Requisitos:
  pip install python-escpos requests

Uso:
  python print_agent.py --server http://192.168.1.100:8001 --printer USB
"""

import argparse
import time
import sys
import json
import requests
from datetime import datetime

try:
    from escpos.printer import Usb, Network, Dummy
    ESCPOS_AVAILABLE = True
except ImportError:
    ESCPOS_AVAILABLE = False
    print("⚠️  python-escpos no instalado. Ejecuta: pip install python-escpos")

# Configuración de impresoras USB comunes (Vendor ID, Product ID)
KNOWN_PRINTERS = {
    "epson": (0x04b8, 0x0202),      # Epson TM-T20
    "epson_t88": (0x04b8, 0x0e15),  # Epson TM-T88
    "star": (0x0519, 0x0003),       # Star TSP100
    "generic": (0x0416, 0x5011),    # Generic 80mm
    "xprinter": (0x0483, 0x5743),   # XPrinter
    "pos58": (0x0416, 0x5011),      # POS-58
}

class PrintAgent:
    def __init__(self, server_url, printer_type="USB", printer_ip=None):
        self.server_url = server_url.rstrip('/')
        self.printer_type = printer_type
        self.printer_ip = printer_ip
        self.printer = None
        self.last_job_id = None
        
    def connect_printer(self):
        """Intenta conectar a la impresora"""
        if not ESCPOS_AVAILABLE:
            print("❌ python-escpos no disponible")
            return False
            
        if self.printer_type == "NETWORK" and self.printer_ip:
            try:
                self.printer = Network(self.printer_ip)
                print(f"✅ Conectado a impresora de red: {self.printer_ip}")
                return True
            except Exception as e:
                print(f"❌ Error conectando a {self.printer_ip}: {e}")
                return False
                
        elif self.printer_type == "USB":
            # Intentar con diferentes IDs de impresoras conocidas
            for name, (vid, pid) in KNOWN_PRINTERS.items():
                try:
                    self.printer = Usb(vid, pid)
                    print(f"✅ Conectado a impresora USB: {name} ({hex(vid)}:{hex(pid)})")
                    return True
                except Exception:
                    continue
            
            print("❌ No se encontró impresora USB compatible")
            print("   Impresoras soportadas:", list(KNOWN_PRINTERS.keys()))
            return False
            
        return False
    
    def print_escpos(self, commands):
        """Ejecuta comandos ESC/POS"""
        if not self.printer:
            if not self.connect_printer():
                return False
        
        try:
            for cmd in commands:
                cmd_type = cmd.get("type", "")
                
                if cmd_type == "center":
                    self.printer.set(align='center')
                    if cmd.get("bold"):
                        self.printer.set(bold=True)
                    if cmd.get("size") == "large":
                        self.printer.set(double_height=True, double_width=True)
                    self.printer.text(cmd.get("text", "") + "\n")
                    self.printer.set(bold=False, double_height=False, double_width=False)
                    
                elif cmd_type == "left":
                    self.printer.set(align='left')
                    if cmd.get("bold"):
                        self.printer.set(bold=True)
                    if cmd.get("size") == "large":
                        self.printer.set(double_height=True, double_width=True)
                    self.printer.text(cmd.get("text", "") + "\n")
                    self.printer.set(bold=False, double_height=False, double_width=False)
                    
                elif cmd_type == "right":
                    self.printer.set(align='right')
                    self.printer.text(cmd.get("text", "") + "\n")
                    
                elif cmd_type == "columns":
                    left_text = cmd.get("left", "")
                    right_text = cmd.get("right", "")
                    # Para 80mm con área imprimible de 72mm, aproximadamente 42 caracteres
                    width = 42
                    spaces = width - len(left_text) - len(right_text)
                    if spaces < 1:
                        spaces = 1
                    if cmd.get("bold"):
                        self.printer.set(bold=True)
                    self.printer.text(left_text + " " * spaces + right_text + "\n")
                    self.printer.set(bold=False)
                    
                elif cmd_type == "divider":
                    self.printer.text("-" * 42 + "\n")
                    
                elif cmd_type == "cut":
                    self.printer.cut()
                    
                elif cmd_type == "feed":
                    lines = cmd.get("lines", 1)
                    self.printer.text("\n" * lines)
                    
            return True
            
        except Exception as e:
            print(f"❌ Error imprimiendo: {e}")
            self.printer = None  # Reset connection
            return False
    
    def check_print_queue(self):
        """Verifica si hay trabajos pendientes en el servidor"""
        try:
            response = requests.get(
                f"{self.server_url}/api/print-queue/pending",
                timeout=5
            )
            if response.status_code == 200:
                return response.json()
            return []
        except Exception as e:
            return []
    
    def mark_job_completed(self, job_id, success=True):
        """Marca un trabajo como completado"""
        try:
            requests.post(
                f"{self.server_url}/api/print-queue/{job_id}/complete",
                json={"success": success},
                timeout=5
            )
        except Exception:
            pass
    
    def run_polling_mode(self, interval=2):
        """Modo polling: revisa periódicamente la cola de impresión"""
        print(f"\n🖨️  Agente de Impresión Mesa POS RD")
        print(f"   Servidor: {self.server_url}")
        print(f"   Tipo: {self.printer_type}")
        print(f"   Polling cada {interval} segundos")
        print(f"\n   Presiona Ctrl+C para salir\n")
        
        if not self.connect_printer():
            print("\n⚠️  Continuando sin impresora conectada...")
            print("   Los trabajos se procesarán cuando se conecte una impresora.\n")
        
        while True:
            try:
                jobs = self.check_print_queue()
                for job in jobs:
                    job_id = job.get("id")
                    if job_id == self.last_job_id:
                        continue
                        
                    print(f"📄 Trabajo recibido: {job.get('type', 'unknown')} - {job_id[:8]}...")
                    
                    commands = job.get("commands", [])
                    if commands:
                        success = self.print_escpos(commands)
                        self.mark_job_completed(job_id, success)
                        self.last_job_id = job_id
                        
                        if success:
                            print(f"   ✅ Impreso correctamente")
                        else:
                            print(f"   ❌ Error al imprimir")
                    
                time.sleep(interval)
                
            except KeyboardInterrupt:
                print("\n\n👋 Agente detenido")
                break
            except Exception as e:
                print(f"⚠️  Error: {e}")
                time.sleep(interval)


def test_printer():
    """Imprime un ticket de prueba"""
    if not ESCPOS_AVAILABLE:
        print("❌ python-escpos no instalado")
        return
        
    print("🔍 Buscando impresora USB...")
    
    for name, (vid, pid) in KNOWN_PRINTERS.items():
        try:
            p = Usb(vid, pid)
            print(f"✅ Encontrada: {name}")
            
            # Imprimir prueba
            p.set(align='center')
            p.text("================================\n")
            p.set(bold=True, double_height=True, double_width=True)
            p.text("MESA POS RD\n")
            p.set(bold=False, double_height=False, double_width=False)
            p.text("================================\n")
            p.text("\n")
            p.text("Prueba de Impresion\n")
            p.text(f"Fecha: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
            p.text("\n")
            p.text("Si puedes leer esto,\n")
            p.text("la impresora esta configurada\n")
            p.text("correctamente!\n")
            p.text("\n")
            p.text("================================\n")
            p.cut()
            
            print("✅ Ticket de prueba impreso!")
            return
            
        except Exception as e:
            continue
    
    print("❌ No se encontró ninguna impresora USB compatible")
    print("\nImpresoras soportadas:")
    for name, (vid, pid) in KNOWN_PRINTERS.items():
        print(f"  - {name}: {hex(vid)}:{hex(pid)}")
    print("\nPara encontrar tu impresora, ejecuta: lsusb (Linux) o revisa Administrador de dispositivos (Windows)")


def main():
    parser = argparse.ArgumentParser(description='Agente de Impresión Mesa POS RD')
    parser.add_argument('--server', '-s', default='http://localhost:8001',
                        help='URL del servidor POS (default: http://localhost:8001)')
    parser.add_argument('--printer', '-p', choices=['USB', 'NETWORK'], default='USB',
                        help='Tipo de conexión (default: USB)')
    parser.add_argument('--ip', help='IP de la impresora (solo para NETWORK)')
    parser.add_argument('--interval', '-i', type=int, default=2,
                        help='Intervalo de polling en segundos (default: 2)')
    parser.add_argument('--test', '-t', action='store_true',
                        help='Imprimir ticket de prueba')
    
    args = parser.parse_args()
    
    if args.test:
        test_printer()
        return
    
    agent = PrintAgent(
        server_url=args.server,
        printer_type=args.printer,
        printer_ip=args.ip
    )
    agent.run_polling_mode(interval=args.interval)


if __name__ == "__main__":
    main()
