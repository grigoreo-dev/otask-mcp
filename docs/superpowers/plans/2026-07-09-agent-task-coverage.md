# Agent Task Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an agent-friendly O!task MCP: HTML docs→scopes catalog, compact employee-intent tools (projects/tasks/comments/members/create/move/archive), project allow-list (env gateway / header passthrough), and clear auth docs.

**Architecture:** Offline docs parser produces scoped JSON catalog. Runtime stays layered: `api` (fetch) → `ProjectGuard` + `OtaskClient` → mappers (compact DTOs) → intent tools via existing registry. Gateway allow-list from env; passthrough from `X-Otask-Allowed-Projects` only.

**Tech Stack:** Bun, TypeScript, Zod, `@modelcontextprotocol/sdk`, `bun:test` (no new runtime deps).

## Global Constraints

- Follow existing tool pattern: factory in `src/tools/*.ts` → `registry.ts` → `registerAllTools`
- Do not add runtime dependency on live docs HTML
- Default tool output is compact; `verbose` optional where specified
- Gateway: allow-list **env only**; passthrough: allow-list **header only**
- Allow-list accepts project **slug and/or numeric id**
- Empty allow-list = no MCP-level restriction
- No finance/CRM tools in this plan
- Prefer TDD; commit after each task
- Spec: `docs/superpowers/specs/2026-07-09-agent-task-coverage-design.md`

## File map

| Path | Role |
|------|------|
| `src/docs/parser.ts` | Parse Scribe HTML → scopes + endpoints |
| `src/docs/types.ts` | Catalog types |
| `scripts/parse-docs.ts` | CLI: fetch or file → write `docs/catalog/` |
| `docs/catalog/**` | Generated catalog snapshot |
| `src/services/project-guard.ts` | Parse + enforce allow-list |
| `src/services/format.ts` | `{ summary, items, next }` helpers |
| `src/services/task-mapper.ts` | Extend compact task/project/member/comment DTOs |
| `src/services/api.ts` | New endpoints |
| `src/services/client.ts` | Guard-aware client methods |
| `src/services/auth.ts` | Optional: extract project header helper |
| `src/mcp-http.ts` | Pass allow-list into server deps |
| `src/server.ts` | Accept guard config in deps |
| `src/tools/types.ts` | `ToolDeps` includes `guard` |
| `src/tools/*.ts` | New tools |
| `src/schemas/*.ts` | Zod inputs |
| `tests/**` | Unit tests |
| `README.md` | Auth + tools + allow-list |
| `package.json` | `test`, `docs:parse` scripts |

---

### Task 1: Test runner + ProjectGuard

**Files:**
- Create: `src/services/project-guard.ts`
- Create: `tests/project-guard.test.ts`
- Modify: `package.json` (add `"test": "bun test"`)

**Interfaces:**
- Produces:
  - `parseProjectAllowList(raw: string | undefined): ProjectAllowList`
  - `createProjectGuard(list: ProjectAllowList): ProjectGuard`
  - `ProjectAllowList { slugs: Set<string>; ids: Set<number>; isEmpty: boolean }`
  - `ProjectGuard.allows(ref: { slug?: string; id?: number }): boolean`
  - `ProjectGuard.assertAllowed(ref): void` throws `Error` with message starting `Project not allowed:`
  - `ProjectGuard.filterProjects<T extends { slug?: string; id?: number }>(items: T[]): T[]`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/project-guard.test.ts
import { describe, expect, test } from "bun:test";
import {
  parseProjectAllowList,
  createProjectGuard,
} from "../src/services/project-guard.ts";

describe("parseProjectAllowList", () => {
  test("empty when unset", () => {
    const list = parseProjectAllowList(undefined);
    expect(list.isEmpty).toBe(true);
  });

  test("parses slugs and numeric ids", () => {
    const list = parseProjectAllowList("abc-slug, 188, other");
    expect(list.slugs.has("abc-slug")).toBe(true);
    expect(list.slugs.has("other")).toBe(true);
    expect(list.ids.has(188)).toBe(true);
    expect(list.isEmpty).toBe(false);
  });
});

describe("ProjectGuard", () => {
  test("allows all when empty", () => {
    const g = createProjectGuard(parseProjectAllowList(""));
    expect(g.allows({ id: 1 })).toBe(true);
    expect(g.allows({ slug: "x" })).toBe(true);
  });

  test("matches slug or id", () => {
    const g = createProjectGuard(parseProjectAllowList("p1,42"));
    expect(g.allows({ slug: "p1" })).toBe(true);
    expect(g.allows({ id: 42 })).toBe(true);
    expect(g.allows({ slug: "nope" })).toBe(false);
    expect(g.allows({ id: 1 })).toBe(false);
  });

  test("assertAllowed throws", () => {
    const g = createProjectGuard(parseProjectAllowList("p1"));
    expect(() => g.assertAllowed({ slug: "p1" })).not.toThrow();
    expect(() => g.assertAllowed({ slug: "x" })).toThrow(/Project not allowed/);
  });

  test("filterProjects", () => {
    const g = createProjectGuard(parseProjectAllowList("a,2"));
    const out = g.filterProjects([
      { slug: "a", id: 1 },
      { slug: "b", id: 2 },
      { slug: "c", id: 3 },
    ]);
    expect(out).toEqual([
      { slug: "a", id: 1 },
      { slug: "b", id: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun test tests/project-guard.test.ts
```

Expected: fail resolving `../src/services/project-guard.ts`

- [ ] **Step 3: Implement guard**

```typescript
// src/services/project-guard.ts
export interface ProjectAllowList {
  slugs: Set<string>;
  ids: Set<number>;
  isEmpty: boolean;
}

export interface ProjectRef {
  slug?: string | null;
  id?: number | null;
}

export interface ProjectGuard {
  allows(ref: ProjectRef): boolean;
  assertAllowed(ref: ProjectRef): void;
  filterProjects<T extends ProjectRef>(items: T[]): T[];
  readonly list: ProjectAllowList;
}

export function parseProjectAllowList(
  raw: string | undefined | null,
): ProjectAllowList {
  const slugs = new Set<string>();
  const ids = new Set<number>();
  if (!raw?.trim()) {
    return { slugs, ids, isEmpty: true };
  }
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (!token) continue;
    if (/^\d+$/.test(token)) {
      ids.add(Number(token));
    } else {
      slugs.add(token);
    }
  }
  return { slugs, ids, isEmpty: slugs.size === 0 && ids.size === 0 };
}

export function createProjectGuard(list: ProjectAllowList): ProjectGuard {
  return {
    list,
    allows(ref) {
      if (list.isEmpty) return true;
      if (ref.slug && list.slugs.has(ref.slug)) return true;
      if (ref.id != null && list.ids.has(ref.id)) return true;
      return false;
    },
    assertAllowed(ref) {
      if (!this.allows(ref)) {
        const label = ref.slug ?? ref.id ?? "unknown";
        throw new Error(`Project not allowed: ${label}`);
      }
    },
    filterProjects(items) {
      if (list.isEmpty) return items;
      return items.filter((item) => this.allows(item));
    },
  };
}

export function projectGuardFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProjectGuard {
  return createProjectGuard(parseProjectAllowList(env.OTASK_ALLOWED_PROJECTS));
}
```

- [ ] **Step 4: Add test script and run**

```json
// package.json scripts add:
"test": "bun test",
"docs:parse": "bun run scripts/parse-docs.ts"
```

```bash
bun test tests/project-guard.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json src/services/project-guard.ts tests/project-guard.test.ts
git commit -m "feat: project allow-list guard with unit tests"
```

---

### Task 2: HTML docs parser

**Files:**
- Create: `src/docs/types.ts`
- Create: `src/docs/parser.ts`
- Create: `tests/fixtures/docs-snippet.html` (minimal Scribe-like HTML with 2 endpoints in 2 sections)
- Create: `tests/docs-parser.test.ts`
- Create: `scripts/parse-docs.ts`

**Interfaces:**
- Produces:
  - `parseOtaskDocsHtml(html: string): DocsCatalog`
  - `DocsCatalog { scopes: ScopeCatalog[]; generatedAt: string }`
  - `ScopeCatalog { id: string; title: string; endpoints: EndpointRecord[] }`
  - `EndpointRecord { id, title, method, path, authRequired, pathParams, queryParams, bodyParams, responseExample?, docsAnchor }`

- [ ] **Step 1: Write fixture + failing test**

Create `tests/fixtures/docs-snippet.html` with structure matching Scribe:

```html
<aside class="sidebar">
  <ul class="sidebar__menu">
    <li class="sidebar__menu-item">
      <a href="#zadaci" class="sidebar__menu-link"><span class="sidebar__menu-link-name">Задачи</span></a>
      <ul class="sidebar__submenu">
        <li class="sidebar__submenu-item">
          <a href="#zadaci-GETapi-v1-ws--ws_slug--tasks" class="sidebar__submenu-link">Получить список задач</a>
        </li>
      </ul>
    </li>
    <li class="sidebar__menu-item">
      <a href="#komanda" class="sidebar__menu-link"><span class="sidebar__menu-link-name">Команда</span></a>
      <ul class="sidebar__submenu">
        <li class="sidebar__submenu-item">
          <a href="#komanda-GETapi-v1-ws--ws_slug--members-list" class="sidebar__submenu-link">Получить список всех активных участников пространства</a>
        </li>
      </ul>
    </li>
  </ul>
</aside>
<main>
  <h2 id="zadaci-GETapi-v1-ws--ws_slug--tasks">Получить список задач</h2>
  <p><code>GET</code></p>
  <p>https://api.otask.ru</p>
  <p>/api/v1/ws/{ws_slug}/tasks</p>
  <p>Требуется аутентификация</p>
  <h2 id="komanda-GETapi-v1-ws--ws_slug--members-list">Получить список всех активных участников пространства</h2>
  <p><code>GET</code></p>
  <p>/api/v1/ws/{ws_slug}/members/list</p>
</main>
```

```typescript
// tests/docs-parser.test.ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOtaskDocsHtml } from "../src/docs/parser.ts";

const html = readFileSync(
  join(import.meta.dir, "fixtures/docs-snippet.html"),
  "utf8",
);

describe("parseOtaskDocsHtml", () => {
  test("splits scopes from sidebar and attaches endpoints", () => {
    const catalog = parseOtaskDocsHtml(html);
    const tasks = catalog.scopes.find((s) => s.id === "zadaci");
    const team = catalog.scopes.find((s) => s.id === "komanda");
    expect(tasks?.title).toBe("Задачи");
    expect(tasks?.endpoints.some((e) => e.method === "GET" && e.path.includes("/tasks"))).toBe(true);
    expect(team?.endpoints.some((e) => e.path.includes("/members/list"))).toBe(true);
  });

  test("sets docsAnchor", () => {
    const catalog = parseOtaskDocsHtml(html);
    const ep = catalog.scopes
      .flatMap((s) => s.endpoints)
      .find((e) => e.id.includes("members-list"));
    expect(ep?.docsAnchor).toBe("#komanda-GETapi-v1-ws--ws_slug--members-list");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test tests/docs-parser.test.ts
```

- [ ] **Step 3: Implement parser**

Implement robust-enough parsing:

1. Scan sidebar: each `sidebar__menu-item` → scope `id` from `href="#..."` (strip `#`), `title` from `sidebar__menu-link-name`, child endpoint ids from `sidebar__submenu-link` hrefs.
2. For each endpoint id, find `id="{endpointId}"` in HTML (or `id='...'`), take slice until next endpoint id occurrence from the known set.
3. From slice text (strip tags): detect method via `\b(GET|POST|PUT|PATCH|DELETE)\b`, path via `/api/v1/[^\s<"]+`, auth via `Требуется аутентификация` / `required authentication`.
4. Params: best-effort — optional for v1 tests; may leave arrays empty if not in fixture.
5. `docsAnchor: #${id}`

Types in `src/docs/types.ts`:

```typescript
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface DocParam {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
}

export interface EndpointRecord {
  id: string;
  title: string;
  method: HttpMethod;
  path: string;
  authRequired: boolean;
  pathParams: DocParam[];
  queryParams: DocParam[];
  bodyParams: DocParam[];
  responseExample?: unknown;
  docsAnchor: string;
}

export interface ScopeCatalog {
  id: string;
  title: string;
  endpoints: EndpointRecord[];
}

export interface DocsCatalog {
  generatedAt: string;
  scopes: ScopeCatalog[];
}
```

- [ ] **Step 4: CLI writer**

```typescript
// scripts/parse-docs.ts
#!/usr/bin/env bun
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOtaskDocsHtml } from "../src/docs/parser.ts";

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
let html: string;
if (fileIdx >= 0) {
  html = readFileSync(args[fileIdx + 1]!, "utf8");
} else {
  const res = await fetch("https://api.otask.ru/docs");
  if (!res.ok) throw new Error(`Fetch docs failed: ${res.status}`);
  html = await res.text();
}

const catalog = parseOtaskDocsHtml(html);
const outDir = join(import.meta.dir, "..", "docs", "catalog");
mkdirSync(join(outDir, "scopes"), { recursive: true });
writeFileSync(
  join(outDir, "index.json"),
  JSON.stringify(
    {
      generatedAt: catalog.generatedAt,
      scopes: catalog.scopes.map((s) => ({
        id: s.id,
        title: s.title,
        endpointCount: s.endpoints.length,
        file: `scopes/${s.id}.json`,
      })),
    },
    null,
    2,
  ),
);
for (const scope of catalog.scopes) {
  writeFileSync(
    join(outDir, "scopes", `${scope.id}.json`),
    JSON.stringify(scope, null, 2),
  );
}
console.error(
  `Wrote ${catalog.scopes.length} scopes, ${catalog.scopes.reduce((n, s) => n + s.endpoints.length, 0)} endpoints → docs/catalog`,
);
```

- [ ] **Step 5: Run tests + parse live (optional network)**

```bash
bun test tests/docs-parser.test.ts
bun run docs:parse
```

Expected: tests PASS; `docs/catalog/index.json` created. If network blocked, `bun run docs:parse --file tests/fixtures/docs-snippet.html` still works for smoke.

- [ ] **Step 6: Commit**

```bash
git add src/docs scripts/parse-docs.ts tests/docs-parser.test.ts tests/fixtures package.json docs/catalog
git commit -m "feat: parse O!task HTML docs into scoped catalog"
```

---

### Task 3: Format helpers + compact mappers

**Files:**
- Create: `src/services/format.ts`
- Modify: `src/services/task-mapper.ts`
- Create: `tests/format-mapper.test.ts`

**Interfaces:**
- Produces:
  - `agentListResult(summary: string, items: unknown[], next?: unknown): { summary, items, next }`
  - `compactTask(task: OtaskTask): CompactTask`
  - `compactProject(p: { id: number; slug: string; name: string; status_id?: number }): CompactProject`
  - `compactMember(m: { id?: number; user_id?: number; full_name?: string; email?: string; status_text?: string }): CompactMember`
  - Keep existing `buildUpdateBodyFromTask`, `summarizeTask` — make `summarizeTask` delegate to `compactTask` (same fields + optional name on performers if present)

```typescript
// CompactTask shape
{
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  end_at: string | null;
  priority_id: number;
  project_id: number;
  board_id: number;
  board_column_id: number;
  status_id?: number;
  performers: Array<{ id: string; name?: string }>;
  tags: Array<{ id: string; name?: string }>;
  comments_count?: number;
  subtasks_count?: number;
}
```

- [ ] **Step 1: Failing tests** for `agentListResult` and `compactTask` stripping unknown noise keys from output (only known fields).

- [ ] **Step 2: Implement format + mapper updates**

- [ ] **Step 3: `bun test tests/format-mapper.test.ts` PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: agent list envelope and compact task/project mappers"
```

---

### Task 4: Wire guard into server deps

**Files:**
- Modify: `src/tools/types.ts`
- Modify: `src/server.ts`
- Modify: `src/index.ts`
- Modify: `src/mcp-http.ts`
- Modify: `src/services/auth.ts` (add `extractProjectAllowListHeader`)
- Create: `tests/auth-project-header.test.ts`

**Interfaces:**
- Produces:
  - `ToolDeps { api: OtaskClient; guard: ProjectGuard }`
  - `createMcpServer(auth: OtaskAuthResolver, guard?: ProjectGuard): McpServer`
  - `extractProjectAllowListHeader(headers: { [k: string]: string | string[] | undefined }): string | undefined`  
    reads `x-otask-allowed-projects` (case-insensitive via Node lowercasing)

**Behavior:**
- Stdio (`index.ts`): `guard = projectGuardFromEnv()`
- HTTP gateway: `guard = projectGuardFromEnv()` — ignore client project header
- HTTP passthrough: `guard = createProjectGuard(parseProjectAllowList(headerValue))` — ignore env `OTASK_ALLOWED_PROJECTS`
- `/health` include `projectGuard: "env" | "header" | "off"` where off means empty list in effect source

- [ ] **Step 1: Tests for header extraction + mode selection helper**

```typescript
// src/services/project-guard.ts add:
export function resolveHttpProjectGuard(opts: {
  authMode: "gateway" | "passthrough";
  env: NodeJS.ProcessEnv;
  headerRaw: string | undefined;
}): ProjectGuard {
  if (opts.authMode === "gateway") {
    return createProjectGuard(parseProjectAllowList(opts.env.OTASK_ALLOWED_PROJECTS));
  }
  return createProjectGuard(parseProjectAllowList(opts.headerRaw));
}

export function projectGuardMode(
  authMode: "gateway" | "passthrough",
  guard: ProjectGuard,
): "env" | "header" | "off" {
  if (guard.list.isEmpty) return "off";
  return authMode === "gateway" ? "env" : "header";
}
```

- [ ] **Step 2: Wire server + http + stdio**

Update `createMcpServer`:

```typescript
export function createMcpServer(
  auth: OtaskAuthResolver,
  guard: ProjectGuard = createProjectGuard(parseProjectAllowList(undefined)),
): McpServer {
  const server = new McpServer({ name: "otask-mcp-server", version: "1.2.0" });
  registerAllTools(server, { api: createOtaskClient(auth), guard });
  return server;
}
```

In `mcp-http.ts` after authResult:

```typescript
const authMode = getHttpAuthMode();
const headerRaw = /* from req.headers["x-otask-allowed-projects"] as string | undefined */;
const guard = resolveHttpProjectGuard({
  authMode,
  env: process.env,
  headerRaw: typeof headerRaw === "string" ? headerRaw : undefined,
});
const server = createMcpServer(auth, guard);
```

- [ ] **Step 3: Tests PASS; `bun run build` PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: inject ProjectGuard into MCP server (env/header by mode)"
```

---

### Task 5: API methods — projects, tasks list, board, members, tags, comments, create, archive

**Files:**
- Modify: `src/types.ts` (add body/result types as needed)
- Modify: `src/services/api.ts`
- Modify: `src/services/client.ts`
- Create: `tests/api-paths.test.ts` (unit-test URL builders / mock fetch if extracting pure helpers; otherwise test client with global fetch mock)

**Interfaces — extend `OtaskClient`:**

```typescript
export interface OtaskClient {
  getTask(wsSlug: string, taskSlug: string): Promise<OtaskTask>;
  updateTask(wsSlug: string, taskSlug: string, body: UpdateTaskBody): Promise<UpdateTaskResult>;
  listProjects(wsSlug: string): Promise<Array<{ id: number; slug: string; name: string; status_id?: number }>>;
  listProjectTasks(
    wsSlug: string,
    projectSlug: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<{ tasks: OtaskTask[]; meta?: unknown }>;
  listBoard(
    wsSlug: string,
    projectSlug: string,
    query?: { type?: string; board_slug?: string },
  ): Promise<{ boards: unknown[]; columns: unknown[] }>;
  listMembers(wsSlug: string): Promise<unknown[]>;
  listTags(wsSlug: string): Promise<unknown[]>;
  listComments(wsSlug: string, taskSlug: string, body?: object): Promise<unknown>;
  addComment(wsSlug: string, taskSlug: string, comment: string, parentId?: number): Promise<unknown>;
  createTask(wsSlug: string, body: CreateTaskBody): Promise<OtaskTask>;
  archiveTask(wsSlug: string, taskSlug: string): Promise<OtaskTask>;
}
```

**Paths (from official docs):**

| Method | Path |
|--------|------|
| GET | `/api/v1/ws/{ws}/projects/list` |
| GET | `/api/v1/ws/{ws}/projects/{project_slug}/tasks` |
| GET | `/api/v1/ws/{ws}/projects/{project_slug}/boards` |
| GET | `/api/v1/ws/{ws}/members/list` |
| GET | `/api/v1/ws/{ws}/kanbans/tags` |
| POST | `/api/v1/ws/{ws}/tasks/{task}/comments/get` |
| POST | `/api/v1/ws/{ws}/tasks/{task}/comments/store` (JSON first: `{ comment, parent_id? }`; multipart only if file attach needed later) |
| POST | `/api/v1/ws/{ws}/tasks/create` |
| POST | `/api/v1/ws/{ws}/tasks/{task}/in-archive` |
| GET | existing get task |
| POST | existing update |

`CreateTaskBody`:

```typescript
{
  name: string;
  board_id: number;
  board_column_id: number;
  end_at: string;
  project_id: number;
  comment?: string;
  description?: string;
  priority_id?: number;
  performers?: string[];
  tags?: string[];
}
```

Reuse `parseResponse` / `OtaskApiError` patterns. Normalize heterogeneous `data` envelopes (`data.projects`, `data.tasks`, bare arrays).

- [ ] **Step 1: Add fetch-mock tests for at least getTask URL + listProjects envelope**

```typescript
// tests/api-paths.test.ts — mock global fetch
```

- [ ] **Step 2: Implement api + client**

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: expand OtaskClient for employee task workflow endpoints"
```

---

### Task 6: Read tools — list projects, tasks, board, members, tags

**Files:**
- Create: `src/schemas/project.ts`, `src/schemas/member.ts`, `src/schemas/tag.ts` (or one `src/schemas/workspace.ts`)
- Create: `src/tools/list-projects.ts`, `list-project-tasks.ts`, `list-board.ts`, `list-members.ts`, `list-tags.ts`
- Modify: `src/tools/registry.ts`
- Modify: `src/tools/get-task.ts` — call `guard` after fetch using `task.project_id` (and slug if present); use `compactTask`
- Create: `tests/tools-list.test.ts` with mock api + guard

**Tool contracts:**

| name | required args | guard |
|------|---------------|-------|
| `otask_list_projects` | `ws_slug` | filter results |
| `otask_list_project_tasks` | `ws_slug`, `project_slug` | assert project slug |
| `otask_list_board` | `ws_slug`, `project_slug` | assert |
| `otask_list_members` | `ws_slug` | none |
| `otask_list_tags` | `ws_slug` | none |
| `otask_get_task` | existing | assert project_id after load |

Each returns `agentListResult` or compact object via `jsonToolResult`.

- [ ] **Step 1: Failing tool handler tests (mock deps)**

- [ ] **Step 2: Implement tools + register**

- [ ] **Step 3: Tests PASS; build PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: read tools for projects, tasks, boards, members, tags"
```

---

### Task 7: Write tools — update polish, move, create, archive, comments

**Files:**
- Create: `src/tools/move-task.ts`, `create-task.ts`, `archive-task.ts`, `list-comments.ts`, `add-comment.ts`
- Modify: `src/tools/update-task.ts` — inject guard (assert project after getTask)
- Modify: `src/schemas/task.ts` — CreateTaskInput, MoveTaskInput, Comment inputs
- Modify: `src/tools/registry.ts`
- Create: `tests/tools-write.test.ts`

**Contracts:**

- `otask_move_task`: `{ ws_slug, task_slug, board_column_id, board_id? }` → internal get+merge update
- `otask_create_task`: `{ ws_slug, project_id, name, board_id, board_column_id, end_at, ...optional }` → guard by project_id; create
- `otask_archive_task`: `{ ws_slug, task_slug }` → get for guard then `in-archive`
- `otask_list_comments`: `{ ws_slug, task_slug }` → guard via get or trust after get
- `otask_add_comment`: `{ ws_slug, task_slug, comment, parent_id? }` → guard then store

For create, agent must supply board/column (discover via `otask_list_board`). Document that in tool description.

- [ ] **Step 1: Failing tests** — guard blocks create outside list; move calls update with column

- [ ] **Step 2: Implement**

- [ ] **Step 3: Tests PASS; build PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: create/move/archive/comment tools with project guard"
```

---

### Task 8: README auth + tools + allow-list

**Files:**
- Modify: `README.md`

**Content structure (replace/expand auth section):**

1. What this server is
2. Modes table: stdio | HTTP gateway | HTTP passthrough — how to detect (`OTASK_*` present?)
3. Env vars table: `OTASK_AUTH_KEY`, `OTASK_EMAIL`, `OTASK_PASSWORD`, `MCP_AUTH_TOKEN`, `OTASK_ALLOWED_PROJECTS`, `PORT`, `HOST`
4. Headers: `Authorization`, `X-Otask-Allowed-Projects` (passthrough only)
5. n8n examples for both modes
6. Tools list with one-line intents
7. Project allow-list examples
8. `bun run docs:parse` note
9. Dev: `bun test`, `bun run build`

- [ ] **Step 1: Rewrite README**

- [ ] **Step 2: Manual sanity** — read through as first-time user; no contradictions with code

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: rewrite auth, allow-list, and tool intents for agents"
```

---

### Task 9: Full verification

- [ ] **Step 1: Run full suite**

```bash
bun test
bun run build
```

Expected: all tests green; `tsc` clean

- [ ] **Step 2: Confirm registry exports all tools**

```bash
rg "name: \"otask_" src/tools
```

Expected names include: get_task, update_task, list_projects, list_project_tasks, list_board, list_members, list_tags, list_comments, add_comment, create_task, move_task, archive_task

- [ ] **Step 3: Final commit if any fixes**

```bash
git status
# commit only if needed
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| HTML docs parser by scopes | Task 2 |
| Catalog CLI + docs/catalog | Task 2 |
| ProjectGuard env gateway / header passthrough | Tasks 1, 4 |
| Slug + id allow-list | Task 1 |
| Compact agent DTOs + list envelope | Task 3 |
| Employee tools (list/get/create/update/move/archive/comments/members/tags/board) | Tasks 5–7 |
| Auth README rewrite | Task 8 |
| Unit tests, no live API in CI | Tasks 1–7, 9 |
| Existing registry pattern | Tasks 6–7 |
| Non-goals (finance/CRM) | not scheduled |

No TBD placeholders. Types for `OtaskClient` methods defined in Task 5; tools consume them in 6–7.
