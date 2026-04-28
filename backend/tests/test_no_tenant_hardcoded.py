"""
REGRESSION GUARD — multi-tenant data leakage.

This test fails the CI/CD pipeline if any tenant-specific identity (business
names, RNCs, phone numbers, addresses) gets hardcoded into the source tree.
Hardcoded fallbacks are dangerous because a fresh pod that hasn't been fully
configured yet would print another customer's identity on its receipts.

If you legitimately need a brand string in code (e.g. inside a unit test),
use the helper `should_skip()` below to opt-out per-file.
"""

import os
import re
from pathlib import Path

# Tenant-identifying strings that must NEVER appear hardcoded in source.
FORBIDDEN_STRINGS = [
    "ALONZO CIGAR",
    "Alonzo Cigar",
    "1-31-75577-1",
    "131886388",  # La Terraza RNC — should always come from system_config
    "131062822",  # Sample customer RNC
    "809-301-3858",
    "849-271-6367",
    "Las Flores #12, Jarabacoa",
    "C/ Las Flores",
    "CAMARGO TRUJILLO",
]

# Roots to scan
SCAN_ROOTS = [
    Path("/app/backend"),
    Path("/app/frontend/src"),
]

# Skip patterns (files/dirs that are allowed to mention these strings)
SKIP_PATTERNS = [
    "__pycache__",
    "node_modules",
    ".git",
    "/uploads/",
    "test_no_tenant_hardcoded.py",  # this file
    "test_propina_legal_fix.py",  # legacy test referencing prior fixture
    "test_pos_dynamic_taxes_and_config.py",  # legacy test with sample data fixture
    "/app/backend/tests/data/",
    "memory/",
    "CHANGELOG.md",
]

# Allowed extensions to scan (skip binaries and lockfiles)
SCAN_EXTS = {".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".css"}


def _should_skip(path: Path) -> bool:
    s = str(path)
    return any(pat in s for pat in SKIP_PATTERNS)


def _scan_file(path: Path) -> list[tuple[int, str, str]]:
    """Return list of (line_no, matched_string, line_text) hits."""
    hits = []
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return hits
    for line_no, line in enumerate(text.splitlines(), start=1):
        # Skip comments referencing the strings (audit trail in CHANGELOG-style notes)
        stripped = line.strip()
        if stripped.startswith("#") or stripped.startswith("//") or stripped.startswith("*"):
            continue
        for needle in FORBIDDEN_STRINGS:
            if needle in line:
                hits.append((line_no, needle, line.strip()[:200]))
    return hits


def test_no_tenant_specific_hardcoded_strings():
    """Fail loudly if any tenant identity leaks into committed source."""
    all_hits: list[tuple[Path, int, str, str]] = []
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix not in SCAN_EXTS:
                continue
            if _should_skip(path):
                continue
            for line_no, needle, text in _scan_file(path):
                all_hits.append((path, line_no, needle, text))
    
    if all_hits:
        msg = ["\n❌ TENANT-SPECIFIC HARDCODED STRINGS DETECTED:\n"]
        for path, line_no, needle, text in all_hits[:30]:
            msg.append(f"  {path.relative_to('/app')}:{line_no}  →  '{needle}'")
            msg.append(f"     {text}")
        msg.append("")
        msg.append("These strings must come from `system_config` (MongoDB), never hardcoded.")
        msg.append("Use `await get_business_info()` in backend or `systemConfig.*` in frontend.")
        raise AssertionError("\n".join(msg))


if __name__ == "__main__":
    test_no_tenant_specific_hardcoded_strings()
    print("✅ No tenant-specific hardcoded strings found.")
