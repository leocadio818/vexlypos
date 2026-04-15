"""
Multiprod AM SRL — e-CF Service
PSFE integration: builds XML, validates, sends to Multiprod endpoint.
"""
import httpx
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


MULTIPROD_VALIDATOR_URL = os.environ.get("MULTIPROD_VALIDATOR_URL", "https://validator.megaplus.com.do/api/xml/validate/")
DR_TZ = ZoneInfo("America/Santo_Domingo")


class MultiprodService:

    def build_xml(self, invoice_data: dict, system_config: dict, ecf_type: str, encf: str) -> str:
        """
        Construye XML según XSD oficial DGII V1.0.
        TODO: Implementar cuando el XSD esté disponible.
        """
        raise NotImplementedError("XML builder pendiente de XSD")

    def validate_xml_local(self, xml_content: str) -> tuple:
        """
        Valida contra XSD oficial DGII V1.0 con lxml.
        TODO: Implementar cuando el XSD esté disponible.
        """
        return True, "OK (validacion local pendiente de XSD)"

    async def send_ecf(self, xml_content: str, endpoint_url: str) -> dict:
        """
        POST síncrono a la URL del cliente Multiprod.
        endpoint_url ya viene completa (con token embebido si aplica).
        Timeout 15s.
        """
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    endpoint_url,
                    content=xml_content,
                    headers={"Content-Type": "application/xml; charset=utf-8"},
                )
                data = response.json()

                if response.status_code in [200, 201]:
                    estado = (data.get("estado") or data.get("status") or "").lower()
                    return {
                        "ok": estado == "aceptado",
                        "estado": estado,
                        "trackId": data.get("trackId") or data.get("track_id"),
                        "encf": data.get("encf") or data.get("eNCF"),
                        "qr": data.get("qr") or data.get("qrCode"),
                        "motivo": data.get("motivo") or data.get("mensaje") or data.get("message"),
                        "raw": data,
                    }
                else:
                    return {
                        "ok": False,
                        "estado": "error",
                        "motivo": data.get("message") or data.get("error") or f"HTTP {response.status_code}",
                        "raw": data,
                    }
        except httpx.TimeoutException:
            return {"ok": False, "estado": "timeout", "motivo": "Multiprod no respondio en 15 segundos"}
        except httpx.ConnectError:
            return {"ok": False, "estado": "connection_error", "motivo": "No se pudo conectar con Multiprod"}
        except Exception as e:
            return {"ok": False, "estado": "error", "motivo": str(e)}

    async def validate_xml_remote(self, xml_content: str, rnc: str, encf: str) -> dict:
        """
        Valida contra validador remoto Megaplus.
        Solo para botón 'Probar conexión' en Configuración.
        """
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
                    "raw": data,
                }
        except Exception as e:
            return {"ok": False, "message": str(e)}


# Singleton
multiprod_service = MultiprodService()
