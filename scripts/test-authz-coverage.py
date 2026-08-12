"""Authorization coverage for every mutating server function.

test-api-contracts.py proves the *visibility* contract (anonymous reads see
only approved+active rows) and spot-checks two admin mutations. It only ever
calls anonymously, so it cannot answer the question this file exists for:

  does every admin-only function actually reject a signed-in NON-admin, and
  does every owner-scoped function actually reject a DIFFERENT owner?

That matters more here than in most codebases: RLS was deliberately dropped
(db/migrations/0001_init.sql), so a function whose middleware or inline
assertAdmin() went missing is simply public — there is no database-level
backstop to catch it. Two real IDOR bugs have already shipped and been fixed
(477553e, 86dcbcf); this is the regression net for the whole surface.

Three identities are exercised against every mutation:

  anonymous      -> must be rejected
  authed non-admin (owner-A) -> must be rejected on admin-only functions
  owner-A acting on owner-B's rows -> must be rejected on owner-scoped ones

Requires: a dev server on localhost:8080, `bun run seed` applied, and the
identity fixtures below (created automatically on first run).

Run:  python scripts/test-authz-coverage.py
"""

from __future__ import annotations

import base64
import http.cookiejar
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "http://localhost:8080"

ADMIN_EMAIL = "authz-admin@example.test"
OWNER_A_EMAIL = "authz-owner-a@example.test"
OWNER_B_EMAIL = "authz-owner-b@example.test"
PASSWORD = "TestPassw0rd!"

COMPANY_A = "seed-alpha"   # owned by owner-A
COMPANY_B = "seed-beta"    # owned by owner-B
PARK = "fava"


def server_fn_url(module: str, export: str) -> str:
    payload = json.dumps(
        {"file": f"/src/lib/{module}.functions.ts?tss-serverfn-split",
         "export": f"{export}_createServerFn_handler"},
        separators=(",", ":"),
    )
    token = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    return f"{BASE_URL}/_serverFn/{token}"


def seroval(value):
    counter = [0]

    def node(v):
        if v is None:
            return {"t": 2, "s": 0}
        if isinstance(v, bool):
            return {"t": 2, "s": 1 if v else 0}
        if isinstance(v, str):
            return {"t": 1, "s": v}
        if isinstance(v, (int, float)):
            return {"t": 0, "s": v}
        if isinstance(v, list):
            counter[0] += 1
            return {"t": 9, "i": counter[0], "a": [node(x) for x in v], "o": 0}
        if isinstance(v, dict):
            counter[0] += 1
            return {"t": 10, "i": counter[0],
                    "p": {"k": list(v.keys()), "v": [node(x) for x in v.values()]}, "o": 0}
        raise TypeError(f"unsupported value: {v!r}")

    return {"t": node(value), "f": 63, "m": []}


class Client:
    def __init__(self, label: str):
        self.label = label
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, module, export, data=None, method="POST"):
        url = server_fn_url(module, export)
        headers = {"x-tsr-serverfn": "true",
                   "accept": "application/x-tss-framed, application/x-ndjson, application/json"}
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
            with self.opener.open(req, timeout=30) as resp:
                return resp.status, resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            return 0, f"TRANSPORT {e}"

    def sign_in(self, email):
        return self.call("auth", "signIn", {"email": email, "password": PASSWORD})

    def sign_up(self, email):
        return self.call("auth", "signUp", {"email": email, "password": PASSWORD})


ERR_MESSAGE = re.compile(r'"message":\{"t":1,"s":"((?:\\.|[^"\\\\])*)"')


def error_message(body: str) -> str:
    m = ERR_MESSAGE.search(body)
    if not m:
        return ""
    try:
        return json.loads('"' + m.group(1) + '"')
    except Exception:  # noqa: BLE001
        return m.group(1)


def classify(status: int, body: str) -> str:
    """
    Collapse a response into one token, keeping three things strictly apart:
    the app authorized it, the app refused it *on authorization grounds*, and
    the call never got that far.

    The last category is the whole point. zod runs BEFORE the auth middleware,
    so a payload the schema rejects returns an error without ever consulting
    the session — it looks exactly like a successful authorization block. An
    HTML 500 (including dev's "Invalid server function ID" for a module no
    page has loaded yet) carries no $TSR/Error marker at all, so a naive
    check reads it as success. Both are the false-pass shape docs/Testing.md
    warns about, and both are reported as VALIDATION_REJECT / HARNESS_* here
    rather than being allowed to count as an authorization verdict.
    """
    if status == 0:
        return "TRANSPORT_FAIL"
    if status != 200:
        if "Invalid server function ID" in body:
            return "HARNESS_MODULE_NOT_LOADED"
        return f"HTTP_{status}"
    if '"result"' not in body and '"error"' not in body:
        return "UNEXPECTED_BODY"

    msg = error_message(body)
    if msg:
        if any(k in msg for k in ("Unauthorized", "not signed in")):
            return "AUTH_REJECT(unauthenticated)"
        if any(k in msg for k in ("Forbidden", "FORBIDDEN")):
            return "AUTH_REJECT(forbidden)"
        if "MFA_REQUIRED" in msg:
            return "AUTH_REJECT(mfa)"
        if "CANNOT_REVOKE_SELF" in msg:
            return "GUARD(cannot_revoke_self)"
        if "UNSUPPORTED_FILE_TYPE" in msg:
            return "GUARD(unsupported_file_type)"
        if any(k in msg for k in ('"code"', "invalid_type", "invalid_string",
                                  "too_small", "too_big", "Required")):
            return "VALIDATION_REJECT"
        return f"ERROR({msg[:40]})"
    if '"c":"$TSR/Error"' in body:
        return "ERROR(unparsed)"
    return "OK"


def warm_modules():
    """A server function is only addressable in dev once its module is loaded."""
    for p in ("/admin/users", "/admin/exhibition", "/admin/parks", "/admin/about",
              "/admin/attachments", "/admin/kahkeshan", "/my-company",
              "/exhibition", "/parks", "/about"):
        try:
            urllib.request.urlopen(f"{BASE_URL}{p}", timeout=90).read()
        except Exception:  # noqa: BLE001
            pass


passed = 0
failed: list[str] = []


def expect_rejected(name: str, status: int, body: str) -> None:
    """
    The call must be refused *on authorization grounds*.

    A schema rejection is not an acceptable pass: it proves only that the
    payload was malformed. Every probe below therefore sends a schema-valid
    payload, and a VALIDATION_REJECT here means the probe itself is wrong and
    is reported as inconclusive rather than quietly counted as a win.
    """
    global passed
    label = classify(status, body)
    if label.startswith("AUTH_REJECT") or label.startswith("GUARD"):
        passed += 1
        print(f"  ok   {name}  [{label}]")
    elif label in ("VALIDATION_REJECT", "HARNESS_MODULE_NOT_LOADED",
                   "TRANSPORT_FAIL", "UNEXPECTED_BODY"):
        failed.append(f"{name} — INCONCLUSIVE ({label}): probe never reached the auth check")
        print(f"  ??   {name}  [{label}] (not an authorization verdict)")
    else:
        failed.append(f"{name} — NOT REJECTED: {label} {body[:120]}")
        print(f"  FAIL {name}  [{label}] <-- accepted")


# ---------------------------------------------------------------- fixtures
warm_modules()

admin = Client("admin")
owner_a = Client("owner-A")
owner_b = Client("owner-B")

for client, email in ((admin, ADMIN_EMAIL), (owner_a, OWNER_A_EMAIL), (owner_b, OWNER_B_EMAIL)):
    if classify(*client.sign_in(email)) != "OK":
        client.sign_up(email)
        if classify(*client.sign_in(email)) != "OK":
            print(f"could not establish a session for {email}; is the server seeded and up?")
            sys.exit(1)

anon = Client("anonymous")

roles_body = admin.call("admin-users", "getMyRoles", method="GET")[1]
if "admin" not in roles_body:
    print("The admin fixture has no admin role.")
    print("This suite needs one; grant it once with:")
    print("  INSERT INTO user_roles (user_id, role) "
          f"SELECT id, 'admin' FROM users WHERE email = '{ADMIN_EMAIL}' "
          "ON CONFLICT DO NOTHING;")
    sys.exit(1)

# Ownership is admin-granted; there is no self-service path.
users = admin.call("admin-users", "listUsers", method="GET")[1]


def user_id_for(email: str) -> str | None:
    idx = users.find(email)
    if idx == -1:
        return None
    ids = re.findall(r'"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"',
                     users[:idx])
    return ids[-1] if ids else None


id_a, id_b = user_id_for(OWNER_A_EMAIL), user_id_for(OWNER_B_EMAIL)
if id_a and id_b:
    admin.call("admin-users", "assignCompanyOwner", {"company_id": COMPANY_A, "user_id": id_a})
    admin.call("admin-users", "assignCompanyOwner", {"company_id": COMPANY_B, "user_id": id_b})

# ---------------------------------------------------------------- admin-only
# Every one of these carries requireMfaVerified + an inline assertAdmin(). A
# signed-in non-admin is the case no existing test covers.
# Every payload here is schema-VALID on purpose. zod runs ahead of the auth
# middleware, so a payload the schema rejects would short-circuit before the
# authorization check and prove nothing. NIL_UUID is well-formed but matches
# no row, so an authorized call would be a harmless no-op.
NIL_UUID = "00000000-0000-4000-8000-000000000000"

PARK_ROW = {"park_id": "authz-probe", "name": "authz probe", "mx": 0.5, "my": 0.5,
            "color": "#123456", "companies_hint": 1, "jobs": 1, "area": 1.0}

ADMIN_ONLY = [
    ("parks", "upsertParkAdmin", PARK_ROW),
    ("parks", "deleteParkAdmin", {"park_id": PARK}),
    ("parks", "reorderParksAdmin", {"ids": [PARK]}),
    ("park-content", "upsertParkContentAdmin", {"park_id": PARK, "description": "authz probe"}),
    ("park-content", "addParkImageAdmin", {"park_id": PARK, "image_url": "/x.png"}),
    ("park-content", "deleteParkImageAdmin", {"id": NIL_UUID}),
    ("park-content", "upsertParkNewsAdmin", {"park_id": PARK, "title": "authz probe"}),
    ("park-content", "deleteParkNewsAdmin", {"id": NIL_UUID}),
    ("about-sections", "upsertAboutSectionAdmin",
     {"section_key": "authz-probe", "title": "authz probe"}),
    ("about-sections", "deleteAboutSectionAdmin", {"id": NIL_UUID}),
    ("attachments", "updateAttachmentAdmin", {"id": NIL_UUID, "title": "authz probe"}),
    ("attachments", "deleteAttachmentAdmin", {"id": NIL_UUID}),
    ("attachments", "reorderAttachmentsAdmin", {"ids": [NIL_UUID]}),
    ("admin-users", "grantAdmin", {"user_id": NIL_UUID}),
    ("admin-users", "revokeAdmin", {"user_id": NIL_UUID}),
    ("admin-users", "assignCompanyOwner", {"company_id": COMPANY_B, "user_id": NIL_UUID}),
    ("exhibition-api", "saveAdminCompany", {"company_id": "authz-probe", "name": "authz probe"}),
    ("exhibition-api", "deleteExhibitionCompanyAdmin", {"company_id": COMPANY_B}),
    ("exhibition-api", "reorderExhibitionCompaniesAdmin", {"ids": [COMPANY_A]}),
    ("exhibition-api", "approveCompanyAdmin", {"company_id": COMPANY_B}),
    ("exhibition-api", "rejectCompanyAdmin", {"company_id": COMPANY_B, "note": "authz probe"}),
]

ADMIN_ONLY_READS = [
    ("admin-users", "listUsers", None),
    ("attachments", "getAllAttachmentsAdmin", {}),
    ("exhibition-api", "listAdminCompanies", None),
]

print("Admin-only mutations reject an anonymous caller")
for module, export, payload in ADMIN_ONLY:
    expect_rejected(f"anon {module}.{export}", *anon.call(module, export, payload))

print("\nAdmin-only mutations reject a signed-in NON-admin")
for module, export, payload in ADMIN_ONLY:
    expect_rejected(f"non-admin {module}.{export}", *owner_a.call(module, export, payload))

print("\nAdmin-only reads reject a signed-in NON-admin")
for module, export, payload in ADMIN_ONLY_READS:
    expect_rejected(f"non-admin {module}.{export}", *owner_a.call(module, export, payload, "GET"))

print("\nAdmin cannot revoke their own admin role")
expect_rejected("admin revokeAdmin(self)",
                *admin.call("admin-users", "revokeAdmin",
                            {"user_id": user_id_for(ADMIN_EMAIL) or
                             "00000000-0000-4000-8000-000000000000"}))

# ---------------------------------------------------------------- cross-owner
# assertCanEditCompany() re-reads owner_user_id per call; these prove it.
print("\nOwner-A cannot mutate owner-B's company")
# Reordering is the case commit 86dcbcf fixed: the handler must reject a list
# whose rows belong to a company the caller does not own, so these carry a
# REAL product id belonging to owner-B rather than a placeholder.
product_b = admin.call("exhibition-api", "getPublicExhibitionProducts",
                       {"companyIds": [COMPANY_B]}, "GET")[1]
real_product_b = re.findall(
    r'"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"', product_b)

CROSS_OWNER = [
    ("exhibition-api", "addExhibitionImage",
     {"company_id": COMPANY_B, "image_url": "/x.png"}),
    ("exhibition-api", "upsertExhibitionProduct",
     {"company_id": COMPANY_B, "name": "authz probe"}),
    ("exhibition-api", "submitCompanyForReview", {"company_id": COMPANY_B}),
]
if real_product_b:
    CROSS_OWNER.append(("exhibition-api", "reorderExhibitionProducts",
                        {"ids": [real_product_b[0]]}))
for module, export, payload in CROSS_OWNER:
    expect_rejected(f"ownerA->B {module}.{export}", *owner_a.call(module, export, payload))
if not real_product_b:
    failed.append("reorderExhibitionProducts — no product found under "
                  f"{COMPANY_B}; cross-owner reorder left untested")
    print(f"  ??   ownerA->B exhibition-api.reorderExhibitionProducts "
          f"(no seeded product under {COMPANY_B})")

# saveOwnedCompany enforces ownership in the UPDATE's WHERE clause and returns
# {ok:true} regardless, so "was it rejected" is the wrong question — the only
# honest check is whether owner-B's row actually changed.
print("\nOwner-A's saveOwnedCompany cannot alter owner-B's row")
before = anon.call("exhibition-api", "getExhibitionCompanyDetail",
                   {"id": COMPANY_B}, "GET")[1]
owner_a.call("exhibition-api", "saveOwnedCompany",
             {"company_id": COMPANY_B, "name": "HIJACKED-BY-OWNER-A"})
after = anon.call("exhibition-api", "getExhibitionCompanyDetail",
                  {"id": COMPANY_B}, "GET")[1]
if "HIJACKED-BY-OWNER-A" in after:
    failed.append("saveOwnedCompany — owner-A overwrote owner-B's company name")
    print("  FAIL ownerA->B exhibition-api.saveOwnedCompany <-- row was modified")
elif classify(200, before) != "OK" or classify(200, after) != "OK":
    failed.append("saveOwnedCompany — could not read the row back to verify")
    print("  ??   ownerA->B exhibition-api.saveOwnedCompany (read-back failed)")
else:
    passed += 1
    print("  ok   ownerA->B exhibition-api.saveOwnedCompany  [no-op, row unchanged]")

print(f"\n{passed} passed, {len(failed)} failed")
if failed:
    for item in failed:
        print(" -", item)
    sys.exit(1)
