# Integrations

Use this file when connecting third-party apps or explaining how OAuth-backed integration tools work.

## Architecture

The integration surface connects sandbox tools to third-party APIs through Kortix Master, the Kortix API, and Pipedream.

```text
Agent tool -> Kortix Master (/api/integrations/*) -> Kortix API -> Pipedream -> third-party app
```

## Tool Surface

| Tool | Purpose | When to Use |
|---|---|---|
| `integration-list` | List connected apps | Check what is already linked |
| `integration-search` | Search app slugs | Find the correct app name |
| `integration-connect` | Generate OAuth URL | Ask the user to authorize an app |
| `integration-actions` | Discover app actions | Find valid action keys and props |
| `integration-run` | Run a structured action | Execute supported app actions |
| `integration-exec` | Run custom Node.js code | Use `proxyFetch()` for advanced API calls |
| `integration-request` | Raw authenticated HTTP request | Direct calls with auto-injected auth |

## Basic Workflow

1. Check current connections with `integration-list`
2. Search for the app slug if needed with `integration-search`
3. Generate the connect URL with `integration-connect`
4. Discover actions with `integration-actions`
5. Execute with `integration-run`

## Custom API Calls

For `integration-exec`, use `proxyFetch()` instead of raw `fetch()` so OAuth credentials are injected automatically.

```javascript
const res = await proxyFetch('https://gmail.googleapis.com/gmail/v1/users/me/labels')
const data = await res.json()
console.log(data)
```

Never manually set Authorization headers for these proxied calls.
