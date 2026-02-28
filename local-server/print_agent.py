#!/usr/bin/env python3
"""
MESA POS - Agente de Impresion para Windows
Soporta multiples impresoras por canal (Cocina, Bar, Recibo)
Compatible con impresoras termicas 80mm ESC/POS
"""

import requests
import time
import sys
import argparse
from datetime import datetime

# Configuracion por defecto
DEFAULT_API_URL = "https://admin-group-manager.preview.emergentagent.com/api"
POLL_INTERVAL = 3  # segundos

# Mapeo de canales a impresoras Windows
# El usuario debe configurar esto segun su setup
CHANNEL_PRINTERS = {
    "kitchen": "",   # Nombre de impresora Windows para Cocina
    "bar": "",       # Nombre de impresora Windows para Bar
    "receipt": "Caja",  # Nombre de impresora Windows para Recibos
}

# Intentar cargar win32print
try:
    from escpos.printer import Win32Raw
    PRINTER_AVAILABLE = True
except ImportError:
    print("[!] Libreria win32print no instalada. Ejecuta: pip install pywin32")
    PRINTER_AVAILABLE = False


def get_printer(printer_name):
    """Obtiene una instancia de impresora por nombre"""
    if not PRINTER_AVAILABLE or not printer_name:
        return None
    try:
        return Win32Raw(printer_name)
    except Exception as e:
        print(f"[ERROR] No se pudo conectar a '{printer_name}': {e}")
        return None


def format_receipt_80mm(printer, data):
    """Formatea e imprime un recibo para papel 80mm"""
    try:
        # Encabezado del negocio - GRANDE
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
        
        # Info de la factura
        printer.set(align='left')
        printer.text(f"Factura: {data.get('bill_number', '')}\n")
        printer.text(f"Fecha: {data.get('date', '')}\n")
        if data.get('table_number'):
            printer.text(f"Mesa: {data.get('table_number')}\n")
        if data.get('waiter_name'):
            printer.text(f"Mesero: {data.get('waiter_name')}\n")
        if data.get('cashier_name'):
            printer.text(f"Cajero: {data.get('cashier_name')}\n")
        
        printer.text("-" * 42 + "\n")
        
        # Items - formato de tabla
        printer.set(bold=True)
        printer.text(f"{'CANT':<5}{'PRODUCTO':<25}{'TOTAL':>10}\n")
        printer.set(bold=False)
        printer.text("-" * 42 + "\n")
        
        for item in data.get("items", []):
            qty = item.get('quantity', 1)
            name = item.get('name', '')[:24]
            total = item.get('total', 0)
            printer.text(f"{qty:<5}{name:<25}{total:>10.2f}\n")
        
        printer.text("-" * 42 + "\n")
        
        # Totales
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
        
        printer.set(double_width=False, double_height=False, bold=False, align='center')
        if data.get('payment_method'):
            printer.text(f"\nPago: {data.get('payment_method')}\n")
        
        # Pie de pagina
        printer.text("\n")
        printer.text(data.get('footer_text', 'Gracias por su visita!') + "\n")
        printer.text("\n\n\n")
        printer.cut()
        
        return True
    except Exception as e:
        print(f"[ERROR] Error formateando recibo: {e}")
        return False


def format_comanda_80mm(printer, data):
    """Formatea e imprime una comanda para papel 80mm"""
    try:
        # Encabezado - GRANDE y visible
        printer.set(align='center', bold=True, double_width=True, double_height=True)
        printer.text(f"*** {data.get('channel_name', 'COCINA')} ***\n")
        
        printer.set(double_width=False, double_height=False)
        printer.text(f"MESA {data.get('table_number', '?')}\n")
        
        printer.set(bold=False)
        printer.text("=" * 42 + "\n")
        
        # Info
        printer.set(align='left')
        printer.text(f"Mesero: {data.get('waiter_name', '')}\n")
        printer.text(f"Hora: {data.get('date', '')[-8:]}\n")
        printer.text("-" * 42 + "\n")
        
        # Items - MUY GRANDE para cocina
        for item in data.get("items", []):
            qty = item.get('quantity', 1)
            name = item.get('name', '')
            
            # Cantidad y nombre GRANDE
            printer.set(bold=True, double_width=True, double_height=True)
            printer.text(f"{qty}x {name}\n")
            
            # Modificadores
            printer.set(double_width=False, double_height=False, bold=False)
            for mod in item.get('modifiers', []):
                if mod:
                    printer.text(f"   + {mod}\n")
            
            # Notas
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
        
        return True
    except Exception as e:
        print(f"[ERROR] Error formateando comanda: {e}")
        return False


def format_test_80mm(printer, data):
    """Imprime una pagina de prueba"""
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
        
        # Test de tamanos
        printer.set(bold=True)
        printer.text("Texto en negrita\n")
        printer.set(bold=False, double_width=True)
        printer.text("Texto ancho\n")
        printer.set(double_width=False, double_height=True)
        printer.text("Texto alto\n")
        printer.set(double_height=False)
        
        printer.text("\n\n\n")
        printer.cut()
        
        return True
    except Exception as e:
        print(f"[ERROR] Error en prueba: {e}")
        return False


def print_job(job):
    """Procesa e imprime un trabajo de la cola"""
    job_type = job.get("type", "receipt")
    channel = job.get("channel", "receipt")
    data = job.get("data", {})
    
    # Determinar impresora: primero del job, luego del mapeo de canales
    printer_name = job.get("printer_name") or CHANNEL_PRINTERS.get(channel, "")
    
    if not printer_name:
        print(f"[!] No hay impresora configurada para canal '{channel}'")
        return False
    
    printer = get_printer(printer_name)
    if not printer:
        return False
    
    print(f"[->] Imprimiendo {job_type} en '{printer_name}'...")
    
    try:
        if job_type == "receipt":
            return format_receipt_80mm(printer, data)
        elif job_type == "comanda":
            return format_comanda_80mm(printer, data)
        elif job_type == "test":
            return format_test_80mm(printer, data)
        else:
            print(f"[!] Tipo de trabajo desconocido: {job_type}")
            return False
    except Exception as e:
        print(f"[ERROR] Error imprimiendo: {e}")
        return False


def main(api_url):
    """Loop principal del agente"""
    print("=" * 50)
    print("  MESA POS - AGENTE DE IMPRESION")
    print("=" * 50)
    print(f"  Servidor: {api_url}")
    print(f"  Intervalo: {POLL_INTERVAL}s")
    print("-" * 50)
    print("  Impresoras configuradas:")
    for channel, printer in CHANNEL_PRINTERS.items():
        status = f"'{printer}'" if printer else "(sin configurar)"
        print(f"    {channel.title()}: {status}")
    print("=" * 50)
    print("  Presiona Ctrl+C para detener")
    print("=" * 50 + "\n")
    
    while True:
        try:
            # Obtener trabajos pendientes
            response = requests.get(f"{api_url}/print/queue", timeout=10)
            jobs = response.json()
            
            for job in jobs:
                job_id = job.get("id", "?")
                
                if print_job(job):
                    # Eliminar trabajo completado
                    try:
                        requests.delete(f"{api_url}/print/jobs/{job_id}", timeout=5)
                        print(f"[OK] Trabajo {job_id[:8]} completado")
                    except:
                        print(f"[!] No se pudo eliminar trabajo {job_id[:8]}")
                else:
                    print(f"[!] Error en trabajo {job_id[:8]}")
                    
        except requests.exceptions.RequestException as e:
            print(f"[!] Error de conexion: {e}")
        except Exception as e:
            print(f"[!] Error: {e}")
        
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Agente de impresion MESA POS')
    parser.add_argument('--server', '-s', default=DEFAULT_API_URL, 
                        help=f'URL del servidor API (default: {DEFAULT_API_URL})')
    parser.add_argument('--kitchen', '-k', default='',
                        help='Nombre de impresora Windows para Cocina')
    parser.add_argument('--bar', '-b', default='',
                        help='Nombre de impresora Windows para Bar')
    parser.add_argument('--receipt', '-r', default='Caja',
                        help='Nombre de impresora Windows para Recibos (default: Caja)')
    
    args = parser.parse_args()
    
    # Actualizar mapeo de impresoras
    if args.kitchen:
        CHANNEL_PRINTERS['kitchen'] = args.kitchen
    if args.bar:
        CHANNEL_PRINTERS['bar'] = args.bar
    if args.receipt:
        CHANNEL_PRINTERS['receipt'] = args.receipt
    
    try:
        main(args.server)
    except KeyboardInterrupt:
        print("\n[!] Agente detenido")
        sys.exit(0)
