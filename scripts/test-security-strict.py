"""Stricter security tests (docs/Security Report.md), on top of
test-security-probes.py:

  * every server function in src/lib/*.functions.ts is inventoried: the ones
    without auth middleware must be on the public allowlist below, and none
    of the protected ones may answer an anonymous or a non-admin caller;
  * visibility: nothing of an unpublished company is readable anonymously;
  * fuzzing: every server function gets hostile payloads (wrong types, huge
    and malformed values, prototype-pollution keys, deep nesting, broken
    serialization) as an anonymous user and as an admin — no crash, no stack
    trace, and authorization still holds afterwards;
  * account security: weak passwords, concurrent sign-up race, rate limit
    bypass through identifier variants, stale admin rights after revocation,
    cookie scope, CRLF injection, same-site requests to server functions;
  * with --prod: secrets or server-only code in the client bundle.

Requires a disposable database (DATABASE_URL, psql on PATH) and a running
server. Never point it at production.

  Dev server:        DATABASE_URL=... python scripts/test-security-strict.py
  Production build:  DATABASE_URL=... BASE_URL=http://localhost:3000 \\
                         python scripts/test-security-strict.py --prod --build .output
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures
import glob
import http.client
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

parser = argparse.ArgumentParser()
parser.add_argument("--prod", action="store_true")
parser.add_argument("--build", default=".output")
args = parser.parse_args()

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.environ.get("DATABASE_URL")
if not DB:
    sys.exit("DATABASE_URL is required (a disposable test database).")
BASE = os.environ.get("BASE_URL", "http://localhost:3000" if args.prod else "http://localhost:8080").rstrip("/")
_u = urllib.parse.urlsplit(BASE)
HOST, PORT = _u.hostname or "localhost", _u.port or 80
USER_EMAIL = "security-strict-user@example.test"
ADMIN_EMAIL = "security-strict-admin@example.test"
PASSWORD = "Strict#Passw0rd2026"
failures = checks = 0
notes: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    global failures, checks
    checks += 1
    failures += 0 if ok else 1
    print(f"  {'ok  ' if ok else 'FAIL'} {label}{('  [' + detail + ']') if detail else ''}")


def note(text: str) -> None:
    notes.append(text)
    print(f"  note {text}")


def psql(statement: str) -> str:
    return subprocess.run(["psql", "-qtA", DB, "-c", statement], check=True, capture_output=True, text=True).stdout.strip()


def request(method, path, body=None, headers=None):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=120)
    h = {"user-agent": "security-strict"}
    h.update(headers or {})
    t0 = time.time()
    try:
        conn.request(method, path, body=body, headers=h)
        r = conn.getresponse()
        data = r.read().decode("utf-8", "replace")
        out = (r.status, {k.lower(): v for k, v in r.getheaders()}, r.getheaders(), data, time.time() - t0)
    except (ConnectionError, http.client.HTTPException, TimeoutError) as e:
        out = (0, {}, [], f"TRANSPORT {e}", time.time() - t0)
    conn.close()
    return out


# --- server functions --------------------------------------------------------
def build_ids(build_dir):
    ids = {}
    pat = re.compile(r'createServerRpc\(\{\s*id:\s*"([0-9a-f]+)",\s*name:\s*"(\w+)",\s*filename:\s*"src/lib/([\w.-]+)\.functions\.ts"')
    for root, _, files in os.walk(os.path.join(build_dir, "server")):
        for f in files:
            if f.endswith(".mjs"):
                with open(os.path.join(root, f), encoding="utf-8", errors="replace") as fh:
                    for m in pat.finditer(fh.read()):
                        ids[(m.group(3), m.group(2))] = m.group(1)
    return ids


IDS = build_ids(os.path.join(ROOT, args.build) if not os.path.isabs(args.build) else args.build) if args.prod else {}


def fn_path(module, export):
    if args.prod:
        return "/_serverFn/" + IDS[(module, export)]
    payload = json.dumps({"file": f"/src/lib/{module}.functions.ts?tss-serverfn-split",
                          "export": f"{export}_createServerFn_handler"}, separators=(",", ":"))
    return "/_serverFn/" + base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


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
        counter[0] += 1
        return {"t": 10, "i": counter[0], "p": {"k": list(v.keys()), "v": [node(x) for x in v.values()]}, "o": 0}

    return {"t": node(value), "f": 63, "m": []}


class Session:
    def __init__(self):
        self.cookies = {}
        self.set_cookie = []

    def _absorb(self, raw):
        self.set_cookie = [v for k, v in raw if k.lower() == "set-cookie"]
        for sc in self.set_cookie:
            name, _, rest = sc.partition("=")
            value = rest.split(";", 1)[0]
            if not value or "max-age=0" in sc.lower() or "1970" in sc:
                self.cookies.pop(name, None)
            else:
                self.cookies[name] = value

    def call(self, module, export, data=None, method="POST", raw_body=None, extra=None):
        path = fn_path(module, export)
        h = {"x-tsr-serverfn": "true", "accept": "application/json"}
        if self.cookies:
            h["cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        h.update(extra or {})
        body = None
        if raw_body is not None:
            h["content-type"] = "application/json"
            if method == "GET":
                path += "?payload=" + urllib.parse.quote(raw_body)
            else:
                body = raw_body.encode()
        elif data is not None:
            envelope = json.dumps(seroval({"data": data}))
            if method == "GET":
                path += "?payload=" + urllib.parse.quote(envelope)
            else:
                h["content-type"] = "application/json"
                body = envelope.encode()
        st, hd, raw, text, dt = request(method, path, body, h)
        self._absorb(raw)
        return st, text, dt


ERR = re.compile(r'"message":\{"t":1,"s":"((?:\\.|[^"\\])*)"')


def err(body):
    m = ERR.search(body)
    return json.loads('"' + m.group(1) + '"') if m else ""


def succeeded(body):
    return '"k":["result"]' in body


def app_error(body):
    return '"k":["error"]' in body


STACK = re.compile(r"\bat [\w.<>$]+ \(|node_modules/|/src/lib/|\.ts:\d+:\d+")
DB_ERROR = re.compile(r"syntax error at or near|duplicate key value|violates (unique|foreign key|check) constraint|PostgresError|invalid input syntax", re.I)


def inventory():
    out = []
    for p in sorted(glob.glob(os.path.join(ROOT, "src/lib/*.functions.ts"))):
        s = open(p, encoding="utf-8").read()
        mod = os.path.basename(p).replace(".functions.ts", "")
        for m in re.finditer(r'export const (\w+) = createServerFn\(\{ method: "(GET|POST)" \}\)', s):
            nxt = s.find("\nexport const ", m.end())
            chain = s[m.end(): nxt if nxt != -1 else len(s)]
            mw = re.search(r"\.middleware\(\[([^\]]*)\]\)", chain[:800])
            middleware = mw.group(1).strip() if mw else ""
            admin = "assertIsAdmin(" in chain or "requireAdmin" in middleware
            validated = ".validator(" in chain[:800]
            out.append((mod, m.group(1), m.group(2), middleware, admin, validated))
    return out


PUBLIC = {("about-sections", "getAboutSections"), ("assistant", "askAssistant"), ("attachments", "getAttachments"),
          ("auth", "signUp"), ("auth", "signIn"), ("auth", "signOutFn"), ("auth", "getCurrentUser"),
          ("exhibition-api", "getExhibitionCompanies"), ("exhibition-api", "getPublicExhibitionProducts"),
          ("exhibition-api", "getExhibitionCompanyDetail"), ("park-content", "getParkContent"),
          ("parks", "getActiveParks"), ("parks", "getInactiveParkIds")}


def sign_in(email):
    s = Session()
    st, body, _ = s.call("auth", "signIn", {"email": email, "password": PASSWORD})
    if not succeeded(body):
        sys.exit(f"could not sign in {email}: {err(body) or st}")
    return s


# --- setup -------------------------------------------------------------------
psql(f"DELETE FROM users WHERE email IN ('{USER_EMAIL}', '{ADMIN_EMAIL}'); DELETE FROM rate_limit_hits;")
for email in (USER_EMAIL, ADMIN_EMAIL):
    st, body, _ = Session().call("auth", "signUp", {"email": email, "password": PASSWORD})
    if not succeeded(body):
        sys.exit(f"could not create {email} ({err(body) or st}); is the server up at {BASE}?")
psql(f"INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM users WHERE email = '{ADMIN_EMAIL}' ON CONFLICT DO NOTHING;")
psql("DELETE FROM rate_limit_hits;")
admin = sign_in(ADMIN_EMAIL)
user = sign_in(USER_EMAIL)
anon = Session()
print(f"target {BASE} ({'production build' if args.prod else 'dev server'})")

if not args.prod:
    # The dev server registers a server function only once a page importing
    # it has been rendered; load every page first.
    for route in glob.glob(os.path.join(ROOT, "src/routes/*.tsx")):
        name = os.path.basename(route)[:-4]
        if name.startswith("__") or "$" in name:
            continue
        path = "/" + ("" if name == "index" else name.replace(".", "/").replace("/index", ""))
        request("GET", path, headers={"cookie": "; ".join(f"{k}={v}" for k, v in admin.cookies.items())})

INV = inventory()
print(f"Server-function inventory ({len(INV)} functions)")
unregistered = set()
for mod, name, method, middleware, admin_only, validated in INV:
    if not middleware:
        check(f"{mod}.{name} without auth middleware is on the public allowlist", (mod, name) in PUBLIC)
        continue
    for label, sess in (("anonymous", anon), ("signed-in non-admin", user)):
        if label == "signed-in non-admin" and not admin_only:
            continue
        for data in (None, {}):
            st, body, _ = sess.call(mod, name, data, method)
            if not args.prod and not succeeded(body) and not app_error(body):
                unregistered.add(f"{mod}.{name}")
                break
            check(f"{mod}.{name} refuses a {label} caller ({'no input' if data is None else 'empty input'})", not succeeded(body),
                  err(body)[:50])
if unregistered:
    note(f"{len(unregistered)} functions not reachable on the dev server (not loaded by any page); run with --prod for full coverage: "
         + ", ".join(sorted(unregistered)[:6]))

print("Visibility of unpublished companies")
company = psql("SELECT company_id FROM exhibition_companies WHERE status = 'approved' AND is_active ORDER BY company_id LIMIT 1")
original_status = psql(f"SELECT status FROM exhibition_companies WHERE company_id = '{company}'")
company_name = psql(f"SELECT name FROM exhibition_companies WHERE company_id = '{company}'")
psql(f"UPDATE exhibition_companies SET status = 'draft' WHERE company_id = '{company}';"
     f"INSERT INTO company_attachments (owner_type, owner_id, kind, title, file_url, is_active) "
     f"VALUES ('exhibition', '{company}', 'catalog', 'strict-test-private', 'attachments/x/strict.pdf', true);")
try:
    _, body, _ = anon.call("exhibition-api", "getExhibitionCompanyDetail", {"id": company}, "GET")
    check("an unpublished company's detail is hidden from the public", company_name not in body)
    _, body, _ = anon.call("attachments", "getAttachments", {"ownerType": "exhibition", "ownerId": company}, "GET")
    check("an unpublished company's attachments are hidden from the public", "strict-test-private" not in body)
    _, body, _ = anon.call("exhibition-api", "getPublicExhibitionProducts", {"companyIds": [company]}, "GET")
    check("an unpublished company's products are hidden from the public", not re.search(r'"company_id".{0,40}' + re.escape(company), body))
finally:
    psql(f"UPDATE exhibition_companies SET status = '{original_status}' WHERE company_id = '{company}';"
         "DELETE FROM company_attachments WHERE title = 'strict-test-private';")

print("Fuzzing every server function")
deep = {}
cur = deep
for _ in range(300):
    cur["a"] = {}
    cur = cur["a"]
payloads = [None, 0, -1, 1e308, True, "", "x" * 100_000, "\u0000‮<script>", "'\"`;--", [], [None] * 500,
            {"__proto__": {"polluted": "yes", "isAdmin": True, "roles": ["admin"], "role": "admin"}},
            {"constructor": {"prototype": {"polluted": "yes", "isAdmin": True}}},
            {"id": {"$ne": None}, "company_id": ["a", "b"], "email": {"toString": "x"}}, deep,
            # A NUL byte inside otherwise valid fields reaches PostgreSQL, which
            # refuses it with its own error: that error must not reach the client.
            {k: "a\u0000b" for k in ("id", "ownerId", "company_id", "email", "identifier", "question", "parkId", "park_id")}
            | {"ownerType": "exhibition", "password": "x", "companyIds": ["a\u0000b"]}]
raw_bodies = ['{"t":{"t":99},"f":63,"m":[]}', '{"t":{"t":10,"i":1,"p":{"k":["data"],"v":[{"t":4,"i":424242}]},"o":0},"f":63,"m":[]}',
              '{"t":' * 5000 + "1" + "}" * 5000, '{"t":{"t":1,"s":"' + "\\ud800" * 100 + '"},"f":63,"m":[]}', "not json at all", "[]", "null"]
crashes, leaks, slow = [], [], []
total = 0
for mod, name, method, *_ in INV:
    if f"{mod}.{name}" in unregistered:
        continue
    for sess in (anon, admin):
        for p in payloads:
            st, body, dt = sess.call(mod, name, p, method)
            total += 1
            if method == "GET" and st in (0, 414, 431) and len(json.dumps(p)) > 8000:
                continue  # URL too long: refused by the HTTP server itself (431)
            if st >= 500 and not app_error(body) or st == 0:
                crashes.append(f"{mod}.{name}({str(p)[:20]!r}) -> {st}")
            if args.prod and STACK.search(body):
                leaks.append(f"{mod}.{name}")
            if DB_ERROR.search(body):
                leaks.append(f"{mod}.{name} db-error")
            if dt > 10:
                slow.append(f"{mod}.{name} {dt:.0f}s")
        for rb in raw_bodies:
            st, body, dt = sess.call(mod, name, None, method, raw_body=rb)
            total += 1
            if method == "GET" and st in (0, 414, 431) and len(rb) > 8000:
                continue  # URL too long: refused by the HTTP server itself (431)
            if st >= 500 and not app_error(body) and st != 413 or st == 0:
                crashes.append(f"{mod}.{name}(raw {rb[:15]!r}) -> {st}")
            if args.prod and STACK.search(body):
                leaks.append(f"{mod}.{name} (raw)")
        psql("DELETE FROM rate_limit_hits;")
print(f"  {total} hostile requests sent")
check("no hostile payload crashed a server function", not crashes, "; ".join(crashes[:5]))
check("no response leaked a stack trace, source path or database error", not leaks, "; ".join(sorted(set(leaks))[:5]))
check("no hostile payload took longer than 10 s", not slow, "; ".join(slow[:5]))
st, _, _, _, _ = request("GET", "/api/public/health")
check("server is healthy after fuzzing", st == 200, f"status {st}")
_, body, _ = anon.call("admin-users", "listUsers", None, "GET")
check("prototype-pollution payloads did not grant anonymous admin access", not succeeded(body), err(body)[:40])
_, body, _ = Session().call("auth", "getCurrentUser", None, "GET")
check("prototype-pollution payloads did not create a phantom user", '"result"],"v":[{"t":2' in body.replace(" ", ""))

print("Account security")
weak_ok = []
for pw in ("12345678", "password", "11111111", "qwertyui", "abcdefgh", "Password1", "۱۲۳۴۵۶۷۸", "abababab"):
    email = f"weak-{abs(hash(pw)) % 10**8}@example.test"
    psql(f"DELETE FROM users WHERE email = '{email}'; DELETE FROM rate_limit_hits;")
    _, body, _ = Session().call("auth", "signUp", {"email": email, "password": pw})
    if succeeded(body):
        weak_ok.append(pw)
    psql(f"DELETE FROM users WHERE email = '{email}';")
check("common or trivial passwords are refused at sign-up", not weak_ok, "accepted: " + ", ".join(weak_ok))
_, body, _ = Session().call("auth", "signUp", {"email": USER_EMAIL, "password": PASSWORD})
if err(body) == "EMAIL_ALREADY_REGISTERED":
    note("sign-up says when an email is already registered (enumeration, limited by the 5/hour sign-up throttle)")
race_email = "race-strict@example.test"
psql(f"DELETE FROM users WHERE email = '{race_email}'; DELETE FROM rate_limit_hits;")
with concurrent.futures.ThreadPoolExecutor(10) as pool:
    results = list(pool.map(lambda _: Session().call("auth", "signUp", {"email": race_email, "password": PASSWORD})[1], range(10)))
psql("DELETE FROM rate_limit_hits;")
check("concurrent sign-ups create exactly one account", psql(f"SELECT count(*) FROM users WHERE email = '{race_email}'") == "1")
check("concurrent sign-ups never expose a database error", not any(DB_ERROR.search(b) for b in results),
      next((err(b) for b in results if DB_ERROR.search(b)), ""))
psql(f"DELETE FROM users WHERE email = '{race_email}'; DELETE FROM rate_limit_hits;")
variants = [USER_EMAIL, USER_EMAIL.upper(), " " + USER_EMAIL, USER_EMAIL.title(), USER_EMAIL + " "]
seen = []
for i in range(11):
    _, body, _ = Session().call("auth", "signIn", {"email": variants[i % len(variants)], "password": f"wrong-{i}"})
    seen.append(err(body))
check("identifier case/whitespace variants share one rate-limit bucket", "RATE_LIMITED" in seen[:10], ", ".join(seen))
psql("DELETE FROM rate_limit_hits;")
revoked = sign_in(ADMIN_EMAIL)
_, body, _ = revoked.call("admin-users", "listUsers", None, "GET")
before = succeeded(body)
psql(f"DELETE FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = '{ADMIN_EMAIL}') AND role = 'admin';")
_, body, _ = revoked.call("admin-users", "listUsers", None, "GET")
check("revoking admin takes effect on an already signed-in session", before and not succeeded(body), err(body)[:40])
psql(f"INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM users WHERE email = '{ADMIN_EMAIL}' ON CONFLICT DO NOTHING;")
s2 = Session()
s2.call("auth", "signIn", {"email": USER_EMAIL, "password": PASSWORD})
sc = next((c for c in s2.set_cookie if c.startswith("session=")), "")
check("session cookie is host-only (no Domain attribute) with Path=/", "domain=" not in sc.lower() and "path=/" in sc.lower(), sc.split(";", 1)[-1][:80])
for inj in ("/%0d%0aSet-Cookie:%20crlf=1", "/%0d%0aX-Injected:%201", "/%E5%98%8A%E5%98%8DX-Injected:%201"):
    st, hd, raw, _, _ = request("GET", "/auth?next=" + inj)
    names = [k.lower() for k, _ in raw]
    cookies = " ".join(v for k, v in raw if k.lower() == "set-cookie")
    check(f"CRLF in a parameter does not inject headers ({inj[:18]})", "x-injected" not in names and "crlf=1" not in cookies, f"status {st}")
for site in ("same-site", "none", "cross-site"):
    st, body, _ = user.call("auth", "signOutFn", extra={"sec-fetch-site": site})
    check(f"server function refuses Sec-Fetch-Site: {site}", st == 403, f"status {st}")
_, body, _ = user.call("auth", "getCurrentUser", None, "GET")
check("the refused requests did not sign the user out", USER_EMAIL in body)

if args.prod:
    print("Client bundle")
    pub = os.path.join(ROOT, args.build, "public") if not os.path.isabs(args.build) else os.path.join(args.build, "public")
    # Secrets, and markers that only exist in server-only modules (an admin
    # help text that shows an INSERT statement is fine; server code is not).
    secret_re = re.compile(r"postgres(ql)?://|DATABASE_URL|SETTINGS_ENCRYPTION_KEY|OPENROUTER_API_KEY|OPENAI_API_KEY|sk-[A-Za-z0-9]{20,}|"
                           r"-----BEGIN [A-Z ]*PRIVATE KEY|SMS_API_KEY|password_hash|rate_limit_hits|scryptSync|getDb\(|"
                           r"mfa_otp_hash|initial_password_hash|from \"postgres\"")
    hits = []
    for root, _, files in os.walk(pub):
        for f in files:
            if f.endswith((".js", ".css", ".html", ".json", ".txt", ".map")):
                with open(os.path.join(root, f), encoding="utf-8", errors="replace") as fh:
                    for m in secret_re.finditer(fh.read()):
                        hits.append(f"{f}: {m.group(0)}")
    check("no secrets, SQL or server-only code in the client bundle", not hits, "; ".join(hits[:5]))

psql(f"DELETE FROM users WHERE email IN ('{USER_EMAIL}', '{ADMIN_EMAIL}'); DELETE FROM rate_limit_hits;")
print(f"\n{checks} checks, {'all passed' if not failures else f'{failures} FAILED'}" + (f", {len(notes)} notes" if notes else ""))
sys.exit(1 if failures else 0)
