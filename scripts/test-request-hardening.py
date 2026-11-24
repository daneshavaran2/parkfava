"""Regression tests for request-level hardening (docs/Security Report.md:
SEC-033 CSRF middleware, SEC-034 password-change guessing, SEC-035 request
body limits, SEC-036 response headers).

Requires: a dev server on localhost:8080 and DATABASE_URL pointing at a
disposable database (psql on PATH). Never point it at production.
Run:  DATABASE_URL=... python scripts/test-request-hardening.py
"""
from __future__ import annotations

import http.client
import json
import os
import re
import subprocess
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
_src = open(os.path.join(HERE, "test-authz-coverage.py"), encoding="utf-8").read()
_ns: dict = {}
exec(compile(_src.split("for client, email in ((admin, ADMIN_EMAIL)")[0], "authz_helpers", "exec"), _ns)
Client, PASSWORD, server_fn_url, seroval = _ns["Client"], _ns["PASSWORD"], _ns["server_fn_url"], _ns["seroval"]

DB = os.environ.get("DATABASE_URL")
if not DB:
    sys.exit("DATABASE_URL is required (a disposable test database).")
EMAIL = "request-hardening@example.test"
failures = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global failures
    print(f"  {'ok  ' if ok else 'FAIL'} {label}{('  [' + detail + ']') if detail else ''}")
    failures += 0 if ok else 1


def psql(statement: str) -> None:
    subprocess.run(["psql", "-q", DB, "-c", statement], check=True)


def raw_call(client, module, export, data=None, extra_headers=None, method="POST"):
    """Like Client.call, but with extra request headers."""
    url = server_fn_url(module, export)
    headers = {"x-tsr-serverfn": "true", "accept": "application/json"}
    headers.update(extra_headers or {})
    body = None
    if data is not None:
        headers["content-type"] = "application/json"
        body = json.dumps(seroval({"data": data})).encode()
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with client.opener.open(req, timeout=30) as resp:
            return resp.status, dict(resp.headers), resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode("utf-8", "replace")


psql(f"DELETE FROM users WHERE email = '{EMAIL}'; DELETE FROM rate_limit_hits;")
user = Client("user")
user.sign_up(EMAIL)
if user.sign_in(EMAIL)[0] != 200:
    sys.exit("could not sign in the fixture account; is the dev server up?")

print("SEC-033  server functions reject cross-site requests (CSRF)")
st, _, body = raw_call(user, "auth", "whoAmI", method="GET", extra_headers={"Sec-Fetch-Site": "cross-site"})
check("cross-site (Sec-Fetch-Site) call is refused", st == 403, f"status {st}")
st, _, body = raw_call(user, "auth", "whoAmI", method="GET", extra_headers={"Origin": "https://evil.example"})
check("foreign Origin without Sec-Fetch-Site is refused", st == 403, f"status {st}")
st, _, body = raw_call(user, "auth", "whoAmI", method="GET", extra_headers={"Sec-Fetch-Site": "same-origin"})
check("same-origin call works", st == 200 and EMAIL in body, f"status {st}")
st, _, body = raw_call(user, "auth", "whoAmI", method="GET", extra_headers={"Origin": "http://localhost:8080"})
check("Origin matching the Host works", st == 200 and EMAIL in body, f"status {st}")
st, _, body = raw_call(user, "auth", "whoAmI", method="GET")
check("non-browser call without Origin/Sec-Fetch-Site still works", st == 200 and EMAIL in body, f"status {st}")

print("SEC-034  current-password guessing through changeMyPassword is rate-limited")
results = []
for i in range(7):
    _, body = user.call("auth", "changeMyPassword", {"currentPassword": f"wrong-{i}", "newPassword": "Another#Passw0rd"})
    results.append("RATE_LIMITED" if "RATE_LIMITED" in body else "INVALID_CURRENT_PASSWORD" if "INVALID_CURRENT_PASSWORD" in body else body[:60])
check("guesses are refused once the limit is reached", "RATE_LIMITED" in results, ", ".join(results))
check("the first guesses get the normal error", results[0] == "INVALID_CURRENT_PASSWORD", results[0])
psql("DELETE FROM rate_limit_hits;")
_, body = user.call("auth", "changeMyPassword", {"currentPassword": PASSWORD, "newPassword": "Another#Passw0rd"})
check("a legitimate change still works (after the window)", '"ok"' in body, body[:80])

print("SEC-035  oversized request bodies are rejected before parsing")
big = json.dumps({"t": {"t": 1, "s": "x" * (3 * 1024 * 1024)}, "f": 63, "m": []}).encode()
url = server_fn_url("auth", "signIn")
req = urllib.request.Request(url, data=big, method="POST", headers={"content-type": "application/json", "x-tsr-serverfn": "true"})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        st = r.status
except urllib.error.HTTPError as e:
    st = e.code
except (urllib.error.URLError, ConnectionError) as e:
    # The server answered 413 and closed the connection before the client
    # finished sending the body; that is a refusal too.
    st = "closed early" if isinstance(getattr(e, "reason", e), ConnectionError) else f"error {e}"
check("3 MB JSON body with Content-Length is refused with 413", st in (413, "closed early"), f"status {st}")
host, port = "127.0.0.1", 8080
conn = http.client.HTTPConnection(host, port, timeout=60)
path = url.split(f":{port}", 1)[1]


def chunks():
    # The same valid 3 MB payload, streamed without a Content-Length.
    for i in range(0, len(big), 65536):
        yield big[i:i + 65536]


conn.request("POST", path, body=chunks(), headers={"content-type": "application/json", "x-tsr-serverfn": "true", "Transfer-Encoding": "chunked"}, encode_chunked=True)
resp = conn.getresponse()
resp.read()
check("3 MB chunked body (no Content-Length) is refused", resp.status in (413, 500), f"status {resp.status}")
conn.close()
_, body = user.call("auth", "getCurrentUser", method="GET")
check("normal-sized calls still work", EMAIL in body)

# Multipart bodies above the RPC limit are accepted only with a live session.
boundary = "----hardening"
form = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.bin\"\r\n"
        f"Content-Type: application/octet-stream\r\n\r\n").encode() + b"\0" * (3 * 1024 * 1024) + f"\r\n--{boundary}--\r\n".encode()
mp_headers = {"content-type": f"multipart/form-data; boundary={boundary}", "x-tsr-serverfn": "true"}


def post_multipart(opener):
    req = urllib.request.Request(url, data=form, method="POST", headers=mp_headers)
    try:
        with opener.open(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except (urllib.error.URLError, ConnectionError) as e:
        # Closed by the server before the body was fully sent: a refusal.
        return 413 if isinstance(getattr(e, "reason", e), ConnectionError) else 0


st = post_multipart(urllib.request.build_opener())
check("3 MB multipart body without a session is refused with 413", st == 413, f"status {st}")
st = post_multipart(user.opener)
check("3 MB multipart body with a live session reaches the app", st != 413, f"status {st}")

print("SEC-036  response headers")
with urllib.request.urlopen(f"http://{host}:{port}/", timeout=30) as r:
    pp = r.headers.get("permissions-policy") or ""
check("Permissions-Policy denies camera/microphone/geolocation", all(f"{f}=()" in pp for f in ("camera", "microphone", "geolocation")), pp[:80])
_, headers, _ = raw_call(user, "auth", "getCurrentUser", method="GET")
cc = {k.lower(): v for k, v in headers.items()}.get("cache-control", "")
check("server-function responses are not cacheable", "no-store" in cc, cc)

psql(f"DELETE FROM users WHERE email = '{EMAIL}';")
print(f"\n{'all passed' if not failures else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
