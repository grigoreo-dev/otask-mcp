import { type ListProjectTasksInput, ListProjectTasksInputSchema } from "../schemas/workspace.js";
import {
  buildColumnMap,
  flattenBoardColumns,
  getCompletedColumnIds,
  sumColumnTaskCounts,
} from "../services/board-snapshot.js";
import { agentListResult } from "../services/format.js";
import { resolveProjectSlug, resolveWsSlug } from "../services/scope.js";
import { compactTask } from "../services/task-mapper.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createListProjectTasksTool({
  api,
  scope,
}: ToolDeps): ToolDefinition<ListProjectTasksInput> {
  return {
    name: "otask_list_project_tasks",
    config: {
      title: "List O!task Project Tasks",
      description: `List tasks in a project. Default uses the same board snapshot endpoint as the O!task web UI and excludes completed columns (column.type=completed). Use active_only=false for the legacy paginated project task list, which can include completed tasks. Project must be on the allow-list when configured.

Args:
  - ws_slug, project_slug: optional if OTASK_DEFAULT_WS / OTASK_DEFAULT_PROJECT set
  - active_only: default true — use board snapshot and exclude completed columns
  - detail: compact (default) omits HTML description; full includes raw description
  - board_id, board_column_id: client-side filters in board snapshot mode
  - page: legacy task_list pagination when active_only=false

Returns compact tasks via agent list envelope.

Docs: https://api.otask.ru/docs`,
      inputSchema: ListProjectTasksInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    handler: async (input) => {
      try {
        const ws = await resolveWsSlug(input.ws_slug, scope, () => api.listWorkspaces());
        const project = await resolveProjectSlug(input.project_slug, scope, () =>
          api.listProjects(ws)
        );
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
          // Scope meta/summary counts to the same board_id / board_column_id
          // filters applied to items. Task filtering keeps the snapshot-wide
          // completed set: a column may lack board_id metadata and fall out of
          // scopedColumns even though its tasks pass the input filters.
          const scopedColumns = columns.filter((column) => {
            if (input.board_id !== undefined && column.board_id !== input.board_id) return false;
            if (input.board_column_id !== undefined && column.id !== input.board_column_id) {
              return false;
            }
            return true;
          });
          const scopedCompletedColumnIds = getCompletedColumnIds(scopedColumns);
          const excludedCompletedCount = sumColumnTaskCounts(
            scopedColumns,
            scopedCompletedColumnIds
          );

          const tasks = snapshot.tasks.filter((task) => {
            if (input.board_id !== undefined && task.board_id !== input.board_id) return false;
            if (
              input.board_column_id !== undefined &&
              task.board_column_id !== input.board_column_id
            ) {
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
              completed_column_ids: [...scopedCompletedColumnIds],
              excluded_completed_count: excludedCompletedCount,
              tasks_in_snapshot: snapshot.tasks.length,
              active_tasks_count: scopedColumns
                .filter((column) => !scopedCompletedColumnIds.has(column.id))
                .reduce((sum, column) => sum + (column.tasks_count ?? 0), 0),
            },
          };
          return jsonToolResult(payload, payload as unknown as Record<string, unknown>);
        }

        const query: Record<string, string | number | undefined> = {};
        if (input.page !== undefined) query.page = input.page;
        if (input.status_id !== undefined) query.status_id = input.status_id;
        if (input.board_id !== undefined) query.board_id = input.board_id;
        if (input.board_column_id !== undefined) query.board_column_id = input.board_column_id;
        const hasQuery = Object.keys(query).length > 0;
        const result = await api.listProjectTasks(ws, project, hasQuery ? query : undefined);
        const items = result.tasks.map((t) => compactTask(t, { detail }));
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
      } catch (error) {
        return toolError(error);
      }
    },
  };
}
