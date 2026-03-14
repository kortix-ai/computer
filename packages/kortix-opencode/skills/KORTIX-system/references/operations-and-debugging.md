# Operations and Debugging

Use this file when checking health, inspecting services, understanding boot scripts, or working with local Docker development.

## Commands

Slash commands are discovered from `/opt/opencode/commands/`.

| Command | File | Purpose |
|---|---|---|
| `/onboarding` | `onboarding.md` | first-run flow that researches the user, builds a profile, demos capabilities, and unlocks the dashboard |

## Init Scripts

| Order | File | Purpose |
|---|---|---|
| 95 | `95-setup-sshd` | SSH daemon, remote-editor wrapper, shell config |
| 96 | `96-fix-bun-pty` | patches bun-pty shared libraries |
| 97 | `97-secrets-to-s6-env` | syncs encrypted secrets into s6 env |
| 98 | `98-kortix-env` | applies crash-protection env guards |
| 99 | `99-restore-packages` | restores apk packages and persistent PATH entries |

## Health and Service Checks

```bash
ps aux | grep -E "(opencode|kortix-master|lss-sync|bun)"
ls /run/service/
curl http://localhost:8000/kortix/health
curl http://localhost:8000/lss/status
```

To restart OpenCode serve manually, kill the process and let `s6` bring it back:

```bash
kill $(pgrep -f "opencode serve")
```

## Common Issues

| Problem | Fix |
|---|---|
| `opencode` not found | ensure PATH includes `/opt/bun/bin:/usr/local/bin:/usr/bin:/bin` |
| bun-pty segfaults | verify `BUN_PTY_LIB` and rerun `96-fix-bun-pty` logic |
| secrets not visible | set through `localhost:8000/env` with `restart: true` |
| cloud SDK calls fail | verify `KORTIX_API_URL` |
| integration tools fail | verify `KORTIX_TOKEN` and the app connection state |

## Docker Development

```bash
docker compose -f sandbox/docker/docker-compose.yml up --build -d
docker compose -f sandbox/docker/docker-compose.yml logs -f
docker exec -it kortix-sandbox bash
docker exec -it -u abc kortix-sandbox bash
```

### Volume model

| Volume | Mount | Purpose |
|---|---|---|
| `sandbox_data` | `/workspace` + `/config` | persistent user and runtime data |

### Resource notes

- `shm_size: 2gb` for Chromium
- `cap_add: SYS_ADMIN` for PID namespace behavior
- `security_opt: seccomp=unconfined` for Chromium sandbox compatibility
