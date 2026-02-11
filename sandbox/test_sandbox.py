import asyncio
import json
import os
from daytona_sdk import AsyncDaytona, DaytonaConfig, CreateSandboxFromSnapshotParams

SNAPSHOT = "kortix-sandbox-v0.3.0"

# Load from environment or sandbox/.env
DAYTONA_API_KEY = os.environ.get("DAYTONA_API_KEY", "")
KORTIX_API_URL = os.environ.get("KORTIX_API_URL", "")
KORTIX_TOKEN = os.environ.get("KORTIX_TOKEN", "")


async def main():
    if not DAYTONA_API_KEY:
        print("ERROR: DAYTONA_API_KEY not set. Export it or add to sandbox/.env")
        return

    config = DaytonaConfig(api_key=DAYTONA_API_KEY)
    daytona = AsyncDaytona(config)

    print(f"Creating sandbox with {SNAPSHOT}...")
    print(f"KORTIX_API_URL: {KORTIX_API_URL or '(not set)'}")
    print(f"KORTIX_TOKEN: {KORTIX_TOKEN[:10]}..." if KORTIX_TOKEN else "KORTIX_TOKEN: (not set)")

    params = CreateSandboxFromSnapshotParams(
        snapshot=SNAPSHOT,
        public=True,
        env_vars={
            "OPENCODE_SERVER_USERNAME": "opencode",
            "OPENCODE_SERVER_PASSWORD": "testpass123",
            "KORTIX_API_URL": KORTIX_API_URL,
            "KORTIX_TOKEN": KORTIX_TOKEN,
            "ENV_MODE": "cloud",
        },
        auto_stop_interval=15,
        auto_archive_interval=30,
    )

    sandbox = await daytona.create(params, timeout=300)
    print(f"Sandbox ID: {sandbox.id}")

    # s6-overlay starts all services automatically — no need to launch supervisord.
    # Just wait for them to come up.
    print("Waiting 20s for s6 services to start...")
    await asyncio.sleep(20)

    print("\n--- s6 services ---")
    result = await sandbox.process.exec("ls /etc/services.d/")
    print(result.result)

    print("\n--- OpenCode config (checking kortix provider) ---")
    result = await sandbox.process.exec("cat /opt/opencode/opencode.jsonc 2>/dev/null || echo 'Config not found'")
    print(result.result)

    print("\n--- Environment check ---")
    result = await sandbox.process.exec(
        "echo 'KORTIX_API_URL:' $KORTIX_API_URL && echo 'ENV_MODE:' $ENV_MODE"
    )
    print(result.result)

    print("\n--- Health check (Kortix Master) ---")
    result = await sandbox.process.exec("curl -s http://localhost:8000/kortix/health")
    print(result.result)

    print("\n--- Health check (OpenCode via proxy) ---")
    result = await sandbox.process.exec(
        "curl -s -u opencode:testpass123 http://localhost:8000/global/health"
    )
    print(result.result)

    print("\n--- Health check (OpenCode direct) ---")
    result = await sandbox.process.exec(
        "curl -s -u opencode:testpass123 http://localhost:4096/global/health"
    )
    print(result.result)

    print("\n--- Test LLM via OpenCode API ---")
    result = await sandbox.process.exec(
        """curl -s -X POST -u opencode:testpass123 http://localhost:4096/sessions """
        """-H 'Content-Type: application/json' """
        """-d '{"title": "test"}'"""
    )
    print(f"Create session: {result.result}")

    try:
        session_data = json.loads(result.result)
        session_id = session_data.get("id", session_data.get("session_id"))
        if session_id:
            print(f"\nSession created: {session_id}")

            print("\n--- Sending message to test LLM ---")
            result = await sandbox.process.exec(
                f"""curl -s -X POST -u opencode:testpass123 """
                f"""'http://localhost:4096/sessions/{session_id}/message' """
                f"""-H 'Content-Type: application/json' """
                f"""-d '{{"content": "Say hello in exactly 5 words"}}'"""
            )
            print(f"LLM Response: {result.result[:500]}...")
    except Exception:
        print("Could not parse session response")

    link = await sandbox.get_preview_link(8000)
    print(f"\n=== SANDBOX READY ===")
    print(f"Kortix Master URL: {link.url}")
    print(f"Sandbox ID: {sandbox.id}")
    print(
        f"\nTo connect: opencode client --url {link.url} --username opencode --password testpass123"
    )


asyncio.run(main())
