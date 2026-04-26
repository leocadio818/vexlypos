"""
🔒 CÓDIGO PROTEGIDO - Deployment Safety Guard

Verifica precondiciones críticas para el despliegue en Emergent (K8s).
Detecta regresiones que causarían fallos en el Deployment Health Check.

Estos tests son SOLO LECTURA - no modifican nada en el repositorio.
Corren rápido (<1s) y deben pasar antes de cualquier "Save to GitHub" de producción.

Cómo correrlo manualmente:
    cd /app && pytest backend/tests/test_deployment_safety.py -v

Si alguno falla, NO PUSHEAR a GitHub hasta resolver el blocker.
"""
import os
import re
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]


def _git(*args: str) -> str:
    """Run a git command in the repo root and return stdout (stripped)."""
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.stdout.strip()


# ──────────────────────────────────────────────────────────────────────────
# 1. .env files MUST be tracked in git (required for K8s deployment)
# ──────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("env_path", ["backend/.env", "frontend/.env"])
def test_env_file_is_tracked_in_git(env_path: str) -> None:
    """
    El despliegue de Emergent K8s requiere que backend/.env y frontend/.env
    estén trackeados en git. Si están ignorados, el deployment falla.
    """
    tracked = _git("ls-files", env_path)
    assert tracked == env_path, (
        f"❌ DEPLOYMENT BLOCKER: {env_path} NO está trackeado en git.\n"
        f"   Solución: cd /app && git add -f {env_path} && save to GitHub"
    )


@pytest.mark.parametrize("env_path", ["backend/.env", "frontend/.env"])
def test_env_file_not_actually_ignored(env_path: str) -> None:
    """
    Aunque .gitignore tenga reglas '.env', los archivos trackeados deben
    seguir activos. git check-ignore debe retornar exit 1 (no ignorado).
    """
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "check-ignore", "-q", env_path],
        capture_output=True,
        check=False,
    )
    # Exit 1 = NOT ignored (lo que queremos)
    # Exit 0 = ignored (BLOCKER)
    assert result.returncode != 0, (
        f"❌ DEPLOYMENT BLOCKER: {env_path} está siendo ignorado por .gitignore.\n"
        f"   Solución: revisar /app/.gitignore y aplicar `git add -f {env_path}`"
    )


# ──────────────────────────────────────────────────────────────────────────
# 2. NO hardcoded fallbacks for critical env vars (fail-fast required)
# ──────────────────────────────────────────────────────────────────────────

CRITICAL_ENV_VARS = ["DB_NAME", "MONGO_URL"]
# Patrón que detecta fallbacks tipo:
#   os.environ.get('DB_NAME', 'foo')
#   os.getenv("DB_NAME", "foo")
#   os.environ.get('DB_NAME') or 'foo'
FALLBACK_PATTERNS = [
    r"os\.environ\.get\(\s*['\"]{var}['\"]\s*,\s*['\"]",  # .get('X', 'default')
    r"os\.getenv\(\s*['\"]{var}['\"]\s*,\s*['\"]",        # .getenv('X', 'default')
    r"os\.environ\.get\(\s*['\"]{var}['\"]\s*\)\s*or\s*['\"]",  # .get('X') or 'default'
]


def _scan_backend_for_fallbacks(var: str) -> list[str]:
    """Scan all backend .py files for fallback patterns of a given env var."""
    backend = REPO_ROOT / "backend"
    offenders = []
    patterns = [re.compile(p.format(var=var)) for p in FALLBACK_PATTERNS]
    for py_file in backend.rglob("*.py"):
        # Skip tests and __pycache__
        if "__pycache__" in py_file.parts or "tests" in py_file.parts:
            continue
        try:
            content = py_file.read_text(encoding="utf-8")
        except (UnicodeDecodeError, PermissionError):
            continue
        for line_num, line in enumerate(content.splitlines(), start=1):
            for pat in patterns:
                if pat.search(line):
                    rel = py_file.relative_to(REPO_ROOT)
                    offenders.append(f"  {rel}:{line_num} → {line.strip()}")
                    break
    return offenders


@pytest.mark.parametrize("var", CRITICAL_ENV_VARS)
def test_no_fallback_for_critical_env_var(var: str) -> None:
    """
    Variables críticas (DB_NAME, MONGO_URL) deben usarse en modo fail-fast:
        ✅ os.environ['DB_NAME']
        ❌ os.environ.get('DB_NAME', 'restaurant_pos')

    Un fallback puede causar split-brain DBs en multi-tenant.
    """
    offenders = _scan_backend_for_fallbacks(var)
    assert not offenders, (
        f"❌ DEPLOYMENT BLOCKER: Encontrados fallbacks para {var}:\n"
        + "\n".join(offenders)
        + f"\n\n   Solución: cambiar a os.environ['{var}'] (sin default)"
    )


# ──────────────────────────────────────────────────────────────────────────
# 3. Required env vars must be present in the actual .env files
# ──────────────────────────────────────────────────────────────────────────

REQUIRED_BACKEND_VARS = ["MONGO_URL", "DB_NAME"]
REQUIRED_FRONTEND_VARS = ["REACT_APP_BACKEND_URL"]


def _parse_env_file(path: Path) -> dict[str, str]:
    """Minimal .env parser - returns dict of KEY=VALUE pairs."""
    result = {}
    if not path.exists():
        return result
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def test_backend_env_has_required_vars() -> None:
    """backend/.env debe tener todas las variables críticas declaradas."""
    env = _parse_env_file(REPO_ROOT / "backend" / ".env")
    missing = [v for v in REQUIRED_BACKEND_VARS if not env.get(v)]
    assert not missing, (
        f"❌ DEPLOYMENT BLOCKER: backend/.env no declara: {missing}"
    )


def test_frontend_env_has_required_vars() -> None:
    """frontend/.env debe tener REACT_APP_BACKEND_URL declarada."""
    env = _parse_env_file(REPO_ROOT / "frontend" / ".env")
    missing = [v for v in REQUIRED_FRONTEND_VARS if not env.get(v)]
    assert not missing, (
        f"❌ DEPLOYMENT BLOCKER: frontend/.env no declara: {missing}"
    )


# ──────────────────────────────────────────────────────────────────────────
# 4. All backend routes use /api prefix (Kubernetes ingress requirement)
# ──────────────────────────────────────────────────────────────────────────

def test_main_router_uses_api_prefix() -> None:
    """
    El router principal de FastAPI debe estar montado bajo /api para
    que el ingress de K8s pueda enrutarlo correctamente.
    """
    server_py = REPO_ROOT / "backend" / "server.py"
    content = server_py.read_text(encoding="utf-8")
    # Check for the api_router definition with /api prefix
    assert re.search(r"APIRouter\(\s*prefix\s*=\s*['\"]/api['\"]", content), (
        "❌ DEPLOYMENT BLOCKER: backend/server.py no define un APIRouter "
        "con prefix='/api'. El ingress de K8s requiere este prefijo."
    )
