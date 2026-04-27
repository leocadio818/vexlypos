#!/usr/bin/env python3
"""
VexlyPOS — Print Agent Multi-Impresora
=======================================
Un solo agente que maneja MÚLTIPLES impresoras por IP de red.
Cada canal de impresión (Cocina, Bar, Caja1, Caja2) tiene su propia IP.
El agente recibe trabajos del servidor y los enruta a la impresora correcta.

Requisitos:
    pip install requests

Uso:
    python VexlyPOS_PrintAgent.py
    
Configuración:
    El agente lee la configuración de impresoras del servidor automáticamente.
    También puede leer config.txt como fallback.
"""

import os
import sys
import time
import json
import socket
import logging
import requests
from datetime import datetime
from pathlib import Path

# ============ LOGGING ============
SCRIPT_DIR = Path(__file__).parent
LOG_FILE = SCRIPT_DIR / "VexlyPOS_PrintAgent.log"
CONFIG_FILE = SCRIPT_DIR / "config.txt"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("VexlyPOS")

# ============ CONFIGURATION ============
class Config:
    def __init__(self):
        self.server_url = "https://vexlyapp.com"
        self.poll_interval = 3
        self.network_port = 9100
        self.printer_map = {}  # channel_code → ip_address
        self.load_config_file()
    
    def load_config_file(self):
        """Load config.txt for server URL and optional printer overrides"""
        if not CONFIG_FILE.exists():
            logger.info("No config.txt found, using defaults")
            return
        try:
            for line in CONFIG_FILE.read_text(encoding='utf-8').splitlines():
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    key, val = key.strip().upper(), val.strip()
                    if key == 'SERVER_URL':
                        self.server_url = val
                    elif key == 'POLL_INTERVAL':
                        self.poll_interval = int(val)
                    elif key == 'NETWORK_PORT':
                        self.network_port = int(val)
                    elif key.startswith('PRINTER_'):
                        # PRINTER_COCINA=192.168.1.117
                        channel = key.replace('PRINTER_', '').lower()
                        self.printer_map[channel] = val
            logger.info(f"Config loaded: server={self.server_url}, poll={self.poll_interval}s")
            if self.printer_map:
                logger.info(f"Local printer overrides: {self.printer_map}")
        except Exception as e:
            logger.error(f"Error reading config.txt: {e}")
    
    def load_from_server(self):
        """Fetch printer config from server (channel → IP mapping)"""
        try:
            url = f"{self.server_url}/api/print/config"
            r = requests.get(url, timeout=10)
            if r.status_code == 200:
                data = r.json()
                for ch in data.get("channels", []):
                    code = ch.get("code", "")
                    ip = ch.get("ip_address", "")
                    if code and ip:
                        # Don't override local config.txt entries
                        if code not in self.printer_map:
                            self.printer_map[code] = ip
                logger.info(f"Server printer config loaded: {self.printer_map}")
                return True
            else:
                logger.warning(f"Could not fetch server config: HTTP {r.status_code}")
        except Exception as e:
            logger.error(f"Error fetching server config: {e}")
        return False


config = Config()

# ============ ESC/POS COMMANDS ============
ESC = b'\x1b'
GS = b'\x1d'
INIT = ESC + b'@'
CUT = GS + b'V' + b'\x41' + b'\x00'
BOLD_ON = ESC + b'E' + b'\x01'
BOLD_OFF = ESC + b'E' + b'\x00'
ALIGN_CENTER = ESC + b'a' + b'\x01'
ALIGN_LEFT = ESC + b'a' + b'\x00'
ALIGN_RIGHT = ESC + b'a' + b'\x02'
DOUBLE_SIZE = ESC + b'!' + b'\x30'
NORMAL_SIZE = ESC + b'!' + b'\x00'
FEED = b'\n'

def encode_text(text):
    """Encode text for ESC/POS printers"""
    try:
        return text.encode('cp437')
    except:
        try:
            return text.encode('latin-1', errors='replace')
        except:
            return text.encode('ascii', errors='replace')

def generate_qr_escpos(data_str, size=6):
    """Generate QR code using ESC/POS native QR commands (GS ( k).
    
    Uses native ESC/POS QR code commands which are universally supported by
    thermal printers (Epson, Xprinter, ZJiang, 3nStar, etc.) and don't depend
    on raster bitmap support (GS v 0). This is the most compatible approach.
    """
    try:
        if not data_str:
            return None
        
        data_bytes = data_str.encode('utf-8', errors='replace')
        if len(data_bytes) > 7089:
            logger.warning(f"QR data too long: {len(data_bytes)} bytes (max 7089)")
            return None
        
        buf = bytearray()
        buf += ALIGN_CENTER
        
        # GS ( k — Select QR Code model: Model 2
        # Format: 1D 28 6B 04 00 31 41 32 00
        buf += b'\x1D\x28\x6B\x04\x00\x31\x41\x32\x00'
        
        # GS ( k — Set QR module size (1-16, default 6 for ~25mm wide)
        # Format: 1D 28 6B 03 00 31 43 n
        qr_size = max(1, min(16, int(size)))
        buf += b'\x1D\x28\x6B\x03\x00\x31\x43' + bytes([qr_size])
        
        # GS ( k — Set error correction level: M (medium, ~15% recovery)
        # Format: 1D 28 6B 03 00 31 45 31  (0x30=L, 0x31=M, 0x32=Q, 0x33=H)
        buf += b'\x1D\x28\x6B\x03\x00\x31\x45\x31'
        
        # GS ( k — Store QR data in symbol storage area
        # Format: 1D 28 6B pL pH 31 50 30 [data]
        # Length = data_bytes length + 3
        store_len = len(data_bytes) + 3
        pL = store_len & 0xFF
        pH = (store_len >> 8) & 0xFF
        buf += b'\x1D\x28\x6B' + bytes([pL, pH]) + b'\x31\x50\x30' + data_bytes
        
        # GS ( k — Print QR code from symbol storage
        # Format: 1D 28 6B 03 00 31 51 30
        buf += b'\x1D\x28\x6B\x03\x00\x31\x51\x30'
        
        buf += ALIGN_LEFT
        return bytes(buf)
    except Exception as e:
        logger.warning(f"QR generation failed: {e}")
        return None

# ============ NETWORK PRINTER ============
def send_to_printer(ip, data_bytes, port=9100, timeout=10):
    """Send raw bytes to a network printer via TCP socket"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        sock.connect((ip, port))
        sock.sendall(data_bytes)
        sock.close()
        return True, "OK"
    except socket.timeout:
        return False, f"Timeout connecting to {ip}:{port}"
    except ConnectionRefusedError:
        return False, f"Connection refused at {ip}:{port}"
    except Exception as e:
        return False, str(e)

# ============ RECEIPT FORMATTER ============
def format_receipt(data):
    """Format receipt/invoice data into ESC/POS bytes"""
    buf = bytearray()
    buf += INIT
    
    # Header - Restaurant name
    restaurant = data.get("restaurant_name", "")
    rnc = data.get("rnc", "")
    
    buf += ALIGN_CENTER
    buf += DOUBLE_SIZE
    buf += encode_text(restaurant) + FEED
    buf += NORMAL_SIZE
    if rnc:
        buf += encode_text(f"RNC: {rnc}") + FEED
    
    address = data.get("address", "")
    phone = data.get("phone", "")
    if address:
        buf += encode_text(address) + FEED
    if phone:
        buf += encode_text(f"Tel: {phone}") + FEED
    
    buf += encode_text("=" * 42) + FEED
    
    # Transaction info
    buf += ALIGN_LEFT
    trans = data.get("transaction_number", "")
    if trans:
        buf += BOLD_ON + encode_text(f"Trans: T-{trans}") + BOLD_OFF + FEED
    
    ncf = data.get("ncf_number", "")
    if ncf:
        buf += encode_text(f"NCF: {ncf}") + FEED
    
    ncf_type = data.get("ncf_type", "")
    if ncf_type:
        buf += encode_text(f"Tipo: {ncf_type}") + FEED
    
    table = data.get("table_number", "")
    waiter = data.get("waiter_name", "")
    cashier = data.get("cashier_name", "")
    
    if table:
        buf += encode_text(f"Mesa: {table}") + FEED
    if waiter:
        buf += encode_text(f"Mesero: {waiter}") + FEED
    if cashier:
        buf += encode_text(f"Cajero: {cashier}") + FEED
    
    date = data.get("date", datetime.now().strftime("%d/%m/%Y %I:%M %p"))
    buf += encode_text(f"Fecha: {date}") + FEED
    
    # Customer fiscal data
    razon = data.get("customer_razon_social", "")
    fiscal_id = data.get("customer_fiscal_id", "")
    if razon:
        buf += encode_text(f"Cliente: {razon}") + FEED
    if fiscal_id:
        buf += encode_text(f"RNC/Cedula: {fiscal_id}") + FEED
    
    buf += encode_text("-" * 42) + FEED
    
    # Items
    items = data.get("items", [])
    for item in items:
        name = item.get("product_name", item.get("name", ""))
        qty = item.get("quantity", 1)
        total = item.get("total", 0)
        line = f"{qty}x {name}"
        price_str = f"${total:,.2f}"
        padding = 42 - len(line) - len(price_str)
        if padding < 1:
            padding = 1
        buf += encode_text(f"{line}{' ' * padding}{price_str}") + FEED
        
        # Modifiers
        for mod in item.get("modifiers", []):
            mod_name = mod.get("name", "") if isinstance(mod, dict) else str(mod)
            mod_price = mod.get("price", 0) if isinstance(mod, dict) else 0
            if mod_price > 0:
                buf += encode_text(f"  + {mod_name}  ${mod_price:,.2f}") + FEED
            else:
                buf += encode_text(f"  + {mod_name}") + FEED
    
    buf += encode_text("-" * 42) + FEED
    
    # Totals
    subtotal = data.get("subtotal", 0)
    itbis = data.get("itbis", 0)
    tip = data.get("tip", 0)
    total = data.get("total", 0)
    
    def right_align(label, value):
        v = f"${value:,.2f}"
        p = 42 - len(label) - len(v)
        return encode_text(f"{label}{' ' * max(1,p)}{v}") + FEED
    
    buf += right_align("Subtotal:", subtotal)
    if itbis > 0:
        buf += right_align("ITBIS:", itbis)
    if tip > 0:
        buf += right_align("Propina Legal:", tip)
    
    discount = data.get("discount_applied")
    if discount and isinstance(discount, dict) and discount.get("amount", 0) > 0:
        buf += right_align(f"Descuento ({discount.get('name','')}):", -discount["amount"])
    
    buf += encode_text("=" * 42) + FEED
    buf += BOLD_ON + DOUBLE_SIZE
    total_str = f"${total:,.2f}"
    buf += ALIGN_RIGHT + encode_text(f"TOTAL: {total_str}") + FEED
    buf += NORMAL_SIZE + BOLD_OFF + ALIGN_LEFT
    
    # Payment info
    payment = data.get("payment_method", "")
    if payment:
        buf += FEED + encode_text(f"Forma de pago: {payment}") + FEED
    
    amount_received = data.get("amount_received", 0)
    if amount_received > total:
        buf += right_align("Recibido:", amount_received)
        buf += right_align("Cambio:", amount_received - total)
    
    # Footer
    footer = data.get("footer_text", "")
    if footer:
        buf += FEED + ALIGN_CENTER + encode_text(footer) + FEED
    
    buf += FEED + ALIGN_CENTER + encode_text("Gracias por su visita!") + FEED
    buf += FEED + FEED + CUT
    
    return bytes(buf)

# ============ COMANDA FORMATTER ============
def format_comanda(data):
    """Format kitchen/bar order command into ESC/POS bytes"""
    buf = bytearray()
    buf += INIT
    
    channel_name = data.get("channel_name", data.get("channel", "COCINA")).upper()
    table = data.get("table_number", "?")
    waiter = data.get("waiter_name", "")
    account = data.get("account_number", 1)
    
    buf += ALIGN_CENTER + DOUBLE_SIZE + BOLD_ON
    buf += encode_text(f"** {channel_name} **") + FEED
    buf += NORMAL_SIZE + BOLD_OFF
    buf += encode_text(f"Mesa: {table} | Cuenta: {account}") + FEED
    if waiter:
        buf += encode_text(f"Mesero: {waiter}") + FEED
    buf += encode_text(datetime.now().strftime("%d/%m/%Y %I:%M %p")) + FEED
    buf += encode_text("=" * 42) + FEED
    
    buf += ALIGN_LEFT
    items = data.get("items", [])
    for item in items:
        name = item.get("product_name", item.get("name", ""))
        qty = item.get("quantity", 1)
        buf += BOLD_ON + DOUBLE_SIZE
        buf += encode_text(f" {qty}x {name}") + FEED
        buf += NORMAL_SIZE + BOLD_OFF
        
        notes = item.get("notes", "")
        if notes:
            buf += encode_text(f"    ** {notes}") + FEED
        
        for mod in item.get("modifiers", []):
            mod_text = mod.get('name', '') if isinstance(mod, dict) else str(mod)
            buf += encode_text(f"    + {mod_text}") + FEED
    
    buf += encode_text("=" * 42) + FEED
    buf += ALIGN_CENTER + encode_text(f"Total items: {len(items)}") + FEED
    buf += FEED + FEED + CUT
    
    return bytes(buf)

# ============ PRE-CHECK FORMATTER ============
def format_precheck(data):
    """Format pre-check (pre-cuenta) into ESC/POS bytes"""
    buf = bytearray()
    buf += INIT
    
    restaurant = data.get("restaurant_name", "")
    buf += ALIGN_CENTER + BOLD_ON
    buf += encode_text(restaurant) + FEED
    buf += BOLD_OFF
    buf += encode_text("*** PRE-CUENTA ***") + FEED
    buf += encode_text("-" * 42) + FEED
    
    buf += ALIGN_LEFT
    table = data.get("table_number", "")
    waiter = data.get("waiter_name", "")
    if table:
        buf += encode_text(f"Mesa: {table}") + FEED
    if waiter:
        buf += encode_text(f"Mesero: {waiter}") + FEED
    buf += encode_text(datetime.now().strftime("%d/%m/%Y %I:%M %p")) + FEED
    buf += encode_text("-" * 42) + FEED
    
    items = data.get("items", [])
    for item in items:
        name = item.get("product_name", item.get("name", ""))
        qty = item.get("quantity", 1)
        total = item.get("total", 0)
        line = f"{qty}x {name}"
        price_str = f"${total:,.2f}"
        padding = 42 - len(line) - len(price_str)
        buf += encode_text(f"{line}{' ' * max(1,padding)}{price_str}") + FEED
    
    buf += encode_text("=" * 42) + FEED
    
    subtotal = data.get("subtotal", 0)
    itbis = data.get("itbis", 0)
    tip = data.get("tip", data.get("propina_legal", 0))
    total = data.get("total", 0)
    
    def right_align(label, value):
        v = f"${value:,.2f}"
        p = 42 - len(label) - len(v)
        return encode_text(f"{label}{' ' * max(1,p)}{v}") + FEED
    
    buf += right_align("Subtotal:", subtotal)
    if itbis:
        buf += right_align("ITBIS:", itbis)
    if tip:
        buf += right_align("Propina:", tip)
    buf += BOLD_ON + right_align("TOTAL:", total) + BOLD_OFF
    
    buf += FEED + ALIGN_CENTER
    buf += encode_text("*** ESTO NO ES UNA FACTURA ***") + FEED
    buf += FEED + FEED + CUT
    
    return bytes(buf)

# ============ COMMANDS ARRAY FORMATTER ============
def format_commands(commands):
    """Convert commands array (from server) to ESC/POS bytes"""
    buf = bytearray()
    buf += INIT
    
    for cmd in commands:
        ctype = cmd.get("type", "")
        
        if ctype == "text":
            text = cmd.get("text", "")
            align = cmd.get("align", "left")
            bold = cmd.get("bold", False)
            size = cmd.get("size", 1)
            
            if align == "center":
                buf += ALIGN_CENTER
            elif align == "right":
                buf += ALIGN_RIGHT
            else:
                buf += ALIGN_LEFT
            
            if bold:
                buf += BOLD_ON
            if size and size >= 2:
                buf += DOUBLE_SIZE
            
            buf += encode_text(text) + FEED
            
            if size and size >= 2:
                buf += NORMAL_SIZE
            if bold:
                buf += BOLD_OFF
            buf += ALIGN_LEFT
        
        elif ctype == "columns":
            left = cmd.get("left", "")
            right = cmd.get("right", "")
            buf += ALIGN_LEFT
            width = 42
            padding = width - len(left) - len(right)
            if padding < 1:
                padding = 1
            buf += encode_text(f"{left}{' ' * padding}{right}") + FEED
        
        elif ctype == "divider":
            buf += encode_text("-" * 42) + FEED
        
        elif ctype == "qr":
            qr_data = cmd.get("data", "")
            if qr_data:
                qr_bytes = generate_qr_escpos(qr_data)
                if qr_bytes:
                    buf += qr_bytes + FEED
        
        elif ctype == "feed":
            lines = cmd.get("lines", 1)
            buf += FEED * lines
        
        elif ctype == "cut":
            buf += CUT
    
    # Ensure cut at end
    if not commands or commands[-1].get("type") != "cut":
        buf += FEED + FEED + CUT
    
    return bytes(buf)

# ============ TEST PRINT FORMATTER ============
def format_test(data):
    """Format a test print ticket"""
    buf = bytearray()
    buf += INIT
    buf += ALIGN_CENTER
    buf += FEED
    buf += DOUBLE_SIZE + BOLD_ON
    buf += encode_text("** TEST PRINT **") + FEED
    buf += NORMAL_SIZE + BOLD_OFF
    buf += FEED
    channel_name = data.get("channel_name", "UNKNOWN")
    buf += DOUBLE_SIZE
    buf += encode_text(f"TEST {channel_name.upper()}") + FEED
    buf += NORMAL_SIZE
    buf += FEED
    buf += encode_text("=" * 42) + FEED
    buf += encode_text(f"VexlyPOS Print Agent") + FEED
    buf += encode_text(f"Conexion exitosa!") + FEED
    buf += encode_text(datetime.now().strftime("%d/%m/%Y %I:%M:%S %p")) + FEED
    buf += encode_text("=" * 42) + FEED
    buf += FEED + FEED + CUT
    return bytes(buf)

# ============ MAIN AGENT ============
class PrintAgent:
    def __init__(self):
        self.config = config
        self.running = True
        self.jobs_printed = 0
        self.errors = 0
    
    def resolve_printer_ip(self, job):
        """Determine which printer IP to use for a job"""
        channel = job.get("channel", "receipt")
        
        # 1. Check local config overrides
        if channel in self.config.printer_map:
            return self.config.printer_map[channel]
        
        # 2. Check printer_name as channel code
        printer_name = job.get("printer_name", "")
        if printer_name.lower() in self.config.printer_map:
            return self.config.printer_map[printer_name.lower()]
        
        # 3. Default to "receipt" channel
        if "receipt" in self.config.printer_map:
            return self.config.printer_map["receipt"]
        
        # 4. Return first available printer
        if self.config.printer_map:
            return list(self.config.printer_map.values())[0]
        
        return None
    
    def process_job(self, job):
        """Process a single print job"""
        job_id = job.get("id", "?")
        job_type = job.get("type", "receipt")
        data = job.get("data", {})
        channel = job.get("channel", "receipt")
        
        # Resolve printer IP
        ip = self.resolve_printer_ip(job)
        if not ip:
            logger.error(f"Job {job_id}: No printer configured for channel '{channel}'")
            self.complete_job(job_id, False)
            return
        
        # Format the print data
        try:
            commands = job.get("commands", [])
            if commands:
                # Server sent pre-formatted commands array
                raw_bytes = format_commands(commands)
            elif job_type == "test":
                raw_bytes = format_test(data)
            elif job_type == "comanda" and data.get("items"):
                raw_bytes = format_comanda(data)
            elif job_type == "pre-check" and data.get("items"):
                raw_bytes = format_precheck(data)
            elif job_type == "receipt" and data.get("items"):
                raw_bytes = format_receipt(data)
            else:
                # Empty job — skip
                logger.warning(f"Job {job_id}: Empty data, skipping")
                self.complete_job(job_id, True)
                return
        except Exception as e:
            logger.error(f"Job {job_id}: Format error: {e}")
            self.complete_job(job_id, False)
            return
        
        # Send to printer (with copies support)
        copies = job.get("copies", 1) or 1
        logger.info(f"Job {job_id}: Sending {job_type} to {ip} (channel: {channel}, copies: {copies})")
        
        for copy_num in range(copies):
            success, msg = send_to_printer(ip, raw_bytes, self.config.network_port)
            if not success:
                logger.error(f"Job {job_id}: Print failed on {ip} (copy {copy_num+1}): {msg}")
                self.errors += 1
                self.complete_job(job_id, False)
                return
        
        logger.info(f"Job {job_id}: Printed successfully on {ip} ({copies} copies)")
        self.jobs_printed += 1
        
        self.complete_job(job_id, success)
    
    def complete_job(self, job_id, success):
        """Mark job as completed on the server"""
        try:
            url = f"{self.config.server_url}/api/print-queue/{job_id}/complete"
            requests.post(url, json={"success": success}, timeout=10)
        except:
            pass
    
    def fetch_jobs(self):
        """Fetch pending print jobs from server"""
        try:
            url = f"{self.config.server_url}/api/print/queue"
            r = requests.get(url, timeout=10)
            if r.status_code == 200:
                return r.json()
        except:
            pass
        return []
    
    def run(self):
        """Main loop"""
        logger.info("=" * 50)
        logger.info("VexlyPOS Print Agent — Multi-Impresora")
        logger.info("=" * 50)
        logger.info(f"Servidor: {self.config.server_url}")
        
        # Fetch printer config from server
        self.config.load_from_server()
        
        if not self.config.printer_map:
            logger.warning("No printers configured! Add IPs in Config > Impresion or config.txt")
            logger.warning("Example config.txt:")
            logger.warning("  PRINTER_RECEIPT=192.168.1.114")
            logger.warning("  PRINTER_KITCHEN=192.168.1.117")
            logger.warning("  PRINTER_BAR=192.168.1.116")
        else:
            logger.info("Impresoras configuradas:")
            for ch, ip in self.config.printer_map.items():
                logger.info(f"  {ch} → {ip}")
        
        logger.info(f"Polling cada {self.config.poll_interval}s...")
        logger.info("-" * 50)
        
        # Refresh config every 5 minutes
        last_config_refresh = time.time()
        
        while self.running:
            try:
                # Refresh config periodically
                if time.time() - last_config_refresh > 300:
                    self.config.load_from_server()
                    last_config_refresh = time.time()
                
                # Fetch and process jobs
                jobs = self.fetch_jobs()
                for job in jobs:
                    self.process_job(job)
                
                time.sleep(self.config.poll_interval)
                
            except KeyboardInterrupt:
                logger.info("Agent stopped by user")
                self.running = False
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(5)
        
        logger.info(f"Agent stopped. Jobs printed: {self.jobs_printed}, Errors: {self.errors}")


if __name__ == "__main__":
    agent = PrintAgent()
    agent.run()
