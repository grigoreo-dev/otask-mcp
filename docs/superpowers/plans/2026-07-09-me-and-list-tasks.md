# Me + List Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `otask_me` and `otask_list_tasks` so agents can resolve the current user and list workspace tasks (default: mine) with optional due filters.

**Architecture:** Thin API wrappers (`getMe`, `listWorkspaceTasks`) on existing `OtaskClient`; in-process me cache (5 min TTL); pure due-filter + multi-page scan (cap 5); tools follow existing factory/registry/scope patterns; project allow-list filters tasks by `project_id`.

**Tech Stack:** TypeScript, Bun test, Zod, MCP SDK (existing), O!task REST (`/api/v1/me`, `/api/v1/ws/{ws}/tasks`).

**Spec:** `docs/superpowers/specs/2026-07-09-me-and-list-tasks-design.md`

## Global Constraints

- Follow existing patterns: tool factory per file, `jsonToolResult` / `toolError`, `agentListResult`, `resolveWsSlug`, `compactTask`.
- No new runtime dependencies.
- Due filter is client-side only; `DUE_SCAN_MAX_PAGES = 5`.
- `mine` defaults to `true`; explicit `performer_ids` overrides `mine`.
- Date-only due filter in v1 (no completed-status exclusion unless free on payload).
- Do not publish npm or push tags unless user asks.
- TDD: failing test → implement → pass → commit per task.
- Bump version to `1.4.0` only in final task with README.

## File map

| File | Role |
|------|------|
| `src/types.ts` | `OtaskMe`, `ListWorkspaceTasksResult`, query type |
| `src/services/api.ts` | `getMe`, `listWorkspaceTasks` |
| `src/services/client.ts` | bind methods on `OtaskClient` |
| `src/services/me-cache.ts` | compact me + TTL cache factory |
| `src/services/due-filter.ts` | pure due predicates + scan helper |
| `src/services/task-mapper.ts` | optional `project` on `CompactTask` |
| `src/schemas/workspace.ts` | `ListTasksInputSchema` |
| `src/tools/me.ts` | `otask_me` |
| `src/tools/list-tasks.ts` | `otask_list_tasks` |
| `src/tools/registry.ts` | register both |
| `tests/due-filter.test.ts` | pure due unit tests |
| `tests/me-cache.test.ts` | cache TTL |
| `tests/api-paths.test.ts` | URL/query for me + ws tasks |
| `tests/tools-list.test.ts` | tool behavior + mockApi methods |
| `README.md` | document tools |
| `package.json` | version `1.4.0` |

---

### Task 1: Due filter pure functions

**Files:**
- Create: `src/services/due-filter.ts`
- Create: `tests/due-filter.test.ts`

**Interfaces:**
- Produces:
  - `export type DueFilter = "none" | "overdue" | "today" | "week"`
  - `export const DUE_SCAN_MAX_PAGES = 5`
  - `export function startOfDayUtcMs(now: Date, timeZone: string): number`
  - `export function matchesDue(endAt: string | null | undefined, due: DueFilter, now: Date, timeZone: string): boolean`
  - `export function filterTasksByDue<T extends { end_at?: string | null }>(tasks: T[], due: DueFilter, now: Date, timeZone: string): T[]`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/due-filter.test.ts
import { describe, expect, test } from "bun:test";
import {
  DUE_SCAN_MAX_PAGES,
  filterTasksByDue,
  matchesDue,
  startOfDayUtcMs,
} from "../src/services/due-filter.ts";

describe("due-filter", () => {
  test("DUE_SCAN_MAX_PAGES is 5", () => {
    expect(DUE_SCAN_MAX_PAGES).toBe(5);
  });

  test("null end_at never matches overdue/today/week", () => {
    const now = new Date("2026-07-09T12:00:00+03:00");
    expect(matchesDue(null, "overdue", now, "Europe/Moscow")).toBe(false);
    expect(matchesDue(null, "today", now, "Europe/Moscow")).toBe(false);
    expect(matchesDue(null, "week", now, "Europe/Moscow")).toBe(false);
    expect(matchesDue(null, "none", now, "Europe/Moscow")).toBe(true);
  });

  test("today matches calendar day in Europe/Moscow", () => {
    const now = new Date("2026-07-09T15:00:00+03:00");
    expect(matchesDue("2026-07-09T10:00:00+03:00", "today", now, "Europe/Moscow")).toBe(true);
    expect(matchesDue("2026-07-08T23:00:00+03:00", "today", now, "Europe/Moscow")).toBe(false);
    expect(matchesDue("2026-07-10T01:00:00+03:00", "today", now, "Europe/Moscow")).toBe(false);
  });

  test("overdue is before start of today in tz", () => {
    const now = new Date("2026-07-09T01:00:00+03:00");
    expect(matchesDue("2026-07-08T23:59:00+03:00", "overdue", now, "Europe/Moscow")).toBe(true);
    expect(matchesDue("2026-07-09T00:00:00+03:00", "overdue", now, "Europe/Moscow")).toBe(false);
  });

  test("week is [startOfToday, startOfToday+7d)", () => {
    const now = new Date("2026-07-09T12:00:00+03:00");
    expect(matchesDue("2026-07-09T12:00:00+03:00", "week", now, "Europe/Moscow")).toBe(true);
    expect(matchesDue("2026-07-15T23:00:00+03:00", "week", now, "Europe/Moscow")).toBe(true);
    expect(matchesDue("2026-07-16T00:00:00+03:00", "week", now, "Europe/Moscow")).toBe(false);
    expect(matchesDue("2026-07-08T12:00:00+03:00", "week", now, "Europe/Moscow")).toBe(false);
  });

  test("filterTasksByDue keeps matching only", () => {
    const now = new Date("2026-07-09T12:00:00Z");
    const tasks = [
      { id: 1, end_at: "2026-07-01T00:00:00Z" },
      { id: 2, end_at: "2026-07-09T18:00:00Z" },
      { id: 3, end_at: null },
    ];
    expect(filterTasksByDue(tasks, "overdue", now, "UTC").map((t) => t.id)).toEqual([1]);
    expect(filterTasksByDue(tasks, "none", now, "UTC")).toHaveLength(3);
  });

  test("startOfDayUtcMs is stable for UTC", () => {
    const now = new Date("2026-07-09T15:30:00Z");
    expect(startOfDayUtcMs(now, "UTC")).toBe(Date.parse("2026-07-09T00:00:00.000Z"));
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun test tests/due-filter.test.ts
```

Expected: fail (module not found / exports missing).

- [ ] **Step 3: Implement `src/services/due-filter.ts`**

```typescript
export type DueFilter = "none" | "overdue" | "today" | "week";

export const DUE_SCAN_MAX_PAGES = 5;

/** Start of calendar day in `timeZone`, as UTC epoch ms. */
export function startOfDayUtcMs(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  // Interpret Y-M-D as local civil date in timeZone via iterative offset (or Temporal if available).
  // Practical approach: format a candidate and binary-search is overkill —
  // use Date with noon UTC then adjust by offset of that tz on that day:
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset = tzOffsetMs(new Date(utcGuess), timeZone);
  return utcGuess - offset;
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}

export function matchesDue(
  endAt: string | null | undefined,
  due: DueFilter,
  now: Date,
  timeZone: string,
): boolean {
  if (due === "none") return true;
  if (endAt == null || endAt === "") return false;
  const endMs = Date.parse(endAt);
  if (Number.isNaN(endMs)) return false;
  const start = startOfDayUtcMs(now, timeZone);
  const dayMs = 24 * 60 * 60 * 1000;
  if (due === "overdue") return endMs < start;
  if (due === "today") return endMs >= start && endMs < start + dayMs;
  if (due === "week") return endMs >= start && endMs < start + 7 * dayMs;
  return true;
}

export function filterTasksByDue<T extends { end_at?: string | null }>(
  tasks: T[],
  due: DueFilter,
  now: Date,
  timeZone: string,
): T[] {
  if (due === "none") return tasks;
  return tasks.filter((t) => matchesDue(t.end_at, due, now, timeZone));
}
```

Note: if `startOfDayUtcMs` tests fail for Moscow, fix offset helper until Moscow midnight cases pass — do not change test expectations.

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun test tests/due-filter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/services/due-filter.ts tests/due-filter.test.ts
git commit -m "feat: pure due-filter helpers for list_tasks"
```

---

### Task 2: Me compact + TTL cache

**Files:**
- Create: `src/services/me-cache.ts`
- Create: `tests/me-cache.test.ts`
- Modify: `src/types.ts` (add `OtaskMe` raw shape if needed — can keep raw as `Record` and only export compact type from me-cache)

**Interfaces:**
- Produces:
  - `export interface CompactMe { id: number; full_name: string; email?: string; timezone: string; avatar?: string; isonline?: boolean }`
  - `export function compactMe(raw: unknown): CompactMe`
  - `export function createMeCache(fetchMe: () => Promise<unknown>, ttlMs?: number): { get(): Promise<CompactMe>; clear(): void }`
  - Default `ttlMs = 5 * 60 * 1000`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/me-cache.test.ts
import { describe, expect, mock, test } from "bun:test";
import { compactMe, createMeCache } from "../src/services/me-cache.ts";

describe("compactMe", () => {
  test("maps essential fields and defaults timezone", () => {
    expect(
      compactMe({
        id: 11458,
        full_name: "Григорий Лисовский",
        email: "a@b.c",
        timezone: "Europe/Moscow",
        avatar: "https://x",
        isonline: true,
        params: { hide: true },
      }),
    ).toEqual({
      id: 11458,
      full_name: "Григорий Лисовский",
      email: "a@b.c",
      timezone: "Europe/Moscow",
      avatar: "https://x",
      isonline: true,
    });
    expect(compactMe({ id: 1, full_name: "X" }).timezone).toBe("UTC");
  });

  test("throws on missing id", () => {
    expect(() => compactMe({})).toThrow(/me/i);
  });
});

describe("createMeCache", () => {
  test("caches within TTL", async () => {
    const fetchMe = mock(async () => ({
      id: 1,
      full_name: "A",
      timezone: "UTC",
    }));
    const cache = createMeCache(fetchMe, 60_000);
    const a = await cache.get();
    const b = await cache.get();
    expect(a).toEqual(b);
    expect(fetchMe).toHaveBeenCalledTimes(1);
  });

  test("refetches after clear", async () => {
    const fetchMe = mock(async () => ({
      id: 1,
      full_name: "A",
      timezone: "UTC",
    }));
    const cache = createMeCache(fetchMe, 60_000);
    await cache.get();
    cache.clear();
    await cache.get();
    expect(fetchMe).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test tests/me-cache.test.ts
```

- [ ] **Step 3: Implement `src/services/me-cache.ts`**

```typescript
export interface CompactMe {
  id: number;
  full_name: string;
  email?: string;
  timezone: string;
  avatar?: string;
  isonline?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function compactMe(raw: unknown): CompactMe {
  const obj = asRecord(raw);
  if (!obj || typeof obj.id !== "number") {
    throw new Error("Invalid me payload: missing id");
  }
  const full_name =
    typeof obj.full_name === "string"
      ? obj.full_name
      : [obj.first_name, obj.last_name].filter((x) => typeof x === "string").join(" ") ||
        String(obj.id);
  const out: CompactMe = {
    id: obj.id,
    full_name,
    timezone: typeof obj.timezone === "string" && obj.timezone ? obj.timezone : "UTC",
  };
  if (typeof obj.email === "string") out.email = obj.email;
  if (typeof obj.avatar === "string") out.avatar = obj.avatar;
  if (typeof obj.isonline === "boolean") out.isonline = obj.isonline;
  return out;
}

export function createMeCache(
  fetchMe: () => Promise<unknown>,
  ttlMs = 5 * 60 * 1000,
): { get(): Promise<CompactMe>; clear(): void } {
  let cached: CompactMe | null = null;
  let expiresAt = 0;
  return {
    async get() {
      const now = Date.now();
      if (cached && now < expiresAt) return cached;
      cached = compactMe(await fetchMe());
      expiresAt = now + ttlMs;
      return cached;
    },
    clear() {
      cached = null;
      expiresAt = 0;
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
bun test tests/me-cache.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/services/me-cache.ts tests/me-cache.test.ts
git commit -m "feat: compact me mapper and TTL cache"
```

---

### Task 3: API `getMe` + `listWorkspaceTasks` + client

**Files:**
- Modify: `src/types.ts`
- Modify: `src/services/api.ts`
- Modify: `src/services/client.ts`
- Modify: `tests/api-paths.test.ts`

**Interfaces:**
- Produces on `OtaskClient`:
  - `getMe(): Promise<unknown>` (raw data object from API `data`)
  - `listWorkspaceTasks(wsSlug: string, query?: ListWorkspaceTasksQuery): Promise<ListWorkspaceTasksResult>`
- Types:
```typescript
export interface ListWorkspaceTasksQuery {
  page?: number;
  performer_ids?: number[];
  project_ids?: number[];
  priority_ids?: number[];
}
export interface ListWorkspaceTasksResult {
  tasks: OtaskTask[];
  meta?: {
    current_page?: number;
    last_page?: number;
    per_page?: number;
    total?: number;
    [key: string]: unknown;
  };
}
```

Query encoding: Laravel-style arrays — `performer_ids[0]=11458`, `project_ids[0]=…`, `priority_ids[0]=…`, `page=1`.

- [ ] **Step 1: Add failing API path tests** at end of `tests/api-paths.test.ts`

```typescript
test("getMe hits /api/v1/me", async () => {
  let calledUrl = "";
  mockJsonFetch((url) => {
    calledUrl = url;
    return {
      success: true,
      data: { id: 9, full_name: "T", timezone: "UTC" },
    };
  });
  const client = createOtaskClient(auth);
  const me = await client.getMe();
  expect(calledUrl).toBe(`${API_BASE_URL}/api/v1/me`);
  expect(me).toEqual({ id: 9, full_name: "T", timezone: "UTC" });
});

test("listWorkspaceTasks encodes performer_ids and page", async () => {
  let calledUrl = "";
  mockJsonFetch((url) => {
    calledUrl = url;
    return {
      success: true,
      data: {
        tasks: [],
        meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
      },
    };
  });
  const client = createOtaskClient(auth);
  await client.listWorkspaceTasks("ws-1", {
    page: 2,
    performer_ids: [11458],
    project_ids: [35747],
    priority_ids: [1],
  });
  expect(calledUrl).toContain(`${API_BASE_URL}/api/v1/ws/ws-1/tasks?`);
  expect(calledUrl).toContain("page=2");
  expect(calledUrl).toContain("performer_ids%5B0%5D=11458"); // or performer_ids[0]= depending on encoding
  expect(calledUrl).toContain("project_ids");
  expect(calledUrl).toContain("priority_ids");
});
```

If URLSearchParams encodes brackets as `%5B0%5D`, assert that form (Bun/Node default).

- [ ] **Step 2: Run — expect FAIL** (getMe missing)

```bash
bun test tests/api-paths.test.ts
```

- [ ] **Step 3: Implement**

In `src/types.ts` add `ListWorkspaceTasksQuery` and `ListWorkspaceTasksResult` (meta optional object).

In `src/services/api.ts`:

```typescript
export async function getMe(auth: OtaskAuthResolver): Promise<unknown> {
  const headers = await headersFor(auth);
  const response = await fetch(`${API_BASE_URL}/api/v1/me`, {
    method: "GET",
    headers,
  });
  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  return assertSuccess(result, response.status, "Failed to get me");
}

function appendArrayParams(
  params: URLSearchParams,
  key: string,
  values: number[] | undefined,
): void {
  if (!values?.length) return;
  values.forEach((v, i) => {
    params.set(`${key}[${i}]`, String(v));
  });
}

export async function listWorkspaceTasks(
  wsSlug: string,
  query: ListWorkspaceTasksQuery | undefined,
  auth: OtaskAuthResolver,
): Promise<ListWorkspaceTasksResult> {
  const headers = await headersFor(auth);
  const params = new URLSearchParams();
  if (query?.page !== undefined) params.set("page", String(query.page));
  appendArrayParams(params, "performer_ids", query?.performer_ids);
  appendArrayParams(params, "project_ids", query?.project_ids);
  appendArrayParams(params, "priority_ids", query?.priority_ids);
  const qs = params.toString();
  const url =
    wsUrl(wsSlug, "/tasks") + (qs ? `?${qs}` : "");
  const response = await fetch(url, { method: "GET", headers });
  const result = await parseResponse<OtaskApiResponse<unknown>>(response);
  const data = assertSuccess(
    result,
    response.status,
    "Failed to list workspace tasks",
  );
  // same tasks envelope parsing as listProjectTasks
  if (Array.isArray(data)) {
    return { tasks: data as OtaskTask[] };
  }
  const obj = asRecord(data);
  if (obj && Array.isArray(obj.tasks)) {
    return {
      tasks: obj.tasks as OtaskTask[],
      meta: asRecord(obj.meta) ?? undefined,
    };
  }
  throw new OtaskApiError(
    'Unexpected API response: missing array field "tasks"',
    response.status,
    data,
  );
}
```

Wire on `createOtaskClient`:

```typescript
getMe: () => getMe(auth),
listWorkspaceTasks: (wsSlug, query) => listWorkspaceTasks(wsSlug, query, auth),
```

- [ ] **Step 4: Run — expect PASS**

```bash
bun test tests/api-paths.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/services/api.ts src/services/client.ts tests/api-paths.test.ts
git commit -m "feat: API getMe and listWorkspaceTasks"
```

---

### Task 4: `otask_me` tool

**Files:**
- Create: `src/tools/me.ts`
- Modify: `src/tools/registry.ts`
- Modify: `src/tools/types.ts` if deps need meCache (prefer constructing cache inside tool from `api.getMe` **or** add optional `meCache` on `ToolDeps` created once in server bootstrap)

**Preferred deps approach:** add optional `meCache` to `ToolDeps`:

```typescript
// types.ts
meCache?: { get(): Promise<CompactMe>; clear(): void };
```

Create cache in `src/tools/register.ts` or wherever deps are built — read that file and attach:

```typescript
meCache: createMeCache(() => api.getMe()),
```

If `meCache` missing, tools create a one-off `createMeCache(() => api.getMe())` per call (tests can pass explicit mock cache).

- [ ] **Step 1: Write tool test** in `tests/tools-list.test.ts`

Update `mockApi` to include:

```typescript
getMe: mock(async () => ({
  id: 11458,
  full_name: "Test User",
  email: "t@e.st",
  timezone: "Europe/Moscow",
})),
listWorkspaceTasks: mock(async () => ({ tasks: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } })),
```

```typescript
import { createMeTool } from "../src/tools/me.ts";
import { createMeCache } from "../src/services/me-cache.ts";

describe("otask_me", () => {
  test("returns compact me via cache", async () => {
    const getMe = mock(async () => ({
      id: 11458,
      full_name: "Test User",
      email: "t@e.st",
      timezone: "Europe/Moscow",
      params: { noise: 1 },
    }));
    const d = deps({ getMe });
    d.meCache = createMeCache(() => d.api.getMe());
    const tool = createMeTool(d);
    const result = await tool.handler({});
    expect(result.isError).toBeUndefined();
    const body = parseContent(result) as { id: number; full_name: string; timezone: string };
    expect(body).toEqual({
      id: 11458,
      full_name: "Test User",
      email: "t@e.st",
      timezone: "Europe/Moscow",
    });
    expect(body).not.toHaveProperty("params");
  });
});
```

Also update every `mockApi` in `tools-write.test.ts` and `tools-list.test.ts` with the two new methods so TypeScript/`Partial` still works (Partial already allows omission — but if OtaskClient requires them, mockApi base must include them).

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test tests/tools-list.test.ts
```

- [ ] **Step 3: Implement tool + registry + deps wiring**

`src/tools/me.ts`:

```typescript
import { z } from "zod";
import { createMeCache, type CompactMe } from "../services/me-cache.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

const EmptySchema = z.object({}).strict();

export function createMeTool({ api, meCache }: ToolDeps): ToolDefinition<Record<string, never>> {
  const cache = meCache ?? createMeCache(() => api.getMe());
  return {
    name: "otask_me",
    config: {
      title: "Current O!task User",
      description: `Return the authenticated O!task user (id, name, email, timezone).

Use before otask_list_tasks when you need the performer id explicitly.
No args.

Docs: https://api.otask.ru/docs`,
      inputSchema: EmptySchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    handler: async () => {
      try {
        const me: CompactMe = await cache.get();
        return jsonToolResult(me, me as unknown as Record<string, unknown>);
      } catch (error) {
        return toolError(error);
      }
    },
  };
}
```

Register in `registry.ts` near top (before list tools).

Wire `meCache` in deps factory (find `createToolDeps` / `registerAllTools` / server entry).

- [ ] **Step 4: Run list tests PASS**

```bash
bun test tests/tools-list.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/tools/me.ts src/tools/registry.ts src/tools/types.ts src/tools/register.ts tests/tools-list.test.ts tests/tools-write.test.ts
# only files actually changed
git commit -m "feat: otask_me tool"
```

---

### Task 5: `otask_list_tasks` tool

**Files:**
- Modify: `src/schemas/workspace.ts` — add `ListTasksInputSchema`
- Create: `src/tools/list-tasks.ts`
- Modify: `src/tools/registry.ts`
- Modify: `src/services/task-mapper.ts` — optional project on compact
- Modify: `tests/tools-list.test.ts`

**Schema:**

```typescript
export const ListTasksInputSchema = WsSlugSchema.extend({
  page: z.number().int().positive().optional().describe("API page number (default 1)"),
  mine: z
    .boolean()
    .optional()
    .describe("If true (default), filter performer_ids to current user. Ignored when performer_ids set."),
  performer_ids: z.array(z.number().int()).optional().describe("Filter by performer user ids"),
  project_ids: z.array(z.number().int()).optional().describe("Filter by project ids"),
  priority_ids: z.array(z.number().int()).optional().describe("Filter by priority ids"),
  due: z
    .enum(["none", "overdue", "today", "week"])
    .optional()
    .describe("Client-side due filter using me.timezone; scans up to 5 API pages when not none"),
}).strict();
```

**Handler logic (exact):**

1. `ws = resolveWsSlug(ws_slug, scope)`
2. `due = input.due ?? "none"`
3. `page = input.page ?? 1`
4. Resolve performer filter:
   - if `performer_ids?.length` → use it
   - else if `mine !== false` → `me = await meCache.get()`, performers = `[me.id]`, keep `timezone = me.timezone`
   - else → no performer filter; timezone from me only if due≠none (fetch me for tz) else `"UTC"`
5. Build base query with project_ids, priority_ids, performer_ids
6. If `due === "none"`:
   - single `api.listWorkspaceTasks(ws, { ...query, page })`
   - map compact, filter allow-list by `project_id` via `scope.projectGuard.allows({ id: project_id })`
   - `agentListResult` summary e.g. `"N task(s) (mine=true)"` + meta as `next`
7. If `due !== "none"`:
   - loop `p = page; p < page + DUE_SCAN_MAX_PAGES; p++` (stop if `p > last_page`)
   - accumulate tasks, filter due + allow-list
   - set meta: `{ ...lastMeta, filtered_count, scanned_pages, scan_capped, start_page: page }`
   - summary includes due + scanned_pages

**Allow-list:** `items.filter(t => scope.projectGuard.allows({ id: t.project_id }))`. When list is empty (allow all), keeps all.

**Project on compact (optional):** if `task.project` is object with name, set `out.project = { id: task.project_id, name }`.

- [ ] **Step 1: Failing tests**

```typescript
describe("otask_list_tasks", () => {
  test("defaults mine=true and passes performer_ids from me", async () => {
    const listWorkspaceTasks = mock(async () => ({
      tasks: [sampleTask({ project_id: 5, end_at: "2026-07-09T12:00:00Z" })],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    }));
    const getMe = mock(async () => ({
      id: 11458,
      full_name: "U",
      timezone: "UTC",
    }));
    const d = deps({ listWorkspaceTasks, getMe });
    d.meCache = createMeCache(() => d.api.getMe());
    const tool = createListTasksTool(d);
    const result = await tool.handler({ ws_slug: "ws-1" });
    expect(result.isError).toBeUndefined();
    expect(listWorkspaceTasks).toHaveBeenCalledWith("ws-1", {
      page: 1,
      performer_ids: [11458],
    });
  });

  test("mine=false omits performer_ids", async () => {
    const listWorkspaceTasks = mock(async () => ({
      tasks: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    }));
    const d = deps({
      listWorkspaceTasks,
      getMe: mock(async () => ({ id: 1, full_name: "U", timezone: "UTC" })),
    });
    d.meCache = createMeCache(() => d.api.getMe());
    await createListTasksTool(d).handler({ ws_slug: "ws-1", mine: false });
    expect(listWorkspaceTasks).toHaveBeenCalledWith("ws-1", { page: 1 });
  });

  test("explicit performer_ids overrides mine", async () => {
    const listWorkspaceTasks = mock(async () => ({
      tasks: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    }));
    const d = deps({
      listWorkspaceTasks,
      getMe: mock(async () => ({ id: 1, full_name: "U", timezone: "UTC" })),
    });
    d.meCache = createMeCache(() => d.api.getMe());
    await createListTasksTool(d).handler({
      ws_slug: "ws-1",
      performer_ids: [99],
    });
    expect(listWorkspaceTasks).toHaveBeenCalledWith("ws-1", {
      page: 1,
      performer_ids: [99],
    });
  });

  test("allow-list drops tasks from other projects", async () => {
    const listWorkspaceTasks = mock(async () => ({
      tasks: [
        sampleTask({ id: 1, project_id: 5 }),
        sampleTask({ id: 2, project_id: 99 }),
      ],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 2 },
    }));
    const d = deps(
      {
        listWorkspaceTasks,
        getMe: mock(async () => ({ id: 1, full_name: "U", timezone: "UTC" })),
      },
      "5",
    );
    d.meCache = createMeCache(() => d.api.getMe());
    const result = await createListTasksTool(d).handler({
      ws_slug: "ws-1",
      mine: false,
    });
    const body = parseContent(result) as { items: Array<{ id: number }> };
    expect(body.items.map((i) => i.id)).toEqual([1]);
  });

  test("due=overdue scans pages with cap metadata", async () => {
    const listWorkspaceTasks = mock(async (_ws: string, q?: { page?: number }) => {
      const page = q?.page ?? 1;
      return {
        tasks: [
          sampleTask({
            id: page,
            end_at: page === 1 ? "2020-01-01T00:00:00Z" : "2030-01-01T00:00:00Z",
          }),
        ],
        meta: {
          current_page: page,
          last_page: 10,
          per_page: 20,
          total: 200,
        },
      };
    });
    const d = deps({
      listWorkspaceTasks,
      getMe: mock(async () => ({ id: 1, full_name: "U", timezone: "UTC" })),
    });
    d.meCache = createMeCache(() => d.api.getMe());
    const result = await createListTasksTool(d).handler({
      ws_slug: "ws-1",
      mine: false,
      due: "overdue",
      page: 1,
    });
    const body = parseContent(result) as {
      items: Array<{ id: number }>;
      next: { scanned_pages: number; scan_capped: boolean; filtered_count: number };
    };
    expect(body.items.map((i) => i.id)).toEqual([1]);
    expect(body.next.scanned_pages).toBe(5);
    expect(body.next.scan_capped).toBe(true);
    expect(listWorkspaceTasks).toHaveBeenCalledTimes(5);
  });
});
```

- [ ] **Step 2: Run — FAIL**

```bash
bun test tests/tools-list.test.ts
```

- [ ] **Step 3: Implement schema + tool + mapper project field + registry**

Implement `createListTasksTool` as described. Put due-scan loop in the tool file (or export `scanTasksByDue` from `due-filter.ts` if cleaner):

```typescript
export async function collectTasksWithDueScan(options: {
  fetchPage: (page: number) => Promise<ListWorkspaceTasksResult>;
  startPage: number;
  due: DueFilter;
  now: Date;
  timeZone: string;
  maxPages: number;
  allow: (projectId: number) => boolean;
}): Promise<{ tasks: OtaskTask[]; meta: Record<string, unknown> }> {
  // implement loop; return filtered tasks + meta
}
```

Prefer extracting scan helper with unit tests if tool file grows > ~120 lines.

- [ ] **Step 4: Full test suite**

```bash
bun test
bun run build
```

Expected: all pass, `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add src/schemas/workspace.ts src/tools/list-tasks.ts src/tools/registry.ts src/services/task-mapper.ts src/services/due-filter.ts tests/tools-list.test.ts
git commit -m "feat: otask_list_tasks with mine and due filters"
```

---

### Task 6: README + version 1.4.0

**Files:**
- Modify: `README.md` — tools table + short “Inbox” example
- Modify: `package.json` — `"version": "1.4.0"`

- [ ] **Step 1: Update README tools table**

Add rows:

| `otask_me` | Текущий пользователь (id, имя, email, timezone) |
| `otask_list_tasks` | Задачи воркспейса; по умолчанию `mine=true`; фильтры `performer_ids`, `project_ids`, `priority_ids`, `due`, `page` |

Example:

```text
# утренний inbox (после настройки OTASK_DEFAULT_WS)
otask_me
otask_list_tasks  # mine=true
otask_list_tasks due=today
otask_list_tasks due=overdue
```

- [ ] **Step 2: Bump version to 1.4.0**

- [ ] **Step 3: Final verification**

```bash
bun test && bun run build
```

- [ ] **Step 4: Commit**

```bash
git add README.md package.json
git commit -m "docs: document me and list_tasks; bump 1.4.0"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `otask_me` compact | 2, 4 |
| `GET /api/v1/me` | 3 |
| `otask_list_tasks` ws API | 3, 5 |
| `mine` default true | 5 |
| `performer_ids` override | 5 |
| `project_ids` / `priority_ids` / `page` | 3, 5 |
| due overdue/today/week client-side | 1, 5 |
| scan cap 5 pages | 1, 5 |
| allow-list by project_id | 5 |
| me cache 5 min | 2, 4 |
| agent envelope | 5 |
| README + 1.4.0 | 6 |
| no manager column filters | out of scope |

## Self-review notes

- No TBD placeholders.
- `mockApi` in **both** list and write test files must gain `getMe` + `listWorkspaceTasks` in Task 3/4.
- `agentListResult` third arg is `next` — put extended meta there (existing pattern for project tasks meta).
- URL encoding of `performer_ids[0]` may be `%5B0%5D` — assert flexibly with `toContain("11458")` and `performer_ids` substring if needed.
