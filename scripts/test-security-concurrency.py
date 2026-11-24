"""Session, cookie and concurrency tests (docs/Security Report.md):

  * rate limits hold under parallel requests (no check-then-insert race);
  * parallel approvals of one change request apply it exactly once;
  * parallel owner saves leave a single pending change request;
  * an expired session is refused; a revoked one is refused;
  * tampered session cookies are refused without errors: the stored hash used
    as a cookie, a modified token, an oversized value, SQL metacharacters,
    duplicate cookies.

Requires a disposable database (DATABASE_URL, psql on PATH) and a running
server. Never point it at production.

  Dev server:        DATABASE_URL=... python scripts/test-security-concurrency.py
  Production build:  DATABASE_URL=... BASE_URL=http://localhost:3000 \\
                         python scripts/test-security-concurrency.py --prod --build .output
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import http.client
import json
import os
import re
import subprocess
import sys
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
USER = "security-race-user@example.test"
OWNER = "security-race-owner@example.test"
ADMIN = "security-race-admin@example.test"
PASSWORD = "Race#Passw0rd2026"
failures = checks = 0


def check(label, ok, detail=""):
    global failures, checks
    checks += 1
    failures += 0 if ok else 1
    print(f"  {'ok  ' if ok else 'FAIL'} {label}{('  [' + detail + ']') if detail else ''}")


def psql(statement):
    return subprocess.run(["psql", "-qtA", DB, "-c", statement], check=True, capture_output=True, text=True).stdout.strip()


def q(v):
    return "'" + str(v).replace("'", "''") + "'"


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


IDS = build_ids(args.build if os.path.isabs(args.build) else os.path.join(ROOT, args.build)) if args.prod else {}


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
        counter[0] += 1
        if isinstance(v, list):
            return {"t": 9, "i": counter[0], "a": [node(x) for x in v], "o": 0}
        return {"t": 10, "i": counter[0], "p": {"k": list(v.keys()), "v": [node(x) for x in v.values()]}, "o": 0}

    return json.dumps({"t": node(value), "f": 63, "m": []})


def call(cookie_header, module, export, data=None, method="POST"):
    path = fn_path(module, export)
    h = {"x-tsr-serverfn": "true", "accept": "application/json", "user-agent": "security-race"}
    if cookie_header:
        h["cookie"] = cookie_header
    body = None
    if data is not None:
        env = seroval({"data": data})
        if method == "GET":
            path += "?payload=" + urllib.parse.quote(env)
        else:
            h["content-type"] = "application/json"
            body = env.encode()
    conn = http.client.HTTPConnection(HOST, PORT, timeout=120)
    try:
        conn.request(method, path, body=body, headers=h)
        r = conn.getresponse()
        text = r.read().decode("utf-8", "replace")
        token = next((v.split(";", 1)[0][len("session="):] for k, v in r.getheaders()
                      if k.lower() == "set-cookie" and v.startswith("session=") and not v.startswith("session=;")), None)
        return r.status, text, token
    finally:
        conn.close()


ERR = re.compile(r'"message":\{"t":1,"s":"((?:\\.|[^"\\])*)"')


def err(body):
    m = ERR.search(body)
    return json.loads('"' + m.group(1) + '"') if m else ""


def ok(body):
    return '"k":["result"]' in body


DB_ERROR = re.compile(r"syntax error|duplicate key|violates|PostgresError|invalid input syntax", re.I)


def account(email, admin=False):
    psql(f"DELETE FROM users WHERE email = {q(email)}; DELETE FROM rate_limit_hits;")
    st, body, _ = call(None, "auth", "signUp", {"email": email, "password": PASSWORD})
    if not ok(body):
        sys.exit(f"could not create {email} ({err(body) or st}); is the server up at {BASE}?")
    if admin:
        psql(f"INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM users WHERE email = {q(email)} ON CONFLICT DO NOTHING;")
    psql("DELETE FROM rate_limit_hits;")
    _, _, token = call(None, "auth", "signIn", {"email": email, "password": PASSWORD})
    return token


user_token = account(USER)
owner_token = account(OWNER)
admin_token = account(ADMIN, admin=True)
print(f"target {BASE} ({'production build' if args.prod else 'dev server'})")

print("Rate limits under parallel requests")
psql("DELETE FROM rate_limit_hits;")
with concurrent.futures.ThreadPoolExecutor(30) as pool:
    results = list(pool.map(lambda i: err(call(None, "auth", "signIn", {"email": USER, "password": f"wrong-{i}"})[1]), range(30)))
processed = results.count("INVALID_CREDENTIALS")
check("30 parallel wrong passwords for one account: at most the limit (8) are checked", processed <= 8,
      f"{processed} checked, {results.count('RATE_LIMITED')} refused")
hits = psql(f"SELECT count(*) FROM rate_limit_hits WHERE bucket = {q('signin:' + USER)}")
check("the per-account counter never exceeds the limit", int(hits) <= 8, f"{hits} hits recorded")
psql("DELETE FROM rate_limit_hits;")
with concurrent.futures.ThreadPoolExecutor(20) as pool:
    results = list(pool.map(lambda i: err(call(f"session={user_token}", "auth", "changeMyPassword",
                                               {"currentPassword": f"wrong-{i}", "newPassword": "Another#Passw0rd99"})[1]), range(20)))
processed = results.count("INVALID_CURRENT_PASSWORD")
check("20 parallel current-password guesses: at most the limit (5) are checked", processed <= 5,
      f"{processed} checked, {results.count('RATE_LIMITED')} refused")
psql("DELETE FROM rate_limit_hits;")

print("Change-request workflow under concurrency")
company = psql("SELECT company_id FROM exhibition_companies WHERE status = 'approved' AND is_active ORDER BY company_id LIMIT 1")
original_owner = psql(f"SELECT coalesce(owner_user_id::text, '') FROM exhibition_companies WHERE company_id = {q(company)}")
psql(f"UPDATE exhibition_companies SET owner_user_id = (SELECT id FROM users WHERE email = {q(OWNER)}) WHERE company_id = {q(company)};"
     f"DELETE FROM exhibition_change_requests WHERE company_id = {q(company)};")
try:
    _, body, _ = call(f"session={owner_token}", "exhibition-api", "upsertExhibitionProduct",
                      {"company_id": company, "name": "Race Product"})
    req = psql(f"SELECT id FROM exhibition_change_requests WHERE company_id = {q(company)} AND entity_type = 'product' "
               "AND action = 'create' AND status = 'pending' LIMIT 1")
    check("an owner's new product on a published company becomes a pending request", bool(req), err(body))
    if req:
        with concurrent.futures.ThreadPoolExecutor(10) as pool:
            outcomes = list(pool.map(lambda _: call(f"session={admin_token}", "exhibition-api", "approveChangeRequestAdmin",
                                                    {"id": req})[1], range(10)))
        approvals = sum(1 for b in outcomes if ok(b))
        products = psql(f"SELECT count(*) FROM exhibition_products WHERE company_id = {q(company)} AND name = 'Race Product'")
        check("10 parallel approvals apply the request exactly once", approvals == 1 and products == "1",
              f"{approvals} approvals, {products} products")
        check("losing approvals fail cleanly, without database errors", not any(DB_ERROR.search(b) for b in outcomes),
              next((err(b) for b in outcomes if DB_ERROR.search(b)), ""))
    with concurrent.futures.ThreadPoolExecutor(10) as pool:
        list(pool.map(lambda i: call(f"session={owner_token}", "exhibition-api", "saveOwnedCompany",
                                     {"company_id": company, "patch": {"tagline": f"race tagline {i}"}}), range(10)))
    pending = psql(f"SELECT count(*) FROM exhibition_change_requests WHERE company_id = {q(company)} AND entity_type = 'company' "
                   "AND status = 'pending'")
    check("10 parallel owner saves leave a single pending company request", pending == "1", f"{pending} pending")
finally:
    psql(f"DELETE FROM exhibition_products WHERE company_id = {q(company)} AND name = 'Race Product';"
         f"DELETE FROM exhibition_change_requests WHERE company_id = {q(company)};"
         f"UPDATE exhibition_companies SET owner_user_id = {('NULL' if not original_owner else q(original_owner))} "
         f"WHERE company_id = {q(company)};")

print("Session lifetime and revocation")
key = hashlib.sha256(user_token.encode()).hexdigest()
_, body, _ = call(f"session={user_token}", "auth", "getCurrentUser", None, "GET")
check("a live session works", USER in body)
psql(f"UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE id = {q(key)};")
_, body, _ = call(f"session={user_token}", "auth", "getCurrentUser", None, "GET")
check("an expired session is refused", USER not in body)
psql(f"UPDATE sessions SET expires_at = now() + interval '1 day' WHERE id = {q(key)};")
_, body, _ = call(f"session={user_token}", "auth", "getCurrentUser", None, "GET")
restored = USER in body
psql(f"DELETE FROM sessions WHERE id = {q(key)};")
_, body, _ = call(f"session={user_token}", "auth", "getCurrentUser", None, "GET")
check("a session deleted on the server (revoked) is refused at once", restored and USER not in body)
max_age = psql(f"SELECT max(extract(epoch FROM expires_at - created_at))::int FROM sessions "
               f"WHERE user_id = (SELECT id FROM users WHERE email = {q(ADMIN)})")
check("session lifetime is bounded (at most 30 days)", max_age and int(max_age) <= 30 * 86400 + 60, f"{max_age}s")

print("Tampered session cookies")
admin_key = hashlib.sha256(admin_token.encode()).hexdigest()
tampered = {"the stored hash used as the cookie": f"session={admin_key}",
            "a token with one character changed": f"session={admin_token[:-1]}{'0' if admin_token[-1] != '0' else '1'}",
            "an oversized cookie (6 KB)": "session=" + "a" * 6000,
            "SQL metacharacters": "session=' OR '1'='1",
            "a NUL byte": "session=%00abc",
            "a duplicate cookie before the real one": f"session=forged; session={admin_token}"}
for label, cookie in tampered.items():
    st, body, _ = call(cookie, "admin-users", "listUsers", None, "GET")
    granted = ok(body)
    if label.startswith("a duplicate"):
        check(f"{label}: handled without error", st < 500 and not DB_ERROR.search(body), f"status {st}")
    else:
        check(f"{label} is refused", not granted and st < 500 and not DB_ERROR.search(body), f"status {st}, {err(body)[:30]}")

print("Admin role under concurrency")
ADMIN2 = "security-race-admin2@example.test"
ATTACKER = "security-race-newcomer@example.test"
saved_admins = psql("SELECT coalesce(string_agg(r.user_id::text, ','), '') FROM user_roles r JOIN users u ON u.id = r.user_id "
                    f"WHERE r.role = 'admin' AND u.email NOT LIKE 'security-race-%'")
try:
    admin2_token = account(ADMIN2, admin=True)
    ids = {e: psql(f"SELECT id FROM users WHERE email = {q(e)}") for e in (ADMIN, ADMIN2)}
    psql(f"DELETE FROM user_roles WHERE role = 'admin' AND user_id NOT IN ({q(ids[ADMIN])}, {q(ids[ADMIN2])});")
    remaining = "2"
    for _ in range(8):
        psql(f"INSERT INTO user_roles (user_id, role) VALUES ({q(ids[ADMIN])}, 'admin'), ({q(ids[ADMIN2])}, 'admin') "
             "ON CONFLICT DO NOTHING;")
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            list(pool.map(lambda pair: call(f"session={pair[0]}", "admin-users", "revokeAdmin", {"user_id": pair[1]}),
                          [(admin_token, ids[ADMIN2]), (admin2_token, ids[ADMIN])]))
        remaining = psql("SELECT count(*) FROM user_roles WHERE role = 'admin'")
        if remaining == "0":
            break
    check("two admins revoking each other at the same moment leave an admin", remaining != "0",
          f"{remaining} admin(s) left")
    psql("DELETE FROM user_roles WHERE role = 'admin';")
    psql("DELETE FROM rate_limit_hits;")
    _, body, _ = call(None, "auth", "signUp", {"email": ATTACKER, "password": PASSWORD})
    roles = psql(f"SELECT coalesce(string_agg(role::text, ','), '') FROM user_roles r JOIN users u ON u.id = r.user_id "
                 f"WHERE u.email = {q(ATTACKER)}")
    check("with no admin left, a self-registered account does not become admin", ok(body) and "admin" not in roles,
          f"roles: {roles or 'none'}")
finally:
    psql(f"DELETE FROM users WHERE email IN ({q(ADMIN2)}, {q(ATTACKER)}); DELETE FROM user_roles WHERE role = 'admin';")
    for uid in filter(None, saved_admins.split(",")):
        psql(f"INSERT INTO user_roles (user_id, role) VALUES ({q(uid)}, 'admin') ON CONFLICT DO NOTHING;")
    psql("DELETE FROM rate_limit_hits;")

SMS_LOG = os.environ.get("SMS_STUB_LOG")
if SMS_LOG:
    # Needs a server started with a stand-in SMS panel that appends one line
    # per text to SMS_STUB_LOG (see SECURITY_TEST_COVERAGE.md); without it
    # requestOtp only answers SMS_NOT_CONFIGURED and sends nothing.
    print("OTP sends under concurrency")

    def sent():
        try:
            with open(SMS_LOG, encoding="utf-8") as fh:
                return sum(1 for _ in fh)
        except FileNotFoundError:
            return 0

    def reset_otp(count="0", window_start="NULL"):
        psql(f"UPDATE users SET phone = '+989120000000', mfa_otp_last_sent_at = NULL, "
             f"mfa_otp_send_window_start = {window_start}, mfa_otp_send_count = {count} WHERE email = {q(OWNER)};")

    reset_otp()
    before = sent()
    with concurrent.futures.ThreadPoolExecutor(10) as pool:
        outcomes = list(pool.map(lambda _: call(f"session={owner_token}", "mfa", "requestOtp")[1], range(10)))
    texts = sent() - before
    check("10 parallel OTP requests send a single text", texts == 1,
          f"{texts} texts, {sum(1 for b in outcomes if err(b) == 'OTP_COOLDOWN')} told to wait")
    count = psql(f"SELECT mfa_otp_send_count FROM users WHERE email = {q(OWNER)}")
    check("the daily send counter counts every text actually sent", count == str(texts), f"count {count}, {texts} texts")
    reset_otp("5", "now() - interval '1 hour'")
    before = sent()
    with concurrent.futures.ThreadPoolExecutor(5) as pool:
        outcomes = list(pool.map(lambda _: err(call(f"session={owner_token}", "mfa", "requestOtp")[1]), range(5)))
    check("at the daily cap nothing is sent", sent() == before and set(outcomes) == {"OTP_DAILY_LIMIT"}, ",".join(sorted(set(outcomes))))
    reset_otp("5", "now() - interval '25 hours'")
    before = sent()
    _, body, _ = call(f"session={owner_token}", "mfa", "requestOtp")
    count = psql(f"SELECT mfa_otp_send_count FROM users WHERE email = {q(OWNER)}")
    check("a new day's window allows a text again and restarts the count", ok(body) and sent() == before + 1 and count == "1",
          f"{err(body) or 'sent'}, count {count}")
    live = psql(f"SELECT mfa_otp_hash IS NOT NULL AND mfa_otp_expires_at > now() AND mfa_otp_attempts = 0 "
                f"FROM users WHERE email = {q(OWNER)}")
    check("the text that was sent left a fresh code to verify", live == "t", live)
    psql(f"UPDATE users SET mfa_otp_last_sent_at = now() - interval '30 seconds' WHERE email = {q(OWNER)};")
    _, body, _ = call(f"session={owner_token}", "mfa", "requestOtp")
    check("a resend inside the cooldown is refused", err(body) == "OTP_COOLDOWN", err(body))
else:
    print("OTP sends without an SMS panel (set SMS_STUB_LOG with a stand-in panel for the concurrency checks)")
    psql(f"UPDATE users SET phone = '+989120000000', mfa_otp_last_sent_at = NULL, mfa_otp_send_window_start = NULL, "
         f"mfa_otp_send_count = 0 WHERE email = {q(OWNER)};")
    outcomes = [err(call(f"session={owner_token}", "mfa", "requestOtp")[1]) for _ in range(3)]
    state = psql(f"SELECT mfa_otp_send_count || ',' || (mfa_otp_last_sent_at IS NULL) FROM users WHERE email = {q(OWNER)}")
    check("a failed send is reported each time and uses up neither the cooldown nor the daily sends",
          outcomes == ["SMS_NOT_CONFIGURED"] * 3 and state == "0,true", f"{','.join(outcomes)}; count,unset = {state}")

psql(f"DELETE FROM users WHERE email IN ({q(USER)}, {q(OWNER)}, {q(ADMIN)}); DELETE FROM rate_limit_hits;")
print(f"\n{checks} checks, {'all passed' if not failures else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
