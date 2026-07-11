# UI-Compatible Project Task Listing Design

## Context

The current `otask_list_project_tasks` tool uses `GET /api/v1/ws/{ws}/projects/{project}/tasks`. Raw curl against O!task showed that this endpoint has no documented query parameters and ignores `board_id`, `board_column_id`, and common filter variants. It returns a paginated project task list that includes completed tasks.

Playwright network inspection of the O!task web UI showed that the project Tasks/Kanban page uses a different endpoint:

```text
GET /api/v1/ws/{ws}/projects/{project}/boards?type=status&date=<now>&field_id=_0&separate_subtasks=1
```

This board endpoint returns `boards`, `columns`, `tasks`, `options`, and `default_board`. Column metadata includes `type`, where `type === "completed"` marks the completed column. Task payloads do not contain an `is_completed` flag; completion is derived from `task.board_column_id` belonging to a completed column.

## Goal

Make `otask_list_project_tasks` useful for agents by default: return active project tasks from the same board snapshot endpoint used by the web UI, exclude completed tasks by column metadata, and keep list output compact.

## Non-Goals

- Do not change workspace-wide `otask_list_tasks` in this PR.
- Do not add `column_name` support to move/create/update tools in this PR.
- Do not add `performer_names` or `tag_names` resolution in this PR.
- Do not remove the legacy `/projects/{project}/tasks` path; keep it for `active_only: false` and archive-style pagination.
- Do not expose raw board task payloads by default.

## API Findings

### Legacy project task list endpoint

```text
GET /api/v1/ws/{ws}/projects/{project}/tasks?page=1
```

Observed behavior:

- returns paginated tasks with `meta.total`;
- includes completed tasks;
- ignores `board_id`, `board_column_id`, `column_id`, `board_column_ids[]`, and `filter[board_column_id]` query params;
- local docs catalog lists no query params for this endpoint.

### Web UI board endpoint

```text
GET /api/v1/ws/{ws}/projects/{project}/boards?type=status&date=<now>&field_id=_0&separate_subtasks=1
```

Observed behavior:

- returns project boards and columns;
- `columns[].type === "completed"` identifies completed columns;
- `columns[].tasks_count` gives real column counts;
- `tasks[]` contains active task rows and a partial completed payload;
- active tasks in `tasks[]` matched active column counts in the inspected project;
- completed column had `tasks_count=225` but only 20 completed tasks in payload, so excluded completed count must use column counts, not only payload length.

## Functional Behavior

### `otask_list_project_tasks` default path

Default behavior becomes active-only board snapshot mode:

```ts
{
  active_only?: boolean; // default true
  detail?: "compact" | "full"; // default compact
  board_id?: number; // optional client-side board filter in snapshot mode
}
```

When `active_only !== false`:

1. Resolve `ws_slug` and `project_slug` as today.
2. Fetch the board snapshot with:
   - `type=status`
   - `date=<current local ISO-like timestamp>` or current ISO timestamp accepted by API
   - `field_id=_0`
   - `separate_subtasks=1`
3. Flatten top-level and nested columns.
4. Build `columnById` from flattened columns.
5. Resolve completed columns using:
   - primary: `column.type === "completed"`
   - fallback: exact normalized names `завершено`, `готово`, `done`, `completed`, `closed`
6. Filter snapshot tasks:
   - if `board_id` is set, keep only tasks with matching `task.board_id`;
   - exclude tasks whose `board_column_id` belongs to completed columns.
7. Return compact task rows by default, enriched with column metadata.

### Legacy path

When `active_only === false`:

1. Use the existing `/projects/{project}/tasks` endpoint.
2. Preserve `page` support.
3. Return compact rows by default.
4. Include metadata that the source is `task_list` and may include completed tasks.

## Output Shape

List result keeps the existing agent list envelope:

```json
{
  "summary": "33 active task(s) from board snapshot; excluded 225 completed",
  "items": [],
  "next": null,
  "meta": {
    "source": "board_snapshot",
    "filters_applied": ["active_only"],
    "completed_column_ids": [230276],
    "excluded_completed_count": 225,
    "tasks_in_snapshot": 53,
    "active_column_count": 33
  }
}
```

Compact task rows include the existing fields plus derived column metadata when available:

```json
{
  "id": 652422,
  "slug": "...",
  "name": "...",
  "task_number": 693,
  "end_at": null,
  "priority_id": 0,
  "project_id": 35747,
  "board_id": 44237,
  "board_column_id": 230273,
  "column_name": "Сделать",
  "column_type": "new",
  "is_completed": false,
  "performers": [{ "id": "14147" }],
  "tags": [],
  "comments_count": 0,
  "subtasks_count": 0
}
```

`description` is omitted from compact list rows. `detail: "full"` keeps description for compatibility.

## Internal Design

### API layer

Add a typed board snapshot API function or expand `listBoard` safely:

```ts
interface ListBoardQuery {
  type?: string;
  board_slug?: string;
  date?: string;
  field_id?: string;
  separate_subtasks?: number;
}

interface BoardSnapshotResult {
  boards: unknown[];
  columns: unknown[];
  tasks: OtaskTask[];
  options?: unknown;
  default_board?: unknown;
}
```

The existing `listBoard` callers can keep using `boards` and `columns`; new project task listing uses `tasks` too.

### Mapper layer

Extend compact mapping without leaking raw API payloads:

- `CompactColumn` gains `type?: string | null`, `is_system?: boolean`, `tasks_count?: number`.
- `compactTask(task, options?)` supports:
  ```ts
  {
    detail?: "compact" | "full";
    column?: CompactColumn;
  }
  ```
- Default/`detail: "full"` preserves legacy behavior and includes `description`.
- `detail: "compact"` omits `description`; list tools must pass this explicitly when compact output is desired.
- When `column` is provided, add `column_name`, `column_type`, and `is_completed`.

### Board metadata helper

Create a focused helper for board snapshot interpretation:

```ts
flattenColumns(columns: unknown[]): BoardColumnInfo[]
getCompletedColumnIds(columns: BoardColumnInfo[]): Set<number>
buildColumnMap(columns: BoardColumnInfo[]): Map<number, BoardColumnInfo>
```

`BoardColumnInfo` contains only normalized fields needed by tools: `id`, `name`, `board_id`, `type`, `is_system`, `tasks_count`.

## Error Handling

- If board snapshot response lacks both columns and tasks, surface the existing API envelope error.
- If active-only snapshot has no completed columns, continue and include `completed_column_ids: []` with no completed exclusion.
- If `board_id` filters all items out, return an empty list with a summary that includes the filter.
- Do not fall back silently from board snapshot to task list on API errors; returning a clear error is safer than returning completed-heavy results.

## Testing

Add unit tests for:

1. `compactColumn` preserves `type`, `is_system`, and `tasks_count`.
2. `compactTask` omits description by default/compact and includes it in full detail.
3. Board metadata helpers flatten nested columns and detect completed by `type` and fallback name.
4. `otask_list_project_tasks` default path calls `api.listBoard` with UI-style query params and excludes completed tasks.
5. `otask_list_project_tasks` summary/meta include source, completed ids, and excluded completed count from column counts.
6. `active_only: false` uses legacy `api.listProjectTasks` and preserves pagination.

## Compatibility

This is a behavior change for `otask_list_project_tasks` because default output becomes active-only and compact. It is intentional for agent UX and context reduction. Completed/archive access remains available with `active_only: false`; full descriptions remain available with `detail: "full"` or via `otask_get_task`. `compactTask()` itself keeps legacy/full behavior unless list tools explicitly request `detail: "compact"`.
