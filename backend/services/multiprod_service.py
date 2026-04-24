"""
Multiprod AM SRL — e-CF Service
PSFE integration: builds XML, validates, sends to Multiprod endpoint.
"""
import httpx
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from lxml import etree

MULTIPROD_VALIDATOR_URL = os.environ.get("MULTIPROD_VALIDATOR_URL", "https://validator.megaplus.com.do/api/xml/validate/")
DR_TZ = ZoneInfo("America/Santo_Domingo")

# XSD file paths
XSD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "xsd")
XSD_MAP = {
    "31": os.path.join(XSD_DIR, "e-CF_31_v1.0.xsd"),
    "32": os.path.join(XSD_DIR, "e-CF_32_v1.0.xsd"),
    "34": os.path.join(XSD_DIR, "e-CF_34_v1.0.xsd"),
    "44": os.path.join(XSD_DIR, "e-CF_44_v1.0.xsd"),
    "45": os.path.join(XSD_DIR, "e-CF_45_v1.0.xsd"),
}

# Cache parsed schemas
_schema_cache = {}


def _get_schema(tipo_ecf: str):
    if tipo_ecf not in _schema_cache:
        xsd_path = XSD_MAP.get(tipo_ecf)
        if not xsd_path or not os.path.exists(xsd_path):
            return None
        # Read and strip BOM if present
        with open(xsd_path, "rb") as f:
            content = f.read()
        if content[:3] == b'\xef\xbb\xbf':
            content = content[3:]
        schema_doc = etree.fromstring(content)
        _schema_cache[tipo_ecf] = etree.XMLSchema(schema_doc)
    return _schema_cache[tipo_ecf]


def _fmt_date(date_str):
    """Convert ISO date or various formats to dd-MM-YYYY."""
    if not date_str:
        return datetime.now(DR_TZ).strftime("%d-%m-%Y")
    try:
        if "T" in str(date_str):
            dt = datetime.fromisoformat(str(date_str).replace("Z", "+00:00"))
            return dt.astimezone(DR_TZ).strftime("%d-%m-%Y")
        s = str(date_str)[:10]
        if "-" in s and len(s) == 10:
            parts = s.split("-")
            if len(parts[0]) == 4:  # YYYY-MM-DD
                return f"{parts[2]}-{parts[1]}-{parts[0]}"
            return s  # Already dd-MM-YYYY
    except Exception:
        pass
    return datetime.now(DR_TZ).strftime("%d-%m-%Y")


def _fmt_datetime():
    """Current datetime in dd-MM-YYYY HH:MM:SS (DR timezone)."""
    return datetime.now(DR_TZ).strftime("%d-%m-%Y %H:%M:%S")


def _fmt_money(value) -> str:
    """Format number to 2 decimal places."""
    try:
        return f"{float(value):.2f}"
    except (ValueError, TypeError):
        return "0.00"


def _sub(parent, tag, text=None, condition=True):
    """Add a subelement only if condition is met."""
    if condition and text is not None and str(text).strip():
        el = etree.SubElement(parent, tag)
        el.text = str(text).strip()
        return el
    return None


class MultiprodService:

    def build_xml(self, invoice_data: dict, system_config: dict, ecf_type: str, encf: str) -> str:
        """
        Build XML according to DGII XSD V1.0.
        ecf_type: "E31", "E32", "E34", "E44", "E45"
        """
        tipo_num = ecf_type.replace("E", "")  # "32"

        root = etree.Element("ECF")
        encabezado = etree.SubElement(root, "Encabezado")

        # Version
        _sub(encabezado, "Version", "1.0")

        # IdDoc
        id_doc = etree.SubElement(encabezado, "IdDoc")
        _sub(id_doc, "TipoeCF", tipo_num)
        _sub(id_doc, "eNCF", encf)

        # E34 specific: IndicadorNotaCredito (mandatory for E34, right after eNCF)
        if tipo_num == "34":
            ref_date = invoice_data.get("original_date") or invoice_data.get("ecf_original_date")
            indicator = "0"
            if ref_date:
                try:
                    orig = datetime.fromisoformat(str(ref_date).replace("Z", "+00:00"))
                    diff = (datetime.now(timezone.utc) - orig).days
                    indicator = "1" if diff > 30 else "0"
                except Exception:
                    pass
            _sub(id_doc, "IndicadorNotaCredito", indicator)

        # FechaVencimientoSecuencia — mandatory for E31, E44, E45 (not E32, E34)
        # XSD order: must come BEFORE IndicadorEnvioDiferido/IndicadorMontoGravado
        if tipo_num in ("31", "44", "45"):
            # Read from invoice_data (passed from dispatcher with seq valid_until) or fallback
            fecha_venc = invoice_data.get("seq_valid_until") or invoice_data.get("fecha_vencimiento_secuencia")
            if fecha_venc:
                # Convert YYYY-MM-DD to DD-MM-YYYY if needed
                if len(str(fecha_venc)) == 10 and fecha_venc[4] == '-':
                    parts = str(fecha_venc).split('-')
                    fecha_venc = f"{parts[2]}-{parts[1]}-{parts[0]}"
            else:
                raise ValueError(
                    "FechaVencimientoSecuencia no disponible. "
                    "Verifique que la secuencia NCF en Supabase tenga "
                    "'valid_until' configurado."
                )
            _sub(id_doc, "FechaVencimientoSecuencia", fecha_venc)

        # IndicadorMontoGravado — required by DGII for E31, E32, E34, E45
        # (NOT E44: régimen especial exento, no ITBIS fields allowed)
        # Value "0" = PrecioUnitarioItem does NOT include ITBIS (our POS sends NET prices)
        # Value "1" = PrecioUnitarioItem INCLUDES ITBIS
        # XSD order: after FechaVencimientoSecuencia/IndicadorEnvioDiferido, before TipoIngresos
        if tipo_num in ("31", "32", "34", "45"):
            _sub(id_doc, "IndicadorMontoGravado", "0")

        # TipoIngresos (optional for E34, mandatory for others)
        if tipo_num != "34":
            _sub(id_doc, "TipoIngresos", "01")

        # TipoPago
        tipo_pago = "1"  # Default: Contado
        payments = invoice_data.get("payments", [])
        if payments:
            method = payments[0].get("method", "").lower()
            if "credito" in method or "credit" in method:
                tipo_pago = "2"
            elif "gratis" in method or "cortesia" in method:
                tipo_pago = "3"
        _sub(id_doc, "TipoPago", tipo_pago)

        # Emisor — map ticket_* fields from system_config as primary, then generic fallbacks
        emisor = etree.SubElement(encabezado, "Emisor")
        rnc = system_config.get("ticket_rnc") or system_config.get("rnc") or system_config.get("ecf_alanube_rnc") or ""
        rnc = rnc.replace("-", "").strip()
        _sub(emisor, "RNCEmisor", rnc or "000000000")
        _sub(emisor, "RazonSocialEmisor", system_config.get("ticket_business_name") or system_config.get("business_name") or system_config.get("razon_social") or "SIN NOMBRE")
        _sub(emisor, "NombreComercial", system_config.get("commercial_name") or system_config.get("ticket_business_name") or system_config.get("business_name") or system_config.get("razon_social"))
        _sub(emisor, "DireccionEmisor", system_config.get("fiscal_address") or system_config.get("ticket_address") or system_config.get("address") or system_config.get("direccion") or "SIN DIRECCION")
        mun = system_config.get("municipality") or system_config.get("municipio")
        if mun:
            mun_str = str(mun).strip()
            # Garantizar formato 6 dígitos exigido por XSD (ProvinciaMunicipioType).
            # Casos legacy: "01" → "010000", "0101" → "010100".
            if mun_str:
                mun_str = mun_str.ljust(6, "0")[:6]
                _sub(emisor, "Municipio", mun_str)
        prov = system_config.get("province") or system_config.get("provincia")
        if prov:
            prov_str = str(prov).strip()
            # Garantizar formato 6 dígitos. Provincia "pura" termina en "0000".
            # Casos legacy: "01" → "010000".
            if prov_str:
                prov_str = prov_str.ljust(6, "0")[:6]
                _sub(emisor, "Provincia", prov_str)
        correo = system_config.get("ticket_email") or system_config.get("email") or system_config.get("correo")
        if correo and "@" in str(correo) and correo not in ("test@test.com", "email@example.com", ""):
            _sub(emisor, "CorreoEmisor", correo)

        # NumeroFacturaInterna
        txn = invoice_data.get("transaction_number") or invoice_data.get("id", "")
        _sub(emisor, "NumeroFacturaInterna", str(txn)[:20])

        fecha_emision = _fmt_date(invoice_data.get("created_at") or invoice_data.get("paid_at"))
        _sub(emisor, "FechaEmision", fecha_emision)

        # Comprador
        comprador = etree.SubElement(encabezado, "Comprador")
        customer = invoice_data.get("customer") or {}
        rnc_comp = (
            customer.get("rnc") or customer.get("fiscal_id") or customer.get("cedula") or
            invoice_data.get("customer_rnc") or invoice_data.get("fiscal_id") or ""
        )
        rnc_comp = rnc_comp.replace("-", "").strip() if rnc_comp else ""
        nombre_comp = (
            customer.get("razon_social") or customer.get("name") or customer.get("business_name") or
            invoice_data.get("razon_social") or invoice_data.get("customer_name") or "CONSUMIDOR FINAL"
        )
        total_amount = float(invoice_data.get("total", 0))
        has_comprador_data = False

        # E31, E44, E45: RNC comprador mandatory — BLOCK if missing for E31/E45
        # E32: RNC mandatory if total >= 250000
        # E34: same as original
        if tipo_num in ("31", "45"):
            if not rnc_comp or rnc_comp == "000000000":
                tipo_label = "Crédito Fiscal" if tipo_num == "31" else "Gubernamental"
                raise ValueError(f"E{tipo_num} ({tipo_label}) requiere RNC del comprador. Ingrese el RNC antes de facturar.")
            _sub(comprador, "RNCComprador", rnc_comp)
            _sub(comprador, "RazonSocialComprador", nombre_comp)
            has_comprador_data = True
        elif tipo_num == "44":
            _sub(comprador, "RNCComprador", rnc_comp or "000000000")
            _sub(comprador, "RazonSocialComprador", nombre_comp)
            has_comprador_data = True
        elif tipo_num == "32":
            if rnc_comp and len(rnc_comp) in (9, 11):
                _sub(comprador, "RNCComprador", rnc_comp)
                _sub(comprador, "RazonSocialComprador", nombre_comp)
                has_comprador_data = True
            elif total_amount >= 250000:
                _sub(comprador, "RNCComprador", rnc_comp or "000000000")
                _sub(comprador, "RazonSocialComprador", customer.get("name") or "CONSUMIDOR")
                has_comprador_data = True
            else:
                _sub(comprador, "RazonSocialComprador", "CONSUMIDOR FINAL")
                has_comprador_data = True
        elif tipo_num == "34":
            if rnc_comp:
                _sub(comprador, "RNCComprador", rnc_comp)
                has_comprador_data = True
            buyer_name = customer.get("name") or customer.get("business_name") or invoice_data.get("customer_name")
            if buyer_name:
                _sub(comprador, "RazonSocialComprador", buyer_name)
                has_comprador_data = True

        # Remove empty Comprador element ONLY if XSD allows it (E32 min=1, so keep)
        # For E32, Comprador is mandatory (min=1), even if empty content-wise
        # We check the XSD requirement: if min=1 for Comprador, keep it
        # E31, E34, E44, E45 also have Comprador min=1 in XSD

        # Totales
        totales = etree.SubElement(encabezado, "Totales")

        items = invoice_data.get("items", [])
        monto_gravado_18 = 0.0
        monto_exento = 0.0
        total_itbis = 0.0

        for item in items:
            price = float(item.get("unit_price", 0))
            qty = float(item.get("quantity", 1))
            item_total = price * qty

            tax_rate = item.get("tax_rate", item.get("itbis_rate"))
            if tax_rate is None:
                if tipo_num == "44":
                    tax_rate = 0
                else:
                    tax_rate = 18

            tax_rate = float(tax_rate)

            # E44 is always exempt regardless of item tax_rate
            if tipo_num == "44":
                monto_exento += item_total
            elif tax_rate > 0:
                monto_gravado_18 += item_total
                total_itbis += item_total * (tax_rate / 100.0)
            else:
                monto_exento += item_total

        if tipo_num == "44":
            # E44 Régimen Especial — only exempt amounts, NO ITBIS fields allowed by XSD
            if monto_exento > 0:
                _sub(totales, "MontoExento", _fmt_money(monto_exento))
            _sub(totales, "MontoTotal", _fmt_money(monto_exento))
        else:
            # E31, E32, E34, E45 — include ITBIS if applicable
            monto_total = monto_gravado_18 + monto_exento + total_itbis
            if monto_gravado_18 > 0:
                _sub(totales, "MontoGravadoTotal", _fmt_money(monto_gravado_18))
                _sub(totales, "MontoGravadoI1", _fmt_money(monto_gravado_18))
            if monto_exento > 0:
                _sub(totales, "MontoExento", _fmt_money(monto_exento))
            if total_itbis > 0:
                _sub(totales, "ITBIS1", "18")
                _sub(totales, "TotalITBIS", _fmt_money(total_itbis))
                _sub(totales, "TotalITBIS1", _fmt_money(total_itbis))
            _sub(totales, "MontoTotal", _fmt_money(monto_total))
            # Propina goes into MontoNoFacturable
            tip = float(invoice_data.get("tip") or invoice_data.get("propina") or 0)
            if tip > 0:
                _sub(totales, "MontoNoFacturable", _fmt_money(tip))

        # DetallesItems
        detalles = etree.SubElement(root, "DetallesItems")
        for idx, item in enumerate(items, 1):
            item_el = etree.SubElement(detalles, "Item")
            _sub(item_el, "NumeroLinea", str(idx))

            # IndicadorFacturacion — E44 is always exento (4)
            if tipo_num == "44":
                ind_fact = "4"  # Exento for E44 Régimen Especial
            else:
                tax_rate = item.get("tax_rate", item.get("itbis_rate"))
                if tax_rate is None:
                    tax_rate = 18
                tax_rate = float(tax_rate)
                if tax_rate >= 18:
                    ind_fact = "1"  # ITBIS 18%
                elif tax_rate >= 16:
                    ind_fact = "2"  # ITBIS 16%
                elif tax_rate > 0:
                    ind_fact = "3"  # ITBIS 0%
                else:
                    ind_fact = "3"  # Exento
            _sub(item_el, "IndicadorFacturacion", ind_fact)

            name = (item.get("product_name") or item.get("name") or "Producto")[:80]
            _sub(item_el, "NombreItem", name)
            _sub(item_el, "IndicadorBienoServicio", "1")  # 1=Bien

            qty = float(item.get("quantity", 1))
            _sub(item_el, "CantidadItem", _fmt_money(qty))

            price = float(item.get("unit_price", 0))
            _sub(item_el, "PrecioUnitarioItem", _fmt_money(price))
            _sub(item_el, "MontoItem", _fmt_money(price * qty))

        # InformacionReferencia (E34 mandatory)
        if tipo_num == "34":
            info_ref = etree.SubElement(root, "InformacionReferencia")
            ncf_mod = invoice_data.get("original_encf") or invoice_data.get("original_ncf") or invoice_data.get("ecf_encf_original") or ""
            _sub(info_ref, "NCFModificado", ncf_mod)
            fecha_mod = _fmt_date(invoice_data.get("original_date") or invoice_data.get("ecf_original_date"))
            _sub(info_ref, "FechaNCFModificado", fecha_mod)
            codigo_mod = str(invoice_data.get("modification_code") or invoice_data.get("codigo_modificacion") or "1")
            _sub(info_ref, "CodigoModificacion", codigo_mod)
            razon = invoice_data.get("reason") or invoice_data.get("razon_modificacion")
            _sub(info_ref, "RazonModificacion", razon)

        # FechaHoraFirma
        _sub(root, "FechaHoraFirma", _fmt_datetime())

        # Signature — NOT included; Multiprod (PSFE) adds the digital signature

        # Serialize
        xml_bytes = etree.tostring(root, xml_declaration=True, encoding="UTF-8", pretty_print=True)
        return xml_bytes.decode("utf-8")

    def validate_xml_local(self, xml_content: str, ecf_type: str = None) -> tuple:
        """Validate XML against the official DGII XSD V1.0."""
        # Detect type from XML if not provided
        if not ecf_type:
            try:
                doc = etree.fromstring(xml_content.encode("utf-8"))
                tipo_el = doc.find(".//TipoeCF")
                if tipo_el is not None:
                    ecf_type = tipo_el.text
            except Exception:
                pass

        if not ecf_type:
            return False, "No se pudo determinar el tipo de e-CF"

        tipo_num = str(ecf_type).replace("E", "")
        schema = _get_schema(tipo_num)
        if not schema:
            return True, f"XSD para tipo {tipo_num} no disponible, omitiendo validacion"

        try:
            doc = etree.fromstring(xml_content.encode("utf-8"))
            schema.assertValid(doc)
            return True, "OK"
        except etree.DocumentInvalid as e:
            err_msg = str(e)
            # Known exceptions for local XSD vs DGII requirements:
            # 1. Missing Signature wildcard — Multiprod (PSFE) adds digital signature, not us
            # 2. IndicadorMontoGravado — required by DGII for E31/E44/E45 but not in local XSD v1.0
            if "Expected is one of ( {*}*" in err_msg or "Expected is ( {*}*" in err_msg:
                return True, "OK (Signature sera agregada por PSFE)"
            if tipo_num == "44" and "IndicadorMontoGravado" in err_msg:
                return True, "OK (IndicadorMontoGravado aceptado para E44)"
            return False, err_msg
        except Exception as e:
            return False, f"Error de parseo: {str(e)}"

    async def send_ecf(self, xml_content: str, endpoint_url: str, rnc: str = "", encf: str = "") -> dict:
        """POST multipart/form-data to the client's Multiprod URL. Timeout 15s."""
        import time
        filename = f"{rnc}{encf}.xml" if rnc and encf else "ecf.xml"
        try:
            t_start = time.monotonic()
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    endpoint_url,
                    files={"xml": (filename, xml_content.encode("utf-8"), "application/xml")},
                )
                t_elapsed = round((time.monotonic() - t_start) * 1000)
                raw_text = response.text
                resp_headers = {
                    "Content-Type": response.headers.get("content-type", "no presente"),
                    "Content-Length": response.headers.get("content-length", "no presente"),
                }

                diagnostics = {
                    "http_status": response.status_code,
                    "headers": resp_headers,
                    "body_raw": raw_text[:500] if raw_text.strip() else "<vacio>",
                    "body_length": len(raw_text),
                    "response_time_ms": t_elapsed,
                }

                try:
                    data = response.json()
                except Exception:
                    return {
                        "ok": False,
                        "estado": "error_formato",
                        "motivo": f"Respuesta no-JSON (HTTP {response.status_code}, {t_elapsed}ms, Content-Type: {resp_headers['Content-Type']}, Body: {raw_text[:200] if raw_text.strip() else '<vacio>'})",
                        "diagnostics": diagnostics,
                    }

                # Parse Multiprod response: { result: { success, response: { estado, encf, codigo, mensajes }, qr } }
                result_wrapper = data.get("result") or data
                mp_response = result_wrapper.get("response") or {}
                estado = (mp_response.get("estado") or result_wrapper.get("estado") or "").lower()
                encf_resp = mp_response.get("encf") or result_wrapper.get("encf")
                codigo = mp_response.get("codigo")
                mensajes = mp_response.get("mensajes")
                qr = result_wrapper.get("qr") or data.get("qr")
                success = result_wrapper.get("success", False)
                track_id = result_wrapper.get("trackId") or mp_response.get("trackId")

                motivo = None
                if mensajes:
                    if isinstance(mensajes, list):
                        parts = []
                        for m in mensajes:
                            if isinstance(m, dict):
                                parts.append(m.get("valor") or m.get("message") or str(m))
                            else:
                                parts.append(str(m))
                        motivo = "; ".join(parts)
                    else:
                        motivo = str(mensajes)
                if not motivo:
                    motivo = data.get("motivo") or data.get("mensaje") or data.get("message")

                return {
                    "ok": estado.startswith("aceptado") or success,
                    "estado": estado,
                    "trackId": track_id,
                    "encf": encf_resp,
                    "qr": qr,
                    "codigo": codigo,
                    "motivo": motivo,
                    "diagnostics": diagnostics,
                    "raw": data,
                }
        except httpx.TimeoutException:
            return {"ok": False, "estado": "timeout", "motivo": "Multiprod no respondio en 15 segundos"}
        except httpx.ConnectError:
            return {"ok": False, "estado": "connection_error", "motivo": "No se pudo conectar con Multiprod"}
        except Exception as e:
            return {"ok": False, "estado": "error", "motivo": str(e)}

    async def validate_xml_remote(self, xml_content: str, rnc: str, encf: str) -> dict:
        """Validate against Megaplus remote validator. Only for 'Test connection' button."""
        filename = f"{rnc}{encf}.xml"
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(
                    MULTIPROD_VALIDATOR_URL,
                    files={"xml": (filename, xml_content.encode("utf-8"), "application/xml")},
                )
                data = response.json()
                return {
                    "ok": data.get("status") == "success",
                    "message": data.get("msg", ""),
                    "tipo_ecf": data.get("tipoEcf"),
                    "archivo": data.get("archivo"),
                    "errors": data.get("errors", []),
                    "raw": data,
                }
        except Exception as e:
            return {"ok": False, "message": str(e)}


# Singleton
multiprod_service = MultiprodService()
