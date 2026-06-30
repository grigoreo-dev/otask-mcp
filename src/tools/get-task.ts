import { GetTaskInputSchema, type GetTaskInput } from "../schemas/task.js";
import { summarizeTask } from "../services/task-mapper.js";
import { jsonToolResult, toolError } from "./helpers.js";
import type { ToolDefinition, ToolDeps } from "./types.js";

export function createGetTaskTool({ api }: ToolDeps): ToolDefinition<GetTaskInput> {
  return {
    name: "otask_get_task",
    config: {
      title: "Get O!task Task",
      description: `Fetch a task from O!task by workspace and task slug.

Use before otask_update_task to inspect current field values (board_id, performers, tags, etc.).

Args:
  - ws_slug: Workspace UUID from panel.otask.ru URL (/ws/{ws_slug}/...)
  - task_slug: Task UUID from URL (.../tasks/{task_slug})

Returns JSON with key task fields: id, slug, name, description, end_at, board_id, board_column_id, priority_id, project_id, performers, tags.

Docs: https://api.otask.ru/docs#zadaci-GETapi-v1-ws--ws_slug--tasks--task_slug`,
      inputSchema: GetTaskInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    handler: async ({ ws_slug, task_slug }) => {
      try {
        const task = await api.getTask(ws_slug, task_slug);
        const summary = summarizeTask(task);
        return jsonToolResult(summary, { task: summary });
      } catch (error) {
        return toolError(error);
      }
    },
  };
}
