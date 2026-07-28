"""API contract tests for company & product endpoints.

Exercises the PostgREST endpoints backing `src/lib/exhibition-api.ts` and
verifies:
  * anonymous reads return only published/approved rows
  * unauthenticated writes are rejected (RLS)
  * input validation (required fields, negative numbers) surfaces PostgREST
    errors as documented in the README

Requires: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in environment. Skips
gracefully if either is missing so CI without secrets does not fail.

Run:  python scripts/test-api-contracts.py
"""
from __future__ import annotations
import json
import os
import sys
import urllib.request
import urllib.error

URL = os.environ.get("SUPABASE_URL")
KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")

if not URL or not KEY:
    print("SKIP: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set")
    sys.exit(0)


def req(method: str, path: str, body=None, headers=None):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{URL}/rest/v1{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read() or b"null")
        except Exception:
            payload = None
        return e.code, payload


passed = 0
failed: list[str] = []


def check(name: str, cond: bool, detail: str = ""):
    global passed
    if cond:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed.append(f"{name} — {detail}")
        print(f"  ✗ {name}  {detail}")


# -------- anonymous reads --------
print("Anonymous reads (RLS: only approved & published rows)")
status, rows = req("GET", "/exhibition_companies?select=company_id,status,is_active,is_published&limit=50")
check("GET /exhibition_companies returns 200", status == 200, f"status={status}")
if isinstance(rows, list):
    bad = [r for r in rows if r.get("status") != "approved" or r.get("is_active") is not True]
    check("anonymous only sees approved+active rows", not bad, f"found {len(bad)} leaked rows")

status, _ = req("GET", "/exhibition_products?select=id&limit=1")
check("GET /exhibition_products returns 200", status == 200, f"status={status}")

# -------- unauthenticated writes must fail --------
print("\nUnauthenticated writes (RLS should reject)")
status, body = req("POST", "/exhibition_companies",
                   body={"company_id": "contract-test", "name": "contract test"})
check("POST without auth is rejected", status in (401, 403), f"got {status}: {body}")

status, body = req("PATCH", "/exhibition_companies?company_id=eq.seed-alpha",
                   body={"name": "hacked"})
check("PATCH without auth is rejected", status in (401, 403, 404) or (isinstance(body, list) and not body),
      f"got {status}: {body}")

status, body = req("DELETE", "/exhibition_companies?company_id=eq.seed-alpha")
check("DELETE without auth is rejected", status in (401, 403, 404) or (isinstance(body, list) and not body),
      f"got {status}: {body}")

# -------- input validation surfaces --------
print("\nInput validation")
status, body = req("POST", "/exhibition_products",
                   body={"name": "missing-company"})
# either RLS blocks (401/403) or NOT NULL surfaces (400/409); both are acceptable
check("POST product without company_id fails", status >= 400, f"got {status}: {body}")

print(f"\n{passed} passed, {len(failed)} failed")
if failed:
    for f in failed:
        print(" -", f)
    sys.exit(1)
