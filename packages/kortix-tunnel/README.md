# @kortix/tunnel

Local agent CLI that bridges your machine to Kortix cloud sandboxes via a secure reverse-tunnel.

## Quick Start

```bash
npx @kortix/tunnel connect \
  --tunnel-id <id> \
  --token <token> \
  --api-url <url>
```

The connect command is generated for you in the Kortix dashboard when you create a new tunnel connection.

## Commands

| Command | Description |
|---------|-------------|
| `connect` | Connect and start handling RPC requests |
| `status` | Check tunnel connection status |
| `permissions` | List active permissions for this tunnel |
| `help` | Show help |

## Options

| Flag | Env Variable | Description |
|------|-------------|-------------|
| `--token` | `KORTIX_TUNNEL_TOKEN` | API token |
| `--tunnel-id` | `KORTIX_TUNNEL_ID` | Tunnel ID |
| `--api-url` | `KORTIX_API_URL` | API URL (default: `http://localhost:8008`) |

Config can also be stored in `~/.kortix-tunnel/config.json`.

## Capabilities

Once connected, the tunnel agent exposes three capability sets to the cloud sandbox:

- **Filesystem** -- read/write files on your local machine
- **Shell** -- execute commands locally
- **Desktop** -- screenshots, mouse/keyboard control, accessibility tree, window management

All operations are permission-gated and HMAC-signed.

## Requirements

- Node.js >= 22.0.0
