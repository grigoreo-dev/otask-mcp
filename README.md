# otask-mcp-server

[MCP server](https://modelcontextprotocol.io) for the [O!task API](https://api.otask.ru/docs). Exposes O!task workspace/task operations as MCP tools for agents (Cursor, OpenCode, n8n MCP Client Tool).

## Modes

| Mode | Command | How it is chosen | Client auth |
|------|---------|------------------|-------------|
| **stdio** | `bun start` | Local process; always uses server env credentials | No HTTP; set `OTASK_*` in env |
| **HTTP gateway** | `bun run start:http` | Any `OTASK_AUTH_KEY` **or** `OTASK_EMAIL`+`OTASK_PASSWORD` present | `Authorization: Bearer <MCP_AUTH_TOKEN>` |
| **HTTP passthrough** | `bun run start:http` | No `OTASK_*` credentials in env | `Authorization: Bearer <O!task token>` (forwarded to API) |

Detection is `hasServerOtaskCredentials()`: gateway if static key or email+password are set; otherwise passthrough. Check `GET /health` → `authMode: "gateway" | "passthrough"`.

stdio requires `OTASK_*` (fails at startup without them). Gateway HTTP requires `MCP_AUTH_TOKEN` when `OTASK_*` are set (fails at startup otherwise).

## Environment variables

| Variable | Used in | Required when | Purpose |
|----------|---------|---------------|---------|
| `OTASK_AUTH_KEY` | stdio, HTTP gateway | stdio **or** gateway (alt: email/password) | Static O!task Bearer used by the server |
| `OTASK_EMAIL` | stdio, HTTP gateway | with `OTASK_PASSWORD` as alt to key | Login to obtain token |
| `OTASK_PASSWORD` | stdio, HTTP gateway | with `OTASK_EMAIL` | Login password |
| `MCP_AUTH_TOKEN` | HTTP gateway | gateway mode | Shared secret clients must send; **not** an O!task token |
| `OTASK_ALLOWED_PROJECTS` | stdio, HTTP gateway | optional | Comma-separated project slugs and/or numeric IDs |
| `PORT` | HTTP | optional (default `3847`) | Listen port |
| `HOST` | HTTP | optional (default `0.0.0.0`) | Bind address |

## HTTP headers

| Header | Mode | Purpose |
|--------|------|---------|
| `Authorization: Bearer …` | gateway | Must equal `MCP_AUTH_TOKEN` |
| `Authorization: Bearer …` | passthrough | O!task API token; proxied on every API call |
| `X-Otask-Allowed-Projects` | **passthrough only** | Comma-separated slugs/IDs; ignored in gateway (use env instead) |

## Endpoints (HTTP)

| | |
|---|---|
| MCP | `POST`/`GET` `/mcp` (Streamable HTTP) |
| Health | `GET /health` → `{ ok, mode, authMode, projectGuard }` where `projectGuard` is `"env" \| "header" \| "off"` |

Example deploy: `https://otask-mcp.grigoreo.dev/mcp` (port `3847` in Docker).

## n8n examples

### Gateway (server holds O!task credentials)

Server env:

```env
OTASK_AUTH_KEY=...
MCP_AUTH_TOKEN=super-secret-mcp-token
OTASK_ALLOWED_PROJECTS=my-project,42
```

n8n **MCP Client Tool**:

- URL: `https://otask-mcp.example/mcp`
- Transport: **HTTP Streamable**
- Credential / header: `Authorization: Bearer super-secret-mcp-token`
- Do **not** send `X-Otask-Allowed-Projects` (allow-list comes from server env)

### Passthrough (client holds O!task token)

Server env: no `OTASK_AUTH_KEY` / `OTASK_EMAIL` / `OTASK_PASSWORD`.

n8n **MCP Client Tool**:

- URL: `https://otask-mcp.example/mcp`
- Transport: **HTTP Streamable**
- Credential / header: `Authorization: Bearer <same token as api.otask.ru>`
- Optional: `X-Otask-Allowed-Projects: eng-backlog,99`

### Stdio (Cursor / OpenCode)

```env
OTASK_AUTH_KEY=...
# or OTASK_EMAIL + OTASK_PASSWORD
OTASK_ALLOWED_PROJECTS=my-project
```

```bash
bun start
```

## Tools

Registered in `src/tools/registry.ts` (one-line intents for agents):

| Tool | Intent |
|------|--------|
| `otask_get_task` | Fetch one task by workspace + task slug (inspect fields before update) |
| `otask_update_task` | Patch an existing task (name, board, performers, tags, description, …) |
| `otask_list_projects` | List workspace projects (filtered by allow-list when set) |
| `otask_list_project_tasks` | List tasks in a project |
| `otask_list_board` | List boards/columns (statuses) for a project — discover `board_id` / `board_column_id` |
| `otask_list_members` | List workspace members (performer IDs for assignment) |
| `otask_list_tags` | List workspace tags for labeling |
| `otask_list_comments` | List comments on a task |
| `otask_add_comment` | Add a comment (optional `parent_id` for replies) |
| `otask_create_task` | Create a task (required: `ws_slug`, `project_id`, `name`, `board_id`, `board_column_id`, `end_at`) |
| `otask_move_task` | Move a task to another board column (status) |
| `otask_archive_task` | Archive a task |

When a project allow-list is active, project-scoped tools assert membership (or filter list results); empty allow-list = all projects allowed.

## Project allow-list

Format: comma-separated **slugs** and/or **numeric IDs** (whitespace trimmed). Empty / unset = off.

### Gateway / stdio — env

```env
OTASK_ALLOWED_PROJECTS=product-roadmap,eng-backlog,42
```

`GET /health` → `projectGuard: "env"` when non-empty.

### Passthrough — request header

```http
X-Otask-Allowed-Projects: product-roadmap,42
```

`GET /health` (with that header) → `projectGuard: "header"`. Gateway ignores this header and always uses `OTASK_ALLOWED_PROJECTS`.

## API docs snapshot

Regenerate the local API catalog from O!task HTML docs (Scribe):

```bash
bun run docs:parse
```

Writes under `docs/catalog/` from the live HTML docs page (or `bun run docs:parse --file path` for offline HTML).

## Development

```bash
bun install
bun run build          # tsc → dist/
bun test               # bun test
bun start              # stdio MCP
bun run start:http     # Streamable HTTP MCP
bun run dev            # stdio hot reload
bun run dev:http       # HTTP hot reload
```

### Adding a tool

1. `src/services/api.ts` / `client.ts` — API method if needed  
2. `src/schemas/` — Zod input schema  
3. `src/tools/my-tool.ts` — `createMyTool({ api, guard })` → `ToolDefinition`  
4. `src/tools/registry.ts` — append factory to `toolFactories`  

`server.ts` / `register.ts` need no edits — registration is centralized.
