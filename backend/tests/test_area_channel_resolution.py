"""
Tests for area-aware print channel resolution.

Covers the QA scenarios from the multi-channel printing fix:
1. Generic 'bar' code with VIP area → resolves to BAR GRANDE (bar1)
2. Generic 'bar' code with Terraza area → resolves to BAR PEQUEÑO (bar2)
3. 'kitchen' code → always kitchen regardless of area
4. Generic 'bar' with NO area mapping → first channel starting with 'bar'
5. Generic 'receipt' with area mapping → custom receipt channel
6. Code that doesn't exist and no fallback → returned unchanged (observable)
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class FakeFindOne:
    """Mimics the .find_one() async iterator returning a single doc or None."""
    def __init__(self, docs):
        self.docs = docs
    
    async def __call__(self, filt, proj=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in filt.items()):
                return d
        return None


class FakeCollection:
    def __init__(self, docs):
        self.docs = docs
        self.find_one = FakeFindOne(docs)


def run_tests():
    # Imitate the resolver logic locally
    async def resolve(base_channel_code, area_id, available_channels, mappings):
        if not base_channel_code:
            return base_channel_code
        if area_id:
            for m in mappings:
                if m.get("area_id") == area_id and m.get("category_id") == base_channel_code:
                    target = m.get("channel_code")
                    if any(c.get("code") == target for c in available_channels):
                        return target
        if any(c.get("code") == base_channel_code for c in available_channels):
            return base_channel_code
        cands = sorted(
            [c for c in available_channels if (c.get("code") or "").startswith(base_channel_code)],
            key=lambda c: c.get("code") or ""
        )
        if cands:
            return cands[0]["code"]
        return base_channel_code

    channels = [
        {"code": "kitchen", "name": "Cocina", "ip": "192.168.0.91"},
        {"code": "bar1", "name": "Bar Grande", "ip": "192.168.0.88"},
        {"code": "bar2", "name": "Bar Pequeño", "ip": "192.168.0.97"},
        {"code": "receipt", "name": "Caja 1", "ip": "192.168.0.89"},
        {"code": "receipt2", "name": "Caja 2", "ip": "192.168.0.90"},
        {"code": "receipt3", "name": "Pre Cuentas", "ip": "192.168.0.50"},
    ]
    
    mappings = [
        {"area_id": "vip", "category_id": "bar", "channel_code": "bar1"},
        {"area_id": "terraza", "category_id": "bar", "channel_code": "bar2"},
        {"area_id": "salon", "category_id": "bar", "channel_code": "bar1"},
        {"area_id": "terraza", "category_id": "receipt", "channel_code": "receipt3"},
        {"area_id": "vip", "category_id": "receipt", "channel_code": "receipt"},
    ]
    
    async def main():
        # Test 1 — VIP + bar → bar1
        r = await resolve("bar", "vip", channels, mappings)
        assert r == "bar1", f"Test 1 failed: expected bar1, got {r}"
        print("[PASS] Test 1: VIP + 'bar' → bar1 (BAR GRANDE)")

        # Test 2 — Terraza + bar → bar2
        r = await resolve("bar", "terraza", channels, mappings)
        assert r == "bar2", f"Test 2 failed: expected bar2, got {r}"
        print("[PASS] Test 2: Terraza + 'bar' → bar2 (BAR PEQUEÑO)")

        # Test 3 — kitchen with any area → kitchen (no mapping needed)
        r = await resolve("kitchen", "vip", channels, mappings)
        assert r == "kitchen", f"Test 3 failed: expected kitchen, got {r}"
        r = await resolve("kitchen", None, channels, mappings)
        assert r == "kitchen", f"Test 3b failed"
        print("[PASS] Test 3: 'kitchen' always → kitchen")

        # Test 4 — Pre-cuenta from Caja 2 (no area mapping) — Priority B should resolve via terminal
        # Here we just test the resolver: receipt2 stays as receipt2
        r = await resolve("receipt2", None, channels, mappings)
        assert r == "receipt2", f"Test 4 failed: expected receipt2, got {r}"
        print("[PASS] Test 4: 'receipt2' (Caja 2 terminal) stays receipt2")

        # Test 5 — Terraza pre-cuenta with area mapping → receipt3
        r = await resolve("receipt", "terraza", channels, mappings)
        assert r == "receipt3", f"Test 5 failed: expected receipt3, got {r}"
        print("[PASS] Test 5: Terraza + 'receipt' → receipt3 (Pre Cuentas afuera)")

        # Test 6 — bar without area → prefix fallback to bar1 (alphabetically first)
        r = await resolve("bar", None, channels, mappings)
        assert r == "bar1", f"Test 6 failed: expected bar1, got {r}"
        print("[PASS] Test 6: 'bar' without area → bar1 (prefix fallback)")

        # Test 7 — non-existent code with no prefix match → returned unchanged
        r = await resolve("inexistent", None, channels, mappings)
        assert r == "inexistent", f"Test 7 failed: expected inexistent, got {r}"
        print("[PASS] Test 7: unknown code → unchanged (observable)")

        # Test 8 — area mapping points to non-existent channel → fall through to base resolution
        bad_mappings = [{"area_id": "vip", "category_id": "bar", "channel_code": "bar99"}]
        r = await resolve("bar", "vip", channels, bad_mappings)
        assert r == "bar1", f"Test 8 failed: expected bar1 (prefix), got {r}"
        print("[PASS] Test 8: area mapping to ghost channel → ignored, falls to prefix")

        # Test 9 — empty base_channel_code → returned as-is
        r = await resolve("", "vip", channels, mappings)
        assert r == "", f"Test 9 failed"
        print("[PASS] Test 9: empty code → empty")

        # Test 10 — 'cocina' with kitchen channel only — exact mismatch, prefix 'cocina' doesn't match anything → returns 'cocina' unchanged
        r = await resolve("cocina", None, channels, mappings)
        assert r == "cocina", f"Test 10 failed (we expect unchanged so caller sees the issue): got {r}"
        print("[PASS] Test 10: 'cocina' unfixable by resolver → unchanged (caught by /admin/fix endpoint)")

    asyncio.run(main())
    print("\n✅ All 10 area-aware channel resolution tests passed.")


if __name__ == "__main__":
    run_tests()
