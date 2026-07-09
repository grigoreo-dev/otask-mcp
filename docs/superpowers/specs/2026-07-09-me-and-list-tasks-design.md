# Design: `otask_me` + `otask_list_tasks` (employee inbox)

**Date:** 2026-07-09  
**Status:** Approved for implementation planning  
**Repo:** `otask-mcp`  
**Version target:** minor bump (e.g. 1.4.0)

## Problem

MCP always authenticates as a **personal** O!task account (employee or bot — same credentials; persona is skills, not tools). Agents still lack:

1. **Identity** — no way to learn current user id/name/timezone (`GET /api/v1/me` exists, not exposed).
2. **Inbox** — no workspace-level task list; only per-project `list_project_tasks`. “My tasks” requires `GET /api/v1/ws/{ws}/tasks?performer_ids[0]={id}` (verified live).
3. **Due-oriented views** — overdue / today / week for morning standups; API does not filter by due date; must be client-side with a hard page cap.

## Goals

1. Expose compact **`otask_me`**.
2. Expose universal **`otask_list_tasks`** (ws-level) with filters used by the real API.
3. Default **mine=true** → current user as performer (via `me`).
4. Optional **due** filter (`overdue` | `today` | `week`) using timezone from `me`, with a strict scan cap.
5. Keep agent envelope (`summary` + `items` + `meta`) and project allow-list behavior consistent with existing list tools.
6. Employee-first brief-friendly output (compact, not raw API).

## Non-goals (this slice)

- Manager-specific: column/unassigned filters, multi-assignee load reports.
- Changing `list_project_tasks` query surface.
- Full-text search endpoint.
- Notifications tool (`exists_unread_notifications` on me is ignored for now).
- Separate `otask_brief` / `otask_my_overdue` tools (skills compose list_tasks).
- Pushing npm without an explicit request after implement.

## Personas (context only)

| Persona | Auth | MCP | Skills |
|---------|------|-----|--------|
| Employee assistant | Personal account | Same tools | “What do I have today?” |
| Bot | Same personal account | Same tools | Different prompt/skill chains |

## Approaches considered

1. **Two thin tools + client due filter (chosen)** — `me` + `list_tasks`; due as query; brief = skill.
2. Many specialized tools (`my_tasks`, `my_overdue`, `brief`) — clearer names, bloated registry.
3. One fat `inbox` tool — poor composition and testing.

## Tool design

### `otask_me`

| | |
|--|--|
| Args | none |
| API | `GET https://api.otask.ru/api/v1/me` |
| Output | compact user (see below) |

### `otask_list_tasks`

| Arg | Required | Default | Notes |
|-----|----------|---------|-------|
| `ws_slug` | no | `OTASK_DEFAULT_WS` | existing scope resolver |
| `page` | no | `1` | API page (API per_page ≈ 20; do not invent per_page unless API accepts it) |
| `mine` | no | `true` | if true and no explicit `performer_ids`, set `performer_ids=[me.id]` |
| `performer_ids` | no | — | if set, overrides `mine` |
| `project_ids` | no | — | API `project_ids[0]=…` |
| `priority_ids` | no | — | API `priority_ids[0]=…` |
| `due` | no | `none` | `none` \| `overdue` \| `today` \| `week` — **client-side** after fetch |

**API (verified live):**

```
GET /api/v1/ws/{ws_slug}/tasks
  ?page=1
  &performer_ids[0]={userId}
  &project_ids[0]={projectId}
  &priority_ids[0]={priorityId}
```

Response shape: `{ success, data: { tasks: Task[], meta: { current_page, last_page, per_page, total, … } } }`.

## Response shapes

### Me (compact)

```json
{
  "id": 11458,
  "full_name": "Григорий Лисовский",
  "email": "user@example.com",
  "timezone": "Europe/Moscow",
  "avatar": "https://…",
  "isonline": true
}
```

Omit: `params`, `ui`, onboarding flags, socials noise.

### List tasks (agent envelope)

```json
{
  "summary": "5 task(s), page 1/9 (mine=true, due=today; scanned_pages=2)",
  "items": [ /* CompactTask */ ],
  "meta": {
    "current_page": 1,
    "last_page": 9,
    "per_page": 20,
    "total": 162,
    "filtered_count": 5,
    "scanned_pages": 2,
    "scan_capped": false
  }
}
```

`CompactTask`: reuse existing mapper fields; if API includes `project`, add optional `project: { id, name }` (or name string) so cross-project inbox is readable.

## Due filter rules

Timezone: `me.timezone` or `UTC` fallback.

Let `start` = start of calendar day in tz, `end` = start + 1 day.

| `due` | Keep task if |
|-------|----------------|
| `none` | no extra filter |
| `overdue` | `end_at != null` and `end_at < start` |
| `today` | `end_at` in `[start, end)` |
| `week` | `end_at` in `[start, start+7d)` |

**Completed tasks:** if we can reliably detect completed (e.g. board column `type === completed` or known status), exclude from overdue/today/week. If not available on list payload without extra calls, **filter by date only** in v1 and document the limitation.

### Scan cap when `due != none`

1. Fetch page `page` (or from 1 if we define scan from start — **v1: start at `page`, fetch up to `DUE_SCAN_MAX_PAGES` consecutive pages**).
2. Default `DUE_SCAN_MAX_PAGES = 5` (≤100 tasks at 20/page).
3. Filter in memory; return filtered `items` (may be fewer than one API page).
4. Set `meta.scanned_pages`, `meta.scan_capped=true` if hit cap with `last_page` remaining.
5. Never walk all 27+ pages in one tool call.

When `due=none`, single API page only (normal pagination).

## Allow-list

After mapping tasks, drop any item whose `project_id` is outside `ProjectGuard` allow-list (same semantics as project listing). If allow-list empty (= allow all), keep all.

## Me cache

In-process cache for `me` with TTL **5 minutes** to avoid double login-path cost when `list_tasks` defaults `mine=true`. `otask_me` may return cached value; optional later `refresh` flag — **not required in v1** (TTL enough).

## Errors

| Case | Behavior |
|------|----------|
| Missing ws | existing scope error string |
| Auth 401/403 | existing `formatApiError` |
| Me fetch fail | surface API error; list_tasks with mine cannot proceed |
| Empty after due filter | success with `items=[]` and explicit summary |

## Implementation map

| Area | Change |
|------|--------|
| `src/services/api.ts` | `getMe`, `listWorkspaceTasks` |
| `src/services/client.ts` | bind both on `OtaskClient` |
| `src/services/me-cache.ts` (or `identity.ts`) | TTL cache + compact mapper |
| `src/services/due-filter.ts` | pure due predicates + multi-page scan helper |
| `src/services/task-mapper.ts` | optional project on compact task |
| `src/schemas/…` | Zod for list_tasks input |
| `src/tools/me.ts` | `otask_me` |
| `src/tools/list-tasks.ts` | `otask_list_tasks` |
| `src/tools/registry.ts` | register |
| `tests/` | unit due + mine wiring + allow-list; tool mocks |
| `README.md` | tools + employee inbox example |

## Testing plan

1. **Unit:** due boundaries around midnight Moscow; week range; null `end_at` excluded from due filters.
2. **Unit:** `mine=true` → performer_ids query; explicit `performer_ids` overrides mine; `mine=false` omits performer filter.
3. **Unit:** allow-list drops foreign `project_id`.
4. **Tool tests:** mock client; envelope shape; scan cap flag.
5. **Manual live smoke (optional):** `me`, `list_tasks` mine default, `due=today` / `overdue`.

## Rollout

1. Implement + tests green.
2. Bump package version minor when ready to publish.
3. Tag/publish only on explicit user request.

## Success criteria

- Agent can call `otask_me` and get stable user `id` + `timezone`.
- Agent can call `otask_list_tasks` with no args (defaults) and get **my** tasks in default ws (subject to allow-list).
- Agent can call `due=today` or `due=overdue` and get a brief-sized list with honest `scan_capped` metadata when relevant.
- Existing tools unchanged in behavior.

## Follow-ups (not this plan)

- Manager filters: column / unassigned.
- Stronger completed detection for due filters.
- `list_project_tasks` parity filters (`performer`, etc.) if API project route is fixed.
- Skill pack: morning briefing using `me` + `list_tasks`.
