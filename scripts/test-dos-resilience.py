"""Denial-of-service resilience tests (docs/security/PENETRATION_TEST_RESULTS.md).

Each scenario attacks a running server for a fixed time while a probe keeps
making the requests an ordinary visitor makes (the health check and the home
page). A scenario passes when, during and after the attack, the probe is
still served within the scenario's latency budget, the server does not crash
or restart, and (with --container) memory stays under the container limit.

Scenarios:
  sign-in flood from one address    (throttle makes the extra attempts cheap)
  sign-in flood from many addresses (worst case: each attempt costs a scrypt)
  export flood                      (largest anonymous response)
  slowloris                         (many connections sending headers slowly)
  idle connection flood             (thousands of open, silent connections)
  large-body flood                  (many 1.9 MB bodies, just under the limit)
  oversized bodies                  (refused before they are read)

Only against a local or staging copy with a disposable database; never
against production. "Many addresses" is simulated with X-Forwarded-For, which
a server with no proxy in front of it takes from the client (behind the real
proxy an attacker needs that many real addresses).

  DATABASE_URL=... BASE_URL=http://localhost:3000 \\
      python scripts/test-dos-resilience.py --build .output [--container NAME]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import socket
import subprocess
import sys
import threading
import time
import http.client
import urllib.parse

parser = argparse.ArgumentParser()
parser.add_argument("--build", default=".output")
parser.add_argument("--container", help="docker container name, to read memory and restarts")
parser.add_argument("--seconds", type=int, default=20, help="length of each attack")
parser.add_argument("--only", help="comma-separated scenario names")
parser.add_argument("--slow-seconds", type=int, default=150, help="how long slowloris holds its connections")
args = parser.parse_args()

BASE = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
_u = urllib.parse.urlsplit(BASE)
HOST, PORT = _u.hostname or "localhost", _u.port or 80
DB = os.environ.get("DATABASE_URL")
failures = checks = 0


def check(label, ok, detail=""):
    global failures, checks
    checks += 1
    failures += 0 if ok else 1
    print(f"  {'ok  ' if ok else 'FAIL'} {label}{('  [' + detail + ']') if detail else ''}", flush=True)


def psql(statement):
    if DB:
        subprocess.run(["psql", "-qtA", DB, "-c", statement], check=False, capture_output=True)


def fn_id(name):
    pat = re.compile(r'createServerRpc\(\{\s*id:\s*"([0-9a-f]+)",\s*name:\s*"' + name + '"')
    for root, _, files in os.walk(os.path.join(args.build, "server")):
        for f in files:
            if f.endswith(".mjs"):
                with open(os.path.join(root, f), encoding="utf-8", errors="replace") as fh:
                    m = pat.search(fh.read())
                if m:
                    return m.group(1)
    sys.exit(f"server function {name} not found in {args.build}; build first")


SIGNIN = "/_serverFn/" + fn_id("signIn")


def signin_body(email, password):
    return json.dumps({"t": {"t": 10, "i": 0, "p": {"k": ["data"], "v": [{"t": 10, "i": 1, "p": {
        "k": ["email", "password"], "v": [{"t": 1, "s": email}, {"t": 1, "s": password}]}, "o": 0}]}, "o": 0},
        "f": 63, "m": []}).encode()


def request(method, path, body=None, headers=None, timeout=30, want_body=False):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=timeout)
    try:
        conn.request(method, path, body=body, headers=headers or {})
        r = conn.getresponse()
        data = r.read()
        return (r.status, data) if want_body else r.status
    except Exception:
        return (0, b"") if want_body else 0
    finally:
        conn.close()


LEGIT_EMAIL, LEGIT_PASSWORD = "dos-legit@example.test", "Legit#Passw0rd2026"


def make_legit_account():
    """A real account, hashed the way the app hashes (password.server.ts)."""
    salt = os.urandom(16).hex()
    key = hashlib.scrypt(LEGIT_PASSWORD.encode(), salt=salt.encode(), n=16384, r=8, p=5, dklen=64,
                         maxmem=64 * 1024 * 1024).hex()
    psql(f"DELETE FROM users WHERE email = '{LEGIT_EMAIL}';"
         f"INSERT INTO users (email, password_hash) VALUES ('{LEGIT_EMAIL}', 'scrypt$16384$8$5${salt}${key}');")


def legit_signin():
    t = time.perf_counter()
    st, body = request("POST", SIGNIN, signin_body(LEGIT_EMAIL, LEGIT_PASSWORD),
                       {"x-tsr-serverfn": "true", "content-type": "application/json", "x-forwarded-for": "192.0.2.10"},
                       timeout=60, want_body=True)
    return st == 200 and b'"k":["result"]' in body, time.perf_counter() - t


def with_legit_signins(attack):
    """Runs the attack while a real user signs in every two seconds."""
    if not DB:
        return attack()
    make_legit_account()
    base = [legit_signin() for _ in range(3)]
    results, stop = [], threading.Event()

    def user():
        while not stop.is_set():
            results.append(legit_signin())
            stop.wait(2)

    th = threading.Thread(target=user, daemon=True)
    th.start()
    detail = attack()
    stop.set()
    th.join(timeout=70)
    psql(f"DELETE FROM users WHERE email = '{LEGIT_EMAIL}';")
    ok_times = sorted(dt for ok, dt in results if ok)
    failed = sum(1 for ok, _ in results if not ok)
    med = lambda v: v[len(v) // 2] if v else 0
    print(f"  note a real user's sign-in: {med(sorted(dt for _, dt in base)) * 1000:.0f} ms before the attack; "
          f"during it median {med(ok_times) * 1000:.0f} ms, slowest {max(ok_times or [0]) * 1000:.0f} ms, "
          f"{failed} of {len(results)} failed", flush=True)
    return detail


def container_stat():
    """(memory bytes, limit bytes, restart count) or None."""
    if not args.container:
        return None
    out = subprocess.run(["docker", "inspect", args.container, "--format",
                          "{{.Id}} {{.RestartCount}} {{.HostConfig.Memory}} {{.State.Running}}"],
                         capture_output=True, text=True).stdout.split()
    if len(out) < 4:
        return None
    cid, restarts, limit, running = out
    try:
        with open(f"/sys/fs/cgroup/memory/docker/{cid}/memory.usage_in_bytes") as fh:
            mem = int(fh.read())
    except OSError:
        mem = 0
    return mem, int(limit), int(restarts), running == "true"


class Probe:
    """An ordinary visitor: health check and home page, four times a second."""

    def __init__(self):
        self.lat, self.fail, self.stop = [], 0, threading.Event()
        self.mem_peak = 0

    def run(self):
        while not self.stop.is_set():
            for path in ("/api/public/health", "/"):
                t = time.perf_counter()
                st = request("GET", path, timeout=15)
                dt = time.perf_counter() - t
                if st == 200:
                    self.lat.append(dt)
                else:
                    self.fail += 1
            s = container_stat()
            if s:
                self.mem_peak = max(self.mem_peak, s[0])
            self.stop.wait(0.25)

    def summary(self):
        if not self.lat:
            return 0, 0, 0
        v = sorted(self.lat)
        return v[len(v) // 2], v[int(len(v) * 0.95) - 1 if len(v) > 1 else 0], v[-1]


def hammer(fn, threads, seconds):
    stop = threading.Event()
    counts = {"sent": 0}
    lock = threading.Lock()

    def worker():
        while not stop.is_set():
            fn()
            with lock:
                counts["sent"] += 1

    ts = [threading.Thread(target=worker, daemon=True) for _ in range(threads)]
    for t in ts:
        t.start()
    time.sleep(seconds)
    stop.set()
    for t in ts:
        t.join(timeout=35)
    return counts["sent"]


def scenario(name, budget_p95, attack):
    if args.only and name not in args.only.split(","):
        return
    print(f"{name}", flush=True)
    psql("DELETE FROM rate_limit_hits;")
    before = container_stat()
    probe = Probe()
    th = threading.Thread(target=probe.run, daemon=True)
    th.start()
    detail = attack()
    probe.stop.set()
    th.join()
    p50, p95, worst = probe.summary()
    check(f"visitors still served during the attack (p95 under {budget_p95:g} s)",
          probe.fail == 0 and p95 < budget_p95,
          f"p50 {p50 * 1000:.0f} ms, p95 {p95 * 1000:.0f} ms, max {worst * 1000:.0f} ms, {probe.fail} failed; {detail}")
    t = time.perf_counter()
    recovered = False
    while time.perf_counter() - t < 15:
        t1 = time.perf_counter()
        if request("GET", "/api/public/health", timeout=5) == 200 and time.perf_counter() - t1 < 0.5:
            recovered = True
            break
        time.sleep(0.5)
    check("back to normal within 15 s after the attack", recovered, f"{time.perf_counter() - t:.1f} s")
    after = container_stat()
    if before and after:
        mem, limit, restarts, running = after
        check("no crash, restart or out-of-memory kill", running and restarts == before[2],
              f"restarts {before[2]} -> {restarts}")
        check("memory stayed under the container limit", probe.mem_peak < limit * 0.9,
              f"peak {probe.mem_peak / 2**20:.0f} MiB of {limit / 2**20:.0f} MiB")
    psql("DELETE FROM rate_limit_hits;")


S = args.seconds
print(f"target {BASE}; {S} s per attack" + (f"; container {args.container}" if args.container else ""))


def signin_one_address():
    def one():
        request("POST", SIGNIN, signin_body("dos-victim@example.test", "wrong-password"),
                {"x-tsr-serverfn": "true", "content-type": "application/json", "x-forwarded-for": "203.0.113.7"})
    sent = with_legit_signins(lambda: hammer(one, 50, S))
    return f"{sent} attempts from one address"


def signin_many_addresses():
    def one():
        ip = f"198.51.{random.randint(0, 255)}.{random.randint(1, 254)}"
        request("POST", SIGNIN, signin_body(f"dos-{random.randint(0, 10**9)}@example.test", "wrong-password"),
                {"x-tsr-serverfn": "true", "content-type": "application/json", "x-forwarded-for": ip})
    sent = with_legit_signins(lambda: hammer(one, 50, S))
    return f"{sent} attempts from random addresses"


def export_flood():
    sent = hammer(lambda: request("GET", "/api/public/export"), 50, S)
    return f"{sent} exports"


def slowloris(n=2000):
    socks = []
    for _ in range(n):
        try:
            s = socket.create_connection((HOST, PORT), timeout=5)
            s.sendall(b"GET / HTTP/1.1\r\nHost: " + HOST.encode() + b"\r\n")
            socks.append(s)
        except OSError:
            break
    opened = len(socks)
    hold = max(S, args.slow_seconds)
    end = time.time() + hold
    while time.time() < end:
        alive = []
        for s in socks:
            try:
                s.sendall(b"X-a: b\r\n")
                alive.append(s)
            except OSError:
                pass
        socks = alive
        time.sleep(10)
    still = len(socks)
    for s in socks:
        s.close()
    return f"{opened} slow connections opened, {still} still open after {hold} s"


def idle_flood(n=5000):
    socks = []
    for _ in range(n):
        try:
            socks.append(socket.create_connection((HOST, PORT), timeout=5))
        except OSError:
            break
    time.sleep(S)
    for s in socks:
        s.close()
    return f"{len(socks)} idle connections"


def large_bodies():
    body = signin_body("x" * (1900 * 1024), "pw")
    sent = hammer(lambda: request("POST", SIGNIN, body, {"x-tsr-serverfn": "true", "content-type": "application/json"}), 30, S)
    return f"{sent} bodies of {len(body) / 2**20:.1f} MiB"


def oversized_bodies():
    statuses = {}
    lock = threading.Lock()

    def one():
        s = socket.create_connection((HOST, PORT), timeout=10)
        try:
            s.sendall((f"POST {SIGNIN} HTTP/1.1\r\nHost: {HOST}\r\nx-tsr-serverfn: true\r\n"
                       "Content-Type: application/json\r\nContent-Length: 104857600\r\n\r\n").encode())
            s.sendall(b"{" * 65536)
            st = s.recv(64).split(b" ")[1].decode()
        except socket.timeout:
            st = "no answer in 10 s"
        except (OSError, IndexError):
            st = "closed"
        finally:
            s.close()
        with lock:
            statuses[st] = statuses.get(st, 0) + 1

    sent = hammer(one, 30, S)
    return f"{sent} requests announcing 100 MiB; answers {statuses}"


scenario("sign-in flood from one address", 1.0, signin_one_address)
scenario("sign-in flood from many addresses", 3.0, signin_many_addresses)
scenario("export flood", 2.0, export_flood)
scenario("slowloris", 1.0, slowloris)
scenario("idle connection flood", 1.0, idle_flood)
scenario("large-body flood", 2.0, large_bodies)
scenario("oversized bodies", 1.0, oversized_bodies)

psql("DELETE FROM rate_limit_hits;")
print(f"\n{checks} checks, {'all passed' if not failures else f'{failures} FAILED'}")
sys.exit(1 if failures else 0)
