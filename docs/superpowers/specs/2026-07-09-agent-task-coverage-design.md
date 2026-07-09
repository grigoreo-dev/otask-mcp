# Design: Agent-friendly O!task MCP coverage

**Date:** 2026-07-09  
**Status:** Approved for implementation planning  
**Repo:** `otask-mcp`

## Problem

Current MCP surface is too thin for an agent acting as an employee:

- Only `otask_get_task` and `otask_update_task`
- Auth README is hard to operationalize (gateway vs passthrough vs stdio)
- No project allow-list
- O!task API is large and noisy; raw payloads waste context and confuse agents
- No machine-readable OpenAPI: docs are HTML-only (Scribe theme at `https://api.otask.ru/docs`)

## Goals

1. **Employee task workflow** — list projects/tasks, inspect status, update, create, assign, comment, tag, move, archive
2. **Agent-shaped API** — tools map to intents, not 1:1 noisy HTTP endpoints; compact DTOs by default
3. **Docs catalog from HTML** — parser splits documentation into scopes for development and future expansion
4. **Configurable project restrictions** — gateway env allow-list; passthrough client header allow-list
5. **Clear auth documentation** — matrix for stdio / HTTP gateway / HTTP passthrough / n8n

Non-goals for this cycle:

- Finance, CRM, knowledge base, reports
- Live dependency on O!task in CI
- Full OpenAPI codegen of every endpoint as MCP tools
- Runtime fetch of docs HTML inside the MCP server path

## Architecture

```
docs HTML ──► parser (CLI) ──► scopes catalog (JSON)
                                      │
agent tools ◄── formatters ◄── OtaskClient ◄── api fetch
                     ▲              │
                     │         ProjectGuard
                     │
              agent-shaped DTOs (not raw API)
```

### Layers

| Layer | Responsibility |
|-------|----------------|
| `scripts/docs-parse` (or `src/docs/parser`) | Offline HTML → scoped endpoint catalog |
| `src/services/api.ts` | Thin fetch wrappers |
| `src/services/client.ts` | Auth-bound client + guard hooks |
| `src/services/project-guard.ts` | Allow-list enforcement |
| `src/services/*-mapper.ts` | Raw → compact agent DTOs |
| `src/tools/*` | Intent tools registered via existing registry |
| `README.md` | Auth + tools + allow-list operational docs |

Existing patterns stay: tool factory → registry → `registerAllTools`; `OtaskAuthResolver` per stdio/server or per HTTP request.

## HTML docs parser

### Why

Public JSON/OpenAPI paths (`/docs.json`, `/docs.openapi`, etc.) return 404. Source of truth is the Scribe HTML page (~7MB). A parser:

- Produces a stable catalog for implementing tools without re-scraping by hand
- Groups endpoints by sidebar **scopes** (Введение, Аутентификация, Проекты, Задачи, Команда, …)
- Documents request/response shapes used when writing Zod schemas and mappers

### CLI

```bash
bun run docs:parse              # fetch live docs
bun run docs:parse --file path  # offline HTML fixture
```

### Output layout

```
docs/catalog/
  index.json                 # scopes list + counts
  scopes/
    auth.json
    projects.json
    tasks.json
    team.json
    ...
```

### Endpoint record (per scope file)

```ts
{
  id: string;           // e.g. zadaci-GETapi-v1-ws--ws_slug--tasks--task_slug-
  title: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;         // /api/v1/ws/{ws_slug}/tasks/{task_slug}
  authRequired: boolean;
  pathParams: Param[];
  queryParams: Param[];
  bodyParams: Param[];
  responseExample?: unknown;  // trimmed
  docsAnchor: string;         // #...
}
```

### Scope mapping

Sidebar top-level sections → catalog scopes. At minimum for v1 implementation: `auth`, `projects`, `tasks`, `team` (members). Other scopes may be parsed and stored but not exposed as tools yet.

### Constraints

- Parser is a **dev/build utility**, not a runtime MCP dependency
- Commit a snapshot of `docs/catalog/` when useful for review; refresh via CLI
- Response examples may be truncated in catalog to keep files manageable

## Agent-facing tools (v1 — full workspace ops)

Tools express employee intents. Underlying HTTP may still be noisy; mappers hide that.

| Tool | Intent | Primary API |
|------|--------|-------------|
| `otask_list_projects` | Discover allowed projects | `GET .../projects/list` or `.../projects/all` |
| `otask_list_project_tasks` | Tasks in a project (+ filters) | `GET .../projects/{project_slug}/tasks` and/or board endpoints |
| `otask_get_task` | Task detail (compact) | `GET .../tasks/{task_slug}` |
| `otask_create_task` | Create task | `POST .../tasks/create` |
| `otask_update_task` | Patch fields / assign / tags | `POST .../tasks/{task_slug}/update` (fetch-merge-submit) |
| `otask_move_task` | Change status/column | update with `board_column_id` (and board if needed) |
| `otask_archive_task` | Archive task | archive endpoint from tasks scope |
| `otask_list_comments` | Read discussion | `POST .../comments-get` |
| `otask_add_comment` | Comment (incl. @mentions if API supports in body HTML/text) | `POST .../comments-store` |
| `otask_list_members` | Who to assign/tag | `GET .../members-list` |
| `otask_list_tags` | Workspace/task tags | `GET .../kanbans/tags` |
| `otask_list_board` | Boards + columns (statuses) | `GET .../projects/{project_slug}/boards` |

Existing `otask_get_task` / `otask_update_task` remain; improve descriptions and default output formatting.

### Response shape (default)

```json
{
  "summary": "3 tasks in project X",
  "items": [ /* compact rows */ ],
  "next": null
}
```

Compact task fields (typical): `id`, `slug`, `name`, `status` (column name/id if known), `board_column_id`, `board_id`, `project_id`, `project_slug?`, `priority_id`, `end_at`, `performers` (`[{id, name}]`), `tags` (`[{id, name}]`), `comments_count?`.

- Default: **no** pivot, localtz_*, raw media blobs, deep nested noise
- Optional `verbose: true` on tools that benefit from full raw (default `false`)

### Create / move / archive

- **Create:** agent passes project + name + optional assignees/column/due/description; server fills required O!task fields where defaults exist
- **Move:** agent passes target column (id or resolvable name via board listing); tool does merge-update
- **Archive:** dedicated tool wrapping archive endpoint; clear error if already archived

Exact request bodies for create/archive are taken from the parsed catalog during implementation (not guessed).

## Project allow-list

### Rules by mode

| Mode | Source of allow-list |
|------|----------------------|
| Stdio (always gateway credentials) | Env only |
| HTTP **gateway** (`OTASK_*` set) | Env only |
| HTTP **passthrough** (no `OTASK_*`) | Client header only |

### Env

```env
OTASK_ALLOWED_PROJECTS=project-slug-uuid,another-slug,188
```

- Comma-separated
- Accept **slug and/or numeric id**
- Empty / unset → no MCP-level restriction (O!task token permissions still apply)

### HTTP header (passthrough only)

```http
X-Otask-Allowed-Projects: project-slug-uuid,188
```

In passthrough, **do not** apply server env allow-list (per product decision).  
In gateway, **ignore** client project header (server env only).

### Enforcement

`ProjectGuard`:

1. Normalize allow entries to `{ slugs: Set<string>, ids: Set<number> }`
2. **List tools:** filter results to allowed projects
3. **Mutating / get-by-id tools:** resolve project of the resource; reject with explicit error if outside list
4. Task endpoints that only have `project_id` in payload: resolve via cached id↔slug map populated from `list_projects` (or task payload when slug present)

### Why not slug-only

Task payloads expose `project_id` more often than `project_slug`. Supporting both avoids false denials and brittle reverse lookups.

## Auth (behavior unchanged; docs rewritten)

Existing behavior remains correct:

- **Stdio:** `OTASK_AUTH_KEY` or `OTASK_EMAIL`+`OTASK_PASSWORD`; no `MCP_AUTH_TOKEN`
- **HTTP gateway:** server holds O!task credentials; client sends `Authorization: Bearer <MCP_AUTH_TOKEN>`
- **HTTP passthrough:** no `OTASK_*`; client sends `Authorization: Bearer <O!task token>` which is forwarded

README rewrite must include:

1. Decision table (which mode am I in?)
2. Required env vars per mode
3. n8n MCP Client Tool examples (gateway credential vs O!task Bearer)
4. Project allow-list section (env vs header)
5. Tool list with one-line intents
6. Link to `https://api.otask.ru/docs` and note that catalog is derived from HTML

`/health` may report:

```json
{ "ok": true, "authMode": "gateway|passthrough", "projectGuard": "env|header|off" }
```

## Implementation order

1. **Docs parser CLI** + initial catalog snapshot for tasks/projects/team/auth
2. **ProjectGuard** + wire into client
3. **Mappers** for compact task/project/member/comment DTOs
4. **Tools** in dependency order: members/tags/board → list projects/tasks → comments → create/move/archive → polish update
5. **README** auth + allow-list + tools
6. **Unit tests** for parser fixtures, guard, mappers (mocked API)

## Testing strategy

- Fixture HTML slice (or full cached HTML in git-lfs/local only if size allows) for parser tests
- Guard unit tests: empty list, slug match, id match, reject, list filter, mode-specific source
- Mapper unit tests: strip noise, stable shapes
- Tool handlers with mocked `OtaskClient`
- No live API required in CI

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| HTML docs structure changes | Parser tests; re-run CLI; keep fixtures |
| Create/archive body under-specified in docs | Validate against catalog examples; integration smoke optional later |
| Allow-list id/slug mismatch | Support both; cache map from list_projects |
| Too many tools for agent | Intent tools + short descriptions; avoid dumping entire API surface |
| Comment “tag people” API shape unclear | Use members list + comment body conventions from docs examples |

## Success criteria

- Agent can complete: find project → list tasks → open task → move status → assign → comment → create task → archive, within allow-list
- Auth README usable without tribal knowledge
- Parser produces scoped catalog from official HTML
- Default tool payloads are compact enough for LLM context
- Guard blocks out-of-list projects consistently across tools
