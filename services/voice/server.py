"""OpenAI-compatible proxy that connects VAPI to OpenCode.

VAPI sends standard /chat/completions requests with conversation history.
We forward the latest user message to OpenCode via the kortix-proxy agent,
stream back text deltas in OpenAI SSE format.

Architecture:
    VAPI (STT + endpointing + TTS) → /chat/completions → this server → OpenCode

Key design:
    - Persistent SSE connection to OpenCode's /event stream (never miss events)
    - Deduplication: skip requests where the user message hasn't meaningfully changed
    - Only abort OpenCode if the user sends a genuinely NEW message mid-response

Usage:
    cd voice && pip install -r requirements.txt && python server.py
"""

import asyncio
import json
import logging
import os
import time
import uuid

import httpx
from dotenv import load_dotenv
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, StreamingResponse

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("voice")

OPENCODE_URL = os.getenv("OPENCODE_URL", "http://localhost:3111")
PORT = int(os.getenv("PORT", "8765"))
AGENT = os.getenv("VOICE_AGENT", "kortix-proxy")

app = FastAPI()

# ── State ────────────────────────────────────────────────────────────────────

_session_id: str | None = None
_http = httpx.AsyncClient(base_url=OPENCODE_URL, timeout=httpx.Timeout(30, connect=10))

# Generation tracking for interrupt handling
_current_generation: int = 0
_generation_lock = asyncio.Lock()

# Deduplication
_last_sent_message: str = ""
_is_responding: bool = False

# Persistent SSE: a single subscriber that dispatches to the active generation
_active_queue: asyncio.Queue | None = None
_sse_task: asyncio.Task | None = None


async def get_session() -> str:
    """Get or create the persistent proxy session."""
    global _session_id
    if _session_id is not None:
        return _session_id
    r = await _http.post("/session", json={"title": "Voice Proxy"})
    r.raise_for_status()
    sid: str = r.json()["id"]
    _session_id = sid
    log.info(f"Created proxy session: {sid}")
    return sid


# ── Persistent SSE watcher ───────────────────────────────────────────────────

async def _run_persistent_sse():
    """Maintain a persistent SSE connection to OpenCode.

    Dispatches events to whatever generation is currently active via _active_queue.
    Reconnects automatically on disconnect.
    """
    global _active_queue

    while True:
        try:
            session_id = await get_session()
            log.info("SSE: connecting...")
            async with httpx.AsyncClient(base_url=OPENCODE_URL) as sse_client:
                async with sse_client.stream(
                    "GET", "/event", timeout=httpx.Timeout(None, connect=10)
                ) as resp:
                    log.info("SSE: connected")
                    assistant_msg_ids: set[str] = set()
                    buffer = ""

                    async for raw in resp.aiter_text():
                        buffer += raw

                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line.startswith("data:"):
                                continue
                            data_str = line[5:].strip()
                            if not data_str:
                                continue
                            try:
                                data = json.loads(data_str)
                            except json.JSONDecodeError:
                                continue

                            evt = data.get("type", "")
                            props = data.get("properties", {})

                            # Filter to our proxy session
                            sid = (
                                props.get("sessionID")
                                or props.get("part", {}).get("sessionID")
                                or props.get("info", {}).get("sessionID")
                            )
                            if sid and sid != session_id:
                                continue

                            # Track assistant message IDs
                            if evt == "message.updated":
                                info = props.get("info", {})
                                if info.get("role") == "assistant":
                                    assistant_msg_ids.add(info.get("id", ""))

                            # Forward text deltas to the active queue
                            if evt == "message.part.updated":
                                part = props.get("part", {})
                                delta = props.get("delta", "")
                                msg_id = part.get("messageID", "")

                                if msg_id and msg_id not in assistant_msg_ids:
                                    continue

                                if part.get("type") == "text" and delta and _active_queue:
                                    await _active_queue.put(("text", delta))

                            # Session went busy — forward so consumer knows prompt started
                            if evt == "session.status" and _active_queue:
                                status_type = props.get("status", {}).get("type", "")
                                if status_type == "busy":
                                    await _active_queue.put(("busy", None))

                            # Session went idle — signal completion
                            if evt == "session.idle" and _active_queue:
                                await _active_queue.put(("done", None))

                            # Session error
                            if evt == "session.error" and _active_queue:
                                err = props.get("error", {}).get("data", {}).get("message", "unknown error")
                                log.error(f"SSE: session error: {err}")
                                await _active_queue.put(("done", None))

        except Exception as e:
            log.warning(f"SSE: disconnected ({e}), reconnecting in 1s...")
            await asyncio.sleep(1)


def ensure_sse_running():
    """Start the persistent SSE watcher if not already running."""
    global _sse_task
    if _sse_task is None or _sse_task.done():
        _sse_task = asyncio.create_task(_run_persistent_sse())


# ── OpenAI SSE format ────────────────────────────────────────────────────────

def sse_chunk(content: str, chat_id: str, role: str | None = None) -> str:
    delta = {}
    if role:
        delta["role"] = role
    if content:
        delta["content"] = content
    obj = {
        "id": chat_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": "opencode",
        "choices": [{"index": 0, "delta": delta, "finish_reason": None}],
    }
    return f"data: {json.dumps(obj)}\n\n"


def sse_done(chat_id: str) -> str:
    obj = {
        "id": chat_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": "opencode",
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }
    return f"data: {json.dumps(obj)}\n\ndata: [DONE]\n\n"


def is_duplicate_message(new_msg: str, old_msg: str) -> bool:
    """Check if the new message is effectively the same as what we already sent."""
    if not old_msg:
        return False
    new_clean = new_msg.strip().lower()
    old_clean = old_msg.strip().lower()
    if new_clean == old_clean:
        return True
    # New message is the old message plus trailing noise
    if new_clean.startswith(old_clean):
        added = new_clean[len(old_clean):].strip()
        if len(added) < 10:
            return True
    return False


# ── Core: stream proxy response ─────────────────────────────────────────────

async def stream_opencode(user_message: str, my_generation: int):
    """Send prompt to proxy agent, stream text deltas back."""
    global _last_sent_message, _is_responding, _active_queue

    chat_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    session_id = await get_session()
    ensure_sse_running()

    yield sse_chunk("", chat_id, role="assistant")

    # ── Deduplication ──────────────────────────────────────────────
    if _is_responding and is_duplicate_message(user_message, _last_sent_message):
        log.info(f"[gen={my_generation}] Duplicate — skipping: {user_message[:80]}")
        yield sse_done(chat_id)
        return

    # ── Abort if session is busy with a different message ─────────
    try:
        status_r = await _http.get("/session/status")
        statuses = status_r.json() if status_r.status_code == 200 else {}
        if session_id in statuses:
            log.info(f"[gen={my_generation}] Session busy — aborting for new message")
            await _http.post(f"/session/{session_id}/abort")
            await asyncio.sleep(0.3)
    except Exception:
        pass

    # Check if superseded
    if _current_generation != my_generation:
        log.info(f"[gen={my_generation}] Superseded")
        yield sse_done(chat_id)
        return

    # ── Set up our queue to receive events from the persistent SSE ─
    my_queue: asyncio.Queue = asyncio.Queue()
    _active_queue = my_queue
    _last_sent_message = user_message
    _is_responding = True

    # Drain any stale events from before we took over the queue.
    # The persistent SSE may have buffered a "done" from the abort we just did.
    await asyncio.sleep(0.05)
    while not my_queue.empty():
        try:
            stale = my_queue.get_nowait()
            log.info(f"[gen={my_generation}] Drained stale event: {stale[0]}")
        except asyncio.QueueEmpty:
            break

    # Send the prompt
    r = await _http.post(
        f"/session/{session_id}/prompt_async",
        json={
            "parts": [{"type": "text", "text": user_message}],
            "agent": AGENT,
        },
    )
    r.raise_for_status()
    log.info(f"[gen={my_generation}] Sent: {user_message[:120]}")

    # Stream chunks from our queue
    got_text = False
    saw_busy = False
    try:
        while True:
            try:
                event = await asyncio.wait_for(my_queue.get(), timeout=90)
            except asyncio.TimeoutError:
                log.warning(f"[gen={my_generation}] Timed out")
                yield sse_done(chat_id)
                return

            # Check if we've been superseded
            if _current_generation != my_generation:
                log.info(f"[gen={my_generation}] Interrupted — stopping stream")
                yield sse_done(chat_id)
                return

            evt_type, evt_data = event

            if evt_type == "busy":
                saw_busy = True
            elif evt_type == "text":
                got_text = True
                saw_busy = True  # text implies busy
                yield sse_chunk(evt_data, chat_id)
            elif evt_type == "done":
                # Only treat as real completion if we've seen our prompt start.
                # A stale "done" from a previous abort arrives before our
                # prompt's "busy" event — ignore it.
                if saw_busy or got_text:
                    yield sse_done(chat_id)
                    return
                else:
                    log.info(f"[gen={my_generation}] Ignoring stale done (no busy/text yet)")
    finally:
        _is_responding = False
        # Only clear the active queue if it's still ours
        if _active_queue is my_queue:
            _active_queue = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/chat/completions")
async def chat_completions(request: Request):
    global _current_generation

    body = await request.json()
    messages = body.get("messages", [])

    user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            user_msg = m.get("content", "")
            break
    if not user_msg:
        user_msg = "Hello"

    async with _generation_lock:
        _current_generation += 1
        my_generation = _current_generation

    return StreamingResponse(
        stream_opencode(user_msg, my_generation),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/")
async def index():
    p = Path(__file__).parent / "test.html"
    if p.exists():
        return FileResponse(p)
    return {"error": "test.html not found"}


@app.get("/health")
async def health():
    return {"status": "ok", "opencode": OPENCODE_URL, "agent": AGENT}


if __name__ == "__main__":
    import uvicorn

    print(f"Voice proxy → OpenCode at {OPENCODE_URL}")
    print(f"Agent: {AGENT}")
    print(f"Listening on http://0.0.0.0:{PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
