"""Regression tests for auth hardening (security-audit/findings.md SEC-004,
SEC-005, SEC-007).

SEC-004: MFA verification must belong to the session that passed the OTP
         check. It used to be stored on the user row, so a second session
         opened with only the password counted as verified too.
SEC-005: A session that has not passed MFA must not be able to replace an
         already-verified phone number (which would redirect the OTP to an
         attacker's number).

SEC-007: Changing a password must require the current one (outside the
         forced first-login change) and must sign out the account's other
         sessions.

No SMS provider is needed: the state a successful OTP check leaves behind is
written directly to the database, then a second, password-only session is
checked against it.

Requires: a dev server on localhost:8080 started with MFA_ENFORCED=true,
DATABASE_URL pointing at a disposable database (psql on PATH), and the
server-function client from scripts/test-authz-coverage.py.
Run:  DATABASE_URL=... python scripts/test-auth-hardening.py
"""
from __future__ import annotations

import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_src = open(os.path.join(HERE, "test-authz-coverage.py"), encoding="utf-8").read()
_ns: dict = {}
# Reuse the authz suite's HTTP client and seroval encoder, not its fixtures.
exec(compile(_src.split("for client, email in ((admin, ADMIN_EMAIL)")[0], "authz_helpers", "exec"), _ns)
Client = _ns["Client"]

DB = os.environ.get("DATABASE_URL")
if not DB:
    sys.exit("DATABASE_URL is required (a disposable test database).")
EMAIL = "mfa-regression@example.test"


def psql(statement: str) -> None:
    subprocess.run(["psql", "-q", DB, "-c", statement], check=True)


def satisfied(client) -> bool:
    body = client.call("mfa", "getMfaStatus", method="GET")[1]
    m = re.search(r'"k":\["enforced","phone","phoneVerified","satisfied"\],"v":\[(.*?)\]\}', body)
    if not m:
        raise RuntimeError(f"unexpected getMfaStatus response: {body[:200]}")
    return m.group(1).rstrip().endswith('{"t":2,"s":2}')


failures = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global failures
    print(f"  {'ok  ' if ok else 'FAIL'} {label}{('  [' + detail + ']') if detail else ''}")
    if not ok:
        failures += 1


psql(f"DELETE FROM users WHERE email = '{EMAIL}'; DELETE FROM rate_limit_hits;")
owner = Client("owner")
owner.sign_up(EMAIL)
if owner.sign_in(EMAIL)[0] != 200:
    sys.exit("could not sign in the fixture account; is the dev server up?")

# The state verifyOtp leaves behind after the owner's own OTP check: the user
# row (old storage) and the owner's session (new storage) both marked.
psql(
    f"UPDATE users SET phone = '09120000001', phone_verified = true, "
    f"mfa_token_expires_at = now() + interval '24 hours' WHERE email = '{EMAIL}'; "
    f"UPDATE sessions SET mfa_verified_until = now() + interval '24 hours' "
    f"WHERE user_id = (SELECT id FROM users WHERE email = '{EMAIL}');"
)
print("SEC-004  MFA state is per session")
check("owner's own session is verified", satisfied(owner))
intruder = Client("intruder")
intruder.sign_in(EMAIL)
check("a second, password-only session is NOT verified", not satisfied(intruder))
_, body = intruder.call("admin-users", "getMyRoles", method="GET")
check("that session is refused by MFA-gated functions", "MFA_REQUIRED" in body, re.sub(r"\s+", " ", body)[:80])

print("SEC-005  verified phone cannot be replaced without MFA")
_, body = intruder.call("mfa", "setPhone", {"phone": "09129999999"})
check("password-only session cannot replace the verified phone", "PHONE_CHANGE_REQUIRES_MFA" in body, body[:80])
phone = subprocess.run(["psql", "-At", DB, "-c", f"SELECT phone FROM users WHERE email = '{EMAIL}'"],
                       capture_output=True, text=True).stdout.strip()
check("stored phone is unchanged", phone == "09120000001", phone)
_, body = owner.call("mfa", "setPhone", {"phone": "09120000002"})
check("the MFA-verified session can still change it", '"ok"' in body, body[:80])

print("SEC-007  password change needs the current password and ends other sessions")
PASSWORD = _ns["PASSWORD"]
_, body = owner.call("auth", "changeMyPassword", {"newPassword": "Another#Passw0rd"})
check("change without the current password is refused", "INVALID_CURRENT_PASSWORD" in body, body[:80])
_, body = owner.call("auth", "changeMyPassword", {"currentPassword": "wrong-password", "newPassword": "Another#Passw0rd"})
check("change with a wrong current password is refused", "INVALID_CURRENT_PASSWORD" in body, body[:80])
_, body = owner.call("auth", "changeMyPassword", {"currentPassword": PASSWORD, "newPassword": "Another#Passw0rd"})
check("change with the correct current password succeeds", '"ok"' in body, body[:80])
_, body = intruder.call("auth", "getCurrentUser", method="GET")
check("the account's other session was signed out", EMAIL not in body, re.sub(r"\s+", " ", body)[:80])
_, body = owner.call("auth", "getCurrentUser", method="GET")
check("the session that changed it stays signed in", EMAIL in body)

psql(f"DELETE FROM users WHERE email = '{EMAIL}';")
print(f"\n{'all passed' if not failures else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
