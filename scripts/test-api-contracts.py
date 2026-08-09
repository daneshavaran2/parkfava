"""API contract tests for the exhibition data layer.

Replaces the original Supabase/PostgREST version. There is no PostgREST any
more and no row-level security: the browser never talks to Postgres, and
authorization lives in TanStack Start server-function middleware
(src/lib/auth/middleware.ts). The contracts worth pinning are therefore the
same three the old file asserted, re-pointed at the surface that actually
enforces them now:

  * anonymous reads expose only approved + active rows
  * unauthenticated writes are rejected and change nothing
  * input validation (zod) rejects malformed arguments

Server functions are addressed at /_serverFn/<base64url({file, export})>.
That path shape, and the seroval envelope the arguments travel in, are
internals of the dev server rather than a public API — this test is pinned to
`bun dev`, like the other e2e scripts in this directory, and would need
revisiting if the framework changes its RPC transport.

Requires: a dev server on localhost:8080 with `bun run seed` already applied
(the assertions rely on the seeded draft/pending companies existing to prove
they stay hidden).

Run:  python scripts/test-api-contracts.py
"""

from __future__ import annotations

import base64
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "http://localhost:8080"

# Companies the seed script creates, and what each one proves.
PUBLIC_COMPANY = "seed-alpha"      # approved + active  -> must be visible
PENDING_COMPANY = "seed-delta"     # pending + inactive -> must stay hidden
DRAFT_COMPANY = "seed-zeta"        # draft + inactive   -> must stay hidden


def server_fn_url(module: str, export: str) -> str:
    """Build the RPC path for a server function, as the client encodes it."""
    payload = json.dumps(
        {"file": f"/src/lib/{module}.functions.ts?tss-serverfn-split",
         "export": f"{export}_createServerFn_handler"},
        separators=(",", ":"),
    )
    token = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    return f"{BASE_URL}/_serverFn/{token}"


def seroval(value):
    """Minimal seroval encoder — covers the strings/lists/dicts used here."""
    counter = [0]

    def node(v):
        if isinstance(v, str):
            return {"t": 1, "s": v}
        if isinstance(v, bool):
            return {"t": 2, "s": 1 if v else 0}
        if isinstance(v, list):
            counter[0] += 1
            return {"t": 9, "i": counter[0], "a": [node(x) for x in v], "o": 0}
        if isinstance(v, dict):
            counter[0] += 1
            return {"t": 10, "i": counter[0],
                    "p": {"k": list(v.keys()), "v": [node(x) for x in v.values()]}, "o": 0}
        raise TypeError(f"unsupported value for this encoder: {v!r}")

    return {"t": node(value), "f": 63, "m": []}


def call(module: str, export: str, data=None, method: str = "GET") -> tuple[int, str]:
    """
    Invoke a server function; returns (http_status, raw_body).

    The method has to match how the function was declared with
    createServerFn — the runtime rejects a mismatch outright. Arguments ride
    in the same seroval envelope either way: a `payload` query parameter for
    GET, a JSON body for POST.
    """
    url = server_fn_url(module, export)
    headers = {
        "x-tsr-serverfn": "true",
        "accept": "application/x-tss-framed, application/x-ndjson, application/json",
    }
    body = None
    if data is not None:
        envelope = json.dumps(seroval({"data": data}))
        if method == "GET":
            url += "?payload=" + urllib.parse.quote(envelope)
        else:
            headers["content-type"] = "application/json"
            body = envelope.encode()
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


passed = 0
failed: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    global passed
    if cond:
        passed += 1
        print(f"  ok   {name}")
    else:
        failed.append(f"{name} — {detail}")
        print(f"  FAIL {name}  {detail}")


def rejected(body: str) -> bool:
    """Server functions report failures inside the payload, not via status."""
    return '"c":"$TSR/Error"' in body


def hides(body: str, company_id: str) -> tuple[bool, str]:
    """
    A "not exposed" assertion is only meaningful if the call actually
    succeeded — an errored response contains no ids either, and would sail
    through a bare `id not in body` check for entirely the wrong reason.
    """
    if rejected(body):
        return False, f"call failed instead of returning data: {body[:140]}"
    if company_id in body:
        return False, f"{company_id} leaked"
    return True, ""


try:
    urllib.request.urlopen(f"{BASE_URL}/api/public/health", timeout=10)
except Exception as exc:  # noqa: BLE001 - any failure to reach the server is fatal here
    print(f"Dev server not reachable at {BASE_URL} ({exc}).")
    print("Start it with: DATABASE_URL=... bun run dev   (and run `bun run seed` first)")
    sys.exit(1)


print("Anonymous reads expose only approved + active rows")
status, body = call("exhibition-api", "getExhibitionCompanies")
check("getExhibitionCompanies responds 200", status == 200, f"status={status}")
check("seeded public company is visible", PUBLIC_COMPANY in body,
      f"{PUBLIC_COMPANY} missing — is the database seeded?")
check("pending company is not exposed", *hides(body, PENDING_COMPANY))
check("draft company is not exposed", *hides(body, DRAFT_COMPANY))

_, body = call("exhibition-api", "getExhibitionCompanyDetail", {"id": DRAFT_COMPANY})
ok, detail = hides(body, DRAFT_COMPANY)
check("detail of a draft company returns no company",
      ok and '"company_id"' not in body, detail or "draft company detail leaked fields")

# The products query re-derives visibility from the parent company rather than
# trusting the caller's id list, so asking for a hidden company's products
# directly must still return nothing.
_, body = call("exhibition-api", "getPublicExhibitionProducts",
               {"companyIds": [DRAFT_COMPANY, PENDING_COMPANY]})
ok_draft, detail_draft = hides(body, DRAFT_COMPANY)
ok_pending, detail_pending = hides(body, PENDING_COMPANY)
check("products of hidden companies are not exposed",
      ok_draft and ok_pending, detail_draft or detail_pending)

# The mirror of the check above: proves the query does return rows when the
# parent company is public, so the "not exposed" results above are the gate
# doing its job rather than the query simply returning nothing for everyone.
_, body = call("exhibition-api", "getPublicExhibitionProducts",
               {"companyIds": [PUBLIC_COMPANY]})
check("products of a public company are returned", PUBLIC_COMPANY in body,
      f"expected the public company's products: {body[:140]}")


print("\nUnauthenticated writes are rejected")
_, body = call("exhibition-api", "saveAdminCompany",
               {"company_id": "contract-test", "name": "contract test"}, method="POST")
check("saveAdminCompany without a session is rejected", rejected(body), body[:160])

_, body = call("exhibition-api", "deleteExhibitionCompanyAdmin",
               {"company_id": PUBLIC_COMPANY}, method="POST")
check("deleteExhibitionCompanyAdmin without a session is rejected", rejected(body), body[:160])

# Proves the rejections above were real: the write never landed, and the row
# the delete targeted is still published.
_, body = call("exhibition-api", "getExhibitionCompanies")
check("rejected write did not create a row", "contract-test" not in body, "the write went through")
check("rejected delete did not remove a row", PUBLIC_COMPANY in body, "the delete went through")


print("\nInput validation")
_, body = call("exhibition-api", "getExhibitionCompanyDetail", {"id": ""})
check("empty company id is rejected", rejected(body), body[:160])

_, body = call("exhibition-api", "getExhibitionCompanyDetail", {"id": "x" * 500})
check("over-long company id is rejected", rejected(body), body[:160])


print(f"\n{passed} passed, {len(failed)} failed")
if failed:
    for item in failed:
        print(" -", item)
    sys.exit(1)
