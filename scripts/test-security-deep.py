"""Deeper security tests (docs/Security Report.md), complementing
test-security-probes.py and test-security-strict.py:

  * data exposure: every public read (server functions and /api/public/*)
    is walked field by field for internal or personal fields with a value;
  * mass assignment: a company owner sends privileged fields (status,
    ownership, review fields, listing order, another company's id) and none
    of them may take effect, directly or through a change request;
  * review workflow: an owner's edit to a published company stays a pending
    change request and is not live until an admin approves it;
  * low-privilege abuse: a self-registered user who owns nothing cannot make
    the server accept large upload bodies;
  * hidden content: nothing of a deactivated park or an unpublished company
    reaches anonymous visitors through the public reads or the export;
  * password storage: current scrypt cost for new hashes, older hashes still
    accepted and upgraded at sign-in, same response time for unknown accounts
    and for accounts with either kind of hash;
  * input-processing cost: worst-case strings at the maximum accepted length
    for the text inputs that reach regex or search processing (ReDoS).

Requires a disposable database (DATABASE_URL, psql on PATH) and a running
server. Never point it at production.

  Dev server:        DATABASE_URL=... python scripts/test-security-deep.py
  Production build:  DATABASE_URL=... BASE_URL=http://localhost:3000 \\
                         python scripts/test-security-deep.py --prod --build .output
"""
from __future__ import annotations

import argparse
import base64
import hashlib
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
OWNER = "security-deep-owner@example.test"
PLAIN = "security-deep-plain@example.test"
ADMIN = "security-deep-admin@example.test"
PASSWORD = "Deep#Passw0rd2026"
failures = checks = 0


def check(label, ok, detail=""):
    global failures, checks
    checks += 1
    failures += 0 if ok else 1
    print(f"  {'ok  ' if ok else 'FAIL'} {label}{('  [' + detail + ']') if detail else ''}")


def psql(statement):
    return subprocess.run(["psql", "-qtA", DB, "-c", statement], check=True, capture_output=True, text=True).stdout.strip()


def q(value):
    return "'" + str(value).replace("'", "''") + "'"


def request(method, path, body=None, headers=None):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=120)
    h = {"user-agent": "security-deep"}
    h.update(headers or {})
    t0 = time.time()
    try:
        conn.request(method, path, body=body, headers=h)
        r = conn.getresponse()
        out = (r.status, r.getheaders(), r.read().decode("utf-8", "replace"), time.time() - t0)
    except (ConnectionError, http.client.HTTPException, TimeoutError) as e:
        out = (0, [], f"TRANSPORT {e}", time.time() - t0)
    conn.close()
    return out


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

    return {"t": node(value), "f": 63, "m": []}


class Session:
    def __init__(self):
        self.cookies = {}

    def call(self, module, export, data=None, method="POST"):
        path = fn_path(module, export)
        h = {"x-tsr-serverfn": "true", "accept": "application/json"}
        if self.cookies:
            h["cookie"] = "; ".join(f"{k}={v}" for k, v in self.cookies.items())
        body = None
        if data is not None:
            env = json.dumps(seroval({"data": data}))
            if method == "GET":
                path += "?payload=" + urllib.parse.quote(env)
            else:
                h["content-type"] = "application/json"
                body = env.encode()
        st, raw, text, dt = request(method, path, body, h)
        for k, v in raw:
            if k.lower() == "set-cookie" and v.startswith("session="):
                val = v.split(";", 1)[0][len("session="):]
                if val:
                    self.cookies["session"] = val
        return st, text, dt


ERR = re.compile(r'"message":\{"t":1,"s":"((?:\\.|[^"\\])*)"')


def err(body):
    m = ERR.search(body)
    return json.loads('"' + m.group(1) + '"') if m else ""


def ok(body):
    return '"k":["result"]' in body


def signed_up(email, admin=False):
    psql(f"DELETE FROM users WHERE email = {q(email)}; DELETE FROM rate_limit_hits;")
    s = Session()
    st, body, _ = s.call("auth", "signUp", {"email": email, "password": PASSWORD})
    if not ok(body):
        sys.exit(f"could not create {email} ({err(body) or st}); is the server up at {BASE}?")
    if admin:
        psql(f"INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM users WHERE email = {q(email)} ON CONFLICT DO NOTHING;")
    s.cookies.clear()
    s.call("auth", "signIn", {"email": email, "password": PASSWORD})
    return s


# Fields that must never carry a value in a public response. Company e-mail,
# phone and address are public contact details by design and are not listed.
FORBIDDEN = {"password_hash", "mfa_otp_hash", "mfa_otp_attempts", "mfa_token_expires_at", "national_id",
             "must_change_password", "owner_user_id", "reviewed_by", "rejection_note", "created_by", "api_key",
             "apiKey", "encrypted_value", "openrouter_api_key", "phone_verified", "user_id", "session", "token"}


def seroval_leaks(text):
    """Walk a seroval response and return forbidden keys that carry a non-null value."""
    try:
        root = json.loads(text)
    except ValueError:
        return []
    found = []

    def walk(n):
        if isinstance(n, dict):
            p = n.get("p")
            if isinstance(p, dict) and isinstance(p.get("k"), list) and isinstance(p.get("v"), list):
                for k, v in zip(p["k"], p["v"]):
                    if k in FORBIDDEN and not (isinstance(v, dict) and v.get("t") == 2 and v.get("s") == 0):
                        found.append(k)
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(root)
    return sorted(set(found))


def json_leaks(obj):
    found = []

    def walk(n):
        if isinstance(n, dict):
            for k, v in n.items():
                if k in FORBIDDEN and v not in (None, "", []):
                    found.append(k)
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(obj)
    return sorted(set(found))


# --- setup ---------------------------------------------------------------------
admin = signed_up(ADMIN, admin=True)
owner = signed_up(OWNER)
plain = signed_up(PLAIN)
anon = Session()
owner_id = psql(f"SELECT id FROM users WHERE email = {q(OWNER)}")
published = psql("SELECT company_id FROM exhibition_companies WHERE status = 'approved' AND is_active ORDER BY company_id LIMIT 1")
draft = psql(f"SELECT company_id FROM exhibition_companies WHERE company_id <> {q(published)} ORDER BY company_id LIMIT 1")
psql("DROP TABLE IF EXISTS deep_backup; CREATE TABLE deep_backup AS SELECT * FROM exhibition_companies "
     f"WHERE company_id IN ({q(published)}, {q(draft)});")
psql(f"UPDATE exhibition_companies SET owner_user_id = {q(owner_id)} WHERE company_id IN ({q(published)}, {q(draft)});"
     f"UPDATE exhibition_companies SET status = 'draft' WHERE company_id = {q(draft)};"
     f"DELETE FROM exhibition_change_requests WHERE company_id IN ({q(published)}, {q(draft)});")
park = psql("SELECT park_id FROM parks ORDER BY park_id LIMIT 1")
print(f"target {BASE} ({'production build' if args.prod else 'dev server'})")

try:
    print("Data exposure in public responses")
    reads = [("exhibition-api", "getExhibitionCompanies", None, "GET"),
             ("exhibition-api", "getExhibitionCompanyDetail", {"id": published}, "GET"),
             ("exhibition-api", "getPublicExhibitionProducts", {"companyIds": [published]}, "GET"),
             ("attachments", "getAttachments", {"ownerType": "exhibition", "ownerId": published}, "GET"),
             ("park-content", "getParkContent", {"parkId": park}, "GET"),
             ("parks", "getActiveParks", None, "GET"), ("parks", "getInactiveParkIds", None, "GET"),
             ("about-sections", "getAboutSections", None, "GET"), ("auth", "getCurrentUser", None, "GET")]
    for mod, name, data, method in reads:
        st, body, _ = anon.call(mod, name, data, method)
        for _ in range(5):  # the dev server registers a function once some page has loaded it
            if args.prod or ok(body) or "error" in body[:80]:
                break
            time.sleep(2)
            st, body, _ = anon.call(mod, name, data, method)
        if not args.prod and not ok(body) and "Invalid server function ID" in body or (not args.prod and st >= 500 and not err(body)):
            print(f"  skip {mod}.{name}: not registered on the dev server yet (no page loaded it); covered with --prod")
            continue
        leaks = seroval_leaks(body)
        check(f"{mod}.{name} exposes no internal or personal fields", ok(body) and not leaks, ", ".join(leaks) or (err(body) or f"status {st}"))
    for path in ("/api/public/export", "/api/public/health"):
        st, _, body, _ = request("GET", path)
        try:
            leaks = json_leaks(json.loads(body))
        except ValueError:
            leaks = ["<not json>"]
        check(f"{path} exposes no internal or personal fields", st == 200 and not leaks, ", ".join(leaks) or f"status {st}")

    print("Hidden content (SEC-042, SEC-054)")
    hidden_park = psql("SELECT park_id FROM parks WHERE is_active ORDER BY park_id LIMIT 1")
    psql(f"INSERT INTO company_attachments (owner_type, owner_id, kind, file_url, title, is_active) VALUES "
         f"('exhibition', {q(draft)}, 'catalog', 'attachments/deep-probe.pdf', 'deep-probe draft file', true), "
         f"('park', {q(hidden_park)}, 'catalog', 'attachments/deep-probe.pdf', 'deep-probe park file', true);"
         f"INSERT INTO park_images (park_id, image_url, caption) VALUES ({q(hidden_park)}, 'deep-probe.jpg', 'deep-probe');"
         f"INSERT INTO park_news (park_id, title) VALUES ({q(hidden_park)}, 'deep-probe news');"
         f"UPDATE parks SET is_active = false WHERE park_id = {q(hidden_park)};")
    try:
        st, _, body, _ = request("GET", "/api/public/export")
        export = json.loads(body) if st == 200 else {}
        found = [k for k, rows in (("parks", export.get("parks", [])), ("parkContent", export.get("parkContent", [])),
                                   ("parkImages", export.get("parkImages", [])), ("parkNews", export.get("parkNews", [])))
                 if any(r.get("park_id") == hidden_park for r in rows)]
        found += [f"attachment of {a['owner_id']}" for a in export.get("attachments", [])
                  if a.get("title", "").startswith("deep-probe")]
        check("/api/public/export carries nothing of a deactivated park or an unpublished company", st == 200 and not found,
              ", ".join(found) or f"status {st}")
        for label, sess, expect in (("anonymous visitor", anon, False), ("admin", admin, True)):
            st, body, _ = sess.call("park-content", "getParkContent", {"parkId": hidden_park}, "GET")
            for _ in range(5):
                if args.prod or ok(body) or "error" in body[:80]:
                    break
                time.sleep(2)
                st, body, _ = sess.call("park-content", "getParkContent", {"parkId": hidden_park}, "GET")
            if not ok(body) and not args.prod:
                print(f"  skip getParkContent ({label}): not registered on the dev server yet; covered with --prod")
            else:
                check(f"deactivated park's news {'reach' if expect else 'do not reach'} an {label}",
                      ("deep-probe news" in body) == expect, err(body) or "")
            st, body, _ = sess.call("attachments", "getAttachments", {"ownerType": "park", "ownerId": hidden_park}, "GET")
            check(f"deactivated park's attachments {'reach' if expect else 'do not reach'} an {label}",
                  ok(body) and ("deep-probe park file" in body) == expect, err(body) or "")
        st, body, _ = anon.call("attachments", "getAttachments", {"ownerType": "exhibition", "ownerId": draft}, "GET")
        check("an unpublished company's attachments do not reach an anonymous visitor",
              ok(body) and "deep-probe draft file" not in body, err(body) or "")
    finally:
        psql(f"UPDATE parks SET is_active = true WHERE park_id = {q(hidden_park)};"
             "DELETE FROM company_attachments WHERE title LIKE 'deep-probe %'; DELETE FROM park_images WHERE caption = 'deep-probe';"
             "DELETE FROM park_news WHERE title = 'deep-probe news';")

    print("Password storage (SEC-013, SEC-056)")
    legacy_email, current_email = "security-deep-legacy@example.test", "security-deep-current@example.test"
    salt = "00112233445566778899aabbccddeeff"
    legacy_hash = salt + ":" + hashlib.scrypt(PASSWORD.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64,
                                              maxmem=64 * 1024 * 1024).hex()
    psql(f"DELETE FROM users WHERE email IN ({q(legacy_email)}, {q(current_email)}); DELETE FROM rate_limit_hits;"
         f"INSERT INTO users (email, password_hash) VALUES ({q(legacy_email)}, {q(legacy_hash)});")
    try:
        s = Session()
        s.call("auth", "signUp", {"email": current_email, "password": PASSWORD})
        stored = psql(f"SELECT password_hash FROM users WHERE email = {q(current_email)}")
        check("a new account's hash uses the current cost (scrypt N=2^14, r=8, p=5)", stored.startswith("scrypt$16384$8$5$"),
              stored.split("$")[0][:20])
        timings = {"unknown account": [], "account with an old hash": [], "account with a current hash": []}
        for _ in range(7):
            for label, email in (("unknown account", "security-deep-nobody@example.test"),
                                 ("account with an old hash", legacy_email), ("account with a current hash", current_email)):
                psql("DELETE FROM rate_limit_hits;")
                _, _, dt = Session().call("auth", "signIn", {"email": email, "password": "Wrong#Passw0rd2026"})
                timings[label].append(dt)
        med = {k: sorted(v)[len(v) // 2] for k, v in timings.items()}
        spread = max(med.values()) / min(med.values())
        check("a wrong password takes as long for an unknown account as for old- and current-hash accounts", spread < 1.5,
              ", ".join(f"{k} {v * 1000:.0f} ms" for k, v in med.items()))
        psql("DELETE FROM rate_limit_hits;")
        s = Session()
        _, body, _ = s.call("auth", "signIn", {"email": legacy_email, "password": PASSWORD})
        upgraded = psql(f"SELECT password_hash FROM users WHERE email = {q(legacy_email)}")
        check("an account with an old hash still signs in", ok(body) and "session" in s.cookies, err(body))
        check("and its hash is replaced with the current cost", upgraded.startswith("scrypt$16384$8$5$"), upgraded[:20])
        s = Session()
        _, body, _ = s.call("auth", "signIn", {"email": legacy_email, "password": PASSWORD})
        check("the same password signs in after the upgrade", ok(body) and "session" in s.cookies, err(body))
    finally:
        psql(f"DELETE FROM users WHERE email IN ({q(legacy_email)}, {q(current_email)}); DELETE FROM rate_limit_hits;")

    print("Mass assignment by a company owner")
    other_owner = psql(f"SELECT id FROM users WHERE email = {q(PLAIN)}")
    before = psql(f"SELECT status, is_active, owner_user_id, reviewed_by, rejection_note, sort_order FROM exhibition_companies WHERE company_id = {q(draft)}")
    hostile = {"status": "approved", "is_active": True, "owner_user_id": other_owner, "reviewed_by": owner_id,
               "rejection_note": "self-approved", "submitted_at": "2026-01-01T00:00:00Z", "reviewed_at": "2026-01-01T00:00:00Z",
               "sort_order": -999999, "company_id": published, "name": "Deep Test Draft"}
    st, body, _ = owner.call("exhibition-api", "saveOwnedCompany", {"company_id": draft, "patch": hostile})
    after = psql(f"SELECT status, is_active, owner_user_id, reviewed_by, rejection_note, sort_order FROM exhibition_companies WHERE company_id = {q(draft)}")
    name_now = psql(f"SELECT name FROM exhibition_companies WHERE company_id = {q(draft)}")
    check("owner save of a draft applies ordinary fields", name_now == "Deep Test Draft", err(body) or name_now[:30])
    check("owner cannot set status, activation, ownership, review fields or listing order", before == after, f"{before} -> {after}")
    check("owner cannot redirect the save to another company", psql(f"SELECT name FROM exhibition_companies WHERE company_id = {q(published)}")
          != "Deep Test Draft")
    st, body, _ = owner.call("exhibition-api", "saveOwnedCompany", {"company_id": published, "patch": hostile})
    payload = psql(f"SELECT payload::text FROM exhibition_change_requests WHERE company_id = {q(published)} AND status = 'pending' "
                   "AND entity_type = 'company' ORDER BY submitted_at DESC LIMIT 1")
    bad = [k for k in ("status", "is_active", "owner_user_id", "reviewed_by", "rejection_note", "sort_order", "company_id",
                       "submitted_at", "reviewed_at") if f'"{k}"' in payload]
    check("a change request carries no privileged field", bool(payload) and not bad, ", ".join(bad) or (payload[:60] if payload else "no request"))

    print("Review workflow")
    live_name = psql(f"SELECT name FROM exhibition_companies WHERE company_id = {q(published)}")
    check("an owner's edit to a published company is not live before review", live_name != "Deep Test Draft")
    req_id = psql(f"SELECT id FROM exhibition_change_requests WHERE company_id = {q(published)} AND status = 'pending' "
                  "AND entity_type = 'company' LIMIT 1")
    if req_id:
        st, body, _ = owner.call("exhibition-api", "approveChangeRequestAdmin", {"id": req_id})
        check("an owner cannot approve their own change request", not ok(body), err(body)[:40])
        st, body, _ = plain.call("exhibition-api", "approveChangeRequestAdmin", {"id": req_id})
        check("another signed-in user cannot approve it", not ok(body), err(body)[:40])
        check("the request is still pending", psql(f"SELECT status FROM exhibition_change_requests WHERE id = {q(req_id)}") == "pending")

    print("Low-privilege abuse")
    boundary = "----deep"
    form = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.png\"\r\nContent-Type: image/png\r\n\r\n").encode() \
        + b"\x89PNG\r\n\x1a\n" + b"\0" * (3 * 1024 * 1024) + f"\r\n--{boundary}--\r\n".encode()
    for label, sess, expect_refused in (("a self-registered user who owns nothing", plain, True), ("a company owner", owner, False),
                                        ("an admin", admin, False)):
        h = {"x-tsr-serverfn": "true", "content-type": f"multipart/form-data; boundary={boundary}",
             "cookie": "; ".join(f"{k}={v}" for k, v in sess.cookies.items())}
        st, _, body, _ = request("POST", fn_path("exhibition-api", "uploadExhibitionAssetFn"), form, h)
        refused = st in (0, 413)
        check(f"3 MB upload body from {label} is {'refused' if expect_refused else 'accepted for processing'}",
              refused == expect_refused, f"status {st}")

    print("Input-processing cost (ReDoS)")
    worst = {"question": ["a" * 499 + "!", "‌" * 500, "ي" * 250 + "ك" * 250, ("ab" * 250), " " * 499 + "x", "۰" * 500],
             "identifier": ["a" * 253 + "@", "1" * 254, "@" * 254, "a@" * 127, "۱" * 254]}
    slowest = (0.0, "")
    for q_ in worst["question"]:
        psql("DELETE FROM rate_limit_hits;")
        _, _, dt = anon.call("assistant", "askAssistant", {"question": q_})
        slowest = max(slowest, (dt, f"question {q_[:6]!r}…"))
    for ident in worst["identifier"]:
        psql("DELETE FROM rate_limit_hits;")
        _, _, dt = anon.call("auth", "signIn", {"identifier": ident, "password": "x"})
        slowest = max(slowest, (dt, f"identifier {ident[:6]!r}…"))
    check("worst-case inputs are processed in under 2 s", slowest[0] < 2.0, f"slowest {slowest[0]:.2f}s ({slowest[1]})")
finally:
    cols = psql("SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name = 'exhibition_companies' "
                "AND is_generated = 'NEVER' AND column_name <> 'company_id'").split(",")
    psql(f"UPDATE exhibition_companies e SET ({', '.join(cols)}) = ({', '.join('b.' + c for c in cols)}) FROM deep_backup b "
         "WHERE e.company_id = b.company_id; DROP TABLE deep_backup;"
         f"DELETE FROM exhibition_change_requests WHERE company_id IN ({q(published)}, {q(draft)});"
         f"DELETE FROM users WHERE email IN ({q(OWNER)}, {q(PLAIN)}, {q(ADMIN)}); DELETE FROM rate_limit_hits;")

print(f"\n{checks} checks, {'all passed' if not failures else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
