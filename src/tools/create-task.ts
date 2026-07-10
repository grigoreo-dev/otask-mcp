import { type CreateTaskInput, CreateTaskInputSchema } from "../schemas/task.js";
import { resolveProjectId, resolveWsSlug } from "../services/scope.js";
import { compactTask } from "../services/task-mapper.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createCreateTaskTool({ api, scope }: ToolDeps): ToolDefinition<CreateTaskInput> {
  return {
    name: "otask_create_task",
    config: {
      title: "Create O!task Task",
      description: `Create a task in a project. Project must be on the allow-list when configured.

You must supply board_id and board_column_id (discover via otask_list_board for the project).

Args:
  - ws_slug, project_id: optional if OTASK_DEFAULT_WS / OTASK_DEFAULT_PROJECT set
  - name, board_id, board_column_id, end_at: required
  - description, comment, priority_id, performers, tags: optional

Returns compact created task.

Docs: https://api.otask.ru/docs`,
      inputSchema: CreateTaskInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    handler: async (params) => {
      try {
        const { ws_slug, project_id: projectIdArg, ...rest } = params;
        const ws = resolveWsSlug(ws_slug, scope);
        const project_id = await resolveProjectId(projectIdArg, scope, () => api.listProjects(ws));
        const task = await api.createTask(ws, { ...rest, project_id });
        const summary = compactTask(task);
        return jsonToolResult(summary, { task: summary });
      } catch (error) {
        return toolError(error);
      }
    },
  };
}
