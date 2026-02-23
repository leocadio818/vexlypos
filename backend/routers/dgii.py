# DGII RNC Validation Router
# Validates RNC against DGII and returns company information
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import asyncio
import re
from typing import Optional

router = APIRouter(tags=["DGII"])

# Cache for RNC lookups to avoid repeated requests
_rnc_cache = {}

class RNCValidationResponse(BaseModel):
    valid: bool
    rnc: str
    nombre: Optional[str] = None
    nombre_comercial: Optional[str] = None
    estado: Optional[str] = None
    actividad_economica: Optional[str] = None
    error: Optional[str] = None

@router.get("/dgii/validate-rnc/{rnc}")
async def validate_rnc(rnc: str) -> RNCValidationResponse:
    """
    Validates an RNC against DGII and returns company information.
    Uses aggressive timeout (2s) for fast response in POS context.
    """
    # Clean RNC - remove dashes and spaces
    clean_rnc = re.sub(r'[^0-9]', '', rnc)
    
    # Basic format validation
    if len(clean_rnc) not in [9, 11]:
        return RNCValidationResponse(
            valid=False,
            rnc=clean_rnc,
            error="RNC debe tener 9 dígitos o Cédula 11 dígitos"
        )
    
    # Check cache first (valid for 24 hours in production, here we just use memory)
    if clean_rnc in _rnc_cache:
        return _rnc_cache[clean_rnc]
    
    try:
        # Try to fetch from DGII with very short timeout
        result = await _fetch_from_dgii(clean_rnc)
        if result:
            _rnc_cache[clean_rnc] = result
            return result
    except asyncio.TimeoutError:
        return RNCValidationResponse(
            valid=False,
            rnc=clean_rnc,
            error="Timeout consultando DGII (continue manualmente)"
        )
    except Exception as e:
        return RNCValidationResponse(
            valid=False,
            rnc=clean_rnc,
            error=f"Error consultando DGII: {str(e)[:50]}"
        )
    
    return RNCValidationResponse(
        valid=False,
        rnc=clean_rnc,
        error="No encontrado en DGII"
    )

async def _fetch_from_dgii(rnc: str) -> Optional[RNCValidationResponse]:
    """
    Fetches RNC information from DGII web service.
    Uses POST to their consultation endpoint.
    Timeout: 2 seconds max for POS speed requirements.
    """
    url = "https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx"
    
    # First, get the page to extract ViewState (required for ASP.NET)
    async with httpx.AsyncClient(timeout=2.0, verify=False) as client:
        # Get initial page
        response = await client.get(url)
        html = response.text
        
        # Extract ViewState and other hidden fields
        viewstate = _extract_field(html, "__VIEWSTATE")
        viewstate_gen = _extract_field(html, "__VIEWSTATEGENERATOR")
        event_validation = _extract_field(html, "__EVENTVALIDATION")
        
        if not viewstate:
            return None
        
        # Submit the form with RNC
        form_data = {
            "__VIEWSTATE": viewstate,
            "__VIEWSTATEGENERATOR": viewstate_gen,
            "__EVENTVALIDATION": event_validation,
            "ctl00$cphMain$txtRNCCedula": rnc,
            "ctl00$cphMain$btnBuscarPorRNC": "Buscar"
        }
        
        response = await client.post(url, data=form_data)
        html = response.text
        
        # Parse response for RNC data
        return _parse_dgii_response(html, rnc)

def _extract_field(html: str, field_name: str) -> Optional[str]:
    """Extract hidden field value from ASP.NET page."""
    pattern = rf'id="{field_name}" value="([^"]*)"'
    match = re.search(pattern, html)
    return match.group(1) if match else None

def _parse_dgii_response(html: str, rnc: str) -> Optional[RNCValidationResponse]:
    """Parse DGII response HTML to extract company information."""
    
    # Check if we got a result (look for result table)
    if "No se encontraron resultados" in html or "lblNombreComercial" not in html:
        return None
    
    # Extract fields using regex
    nombre = _extract_label_value(html, "lblNombre")
    nombre_comercial = _extract_label_value(html, "lblNombreComercial")
    estado = _extract_label_value(html, "lblEstado")
    actividad = _extract_label_value(html, "lblActividadEconomica")
    
    if nombre:
        return RNCValidationResponse(
            valid=True,
            rnc=rnc,
            nombre=nombre,
            nombre_comercial=nombre_comercial if nombre_comercial else None,
            estado=estado,
            actividad_economica=actividad
        )
    
    return None

def _extract_label_value(html: str, label_id: str) -> Optional[str]:
    """Extract text content from a label element."""
    pattern = rf'id="cphMain_{label_id}"[^>]*>([^<]*)</span>'
    match = re.search(pattern, html)
    if match:
        value = match.group(1).strip()
        return value if value else None
    return None
