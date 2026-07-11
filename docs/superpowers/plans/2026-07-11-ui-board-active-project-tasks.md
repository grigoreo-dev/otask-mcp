# UI Board Active Project Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `otask_list_project_tasks` default to active project tasks from the same board snapshot endpoint used by the O!task web UI, excluding completed columns by column metadata and returning compact rows.

**Architecture:** Extend the existing O!task API layer so `/projects/{project}/boards` exposes board snapshot tasks and column metadata. Add a small board metadata helper to flatten columns, resolve completed column ids, and enrich compact task rows. Switch `otask_list_project_tasks` to a board-snapshot active path by default while preserving the legacy paginated `/projects/{project}/tasks` path for `active_only: false`.

**Tech Stack:** TypeScript, Bun test runner, Zod, existing MCP tool definitions in `packages/core`.

## Global Constraints

- Keep changes additive except for the intentional `otask_list_project_tasks` default: active-only compact output.
- Do not modify workspace-wide `otask_list_tasks` in this plan.
- Do not add `column_name` move/create/update support in this plan.
- Do not expose raw board endpoint task payloads by default.
- Use `column.type === "completed"` as the primary completed signal; fallback to exact normalized names `завершено`, `готово`, `done`, `completed`, `closed`.
- `active_only: false` must preserve access to legacy completed/archive task listing through `/projects/{project}/tasks`.
- All tests must pass with `bun test`; lint must pass with `bun run lint`.

---

## File Structure

- Modify `packages/core/src/types.ts`
  - Add board snapshot query/result interfaces and widen `ListBoardResult` to include `tasks`, `options`, and `default_board`.
  - Add optional board query fields used by the UI endpoint.

- Modify `packages/core/src/services/api.ts`
  - Let `listBoard` accept UI-style query fields: `date`, `field_id`, `separate_subtasks`.
  - Preserve `tasks`, `options`, `default_board` from the response.

- Modify `packages/core/src/services/task-mapper.ts`
  - Extend `CompactColumn` with `type`, `is_system`, `tasks_count`.
  - Add compact/full task detail options.
  - Add derived `column_name`, `column_type`, `is_completed`, and `task_number` to compact rows when available.

- Create `packages/core/src/services/board-snapshot.ts`
  - Pure helper functions for board snapshot column flattening and completed-column detection.

- Modify `packages/core/src/schemas/workspace.ts`
  - Add `active_only` and `detail` to `ListProjectTasksInputSchema`.
  - Update descriptions to state that `board_id` / `board_column_id` are client-side filters when using board snapshot.

- Modify `packages/core/src/tools/list-project-tasks.ts`
  - Implement active board-snapshot path by default.
  - Preserve legacy task-list path when `active_only === false`.

- Modify tests:
  - `tests/format-mapper.test.ts`
  - `tests/api-paths.test.ts`
  - `tests/tools-list.test.ts`
  - Add `tests/board-snapshot.test.ts`

---

### Task 1: Preserve board snapshot metadata in API and column mapper

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/services/api.ts`
- Modify: `packages/core/src/services/task-mapper.ts`
- Test: `tests/api-paths.test.ts`
- Test: `tests/format-mapper.test.ts`

**Interfaces:**
- Produces: `ListBoardQuery`, `ListBoardResult.tasks`, `CompactColumn.type`, `CompactColumn.is_system`, `CompactColumn.tasks_count`.
- Consumes: existing `api.listBoard(ws, project, query)` callers.

- [ ] **Step 1: Write failing mapper test for column metadata**

In `tests/format-mapper.test.ts`, add this test near existing `compactBoard`/`compactColumn` tests:

```ts
test("compactColumn keeps board metadata used by UI completed detection", () => {
  expect(
    compactColumn({
      id: 230276,
      name: "Завершено",
      color: "#1DB464",
      board_id: 44237,
      type: "completed",
      is_system: true,
      tasks_count: 225,
    })
  ).toEqual({
    id: 230276,
    name: "Завершено",
    color: "#1DB464",
    board_id: 44237,
    type: "completed",
    is_system: true,
    tasks_count: 225,
  });
});
```

- [ ] **Step 2: Run mapper test and verify failure**

Run:

```bash
bun test tests/format-mapper.test.ts --test-name-pattern "compactColumn keeps board metadata"
```

Expected: FAIL because `compactColumn` drops `type`, `is_system`, and `tasks_count`.

- [ ] **Step 3: Write failing API test for board snapshot tasks/query fields**

In `tests/api-paths.test.ts`, add a new test near `listBoard hits boards path with query`:

```ts
test("listBoard preserves board snapshot tasks and encodes UI query fields", async () => {
  const fetchImpl = mock(async () =>
    jsonResponse({
      success: true,
      data: {
        boards: [{ id: 44237, name: "Поиск Патентов" }],
        columns: [{ id: 230276, name: "Завершено", type: "completed", tasks_count: 225 }],
        tasks: [{ id: 1, slug: "task", name: "Done", project_id: 5, board_id: 44237, board_column_id: 230276, priority_id: 0, status_id: 100, description: "" }],
        options: { any: true },
        default_board: { id: 44237 },
      },
    })
  );
  const api = createOtaskClient(createStaticAuthResolver(), { fetchImpl });

  const result = await api.listBoard("ws", "proj", {
    type: "status",
    date: "2026-07-11T15:34:41+03:00",
    field_id: "_0",
    separate_subtasks: 1,
  });

  const calledUrl = String(fetchImpl.mock.calls[0][0]);
  expect(calledUrl).toContain("/api/v1/ws/ws/projects/proj/boards?");
  expect(calledUrl).toContain("type=status");
  expect(calledUrl).toContain("field_id=_0");
  expect(calledUrl).toContain("separate_subtasks=1");
  expect(result.tasks).toHaveLength(1);
  expect(result.columns[0]).toMatchObject({ type: "completed", tasks_count: 225 });
  expect(result.options).toEqual({ any: true });
  expect(result.default_board).toEqual({ id: 44237 });
});
```

- [ ] **Step 4: Run API test and verify failure**

Run:

```bash
bun test tests/api-paths.test.ts --test-name-pattern "listBoard preserves board snapshot"
```

Expected: FAIL because `ListBoardResult` does not expose `tasks/options/default_board`, and query type does not include UI fields.

- [ ] **Step 5: Implement type changes**

In `packages/core/src/types.ts`, replace `ListBoardResult` with:

```ts
export interface ListBoardQuery {
  type?: string;
  board_slug?: string;
  date?: string;
  field_id?: string;
  separate_subtasks?: number;
}

export interface ListBoardResult {
  boards: unknown[];
  columns: unknown[];
  tasks: OtaskTask[];
  options?: unknown;
  default_board?: unknown;
}
```

- [ ] **Step 6: Implement API preservation**

In `packages/core/src/services/api.ts`, import/use `ListBoardQuery` and change `listBoard` signature to:

```ts
export async function listBoard(
  wsSlug: string,
  projectSlug: string,
  query: ListBoardQuery | undefined,
  auth: OtaskAuthResolver
): Promise<ListBoardResult> {
```

Keep existing URL building. Change return block to:

```ts
return {
  boards: hasBoards ? (obj!.boards as unknown[]) : [],
  columns: hasColumns ? (obj!.columns as unknown[]) : [],
  tasks: obj !== null && Array.isArray(obj.tasks) ? (obj.tasks as OtaskTask[]) : [],
  options: obj?.options,
  default_board: obj?.default_board,
};
```

- [ ] **Step 7: Implement column mapper metadata**

In `packages/core/src/services/task-mapper.ts`, extend `CompactColumn`:

```ts
export interface CompactColumn {
  id: number;
  name: string;
  slug?: string;
  color?: string;
  board_id?: number;
  type?: string | null;
  is_system?: boolean;
  tasks_count?: number;
}
```

Change `compactColumn` input type to include the new fields and set them only when present:

```ts
export function compactColumn(c: {
  id: number;
  name: string;
  slug?: string;
  color?: string;
  board_id?: number;
  type?: string | null;
  is_system?: boolean;
  tasks_count?: number;
}): CompactColumn {
  const out: CompactColumn = { id: c.id, name: c.name };
  if (c.slug !== undefined) out.slug = c.slug;
  if (c.color !== undefined) out.color = c.color;
  if (c.board_id !== undefined) out.board_id = c.board_id;
  if (c.type !== undefined) out.type = c.type;
  if (c.is_system !== undefined) out.is_system = c.is_system;
  if (c.tasks_count !== undefined) out.tasks_count = c.tasks_count;
  return out;
}
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
bun test tests/format-mapper.test.ts tests/api-paths.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add packages/core/src/types.ts packages/core/src/services/api.ts packages/core/src/services/task-mapper.ts tests/format-mapper.test.ts tests/api-paths.test.ts
git commit -m "feat(core): preserve board snapshot metadata"
```

---

### Task 2: Add board snapshot helper functions

**Files:**
- Create: `packages/core/src/services/board-snapshot.ts`
- Test: `tests/board-snapshot.test.ts`

**Interfaces:**
- Consumes: unknown board column payloads from `/boards`.
- Produces:
  - `BoardColumnInfo`
  - `flattenBoardColumns(columns: unknown[]): BoardColumnInfo[]`
  - `buildColumnMap(columns: BoardColumnInfo[]): Map<number, BoardColumnInfo>`
  - `getCompletedColumnIds(columns: BoardColumnInfo[]): Set<number>`
  - `sumColumnTaskCounts(columns: BoardColumnInfo[], ids: Set<number>): number`

- [ ] **Step 1: Write failing helper tests**

Create `tests/board-snapshot.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  buildColumnMap,
  flattenBoardColumns,
  getCompletedColumnIds,
  sumColumnTaskCounts,
} from "../packages/core/src/services/board-snapshot.js";

describe("board snapshot helpers", () => {
  test("flattens nested board columns and keeps metadata", () => {
    const columns = flattenBoardColumns([
      {
        id: 230276,
        name: "Завершено",
        board_id: 44237,
        type: "completed",
        is_system: true,
        tasks_count: 225,
        columns: [
          {
            id: 230273,
            name: "Сделать",
            board_id: 44237,
            type: "new",
            is_system: true,
            tasks_count: 18,
          },
        ],
      },
    ]);

    expect(columns).toEqual([
      {
        id: 230276,
        name: "Завершено",
        board_id: 44237,
        type: "completed",
        is_system: true,
        tasks_count: 225,
      },
      {
        id: 230273,
        name: "Сделать",
        board_id: 44237,
        type: "new",
        is_system: true,
        tasks_count: 18,
      },
    ]);
  });

  test("detects completed columns by type first and fallback names second", () => {
    const columns = flattenBoardColumns([
      { id: 1, name: "Anything", type: "completed", tasks_count: 10 },
      { id: 2, name: "Готово", type: null, tasks_count: 5 },
      { id: 3, name: "Сделать", type: "new", tasks_count: 7 },
    ]);

    expect([...getCompletedColumnIds(columns)].sort()).toEqual([1, 2]);
  });

  test("builds column map and sums task counts", () => {
    const columns = flattenBoardColumns([
      { id: 1, name: "Done", type: "completed", tasks_count: 225 },
      { id: 2, name: "Todo", type: "new", tasks_count: 18 },
    ]);
    const map = buildColumnMap(columns);
    const completed = getCompletedColumnIds(columns);

    expect(map.get(1)?.name).toBe("Done");
    expect(sumColumnTaskCounts(columns, completed)).toBe(225);
  });
});
```

- [ ] **Step 2: Run helper tests and verify failure**

Run:

```bash
bun test tests/board-snapshot.test.ts
```

Expected: FAIL because `board-snapshot.ts` does not exist.

- [ ] **Step 3: Implement helper module**

Create `packages/core/src/services/board-snapshot.ts`:

```ts
export interface BoardColumnInfo {
  id: number;
  name: string;
  board_id?: number;
  type?: string | null;
  is_system?: boolean;
  tasks_count?: number;
}

const COMPLETED_NAMES = new Set(["завершено", "готово", "done", "completed", "closed"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanField(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("ru-RU");
}

export function flattenBoardColumns(columns: unknown[]): BoardColumnInfo[] {
  const out: BoardColumnInfo[] = [];

  const visit = (value: unknown) => {
    const record = asRecord(value);
    if (!record) return;

    const id = numberField(record.id);
    const name = stringField(record.name);
    if (id !== undefined && name !== undefined) {
      const info: BoardColumnInfo = { id, name };
      const boardId = numberField(record.board_id);
      const type = record.type === null ? null : stringField(record.type);
      const isSystem = booleanField(record.is_system);
      const tasksCount = numberField(record.tasks_count);

      if (boardId !== undefined) info.board_id = boardId;
      if (type !== undefined || record.type === null) info.type = type ?? null;
      if (isSystem !== undefined) info.is_system = isSystem;
      if (tasksCount !== undefined) info.tasks_count = tasksCount;
      out.push(info);
    }

    const children = record.columns;
    if (Array.isArray(children)) {
      for (const child of children) visit(child);
    }
  };

  for (const column of columns) visit(column);
  return out;
}

export function buildColumnMap(columns: BoardColumnInfo[]): Map<number, BoardColumnInfo> {
  return new Map(columns.map((column) => [column.id, column]));
}

export function isCompletedColumn(column: BoardColumnInfo): boolean {
  if (column.type === "completed") return true;
  return COMPLETED_NAMES.has(normalizeName(column.name));
}

export function getCompletedColumnIds(columns: BoardColumnInfo[]): Set<number> {
  return new Set(columns.filter(isCompletedColumn).map((column) => column.id));
}

export function sumColumnTaskCounts(columns: BoardColumnInfo[], ids: Set<number>): number {
  return columns.reduce((sum, column) => {
    if (!ids.has(column.id)) return sum;
    return sum + (column.tasks_count ?? 0);
  }, 0);
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
bun test tests/board-snapshot.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add packages/core/src/services/board-snapshot.ts tests/board-snapshot.test.ts
git commit -m "feat(core): add board snapshot helpers"
```

---

### Task 3: Add compact/full task detail and column enrichment

**Files:**
- Modify: `packages/core/src/services/task-mapper.ts`
- Test: `tests/format-mapper.test.ts`

**Interfaces:**
- Consumes: `CompactColumn` from Task 1.
- Produces: `compactTask(task, options?: CompactTaskOptions): CompactTask` where options are:
  ```ts
  interface CompactTaskOptions {
    detail?: "compact" | "full";
    column?: CompactColumn;
  }
  ```

- [ ] **Step 1: Write failing tests for detail and enrichment**

In `tests/format-mapper.test.ts`, add tests near existing `compactTask` tests:

```ts
test("compactTask preserves description by default and in full detail", () => {
  const task = sampleTask({ description: "<p>large html</p>" });

  expect(compactTask(task)).toMatchObject({ description: "<p>large html</p>" });
  expect(compactTask(task, { detail: "full" })).toMatchObject({
    description: "<p>large html</p>",
  });
});

test("compactTask omits description only in compact detail", () => {
  const task = sampleTask({ description: "<p>large html</p>" });

  expect(compactTask(task, { detail: "compact" })).not.toHaveProperty("description");
});

test("compactTask enriches task with column metadata", () => {
  const task = sampleTask({ board_column_id: 230276, task_number: 693 });

  expect(
    compactTask(task, {
      column: {
        id: 230276,
        name: "Завершено",
        type: "completed",
        tasks_count: 225,
      },
    })
  ).toMatchObject({
    task_number: 693,
    column_name: "Завершено",
    column_type: "completed",
    is_completed: true,
  });
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```bash
bun test tests/format-mapper.test.ts --test-name-pattern "compactTask"
```

Expected: FAIL because `compactTask` currently has no options and cannot omit `description` for compact detail.

- [ ] **Step 3: Implement task mapper options**

In `packages/core/src/services/task-mapper.ts`, update `CompactTask`:

```ts
export interface CompactTask {
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
  task_number?: number;
  column_name?: string;
  column_type?: string | null;
  is_completed?: boolean;
  performers: Array<{ id: string; name?: string }>;
  tags: Array<{ id: string; name?: string }>;
  comments_count?: number;
  subtasks_count?: number;
  project?: { id: number; name: string };
}

export interface CompactTaskOptions {
  detail?: "compact" | "full";
  column?: CompactColumn;
}
```

Change `compactTask` signature and body:

```ts
export function compactTask(task: OtaskTask, options: CompactTaskOptions = {}): CompactTask {
  const out: CompactTask = {
    id: task.id,
    slug: task.slug,
    name: task.name,
    end_at: task.end_at,
    priority_id: task.priority_id,
    project_id: task.project_id,
    board_id: task.board_id,
    board_column_id: task.board_column_id,
    status_id: task.status_id,
    performers: compactRefs(task.performers),
    tags: compactRefs(task.tags),
    subtasks_count: Array.isArray(task.subtasks) ? task.subtasks.length : 0,
  };

  if (options.detail !== "compact") {
    out.description = task.description;
  }

  if (typeof task.task_number === "number") {
    out.task_number = task.task_number;
  }

  if (options.column) {
    out.column_name = options.column.name;
    if (options.column.type !== undefined) out.column_type = options.column.type;
    out.is_completed = options.column.type === "completed";
  }

  // Keep existing comments_count/project mapping below unchanged.
```

Keep existing comments/project logic after the new option logic.

- [ ] **Step 4: Update `summarizeTask` if needed**

Keep current behavior legacy/full by default so `otask_get_task` and write-tool responses still include `description`:

```ts
export function summarizeTask(task: OtaskTask): CompactTask {
  return compactTask(task);
}
```

- [ ] **Step 5: Run mapper tests**

Run:

```bash
bun test tests/format-mapper.test.ts
```

Expected: PASS after keeping old assertions that expect `description` by default and adding the new compact-detail omission assertion.

- [ ] **Step 6: Commit Task 3**

```bash
git add packages/core/src/services/task-mapper.ts tests/format-mapper.test.ts
git commit -m "feat(core): compact task rows by default"
```

---

### Task 4: Switch `otask_list_project_tasks` active default to board snapshot

**Files:**
- Modify: `packages/core/src/schemas/workspace.ts`
- Modify: `packages/core/src/tools/list-project-tasks.ts`
- Test: `tests/tools-list.test.ts`

**Interfaces:**
- Consumes: `api.listBoard`, board snapshot helpers, and `compactTask(task, { detail, column })`.
- Produces: `otask_list_project_tasks` default active-only behavior.

- [ ] **Step 1: Write failing schema/behavior test for active board snapshot default**

In `tests/tools-list.test.ts`, replace or add a test near `otask_list_project_tasks > asserts project slug then returns compact tasks`:

```ts
test("otask_list_project_tasks defaults to active board snapshot and excludes completed", async () => {
  const api = fakeApi({
    listProjects: mock(async () => [project({ id: 5, slug: "proj" })]),
    listBoard: mock(async () => ({
      boards: [{ id: 44237, name: "Поиск Патентов" }],
      columns: [
        { id: 230273, name: "Сделать", board_id: 44237, type: "new", tasks_count: 2 },
        { id: 230276, name: "Завершено", board_id: 44237, type: "completed", tasks_count: 225 },
      ],
      tasks: [
        sampleTask({ id: 1, name: "Active", project_id: 5, board_id: 44237, board_column_id: 230273, description: "<p>hidden</p>" }),
        sampleTask({ id: 2, name: "Done", project_id: 5, board_id: 44237, board_column_id: 230276, description: "<p>hidden</p>" }),
      ],
    })),
  });
  const tool = createListProjectTasksTool(deps({ api, scope: scope({ defaultProject: "proj" }) }));

  const result = await callTool(tool, {});
  const payload = jsonResult(result);

  expect(api.listBoard).toHaveBeenCalledWith(
    expect.any(String),
    "proj",
    expect.objectContaining({
      type: "status",
      field_id: "_0",
      separate_subtasks: 1,
    })
  );
  expect(payload.summary).toContain("1 active task(s)");
  expect(payload.summary).toContain("excluded 225 completed");
  expect(payload.items).toHaveLength(1);
  expect(payload.items[0]).toMatchObject({
    id: 1,
    name: "Active",
    column_name: "Сделать",
    column_type: "new",
    is_completed: false,
  });
  expect(payload.items[0]).not.toHaveProperty("description");
  expect(payload.meta).toMatchObject({
    source: "board_snapshot",
    completed_column_ids: [230276],
    excluded_completed_count: 225,
  });
});
```

If local test helpers have slightly different names, adapt only the helper wrappers; keep expectations identical.

- [ ] **Step 2: Write failing legacy path test**

In `tests/tools-list.test.ts`, add:

```ts
test("otask_list_project_tasks active_only=false uses legacy task list", async () => {
  const api = fakeApi({
    listProjects: mock(async () => [project({ id: 5, slug: "proj" })]),
    listProjectTasks: mock(async () => ({
      tasks: [sampleTask({ id: 2, name: "Done", project_id: 5, board_column_id: 230276, description: "<p>hidden</p>" })],
      meta: { current_page: 1, total: 248 },
    })),
  });
  const tool = createListProjectTasksTool(deps({ api, scope: scope({ defaultProject: "proj" }) }));

  const result = await callTool(tool, { active_only: false, page: 1 });
  const payload = jsonResult(result);

  expect(api.listProjectTasks).toHaveBeenCalledWith(expect.any(String), "proj", { page: 1 });
  expect(payload.items).toHaveLength(1);
  expect(payload.items[0]).not.toHaveProperty("description");
  expect(payload.meta).toMatchObject({
    source: "task_list",
    includes_completed: true,
  });
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
bun test tests/tools-list.test.ts --test-name-pattern "otask_list_project_tasks"
```

Expected: FAIL because schema lacks `active_only`/`detail`, default still calls legacy `listProjectTasks`, and metadata is absent.

- [ ] **Step 4: Update input schema**

In `packages/core/src/schemas/workspace.ts`, update `ListProjectTasksInputSchema`:

```ts
export const ListProjectTasksInputSchema = ProjectSlugSchema.extend({
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Page number for legacy task_list mode when active_only=false"),
  status_id: z
    .number()
    .int()
    .optional()
    .describe("Legacy/internal O!task status id; project task endpoint may ignore this"),
  board_id: z
    .number()
    .int()
    .optional()
    .describe("Client-side board filter in active board snapshot mode"),
  board_column_id: z
    .number()
    .int()
    .optional()
    .describe("Client-side column filter in active board snapshot mode"),
  active_only: z
    .boolean()
    .optional()
    .describe("Default true. Use board snapshot and exclude columns where type=completed."),
  detail: z
    .enum(["compact", "full"])
    .optional()
    .describe("compact (default): omit HTML description; full: include description"),
}).strict();
```

- [ ] **Step 5: Implement board snapshot path**

In `packages/core/src/tools/list-project-tasks.ts`, add imports:

```ts
import {
  buildColumnMap,
  flattenBoardColumns,
  getCompletedColumnIds,
  sumColumnTaskCounts,
} from "../services/board-snapshot.js";
```

Change handler signature to accept `active_only` and `detail`.

Implement:

```ts
const detail = input.detail ?? "compact";
const activeOnly = input.active_only !== false;

if (activeOnly) {
  const snapshot = await api.listBoard(ws, project, {
    type: "status",
    date: new Date().toISOString(),
    field_id: "_0",
    separate_subtasks: 1,
  });
  const columns = flattenBoardColumns(snapshot.columns);
  const columnMap = buildColumnMap(columns);
  const completedColumnIds = getCompletedColumnIds(columns);
  const excludedCompletedCount = sumColumnTaskCounts(columns, completedColumnIds);

  const tasks = snapshot.tasks.filter((task) => {
    if (input.board_id !== undefined && task.board_id !== input.board_id) return false;
    if (input.board_column_id !== undefined && task.board_column_id !== input.board_column_id) {
      return false;
    }
    return !completedColumnIds.has(task.board_column_id);
  });

  const items = tasks.map((task) =>
    compactTask(task, {
      detail,
      column: columnMap.get(task.board_column_id),
    })
  );

  const filters = ["active_only"];
  if (input.board_id !== undefined) filters.push("board_id");
  if (input.board_column_id !== undefined) filters.push("board_column_id");

  const payload = {
    summary: `${items.length} active task(s) from board snapshot; excluded ${excludedCompletedCount} completed`,
    items,
    next: null,
    meta: {
      source: "board_snapshot",
      filters_applied: filters,
      completed_column_ids: [...completedColumnIds],
      excluded_completed_count: excludedCompletedCount,
      tasks_in_snapshot: snapshot.tasks.length,
      active_column_count: columns
        .filter((column) => !completedColumnIds.has(column.id))
        .reduce((sum, column) => sum + (column.tasks_count ?? 0), 0),
    },
  };
  return jsonToolResult(payload, payload as unknown as Record<string, unknown>);
}
```

Then keep legacy path for `activeOnly === false`, but call `compactTask(t, { detail })` and add metadata:

```ts
const payload = agentListResult(`${items.length} task(s)`, items, result.meta);
const structured = {
  ...payload,
  meta: {
    ...(typeof result.meta === "object" && result.meta !== null ? result.meta : {}),
    source: "task_list",
    includes_completed: true,
  },
};
return jsonToolResult(structured, structured as unknown as Record<string, unknown>);
```

- [ ] **Step 6: Update tool description**

In `packages/core/src/tools/list-project-tasks.ts`, update description text to say:

```text
List tasks in a project. Default uses the same board snapshot endpoint as the O!task web UI and excludes completed columns (column.type=completed). Use active_only=false for the legacy paginated project task list, which can include completed tasks.

Args:
  - ws_slug, project_slug: optional if OTASK_DEFAULT_WS / OTASK_DEFAULT_PROJECT set
  - active_only: default true — use board snapshot and exclude completed columns
  - detail: compact (default) omits HTML description; full includes raw description
  - board_id, board_column_id: client-side filters in board snapshot mode
  - page: legacy task_list pagination when active_only=false
```

- [ ] **Step 7: Run project task tests**

Run:

```bash
bun test tests/tools-list.test.ts --test-name-pattern "otask_list_project_tasks"
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add packages/core/src/schemas/workspace.ts packages/core/src/tools/list-project-tasks.ts tests/tools-list.test.ts
git commit -m "feat(core): list active project tasks from board snapshot"
```

---

### Task 5: Update list board output and documentation strings

**Files:**
- Modify: `packages/core/src/tools/list-board.ts`
- Modify: `README.md`
- Test: `tests/tools-list.test.ts`

**Interfaces:**
- Consumes: `compactColumn` metadata from Task 1.
- Produces: `otask_list_board` output exposing `type`, `is_system`, and `tasks_count`.

- [ ] **Step 1: Update existing list board test expectation**

In `tests/tools-list.test.ts`, update `otask_list_board > asserts project and returns compact boards/columns` fake column to include:

```ts
{
  id: 230276,
  name: "Завершено",
  color: "#1DB464",
  board_id: 44237,
  type: "completed",
  is_system: true,
  tasks_count: 225,
}
```

Update expected payload column to include those fields.

- [ ] **Step 2: Run list board test and verify failure if casts still drop fields**

Run:

```bash
bun test tests/tools-list.test.ts --test-name-pattern "otask_list_board"
```

Expected: FAIL if `list-board.ts` cast excludes new fields.

- [ ] **Step 3: Update list board cast and description**

In `packages/core/src/tools/list-board.ts`, update compactColumn cast:

```ts
compactColumn(
  c as {
    id: number;
    name: string;
    slug?: string;
    color?: string;
    board_id?: number;
    type?: string | null;
    is_system?: boolean;
    tasks_count?: number;
  }
)
```

Update description return line:

```text
Returns compact boards and columns (id, name, slug?, color?, board_id?, type?, is_system?, tasks_count?). Column type=completed marks done columns used by active task filters.
```

- [ ] **Step 4: Update README tool table**

In `README.md`, update the `otask_list_project_tasks` and `otask_list_board` rows to say:

```md
| `otask_list_project_tasks` | Задачи проекта: по умолчанию активные задачи из UI board snapshot; `active_only=false` для полного legacy-списка |
| `otask_list_board` | Доски/колонки (статусы) с `type`, `is_system`, `tasks_count`; `type=completed` помечает завершённую колонку |
```

- [ ] **Step 5: Run focused test**

Run:

```bash
bun test tests/tools-list.test.ts --test-name-pattern "otask_list_board"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add packages/core/src/tools/list-board.ts tests/tools-list.test.ts README.md
git commit -m "docs(core): expose completed column metadata"
```

---

### Task 6: Full verification and cleanup

**Files:**
- Potentially modify any files touched above if integration failures appear.
- No new production interfaces.

**Interfaces:**
- Consumes: all tasks above.
- Produces: verified branch ready for PR.

- [ ] **Step 1: Run full tests**

Run:

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run:

```bash
bun run lint
```

Expected: no errors. Warnings may remain only if pre-existing project warnings appear; do not introduce new lint errors.

- [ ] **Step 3: Run build**

Run:

```bash
bun run build
```

Expected: build completes successfully.

- [ ] **Step 4: Inspect git diff**

Run:

```bash
git status --short
git diff --stat
git diff -- packages/core/src tests README.md
```

Expected: only planned files changed. No secrets, no `.env`, no generated worktree artifacts.

- [ ] **Step 5: Final commit if needed**

If verification required small fixes, commit them:

```bash
git add packages/core/src tests README.md
git commit -m "test(core): verify board snapshot task listing"
```

If no changes are pending, skip this step.

---

## Self-Review

- Spec coverage: Tasks 1-4 implement UI board endpoint, completed column detection, active default, compact output, and legacy `active_only=false`. Task 5 updates visible board metadata and docs. Task 6 verifies all.
- Placeholder scan: No unfinished markers or unspecified implementation steps remain.
- Type consistency: `ListBoardQuery`, `ListBoardResult`, `CompactTaskOptions`, `BoardColumnInfo`, and helper function names are defined before use and referenced consistently.
- Scope check: Workspace `otask_list_tasks`, move/create/update column name resolution, and new composite tools are intentionally excluded.
