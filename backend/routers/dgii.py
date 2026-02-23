# DGII RNC Validation Router
# Validates RNC against DGII via Megaplus API and returns company information
from fastapi import APIRouter
from pydantic import BaseModel
import httpx
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
    regimen_pagos: Optional[str] = None
    administracion: Optional[str] = None
    es_facturador_electronico: Optional[bool] = None
    error: Optional[str] = None

@router.get("/dgii/validate-rnc/{rnc}")
async def validate_rnc(rnc: str) -> RNCValidationResponse:
    """
    Validates an RNC against DGII and returns company information.
    Uses Megaplus API with 3s timeout for fast response in POS context.
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
    
    # Check cache first
    if clean_rnc in _rnc_cache:
        return _rnc_cache[clean_rnc]
    
    try:
        result = await _fetch_from_megaplus(clean_rnc)
        if result:
            _rnc_cache[clean_rnc] = result
            return result
    except httpx.TimeoutException:
        return RNCValidationResponse(
            valid=False,
            rnc=clean_rnc,
            error="Timeout consultando DGII"
        )
    except Exception as e:
        return RNCValidationResponse(
            valid=False,
            rnc=clean_rnc,
            error=f"Error: {str(e)[:50]}"
        )
    
    return RNCValidationResponse(
        valid=False,
        rnc=clean_rnc,
        error="No encontrado en DGII"
    )

async def _fetch_from_megaplus(rnc: str) -> Optional[RNCValidationResponse]:
    """
    Fetches RNC information from Megaplus API.
    Timeout: 3 seconds max for POS speed requirements.
    """
    url = f"https://rnc.megaplus.com.do/api/consulta?rnc={rnc}"
    
    async with httpx.AsyncClient(timeout=3.0) as client:
        response = await client.get(url)
        data = response.json()
        
        if data.get("error") is False and data.get("codigo_http") == 200:
            return RNCValidationResponse(
                valid=True,
                rnc=rnc,
                nombre=data.get("nombre_razon_social"),
                nombre_comercial=data.get("nombre_comercial") or None,
                estado=data.get("estado"),
                actividad_economica=data.get("actividad_economica"),
                regimen_pagos=data.get("regimen_de_pagos"),
                administracion=data.get("administracion_local"),
                es_facturador_electronico=data.get("facturador_electronico") == "SI"
            )
        elif data.get("codigo_http") == 404:
            return RNCValidationResponse(
                valid=False,
                rnc=rnc,
                error="RNC no inscrito como contribuyente"
            )
        else:
            return RNCValidationResponse(
                valid=False,
                rnc=rnc,
                error=data.get("mensaje", "Error desconocido")
            )
