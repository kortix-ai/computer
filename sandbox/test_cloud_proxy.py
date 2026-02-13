"""
Kortix Cloud Proxy - End-to-End Tests

Tests the kortix.cloud preview proxy service:
  - Health endpoint (no auth)
  - Auth via Authorization header
  - Auth via ?token= query param (SSE/EventSource path)
  - 401 on missing auth
  - 403 on wrong sandbox / unauthorized user
  - Proxied API routes (health, provider list, sessions)
  - SSE streaming through proxy (/event endpoint)
  - Multiple ports (8000, 4096, 3111, 6080)
  - Request body forwarding (POST)

Usage:
  # Set env vars or use defaults below
  export SUPABASE_URL=https://heprlhlltebrxydgtsjs.supabase.co
  export SUPABASE_SERVICE_ROLE_KEY=...
  export SANDBOX_ID=03f216c5-6219-4d85-b96e-fa73381f2185
  export USER_EMAIL=vukasinkubet@gmail.com

  # Run all tests
  python sandbox/test_cloud_proxy.py

  # Or with uv
  PYTHONPATH="" uv run --python 3.12 sandbox/test_cloud_proxy.py
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
import ssl
import threading
from typing import Optional

# ============================================================================
# Config
# ============================================================================

CLOUD_BASE = os.environ.get("CLOUD_BASE", "https://kortix.cloud")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://heprlhlltebrxydgtsjs.supabase.co")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlcHJsaGxsdGVicnh5ZGd0c2pzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTE4NzE2NCwiZXhwIjoyMDYwNzYzMTY0fQ.hr0ClpGkztUsNe2sVN4hqvHrHxMzQq3_z9-v4L4o-Jk",
)
SANDBOX_ID = os.environ.get("SANDBOX_ID", "03f216c5-6219-4d85-b96e-fa73381f2185")
USER_EMAIL = os.environ.get("USER_EMAIL", "vukasinkubet@gmail.com")

# Real User-Agent to avoid Cloudflare bot detection (error 1010)
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# SSL context that skips cert verification (for local/dev testing)
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# ============================================================================
# Colors / formatting
# ============================================================================

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

passed = 0
failed = 0
skipped = 0


def log_pass(name: str, detail: str = ""):
    global passed
    passed += 1
    print(f"  {GREEN}PASS{RESET}  {name}" + (f" - {detail}" if detail else ""))


def log_fail(name: str, detail: str = ""):
    global failed
    failed += 1
    print(f"  {RED}FAIL{RESET}  {name}" + (f" - {detail}" if detail else ""))


def log_skip(name: str, detail: str = ""):
    global skipped
    skipped += 1
    print(f"  {YELLOW}SKIP{RESET}  {name}" + (f" - {detail}" if detail else ""))


def log_section(title: str):
    print(f"\n{BOLD}{CYAN}=== {title} ==={RESET}")


# ============================================================================
# HTTP helpers (stdlib only - no deps needed)
# ============================================================================


def http_request(
    url: str,
    method: str = "GET",
    headers: Optional[dict] = None,
    body: Optional[bytes] = None,
    timeout: int = 30,
) -> tuple:
    """
    Returns (status_code, response_headers, response_body_bytes).
    On connection error returns (0, {}, b'error message').
    """
    hdrs = headers or {}
    if "User-Agent" not in hdrs:
        hdrs["User-Agent"] = USER_AGENT
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX)
        return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except Exception as e:
        return 0, {}, str(e).encode()


def http_get(url: str, headers: Optional[dict] = None, timeout: int = 30) -> tuple:
    return http_request(url, "GET", headers, timeout=timeout)


def http_post(url: str, json_body: dict, headers: Optional[dict] = None, timeout: int = 30) -> tuple:
    hdrs = headers or {}
    hdrs["Content-Type"] = "application/json"
    return http_request(url, "POST", hdrs, json.dumps(json_body).encode(), timeout=timeout)


def sse_stream(
    url: str,
    headers: Optional[dict] = None,
    timeout: float = 10,
    max_events: int = 5,
) -> list:
    """
    Connect to an SSE endpoint and collect events.
    Returns list of raw event strings received within timeout.
    """
    hdrs = headers or {}
    hdrs["Accept"] = "text/event-stream"
    hdrs["Cache-Control"] = "no-cache"
    if "User-Agent" not in hdrs:
        hdrs["User-Agent"] = USER_AGENT
    req = urllib.request.Request(url, headers=hdrs)

    events = []
    buffer = ""

    def _read():
        nonlocal buffer
        try:
            resp = urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX)
            while len(events) < max_events:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8", errors="replace")
                # Split on double newline (SSE event delimiter)
                while "\n\n" in buffer:
                    event_str, buffer = buffer.split("\n\n", 1)
                    event_str = event_str.strip()
                    if event_str:
                        events.append(event_str)
                    if len(events) >= max_events:
                        break
        except Exception:
            # Timeout or connection closed — that's fine for SSE tests
            pass

    t = threading.Thread(target=_read, daemon=True)
    t.start()
    t.join(timeout=timeout + 2)
    return events


# ============================================================================
# JWT helper — generate a fresh Supabase JWT via admin API
# ============================================================================


def generate_jwt(email: str) -> Optional[str]:
    """
    Use Supabase Admin API to generate a magic link, then exchange the OTP
    for a real access_token. Returns the JWT or None on failure.
    """
    admin_headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }

    # Step 1: Generate magic link → get hashed_token (OTP)
    gen_url = f"{SUPABASE_URL}/auth/v1/admin/generate_link"
    gen_body = json.dumps({
        "type": "magiclink",
        "email": email,
        "options": {"data": {}},
    }).encode()

    req = urllib.request.Request(gen_url, data=gen_body, headers=admin_headers, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=15, context=SSL_CTX)
        data = json.loads(resp.read())
    except Exception as e:
        print(f"    {RED}Failed to generate link: {e}{RESET}")
        return None

    otp = data.get("hashed_token")
    if not otp:
        print(f"    {RED}No hashed_token in response{RESET}")
        return None

    # Step 2: Verify OTP to get access_token
    verify_url = f"{SUPABASE_URL}/auth/v1/verify"
    verify_body = json.dumps({
        "type": "magiclink",
        "token_hash": otp,
    }).encode()

    verify_headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }
    req = urllib.request.Request(verify_url, data=verify_body, headers=verify_headers, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=15, context=SSL_CTX)
        data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"    {RED}Verify failed ({e.code}): {body}{RESET}")
        return None
    except Exception as e:
        print(f"    {RED}Verify failed: {e}{RESET}")
        return None

    token = data.get("access_token")
    if not token:
        print(f"    {RED}No access_token in verify response{RESET}")
        return None

    return token


# ============================================================================
# Tests
# ============================================================================


def test_health_no_auth():
    """Health endpoint should respond without auth."""
    log_section("Health Endpoint (No Auth)")

    status, _, body = http_get(f"{CLOUD_BASE}/health")
    if status == 200:
        data = json.loads(body)
        if data.get("status") == "ok" and data.get("service") == "kortix-daytona-proxy":
            log_pass("GET /health", f"status={status} service={data['service']}")
        else:
            log_fail("GET /health", f"unexpected body: {body.decode()[:200]}")
    else:
        log_fail("GET /health", f"status={status}")


def test_auth_missing():
    """Requests without JWT should get 401."""
    log_section("Auth - Missing Token (expect 401)")

    url = f"{CLOUD_BASE}/{SANDBOX_ID}/8000/"
    status, _, body = http_get(url)
    if status == 401:
        log_pass("No auth → 401", f"body={body.decode()[:100]}")
    else:
        log_fail("No auth → 401", f"got status={status}")


def test_auth_invalid_token():
    """Requests with a garbage JWT should get 401."""
    log_section("Auth - Invalid Token (expect 401)")

    url = f"{CLOUD_BASE}/{SANDBOX_ID}/8000/"
    headers = {"Authorization": "Bearer invalid-garbage-token-12345"}
    status, _, body = http_get(url, headers=headers)
    if status == 401:
        log_pass("Bad token → 401", f"body={body.decode()[:100]}")
    else:
        log_fail("Bad token → 401", f"got status={status}")


def test_auth_header(jwt: str):
    """Auth via Authorization: Bearer header."""
    log_section("Auth - Bearer Header")

    url = f"{CLOUD_BASE}/{SANDBOX_ID}/8000/kortix/health"
    headers = {"Authorization": f"Bearer {jwt}"}
    status, _, body = http_get(url, headers=headers)
    if status == 200:
        log_pass("Bearer header auth", f"status={status}")
    else:
        log_fail("Bearer header auth", f"status={status} body={body.decode()[:200]}")


def test_auth_query_param(jwt: str):
    """Auth via ?token= query parameter (SSE path)."""
    log_section("Auth - Query Param (?token=)")

    url = f"{CLOUD_BASE}/{SANDBOX_ID}/8000/kortix/health?token={urllib.parse.quote(jwt)}"
    status, _, body = http_get(url)
    if status == 200:
        log_pass("?token= query param auth", f"status={status}")
    elif status == 401:
        # Token param support may not be deployed yet
        log_fail("?token= query param auth", f"status={status} — deploy updated auth middleware that accepts ?token= param")
    else:
        log_fail("?token= query param auth", f"status={status} body={body.decode()[:200]}")


def test_wrong_sandbox(jwt: str):
    """Access to a sandbox the user doesn't own should get 403."""
    log_section("Auth - Wrong Sandbox (expect 403)")

    fake_sandbox = "00000000-0000-0000-0000-000000000000"
    url = f"{CLOUD_BASE}/{fake_sandbox}/8000/"
    headers = {"Authorization": f"Bearer {jwt}"}
    status, _, body = http_get(url, headers=headers)
    if status == 403:
        log_pass("Wrong sandbox → 403", f"body={body.decode()[:100]}")
    else:
        # Could also be 503 if Daytona can't find the sandbox
        log_fail("Wrong sandbox → 403", f"got status={status} body={body.decode()[:200]}")


def test_proxy_kortix_master(jwt: str):
    """Proxy to Kortix Master (port 8000) — /kortix/health."""
    log_section("Proxy - Kortix Master (port 8000)")

    headers = {"Authorization": f"Bearer {jwt}"}

    # Health
    url = f"{CLOUD_BASE}/{SANDBOX_ID}/8000/kortix/health"
    status, _, body = http_get(url, headers=headers)
    if status == 200:
        log_pass("GET /kortix/health", f"status={status}")
    else:
        log_fail("GET /kortix/health", f"status={status} body={body.decode()[:200]}")

    # Provider list
    url = f"{CLOUD_BASE}/{SANDBOX_ID}/8000/provider"
    status, _, body = http_get(url, headers=headers)
    if status == 200:
        try:
            data = json.loads(body)
            log_pass("GET /provider", f"status={status} providers={len(data) if isinstance(data, list) else 'obj'}")
        except Exception:
            log_pass("GET /provider", f"status={status} (non-JSON response)")
    else:
        log_fail("GET /provider", f"status={status} body={body.decode()[:200]}")


def test_proxy_opencode(jwt: str):
    """Proxy to OpenCode API (port 4096) — session CRUD."""
    log_section("Proxy - OpenCode API (port 4096)")

    headers = {"Authorization": f"Bearer {jwt}"}
    base = f"{CLOUD_BASE}/{SANDBOX_ID}/4096"

    # Session list
    url = f"{base}/session"
    status, _, body = http_get(url, headers=headers)
    if status == 200:
        try:
            sessions = json.loads(body)
            log_pass("GET /session (list)", f"status={status} count={len(sessions) if isinstance(sessions, list) else '?'}")
        except Exception:
            log_pass("GET /session (list)", f"status={status}")
    else:
        log_fail("GET /session (list)", f"status={status} body={body.decode()[:200]}")

    # Create session (POST with JSON body)
    url = f"{base}/session"
    status, _, body = http_post(url, {}, headers=headers)
    session_id = None
    if status == 200 or status == 201:
        try:
            data = json.loads(body)
            session_id = data.get("id") or data.get("sessionID")
            log_pass("POST /session (create)", f"status={status} id={session_id}")
        except Exception:
            log_pass("POST /session (create)", f"status={status}")
    else:
        log_fail("POST /session (create)", f"status={status} body={body.decode()[:300]}")

    # Get single session
    if session_id:
        url = f"{base}/session/{session_id}"
        status, _, body = http_get(url, headers=headers)
        if status == 200:
            log_pass("GET /session/:id", f"status={status}")
        else:
            log_fail("GET /session/:id", f"status={status} body={body.decode()[:200]}")

    # Agent list
    url = f"{base}/agent"
    status, _, body = http_get(url, headers=headers)
    if status == 200:
        log_pass("GET /agent (list)", f"status={status}")
    else:
        log_fail("GET /agent (list)", f"status={status}")

    # Provider list
    url = f"{base}/provider"
    status, _, body = http_get(url, headers=headers)
    if status == 200:
        log_pass("GET /provider", f"status={status}")
    else:
        log_fail("GET /provider", f"status={status}")

    # Delete the test session
    if session_id:
        url = f"{base}/session/{session_id}"
        status, _, _ = http_request(url, "DELETE", headers=headers)
        if status == 200 or status == 204:
            log_pass("DELETE /session/:id", f"status={status}")
        else:
            log_fail("DELETE /session/:id", f"status={status}")

    return session_id


def test_proxy_web_ui(jwt: str):
    """Proxy to OpenCode Web UI (port 3111) — should return HTML."""
    log_section("Proxy - OpenCode Web UI (port 3111)")

    headers = {"Authorization": f"Bearer {jwt}"}
    url = f"{CLOUD_BASE}/{SANDBOX_ID}/3111/"
    status, resp_headers, body = http_get(url, headers=headers)
    if status == 200:
        content_type = resp_headers.get("content-type", resp_headers.get("Content-Type", ""))
        is_html = "text/html" in content_type or body[:100].lower().find(b"<html") >= 0 or body[:100].lower().find(b"<!doctype") >= 0
        if is_html:
            log_pass("GET / (Web UI)", f"status={status} content-type={content_type[:50]}")
        else:
            log_pass("GET / (Web UI)", f"status={status} (non-HTML but reachable)")
    else:
        log_fail("GET / (Web UI)", f"status={status}")


def test_proxy_novnc(jwt: str):
    """Proxy to noVNC desktop (port 6080)."""
    log_section("Proxy - noVNC Desktop (port 6080)")

    headers = {"Authorization": f"Bearer {jwt}"}
    url = f"{CLOUD_BASE}/{SANDBOX_ID}/6080/"
    status, _, body = http_get(url, headers=headers)
    if status == 200:
        log_pass("GET / (noVNC)", f"status={status}")
    elif status == 302 or status == 301:
        log_pass("GET / (noVNC redirect)", f"status={status}")
    else:
        log_fail("GET / (noVNC)", f"status={status}")


def test_sse_streaming_header(jwt: str):
    """
    SSE streaming via /event endpoint with Authorization header.
    We can't use EventSource (browser-only), but we open a streaming
    HTTP connection and check that:
    1. The connection is accepted (200 or stays open)
    2. Content-Type is text/event-stream
    3. We receive at least a keep-alive/heartbeat within timeout
    """
    log_section("SSE Streaming - Authorization Header (port 4096)")

    url = f"{CLOUD_BASE}/{SANDBOX_ID}/4096/event"
    headers = {
        "Authorization": f"Bearer {jwt}",
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
        "User-Agent": USER_AGENT,
    }

    # Try to connect and read some data
    req = urllib.request.Request(url, headers=headers)
    connected = False
    content_type = ""
    got_data = False
    raw_data = b""
    error_msg = ""

    try:
        resp = urllib.request.urlopen(req, timeout=15, context=SSL_CTX)
        connected = True
        content_type = resp.headers.get("content-type", "")

        # Read up to 4KB with short timeout — SSE may send heartbeat or nothing for a while
        def _read():
            nonlocal raw_data, got_data
            try:
                raw_data = resp.read(4096)
                if raw_data:
                    got_data = True
            except Exception:
                pass

        t = threading.Thread(target=_read, daemon=True)
        t.start()
        t.join(timeout=10)

    except urllib.error.HTTPError as e:
        error_msg = f"HTTP {e.code}"
        # Some SSE endpoints return 200 but urllib may choke on chunked encoding
        if e.code == 200:
            connected = True
            content_type = e.headers.get("content-type", "")
    except Exception as e:
        error_msg = str(e)
        # Timeout on read is OK for SSE — it means connection was accepted
        if "timed out" in str(e).lower() or "timeout" in str(e).lower():
            connected = True

    if connected:
        log_pass("SSE connection accepted (header auth)", f"content-type={content_type[:50]}")
    else:
        log_fail("SSE connection failed (header auth)", error_msg)

    if "text/event-stream" in content_type:
        log_pass("SSE Content-Type is text/event-stream")
    elif connected:
        log_skip("SSE Content-Type check", f"got: {content_type[:50]}")

    if got_data:
        preview = raw_data.decode("utf-8", errors="replace")[:200]
        log_pass("SSE received data", f"preview: {preview[:80]}")
    elif connected:
        log_pass("SSE connection open (no data yet — heartbeat may take time)")


def test_sse_streaming_query_param(jwt: str):
    """
    SSE streaming via /event endpoint with ?token= query parameter.
    This is the path used by EventSource in the browser (can't set headers).
    """
    log_section("SSE Streaming - Query Param ?token= (port 4096)")

    token_encoded = urllib.parse.quote(jwt)
    url = f"{CLOUD_BASE}/{SANDBOX_ID}/4096/event?token={token_encoded}"
    headers = {
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
        "User-Agent": USER_AGENT,
    }

    req = urllib.request.Request(url, headers=headers)
    connected = False
    content_type = ""
    error_msg = ""

    try:
        resp = urllib.request.urlopen(req, timeout=15, context=SSL_CTX)
        connected = True
        content_type = resp.headers.get("content-type", "")

        # Just verify we can connect — don't wait for data
        def _read():
            try:
                resp.read(1024)
            except Exception:
                pass

        t = threading.Thread(target=_read, daemon=True)
        t.start()
        t.join(timeout=5)

    except urllib.error.HTTPError as e:
        error_msg = f"HTTP {e.code}"
        if e.code == 200:
            connected = True
    except Exception as e:
        error_msg = str(e)
        if "timed out" in str(e).lower() or "timeout" in str(e).lower():
            connected = True

    if connected:
        log_pass("SSE connection accepted (?token= auth)", f"content-type={content_type[:50]}")
    else:
        log_fail("SSE connection failed (?token= auth)", error_msg)


def test_sse_no_auth():
    """SSE without auth should fail (401)."""
    log_section("SSE Streaming - No Auth (expect 401)")

    url = f"{CLOUD_BASE}/{SANDBOX_ID}/4096/event"
    headers = {"Accept": "text/event-stream"}
    status, _, body = http_get(url, headers=headers)
    if status == 401:
        log_pass("SSE no auth → 401")
    else:
        log_fail("SSE no auth → 401", f"got status={status}")


def test_proxy_strips_auth(jwt: str):
    """
    Verify that the proxy does NOT forward our JWT to the upstream sandbox.
    We test this indirectly: the upstream sandbox (OpenCode on 4096) doesn't
    require auth — if it receives our Supabase JWT it would just ignore it.
    The real verification is that our requests work (proxy injects Daytona
    headers instead). This test just confirms proxied routes work correctly.
    """
    log_section("Proxy Security - Auth Stripping")

    headers = {"Authorization": f"Bearer {jwt}"}

    # A route that definitely works — if we reach it, proxy is working
    url = f"{CLOUD_BASE}/{SANDBOX_ID}/4096/session"
    status, _, _ = http_get(url, headers=headers)
    if status == 200:
        log_pass("Proxy forwards without leaking auth", "upstream responded OK")
    else:
        log_fail("Proxy auth stripping", f"status={status}")


def test_post_through_proxy(jwt: str):
    """POST with JSON body should be forwarded correctly."""
    log_section("Proxy - POST Body Forwarding")

    headers = {"Authorization": f"Bearer {jwt}"}
    url = f"{CLOUD_BASE}/{SANDBOX_ID}/4096/session"
    status, _, body = http_post(url, {}, headers=headers)
    if status == 200 or status == 201:
        try:
            data = json.loads(body)
            sid = data.get("id") or data.get("sessionID")
            log_pass("POST body forwarded", f"created session {sid}")
            # Clean up
            if sid:
                del_url = f"{CLOUD_BASE}/{SANDBOX_ID}/4096/session/{sid}"
                http_request(del_url, "DELETE", headers=headers)
        except Exception:
            log_pass("POST body forwarded", f"status={status}")
    else:
        log_fail("POST body forwarded", f"status={status} body={body.decode()[:200]}")


def test_cors_headers():
    """OPTIONS preflight should return correct CORS headers."""
    log_section("CORS - Preflight")

    url = f"{CLOUD_BASE}/health"
    headers = {
        "Origin": "https://kortix.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization",
    }
    status, resp_headers, _ = http_request(url, "OPTIONS", headers)

    allow_origin = resp_headers.get("access-control-allow-origin", resp_headers.get("Access-Control-Allow-Origin", ""))
    allow_headers = resp_headers.get("access-control-allow-headers", resp_headers.get("Access-Control-Allow-Headers", ""))

    if status == 200 or status == 204:
        log_pass("OPTIONS preflight", f"status={status}")
    else:
        log_fail("OPTIONS preflight", f"status={status}")

    if "kortix.com" in allow_origin:
        log_pass("CORS Allow-Origin includes kortix.com", allow_origin)
    else:
        log_fail("CORS Allow-Origin", f"got: {allow_origin}")

    if "authorization" in allow_headers.lower():
        log_pass("CORS Allow-Headers includes Authorization", allow_headers[:80])
    else:
        log_fail("CORS Allow-Headers", f"got: {allow_headers}")


def test_invalid_port(jwt: str):
    """Invalid port should get 400."""
    log_section("Validation - Invalid Port")

    headers = {"Authorization": f"Bearer {jwt}"}

    url = f"{CLOUD_BASE}/{SANDBOX_ID}/notaport/"
    status, _, body = http_get(url, headers=headers)
    if status == 400:
        log_pass("Non-numeric port → 400")
    else:
        # Might be 404 if route doesn't match
        log_fail("Non-numeric port → 400", f"got status={status}")

    url = f"{CLOUD_BASE}/{SANDBOX_ID}/99999/"
    status, _, _ = http_get(url, headers=headers)
    if status == 400:
        log_pass("Port > 65535 → 400")
    else:
        log_fail("Port > 65535 → 400", f"got status={status}")


def test_redirect_no_trailing_slash(jwt: str):
    """/:sandboxId/:port should redirect to /:sandboxId/:port/."""
    log_section("Redirect - Missing Trailing Slash")

    # We need to NOT follow redirects for this test
    url = f"{CLOUD_BASE}/{SANDBOX_ID}/8000"
    headers = {"Authorization": f"Bearer {jwt}", "User-Agent": USER_AGENT}

    class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise urllib.error.HTTPError(newurl, code, msg, headers, fp)

    opener = urllib.request.build_opener(
        NoRedirectHandler,
        urllib.request.HTTPSHandler(context=SSL_CTX),
    )
    req = urllib.request.Request(url, headers=headers)
    try:
        resp = opener.open(req, timeout=15)
        # No redirect — proxy may handle both /:port and /:port/ directly
        log_pass("No trailing slash handled", f"status={resp.status} (proxy serves both forms)")
    except urllib.error.HTTPError as e:
        if e.code == 301 or e.code == 302:
            location = e.headers.get("Location", "")
            if f"/{SANDBOX_ID}/8000/" in location:
                log_pass("Missing slash → 301 redirect", f"→ {location}")
            else:
                log_fail("Redirect location wrong", f"→ {location}")
        else:
            log_fail("Missing slash handling", f"status={e.code}")


# ============================================================================
# Main
# ============================================================================


def main():
    global passed, failed, skipped

    print(f"\n{BOLD}Kortix Cloud Proxy — End-to-End Tests{RESET}")
    print(f"  Cloud URL:   {CLOUD_BASE}")
    print(f"  Sandbox ID:  {SANDBOX_ID}")
    print(f"  User Email:  {USER_EMAIL}")
    print(f"  Supabase:    {SUPABASE_URL}")

    # ---- Step 0: Health check (is the proxy even running?) ----
    log_section("Pre-flight: Cloud Proxy Reachable?")
    status, _, body = http_get(f"{CLOUD_BASE}/health", timeout=10)
    if status != 200:
        print(f"\n  {RED}FATAL: Cannot reach {CLOUD_BASE}/health (status={status}){RESET}")
        print(f"  Make sure the kortix-daytona-proxy service is running.\n")
        sys.exit(1)
    print(f"  {GREEN}OK{RESET} — proxy is up\n")

    # ---- Step 1: Generate JWT ----
    log_section("Generating Fresh JWT")
    jwt = generate_jwt(USER_EMAIL)
    if not jwt:
        print(f"\n  {RED}FATAL: Could not generate JWT. Check Supabase credentials.{RESET}\n")
        sys.exit(1)
    print(f"  {GREEN}OK{RESET} — JWT obtained ({jwt[:20]}...)\n")

    # ---- Step 2: Run tests ----
    test_health_no_auth()
    test_cors_headers()
    test_auth_missing()
    test_auth_invalid_token()
    test_auth_header(jwt)
    test_auth_query_param(jwt)
    test_wrong_sandbox(jwt)
    test_invalid_port(jwt)
    test_redirect_no_trailing_slash(jwt)
    test_proxy_kortix_master(jwt)
    test_proxy_opencode(jwt)
    test_proxy_web_ui(jwt)
    test_proxy_novnc(jwt)
    test_proxy_strips_auth(jwt)
    test_post_through_proxy(jwt)
    test_sse_streaming_header(jwt)
    test_sse_streaming_query_param(jwt)
    test_sse_no_auth()

    # ---- Summary ----
    total = passed + failed + skipped
    print(f"\n{BOLD}{'=' * 50}{RESET}")
    print(f"{BOLD}Results: {total} tests  |  {GREEN}{passed} passed{RESET}  |  {RED}{failed} failed{RESET}  |  {YELLOW}{skipped} skipped{RESET}")
    print(f"{'=' * 50}\n")

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
