"""E2E: verify x-request-id propagates through Worker → PostgREST → LogEnvelope.

Requires dev server running at http://localhost:8080 with LOG_SINK=memory so
the /api/public/debug-echo endpoint can drain the in-memory log ring buffer.

Success cases:
  1. Client-provided x-request-id echoed back in response header and body.
  2. Missing header → server mints a UUID; header and body match.
  3. RLS 42501 scenario → 403 response, header preserved, LogEnvelope in the
     drained log stream carries the same request_id and pg_code=42501.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import urllib.request
import urllib.error


BASE_URL = "http://localhost:8080"
UUID_RE = re.compile(r"^[0-9a-f-]{8,}$", re.IGNORECASE)


def req(method: str, path: str, headers: dict, body: bytes | None = None):
    r = urllib.request.Request(BASE_URL + path, method=method, headers=headers, data=body)
    try:
        resp = urllib.request.urlopen(r, timeout=10)
        return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def assert_(cond: bool, msg: str) -> None:
    if not cond:
        print(f"FAIL: {msg}", file=sys.stderr)
        sys.exit(1)
    print(f"ok   {msg}")


VALID_LEVELS = {"info", "warn", "error"}
ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")


def validate_envelope(env: dict, label: str) -> None:
    """Strict LogEnvelope schema contract used by Sentry/Logflare consumers."""
    for key in ("ts", "level", "request_id", "event", "message"):
        assert_(key in env, f"{label}: envelope has key '{key}' (got keys {list(env)})")
    assert_(bool(ISO_RE.match(env["ts"])), f"{label}: ts is ISO8601 (got {env['ts']!r})")
    assert_(env["level"] in VALID_LEVELS, f"{label}: level in {VALID_LEVELS} (got {env['level']!r})")
    assert_(isinstance(env["request_id"], str) and len(env["request_id"]) > 0,
            f"{label}: request_id is non-empty string")


async def main() -> int:
    # 1. explicit header round-trip
    status, headers, body = req("GET", "/api/public/debug-echo",
                                {"x-request-id": "test-abc-123"})
    assert_(status == 200, "case 1: status 200")
    assert_(headers.get("x-request-id") == "test-abc-123",
            f"case 1: response header echoes id (got {headers.get('x-request-id')})")
    payload = json.loads(body)
    assert_(payload["request_id"] == "test-abc-123",
            "case 1: body request_id matches header")

    # 2. missing header → server mints one
    status, headers, body = req("GET", "/api/public/debug-echo", {})
    assert_(status == 200, "case 2: status 200")
    minted = headers.get("x-request-id", "")
    assert_(bool(UUID_RE.match(minted)),
            f"case 2: minted id matches uuid-ish pattern (got {minted!r})")
    payload = json.loads(body)
    assert_(payload["request_id"] == minted,
            "case 2: body request_id matches header")

    # 3. RLS 42501 propagation + schema validation
    status, headers, body = req(
        "POST", "/api/public/debug-echo",
        {"x-request-id": "rls-test-999", "content-type": "application/json"},
        json.dumps({"scenario": "rls_42501"}).encode(),
    )
    assert_(status == 403, f"case 3: status 403 (got {status})")
    assert_(headers.get("x-request-id") == "rls-test-999",
            "case 3: response header preserved on error")
    payload = json.loads(body)
    assert_(payload["request_id"] == "rls-test-999",
            "case 3: body request_id preserved")
    logs = payload.get("logs", [])
    for i, env in enumerate(logs):
        validate_envelope(env, f"case 3 envelope[{i}]")
    matching = [l for l in logs
                if l.get("event") == "rls_denied"
                and l.get("request_id") == "rls-test-999"
                and (l.get("meta") or {}).get("pg_code") == "42501"]
    assert_(len(matching) >= 1,
            f"case 3: LogEnvelope with matching request_id + pg_code=42501 (got {logs})")

    # 4. rls_success — info envelope with duration_ms and pg_code=None
    status, headers, body = req(
        "POST", "/api/public/debug-echo",
        {"x-request-id": "ok-test-777", "content-type": "application/json"},
        json.dumps({"scenario": "rls_success"}).encode(),
    )
    assert_(status == 200, f"case 4: status 200 (got {status})")
    assert_(headers.get("x-request-id") == "ok-test-777",
            "case 4: header preserved on success")
    payload = json.loads(body)
    logs = payload.get("logs", [])
    for i, env in enumerate(logs):
        validate_envelope(env, f"case 4 envelope[{i}]")
    success = [l for l in logs
               if l.get("event") == "rls_query"
               and l.get("request_id") == "ok-test-777"
               and (l.get("meta") or {}).get("pg_code") is None
               and isinstance((l.get("meta") or {}).get("duration_ms"), int)]
    assert_(len(success) >= 1,
            f"case 4: LogEnvelope with rls_query + duration_ms (got {logs})")

    # 5. nested serverFn — multiple envelopes must share the same request_id
    status, headers, body = req(
        "POST", "/api/public/debug-echo",
        {"x-request-id": "nested-555", "content-type": "application/json"},
        json.dumps({"scenario": "nested_rls_42501"}).encode(),
    )
    assert_(status == 403, f"case 5: status 403 (got {status})")
    payload = json.loads(body)
    logs = payload.get("logs", [])
    for i, env in enumerate(logs):
        validate_envelope(env, f"case 5 envelope[{i}]")
    same_id = [l for l in logs if l.get("request_id") == "nested-555"]
    assert_(len(same_id) >= 2,
            f"case 5: >=2 envelopes share request_id=nested-555 (got {len(same_id)})")
    events = {l.get("event") for l in same_id}
    assert_("outer_call" in events and "rls_denied" in events,
            f"case 5: nested stack emitted both outer_call and rls_denied (got {events})")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

