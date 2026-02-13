#!/usr/bin/env python3
"""
Session Transcript Export for Kortix Memory System

Converts OpenCode session JSON files into Markdown files that can be
indexed by LSS (Local Semantic Search) for semantic memory retrieval.

Mirrors OpenClaw's experimental session memory indexing:
- Reads session JSON from OpenCode storage
- Filters to user/assistant messages (skips tool calls)
- Converts to Markdown with timestamps and metadata
- Writes to workspace/.kortix/sessions/ for LSS indexing
- Delta detection: only exports new/modified sessions

Usage:
    python3 export-sessions.py                    # Export all new sessions
    python3 export-sessions.py --force            # Re-export everything
    python3 export-sessions.py --session <id>     # Export specific session
    python3 export-sessions.py --since 2025-01-01 # Export since date
"""

import json
import os
import sys
import hashlib
import glob
import argparse
from datetime import datetime, timezone
from pathlib import Path


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OPENCODE_STORAGE = os.path.expanduser("~/.local/share/opencode/storage")

# Default output — /workspace/.kortix/sessions in sandbox, overridable via --output
_default_sessions = "/workspace/.kortix/sessions"
if not os.path.isdir("/workspace"):
    # Not in sandbox — use a local fallback
    _default_sessions = os.path.expanduser("~/.kortix/sessions")
KORTIX_SESSIONS = os.environ.get("KORTIX_SESSIONS_DIR", _default_sessions)
EXPORT_STATE_FILE = os.path.join(KORTIX_SESSIONS, ".export-state.json")

# Roles to include in export (skip system, tool results)
INCLUDE_ROLES = {"user", "assistant"}

# Maximum content length per message part (truncate very long outputs)
MAX_PART_LENGTH = 5000

# Minimum session length to export (skip trivial sessions)
MIN_MESSAGES = 2


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_export_state() -> dict:
    """Load the export state tracking file."""
    try:
        with open(EXPORT_STATE_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"exported": {}, "last_run": None}


def save_export_state(state: dict):
    """Save the export state tracking file."""
    os.makedirs(os.path.dirname(EXPORT_STATE_FILE), exist_ok=True)
    state["last_run"] = datetime.now(timezone.utc).isoformat()
    with open(EXPORT_STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def content_hash(content: str) -> str:
    """Generate a content hash for change detection."""
    return hashlib.md5(content.encode("utf-8")).hexdigest()


def safe_read_json(path: str) -> dict | None:
    """Safely read a JSON file, returning None on error."""
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, PermissionError):
        return None


def format_timestamp(ts: int | float | None) -> str:
    """Convert a millisecond timestamp to ISO format."""
    if not ts:
        return "unknown"
    try:
        dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        return dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    except (ValueError, OverflowError, OSError):
        return "unknown"


def format_date(ts: int | float | None) -> str:
    """Convert a millisecond timestamp to date string."""
    if not ts:
        return "unknown"
    try:
        dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        return dt.strftime("%Y-%m-%d")
    except (ValueError, OverflowError, OSError):
        return "unknown"


# ---------------------------------------------------------------------------
# Session Discovery
# ---------------------------------------------------------------------------

def discover_sessions() -> list[dict]:
    """Discover all session files in OpenCode storage."""
    sessions = []
    session_dir = os.path.join(OPENCODE_STORAGE, "session", "global")

    if not os.path.isdir(session_dir):
        return sessions

    for filename in os.listdir(session_dir):
        if not filename.endswith(".json"):
            continue

        session_path = os.path.join(session_dir, filename)
        session = safe_read_json(session_path)
        if session:
            session["_path"] = session_path
            sessions.append(session)

    return sessions


def load_session_messages(session_id: str) -> list[dict]:
    """Load all messages for a session, sorted by ID."""
    messages = []
    msg_dir = os.path.join(OPENCODE_STORAGE, "message", session_id)

    if not os.path.isdir(msg_dir):
        return messages

    for filename in os.listdir(msg_dir):
        if not filename.endswith(".json"):
            continue

        msg_path = os.path.join(msg_dir, filename)
        msg = safe_read_json(msg_path)
        if msg:
            msg["_path"] = msg_path
            messages.append(msg)

    # Sort by message ID (which is time-ordered in OpenCode)
    messages.sort(key=lambda m: m.get("id", ""))
    return messages


def load_message_parts(message_id: str) -> list[dict]:
    """Load all parts for a message, sorted by ID."""
    parts = []
    part_dir = os.path.join(OPENCODE_STORAGE, "part", message_id)

    if not os.path.isdir(part_dir):
        return parts

    for filename in os.listdir(part_dir):
        if not filename.endswith(".json"):
            continue

        part_path = os.path.join(part_dir, filename)
        part = safe_read_json(part_path)
        if part:
            parts.append(part)

    parts.sort(key=lambda p: p.get("id", ""))
    return parts


# ---------------------------------------------------------------------------
# Markdown Conversion
# ---------------------------------------------------------------------------

def extract_text_from_parts(parts: list[dict]) -> str:
    """Extract readable text content from message parts."""
    texts = []

    for part in parts:
        ptype = part.get("type", "")

        if ptype == "text":
            text = part.get("text", "")
            if text and text.strip():
                # Truncate very long text parts
                if len(text) > MAX_PART_LENGTH:
                    text = text[:MAX_PART_LENGTH] + "\n\n[... truncated ...]"
                texts.append(text.strip())

        elif ptype == "tool":
            # Include tool name but skip full output (too verbose)
            tool_name = part.get("tool", "unknown")
            state = part.get("state", {})
            status = state.get("status", "unknown")
            texts.append(f"[Tool: {tool_name} — {status}]")

    return "\n\n".join(texts)


def session_to_markdown(session: dict, messages: list[dict]) -> str:
    """Convert a session with its messages to Markdown format."""
    lines = []

    # Header
    title = session.get("title", "Untitled Session")
    session_id = session.get("id", "unknown")
    created = format_timestamp(session.get("time", {}).get("created"))
    date = format_date(session.get("time", {}).get("created"))

    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"**Session:** {session_id}")
    lines.append(f"**Date:** {date}")
    lines.append(f"**Created:** {created}")
    lines.append("")
    lines.append("---")
    lines.append("")

    # Messages
    for msg in messages:
        role = msg.get("role", "unknown")

        # Only include user and assistant messages
        if role not in INCLUDE_ROLES:
            continue

        # Skip compaction/summary messages
        if msg.get("summary"):
            continue

        # Load parts for this message
        parts = load_message_parts(msg.get("id", ""))
        text = extract_text_from_parts(parts)

        if not text.strip():
            continue

        timestamp = format_timestamp(msg.get("time", {}).get("created"))
        role_label = "User" if role == "user" else "Assistant"

        lines.append(f"## {role_label} ({timestamp})")
        lines.append("")
        lines.append(text)
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Export Logic
# ---------------------------------------------------------------------------

def export_session(
    session: dict,
    state: dict,
    force: bool = False,
) -> bool:
    """Export a single session to Markdown. Returns True if exported."""
    session_id = session.get("id", "")
    if not session_id:
        return False

    # Load messages
    messages = load_session_messages(session_id)

    # Skip trivial sessions
    user_msgs = [m for m in messages if m.get("role") in INCLUDE_ROLES]
    if len(user_msgs) < MIN_MESSAGES:
        return False

    # Convert to Markdown
    markdown = session_to_markdown(session, messages)
    if not markdown.strip():
        return False

    # Check for changes (delta detection)
    new_hash = content_hash(markdown)
    if not force and state["exported"].get(session_id) == new_hash:
        return False

    # Determine output filename
    date = format_date(session.get("time", {}).get("created"))
    title = session.get("title", "untitled")
    # Sanitize title for filename
    safe_title = "".join(
        c if c.isalnum() or c in "-_ " else "" for c in title
    )[:60].strip().replace(" ", "-").lower()
    filename = f"{date}-{safe_title}-{session_id[-8:]}.md"
    output_path = os.path.join(KORTIX_SESSIONS, filename)

    # Write
    os.makedirs(KORTIX_SESSIONS, exist_ok=True)
    with open(output_path, "w") as f:
        f.write(markdown)

    # Update state
    state["exported"][session_id] = new_hash
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Export OpenCode sessions to Markdown for LSS indexing"
    )
    parser.add_argument(
        "--force", action="store_true", help="Re-export all sessions"
    )
    parser.add_argument(
        "--session", type=str, help="Export a specific session ID"
    )
    parser.add_argument(
        "--since", type=str, help="Export sessions since date (YYYY-MM-DD)"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Show what would be exported"
    )
    parser.add_argument(
        "--output", type=str, help="Output directory for exported sessions"
    )
    args = parser.parse_args()

    # Override output directory if specified
    global KORTIX_SESSIONS, EXPORT_STATE_FILE
    if args.output:
        KORTIX_SESSIONS = args.output
        EXPORT_STATE_FILE = os.path.join(KORTIX_SESSIONS, ".export-state.json")

    # Load state
    state = load_export_state()
    if args.force:
        state["exported"] = {}

    # Discover sessions
    sessions = discover_sessions()
    if not sessions:
        print("No sessions found in OpenCode storage.")
        print(f"  Expected at: {OPENCODE_STORAGE}/session/global/")
        return

    # Filter by date if specified
    if args.since:
        try:
            since_dt = datetime.strptime(args.since, "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
            since_ms = since_dt.timestamp() * 1000
            sessions = [
                s
                for s in sessions
                if (s.get("time", {}).get("created", 0) or 0) >= since_ms
            ]
        except ValueError:
            print(f"Invalid date format: {args.since}. Use YYYY-MM-DD.")
            sys.exit(1)

    # Filter by specific session
    if args.session:
        sessions = [s for s in sessions if s.get("id") == args.session]
        if not sessions:
            print(f"Session not found: {args.session}")
            sys.exit(1)

    # Export
    exported = 0
    skipped = 0

    for session in sessions:
        session_id = session.get("id", "unknown")
        title = session.get("title", "untitled")

        if args.dry_run:
            is_new = session_id not in state["exported"]
            status = "NEW" if is_new else "unchanged"
            print(f"  [{status}] {session_id[:12]}... — {title}")
            if is_new:
                exported += 1
            else:
                skipped += 1
            continue

        if export_session(session, state, force=args.force):
            exported += 1
            print(f"  Exported: {title} ({session_id[:12]}...)")
        else:
            skipped += 1

    # Save state
    if not args.dry_run:
        save_export_state(state)

    print(f"\nDone. Exported: {exported}, Skipped: {skipped}, Total: {len(sessions)}")
    if exported > 0 and not args.dry_run:
        print(f"Session transcripts written to: {KORTIX_SESSIONS}")
        print("LSS will auto-index these files for semantic search.")


if __name__ == "__main__":
    main()
