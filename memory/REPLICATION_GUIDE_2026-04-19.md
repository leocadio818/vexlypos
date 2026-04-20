# 📦 PROMPT DISTRIBUIBLE — Sesión 2026-04-19

> **Para replicar en los otros tenants de VexlyPOS.**
> Copia y pega este documento completo al agente del tenant destino (Emergent, Cursor, etc.).
> El agente aplicará los cambios manualmente archivo por archivo.
> No requiere git push ni comandos de BD.

---

## 🎯 Resumen ejecutivo

Esta sesión agregó/corrigió **10 mejoras** al módulo e-CF de VexlyPOS:

1. **Fix E31 rechazado por DGII** — agregar `IndicadorMontoGravado` obligatorio.
2. **Alertas en tiempo real de rechazos** — badge rojo + toast + tarjeta destacada con motivo y botón reintentar.
3. **Auto-retry inteligente con backoff exponencial** — clasifica errores transitorios vs permanentes.
4. **Panel de Diagnóstico Multiprod admin-only** — tasa de aceptación 24h, gráfica horaria, top motivos, cola retry.
5. **Exclusión de Contingencia Manual del reintento en lote** — Uber Eats / PedidosYa no se envían a DGII en lote.
6. **Fix lápiz "Editar Tipo e-CF" (HTTP 500)** — importaba función inexistente.
7. **Fix spinner "Procesando" girando en vacío**.
8. **Dropdowns Provincia + Municipio DGII/ONE** con códigos oficiales.
9. **Campo "Dirección Fiscal (DGII)"** separado de la dirección del ticket.
10. **Fix timezone Jornada/Ayer** — siempre usar hora RD sin importar zona del navegador.

---

## ⚙️ Instrucciones para el agente del tenant destino

> **IMPORTANTE**: Aplica los cambios en este orden. Cada sección es independiente y auto-contenida.
> Usa `search_replace` donde indique "reemplazar" y `create_file` donde indique "archivo nuevo".

---

### 🔧 CAMBIO 1 — Fix E31 `IndicadorMontoGravado`

**Archivo**: `/app/backend/services/multiprod_service.py`

**Buscar** este bloque (aproximadamente línea 115):
```python
        # IndicadorMontoGravado — removed for ALL types; Megaplus/DGII XSD rejects it
        # E44 exento status is handled via IndicadorFacturacion=4 in items + MontoExento in Totales

        # FechaVencimientoSecuencia — mandatory for E31, E44, E45 (not E32, E34)
        if tipo_num in ("31", "44", "45"):
```

**Reemplazar por**:
```python
        # FechaVencimientoSecuencia — mandatory for E31, E44, E45 (not E32, E34)
        # XSD order: must come BEFORE IndicadorEnvioDiferido/IndicadorMontoGravado
        if tipo_num in ("31", "44", "45"):
```

Luego, busca el final del bloque `if tipo_num in ("31", "44", "45")` y **DESPUÉS** del `_sub(id_doc, "FechaVencimientoSecuencia", fecha_venc)`, agrega:
```python

        # IndicadorMontoGravado — required by DGII for E31, E32, E34, E45
        # (NOT E44: régimen especial exento, no ITBIS fields allowed)
        # Value "0" = PrecioUnitarioItem does NOT include ITBIS (our POS sends NET prices)
        if tipo_num in ("31", "32", "34", "45"):
            _sub(id_doc, "IndicadorMontoGravado", "0")
```

---

### 🔧 CAMBIO 2 — Endpoint `/api/ecf/rejections` + admin guard

**Archivo**: `/app/backend/routers/ecf_dispatcher.py`

**Paso A** — Agregar `Depends` al import (línea 1 aprox):
```python
from fastapi import APIRouter, HTTPException, Query, Depends
```

**Paso B** — Agregar estos endpoints al final del archivo:

```python
@router.get("/rejections")
async def ecf_rejections(limit: int = Query(20, ge=1, le=100)):
    """
    Lightweight endpoint for real-time rejection alerts.
    Returns the N most recent REJECTED e-CF bills with motivo fully visible.
    """
    query = {
        "$or": [
            {"ecf_status": "REJECTED"},
            {"ecf_reject_reason": {"$exists": True, "$nin": [None, ""]}},
        ],
    }
    bills = await db.bills.find(query, {
        "_id": 0, "id": 1, "transaction_number": 1, "total": 1,
        "ecf_type": 1, "ecf_status": 1, "ecf_encf": 1, "ecf_reject_reason": 1,
        "ecf_provider": 1, "ecf_sent_at": 1, "paid_at": 1, "razon_social": 1,
        "fiscal_id": 1, "table_number": 1, "cashier_name": 1,
        "ecf_auto_retry_attempt": 1, "ecf_auto_retry_next_at": 1,
        "ecf_auto_retry_status": 1, "ecf_auto_retry_max": 1,
    }).sort("ecf_sent_at", -1).to_list(limit)

    rejections = [
        b for b in bills
        if (b.get("ecf_status") or "").upper() == "REJECTED"
        or (b.get("ecf_reject_reason") and (b.get("ecf_status") or "").upper() != "FINISHED")
    ]
    return {
        "count": len(rejections),
        "rejections": rejections,
        "latest_at": rejections[0].get("ecf_sent_at") if rejections else None,
    }


@router.get("/health-metrics")
async def ecf_health_metrics(user=Depends(__import__("routers.auth", fromlist=["get_current_user"]).get_current_user)):
    """Admin-only diagnostic panel for Multiprod/e-CF integration health. 24h metrics."""
    if (user.get("role") or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores pueden acceder al panel de diagnóstico")

    from datetime import datetime, timezone, timedelta
    from collections import Counter, defaultdict

    now = datetime.now(timezone.utc)
    since_iso = (now - timedelta(hours=24)).isoformat()
    logs = await db.ecf_logs.find(
        {"created_at": {"$gte": since_iso}},
        {"_id": 0, "action": 1, "created_at": 1, "result": 1, "provider": 1, "encf": 1}
    ).sort("created_at", -1).to_list(2000)

    accepted = rejected = transient_errors = total_sends = 0
    response_times = []
    reject_reasons = Counter()
    hourly = defaultdict(lambda: {"accepted": 0, "rejected": 0, "retry": 0, "error": 0})

    for log in logs:
        action = (log.get("action") or "").lower()
        if not any(k in action for k in ("send", "retry", "multiprod")):
            continue
        result = log.get("result") or {}
        estado = (result.get("estado") or "").lower()
        diagnostics = result.get("diagnostics") or {}
        rt = diagnostics.get("response_time_ms")
        if isinstance(rt, (int, float)) and rt > 0:
            response_times.append(int(rt))
        total_sends += 1
        try:
            dt = datetime.fromisoformat(str(log.get("created_at")).replace("Z", "+00:00"))
            hour_key = dt.replace(minute=0, second=0, microsecond=0).isoformat()
        except Exception:
            hour_key = now.replace(minute=0, second=0, microsecond=0).isoformat()
        if estado.startswith("aceptado"):
            accepted += 1
            hourly[hour_key]["accepted"] += 1
        elif estado == "rechazado":
            rejected += 1
            reject_reasons[str(result.get("motivo") or "Sin motivo")[:150]] += 1
            hourly[hour_key]["rejected"] += 1
        else:
            transient_errors += 1
            (hourly[hour_key]["retry"] if "retry" in action else hourly[hour_key]["error"])
            if "retry" in action: hourly[hour_key]["retry"] += 1
            else: hourly[hour_key]["error"] += 1

    series = []
    for i in range(23, -1, -1):
        h = (now - timedelta(hours=i)).replace(minute=0, second=0, microsecond=0)
        bucket = hourly.get(h.isoformat(), {"accepted": 0, "rejected": 0, "retry": 0, "error": 0})
        series.append({"hour": h.strftime("%H:00"), "iso": h.isoformat(), **bucket})

    acceptance_rate = round((accepted / total_sends * 100), 1) if total_sends > 0 else None
    health_tier = "unknown"
    if acceptance_rate is not None:
        health_tier = "excellent" if acceptance_rate >= 98 else "good" if acceptance_rate >= 90 else "warning" if acceptance_rate >= 75 else "critical"

    def _percentile(arr, p):
        if not arr: return 0
        s = sorted(arr); idx = min(len(s) - 1, int(round(len(s) * p / 100)) - 1)
        return s[max(0, idx)]

    rt_stats = {
        "avg_ms": int(sum(response_times) / len(response_times)) if response_times else 0,
        "p95_ms": _percentile(response_times, 95),
        "min_ms": min(response_times) if response_times else 0,
        "max_ms": max(response_times) if response_times else 0,
        "samples": len(response_times),
    }

    queue_state = {"attempt_1": 0, "attempt_2": 0, "attempt_3": 0, "attempt_4": 0, "attempt_5": 0, "exhausted": 0}
    async for entry in db.ecf_retry_queue.find({"status": {"$in": ["pending", "exhausted"]}}, {"_id": 0, "attempt": 1, "status": 1}):
        st, att = entry.get("status"), entry.get("attempt", 1)
        if st == "exhausted": queue_state["exhausted"] += 1
        elif 1 <= att <= 5: queue_state[f"attempt_{att}"] += 1

    return {
        "period_hours": 24, "total_sends": total_sends, "accepted": accepted,
        "rejected": rejected, "transient_errors": transient_errors,
        "acceptance_rate": acceptance_rate, "health_tier": health_tier,
        "response_times": rt_stats,
        "top_reject_reasons": [{"motivo": m, "count": c} for m, c in reject_reasons.most_common(5)],
        "hourly_series": series, "queue_state": queue_state,
        "generated_at": now.isoformat(),
    }
```

---

### 🔧 CAMBIO 3 — Auto-retry inteligente con backoff exponencial

**Archivo**: `/app/backend/routers/ecf_provider.py`

Buscar y reemplazar el bloque `RETRY_BACKOFFS = ...` + `enqueue_retry` + `process_retry` + `run_background_retries` por la versión inteligente:

```python
# ─── RETRY QUEUE ───
RETRY_BACKOFFS = [0, 30, 120, 600, 3600]  # 0s, 30s, 2min, 10min, 1h


def _is_permanent_error(result: dict) -> bool:
    """Classifier: permanent (manual action) vs transient (safe to auto-retry)."""
    if not isinstance(result, dict):
        return False
    estado = (result.get("estado") or "").lower()
    if estado == "rechazado":
        return True
    http_status = result.get("diagnostics", {}).get("http_status") if isinstance(result.get("diagnostics"), dict) else None
    if isinstance(http_status, int):
        if 400 <= http_status < 500 and http_status not in (408, 429):
            return True
    return False


async def enqueue_retry(bill_id, encf, reservation_id, attempt, endpoint, xml):
    next_retry = datetime.now(timezone.utc) + timedelta(seconds=RETRY_BACKOFFS[min(attempt, len(RETRY_BACKOFFS) - 1)])
    await db.ecf_retry_queue.update_one(
        {"bill_id": bill_id},
        {"$set": {"bill_id": bill_id, "encf": encf, "reservation_id": reservation_id,
                  "attempt": attempt, "max_attempts": 5, "endpoint": endpoint,
                  "xml_content": xml, "next_retry_at": next_retry.isoformat(),
                  "status": "pending", "created_at": now_iso(), "updated_at": now_iso()}},
        upsert=True
    )
    await db.bills.update_one({"id": bill_id}, {"$set": {
        "ecf_auto_retry_attempt": attempt, "ecf_auto_retry_next_at": next_retry.isoformat(),
        "ecf_auto_retry_status": "pending", "ecf_auto_retry_max": 5,
    }})


async def process_retry(bill_id):
    from services.multiprod_service import multiprod_service
    entry = await db.ecf_retry_queue.find_one({"bill_id": bill_id, "status": "pending"}, {"_id": 0})
    if not entry: return
    attempt = entry.get("attempt", 1)
    endpoint = entry.get("endpoint")
    xml = entry.get("xml_content")
    encf = entry.get("encf")
    reservation_id = entry.get("reservation_id")
    wait_seconds = RETRY_BACKOFFS[min(attempt - 1, len(RETRY_BACKOFFS) - 1)]
    if 0 < wait_seconds <= 30:
        await asyncio.sleep(wait_seconds)
    elif wait_seconds > 30:
        return  # long backoff handled by worker

    sys_cfg = await db.system_config.find_one({}, {"_id": 0}) or {}
    rnc_emisor = (sys_cfg.get("ticket_rnc") or sys_cfg.get("rnc") or sys_cfg.get("ecf_alanube_rnc") or "").replace("-", "").strip()
    result = await multiprod_service.send_ecf(xml, endpoint, rnc=rnc_emisor, encf=encf)
    await db.ecf_logs.insert_one({"id": gen_id(), "bill_id": bill_id, "encf": encf,
        "action": f"multiprod_auto_retry_{attempt}", "result": {k: v for k, v in result.items() if k != "raw"},
        "created_at": now_iso()})

    estado = result.get("estado", "")
    if estado.startswith("aceptado"):
        await consume_reservation(reservation_id)
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "FINISHED", "ecf_encf": encf, "ecf_qr": result.get("qr"),
            "ecf_trackid": result.get("trackId"), "ecf_provider": "multiprod",
            "ecf_attempts": attempt, "ecf_sent_at": now_iso(),
            "ecf_auto_retry_status": "completed", "ecf_auto_retry_next_at": None}})
        await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "completed", "updated_at": now_iso()}})
        return

    if _is_permanent_error(result):
        await consume_reservation(reservation_id)
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "REJECTED", "ecf_encf": encf, "ecf_provider": "multiprod",
            "ecf_reject_reason": result.get("motivo", "Rechazado por DGII"),
            "ecf_attempts": attempt, "ecf_sent_at": now_iso(),
            "ecf_auto_retry_status": "permanent_error", "ecf_auto_retry_next_at": None}})
        await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "rejected", "updated_at": now_iso()}})
        return

    next_attempt = attempt + 1
    if next_attempt > 5:
        await release_reservation(reservation_id)
        await db.bills.update_one({"id": bill_id}, {"$set": {
            "ecf_status": "CONTINGENCIA", "ecf_provider": "multiprod",
            "ecf_error": result.get("motivo", "Agoto reintentos automáticos"),
            "ecf_attempts": attempt, "ecf_auto_retry_status": "exhausted",
            "ecf_auto_retry_next_at": None}})
        await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {"status": "exhausted", "updated_at": now_iso()}})
        return

    next_wait = RETRY_BACKOFFS[min(next_attempt - 1, len(RETRY_BACKOFFS) - 1)]
    next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=next_wait)
    await db.bills.update_one({"id": bill_id}, {"$set": {
        "ecf_attempts": attempt, "ecf_auto_retry_attempt": next_attempt,
        "ecf_auto_retry_next_at": next_retry_at.isoformat(), "ecf_auto_retry_status": "pending"}})
    await db.ecf_retry_queue.update_one({"bill_id": bill_id}, {"$set": {
        "attempt": next_attempt, "next_retry_at": next_retry_at.isoformat(),
        "updated_at": now_iso()}})


async def run_background_retries(bill_id):
    try:
        await process_retry(bill_id)
    except Exception as e:
        print(f"Background retry error for {bill_id}: {e}")


async def auto_retry_worker():
    """Scheduled worker: runs every 60s, processes ready retry queue entries."""
    try:
        now_dt = datetime.now(timezone.utc).isoformat()
        ready = await db.ecf_retry_queue.find(
            {"status": "pending", "next_retry_at": {"$lte": now_dt}},
            {"_id": 0, "bill_id": 1}
        ).limit(50).to_list(50)
        for entry in ready:
            try: await process_retry(entry["bill_id"])
            except Exception as e: print(f"auto_retry_worker: {e}")
    except Exception as e:
        print(f"auto_retry_worker unexpected error: {e}")
```

**Archivo**: `/app/backend/server.py`

En el `startup_event`, **después** de `scheduler.add_job(cleanup_expired_reservations, ...)`, agregar:

```python
    from routers.ecf_provider import auto_retry_worker
    scheduler.add_job(auto_retry_worker, "interval", seconds=60, id="ecf_auto_retry_worker", replace_existing=True)
```

---

### 🔧 CAMBIO 4 — Exclusión contingencia manual + fiscal_address + timezone RD

**Archivo**: `/app/backend/routers/ecf_dispatcher.py`

**Buscar** `@router.post("/retry")` → modificar `if bill.get("ecf_status") not in [...]` para incluir `"REJECTED"`:
```python
    if bill.get("ecf_status") not in ["CONTINGENCIA", "ERROR", "REJECTED", None]:
```

**Buscar** `@router.post("/retry-all")` y **reemplazar todo el cuerpo** por:
```python
@router.post("/retry-all")
async def retry_all_contingencia():
    query = {
        "ecf_status": "CONTINGENCIA",
        "$and": [
            {"$or": [
                {"ecf_error": {"$exists": False}}, {"ecf_error": None},
                {"ecf_error": {"$not": {"$regex": "contingencia_manual", "$options": "i"}}},
            ]},
            {"$or": [{"force_contingency": {"$exists": False}}, {"force_contingency": {"$ne": True}}]},
            {"payments": {"$not": {"$elemMatch": {"$or": [{"skip_ecf": True}, {"force_contingency": True}]}}}},
        ],
    }
    bills = await db.bills.find(query, {"_id": 0, "id": 1}).to_list(100)
    config = await db.system_config.find_one({}, {"_id": 0}) or {}
    provider = config.get("ecf_provider", "alanube")
    results = {"total": len(bills), "success": 0, "failed": 0, "provider": provider, "skipped_manual": 0}
    manual_count = await db.bills.count_documents({
        "ecf_status": "CONTINGENCIA",
        "$or": [
            {"ecf_error": {"$regex": "contingencia_manual", "$options": "i"}},
            {"force_contingency": True},
            {"payments": {"$elemMatch": {"$or": [{"skip_ecf": True}, {"force_contingency": True}]}}},
        ],
    })
    results["skipped_manual"] = manual_count
    for bill_doc in bills:
        bill = await db.bills.find_one({"id": bill_doc["id"]}, {"_id": 0})
        if not bill: continue
        ecf_type = bill.get("ecf_type", "E32")
        ecf_prefix = ecf_type if ecf_type.startswith("E") else "E32"
        encf = gen_encf(ecf_prefix)
        if provider == "thefactory":
            from routers.thefactory import get_next_ncf
            tipo_doc = {"E31": "31", "E32": "32", "E33": "33", "E34": "34"}.get(ecf_prefix, "32")
            ncf_info = await get_next_ncf(tipo_doc)
            encf = ncf_info["ncf"]
            result = await _send_via_thefactory(bill, config, encf, bill_doc["id"], ncf_info.get("fecha_venc"))
        elif provider == "multiprod":
            result = await _send_via_multiprod(bill, config, bill_doc["id"])
        else:
            result = await _send_via_alanube(bill, config, encf, bill_doc["id"])
        if result.get("ok"): results["success"] += 1
        else: results["failed"] += 1
    return {"ok": True, **results}
```

**Buscar** `@router.get("/dashboard")` y en el bloque `else:` (filtro por fechas), reemplazar:
```python
        # Frontend sends dates in LOCAL system timezone (America/Santo_Domingo).
        # Convert local day window to UTC for correct paid_at comparison.
        from zoneinfo import ZoneInfo
        from datetime import datetime as _dt, timezone as _tz
        from utils.timezone import get_system_timezone_name
        try:
            tz_name = await get_system_timezone_name()
            local_tz = ZoneInfo(tz_name)
        except Exception:
            local_tz = ZoneInfo("America/Santo_Domingo")
        if date_from:
            try:
                local_start = _dt.strptime(date_from, "%Y-%m-%d").replace(tzinfo=local_tz)
                query["paid_at"] = {"$gte": local_start.astimezone(_tz.utc).isoformat()}
            except Exception:
                query["paid_at"] = {"$gte": date_from}
        if date_to:
            try:
                local_end = _dt.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=local_tz)
                utc_end = local_end.astimezone(_tz.utc).isoformat()
                if "paid_at" in query: query["paid_at"]["$lte"] = utc_end
                else: query["paid_at"] = {"$lte": utc_end}
            except Exception:
                pass
```

**Buscar** el summary del dashboard y **reemplazar** el loop por:
```python
    summary = {"total": len(bills), "approved": 0, "contingencia": 0, "contingencia_manual": 0,
               "rejected": 0, "pending": 0, "registered": 0}
    for b in bills:
        status = (b.get("ecf_status") or "").upper()
        ecf_err = (b.get("ecf_error") or "").lower()
        is_manual_contingencia = (
            "contingencia_manual" in ecf_err or b.get("force_contingency") is True
            or any((p or {}).get("skip_ecf") is True or (p or {}).get("force_contingency") is True
                   for p in (b.get("payments") or []))
        )
        if status == "FINISHED": summary["approved"] += 1
        elif status == "CONTINGENCIA":
            if is_manual_contingencia: summary["contingencia_manual"] += 1
            else: summary["contingencia"] += 1
        elif status == "REJECTED" or b.get("ecf_reject_reason"): summary["rejected"] += 1
        elif status == "REGISTERED": summary["registered"] += 1
        else: summary["pending"] += 1
    return {"summary": summary, "bills": bills}
```

La proyección de `find` debe incluir estos campos adicionales:
```python
        "ecf_auto_retry_attempt": 1, "ecf_auto_retry_next_at": 1,
        "ecf_auto_retry_status": 1, "ecf_auto_retry_max": 1,
        "force_contingency": 1, "payments": 1,
```

---

### 🔧 CAMBIO 5 — Fiscal address en 3 proveedores

**Archivo**: `/app/backend/services/multiprod_service.py`

Buscar `DireccionEmisor` y reemplazar por:
```python
        _sub(emisor, "DireccionEmisor", system_config.get("fiscal_address") or system_config.get("ticket_address") or system_config.get("address") or system_config.get("direccion") or "SIN DIRECCION")
```

**Archivos**: `/app/backend/routers/alanube.py` y `/app/backend/routers/credit_notes.py`

Buscar:
```python
        "address": system_config.get("ticket_address") or system_config.get("address") or "Calle Principal #1",
```
Reemplazar por:
```python
        "address": system_config.get("fiscal_address") or system_config.get("ticket_address") or system_config.get("address") or "Calle Principal #1",
```

---

### 🔧 CAMBIO 6 — Fix lápiz editar tipo e-CF

**Archivo**: `/app/backend/routers/billing.py`

Busca el endpoint `@router.patch("/bills/{bill_id}/ecf-type")` y **reemplaza todo el cuerpo** de la función `update_bill_ecf_type` por la versión que:
- Usa `log_audit_event` (no `log_action`).
- Bloquea edición si bill tiene `force_contingency: true` o payment con esos flags.
- Actualiza `ecf_type` además de `ncf_type`.

El código completo está en `/app/backend/routers/billing.py` líneas 184-260 del tenant origen. Cópialo tal cual.

---

### 🔧 CAMBIO 7 — Archivo nuevo: códigos DGII/ONE territoriales

**Archivo nuevo**: `/app/frontend/src/data/dgii_territories.js`

Copia el contenido completo desde el tenant origen (archivo con `PROVINCIAS`, `MUNICIPIOS_BY_PROVINCIA`, `getProvinciaName`, `getMunicipioName`).

---

### 🔧 CAMBIO 8 — Frontend: Layout.js (polling rejections + health + timezone)

**Archivo**: `/app/frontend/src/components/Layout.js`

Agregar imports en la sección de imports:
```javascript
import { getSystemToday } from '@/lib/timezone';
```

Reemplazar `getEcfDates` con la versión que usa `getSystemToday()` (copiar del tenant origen).

Agregar (después de `fetchEcfDashboard`): el bloque completo de **polling rejections cada 60s** + **polling health-metrics cada 5min admin-only** (copiar del tenant origen líneas ~140-220 de Layout.js).

Agregar en el botón "Opciones" (desktop + mobile):
- Clase `relative` al botón.
- Badge rojo `absolute -top-1 -right-1` cuando `unseenRejectionCount > 0`.
- Badge ámbar pequeño cuando `ecfHealthAlert && user?.role === 'admin'`.

En la opción "e-CF Dashboard" del menú:
- Agregar `markRejectionsSeen()` al click.
- Badge rojo cuando `unseenRejectionCount > 0`.

---

### 🔧 CAMBIO 9 — Frontend: EcfDashboard.jsx

**Archivo**: `/app/frontend/src/pages/reports/EcfDashboard.jsx`

Agregar imports:
```javascript
import { Activity, ChevronDown, ChevronUp, Zap, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
```

Cambios principales:
1. **Tarjeta "Rechazos DGII · Acción requerida"** al tope (antes de los KPI cards).
2. **Fix spinner "Procesando"**: `animate-spin` solo si `count > 0`.
3. **Getter `getStatus`** detecta manual por `ecf_error`, `force_contingency` bill-level, o payment flags.
4. **KPI "Cont. Manual"** usa `summary.contingencia_manual` del backend.
5. **Botón "Reintentar Todas"** muestra count real + leyenda sobre manuales excluidas.
6. **Acciones por status**:
   - `CONTINGENCIA` o `REJECTED` → lápiz + reintentar.
   - `CONTINGENCIA_MANUAL` → badge "Plataforma externa" + reintentar (sin lápiz).
7. **Componente `EcfHealthPanel`** al final del archivo (solo render si `user?.role === 'admin'`).

Requerido: `yarn add recharts` si no está ya instalado.

---

### 🔧 CAMBIO 10 — SystemTab.js (Ubicación Fiscal DGII)

**Archivo**: `/app/frontend/src/pages/settings/SystemTab.js`

Agregar import:
```javascript
import { PROVINCIAS, MUNICIPIOS_BY_PROVINCIA } from '@/data/dgii_territories';
```

Después del bloque del RNC, agregar la nueva card "Ubicación Fiscal (DGII)" con:
- Dropdown provincia (32 opciones, value = código 2 dígitos).
- Dropdown municipio (filtrado por `MUNICIPIOS_BY_PROVINCIA[systemConfig.province]`).
- Input "Dirección Fiscal (DGII)" con maxLength 100 y contador.

El código completo está en `/app/frontend/src/pages/settings/SystemTab.js` líneas ~516-605 del tenant origen.

---

## ✅ Checklist de validación post-deploy

Después de aplicar todos los cambios, el agente debe:

1. ☐ `sudo supervisorctl restart backend` y verificar en logs que inicie sin errores.
2. ☐ `tail -n 30 /var/log/supervisor/backend.err.log` — debe decir "Added job ecf_auto_retry_worker".
3. ☐ `curl /api/ecf/rejections?limit=5` → 200 OK con lista de rechazos.
4. ☐ `curl /api/ecf/health-metrics` con token de cajero → 403.
5. ☐ `curl /api/ecf/health-metrics` con token admin → 200 con métricas.
6. ☐ Login como admin → e-CF Dashboard → ver panel "Diagnóstico Multiprod" visible.
7. ☐ Emitir una factura E31 con RNC del comprador → debe aprobarse en DGII (no más error `IndicadorMontoGravado`).
8. ☐ En pestaña Sistema → verificar que aparecen dropdowns "Provincia" + "Municipio" y campo "Dirección Fiscal (DGII)".
9. ☐ Cambiar provincia → el dropdown de municipios se actualiza automáticamente.
10. ☐ Filtro "Jornada" en e-CF Dashboard muestra las facturas de hoy en hora RD (no UTC).

---

## 🔐 Importante

- Los campos de MongoDB `ecf_auto_retry_*` se crean automáticamente al primer retry (no requieren migración).
- La colección `ecf_retry_queue` se crea automáticamente al primer `enqueue_retry`.
- Todos los cambios son **compatibles con tenants Multi-client** ya existentes (respetan `client_id` en Supabase).
- Si el tenant NO usa Multiprod, las funciones `auto_retry_worker` y `process_retry` no hacen nada (solo filtran status CONTINGENCIA con bills de multiprod).

---

Generado: 2026-04-19 · Versión: 1.0 · Autor: VexlyPOS / Leo
