import { type ListProjectTasksInput, ListProjectTasksInputSchema } from "../schemas/workspace.js";
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
      description: `List tasks in a project. Project must be on the allow-list when configured.

Args:
  - ws_slug, project_slug: optional if OTASK_DEFAULT_WS / OTASK_DEFAULT_PROJECT set
  - page, status_id, board_id, board_column_id: optional filters

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
    handler: async ({ ws_slug, project_slug, page, status_id, board_id, board_column_id }) => {
      try {
        const ws = resolveWsSlug(ws_slug, scope);
        const project = await resolveProjectSlug(project_slug, scope, () => api.listProjects(ws));
        const query: Record<string, string | number | undefined> = {};
        if (page !== undefined) query.page = page;
        if (status_id !== undefined) query.status_id = status_id;
        if (board_id !== undefined) query.board_id = board_id;
        if (board_column_id !== undefined) query.board_column_id = board_column_id;
        const hasQuery = Object.keys(query).length > 0;
        const result = await api.listProjectTasks(ws, project, hasQuery ? query : undefined);
        const items = result.tasks.map((t) => compactTask(t));
        const payload = agentListResult(`${items.length} task(s)`, items, result.meta);
        return jsonToolResult(payload, payload as unknown as Record<string, unknown>);
      } catch (error) {
        return toolError(error);
      }
    },
  };
}
