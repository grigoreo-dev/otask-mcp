# otask-mcp-server

[MCP server](https://modelcontextprotocol.io) and HTTP proxy for [O!task API](https://api.otask.ru/docs).

## Modes

| Mode | Entry | Auth |
|------|-------|------|
| MCP (stdio) | `pnpm start` | `OTASK_AUTH_KEY` or `OTASK_EMAIL` + `OTASK_PASSWORD` |
| HTTP proxy | `pnpm start:http` | `AUTH_TOKEN` only — transparent pass-through to `api.otask.ru` |

## HTTP proxy

Transparent reverse proxy: same paths, methods, bodies, and response as O!task API.

```bash
AUTH_TOKEN=your-otask-bearer-token PORT=3847 pnpm start:http
```

```bash
curl -sS \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Accept: application/json" \
  "http://localhost:3847/api/v1/ws/{ws_slug}/tasks/{task_slug}"
```

- Forwards `GET|POST|PUT|PATCH|DELETE|HEAD` on `/api/*` → `https://api.otask.ru/api/*`
- Client must send `Authorization: Bearer <AUTH_TOKEN>` (same token used upstream)
- `GET /health` — liveness check (no auth)

## MCP tools

| Tool | Method | Description |
|------|--------|-------------|
| `otask_get_task` | `GET /api/v1/ws/{ws_slug}/tasks/{task_slug}` | Fetch task by slug |
| `otask_update_task` | `POST .../tasks/{task_slug}/update` | Update task (partial fields; merges with current state) |

## Authentication

Set **one** of:

| Env | Description |
|-----|-------------|
| `OTASK_AUTH_KEY` | Static Bearer token |
| `OTASK_EMAIL` + `OTASK_PASSWORD` | Login via `POST /api/v1/auth/login` (token cached in memory) |

## Development

```bash
pnpm install
pnpm build
pnpm start
```

## Cursor / OpenCode

Configured in workspace `.cursor/mcp.json` and `opencode.json`. Credentials live in root `.env`.

## Slugs

From a task URL like `https://panel.otask.ru/ws/{ws_slug}/tasks/{task_slug}` — use those UUIDs as `ws_slug` and `task_slug`.
