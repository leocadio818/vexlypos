"""
VexlyPOS — The Factory HKA e-CF Integration Module
====================================================
Maps VexlyPOS bills to The Factory HKA JSON format and sends electronic invoices.
Supports: E31 (Crédito Fiscal), E32 (Consumo), E33 (Nota de Débito), E34 (Nota de Crédito)

API Docs: https://felwiki.thefactoryhka.com.do/doku.php?id=manual_de_integracion_dominicana
Swagger:  https://demoemision.thefactoryhka.com.do/swagger/index.html

Modules:
  1. Autenticación: Gets JWT token from The Factory
  2. Mapeo: Converts MongoDB bill → The Factory JSON
  3. Envío: Sends to The Factory API
  4. Status: Checks document status at DGII
  5. Logs: Records every attempt for audit
"""
import os
import httpx
import logging
from datetime import datetime, timezone
from typing import Optional

db = None

def set_db(database):
    global db
    db = database


# ═══════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════

# Series config cache
_series_cache = {"data": None, "fetched_at": None}

async def get_series() -> list:
    """Fetch NCF series from The Factory (cached for 1 hour)"""
    global _series_cache
    import time
    now = time.time()
    if _series_cache["data"] and _series_cache["fetched_at"] and (now - _series_cache["fetched_at"]) < 3600:
        return _series_cache["data"]

    auth = await authenticate()
    if not auth["ok"]:
        return []

    config = await get_config_from_db() or get_config()
    url = f"{config['base_url']}/api/Series"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(url, json={"token": auth["token"], "rnc": config["rnc"]})
            data = r.json()
            if data.get("codigo") == 0:
                _series_cache["data"] = data.get("serie", [])
                _series_cache["fetched_at"] = now
                return _series_cache["data"]
    except Exception as e:
        logging.warning(f"Failed to fetch The Factory series: {e}")
    return []


def _is_valid_fecha_venc(val) -> bool:
    """Check if a fechaVencimientoSecuencia value is a valid dd-mm-yyyy date."""
    if not val or not isinstance(val, str) or val.strip().upper() in ("N/A", "NA", "NULL", "NONE", ""):
        return False
    import re
    return bool(re.match(r"^\d{2}-\d{2}-\d{4}$", val.strip()))


async def get_next_ncf(tipo_documento: str) -> dict:
    """
    Get the next NCF and sequence expiration from The Factory series.
    Tracks used NCFs in MongoDB to avoid duplicates.
    Returns: { "ncf": "E31XXXXXXXXXX", "fecha_venc": "31-12-2028" | None }
    """
    series = await get_series()
    fecha_venc = None
    for s in series:
        if s.get("tipoDocumento") == tipo_documento:
            raw = s.get("fechaVencimientoSecuencia")
            fecha_venc = raw.strip() if _is_valid_fecha_venc(raw) else None
            break

    prefix = f"E{tipo_documento}"

    # Get last used NCF for this type from MongoDB
    counter = await db.ecf_ncf_counters.find_one_and_update(
        {"tipo": tipo_documento, "provider": "thefactory"},
        {"$inc": {"counter": 1}},
        upsert=True,
        return_document=True,
        projection={"_id": 0}
    )

    # If counter was just created, initialize from series correlativo
    current = counter.get("counter", 1)
    if current <= 1:
        for s in series:
            if s.get("tipoDocumento") == tipo_documento:
                start = s.get("correlativo", 1)
                # Check what's already used in ecf_logs
                last_log = await db.ecf_logs.find_one(
                    {"encf": {"$regex": f"^{prefix}"}, "provider": "thefactory", "success": True},
                    sort=[("created_at", -1)],
                    projection={"_id": 0, "encf": 1}
                )
                if last_log:
                    last_num = int(last_log["encf"][3:])
                    start = max(start, last_num + 1)
                current = start
                await db.ecf_ncf_counters.update_one(
                    {"tipo": tipo_documento, "provider": "thefactory"},
                    {"$set": {"counter": current}}
                )
                break

    ncf = f"{prefix}{str(current).zfill(10)}"
    return {"ncf": ncf, "fecha_venc": fecha_venc}


async def sync_ncf_counters() -> dict:
    """
    Synchronize NCF counters with The Factory series.
    Resets counters to match the 'correlativo' from series API.
    Call this when NCF errors occur (Code 111, 145).
    Returns: { "synced": [...], "errors": [...] }
    """
    series = await get_series()
    if not series:
        return {"synced": [], "errors": ["Could not fetch series from The Factory"]}
    
    synced = []
    errors = []
    
    for s in series:
        tipo = s.get("tipoDocumento")
        correlativo = s.get("correlativo", 1)
        
        if not tipo:
            continue
            
        try:
            # Reset counter to current correlativo from The Factory
            await db.ecf_ncf_counters.update_one(
                {"tipo": tipo, "provider": "thefactory"},
                {"$set": {"counter": correlativo}},
                upsert=True
            )
            synced.append({"tipo": tipo, "counter": correlativo})
            logging.info(f"NCF counter synced: Type {tipo} -> {correlativo}")
        except Exception as e:
            errors.append({"tipo": tipo, "error": str(e)})
    
    # Clear series cache to force refresh
    global _series_cache
    _series_cache = {"data": None, "fetched_at": None}
    
    return {"synced": synced, "errors": errors}


async def get_series_info() -> dict:
    """
    Get detailed series information for diagnostics.
    Returns available NCF ranges and current positions.
    """
    series = await get_series()
    result = []
    
    for s in series:
        tipo = s.get("tipoDocumento")
        counter = await db.ecf_ncf_counters.find_one(
            {"tipo": tipo, "provider": "thefactory"},
            {"_id": 0}
        )
        
        result.append({
            "tipo": tipo,
            "secuencia_inicial": s.get("secuenciaInicial"),
            "secuencia_final": s.get("secuenciaFinal"),
            "correlativo_thefactory": s.get("correlativo"),
            "correlativo_local": counter.get("counter") if counter else None,
            "fecha_vencimiento": s.get("fechaVencimientoSecuencia"),
            "in_sync": counter and counter.get("counter") == s.get("correlativo") if counter else False,
        })
    
    return {"series": result}


async def get_config_from_db():
    """Try to get The Factory config from system_config DB"""
    if db is None:
        return None
    config = await db.system_config.find_one({}, {
        "_id": 0, "ecf_tf_user": 1, "ecf_tf_password": 1,
        "ecf_tf_rnc": 1, "ecf_tf_company": 1, "ecf_tf_env": 1,
    })
    if config and config.get("ecf_tf_user") and config.get("ecf_tf_password"):
        is_sandbox = config.get("ecf_tf_env", "sandbox") == "sandbox"
        return {
            "user": config["ecf_tf_user"],
            "password": config["ecf_tf_password"],
            "rnc": config.get("ecf_tf_rnc", ""),
            "base_url": "https://demoemision.thefactoryhka.com.do" if is_sandbox else "https://emision.thefactoryhka.com.do",
            "company_name": config.get("ecf_tf_company", ""),
            "is_sandbox": is_sandbox,
        }
    return None

def get_config():
    """Get The Factory HKA config from environment (sync fallback)"""
    is_sandbox = bool(os.environ.get("THEFACTORY_SANDBOX_USER"))
    if is_sandbox:
        return {
            "user": os.environ.get("THEFACTORY_SANDBOX_USER", ""),
            "password": os.environ.get("THEFACTORY_SANDBOX_PASSWORD", ""),
            "rnc": os.environ.get("THEFACTORY_SANDBOX_RNC", ""),
            "base_url": os.environ.get("THEFACTORY_SANDBOX_URL", "https://demoemision.thefactoryhka.com.do"),
            "company_name": os.environ.get("THEFACTORY_COMPANY_NAME", ""),
            "is_sandbox": True,
        }
    else:
        return {
            "user": os.environ.get("THEFACTORY_USER", ""),
            "password": os.environ.get("THEFACTORY_PASSWORD", ""),
            "rnc": os.environ.get("THEFACTORY_RNC", ""),
            "base_url": os.environ.get("THEFACTORY_URL", "https://emision.thefactoryhka.com.do"),
            "company_name": os.environ.get("THEFACTORY_COMPANY_NAME", ""),
            "is_sandbox": False,
        }


# ═══════════════════════════════════════════════════════════════
# MODULE 1: AUTENTICACIÓN
# ═══════════════════════════════════════════════════════════════

# Cache token to avoid re-authenticating on every request
_token_cache = {"token": None, "expires": None}

async def authenticate() -> dict:
    """
    Authenticate with The Factory HKA API.
    POST /api/Autenticacion
    Returns: { token, fechaExpiracion, codigo, mensaje }
    """
    global _token_cache

    # Return cached token if still valid
    if _token_cache["token"] and _token_cache["expires"]:
        try:
            exp = datetime.strptime(_token_cache["expires"], "%Y-%m-%d %H:%M:%S")
            if datetime.utcnow() < exp:
                return {"ok": True, "token": _token_cache["token"]}
        except Exception:
            pass

    # Try DB config first, then fall back to .env
    config = await get_config_from_db() or get_config()
    if not config["user"] or not config["password"]:
        return {"ok": False, "error": "Credenciales de The Factory HKA no configuradas"}

    url = f"{config['base_url']}/api/Autenticacion"
    payload = {
        "usuario": config["user"],
        "clave": config["password"],
        "rnc": config["rnc"],
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload)
            data = response.json()

            if response.status_code == 200 and data.get("codigo") == 0:
                _token_cache["token"] = data["token"]
                _token_cache["expires"] = data.get("fechaExpiracion")
                return {"ok": True, "token": data["token"]}
            else:
                return {
                    "ok": False,
                    "error": data.get("mensaje", "Error de autenticación"),
                    "codigo": data.get("codigo"),
                }
    except httpx.TimeoutException:
        return {"ok": False, "error": "Timeout — The Factory HKA no respondió"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def invalidate_token():
    """Clear cached token (useful after errors)"""
    global _token_cache
    _token_cache = {"token": None, "expires": None}


# ═══════════════════════════════════════════════════════════════
# MODULE 2: MAPEO — Convert VexlyPOS bill to The Factory JSON
# ═══════════════════════════════════════════════════════════════

# DGII Payment Type mapping (same codes as Alanube)
PAYMENT_TYPE_MAP = {
    "efectivo": "1", "cash": "1",
    "tarjeta": "2", "card": "2", "tarjeta de credito": "2", "tarjeta de debito": "2",
    "cheque": "3",
    "transferencia": "4", "transfer": "4",
    "bonos": "5", "gift card": "5",
    "permuta": "6",
    "otro": "7", "other": "7",
}

# Municipality/Province codes (Santo Domingo default)
DEFAULT_MUNICIPIO = "100100"
DEFAULT_PROVINCIA = "100000"


def map_payment_type(method_name: str) -> str:
    """Map payment method name to DGII code (string for The Factory)"""
    name = (method_name or "").lower().strip()
    for key, code in PAYMENT_TYPE_MAP.items():
        if key in name:
            return code
    return "1"  # Default: Efectivo


def format_date_tf(iso_date: str = None) -> str:
    """Format date to The Factory format: DD-MM-YYYY"""
    if iso_date:
        try:
            dt = datetime.fromisoformat(iso_date.replace("Z", "+00:00"))
            return dt.strftime("%d-%m-%Y")
        except Exception:
            pass
    return datetime.now(timezone.utc).strftime("%d-%m-%Y")


def build_thefactory_payload(bill: dict, system_config: dict, encf: str, token: str, fecha_venc: str = None, ecf_config: dict = None) -> dict:
    """Convert a VexlyPOS bill to The Factory HKA e-CF JSON"""

    # Determine document type from ecf_type or NCF prefix
    ecf_type = bill.get("ecf_type", "")
    if ecf_type:
        type_map = {"E31": "31", "E32": "32", "E33": "33", "E34": "34", "E44": "44", "E45": "45"}
        tipo_documento = type_map.get(ecf_type, "32")
    else:
        ncf = bill.get("ncf", "")
        prefix = ncf[:3] if isinstance(ncf, str) and len(ncf) >= 3 else "B02"
        tipo_documento = {"B01": "31", "B02": "32", "B14": "34", "B15": "31"}.get(prefix, "32")

    config = ecf_config or get_config()
    fecha_emision = format_date_tf(bill.get("paid_at"))

    # ── Items & Tax calculation ──
    items_detail = []
    total_gravado_1 = 0  # ITBIS 18% base
    total_exento = 0
    itbis_1_amount = 0  # ITBIS 18% amount (goes in totalITBIS1)

    line = 0
    for item in bill.get("items", []):
        if item.get("status") == "cancelled":
            continue
        line += 1
        qty = item.get("quantity", 1)
        unit_price = item.get("unit_price", 0)
        item_amount = round(qty * unit_price, 2)

        # Determine billing indicator
        tax_exemptions = item.get("tax_exemptions", [])
        if tax_exemptions:
            indicador = "4"  # Exempt
            total_exento += item_amount
        else:
            indicador = "1"  # ITBIS 18%
            item_itbis = round(item_amount * 0.18, 2)
            total_gravado_1 += item_amount
            itbis_1_amount += item_itbis

        detail = {
            "numeroLinea": str(line),
            "tablaCodigos": None,
            "indicadorFacturacion": indicador,
            "retencion": None,
            "nombre": (item.get("product_name", "") or "Producto")[:80],
            "indicadorBienoServicio": "1",  # 1=Bien
            "descripcion": None,
            "cantidad": f"{qty:.2f}",
            "unidadMedida": "47",  # Unidad
            "cantidadReferencia": None,
            "unidadReferencia": None,
            "tablaSubcantidad": None,
            "gradosAlcohol": None,
            "precioUnitarioReferencia": None,
            "fechaElaboracion": None,
            "fechaVencimiento": None,
            "mineria": None,
            "precioUnitario": f"{unit_price:.2f}",
            "descuentoMonto": None,
            "tablaSubDescuento": None,
            "recargoMonto": None,
            "tablaSubRecargo": None,
            "tablaImpuestoAdicional": None,
            "otraMonedaDetalle": None,
            "monto": f"{item_amount:.2f}",
        }

        # Add modifiers as description
        mods = item.get("modifiers", [])
        if mods:
            mod_names = [m.get("name", "") if isinstance(m, dict) else str(m) for m in mods]
            detail["descripcion"] = ", ".join(mod_names)[:1000]

        items_detail.append(detail)

    # ── Discount (reserved for future descuentosORecargos section) ──
    discount = bill.get("discount_applied")

    # ── Totals ──
    total_itbis = round(itbis_1_amount, 2)
    total_amount = round(bill.get("total", 0), 2)
    tip = bill.get("propina_legal", 0)

    # ── Payment forms ──
    payment_forms = []
    payments = bill.get("payments", [])
    if payments:
        for p in payments:
            pm_name = p.get("payment_method_name", p.get("method", "efectivo"))
            payment_forms.append({
                "forma": map_payment_type(pm_name),
                "monto": f"{round(p.get('amount', 0), 2):.2f}"
            })
    else:
        payment_forms.append({
            "forma": map_payment_type(bill.get("payment_method_name", "efectivo")),
            "monto": f"{total_amount:.2f}"
        })

    # tipoPago: 1=Contado, 2=Crédito
    main_payment = map_payment_type(bill.get("payment_method_name", "efectivo"))
    tipo_pago = "2" if main_payment in ["3", "4", "5", "6"] else "1"

    # ── Buyer (Comprador) ──
    buyer_rnc = (bill.get("fiscal_id", "") or "").replace("-", "")
    buyer_name = bill.get("razon_social", "") or "CONSUMIDOR FINAL"

    # ── Sequence expiration date ──
    # For E32 (Consumo) The Factory may return "N/A" — pass None to omit
    fecha_venc_seq = fecha_venc if _is_valid_fecha_venc(fecha_venc) else None

    # ── Build payload ──
    # Build identificacionDocumento - OMIT fechaVencimientoSecuencia entirely if None
    # The Factory API rejects null values for this field (Code 145)
    identificacion_doc = {
        "tipoDocumento": tipo_documento,
        "ncf": encf,
        "indicadorEnvioDiferido": "1",
        "indicadorMontoGravado": "0",
        "indicadorNotaCredito": None,
        "tipoIngresos": "01",  # Ingresos operacionales
        "tipoPago": tipo_pago,
        "fechaLimitePago": None,
        "terminoPago": None,
        "tablaFormasPago": payment_forms,
        "tipoCuentaPago": None,
        "numeroCuentaPago": None,
        "bancoPago": None,
        "fechaDesde": None,
        "fechaHasta": None,
    }
    # Only include fechaVencimientoSecuencia if it's a valid date (not None/N/A)
    if fecha_venc_seq:
        identificacion_doc["fechaVencimientoSecuencia"] = fecha_venc_seq
    
    payload = {
        "Token": token,
        "documentoElectronico": {
            "encabezado": {
                "identificacionDocumento": identificacion_doc,
                "emisor": {
                    "rnc": config["rnc"],
                    "razonSocial": system_config.get("restaurant_name", config["company_name"]) or config["company_name"],
                    "nombreComercial": system_config.get("restaurant_name", config["company_name"]) or config["company_name"],
                    "sucursal": system_config.get("branch_name", "Principal") or "Principal",
                    "direccion": system_config.get("address", "Calle Principal #1") or "Calle Principal #1",
                    "municipio": system_config.get("municipio", DEFAULT_MUNICIPIO) or DEFAULT_MUNICIPIO,
                    "provincia": system_config.get("provincia", DEFAULT_PROVINCIA) or DEFAULT_PROVINCIA,
                    "tablaTelefono": [system_config.get("phone", "000-000-0000") or "000-000-0000"],
                    "correo": system_config.get("email", "") or None,
                    "webSite": None,
                    "actividadEconomica": None,
                    "codigoVendedor": None,
                    "numeroFacturaInterna": str(bill.get("transaction_number", "")),
                    "numeroPedidoInterno": str(bill.get("transaction_number", "")),
                    "zonaVenta": None,
                    "rutaVenta": None,
                    "informacionAdicional": None,
                    "fechaEmision": fecha_emision,
                },
                "comprador": {
                    "rnc": buyer_rnc or "000000000",
                    "identificacionExtranjero": None,
                    "razonSocial": buyer_name,
                    "contacto": None,
                    "correo": bill.get("customer_email") or None,
                    "envioMail": "SI" if bill.get("customer_email") else "NO",
                    "direccion": None,
                    "municipio": None,
                    "provincia": None,
                    "pais": None,
                    "fechaEntrega": None,
                    "fechaOrdenCompra": None,
                    "contactoEntrega": None,
                    "direccionEntrega": None,
                    "telefonoAdicional": None,
                    "fechaOrden": None,
                    "numeroOrden": None,
                    "codigoInterno": None,
                    "responsablePago": None,
                    "informacionAdicional": None,
                },
                "informacionesAdicionales": None,
                "transporte": None,
                "totales": {
                    "montoGravadoTotal": f"{total_gravado_1:.2f}" if total_gravado_1 > 0 else None,
                    "montoGravadoI1": f"{total_gravado_1:.2f}" if total_gravado_1 > 0 else None,
                    "montoGravadoI2": None,
                    "montoGravadoI3": None,
                    "montoExento": f"{total_exento:.2f}" if total_exento > 0 else None,
                    "itbiS1": "18" if total_gravado_1 > 0 else None,
                    "itbiS2": None,
                    "itbiS3": None,
                    "totalITBIS": f"{total_itbis:.2f}" if total_itbis > 0 else None,
                    "totalITBIS1": f"{itbis_1_amount:.2f}" if itbis_1_amount > 0 else None,
                    "totalITBIS2": None,
                    "totalITBIS3": None,
                    "montoImpuestoAdicional": None,
                    "impuestosAdicionales": None,
                    "montoTotal": f"{total_amount:.2f}",
                    "montoNoFacturable": f"{tip:.2f}" if tip > 0 else None,
                    "montoPeriodo": None,
                    "saldoAnterior": None,
                    "montoAvancePago": None,
                    "valorPagar": None,
                    "totalITBISRetenido": None,
                    "totalISRRetencion": None,
                    "totalITBISPercepcion": None,
                    "totalISRPercepcion": None,
                },
                "otraMoneda": None,
            },
            "detallesItems": items_detail,
            "observaciones": None,
            "cuotas": None,
            "subtotales": None,
            "descuentosORecargos": None,
            "informacionReferencia": None,
        }
    }

    return payload


# ═══════════════════════════════════════════════════════════════
# MODULE 3: ENVÍO — Send to The Factory & process response
# ═══════════════════════════════════════════════════════════════

async def send_to_thefactory(payload: dict, ecf_config: dict = None) -> dict:
    """
    Send e-CF to The Factory HKA API.
    POST /api/Enviar
    """
    config = ecf_config or (await get_config_from_db()) or get_config()
    url = f"{config['base_url']}/api/Enviar"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload)
            logging.info(f"TheFactory /api/Enviar response: {response.status_code} -> {response.text[:500]}")
            data = response.json()

            if response.status_code == 200 and data.get("procesado"):
                return {
                    "ok": True,
                    "security_code": data.get("codigoSeguridad"),
                    "signature_date": data.get("fechaFirma"),
                    "emission_date": data.get("fechaEmision"),
                    "codigo": data.get("codigo"),
                    "message": data.get("mensaje"),
                    "xml_base64": data.get("xmlBase64"),
                }
            else:
                # Enhanced error messages for common codes
                codigo = data.get("codigo")
                error_msg = data.get("mensaje", "Error desconocido")
                
                # Add helpful context for known error codes
                error_hints = {
                    111: " (NCF fuera de rango - verificar configuración de secuencias en The Factory)",
                    145: " (Fecha de vencimiento de secuencia inválida - verificar series en The Factory)",
                    110: " (NCF ya utilizado - posible duplicado)",
                    112: " (Secuencia no autorizada para este RNC)",
                }
                if codigo in error_hints:
                    error_msg += error_hints[codigo]
                
                return {
                    "ok": False,
                    "codigo": codigo,
                    "error": error_msg,
                    "status_code": response.status_code,
                }
    except httpx.TimeoutException:
        return {"ok": False, "error": "Timeout — The Factory HKA no respondió en 30 segundos"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def check_status_thefactory(encf: str) -> dict:
    """
    Check document status at DGII via The Factory.
    POST /api/EstatusDocumento
    """
    auth = await authenticate()
    if not auth["ok"]:
        return auth

    config = await get_config_from_db() or get_config()
    url = f"{config['base_url']}/api/EstatusDocumento"
    payload = {
        "token": auth["token"],
        "rnc": config["rnc"],
        "documento": encf,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload)
            data = response.json()

            # codigo: 0=Pendiente enviado, 1=Aceptado, 2=Rechazado, 4=Aceptado Condicional, 95=Pendiente
            status_map = {
                0: "REGISTERED",
                1: "FINISHED",
                2: "REJECTED",
                4: "ACCEPTED_CONDITIONAL",
                95: "PENDING",
            }
            codigo = data.get("codigo", -1)

            return {
                "ok": True,
                "procesado": data.get("procesado"),
                "status": status_map.get(codigo, "UNKNOWN"),
                "codigo": codigo,
                "message": data.get("mensaje", ""),
                "security_code": data.get("codigoSeguridad"),
                "signature_date": data.get("fechaFirma"),
                "observations": data.get("observaciones", []),
            }
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ═══════════════════════════════════════════════════════════════
# MODULE 4: SAVE — Persist response to bill document
# ═══════════════════════════════════════════════════════════════

async def save_thefactory_response(bill_id: str, result: dict, encf: str):
    """Save The Factory response to the bill document (same fields as Alanube for UI compatibility)"""
    if result.get("ok"):
        update = {
            "ecf_status": "REGISTERED",
            "ecf_provider": "thefactory",
            "ecf_encf": encf,
            "ecf_security_code": result.get("security_code"),
            "ecf_signature_date": result.get("signature_date"),
            "ecf_sent_at": datetime.now(timezone.utc).isoformat(),
            "ecf_tf_codigo": result.get("codigo"),
        }
    else:
        update = {
            "ecf_status": "CONTINGENCIA",
            "ecf_provider": "thefactory",
            "ecf_error": result.get("error", ""),
            "ecf_sent_at": datetime.now(timezone.utc).isoformat(),
            "ecf_retry_count": 0,
        }

    await db.bills.update_one({"id": bill_id}, {"$set": update})


# ═══════════════════════════════════════════════════════════════
# MODULE 5: LOGS
# ═══════════════════════════════════════════════════════════════

async def log_ecf_attempt(bill_id: str, encf: str, action: str, result: dict):
    """Log every e-CF attempt for audit/support"""
    log = {
        "bill_id": bill_id,
        "encf": encf,
        "provider": "thefactory",
        "action": action,
        "success": result.get("ok", False),
        "security_code": result.get("security_code"),
        "codigo": result.get("codigo"),
        "error": result.get("error"),
        "message": result.get("message"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ecf_logs.insert_one(log)


# ═══════════════════════════════════════════════════════════════
# MODULE 6: ANULACIÓN
# ═══════════════════════════════════════════════════════════════

async def anular_secuencias(tipo_documento: str, ncf_desde: str, ncf_hasta: str) -> dict:
    """
    Anular secuencias NCF via The Factory.
    POST /api/Anulacion
    """
    auth = await authenticate()
    if not auth["ok"]:
        return auth

    config = await get_config_from_db() or get_config()
    url = f"{config['base_url']}/api/Anulacion"

    now = datetime.now(timezone.utc)
    payload = {
        "token": auth["token"],
        "Anulacion": {
            "Encabezado": {
                "RNC": config["rnc"],
                "Cantidad": "01",
                "FechaHoraAnulacioneNCF": now.strftime("%d-%m-%Y %H:%M:%S"),
            },
            "DetallesAnulacion": [{
                "NumeroLinea": "1",
                "TipoDocumento": tipo_documento,
                "TablaSecuenciasAnuladas": [{
                    "NCFDesde": ncf_desde,
                    "NCFHasta": ncf_hasta,
                }],
                "Cantidad": "01",
            }],
        }
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, json=payload)
            data = response.json()
            return {
                "ok": data.get("codigo") == 0,
                "message": data.get("mensaje", ""),
                "codigo": data.get("codigo"),
            }
    except Exception as e:
        return {"ok": False, "error": str(e)}
        return {
                "ok": data.get("codigo") == 0,
                "message": data.get("mensaje", ""),
                "codigo": data.get("codigo"),
            }
    except Exception as e:
        return {"ok": False, "error": str(e)}
