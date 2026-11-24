"""Penetration-style probes against a running instance (docs/Security Report.md).

Covers what the other security suites do not: path traversal, exposed files
and source maps, reflected XSS, open redirects, SQL injection inputs, upload
content tricks, session fixation and logout, brute-force throttling, user
enumeration, HTTP methods, CORS, Host header handling, security headers,
cookie flags and error leakage.

Requires a disposable database (DATABASE_URL, psql on PATH) and a running
server. Never point it at production.

  Dev server (bun run dev):
      DATABASE_URL=... python scripts/test-security-probes.py
  Production build (bun run build && node .output/server/index.mjs):
      DATABASE_URL=... BASE_URL=http://localhost:3000 \
          python scripts/test-security-probes.py --prod --build .output
"""
from __future__ import annotations

import argparse
import base64
import http.client
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

parser = argparse.ArgumentParser()
parser.add_argument("--prod", action="store_true", help="target is a production build")
parser.add_argument("--build", default=".output", help="build output dir (with --prod)")
args = parser.parse_args()

DB = os.environ.get("DATABASE_URL")
if not DB:
    sys.exit("DATABASE_URL is required (a disposable test database).")
BASE = os.environ.get("BASE_URL", "http://localhost:3000" if args.prod else "http://localhost:8080").rstrip("/")
_u = urllib.parse.urlsplit(BASE)
HOST, PORT = _u.hostname or "localhost", _u.port or 80
PROBE_EMAIL = "security-probe@example.test"
PROBE_ADMIN = "security-probe-admin@example.test"
PASSWORD = "Probe#Passw0rd2026"
XSS = '"><svg/onload=alert(1337)>'
XSS2 = "<script>alert(1337)</script>"
failures = 0
checks = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global failures, checks
    checks += 1
    failures += 0 if ok else 1
    print(f"  {'ok  ' if ok else 'FAIL'} {label}{('  [' + detail + ']') if detail else ''}")


def psql(statement: str) -> str:
    return subprocess.run(["psql", "-qtA", DB, "-c", statement], check=True, capture_output=True, text=True).stdout.strip()


# --- raw HTTP (no automatic redirects, no cookie jar: both are inspected) ---
def request(method: str, path: str, body: bytes | None = None, headers: dict | None = None):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=60)
    h = {"user-agent": "security-probe"}
    h.update(headers or {})
    conn.request(method, path, body=body, headers=h)
    r = conn.getresponse()
    data = r.read()
    out = (r.status, {k.lower(): v for k, v in r.getheaders()}, r.getheaders(), data.decode("utf-8", "replace"))
    conn.close()
    return out


# --- server functions ---
def build_ids(build_dir: str) -> dict:
    ids = {}
    pat = re.compile(r'createServerRpc\(\{\s*id:\s*"([0-9a-f]+)",\s*name:\s*"(\w+)",\s*filename:\s*"src/lib/([\w.-]+)\.functions\.ts"')
    for root, _, files in os.walk(os.path.join(build_dir, "server")):
        for f in files:
            if f.endswith(".mjs"):
                with open(os.path.join(root, f), encoding="utf-8", errors="replace") as fh:
                    for m in pat.finditer(fh.read()):
                        ids[(m.group(3), m.group(2))] = m.group(1)
    return ids


IDS = build_ids(args.build) if args.prod else {}


def fn_path(module: str, export: str) -> str:
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
        self.cookies: dict[str, str] = {}
        self.last_set_cookie: list[str] = []

    def _absorb(self, raw_headers):
        self.last_set_cookie = [v for k, v in raw_headers if k.lower() == "set-cookie"]
        for sc in self.last_set_cookie:
            name, _, rest = sc.partition("=")
            value = rest.split(";", 1)[0]
            if value == "" or "max-age=0" in sc.lower() or "expires=thu, 01 jan 1970" in sc.lower():
                self.cookies.pop(name, None)
            else:
                self.cookies[name] = value

    def call(self, module, export, data=None, method="POST", extra=None):
        path = fn_path(module, export)
        headers = {"x-tsr-serverfn": "true", "accept": "application/json"}
        if self.cookies:
            headers["cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        headers.update(extra or {})
        body = None
        if data is not None:
            envelope = json.dumps(seroval({"data": data}))
            if method == "GET":
                path += "?payload=" + urllib.parse.quote(envelope)
            else:
                headers["content-type"] = "application/json"
                body = envelope.encode()
        st, h, raw, text = request(method, path, body, headers)
        self._absorb(raw)
        return st, h, text

    def multipart(self, module, export, fields: dict, file_name: str, file_type: str, content: bytes):
        boundary = "----probe" + str(int(time.time() * 1000))
        parts = []
        for k, v in fields.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{file_name}"\r\n'
                      f"Content-Type: {file_type}\r\n\r\n").encode() + content + b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode())
        headers = {"x-tsr-serverfn": "true", "accept": "application/json",
                   "content-type": f"multipart/form-data; boundary={boundary}",
                   "cookie": "; ".join(f"{k}={v}" for k, v in self.cookies.items())}
        st, h, raw, text = request("POST", fn_path(module, export), b"".join(parts), headers)
        return st, text


ERR = re.compile(r'"message":\{"t":1,"s":"((?:\\.|[^"\\])*)"')


def err(body: str) -> str:
    m = ERR.search(body)
    return json.loads('"' + m.group(1) + '"') if m else ""


STACK = re.compile(r"\bat [\w.<>]+ \(|node_modules/|/src/lib/|\.ts:\d+:\d+|Error: [^\"]*\\n\s+at ")
DB_ERROR = re.compile(r"syntax error at or near|unterminated quoted string|PostgresError|relation \"\w+\" does not exist", re.I)

# ---------------------------------------------------------------------------
psql(f"DELETE FROM users WHERE email IN ('{PROBE_EMAIL}', '{PROBE_ADMIN}'); DELETE FROM rate_limit_hits;")
setup = Session()
st, _, body = setup.call("auth", "signUp", {"email": PROBE_EMAIL, "password": PASSWORD})
if '"ok"' not in body:
    sys.exit(f"could not create the probe account (status {st}); is the server up at {BASE}?")
users_before = psql("SELECT count(*) FROM users")
print(f"target {BASE} ({'production build' if args.prod else 'dev server'})")

print("Security headers")
home_status, home_h, _, home_body = request("GET", "/")
for path in ("/", "/this-route-does-not-exist", "/api/public/health", "/auth?next="):
    st, h, _, _ = request("GET", path)
    missing = [k for k in ("x-content-type-options", "referrer-policy", "permissions-policy") if k not in h]
    check(f"{path} carries nosniff / Referrer-Policy / Permissions-Policy", not missing, f"status {st}, missing {missing}" if missing else "")
    if args.prod:
        check(f"{path} carries HSTS", "strict-transport-security" in h)
csp = home_h.get("content-security-policy") or home_h.get("content-security-policy-report-only") or ""
check("HTML has a CSP with frame-ancestors 'none'", "frame-ancestors 'none'" in csp)
check("X-Frame-Options is DENY (SEC-045)", (home_h.get("x-frame-options") or "").upper() == "DENY", home_h.get("x-frame-options", "missing"))
if args.prod:
    check("CSP is enforced (not report-only) in production", "content-security-policy" in home_h)
check("no X-Powered-By header", "x-powered-by" not in home_h, home_h.get("x-powered-by", ""))
check("Server header does not reveal a version", not re.search(r"\d+\.\d+", home_h.get("server", "")), home_h.get("server", ""))

print("Exposed files and source code")
sensitive = ["/.env", "/.env.local", "/.git/config", "/.git/HEAD"]
if args.prod:
    sensitive += ["/package.json", "/bun.lock", "/package-lock.json", "/Dockerfile", "/vite.config.ts",
                  "/db/migrations/0001_init.sql", "/scripts/company-national-id-logins.json", "/server/cluster.mjs",
                  "/.output/server/index.mjs", "/node_modules/react/package.json", "/docs/Security%20Report.md",
                  "/src/server.ts", "/src/lib/auth.functions.ts", "/src/lib/auth/session.server.ts"]
else:
    print("  (the dev server serves the project tree to localhost by design; source-file checks run with --prod)")
markers = re.compile(r'"dependencies"|DATABASE_URL|CREATE TABLE|\[core\]|ref: refs/|initial_password_hash|createServerFn|lockfileVersion|^FROM ', re.M)
for path in sensitive:
    st, h, _, body = request("GET", path)
    leaked = st == 200 and bool(markers.search(body))
    check(f"{path} is not served", not leaked, f"status {st}")
if args.prod:
    scripts = sorted(set(re.findall(r'(?:src|href)="(/assets/[^"]+\.js)"', home_body)))
    mapped = []
    for s in scripts[:40]:
        st, _, _, js = request("GET", s)
        st_map, _, _, _ = request("GET", s + ".map")
        if "sourceMappingURL=" in js or st_map == 200:
            mapped.append(s)
    check(f"no source maps shipped ({len(scripts)} scripts checked)", not mapped, ", ".join(mapped[:3]))
    st, _, _, _ = request("GET", "/api/public/debug-echo")
    check("debug endpoint is off in production", st == 404, f"status {st}")
    for page in ("/perf", "/dev/logo"):
        st, _, _, _ = request("GET", page)
        check(f"developer page {page} is not served in production", st == 404, f"status {st}")
st, _, _, _ = request("GET", "/api/public/asset-audit")
check("admin-only asset audit refuses anonymous callers", st in (401, 403), f"status {st}")

print("Path traversal on /assets")
traversal = ["/assets/../../../../etc/passwd", "/assets/..%2f..%2f..%2f..%2fetc%2fpasswd", "/assets/%2e%2e/%2e%2e/%2e%2e/etc/passwd",
             "/assets/..%252f..%252f..%252fetc%252fpasswd", "/assets/exhibition/..%5c..%5c..%5cpackage.json",
             "/assets/....//....//....//etc/passwd", "/assets/%2e%2e%2f%2e%2e%2fpackage.json", "/assets/%00../../etc/passwd",
             "/assets/..;/..;/package.json", "/assets//etc/passwd"]
for path in traversal:
    st, _, _, body = request("GET", path)
    check(f"{path}", not (st == 200 and ("root:x:" in body or '"dependencies"' in body)), f"status {st}")

print("Reflected XSS")
for path in (f"/exhibition?q={urllib.parse.quote(XSS)}", f"/auth?next={urllib.parse.quote(XSS)}",
             f"/?lang={urllib.parse.quote(XSS)}", f"/{urllib.parse.quote(XSS2)}", f"/company/{urllib.parse.quote(XSS)}",
             f"/exhibition/{urllib.parse.quote(XSS2)}", f"/categories?c={urllib.parse.quote(XSS2)}"):
    st, _, _, body = request("GET", path)
    check(f"{path[:60]} does not reflect markup", XSS not in body and XSS2 not in body, f"status {st}")

print("Open redirect")
for nxt in ("//evil.example", "https://evil.example", "/\\evil.example", "/%09/evil.example", "%2F%2Fevil.example",
            "javascript:alert(1)", "/\t/evil.example"):
    st, h, _, body = request("GET", "/auth?next=" + urllib.parse.quote(nxt, safe="%"))
    loc = h.get("location", "")
    check(f"/auth?next={nxt!r} stays on this site", "evil.example" not in loc and not loc.startswith("javascript:")
          and "evil.example\\\"" not in body, f"status {st}, location {loc or '-'}")

print("HTTP methods, CORS and Host header")
st, _, _, body = request("TRACE", "/", headers={"x-probe": "trace-echo"})
check("TRACE is not echoed", not (st == 200 and "trace-echo" in body), f"status {st}")
methods = [("PUT", "/"), ("DELETE", "/"), ("PATCH", "/"), ("POST", "/about"),
           ("PUT", fn_path("auth", "signIn")), ("DELETE", "/api/public/health")]
if args.prod:
    methods.append(("OPTIONS", "/"))  # the dev server answers OPTIONS itself (CORS for local tooling)
for method, path in methods:
    st, h, _, _ = request(method, path)
    check(f"{method} {path[:40]} is refused", st == 405, f"status {st}, allow {h.get('allow', '-')}")
for path in ("/api/public/export", fn_path("exhibition-api", "getExhibitionCompanies")):
    st, h, _, _ = request("GET", path, headers={"origin": "https://evil.example", "x-tsr-serverfn": "true"})
    acao = h.get("access-control-allow-origin", "")
    credentialed = h.get("access-control-allow-credentials") == "true"
    check(f"CORS does not trust a foreign origin on {path[:40]}",
          acao != "https://evil.example" and not (acao == "*" and credentialed), acao or "no ACAO")
st, h, _, _ = request("OPTIONS", fn_path("auth", "signIn"), headers={"origin": "https://evil.example",
                       "access-control-request-method": "POST", "access-control-request-headers": "content-type"})
check("CORS preflight from a foreign origin is not approved", h.get("access-control-allow-origin", "") not in ("*", "https://evil.example"),
      f"status {st}")
st, h, _, body = request("GET", "/", headers={"host": "evil.example"})
refused = st in (400, 403, 421)  # the dev server rejects unknown hosts outright
check("forged Host header is not reflected into links or redirects",
      refused or ("evil.example" not in body and "evil.example" not in h.get("location", "")), f"status {st}")

print("Authentication")
s = Session()
s.cookies["session"] = "a" * 64  # attacker-chosen value planted before sign-in
st, _, body = s.call("auth", "signIn", {"email": PROBE_EMAIL, "password": PASSWORD})
sc = [c for c in s.last_set_cookie if c.startswith("session=")]
check("sign-in works", '"ok"' in body, f"status {st}")
check("sign-in issues a fresh session token (no fixation)", bool(sc) and s.cookies.get("session") != "a" * 64)
flags = sc[0].lower() if sc else ""
check("session cookie is HttpOnly", "httponly" in flags)
check("session cookie is SameSite=Lax or Strict", "samesite=lax" in flags or "samesite=strict" in flags)
if args.prod:
    check("session cookie is Secure", "; secure" in flags)
fixed = Session()
fixed.cookies["session"] = "a" * 64
_, _, body = fixed.call("auth", "getCurrentUser", method="GET")
check("the planted token is not a valid session", PROBE_EMAIL not in body)
token = s.cookies.get("session", "")
stored = psql(f"SELECT count(*) FROM sessions WHERE id = '{token}'") if re.fullmatch(r"[0-9a-f]{64}", token) else "?"
hashed = psql(f"SELECT count(*) FROM sessions WHERE id = encode(sha256(convert_to('{token}', 'UTF8')), 'hex')") if stored != "?" else "?"
check("the database stores only a hash of the session token", stored == "0" and hashed == "1", f"raw {stored}, hashed {hashed}")
stolen = dict(s.cookies)
st, _, body = s.call("auth", "signOutFn")
replay = Session()
replay.cookies = stolen
_, _, body = replay.call("auth", "getCurrentUser", method="GET")
check("a signed-out session token no longer works", PROBE_EMAIL not in body)
psql("DELETE FROM rate_limit_hits;")
results = []
for i in range(10):
    _, _, body = Session().call("auth", "signIn", {"email": PROBE_EMAIL, "password": f"wrong-{i}"})
    results.append(err(body))
check("password guessing is throttled", "RATE_LIMITED" in results[:9], ", ".join(results))
psql("DELETE FROM rate_limit_hits;")
_, _, b1 = Session().call("auth", "signIn", {"email": PROBE_EMAIL, "password": "wrong-password"})
_, _, b2 = Session().call("auth", "signIn", {"email": "nobody-here@example.test", "password": "wrong-password"})
check("same error for unknown user and wrong password", err(b1) == err(b2) == "INVALID_CREDENTIALS", f"{err(b1)} / {err(b2)}")
psql("DELETE FROM rate_limit_hits;")

print("SQL injection inputs")
sqli = ["' OR '1'='1", "' OR 1=1--", "admin@example.test'--", "1; DROP TABLE users;--", "\\'; SELECT pg_sleep(5);--",
        "%' AND 1=CAST((SELECT version()) AS int)--", '") OR ("1"="1']
for p in sqli:
    t0 = time.time()
    st, _, body = Session().call("auth", "signIn", {"identifier": p, "password": p})
    check(f"signIn identifier {p!r}", err(body) in ("INVALID_CREDENTIALS", "RATE_LIMITED") and not DB_ERROR.search(body)
          and time.time() - t0 < 4, f"status {st}, {err(body)[:40]}")
    st, _, body = Session().call("exhibition-api", "getExhibitionCompanyDetail", {"id": p}, method="GET")
    check(f"company detail id {p!r}", st < 500 and not DB_ERROR.search(body), f"status {st}")
    st, _, body = Session().call("assistant", "askAssistant", {"question": p})
    check(f"assistant question {p!r}", st < 500 and not DB_ERROR.search(body), f"status {st}")
    psql("DELETE FROM rate_limit_hits;")
check("users table intact after injection attempts", psql("SELECT count(*) FROM users") == users_before)

print("Error handling")
for label, body, ctype in (("malformed JSON", b"{not json", "application/json"),
                           ("wrong value types", json.dumps(seroval({"data": {"email": 12, "password": []}})).encode(), "application/json"),
                           ("unknown server function", None, None)):
    path = fn_path("auth", "signIn") if label != "unknown server function" else "/_serverFn/deadbeef"
    st, h, _, text = request("POST", path, body, {"content-type": ctype or "application/json", "x-tsr-serverfn": "true"})
    if args.prod:
        check(f"{label}: no stack trace or source paths in the response", not STACK.search(text), f"status {st}")
    check(f"{label}: handled without a server crash", st < 500 or not DB_ERROR.search(text), f"status {st}")
st, _, _, _ = request("POST", "/api/public/csp-report", b"{oops", {"content-type": "application/csp-report"})
check("CSP report endpoint rejects garbage cleanly", st in (204, 400), f"status {st}")

print("File upload")
psql(f"DELETE FROM users WHERE email = '{PROBE_ADMIN}';")
adm = Session()
adm.call("auth", "signUp", {"email": PROBE_ADMIN, "password": PASSWORD})
psql(f"INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM users WHERE email = '{PROBE_ADMIN}' ON CONFLICT DO NOTHING;")
adm = Session()
adm.call("auth", "signIn", {"email": PROBE_ADMIN, "password": PASSWORD})
company = psql("SELECT company_id FROM exhibition_companies ORDER BY company_id LIMIT 1")
html = b"<html><body><script>alert(document.cookie)</script></body></html>"
png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
for name, ctype, content in (("evil.html", "text/html", html), ("evil.svg", "image/svg+xml", b"<svg onload=alert(1)>"),
                             ("evil.png.html", "text/html", html), ("evil.php", "application/x-php", b"<?php echo 1;"),
                             (".htaccess", "text/plain", b"AddType text/html .png"), ("evil.js", "text/javascript", b"alert(1)")):
    st, body = adm.multipart("exhibition-api", "uploadExhibitionAssetFn", {"company_id": company}, name, ctype, content)
    check(f"upload of {name} is refused", '"path"' not in body, err(body) or f"status {st}")
for cid in ("../../../tmp", "../about", "..\\about", ".hidden"):
    st, body = adm.multipart("exhibition-api", "uploadExhibitionAssetFn", {"company_id": cid}, "a.png", "image/png", png)
    check(f"upload into company id {cid!r} is refused", '"path"' not in body, err(body) or f"status {st}")
st, body = adm.multipart("exhibition-api", "uploadExhibitionAssetFn", {"company_id": company}, "../../../../tmp/x.png", "image/png", png)
m = re.search(r'"path".*?"s":"([^"]+)"', body)
check("a traversal file name cannot leave the company folder", not m or (".." not in m.group(1) and m.group(1).startswith(f"exhibition/{company}/")),
      m.group(1) if m else (err(body) or f"status {st}"))
st, body = adm.multipart("exhibition-api", "uploadExhibitionAssetFn", {"company_id": company}, "disguised.png", "image/png", html)
check("HTML disguised as .png is refused (content checked, not only the extension)", '"path"' not in body, err(body) or f"status {st}")
st, body = adm.multipart("exhibition-api", "uploadExhibitionAssetFn", {"company_id": company}, "real.png", "image/png", png)
m = re.search(r'"path".*?"s":"([^"]+)"', body)
check("a genuine PNG is accepted", bool(m), err(body) or f"status {st}")
if m:
    st, h, _, _ = request("GET", "/assets/" + m.group(1))
    check("uploaded file is served as an image with nosniff", h.get("content-type", "").startswith("image/png")
          and h.get("x-content-type-options") == "nosniff", f"{st} {h.get('content-type', '')}")
anon = Session()
st, body = anon.multipart("exhibition-api", "uploadExhibitionAssetFn", {"company_id": company}, "a.png", "image/png", png)
check("anonymous upload is refused", '"path"' not in body, err(body) or f"status {st}")

psql(f"DELETE FROM users WHERE email IN ('{PROBE_EMAIL}', '{PROBE_ADMIN}'); DELETE FROM rate_limit_hits;")
print(f"\n{checks} checks, {'all passed' if not failures else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
